import { mockPayload } from './dev/mock_payload.js';
import { scrapeBumblePage, pasteTextIntoBumbleInput, scrapeTinderPage, pasteTextIntoTinderInput } from './content-scraper.js';
import { initializePort, sendMessage, startHeartbeat, stopHeartbeat, getGenerationState } from './modules/portManager.js';
import { DEFAULTS, MATCH_SPECIFIC_SETTINGS_KEYS, EMOJI_STRATEGIES, USER_LOCATIONS } from './modules/config.js';
import { initializeTabs, showView, renderAllTabs, SELECTORS, setUIRefreshingState, showError, showErrorInResponseArea, setUIGeneratingState, updateUIAfterGeneration, updateSliderValueLabel, updateClearButtonVisibility, startTimer, stopTimer, resetTimerDisplay } from './modules/ui.js';
import { getState, setState, getNlpPayload } from './modules/uiState.js';

const DEBUG = {
    log: (category, message, data = null) => console.log(`[WINGMAN-POPUP-${category.toUpperCase()}] ${message}`, data ?? ''),
    error: (category, message, error = null) => console.error(`[WINGMAN-POPUP-${category.toUpperCase()}-ERROR] ${message}`, error ?? ''),
};

const getMatchSettingsKey = (uuid) => `matchSettings_${uuid}`;

const MODELS = {
    local_llama: ['llama3:latest', 'codellama:latest'],
    openai: ['gpt-4', 'gpt-3.5-turbo'],
    anthropic: ['claude-2', 'claude-instant-1'],
};

function updateModelDropdown() {
    DEBUG.log('UI', 'updateModelDropdown: START');
    const provider = document.getElementById('ai-provider-select').value;
    const modelSelect = document.getElementById('ai-model-select');
    const currentModel = modelSelect.value;
    modelSelect.innerHTML = '';
    const models = MODELS[provider] || [];
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        if (model === currentModel) {
            option.selected = true;
        }
        modelSelect.appendChild(option);
    });
    DEBUG.log('UI', 'updateModelDropdown: END');
}

function setupEventListeners() {
    DEBUG.log('INIT', 'setupEventListeners: START');
    const listeners = {
        [SELECTORS.settingsBtn]: { 'click': () => showView(SELECTORS.settingsView) },
        [SELECTORS.backBtn]: { 'click': () => showView(SELECTORS.mainView) },
        [SELECTORS.generateBtn]: { 'click': handleGenerateClick },
        [SELECTORS.copyBtn]: { 'click': handleCopyClick },
        [SELECTORS.cancelBtn]: { 'click': handleCancelClick },
        [SELECTORS.resetMatchBtn]: { 'click': handleMatchReset },
        [SELECTORS.masterResetBtn]: { 'click': handleMasterReset },
        'ai-provider-select': { 'change': updateModelDropdown },
        'test-api-btn': { 'click': handleTestApiConnection },
        'test-nlp-btn': { 'click': handleTestNlpConnection },
    };

    for (const selector in listeners) {
        const element = document.getElementById(selector);
        if (element) {
            for (const event in listeners[selector]) {
                element.addEventListener(event, listeners[selector][event]);
            }
        } else {
            DEBUG.error('INIT', `setupEventListeners: Element not found for selector '${selector}'`);
        }
    }

    document.body.addEventListener('input', handleSettingChange);
    document.body.addEventListener('change', handleSettingChange);
    DEBUG.log('INIT', 'setupEventListeners: END');
}

document.addEventListener('DOMContentLoaded', initializePopup);

const debouncedRefreshDataAndUI = () => {
    refreshDataAndUI();
};

async function initializePopup() {
    DEBUG.log('INIT', 'initializePopup: START');
    initializeTabs();
    setupEventListeners();
    renderAllTabs(getNlpPayload());
    initializePort({
        'nlpAnalysisResponse': handleNlpAnalysisResponse,
        'generationUpdate': (message) => {
            const state = getState();
            if (message.uuid === state.currentMatchUUID) {
                syncUIWithState(message.state);
            }
        },
        'generationStateResponse': syncUIWithState,
        'testConnectionResponse': handleTestConnectionResponse,
    });
    await loadAndApplySettings();
    await updateModelDropdown();
    DEBUG.log('INIT', 'initializePopup: END');
    showView('main-view');
    debouncedRefreshDataAndUI();
}

function handleTestApiConnection() {
    const url = document.getElementById('localLlamaUrl').value;
    const resultEl = document.getElementById('api-test-result');
    resultEl.textContent = 'Testing...';
    resultEl.className = 'test-result';
    sendMessage({ action: 'testApiConnection', data: { url } });
}

