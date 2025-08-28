// popup.js — Clean MV3 rewrite
// Responsibilities: UI state, messaging, rendering, settings, and prompt assembly.

import { scrapeBumblePage, pasteTextIntoBumbleInput, scrapeTinderPage, pasteTextIntoTinderInput } from './content-scraper.js';
import { showDebugModal, renderDebugView, setSendMessageFunction } from './debug.js';
import {
  LINGUISTIC_STYLES, EMOJI_STRATEGIES, USER_LOCATIONS,
  DATE_ARC_PHASES, CONVERSATION_STATES, INTENT_OPTIONS,
  FLIRT_LEVEL_OPTIONS, PACE_OPTIONS, DEFAULTS,
  MATCH_SPECIFIC_SETTINGS_KEYS, SELECTORS,
  getToneDescription, getLengthDescription, getEmojiInstruction, getStyleDescription,
  ANALYSIS_VIEW_SCHEMA, TOPIC_ANALYSIS_VIEW_SCHEMA, CONV_ANALYSIS_VIEW_SCHEMA
} from './constants.js';
import { generatePrompts } from './prompts.js';

const DEBUG = {
  log: (c, m, d = null) => console.log(`[POPUP:${c}] ${m}`, d ?? ''),
  err: (c, m, e = null) => console.error(`[POPUP:${c}] ${m}`, e ?? ''),
};

const state = {
  currentMatchUUID: null,
  currentViewId: SELECTORS?.loadingView || 'loading-view',
  pasterFn: null,
  isRefreshing: false,
  sessionMatchProfile: null,
  sessionScrapedData: null,
};

let port;
let timerInterval = null, timerStartTime = 0;
let heartbeatInterval = null;

function setupPort(){
  port = chrome.runtime.connect({ name: 'wingman-popup' });
  port.onMessage.addListener(onPortMessage);
  port.onDisconnect.addListener(() => { stopHeartbeat(); port = null; });
}
function onPortMessage(message){
  DEBUG.log('PORT', 'MSG', message);
  switch (message.action) {
    case 'nlpAnalysisResponse': return handleNlpAnalysisResponse(message);
    case 'generationUpdate': if (message.uuid === state.currentMatchUUID) return syncUIWithState(message.state); break;
    case 'generationStateResponse': return syncUIWithState(message.state);
    case 'analysisFallback': return showToast(`Analysis failed: ${message.error} Using local results.`);
    case 'error': return showError('Error', message.error);
  }
}
function sendMessage(msg){
  try { port?.postMessage(msg); } catch (e) { DEBUG.err('PORT','send fail', e); }
}
setSendMessageFunction(sendMessage);

document.addEventListener('DOMContentLoaded', initializePopup);

async function initializePopup(){
  setupEventListeners();
  setupPort();
  await loadAndApplySettings();
  await refreshDataAndUI();
}

async function refreshDataAndUI(){
  if (state.isRefreshing) return;
  state.isRefreshing = true; setUIRefreshingState(true);
  try {
    sendMessage({ action:'getGenerationState', data:{ uuid: state.currentMatchUUID } });
    const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });

    let scraperFn, pasterFn;
    if (tab.url?.startsWith('https://tinder.com/')) { scraperFn = scrapeTinderPage; pasterFn = pasteTextIntoTinderInput; }
    else if (tab.url?.startsWith('https://bumble.com/')) { scraperFn = scrapeBumblePage; pasterFn = pasteTextIntoBumbleInput; }
    else { throw new Error('Unsupported Site: Navigate to a Tinder or Bumble conversation.'); }

    const results = await chrome.scripting.executeScript({ target:{ tabId: tab.id }, function: scraperFn });
    const pageData = results?.[0]?.result;
    if (!pageData || pageData.error) throw new Error(pageData?.error || 'Could not read page. Select a conversation.');

    state.sessionScrapedData = pageData;
    state.pasterFn = pasterFn;

    const settings = await chrome.storage.local.get(['myProfile','userLocationChoice','local_model_name','analysis_type']);
    sendMessage({ action:'getNlpAnalysis', data:{ scrapedData: pageData, uiSettings: {
      myProfile: settings.myProfile || DEFAULTS.myProfile,
      userLocationChoice: settings.userLocationChoice || DEFAULTS.userLocationChoice,
      local_model_name: settings.local_model_name || DEFAULTS.local_model_name,
      analysis_type: settings.analysis_type || DEFAULTS.analysis_type,
    }}});
  } catch(e){ showError('Initialization Failed', e.message); DEBUG.err('INIT','Refresh failed', e); }
  finally { state.isRefreshing = false; setUIRefreshingState(false); }
}

