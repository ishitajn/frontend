import { DEBUG } from './debug.js';

export async function apiClient(url, method = 'GET', body = null, headers = {}) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed with status ${response.status}: ${errorText}`);
        }
        return response.json();
    } catch (error) {
        DEBUG.error('API_CLIENT', `API request to ${url} failed`, error);
        throw error;
    }
}
