import { useCallback, useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logoNew from '../assets/logo_new.png';
import {
    LayoutDashboard,
    Users,
    Calendar,
    ClipboardCheck,
    ArrowLeftRight,
    LogOut,
    Menu,
    X,
    Settings,
    FileText,
    ListChecks,
    QrCode,
    Sparkles,
    Ellipsis,
    Bell,
    Compass,
    PanelLeftClose,
    PanelLeftOpen
} from 'lucide-react';
import { computeUnreadAlerts, getReadAlertIds } from '../lib/alerts';
import { db } from '../lib/supabase';

const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/personnel', label: 'Personnel', icon: Users, adminOnly: true },
    { path: '/schedule', label: 'Schedule', icon: Calendar },
    { path: '/attendance', label: 'Attendance', icon: ClipboardCheck },
    { path: '/records', label: 'Duty Records', icon: FileText },
    { path: '/swaps', label: 'Shift Swaps', icon: ArrowLeftRight },
    { path: '/nexus', label: 'NEXUS', icon: QrCode, arcOnly: true },
    { path: '/core', label: 'CORE', icon: ListChecks, arcOnly: true },
    { path: '/alerts', label: 'Alerts', icon: Bell },
    { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ onOpenWhatsNew, onOpenGuide, isCollapsed, onToggleCollapsed }) {
    const { profile, user, signOut, isAdmin, canAccessArc } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [unreadAlerts, setUnreadAlerts] = useState(0);
    const [mobileNavHidden, setMobileNavHidden] = useState(false);
    const location = useLocation();

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

    // Close sidebar on window resize to desktop
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth > 768) {
                setIsOpen(false);
            }
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

    const handleSignOut = async () => {
        await signOut();
    };

    const filteredNavItems = navItems.filter(item => (
        (!item.adminOnly || isAdmin)
        && (!item.arcOnly || canAccessArc)
    ));
    const mobileNavPaths = ['/', '/schedule', '/alerts', '/records'];
    const mobileNavItems = filteredNavItems.filter(item => mobileNavPaths.includes(item.path));
    const activeItem = filteredNavItems.find(item => item.path === location.pathname);
    const isMoreActive = !mobileNavPaths.includes(location.pathname);

    return (
        <>
            <header className="mobile-app-header">
                <div className="mobile-app-brand">
                    <img src={logoNew} alt="" />
                    <div>
                        <span>ARC</span>
                        <strong>{activeItem?.label || 'Workspace'}</strong>
                    </div>
                </div>
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

            {/* Overlay for mobile */}
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
                    <div className="sidebar-brand-mark">
                        <img src={logoNew} alt="" />
                    </div>
                    <div className="sidebar-brand-copy">
                        <h1>ARC</h1>
                        <span>ACRCY Operations</span>
                    </div>
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
                    <nav className="sidebar-nav">
                        {filteredNavItems.map((item) => {
                            const Icon = item.icon;
                            return (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                                    onClick={() => setIsOpen(false)}
                                    title={isCollapsed ? item.label : undefined}
                                >
                                    <Icon size={20} />
                                    <span className="nav-label">{item.label}</span>
                                    {item.path === '/alerts' && unreadAlerts > 0 && (
                                        <span className="nav-unread-badge" aria-label={`${unreadAlerts} unread alert${unreadAlerts === 1 ? '' : 's'}`}>{unreadAlerts > 99 ? '99+' : unreadAlerts}</span>
                                    )}
                                </NavLink>
                            );
                        })}
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
                        >
                            <Sparkles size={20} />
                            <span className="nav-label">What's New</span>
                        </button>
                        <div className="user-info">
                            <div className="user-avatar">
                                {profile?.name?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div className="user-details">
                                <h4>{profile?.name || 'User'}</h4>
                                <span>{profile?.role || 'Volunteer'}</span>
                            </div>
                        </div>
                        <button className="nav-link mt-md" onClick={handleSignOut} style={{ width: '100%' }} title={isCollapsed ? 'Sign Out' : undefined}>
                            <LogOut size={20} />
                            <span className="nav-label">Sign Out</span>
                        </button>
                    </div>
                </div>
            </aside>

            <nav className={`mobile-bottom-nav ${mobileNavHidden ? 'is-scroll-hidden' : ''}`} aria-label="Primary navigation">
                {mobileNavItems.map((item) => {
                    const Icon = item.icon;
                    const mobileLabel = item.path === '/records' ? 'Records' : item.label;
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
                            <span>{mobileLabel}</span>
                        </NavLink>
                    );
                })}
                <button
                    type="button"
                    className={`mobile-bottom-link ${isMoreActive || isOpen ? 'active' : ''}`}
                    onClick={() => setIsOpen(true)}
                    aria-label="Open more navigation"
                >
                    <Ellipsis size={22} />
                    <span>More</span>
                </button>
            </nav>
        </>
    );
}
