// src/debug-modal.js (Final, Refined Version)

import { generatePrompts } from './prompts.js';
import { LINGUISTIC_STYLES, DATE_ARC_PHASES } from './conversationHelpers.js';
import {
    setNestedValue,
    createSelect,
    createMultiSelect,
    createTextarea,
    createInput,
    createCheckbox,
    createSlider,
    createCollapsibleJSON
} from './ui-components.js';

/** @type {import('./conversationHelpers.js').GenerationData} */
let modalState = {};
let callbacks = {};
let currentView = 'analysis'; // Start at the new first view
const VIEWS = ['analysis', 'memory', 'context', 'final'];

const CONVERSATION_STATES = ['OPENER', 'EARLY_CONVO', 'ACTIVE_CONVO', 'REENGAGING_DAY', 'REENGAGING_WEEK', 'REENGAGING_MONTH'];
const INTENT_OPTIONS = ['questioning', 'planning', 'reacting_to_humor', 'storytelling', 'flirting_or_sexual'];

// --- View Rendering Logic ---
function renderView() {
    const contentEl = document.getElementById('debug-modal-content');
    if (!contentEl)
        return;

    let html = '';
    switch (currentView) {
    case 'analysis':
        html = renderAnalysisView();
        break;
    case 'memory':
        html = renderMemoryView();
        break;
    case 'context':
        html = renderContextView();
        break;
    case 'final':
        html = renderFinalPayloadView();
        break;
    }
    contentEl.innerHTML = html;
    attachEventListeners();
}

function renderAnalysisView() {
    const conversationAnalysis = modalState.conversationAnalysis || {};
    const lastMessageAnalysis = conversationAnalysis.lastMessageAnalysis || {};
    const analysis = conversationAnalysis.analysis || {};
    const engagement = conversationAnalysis.engagement || {};
    const powerDynamics = analysis.powerDynamics || {};

    const valenceLabels = { '0': 'Negative', '0.5': 'Neutral', '1': 'Positive' };
    const arousalLabels = { '0': 'Calm', '0.5': 'Neutral', '1': 'Aroused' };
    const engagementOptions = ['low', 'medium', 'high'];
    const paceOptions = ['slow', 'medium', 'fast'];

    return `
        <h3>View 1: Conversation Analysis</h3>
        <table class="payload-table">
            <tr><td>Conversation State</td><td>${createSelect('analysis-state', 'conversationAnalysis.state', CONVERSATION_STATES, conversationAnalysis.state)}</td></tr>
            <tr><td>Suppress Greeting?</td><td>${createCheckbox('analysis-suppressGreeting', 'conversationAnalysis.suppressGreeting', conversationAnalysis.suppressGreeting)}</td></tr>
            <tr><td colspan="2" style="text-align:center; background:#333;"><strong>Last Message Subtext</strong></td></tr>
            <tr><td>Is Direct Question?</td><td>${createCheckbox('subtext-isDirectQuestion', 'conversationAnalysis.lastMessageAnalysis.isDirectQuestion', lastMessageAnalysis.isDirectQuestion)}</td></tr>
            <tr><td>Is Low Effort?</td><td>${createCheckbox('subtext-isLowEffort', 'conversationAnalysis.lastMessageAnalysis.isLowEffort', lastMessageAnalysis.isLowEffort)}</td></tr>
            <tr><td>Is Sarcastic?</td><td>${createCheckbox('subtext-isSarcastic', 'conversationAnalysis.lastMessageAnalysis.isSarcastic', lastMessageAnalysis.isSarcastic)}</td></tr>
            <tr><td>Is Ambiguous?</td><td>${createCheckbox('subtext-isAmbiguous', 'conversationAnalysis.lastMessageAnalysis.isAmbiguous', lastMessageAnalysis.isAmbiguous)}</td></tr>
            <tr><td>Is Vulnerable?</td><td>${createCheckbox('subtext-isVulnerable', 'conversationAnalysis.lastMessageAnalysis.isVulnerable', lastMessageAnalysis.isVulnerable)}</td></tr>
            <tr><td>Valence</td><td>${createSlider('subtext-valence', 'conversationAnalysis.lastMessageAnalysis.valence', lastMessageAnalysis.valence, 0, 1, 0.1, valenceLabels)}</td></tr>
            <tr><td>Arousal</td><td>${createSlider('subtext-arousal', 'conversationAnalysis.lastMessageAnalysis.arousal', lastMessageAnalysis.arousal, 0, 1, 0.1, arousalLabels)}</td></tr>
            <tr><td>Intents</td><td>${createMultiSelect('subtext-intents', 'conversationAnalysis.lastMessageAnalysis.intents', INTENT_OPTIONS, lastMessageAnalysis.intents)}</td></tr>
            ${analysis ? `
                <tr><td colspan="2" style="text-align:center; background:#333;"><strong>Engagement Analysis</strong></td></tr>
                <tr><td>Engagement</td><td>${createSelect('analysis-engagement', 'conversationAnalysis.analysis.engagement', engagementOptions, analysis.engagement)}</td></tr>
                <tr><td>Pace</td><td>${createSelect('engagement-pace', 'conversationAnalysis.engagement.pace', paceOptions, engagement.pace)}</td></tr>
                <tr><td>Power Dynamics</td><td>${createInput('power-summary', 'conversationAnalysis.analysis.powerDynamics.summary', powerDynamics.summary)}</td></tr>
            ` : ''}
        </table>
        ${createCollapsibleJSON('View/Edit Raw Analysis Object', conversationAnalysis)}
    `;
}

