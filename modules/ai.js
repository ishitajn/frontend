import { DEBUG } from './debug.js';
import { performanceLogger } from './performanceLogger.js';
import { generatePrompts } from '../prompts.js';
import { getGenerationState, setGenerationState, DEFAULTS } from './state.js';

const abortControllers = new Map();

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
    const { local_llama_url } = settings;
    const headers = {
        "Content-Type": "application/json"
    };
    if (apiKey)
        headers["Authorization"] = `Bearer ${apiKey}`;

    let response;
    try {
        response = await fetch(local_llama_url, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal
        });
    } catch (error) {
        if (error.name === 'AbortError')
            throw error;
        throw new Error(`Network Error: Could not connect to the AI server at ${local_llama_url}.`);
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

export { handleAITask, buildFinalPayload, cleanAIResponse, fetchLocalLlamaResponse };
