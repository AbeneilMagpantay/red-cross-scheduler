import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildScheduleEvents,
    getEventStatus,
    hasCheckedOut,
    organizeEventAssignments,
    reminderHoursToMinutes
} from './schedule.js';

const assignment = ({
    id,
    eventId = 'event-1',
    personnelId,
    name,
    date = '2026-08-20',
    start = '08:00:00',
    end = '12:00:00',
    attendance = []
}) => ({
    id,
    event_id: eventId,
    title: 'Medical Standby',
    duty_date: date,
    start_time: start,
    end_time: end,
    personnel_id: personnelId,
    personnel: personnelId ? { name } : null,
    attendance
});

test('includes the duty description in the grouped event details', () => {
    const [event] = buildScheduleEvents([
        { ...assignment({ id: 's1', personnelId: null }), duty_description: 'Bring a first-aid kit.' }
    ]);

    assert.equal(event.dutyDescription, 'Bring a first-aid kit.');
});

test('groups assignments by stable event ID', () => {
    const events = buildScheduleEvents([
        assignment({ id: 's1', personnelId: 'p1', name: 'Alex' }),
        assignment({ id: 's2', personnelId: 'p2', name: 'Bea', start: '13:00:00' })
    ]);

    assert.equal(events.length, 1);
    assert.equal(events[0].schedules.length, 2);
});

test('attaches pre-made empty teams to their event in display order', () => {
    const events = buildScheduleEvents([
        assignment({ id: 's1', personnelId: null })
    ], [
        { id: 't2', event_id: 'event-1', name: 'Bravo', sort_order: 1 },
        { id: 't1', event_id: 'event-1', name: 'Alpha', sort_order: 0 },
        { id: 'other', event_id: 'event-2', name: 'Other', sort_order: 0 }
    ]);

    assert.deepEqual(events[0].teams.map((team) => team.name), ['Alpha', 'Bravo']);
});

test('keeps legacy grouping compatible while leaving untitled duties separate', () => {
    const events = buildScheduleEvents([
        { ...assignment({ id: 's1', eventId: null }), event_id: null },
        { ...assignment({ id: 's2', eventId: null }), event_id: null, title: ' medical  standby ' },
        { ...assignment({ id: 's3', eventId: null }), event_id: null, title: null },
        { ...assignment({ id: 's4', eventId: null }), event_id: null, title: null }
    ]);

    assert.equal(events.length, 3);
});

test('reports upcoming, ongoing, and concluded event states', () => {
    const [event] = buildScheduleEvents([assignment({ id: 's1', personnelId: 'p1', name: 'Alex' })]);

    assert.equal(getEventStatus(event, new Date('2026-08-20T07:59:00')), 'upcoming');
    assert.equal(getEventStatus(event, new Date('2026-08-20T09:00:00')), 'ongoing');
    assert.equal(getEventStatus(event, new Date('2026-08-20T12:01:00')), 'concluded');
});

test('keeps an overnight duty editable until its next-day end time', () => {
    const [event] = buildScheduleEvents([
        assignment({ id: 's1', personnelId: 'p1', name: 'Alex', start: '18:00:00', end: '06:00:00' })
    ]);

    assert.equal(getEventStatus(event, new Date('2026-08-21T02:00:00')), 'ongoing');
    assert.equal(getEventStatus(event, new Date('2026-08-21T06:01:00')), 'concluded');
});

test('pins the current user and sorts remaining volunteers by AM, PM, time, then name', () => {
    const result = organizeEventAssignments([
        assignment({ id: 's1', personnelId: 'current', name: 'Current User', start: '14:00:00' }),
        assignment({ id: 's2', personnelId: 'p2', name: 'Bea', start: '13:00:00' }),
        assignment({ id: 's3', personnelId: 'p3', name: 'Alex', start: '08:00:00' }),
        assignment({ id: 's4', personnelId: 'p4', name: 'Cal', start: '08:00:00' })
    ], 'current');

    assert.equal(result.ownAssignment.id, 's1');
    assert.deepEqual(result.groups.map((group) => group.period), ['AM', 'PM']);
    assert.deepEqual(result.groups[0].assignments.map((item) => item.personnel.name), ['Alex', 'Cal']);
    assert.deepEqual(result.groups[1].assignments.map((item) => item.personnel.name), ['Bea']);
});

test('recognizes completed attendance as checked out', () => {
    assert.equal(hasCheckedOut(assignment({ id: 's1', attendance: [{ check_out: null }] })), false);
    assert.equal(hasCheckedOut(assignment({ id: 's2', attendance: [{ check_out: '2026-08-20T12:00:00Z' }] })), true);
});

test('converts up to five customizable reminder hours into unique minutes', () => {
    assert.deepEqual(
        reminderHoursToMinutes(['24', '2', '0.5', '2', '', '72']),
        [1440, 120, 30]
    );
    assert.deepEqual(reminderHoursToMinutes([]), []);
});
