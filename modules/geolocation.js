import { DEBUG } from './debug.js';
import spacetime from '../lib/spacetime.min.js';
import informal from '../lib/spacetime-informal.min.js';

spacetime.extend(informal);

const timezoneCache = new Map();
const geocodeCache = new Map();

async function fetchTimezoneFromCoords(lat, lon) {
    const key = `${lat},${lon}`;
    if (timezoneCache.has(key)) {
        return timezoneCache.get(key);
    }

    const url = `https://timeapi.io/api/time/current/coordinate?latitude=${lat}&longitude=${lon}`;
    try {
        const response = await fetch(url);
        if (!response.ok)
            throw new Error(`timeapi.io failed: ${response.status}`);
        const data = await response.json();
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

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationString)}&format=json&limit=1&extratags=1&addressdetails=1`;
    try {
        const response = await fetch(url);
        if (!response.ok)
            throw new Error(`Nominatim API failed: ${response.status}`);
        const data = await response.json();
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
