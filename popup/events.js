import { SELECTORS, DEFAULTS } from '../shared/constants.js';
import { state } from './state.js';
import { sendMessage } from './api.js';
import { showView, updateSliderLabels, updateSliderValueLabel, handleTooltipShow, handleTooltipHide, updateClearButtonVisibility, showErrorInResponseArea, setUIGeneratingState, startTimer } from './ui.js';
import { handlePersistentSetting, handleMatchReset, handleMasterReset } from './settings.js';
import { setNestedValue } from '../ui-components.js';


// --- Event Handlers ---

/**
 * Throttles a function so it only runs at most once every `limit` milliseconds.
 * @param {Function} func The function to throttle.
 * @param {number} limit The timeout limit in milliseconds.
 * @returns {Function} The throttled function.
 */
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

/**
 * Handles the click event for the 'Generate' button.
 * Gathers all UI settings and sends them to the background script to get a response.
 * If debug mode is enabled, it shows the debug modal instead.
 */
async function handleGenerateClick() {
    if (!state.sessionMatchProfile || !state.currentMatchUUID || !state.sessionMatchProfile.analysis) {
        showErrorInResponseArea("Error: Conversation analysis is not complete. Please wait a moment and try again.");
        // In the future, the orchestrator could call refreshDataAndUI() here.
        return;
    }

    // Start UI feedback immediately on click
    setUIGeneratingState(true);
    startTimer(Date.now());

    const dataForBackground = await gatherCoreDataForGeneration();
    if (document.getElementById(SELECTORS.debugModeToggle).checked) {
        const { showNlpModal, hideDebugModal } = await import('../debug-modal.js');

        // Robustly construct the data payload for the debug modal
        const fullGenerationData = {
            myName: state.sessionScrapedData?.myName || 'Me',
            theirName: state.sessionMatchProfile?.metadata?.theirName || 'Match',
            myProfile: dataForBackground.myProfile,
            theirProfile: state.sessionMatchProfile?.metadata?.theirProfile || '',
            conversationHistory: state.sessionMatchProfile?.conversationHistory || [],
            conversationAnalysis: state.sessionMatchProfile?.analysis || {},
            geoContextData: state.sessionMatchProfile?.memory?.geoContextData || null,
            forceIncludeGeoContext: dataForBackground.forceIncludeGeoContext,
            taskInstructions: dataForBackground.taskInstructions,
        };

        const debugCallbacks = {
            sendFinalPayloadToAI: (payload) => {
                sendMessage({
                    action: "getAIResponse",
                    data: { payload, generationId: Date.now(), uuid: state.currentMatchUUID, logData: { uuid: state.currentMatchUUID, analysis: state.sessionMatchProfile.analysis, payload } }
                });
            },
            setUIGeneratingState,
            showErrorInResponseArea,
            hideDebugModal,
            startTimer
        };
        showNlpModal(fullGenerationData, debugCallbacks);
    } else {
        sendMessage({ action: "getFinalPayload", data: dataForBackground });
    }
}

/**
 * Handles the click event for the 'Cancel' button.
 */
function handleCancelClick() {
    if (state.currentMatchUUID) {
        sendMessage({ action: "cancelGeneration", data: { uuid: state.currentMatchUUID } });
    }
}

/**
 * Handles the click event for the 'Copy' button.
 */
function handleCopyClick() {
    const responseArea = document.getElementById(SELECTORS.responseArea);
    if (!responseArea || !responseArea.textContent) return;
    navigator.clipboard.writeText(responseArea.textContent);
    // We can call showToast from ui.js here if we import it.
}

function handleDateIdeaClick() {
    if (!state.sessionMatchProfile || !state.currentMatchUUID) {
        showErrorInResponseArea("Error: Match profile data not loaded. Please refresh.");
        return;
    }
    setUIGeneratingState(true);
    startTimer(Date.now());
    sendMessage({ action: 'getAIDateIdea', data: { uuid: state.currentMatchUUID, generationId: Date.now() } });
}

function handleRefinementClick(event) {
    const btn = event.target.closest('.btn-refine');
    if (!btn) return;

    const refinementType = btn.dataset.refineType;
    const responseArea = document.getElementById(SELECTORS.responseArea);
    const originalResponse = responseArea.textContent;

    if (!refinementType || !originalResponse) return;

    setUIGeneratingState(true);
    startTimer(Date.now());
    sendMessage({ action: 'refineAIResponse', data: { uuid: state.currentMatchUUID, originalResponse, refinementType, generationId: Date.now() } });
}

function handleAdvancedSettingsToggle(event) {
    const advancedSettings = document.getElementById('advanced-settings');
    if (advancedSettings) {
        advancedSettings.classList.toggle('hidden', !event.target.checked);
    }
}

