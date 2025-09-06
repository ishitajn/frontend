import { test, assertEquals, assertDeepEquals } from './assert.js';
import { deepMerge } from '../background.js';
import { MatchMemory } from '../background.js'; // Assuming MatchMemory is exported or accessible

const memory = new MatchMemory();

test('MatchMemory._getMatchUUID should generate consistent hash for same profile string', async () => {
    const uuid1 = await memory._getMatchUUID('John Doe', 'A simple profile string.');
    const uuid2 = await memory._getMatchUUID('John Doe', 'A simple profile string.');
    assertEquals(uuid1, uuid2, 'Hashes for identical string profiles should match');
});

test('MatchMemory._getMatchUUID should generate different hashes for different profile strings', async () => {
    const uuid1 = await memory._getMatchUUID('John Doe', 'A simple profile string.');
    const uuid2 = await memory._getMatchUUID('John Doe', 'A different profile string.');
    if (uuid1 === uuid2) {
        throw new Error('Hashes for different string profiles should not match');
    }
});

test('MatchMemory._getMatchUUID should generate consistent hash for object profiles regardless of key order', async () => {
    const profile1 = { interest: 'hiking', lookingFor: 'relationship' };
    const profile2 = { lookingFor: 'relationship', interest: 'hiking' };
    const uuid1 = await memory._getMatchUUID('Jane Doe', profile1);
    const uuid2 = await memory._getMatchUUID('Jane Doe', profile2);
    assertEquals(uuid1, uuid2, 'Hashes for object profiles with different key order should match');
});

test('MatchMemory._getMatchUUID should handle null and undefined inputs gracefully', async () => {
    const uuid1 = await memory._getMatchUUID(null, null);
    const uuid2 = await memory._getMatchUUID(undefined, undefined);
    assertEquals(uuid1, uuid2, 'Hashes for null and undefined should be consistent');
});

test('deepMerge should merge simple objects', () => {
    const primary = { a: 1, b: 2 };
    const fallback = { b: 3, c: 4 };
    const result = deepMerge(primary, fallback);
    assertDeepEquals(result, { a: 1, b: 2, c: 4 });
});

test('deepMerge should merge nested objects', () => {
    const primary = { a: 1, b: { x: 10 } };
    const fallback = { b: { y: 20 }, c: 3 };
    const result = deepMerge(primary, fallback);
    assertDeepEquals(result, { a: 1, b: { x: 10, y: 20 }, c: 3 });
});

test('deepMerge should concatenate arrays and remove duplicates', () => {
    const primary = { a: [1, 2], b: ['hello'] };
    const fallback = { a: [2, 3], c: [4, 5] };
    const result = deepMerge(primary, fallback);
    assertDeepEquals(result, { a: [1, 2, 3], b: ['hello'], c: [4, 5] });
});

test('deepMerge should not overwrite existing properties with null/undefined from fallback', () => {
    const primary = { a: 1, b: 2 };
    const fallback = { a: null, b: undefined, c: 3 };
    const result = deepMerge(primary, fallback);
    assertDeepEquals(result, { a: 1, b: 2, c: 3 });
});
