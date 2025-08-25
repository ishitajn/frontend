import { EMOJI_STRATEGIES, USER_LOCATIONS } from './config.js';
import { generatePrompts } from './prompts.js';

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

export function updateSliderValueLabel(sliderId, labelId, precision = 1, labelMap = null) {
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(labelId);
    if (slider && label) {
        const value = parseFloat(slider.value);
        label.textContent = labelMap ? (labelMap[Object.keys(labelMap).reverse().find(k => value >= k)] || Object.values(labelMap)[0]) : value.toFixed(precision);
    }
}

// The tooltip functions are removed as they depended on deleted helpers.
// A new tooltip implementation would be needed if this feature is required.

export function updateGeoContextDisplay(geoContext, sessionMatchProfile, sessionScrapedData) {
    if (!sessionMatchProfile || !sessionScrapedData) return;

    const { myName } = sessionScrapedData;
    const { theirName } = sessionMatchProfile.metadata;
    const card = document.getElementById(SELECTORS.geoContextCard);

    if (card) card.hidden = !geoContext;
    if (!geoContext) return;

    const { userLocation, matchLocation, distance_miles, timeZoneDifference, countryDifference } = geoContext;

    const dataMap = {
        geoUserName: myName || 'User',
        geoMatchName: theirName || 'Match',
        userLocation: userLocation?.city || 'Your Location',
        matchLocation: matchLocation?.city || 'Their Location',
        userTimeOfDay: userLocation?.timeOfDay || 'N/A',
        matchTimeOfDay: matchLocation?.timeOfDay || 'N/A',
        userTimezone: userLocation?.timeZone || 'N/A',
        matchTimezone: matchLocation?.timeZone || 'N/A',
        userCountry: userLocation?.country || 'N/A',
        matchCountry: matchLocation?.country || 'N/A',
        timeDifference: timeZoneDifference !== null ? `${timeZoneDifference} hour(s)` : 'N/A',
        distanceInfo: distance_miles !== null ? `${Math.round(distance_miles)} miles` : 'N/A',
        countryDifference: countryDifference ? 'Yes' : 'No'
    };

    Object.entries(dataMap).forEach(([id, text]) => {
        const el = document.getElementById(SELECTORS[id]);
        if (el) el.textContent = text ?? 'N/A';
    });
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

// --- Tab Functions ---

function switchTab(event) {
    const tabButton = event.currentTarget;
    const tabId = tabButton.dataset.tab;

    document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    tabButton.classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

export function initializeTabs() {
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', switchTab);
    });
}

export function createCollapsibleJSON(title, dataObject, isEditable = false) {
    if (dataObject === null || typeof dataObject === 'undefined') {
        return `<div class="collapsible-json-container"><details><summary>${title}</summary><pre style="color: var(--text-muted);">Not available</pre></details></div>`;
    }
    const jsonString = JSON.stringify(dataObject, null, 2);
    const copyIconSVG = `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"></path></svg>`;
    return `
        <div class="collapsible-json-container">
            <details>
                <summary>${title}</summary>
                <pre ${isEditable ? 'contenteditable="true"' : ''}>${jsonString}</pre>
            </details>
            <button class="icon-btn copy-json-btn" title="Copy JSON">${copyIconSVG}</button>
        </div>
    `;
}

function renderTopics(topics) {
    let html = '<h4>Topics</h4>';
    for (const [category, list] of Object.entries(topics)) {
        if (list.length > 0) {
            html += `<p><strong>${category}:</strong> ${list.join(', ')}</p>`;
        }
    }
    return html;
}

function renderSuggestions(suggestions) {
    let html = '<h4>Suggestions</h4>';
    for (const [category, list] of Object.entries(suggestions)) {
        if (typeof list === 'boolean') {
            html += `<p><strong>${category.replace(/_/g, ' ')}:</strong> ${list ? 'Yes' : 'No'}</p>`;
        } else if (list.length > 0) {
            html += `<h5>${category}</h5><ul>`;
            html += list.map(item => `<li>${item}</li>`).join('');
            html += '</ul>';
        }
    }
    return html;
}

export function renderTuneTab(payload) {
    const tuneTab = document.getElementById('tune-tab');
    if (!tuneTab) return;
    let html = '<div class="card"><div class="card-content">';
    html += renderTopics(payload.conversation_state.topics);
    html += '<hr>';
    html += renderSuggestions(payload.suggestions);
    html += '</div></div>';
    tuneTab.innerHTML = html;
}

