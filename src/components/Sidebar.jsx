import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logoNew from '../assets/logo_new.png';
import {
    ArrowLeftRight,
    Bell,
    Calendar,
    ChevronDown,
    ClipboardCheck,
    ClipboardList,
    Compass,
    Ellipsis,
    FileText,
    Home,
    LayoutDashboard,
    ListChecks,
    LogOut,
    Menu,
    PanelLeftClose,
    PanelLeftOpen,
    QrCode,
    Settings,
    Sparkles,
    Users,
    X
} from 'lucide-react';
import { computeUnreadAlerts, getReadAlertIds } from '../lib/alerts';
import { db } from '../lib/supabase';

const leadingNavItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/alerts', label: 'Alerts', icon: Bell }
];

const trailingNavItems = [
    { path: '/nexus', label: 'NEXUS', icon: QrCode },
    { path: '/core', label: 'CORE', icon: ListChecks }
];

const trackerNavItems = [
    { path: '/tracker', label: 'Overview', icon: LayoutDashboard },
    { path: '/personnel', label: 'Personnel', icon: Users, adminOnly: true },
    { path: '/schedule', label: 'Schedule', icon: Calendar },
    { path: '/attendance', label: 'Attendance', icon: ClipboardCheck },
    { path: '/records', label: 'Duty Records', icon: FileText },
    { path: '/swaps', label: 'Shift Swaps', icon: ArrowLeftRight }
];

const settingsItem = { path: '/settings', label: 'Settings', icon: Settings };

