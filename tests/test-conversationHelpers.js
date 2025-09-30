import { test, assertEquals } from './assert.js';

let _determineConversationState;

(async () => {
    try {
        const module = await import('../conversationHelpers.js');
        _determineConversationState = module._determineConversationState;
        runTests();
    } catch (e) {
        console.error("Failed to import conversationHelpers.js for testing.", e);
    }
})();

function runTests() {
    test('should return OPENER for empty history', () => {
        const history = [];
        const state = _determineConversationState(history);
        assertEquals(state, 'OPENER');
    });

    test('should return EARLY_CONVO for short history', () => {
        const history = [
            { role: 'assistant', content: 'Hey', date: new Date().toISOString() },
            { role: 'user', content: 'Hi', date: new Date().toISOString() },
        ];
        const state = _determineConversationState(history);
        assertEquals(state, 'EARLY_CONVO');
    });

    test('should return ACTIVE_CONVO for longer history', () => {
        const history = [
            { role: 'assistant', content: 'Hey', date: new Date().toISOString() },
            { role: 'user', content: 'Hi', date: new Date().toISOString() },
            { role: 'assistant', content: 'How are you?', date: new Date().toISOString() },
            { role: 'user', content: 'Good, you?', date: new Date().toISOString() },
            { role: 'assistant', content: 'Doing well!', date: new Date().toISOString() },
        ];
        const state = _determineConversationState(history);
        assertEquals(state, 'ACTIVE_CONVO');
    });

    test('should return REENGAGING_DAY if user sent last message 3 days ago', () => {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const history = [
            { role: 'assistant', content: 'Hey', date: threeDaysAgo.toISOString() },
            { role: 'user', content: 'Hi', date: threeDaysAgo.toISOString() },
        ];
        const state = _determineConversationState(history);
        assertEquals(state, 'REENGAGING_DAY');
    });

    test('should return REENGAGING_WEEK if user sent last message 8 days ago', () => {
        const eightDaysAgo = new Date();
        eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
        const history = [
            { role: 'assistant', content: 'Hey', date: eightDaysAgo.toISOString() },
            { role: 'user', content: 'Hi', date: eightDaysAgo.toISOString() },
        ];
        const state = _determineConversationState(history);
        assertEquals(state, 'REENGAGING_WEEK');
    });

    test('should return REENGAGING_MONTH if user sent last message 31 days ago', () => {
        const thirtyOneDaysAgo = new Date();
        thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);
        const history = [
            { role: 'assistant', content: 'Hey', date: thirtyOneDaysAgo.toISOString() },
            { role: 'user', content: 'Hi', date: thirtyOneDaysAgo.toISOString() },
        ];
        const state = _determineConversationState(history);
        assertEquals(state, 'REENGAGING_MONTH');
    });

    test('should return EARLY_CONVO if assistant sent the last message recently in a short conversation', () => {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
        const history = [
            { role: 'user', content: 'Hi', date: oneHourAgo.toISOString() },
            { role: 'assistant', content: 'Hey there!', date: now.toISOString() },
        ];
        const state = _determineConversationState(history);
        assertEquals(state, 'EARLY_CONVO');
    });

    test('should return REENGAGING_DAY if there was a 3-day gap before the last message', () => {
        const now = new Date();
        const threeDaysAgo = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));
        const history = [
            { role: 'user', content: 'Hi', date: threeDaysAgo.toISOString() },
            { role: 'assistant', content: 'Hey, sorry for the delay', date: now.toISOString() },
        ];
        const state = _determineConversationState(history);
        assertEquals(state, 'REENGAGING_DAY');
    });

    test('should handle invalid dates gracefully', () => {
        const history = [
            { role: 'user', content: 'Hi', date: 'invalid-date' },
            { role: 'assistant', content: 'Hey', date: new Date().toISOString() },
        ];
        const state = _determineConversationState(history);
        assertEquals(state, 'EARLY_CONVO'); // Should not crash
    });
}
