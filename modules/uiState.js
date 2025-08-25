import { mockPayload } from '../dev/mock_payload.js';

const state = {
    currentMatchUUID: null,
    pasterFn: null,
    isRefreshing: false,
    isGenerating: false,
    sessionMatchProfile: null,
    sessionScrapedData: null,
    nlpPayload: mockPayload, // Using mock data for development
};

export function getState() {
    return state;
}

export function setState(newState) {
    Object.assign(state, newState);
}

export function getPasterFunction() {
    return state.pasterFn;
}

export function setPasterFunction(pasterFn) {
    state.pasterFn = pasterFn;
}

export function getNlpPayload() {
    return state.nlpPayload;
}

export function setNlpPayload(payload) {
    state.nlpPayload = payload;
}