async function handleNlpAnalysisResponse(message){
  if (message.error || !message.matchProfile) { showError('NLP Analysis Failed', message.error || 'No match profile.'); return; }
  state.sessionMatchProfile = message.matchProfile;
  state.currentMatchUUID = message.matchProfile.uuid;
  await loadAndApplySettings();
  displayConversationState();
  showView('main-view');
}

// Generate click
async function handleGenerateClick(){
  if (!state.sessionMatchProfile || !state.sessionScrapedData) return;
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const s = { ...DEFAULTS, ...stored };

  const taskInstructions = {
    goal: document.getElementById('custom-instruction')?.value || '',
    flirtyValue: s.flirtyValue,
    lengthValue: s.lengthValue,
    endWithQuestion: s.endWithQuestion,
    linguisticStyle: s.linguisticStyle,
    strictGoalOverride: s.strictGoalOverride,
    forceNewTopic: s.newTopic,
    myName: 'You',
    theirName: state.sessionMatchProfile?.metadata?.theirName || 'Match',
    emojiStrategy: s.emojiStrategy,
    temperature: s.modelTemperature,
    top_p: s.topPValue,
  };

  const data = {
    myProfile: s.myProfile,
    theirProfile: state.sessionMatchProfile?.metadata?.theirProfile,
    conversationHistory: state.sessionMatchProfile?.conversationHistory,
    myName: 'You',
    theirName: state.sessionMatchProfile?.metadata?.theirName,
    isVerified: state.sessionMatchProfile?.isVerified,
    geoContextData: state.sessionMatchProfile?.memory?.geoContextData,
  };

  const conversationAnalysis = state.sessionMatchProfile?.analysis || { conversationState:'ACTIVE_CONVO' };
  const { systemMessage, userMessage } = generatePrompts({
    conversationHistory: data.conversationHistory,
    taskInstructions,
    geoContextData: data.geoContextData,
    conversationAnalysis,
  });

  const payload = {
    messages: [ { role:'system', content: systemMessage }, { role:'user', content: userMessage } ],
    temperature: taskInstructions.temperature,
    top_p: taskInstructions.top_p,
  };

  setUIGeneratingState(true); startTimer(Date.now());
  sendMessage({ action:'getAIResponse', data:{ payload, generationId: Date.now(), uuid: state.currentMatchUUID } });
}

