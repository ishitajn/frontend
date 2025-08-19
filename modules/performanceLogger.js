import { DEBUG } from './debug.js';

class PerformanceLogger {
    async log(logData) {
        try {
            const timestamp = new Date().toISOString();
            const logEntry = {
                timestamp,
                ...logData
            };
            const key = `perflog_${timestamp}`;
            await chrome.storage.local.set({
                [key]: logEntry
            });
            DEBUG.log('PERFLOG', 'Performance log saved.', key);
        } catch (e) {
            DEBUG.error('PERFLOG', 'Failed to save performance log.', e);
        }
    }
}

export const performanceLogger = new PerformanceLogger();
