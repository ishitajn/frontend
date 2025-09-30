// background.js (Re-architected for Manifest V3 Robustness with Heartbeat)
import {
    generatePrompts
} from './prompts.js';
import {
    runFullConversationAnalysis
} from './conversationHelpers.js';
import spacetime from './lib/spacetime.min.js';
import informal from './lib/spacetime-informal.min.js';
import {
    DEBUG,
    DEFAULTS
} from './shared/constants.js';
import {
    MatchMemory
} from './lib/memory.js';
import {
    WingmanError,
    PerformanceLogger,
    fetchTimezoneFromCoords,
    geocodeLocation,
    callNlpApi,
    fetchLocalLlamaResponse,
    cleanAIResponse,
    deepMerge,
    getFallbackKeys
} from './lib/api-helpers.js';

spacetime.extend(informal);

const abortControllers = new Map();
const analysisAbortControllers = new Map();

const performanceLogger = new PerformanceLogger();
const memoryManager = new MatchMemory();

const getGenerationStateKey = (uuid) => `generationState_${uuid}`;

async function getGenerationState(uuid) {
    if (!uuid) return {
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
    if (!uuid) return;
    const key = getGenerationStateKey(uuid);
    const currentState = await getGenerationState(uuid);
    const updatedState = { ...currentState,
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

async function handleAITask(uuid, generationId, payload, port, options = {}) {
    if (abortControllers.has(uuid)) {
        abortControllers.get(uuid).abort("A new generation request was started.");
    }
    const controller = new AbortController();
    abortControllers.set(uuid, controller);

    await setGenerationState(uuid, {
        isGenerating: true,
        response: null,
        error: null,
        generationId,
        generationStartTime: Date.now()
    }, port);

    try {
        const storedSettings = await chrome.storage.local.get(Object.keys(DEFAULTS));
        const settings = { ...DEFAULTS,
            ...storedSettings
        };
        const responseText = await fetchLocalLlamaResponse(settings.local_llama_api_key, payload, settings, controller.signal);
        const currentState = await getGenerationState(uuid);
        if (currentState.generationId !== generationId) {
            DEBUG.log('AI', `Stale generation response ignored for ${uuid}.`);
            return;
        }
        const finalResponse = options.onSuccess ? options.onSuccess(responseText) : cleanAIResponse(responseText);
        await setGenerationState(uuid, {
            isGenerating: false,
            response: finalResponse,
            generationStartTime: null
        }, port);
        if (options.logData) {
            await performanceLogger.log({ ...options.logData,
                response: finalResponse
            });
        }
    } catch (error) {
        const currentState = await getGenerationState(uuid);
        if (currentState.generationId !== generationId) {
            DEBUG.log('AI', `Stale generation error ignored for ${uuid}.`);
            return;
        }
        if (error.name === 'AbortError') {
            DEBUG.log('AI', `Task for ${uuid} was cancelled. State already handled.`);
            return;
        }
        DEBUG.error('AI-TASK', `Task failed for ${uuid}`, error);
        const structuredError = (error instanceof WingmanError) ? error.toJSON() : new WingmanError('UNKNOWN_AI_ERROR', error.message, error.stack).toJSON();
        await setGenerationState(uuid, {
            isGenerating: false,
            error: structuredError,
            generationStartTime: null
        }, port);
    } finally {
        if (abortControllers.get(uuid) === controller) {
            abortControllers.delete(uuid);
        }
    }
}

async function _getOrCreateMatchProfile(scrapedData) {
    const uuid = await memoryManager._getMatchUUID(scrapedData.theirName, scrapedData.theirProfile);
    DEBUG.log('DIAGNOSTIC', `Generated/Retrieved UUID: ${uuid}`);
    let matchProfile = await memoryManager.getMatchProfile(uuid);
    DEBUG.log('DIAGNOSTIC', 'Retrieved match profile from storage.', {
        profileExists: !!matchProfile
    });
    if (!matchProfile) {
        DEBUG.log('DIAGNOSTIC', `No existing profile found for ${uuid}. Creating new one.`);
        matchProfile = memoryManager.createInitialProfile(scrapedData);
        matchProfile.uuid = uuid;
    }
    matchProfile.conversationHistory = scrapedData.conversationHistory;
    matchProfile.metadata.theirProfile = scrapedData.theirProfile;
    matchProfile.metadata.matchLocation = scrapedData.matchLocation;
    DEBUG.log('DIAGNOSTIC', 'Updated match profile with new scraped data.');
    return {
        uuid,
        matchProfile
    };
}

function _runLocalAnalysis(conversationHistory, memory) {
    DEBUG.log('DIAGNOSTIC', 'Running local conversation analysis...');
    const localAnalysis = runFullConversationAnalysis(conversationHistory, memory);
    DEBUG.log('DIAGNOSTIC', 'Local conversation analysis completed.', localAnalysis);
    return localAnalysis;
}

async function _runApiAnalysis(settings, scrapedData, uuid, signal) {
    DEBUG.log('DIAGNOSTIC', `Analysis type is '${settings.analysis_type}'. Calling external API.`);
    try {
        const {
            userGeoData
        } = await chrome.storage.local.get('userGeoData');
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
                ...(userGeoData && {
                    userGeo: userGeoData
                })
            }
        };
        DEBUG.log('NLP-API', 'Payload for /analyze endpoint:', requestPayload);
        const apiResponse = await callNlpApi(settings.analysis_url, requestPayload, signal);
        DEBUG.log('DIAGNOSTIC', 'API call succeeded. Response:', apiResponse);
        return apiResponse;
    } catch (error) {
        if (error.name === 'AbortError') {
            DEBUG.log('ANALYSIS_ABORT', `Analysis for ${uuid} was cancelled.`);
            throw error;
        }
        DEBUG.error('DIAGNOSTIC', 'API call threw an error.', error);
        return {
            error: 'api_failed',
            details: error.message
        };
    }
}

function _mergeAnalyses(localAnalysis, apiResponse) {
    if (apiResponse && apiResponse.conversationAnalysis) {
        DEBUG.log('DIAGNOSTIC', 'API response is valid. Merging with local analysis.');
        const finalAnalysis = deepMerge(apiResponse.conversationAnalysis, localAnalysis);
        finalAnalysis.fallbackKeys = getFallbackKeys(finalAnalysis, apiResponse.conversationAnalysis);
        if (apiResponse.geo) {
            finalAnalysis.geo = apiResponse.geo;
        }
        DEBUG.log('DIAGNOSTIC', 'Merge complete.', {
            finalAnalysis
        });
        return finalAnalysis;
    }
    DEBUG.log('DIAGNOSTIC', 'API response was empty, invalid, or failed. Using local analysis as fallback.', apiResponse);
    const finalAnalysis = { ...localAnalysis
    };
    finalAnalysis.fallbackKeys = Object.keys(finalAnalysis);
    if (apiResponse && apiResponse.error) {
        finalAnalysis.error = apiResponse.error;
    }
    return finalAnalysis;
}

async function handleTextGeneration(uuid, generationId, payload, port, logData) {
    DEBUG.log('AI', `Received text generation request for UUID ${uuid}`, {
        generationId
    });
    if (!uuid || !payload) {
        const error = new WingmanError('BAD_REQUEST', 'Cannot generate a response without a payload.', {
            uuid
        });
        DEBUG.error('AI', error.message, error.details);
        await setGenerationState(uuid, {
            isGenerating: false,
            error: error.toJSON()
        }, port);
        return;
    }
    await handleAITask(uuid, generationId, payload, port, {
        logData
    });
}

async function handleDateIdeaGeneration(uuid, generationId, port) {
    const matchProfile = await memoryManager.getMatchProfile(uuid);
    if (!matchProfile) {
        const error = new WingmanError('NOT_FOUND', 'Match profile not found for date idea generation.', {
            uuid
        });
        await setGenerationState(uuid, {
            isGenerating: false,
            error: error.toJSON()
        }, port);
        return;
    }
    const settings = await chrome.storage.local.get(['local_model_name', 'myProfile']);
    const myProfile = settings.myProfile || DEFAULTS.myProfile;
    const modelName = settings.local_model_name || DEFAULTS.local_model_name;
    const {
        metadata,
        memory
    } = matchProfile;
    const geoContextString = memory.geoContextData ? `- **Geo-Context:**\n  - Approximate Distance: ${memory.geoContextData.distance.miles} miles\n  - Their Location: ${matchProfile.metadata.matchLocation || 'Unknown'}\n` : '';
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
        messages: [{
            role: "system",
            content: systemPrompt
        }, {
            role: "user",
            content: userPrompt
        }],
        temperature: 0.8,
        response_format: {
            type: "json_object"
        }
    };
    const options = {
        onSuccess: (responseText) => {
            let idea;
            try {
                idea = JSON.parse(responseText);
                if (!idea || typeof idea.title !== 'string' || typeof idea.description !== 'string' || typeof idea.reasoning !== 'string') {
                    throw new WingmanError('INVALID_RESPONSE', "AI returned invalid JSON structure for date idea.", responseText);
                }
            } catch (parseError) {
                throw new WingmanError('INVALID_RESPONSE', `AI response was not valid JSON. Raw: ${responseText.substring(0, 100)}...`, parseError);
            }
            return `Date Idea: ${idea.title}\n\n${idea.description}\n\n(Why it's a good idea: ${idea.reasoning})`;
        }
    };
    await handleAITask(uuid, generationId, payload, port, options);
}

