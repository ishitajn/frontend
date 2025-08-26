// popup.js (Re-architected for Manifest V3 Robustness with Heartbeat)
import { scrapeBumblePage, pasteTextIntoBumbleInput, scrapeTinderPage, pasteTextIntoTinderInput } from './content-scraper.js';
import { getToneDescription, getLengthDescription, getEmojiInstruction, getStyleDescription } from './uiFormatters.js';
import { determineConversationState } from './localAnalysisService.js';
import { generatePrompts } from './prompts.js';
import {
    LINGUISTIC_STYLES, EMOJI_STRATEGIES, USER_LOCATIONS,
    DATE_ARC_PHASES, CONVERSATION_STATES, INTENT_OPTIONS,
    FLIRT_LEVEL_OPTIONS, PACE_OPTIONS, DEFAULTS,
    MATCH_SPECIFIC_SETTINGS_KEYS, SELECTORS
} from './constants.js';

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

// --- Tab Management ---
function handleTabClick(event) {
    const target = event.target;
    if (!target.classList.contains('tab-link')) return;

    const tabName = target.dataset.tab;

    // Deactivate all tabs and content
    document.querySelectorAll('.tab-link').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Activate the clicked tab and its content
    target.classList.add('active');
    document.getElementById(tabName).classList.add('active');

    // Render content if it's a debug tab
    if (['analysis', 'memory', 'context', 'final-payload'].includes(tabName)) {
        renderDebugView(tabName);
    }
}



async function handleTestApiClick(urlInputId) {
    const urlInput = document.getElementById(urlInputId);
    const url = urlInput.value;
    if (!url) {
        showError('Test Failed', 'URL is empty.');
        return;
    }

    const originalButtonText = urlInput.nextElementSibling.textContent;
    urlInput.nextElementSibling.textContent = '...';
    urlInput.nextElementSibling.disabled = true;

    sendMessage({
        action: 'testApiConnection',
        data: { url }
    });

    // Listen for the response
    const listener = (msg) => {
        if (msg.action === 'testApiConnectionResponse' && msg.data.url === url) {
            if (msg.data.success) {
                urlInput.style.borderColor = 'var(--success-color)';
            } else {
                urlInput.style.borderColor = 'var(--danger-color)';
            }
            urlInput.nextElementSibling.textContent = originalButtonText;
            urlInput.nextElementSibling.disabled = false;

            setTimeout(() => {
                urlInput.style.borderColor = '';
            }, 3000);

            port.onMessage.removeListener(listener);
        }
    };
    port.onMessage.addListener(listener);
}


// --- Debug View Rendering (from debug-modal.js) ---
// Stubs and constants needed for the moved code
let modalState = {}; // Using this name to minimize code changes from debug-modal

function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (current[keys[i]] === undefined) {
            current[keys[i]] = {};
        }
        current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
}

function createSelect(id, dataPath, options, selectedValue) {
    const optionsHtml = options.map(opt => `<option value="${opt}" ${opt === selectedValue ? 'selected' : ''}>${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`).join('');
    return `<select id="${id}" data-path="${dataPath}" class="modal-input">${optionsHtml}</select>`;
}

function createMultiSelect(id, dataPath, allOptions, selectedOptions) {
    const selectedSet = new Set(selectedOptions || []);
    const optionsHtml = allOptions.map(opt => `<option value="${opt}" ${selectedSet.has(opt) ? 'selected' : ''}>${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`).join('');
    return `<select id="${id}" data-path="${dataPath}" class="modal-input" multiple>${optionsHtml}</select>`;
}

function createTextarea(id, dataPath, value) {
    return `<textarea id="${id}" data-path="${dataPath}" class="modal-input">${value || ''}</textarea>`;
}

function createInput(id, dataPath, value, type = 'text') {
    return `<input type="${type}" id="${id}" data-path="${dataPath}" value="${value || ''}" class="modal-input">`;
}

