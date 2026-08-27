import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft,
    ArrowRight,
    Bold,
    CheckCircle2,
    ChevronDown,
    Clipboard,
    Download,
    ExternalLink,
    FileImage,
    Italic,
    Link as LinkIcon,
    List,
    LayoutGrid,
    ListOrdered,
    Maximize2,
    Plus,
    QrCode,
    Rows3,
    Save,
    Search,
    Trash2,
    Underline,
    Upload,
    X
} from 'lucide-react';
import html2canvas from 'html2canvas';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/supabase';
import { arcHtmlToText, sanitizeArcHtml } from '../lib/arc';
import { normalizeExternalUrl } from '../lib/alerts';

const MAX_QR_BYTES = 5 * 1024 * 1024;
const ALLOWED_QR_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export default function Nexus() {
    const { profile } = useAuth();
    const [resources, setResources] = useState([]);
    const [imageUrls, setImageUrls] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('Synced');
    const [selectedId, setSelectedId] = useState(null);
    const [detailDraft, setDetailDraft] = useState(null);
    const [busyIds, setBusyIds] = useState([]);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState(() => localStorage.getItem('arc-nexus-view') === 'pill' ? 'pill' : 'grid');
    const [expandedPills, setExpandedPills] = useState([]);
    const boardRef = useRef(null);
    const descriptionEditorRef = useRef(null);

    const selectedResource = useMemo(
        () => resources.find((resource) => resource.id === selectedId) || null,
        [resources, selectedId]
    );

    const visibleResources = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return resources;
        return resources.filter((resource) => [
            resource.title,
            resource.url,
            arcHtmlToText(resource.description_html || '')
        ].some((value) => String(value || '').toLowerCase().includes(query)));
    }, [resources, searchQuery]);

    const markBusy = (id, busy) => setBusyIds((current) => (
        busy ? [...new Set([...current, id])] : current.filter((item) => item !== id)
    ));

    const loadSignedImages = useCallback(async (loadedResources) => {
        const entries = await Promise.all(loadedResources
            .filter((resource) => resource.qr_image_path)
            .map(async (resource) => {
                const { data } = await db.getArcQrImageUrl(resource.qr_image_path);
                return [resource.id, data?.signedUrl || ''];
            }));
        setImageUrls(Object.fromEntries(entries));
    }, []);

    const loadResources = useCallback(async ({ quiet = false } = {}) => {
        if (!quiet) setLoading(true);
        try {
            const { data, error: loadError } = await db.getArcResources();
            if (loadError) throw loadError;
            const loadedResources = data || [];
            setResources(loadedResources);
            await loadSignedImages(loadedResources);
            setError('');
            setStatus('Synced');
        } catch (loadError) {
            console.error('Could not load NEXUS:', loadError);
            setError(loadError.message || 'NEXUS could not be loaded.');
            setStatus('Sync failed');
        } finally {
            if (!quiet) setLoading(false);
        }
    }, [loadSignedImages]);

    useEffect(() => {
        loadResources();
        const unsubscribe = db.subscribeArcResources(() => loadResources({ quiet: true }));
        return unsubscribe;
    }, [loadResources]);

    useEffect(() => {
        if (!selectedResource) {
            setDetailDraft(null);
            return;
        }
        setDetailDraft({
            title: selectedResource.title || '',
            url: selectedResource.url || '',
            description_html: selectedResource.description_html || ''
        });
    }, [selectedResource]);

    const updateLocalResource = (id, updates) => {
        setResources((current) => current.map((resource) => (
            resource.id === id ? { ...resource, ...updates } : resource
        )));
    };

    const saveResource = async (id, updates) => {
        markBusy(id, true);
        setStatus('Saving…');
        try {
            const payload = { ...updates, updated_by: profile?.id || null };
            const { data, error: saveError } = await db.updateArcResource(id, payload);
            if (saveError) throw saveError;
            if (data) updateLocalResource(id, data);
            setStatus('Synced');
            return true;
        } catch (saveError) {
            console.error('Could not save NEXUS resource:', saveError);
            setStatus('Sync failed');
            window.alert(`Could not save this resource: ${saveError.message}`);
            await loadResources({ quiet: true });
            return false;
        } finally {
            markBusy(id, false);
        }
    };

    const addResource = async () => {
        setStatus('Saving…');
        try {
            const { data, error: createError } = await db.createArcResource({
                title: 'ARC Resource',
                sort_order: resources.length,
                created_by: profile?.id || null,
                updated_by: profile?.id || null
            });
            if (createError) throw createError;
            setResources((current) => [...current, data]);
            setSelectedId(data.id);
            setStatus('Synced');
        } catch (createError) {
            setStatus('Sync failed');
            window.alert(`Could not add a resource: ${createError.message}`);
        }
    };

    const removeResource = async (resource) => {
        if (!window.confirm(`Delete ${resource.title || 'this resource'}?`)) return;
        markBusy(resource.id, true);
        setStatus('Saving…');
        try {
            const { error: deleteError } = await db.deleteArcResource(resource.id);
            if (deleteError) throw deleteError;
            if (resource.qr_image_path) await db.deleteArcQrImage(resource.qr_image_path);
            setResources((current) => current.filter((item) => item.id !== resource.id));
            setSelectedId((current) => current === resource.id ? null : current);
            setStatus('Synced');
        } catch (deleteError) {
            setStatus('Sync failed');
            window.alert(`Could not delete this resource: ${deleteError.message}`);
        } finally {
            markBusy(resource.id, false);
        }
    };

    const moveResource = async (id, direction) => {
        const currentIndex = resources.findIndex((resource) => resource.id === id);
        const nextIndex = currentIndex + direction;
        if (currentIndex < 0 || nextIndex < 0 || nextIndex >= resources.length) return;

        const reordered = [...resources];
        [reordered[currentIndex], reordered[nextIndex]] = [reordered[nextIndex], reordered[currentIndex]];
        setResources(reordered);
        setStatus('Saving…');
        const { error: reorderError } = await db.reorderArcResources(reordered, profile?.id);
        if (reorderError) {
            setStatus('Sync failed');
            window.alert(`Could not reorder the board: ${reorderError.message}`);
            await loadResources({ quiet: true });
        } else {
            setStatus('Synced');
        }
    };

    const uploadQr = async (resource, file) => {
        if (!file) return;
        if (!ALLOWED_QR_TYPES.has(file.type)) {
            window.alert('Choose a PNG, JPEG, or WebP image.');
            return;
        }
        if (file.size > MAX_QR_BYTES) {
            window.alert('The image must be 5 MB or smaller.');
            return;
        }

        markBusy(resource.id, true);
        setStatus('Saving…');
        try {
            const { data: uploadData, error: uploadError } = await db.uploadArcQrImage(resource.id, file);
            if (uploadError) throw uploadError;
            const previousPath = resource.qr_image_path;
            const saved = await saveResource(resource.id, { qr_image_path: uploadData.path });
            if (!saved) {
                await db.deleteArcQrImage(uploadData.path);
                return;
            }
            if (previousPath) await db.deleteArcQrImage(previousPath);
            const { data: signedData } = await db.getArcQrImageUrl(uploadData.path);
            setImageUrls((current) => ({ ...current, [resource.id]: signedData?.signedUrl || '' }));
        } catch (uploadError) {
            setStatus('Sync failed');
            window.alert(`Could not upload this QR image: ${uploadError.message}`);
        } finally {
            markBusy(resource.id, false);
        }
    };

    const copyUrl = async (resource) => {
        if (!resource.url) {
            window.alert('Add a URL to this resource first.');
            return;
        }
        try {
            await navigator.clipboard.writeText(resource.url);
            setStatus('URL copied');
            window.setTimeout(() => setStatus('Synced'), 1400);
        } catch {
            window.prompt('Copy this URL:', resource.url);
        }
    };

    const exportElement = async (element, filename) => {
        if (!element) return;
        setStatus('Preparing image…');
        try {
            const canvas = await html2canvas(element, {
                backgroundColor: '#fffdf8',
                scale: Math.min(window.devicePixelRatio || 1, 2),
                useCORS: true
            });
            const link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            link.click();
            setStatus('Synced');
        } catch (exportError) {
            console.error('NEXUS export failed:', exportError);
            setStatus('Export failed');
            window.alert('The image could not be exported. Please try again.');
        }
    };

    const exportResource = (resource) => {
        const element = document.querySelector(`[data-resource-id="${resource.id}"]`);
        const safeName = (resource.title || 'arc-resource').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        return exportElement(element, `${safeName}.png`);
    };

    const saveDetail = async () => {
        if (!selectedResource || !detailDraft) return;
        const normalizedUrl = normalizeExternalUrl(detailDraft.url);
        if (detailDraft.url.trim() && !normalizedUrl) {
            window.alert('Enter a complete http:// or https:// URL.');
            return;
        }
        const updates = {
            title: detailDraft.title.trim() || 'ARC Resource',
            url: normalizedUrl || null,
            description_html: sanitizeArcHtml(
                descriptionEditorRef.current?.innerHTML ?? detailDraft.description_html
            ) || null
        };
        const saved = await saveResource(selectedResource.id, updates);
        if (saved) setSelectedId(null);
    };

    const runFormat = (command) => {
        document.execCommand(command, false);
    };

    const toggleViewMode = () => {
        const nextMode = viewMode === 'grid' ? 'pill' : 'grid';
        setViewMode(nextMode);
        localStorage.setItem('arc-nexus-view', nextMode);
    };

    const togglePill = (id) => setExpandedPills((current) => (
        current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));

    if (loading) {
        return <div className="arc-page-loading"><div className="loading" /><span>Opening NEXUS…</span></div>;
    }

    return (
        <div className="arc-module-page nexus-page">
            <header className="arc-module-header">
                <div>
                    <span className="arc-module-kicker"><QrCode size={16} /> Resource board</span>
                    <h1>NEXUS</h1>
                    <p>A shared space for QR codes, links, files, and council resources.</p>
                </div>
                <div className="arc-module-actions">
                    <span className={`arc-sync-pill ${status.includes('failed') ? 'is-error' : ''}`}><CheckCircle2 size={15} /> {status}</span>
                    <button type="button" className={`btn btn-secondary nexus-view-toggle ${viewMode === 'pill' ? 'is-active' : ''}`} onClick={toggleViewMode} aria-label={`Switch to ${viewMode === 'grid' ? 'compact' : 'grid'} view`}>
                        {viewMode === 'grid' ? <LayoutGrid size={17} /> : <Rows3 size={17} />} {viewMode === 'grid' ? 'Grid' : 'Compact'}
                    </button>
                    <button
                        type="button"
                        className={`btn btn-secondary nexus-search-toggle ${searchOpen ? 'is-active' : ''}`}
                        onClick={() => {
                            setSearchOpen((current) => !current);
                            if (searchOpen) setSearchQuery('');
                        }}
                        aria-expanded={searchOpen}
                        aria-controls="nexus-search"
                    >
                        <Search size={17} /> Search
                    </button>
                    <button type="button" className="btn btn-secondary arc-shadow-button" onClick={() => exportElement(boardRef.current, 'arc-nexus-board.png')}><Download size={17} /> Save board</button>
                    <button type="button" className="btn btn-primary arc-shadow-button" onClick={addResource}><Plus size={17} /> Add resource</button>
                </div>
            </header>

            {searchOpen && (
                <div className="nexus-search-bar" id="nexus-search">
                    <Search size={18} />
                    <input autoFocus type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search titles, links, and descriptions…" aria-label="Search NEXUS resources" />
                    {searchQuery && <button type="button" onClick={() => setSearchQuery('')}><X size={16} /> Clear</button>}
                </div>
            )}

            {error && <div className="inline-alert error">{error} Apply the ARC integration migration in Supabase before using this page.</div>}

            <section className={`nexus-board nexus-view-${viewMode}`} ref={boardRef}>
                <div className="nexus-board-intro">
                    <div><span>ACRCY shared board</span><strong>{searchQuery ? `${visibleResources.length} of ${resources.length}` : resources.length} resource{resources.length === 1 ? '' : 's'}</strong></div>
                    <p>Changes save automatically and appear for every Admin and Officer.</p>
                </div>

                <div className="nexus-grid">
                    {visibleResources.map((resource) => {
                        const isBusy = busyIds.includes(resource.id);
                        const resourceIndex = resources.findIndex((item) => item.id === resource.id);
                        const isExpanded = expandedPills.includes(resource.id);
                        return (
                            <article className={`nexus-card ${isBusy ? 'is-busy' : ''} ${isExpanded ? 'is-expanded' : ''}`} data-resource-id={resource.id} key={resource.id}>
                                <label className={`nexus-qr ${imageUrls[resource.id] ? 'has-image' : ''}`}>
                                    {imageUrls[resource.id]
                                        ? <img src={imageUrls[resource.id]} alt={`QR code for ${resource.title}`} />
                                        : <span><Upload size={26} /><strong>Add QR image</strong><small>PNG, JPEG, or WebP</small></span>}
                                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadQr(resource, event.target.files?.[0])} disabled={isBusy} />
                                </label>

                                <input
                                    className="nexus-title-input"
                                    value={resource.title || ''}
                                    onChange={(event) => updateLocalResource(resource.id, { title: event.target.value })}
                                    onBlur={(event) => saveResource(resource.id, { title: event.target.value.trim() || 'ARC Resource' })}
                                    aria-label="Resource title"
                                    disabled={isBusy}
                                />
                                <div className="nexus-url-row">
                                    <LinkIcon size={15} />
                                    <input
                                        type="url"
                                        value={resource.url || ''}
                                        onChange={(event) => updateLocalResource(resource.id, { url: event.target.value })}
                                        onBlur={(event) => {
                                            const value = event.target.value.trim();
                                            const normalizedUrl = normalizeExternalUrl(value);
                                            if (value && !normalizedUrl) {
                                                window.alert('Enter a complete http:// or https:// URL.');
                                                loadResources({ quiet: true });
                                                return;
                                            }
                                            saveResource(resource.id, { url: normalizedUrl || null });
                                        }}
                                        aria-label={`URL for ${resource.title}`}
                                        disabled={isBusy}
                                    />
                                    {normalizeExternalUrl(resource.url) && <a href={normalizeExternalUrl(resource.url)} target="_blank" rel="noreferrer" aria-label={`Open ${resource.title}`}><ExternalLink size={15} /></a>}
                                </div>

                                {resource.description_html && <p className="nexus-card-description">{arcHtmlToText(resource.description_html)}</p>}

                                <button type="button" className="nexus-pill-toggle" onClick={() => togglePill(resource.id)} aria-label={isExpanded ? 'Collapse resource actions' : 'Expand resource actions'} aria-expanded={isExpanded}><ChevronDown size={19} /></button>

                                <div className="nexus-card-actions">
                                    <button type="button" onClick={() => moveResource(resource.id, -1)} disabled={isBusy || resourceIndex === 0} aria-label="Move left"><ArrowLeft size={16} /></button>
                                    <button type="button" onClick={() => moveResource(resource.id, 1)} disabled={isBusy || resourceIndex === resources.length - 1} aria-label="Move right"><ArrowRight size={16} /></button>
                                    <button type="button" onClick={() => copyUrl(resource)} aria-label="Copy URL"><Clipboard size={16} /></button>
                                    <button type="button" onClick={() => exportResource(resource)} aria-label="Save resource card"><Download size={16} /></button>
                                    <button type="button" onClick={() => setSelectedId(resource.id)} aria-label="Open resource details"><Maximize2 size={16} /></button>
                                    <button type="button" className="is-danger" onClick={() => removeResource(resource)} disabled={isBusy} aria-label="Delete resource"><Trash2 size={16} /></button>
                                </div>
                            </article>
                        );
                    })}

                    {!resources.length && !error && (
                        <div className="nexus-empty">
                            <FileImage size={38} />
                            <strong>Your resource board is ready.</strong>
                            <span>Add the first QR resource to begin.</span>
                            <button type="button" className="btn btn-primary" onClick={addResource}><Plus size={17} /> Add resource</button>
                        </div>
                    )}

                    {resources.length > 0 && visibleResources.length === 0 && (
                        <div className="nexus-empty nexus-search-empty">
                            <Search size={34} />
                            <strong>No matching resources.</strong>
                            <span>Try a different title, link, or keyword.</span>
                            <button type="button" className="btn btn-secondary" onClick={() => setSearchQuery('')}>Clear search</button>
                        </div>
                    )}
                </div>
            </section>

            <Modal isOpen={Boolean(selectedResource)} onClose={() => setSelectedId(null)} title={selectedResource?.title || 'Resource details'} size="xl" className="nexus-detail-modal">
                {selectedResource && detailDraft && (
                    <div className="nexus-detail">
                        <div className="nexus-detail-qr">
                            {imageUrls[selectedResource.id]
                                ? <img src={imageUrls[selectedResource.id]} alt={`QR code for ${selectedResource.title}`} />
                                : <div><QrCode size={54} /><span>No QR image uploaded</span></div>}
                            <label className="btn btn-secondary"><Upload size={16} /> Replace QR<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadQr(selectedResource, event.target.files?.[0])} /></label>
                        </div>
                        <div className="nexus-detail-content">
                            <div className="form-group"><label className="form-label">Resource title</label><input className="form-input" value={detailDraft.title} onChange={(event) => setDetailDraft({ ...detailDraft, title: event.target.value })} /></div>
                            <div className="form-group"><label className="form-label">Resource URL</label><input type="url" className="form-input" value={detailDraft.url} onChange={(event) => setDetailDraft({ ...detailDraft, url: event.target.value })} /></div>
                            <div className="form-group">
                                <label className="form-label">Description</label>
                                <div className="arc-format-toolbar" aria-label="Description formatting">
                                    <button type="button" onMouseDown={(event) => { event.preventDefault(); runFormat('bold'); }} aria-label="Bold"><Bold size={16} /></button>
                                    <button type="button" onMouseDown={(event) => { event.preventDefault(); runFormat('italic'); }} aria-label="Italic"><Italic size={16} /></button>
                                    <button type="button" onMouseDown={(event) => { event.preventDefault(); runFormat('underline'); }} aria-label="Underline"><Underline size={16} /></button>
                                    <button type="button" onMouseDown={(event) => { event.preventDefault(); runFormat('insertOrderedList'); }} aria-label="Numbered list"><ListOrdered size={16} /></button>
                                    <button type="button" onMouseDown={(event) => { event.preventDefault(); runFormat('insertUnorderedList'); }} aria-label="Bulleted list"><List size={16} /></button>
                                </div>
                                <div
                                    key={selectedResource.id}
                                    ref={descriptionEditorRef}
                                    className="nexus-rich-editor"
                                    contentEditable
                                    suppressContentEditableWarning
                                    dangerouslySetInnerHTML={{ __html: sanitizeArcHtml(detailDraft.description_html) }}
                                />
                            </div>
                        </div>
                        <div className="modal-footer nexus-detail-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setSelectedId(null)}><X size={17} /> Cancel</button>
                            <button type="button" className="btn btn-primary" onClick={saveDetail} disabled={busyIds.includes(selectedResource.id)}><Save size={17} /> Save resource</button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
