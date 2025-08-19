import { DEBUG } from './debug.js';

let port = null;
let heartbeatInterval = null;


export function initializePort(messageHandlers, onDisconnect) {
    if (!port) {
        setupPort(messageHandlers, onDisconnect);
    }
}

function setupPort(messageHandlers, onDisconnect) {
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
        if (onDisconnect) {
            onDisconnect();
        }
    });
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

export function getGenerationState(uuid) {
    return new Promise(resolve => {
        const listener = (msg) => {
            if (msg.action === 'generationStateResponse') {
                if (port)
                    port.onMessage.removeListener(listener);
                resolve(msg.state);
            }
        };
        if (port) {
            sendMessage({
                action: "getGenerationState",
                data: {
                    uuid: uuid
                }
            });
            port.onMessage.addListener(listener);
        } else {
            resolve({
                isGenerating: false,
                response: null,
                error: null,
                generationId: null,
                generationStartTime: null
            });
        }
    });
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
