// popup.js (Re-architected for Manifest V3 Robustness with Heartbeat)
import { scrapeBumblePage, pasteTextIntoBumbleInput, scrapeTinderPage, pasteTextIntoTinderInput } from './content-scraper.js';
import { getToneDescription, getLengthDescription, getEmojiInstruction, getStyleDescription, LINGUISTIC_STYLES, DATE_ARC_PHASES } from './conversationHelpers.js';
import { showNlpModal, hideDebugModal } from './debug-modal.js';
import {
    setNestedValue,
    createSelect,
    createMultiSelect,
    createTextarea,
    createInput,
    createCheckbox,
    createSlider
} from './ui-components.js';

const DEBUG = {
    log: (category, message, data = null) => console.log(`[WINGMAN-POPUP-${category.toUpperCase()}] ${message}`, data ?? ''),
    error: (category, message, error = null) => console.error(`[WINGMAN-POPUP-${category.toUpperCase()}-ERROR] ${message}`, error ?? ''),
};

const DEFAULTS = {
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
    analysis_type: 'local',
    analysis_url: '',
    llm_url: 'http://localhost:8080/v1/chat/completions',
    local_model_name: 'llama3:latest',
    local_llama_api_key: '',
};

const MATCH_SPECIFIC_SETTINGS_KEYS = [
    'flirtyValue', 'lengthValue', 'linguisticStyle', 'emojiStrategy',
    'endWithQuestion', 'strictGoalOverride', 'geoContextToggle', 'newTopic',
    'customInstruction', 'lastResponse'
];

const CONVERSATION_STATES = ['OPENER', 'EARLY_CONVO', 'ACTIVE_CONVO', 'REENGAGING_DAY', 'REENGAGING_WEEK', 'REENGAGING_MONTH'];
const INTENT_OPTIONS = ['questioning', 'planning', 'reacting_to_humor', 'storytelling', 'flirting_or_sexual'];

