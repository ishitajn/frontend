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
};

export const MATCH_SPECIFIC_SETTINGS_KEYS = [
    'flirtyValue', 'lengthValue', 'linguisticStyle', 'emojiStrategy',
    'endWithQuestion', 'strictGoalOverride', 'geoContextToggle', 'newTopic',
    'customInstruction', 'lastResponse'
];

export const EMOJI_STRATEGIES = {
    'auto': 'Auto (Recommended)',
    'friendly': 'Friendly',
    'playful': 'Playful',
    'bold': 'Bold',
    'no_emoji': 'No Emoji'
};

export const USER_LOCATIONS = {
    'autodetect': {
        name: 'Auto-Detect Location'
    },
    'charlotte': {
        name: 'Charlotte, NC, USA',
        lat: 35.2271,
        lon: -80.8431,
        timeZone: 'America/New_York',
        country: 'United States'
    },
    'nyc': {
        name: 'New York, NY, USA',
        lat: 40.7128,
        lon: -74.0060,
        timeZone: 'America/New_York',
        country: 'United States'
    },
    'la': {
        name: 'Los Angeles, CA, USA',
        lat: 34.0522,
        lon: -118.2437,
        timeZone: 'America/Los_Angeles',
        country: 'United States'
    },
    'london': {
        name: 'London, UK',
        lat: 51.5072,
        lon: -0.1276,
        timeZone: 'Europe/London',
        country: 'United Kingdom'
    },
    'sydney': {
        name: 'Sydney, Australia',
        lat: -33.8688,
        lon: 151.2093,
        timeZone: 'Australia/Sydney',
        country: 'Australia'
    },
};