// UI helpers
function showView(id){
  ['loading-view','main-view','settings-view','error-view'].forEach(v => document.getElementById(v)?.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
  state.currentViewId = id;
}
function setUIRefreshingState(b){ document.getElementById('generate-btn').disabled = b; }
function setUIGeneratingState(b){
  document.getElementById('generate-btn').disabled = b;
  document.getElementById('cancel-btn').classList.toggle('hidden', !b);
  document.getElementById('response-timer').classList.toggle('hidden', !b);
}
function showError(title, msg){ showView('error-view'); document.getElementById('error-title').textContent = title; document.getElementById('error-message').textContent = msg; }
function showErrorInResponseArea(msg){ const r = document.getElementById('response-area'); r.textContent = msg; r.classList.add('error'); }
function showToast(text, isError=false){
  let el = document.querySelector('.toast');
  if (!el){ el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = text; el.classList.toggle('error', !!isError); el.classList.add('visible');
  setTimeout(()=> el.classList.remove('visible'), 2200);
}

function syncUIWithState(stateObj){
  if (stateObj?.response){
    const r = document.getElementById('response-area');
    r.textContent = stateObj.response; r.classList.remove('error');
    setUIGeneratingState(false); stopTimer();
  }
  if (stateObj?.error){ showErrorInResponseArea(stateObj.error); setUIGeneratingState(false); stopTimer(); }
}

function displayConversationState(){
  const s = state.sessionMatchProfile?.analysis?.conversationState || 'Unknown';
  document.getElementById('conversation-status-display').textContent = `Status: ${s}`;
}

function startTimer(start){ timerStartTime = start; updateTimer(); timerInterval = setInterval(updateTimer, 500); }
function stopTimer(){ if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }
function updateTimer(){ const t = Math.max(0, Date.now() - timerStartTime); const mm = String(Math.floor(t/60000)).padStart(2,'0'); const ss = String(Math.floor((t%60000)/1000)).padStart(2,'0'); document.getElementById('response-timer').textContent = `${mm}:${ss}`; }

function setupEventListeners(){
  document.getElementById('generate-btn')?.addEventListener('click', handleGenerateClick);
  document.getElementById('copy-btn')?.addEventListener('click', () => {
    const txt = document.getElementById('response-area').textContent || '';
    navigator.clipboard.writeText(txt).then(()=>showToast('Copied')).catch(()=>showToast('Copy failed', true));
  });
  document.getElementById('cancel-btn')?.addEventListener('click', () => showToast('Cancel not supported in minimal rewrite'));
  document.getElementById('settings-btn')?.addEventListener('click', () => showView('settings-view'));
  document.getElementById('back-btn')?.addEventListener('click', () => showView('main-view'));
  document.getElementById('reset-match-btn')?.addEventListener('click', async () => {
    if (!state.currentMatchUUID) return;
    await chrome.storage.local.remove([`match_${state.currentMatchUUID}`]);
    showToast('Match reset');
    await refreshDataAndUI();
  });
  document.getElementById('test-api-btn')?.addEventListener('click', () => handleTestApiClick('localLlamaUrl'));
  document.getElementById('test-analysis-btn')?.addEventListener('click', () => handleTestApiClick('analysisUrl'));

  document.querySelectorAll('.tab-link').forEach(btn => btn.addEventListener('click', handleTabClick));

  document.getElementById('main-view')?.addEventListener('input', handleSettingChange);
  document.getElementById('main-view')?.addEventListener('change', handleSettingChange);
  document.getElementById('settings-view')?.addEventListener('input', handleSettingChange);
  document.getElementById('settings-view')?.addEventListener('change', handleSettingChange);
}

function handleTabClick(e){
  const t = e.target; if (!t.classList.contains('tab-link')) return;
  document.querySelectorAll('.tab-link').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  document.getElementById(t.dataset.tab).classList.add('active');
  if (['analysis','topic-analysis','conv-analysis'].includes(t.dataset.tab)){
    const generationState = {
      ...state.sessionScrapedData,
      ...state.sessionMatchProfile?.metadata,
      conversationHistory: state.sessionMatchProfile?.conversationHistory,
      conversationAnalysis: state.sessionMatchProfile?.analysis,
      geoContextData: state.sessionMatchProfile?.memory?.geoContextData,
    };
    renderDebugView(t.dataset.tab, generationState);
  }
}

async function handleTestApiClick(urlInputId){
  const el = document.getElementById(urlInputId); const url = el?.value; if (!url) return;
  const btn = el.nextElementSibling; const t = btn.textContent; btn.textContent = '...'; btn.disabled = true;
  sendMessage({ action:'testApiConnection', data:{ url } });
  const onMsg = (msg) => {
    if (msg.action === 'testApiConnectionResponse' && msg.data.url === url){
      el.style.borderColor = msg.data.success ? 'var(--success-color)' : 'var(--danger-color)';
      btn.textContent = t; btn.disabled = false;
      setTimeout(()=> el.style.borderColor = '', 1500);
      port?.onMessage.removeListener(onMsg);
    }
  };
  port?.onMessage.addListener(onMsg);
}

async function loadAndApplySettings(){
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const s = { ...DEFAULTS, ...stored };
  // populate dropdowns/sliders
  const fillSel = (id, opts) => { const el = document.getElementById(id); if (!el) return; el.innerHTML = Object.entries(opts).map(([k,v])=>`<option value="${k}">${v}</option>`).join(''); el.value = s[idToKey(id)] ?? Object.keys(opts)[0]; };
  const idToKey = (id) => ({ 'linguistic-style-select':'linguisticStyle','emoji-strategy-select':'emojiStrategy','user-location-select':'userLocationChoice' }[id] || id);

  // simple sets
  document.getElementById('custom-instruction').value = s.customInstruction;
  document.getElementById('question-toggle-checkbox').checked = s.endWithQuestion;
  document.getElementById('geo-context-toggle').checked = s.geoContextToggle;
  document.getElementById('strict-goal-toggle').checked = s.strictGoalOverride;

  document.getElementById('flirty-slider').value = s.flirtyValue;
  document.getElementById('length-slider').value = s.lengthValue;
  document.getElementById('temperature-slider').value = s.modelTemperature;
  document.getElementById('top-p-slider').value = s.topPValue;

  // enums
  const styles = LINGUISTIC_STYLES.reduce((a,v)=> (a[v]=v, a), {});
  fillSel('linguistic-style-select', styles);
  fillSel('emoji-strategy-select', EMOJI_STRATEGIES);
  fillSel('user-location-select', Object.fromEntries(Object.entries(USER_LOCATIONS).map(([k,v])=>[k, v.name])));

  updateSliderLabels();
}

function handleSettingChange(e){
  const idMap = {
    'custom-instruction':'customInstruction',
    'question-toggle-checkbox':'endWithQuestion',
    'geo-context-toggle':'geoContextToggle',
    'strict-goal-toggle':'strictGoalOverride',
    'flirty-slider':'flirtyValue',
    'length-slider':'lengthValue',
    'temperature-slider':'modelTemperature',
    'top-p-slider':'topPValue',
    'linguistic-style-select':'linguisticStyle',
    'emoji-strategy-select':'emojiStrategy',
    'user-location-select':'userLocationChoice',
    'localLlamaUrl':'local_llama_url',
    'localModelName':'local_model_name',
    'localLlamaApiKey':'local_llama_api_key',
    'analysisUrl':'analysis_url',
    'analysisType':'analysis_type',
    'my-profile-setting':'myProfile',
    'debug-mode-toggle': 'debugModeEnabled',
  };
  const key = idMap[e.target.id]; if (!key) return;
  const value = (e.target.type === 'checkbox') ? e.target.checked : e.target.value;
  chrome.storage.local.set({ [key]: value });
  if (['flirty-slider', 'length-slider', 'temperature-slider', 'top-p-slider'].includes(e.target.id)) {
    updateSliderLabels();
  }
}

function updateSliderLabels(){
  const f = Number(document.getElementById('flirty-slider').value);
  const l = Number(document.getElementById('length-slider').value);
  document.getElementById('flirty-value-label').textContent = getToneDescription(f);
  document.getElementById('length-value-label').textContent = getLengthDescription(l);
  document.getElementById('temperature-value-label').textContent = String(document.getElementById('temperature-slider').value);
  document.getElementById('top-p-value-label').textContent = String(document.getElementById('top-p-slider').value);
}

function startHeartbeat(){ stopHeartbeat(); heartbeatInterval = setInterval(()=> sendMessage({ action:'heartbeat' }), 15000); }
function stopHeartbeat(){ if (heartbeatInterval){ clearInterval(heartbeatInterval); heartbeatInterval = null; } }