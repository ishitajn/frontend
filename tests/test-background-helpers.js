import { test, assertEquals, assertDeepEquals } from './assert.js';
import { MatchMemory } from '../lib/memory.js';

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