const EMOJI_STRATEGIES = {
    'auto': 'Auto (Recommended)',
    'friendly': 'Friendly',
    'playful': 'Playful',
    'bold': 'Bold',
    'no_emoji': 'No Emoji'
};
const USER_LOCATIONS = {
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

const SELECTORS = {
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
    dateIdeaBtn: 'date-idea-btn',
    refinementActions: 'refinement-actions',
};

const state = {
    currentMatchUUID: null,
    currentViewId: SELECTORS.loadingView,
    pasterFn: null,
    isRefreshing: false,
    sessionMatchProfile: null,
    sessionScrapedData: null,
};

let port;
let tooltipTimeout, timerInterval = null, timerStartTime = 0;
let heartbeatInterval = null;

const getMatchSettingsKey = (uuid) => `matchSettings_${uuid}`;

document.addEventListener('DOMContentLoaded', initializePopup);

function sendMessage(message) {
    if (!port) {
        DEBUG.log('PORT', "Port was disconnected. Attempting to reconnect and send message.");
        setupPort();
        setTimeout(() => {
            if (port) {
                try {
                    port.postMessage(message);
                } catch (e) {
                    DEBUG.error('PORT', "Failed to send message after reconnection attempt.", e);
                    showError("Connection Error", "Could not communicate with the background service. Please try closing and reopening the popup.");
                }
            } else {
                DEBUG.error('PORT', "Port still not connected after reconnection attempt. Message not sent.");
                showError("Connection Error", "Could not communicate with the background service. Please try closing and reopening the popup.");
            }
        }, 100);
    } else {
        try {
            port.postMessage(message);
        } catch (e) {
            DEBUG.error('PORT', "Failed to send message on active port, likely disconnected mid-call.", e);
            port = null;
            sendMessage(message);
        }
    }
}

function setupPort() {
    port = chrome.runtime.connect({
        name: "wingman-popup"
    });

    port.onMessage.addListener((message) => {
        DEBUG.log('PORT', 'Message received from background', message);
        switch (message.action) {
        case 'nlpAnalysisResponse':
            handleNlpAnalysisResponse(message);
            break;
        case 'finalPayloadResponse':
            handleFinalPayloadResponse(message);
            break;
        case 'generationUpdate':
            if (message.uuid === state.currentMatchUUID) {
                syncUIWithState(message.state);
            }
            break;
        case 'generationStateResponse':
            syncUIWithState(message.state);
            break;
        }
    });

    // Keep service worker alive during popup interaction
    startHeartbeat();

    port.onDisconnect.addListener(() => {
        DEBUG.log('PORT', 'Port disconnected from popup side.');
        stopHeartbeat();
        port = null;
    });
}

async function initializePopup() {
    setupEventListeners();
    setupPort();
    await loadAndApplySettings();
    await refreshDataAndUI();
}

async function refreshDataAndUI() {
    if (state.isRefreshing)
        return;

    sendMessage({
        action: "getGenerationState",
        data: {
            uuid: state.currentMatchUUID
        }
    });

    const generationState = await new Promise(resolve => {
        const listener = (msg) => {
            if (msg.action === 'generationStateResponse') {
                if (port)
                    port.onMessage.removeListener(listener);
                resolve(msg.state);
            }
        };
        if (port) {
            port.onMessage.addListener(listener);
        } else {
            resolve({
                isGenerating: false,
                response: null,
                error: null,
                generationId: null,
                generationStartTime: null
            });
        }
    });

    if (generationState.isGenerating) {
        syncUIWithState(generationState);
        return;
    }

    state.isRefreshing = true;
    setUIRefreshingState(true);

    try {
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });
        let scraperFn;

        if (tab.url?.startsWith("https://tinder.com/")) {
            scraperFn = scrapeTinderPage;
            state.pasterFn = pasteTextIntoTinderInput;
        } else if (tab.url?.startsWith("https://bumble.com/")) {
            scraperFn = scrapeBumblePage;
            state.pasterFn = pasteTextIntoBumbleInput;
        } else {
            throw new Error('Unsupported Site: Please navigate to a conversation on Tinder.com or Bumble.com.');
        }

        const results = await chrome.scripting.executeScript({
            target: {
                tabId: tab.id
            },
            function : scraperFn
    });
const pageData = results[0]?.result;
if (!pageData || pageData.error) {
    throw new Error(`Could not read page. ${pageData?.error || 'Please make sure a conversation is selected.'}`);
}

state.sessionScrapedData = pageData;
sendMessage({
    action: "getNlpAnalysis",
    data: {
        scrapedData: pageData
    }
});

} catch (e) {
    showError('Initialization Failed', e.message);
    DEBUG.error('INIT', 'Refresh failed', e);
} finally {
    state.isRefreshing = false;
    setUIRefreshingState(false);
}
}

async function handleNlpAnalysisResponse(response) {
    if (response.error) {
        showError('Backend unavailable. Using local analysis.');
    } else if (response.partialFallback) {
        showWarning('Some values are from local analysis due to missing backend data.');
    } else {
        hideError();
    }
    state.sessionMatchProfile = response.matchProfile;
    state.currentMatchUUID = response.matchProfile.uuid;
    await loadAndApplySettings();
    updateUIFromState(); // <-- Add this
    showView(SELECTORS.mainView);
}

function handleFinalPayloadResponse(message) {
    if (message.error) {
        showErrorInResponseArea(message.error);
        setUIGeneratingState(false);
        return;
    }
    sendMessage({
        action: "getAIResponse",
        data: {
            payload: message.payload,
            generationId: Date.now(),
            uuid: state.currentMatchUUID,
            logData: message.logData
        }
    });
}

