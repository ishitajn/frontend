import { DEBUG } from './debug.js';

export const DEFAULTS = {
    local_llama_url: 'http://localhost:8080/v1/chat/completions',
    local_model_name: 'llama3:latest',
    local_llama_api_key: '',
};

const getGenerationStateKey = (uuid) => `generationState_${uuid}`;

export async function getGenerationState(uuid) {
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

export async function setGenerationState(uuid, newState, port) {
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