function handleTestNlpConnection() {
    const url = document.getElementById('conversationAnalysisUrl').value;
    const resultEl = document.getElementById('nlp-test-result');
    resultEl.textContent = 'Testing...';
    resultEl.className = 'test-result';
    sendMessage({ action: 'testNlpConnection', data: { url } });
}

function handleTestConnectionResponse(message) {
    const { success, type, error } = message;
    const resultEl = document.getElementById(`${type}-test-result`);
    if (success) {
        resultEl.textContent = 'Success!';
        resultEl.classList.add('success');
    } else {
        resultEl.textContent = `Failed: ${error}`;
        resultEl.classList.add('error');
    }
}

async function refreshDataAndUI() {
    DEBUG.log('REFRESH', 'refreshDataAndUI: START');
    const state = getState();
    if (state.isRefreshing) {
        DEBUG.log('REFRESH', 'refreshDataAndUI: Already refreshing, exiting.');
        return;
    }

    const generationState = await getGenerationState(state.currentMatchUUID);

    if (generationState.isGenerating) {
        DEBUG.log('REFRESH', 'refreshDataAndUI: Generation in progress, syncing UI.');
        syncUIWithState(generationState);
        return;
    }

    setState({ isRefreshing: true });
    setUIRefreshingState(true);
    DEBUG.log('REFRESH', 'refreshDataAndUI: Set state to refreshing.');

    try {
        DEBUG.log('REFRESH', 'refreshDataAndUI: Inside TRY block');
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });
        let scraperFn;

        if (tab.url?.startsWith("https://tinder.com/")) {
            scraperFn = scrapeTinderPage;
            setState({ pasterFn: pasteTextIntoTinderInput });
        } else if (tab.url?.startsWith("https://bumble.com/")) {
            scraperFn = scrapeBumblePage;
            setState({ pasterFn: pasteTextIntoBumbleInput });
        } else {
            throw new Error('Unsupported Site: Please navigate to a conversation on Tinder.com or Bumble.com.');
        }
        DEBUG.log('REFRESH', 'refreshDataAndUI: Scraper function selected.');

        const results = await chrome.scripting.executeScript({
            target: {
                tabId: tab.id
            },
            function : scraperFn
        });
        DEBUG.log('REFRESH', 'refreshDataAndUI: Scraper script executed.');
        const pageData = results[0]?.result;
        if (!pageData || pageData.error) {
            throw new Error(`Could not read page. ${pageData?.error || 'Please make sure a conversation is selected.'}`);
        }

        setState({ sessionScrapedData: pageData });
        DEBUG.log('REFRESH', 'refreshDataAndUI: Sending getNlpAnalysis message to background.');
        sendMessage({
            action: "getNlpAnalysis",
            data: {
                scrapedData: pageData
            }
        });

    } catch (e) {
        DEBUG.error('REFRESH', 'refreshDataAndUI: Inside CATCH block', e);
        showError('Initialization Failed', e.message);
    } finally {
        DEBUG.log('REFRESH', 'refreshDataAndUI: Inside FINALLY block');
        setState({ isRefreshing: false });
        setUIRefreshingState(false);
    }
}

async function handleNlpAnalysisResponse(message) {
    DEBUG.log('RESPONSE', 'handleNlpAnalysisResponse: RECEIVED', message);
    if (message.error) {
        showError('NLP Analysis Failed', message.error);
        return;
    }

    const nlpPayload = message.payload;
    if (!nlpPayload || !nlpPayload.matchId) {
        showError('NLP Analysis Error', 'Received an invalid payload from the backend.');
        return;
    }

    DEBUG.log('RESPONSE', 'handleNlpAnalysisResponse: Setting state');
    setState({
        nlpPayload: nlpPayload,
        currentMatchUUID: nlpPayload.matchId,
    });

    DEBUG.log('RESPONSE', 'handleNlpAnalysisResponse: Calling loadAndApplySettings');
    await loadAndApplySettings();

    DEBUG.log('RESPONSE', 'handleNlpAnalysisResponse: Calling renderAllTabs');
    renderAllTabs(nlpPayload);

    const statusEl = document.getElementById('conversation-status-display');
    if (statusEl && nlpPayload.analysis.sentiment) {
        statusEl.textContent = `Status: ${nlpPayload.analysis.sentiment} | Engagement: ${nlpPayload.analysis.engagement}`;
    } else if (statusEl) {
        statusEl.textContent = 'Status: Unknown';
    }

    DEBUG.log('RESPONSE', 'handleNlpAnalysisResponse: Calling showView');
    showView('main-view');
}

