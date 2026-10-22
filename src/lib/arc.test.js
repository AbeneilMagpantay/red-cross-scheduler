import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CORE_ROWS,
    countDeliverables,
    createDefaultCoreFields,
    getCoreLineKeys,
    parseCustomCoreRows,
    roleCanEditArc,
    sanitizeArcHtml
} from './arc.js';

test('limits NEXUS and CORE editing to Admins and Officers', () => {
    assert.equal(roleCanEditArc('admin'), true);
    assert.equal(roleCanEditArc('officer'), true);
    assert.equal(roleCanEditArc('volunteer'), false);
    assert.equal(roleCanEditArc('staff'), false);
});

test('builds CORE defaults with numbered Lead deliverables', () => {
    const fields = createDefaultCoreFields();

    assert.equal(CORE_ROWS.length, 13);
    assert.equal(fields['status-lead-1'], 'In Progress');
    assert.equal(fields['deadline-lead-3'], 'May 15, 2026');
    assert.equal(fields['status-finance'], 'Not Started');
});

test('keeps the original single-line key while numbering additional items', () => {
    const row = { slug: 'finance' };
    assert.deepEqual(getCoreLineKeys(row, 3, 'status'), [
        'status-finance',
        'status-finance-2',
        'status-finance-3'
    ]);
    assert.equal(countDeliverables('<ul><li>One</li><li>Two</li></ul>'), 2);
    assert.equal(countDeliverables('Plain deliverable'), 1);
});

test('removes unsafe rich HTML and all element attributes', () => {
    const sanitized = sanitizeArcHtml('<b onclick="bad()">Safe</b><script>alert(1)</script><img src=x>');
    assert.equal(sanitized, '<b>Safe</b>');
});

test('parses valid custom CORE rows and ignores malformed data', () => {
    assert.equal(parseCustomCoreRows('not json').length, 0);
    assert.deepEqual(parseCustomCoreRows('[{"slug":"health","colorClass":"safe"}]'), [{
        slug: 'health',
        label: 'New Committee',
        color: 'safe',
        deliverable: 'New deliverable'
    }]);
});
