import { DEFAULTS, MATCH_SPECIFIC_SETTINGS_KEYS, SELECTORS } from './constants.js';
import { state } from './state.js';
import { showToast, updateSliderLabels, updateSliderValueLabel, updateClearButtonVisibility } from './ui.js';

const getMatchSettingsKey = (uuid) => `matchSettings_${uuid}`;

/**
 * Validates if a given string is a valid URL.
 * @param {string} string - The string to validate.
 * @returns {boolean} True if the string is a valid URL, false otherwise.
 */
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Updates the UI to add a visual indicator to settings that have been
 * overridden for the current match.
 * @param {object} matchSettings - The settings object specific to the current match.
 */
export function updateOverrideIndicators(matchSettings) {
    document.querySelectorAll('[data-storage-key]').forEach(el => {
        const key = el.dataset.storageKey;
        if (MATCH_SPECIFIC_SETTINGS_KEYS.includes(key)) {
            const controlGroup = el.closest('.control-group');
            if (controlGroup) {
                if (matchSettings.hasOwnProperty(key)) {
                    controlGroup.classList.add('overridden');
                    controlGroup.title = 'This setting is specific to this match.';
                } else {
                    controlGroup.classList.remove('overridden');
                    controlGroup.title = '';
                }
            }
        }
    });
}

/**
 * Loads global settings and any match-specific settings from storage,
 * merges them, and applies the final values to the UI controls.
 */
export async function loadAndApplySettings() {
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
            if (el.type === 'checkbox') {
                el.checked = value;
            } else {
                el.value = value;
            }
        }
    });
    const responseArea = document.getElementById(SELECTORS.responseArea);
    if (responseArea && finalSettings.lastResponse) {
        responseArea.textContent = finalSettings.lastResponse;
    }

    // Update UI elements that depend on these settings
    updateSliderLabels();
    updateSliderValueLabel(SELECTORS.temperatureSlider, SELECTORS.temperatureValueLabel);
    updateSliderValueLabel(SELECTORS.topPSlider, SELECTORS.topPValueLabel, 2);
    updateClearButtonVisibility(document.getElementById(SELECTORS.customInstruction), document.getElementById(SELECTORS.clearInstructionBtn));
    updateClearButtonVisibility(responseArea, document.getElementById(SELECTORS.clearResponseBtn));
    updateOverrideIndicators(matchSpecificSettings);
}


/**
 * Saves the value of a UI control to chrome.storage.
 * The setting can be saved globally or as a match-specific override.
 * @param {HTMLElement} el - The DOM element whose setting has changed.
 */
export async function handlePersistentSetting(el) {
    const storageKey = el.dataset.storageKey;
    if (!storageKey) return;

    if (el.id === 'analysisUrl' || el.id === 'llmUrl') {
        if (el.value && !isValidUrl(el.value)) {
            el.classList.add('invalid');
            showToast('Please enter a valid URL.', 'error');
            return;
        } else {
            el.classList.remove('invalid');
        }
    }

    if (el.id === SELECTORS.responseArea) {
        await chrome.storage.local.set({ 'lastResponse': el.textContent });
        return;
    }

    const value = el.type === 'checkbox' ? el.checked : el.value;

    if (MATCH_SPECIFIC_SETTINGS_KEYS.includes(storageKey) && state.currentMatchUUID) {
        const settingsStorageKey = getMatchSettingsKey(state.currentMatchUUID);
        const result = await chrome.storage.local.get(settingsStorageKey);
        const matchSettings = result[settingsStorageKey] || {};
        matchSettings[storageKey] = value;
        await chrome.storage.local.set({ [settingsStorageKey]: matchSettings });
    } else {
        await chrome.storage.local.set({ [storageKey]: value });
    }
    showToast('Settings saved');
}

/**
 * Handles the 'Reset Match Preferences' button click. Removes all match-specific
 * settings overrides from storage and reloads the settings.
 */
export async function handleMatchReset() {
    if (!state.currentMatchUUID) return;
    const btn = document.getElementById(SELECTORS.resetMatchBtn);
    btn.disabled = true;
    try {
        await chrome.storage.local.remove(getMatchSettingsKey(state.currentMatchUUID));
        document.getElementById(SELECTORS.responseArea).textContent = '';
        await loadAndApplySettings();
        updateOverrideIndicators({}); // Clear indicators
    } catch (e) {
        console.error("Failed to reset match settings:", e);
    } finally {
        btn.disabled = false;
    }
}

/**
 * Handles the 'Reset All Global Defaults' button click. Removes all global
 * settings from storage, reverting them to their default values.
 */
export async function handleMasterReset() {
    const btn = document.getElementById(SELECTORS.masterResetBtn);
    btn.disabled = true;
    try {
        const keysToRemove = Object.keys(DEFAULTS);
        await chrome.storage.local.remove(keysToRemove);
        await loadAndApplySettings();
    } catch (e) {
        console.error("Failed to reset master settings:", e);
    } finally {
        btn.disabled = false;
    }
}
