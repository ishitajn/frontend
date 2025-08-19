import { LINGUISTIC_STYLES } from '../conversationHelpers.js';
import { EMOJI_STRATEGIES, USER_LOCATIONS } from './config.js';
import { SELECTORS, populateSelect, updateSliderLabels, updateSliderValueLabel, handleTooltipShow, handleTooltipHide } from './ui.js';

export function setupEventListeners(callbacks) {
    window.addEventListener('focus', callbacks.refreshDataAndUI);
    document.getElementById(SELECTORS.generateBtn)?.addEventListener('click', callbacks.handleGenerateClick);
    document.getElementById(SELECTORS.copyBtn)?.addEventListener('click', callbacks.handleCopyClick);
    document.getElementById(SELECTORS.cancelBtn)?.addEventListener('click', callbacks.handleCancelClick);
    document.getElementById(SELECTORS.settingsBtn)?.addEventListener('click', () => callbacks.showView(SELECTORS.settingsView));
    document.getElementById(SELECTORS.backBtn)?.addEventListener('click', () => callbacks.showView(SELECTORS.mainView));
    document.getElementById(SELECTORS.masterResetBtn)?.addEventListener('click', callbacks.handleMasterReset);
    document.getElementById(SELECTORS.resetMatchBtn)?.addEventListener('click', callbacks.handleMatchReset);
    document.getElementById(SELECTORS.flirtySlider)?.addEventListener('input', updateSliderLabels);
    document.getElementById(SELECTORS.lengthSlider)?.addEventListener('input', updateSliderLabels);
    document.getElementById(SELECTORS.temperatureSlider)?.addEventListener('input', () => updateSliderValueLabel(SELECTORS.temperatureSlider, SELECTORS.temperatureValueLabel));
    document.getElementById(SELECTORS.topPSlider)?.addEventListener('input', () => updateSliderValueLabel(SELECTORS.topPSlider, SELECTORS.topPValueLabel, 2));
    document.querySelectorAll('.info-icon, [data-tooltip-id]').forEach(icon => {
        icon.addEventListener('mouseenter', handleTooltipShow);
        icon.addEventListener('mouseleave', handleTooltipHide);
    });
    document.getElementById('main-view')?.addEventListener('input', callbacks.handleSettingChange);
    document.getElementById('main-view')?.addEventListener('change', callbacks.handleSettingChange);
    document.getElementById('settings-view')?.addEventListener('input', callbacks.handleSettingChange);
    document.getElementById('settings-view')?.addEventListener('change', callbacks.handleSettingChange);
    document.getElementById(SELECTORS.userLocationSelect)?.addEventListener('change', callbacks.handleLocationChange);
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
    document.getElementById(SELECTORS.dateIdeaBtn)?.addEventListener('click', callbacks.handleDateIdeaClick);
    document.getElementById(SELECTORS.refinementActions)?.addEventListener('click', callbacks.handleRefinementClick);

    document.getElementById('test-api-btn')?.addEventListener('click', callbacks.handleTestApiConnection);
    document.getElementById('test-nlp-btn')?.addEventListener('click', callbacks.handleTestNlpConnection);

    document.getElementById('ai-provider-select')?.addEventListener('change', callbacks.updateModelDropdown);

    document.querySelector('.tab-buttons')?.addEventListener('click', (event) => {
        const target = event.target.closest('.tab-button');
        if (!target) return;

        const tabId = target.dataset.tab;

        // Handle main tabs
        if (target.parentElement.parentElement.id !== 'settings-view') {
            document.querySelectorAll('#main-view .tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('#main-view .tab-content').forEach(content => content.classList.remove('active'));
        }

        target.classList.add('active');
        document.getElementById(tabId)?.classList.add('active');
    });

    document.querySelector('#settings-view .tab-buttons')?.addEventListener('click', (event) => {
        const target = event.target.closest('.tab-button');
        if (!target) return;

        const tabId = target.dataset.tab;

        document.querySelectorAll('#settings-view .tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('#settings-view .tab-content').forEach(content => content.classList.remove('active'));

        target.classList.add('active');
        document.getElementById(tabId)?.classList.add('active');
    });

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
