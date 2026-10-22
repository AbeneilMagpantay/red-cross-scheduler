import { useCallback, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import InlineAlert from './InlineAlert';
import { FeedbackContext } from './feedback';

const TOAST_DURATION_MS = 5000;

// In-app replacement for window.alert/confirm/prompt: one confirm dialog and a toast stack.
export default function FeedbackProvider({ children }) {
    const [dialog, setDialog] = useState(null);
    const [toasts, setToasts] = useState([]);
    const nextToastId = useRef(0);

    const confirm = useCallback((options) => new Promise((resolve) => {
        setDialog({
            title: 'Are you sure?',
            confirmLabel: 'Confirm',
            cancelLabel: 'Cancel',
            tone: 'primary',
            ...options,
            resolve
        });
    }), []);

    const dismissToast = useCallback((id) => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
    }, []);

    const toast = useMemo(() => {
        const show = (type) => (message) => {
            const id = nextToastId.current++;
            setToasts((current) => [...current.slice(-2), { id, type, message }]);
            window.setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
        };
        return { success: show('success'), error: show('error'), info: show('info'), warning: show('warning') };
    }, [dismissToast]);

    const closeDialog = (result) => {
        dialog?.resolve(result);
        setDialog(null);
    };

    const value = useMemo(() => ({ confirm, toast }), [confirm, toast]);

    return (
        <FeedbackContext.Provider value={value}>
            {children}

            <Modal isOpen={Boolean(dialog)} onClose={() => closeDialog(false)} title={dialog?.title} size="sm" className="confirm-dialog">
                {dialog?.message && <div className="confirm-dialog-message">{dialog.message}</div>}
                <div className="modal-actions">
                    {dialog?.cancelLabel && (
                        <button type="button" className="btn btn-secondary" onClick={() => closeDialog(false)}>{dialog.cancelLabel}</button>
                    )}
                    <button type="button" className={`btn ${dialog?.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={() => closeDialog(true)}>
                        {dialog?.confirmLabel}
                    </button>
                </div>
            </Modal>

            <div className="feedback-toasts" aria-live="polite">
                {toasts.map((item) => (
                    <InlineAlert key={item.id} type={item.type} className="feedback-toast" onDismiss={() => dismissToast(item.id)}>
                        {item.message}
                    </InlineAlert>
                ))}
            </div>
        </FeedbackContext.Provider>
    );
}
