// background.js
import spacetime from './lib/spacetime.min.js';
import informal from './lib/spacetime-informal.min.js';
import { DEBUG } from './modules/debug.js';
import { memoryManager, generateCacheHash } from './modules/matchMemory.js';
import { fetchTimezoneFromCoords, geocodeLocation } from './modules/geolocation.js';
import { getGenerationState, setGenerationState, DEFAULTS } from './modules/state.js';
import { handleAITask } from './modules/ai.js';
import { USER_LOCATIONS } from './modules/config.js';
import { apiClient } from './modules/apiClient.js';

spacetime.extend(informal);

const abortControllers = new Map();

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "wingman-popup")
        return;

    DEBUG.log('PORT', 'Popup connected');

    const messageHandlers = {
        "getNlpAnalysis": async(request) => {
            try {
                DEBUG.log('NLP', 'Received getNlpAnalysis request', request.data);
                const { scrapedData } = request.data;
                if (!scrapedData)
                    throw new Error("getNlpAnalysis received no scrapedData.");

                const settings = await chrome.storage.local.get(['nlp_mode', 'conversation_analysis_url']);
                const nlpMode = settings.nlp_mode || 'fast'; // Default to fast mode
                const conversationAnalysisUrl = settings.conversation_analysis_url;

                if (!conversationAnalysisUrl) {
                    throw new Error("Conversation Analysis URL is not configured.");
                }

                const uuid = await memoryManager._getMatchUUID(scrapedData.theirName, scrapedData.theirProfile);

                // The fetchConversationAnalysis function now returns the full payload
                const nlpPayload = await fetchConversationAnalysis(conversationAnalysisUrl, scrapedData, nlpMode, uuid);

                // We can still cache the payload if we want, using the matchId as the key
                // For simplicity in this refactor, we'll skip caching here but it could be added back.

                DEBUG.log('NLP', 'Analysis complete. Sending response.', {
                    payload: nlpPayload
                });
                port.postMessage({
                    action: 'nlpAnalysisResponse',
                    payload: nlpPayload
                });
            } catch (error) {
                DEBUG.error('NLP', 'Analysis failed', error);
                port.postMessage({
                    action: 'nlpAnalysisResponse',
                    error: error.message
                });
            }
        },

        "getAIResponse": async(request) => {
            const { nlpPayload, generationId } = request.data;
            const uuid = nlpPayload.matchId;

            DEBUG.log('AI', `Received getAIResponse request for UUID ${uuid}`, { generationId });
            if (!uuid || !nlpPayload) {
                DEBUG.error('AI', `Request for ${uuid} aborted due to empty payload.`);
                await setGenerationState(uuid, { isGenerating: false, error: 'Internal error: Payload was empty.' }, port);
                return;
            }

            // The `handleAITask` function will now be responsible for building the final payload
            // using the nlpPayload and then making the API call.
            await handleAITask(uuid, generationId, nlpPayload, port, {});
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

            const { metadata, memory } = matchProfile;
            const systemPrompt = `You are a creative and thoughtful date planner. Your goal is to generate a single, unique, and compelling date idea based on the provided context about two people. The idea should be specific, actionable, and tailored to their personalities and shared interests. You must return the response in a valid JSON object with three keys: "title" (a short, catchy name for the date), "description" (a 2-3 sentence explanation of the date), and "reasoning" (a 1-2 sentence explanation of why this is a good idea for them specifically).`;
            const userPrompt = `Based on the following context, generate one unique date idea.

- **Their Name:** ${metadata.theirName}
- **Their Profile & Interests:** ${metadata.theirProfile}
- **Shared Conversation Topics:** ${Object.keys(memory.topics || {}).join(', ')}
- **Inside Jokes:** ${memory.insideJokes.join(', ')}
- **Geo-Context:** ${JSON.stringify(memory.geoContextData)}

Generate one date idea in the specified JSON format.`;

            const payload = {
                model: "llama3:latest",
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

            const systemPrompt = `You are a message editor. Your task is to rewrite a given message based on a specific instruction (e.g., "make it funnier", "make it shorter"). You must only return the rewritten message text, without any extra commentary, labels, or quotation marks.`;
            const userPrompt = `Rewrite the following message to be **${refinementType}**:

"${originalResponse}"`;

            const payload = {
                model: "llama3:latest",
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
                temperature: 0.6,
            };

            await handleAITask(uuid, generationId, payload, port);
        },

        "testApiConnection": async(request) => {
            const { url } = request.data;
            try {
                await apiClient(url, 'POST', {
                    model: "test",
                    messages: [{ role: "user", content: "hello" }]
                });
                port.postMessage({ action: 'testConnectionResponse', success: true, type: 'api' });
            } catch (error) {
                port.postMessage({ action: 'testConnectionResponse', success: false, type: 'api', error: error.message });
            }
        },

        "testNlpConnection": async(request) => {
            const { url } = request.data;
            try {
                await apiClient(url, 'POST', {
                    matchId: "test",
                    scraped_data: {
                        myName: "test",
                        theirName: "test",
                        theirProfile: "test",
                        theirLocationString: "test",
                        conversationHistory: []
                    },
                    ui_settings: {
                        useEnhancedNlp: false,
                        myLocation: "test",
                        myProfile: "test",
                        local_model_name: "test"
                    }
                }, { 'Content-Type': 'text/plain' });
                port.postMessage({ action: 'testConnectionResponse', success: true, type: 'nlp' });
            } catch (error) {
                port.postMessage({ action: 'testConnectionResponse', success: false, type: 'nlp', error: error.message });
            }
        }
    };

    async function fetchConversationAnalysis(url, scrapedData, nlpMode, uuid) {
        const settings = await chrome.storage.local.get(['userLocationChoice', 'myProfile', 'ai_model']);
        const locationName = USER_LOCATIONS[settings.userLocationChoice]?.name || settings.userLocationChoice;

        const requestBody = {
            matchId: uuid,
            scraped_data: {
                myName: scrapedData.myName ?? "Unknown",
                theirName: scrapedData.theirName ?? "Unknown",
                theirProfile: scrapedData.theirProfile ?? "",
                theirLocationString: scrapedData.matchLocation ?? "",
                conversationHistory: scrapedData.conversationHistory ?? []
            },
            ui_settings: {
                useEnhancedNlp: nlpMode === 'enhanced',
                myLocation: locationName ?? "",
                myProfile: settings.myProfile ?? "",
                local_model_name: settings.ai_model ?? ""
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`Conversation Analysis service responded with status: ${response.status}`);
        }

        return response.json();
    }

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