async function handleLocationChange() {
    const state = getState();
    const select = document.getElementById(SELECTORS.userLocationSelect);
    const choice = select.value;
    const loadingIndicator = document.getElementById('location-loading-indicator');
    let messageData = {
        uuid: state.currentMatchUUID
    };
    if (choice === 'autodetect') {
        loadingIndicator.classList.remove('hidden');
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    timeout: 5000,
                    enableHighAccuracy: true
                });
            });
            messageData.userCoords = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };
        } catch (error) {
            let errorMessage = 'Geolocation failed. Please select a location manually.';
            if (error.code === error.PERMISSION_DENIED) {
                errorMessage = 'Geolocation permission denied. Please enable it in your browser settings.';
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                errorMessage = 'Location information is unavailable.';
            } else if (error.code === error.TIMEOUT) {
                errorMessage = 'Geolocation request timed out.';
            }
            showErrorInResponseArea(errorMessage);
            return;
        } finally {
            loadingIndicator.classList.add('hidden');
        }
    } else {
        messageData.userLocation = USER_LOCATIONS[choice];
    }
}

async function handleSettingChange(event) {
    const state = getState();
    const el = event.target;
    if (el.id === SELECTORS.customInstruction) {
        updateClearButtonVisibility(el, document.getElementById(SELECTORS.clearInstructionBtn));
    } else if (el.id === SELECTORS.responseArea) {
        updateClearButtonVisibility(el, document.getElementById(SELECTORS.clearResponseBtn));
    }
    const key = el.dataset.storageKey || (el.id === SELECTORS.responseArea ? 'lastResponse' : null);
    if (!key)
        return;
    const value = el.type === 'checkbox' ? el.checked : (el.id === SELECTORS.responseArea ? el.textContent : el.value);
    if (MATCH_SPECIFIC_SETTINGS_KEYS.includes(key) && state.currentMatchUUID) {
        const storageKey = getMatchSettingsKey(state.currentMatchUUID);
        const result = await chrome.storage.local.get(storageKey);
        const matchSettings = result[storageKey] || {};
        matchSettings[key] = value;
        await chrome.storage.local.set({
            [storageKey]: matchSettings
        });
    } else {
        await chrome.storage.local.set({
            [key]: value
        });
    }
}

async function loadAndApplySettings() {
    DEBUG.log('SETTINGS', 'loadAndApplySettings: START');
    const state = getState();
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
    DEBUG.log('SETTINGS', 'loadAndApplySettings: END');
}

async function handleMatchReset() {
    const state = getState();
    if (!state.currentMatchUUID)
        return;
    const btn = document.getElementById(SELECTORS.resetMatchBtn);
    btn.disabled = true;
    try {
        await chrome.storage.local.remove(getMatchSettingsKey(state.currentMatchUUID));
        document.getElementById(SELECTORS.responseArea).textContent = '';
        await loadAndApplySettings();
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

async function handleGenerateClick() {
    const state = getState();
    if (!state.nlpPayload) {
        showErrorInResponseArea("Error: NLP data is not available.");
        if (!state.isRefreshing) {
            refreshDataAndUI();
        }
        return;
    }
    sendMessage({
        action: "getAIResponse",
        data: {
            nlpPayload: state.nlpPayload,
            generationId: Date.now()
        }
    });
}

function handleCancelClick() {
    const state = getState();
    if (state.currentMatchUUID) {
        sendMessage({
            action: "cancelGeneration",
            data: {
                uuid: state.currentMatchUUID
            }
        });
    }
}

function handleCopyClick() {
    const responseArea = document.getElementById(SELECTORS.responseArea);
    const copyBtn = document.getElementById(SELECTORS.copyBtn);
    if (!responseArea || !copyBtn || !responseArea.textContent)
        return;
    navigator.clipboard.writeText(responseArea.textContent).then(() => {
        const originalHTML = copyBtn.innerHTML;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
        }, 1500);
    });
}

async function autoType(text) {
    const state = getState();
    if (!state.pasterFn)
        return;
    try {
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });
        if (tab?.id) {
            chrome.scripting.executeScript({
                target: {
                    tabId: tab.id
                },
                function : state.pasterFn,
                args: [text]
            });
        }
    } catch (error) {
        DEBUG.error('AUTOTYPE', 'Failed to auto-type', error);
    }
}
