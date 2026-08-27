import assert from 'node:assert/strict';
import test from 'node:test';
import {
    computeUnreadAlerts,
    getAlertCategoryClass,
    getReadAlertIds,
    markAlertsRead,
    normalizeAlertUrl,
    normalizeExternalUrl,
    sortArcAlerts
} from './alerts.js';

const memoryStorage = () => {
    const values = new Map();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value)
    };
};

test('tracks read alerts separately for each user', () => {
    const storage = memoryStorage();
    markAlertsRead([{ id: 'one' }, { id: 'two' }], 'user-a', storage);
    markAlertsRead([{ id: 'three' }], 'user-b', storage);

    assert.deepEqual(getReadAlertIds('user-a', storage), ['one', 'two']);
    assert.deepEqual(getReadAlertIds('user-b', storage), ['three']);
    assert.equal(computeUnreadAlerts([{ id: 'one' }, { id: 'new' }], getReadAlertIds('user-a', storage)), 1);
});

test('sorts pinned alerts first and respects their saved order', () => {
    const sorted = sortArcAlerts([
        { id: 'later', is_pinned: false, sort_order: 2 },
        { id: 'pinned', is_pinned: true, sort_order: 4 },
        { id: 'first', is_pinned: false, sort_order: 0 }
    ]);

    assert.deepEqual(sorted.map((alert) => alert.id), ['pinned', 'first', 'later']);
});

test('maps alert categories to stable style names', () => {
    assert.equal(getAlertCategoryClass('Operational Dispatch'), 'dispatch');
    assert.equal(getAlertCategoryClass('Deployment'), 'deployment');
    assert.equal(getAlertCategoryClass('Something else'), 'general');
});

test('accepts only web URLs for announcement links', () => {
    assert.equal(normalizeAlertUrl('https://example.com/form'), 'https://example.com/form');
    assert.equal(normalizeExternalUrl('http://example.com/resource'), 'http://example.com/resource');
    assert.equal(normalizeAlertUrl('javascript:alert(1)'), '');
    assert.equal(normalizeExternalUrl('data:text/html,<script>alert(1)</script>'), '');
    assert.equal(normalizeAlertUrl('not a link'), '');
});
