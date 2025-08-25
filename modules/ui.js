import { LINGUISTIC_STYLES, getToneDescription, getLengthDescription, getEmojiInstruction, getStyleDescription } from '../conversationHelpers.js';
import { EMOJI_STRATEGIES, USER_LOCATIONS } from './config.js';

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
    isVirtual: 'is-virtual',
    conversationAnalysisDisplay: 'conversation-analysis-display',
    topicsDisplay: 'topics-display',
    suggestionsDisplay: 'suggestions-display',
    dateIdeaBtn: 'date-idea-btn',
    refinementActions: 'refinement-actions',
};

let tooltipTimeout, timerInterval = null, timerStartTime = 0;

export function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const view = document.getElementById(viewId);
    if (view)
        view.classList.remove('hidden');
}

export function showError(title, message) {
    const titleEl = document.getElementById(SELECTORS.errorTitle);
    const messageEl = document.getElementById(SELECTORS.errorMessage);
    if (titleEl)
        titleEl.textContent = title;
    if (messageEl)
        messageEl.textContent = message;
    showView(SELECTORS.errorView);
}

export function showErrorInResponseArea(message) {
    const responseArea = document.getElementById(SELECTORS.responseArea);
    if (responseArea) {
        responseArea.textContent = `Error: ${message}`;
        responseArea.dispatchEvent(new Event('input', {
                bubbles: true
            }));
        responseArea.classList.add('error');
    }
}

export function setUIRefreshingState(isRefreshing) {
    const generateBtn = document.getElementById(SELECTORS.generateBtn);
    if (generateBtn) {
        generateBtn.disabled = isRefreshing;
        if (isRefreshing)
            generateBtn.innerHTML = 'Refreshing...';
        else
            generateBtn.innerHTML = 'Generate';
    }
    if (isRefreshing)
        showView(SELECTORS.loadingView);
}