async function handleRefineResponse(uuid, generationId, originalResponse, refinementType, port) {
    const settings = await chrome.storage.local.get(['local_model_name']);
    const modelName = settings.local_model_name || DEFAULTS.local_model_name;
    const systemPrompt = `You are a message editor. Your task is to rewrite a given message based on a specific instruction (e.g., "make it funnier", "make it shorter"). You must only return the rewritten message text, without any extra commentary, labels, or quotation marks.`;
    const userPrompt = `Rewrite the following message to be **${refinementType}**:

"${originalResponse}"`;
    const payload = {
        model: modelName,
        messages: [{
            role: "system",
            content: systemPrompt
        }, {
            role: "user",
            content: userPrompt
        }],
        temperature: 0.6,
    };
    await handleAITask(uuid, generationId, payload, port);
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "wingman-popup") return;
    DEBUG.log('PORT', 'Popup connected');

    const messageHandlers = {
        "getNlpAnalysis": async (request) => {
            let uuid;
            const controller = new AbortController();
            try {
                DEBUG.log('DIAGNOSTIC', '`getNlpAnalysis` handler started.');
                const {
                    scrapedData
                } = request.data;
                if (!scrapedData) {
                    throw new WingmanError('BAD_REQUEST', 'No conversation data was received from the page.');
                }
                DEBUG.log('DIAGNOSTIC', 'Scraped data received.', {
                    theirName: scrapedData.theirName
                });
                const {
                    uuid: matchUuid,
                    matchProfile
                } = await _getOrCreateMatchProfile(scrapedData);
                uuid = matchUuid;
                if (analysisAbortControllers.has(uuid)) {
                    analysisAbortControllers.get(uuid).abort('New analysis requested.');
                    DEBUG.log('ANALYSIS_ABORT', `Aborted previous analysis for ${uuid}`);
                }
                analysisAbortControllers.set(uuid, controller);
                const localAnalysis = _runLocalAnalysis(matchProfile.conversationHistory, matchProfile.memory);
                const storedSettings = await chrome.storage.local.get(['analysis_url', 'analysis_type', 'myProfile', 'userLocationChoice', 'apiConsent']);
                const settings = { ...DEFAULTS,
                    ...storedSettings
                };
                DEBUG.log('DIAGNOSTIC', 'Loaded settings.', settings);
                let finalAnalysis;
                if (settings.analysis_type !== 'local' && settings.apiConsent) {
                    const apiResponse = await _runApiAnalysis(settings, scrapedData, uuid, controller.signal);
                    finalAnalysis = _mergeAnalyses(localAnalysis, apiResponse);
                } else {
                    finalAnalysis = localAnalysis;
                    finalAnalysis.fallbackKeys = [];
                }
                matchProfile.analysis = finalAnalysis;
                matchProfile.memory = finalAnalysis.memory;
                if (finalAnalysis.geo) {
                    matchProfile.memory.geoContextData = finalAnalysis.geo;
                }
                matchProfile.metadata.lastUpdated = new Date().toISOString();
                await memoryManager.saveMatchProfile(uuid, matchProfile);
                DEBUG.log('DIAGNOSTIC', 'Analysis complete. Sending response to popup.', {
                    matchProfile
                });
                port.postMessage({
                    action: 'nlpAnalysisResponse',
                    matchProfile
                });
            } catch (error) {
                if (error.name !== 'AbortError') {
                    DEBUG.error('DIAGNOSTIC', '`getNlpAnalysis` handler FAILED', error);
                    const structuredError = (error instanceof WingmanError) ? error.toJSON() : new WingmanError('UNKNOWN_ANALYSIS_ERROR', error.message, error.stack).toJSON();
                    port.postMessage({
                        action: 'nlpAnalysisResponse',
                        error: structuredError
                    });
                }
            } finally {
                if (uuid && analysisAbortControllers.get(uuid) === controller) {
                    analysisAbortControllers.delete(uuid);
                }
            }
        },
        "getFinalPayload": async (request) => {
            try {
                const {
                    uuid,
                    taskInstructions,
                    myProfile,
                    forceIncludeGeoContext
                } = request.data;
                if (!uuid || !taskInstructions) {
                    throw new WingmanError('BAD_REQUEST', 'Missing required data for AI generation.');
                }
                const matchProfile = await memoryManager.getMatchProfile(uuid);
                if (!matchProfile) {
                    throw new WingmanError('NOT_FOUND', `Could not find a profile for this match.`, {
                        uuid
                    });
                }
                // Get chat template settings
                const templateSettings = await chrome.storage.local.get(['chatMessageTemplate', 'assistantPromptTemplate', 'systemPromptTemplate']);

                const generationData = {
                    myName: taskInstructions.myName,
                    theirName: matchProfile.metadata.theirName,
                    myProfile: myProfile,
                    theirProfile: matchProfile.metadata.theirProfile,
                    conversationHistory: matchProfile.conversationHistory,
                    taskInstructions: {
                        ...taskInstructions,
                        ...templateSettings // Add templates to task instructions
                    },
                    geoContextData: matchProfile.memory.geoContextData,
                    forceIncludeGeoContext: forceIncludeGeoContext,
                    conversationAnalysis: matchProfile.analysis,
                };
                const finalPayload = buildFinalPayload(generationData);
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
                const structuredError = (error instanceof WingmanError) ? error.toJSON() : new WingmanError('UNKNOWN_PAYLOAD_ERROR', error.message, error.stack).toJSON();
                port.postMessage({
                    action: 'finalPayloadResponse',
                    error: structuredError
                });
            }
        },
        "getAIResponse": (request) => {
            const {
                payload,
                generationId,
                uuid,
                logData
            } = request.data;
            handleTextGeneration(uuid, generationId, payload, port, logData);
        },
        "cancelGeneration": async (request) => {
            const {
                uuid
            } = request.data;
            DEBUG.log('CANCEL', `Received cancel request for ${uuid}`);
            if (abortControllers.has(uuid)) {
                abortControllers.get(uuid).abort("Cancelled by user.");
                abortControllers.delete(uuid);
            }
            const error = new WingmanError('CANCELLED', 'Generation cancelled by user.');
            await setGenerationState(uuid, {
                isGenerating: false,
                error: error.toJSON(),
                generationId: null,
                generationStartTime: null
            }, port);
        },
        "getGenerationState": async (request) => {
            const {
                uuid
            } = request.data;
            const state = await getGenerationState(uuid);
            port.postMessage({
                action: 'generationStateResponse',
                state
            });
        },
        "heartbeat": () => DEBUG.log('HEARTBEAT', 'Received heartbeat.'),
        "getAIDateIdea": (request) => {
            const {
                uuid,
                generationId
            } = request.data;
            handleDateIdeaGeneration(uuid, generationId, port);
        },
        "updateUserGeo": async (request) => {
            const {
                latitude,
                longitude
            } = request.data;
            if (latitude && longitude) {
                const geoData = await fetchTimezoneFromCoords(latitude, longitude);
                if (geoData) {
                    await chrome.storage.local.set({
                        userGeoData: geoData
                    });
                }
            }
        },
        "refineAIResponse": (request) => {
            const {
                originalResponse,
                refinementType,
                uuid,
                generationId
            } = request.data;
            handleRefineResponse(uuid, generationId, originalResponse, refinementType, port);
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
            const error = new WingmanError('CANCELLED', 'Popup was closed during generation.');
            setGenerationState(uuid, {
                isGenerating: false,
                error: error.toJSON(),
                generationId: null,
                generationStartTime: null
            }, null);
        });
        abortControllers.clear();
    });
});

function buildFinalPayload(data) {
    const {
        systemMessage,
        userMessage
    } = generatePrompts(data);
    return {
        model: data.taskInstructions.local_model_name,
        messages: [{
            role: "system",
            content: systemMessage
        }, {
            role: "user",
            content: userMessage
        }],
        temperature: data.taskInstructions.temperature,
        top_p: data.taskInstructions.top_p
    };
}
