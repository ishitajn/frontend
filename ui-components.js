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
        const numVal = parseFloat(val);
        for (const [limit, label] of Object.entries(labelMap)) {
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
