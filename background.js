// background.js
import { runFullConversationAnalysis, determineConversationState, hasRecentGreeting } from './conversationHelpers.js';
import spacetime from './lib/spacetime.min.js';
import informal from './lib/spacetime-informal.min.js';
import { DEBUG } from './modules/debug.js';
import { memoryManager, generateCacheHash } from './modules/matchMemory.js';
import { fetchTimezoneFromCoords, geocodeLocation } from './modules/geolocation.js';
import { getGenerationState, setGenerationState } from './modules/state.js';
import { handleAITask, buildFinalPayload } from './modules/ai.js';

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
                const nlpMode = settings.nlp_mode || 'offline';
                const conversationAnalysisUrl = settings.conversation_analysis_url;

                const uuid = await memoryManager._getMatchUUID(scrapedData.theirName, scrapedData.theirProfile);
                let matchProfile = await memoryManager.getMatchProfile(uuid);

                if (!matchProfile) {
                    DEBUG.log('NLP', `No existing profile found for ${uuid}. Creating new one.`);
                    matchProfile = memoryManager.createInitialProfile(scrapedData);
                    matchProfile.uuid = uuid;
                }

                if (nlpMode === 'offline') {
                    const newCacheHash = await generateCacheHash(scrapedData.conversationHistory, scrapedData.theirProfile);
                    if (matchProfile.memory?.lastCacheHash === newCacheHash && matchProfile.analysis) {
                        DEBUG.log('NLP-CACHE', 'Cache HIT.', {
                            uuid
                        });
                        port.postMessage({
                            action: 'nlpAnalysisResponse',
                            matchProfile
                        });
                        return;
                    }
                    DEBUG.log('NLP-CACHE', 'Cache MISS. Running full analysis.', {
                        uuid
                    });

                    matchProfile.conversationHistory = scrapedData.conversationHistory;
                    matchProfile.metadata.theirProfile = scrapedData.theirProfile;
                    matchProfile.metadata.matchLocation = scrapedData.matchLocation;

                    const { updatedMemory, lastMessageAnalysis } = runFullConversationAnalysis(matchProfile.conversationHistory, matchProfile.memory);
                    matchProfile.memory = updatedMemory;
                    matchProfile.memory.lastCacheHash = newCacheHash;

                    const state = determineConversationState(scrapedData.conversationHistory);
                    const suppressGreeting = hasRecentGreeting(scrapedData.conversationHistory) && !state.startsWith('REENGAGING');

                    const fullAnalysis = {
                        conversationState: state,
                        suppressGreeting: suppressGreeting,
                        lastMessageAnalysis: lastMessageAnalysis,
                        memory: matchProfile.memory,
                    };

                    matchProfile.analysis = fullAnalysis;
                } else {
                    if (!conversationAnalysisUrl) {
                        throw new Error("Conversation Analysis URL is not configured.");
                    }
                    matchProfile = await fetchConversationAnalysis(conversationAnalysisUrl, scrapedData, nlpMode);
                }

                matchProfile.metadata.lastUpdated = new Date().toISOString();
                await memoryManager.saveMatchProfile(uuid, matchProfile);
                DEBUG.log('NLP', 'Analysis complete. Sending response.', {
                    matchProfile
                });
                port.postMessage({
                    action: 'nlpAnalysisResponse',
                    matchProfile
                });
            } catch (error) {
                DEBUG.error('NLP', 'Analysis failed', error);
                port.postMessage({
                    action: 'nlpAnalysisResponse',
                    error: error.message
                });
            }
        },

        "getGeoCalculations": async(request) => {
            DEBUG.log('GEO', 'Received getGeoCalculations request', request.data);
            const { userLocation, userCoords, uuid } = request.data;
            if (!uuid) {
                port.postMessage({
                    action: 'geoCalculationsResponse',
                    geoContext: null
                });
                return;
            }

            const matchProfile = await memoryManager.getMatchProfile(uuid);
            if (!matchProfile) {
                port.postMessage({
                    action: 'geoCalculationsResponse',
                    geoContext: null
                });
                return;
            }

            const matchLocationString = matchProfile.metadata.matchLocation;

            if (matchProfile.memory.geoContextData && matchProfile.metadata.matchLocation === matchLocationString) {
                DEBUG.log('GEO', 'Returning cached geo data.');
                port.postMessage({
                    action: 'geoCalculationsResponse',
                    geoContext: matchProfile.memory.geoContextData
                });
                return;
            }

            let userGeoData = userLocation;
            if (userCoords) {
                const timeData = await fetchTimezoneFromCoords(userCoords.latitude, userCoords.longitude);
                userGeoData = {
                    lat: userCoords.latitude,
                    lon: userCoords.longitude,
                    timeZone: timeData?.timeZone,
                    country: timeData?.country
                };
            }
            const matchCoords = await geocodeLocation(matchLocationString);
            if (!userGeoData || !matchCoords) {
                port.postMessage({
                    action: 'geoCalculationsResponse',
                    geoContext: null
                });
                return;
            }
            const R = 6371;
            const dLat = (matchCoords.lat - userGeoData.lat) * (Math.PI / 180);
            const dLon = (matchCoords.lon - userGeoData.lon) * (Math.PI / 180);
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(userGeoData.lat * (Math.PI / 180)) * Math.cos(matchCoords.lat * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distanceKm = R * c;
            const distance = {
                km: Math.round(distanceKm),
                miles: Math.round(distanceKm * 0.621371)
            };
            const userS = spacetime.now(userGeoData.timeZone);
            const matchTimeData = await fetchTimezoneFromCoords(matchCoords.lat, matchCoords.lon);
            const matchTimeZoneName = matchTimeData?.timeZone || matchCoords.timeZone || (matchCoords.country_code ? spacetime(matchCoords.country_code)?.timezone()?.name : null);
            const matchS = matchTimeZoneName ? spacetime.now(matchTimeZoneName) : null;
            const getTimeOfDay = s => (h => h < 5 ? 'Late Night' : h < 8 ? 'Early Morning' : h < 12 ? 'Morning' : h < 14 ? 'Afternoon' : h < 17 ? 'Late Afternoon' : h < 19 ? 'Evening' : h < 22 ? 'Late Evening' : 'Night')(s.hour());
            const newGeoContext = {
                distance,
                userTimeOfDay: getTimeOfDay(userS),
                matchTimeOfDay: matchS ? getTimeOfDay(matchS) : 'N/A',
                timeZoneDifference: matchS ? Math.abs((userS.offset() - matchS.offset()) / 60) : null,
                countryDifference: (userGeoData.country && matchCoords.country && userGeoData.country !== matchCoords.country) ? `User: ${userGeoData.country}, Match: ${matchCoords.country}.` : null,
                userCountry: userGeoData.country,
                matchCountry: matchCoords.country || 'Unknown',
                cachedAt: new Date().toISOString()
            };
            matchProfile.memory.geoContextData = newGeoContext;
            await memoryManager.saveMatchProfile(matchProfile.uuid, matchProfile);
            DEBUG.log('GEO', 'Geo calculation complete. Sending response.', newGeoContext);
            port.postMessage({
                action: 'geoCalculationsResponse',
                geoContext: newGeoContext
            });
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
                const response = await fetch(url, { method: 'HEAD' });
                if (response.ok) {
                    port.postMessage({ action: 'testConnectionResponse', success: true, type: 'api' });
                } else {
                    port.postMessage({ action: 'testConnectionResponse', success: false, type: 'api', error: `Server responded with status: ${response.status}` });
                }
            } catch (error) {
                port.postMessage({ action: 'testConnectionResponse', success: false, type: 'api', error: error.message });
            }
        },

        "testNlpConnection": async(request) => {
            const { url } = request.data;
            try {
                const response = await fetch(url, { method: 'HEAD' });
                if (response.ok) {
                    port.postMessage({ action: 'testConnectionResponse', success: true, type: 'nlp' });
                } else {
                    port.postMessage({ action: 'testConnectionResponse', success: false, type: 'nlp', error: `Server responded with status: ${response.status}` });
                }
            } catch (error) {
                port.postMessage({ action: 'testConnectionResponse', success: false, type: 'nlp', error: error.message });
            }
        }
    };

    async function fetchConversationAnalysis(url, scrapedData, nlpMode) {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                scrapedData,
                nlpMode
            })
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