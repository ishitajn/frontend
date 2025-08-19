import { scrapeBumblePage, pasteTextIntoBumbleInput, scrapeTinderPage, pasteTextIntoTinderInput } from './content-scraper.js';
import { determineConversationState, LINGUISTIC_STYLES } from './conversationHelpers.js';
import { showNlpModal, hideDebugModal } from './debug-modal.js';
import { initializePort, sendMessage, startHeartbeat, stopHeartbeat, getGenerationState } from './modules/portManager.js';
import { DEFAULTS, MATCH_SPECIFIC_SETTINGS_KEYS, EMOJI_STRATEGIES, USER_LOCATIONS } from './modules/config.js';
import { SELECTORS, showView, showError, showErrorInResponseArea, setUIRefreshingState, setUIGeneratingState, updateUIAfterGeneration, updateSliderLabels, updateSliderValueLabel, updateGeoContextDisplay, startTimer, stopTimer, resetTimerDisplay, populateSelect, updateClearButtonVisibility } from './modules/ui.js';
import { setupEventListeners } from './modules/eventListeners.js';

const DEBUG = {
    log: (category, message, data = null) => console.log(`[WINGMAN-POPUP-${category.toUpperCase()}] ${message}`, data ?? ''),
    error: (category, message, error = null) => console.error(`[WINGMAN-POPUP-${category.toUpperCase()}-ERROR] ${message}`, error ?? ''),
};

const state = {
    currentMatchUUID: null,
    currentViewId: SELECTORS.loadingView,
    pasterFn: null,
    isRefreshing: false,
    sessionMatchProfile: null,
    sessionScrapedData: null,
};

const getMatchSettingsKey = (uuid) => `matchSettings_${uuid}`;

const MODELS = {
    local_llama: ['llama3:latest', 'codellama:latest'],
    openai: ['gpt-4', 'gpt-3.5-turbo'],
    anthropic: ['claude-2', 'claude-instant-1'],
};

function updateModelDropdown() {
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
}

document.addEventListener('DOMContentLoaded', initializePopup);

async function initializePopup() {
    const callbacks = {
        refreshDataAndUI,
        handleGenerateClick,
        handleCopyClick,
        handleCancelClick,
        showView,
        handleMasterReset,
        handleMatchReset,
        handleSettingChange,
        handleLocationChange,
        handleDateIdeaClick,
        handleRefinementClick,
        handleTestApiConnection,
        handleTestNlpConnection,
        updateModelDropdown,
    };
    setupEventListeners(callbacks);
    initializePort({
        'nlpAnalysisResponse': handleNlpAnalysisResponse,
        'geoCalculationsResponse': handleGeoCalculationsResponse,
        'finalPayloadResponse': handleFinalPayloadResponse,
        'generationUpdate': (message) => {
            if (message.uuid === state.currentMatchUUID) {
                syncUIWithState(message.state);
            }
        },
        'generationStateResponse': syncUIWithState,
        'testConnectionResponse': handleTestConnectionResponse,
    });
    await loadAndApplySettings();
    updateModelDropdown();
    await refreshDataAndUI();
}

function handleTestApiConnection() {
    const url = document.getElementById(SELECTORS.localLlamaUrl).value;
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
    if (state.isRefreshing)
        return;

    const generationState = await getGenerationState(state.currentMatchUUID);

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

async function handleNlpAnalysisResponse(message) {
    if (message.error) {
        showError('NLP Analysis Failed', message.error);
        return;
    }

    state.sessionMatchProfile = message.matchProfile;
    state.currentMatchUUID = message.matchProfile.uuid;

    await loadAndApplySettings();
    await handleLocationChange();

    displayConversationState();
    showView(SELECTORS.mainView);
}

function handleGeoCalculationsResponse(message) {
    if (state.sessionMatchProfile) {
        state.sessionMatchProfile.memory.geoContextData = message.geoContext || null;
    }
    updateGeoContextDisplay(message.geoContext, state.sessionMatchProfile, state.sessionScrapedData);
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

async function handleLocationChange() {
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
            updateGeoContextDisplay(null, state.sessionMatchProfile, state.sessionScrapedData);
            return;
        } finally {
            loadingIndicator.classList.add('hidden');
        }
    } else {
        messageData.userLocation = USER_LOCATIONS[choice];
    }
    sendMessage({
        action: "getGeoCalculations",
        data: messageData
    });
}

