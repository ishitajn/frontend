import { SELECTORS, DEFAULTS, USER_LOCATIONS, EMOJI_STRATEGIES, CONVERSATION_STATES, INTENT_OPTIONS } from './constants.js';
import { getToneDescription, getLengthDescription, getEmojiInstruction, getStyleDescription, DATE_ARC_PHASES, LINGUISTIC_STYLES } from '../conversationHelpers.js';
import { state, tooltipTimeout, setTooltipTimeout, timerInterval, setTimerInterval, timerStartTime, setTimerStartTime } from './state.js';
import { createAnalysisView, formatTime } from '../ui-components.js';
import spacetime from '../lib/spacetime.min.js';
import informal from '../lib/spacetime-informal.min.js';

spacetime.extend(informal);


// --- View Management ---

export function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const view = document.getElementById(viewId);
    if (view) {
        view.classList.remove('hidden');
    }
    state.currentViewId = viewId;
}

export function showError(title, message) {
    const titleEl = document.getElementById(SELECTORS.errorTitle);
    const messageEl = document.getElementById(SELECTORS.errorMessage);
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    showView(SELECTORS.errorView);
}

export function showErrorInResponseArea(message) {
    const responseArea = document.getElementById(SELECTORS.responseArea);
    if (responseArea) {
        let displayMessage = message;
        if (typeof message === 'object' && message !== null) {
            displayMessage = message.message || JSON.stringify(message);
        }
        responseArea.textContent = `Error: ${displayMessage}`;
        responseArea.dispatchEvent(new Event('input', { bubbles: true }));
        responseArea.classList.add('error');
    }
}

export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

export function updateLoadingMessage(message) {
    const el = document.getElementById(SELECTORS.loadingMessage);
    if (el) {
        el.textContent = message;
    }
}


// --- UI State & Generation Flow ---

export function setUIRefreshingState(isRefreshing) {
    const generateBtn = document.getElementById(SELECTORS.generateBtn);
    if (generateBtn) {
        generateBtn.disabled = isRefreshing;
        generateBtn.innerHTML = isRefreshing ? 'Refreshing...' : 'Generate';
    }
    if (isRefreshing) {
        showView(SELECTORS.loadingView);
    }
}

export function setUIGeneratingState(isGenerating) {
    const generateBtn = document.getElementById(SELECTORS.generateBtn);
    const cancelBtn = document.getElementById(SELECTORS.cancelBtn);
    const copyBtn = document.getElementById(SELECTORS.copyBtn);
    const responseArea = document.getElementById(SELECTORS.responseArea);
    const refinementActions = document.getElementById(SELECTORS.refinementActions);
    const dateIdeaBtn = document.getElementById(SELECTORS.dateIdeaBtn);

    if (!generateBtn || !cancelBtn || !copyBtn || !responseArea || !refinementActions || !dateIdeaBtn) return;

    generateBtn.disabled = isGenerating;
    dateIdeaBtn.disabled = isGenerating;
    document.querySelectorAll('.btn-refine').forEach(btn => btn.disabled = isGenerating);

    generateBtn.innerHTML = isGenerating ? 'Thinking...' : 'Generate';
    cancelBtn.classList.toggle('hidden', !isGenerating);
    copyBtn.classList.toggle('hidden', isGenerating);
    refinementActions.classList.add('hidden');

    if (isGenerating) {
        responseArea.textContent = '';
        responseArea.dispatchEvent(new Event('input', { bubbles: true }));
        responseArea.classList.add('loading');
        responseArea.classList.remove('error');
    } else {
        dateIdeaBtn.disabled = false;
        dateIdeaBtn.innerHTML = `<svg fill="currentColor" viewBox="0 0 24 24" width="18" height="18"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"></path></svg> Suggest a Date Idea`;
        responseArea.classList.remove('loading');
        if (!responseArea.textContent || responseArea.classList.contains('error')) {
            copyBtn.classList.add('hidden');
        }
    }
}

