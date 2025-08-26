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
