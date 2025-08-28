import { generatePrompts } from './prompts.js';
import {
    LINGUISTIC_STYLES, EMOJI_STRATEGIES, USER_LOCATIONS,
    DATE_ARC_PHASES, CONVERSATION_STATES, INTENT_OPTIONS,
    FLIRT_LEVEL_OPTIONS, PACE_OPTIONS, DEFAULTS,
    MATCH_SPECIFIC_SETTINGS_KEYS, SELECTORS,
    ANALYSIS_VIEW_SCHEMA, TOPIC_ANALYSIS_VIEW_SCHEMA, CONV_ANALYSIS_VIEW_SCHEMA
} from './constants.js';

let modalState = {};
const MODAL_VIEWS = ['context', 'final-payload'];
let currentModalView = 'context';
let sendMessage; // This will be set by popup.js

export function setSendMessageFunction(fn) {
    sendMessage = fn;
}

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
    return `<select id="${id}" data-path="${dataPath}">${optionsHtml}</select>`;
}

function createMultiSelect(id, dataPath, allOptions, selectedOptions) {
    const selectedSet = new Set(selectedOptions || []);
    const optionsHtml = allOptions.map(opt => `<option value="${opt}" ${selectedSet.has(opt) ? 'selected' : ''}>${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`).join('');
    return `<select id="${id}" data-path="${dataPath}" multiple>${optionsHtml}</select>`;
}

function createTextarea(id, dataPath, value) {
    return `<textarea id="${id}" data-path="${dataPath}">${value || ''}</textarea>`;
}

function createInput(id, dataPath, value, type = 'text') {
    return `<input type="${type}" id="${id}" data-path="${dataPath}" value="${value || ''}">`;
}

function createCheckbox(id, dataPath, checked) {
    return `<input type="checkbox" id="${id}" data-path="${dataPath}" ${checked ? 'checked' : ''}>`;
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

function renderViewFromSchema(schema, state) {
    let controlGroups = '';
    for (const item of schema) {
        const getValue = (path) => path.split('.').reduce((o, k) => o?.[k], state);

        if (item.type === 'divider') {
            controlGroups += `<div class="control-group-divider">${item.label}</div>`;
            continue;
        }

        if (item.type === 'dynamic_table') {
            const data = getValue(item.path);
            if (data && typeof data === 'object') {
                for (const [key, val] of Object.entries(data)) {
                    const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    const displayVal = typeof val === 'boolean' ?
                        `<label class="toggle-switch" style="justify-content: flex-end;"><input type="checkbox" ${val ? 'checked' : ''} disabled><span></span></label>` :
                        `<span class="dynamic-value">${val || 'N/A'}</span>`;

                    controlGroups += `
                        <div class="control-group">
                            <label class="label-with-info"><span>${label}</span></label>
                            ${displayVal}
                        </div>`;
                }
            }
            continue;
        }

        const value = getValue(item.path);
        const id = item.path.replace(/\./g, '-');
        let controlHtml = '';

        switch (item.type) {
            case 'select':
                controlHtml = createSelect(id, item.path, item.options(), value);
                break;
            case 'multiselect':
                controlHtml = createMultiSelect(id, item.path, item.options(), value);
                break;
            case 'checkbox':
                controlHtml = `<label class="toggle-switch" style="justify-content: flex-end;"><input type="checkbox" id="${id}" data-path="${item.path}" ${value ? 'checked' : ''}><span></span></label>`;
                break;
            case 'slider':
                const sliderLabel = `<label class="label-with-info"><span>${item.label}</span><span id="${id}-value-label" class="value-label"></span></label>`;
                const sliderInput = createSlider(id, item.path, value, item.min, item.max, item.step, item.labels);
                controlGroups += `<div class="control-group">${sliderLabel}${sliderInput}</div>`;
                continue;
            case 'textarea':
                const areaValue = Array.isArray(value) ? value.join('\n') : value;
                controlHtml = createTextarea(id, item.path, areaValue);
                break;
            case 'text':
                controlHtml = createInput(id, item.path, value);
                break;
        }

        const labelHtml = `<label for="${id}" class="label-with-info"><span>${item.label}</span></label>`;
        controlGroups += `<div class="control-group">${labelHtml}${controlHtml}</div>`;
    }
    return controlGroups;
}

export function renderDebugView(viewName, generationState) {
    const contentEl = document.getElementById(viewName);
    if (!contentEl) return;

    let html = '';
    const schemaMap = {
        'analysis': ANALYSIS_VIEW_SCHEMA,
        'topic-analysis': TOPIC_ANALYSIS_VIEW_SCHEMA,
        'conv-analysis': CONV_ANALYSIS_VIEW_SCHEMA,
    };

    const schema = schemaMap[viewName];
    if (schema && generationState.conversationAnalysis) {
        html = renderViewFromSchema(schema, generationState.conversationAnalysis);
    } else if (schema) {
        html = '<p>Analysis data not yet available.</p>';
    } else {
        html = `<p>No view schema defined for ${viewName}.</p>`;
    }

    contentEl.innerHTML = `<div class="card-content">${html}</div>`;
    attachDebugEventListeners(contentEl);
}

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

export function showDebugModal(generationData, uiCallbacks) {
    modalState = JSON.parse(JSON.stringify(generationData)); // Deep copy
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

            uiCallbacks.setUIGeneratingState(true);
            uiCallbacks.startTimer(Date.now());
            hideDebugModal();

            sendMessage({
                action: "getAIResponse",
                data: {
                    payload: finalPayload,
                    generationId: Date.now(),
                    uuid: generationData.uuid,
                    logData: {
                        uuid: generationData.uuid,
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
        modalState.taskInstructions = {}; // Should be pre-filled from popup.js
    }

    const { systemMessage, userMessage } = generatePrompts(modalState);
    const finalPayload = {
        messages: [{ role: "system", content: systemMessage }, { role: "user", content: userMessage }],
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
                renderDebugView(container.id, modalState);
            } catch (err) {
                console.error("Invalid JSON entered:", err);
                e.target.style.border = '1px solid red';
            }
        });
        area.addEventListener('focus', e => { e.target.style.border = ''; });
    });

    if (container.id === 'context' || container.parentElement.id === 'debug-modal-content') {
        const addBtn = container.querySelector('#add-message-btn');
        if(addBtn) {
            addBtn.addEventListener('click', () => {
                modalState.conversationHistory.push({ role: 'user', content: '', date: new Date().toISOString().split('T')[0] });
                renderModalView();
            });
        }
        container.querySelectorAll('.remove-msg-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                const index = e.currentTarget.closest('.message-card').dataset.index;
                modalState.conversationHistory.splice(index, 1);
                renderModalView();
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
    const activeTab = document.querySelector('.tab-content.active')?.id;
    if ((objectKey === 'conversationAnalysis' || objectKey === 'memory') && activeTab && ['analysis', 'memory'].includes(activeTab)) {
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