export function updateUIAfterGeneration(result) {
    const responseArea = document.getElementById(SELECTORS.responseArea);
    const copyBtn = document.getElementById(SELECTORS.copyBtn);
    const refinementActions = document.getElementById(SELECTORS.refinementActions);

    if (!responseArea || !copyBtn || !refinementActions) return;

    if (result?.reply) {
        const cleanReply = result.reply.trim().replace(/^["']|["']$/g, '');
        responseArea.textContent = cleanReply;
        responseArea.dispatchEvent(new Event('input', { bubbles: true }));
        responseArea.classList.remove('error');
        copyBtn.classList.remove('hidden');
        refinementActions.classList.remove('hidden');
        // The original had handleCopyClick() here, we'll need to call that from the orchestrator
    } else {
        showErrorInResponseArea(result?.error || 'Failed to get a response.');
        copyBtn.classList.add('hidden');
        refinementActions.classList.add('hidden');
    }
}


// --- Timers ---

export function startTimer(startTime) {
    stopTimer();
    if (!startTime) return;
    setTimerStartTime(startTime);
    const timerEl = document.getElementById(SELECTORS.responseTimer);
    if (timerEl) {
        updateTimerDisplay();
        setTimerInterval(setInterval(updateTimerDisplay, 1000));
    }
}

export function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    setTimerInterval(null);
}

function updateTimerDisplay() {
    const timerEl = document.getElementById(SELECTORS.responseTimer);
    if (timerEl && timerStartTime > 0) {
        const elapsedSeconds = Math.floor((Date.now() - timerStartTime) / 1000);
        timerEl.textContent = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`;
    }
}

export function resetTimerDisplay() {
    const timerEl = document.getElementById(SELECTORS.responseTimer);
    if (timerEl) {
        timerEl.textContent = '00:00';
    }
    setTimerStartTime(0);
}


// --- UI Component Updates ---

export function populateSelect(selectId, options) {
    const select = document.getElementById(selectId);
    if (select) {
        select.innerHTML = options.map(opt => `<option value="${opt.value}">${opt.text}</option>`).join('');
    }
}

export function updateSliderValueLabel(sliderId, labelId, precision = 1, labelMap = null) {
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(labelId);
    if (slider && label) {
        const value = parseFloat(slider.value);
        label.textContent = labelMap ? (labelMap[Object.keys(labelMap).reverse().find(k => value >= k)] || Object.values(labelMap)[0]) : value.toFixed(precision);
    }
}

export function updateSliderLabels() {
    const flirtyLabels = { 0: 'Neutral', 20: 'Friendly', 40: 'Warm', 60: 'Flirty', 80: 'Very Flirty', 100: 'Daring' };
    const lengthLabels = { 0: 'Micro', 20: 'Short', 40: 'Medium', 60: 'Long', 80: 'Epic', 100: 'Manifesto' };
    updateSliderValueLabel(SELECTORS.flirtySlider, SELECTORS.flirtyValueLabel, 0, flirtyLabels);
    updateSliderValueLabel(SELECTORS.lengthSlider, SELECTORS.lengthValueLabel, 0, lengthLabels);
}

export function updateClearButtonVisibility(inputEl, clearBtnEl) {
    const hasContent = (inputEl.value && inputEl.value.trim() !== '') || (inputEl.textContent && inputEl.textContent.trim() !== '');
    clearBtnEl.classList.toggle('hidden', !hasContent);
}

function getTooltipContent(tooltipId) {
    const flirtyValue = Number(document.getElementById(SELECTORS.flirtySlider).value);
    const lengthValue = Number(document.getElementById(SELECTORS.lengthSlider).value);
    const linguisticStyle = document.getElementById(SELECTORS.linguisticStyleSelect).value;
    const styleDescriptions = { 'auto': '<strong>Auto:</strong> Adapts to the match’s last message.', 'casual': '<strong>Casual:</strong> Relaxed, everyday flow.', 'witty': '<strong>Witty:</strong> Clever wordplay and banter.', 'playful': '<strong>Playful:</strong> Fun, cheeky vibe.', 'direct': '<strong>Direct:</strong> Straightforward and confident.', 'intellectual': '<strong>Intellectual:</strong> Thoughtful and deep.', 'poetic': '<strong>Poetic:</strong> Vivid and expressive language.', 'charming': '<strong>Charming:</strong> Polished and charismatic.', 'sarcastic': '<strong>Sarcastic:</strong> Dry humor and irony.', 'sexual': '<strong>Sexual:</strong> Bold and evocative.', 'mysterious': '<strong>Mysterious:</strong> Enigmatic and intriguing.' };
    const emojiDescriptions = { 'auto': "<strong>Auto:</strong> " + getEmojiInstruction('auto', flirtyValue, linguisticStyle), 'friendly': "<strong>Friendly:</strong> " + getEmojiInstruction('friendly', flirtyValue, linguisticStyle), 'playful': "<strong>Playful:</strong> " + getEmojiInstruction('playful', flirtyValue, linguisticStyle), 'bold': "<strong>Bold:</strong> " + getEmojiInstruction('bold', flirtyValue, linguisticStyle), 'no_emoji': "<strong>No Emoji:</strong> No emojis will be used." };
    switch (tooltipId) {
        case 'flirt-info': return getToneDescription(flirtyValue);
        case 'length-info': return getLengthDescription(lengthValue);
        case 'style-info': return styleDescriptions[linguisticStyle] || "Select a style.";
        case 'emoji-info': return emojiDescriptions[document.getElementById(SELECTORS.emojiStrategySelect).value] || "Select a strategy.";
        case 'start-fresh-info': return "<strong>Start Fresh:</strong> Ignores their last message and generates a new opener from their profile.";
        default: return null;
    }
}

export function handleTooltipShow(event) {
    clearTimeout(tooltipTimeout);
    const icon = event.currentTarget;
    const tooltipId = icon.dataset.tooltipId;
    const tooltip = document.getElementById(SELECTORS.infoTooltip);
    const content = getTooltipContent(tooltipId);
    if (!content || !tooltip) return;
    tooltip.innerHTML = content;
    const iconRect = icon.getBoundingClientRect();
    const bodyRect = document.body.getBoundingClientRect();
    const popupRect = document.querySelector('.app-container').getBoundingClientRect();
    tooltip.style.visibility = 'hidden';
    tooltip.classList.add('visible');
    let left = iconRect.left - bodyRect.left + (iconRect.width / 2) - (tooltip.offsetWidth / 2);
    if (left < 0) left = 5;
    if (left + tooltip.offsetWidth > popupRect.width) left = popupRect.width - tooltip.offsetWidth - 5;
    tooltip.style.top = `${iconRect.bottom - bodyRect.top + 8}px`;
    tooltip.style.left = `${left}px`;
    tooltip.style.visibility = 'visible';
}

export function handleTooltipHide() {
    setTooltipTimeout(setTimeout(() => {
        document.getElementById(SELECTORS.infoTooltip)?.classList.remove('visible');
    }, 100));
}


// --- Dynamic Content Rendering ---

export function updateGeoContextDisplay(geoContextData) {
    if (!state.sessionMatchProfile || !state.sessionScrapedData) return;
    const { myName } = state.sessionScrapedData;
    const { theirName, matchLocation } = state.sessionMatchProfile.metadata;
    const settings = { userLocationChoice: document.getElementById(SELECTORS.userLocationSelect).value };
    const userLocationData = USER_LOCATIONS[settings.userLocationChoice || 'autodetect'];
    const dataMap = geoContextData ? { geoUserName: myName || 'User', geoMatchName: theirName || 'Match', userLocation: userLocationData.name.split(',')[0], matchLocation: matchLocation || 'N/A', userTimeOfDay: geoContextData.userTimeOfDay || 'N/A', matchTimeOfDay: geoContextData.matchTimeOfDay || 'N/A', userTimezone: geoContextData.userTimeZoneName || userLocationData.timeZone || 'N/A', matchCountry: geoContextData.matchCountry || 'N/A', userCountry: geoContextData.userCountry || userLocationData.country || 'N/A', timeDifference: geoContextData.timeZoneDifference !== null ? `${geoContextData.timeZoneDifference} hour(s)` : 'N/A', distanceInfo: geoContextData.distance ? `${geoContextData.distance.miles} miles / ${geoContextData.distance.km} km` : 'N/A' } : { geoUserName: myName || 'User', geoMatchName: theirName || 'Match', userLocation: 'N/A', matchLocation: 'N/A', userTimeOfDay: 'N/A', matchTimeOfDay: 'N/A', userTimezone: 'N/A', matchCountry: 'N/A', userCountry: 'N/A', timeDifference: 'N/A', distanceInfo: 'N/A' };
    document.getElementById('user-time').textContent = 'N/A';
    document.getElementById('match-time').textContent = 'N/A';
    for (const [key, text] of Object.entries(dataMap)) {
        const el = document.getElementById(SELECTORS[key]);
        if (el) el.textContent = text || 'N/A';
    }
    const userTimeEl = document.getElementById('user-time');
    const matchTimeEl = document.getElementById('match-time');
    const userTz = geoContextData?.userTimeZoneName || userLocationData?.timeZone;
    const matchTz = geoContextData?.matchTimezone;
    userTimeEl.textContent = userTz ? spacetime.now(userTz).format('h:mm a') : formatTime(new Date());
    matchTimeEl.textContent = matchTz ? spacetime.now(matchTz).format('h:mm a') : 'N/A';
}

function updateAnalysisTabs(analysis) {
    if (!analysis) return;
    const fallbackKeys = analysis.fallbackKeys || [];
    const constants = { CONVERSATION_STATES, INTENT_OPTIONS, DATE_ARC_PHASES };
    const { analysisHtml, memoryHtml } = createAnalysisView(analysis, fallbackKeys, constants);
    const analysisContainer = document.getElementById('analysis');
    if (analysisContainer) analysisContainer.innerHTML = analysisHtml;
    const memoryContainer = document.getElementById('memory');
    if (memoryContainer) memoryContainer.innerHTML = memoryHtml;
}

export function displayConversationState() {
    if (!state.sessionMatchProfile?.analysis) return;
    const analysis = state.sessionMatchProfile.analysis;
    const convoState = analysis.state;
    const dateArcPhase = analysis.memory?.dateArcPhase;
    const stateDisplayMap = { 'OPENER': 'Status: New Conversation (Opener)', 'EARLY_CONVO': 'Status: Early Conversation', 'ACTIVE_CONVO': 'Status: Active Conversation', 'REENGAGING_DAY': 'Status: Re-engaging (1-7 day pause)', 'REENGAGING_WEEK': 'Status: Re-engaging (1-4 week pause)', 'REENGAGING_MONTH': 'Status: Re-engaging (1+ month pause)' };
    const statusEl = document.getElementById(SELECTORS.conversationStatusDisplay);
    if (statusEl) statusEl.textContent = stateDisplayMap[convoState] || 'Status: Unknown';
    const dateIdeaBtn = document.getElementById(SELECTORS.dateIdeaBtn);
    if (dateIdeaBtn) {
        const showButton = dateArcPhase === 'escalation' || dateArcPhase === 'planning';
        dateIdeaBtn.classList.toggle('hidden', !showButton);
    }
    updateAnalysisTabs(analysis);
}
