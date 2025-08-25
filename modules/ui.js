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
    // Add all other selectors here as needed
};

export function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const view = document.getElementById(viewId);
    if (view)
        view.classList.remove('hidden');
}

function switchTab(event) {
    const tabButton = event.currentTarget;
    const tabId = tabButton.dataset.tab;

    // Deactivate all tabs
    document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Activate the clicked tab
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

import { generatePrompts } from './prompts.js';

export function renderFinalViewTab(payload) {
    const finalViewTab = document.getElementById('final-view-tab');
    if (!finalViewTab) return;

    const { system_prompt, user_prompt } = generatePrompts(payload);
    const finalPayload = {
        system_prompt,
        user_prompt,
        // In a real scenario, we'd add other parameters like temperature, etc.
    };

    let html = '<div class="card"><div class="card-content">';
    html += '<h4>System Prompt</h4>';
    html += `<textarea class="prompt-display" readonly>${system_prompt}</textarea>`;
    html += '<h4>User Prompt</h4>';
    html += `<textarea class="prompt-display" readonly>${user_prompt}</textarea>`;
    html += '<hr>';
    html += createCollapsibleJSON('Final LLM Payload', finalPayload);
    html += '</div></div>';

    finalViewTab.innerHTML = html;

    // Add event listener for the new copy button
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
