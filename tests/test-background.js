import { test, assertEquals, assertDeepEquals } from './assert.js';

// The function to be tested will be dynamically imported.
// This is a simplified approach for a browser-based test runner.
let deepMerge;

// Dynamically import the function from the module
(async () => {
    try {
        const module = await import('../background.js');
        deepMerge = module.deepMerge;
        runTests();
    } catch (e) {
        console.error("Failed to import background.js for testing.", e);
    }
})();

function runTests() {
    test('deepMerge should merge non-conflicting properties', () => {
        const primary = { a: 1 };
        const fallback = { b: 2 };
        const result = deepMerge(primary, fallback);
        assertDeepEquals(result, { a: 1, b: 2 });
    });

    test('deepMerge should prioritize primary object\'s values', () => {
        const primary = { a: 1 };
        const fallback = { a: 2, b: 2 };
        const result = deepMerge(primary, fallback);
        assertDeepEquals(result, { a: 1, b: 2 });
    });

    test('deepMerge should fill in null/undefined values from fallback', () => {
        const primary = { a: null, b: 1 };
        const fallback = { a: 2, c: 3 };
        const result = deepMerge(primary, fallback);
        assertDeepEquals(result, { a: 2, b: 1, c: 3 });
    });

    test('deepMerge should recursively merge nested objects', () => {
        const primary = { a: { b: 1 } };
        const fallback = { a: { c: 2 }, d: 3 };
        const result = deepMerge(primary, fallback);
        assertDeepEquals(result, { a: { b: 1, c: 2 }, d: 3 });
    });

    test('deepMerge should handle nested null/undefined values', () => {
        const primary = { a: { b: null }, d: 4 };
        const fallback = { a: { b: 1, c: 2 }, e: 5 };
        const result = deepMerge(primary, fallback);
        assertDeepEquals(result, { a: { b: 1, c: 2 }, d: 4, e: 5 });
    });

    test('deepMerge should not mutate the original objects', () => {
        const primary = { a: { b: 1 } };
        const fallback = { a: { c: 2 } };
        deepMerge(primary, fallback);
        assertDeepEquals(primary, { a: { b: 1 } });
        assertDeepEquals(fallback, { a: { c: 2 } });
    });
}