export default function Sidebar({ onOpenWhatsNew, onOpenGuide, isCollapsed, onToggleCollapsed }) {
    const { profile, user, signOut, isAdmin } = useAuth();
    const location = useLocation();
    const [isOpen, setIsOpen] = useState(false);
    const [trackerExpanded, setTrackerExpanded] = useState(
        () => localStorage.getItem('arc-tracker-nav-expanded') !== 'false'
    );
    const [unreadAlerts, setUnreadAlerts] = useState(0);
    const [pendingApprovals, setPendingApprovals] = useState(0);
    const [mobileNavHidden, setMobileNavHidden] = useState(false);

    const refreshUnreadAlerts = useCallback(async () => {
        const { data, error } = await db.getArcAnnouncements();
        if (error) return;
        setUnreadAlerts(computeUnreadAlerts(data || [], getReadAlertIds(user?.id)));
    }, [user?.id]);

    useEffect(() => {
        const initialRefresh = window.setTimeout(refreshUnreadAlerts, 0);
        const unsubscribe = db.subscribeArcAnnouncements(refreshUnreadAlerts);
        window.addEventListener('arc-alerts-read', refreshUnreadAlerts);
        return () => {
            window.clearTimeout(initialRefresh);
            unsubscribe();
            window.removeEventListener('arc-alerts-read', refreshUnreadAlerts);
        };
    }, [refreshUnreadAlerts]);

    useEffect(() => {
        if (!isAdmin) return undefined;

        const refreshPendingApprovals = async () => {
            const { data, error } = await db.getAccountRequests('pending');
            if (!error) setPendingApprovals(data?.length || 0);
        };
        refreshPendingApprovals();
        return db.subscribeAccountRequests(refreshPendingApprovals);
    }, [isAdmin]);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth > 768) setIsOpen(false);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!isOpen) return undefined;

        document.body.classList.add('mobile-navigation-open');
        return () => document.body.classList.remove('mobile-navigation-open');
    }, [isOpen]);

    useEffect(() => {
        let lastY = window.scrollY;
        let ticking = false;
        const syncNavigation = () => {
            ticking = false;
            const nextY = window.scrollY;
            if (window.innerWidth > 768 || isOpen || nextY <= 8) {
                setMobileNavHidden(false);
            } else if (nextY > lastY + 5) {
                setMobileNavHidden(true);
            } else if (nextY < lastY - 5) {
                setMobileNavHidden(false);
            }
            lastY = nextY;
        };
        const handleScroll = () => {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(syncNavigation);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [isOpen]);

    const filteredTrackerItems = trackerNavItems.filter((item) => !item.adminOnly || isAdmin);
    const allNavItems = [...leadingNavItems, ...filteredTrackerItems, ...trailingNavItems, settingsItem];
    const trackerIsActive = trackerNavItems.some((item) => item.path === location.pathname);
    const mobileNavPaths = ['/', '/alerts', '/tracker', '/schedule'];
    const mobileNavItems = allNavItems.filter((item) => mobileNavPaths.includes(item.path));
    const activeItem = allNavItems.find((item) => item.path === location.pathname);
    const isMoreActive = !mobileNavPaths.includes(location.pathname);

    const toggleTracker = () => {
        if (isCollapsed) {
            onToggleCollapsed();
            setTrackerExpanded(true);
            localStorage.setItem('arc-tracker-nav-expanded', 'true');
            return;
        }
        setTrackerExpanded((current) => {
            const next = !current;
            localStorage.setItem('arc-tracker-nav-expanded', String(next));
            return next;
        });
    };

    const renderNavLink = (item, extraClass = '') => {
        const Icon = item.icon;
        return (
            <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) => `nav-link ${extraClass} ${isActive ? 'active' : ''}`.trim()}
                onClick={() => setIsOpen(false)}
                title={isCollapsed ? item.label : undefined}
            >
                <Icon size={20} />
                <span className="nav-label">{item.label}</span>
                {item.path === '/alerts' && unreadAlerts > 0 && (
                    <span className="nav-unread-badge" aria-label={`${unreadAlerts} unread alert${unreadAlerts === 1 ? '' : 's'}`}>{unreadAlerts > 99 ? '99+' : unreadAlerts}</span>
                )}
                {item.path === '/personnel' && pendingApprovals > 0 && (
                    <span className="nav-unread-badge" aria-label={`${pendingApprovals} pending account approval${pendingApprovals === 1 ? '' : 's'}`}>{pendingApprovals > 99 ? '99+' : pendingApprovals}</span>
                )}
            </NavLink>
        );
    };

    return (
        <>
            <header className="mobile-app-header">
                <Link to="/" className="mobile-app-brand" aria-label="Go to ARC home">
                    <img src={logoNew} alt="" />
                    <div>
                        <span>ARC</span>
                        <strong>{activeItem?.label || 'Workspace'}</strong>
                    </div>
                </Link>
                <button
                    type="button"
                    className="mobile-header-menu"
                    onClick={() => setIsOpen(true)}
                    aria-label="Open account and more navigation"
                    aria-expanded={isOpen}
                >
                    <span className="user-avatar" aria-hidden="true">
                        {profile?.name?.charAt(0).toUpperCase() || 'U'}
                    </span>
                    <Menu size={18} />
                </button>
            </header>

            {isCollapsed && (
                <button
                    type="button"
                    className="sidebar-reopen-button"
                    onClick={onToggleCollapsed}
                    aria-label="Open navigation menu"
                    title="Open navigation menu"
                >
                    <PanelLeftOpen size={20} />
                    <span>Menu</span>
                </button>
            )}

            {isOpen && (
                <button
                    type="button"
                    className="sidebar-overlay"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close navigation menu"
                />
            )}

            <aside className={`sidebar ${isOpen ? 'open' : ''}`} aria-label="Main navigation">
                <button
                    type="button"
                    className="mobile-sidebar-close"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close navigation menu"
                >
                    <X size={20} />
                </button>
                <div className="sidebar-logo">
                    <Link to="/" className="sidebar-brand-home" aria-label="Go to ARC home" title="Go to ARC home">
                        <div className="sidebar-brand-mark">
                            <img src={logoNew} alt="" />
                        </div>
                        <div className="sidebar-brand-copy">
                            <h1>ARC</h1>
                            <span>ACRCY Operations</span>
                        </div>
                    </Link>
                    <button
                        type="button"
                        className="sidebar-collapse-toggle"
                        onClick={onToggleCollapsed}
                        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                    </button>
                </div>

                <div className="sidebar-scroll">
                    <nav className="sidebar-nav" data-tour="primary-navigation">
                        {leadingNavItems.map((item) => renderNavLink(item))}

                        <div className={`tracker-nav ${trackerExpanded ? 'is-expanded' : ''}`}>
                            <button
                                type="button"
                                className={`nav-link tracker-nav-toggle ${trackerIsActive ? 'active' : ''}`}
                                onClick={toggleTracker}
                                aria-expanded={trackerExpanded}
                                aria-controls="tracker-navigation"
                                title={isCollapsed ? 'Tracker' : undefined}
                            >
                                <ClipboardList size={20} />
                                <span className="nav-label">Tracker</span>
                                <ChevronDown className="tracker-nav-chevron" size={17} />
                                {isAdmin && pendingApprovals > 0 && !trackerExpanded && (
                                    <span className="nav-unread-badge">{pendingApprovals > 99 ? '99+' : pendingApprovals}</span>
                                )}
                            </button>
                            {trackerExpanded && (
                                <div className="tracker-nav-items" id="tracker-navigation">
                                    {filteredTrackerItems.map((item) => renderNavLink(item, 'tracker-sub-link'))}
                                </div>
                            )}
                        </div>

                        {trailingNavItems.map((item) => renderNavLink(item))}
                        {renderNavLink(settingsItem)}
                    </nav>

                    <div className="sidebar-footer">
                        <button
                            type="button"
                            className="nav-link app-guide-trigger"
                            onClick={() => {
                                setIsOpen(false);
                                onOpenGuide();
                            }}
                            title={isCollapsed ? 'Walkthrough' : undefined}
                        >
                            <Compass size={20} />
                            <span className="nav-label">Walkthrough</span>
                        </button>
                        <button
                            type="button"
                            className="nav-link whats-new-trigger"
                            onClick={() => {
                                setIsOpen(false);
                                onOpenWhatsNew();
                            }}
                            title={isCollapsed ? "What's New" : undefined}
                        >
                            <Sparkles size={20} />
                            <span className="nav-label">What's New</span>
                        </button>
                        <button className="nav-link mt-md" onClick={signOut} style={{ width: '100%' }} title={isCollapsed ? 'Sign Out' : undefined}>
                            <LogOut size={20} />
                            <span className="nav-label">Sign Out</span>
                        </button>
                    </div>
                </div>
            </aside>

            <nav className={`mobile-bottom-nav ${mobileNavHidden ? 'is-scroll-hidden' : ''}`} aria-label="Primary navigation" data-tour="mobile-navigation">
                {mobileNavItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/'}
                            className={({ isActive }) => `mobile-bottom-link ${isActive ? 'active' : ''}`}
                            onClick={() => setIsOpen(false)}
                        >
                            <span className="mobile-nav-icon-wrap">
                                <Icon size={21} />
                                {item.path === '/alerts' && unreadAlerts > 0 && <span className="mobile-unread-badge">{unreadAlerts > 99 ? '99+' : unreadAlerts}</span>}
                            </span>
                            <span>{item.label}</span>
                        </NavLink>
                    );
                })}
                <button
                    type="button"
                    className={`mobile-bottom-link ${isMoreActive || isOpen ? 'active' : ''}`}
                    onClick={() => setIsOpen(true)}
                    aria-label="Open more navigation"
                >
                    <span className="mobile-nav-icon-wrap">
                        <Ellipsis size={22} />
                        {isAdmin && pendingApprovals > 0 && <span className="mobile-unread-badge">{pendingApprovals > 99 ? '99+' : pendingApprovals}</span>}
                    </span>
                    <span>More</span>
                </button>
            </nav>
        </>
    );
}
