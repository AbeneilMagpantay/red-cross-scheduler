import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    Bell,
    Bold,
    CheckCircle2,
    ExternalLink,
    HelpCircle,
    Italic,
    Megaphone,
    Pencil,
    Pin,
    Plus,
    Send,
    Strikethrough,
    Trash2,
    Underline
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import {
    ALERT_CATEGORIES,
    getAlertCategoryClass,
    markAlertsRead,
    normalizeAlertUrl,
    sortArcAlerts
} from '../lib/alerts';
import { arcHtmlToText, sanitizeArcHtml } from '../lib/arc';
import { db } from '../lib/supabase';

const emptyDraft = {
    category: 'General',
    title: '',
    body_html: '',
    external_url: '',
    is_pinned: false
};

const timeAgo = (value) => {
    try {
        return formatDistanceToNow(new Date(value), { addSuffix: true });
    } catch {
        return '';
    }
};

export default function Alerts() {
    const { canAccessArc, profile, user } = useAuth();
    const [alerts, setAlerts] = useState([]);
    const [activeFilter, setActiveFilter] = useState('All');
    const [loading, setLoading] = useState(true);
    const [syncStatus, setSyncStatus] = useState('Synced');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [draft, setDraft] = useState(emptyDraft);
    const [editingId, setEditingId] = useState(null);
    const [composerOpen, setComposerOpen] = useState(false);
    const [selectedAlert, setSelectedAlert] = useState(null);
    const [helpOpen, setHelpOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const editorRef = useRef(null);

    const loadAlerts = useCallback(async ({ quiet = false } = {}) => {
        if (!quiet) setLoading(true);
        try {
            const { data, error: loadError } = await db.getArcAnnouncements();
            if (loadError) throw loadError;
            const nextAlerts = sortArcAlerts(data || []);
            setAlerts(nextAlerts);
            setError('');
            setSyncStatus('Synced');
            return nextAlerts;
        } catch (loadError) {
            console.error('Could not load ARC Alerts:', loadError);
            setError(loadError.message || 'Alerts could not be loaded.');
            setSyncStatus('Sync failed');
            return [];
        } finally {
            if (!quiet) setLoading(false);
        }
    }, []);

    useEffect(() => {
        let active = true;
        loadAlerts().then((loadedAlerts) => {
            if (!active) return;
            markAlertsRead(loadedAlerts, user?.id);
            window.dispatchEvent(new CustomEvent('arc-alerts-read'));
        });
        const unsubscribe = db.subscribeArcAnnouncements(() => {
            loadAlerts({ quiet: true }).then((loadedAlerts) => {
                if (!active) return;
                markAlertsRead(loadedAlerts, user?.id);
                window.dispatchEvent(new CustomEvent('arc-alerts-read'));
            });
        });
        return () => {
            active = false;
            unsubscribe();
        };
    }, [loadAlerts, user?.id]);

    const visibleAlerts = useMemo(() => {
        const sorted = sortArcAlerts(alerts);
        return activeFilter === 'All'
            ? sorted
            : sorted.filter((alert) => alert.category === activeFilter);
    }, [activeFilter, alerts]);

    const openComposer = (alert = null) => {
        if (!canAccessArc) return;
        setEditingId(alert?.id || null);
        setDraft(alert ? {
            category: alert.category || 'General',
            title: alert.title || '',
            body_html: alert.body_html || '',
            external_url: alert.external_url || '',
            is_pinned: Boolean(alert.is_pinned)
        } : { ...emptyDraft });
        setComposerOpen(true);
    };

    const closeComposer = () => {
        if (saving) return;
        setComposerOpen(false);
        setEditingId(null);
        setDraft({ ...emptyDraft });
    };

    const runFormat = (command, value = null) => {
        editorRef.current?.focus();
        document.execCommand(command, false, value);
    };

    const saveAnnouncement = async () => {
        if (!canAccessArc || saving) return;
        const bodyHtml = sanitizeArcHtml(editorRef.current?.innerHTML || '');
        if (!draft.title.trim() || !arcHtmlToText(bodyHtml)) {
            setNotice('Add both a title and announcement message before publishing.');
            return;
        }

        if (draft.external_url.trim() && !normalizeAlertUrl(draft.external_url)) {
            setNotice('The optional link must begin with http:// or https://.');
            return;
        }

        const otherPinned = alerts.filter((alert) => alert.is_pinned && alert.id !== editingId).length;
        if (draft.is_pinned && otherPinned >= 3) {
            setNotice('Only three urgent announcements can be pinned at once.');
            return;
        }

        setSaving(true);
        setSyncStatus('Saving…');
        setNotice('');
        const payload = {
            category: draft.category,
            title: draft.title.trim(),
            body_html: bodyHtml,
            external_url: normalizeAlertUrl(draft.external_url) || null,
            is_pinned: Boolean(draft.is_pinned),
            author_name: profile?.name || 'ARC Council Operations',
            updated_by: profile?.id || null
        };

        try {
            let savedAlert;
            if (editingId) {
                const { data, error: saveError } = await db.updateArcAnnouncement(editingId, payload);
                if (saveError) throw saveError;
                savedAlert = data;
                setNotice('Announcement updated.');
            } else {
                const { data, error: saveError } = await db.createArcAnnouncement({
                    ...payload,
                    created_by: profile?.id || null,
                    sort_order: alerts.length
                });
                if (saveError) throw saveError;
                savedAlert = data;
                markAlertsRead([savedAlert], user?.id);
                const { error: notificationError } = await db.sendArcAnnouncementNotification(savedAlert.id);
                setNotice(notificationError
                    ? 'Announcement published, but its background notification could not be sent.'
                    : 'Announcement published and members were notified.');
            }

            setAlerts((current) => sortArcAlerts([
                ...current.filter((alert) => alert.id !== savedAlert.id),
                savedAlert
            ]));
            setSyncStatus('Synced');
            window.dispatchEvent(new CustomEvent('arc-alerts-read'));
            setComposerOpen(false);
            setEditingId(null);
        } catch (saveError) {
            console.error('Could not save ARC announcement:', saveError);
            setSyncStatus('Sync failed');
            setNotice(saveError.message || 'The announcement could not be saved.');
        } finally {
            setSaving(false);
        }
    };

    const togglePin = async (alert) => {
        if (!canAccessArc) return;
        if (!alert.is_pinned && alerts.filter((item) => item.is_pinned).length >= 3) {
            setNotice('Only three urgent announcements can be pinned at once.');
            return;
        }

        setSyncStatus('Saving…');
        const { data, error: saveError } = await db.updateArcAnnouncement(alert.id, {
            is_pinned: !alert.is_pinned,
            updated_by: profile?.id || null
        });
        if (saveError) {
            setSyncStatus('Sync failed');
            setNotice(saveError.message);
            return;
        }
        setAlerts((current) => sortArcAlerts(current.map((item) => item.id === alert.id ? data : item)));
        setSyncStatus('Synced');
    };

    const moveAlert = async (alert, direction) => {
        if (!canAccessArc) return;
        const group = sortArcAlerts(alerts).filter((item) => item.is_pinned === alert.is_pinned);
        const index = group.findIndex((item) => item.id === alert.id);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= group.length) return;
        [group[index], group[nextIndex]] = [group[nextIndex], group[index]];
        const otherGroup = sortArcAlerts(alerts).filter((item) => item.is_pinned !== alert.is_pinned);
        const reordered = alert.is_pinned ? [...group, ...otherGroup] : [...otherGroup, ...group];
        setAlerts(reordered.map((item, order) => ({ ...item, sort_order: order })));
        setSyncStatus('Saving…');
        const { error: reorderError } = await db.reorderArcAnnouncements(reordered, profile?.id);
        if (reorderError) {
            setSyncStatus('Sync failed');
            setNotice(reorderError.message);
            await loadAlerts({ quiet: true });
        } else {
            setSyncStatus('Synced');
        }
    };

    const deleteAnnouncement = async (alert) => {
        if (!canAccessArc || !window.confirm(`Delete “${alert.title}” for everyone?`)) return;
        setSyncStatus('Saving…');
        const { error: deleteError } = await db.deleteArcAnnouncement(alert.id);
        if (deleteError) {
            setSyncStatus('Sync failed');
            setNotice(deleteError.message);
            return;
        }
        setAlerts((current) => current.filter((item) => item.id !== alert.id));
        setSelectedAlert((current) => current?.id === alert.id ? null : current);
        setSyncStatus('Synced');
        setNotice('Announcement deleted.');
    };

    const renotify = async (alert) => {
        if (!canAccessArc || !window.confirm(`Send “${alert.title}” to notification-enabled devices again?`)) return;
        setSyncStatus('Sending…');
        const { data, error: notificationError } = await db.sendArcAnnouncementNotification(alert.id);
        if (notificationError) {
            setSyncStatus('Sync failed');
            setNotice(notificationError.message || 'The notification could not be sent.');
            return;
        }
        setSyncStatus('Synced');
        setNotice(`Notification sent to ${data?.delivered ?? 0} device${data?.delivered === 1 ? '' : 's'}.`);
    };

    if (loading) {
        return <div className="arc-page-loading"><div className="loading" /><span>Opening Alerts…</span></div>;
    }

    return (
        <div className="arc-module-page alerts-page">
            <header className="arc-module-header">
                <div>
                    <span className="arc-module-kicker"><Bell size={16} /> Operational feed</span>
                    <h1>ALERTS</h1>
                    <p>Announcements, deployment updates, training notices, and urgent council information.</p>
                </div>
                <div className="arc-module-actions">
                    <span className={`arc-sync-pill ${syncStatus.includes('failed') ? 'is-error' : ''}`}><CheckCircle2 size={15} /> {syncStatus}</span>
                    <button type="button" className="btn btn-secondary" onClick={() => setHelpOpen(true)}><HelpCircle size={17} /> Guide</button>
                    {canAccessArc && <button type="button" className="btn btn-primary arc-shadow-button" onClick={() => openComposer()}><Plus size={17} /> Add announcement</button>}
                </div>
            </header>

            {error && <div className="inline-alert error">{error} Apply the ARC Alerts migration in Supabase before using this page.</div>}
            {notice && <div className="inline-alert info alerts-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')}>Dismiss</button></div>}

            <nav className="alerts-filters" aria-label="Announcement categories">
                {['All', ...ALERT_CATEGORIES].map((category) => (
                    <button
                        type="button"
                        key={category}
                        className={activeFilter === category ? 'is-active' : ''}
                        onClick={() => setActiveFilter(category)}
                    >
                        {category === 'Deployment' ? 'Deployments' : category}
                    </button>
                ))}
            </nav>

            <section className="alerts-stream" aria-live="polite">
                {visibleAlerts.map((alert) => {
                    const group = sortArcAlerts(alerts).filter((item) => item.is_pinned === alert.is_pinned);
                    const groupIndex = group.findIndex((item) => item.id === alert.id);
                    const externalUrl = normalizeAlertUrl(alert.external_url);
                    return (
                        <article
                            key={alert.id}
                            className={`alert-card ${alert.is_pinned ? 'is-pinned' : ''}`}
                            onClick={() => setSelectedAlert(alert)}
                        >
                            <div className="alert-card-top">
                                <span className={`alert-category ${getAlertCategoryClass(alert.category)}`}>{alert.category}</span>
                                {alert.is_pinned && <span className="alert-pinned"><Pin size={13} /> Pinned</span>}
                                {canAccessArc && (
                                    <div className="alert-card-tools" onClick={(event) => event.stopPropagation()}>
                                        {activeFilter === 'All' && <button type="button" onClick={() => moveAlert(alert, -1)} disabled={groupIndex === 0} aria-label="Move announcement up"><ArrowUp size={15} /></button>}
                                        {activeFilter === 'All' && <button type="button" onClick={() => moveAlert(alert, 1)} disabled={groupIndex === group.length - 1} aria-label="Move announcement down"><ArrowDown size={15} /></button>}
                                        <button type="button" onClick={() => renotify(alert)} aria-label="Resend notification"><Megaphone size={15} /></button>
                                        <button type="button" className={alert.is_pinned ? 'is-active' : ''} onClick={() => togglePin(alert)} aria-label={alert.is_pinned ? 'Unpin announcement' : 'Pin announcement'}><Pin size={15} /></button>
                                        <button type="button" onClick={() => openComposer(alert)} aria-label="Edit announcement"><Pencil size={15} /></button>
                                        <button type="button" className="is-danger" onClick={() => deleteAnnouncement(alert)} aria-label="Delete announcement"><Trash2 size={15} /></button>
                                    </div>
                                )}
                            </div>
                            <h2>{alert.title}</h2>
                            <p className="alert-meta">{alert.author_name || 'ARC Council Operations'} · {timeAgo(alert.created_at)}</p>
                            <p className="alert-preview">{arcHtmlToText(alert.body_html)}</p>
                            <div className="alert-card-footer">
                                <button type="button">Read announcement</button>
                                {externalUrl && <a href={externalUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}><ExternalLink size={14} /> Open link</a>}
                            </div>
                        </article>
                    );
                })}

                {!visibleAlerts.length && !error && (
                    <div className="alerts-empty">
                        <Bell size={34} />
                        <strong>No announcements here yet.</strong>
                        <span>{activeFilter === 'All' ? 'New council updates will appear in this feed.' : `There are no ${activeFilter.toLowerCase()} alerts.`}</span>
                    </div>
                )}
            </section>

            <Modal isOpen={composerOpen} onClose={closeComposer} title={editingId ? 'Edit announcement' : 'New announcement'} size="lg" className="alert-compose-modal">
                <div className="alert-compose-form">
                    <div className="form-group">
                        <label className="form-label">Category</label>
                        <select className="form-select" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                            {ALERT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Title</label>
                        <input className="form-input" maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Message</label>
                        <div className="arc-format-toolbar" aria-label="Announcement formatting">
                            <button type="button" onMouseDown={(event) => { event.preventDefault(); runFormat('bold'); }} aria-label="Bold"><Bold size={16} /></button>
                            <button type="button" onMouseDown={(event) => { event.preventDefault(); runFormat('italic'); }} aria-label="Italic"><Italic size={16} /></button>
                            <button type="button" onMouseDown={(event) => { event.preventDefault(); runFormat('underline'); }} aria-label="Underline"><Underline size={16} /></button>
                            <button type="button" onMouseDown={(event) => { event.preventDefault(); runFormat('strikeThrough'); }} aria-label="Strikethrough"><Strikethrough size={16} /></button>
                            <button type="button" onMouseDown={(event) => { event.preventDefault(); runFormat('formatBlock', '<h2>'); }}>H2</button>
                            <button type="button" onMouseDown={(event) => { event.preventDefault(); runFormat('formatBlock', '<h3>'); }}>H3</button>
                        </div>
                        <div
                            key={editingId || 'new'}
                            ref={editorRef}
                            className="alert-rich-editor"
                            contentEditable
                            suppressContentEditableWarning
                            dangerouslySetInnerHTML={{ __html: sanitizeArcHtml(draft.body_html) }}
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">External link <span className="text-muted">(optional)</span></label>
                        <input type="url" className="form-input" value={draft.external_url} onChange={(event) => setDraft({ ...draft, external_url: event.target.value })} />
                    </div>
                    <label className="alert-pin-option"><input type="checkbox" checked={draft.is_pinned} onChange={(event) => setDraft({ ...draft, is_pinned: event.target.checked })} /><span><Pin size={16} /><strong>Pin as urgent</strong><small>Up to three announcements can be pinned.</small></span></label>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={closeComposer} disabled={saving}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={saveAnnouncement} disabled={saving}>{saving ? <span className="loading" /> : editingId ? <Pencil size={16} /> : <Send size={16} />}{saving ? 'Saving…' : editingId ? 'Save changes' : 'Publish and notify'}</button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={Boolean(selectedAlert)} onClose={() => setSelectedAlert(null)} title={selectedAlert?.title || 'Announcement'} size="lg" className="alert-reader-modal">
                {selectedAlert && (
                    <article className="alert-reader">
                        <div className="alert-reader-labels"><span className={`alert-category ${getAlertCategoryClass(selectedAlert.category)}`}>{selectedAlert.category}</span>{selectedAlert.is_pinned && <span className="alert-pinned"><Pin size={13} /> Pinned</span>}</div>
                        <p className="alert-meta">{selectedAlert.author_name || 'ARC Council Operations'} · {new Date(selectedAlert.created_at).toLocaleString()}</p>
                        <div className="alert-reader-body" dangerouslySetInnerHTML={{ __html: sanitizeArcHtml(selectedAlert.body_html) }} />
                        {selectedAlert.external_url && <a className="btn btn-secondary" href={normalizeAlertUrl(selectedAlert.external_url)} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open external link</a>}
                    </article>
                )}
            </Modal>

            <Modal isOpen={helpOpen} onClose={() => setHelpOpen(false)} title="How Alerts works" size="md">
                <div className="arc-help-copy">
                    <p>Alerts is the shared announcement feed from the latest ARC update.</p>
                    <ul>
                        <li>Every signed-in member can read announcements.</li>
                        <li>Admins and Officers can publish, edit, reorder, pin, delete, and resend notifications.</li>
                        <li>Use category filters to find urgent, deployment, training, or general updates.</li>
                        <li>Opening this page marks the current announcements as read on this device.</li>
                    </ul>
                </div>
            </Modal>
        </div>
    );
}