function renderKeyValue(dataObject) {
    let html = '<table class="geo-table">';
    for (const [key, value] of Object.entries(dataObject)) {
        const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        if (typeof value === 'object' && value !== null) {
            html += `<tr><td colspan="2"><strong>${displayKey}</strong></td></tr>`;
            html += renderKeyValue(value);
        } else {
            html += `<tr><td>${displayKey}</td><td>${value}</td></tr>`;
        }
    }
    html += '</table>';
    return html;
}

export function renderAnalysisTab(payload) {
    const analysisTab = document.getElementById('analysis-tab');
    if (!analysisTab) return;
    let html = '<div class="card"><div class="card-content">';
    html += '<h4>Analysis</h4>';
    html += renderKeyValue(payload.analysis);
    html += '<hr>';
    html += '<h4>Conversation Analysis</h4>';
    html += renderKeyValue(payload.conversation_analysis);
    html += '</div></div>';
    analysisTab.innerHTML = html;
}

export function renderGeoTab(payload) {
    const geoTab = document.getElementById('geo-tab');
    if (!geoTab) return;
    const { userLocation, matchLocation, time_difference_hours, distance_km, distance_miles, is_virtual } = payload.geo;
    let html = '<div class="card"><div class="card-content">';
    html += '<h4>Geo Information</h4>';
    if (is_virtual) {
        html += '<p><strong>Virtual Chat</strong></p>';
    }
    html += '<table class="geo-table">';
    html += '<thead><tr><th>Metric</th><th>You</th><th>Match</th></tr></thead>';
    html += '<tbody>';
    html += `<tr><td>Location</td><td>${userLocation.city_state}</td><td>${matchLocation.city_state}</td></tr>`;
    html += `<tr><td>Country</td><td>${userLocation.country}</td><td>${matchLocation.country}</td></tr>`;
    html += `<tr><td>Current Time</td><td>${userLocation.current_time}</td><td>${matchLocation.current_time}</td></tr>`;
    html += `<tr><td>Time of Day</td><td>${userLocation.time_of_day}</td><td>${matchLocation.time_of_day}</td></tr>`;
    html += `<tr><td>Day of Week</td><td>${userLocation.day_of_week}</td><td>${matchLocation.day_of_week}</td></tr>`;
    html += `<tr><td>Timezone</td><td>${userLocation.timezone}</td><td>${matchLocation.timezone}</td></tr>`;
    html += `<tr><td>Time Difference</td><td colspan="2">${time_difference_hours} hours</td></tr>`;
    html += `<tr><td>Distance</td><td colspan="2">${distance_miles} miles (${distance_km} km)</td></tr>`;
    html += '</tbody></table>';
    html += '</div></div>';
    geoTab.innerHTML = html;
}

export function renderContextTab(payload) {
    const contextTab = document.getElementById('context-tab');
    if (!contextTab) return;
    let html = '<div class="card"><div class="card-content">';
    html += '<h4>Debug Context</h4>';
    html += `<p><strong>Match ID:</strong> ${payload.matchId}</p>`;
    html += `<p><strong>Pipeline:</strong> ${payload.pipeline}</p>`;
    html += '<hr>';
    html += createCollapsibleJSON('Full Payload', payload);
    html += '</div></div>';
    contextTab.innerHTML = html;
}

export function renderFinalViewTab(payload) {
    const finalViewTab = document.getElementById('final-view-tab');
    if (!finalViewTab) return;
    const { system_prompt, user_prompt } = generatePrompts(payload);
    const finalPayload = { system_prompt, user_prompt };
    let html = '<div class="card"><div class="card-content">';
    html += '<h4>System Prompt</h4>';
    html += `<textarea class="prompt-display" readonly>${system_prompt}</textarea>`;
    html += '<h4>User Prompt</h4>';
    html += `<textarea class="prompt-display" readonly>${user_prompt}</textarea>`;
    html += '<hr>';
    html += createCollapsibleJSON('Final LLM Payload', finalPayload);
    html += '</div></div>';
    finalViewTab.innerHTML = html;
    const copyBtn = finalViewTab.querySelector('.copy-json-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(JSON.stringify(finalPayload, null, 2));
            copyBtn.innerHTML = 'Copied!';
            setTimeout(() => {
                copyBtn.innerHTML = `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"></path></svg>`;
            }, 1500);
        });
    }
}

export function renderAllTabs(payload) {
    renderTuneTab(payload);
    renderAnalysisTab(payload);
    renderGeoTab(payload);
    renderContextTab(payload);
    renderFinalViewTab(payload);
}
