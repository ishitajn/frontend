// src/prompts/contextPrompt.js

/**
 * Builds the contextual part of the user prompt.
 * This version simplifies complex instructions for smaller models.
 *
 * @param {object} data - The dynamic data for the current request.
 * @param {import('../conversationHelpers.js').ConversationAnalysis} conversationAnalysis - The full analysis of the conversation.
 * @returns {string} The fully assembled context prompt.
 */
export function buildContextPrompt(data, conversationAnalysis) {
    const { state, lastMessageAnalysis } = conversationAnalysis;

    const { theirProfile, myProfile, conversationHistory, myName, theirName, geoContextData, includeGeoContext, chatMessageTemplate } = data;

    // --- 1. Metadata Generation (with simplified instruction) ---
    const geoContext = (includeGeoContext && geoContextData) ? `
- **GEO-TEMPORAL CONTEXT:** (Use this info for planning/travel topics only. Otherwise, ignore it.)
  - Your (User's) Time of Day: ${geoContextData.userTimeOfDay || 'N/A'} in ${geoContextData.userTimezone || 'N/A'}
  - Their (Match's) Time of Day: ${geoContextData.matchTimeOfDay || 'N/A'} in ${geoContextData.matchTimeZoneName || 'N/A'}
  ${geoContextData.distance ? `- Approximate Distance: ${geoContextData.distance.miles} miles (${geoContextData.distance.km} km)` : ''}
  ${geoContextData.timeZoneDifference !== null ? `- Time Difference: ${geoContextData.timeZoneDifference} hour(s)` : ''}
  ${geoContextData.countryDifference ? `- Country Difference: ${geoContextData.countryDifference}` : ''}
` : '';

    const metadataSection = geoContext ? `
--- CONVERSATIONAL METADATA ---${geoContext}
` : '';

    let historySection = '';
    if (state !== 'OPENER') {
        const formatHistoryForPrompt = (history) => {
            // --- SCENARIO-BASED LOGIC: Add a contextual notice based on the last message ---
            let contextualNotice = '';
            if (lastMessageAnalysis?.isDirectQuestion) {
                contextualNotice = `(NOTE: The match's last message contains a question. Answer it.)\n`;
            } else if (lastMessageAnalysis?.isLowEffort) {
                contextualNotice = `(NOTE: The match's last reply was very short. Your message needs to re-engage them.)\n`;
            }

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
                const roleName = msg.role === 'assistant' ? (theirName || 'Match') : (myName || 'You');
                if (chatMessageTemplate) {
                    return chatMessageTemplate
                        .replace('{role}', roleName)
                        .replace('{content}', msg.content);
                }
                // Fallback to original format
                const prefix = `${roleName}:`;
                return `[${msg.date}] ${prefix} ${msg.content}`;
            }).join('\n').trim();

            return contextualNotice + timeGapNotice + formattedMessages;
        };
        historySection = `--- CONVERSATION HISTORY ---\n${formatHistoryForPrompt(conversationHistory)}`;
    }

    // --- 3. Conditional Profile Inclusion (Logic is solid, no changes needed) ---
    let profileSection = '';
    switch (state) {
    case 'OPENER':
        profileSection = `
--- THEIR PROFILE (PRIMARY SOURCE) ---
- **MATCH'S PROFILE (${theirName || 'THE MATCH'}):** ${theirProfile || 'Not provided.'}

--- MY PROFILE (FOR CONTEXT) ---
- **MY PROFILE (${myName || 'THE USER'}):** ${myProfile || 'Not provided.'}
`;
        break;
    case 'EARLY_CONVO':
        profileSection = `
--- PROFILE CONTEXT (USE FOR COMMON GROUND) ---
- **MY PROFILE (${myName || 'THE USER'}):** ${myProfile || 'Not provided.'}
- **MATCH'S PROFILE (${theirName || 'THE MATCH'}):** ${theirProfile || 'Not provided.'}
`;
        break;
    case 'REENGAGING_DAY':
    case 'REENGAGING_WEEK':
    case 'REENGAGING_MONTH':
        profileSection = `
--- THEIR PROFILE (PRIMARY SOURCE FOR NEW TOPIC) ---
- **MATCH'S PROFILE (${theirName || 'THE MATCH'}):** ${theirProfile || 'Not provided.'}
`;
        break;
    case 'ACTIVE_CONVO':
        profileSection = `
--- PROFILE CONTEXT (SECONDARY - FOR NEW TOPICS ONLY) ---
- **MATCH'S PROFILE (${theirName || 'THE MATCH'}):** ${theirProfile || 'Not provided.'}
`;
        break;
    }

    // --- 4. Build Strategic & Memory Sections ---
    const { memory, suppressGreeting } = conversationAnalysis;

    const memoryNotes = [];
    if (memory?.dateArcPhase === 'planning')
        memoryNotes.push('**STRATEGIC CONTEXT: PLANNING PHASE.** Focus on confidently solidifying a date.');
    else if (memory?.dateArcPhase === 'escalation')
        memoryNotes.push('**STRATEGIC CONTEXT: ESCALATION PHASE.** Build sexual tension and transition towards planning a date.');
    if (memory?.insideJokes?.length > 0)
        memoryNotes.push(`**STRATEGIC CALLBACK:** You can reference this inside joke: "${memory.insideJokes.slice(-1)[0]}"`);
    const goodTopics = Object.entries(memory?.topics || {}).filter(([, data]) => data.score > 0.5).sort((a, b) => b[1].score - a[1].score).map(([topic]) => topic);
    if (goodTopics.length > 0)
        memoryNotes.push(`**GOOD TOPICS:** The match responds well to: ${goodTopics.slice(0, 2).join(', ')}.`);
    if (memory?.questionHistory?.length > 0)
        memoryNotes.push(`**AVOID REPEATING:** You already asked about: "${memory.questionHistory.slice(-1)[0]}".`);

    const memorySection = memoryNotes.length > 0 ? `--- MEMORY & STRATEGY (Creative Fuel) ---\n${memoryNotes.join('\n')}` : '';

    const strategicNotes = [];
    if (suppressGreeting)
        strategicNotes.push('**CRITICAL PROTOCOL: NO GREETING.** A greeting was already exchanged today.');
    if (state.startsWith('REENGAGING'))
        strategicNotes.push('**CRITICAL PROTOCOL: RE-ENGAGEMENT DETECTED.** The conversation stalled. Revive it with a new, high-value message from their profile.');
    if (memory?.avoidedTopics?.length > 0)
        strategicNotes.push(`**CRITICAL PROTOCOL: AVOID THESE TOPICS.** The match has reacted negatively to: ${memory.avoidedTopics.join(', ')}.`);

    if (lastMessageAnalysis) {
        if (lastMessageAnalysis.isSarcastic)
            strategicNotes.push('**CRITICAL PROTOCOL: SARCASM DETECTED.** Do not take their last statement literally. Respond to the underlying sentiment.');
        if (lastMessageAnalysis.intents?.includes('flirting_or_sexual'))
            strategicNotes.push('**STRATEGIC NOTE: SEXUAL TENSION DETECTED.** Match their energy confidently. This is a green light for sexual escalation.');
        if (lastMessageAnalysis.intents?.includes('questioning'))
            strategicNotes.push(`**CRITICAL PROTOCOL: ANSWER THE QUESTION.** The match asked a question. You MUST answer it.`);
        if (lastMessageAnalysis.isAmbiguous)
            strategicNotes.push('**STRATEGIC NOTE: AMBIGUITY DETECTED.** Convert their vague positive response into a concrete plan.');
        if (lastMessageAnalysis.intents?.includes('planning'))
            strategicNotes.push('**STRATEGIC NOTE: LOGISTICS SIGNAL DETECTED.** Move towards solidifying plans.');
        if (lastMessageAnalysis.isVulnerable)
            strategicNotes.push('**CRITICAL PROTOCOL: VULNERABILITY DETECTED.** Respond with warmth, validation, and support.');
        if (lastMessageAnalysis.valence < -0.5)
            strategicNotes.push('**CRITICAL PROTOCOL: NEGATIVE TONE DETECTED.** Adjust your tone to be more supportive and empathetic.');
        if (lastMessageAnalysis.isLowEffort)
            strategicNotes.push('**STRATEGIC NOTE: LOW-EFFORT REPLY DETECTED.** Their last message was short. Your reply needs to be more engaging to carry the conversation.');
    }
    const strategicSection = strategicNotes.length > 0 ? `--- CRITICAL OVERRIDES & NOTES ---\n${strategicNotes.join('\n')}` : '';


    const { timeContext } = data;
    const timeContextInstruction = (timeContext && !['ACTIVE_CONVO', 'EARLY_CONVO'].includes(state)) ? `\n*   **Time Hint:** ${timeContext}` : '';

    const dynamicGuidelines = [];
    if (lastMessageAnalysis?.isVulnerable) {
        dynamicGuidelines.push('*   **BE SUPPORTIVE:** The match shared something personal or vulnerable. Respond with warmth and validation before doing anything else.');
    }
    if (lastMessageAnalysis?.valence < -0.5) {
        dynamicGuidelines.push('*   **EMPATHIZE:** The match seems upset or negative. Acknowledge their feelings with empathy.');
    }
    if (memory?.dateArcPhase === 'planning') {
        dynamicGuidelines.push('*   **SOLIDIFY PLANS:** The conversation is in the planning phase. Be direct and confident about logistics to get the date scheduled.');
    }
    if (memory?.dateArcPhase === 'escalation') {
        dynamicGuidelines.push('*   **BUILD TENSION:** The conversation is in the escalation phase. Focus on building rapport and sexual tension.');
    }
    const guidelinesSection = dynamicGuidelines.length > 0 ? `--- DYNAMIC GUIDELINES ---\n${dynamicGuidelines.join('\n')}`: '';

    let hierarchySection = '';
    const reengagingHierarchy = `
**--- INFORMATION PRIORITY ---**
1.  **Their Profile:** Use this to find a new topic.
2.  **Conversation History:** Use this ONLY to see what you've already talked about.
`.trim();

    switch (state) {
        case 'OPENER':
            hierarchySection = `**--- INFORMATION PRIORITY ---**\n1.  **Their Profile:** Your source material for the message.`;
            break;
        case 'EARLY_CONVO':
            hierarchySection = `**--- INFORMATION PRIORITY ---**\n1.  **Their Last Message:** Reply to this first.\n2.  **Conversation History:** Use for context and callbacks.`;
            break;
        case 'REENGAGING_DAY':
        case 'REENGAGING_WEEK':
        case 'REENGAGING_MONTH':
            hierarchySection = reengagingHierarchy;
            break;
        case 'ACTIVE_CONVO':
        default:
            hierarchySection = `**--- INFORMATION PRIORITY ---**\n1.  **THEIR LAST MESSAGE:** Reply to this first.\n2.  **CONVERSATION HISTORY:** Your primary source material now.`;
            break;
    }


    // --- 5. Final Assembly ---
    return [
        metadataSection,
        historySection,
        profileSection,
        memorySection,
        strategicSection,
        guidelinesSection,
        hierarchySection,
    ].filter(Boolean).join('\n\n');
}