function startHeartbeat() {
    stopHeartbeat();
    DEBUG.log('HEARTBEAT', 'Starting heartbeat...');
    heartbeatInterval = setInterval(() => {
        sendMessage({
            action: 'heartbeat'
        });
    }, 15000);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        DEBUG.log('HEARTBEAT', 'Stopping heartbeat.');
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

function setupEventListeners() {
    setupTabs();
    window.addEventListener('focus', refreshDataAndUI);
    document.getElementById(SELECTORS.generateBtn)?.addEventListener('click', handleGenerateClick);
    document.getElementById(SELECTORS.copyBtn)?.addEventListener('click', handleCopyClick);
    document.getElementById(SELECTORS.cancelBtn)?.addEventListener('click', handleCancelClick);
    document.getElementById(SELECTORS.settingsBtn)?.addEventListener('click', () => showView(SELECTORS.settingsView));
    document.getElementById(SELECTORS.backBtn)?.addEventListener('click', () => showView(SELECTORS.mainView));
    document.getElementById(SELECTORS.masterResetBtn)?.addEventListener('click', handleMasterReset);
    document.getElementById(SELECTORS.resetMatchBtn)?.addEventListener('click', handleMatchReset);
    document.getElementById(SELECTORS.flirtySlider)?.addEventListener('input', updateSliderLabels);
    document.getElementById(SELECTORS.lengthSlider)?.addEventListener('input', updateSliderLabels);
    document.getElementById(SELECTORS.temperatureSlider)?.addEventListener('input', () => updateSliderValueLabel(SELECTORS.temperatureSlider, SELECTORS.temperatureValueLabel));
    document.getElementById(SELECTORS.topPSlider)?.addEventListener('input', () => updateSliderValueLabel(SELECTORS.topPSlider, SELECTORS.topPValueLabel, 2));
    document.querySelectorAll('.info-icon, [data-tooltip-id]').forEach(icon => {
        icon.addEventListener('mouseenter', handleTooltipShow);
        icon.addEventListener('mouseleave', handleTooltipHide);
    });
    document.getElementById('main-view')?.addEventListener('input', handleSettingChange);
    document.getElementById('main-view')?.addEventListener('change', handleSettingChange);
    document.getElementById('settings-view')?.addEventListener('input', handleSettingChange);
    document.getElementById('settings-view')?.addEventListener('change', handleSettingChange);
    document.getElementById(SELECTORS.clearResponseBtn)?.addEventListener('click', () => {
        const area = document.getElementById(SELECTORS.responseArea);
        area.textContent = '';
        area.dispatchEvent(new Event('input', {
                bubbles: true
            }));
    });
    document.getElementById(SELECTORS.clearInstructionBtn)?.addEventListener('click', () => {
        const area = document.getElementById(SELECTORS.customInstruction);
        area.value = '';
        area.dispatchEvent(new Event('input', {
                bubbles: true
            }));
    });
    document.getElementById(SELECTORS.dateIdeaBtn)?.addEventListener('click', handleDateIdeaClick);
    document.getElementById(SELECTORS.refinementActions)?.addEventListener('click', handleRefinementClick);

    populateSelect(SELECTORS.linguisticStyleSelect, LINGUISTIC_STYLES.map(s => ({
                value: s,
                text: s.charAt(0).toUpperCase() + s.slice(1)
            })));
    populateSelect(SELECTORS.emojiStrategySelect, Object.entries(EMOJI_STRATEGIES).map(([value, text]) => ({
                value,
                text
            })));
    populateSelect(SELECTORS.userLocationSelect, Object.entries(USER_LOCATIONS).map(([key, loc]) => ({
                value: key,
                text: loc.name
            })));
}

function setupTabs() {
    const tabContainer = document.querySelector('.tab-bar');
    if (!tabContainer) return;

    tabContainer.addEventListener('click', (event) => {
        const clickedTab = event.target.closest('.tab-link');
        if (!clickedTab) return;

        if (clickedTab.classList.contains('active')) {
            return;
        }

        const targetTabName = clickedTab.dataset.tab;
        const targetPanel = document.getElementById(targetTabName);

        document.querySelectorAll('.tab-link').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.remove('active');
        });

        clickedTab.classList.add('active');
        if (targetPanel) {
            targetPanel.classList.add('active');
        }
    });
}

