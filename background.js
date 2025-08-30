// background.js (Re-architected for Manifest V3 Robustness with Heartbeat)
import { generatePrompts } from './prompts.js';
import { runFullConversationAnalysis } from './conversationHelpers.js';
import spacetime from './lib/spacetime.min.js';
import informal from './lib/spacetime-informal.min.js';

spacetime.extend(informal);

const DEBUG = {
    log: (category, message, data = null) => console.log(`[WINGMAN-BG-${category.toUpperCase()}] ${message}`, data ?? ''),
    error: (category, message, error = null) => console.error(`[WINGMAN-BG-${category.toUpperCase()}-ERROR] ${message}`, error ?? ''),
};

// --- NEW: Default configuration to prevent undefined settings ---
const DEFAULTS = {
    analysis_type: 'local',
    analysis_url: '',
    llm_url: 'http://localhost:8080/v1/chat/completions',
    local_model_name: 'llama3:latest',
    local_llama_api_key: '',
};

const abortControllers = new Map();

// --- NEW: Performance Logger ---
class PerformanceLogger {
    constructor(logKey = 'performanceLogs', maxEntries = 100) {
        this.LOG_KEY = logKey;
        this.MAX_LOG_ENTRIES = maxEntries;
    }

    async log(logData) {
        try {
            const { [this.LOG_KEY]: logs = [] } = await chrome.storage.local.get(this.LOG_KEY);

            const newLogEntry = {
                timestamp: new Date().toISOString(),
                ...logData
            };

            logs.push(newLogEntry);

            // Trim the array if it exceeds the max size
            if (logs.length > this.MAX_LOG_ENTRIES) {
                logs.splice(0, logs.length - this.MAX_LOG_ENTRIES);
            }

            await chrome.storage.local.set({ [this.LOG_KEY]: logs });
            DEBUG.log('PERFLOG', `Performance log saved. Total entries: ${logs.length}`);
        } catch (e) {
            DEBUG.error('PERFLOG', 'Failed to save performance log.', e);
        }
    }
}
const performanceLogger = new PerformanceLogger();

