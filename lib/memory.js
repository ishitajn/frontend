export class MatchMemory {
    /**
     * Generates a deterministic UUID for a match based on their name and profile data.
     * This ensures the same match is always identified with the same UUID.
     * @param {string} name - The match's name.
     * @param {string | object} profile - The match's profile text or data.
     * @returns {Promise<string>} A SHA-1 hash representing the match's unique ID.
     */
    async _getMatchUUID(name, profile) {
        const safeName = (name || 'unknown_name').trim();

        let profileString;
        if (typeof profile === 'string') {
            profileString = profile.trim();
        } else if (typeof profile === 'object' && profile !== null) {
            // Sort keys to ensure consistent hash for the same profile data
            const sortedProfile = Object.keys(profile).sort().reduce(
                (obj, key) => {
                    // Ensure nested values are also serializable
                    const value = profile[key];
                    obj[key] = (typeof value === 'object' && value !== null) ? JSON.stringify(value) : value;
                    return obj;
                },
                {}
            );
            profileString = JSON.stringify(sortedProfile);
        } else {
            profileString = 'no_profile';
        }

        const identifier = `${safeName}-${profileString}`;
        const encoder = new TextEncoder();
        const data = encoder.encode(identifier);
        const hashBuffer = await crypto.subtle.digest('SHA-1', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Retrieves a full match profile from storage by UUID.
     * @param {string} uuid - The match's unique identifier.
     * @returns {Promise<object|null>} The match profile object or null if not found.
     */
    async getMatchProfile(uuid) {
        const key = `match_${uuid}`;
        const result = await chrome.storage.local.get(key);
        return result[key] || null;
    }

    /**
     * Saves a match profile to storage.
     * @param {string} uuid - The match's unique identifier.
     * @param {object} profileData - The full profile object to save.
     */
    async saveMatchProfile(uuid, profileData) {
        const key = `match_${uuid}`;
        await chrome.storage.local.set({ [key]: profileData });
    }

    /**
     * Creates a new, initial profile structure from scraped data.
     * @param {object} scrapedData - Data scraped from the dating app page.
     * @returns {object} A new match profile object.
     */
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
            },
            conversationHistory: scrapedData.conversationHistory,
            analysis: null,
        };
    }
}