function updateClearButtonVisibility(inputEl, clearBtnEl) {
    const hasContent = (inputEl.value && inputEl.value.trim() !== '') || (inputEl.textContent && inputEl.textContent.trim() !== '');
    clearBtnEl.classList.toggle('hidden', !hasContent);
}

async function handleSettingChange(event) {
    const el = event.target;

    // --- Handle UI-specific side effects ---
    if (el.id === SELECTORS.customInstruction) {
        updateClearButtonVisibility(el, document.getElementById(SELECTORS.clearInstructionBtn));
    } else if (el.id === SELECTORS.responseArea) {
        updateClearButtonVisibility(el, document.getElementById(SELECTORS.clearResponseBtn));
        document.getElementById(SELECTORS.refinementActions).classList.add('hidden');
        await chrome.storage.local.set({ 'lastResponse': el.textContent });
        return;
    }

    // --- Handle Analysis/Memory Overrides (updates in-memory state) ---
    const dataPath = el.dataset.path;
    if (dataPath) {
        let value;
        if (el.type === 'checkbox') {
            value = el.checked;
        } else if (el.type === 'range' || el.type === 'number') {
            value = parseFloat(el.value);
        } else if (el.multiple) {
            value = Array.from(el.selectedOptions).map(opt => opt.value);
        } else {
            value = el.value;
        }

        if (dataPath.endsWith('insideJokes') || dataPath.endsWith('avoidedTopics') || dataPath.endsWith('questionHistory')) {
            value = el.value.split('\n').filter(Boolean);
        }

        if (state.sessionMatchProfile) {
            setNestedValue(state.sessionMatchProfile, dataPath, value);
            DEBUG.log('STATE', `Updated ${dataPath} to`, value);
        }
        return;
    }

    // --- Handle Persistent Settings (updates chrome.storage.local) ---
    const storageKey = el.dataset.storageKey;
    if (storageKey) {
        const value = el.type === 'checkbox' ? el.checked : el.value;

        if (MATCH_SPECIFIC_SETTINGS_KEYS.includes(storageKey) && state.currentMatchUUID) {
            const settingsStorageKey = getMatchSettingsKey(state.currentMatchUUID);
            const result = await chrome.storage.local.get(settingsStorageKey);
            const matchSettings = result[storageKey] || {};
            matchSettings[storageKey] = value;
            await chrome.storage.local.set({ [settingsStorageKey]: matchSettings });
        } else {
            await chrome.storage.local.set({ [storageKey]: value });
        }
        showToast('Settings saved');
    }
}

async function loadAndApplySettings() {
    const globalKeys = Object.keys(DEFAULTS);
    const globalSettings = {
        ...DEFAULTS,
        ...(await chrome.storage.local.get(globalKeys))
    };
    let matchSpecificSettings = {};
    if (state.currentMatchUUID) {
        const matchKey = getMatchSettingsKey(state.currentMatchUUID);
        const result = await chrome.storage.local.get(matchKey);
        matchSpecificSettings = result[matchKey] || {};
    }
    const finalSettings = {
        ...globalSettings,
        ...matchSpecificSettings
    };
    document.querySelectorAll('[data-storage-key]').forEach(el => {
        const key = el.dataset.storageKey;
        if (finalSettings.hasOwnProperty(key)) {
            const value = finalSettings[key];
            if (el.type === 'checkbox')
                el.checked = value;
            else
                el.value = value;
        }
    });
    const responseArea = document.getElementById(SELECTORS.responseArea);
    if (responseArea && finalSettings.lastResponse) {
        responseArea.textContent = finalSettings.lastResponse;
    }
    updateSliderLabels();
    updateSliderValueLabel(SELECTORS.temperatureSlider, SELECTORS.temperatureValueLabel);
    updateSliderValueLabel(SELECTORS.topPSlider, SELECTORS.topPValueLabel, 2);
    updateClearButtonVisibility(document.getElementById(SELECTORS.customInstruction), document.getElementById(SELECTORS.clearInstructionBtn));
    updateClearButtonVisibility(responseArea, document.getElementById(SELECTORS.clearResponseBtn));
    updateOverrideIndicators(matchSpecificSettings);
}

