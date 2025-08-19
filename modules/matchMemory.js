async function generateCacheHash(history, profile) {
    if ((!history || history.length === 0) && !profile)
        return 'empty';
    const combinedString = JSON.stringify(history) + JSON.stringify(profile);
    const encoder = new TextEncoder();
    const data = encoder.encode(combinedString);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

class MatchMemory {
    async _getMatchUUID(name, profile) {
        const safeName = name || 'unknown_name';
        const safeProfile = profile || 'no_profile';
        const identifier = `${safeName.trim()}-${safeProfile.trim().substring(0, 100)}`;
        const encoder = new TextEncoder();
        const data = encoder.encode(identifier);
        const hashBuffer = await crypto.subtle.digest('SHA-1', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    async getMatchProfile(uuid) {
        const key = `match_${uuid}`;
        const result = await chrome.storage.local.get(key);
        return result[key] || null;
    }
    async saveMatchProfile(uuid, profileData) {
        const key = `match_${uuid}`;
        await chrome.storage.local.set({
            [key]: profileData
        });
    }
    createInitialProfile(scrapedData) {
        return {
            uuid: null,
            metadata: {
                theirName: scrapedData.theirName,
                theirProfile: scrapedData.theirProfile,
                matchLocation: scrapedData.matchLocation,
                firstSeen: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
            },
            memory: {
                dateArcPhase: 'rapport',
                topics: {},
                insideJokes: [],
                avoidedTopics: [],
                questionHistory: [],
                geoContextData: null,
                lastCacheHash: null,
            },
            conversationHistory: scrapedData.conversationHistory,
            analysis: null,
        };
    }
}

export { generateCacheHash };
export const memoryManager = new MatchMemory();