async function generateCacheHash(history, profile) {
    if ((!history || history.length === 0) && !profile)
        return 'empty';
    const combinedString = JSON.stringify(history) + JSON.stringify(profile);
    const encoder = new TextEncoder();
    const data = encoder.encode(combinedString);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const getGenerationStateKey = (uuid) => `generationState_${uuid}`;

async function getGenerationState(uuid) {
    if (!uuid)
        return {
            isGenerating: false,
            response: null,
            error: null,
            generationId: null,
            generationStartTime: null
        };
    const key = getGenerationStateKey(uuid);
    const result = await chrome.storage.local.get(key);
    return result[key] || {
        isGenerating: false,
        response: null,
        error: null,
        generationId: null,
        generationStartTime: null
    };
}

async function setGenerationState(uuid, newState, port) {
    if (!uuid)
        return;
    const key = getGenerationStateKey(uuid);
    const currentState = await getGenerationState(uuid);
    const updatedState = {
        ...currentState,
        ...newState
    };
    await chrome.storage.local.set({
        [key]: updatedState
    });
    DEBUG.log('STATE', `Set generation state for ${uuid}`, updatedState);
    if (port && port.postMessage) {
        try {
            port.postMessage({
                action: 'generationUpdate',
                uuid,
                state: updatedState
            });
        } catch (e) {
            DEBUG.error('PORT', 'Failed to post message, port may be disconnected.', e);
        }
    }
}

class MatchMemory {
    async _getMatchUUID(name, profile) {
        const safeName = name || 'unknown_name';
        const safeProfile = profile || 'no_profile';
        const identifier = `${safeName.trim()}-${safeProfile.trim().substring(0, 100)}`;
        const encoder = new TextEncoder();
        const data = encoder.encode(identifier);
        const hashBuffer = await crypto.subtle.digest('SHA-1', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    async getMatchProfile(uuid) {
        const key = `match_${uuid}`;
        const result = await chrome.storage.local.get(key);
        return result[key] || null;
    }
    async saveMatchProfile(uuid, profileData) {
        const key = `match_${uuid}`;
        await chrome.storage.local.set({
            [key]: profileData
        });
    }
    createInitialProfile(scrapedData) {
        return {
            uuid: null,
            metadata: {
                theirName: scrapedData.theirName,
                theirProfile: scrapedData.theirProfile,
                matchLocation: scrapedData.matchLocation,
                firstSeen: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
            },
            memory: {
                dateArcPhase: 'rapport',
                topics: {},
                insideJokes: [],
                avoidedTopics: [],
                questionHistory: [],
                geoContextData: null,
                lastCacheHash: null,
            },
            conversationHistory: scrapedData.conversationHistory,
            analysis: null,
        };
    }
}
const memoryManager = new MatchMemory();

async function fetchTimezoneFromCoords(lat, lon) {
    const url = `https://timeapi.io/api/time/current/coordinate?latitude=${lat}&longitude=${lon}`;
    try {
        const response = await fetch(url);
        if (!response.ok)
            throw new Error(`timeapi.io failed: ${response.status}`);
        const data = await response.json();
        return {
            timeZone: data?.timeZone || null,
            country: data?.countryName || null,
        };
    } catch (error) {
        DEBUG.error('TIMEAPI', 'Failed to fetch timezone', error);
        return null;
    }
}

async function geocodeLocation(locationString) {
    if (!locationString || locationString.toLowerCase() === 'not specified')
        return null;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationString)}&format=json&limit=1&extratags=1&addressdetails=1`;
    try {
        const response = await fetch(url);
        if (!response.ok)
            throw new Error(`Nominatim API failed: ${response.status}`);
        const data = await response.json();
        if (data && data.length > 0) {
            const { lat, lon, display_name, extratags, address } = data[0];
            return {
                lat: parseFloat(lat),
                lon: parseFloat(lon),
                displayName: display_name,
                timeZone: extratags?.timezone || null,
                country: address?.country || null,
                country_code: address?.country_code || null
            };
        }
        return null;
    } catch (error) {
        DEBUG.error('GEOCODE', `Failed to geocode: ${locationString}`, error);
        return null;
    }
}

async function handleAITask(uuid, generationId, payload, port, options = {}) {
    if (abortControllers.has(uuid)) {
        abortControllers.get(uuid).abort("A new generation request was started.");
    }
    const controller = new AbortController();
    abortControllers.set(uuid, controller);

    await setGenerationState(uuid, { isGenerating: true, response: null, error: null, generationId, generationStartTime: Date.now() }, port);

    try {
        const storedSettings = await chrome.storage.local.get(Object.keys(DEFAULTS));
        const settings = { ...DEFAULTS, ...storedSettings };

        const responseText = await fetchLocalLlamaResponse(settings.local_llama_api_key, payload, settings, controller.signal);

        const currentState = await getGenerationState(uuid);
        if (currentState.generationId !== generationId) {
            DEBUG.log('AI', `Stale generation response ignored for ${uuid}.`);
            return;
        }

        const finalResponse = options.onSuccess ? options.onSuccess(responseText) : cleanAIResponse(responseText);

        await setGenerationState(uuid, { isGenerating: false, response: finalResponse, generationStartTime: null }, port);
        if (options.logData) {
            await performanceLogger.log({ ...options.logData, response: finalResponse });
        }

    } catch (error) {
        const currentState = await getGenerationState(uuid);
        if (currentState.generationId !== generationId) {
            DEBUG.log('AI', `Stale generation error ignored for ${uuid}.`);
            return;
        }

        if (error.name === 'AbortError') {
            DEBUG.log('AI', `Task for ${uuid} was cancelled by disconnect or new request. State already handled.`);
            return;
        }

        DEBUG.error('AI-TASK', `Task failed for ${uuid}`, error);
        await setGenerationState(uuid, { isGenerating: false, error: error.message, generationStartTime: null }, port);

    } finally {
        if (abortControllers.get(uuid) === controller) {
            abortControllers.delete(uuid);
        }
    }
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "wingman-popup")
        return;

    DEBUG.log('PORT', 'Popup connected');

    const messageHandlers = {
        "getNlpAnalysis": async (request) => {
            try {
                DEBUG.log('DIAGNOSTIC', 'Step 1: `getNlpAnalysis` handler started.');
                const { scrapedData } = request.data;
                if (!scrapedData) {
                    DEBUG.error('DIAGNOSTIC', 'Step 1 FAILED: No scrapedData provided.');
                    throw new Error("getNlpAnalysis received no scrapedData.");
                }
                DEBUG.log('DIAGNOSTIC', 'Step 2: Scraped data received.', { theirName: scrapedData.theirName, historyLength: scrapedData.conversationHistory.length });

                const uuid = await memoryManager._getMatchUUID(scrapedData.theirName, scrapedData.theirProfile);
                DEBUG.log('DIAGNOSTIC', `Step 3: Generated/Retrieved UUID: ${uuid}`);

                let matchProfile = await memoryManager.getMatchProfile(uuid);
                DEBUG.log('DIAGNOSTIC', 'Step 4: Retrieved match profile from storage.', { profileExists: !!matchProfile });

                if (!matchProfile) {
                    DEBUG.log('DIAGNOSTIC', `Step 4a: No existing profile found for ${uuid}. Creating new one.`);
                    matchProfile = memoryManager.createInitialProfile(scrapedData);
                    matchProfile.uuid = uuid;
                }

                const newCacheHash = await generateCacheHash(scrapedData.conversationHistory, scrapedData.theirProfile);
                DEBUG.log('DIAGNOSTIC', `Step 5: Generated new cache hash: ${newCacheHash}. Old hash: ${matchProfile.memory?.lastCacheHash}`);

                const storedSettings = await chrome.storage.local.get(['analysis_url', 'analysis_type', 'local_model_name', 'myProfile', 'userLocationChoice']);
                const settings = { ...DEFAULTS, ...storedSettings };
                DEBUG.log('DIAGNOSTIC', 'Step 6: Loaded settings.', settings);

                if (matchProfile.memory?.lastCacheHash === newCacheHash && matchProfile.analysis) {
                    DEBUG.log('DIAGNOSTIC', 'Step 7: Cache HIT. Skipping analysis and returning cached profile.');
                    port.postMessage({ action: 'nlpAnalysisResponse', matchProfile });
                    return;
                }
                DEBUG.log('DIAGNOSTIC', 'Step 7: Cache MISS. Proceeding with full analysis.');

                matchProfile.conversationHistory = scrapedData.conversationHistory;
                matchProfile.metadata.theirProfile = scrapedData.theirProfile;
                matchProfile.metadata.matchLocation = scrapedData.matchLocation;
                DEBUG.log('DIAGNOSTIC', 'Step 8: Updated match profile with new scraped data.');

                DEBUG.log('DIAGNOSTIC', 'Step 9: Calling `runFullConversationAnalysis`...');
                const localAnalysis = runFullConversationAnalysis(matchProfile.conversationHistory, matchProfile.memory);
                DEBUG.log('DIAGNOSTIC', 'Step 10: `runFullConversationAnalysis` completed.', localAnalysis);

                let finalAnalysis = localAnalysis;

                if (settings.analysis_type !== 'local') {
                    DEBUG.log('DIAGNOSTIC', `Step 11: Analysis type is '${settings.analysis_type}'. Calling external API.`);
                    try {
                        const requestPayload = {
                            matchId: uuid,
                            scraped_data: {
                                myName: scrapedData.myName || '',
                                theirName: scrapedData.theirName || '',
                                theirProfile: scrapedData.theirProfile || '',
                                theirLocationString: scrapedData.matchLocation || '',
                                conversationHistory: scrapedData.conversationHistory || [],
                            },
                            ui_settings: {
                                useEnhancedNlp: settings.analysis_type === 'enhanced',
                                myLocation: settings.userLocationChoice || 'autodetect',
                                myProfile: settings.myProfile || '',
                                local_model_name: settings.local_model_name || 'llama3:latest',
                            }
                        };
                        const apiResponse = await callNlpApi(settings.analysis_url, requestPayload);
                        DEBUG.log('DIAGNOSTIC', 'Step 11a: API call succeeded. Response:', apiResponse);

                        if (apiResponse && apiResponse.conversationAnalysis) {
                            DEBUG.log('DIAGNOSTIC', 'Step 11b: API response is valid. Merging with local analysis.');
                            finalAnalysis = deepMerge(apiResponse.conversationAnalysis, localAnalysis);
                            DEBUG.log('DIAGNOSTIC', 'Step 11c: Merge complete. Final analysis object:', finalAnalysis);
                        } else {
                            DEBUG.log('DIAGNOSTIC', 'Step 11b: API response was empty or invalid. Using local analysis as fallback.', apiResponse);
                        }
                    } catch (error) {
                        DEBUG.error('DIAGNOSTIC', 'Step 11 FAILED: API call threw an error. Using local analysis as fallback.', error);
                    }
                } else {
                     DEBUG.log('DIAGNOSTIC', 'Step 11: Analysis type is local. Skipping external API call.');
                }

                matchProfile.analysis = finalAnalysis;
                matchProfile.memory = finalAnalysis.memory;
                matchProfile.memory.lastCacheHash = newCacheHash;
                DEBUG.log('DIAGNOSTIC', 'Step 12: Assigned new analysis and memory to profile.');

                if (finalAnalysis.geo) {
                    matchProfile.memory.geoContextData = finalAnalysis.geo;
                }

                matchProfile.metadata.lastUpdated = new Date().toISOString();
                await memoryManager.saveMatchProfile(uuid, matchProfile);
                DEBUG.log('DIAGNOSTIC', 'Step 13: Saved updated match profile to storage.');

                DEBUG.log('DIAGNOSTIC', 'Step 14: Analysis complete. Sending response to popup.');
                port.postMessage({
                    action: 'nlpAnalysisResponse',
                    matchProfile
                });
            } catch (error) {
                DEBUG.error('DIAGNOSTIC', '`getNlpAnalysis` handler FAILED', error);
                port.postMessage({
                    action: 'nlpAnalysisResponse',
                    error: error.message
                });
            }
        },

        "getFinalPayload": async(request) => {
            try {
                const { uuid, taskInstructions, myProfile, forceIncludeGeoContext } = request.data;
                if (!uuid || !taskInstructions) {
                    throw new Error("getFinalPayload requires a UUID and taskInstructions.");
                }

                const matchProfile = await memoryManager.getMatchProfile(uuid);
                if (!matchProfile) {
                    throw new Error(`No match profile found for UUID: ${uuid}`);
                }

                const generationData = {
                    myName: taskInstructions.myName,
                    theirName: matchProfile.metadata.theirName,
                    myProfile: myProfile,
                    theirProfile: matchProfile.metadata.theirProfile,
                    conversationHistory: matchProfile.conversationHistory,
                    taskInstructions: taskInstructions,
                    geoContextData: matchProfile.memory.geoContextData,
                    forceIncludeGeoContext: forceIncludeGeoContext,
                    conversationAnalysis: matchProfile.analysis,
                };

                const finalPayload = buildFinalPayload(generationData);
                DEBUG.log('PAYLOAD', 'Final payload generated.', finalPayload);
                port.postMessage({
                    action: 'finalPayloadResponse',
                    payload: finalPayload,
                    logData: {
                        uuid,
                        analysis: matchProfile.analysis,
                        payload: finalPayload
                    }
                });
            } catch (error) {
                DEBUG.error('PAYLOAD', 'Build failed', error);
                port.postMessage({
                    action: 'finalPayloadResponse',
                    error: error.message
                });
            }
        },

        "getAIResponse": async(request) => {
            const { payload, generationId, uuid, logData } = request.data;
            DEBUG.log('AI', `Received getAIResponse request for UUID ${uuid}`, { generationId });
            if (!uuid || !payload) {
                DEBUG.error('AI', `Request for ${uuid} aborted due to empty payload.`);
                await setGenerationState(uuid, { isGenerating: false, error: 'Internal error: Payload was empty.' }, port);
                return;
            }
            await handleAITask(uuid, generationId, payload, port, { logData });
        },

        "cancelGeneration": async(request) => {
            const { uuid } = request.data;
            DEBUG.log('CANCEL', `Received cancel request for ${uuid}`);
            if (abortControllers.has(uuid)) {
                abortControllers.get(uuid).abort("Cancelled by user.");
                abortControllers.delete(uuid);
            }
            await setGenerationState(uuid, {
                isGenerating: false,
                error: 'Generation cancelled.',
                generationId: null,
                generationStartTime: null
            }, port);
        },

        "getGenerationState": async(request) => {
            const { uuid } = request.data;
            const state = await getGenerationState(uuid);
            DEBUG.log('STATE', `Received getGenerationState request for ${uuid}, returning state.`, state);
            port.postMessage({
                action: 'generationStateResponse',
                state
            });
        },

        "heartbeat": () => {
            DEBUG.log('HEARTBEAT', 'Received heartbeat.');
        },

        "getAIDateIdea": async(request) => {
            const { uuid, generationId } = request.data;
            const matchProfile = await memoryManager.getMatchProfile(uuid);
            if (!matchProfile) {
                await setGenerationState(uuid, { isGenerating: false, error: 'Match profile not found.' }, port);
                return;
            }

            const settings = await chrome.storage.local.get(['local_model_name', 'myProfile']);
            const myProfile = settings.myProfile || DEFAULTS.myProfile;
            const modelName = settings.local_model_name || DEFAULTS.local_model_name;

            const { metadata, memory } = matchProfile;

            const geoContextString = memory.geoContextData ? `
- **Geo-Context:**
  - Approximate Distance: ${memory.geoContextData.distance.miles} miles
  - Their Location: ${matchProfile.metadata.matchLocation || 'Unknown'}
` : '';

            const systemPrompt = `You are a creative and thoughtful date planner. Your goal is to generate a single, unique, and compelling date idea based on the provided context about two people. The idea should be specific, actionable, and tailored to their personalities and shared interests. You must return the response in a valid JSON object with three keys: "title" (a short, catchy name for the date), "description" (a 2-3 sentence explanation of the date), and "reasoning" (a 1-2 sentence explanation of why this is a good idea for them specifically).`;
            const userPrompt = `Based on the following context, generate one unique date idea.

- **My Profile:** ${myProfile}
- **Their Name:** ${metadata.theirName}
- **Their Profile & Interests:** ${metadata.theirProfile}
- **Shared Conversation Topics:** ${Object.keys(memory.topics || {}).join(', ')}
- **Inside Jokes:** ${memory.insideJokes.join(', ')}
${geoContextString}
Generate one date idea in the specified JSON format.`;

            const payload = {
                model: modelName,
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
                temperature: 0.8,
                response_format: { type: "json_object" }
            };

            const options = {
                onSuccess: (responseText) => {
                    let idea;
                    try {
                        idea = JSON.parse(responseText);
                        if (!idea || typeof idea.title !== 'string' || typeof idea.description !== 'string' || typeof idea.reasoning !== 'string') {
                            throw new Error("AI returned invalid JSON structure for date idea.");
                        }
                    } catch (parseError) {
                        throw new Error(`AI response was not valid JSON. Raw: ${responseText.substring(0, 100)}...`);
                    }
                    return `Date Idea: ${idea.title}\n\n${idea.description}\n\n(Why it's a good idea: ${idea.reasoning})`;
                }
            };
            await handleAITask(uuid, generationId, payload, port, options);
        },

        "refineAIResponse": async(request) => {
            const { originalResponse, refinementType, uuid, generationId } = request.data;

            const settings = await chrome.storage.local.get(['local_model_name']);
            const modelName = settings.local_model_name || DEFAULTS.local_model_name;

            const systemPrompt = `You are a message editor. Your task is to rewrite a given message based on a specific instruction (e.g., "make it funnier", "make it shorter"). You must only return the rewritten message text, without any extra commentary, labels, or quotation marks.`;
            const userPrompt = `Rewrite the following message to be **${refinementType}**:

"${originalResponse}"`;

            const payload = {
                model: modelName,
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
                temperature: 0.6,
            };

            await handleAITask(uuid, generationId, payload, port);
        }
    };

    port.onMessage.addListener((request) => {
        DEBUG.log('PORT', 'Message received from popup', request);
        const handler = messageHandlers[request.action];
        if (handler) {
            handler(request);
        } else {
            DEBUG.error('PORT', 'No handler found for action', request.action);
        }
    });

    port.onDisconnect.addListener(() => {
        DEBUG.log('PORT', 'Popup disconnected. Cleaning up all active tasks.');
        abortControllers.forEach((controller, uuid) => {
            DEBUG.log('PORT', `Aborting active generation for UUID: ${uuid} due to popup closure.`);
            controller.abort("Popup was closed.");
            setGenerationState(uuid, {
                isGenerating: false,
                error: 'Cancelled: Popup closed.',
                generationId: null,
                generationStartTime: null
            }, null);
        });
        abortControllers.clear();
    });
});