function updateOverrideIndicators(matchSettings) {
    document.querySelectorAll('[data-storage-key]').forEach(el => {
        const key = el.dataset.storageKey;
        if (MATCH_SPECIFIC_SETTINGS_KEYS.includes(key)) {
            const label = el.closest('.control-group')?.querySelector('.label-with-info');
            if (label) {
                let indicator = label.querySelector('.override-indicator');
                if (matchSettings.hasOwnProperty(key)) {
                    if (!indicator) {
                        indicator = document.createElement('span');
                        indicator.className = 'override-indicator';
                        indicator.textContent = '●';
                        indicator.title = 'This setting is specific to this match.';
                        label.appendChild(indicator);
                    }
                } else {
                    if (indicator) {
                        indicator.remove();
                    }
                }
            }
        }
    });
}

async function handleMatchReset() {
    if (!state.currentMatchUUID)
        return;
    const btn = document.getElementById(SELECTORS.resetMatchBtn);
    btn.disabled = true;
    try {
        await chrome.storage.local.remove(getMatchSettingsKey(state.currentMatchUUID));
        document.getElementById(SELECTORS.responseArea).textContent = '';
        await loadAndApplySettings();
        updateOverrideIndicators({}); // Clear indicators
    } catch (e) {
        DEBUG.error("RESET", "Failed to reset match settings:", e);
    } finally {
        btn.disabled = false;
    }
}

async function handleMasterReset() {
    const btn = document.getElementById(SELECTORS.masterResetBtn);
    btn.disabled = true;
    try {
        const keysToRemove = Object.keys(DEFAULTS);
        await chrome.storage.local.remove(keysToRemove);
        await loadAndApplySettings();
    } catch (e) {
        DEBUG.error("RESET", "Failed to reset master settings:", e);
    } finally {
        btn.disabled = false;
    }
}

function syncUIWithState(generationState) {
    if (!generationState)
        return;
    setUIGeneratingState(generationState.isGenerating);
    if (generationState.isGenerating) {
        startHeartbeat();
        if (generationState.generationStartTime) {
            showView(SELECTORS.mainView);
            startTimer(generationState.generationStartTime);
        }
    } else {
        stopHeartbeat();
        stopTimer();
        resetTimerDisplay();
        if (generationState.response) {
            updateUIAfterGeneration({
                reply: generationState.response
            });
            autoType(generationState.response);
        } else if (generationState.error) {
            updateUIAfterGeneration({
                error: generationState.error
            });
        }
    }
}

function populateSelect(selectId, options) {
    const select = document.getElementById(selectId);
    if (select)
        select.innerHTML = options.map(opt => `<option value="${opt.value}">${opt.text}</option>`).join('');
}

function updateSliderLabels() {
    const flirtyLabels = {
        0: 'Neutral',
        20: 'Friendly',
        40: 'Warm',
        60: 'Flirty',
        80: 'Very Flirty',
        100: 'Daring'
    };
    const lengthLabels = {
        0: 'Micro',
        20: 'Short',
        40: 'Medium',
        60: 'Long',
        80: 'Epic',
        100: 'Manifesto'
    };
    updateSliderValueLabel(SELECTORS.flirtySlider, SELECTORS.flirtyValueLabel, 0, flirtyLabels);
    updateSliderValueLabel(SELECTORS.lengthSlider, SELECTORS.lengthValueLabel, 0, lengthLabels);
}

function updateSliderValueLabel(sliderId, labelId, precision = 1, labelMap = null) {
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(labelId);
    if (slider && label) {
        const value = parseFloat(slider.value);
        label.textContent = labelMap ? (labelMap[Object.keys(labelMap).reverse().find(k => value >= k)] || Object.values(labelMap)[0]) : value.toFixed(precision);
    }
}

