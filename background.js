// background.js — Clean MV3 rewrite
// Responsibilities: messaging hub, analysis orchestration, AI calls, storage, and script injection.

import { generatePrompts } from './prompts.js';
import { runFullConversationAnalysis } from './localAnalysisService.js';
import { DEFAULTS } from './constants.js';

const DEBUG = {
  log: (c, m, d = null) => console.log(`[BG:${c}] ${m}`, d ?? ''),
  err: (c, m, e = null) => console.error(`[BG:${c}] ${m}`, e ?? ''),
};

// Generation state persisted per match
const keyForGen = (uuid) => `generationState_${uuid}`;
async function getGen(uuid) {
  if (!uuid) return { isGenerating:false, response:null, error:null, generationId:null, generationStartTime:null };
  const r = await chrome.storage.local.get(keyForGen(uuid));
  return r[keyForGen(uuid)] || { isGenerating:false, response:null, error:null, generationId:null, generationStartTime:null };
}
async function setGen(uuid, patch, port) {
  if (!uuid) return;
  const cur = await getGen(uuid);
  const upd = { ...cur, ...patch };
  await chrome.storage.local.set({ [keyForGen(uuid)]: upd });
  if (port) safePost(port, { action:'generationUpdate', uuid, state:upd });
}
function safePost(port, msg){ try { port.postMessage(msg); } catch(_){} }

// Simple cache hash to avoid re-analysis for unchanged history/profile
async function hashStr(s){
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function cacheKeyFor(scraped){
  const base = JSON.stringify({ h:scraped?.conversationHistory, p:scraped?.theirProfile });
  return await hashStr(base);
}

// Build final payload for LLM
function buildFinalPayload(systemMessage, userMessage, settings){
  return {
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage }
    ],
    temperature: settings.modelTemperature ?? DEFAULTS.modelTemperature,
    top_p: settings.topPValue ?? DEFAULTS.topPValue
  };
}

async function callLocalLLM(url, apiKey, payload, signal){
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const res = await fetch(url, { method:'POST', headers, body: JSON.stringify(payload), signal });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = await res.json();
  // Support OpenAI-style responses
  const txt = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
  return (txt || '').trim();
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'wingman-popup') return;
  DEBUG.log('PORT', 'Popup connected');

  const abortByUuid = new Map();

  port.onMessage.addListener(async (msg) => {
    try {
      switch (msg.action) {
        case 'getGenerationState': {
          const state = await getGen(msg.data?.uuid);
          safePost(port, { action:'generationStateResponse', state });
          break;
        }

        case 'getNlpAnalysis': {
          const { scrapedData, uiSettings } = msg.data || {};
          if (!scrapedData) throw new Error('Missing scrapedData');

          const key = await cacheKeyFor(scrapedData);
          const uuid = await hashStr(`${scrapedData.theirName || 'match'}:${scrapedData.theirProfile || ''}`);

          const stored = await chrome.storage.local.get([`match_${uuid}`]);
          let matchProfile = stored[`match_${uuid}`] || {
            uuid,
            metadata: {
              theirName: scrapedData.theirName,
              theirProfile: scrapedData.theirProfile,
              matchLocation: scrapedData.matchLocation,
              firstSeen: new Date().toISOString(),
              lastUpdated: new Date().toISOString(),
            },
            memory: { dateArcPhase:'rapport', topics:{}, insideJokes:[], avoidedTopics:[], questionHistory:[], geoContextData:null, lastCacheHash:null },
            conversationHistory: scrapedData.conversationHistory,
            analysis: null,
          };

          // Run local analysis every time (external can be added later if needed)
          const wordLists = await chrome.storage.local.get(['wordLists_cached']);
          const lists = wordLists.wordLists_cached; // optional; localAnalysisService has defaults when absent
          const { updatedMemory, lastMessageAnalysis } = runFullConversationAnalysis(scrapedData.conversationHistory, matchProfile.memory, lists);

          matchProfile.memory = { ...updatedMemory, lastCacheHash: key };
          matchProfile.conversationHistory = scrapedData.conversationHistory;
          matchProfile.metadata.theirProfile = scrapedData.theirProfile;
          matchProfile.metadata.matchLocation = scrapedData.matchLocation;
          matchProfile.metadata.lastUpdated = new Date().toISOString();
          matchProfile.analysis = { lastMessageAnalysis, conversationState: 'ACTIVE_CONVO' }; // let local service decide, simplified here

          await chrome.storage.local.set({ [`match_${uuid}`]: matchProfile });

          safePost(port, { action:'nlpAnalysisResponse', matchProfile });
          break;
        }

        case 'finalizePayload': {
          // Deprecated path in old code; keep handler if UI uses it.
          break;
        }

        case 'getAIResponse': {
          const { payload, generationId, uuid } = msg.data || {};
          if (!uuid || !payload) throw new Error('Missing uuid or payload');

          // Cancel prior in-flight for this uuid
          if (abortByUuid.has(uuid)) {
            abortByUuid.get(uuid).abort('superseded');
            abortByUuid.delete(uuid);
          }
          const controller = new AbortController();
          abortByUuid.set(uuid, controller);

          await setGen(uuid, { isGenerating:true, error:null, generationId, generationStartTime: Date.now(), response:null }, port);

          try {
            const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
            const settings = { ...DEFAULTS, ...stored };
            const text = await callLocalLLM(settings.local_llama_url, settings.local_llama_api_key, payload, controller.signal);

            // Only apply if still current
            const cur = await getGen(uuid);
            if (cur.generationId !== generationId) return;
            await setGen(uuid, { isGenerating:false, response:text, generationStartTime:null }, port);
          } catch (e) {
            if (e.name === 'AbortError') return;
            await setGen(uuid, { isGenerating:false, error:String(e?.message || e), generationStartTime:null }, port);
          } finally {
            if (abortByUuid.get(uuid) === controller) abortByUuid.delete(uuid);
          }
          break;
        }

        case 'heartbeat': {
          // No-op: keeps the SW alive while popup is open
          break;
        }

        case 'testApiConnection': {
          const url = msg.data?.url;
          let ok = false;
          try {
            const r = await fetch(url, { method:'OPTIONS' });
            ok = r.ok;
          } catch (_) { ok = false; }
          safePost(port, { action:'testApiConnectionResponse', data:{ url, success: ok } });
          break;
        }
      }
    } catch (e) {
      DEBUG.err('ONMSG', 'Handler failed', e);
      safePost(port, { action:'error', error: String(e?.message || e) });
    }
  });

  port.onDisconnect.addListener(() => DEBUG.log('PORT', 'Popup disconnected'));
});