import { DEBUG } from './debug.js';
import { performanceLogger } from './performanceLogger.js';
import { generatePrompts } from './prompts.js';
import { getGenerationState, setGenerationState, DEFAULTS } from './state.js';

const abortControllers = new Map();

async function handleAITask(uuid, generationId, nlpPayload, port, options = {}) {
    if (abortControllers.has(uuid)) {
        abortControllers.get(uuid).abort("A new generation request was started.");
    }
    const controller = new AbortController();
    abortControllers.set(uuid, controller);

    await setGenerationState(uuid, { isGenerating: true, response: null, error: null, generationId, generationStartTime: Date.now() }, port);

    try {
        const storedSettings = await chrome.storage.local.get(Object.keys(DEFAULTS));
        const settings = { ...DEFAULTS, ...storedSettings };

        const { system_prompt, user_prompt } = generatePrompts(nlpPayload);
        const payload = {
            model: settings.local_model_name,
            messages: [
                { role: "system", content: system_prompt },
                { role: "user", content: user_prompt }
            ],
            temperature: 0.7, // These could be made configurable later
            top_p: 1.0,
        };

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

        // Logging can be re-enabled later if needed
        // if (options.logData) {
        //     await performanceLogger.log({ ...options.logData, response: finalResponse });
        // }

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

async function fetchOpenAIResponse(apiKey, payload, settings, signal) {
    const { ai_model } = settings;
    const responseData = await apiClient('https://api.openai.com/v1/chat/completions', 'POST', {
        model: ai_model,
        messages: payload.messages,
        temperature: payload.temperature,
        top_p: payload.top_p,
    }, {
        'Authorization': `Bearer ${apiKey}`
    });

    if (!responseData.choices?.[0]?.message?.content) {
        throw new Error('OpenAI API returned an unexpected response format.');
    }

    return responseData.choices[0].message.content.trim();
}

async function fetchAnthropicResponse(apiKey, payload, settings, signal) {
    const { ai_model } = settings;
    const responseData = await apiClient('https://api.anthropic.com/v1/messages', 'POST', {
        model: ai_model,
        messages: payload.messages,
        temperature: payload.temperature,
        top_p: payload.top_p,
        max_tokens: 1024,
    }, {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
    });

    if (!responseData.content?.[0]?.text) {
        throw new Error('Anthropic API returned an unexpected response format.');
    }

    return responseData.content[0].text.trim();
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

import { apiClient } from './apiClient.js';

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

export { handleAITask, cleanAIResponse, fetchLocalLlamaResponse };
