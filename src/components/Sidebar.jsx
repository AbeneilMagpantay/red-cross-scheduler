import { useState, useEffect } from 'react';
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
    Sparkles,
    Ellipsis
} from 'lucide-react';

const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/personnel', label: 'Personnel', icon: Users, adminOnly: true },
    { path: '/schedule', label: 'Schedule', icon: Calendar },
    { path: '/attendance', label: 'Attendance', icon: ClipboardCheck },
    { path: '/records', label: 'Duty Records', icon: FileText },
    { path: '/swaps', label: 'Shift Swaps', icon: ArrowLeftRight },
    { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ onOpenWhatsNew }) {
    const { profile, signOut, isAdmin } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const location = useLocation();

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

    const handleSignOut = async () => {
        await signOut();
    };

    const filteredNavItems = navItems.filter(item => !item.adminOnly || isAdmin);
    const mobileNavPaths = ['/', '/schedule', '/attendance', '/records'];
    const mobileNavItems = filteredNavItems.filter(item => mobileNavPaths.includes(item.path));
    const activeItem = filteredNavItems.find(item => item.path === location.pathname);
    const isMoreActive = !mobileNavPaths.includes(location.pathname);

    return (
        <>
            <header className="mobile-app-header">
                <div className="mobile-app-brand">
                    <img src={logoNew} alt="" />
                    <div>
                        <span>RCY Scheduler</span>
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
                        <h1>Ateneo College</h1>
                        <span>Red Cross Youth</span>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    {filteredNavItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                                onClick={() => setIsOpen(false)}
                            >
                                <Icon size={20} />
                                {item.label}
                            </NavLink>
                        );
                    })}
                </nav>

                <div className="sidebar-footer">
                    <button
                        type="button"
                        className="nav-link whats-new-trigger"
                        onClick={() => {
                            setIsOpen(false);
                            onOpenWhatsNew();
                        }}
                    >
                        <Sparkles size={20} />
                        What's New
                    </button>
                    <div className="user-info">
                        <div className="user-avatar">
                            {profile?.name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="user-details">
                            <h4>{profile?.name || 'User'}</h4>
                            <span>{profile?.role || 'Staff'}</span>
                        </div>
                    </div>
                    <button className="nav-link mt-md" onClick={handleSignOut} style={{ width: '100%' }}>
                        <LogOut size={20} />
                        Sign Out
                    </button>
                </div>
            </aside>

            <nav className="mobile-bottom-nav" aria-label="Primary navigation">
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
                            <Icon size={21} />
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