function buildFinalPayload(data) {
    const { systemMessage, userMessage } = generatePrompts(data);
    return {
        model: data.taskInstructions.local_model_name,
        messages: [{
                role: "system",
                content: systemMessage
            }, {
                role: "user",
                content: userMessage
            }
        ],
        temperature: data.taskInstructions.temperature,
        top_p: data.taskInstructions.top_p
    };
}

function deepMerge(primary, fallback) {
    const isObject = (item) => (item && typeof item === 'object' && !Array.isArray(item));
    const output = { ...fallback };

    for (const key in primary) {
        if (Object.prototype.hasOwnProperty.call(primary, key)) {
            if (isObject(primary[key]) && key in fallback && isObject(fallback[key])) {
                output[key] = deepMerge(primary[key], fallback[key]);
            } else {
                output[key] = primary[key];
            }
        }
    }

    return output;
}

async function callNlpApi(apiUrl, payload) {
    if (!apiUrl) {
        throw new Error("Analysis URL is not configured in settings.");
    }
    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`NLP API error: ${response.status} - ${errorBody}`);
        }
        return await response.json();
    } catch (error) {
        DEBUG.error('NLP-API', 'Failed to call NLP API', error);
        throw error;
    }
}

function cleanAIResponse(rawResponse) {
    if (typeof rawResponse !== 'string' || !rawResponse)
        return '';
    const stopTokens = ['<|im_end|>', '<|eot_id|>', '</s>', '[INST]', '---'];
    let earliestStopIndex = -1;
    for (const token of stopTokens) {
        const index = rawResponse.indexOf(token);
        if (index !== -1 && (earliestStopIndex === -1 || index < earliestStopIndex)) {
            earliestStopIndex = index;
        }
    }
    return (earliestStopIndex !== -1 ? rawResponse.substring(0, earliestStopIndex) : rawResponse).trim();
}

async function fetchLocalLlamaResponse(apiKey, payload, settings, signal) {
    const { llm_url } = settings;
    const headers = {
        "Content-Type": "application/json"
    };
    if (apiKey)
        headers["Authorization"] = `Bearer ${apiKey}`;

    let response;
    try {
        response = await fetch(llm_url, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal
        });
    } catch (error) {
        if (error.name === 'AbortError')
            throw error;
        throw new Error(`Network Error: Could not connect to the AI server at ${llm_url}.`);
    }

    if (!response.ok) {
        let errorBody = await response.text();
        let errorMessage = errorBody;
        try {
            const errorJson = JSON.parse(errorBody);
            errorMessage = errorJson.error?.message || errorJson.error || JSON.stringify(errorJson);
        } catch (e) { /* Not JSON */
        }
        throw new Error(`Local server error: ${response.status} - ${errorMessage}`);
    }

    const responseData = await response.json();
    if (payload.response_format?.type === "json_object") {
        return responseData.choices[0].message.content;
    }
    if (!responseData.choices?.[0]?.message?.content) {
        throw new Error('Local server returned an unexpected response format.');
    }

    return responseData.choices[0].message.content.trim();
}