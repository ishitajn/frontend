import { DEBUG } from './debug.js';

let port = null;
let heartbeatInterval = null;

function setupPort(messageHandlers) {
    port = chrome.runtime.connect({
        name: "wingman-popup"
    });

    port.onMessage.addListener((message) => {
        DEBUG.log('PORT', 'Message received from background', message);
        const handler = messageHandlers[message.action];
        if (handler) {
            handler(message);
        }
    });

    port.onDisconnect.addListener(() => {
        DEBUG.log('PORT', 'Port disconnected from popup side.');
        stopHeartbeat();
        port = null;
    });
}

export function initializePort(messageHandlers) {
    if (!port) {
        setupPort(messageHandlers);
    }
}

export function sendMessage(message) {
    if (!port) {
        DEBUG.log('PORT', "Port was disconnected. Attempting to reconnect and send message.");
        // Re-initializing the port will be handled by the caller if needed.
        // For now, we just show an error.
        console.error("Port is not connected. Cannot send message.");
        return;
    }
    try {
        port.postMessage(message);
    } catch (e) {
        DEBUG.error('PORT', "Failed to send message on active port, likely disconnected mid-call.", e);
        port = null;
        // The caller should handle the reconnection.
    }
}

export function startHeartbeat() {
    stopHeartbeat();
    DEBUG.log('HEARTBEAT', 'Starting heartbeat...');
    heartbeatInterval = setInterval(() => {
        sendMessage({
            action: 'heartbeat'
        });
    }, 15000);
}

export function stopHeartbeat() {
    if (heartbeatInterval) {
        DEBUG.log('HEARTBEAT', 'Stopping heartbeat.');
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}
