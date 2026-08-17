import { useEffect, useState } from 'react';
import { Bell, Calendar, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { showLiveDeploymentNotification } from '../lib/notifications';
import { supabase } from '../lib/supabase';

export default function DeploymentNotifications() {
    const { profile, user } = useAuth();
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
                if (!schedule.is_deployment_event) return;

                setNotification(schedule);
                showLiveDeploymentNotification(schedule, user?.id).catch((error) => {
                    console.warn('Unable to show system notification:', error);
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [profile, user?.id]);

    useEffect(() => {
        if (!notification) return undefined;
        const timeout = window.setTimeout(() => setNotification(null), 8000);
        return () => window.clearTimeout(timeout);
    }, [notification]);

    if (!notification) return null;

    return (
        <div className="app-toast" role="status" aria-live="polite">
            <div className="app-toast-icon"><Bell size={20} /></div>
            <div className="app-toast-content">
                <strong>New deployment duty</strong>
                <span>{notification.title || 'A new duty was added to the schedule.'}</span>
                <button
                    type="button"
                    onClick={() => {
                        setNotification(null);
                        navigate('/schedule');
                    }}
                >
                    <Calendar size={14} /> View schedule
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
