import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

const ICONS = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info
};

export default function InlineAlert({ type = 'info', children, onDismiss, className = '' }) {
    const Icon = ICONS[type] || Info;
    return (
        <div className={`inline-alert ${type} ${className}`.trim()} role={type === 'error' ? 'alert' : 'status'}>
            <Icon size={18} aria-hidden="true" />
            <div className="inline-alert-body">{children}</div>
            {onDismiss && (
                <button type="button" className="inline-alert-dismiss" onClick={onDismiss} aria-label="Dismiss message">
                    <X size={16} />
                </button>
            )}
        </div>
    );
}
