function createCollapsibleJSON(title, dataObject) {
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
                <pre class="raw-json-area" data-object-key="${key}">${jsonString}</pre>
            </details>
            <button class="icon-btn copy-json-btn" title="Copy JSON">
                ${copyIconSVG}
            </button>
        </div>
    `;
}

export function renderContextTab(analysis) {
    const contextTab = document.getElementById('context-tab');
    if (!contextTab) return;

    if (!analysis) {
        contextTab.innerHTML = '<div class="card"><div class="card-content">Analysis data not available.</div></div>';
        return;
    }

    let html = '<div class="card"><div class="card-content">';
    html += createCollapsibleJSON('Geo Context', analysis?.geo_context);
    html += createCollapsibleJSON('Topics', analysis?.topics);
    const suggestions = {
        suggest_flirtation: analysis?.suggest_flirtation ?? false,
        suggest_topic_shift: analysis?.suggest_topic_shift ?? false,
        suggest_follow_up_question: analysis?.suggest_follow_up_question ?? false,
        suggest_greeting: analysis?.suggest_greeting ?? false,
        topic_shift_recommended: analysis?.topic_shift_recommended ?? false,
    };
    html += createCollapsibleJSON('Suggestions', suggestions);
    html += createCollapsibleJSON('Full Analysis Object', analysis);
    html += '</div></div>';

    contextTab.innerHTML = html;
}
