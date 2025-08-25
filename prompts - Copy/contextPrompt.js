// src/prompts/contextPrompt.js

/**
 * Builds the contextual part of the user prompt.
 * This version simplifies complex instructions for smaller models.
 *
 * @param {object} data - The dynamic data for the current request.
 * @param {boolean} [data.includeGeoContext] - A pre-calculated flag to include geo-context.
 * @param {'OPENER' | 'EARLY_CONVO' | 'ACTIVE_CONVO' | 'REENGAGING_DAY' | 'REENGAGING_WEEK' | 'REENGAGING_MONTH'} state - The current conversation state.
 * @returns {string} The fully assembled context prompt.
 */
export function buildContextPrompt(data, state) {
    const {
        theirProfile,
        myProfile,
        conversationHistory,
        myName,
        theirName,
        isVerified,
        timeSinceLastMessageInHours,
        geoContextData,
        includeGeoContext,
    } = data;

    // --- 1. Metadata Generation (with simplified instruction) ---
    const geoContext = (includeGeoContext && geoContextData) ? `
- **GEO-TEMPORAL CONTEXT:** (Use this info for planning/travel topics only. Otherwise, ignore it.)
  - Your (User's) Time: ${geoContextData.userTime} (${geoContextData.userTimeOfDay})
  - Their (Match's) Time: ~${geoContextData.matchTime} (${geoContextData.matchTimeOfDay}) in ${geoContextData.matchTimeZoneName}
  - Approximate Distance: ${geoContextData.distance.miles} miles (${geoContextData.distance.km} km)
  ${geoContextData.timeZoneDifference !== null ? `- Time Difference: ${geoContextData.timeZoneDifference} hour(s)` : ''}
  ${geoContextData.countryDifference ? `- Country Difference: ${geoContextData.countryDifference}` : ''}
` : '';

    const metadataSection = geoContext ? `
--- CONVERSATIONAL METADATA ---${geoContext}
` : '';

    let historySection = '';
    if (state !== 'OPENER') {
        const formatHistoryForPrompt = (history) => {
            let timeGapNotice = '';
            switch (state) {
                case 'REENGAGING_DAY':
                    timeGapNotice = `(Note: 1-7 day gap. You are in SOFT RE-ENGAGEMENT mode.)\n`;
                    break;
                case 'REENGAGING_WEEK':
                    timeGapNotice = `(Note: 1-4 week gap. You are in COLD RE-ENGAGEMENT mode.)\n`;
                    break;
                case 'REENGAGING_MONTH':
                    timeGapNotice = `(Note: 1+ month gap. You are in RESURRECTION mode.)\n`;
                    break;
            }
            
            const formattedMessages = history.map(msg => {
                const prefix = msg.role === 'assistant' ? `${theirName || 'Match'}:` : `${myName || 'You'}:`;
                return `[${msg.date}] ${prefix} ${msg.content}`;
            }).join('\n').trim();

            return timeGapNotice + formattedMessages;
        };
        historySection = `--- CONVERSATION HISTORY ---\n${formatHistoryForPrompt(conversationHistory)}`;
    }

    // --- 3. Conditional Profile Inclusion (Logic is solid, no changes needed) ---
    let profileSection = '';
    switch (state) {
        case 'OPENER':
            profileSection = `
--- THEIR PROFILE (PRIMARY SOURCE) ---
- **THEIR PROFILE (${theirName || 'THE MATCH'}):** ${theirProfile || 'Not provided.'}

--- MY PROFILE (FOR CONTEXT) ---
- **MY PROFILE (${myName || 'THE USER'}):** ${myProfile || 'Not provided.'}
`;
            break;
        case 'EARLY_CONVO':
            profileSection = `
--- PROFILE CONTEXT (USE FOR COMMON GROUND) ---
- **MY PROFILE (${myName || 'THE USER'}):** ${myProfile || 'Not provided.'}
- **THEIR PROFILE (${theirName || 'THE MATCH'}):** ${theirProfile || 'Not provided.'}
`;
            break;
        case 'REENGAGING_DAY':
        case 'REENGAGING_WEEK':
        case 'REENGAGING_MONTH':
            profileSection = `
--- THEIR PROFILE (PRIMARY SOURCE FOR NEW TOPIC) ---
- **THEIR PROFILE (${theirName || 'THE MATCH'}):** ${theirProfile || 'Not provided.'}
`;
            break;
        case 'ACTIVE_CONVO':
            profileSection = `
--- PROFILE CONTEXT (SECONDARY - FOR NEW TOPICS ONLY) ---
- **THEIR PROFILE (${theirName || 'THE MATCH'}):** ${theirProfile || 'Not provided.'}
`;
            break;
    }

    // --- 4. Final Assembly ---
    return [
        metadataSection,
        historySection,
        profileSection
    ].filter(Boolean).join('\n\n');
}