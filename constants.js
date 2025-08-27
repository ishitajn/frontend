// ===================================================================================
// SECTION 1: CORE ENUMS AND OPTIONS
// ===================================================================================

export const LINGUISTIC_STYLES = ['auto', 'casual', 'charming', 'direct', 'intellectual', 'mysterious', 'playful', 'poetic', 'sarcastic', 'sexual', 'witty'].sort((a, b) => a === 'auto' ? -1 : b === 'auto' ? 1 : a.localeCompare(b));

export const EMOJI_STRATEGIES = {
    'auto': 'Auto (Recommended)',
    'friendly': 'Friendly',
    'playful': 'Playful',
    'bold': 'Bold',
    'no_emoji': 'No Emoji'
};

export const USER_LOCATIONS = {
    'autodetect': { name: 'Auto-Detect Location' },
    'charlotte': { name: 'Charlotte, NC, USA', lat: 35.2271, lon: -80.8431, timeZone: 'America/New_York', country: 'United States' },
    'nyc': { name: 'New York, NY, USA', lat: 40.7128, lon: -74.0060, timeZone: 'America/New_York', country: 'United States' },
    'la': { name: 'Los Angeles, CA, USA', lat: 34.0522, lon: -118.2437, timeZone: 'America/Los_Angeles', country: 'United States' },
    'london': { name: 'London, UK', lat: 51.5072, lon: -0.1276, timeZone: 'Europe/London', country: 'United Kingdom' },
    'sydney': { name: 'Sydney, Australia', lat: -33.8688, lon: 151.2093, timeZone: 'Australia/Sydney', country: 'Australia' },
};

export const DATE_ARC_PHASES = ['Rapport', 'Escalation', 'Planning','Fading'];

export const CONVERSATION_STATES = ['OPENER', 'EARLY_CONVO', 'ACTIVE_CONVO', 'REENGAGING_DAY', 'REENGAGING_WEEK', 'REENGAGING_MONTH'];

export const INTENT_OPTIONS = ['Questioning', 'Planning', 'Humor', 'Storytelling', 'Flirting', 'Sexual'];

export const FLIRT_LEVEL_OPTIONS = ['None', 'Neutral', 'Friendly', 'Warm', 'Flirty', 'Very Flirty', 'Daring', 'Sexual'];

export const PACE_OPTIONS = ['Slow', 'Steady', 'Fast'];

export const ENGAGEMENT_SCORE_OPTIONS = ['Unknown', 'Low', 'Medium', 'High', 'Very High'];


// ===================================================================================
// SECTION 2: STORAGE AND SETTINGS KEYS
// ===================================================================================

export const DEFAULTS = {
    analysisApiTimeout: 600000, // 10 minutes
    flirtyValue: 60,
    lengthValue: 30,
    linguisticStyle: 'auto',
    emojiStrategy: 'no_emoji',
    modelTemperature: 0.5,
    topPValue: 1.0,
    endWithQuestion: false,
    strictGoalOverride: false,
    geoContextToggle: false,
    newTopic: false,
    debugModeEnabled: false,
    userLocationChoice: 'charlotte',
    customInstruction: '',
    lastResponse: '',
    myProfile: `Jay, 35 – 6'0", Vice President at a financial institution, graduate degree from Illinois State University. Driven and grounded, with a strong career focus but a playful side—loves trying new cuisines and cooking for others. Enjoys occasional adventure, meaningful conversations, and believes in making a difference through small actions. Social drinker, non-smoker, exercises sometimes. Prefers genuine connection and meeting in person over endless chatting.`,
    local_llama_url: 'http://localhost:8080/v1/chat/completions',
    local_model_name: 'llama3:latest',
    local_llama_api_key: '',
    analysis_url: 'http://10.0.0.24:8000/analyze',
    analysis_type: 'local',
};

export const MATCH_SPECIFIC_SETTINGS_KEYS = [
    'flirtyValue', 'lengthValue', 'linguisticStyle', 'emojiStrategy',
    'endWithQuestion', 'strictGoalOverride', 'geoContextToggle', 'newTopic',
    'customInstruction', 'lastResponse'
];

// ===================================================================================
// SECTION 3: UI SELECTORS DESCRIPTIONS
// ===================================================================================

export function getToneDescription(value) {
    const levels = {
        100: 'Be explicitly sexual and daring.',
        90: 'Be intensely flirty and bold.',
        80: 'Be very flirty and confident.',
        70: 'Be flirty and playful.',
        60: 'Be moderately flirty and engaging.',
        50: 'Be lightly flirty and casually engaging.',
        40: 'Be friendly and approachable.',
        30: 'Be warm and relaxed.',
        20: 'Be polite and friendly.',
        10: 'Be polite and straightforward.',
        0: 'Be completely neutral and formal.'
    };
    return levels[Object.keys(levels).reverse().find(k => value >= k) || 0];
}

