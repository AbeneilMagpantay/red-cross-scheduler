import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import DeploymentNotifications from './components/DeploymentNotifications';
import WhatsNew from './components/WhatsNew';
import AppGuide from './components/AppGuide';
import PageInfoBoard from './components/PageInfoBoard';
import { playArcTap } from './lib/sounds';
import { hasSeenWhatsNew, rememberWhatsNewSeen } from './lib/whatsNew';
import './index.css';

const Login = lazy(() => import('./pages/Login'));
const Landing = lazy(() => import('./pages/Landing'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Personnel = lazy(() => import('./pages/Personnel'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Records = lazy(() => import('./pages/Records'));
const Swaps = lazy(() => import('./pages/Swaps'));
const Settings = lazy(() => import('./pages/Settings'));
const Nexus = lazy(() => import('./pages/Nexus'));
const Core = lazy(() => import('./pages/Core'));
const Alerts = lazy(() => import('./pages/Alerts'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

function PageLoader() {
  return (
    <div className="route-loader" role="status" aria-label="Loading page">
      <div className="loading" />
      <span>Loading...</span>
    </div>
  );
}

// Protected Route wrapper
function ProtectedRoute({ children, adminOnly = false }) {
  const {
    user,
    profile,
    loading,
    profileLoading,
    profileError,
    accountRequest,
    refreshProfile,
    signOut,
    isAdmin
  } = useAuth();

  // Show loading while checking session
  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: '100vh' }}>
        <div className="loading" style={{ width: 48, height: 48 }} />
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Show loading while profile is being fetched
  if (profileLoading && !profile) {
    return (
      <div className="flex items-center justify-center" style={{ height: '100vh' }}>
        <div className="loading" style={{ width: 48, height: 48 }} />
      </div>
    );
  }

  if (profileError && !profile) {
    return (
      <div className="access-state-page">
        <div className="access-state-card">
          <h2>We couldn’t verify your account</h2>
          <p>A temporary connection or profile lookup problem occurred. Your access has not been denied.</p>
          <p className="text-muted">{profileError}</p>
          <div className="access-state-actions">
            <button className="btn btn-primary" onClick={refreshProfile}>Try again</button>
            <button className="btn btn-secondary" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  if (!profile && accountRequest?.status === 'pending') {
    return (
      <div className="access-state-page">
        <div className="access-state-card">
          <span className="badge badge-warning">Approval pending</span>
          <h2>Your request is with an administrator</h2>
          <p>You can sign in after an administrator approves your ARC account.</p>
          <div className="access-state-actions">
            <button className="btn btn-primary" onClick={refreshProfile}>Check status</button>
            <button className="btn btn-secondary" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  if (!profile && accountRequest?.status === 'rejected') {
    return (
      <div className="access-state-page">
        <div className="access-state-card">
          <span className="badge badge-danger">Request declined</span>
          <h2>Your account request wasn’t approved</h2>
          <p>Please contact an administrator if you think this was a mistake.</p>
          <div className="access-state-actions">
            <button className="btn btn-primary" onClick={refreshProfile}>Check again</button>
            <button className="btn btn-secondary" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  // This is now shown only after a successful lookup confirms that both a
  // Personnel profile and an approval request are absent.
  if (!profile) {
    return (
      <div className="access-state-page">
        <div className="access-state-card">
          <h2>Account setup incomplete</h2>
          <p>No Personnel record or account request is connected to this sign-in.</p>
          <div className="access-state-actions">
            <button className="btn btn-primary" onClick={refreshProfile}>Check again</button>
            <button className="btn btn-secondary" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  // Block inactive users
  if (profile.is_active === false) {
    return (
      <div className="flex items-center justify-center flex-col gap-md" style={{ height: '100vh', padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--warning)' }}>Account Inactive</h2>
        <p>Your account has been deactivated.</p>
        <button
          className="btn btn-secondary mt-md"
          onClick={signOut}
        >
          Sign out
        </button>
      </div>
    );
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

// Layout with Sidebar
function AppLayout() {
  const { user } = useAuth();
  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(
    () => Boolean(user?.id) && !hasSeenWhatsNew(user.id)
  );
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => localStorage.getItem('arc-sidebar-collapsed') === 'true'
  );

  useEffect(() => {
    const handleTap = (event) => {
      if (event.target instanceof Element && event.target.closest('button, a, [role="button"]')) playArcTap();
    };
    document.addEventListener('click', handleTap);
    return () => document.removeEventListener('click', handleTap);
  }, []);

  const closeWhatsNew = () => {
    rememberWhatsNewSeen(user?.id);
    setIsWhatsNewOpen(false);
  };

  return (
    <div className={`app-layout ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        onOpenWhatsNew={() => setIsWhatsNewOpen(true)}
        onOpenGuide={() => setIsGuideOpen(true)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((current) => {
          const next = !current;
          localStorage.setItem('arc-sidebar-collapsed', String(next));
          return next;
        })}
      />
      <DeploymentNotifications />
      <WhatsNew isOpen={isWhatsNewOpen} onClose={closeWhatsNew} />
      {isGuideOpen && <AppGuide isOpen onClose={() => setIsGuideOpen(false)} />}
      <main className="main-content">
        <Outlet />
      </main>
      <PageInfoBoard />
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: '100vh' }}>
        <div className="loading" style={{ width: 48, height: 48 }} />
      </div>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <Login />}
        />

        <Route
        path="/reset-password"
        element={<ResetPassword />}
        />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Landing />} />
        <Route path="tracker" element={<Dashboard />} />
        <Route
          path="personnel"
          element={
            <ProtectedRoute adminOnly>
              <Personnel />
            </ProtectedRoute>
          }
        />
        <Route path="schedule" element={<Schedule />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="records" element={<Records />} />
        <Route path="swaps" element={<Swaps />} />
        <Route path="settings" element={<Settings />} />
        <Route path="nexus" element={<Nexus />} />
        <Route path="core" element={<Core />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="dashboard" element={<Navigate to="/tracker" replace />} />
      </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