function renderMemoryView() {
    const memory = modalState.conversationAnalysis?.memory || {};
    return `
        <h3>View 2: Match Memory</h3>
        <table class="payload-table">
            <tr><td>Date Arc Phase</td><td>${createSelect('memory-dateArcPhase', 'conversationAnalysis.memory.dateArcPhase', DATE_ARC_PHASES, memory.dateArcPhase)}</td></tr>
            <tr><td>Inside Jokes (one per line)</td><td>${createTextarea('memory-insideJokes', 'conversationAnalysis.memory.insideJokes', (memory.insideJokes || []).join('\n'))}</td></tr>
            <tr><td>Avoided Topics (one per line)</td><td>${createTextarea('memory-avoidedTopics', 'conversationAnalysis.memory.avoidedTopics', (memory.avoidedTopics || []).join('\n'))}</td></tr>
            <tr><td>Question History (one per line)</td><td>${createTextarea('memory-questionHistory', 'conversationAnalysis.memory.questionHistory', (memory.questionHistory || []).join('\n'))}</td></tr>
        </table>
        ${createCollapsibleJSON('View/Edit Raw Memory Object', memory)}
    `;
}

function renderContextView() {
    const { conversationHistory } = modalState;
    const historyHtml = conversationHistory.map((msg, index) => `
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
        <h3>View 3: Profiles & History</h3>
        <table class="payload-table">
            <tr><td>My Name</td><td>${createInput('context-myName', 'myName', modalState.myName)}</td></tr>
            <tr><td>Their Name</td><td>${createInput('context-theirName', 'theirName', modalState.theirName)}</td></tr>
            <tr><td>My Profile</td><td>${createTextarea('context-myProfile', 'myProfile', modalState.myProfile)}</td></tr>
            <tr><td>Their Profile</td><td>${createTextarea('context-theirProfile', 'theirProfile', modalState.theirProfile)}</td></tr>
            <tr><td>Force Geo-Context?</td><td>${createCheckbox('context-forceIncludeGeoContext', 'forceIncludeGeoContext', modalState.forceIncludeGeoContext)}</td></tr>
        </table>
        <h4>Conversation History</h4>
        <div class="messages-container">${historyHtml}</div>
        <button id="add-message-btn" class="btn btn-secondary add-message-btn">Add Message</button>
        ${createCollapsibleJSON('View/Edit Raw GeoContext Data', modalState.geoContextData)}
    `;
}

function renderFinalPayloadView() {
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
        <h3>View 4: Final Payload Review</h3>
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

// --- State Management & Event Handling ---
function updateStateFromUI(e) {
    const el = e.target;
    const path = el.dataset.path;
    if (!path)
        return;

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

    if (path.endsWith('insideJokes') || path.endsWith('avoidedTopics') || path.endsWith('questionHistory')) {
        value = el.value.split('\n').filter(Boolean);
    }

    setNestedValue(modalState, path, value);

    const objectKey = path.split('.')[0];
    if (objectKey === 'conversationAnalysis') {
        updateRawJsonDisplay('analysis');
        if (path.includes('memory')) {
            updateRawJsonDisplay('memory');
        }
    } else if (objectKey === 'finalPayload') {
        updateRawJsonDisplay('final');
    }
}

function updateRawJsonDisplay(key) {
    const pre = document.querySelector(`.raw-json-area[data-object-key="${key}"]`);
    if (!pre)
        return;

    let objectToDisplay;
    switch (key) {
    case 'analysis':
        objectToDisplay = modalState.conversationAnalysis;
        break;
    case 'memory':
        objectToDisplay = modalState.conversationAnalysis.memory;
        break;
    case 'geocontext':
        objectToDisplay = modalState.geoContextData;
        break;
    case 'final':
        objectToDisplay = modalState.finalPayload;
        break;
    default:
        return;
    }
    pre.textContent = JSON.stringify(objectToDisplay, null, 2);
}

function attachEventListeners() {
    const contentEl = document.getElementById('debug-modal-content');
    contentEl.addEventListener('input', updateStateFromUI);
    contentEl.addEventListener('change', updateStateFromUI);

    // FIX: Attach event listener for sliders programmatically
    contentEl.querySelectorAll('input[type="range"][data-label-map]').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const targetSlider = e.currentTarget;
            const valueDisplay = document.getElementById(`${targetSlider.id}-value`);
            if (valueDisplay) {
                const labelMap = JSON.parse(targetSlider.dataset.labelMap);
                const currentValue = targetSlider.value;
                const getLabel = (val) => {
                    const numVal = parseFloat(val);
                    for (const [limit, label] of Object.entries(labelMap)) {
                        if (numVal >= parseFloat(limit)) return label;
                    }
                    return Object.values(labelMap)[0];
                };
                valueDisplay.textContent = `${currentValue} (${getLabel(currentValue)})`;
            }
        });
    });

    document.querySelectorAll('.copy-json-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const button = e.currentTarget;
            const container = button.closest('.collapsible-json-container');
            if (!container)
                return;

            const pre = container.querySelector('pre.raw-json-area');
            if (!pre)
                return;

            const textToCopy = pre.textContent.replace(/\\n/g, '\n');

            navigator.clipboard.writeText(textToCopy);

            const originalIcon = button.innerHTML;
            button.innerHTML = '✅';
            button.disabled = true;
            setTimeout(() => {
                button.innerHTML = originalIcon;
                button.disabled = false;
            }, 1500);
        });
    });

    document.querySelectorAll('.raw-json-area[contenteditable="true"]').forEach(area => {
        area.addEventListener('blur', e => {
            try {
                const newJson = JSON.parse(e.target.textContent);
                const key = e.target.dataset.objectKey;
                if (key === 'memory') {
                    modalState.conversationAnalysis.memory = newJson;
                } else if (key === 'analysis') {
                    modalState.conversationAnalysis = newJson;
                } else {
                    modalState[key] = newJson;
                }
                renderView();
            } catch (err) {
                console.error("Invalid JSON entered:", err);
                e.target.style.border = '1px solid red';
            }
        });
        area.addEventListener('focus', e => {
            e.target.style.border = '';
        });
    });

    if (currentView === 'context') {
        document.getElementById('add-message-btn')?.addEventListener('click', () => {
            modalState.conversationHistory.push({
                role: 'user',
                content: '',
                date: new Date().toISOString().split('T')[0]
            });
            renderView();
        });
        document.querySelectorAll('.remove-msg-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                const index = e.currentTarget.closest('.message-card').dataset.index;
                modalState.conversationHistory.splice(index, 1);
                renderView();
            });
        });
    }
}