function handleTooltipShow(event) {
    clearTimeout(tooltipTimeout);
    const icon = event.currentTarget;
    const tooltipId = icon.dataset.tooltipId;
    const tooltip = document.getElementById(SELECTORS.infoTooltip);
    const content = getTooltipContent(tooltipId);
    if (!content || !tooltip)
        return;
    tooltip.innerHTML = content;
    const iconRect = icon.getBoundingClientRect();
    const bodyRect = document.body.getBoundingClientRect();
    const popupRect = document.querySelector('.app-container').getBoundingClientRect();

    tooltip.style.visibility = 'hidden';
    tooltip.classList.add('visible');

    let left = iconRect.left - bodyRect.left + (iconRect.width / 2) - (tooltip.offsetWidth / 2);

    if (left < 0) {
        left = 5;
    }
    if (left + tooltip.offsetWidth > popupRect.width) {
        left = popupRect.width - tooltip.offsetWidth - 5;
    }

    tooltip.style.top = `${iconRect.bottom - bodyRect.top + 8}px`;
    tooltip.style.left = `${left}px`;
    tooltip.style.visibility = 'visible';
}

function handleTooltipHide() {
    tooltipTimeout = setTimeout(() => {
        document.getElementById(SELECTORS.infoTooltip)?.classList.remove('visible');
    }, 100);
}

function getTooltipContent(tooltipId) {
    const flirtyValue = Number(document.getElementById(SELECTORS.flirtySlider).value);
    const lengthValue = Number(document.getElementById(SELECTORS.lengthSlider).value);
    const linguisticStyle = document.getElementById(SELECTORS.linguisticStyleSelect).value;
    const styleDescriptions = {
        'auto': '<strong>Auto:</strong> Adapts to the match’s last message.',
        'casual': '<strong>Casual:</strong> Relaxed, everyday flow.',
        'witty': '<strong>Witty:</strong> Clever wordplay and banter.',
        'playful': '<strong>Playful:</strong> Fun, cheeky vibe.',
        'direct': '<strong>Direct:</strong> Straightforward and confident.',
        'intellectual': '<strong>Intellectual:</strong> Thoughtful and deep.',
        'poetic': '<strong>Poetic:</strong> Vivid and expressive language.',
        'charming': '<strong>Charming:</strong> Polished and charismatic.',
        'sarcastic': '<strong>Sarcastic:</strong> Dry humor and irony.',
        'sexual': '<strong>Sexual:</strong> Bold and evocative.',
        'mysterious': '<strong>Mysterious:</strong> Enigmatic and intriguing.'
    };
    const emojiDescriptions = {
        'auto': "<strong>Auto:</strong> " + getEmojiInstruction('auto', flirtyValue, linguisticStyle),
        'friendly': "<strong>Friendly:</strong> " + getEmojiInstruction('friendly', flirtyValue, linguisticStyle),
        'playful': "<strong>Playful:</strong> " + getEmojiInstruction('playful', flirtyValue, linguisticStyle),
        'bold': "<strong>Bold:</strong> " + getEmojiInstruction('bold', flirtyValue, linguisticStyle),
        'no_emoji': "<strong>No Emoji:</strong> No emojis will be used."
    };
    switch (tooltipId) {
    case 'flirt-info':
        return getToneDescription(flirtyValue);
    case 'length-info':
        return getLengthDescription(lengthValue);
    case 'style-info':
        return styleDescriptions[linguisticStyle] || "Select a style.";
    case 'emoji-info':
        return emojiDescriptions[document.getElementById(SELECTORS.emojiStrategySelect).value] || "Select a strategy.";
    case 'start-fresh-info':
        return "<strong>Start Fresh:</strong> Ignores their last message and generates a new opener from their profile.";
    default:
        return null;
    }
}

