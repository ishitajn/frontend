import { DEBUG } from '../shared/constants.js';
import { port, setPort, heartbeatInterval, setHeartbeatInterval } from './state.js';
import { showError } from './ui.js';

let isInitialized = false;
let messageHandlers = {};

/**
 * Sends a message to the background script via the active port.
 * @param {object} message - The message object to send.
 */
/**
 * Sends a message to the background script via the active port.
 * @param {object} message - The message object to send.
 */
export function sendMessage(message) {
    if (!port) {
        DEBUG.log('PORT', "Port was disconnected. Reconnecting.");
        // The setupPort is implicitly called by initializeApi on startup.
        // If the port disconnects, a new one will be made on next popup open.
        // For a single session, if port is gone, we show an error.
        showError("Connection Error", "The connection to the background service was lost. Please close and reopen the popup.");
        return;
    }

    try {
        port.postMessage(message);
    } catch (e) {
        DEBUG.error('PORT', "Failed to send message on active port.", e);
        setPort(null);
        showError("Connection Error", "Could not communicate with the background service. Please try reopening the popup.");
    }
}


/**
 * Starts a 15-second interval to send a heartbeat message to the background,
 * keeping the service worker active.
 */
export function startHeartbeat() {
    stopHeartbeat(); // Ensure no multiple heartbeats
    DEBUG.log('HEARTBEAT', 'Starting heartbeat...');
    setHeartbeatInterval(setInterval(() => {
        sendMessage({ action: 'heartbeat' });
    }, 15000));
}

/**
 * Stops the heartbeat interval.
 */
export function stopHeartbeat() {
    if (heartbeatInterval) {
        DEBUG.log('HEARTBEAT', 'Stopping heartbeat.');
        clearInterval(heartbeatInterval);
        setHeartbeatInterval(null);
    }
}


/**
 * Sets up the long-lived connection to the background script.
 * This function handles listening for incoming messages and disconnect events.
 * It is called internally by `initializeApi`.
 */
function setupPort() {
    const newPort = chrome.runtime.connect({ name: "wingman-popup" });
    setPort(newPort);

    newPort.onMessage.addListener((message) => {
        DEBUG.log('PORT', 'Message received from background', message);
        const handler = messageHandlers[message.action];
        if (handler) {
            handler(message);
        } else {
            DEBUG.error('PORT', `No handler found for action: ${message.action}`);
        }
    });

    newPort.onDisconnect.addListener(() => {
        DEBUG.log('PORT', 'Port disconnected.');
        stopHeartbeat();
        setPort(null);
        // The main orchestrator can decide what to do on disconnect,
        // for now we just log it and stop the heartbeat.
    });
}

/**
 * Initializes the API module by establishing a port to the background script
 * and setting up the message handlers. This should only be called once.
 * @param {object} handlers - An object mapping message action strings to handler functions.
 */
export function initializeApi(handlers) {
    if (isInitialized) {
        DEBUG.log('API', 'API already initialized.');
        return;
    }
    messageHandlers = handlers;
    setupPort();
    isInitialized = true;
    DEBUG.log('API', 'API initialized.');
}
