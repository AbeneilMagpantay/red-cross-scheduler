import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    LayoutDashboard,
    Users,
    Calendar,
    ClipboardCheck,
    ArrowLeftRight,
    LogOut,
    Cross,
    Menu,
    X,
    Settings
} from 'lucide-react';

const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/personnel', label: 'Personnel', icon: Users, adminOnly: true },
    { path: '/schedule', label: 'Schedule', icon: Calendar },
    { path: '/attendance', label: 'Attendance', icon: ClipboardCheck },
    { path: '/swaps', label: 'Shift Swaps', icon: ArrowLeftRight },
    { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
    const { profile, signOut, isAdmin } = useAuth();
    const location = useLocation();
    const [isOpen, setIsOpen] = useState(false);

    // Close sidebar on route change (mobile)
    useEffect(() => {
        setIsOpen(false);
    }, [location.pathname]);

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
                <div
                    className="sidebar-overlay"
                    onClick={() => setIsOpen(false)}
                />
            )}

            <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
                <div className="sidebar-logo">
                    <div className="logo-icon">
                        <Cross size={24} />
                    </div>
                    <div>
                        <h1>Red Cross</h1>
                        <span>Camarines Sur</span>
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
                            >
                                <Icon size={20} />
                                {item.label}
                            </NavLink>
                        );
                    })}
                </nav>

                <div className="sidebar-footer">
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
