import test from 'node:test';
import assert from 'node:assert';
import { getToneDescription, getLengthDescription, getTimeContext } from '../conversationHelpers.js';

test('getToneDescription', (t) => {
  assert.strictEqual(getToneDescription(0), 'Be completely neutral and formal.');
  assert.strictEqual(getToneDescription(10), 'Be polite and straightforward.');
  assert.strictEqual(getToneDescription(20), 'Be polite and friendly.');
  assert.strictEqual(getToneDescription(30), 'Be warm and relaxed.');
  assert.strictEqual(getToneDescription(40), 'Be friendly and approachable.');
  assert.strictEqual(getToneDescription(50), 'Be lightly flirty and casually engaging.');
  assert.strictEqual(getToneDescription(60), 'Be moderately flirty and engaging.');
  assert.strictEqual(getToneDescription(70), 'Be flirty and playful.');
  assert.strictEqual(getToneDescription(80), 'Be very flirty and confident.');
  assert.strictEqual(getToneDescription(90), 'Be intensely flirty and bold.');
  assert.strictEqual(getToneDescription(100), 'Be explicitly sexual and daring.');
});

test('getLengthDescription', (t) => {
    assert.strictEqual(getLengthDescription(0), 'Strictly 2–5 words (micro).');
    assert.strictEqual(getLengthDescription(10), 'Strictly 5–10 words (ultra short).');
    assert.strictEqual(getLengthDescription(20), 'Strictly one full sentence (very short).');
    assert.strictEqual(getLengthDescription(30), 'Strictly 1–2 sentences (short).');
    assert.strictEqual(getLengthDescription(40), 'Strictly 2 sentences (moderately short).');
    assert.strictEqual(getLengthDescription(50), 'Strictly 2–3 sentences (medium).');
    assert.strictEqual(getLengthDescription(60), 'Strictly 3–4 sentences (moderately long).');
    assert.strictEqual(getLengthDescription(70), 'Strictly 4–5 sentences (long).');
    assert.strictEqual(getLengthDescription(80), 'Strictly 5–6 sentences (very long).');
    assert.strictEqual(getLengthDescription(90), 'Strictly 6–7 sentences (epic).');
    assert.strictEqual(getLengthDescription(100), 'Strictly 8+ sentences (a manifesto).');
});

test('getTimeContext', (t) => {
    // Test for a weekday
    const wednesday = new Date('2023-10-25T14:00:00.000Z'); // This is a Wednesday
    const weekdayContext = getTimeContext(wednesday);
    assert.strictEqual(weekdayContext.includes('It\'s a weekday, Wednesday - late afternoon.'), true, 'Should return correct context for a weekday');

    // Test for a weekend
    const saturday = new Date('2023-10-28T10:00:00.000Z'); // This is a Saturday
    const weekendContext = getTimeContext(saturday);
    assert.strictEqual(weekendContext.includes('It\'s the weekend, Saturday(morning).'), true, 'Should return correct context for a weekend');
});
