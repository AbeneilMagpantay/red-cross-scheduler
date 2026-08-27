import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Bold,
    CheckCircle2,
    ClipboardCheck,
    Download,
    Info,
    Italic,
    List,
    ListChecks,
    ListOrdered,
    Minus,
    Plus,
    Underline
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/supabase';
import {
    CORE_ROWS,
    CORE_STATUSES,
    countDeliverables,
    createDefaultCoreFields,
    getCoreLineKeys,
    getCoreStatusClass,
    parseCustomCoreRows,
    sanitizeArcHtml
} from '../lib/arc';

function EditableField({ fieldKey, value, onCommit, className = '' }) {
    const fieldRef = useRef(null);

    useEffect(() => {
        if (document.activeElement !== fieldRef.current && fieldRef.current?.innerHTML !== value) {
            fieldRef.current.innerHTML = sanitizeArcHtml(value || '');
        }
    }, [value]);

    return (
        <div
            ref={fieldRef}
            className={`core-editable ${className}`}
            contentEditable
            suppressContentEditableWarning
            spellCheck
            data-field-key={fieldKey}
            dangerouslySetInnerHTML={{ __html: sanitizeArcHtml(value || '') }}
            onBlur={(event) => onCommit(fieldKey, sanitizeArcHtml(event.currentTarget.innerHTML))}
        />
    );
}

const createCustomSlug = () => `custom-${globalThis.crypto?.randomUUID?.() || Date.now()}`;

