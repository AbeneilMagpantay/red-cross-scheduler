import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDutyDate, formatTime, formatTimeRange } from './format.js';

test('formats database times as 12-hour clock times', () => {
    assert.equal(formatTime('08:00:00'), '8:00 AM');
    assert.equal(formatTime('00:30'), '12:30 AM');
    assert.equal(formatTime('12:05:00'), '12:05 PM');
    assert.equal(formatTime('23:59'), '11:59 PM');
    assert.equal(formatTime(null), '');
    assert.equal(formatTime('not a time'), '');
});

test('formats time ranges with sensible fallbacks', () => {
    assert.equal(formatTimeRange('08:00:00', '17:00:00'), '8:00 AM – 5:00 PM');
    assert.equal(formatTimeRange('08:00', null), 'From 8:00 AM');
    assert.equal(formatTimeRange(null, '17:00'), 'Until 5:00 PM');
    assert.equal(formatTimeRange(null, null, 'TBA'), 'TBA');
});

test('formats duty dates without shifting the day', () => {
    assert.equal(formatDutyDate('2026-10-23'), 'Friday, October 23, 2026');
    assert.equal(formatDutyDate('2026-01-01', 'MMM d'), 'Jan 1');
    assert.equal(formatDutyDate(''), '');
});