async function handleSettingChange(event) {
    const el = event.target;
    if (el.id === SELECTORS.customInstruction) {
        updateClearButtonVisibility(el, document.getElementById(SELECTORS.clearInstructionBtn));
    } else if (el.id === SELECTORS.responseArea) {
        updateClearButtonVisibility(el, document.getElementById(SELECTORS.clearResponseBtn));
        document.getElementById(SELECTORS.refinementActions).classList.add('hidden');
    }

    const dataPath = el.dataset.path;
    if (dataPath && state.sessionMatchProfile) {
        let value;
        if (el.type === 'checkbox') value = el.checked;
        else if (el.type === 'range' || el.type === 'number') value = parseFloat(el.value);
        else if (el.multiple) value = Array.from(el.selectedOptions).map(opt => opt.value);
        else value = el.value;
        if (dataPath.endsWith('insideJokes') || dataPath.endsWith('avoidedTopics') || dataPath.endsWith('questionHistory')) {
            value = el.value.split('\n').filter(Boolean);
        }
        setNestedValue(state.sessionMatchProfile, dataPath, value);
    }

    await handlePersistentSetting(el);
}

/**
 * Gathers all necessary data from the UI to send to the background script for generation.
 * @returns {Promise<object>} A promise that resolves to the data object.
 */
async function gatherCoreDataForGeneration() {
    const settings = await chrome.storage.local.get('myProfile');
    const myProfile = settings.myProfile || DEFAULTS.myProfile;
    const myName = state.sessionScrapedData?.myName || 'Me';
    const theirName = state.sessionMatchProfile?.metadata?.theirName || 'Match';

    return {
        uuid: state.currentMatchUUID,
        taskInstructions: {
            myName,
            theirName,
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
        },
        myProfile,
        forceIncludeGeoContext: document.getElementById(SELECTORS.geoContextToggle).checked,
    };
}

/**
 * Sets up the event listeners for the main tab navigation (Tune, Analysis, etc.).
 */
function setupTabs() {
    const tabContainer = document.querySelector('.tab-bar');
    if (!tabContainer) return;
    tabContainer.addEventListener('click', (event) => {
        const clickedTab = event.target.closest('.tab-link');
        if (!clickedTab || clickedTab.classList.contains('active')) return;
        const targetTabName = clickedTab.dataset.tab;
        const targetPanel = document.getElementById(targetTabName);
        document.querySelectorAll('.tab-link').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
        clickedTab.classList.add('active');
        if (targetPanel) targetPanel.classList.add('active');
    });
}

/**
 * Attaches all event listeners to the DOM elements in the popup.
 * This is the single entry point for all event setup.
 * @param {Function} refreshDataAndUI - A callback function to refresh data, passed from the main orchestrator.
 */
export function setupEventListeners(refreshDataAndUI) {
    setupTabs();
    window.addEventListener('focus', refreshDataAndUI);
    document.getElementById(SELECTORS.generateBtn)?.addEventListener('click', handleGenerateClick);
    document.getElementById(SELECTORS.copyBtn)?.addEventListener('click', handleCopyClick);
    document.getElementById(SELECTORS.cancelBtn)?.addEventListener('click', handleCancelClick);
    document.getElementById(SELECTORS.settingsBtn)?.addEventListener('click', () => showView(SELECTORS.settingsView));
    document.getElementById(SELECTORS.backBtn)?.addEventListener('click', () => showView(SELECTORS.mainView));
    document.getElementById(SELECTORS.masterResetBtn)?.addEventListener('click', handleMasterReset);
    document.getElementById(SELECTORS.resetMatchBtn)?.addEventListener('click', handleMatchReset);

    // Throttle slider inputs to prevent excessive UI updates
    const throttledUpdateSliderLabels = throttle(updateSliderLabels, 100);
    const throttledUpdateTempLabel = throttle(() => updateSliderValueLabel(SELECTORS.temperatureSlider, SELECTORS.temperatureValueLabel), 100);
    const throttledUpdateTopPLabel = throttle(() => updateSliderValueLabel(SELECTORS.topPSlider, SELECTORS.topPValueLabel, 2), 100);

    document.getElementById(SELECTORS.flirtySlider)?.addEventListener('input', throttledUpdateSliderLabels);
    document.getElementById(SELECTORS.lengthSlider)?.addEventListener('input', throttledUpdateSliderLabels);
    document.getElementById(SELECTORS.temperatureSlider)?.addEventListener('input', throttledUpdateTempLabel);
    document.getElementById(SELECTORS.topPSlider)?.addEventListener('input', throttledUpdateTopPLabel);

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
        area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    document.getElementById(SELECTORS.clearInstructionBtn)?.addEventListener('click', () => {
        const area = document.getElementById(SELECTORS.customInstruction);
        area.value = '';
        area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    document.getElementById(SELECTORS.dateIdeaBtn)?.addEventListener('click', handleDateIdeaClick);
    document.getElementById(SELECTORS.refinementActions)?.addEventListener('click', handleRefinementClick);
    document.getElementById('advanced-settings-toggle')?.addEventListener('click', handleAdvancedSettingsToggle);
}
