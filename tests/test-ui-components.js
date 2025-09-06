import { test, assertEquals } from './assert.js';
import { formatTime } from '../ui-components.js';

test('formatTime should format AM time correctly', () => {
    const date = new Date('2023-01-01T10:30:00');
    assertEquals(formatTime(date), '10:30 AM');
});

test('formatTime should format PM time correctly', () => {
    const date = new Date('2023-01-01T22:45:00');
    assertEquals(formatTime(date), '10:45 PM');
});

test('formatTime should format midnight correctly', () => {
    const date = new Date('2023-01-01T00:15:00');
    assertEquals(formatTime(date), '12:15 AM');
});

test('formatTime should format noon correctly', () => {
    const date = new Date('2023-01-01T12:05:00');
    assertEquals(formatTime(date), '12:05 PM');
});

test('formatTime should pad single-digit minutes', () => {
    const date = new Date('2023-01-01T08:05:00');
    assertEquals(formatTime(date), '8:05 AM');
});

test('formatTime should handle null input', () => {
    assertEquals(formatTime(null), 'N/A');
});

test('formatTime should handle undefined input', () => {
    assertEquals(formatTime(undefined), 'N/A');
});
