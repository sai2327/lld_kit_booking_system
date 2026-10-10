import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { LoginPage } from './pages/LoginPage.js';
import { ClubDashboard } from './pages/ClubDashboard.js';
import { CoordinatorDashboard } from './pages/CoordinatorDashboard.js';
import { Navbar } from './components/Navbar.js';
import { NotificationDrawer } from './components/NotificationDrawer.js';
import { api, NotificationItem } from './services/api.js';
import { getSocket } from './services/socket.js';
import { isAdmin } from './utils/roleUtils.js';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const list = await api.getNotifications();
      setNotifications(list);
    } catch (_err) {
      // Non-blocking notification fetch
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();

      const socket = getSocket();
      const onNotification = (notif: NotificationItem) => {
        setNotifications((prev) => [notif, ...prev]);
      };

      socket.on('notification', onNotification);
      return () => {
        socket.off('notification', onNotification);
      };
    }
  }, [user]);

  const handleMarkRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (_err) {}
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          fontSize: '1rem',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '3px solid rgba(99, 102, 241, 0.2)',
              borderTopColor: 'var(--accent-primary)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1rem',
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          Initializing Event Kit System...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <div className="bg-mesh-glow" />
        <LoginPage />
      </>
    );
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="app-container">
      <div className="bg-mesh-glow" />
      <Navbar
        unreadCount={unreadCount}
        onOpenNotifications={() => setDrawerOpen(true)}
      />

      {/* Route to Admin (Coordinator) or User (Club Member) dashboard */}
      {isAdmin(user.role) ? (
        <CoordinatorDashboard />
      ) : (
        <ClubDashboard />
      )}

      <NotificationDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        notifications={notifications}
        onMarkRead={handleMarkRead}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