export function setUIGeneratingState(isGenerating) {
    const generateBtn = document.getElementById(SELECTORS.generateBtn);
    const cancelBtn = document.getElementById(SELECTORS.cancelBtn);
    const copyBtn = document.getElementById(SELECTORS.copyBtn);
    const responseArea = document.getElementById(SELECTORS.responseArea);
    const refinementActions = document.getElementById(SELECTORS.refinementActions);
    const dateIdeaBtn = document.getElementById(SELECTORS.dateIdeaBtn);

    if (!generateBtn || !cancelBtn || !copyBtn || !responseArea || !refinementActions || !dateIdeaBtn)
        return;

    generateBtn.disabled = isGenerating;
    dateIdeaBtn.disabled = isGenerating;
    document.querySelectorAll('.btn-refine').forEach(btn => btn.disabled = isGenerating);

    generateBtn.innerHTML = isGenerating ? 'Thinking...' : 'Generate';
    cancelBtn.classList.toggle('hidden', !isGenerating);
    copyBtn.classList.toggle('hidden', isGenerating);
    refinementActions.classList.add('hidden');

    if (isGenerating) {
        responseArea.textContent = '';
        responseArea.dispatchEvent(new Event('input', {
                bubbles: true
            }));
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

    if (!responseArea || !copyBtn || !refinementActions)
        return;

    if (result?.reply) {
        const cleanReply = result.reply.trim().replace(/^["']|["']$/g, '');
        responseArea.textContent = cleanReply;
        responseArea.dispatchEvent(new Event('input', {
                bubbles: true
            }));
        responseArea.classList.remove('error');
        copyBtn.classList.remove('hidden');
        refinementActions.classList.remove('hidden');
        handleCopyClick();
    } else {
        showErrorInResponseArea(result?.error || 'Failed to get a response.');
        copyBtn.classList.add('hidden');
        refinementActions.classList.add('hidden');
    }
}

export function populateSelect(selectId, options) {
    const select = document.getElementById(selectId);
    if (select)
        select.innerHTML = options.map(opt => `<option value="${opt.value}">${opt.text}</option>`).join('');
}

export function updateSliderLabels() {
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

export function updateSliderValueLabel(sliderId, labelId, precision = 1, labelMap = null) {
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(labelId);
    if (slider && label) {
        const value = parseFloat(slider.value);
        label.textContent = labelMap ? (labelMap[Object.keys(labelMap).reverse().find(k => value >= k)] || Object.values(labelMap)[0]) : value.toFixed(precision);
    }
}

export function handleTooltipShow(event) {
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

export function handleTooltipHide() {
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

export function updateGeoContextDisplay(geoContext, sessionMatchProfile, sessionScrapedData) {
    const dataMap = {
        geoUserName: sessionMatchProfile?.metadata?.myName ?? 'User',
        geoMatchName: sessionMatchProfile?.metadata?.theirName ?? 'Match',
        userLocation: geoContext?.user_location?.city ?? 'N/A',
        matchLocation: geoContext?.match_location?.city ?? 'N/A',
        userTime: geoContext?.user_location?.time ?? 'N/A',
        matchTime: geoContext?.match_location?.time ?? 'N/A',
        userTimeOfDay: geoContext?.user_location?.time_of_day ?? 'N/A',
        matchTimeOfDay: geoContext?.match_location?.time_of_day ?? 'N/A',
        userTimezone: geoContext?.user_location?.time_zone ?? 'N/A',
        matchTimezone: geoContext?.match_location?.time_zone ?? 'N/A',
        userCountry: geoContext?.user_location?.country ?? 'N/A',
        matchCountry: geoContext?.match_location?.country ?? 'N/A',
        timeDifference: geoContext?.time_difference !== null ? `${geoContext.time_difference} hour(s)` : 'N/A',
        distanceInfo: geoContext?.distance !== null ? `${Math.round(geoContext.distance)} miles` : 'N/A',
        isVirtual: geoContext?.is_virtual ? 'Yes' : 'No'
    };

    Object.entries(dataMap).forEach(([id, text]) => {
        const el = document.getElementById(SELECTORS[id]);
        if (el) el.textContent = text ?? 'N/A';
    });
}

export function updateConversationAnalysisDisplay(analysis) {
    const displayEl = document.getElementById(SELECTORS.conversationAnalysisDisplay);
    if (!displayEl) return;

    const parts = [];
    const sentiment = analysis?.sentiment;
    const flirtation_level = analysis?.flirtation_level;
    const engagement = analysis?.engagement;
    const pace = analysis?.pace;

    if (typeof sentiment === 'number') {
        const sentimentEmoji = sentiment > 0.5 ? '🟢' : sentiment < -0.5 ? '🔴' : '🟡';
        parts.push(`<span>${sentimentEmoji} Sentiment: ${sentiment.toFixed(2)}</span>`);
    }

    if (typeof flirtation_level === 'number') {
        const flirtEmoji = flirtation_level > 0.7 ? '🔥' : flirtation_level > 0.4 ? '😏' : '😊';
        parts.push(`<span>${flirtEmoji} Flirtation: ${flirtation_level.toFixed(2)}</span>`);
    }

    if (typeof engagement === 'number') {
        const engagementEmoji = engagement > 0.6 ? '💬' : '...';
        parts.push(`<span>${engagementEmoji} Engagement: ${engagement.toFixed(2)}</span>`);
    }

    if (typeof pace === 'number') {
        const paceEmoji = pace > 10 ? '🐇' : pace < 2 ? '🐢' : '🚶';
        parts.push(`<span>${paceEmoji} Pace: ${pace.toFixed(2)}</span>`);
    }

    displayEl.innerHTML = parts.join(' | ');
}

export function updateTopicsDisplay(analysis) {
    const displayEl = document.getElementById(SELECTORS.topicsDisplay);
    if (!displayEl) return;

    const topics = analysis?.topics;
    const recent_topics = analysis?.recent_topics;

    if (!topics) {
        displayEl.innerHTML = '';
        return;
    }

    const topicCategories = ['focus', 'avoid', 'neutral', 'sensitive', 'romantic', 'fetish', 'sexual'];

    let html = '<strong>Topics:</strong> ';
    topicCategories.forEach(category => {
        if (topics[category] && topics[category].length > 0) {
            const emoji = {
                focus: '🎯',
                avoid: '🔴',
                neutral: '🟢',
                sensitive: '🟠',
                romantic: '💜',
                fetish: '🤫',
                sexual: '🔞'
            }[category];
            html += `<span class="topic-category">${emoji} ${category}: ${topics[category].join(', ')}</span> | `;
        }
    });

    if (recent_topics && recent_topics.length > 0) {
        html += `<br><strong>Recent:</strong> ${recent_topics.join(' → ')}`;
    }

    displayEl.innerHTML = html;
}

export function updateSuggestionsDisplay(analysis) {
    const displayEl = document.getElementById(SELECTORS.suggestionsDisplay);
    if (!displayEl) return;

    if (!analysis) {
        displayEl.innerHTML = '';
        return;
    }

    const { suggest_flirtation, suggest_topic_shift, suggest_follow_up_question, suggest_greeting, topic_shift_recommended } = analysis;
    let html = '<strong>Suggestions:</strong> ';
    const suggestions = [];
    if (suggest_flirtation) suggestions.push('Flirt more');
    if (suggest_topic_shift) suggestions.push('Shift topic');
    if (suggest_follow_up_question) suggestions.push('Ask a question');
    if (suggest_greeting) suggestions.push('Say hi');

    if (topic_shift_recommended) {
        html += '<span class="suggestion-notice">Topic shift recommended!</span> ';
    }

    html += suggestions.map(s => `<span class="suggestion-badge">${s}</span>`).join(' ');
    displayEl.innerHTML = html;
}

export function startTimer(startTime) {
    stopTimer();
    if (!startTime)
        return;
    timerStartTime = startTime;
    const timerEl = document.getElementById(SELECTORS.responseTimer);
    if (timerEl) {
        updateTimerDisplay();
        timerInterval = setInterval(updateTimerDisplay, 1000);
    }
}

export function stopTimer() {
    if (timerInterval)
        clearInterval(timerInterval);
    timerInterval = null;
}

export function updateTimerDisplay() {
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
    timerStartTime = 0;
}

export function updateClearButtonVisibility(inputEl, clearBtnEl) {
    const hasContent = (inputEl.value && inputEl.value.trim() !== '') || (inputEl.textContent && inputEl.textContent.trim() !== '');
    clearBtnEl.classList.toggle('hidden', !hasContent);
}