export function getLengthDescription(value) {
    const levels = {
        100: 'Strictly 8+ sentences (a manifesto).',
        90: 'Strictly 6–7 sentences (epic).',
        80: 'Strictly 5–6 sentences (very long).',
        70: 'Strictly 4–5 sentences (long).',
        60: 'Strictly 3–4 sentences (moderately long).',
        50: 'Strictly 2–3 sentences (medium).',
        40: 'Strictly 2 sentences (moderately short).',
        30: 'Strictly 1–2 sentences (short).',
        20: 'Strictly one full sentence (very short).',
        10: 'Strictly 5–10 words (ultra short).',
        0: 'Strictly 2–5 words (micro).'
    };
    return levels[Object.keys(levels).reverse().find(k => value >= k) || 0];
}

export function getStyleDescription(style, analysis) {
    if (style === 'auto' && analysis?.lastMessageAnalysis?.suggestedResponseStyle) {
        return `Strictly adopt a ${analysis.lastMessageAnalysis.suggestedResponseStyle} style.`;
    }
    const styles = {
        'witty': 'Write with a witty and humorous style.',
        'intellectual': 'Write with an intellectual and deep style.',
        'playful': 'Write with a playful and teasing style.',
        'direct': 'Write with a direct and confident style.',
        'poetic': 'Write with a poetic and romantic style.',
        'sexual': 'Write with a bold, provocative and sexual style.',
        'sarcastic': 'Write with a sarcastic and sharp style.',
        'charming': 'Write with a charming and suave style.',
        'casual': 'Write with a casual and laid-back style.',
        'mysterious': 'Write with a mysterious and intriguing style.'
    };
    return styles[style] || 'Write with a natural and conversational style.';
}

export function getEmojiInstruction(strategy, flirtyValue, linguisticStyle) {
    if (!strategy || strategy === 'no_emoji')
        return '';
    const autoDesc = () => {
        if (['intellectual', 'poetic', 'sarcastic'].includes(linguisticStyle))
            return 'Avoid emojis almost entirely.';
        if (flirtyValue >= 80)
            return 'Feel free to use 1-3 bold or suggestive emojis (e.g., 😏, 😈, 🔥).';
        if (flirtyValue >= 60)
            return 'Incorporate one or two well-placed, playful emojis (e.g., 😉, 😂, 😜).';
        if (flirtyValue >= 40)
            return 'You may use a single, simple, and friendly emoji (e.g., 🙂, 👍).';
        if (['playful', 'witty', 'charming'].includes(linguisticStyle))
            return 'You can use one well-placed emoji to add personality.';
        return 'Be very conservative with emojis.';
    };
    const map = {
        'auto': autoDesc(),
        'friendly': 'You may use a single, simple, and friendly emoji (e.g., 🙂, 👍).',
        'playful': 'Incorporate one or two well-placed, playful emojis (e.g., 😉, 😂).',
        'bold': 'Feel free to use 1-3 bold or suggestive emojis (e.g., 😏, 😈, 🔥).'
    };
    return map[strategy] || '';
}


// ===================================================================================
// SECTION 4: UI SELECTORS (DOM IDs)
// ===================================================================================

export const SELECTORS = {
    loadingView: 'loading-view',
    mainView: 'main-view',
    settingsView: 'settings-view',
    errorView: 'error-view',
    errorTitle: 'error-title',
    errorMessage: 'error-message',
    responseArea: 'response-area',
    generateBtn: 'generate-btn',
    copyBtn: 'copy-btn',
    cancelBtn: 'cancel-btn',
    customInstruction: 'custom-instruction',
    clearResponseBtn: 'clear-response-btn',
    clearInstructionBtn: 'clear-instruction-btn',
    flirtySlider: 'flirty-slider',
    flirtyValueLabel: 'flirty-value-label',
    lengthSlider: 'length-slider',
    lengthValueLabel: 'length-value-label',
    emojiStrategySelect: 'emoji-strategy-select',
    conversationStatusDisplay: 'conversation-status-display',
    questionToggleCheckbox: 'question-toggle-checkbox',
    strictGoalToggle: 'strict-goal-toggle',
    geoContextToggle: 'geo-context-toggle',
    newTopicToggle: 'new-topic-toggle',
    settingsBtn: 'settings-btn',
    backBtn: 'back-btn',
    masterResetBtn: 'master-reset-btn',
    resetMatchBtn: 'reset-match-btn',
    temperatureSlider: 'temperature-slider',
    temperatureValueLabel: 'temperature-value-label',
    topPSlider: 'top-p-slider',
    topPValueLabel: 'top-p-value-label',
    linguisticStyleSelect: 'linguistic-style-select',
    debugModeToggle: 'debug-mode-toggle',
    localLlamaUrl: 'localLlamaUrl',
    localLlamaApiKey: 'localLlamaApiKey',
    localModelName: 'localModelName',
    analysisUrl: 'analysisUrl',
    analysisType: 'analysisType',
    testApiBtn: 'test-api-btn',
    testAnalysisBtn: 'test-analysis-btn',
    tabsContainer: 'tabs',
    userLocationSelect: 'user-location-select',
    myProfileSetting: 'my-profile-setting',
    infoTooltip: 'info-tooltip',
    responseTimer: 'response-timer',
    geoContextCard: 'geo-context-card',
    geoUserName: 'geo-user-name',
    geoMatchName: 'geo-match-name',
    userLocation: 'user-location',
    matchLocation: 'match-location',
    userTime: 'user-time',
    matchTime: 'match-time',
    userTimeOfDay: 'user-time-of-day',
    matchTimeOfDay: 'match-time-of-day',
    userTimezone: 'user-timezone',
    matchTimezone: 'match-timezone',
    userCountry: 'user-country',
    matchCountry: 'match-country',
    timeDifference: 'time-difference',
    distanceInfo: 'distance-info',
    countryDifference: 'country-difference',
    refinementActions: 'refinement-actions',
};

