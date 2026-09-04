import { useEffect, useState } from 'react';
import { Bell, Calendar, Megaphone, UserCheck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { showLiveArcAlertNotification, showLiveDeploymentNotification } from '../lib/notifications';
import { supabase } from '../lib/supabase';

export default function DeploymentNotifications() {
    const { profile, user, isAdmin } = useAuth();
    const navigate = useNavigate();
    const [notification, setNotification] = useState(null);

    useEffect(() => {
        if (!supabase || !profile) return undefined;

        const channel = supabase
            .channel(`deployment-notifications-${profile.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'schedules',
                filter: 'is_deployment_event=eq.true'
            }, ({ new: schedule }) => {
                // Assignment rows share the event's deployment flag, but only
                // the event anchor represents a newly created deployment.
                if (!schedule.is_deployment_event || !schedule.is_event_anchor) return;

                setNotification({ kind: 'deployment', payload: schedule });
                showLiveDeploymentNotification(schedule, user?.id).catch((error) => {
                    console.warn('Unable to show system notification:', error);
                });
            })
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'arc_announcements'
            }, ({ new: announcement }) => {
                if (announcement.created_by === profile.id) return;
                setNotification({ kind: 'alert', payload: announcement });
                showLiveArcAlertNotification(announcement, user?.id).catch((error) => {
                    console.warn('Unable to show ARC alert notification:', error);
                });
            })
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'account_requests'
            }, ({ new: accountRequest }) => {
                if (!isAdmin || accountRequest.status !== 'pending') return;
                setNotification({ kind: 'account', payload: accountRequest });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [profile, user?.id, isAdmin]);

    useEffect(() => {
        if (!notification) return undefined;
        const timeout = window.setTimeout(() => setNotification(null), 8000);
        return () => window.clearTimeout(timeout);
    }, [notification]);

    if (!notification) return null;

    const isAlert = notification.kind === 'alert';
    const isAccountRequest = notification.kind === 'account';
    const payload = notification.payload;
    const targetPath = isAccountRequest ? '/personnel' : isAlert ? '/alerts' : '/schedule';

    return (
        <div className="app-toast" role="status" aria-live="polite">
            <div className="app-toast-icon">{isAccountRequest ? <UserCheck size={20} /> : isAlert ? <Megaphone size={20} /> : <Bell size={20} />}</div>
            <div className="app-toast-content">
                <strong>{isAccountRequest ? 'New account request' : isAlert ? 'New ARC announcement' : 'New deployment duty'}</strong>
                <span>{isAccountRequest ? `${payload.name || payload.email} is waiting for approval.` : payload.title || (isAlert ? 'A new announcement was published.' : 'A new duty was added to the schedule.')}</span>
                <button
                    type="button"
                    onClick={() => {
                        setNotification(null);
                        navigate(targetPath);
                    }}
                >
                    {isAccountRequest ? <UserCheck size={14} /> : isAlert ? <Megaphone size={14} /> : <Calendar size={14} />} {isAccountRequest ? 'Review request' : isAlert ? 'Read alert' : 'View schedule'}
                </button>
            </div>
            <button
                type="button"
                className="app-toast-close"
                onClick={() => setNotification(null)}
                aria-label="Dismiss notification"
            >
                <X size={16} />
            </button>
        </div>
    );
}
