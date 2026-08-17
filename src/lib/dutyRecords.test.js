import test from 'node:test';
import assert from 'node:assert/strict';
import { groupAttendanceByEvent, summarizePersonnelAttendance } from './dutyRecords.js';

const attendanceRecord = ({
    id,
    scheduleId,
    personnelId,
    name,
    date = '2026-08-17',
    title = 'Medical Standby',
    start = '08:00:00',
    end = '12:00:00',
    status = 'present',
    checkIn = null,
    checkOut = null,
    createdAt = '2026-08-17T00:00:00Z'
}) => ({
    id,
    schedule_id: scheduleId,
    personnel_id: personnelId,
    personnel: { name },
    status,
    check_in: checkIn,
    check_out: checkOut,
    created_at: createdAt,
    schedules: {
        duty_date: date,
        title,
        start_time: start,
        end_time: end
    }
});

test('groups different shifts of the same titled event into one table', () => {
    const grouped = groupAttendanceByEvent([
        attendanceRecord({ id: 'a1', scheduleId: 's1', personnelId: 'p1', name: 'Alex' }),
        attendanceRecord({
            id: 'a2',
            scheduleId: 's2',
            personnelId: 'p2',
            name: 'Bea',
            title: '  medical   standby ',
            start: '12:00:00',
            end: '16:00:00'
        })
    ]);

    assert.equal(grouped.length, 1);
    assert.deepEqual(grouped[0].timeRanges, ['08:00 - 12:00', '12:00 - 16:00']);
    assert.equal(grouped[0].attendees.length, 2);
    assert.equal(grouped[0].attendees[1].scheduledTime, '12:00 - 16:00');
});

test('keeps same-titled events on different dates and untitled duties separate', () => {
    const grouped = groupAttendanceByEvent([
        attendanceRecord({ id: 'a1', scheduleId: 's1', personnelId: 'p1', name: 'Alex' }),
        attendanceRecord({
            id: 'a2',
            scheduleId: 's2',
            personnelId: 'p2',
            name: 'Bea',
            date: '2026-08-18'
        }),
        attendanceRecord({ id: 'a3', scheduleId: 's3', personnelId: 'p3', name: 'Cal', title: null }),
        attendanceRecord({ id: 'a4', scheduleId: 's4', personnelId: 'p4', name: 'Dia', title: null })
    ]);

    assert.equal(grouped.length, 4);
});

test('builds a personal attendance summary and ignores another person records', () => {
    const grouped = [
        attendanceRecord({
            id: 'a1',
            scheduleId: 's1',
            personnelId: 'p1',
            name: 'Alex',
            checkIn: '2026-08-17T00:00:00Z',
            checkOut: '2026-08-17T08:30:00Z'
        }),
        attendanceRecord({ id: 'a2', scheduleId: 's2', personnelId: 'p1', name: 'Alex', status: 'late' }),
        attendanceRecord({ id: 'a3', scheduleId: 's3', personnelId: 'p1', name: 'Alex', status: 'absent' }),
        attendanceRecord({ id: 'a4', scheduleId: 's4', personnelId: 'p2', name: 'Bea' })
    ];

    const summary = summarizePersonnelAttendance(grouped, 'p1');

    assert.equal(summary.attended, 2);
    assert.equal(summary.present, 1);
    assert.equal(summary.late, 1);
    assert.equal(summary.absent, 1);
    assert.equal(summary.attendanceRate, 67);
    assert.equal(summary.loggedHours, 8.5);
});
