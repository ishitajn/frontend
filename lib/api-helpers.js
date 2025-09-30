import { DEBUG } from '../shared/constants.js';

export class WingmanError extends Error {
    constructor(code, message, details = '') {
        super(message);
        this.name = 'WingmanError';
        this.code = code;
        this.details = details;
    }

    toJSON() {
        return {
            isWingmanError: true,
            code: this.code,
            message: this.message,
            details: this.details,
        };
    }
}

export class PerformanceLogger {
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

export async function fetchTimezoneFromCoords(lat, lon) {
    const url = `https://timeapi.io/api/time/current/coordinate?latitude=${lat}&longitude=${lon}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`timeapi.io failed: ${response.status}`);
        const data = await response.json();
        return { timeZone: data?.timeZone || null, country: data?.countryName || null };
    } catch (error) {
        DEBUG.error('TIMEAPI', 'Failed to fetch timezone', error);
        return null;
    }
}

export async function geocodeLocation(locationString) {
    if (!locationString || locationString.toLowerCase() === 'not specified') return null;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationString)}&format=json&limit=1&extratags=1&addressdetails=1`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Nominatim API failed: ${response.status}`);
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

export async function callNlpApi(apiUrl, payload, signal) {
    if (!apiUrl) {
        throw new WingmanError('CONFIG_ERROR', 'The Analysis URL is not configured in settings.');
    }
    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal
        });
        if (!response.ok) {
            const errorBody = await response.text();
            throw new WingmanError('API_ERROR', 'The NLP analysis service returned an error.', { status: response.status, body: errorBody });
        }
        return await response.json();
    } catch (error) {
        if (error.name === 'AbortError') {
            DEBUG.log('NLP-API', 'NLP API call was aborted.');
        } else {
            DEBUG.error('NLP-API', 'Failed to call NLP API', error);
        }
        throw error;
    }
}

export function cleanAIResponse(rawResponse) {
    if (typeof rawResponse !== 'string' || !rawResponse) return '';
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

export async function fetchLocalLlamaResponse(apiKey, payload, settings, signal) {
    const { llm_url } = settings;
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    let response;
    try {
        response = await fetch(llm_url, { method: "POST", headers, body: JSON.stringify(payload), signal });
    } catch (error) {
        if (error.name === 'AbortError') throw error;
        throw new WingmanError('NETWORK_ERROR', `Could not connect to the AI server at ${llm_url}.`, { url: llm_url });
    }
    if (!response.ok) {
        let errorBody = await response.text();
        let errorMessage = errorBody;
        try {
            const errorJson = JSON.parse(errorBody);
            errorMessage = errorJson.error?.message || errorJson.error || JSON.stringify(errorJson);
        } catch (e) { /* Not JSON */ }
        throw new WingmanError('API_ERROR', `The local AI server returned an error: ${errorMessage}`, { status: response.status });
    }
    const responseData = await response.json();
    if (payload.response_format?.type === "json_object") {
        return responseData.choices[0].message.content;
    }
    if (!responseData.choices?.[0]?.message?.content) {
        throw new WingmanError('API_ERROR', 'The local AI server returned a response in an unexpected format.');
    }
    return responseData.choices[0].message.content.trim();
}

export function deepMerge(primary, fallback) {
    const isObject = (item) => (item && typeof item === 'object' && !Array.isArray(item));
    const output = { ...primary };
    for (const key in fallback) {
        if (Object.prototype.hasOwnProperty.call(fallback, key)) {
            if (output[key] === null || output[key] === undefined) {
                output[key] = fallback[key];
            } else if (isObject(output[key]) && isObject(fallback[key])) {
                output[key] = deepMerge(output[key], fallback[key]);
            }
        }
    }
    return output;
}

export function getFallbackKeys(merged, primary, parentKey = '') {
    const keys = new Set();
    const isObject = (item) => (item && typeof item === 'object' && !Array.isArray(item));
    for (const key in merged) {
        if (Object.prototype.hasOwnProperty.call(merged, key)) {
            const currentKey = parentKey ? `${parentKey}.${key}` : key;
            if (!Object.prototype.hasOwnProperty.call(primary, key) || primary[key] === null || primary[key] === undefined) {
                keys.add(currentKey);
            } else if (isObject(merged[key]) && isObject(primary[key])) {
                const nestedKeys = getFallbackKeys(merged[key], primary[key], currentKey);
                nestedKeys.forEach(k => keys.add(k));
            }
        }
    }
    return Array.from(keys);
}