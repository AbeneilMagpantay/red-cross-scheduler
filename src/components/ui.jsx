// Small shared building blocks; styles live in index.css.

export function PageLoader({ label = 'Loading…' }) {
    return (
        <div className="route-loader" role="status">
            <div className="loading" />
            <span>{label}</span>
        </div>
    );
}

export function EmptyState({ icon, title, children, className = '' }) {
    const Icon = icon;
    return (
        <div className={`empty-state ${className}`.trim()}>
            {Icon && <Icon size={48} aria-hidden="true" />}
            <h3>{title}</h3>
            {children && <p>{children}</p>}
        </div>
    );
}

// tone: success | warning | error | info | neutral (see lib/status.js)
export function StatusBadge({ tone = 'neutral', label, className = '' }) {
    return <span className={`badge badge-${tone} ${className}`.trim()}>{label}</span>;
}

// tone: red | blue | orange | green
export function StatCard({ icon, tone, value, label }) {
    const Icon = icon;
    return (
        <div className="stat-card">
            <div className={`stat-icon ${tone}`}>
                <Icon size={24} />
            </div>
            <div className="stat-content">
                <h3>{value}</h3>
                <p>{label}</p>
            </div>
        </div>
    );
}
