const ROLE_LABELS = {
    admin: 'Administrator',
    officer: 'Officer',
    volunteer: 'Volunteer'
};

export const getRoleLabel = (role) => ROLE_LABELS[role] || 'Member';

// Badge tones map to the .badge-<tone> classes in index.css.
const ATTENDANCE_BADGES = {
    present: { tone: 'success', label: 'Present' },
    late: { tone: 'warning', label: 'Late' },
    absent: { tone: 'error', label: 'Absent' },
    excused: { tone: 'info', label: 'Excused' }
};

const SWAP_BADGES = {
    pending: { tone: 'warning', label: 'Pending' },
    approved: { tone: 'success', label: 'Approved' },
    rejected: { tone: 'error', label: 'Rejected' }
};

export const getAttendanceBadge = (status) => ATTENDANCE_BADGES[status] || { tone: 'neutral', label: 'Pending' };

export const getSwapBadge = (status) => SWAP_BADGES[status] || { tone: 'neutral', label: status || 'Unknown' };

// Today's progress for one duty, from its attendance rows.
export const getDutyProgressBadge = (attendanceRecords = []) => {
    const record = attendanceRecords[0];
    if (!record) return { tone: 'neutral', label: 'Scheduled' };
    if (record.check_out) return { tone: 'success', label: 'Checked out' };
    if (record.status === 'present' && record.check_in) return { tone: 'success', label: 'Checked in' };
    return getAttendanceBadge(record.status);
};