function createCheckbox(id, dataPath, checked) {
    return `<input type="checkbox" id="${id}" data-path="${dataPath}" ${checked ? 'checked' : ''} class="modal-input">`;
}

function createSlider(id, dataPath, value, min, max, step, labelMap) {
    const getLabel = (val) => {
        const numVal = parseFloat(val);
        for (const [limit, label] of Object.entries(labelMap).sort((a,b) => b[0] - a[0])) {
            if (numVal >= parseFloat(limit))
                return label;
        }
        return Object.values(labelMap)[0];
    };
    return `
        <div class="slider-container">
            <input type="range" id="${id}" data-path="${dataPath}" value="${value}" min="${min}" max="${max}" step="${step}" data-label-map='${JSON.stringify(labelMap)}'>
            <span id="${id}-value" class="value-display">${value} (${getLabel(value)})</span>
        </div>
    `;
}

function createCollapsibleJSON(title, dataObject, isEditable = true) {
    if (dataObject === null || typeof dataObject === 'undefined') {
        return `
            <div class="collapsible-json-container">
                <details class="modal-payload-details">
                    <summary>${title}</summary>
                    <pre class="raw-json-area" style="color: var(--text-muted);">Not available</pre>
                </details>
            </div>
        `;
    }

    const jsonString = JSON.stringify(dataObject, null, 2);
    const key = title.split(' ')[0].toLowerCase();
    const copyIconSVG = `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"></path></svg>`;

    return `
        <div class="collapsible-json-container">
            <details class="modal-payload-details">
                <summary>${title}</summary>
                <pre ${isEditable ? 'contenteditable="true"' : ''} class="raw-json-area" data-object-key="${key}">${jsonString}</pre>
            </details>
            <button class="icon-btn copy-json-btn" title="Copy JSON">
                ${copyIconSVG}
            </button>
        </div>
    `;
}

function renderDebugView(viewName) {
    const contentEl = document.getElementById(viewName);
    if (!contentEl) return;

    let html = '';
    switch (viewName) {
        case 'analysis': html = renderAnalysisView(); break;
        case 'topic-analysis': html = renderMemoryView(); break;
        case 'conv-analysis': html = renderConvAnalysisView(); break;
    }
    contentEl.innerHTML = `<div class="card-content">${html}</div>`;
    attachDebugEventListeners(contentEl);
}

function renderConvAnalysisView() {
    // This view depends on the merged analysis object, which has the backend data
    const { analysis } = modalState;
    if (!analysis || !analysis.conversation_analysis) { // Check for the nested object
        return '<p>Backend conversation analysis data not available. Run analysis with a non-local type.</p>';
    }

    const { conversation_analysis } = analysis;

    // Create a simple table to display the key-value pairs
    let tableRows = '';
    for (const [key, value] of Object.entries(conversation_analysis)) {
        let displayValue;
        if (typeof value === 'boolean') {
            // For now, using a disabled checkbox (switch) for display
            displayValue = `<input type="checkbox" ${value ? 'checked' : ''} disabled>`;
        } else {
            displayValue = `<span>${value || 'N/A'}</span>`;
        }
        tableRows += `<tr><td>${key.replace(/_/g, ' ')}</td><td>${displayValue}</td></tr>`;
    }

    return `
        <h3>Backend Conversation Analysis</h3>
        <table class="payload-table">
            ${tableRows}
        </table>
    `;
}

// --- Modal Logic (re-implementing multi-view modal) ---
const MODAL_VIEWS = ['context', 'final-payload'];
let currentModalView = 'context';

function renderModalView() {
    const contentEl = document.getElementById('debug-modal-content');
    if (!contentEl) return;

    let html = '';
    switch (currentModalView) {
        case 'context': html = renderContextView(); break;
        case 'final-payload': html = renderFinalPayloadView(); break;
    }
    contentEl.innerHTML = html;
    attachDebugEventListeners(contentEl);
}

