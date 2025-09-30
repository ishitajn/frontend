import { SELECTORS } from '../shared/constants.js';

// This object holds the core session state.
export const state = {
    currentMatchUUID: null,
    currentViewId: SELECTORS.loadingView,
    pasterFn: null,
    isRefreshing: false,
    sessionMatchProfile: null,
    sessionScrapedData: null,
};

// These are session-level variables that don't fit neatly into the state object,
// but are still part of the popup's overall state.
export let port = null;
export let tooltipTimeout = null;
export let timerInterval = null;
export let timerStartTime = 0;
export let heartbeatInterval = null;

// Functions to update the state, ensuring mutations are tracked.
export function setPort(newPort) {
    port = newPort;
}

export function setTooltipTimeout(newTimeout) {
    tooltipTimeout = newTimeout;
}

export function setTimerInterval(newInterval) {
    timerInterval = newInterval;
}

export function setTimerStartTime(newTime) {
    timerStartTime = newTime;
}

export function setHeartbeatInterval(newInterval) {
    heartbeatInterval = newInterval;
}
