import { DEBUG } from './debug.js';
import { performanceLogger } from './performanceLogger.js';
import { generatePrompts } from '../prompts.js';
import { getGenerationState, setGenerationState, DEFAULTS } from './state.js';
import { apiClient } from './apiClient.js';

const abortControllers = new Map();

/**
 * Handles a generic AI task, including state management, API calls, and error handling.
 * @param {string} uuid - The unique identifier for the match/conversation.
 * @param {number} generationId - The unique identifier for this specific generation request.
 * @param {object} payload - The payload to send to the AI API.
 * @param {chrome.runtime.Port} port - The port to communicate with the popup.
 * @param {object} [options={}] - Optional parameters.
 * @param {function(string): string} [options.onSuccess] - A function to process the raw AI response text.
 * @param {object} [options.logData] - Additional data to log for performance tracking.
 */
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

        let responseText;
        switch (settings.ai_provider) {
            case 'openai':
                responseText = await fetchOpenAIResponse(settings.local_llama_api_key, payload, settings, controller.signal);
                break;
            case 'anthropic':
                responseText = await fetchAnthropicResponse(settings.local_llama_api_key, payload, settings, controller.signal);
                break;
            default:
                responseText = await fetchLocalLlamaResponse(settings.local_llama_api_key, payload, settings, controller.signal);
        }

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

/**
 * Fetches a response from the OpenAI API.
 * @param {string} apiKey - The OpenAI API key.
 * @param {object} payload - The request payload.
 * @param {object} settings - The application settings.
 * @param {AbortSignal} signal - The abort signal for the request.
 * @returns {Promise<string>} The AI's response text.
 */
async function fetchOpenAIResponse(apiKey, payload, settings, signal) {
    const { ai_model, openai_api_url } = settings;
    const responseData = await apiClient(openai_api_url, 'POST', {
        model: ai_model,
        messages: payload.messages,
        temperature: payload.temperature,
        top_p: payload.top_p,
    }, {
        'Authorization': `Bearer ${apiKey}`
    }, signal);

    if (!responseData.choices?.[0]?.message?.content) {
        throw new Error('OpenAI API returned an unexpected response format.');
    }

    return responseData.choices[0].message.content.trim();
}

/**
 * Fetches a response from the Anthropic API.
 * @param {string} apiKey - The Anthropic API key.
 * @param {object} payload - The request payload.
 * @param {object} settings - The application settings.
 * @param {AbortSignal} signal - The abort signal for the request.
 * @returns {Promise<string>} The AI's response text.
 */
async function fetchAnthropicResponse(apiKey, payload, settings, signal) {
    const { ai_model, anthropic_api_url, anthropic_api_version, anthropic_max_tokens } = settings;
    const responseData = await apiClient(anthropic_api_url, 'POST', {
        model: ai_model,
        messages: payload.messages,
        temperature: payload.temperature,
        top_p: payload.top_p,
        max_tokens: anthropic_max_tokens,
    }, {
        'x-api-key': apiKey,
        'anthropic-version': anthropic_api_version
    }, signal);

    if (!responseData.content?.[0]?.text) {
        throw new Error('Anthropic API returned an unexpected response format.');
    }

    return responseData.content[0].text.trim();
}

/**
 * Builds the final payload for the AI API call.
 * @param {object} data - The data required to generate the prompts.
 * @returns {object} The final payload object.
 */
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

/**
 * Cleans the raw AI response by removing stop tokens.
 * @param {string} rawResponse - The raw response text from the AI.
 * @returns {string} The cleaned response text.
 */
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

/**
 * Fetches a response from a local Llama-like API endpoint.
 * @param {string} apiKey - The API key (optional).
 * @param {object} payload - The payload to send to the API.
 * @param {object} settings - The application settings.
 * @param {AbortSignal} signal - The abort signal for the request.
 * @returns {Promise<string>} The content of the AI's response.
 */
async function fetchLocalLlamaResponse(apiKey, payload, settings, signal) {
    const { local_llama_url } = settings;
    const headers = {};
    if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const responseData = await apiClient(local_llama_url, 'POST', payload, headers);

    if (payload.response_format?.type === "json_object") {
        return responseData.choices[0].message.content;
    }
    if (!responseData.choices?.[0]?.message?.content) {
        throw new Error('Local server returned an unexpected response format.');
    }

    return responseData.choices[0].message.content.trim();
}

export { handleAITask, buildFinalPayload, cleanAIResponse, fetchLocalLlamaResponse };