function handleModalNav(direction) {
    const currentIndex = MODAL_VIEWS.indexOf(currentModalView);
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= MODAL_VIEWS.length) return;

    currentModalView = MODAL_VIEWS[nextIndex];
    renderModalView();
    updateModalNavButtons();
}

function updateModalNavButtons() {
    const currentIndex = MODAL_VIEWS.indexOf(currentModalView);
    document.getElementById('modal-back-btn').disabled = currentIndex === 0;

    const primaryBtn = document.getElementById('modal-primary-action-btn');
    primaryBtn.textContent = (currentIndex === MODAL_VIEWS.length - 1) ? 'Send to AI' : 'Next';
}

function showDebugModal(generationData) {
    modalState = JSON.parse(JSON.stringify(generationData)); // Deep copy to avoid side-effects
    currentModalView = 'context';

    const overlay = document.getElementById('debug-modal-overlay');
    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">Debug & Override Mode</div>
            <div class="modal-content" id="debug-modal-content"></div>
            <div class="modal-footer">
                <div class="modal-actions">
                    <button id="modal-cancel-btn" class="btn btn-secondary">Cancel</button>
                    <button id="modal-back-btn" class="btn btn-secondary">Back</button>
                    <button id="modal-primary-action-btn" class="btn btn-primary">Next</button>
                </div>
            </div>
        </div>
    `;
    overlay.classList.remove('hidden');

    document.getElementById('modal-cancel-btn').addEventListener('click', hideDebugModal);
    document.getElementById('modal-back-btn').addEventListener('click', () => handleModalNav(-1));
    document.getElementById('modal-primary-action-btn').addEventListener('click', () => {
        if (currentModalView === 'final-payload') {
            const { systemMessage, userMessage } = generatePrompts(modalState);
            const finalPayload = {
                messages: [{ role: "system", content: systemMessage }, { role: "user", content: userMessage }],
                temperature: modalState.taskInstructions.temperature,
                top_p: modalState.taskInstructions.top_p,
            };

            setUIGeneratingState(true);
            startTimer(Date.now());
            hideDebugModal();

            sendMessage({
                action: "getAIResponse",
                data: {
                    payload: finalPayload,
                    generationId: Date.now(),
                    uuid: state.currentMatchUUID,
                    logData: {
                        uuid: state.currentMatchUUID,
                        analysis: modalState.conversationAnalysis,
                        payload: finalPayload
                    }
                }
            });

        } else {
            handleModalNav(1);
        }
    });

    renderModalView();
    updateModalNavButtons();
}

function hideDebugModal() {
    const overlay = document.getElementById('debug-modal-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.innerHTML = '';
    }
}

function renderAnalysisView() {
    const { analysis } = modalState;
    if (!analysis) return '<p>Analysis data not available.</p>';

    const { lastMessageAnalysis, conversationState, suppressGreeting } = analysis;
    const valenceLabels = { '-1': 'Very Negative', '-0.5': 'Negative', '-0.1': 'Neutral', '0.5': 'Positive', '1': 'Very Positive' };
    const arousalLabels = { '-1': 'Bored/Calm', '-0.5': 'Low Energy', '-0.1': 'Neutral', '0.5': 'Excited', '1': 'Agitated' };

    return `
        <h3>Conversation Analysis</h3>
        <table class="payload-table">
            <tr><td>Conversation State</td><td>${createSelect('analysis-state', 'analysis.conversationState', CONVERSATION_STATES, conversationState)}</td></tr>
            <tr><td>Suppress Greeting?</td><td>${createCheckbox('analysis-suppressGreeting', 'analysis.suppressGreeting', suppressGreeting)}</td></tr>

            <tr><td colspan="2" style="text-align:center; background:#333;"><strong>Last Message Subtext (Local)</strong></td></tr>
            <tr><td>Is Direct Question?</td><td>${createCheckbox('subtext-isDirectQuestion', 'analysis.lastMessageAnalysis.isDirectQuestion', lastMessageAnalysis.isDirectQuestion)}</td></tr>
            <tr><td>Is Low Effort?</td><td>${createCheckbox('subtext-isLowEffort', 'analysis.lastMessageAnalysis.isLowEffort', lastMessageAnalysis.isLowEffort)}</td></tr>
            <tr><td>Is Sarcastic?</td><td>${createCheckbox('subtext-isSarcastic', 'analysis.lastMessageAnalysis.isSarcastic', lastMessageAnalysis.isSarcastic)}</td></tr>
            <tr><td>Is Ambiguous?</td><td>${createCheckbox('subtext-isAmbiguous', 'analysis.lastMessageAnalysis.isAmbiguous', lastMessageAnalysis.isAmbiguous)}</td></tr>
            <tr><td>Is Vulnerable?</td><td>${createCheckbox('subtext-isVulnerable', 'analysis.lastMessageAnalysis.isVulnerable', lastMessageAnalysis.isVulnerable)}</td></tr>
            <tr><td>Intents</td><td>${createMultiSelect('subtext-intents', 'analysis.lastMessageAnalysis.intents', INTENT_OPTIONS, lastMessageAnalysis.intents)}</td></tr>

            <tr><td colspan="2" style="text-align:center; background:#333;"><strong>Overall Analysis (Backend)</strong></td></tr>
            <tr><td>Valence (Sentiment)</td><td>${createSlider('backend-valence', 'analysis.lastMessageAnalysis.valence', lastMessageAnalysis.valence, -1, 1, 0.1, valenceLabels)}</td></tr>
            <tr><td>Arousal (Engagement)</td><td>${createSlider('backend-arousal', 'analysis.lastMessageAnalysis.arousal', lastMessageAnalysis.arousal, -1, 1, 0.1, arousalLabels)}</td></tr>
            <tr><td>Flirtation Level</td><td>${createSelect('backend-flirt-lvl', 'analysis.flirtation_level', FLIRT_LEVEL_OPTIONS, analysis.flirtation_level)}</td></tr>
            <tr><td>Pace</td><td>${createSelect('backend-pace', 'analysis.pace', PACE_OPTIONS, analysis.pace)}</td></tr>

            <tr><td colspan="2" style="text-align:center; background:#333;"><strong>Power Dynamics (Backend)</strong></td></tr>
            <tr><td>Summary</td><td>${createInput('power-summary', 'analysis.power_dynamics.summary', analysis.power_dynamics?.summary || '')}</td></tr>
            <tr><td>User Is Leading?</td><td>${createCheckbox('power-user-leading', 'analysis.power_dynamics.user_is_leading', analysis.power_dynamics?.user_is_leading)}</td></tr>
        </table>
        ${createCollapsibleJSON('View/Edit Raw Analysis Object', analysis)}
    `;
}

function renderMemoryView() {
    if (!modalState.conversationAnalysis || !modalState.conversationAnalysis.memory) return '<p>Memory data not available.</p>';
    const { memory } = modalState.conversationAnalysis;
    return `
        <h3>Match Memory</h3>
        <table class="payload-table">
            <tr><td>Date Arc Phase</td><td>${createSelect('memory-dateArcPhase', 'conversationAnalysis.memory.dateArcPhase', DATE_ARC_PHASES, memory.dateArcPhase)}</td></tr>
            <tr><td>Inside Jokes (one per line)</td><td>${createTextarea('memory-insideJokes', 'conversationAnalysis.memory.insideJokes', (memory.insideJokes || []).join('\\n'))}</td></tr>
            <tr><td>Avoided Topics (one per line)</td><td>${createTextarea('memory-avoidedTopics', 'conversationAnalysis.memory.avoidedTopics', (memory.avoidedTopics || []).join('\\n'))}</td></tr>
            <tr><td>Question History (one per line)</td><td>${createTextarea('memory-questionHistory', 'conversationAnalysis.memory.questionHistory', (memory.questionHistory || []).join('\\n'))}</td></tr>
        </table>
        ${createCollapsibleJSON('View/Edit Raw Memory Object', memory)}
    `;
}

function renderContextView() {
    if (!modalState.conversationHistory) return '<p>Context data not available.</p>';
    const historyHtml = modalState.conversationHistory.map((msg, index) => `
        <div class="message-card" data-index="${index}">
            <div class="message-card-header">
                <select class="modal-input" data-path="conversationHistory.${index}.role">
                    <option value="user" ${msg.role === 'user' ? 'selected' : ''}>User</option>
                    <option value="assistant" ${msg.role === 'assistant' ? 'selected' : ''}>Assistant</option>
                </select>
                <button class="icon-btn remove-msg-btn" title="Remove Message">&times;</button>
            </div>
            <div class="message-card-content">
                <textarea class="modal-input" data-path="conversationHistory.${index}.content">${msg.content}</textarea>
            </div>
        </div>
    `).join('');

    return `
        <h3>Profiles & History</h3>
        <table class="payload-table">
            <tr><td>My Name</td><td>${createInput('context-myName', 'myName', modalState.myName)}</td></tr>
            <tr><td>Their Name</td><td>${createInput('context-theirName', 'theirName', modalState.theirName)}</td></tr>
            <tr><td>My Profile</td><td>${createTextarea('context-myProfile', 'myProfile', modalState.myProfile)}</td></tr>
            <tr><td>Their Profile</td><td>${createTextarea('context-theirProfile', 'theirProfile', modalState.theirProfile)}</td></tr>
        </table>
        <h4>Conversation History</h4>
        <div class="messages-container">${historyHtml}</div>
        <button id="add-message-btn" class="btn btn-secondary add-message-btn">Add Message</button>
        ${createCollapsibleJSON('View/Edit Raw GeoContext Data', modalState.geoContextData)}
    `;
}

function renderFinalPayloadView() {
    if (!modalState.taskInstructions) {
        modalState.taskInstructions = {
            myName: state.sessionScrapedData?.myName || DEFAULTS.myProfile.split(',')[0].trim(),
            theirName: state.sessionMatchProfile?.metadata?.theirName || 'Match',
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
        modalState.forceIncludeGeoContext = document.getElementById(SELECTORS.geoContextToggle).checked;
    }

    const { systemMessage, userMessage } = generatePrompts(modalState);
    const finalPayload = {
        messages: [{
                role: "system",
                content: systemMessage
            }, {
                role: "user",
                content: userMessage
            }
        ],
        temperature: modalState.taskInstructions.temperature,
        top_p: modalState.taskInstructions.top_p
    };
    modalState.finalPayload = finalPayload;

    return `
        <h3>Final Payload Review</h3>
        <p>This is the exact data that will be sent to the AI. You can make final edits to the messages below.</p>
        <div class="messages-container">
            <div class="message-card">
                <div class="message-card-header"><strong>System Message</strong></div>
                <div class="message-card-content">${createTextarea('final-system', 'finalPayload.messages.0.content', systemMessage)}</div>
            </div>
            <div class="message-card">
                <div class="message-card-header"><strong>User Message</strong></div>
                <div class="message-card-content">${createTextarea('final-user', 'finalPayload.messages.1.content', userMessage)}</div>
            </div>
        </div>
        ${createCollapsibleJSON('View/Edit Raw Final Payload', finalPayload, false)}
    `;
}

function attachDebugEventListeners(container) {
    container.addEventListener('input', updateStateFromUI);
    container.addEventListener('change', updateStateFromUI);

    container.querySelectorAll('input[type="range"][data-label-map]').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const targetSlider = e.currentTarget;
            const valueDisplay = document.getElementById(`${targetSlider.id}-value`);
            if (valueDisplay) {
                const labelMap = JSON.parse(targetSlider.dataset.labelMap);
                const currentValue = targetSlider.value;
                const getLabel = (val) => {
                     const numVal = parseFloat(val);
                     for (const [limit, label] of Object.entries(labelMap).sort((a,b) => b[0] - a[0])) {
                         if (numVal >= parseFloat(limit)) return label;
                     }
                     return Object.values(labelMap)[0];
                };
                valueDisplay.textContent = `${currentValue} (${getLabel(currentValue)})`;
            }
        });
    });

    container.querySelectorAll('.copy-json-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const button = e.currentTarget;
            const pre = button.closest('.collapsible-json-container').querySelector('pre.raw-json-area');
            if (!pre) return;
            navigator.clipboard.writeText(pre.textContent.replace(/\\n/g, '\\n'));
            const originalIcon = button.innerHTML;
            button.innerHTML = '✅';
            button.disabled = true;
            setTimeout(() => {
                button.innerHTML = originalIcon;
                button.disabled = false;
            }, 1500);
        });
    });

    container.querySelectorAll('.raw-json-area[contenteditable="true"]').forEach(area => {
        area.addEventListener('blur', e => {
            try {
                const newJson = JSON.parse(e.target.textContent);
                const key = e.target.dataset.objectKey;
                if (key === 'memory') modalState.conversationAnalysis.memory = newJson;
                else if (key === 'analysis') modalState.conversationAnalysis = newJson;
                else modalState[key] = newJson;
                renderDebugView(container.id);
            } catch (err) {
                console.error("Invalid JSON entered:", err);
                e.target.style.border = '1px solid red';
            }
        });
        area.addEventListener('focus', e => { e.target.style.border = ''; });
    });

    if (container.id === 'context') {
        container.querySelector('#add-message-btn')?.addEventListener('click', () => {
            modalState.conversationHistory.push({ role: 'user', content: '', date: new Date().toISOString().split('T')[0] });
            renderDebugView('context');
        });
        container.querySelectorAll('.remove-msg-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                const index = e.currentTarget.closest('.message-card').dataset.index;
                modalState.conversationHistory.splice(index, 1);
                renderDebugView('context');
            });
        });
    }
}

function updateStateFromUI(e) {
    const el = e.target;
    const path = el.dataset.path;
    if (!path) return;

    let value;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.type === 'range' || el.type === 'number') value = parseFloat(el.value);
    else if (el.multiple) value = Array.from(el.selectedOptions).map(opt => opt.value);
    else value = el.value;

    if (path.endsWith('insideJokes') || path.endsWith('avoidedTopics') || path.endsWith('questionHistory')) {
        value = el.value.split('\\n').filter(Boolean);
    }

    setNestedValue(modalState, path, value);

    const objectKey = path.split('.')[0];
    const activeTab = document.querySelector('.tab-content.active').id;
    if ((objectKey === 'conversationAnalysis' || objectKey === 'memory') && (activeTab==='analysis' || activeTab==='memory')) {
        updateRawJsonDisplay(activeTab);
    }
}

function updateRawJsonDisplay(key) {
    const pre = document.querySelector(`#${key} .raw-json-area[data-object-key="${key}"]`);
    if (!pre) return;

    let objectToDisplay;
    switch (key) {
        case 'analysis': objectToDisplay = modalState.conversationAnalysis; break;
        case 'memory': objectToDisplay = modalState.conversationAnalysis.memory; break;
        case 'geocontext': objectToDisplay = modalState.geoContextData; break;
    }
    if(objectToDisplay) pre.textContent = JSON.stringify(objectToDisplay, null, 2);
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
        case 'geoCalculationsResponse':
            handleGeoCalculationsResponse(message);
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
const settings = await chrome.storage.local.get(['myProfile', 'userLocationChoice', 'local_model_name', 'analysis_type']);
sendMessage({
    action: "getNlpAnalysis",
    data: {
        scrapedData: pageData,
        uiSettings: {
            myProfile: settings.myProfile || DEFAULTS.myProfile,
            userLocationChoice: settings.userLocationChoice || DEFAULTS.userLocationChoice,
            local_model_name: settings.local_model_name || DEFAULTS.local_model_name,
            analysis_type: settings.analysis_type || DEFAULTS.analysis_type,
        }
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
    if (message.error || !message.matchProfile) {
        showError('NLP Analysis Failed', message.error || 'No match profile returned.');
        return;
    }

    state.sessionMatchProfile = message.matchProfile;
    state.currentMatchUUID = message.matchProfile.uuid;

    // Populate modalState for debug views
    modalState = {
        ...state.sessionScrapedData,
        ...state.sessionMatchProfile.metadata,
        myProfile: (await chrome.storage.local.get('myProfile')).myProfile || DEFAULTS.myProfile,
        conversationHistory: state.sessionMatchProfile.conversationHistory,
        conversationAnalysis: state.sessionMatchProfile.analysis,
        geoContextData: state.sessionMatchProfile.memory.geoContextData,
        taskInstructions: {}, // This will be populated on generate click
    };


    await loadAndApplySettings();
    // Only run local geo-calculation if the backend didn't provide it
    if (!state.sessionMatchProfile.memory.geoContextData) {
        await handleLocationChange();
    } else {
        updateGeoContextDisplay(state.sessionMatchProfile.memory.geoContextData);
    }

    displayConversationState();
    showView(SELECTORS.mainView);
}

function handleGeoCalculationsResponse(message) {
    if (state.sessionMatchProfile) {
        state.sessionMatchProfile.memory.geoContextData = message.geoContext || null;
    }
    updateGeoContextDisplay(message.geoContext);
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
    document.getElementById(SELECTORS.userLocationSelect)?.addEventListener('change', handleLocationChange);
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
    document.getElementById(SELECTORS.refinementActions)?.addEventListener('click', handleRefinementClick);
    document.querySelector('.tabs')?.addEventListener('click', handleTabClick);
    document.getElementById(SELECTORS.testApiBtn)?.addEventListener('click', () => handleTestApiClick(SELECTORS.localLlamaUrl));
    document.getElementById(SELECTORS.testAnalysisBtn)?.addEventListener('click', () => handleTestApiClick(SELECTORS.analysisUrl));

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

async function handleLocationChange() {
    const select = document.getElementById(SELECTORS.userLocationSelect);
    const choice = select.value;
    let messageData = {
        uuid: state.currentMatchUUID
    };
    if (choice === 'autodetect') {
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    timeout: 5000
                });
            });
            messageData.userCoords = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };
        } catch (error) {
            showErrorInResponseArea(`Auto-detect failed. Using fallback: Charlotte, NC.`);
            messageData.userLocation = USER_LOCATIONS['charlotte'];
        }
    } else {
        messageData.userLocation = USER_LOCATIONS[choice];
    }
    sendMessage({
        action: "getGeoCalculations",
        data: messageData
    });
}

