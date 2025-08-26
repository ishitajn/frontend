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

export const DATE_ARC_PHASES = ['rapport', 'escalation', 'planning', 'post_date', 'fading'];

export const CONVERSATION_STATES = ['OPENER', 'EARLY_CONVO', 'ACTIVE_CONVO', 'REENGAGING_DAY', 'REENGAGING_WEEK', 'REENGAGING_MONTH'];

export const INTENT_OPTIONS = ['questioning', 'planning', 'reacting_to_humor', 'storytelling', 'flirting_or_sexual'];

export const FLIRT_LEVEL_OPTIONS = ['none', 'low', 'medium', 'high', 'very high'];

export const PACE_OPTIONS = ['slow', 'steady', 'fast'];


// ===================================================================================
// SECTION 2: STORAGE AND SETTINGS KEYS
// ===================================================================================

export const DEFAULTS = {
    flirtyValue: 60,
    lengthValue: 30,
    linguisticStyle: 'auto',
    emojiStrategy: 'no_emoji',
    modelTemperature: 0.5,
    topPValue: 1.0,
    endWithQuestion: false,
    strictGoalOverride: false,
    geoContextToggle: true,
    newTopic: false,
    debugModeEnabled: false,
    userLocationChoice: 'autodetect',
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
// SECTION 3: UI SELECTORS (DOM IDs)
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
    refinementActions: 'refinement-actions',
};
