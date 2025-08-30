export function setNestedValue(obj, path, value) {
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

export function createSelect(id, dataPath, options, selectedValue) {
    const optionsHtml = options.map(opt => `<option value="${opt}" ${opt === selectedValue ? 'selected' : ''}>${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`).join('');
    return `<select id="${id}" data-path="${dataPath}" class="modal-input">${optionsHtml}</select>`;
}

export function createMultiSelect(id, dataPath, allOptions, selectedOptions) {
    const selectedSet = new Set(selectedOptions || []);
    const optionsHtml = allOptions.map(opt => `<option value="${opt}" ${selectedSet.has(opt) ? 'selected' : ''}>${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`).join('');
    return `<select id="${id}" data-path="${dataPath}" class="modal-input" multiple>${optionsHtml}</select>`;
}

export function createTextarea(id, dataPath, value) {
    return `<textarea id="${id}" data-path="${dataPath}" class="modal-input">${value || ''}</textarea>`;
}

export function createInput(id, dataPath, value, type = 'text') {
    return `<input type="${type}" id="${id}" data-path="${dataPath}" value="${value || ''}" class="modal-input">`;
}

export function createCheckbox(id, dataPath, checked) {
    return `<input type="checkbox" id="${id}" data-path="${dataPath}" ${checked ? 'checked' : ''} class="modal-input">`;
}

export function createSlider(id, dataPath, value, min, max, step, labelMap) {
    const getLabel = (val) => {
        if (!labelMap || Object.keys(labelMap).length === 0) {
            return '';
        }
        const numericValue = parseFloat(val);
        // Find the highest key that the value is greater than or equal to.
        const closestKey = Object.keys(labelMap)
                                 .map(parseFloat)
                                 .sort((a, b) => b - a) // Sort keys in descending order
                                 .find(k => numericValue >= k);

        // Fallback to the lowest value if nothing is found (should not happen with proper maps)
        return labelMap[closestKey] || Object.values(labelMap)[0];
    };

    const labelText = getLabel(value);
    const displayValue = labelText ? `${value} (${labelText})` : value;

    return `
        <div class="slider-container">
            <input type="range" id="${id}" data-path="${dataPath}" value="${value}" min="${min}" max="${max}" step="${step}" data-label-map='${JSON.stringify(labelMap || {})}'>
            <span id="${id}-value" class="value-display">${displayValue}</span>
        </div>
    `;
}

function createFallbackIndicator(dataPath, fallbackKeys) {
    if (fallbackKeys && fallbackKeys.includes(dataPath)) {
        return '<span class="fallback-indicator" title="This value was generated locally as a fallback.">L</span>';
    }
    return '';
}

export function createAnalysisView(analysisData, fallbackKeys, constants) {
    const { CONVERSATION_STATES, INTENT_OPTIONS, DATE_ARC_PHASES } = constants;
    const conversationAnalysis = analysisData || {};
    const lastMessageAnalysis = conversationAnalysis.lastMessageAnalysis || {};
    const analysis = conversationAnalysis.analysis || {};
    const engagement = conversationAnalysis.engagement || {};
    const powerDynamics = analysis.powerDynamics || {};
    const memory = conversationAnalysis.memory || {};

    const getArrayAsText = (arr) => Array.isArray(arr) ? arr.join('\n') : '';

    const valenceLabels = { '0': 'Negative', '0.5': 'Neutral', '1': 'Positive' };
    const arousalLabels = { '0': 'Calm', '0.5': 'Neutral', '1': 'Aroused' };
    const engagementOptions = ['low', 'medium', 'high'];
    const paceOptions = ['slow', 'medium', 'fast'];

    const analysisHtml = `
        <div class="card-subheader">Conversation Analysis</div>
        <table class="payload-table">
            <tr><td>Conversation State</td><td>${createFallbackIndicator('state', fallbackKeys)}${createSelect('analysis-state', 'analysis.state', CONVERSATION_STATES, conversationAnalysis.state)}</td></tr>
            <tr><td>Suppress Greeting?</td><td>${createFallbackIndicator('suppressGreeting', fallbackKeys)}${createCheckbox('analysis-suppressGreeting', 'analysis.suppressGreeting', conversationAnalysis.suppressGreeting)}</td></tr>
        </table>
        <div class="card-subheader">Last Message Subtext</div>
        <table class="payload-table">
            <tr><td>Is Direct Question?</td><td>${createFallbackIndicator('lastMessageAnalysis.isDirectQuestion', fallbackKeys)}${createCheckbox('subtext-isDirectQuestion', 'analysis.lastMessageAnalysis.isDirectQuestion', lastMessageAnalysis.isDirectQuestion)}</td></tr>
            <tr><td>Is Low Effort?</td><td>${createFallbackIndicator('lastMessageAnalysis.isLowEffort', fallbackKeys)}${createCheckbox('subtext-isLowEffort', 'analysis.lastMessageAnalysis.isLowEffort', lastMessageAnalysis.isLowEffort)}</td></tr>
            <tr><td>Is Sarcastic?</td><td>${createFallbackIndicator('lastMessageAnalysis.isSarcastic', fallbackKeys)}${createCheckbox('subtext-isSarcastic', 'analysis.lastMessageAnalysis.isSarcastic', lastMessageAnalysis.isSarcastic)}</td></tr>
            <tr><td>Valence</td><td>${createFallbackIndicator('lastMessageAnalysis.valence', fallbackKeys)}${createSlider('subtext-valence', 'analysis.lastMessageAnalysis.valence', lastMessageAnalysis.valence, 0, 1, 0.1, valenceLabels)}</td></tr>
            <tr><td>Arousal</td><td>${createFallbackIndicator('lastMessageAnalysis.arousal', fallbackKeys)}${createSlider('subtext-arousal', 'analysis.lastMessageAnalysis.arousal', lastMessageAnalysis.arousal, 0, 1, 0.1, arousalLabels)}</td></tr>
            <tr><td>Intents</td><td>${createFallbackIndicator('lastMessageAnalysis.intents', fallbackKeys)}${createMultiSelect('subtext-intents', 'analysis.lastMessageAnalysis.intents', INTENT_OPTIONS, lastMessageAnalysis.intents)}</td></tr>
        </table>
        <div class="card-subheader">Engagement</div>
        <table class="payload-table">
            <tr><td>Engagement</td><td>${createFallbackIndicator('analysis.engagement', fallbackKeys)}${createSelect('analysis-engagement', 'analysis.analysis.engagement', engagementOptions, analysis.engagement)}</td></tr>
            <tr><td>Pace</td><td>${createFallbackIndicator('engagement.pace', fallbackKeys)}${createSelect('engagement-pace', 'analysis.engagement.pace', paceOptions, engagement.pace)}</td></tr>
            <tr><td>Power Dynamics</td><td>${createFallbackIndicator('analysis.powerDynamics.summary', fallbackKeys)}${createInput('power-summary', 'analysis.analysis.powerDynamics.summary', powerDynamics.summary)}</td></tr>
        </table>
    `;

    const memoryHtml = `
        <div class="card-subheader">Match Memory</div>
        <table class="payload-table">
            <tr><td>Date Arc Phase</td><td>${createFallbackIndicator('memory.dateArcPhase', fallbackKeys)}${createSelect('memory-dateArcPhase', 'analysis.memory.dateArcPhase', DATE_ARC_PHASES, memory.dateArcPhase)}</td></tr>
            <tr><td>Inside Jokes</td><td>${createFallbackIndicator('memory.insideJokes', fallbackKeys)}${createTextarea('memory-insideJokes', 'analysis.memory.insideJokes', getArrayAsText(memory.insideJokes))}</td></tr>
            <tr><td>Avoided Topics</td><td>${createFallbackIndicator('memory.avoidedTopics', fallbackKeys)}${createTextarea('memory-avoidedTopics', 'analysis.memory.avoidedTopics', getArrayAsText(memory.avoidedTopics))}</td></tr>
            <tr><td>Question History</td><td>${createFallbackIndicator('memory.questionHistory', fallbackKeys)}${createTextarea('memory-questionHistory', 'analysis.memory.questionHistory', getArrayAsText(memory.questionHistory))}</td></tr>
        </table>
    `;

    return { analysisHtml, memoryHtml };
}

export function createCollapsibleJSON(title, dataObject, isEditable = true) {
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
