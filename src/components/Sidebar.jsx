import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
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
    Sparkles
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

    const handleSignOut = async () => {
        await signOut();
    };

    const filteredNavItems = navItems.filter(item => !item.adminOnly || isAdmin);

    return (
        <>
            {/* Mobile Menu Toggle */}
            <button
                className="mobile-menu-toggle"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Toggle menu"
            >
                {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Overlay for mobile */}
            {isOpen && (
                <button
                    type="button"
                    className="sidebar-overlay"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close navigation menu"
                />
            )}

            <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
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
        </>
    );
}
