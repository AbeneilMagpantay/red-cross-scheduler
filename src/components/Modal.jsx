import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const SIZES = {
    sm: '400px',
    md: '500px',
    lg: '700px',
    xl: '900px'
};

const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

// Open dialogs, newest last. Only the top one handles Escape and Tab.
const openStack = [];
let scrollLock = null;

// iOS Safari ignores overflow: hidden on <body>, so pin the page in place instead.
const lockScroll = () => {
    if (scrollLock) {
        scrollLock.count += 1;
        return;
    }
    const { style } = document.body;
    scrollLock = {
        count: 1,
        scrollY: window.scrollY,
        previous: { position: style.position, top: style.top, width: style.width, overflow: style.overflow }
    };
    Object.assign(style, { position: 'fixed', top: `-${scrollLock.scrollY}px`, width: '100%', overflow: 'hidden' });
};

const unlockScroll = () => {
    if (!scrollLock) return;
    scrollLock.count -= 1;
    if (scrollLock.count > 0) return;
    Object.assign(document.body.style, scrollLock.previous);
    window.scrollTo({ top: scrollLock.scrollY, behavior: 'instant' });
    scrollLock = null;
};

const trapFocus = (event, container) => {
    const items = [...container.querySelectorAll(FOCUSABLE)].filter((element) => element.getClientRects().length > 0);
    if (!items.length) {
        event.preventDefault();
        return;
    }
    const first = items[0];
    const last = items.at(-1);
    if (!container.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
};

export default function Modal({ isOpen, onClose, title, children, size = 'md', className = '' }) {
    const titleId = useId();
    const dialogRef = useRef(null);
    const closeButtonRef = useRef(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) return undefined;

        const entry = {};
        openStack.push(entry);
        const previouslyFocused = document.activeElement;
        const handleKeyDown = (event) => {
            if (openStack.at(-1) !== entry) return;
            if (event.key === 'Escape') onCloseRef.current();
            if (event.key === 'Tab' && dialogRef.current) trapFocus(event, dialogRef.current);
        };

        lockScroll();
        window.addEventListener('keydown', handleKeyDown);
        closeButtonRef.current?.focus();

        return () => {
            openStack.splice(openStack.indexOf(entry), 1);
            unlockScroll();
            window.removeEventListener('keydown', handleKeyDown);
            previouslyFocused?.focus?.({ preventScroll: true });
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const handleOverlayClick = (event) => {
        if (event.target === event.currentTarget) onClose();
    };

    return (
        <div className="modal-overlay" onClick={handleOverlayClick}>
            <div
                ref={dialogRef}
                className={`modal ${className}`.trim()}
                style={{ maxWidth: SIZES[size] }}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
            >
                <div className="modal-header">
                    <h2 id={titleId} className="modal-title">{title}</h2>
                    <button
                        ref={closeButtonRef}
                        type="button"
                        className="modal-close"
                        onClick={onClose}
                        aria-label="Close dialog"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
            </div>
        </div>
    );
}