async function handleSettingChange(event) {
    const el = event.target;
    if (el.id === SELECTORS.customInstruction) {
        updateClearButtonVisibility(el, document.getElementById(SELECTORS.clearInstructionBtn));
    } else if (el.id === SELECTORS.responseArea) {
        updateClearButtonVisibility(el, document.getElementById(SELECTORS.clearResponseBtn));
        document.getElementById(SELECTORS.refinementActions).classList.add('hidden');
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
    if (!state.sessionMatchProfile || !state.currentMatchUUID || !state.sessionMatchProfile.analysis) {
        showErrorInResponseArea("Error: Conversation analysis is not complete. Please wait a moment and try again.");
        if (!state.isRefreshing) {
            refreshDataAndUI();
        }
        return;
    }

    const dataForBackground = await gatherCoreDataForGeneration();
    if (document.getElementById(SELECTORS.debugModeToggle).checked) {
        const fullGenerationData = {
            ...state.sessionScrapedData,
            ...state.sessionMatchProfile.metadata,
            myProfile: dataForBackground.myProfile,
            conversationHistory: state.sessionMatchProfile.conversationHistory,
            conversationAnalysis: state.sessionMatchProfile.analysis,
            geoContextData: state.sessionMatchProfile.memory.geoContextData,
            forceIncludeGeoContext: dataForBackground.forceIncludeGeoContext,
            taskInstructions: dataForBackground.taskInstructions,
        };
        const debugCallbacks = {
            sendFinalPayloadToAI: (payload) => {
                sendMessage({
                    action: "getAIResponse",
                    data: {
                        payload,
                        generationId: Date.now(),
                        uuid: state.currentMatchUUID,
                        logData: {
                            uuid: state.currentMatchUUID,
                            analysis: state.sessionMatchProfile.analysis,
                            payload: payload
                        }
                    }
                });
            },
            setUIGeneratingState,
            showErrorInResponseArea,
            hideDebugModal,
            startTimer,
            stopTimer,
            resetTimerDisplay
        };
        showNlpModal(fullGenerationData, debugCallbacks);
    } else {
        sendMessage({
            action: "getFinalPayload",
            data: dataForBackground
        });
    }
}

async function gatherCoreDataForGeneration() {
    const settings = await chrome.storage.local.get('myProfile');
    const myProfile = settings.myProfile || DEFAULTS.myProfile;
    const myName = state.sessionScrapedData?.myName || DEFAULTS.myProfile.split(',')[0].trim();
    const theirName = state.sessionMatchProfile?.metadata?.theirName || 'Match';

    const taskInstructions = {
        myName: myName,
        theirName: theirName,
        goal: document.getElementById(SELECTORS.customInstruction).value.trim(),
        flirtyValue: Number(document.getElementById(SELECTORS.flirtySlider).value),
        lengthValue: Number(document.getElementById(SELECTORS.lengthSlider).value),
        linguisticStyle: document.getElementById(SELECTORS.linguisticStyleSelect).value,
        emojiStrategy: document.getElementById(SELECTORS.emojiStrategySelect).value,
        temperature: parseFloat(document.getElementById(SELECTORS.temperatureSlider).value),
        top_p: parseFloat(document.getElementById(SELECTORS.topPSlider).value),
        endWithQuestion: document.getElementById(SELECTORS.questionToggleCheckbox).checked,
        strictGoalOverride: document.getElementById(SELECTORS.strictGoalToggle).checked,
        forceNewTopic: document.getElementById(SELECTORS.newTopicToggle).checked,
        local_model_name: document.getElementById(SELECTORS.localModelName).value,
    };

    return {
        uuid: state.currentMatchUUID,
        taskInstructions: taskInstructions,
        myProfile: myProfile,
        forceIncludeGeoContext: document.getElementById(SELECTORS.geoContextToggle).checked,
    };
}

function handleCancelClick() {
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

function displayConversationState() {
    if (!state.sessionMatchProfile?.analysis)
        return;
    const analysis = state.sessionMatchProfile.analysis;
    const convoState = analysis.conversationState;
    const dateArcPhase = analysis.memory.dateArcPhase;

    const stateDisplayMap = {
        'OPENER': 'Status: New Conversation (Opener)',
        'EARLY_CONVO': 'Status: Early Conversation',
        'ACTIVE_CONVO': 'Status: Active Conversation',
        'REENGAGING_DAY': 'Status: Re-engaging (1-7 day pause)',
        'REENGAGING_WEEK': 'Status: Re-engaging (1-4 week pause)',
        'REENGAGING_MONTH': 'Status: Re-engaging (1+ month pause)'
    };
    const statusEl = document.getElementById(SELECTORS.conversationStatusDisplay);
    if (statusEl)
        statusEl.textContent = stateDisplayMap[convoState] || 'Status: Unknown';

    const dateIdeaBtn = document.getElementById(SELECTORS.dateIdeaBtn);
    if (dateIdeaBtn) {
        const showButton = dateArcPhase === 'escalation' || dateArcPhase === 'planning';
        dateIdeaBtn.classList.toggle('hidden', !showButton);
    }
}

function handleDateIdeaClick() {
    if (!state.sessionMatchProfile || !state.currentMatchUUID) {
        showErrorInResponseArea("Error: Match profile data not loaded. Please refresh.");
        return;
    }
    setUIGeneratingState(true);
    startTimer(Date.now());

    sendMessage({
        action: 'getAIDateIdea',
        data: {
            uuid: state.currentMatchUUID,
            generationId: Date.now()
        }
    });
}

function handleRefinementClick(event) {
    const btn = event.target.closest('.btn-refine');
    if (!btn)
        return;

    const refinementType = btn.dataset.refineType;
    const responseArea = document.getElementById(SELECTORS.responseArea);
    const originalResponse = responseArea.textContent;

    if (!refinementType || !originalResponse)
        return;

    setUIGeneratingState(true);
    startTimer(Date.now());

    sendMessage({
        action: 'refineAIResponse',
        data: {
            uuid: state.currentMatchUUID,
            originalResponse,
            refinementType,
            generationId: Date.now()
        }
    });
}