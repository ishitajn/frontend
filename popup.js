// popup.js (Re-architected for Manifest V3 Robustness with Heartbeat)
import { scrapeBumblePage, pasteTextIntoBumbleInput, scrapeTinderPage, pasteTextIntoTinderInput } from './content-scraper.js';
import { EMOJI_STRATEGIES, USER_LOCATIONS, SELECTORS, DEBUG } from './popup_modules/constants.js';
import { LINGUISTIC_STYLES } from './conversationHelpers.js';
import { state } from './popup_modules/state.js';
import { initializeApi, sendMessage, startHeartbeat, stopHeartbeat } from './popup_modules/api.js';
import { loadAndApplySettings } from './popup_modules/settings.js';
import { setupEventListeners } from './popup_modules/events.js';
import {
    showView, showError, updateLoadingMessage, setUIRefreshingState, showErrorInResponseArea,
    displayConversationState, updateGeoContextDisplay, populateSelect, setUIGeneratingState,
    startTimer, stopTimer, resetTimerDisplay, updateUIAfterGeneration
} from './popup_modules/ui.js';

// --- Main Application Logic ---

// This function is now defined in the main popup.js file as it orchestrates multiple modules.
function syncUIWithState(generationState) {
    if (!generationState) return;

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
            updateUIAfterGeneration({ reply: generationState.response });
            autoType(generationState.response);
        } else if (generationState.error) {
            updateUIAfterGeneration({ error: generationState.error });
        }
    }
}

async function autoType(text) {
    if (!state.pasterFn) return;
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: state.pasterFn,
                args: [text]
            });
        }
    } catch (error) {
        DEBUG.error('AUTOTYPE', 'Failed to auto-type', error);
    }
}

/**
 * Initializes the entire popup application.
 * This function is the main entry point.
 */
async function initializePopup() {
    // 1. Setup API listeners to handle responses from the background script
    initializeApi({
        'nlpAnalysisResponse': handleNlpAnalysisResponse,
        'finalPayloadResponse': handleFinalPayloadResponse,
        'generationUpdate': (message) => {
            if (message.uuid === state.currentMatchUUID) {
                syncUIWithState(message.state);
            }
        },
        'generationStateResponse': syncUIWithState,
    });

    // 2. Setup all DOM event listeners
    setupEventListeners(refreshDataAndUI);

    // 3. Populate UI elements that require data
    populateSelect(SELECTORS.linguisticStyleSelect, LINGUISTIC_STYLES.map(s => ({ value: s, text: s.charAt(0).toUpperCase() + s.slice(1) })));
    populateSelect(SELECTORS.emojiStrategySelect, Object.entries(EMOJI_STRATEGIES).map(([value, text]) => ({ value, text })));
    populateSelect(SELECTORS.userLocationSelect, Object.entries(USER_LOCATIONS).map(([key, loc]) => ({ value: key, text: loc.name })));

    // 4. Load settings from storage and apply them to the UI
    await loadAndApplySettings();

    // 5. Get user's location if they've consented
    const settings = await chrome.storage.local.get(['userLocationChoice', 'apiConsent']);
    if (settings.userLocationChoice === 'autodetect' && settings.apiConsent) {
        navigator.geolocation.getCurrentPosition(
            (position) => sendMessage({ action: 'updateUserGeo', data: { latitude: position.coords.latitude, longitude: position.coords.longitude } }),
            (error) => console.warn('Could not get user location:', error.message),
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 1000 * 60 * 30 }
        );
    }

    // 6. Start the data refresh and analysis process
    await refreshDataAndUI();
}

/**
 * Fetches the latest data from the page and triggers the analysis pipeline.
 */
async function refreshDataAndUI() {
    if (state.isRefreshing) {
        DEBUG.log('REFRESH', 'Refresh already in progress. Skipping.');
        return;
    }
    state.isRefreshing = true;

    // Await the generation state before proceeding to prevent UI flicker.
    const generationState = await new Promise(resolve => {
        const port = state.port;
        if (!port) {
            resolve({ isGenerating: false });
            return;
        }

        const listener = (msg) => {
            if (msg.action === 'generationStateResponse' && (!state.currentMatchUUID || msg.uuid === state.currentMatchUUID)) {
                port.onMessage.removeListener(listener);
                clearTimeout(timeoutId);
                resolve(msg.state);
            }
        };

        const timeoutId = setTimeout(() => {
            port.onMessage.removeListener(listener);
            console.warn("getGenerationState timed out.");
            resolve({ isGenerating: false });
        }, 500);

        port.onMessage.addListener(listener);
        sendMessage({ action: "getGenerationState", data: { uuid: state.currentMatchUUID } });
    });

    if (generationState && generationState.isGenerating) {
        syncUIWithState(generationState);
        state.isRefreshing = false; // Reset flag
        return; // Stop execution here, preventing the loading screen from showing.
    }

    setUIRefreshingState(true);
    updateLoadingMessage('Scraping page...');

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        let scraperFn, pasterFn;

        if (tab.url?.startsWith("https://tinder.com/")) {
            scraperFn = scrapeTinderPage;
            pasterFn = pasteTextIntoTinderInput;
        } else if (tab.url?.startsWith("https://bumble.com/")) {
            scraperFn = scrapeBumblePage;
            pasterFn = pasteTextIntoBumbleInput;
        } else {
            throw new Error('Unsupported Site: Please navigate to a conversation on Tinder.com or Bumble.com.');
        }
        state.pasterFn = pasterFn;

        const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, function: scraperFn });
        const pageData = results[0]?.result;

        if (!pageData || pageData.error) {
            throw new Error(`Could not read page. ${pageData?.error || 'Please make sure a conversation is selected.'}`);
        }

        state.sessionScrapedData = pageData;
        updateLoadingMessage('Analyzing conversation...');
        sendMessage({ action: "getNlpAnalysis", data: { scrapedData: pageData } });

    } catch (e) {
        const errorMessage = e.message.includes('Could not read page')
            ? "The scraper could not read the page content. The dating site may have updated its design."
            : e.message;
        showError('Scraping Failed', errorMessage);
        DEBUG.error('INIT', 'Refresh failed', e);
    } finally {
        state.isRefreshing = false;
        setUIRefreshingState(false);
    }
}


// --- Message Handlers (called by api.js) ---

async function handleNlpAnalysisResponse(message) {
    DEBUG.log('NLP_RESPONSE', 'Received NLP analysis response', message);
    if (message.error) {
        showError('Analysis Failed', message.error.message || 'An unknown error occurred during analysis.');
        return;
    }

    state.sessionMatchProfile = message.matchProfile;
    state.currentMatchUUID = message.matchProfile.uuid;

    await loadAndApplySettings();
    updateGeoContextDisplay(state.sessionMatchProfile.memory.geoContextData);

    const geoTabButton = document.querySelector('.tab-link[data-tab="geo"]');
    if (geoTabButton) {
        geoTabButton.style.display = state.sessionMatchProfile.memory?.geoContextData ? '' : 'none';
    }

    displayConversationState();
    showView(SELECTORS.mainView);
}

function handleFinalPayloadResponse(message) {
    if (message.error) {
        showErrorInResponseArea(message.error);
        syncUIWithState({ isGenerating: false });
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

// --- Entry Point ---
document.addEventListener('DOMContentLoaded', initializePopup);