// --- Toast: Prevent duplicates, solid background, improved readability ---
let lastToastMsg = null;
let lastToastTimeout = null;
function showToast(message, type = 'success') {
    if (lastToastMsg === message) return; // Prevent duplicate toasts
    lastToastMsg = message;
    clearTimeout(lastToastTimeout);

    let toast = document.getElementById('wingman-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'wingman-toast';
        document.body.appendChild(toast);
    }
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.display = 'block';
    toast.style.background = type === 'error' ? '#c62828' : type === 'warning' ? '#f9a825' : '#1976d2';
    toast.style.color = '#fff';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '8px';
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.zIndex = 9999;
    toast.style.fontWeight = 'bold';
    toast.style.boxShadow = '0 2px 12px rgba(0,0,0,0.18)';
    toast.style.maxWidth = '90vw';
    toast.style.textAlign = 'center';

    lastToastTimeout = setTimeout(() => {
        toast.style.display = 'none';
        lastToastMsg = null;
    }, 3200);
}

// --- Geo Tab: Only show fallback toast if backend is truly unavailable ---
async function updateGeoContextDisplay(geoContextData) {
    if (!state.sessionMatchProfile || !state.sessionScrapedData) return;

    const { myName } = state.sessionScrapedData;
    const { theirName, matchLocation } = state.sessionMatchProfile.metadata || {};
    const settings = await chrome.storage.local.get('userLocationChoice');
    const userLocationData = USER_LOCATIONS[settings.userLocationChoice || 'autodetect'];

    // Fallback logic
    const isBackend = !!geoContextData && geoContextData.source === 'backend';
    const sourceLabel = isBackend ? '<span class="source-label backend">Backend</span>' : '<span class="source-label local">Local</span>';

    document.getElementById('geo-user-name').innerHTML = (myName || 'User') + sourceLabel;
    document.getElementById('geo-match-name').innerHTML = (theirName || 'Match') + sourceLabel;
    document.getElementById('user-location').textContent = userLocationData?.name?.split(',')[0] || 'N/A';
    document.getElementById('match-location').textContent = matchLocation || 'N/A';
    document.getElementById('user-time').textContent = geoContextData?.userTime || 'N/A';
    document.getElementById('match-time').textContent = geoContextData?.matchTime || 'N/A';
    document.getElementById('user-time-of-day').textContent = geoContextData?.userTimeOfDay || 'N/A';
    document.getElementById('match-time-of-day').textContent = geoContextData?.matchTimeOfDay || 'N/A';
    document.getElementById('user-timezone').textContent = geoContextData?.userTimeZoneName || userLocationData?.timeZone || 'N/A';
    document.getElementById('match-timezone').textContent = geoContextData?.matchTimeZoneName || 'N/A';
    document.getElementById('user-country').textContent = geoContextData?.userCountry || userLocationData?.country || 'N/A';
    document.getElementById('match-country').textContent = geoContextData?.matchCountry || 'N/A';
    document.getElementById('time-difference').textContent = geoContextData?.timeZoneDifference !== null && geoContextData?.timeZoneDifference !== undefined
        ? `${geoContextData.timeZoneDifference} hour(s)` : 'N/A';
    document.getElementById('distance-info').textContent = geoContextData?.distance
        ? `${geoContextData.distance.miles} miles / ${geoContextData.distance.km} km` : 'N/A';

    // Only show fallback toast if backend is truly unavailable
    if (!geoContextData || geoContextData.source === 'local') {
        showToast('Using local analysis (backend unavailable)', 'warning');
    }
}

// --- Settings Tab: Add backend test buttons ---
function addBackendTestButtons() {
    const settingsTab = document.getElementById('settings');
    if (!settingsTab) return;

    // Add test buttons next to each backend URL input
    [
        { id: 'llm-url', label: 'Test LLM URL' },
        { id: 'analysis-url', label: 'Test Analysis URL' }
    ].forEach(({ id, label }) => {
        const input = document.getElementById(id);
        if (input && !input.nextSibling?.classList?.contains('test-backend-btn')) {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.className = 'test-backend-btn';
            btn.style.marginLeft = '8px';
            btn.onclick = async () => {
                btn.disabled = true;
                btn.textContent = 'Testing...';
                try {
                    const url = input.value;
                    const resp = await fetch(url, { method: 'POST', body: JSON.stringify({ test: true }), headers: { 'Content-Type': 'application/json' } });
                    if (resp.ok) {
                        showToast(`${label} succeeded!`, 'success');
                    } else {
                        showToast(`${label} failed (${resp.status})`, 'error');
                    }
                } catch (e) {
                    showToast(`${label} failed (network error)`, 'error');
                }
                btn.disabled = false;
                btn.textContent = label;
            };
            input.parentNode.insertBefore(btn, input.nextSibling);
        }
    });
}
document.addEventListener('DOMContentLoaded', addBackendTestButtons);

