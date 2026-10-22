import test from 'node:test';
import assert from 'node:assert/strict';
import { getAttendanceBadge, getDutyProgressBadge, getRoleLabel, getSwapBadge } from './status.js';

test('labels roles and falls back for unknown ones', () => {
    assert.equal(getRoleLabel('admin'), 'Administrator');
    assert.equal(getRoleLabel('volunteer'), 'Volunteer');
    assert.equal(getRoleLabel(undefined), 'Member');
});

test('maps attendance and swap statuses to badge tones', () => {
    assert.deepEqual(getAttendanceBadge('late'), { tone: 'warning', label: 'Late' });
    assert.deepEqual(getAttendanceBadge(null), { tone: 'neutral', label: 'Pending' });
    assert.deepEqual(getSwapBadge('approved'), { tone: 'success', label: 'Approved' });
});

test('describes a duty from its attendance records', () => {
    assert.equal(getDutyProgressBadge([]).label, 'Scheduled');
    assert.equal(getDutyProgressBadge([{ status: 'present', check_in: '2026-08-20T00:00:00Z' }]).label, 'Checked in');
    assert.equal(getDutyProgressBadge([{ status: 'late', check_in: '2026-08-20T00:30:00Z' }]).label, 'Late');
    assert.equal(getDutyProgressBadge([{ status: 'present', check_in: 'x', check_out: 'y' }]).label, 'Checked out');
    assert.equal(getDutyProgressBadge([{ status: 'absent' }]).label, 'Absent');
});