function updateClearButtonVisibility(inputEl, clearBtnEl) {
    const hasContent = (inputEl.value && inputEl.value.trim() !== '') || (inputEl.textContent && inputEl.textContent.trim() !== '');
    clearBtnEl.classList.toggle('hidden', !hasContent);
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

async function updateGeoContextDisplay(geoContextData) {
    if (!state.sessionMatchProfile || !state.sessionScrapedData)
        return;

    const { myName } = state.sessionScrapedData;
    const { theirName, matchLocation } = state.sessionMatchProfile.metadata;
    const settings = await chrome.storage.local.get('userLocationChoice');
    const userLocationData = USER_LOCATIONS[settings.userLocationChoice || 'autodetect'];
    const card = document.getElementById(SELECTORS.geoContextCard);

    if (card)
        card.hidden = !geoContextData;
    if (!geoContextData)
        return;

    const dataMap = {
        geoUserName: myName || 'User',
        geoMatchName: theirName || 'Match',
        userLocation: userLocationData.name.split(',')[0],
        matchLocation: matchLocation,
        userTimeOfDay: geoContextData.userTimeOfDay,
        matchTimeOfDay: geoContextData.matchTimeOfDay,
        userTimezone: geoContextData.userTimeZoneName || userLocationData.timeZone,
        matchCountry: geoContextData.matchCountry,
        userCountry: geoContextData.userCountry || userLocationData.country,
        timeDifference: geoContextData.timeZoneDifference !== null ? `${geoContextData.timeZoneDifference} hour(s)` : 'N/A',
        distanceInfo: `${geoContextData.distance.miles} miles / ${geoContextData.distance.km} km`,
        countryDifference: `${geoContextData.countryDifference}`
    };

    Object.entries(dataMap).forEach(([id, text]) => {
        const el = document.getElementById(SELECTORS[id]);
        if (el)
            el.textContent = text || 'N/A';
    });
}

function startTimer(startTime) {
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

function stopTimer() {
    if (timerInterval)
        clearInterval(timerInterval);
    timerInterval = null;
}

function updateTimerDisplay() {
    const timerEl = document.getElementById(SELECTORS.responseTimer);
    if (timerEl && timerStartTime > 0) {
        const elapsedSeconds = Math.floor((Date.now() - timerStartTime) / 1000);
        timerEl.textContent = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`;
    }
}

function resetTimerDisplay() {
    const timerEl = document.getElementById(SELECTORS.responseTimer);
    if (timerEl) {
        timerEl.textContent = '00:00';
    }
    timerStartTime = 0;
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
        // In debug mode, show the modal instead of sending to the background script
        const fullGenerationData = {
            ...modalState, // Base state from analysis
            myProfile: dataForBackground.myProfile, // Overwrite with fresh profile from settings
            forceIncludeGeoContext: dataForBackground.forceIncludeGeoContext, // Overwrite with fresh toggle state
            taskInstructions: dataForBackground.taskInstructions, // Overwrite with fresh instructions from main UI
        };
        showDebugModal(fullGenerationData);
    } else {
        // In normal mode, get the final payload from the background script
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

function setUIRefreshingState(isRefreshing) {
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

function setUIGeneratingState(isGenerating) {
    const generateBtn = document.getElementById(SELECTORS.generateBtn);
    const cancelBtn = document.getElementById(SELECTORS.cancelBtn);
    const copyBtn = document.getElementById(SELECTORS.copyBtn);
    const responseArea = document.getElementById(SELECTORS.responseArea);
    const refinementActions = document.getElementById(SELECTORS.refinementActions);

    if (!generateBtn || !cancelBtn || !copyBtn || !responseArea || !refinementActions)
        return;

    generateBtn.disabled = isGenerating;
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
        responseArea.classList.remove('loading');
        if (!responseArea.textContent || responseArea.classList.contains('error')) {
            copyBtn.classList.add('hidden');
        }
    }
}

function updateUIAfterGeneration(result) {
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

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const view = document.getElementById(viewId);
    if (view)
        view.classList.remove('hidden');
    state.currentViewId = viewId;
}

function showError(title, message) {
    const titleEl = document.getElementById(SELECTORS.errorTitle);
    const messageEl = document.getElementById(SELECTORS.errorMessage);
    if (titleEl)
        titleEl.textContent = title;
    if (messageEl)
        messageEl.textContent = message;
    showView(SELECTORS.errorView);
}

function showErrorInResponseArea(message) {
    const responseArea = document.getElementById(SELECTORS.responseArea);
    if (responseArea) {
        responseArea.textContent = `Error: ${message}`;
        responseArea.dispatchEvent(new Event('input', {
                bubbles: true
            }));
        responseArea.classList.add('error');
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