// ===================================================================================
// SECTION 5: UI VIEW SCHEMAS
// ===================================================================================

export const ANALYSIS_VIEW_SCHEMA = [
    { label: 'Conversation State', path: 'conversationState', type: 'select', options: () => CONVERSATION_STATES },
    { label: 'Suppress Greeting?', path: 'suppressGreeting', type: 'checkbox' },
    { type: 'divider', label: 'Last Message Subtext (Local)' },
    { label: 'Is Direct Question?', path: 'lastMessageAnalysis.isDirectQuestion', type: 'checkbox' },
    { label: 'Is Sarcastic?', path: 'lastMessageAnalysis.isSarcastic', type: 'checkbox' },
    { label: 'Is Ambiguous?', path: 'lastMessageAnalysis.isAmbiguous', type: 'checkbox' },
    { label: 'Is Vulnerable?', path: 'lastMessageAnalysis.isVulnerable', type: 'checkbox' },
    { label: 'Intents', path: 'lastMessageAnalysis.intents', type: 'multiselect', options: () => INTENT_OPTIONS },
    { type: 'divider', label: 'Overall Analysis (Backend)' },
    { label: 'Valence (Sentiment)', path: 'conversationAnalysis.lastMessageAnalysis.valence', type: 'slider', min: -1, max: 1, step: 0.1, labels: { '-1': 'Very Negative', '-0.5': 'Negative', '-0.1': 'Neutral', '0.5': 'Positive', '1': 'Very Positive' } },
    { label: 'Arousal (Engagement)', path: 'conversationAnalysis.lastMessageAnalysis.arousal', type: 'slider', min: -1, max: 1, step: 0.1, labels: { '-1': 'Bored/Calm', '-0.5': 'Low Energy', '-0.1': 'Neutral', '0.5': 'Excited', '1': 'Agitated' } },
    { label: 'Engagement Score', path: 'conversationAnalysis.lastMessageAnalysis.recent_engagement_score', type: 'select', options: () => ENGAGEMENT_SCORE_OPTIONS },
    { label: 'Flirtation Level', path: 'conversationAnalysis.flirtation_level', type: 'select', options: () => FLIRT_LEVEL_OPTIONS },
    { label: 'Pace', path: 'conversationAnalysis.pace', type: 'select', options: () => PACE_OPTIONS },
];

export const TOPIC_ANALYSIS_VIEW_SCHEMA = [
    { label: 'Date Arc Phase', path: 'memory.dateArcPhase', type: 'select', options: () => DATE_ARC_PHASES },
    { label: 'Inside Jokes', path: 'memory.insideJokes', type: 'textarea' },
    { label: 'Avoided Topics', path: 'memory.avoidedTopics', type: 'textarea' },
    { label: 'Question History', path: 'memory.questionHistory', type: 'textarea' },
];

export const CONV_ANALYSIS_VIEW_SCHEMA = [
    { type: 'dynamic_table', path: 'conversationAnalysis.conversation_analysis', title: 'Backend Conversation Analysis' }
    { type: 'divider', label: 'Power Dynamics (Backend)' },
    { label: 'Summary', path: 'conversationAnalysis.power_dynamics.summary', type: 'text' },
    { label: 'User Is Leading?', path: 'conversationAnalysis.power_dynamics.user_is_leading', type: 'checkbox' },
];
