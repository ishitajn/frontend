import { DEBUG } from './debug.js';
import spacetime from '../lib/spacetime.min.js';
import informal from '../lib/spacetime-informal.min.js';

spacetime.extend(informal);

const timezoneCache = new Map();
const geocodeCache = new Map();

import { apiClient } from './apiClient.js';
import { DEFAULTS } from './config.js';

async function fetchTimezoneFromCoords(lat, lon) {
    const key = `${lat},${lon}`;
    if (timezoneCache.has(key)) {
        return timezoneCache.get(key);
    }

    const url = `${DEFAULTS.time_api_url}?latitude=${lat}&longitude=${lon}`;
    try {
        const data = await apiClient(url);
        const result = {
            timeZone: data?.timeZone || null,
            country: data?.countryName || null,
        };
        timezoneCache.set(key, result);
        return result;
    } catch (error) {
        DEBUG.error('TIMEAPI', 'Failed to fetch timezone', error);
        return null;
    }
}

async function geocodeLocation(locationString) {
    if (!locationString || locationString.toLowerCase() === 'not specified')
        return null;

    const key = locationString.toLowerCase();
    if (geocodeCache.has(key)) {
        return geocodeCache.get(key);
    }

    const url = `${DEFAULTS.nominatim_api_url}?q=${encodeURIComponent(locationString)}&format=json&limit=1&extratags=1&addressdetails=1`;
    try {
        const data = await apiClient(url);
        if (data && data.length > 0) {
            const { lat, lon, display_name, extratags, address } = data[0];
            const result = {
                lat: parseFloat(lat),
                lon: parseFloat(lon),
                displayName: display_name,
                timeZone: extratags?.timezone || null,
                country: address?.country || null,
                country_code: address?.country_code || null
            };
            geocodeCache.set(key, result);
            return result;
        }
        return null;
    } catch (error) {
        DEBUG.error('GEOCODE', `Failed to geocode: ${locationString}`, error);
        return null;
    }
}

export { fetchTimezoneFromCoords, geocodeLocation };