// --- Consistent Tab Look & Feel (mimic "Tune" tab) ---
// Add a utility to apply consistent classes to all tab panels
function unifyTabStyles() {
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.add('card', 'card-tune-style');
        panel.style.background = '#fff';
        panel.style.borderRadius = '12px';
        panel.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
        panel.style.padding = '20px 16px';
        panel.style.marginBottom = '18px';
    });
    document.querySelectorAll('.tab-panel .section-header').forEach(header => {
        header.style.fontWeight = 'bold';
        header.style.fontSize = '1.1em';
        header.style.marginBottom = '10px';
        header.style.letterSpacing = '0.01em';
    });
    document.querySelectorAll('.tab-panel .control-group').forEach(group => {
        group.style.marginBottom = '14px';
    });
}
document.addEventListener('DOMContentLoaded', unifyTabStyles);

// --- Backend Analysis Call: Only one POST, no OPTIONS ---
async function callBackendAnalysis(url, payload) {
    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            // mode: 'cors', // Only if needed
            // credentials: 'include' // Only if needed
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
    } catch (e) {
        DEBUG.error('BACKEND', 'Analysis call failed', e);
        throw e;
    }
}

// Replace all backend analysis calls in your codebase with callBackendAnalysis()
// Example usage:
// const result = await callBackendAnalysis(backendUrl, { ...payload });

function showError(msg) {
    const el = document.getElementById('error-message');
    el.innerText = msg;
    el.style.display = 'block';
}
function showWarning(msg) {
    const el = document.getElementById('warning-message');
    el.innerText = msg;
    el.style.display = 'block';
}
function hideError() {
    document.getElementById('error-message').style.display = 'none';
    document.getElementById('warning-message').style.display = 'none';
}

// --- New Parameter Tooltips ---
function addParameterTooltips() {
    const params = [
        { id: 'slider-tone', desc: 'Adjusts the tone of the generated message.' },
        { id: 'slider-length', desc: 'Controls the length of the response.' },
        // ...add more as needed...
    ];
    params.forEach(param => {
        const el = document.getElementById(param.id);
        if (el) {
            el.title = param.desc;
        }
    });
}
document.addEventListener('DOMContentLoaded', addParameterTooltips);

function validateSliderValue(id, min, max) {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
        if (el.value < min || el.value > max) {
            el.classList.add('invalid');
        } else {
            el.classList.remove('invalid');
        }
    });
}
validateSliderValue('slider-tone', 1, 10);
validateSliderValue('slider-length', 10, 200);

// --- Prompt Preview Feature ---
function updatePromptPreview() {
    const prompt = buildPromptFromCurrentState();
    document.getElementById('prompt-preview').innerText = prompt;
}
function buildPromptFromCurrentState() {
    // ...build prompt string from current analysis and parameter state...
    return `Prompt: ...`; // Replace with actual logic
}
// Call updatePromptPreview() whenever parameters or analysis change

function handleGenerateClick() {
    // TODO: Implement actual logic
    console.log('Generate button clicked');
}

function setUIRefreshingState(isRefreshing) {
    // TODO: Implement actual logic
    // Example: Show/hide a loading spinner
    console.log('UI refreshing state:', isRefreshing);
}

function setUIGeneratingState(isGenerating) {
    // TODO: Implement actual logic
    // Example: Show/hide a generating spinner
    console.log('UI generating state:', isGenerating);
}