// --- Main Modal Functions ---
function handleNav(direction) {
    const currentIndex = VIEWS.indexOf(currentView);
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= VIEWS.length)
        return;
    currentView = VIEWS[nextIndex];
    renderView();
    updateNavButtons();
}

function updateNavButtons() {
    const currentIndex = VIEWS.indexOf(currentView);
    document.getElementById('modal-back-btn').disabled = currentIndex === 0;

    const primaryBtn = document.getElementById('modal-primary-action-btn');
    primaryBtn.textContent = (currentIndex === VIEWS.length - 1) ? 'Send to AI' : 'Next';
}

/**
 * @param {import('./conversationHelpers.js').GenerationData} initialData
 * @param {object} cbs
 */
export function showNlpModal(initialData, cbs) {
    callbacks = cbs;
    modalState = JSON.parse(JSON.stringify(initialData));
    currentView = 'analysis';

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

    document.getElementById('modal-cancel-btn').addEventListener('click', callbacks.hideDebugModal);
    document.getElementById('modal-back-btn').addEventListener('click', () => handleNav(-1));
    document.getElementById('modal-primary-action-btn').addEventListener('click', () => {
        if (currentView === 'final') {
            callbacks.setUIGeneratingState(true);
            callbacks.startTimer(Date.now());
            callbacks.hideDebugModal();
            callbacks.sendFinalPayloadToAI(modalState.finalPayload);
        } else {
            handleNav(1);
        }
    });

    renderView();
    updateNavButtons();
}

export function hideDebugModal() {
    const overlay = document.getElementById('debug-modal-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.innerHTML = '';
    }
}