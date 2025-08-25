import { generatePrompts } from '../prompts.js';

export function updateFinalTab(state) {
    const finalJsonDisplay = document.getElementById('final-json-display');
    if (!finalJsonDisplay) return;

    if (!state.sessionMatchProfile) {
        finalJsonDisplay.textContent = 'Waiting for data...';
        return;
    }

    const { systemMessage, userMessage } = generatePrompts({
        conversationHistory: state.sessionMatchProfile.conversationHistory,
        taskInstructions: {
            myName: state.sessionScrapedData?.myName,
            theirName: state.sessionMatchProfile.metadata?.theirName,
            goal: document.getElementById('custom-instruction').value.trim(),
            flirtyValue: Number(document.getElementById('flirty-slider').value),
            lengthValue: Number(document.getElementById('length-slider').value),
            linguisticStyle: document.getElementById('linguistic-style-select').value,
            emojiStrategy: document.getElementById('emoji-strategy-select').value,
            temperature: parseFloat(document.getElementById('temperature-slider').value),
            top_p: parseFloat(document.getElementById('top-p-slider').value),
            endWithQuestion: document.getElementById('question-toggle-checkbox').checked,
            strictGoalOverride: document.getElementById('strict-goal-toggle').checked,
            forceNewTopic: document.getElementById('new-topic-toggle').checked,
            local_model_name: document.getElementById('localModelName').value,
        },
        geoContextData: state.sessionMatchProfile.memory.geoContextData,
        forceIncludeGeoContext: document.getElementById('geo-context-toggle').checked,
        conversationAnalysis: state.sessionMatchProfile.analysis,
        myProfile: document.getElementById('my-profile-setting').value,
        theirProfile: state.sessionMatchProfile.metadata?.theirProfile,
    });

    const finalPayload = {
        messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: userMessage }
        ],
        temperature: parseFloat(document.getElementById('temperature-slider').value),
        top_p: parseFloat(document.getElementById('top-p-slider').value),
    };

    finalJsonDisplay.textContent = JSON.stringify(finalPayload, null, 2);
}

export function setupFinalTab(state) {
    const copyBtn = document.getElementById('copy-final-json-btn');
    const finalJsonDisplay = document.getElementById('final-json-display');

    copyBtn?.addEventListener('click', () => {
        if (finalJsonDisplay.textContent) {
            navigator.clipboard.writeText(finalJsonDisplay.textContent).then(() => {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = 'Copied!';
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                }, 1500);
            });
        }
    });

    const updateCallback = () => updateFinalTab(state);

    document.getElementById('tune-tab')?.addEventListener('input', updateCallback);
    document.getElementById('context-tab')?.addEventListener('input', updateCallback);
}