export default function Core() {
    const { profile } = useAuth();
    const defaultFields = useMemo(() => createDefaultCoreFields(), []);
    const [fields, setFields] = useState(defaultFields);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [syncStatus, setSyncStatus] = useState('Synced');
    const [savingImage, setSavingImage] = useState(false);
    const trackerRef = useRef(null);

    const customRows = useMemo(() => parseCustomCoreRows(fields.customRows), [fields.customRows]);
    const rows = useMemo(() => [...CORE_ROWS, ...customRows], [customRows]);

    const loadFields = useCallback(async () => {
        try {
            const { data, error: loadError } = await db.getArcCoreFields();
            if (loadError) throw loadError;
            const savedFields = Object.fromEntries((data || []).map((field) => [field.field_key, field.field_value]));
            setFields({ ...defaultFields, ...savedFields });
            setError('');
            setSyncStatus('Synced');
        } catch (loadError) {
            console.error('Could not load CORE:', loadError);
            setError(loadError.message || 'CORE could not be loaded.');
            setSyncStatus('Sync failed');
        } finally {
            setLoading(false);
        }
    }, [defaultFields]);

    useEffect(() => {
        loadFields();
        const unsubscribe = db.subscribeArcCore((payload) => {
            if (payload.eventType === 'DELETE') {
                setFields((current) => {
                    const next = { ...current };
                    delete next[payload.old.field_key];
                    return next;
                });
                return;
            }

            if (payload.new?.field_key && document.activeElement?.dataset?.fieldKey !== payload.new.field_key) {
                setFields((current) => ({ ...current, [payload.new.field_key]: payload.new.field_value }));
            }
        });
        return unsubscribe;
    }, [loadFields]);

    const saveField = async (fieldKey, rawValue) => {
        const value = fieldKey === 'customRows' || fieldKey.startsWith('status-')
            ? String(rawValue ?? '')
            : sanitizeArcHtml(rawValue ?? '');
        if (fields[fieldKey] === value) return;

        setFields((current) => ({ ...current, [fieldKey]: value }));
        setSyncStatus('Saving…');
        const { error: saveError } = await db.upsertArcCoreField(fieldKey, value, profile?.id);
        if (saveError) {
            console.error('Could not save CORE field:', saveError);
            setSyncStatus('Sync failed');
            window.alert(`Could not save this field: ${saveError.message}`);
        } else {
            setSyncStatus('Synced');
        }
    };

    const addRow = async () => {
        const slug = createCustomSlug();
        const nextRows = [...customRows, { slug, label: 'New Committee', color: 'custom', deliverable: 'New deliverable' }];
        const additions = [
            { field_key: 'customRows', field_value: JSON.stringify(nextRows.map((row) => ({ slug: row.slug, colorClass: row.color }))) },
            { field_key: `officer-${slug}`, field_value: 'New Committee' },
            { field_key: `deliverable-${slug}`, field_value: 'New deliverable' },
            { field_key: `status-${slug}`, field_value: 'Not Started' },
            { field_key: `deadline-${slug}`, field_value: 'Set a date' },
            { field_key: `remarks-${slug}`, field_value: '—' }
        ];

        setSyncStatus('Saving…');
        const { data, error: addError } = await db.upsertArcCoreFields(additions, profile?.id);
        if (addError) {
            setSyncStatus('Sync failed');
            window.alert(`Could not add a CORE row: ${addError.message}`);
            return;
        }
        setFields((current) => ({
            ...current,
            ...Object.fromEntries((data || additions).map((field) => [field.field_key, field.field_value]))
        }));
        setSyncStatus('Synced');
    };

    const removeRow = async () => {
        const row = customRows.at(-1);
        if (!row) {
            window.alert('There are no added rows to remove.');
            return;
        }
        if (!window.confirm(`Remove ${fields[`officer-${row.slug}`] || 'the last added row'}?`)) return;

        const nextRows = customRows.slice(0, -1);
        const keys = Object.keys(fields).filter((key) => key.includes(row.slug));
        setSyncStatus('Saving…');
        const { error: deleteError } = await db.deleteArcCoreFields(keys);
        if (deleteError) {
            setSyncStatus('Sync failed');
            window.alert(`Could not remove this CORE row: ${deleteError.message}`);
            return;
        }
        await saveField('customRows', JSON.stringify(nextRows.map((item) => ({ slug: item.slug, colorClass: item.color }))));
        setFields((current) => {
            const next = { ...current };
            keys.forEach((key) => delete next[key]);
            return next;
        });
        setSyncStatus('Synced');
    };

    const exportTracker = async () => {
        if (!trackerRef.current) return;
        setSavingImage(true);
        try {
            const canvas = await html2canvas(trackerRef.current, {
                backgroundColor: '#fffdf8',
                scale: Math.min(window.devicePixelRatio || 1, 2),
                useCORS: true,
                windowWidth: Math.max(trackerRef.current.scrollWidth, 1180)
            });
            const link = document.createElement('a');
            link.download = 'arc-core-deliverables.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (exportError) {
            console.error('CORE export failed:', exportError);
            window.alert('The CORE image could not be exported. Please try again.');
        } finally {
            setSavingImage(false);
        }
    };

    const runFormat = (command) => document.execCommand(command, false);

    if (loading) {
        return <div className="arc-page-loading"><div className="loading" /><span>Opening CORE…</span></div>;
    }

    return (
        <div className="arc-module-page core-page">
            <header className="arc-module-header">
                <div>
                    <span className="arc-module-kicker"><ListChecks size={16} /> Officers’ workspace</span>
                    <h1>CORE</h1>
                    <p>A shared monthly view of committee commitments, progress, and deadlines.</p>
                </div>
                <div className="arc-module-actions">
                    <span className={`arc-sync-pill ${syncStatus.includes('failed') ? 'is-error' : ''}`}><CheckCircle2 size={15} /> {syncStatus}</span>
                    <button type="button" className="btn btn-primary arc-shadow-button" onClick={exportTracker} disabled={savingImage}><Download size={17} /> {savingImage ? 'Preparing…' : 'Save image'}</button>
                </div>
            </header>

            {error && <div className="inline-alert error">{error} Apply the ARC integration migration in Supabase before using this page.</div>}

            <section className="core-sheet" ref={trackerRef}>
                <div className="core-meta-grid">
                    <div><span>Month</span><EditableField fieldKey="month-value" value={fields['month-value']} onCommit={saveField} /></div>
                    <div><span>Last updated</span><EditableField fieldKey="updated-value" value={fields['updated-value']} onCommit={saveField} /></div>
                    <div><span>Updated by</span><EditableField fieldKey="updated-by-value" value={fields['updated-by-value']} onCommit={saveField} /></div>
                    <div className="core-meta-icon"><ClipboardCheck size={23} /></div>
                </div>

                <div className="arc-format-toolbar core-format-toolbar" aria-label="CORE text formatting">
                    <span>Formatting</span>
                    <button type="button" onMouseDown={(event) => { event.preventDefault(); runFormat('bold'); }} aria-label="Bold"><Bold size={16} /></button>
                    <button type="button" onMouseDown={(event) => { event.preventDefault(); runFormat('italic'); }} aria-label="Italic"><Italic size={16} /></button>
                    <button type="button" onMouseDown={(event) => { event.preventDefault(); runFormat('underline'); }} aria-label="Underline"><Underline size={16} /></button>
                    <button type="button" onMouseDown={(event) => { event.preventDefault(); runFormat('insertOrderedList'); }} aria-label="Numbered list"><ListOrdered size={16} /></button>
                    <button type="button" onMouseDown={(event) => { event.preventDefault(); runFormat('insertUnorderedList'); }} aria-label="Bulleted list"><List size={16} /></button>
                </div>

                <div className="core-table-wrap">
                    <table className="core-table">
                        <thead>
                            <tr>
                                <th>Officer / Committee</th>
                                <th>Deliverable</th>
                                <th>Status</th>
                                <th>Deadline</th>
                                <th>Additional remarks</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => {
                                const deliverableKey = `deliverable-${row.slug}`;
                                const deliverableValue = fields[deliverableKey] ?? row.deliverable;
                                const itemCount = countDeliverables(deliverableValue);
                                const statusKeys = getCoreLineKeys(row, itemCount, 'status');
                                const deadlineKeys = getCoreLineKeys(row, itemCount, 'deadline');
                                const remarkKeys = getCoreLineKeys(row, itemCount, 'remarks');

                                return (
                                    <tr key={row.slug}>
                                        <td data-label="Officer / Committee" className={`core-officer-cell ${row.color || 'custom'}`}><EditableField fieldKey={`officer-${row.slug}`} value={fields[`officer-${row.slug}`] ?? row.label} onCommit={saveField} /></td>
                                        <td data-label="Deliverable" className="core-deliverable-cell"><EditableField fieldKey={deliverableKey} value={deliverableValue} onCommit={saveField} /></td>
                                        <td data-label="Status"><div className="core-line-stack">{statusKeys.map((key) => {
                                            const value = fields[key] || 'Not Started';
                                            return <select key={key} className={`core-status ${getCoreStatusClass(value)}`} value={value} onChange={(event) => saveField(key, event.target.value)}>{CORE_STATUSES.map((status) => <option key={status}>{status}</option>)}</select>;
                                        })}</div></td>
                                        <td data-label="Deadline"><div className="core-line-stack">{deadlineKeys.map((key) => <EditableField key={key} fieldKey={key} value={fields[key] || 'Set a date'} onCommit={saveField} className="core-line-field" />)}</div></td>
                                        <td data-label="Remarks"><div className="core-line-stack">{remarkKeys.map((key) => <EditableField key={key} fieldKey={key} value={fields[key] || '—'} onCommit={saveField} className="core-line-field" />)}</div></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="core-row-actions">
                    <button type="button" className="btn btn-secondary" onClick={addRow}><Plus size={16} /> Add row</button>
                    <button type="button" className="btn btn-secondary" onClick={removeRow}><Minus size={16} /> Remove row</button>
                </div>

                <footer className="core-footer"><Info size={15} /><EditableField fieldKey="tracker-footnote" value={fields['tracker-footnote']} onCommit={saveField} /></footer>
            </section>
        </div>
    );
}
