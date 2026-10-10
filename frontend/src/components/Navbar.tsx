import React from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useTheme } from '../context/ThemeContext.js';
import { Bell, LogOut, ShieldCheck, Film, Sun, Moon } from 'lucide-react';
import { UserProfile } from '../services/api.js';
import { isAdmin, getDisplayRole } from '../utils/roleUtils.js';

interface NavbarProps {
  unreadCount: number;
  onOpenNotifications: () => void;
  currentUser?: UserProfile | null;
}

export const Navbar: React.FC<NavbarProps> = ({ unreadCount, onOpenNotifications, currentUser }) => {
  const auth = useAuth();
  const { theme, toggleTheme } = useTheme();
  const user = currentUser !== undefined ? currentUser : auth.user;
  const logout = auth.logout;

  const displayRole = user ? getDisplayRole(user.role) : null;

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div className="nav-brand">
          <div className="brand-icon-box">
            <Film className="w-5 h-5 text-indigo-400" />
          </div>
          <span>
            SharedKit <span className="gradient-text">Pro</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {user && (
            <>
              {/* Live Socket Sync Status */}
              <div className="live-sync-pill" title="Socket.IO real-time updates active">
                <span className="live-sync-dot"></span>
                <span className="sm-inline">Live Sync</span>
              </div>

              {/* Role indicator */}
              {isAdmin(user.role) ? (
                <span className="badge badge-purple" title="Administrator Role">
                  <span className="role-chip">{displayRole}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <ShieldCheck className="w-3.5 h-3.5" /> Coordinator
                  </span>
                </span>
              ) : (
                <span className="badge badge-info" title="Club Member Role">
                  <span className="role-chip">{displayRole}</span>
                  <span>Club: {user.club?.name || user.club?.code || 'Member'}</span>
                </span>
              )}

              {/* Notifications Toggle */}
              <button
                className="btn btn-secondary btn-sm"
                style={{ position: 'relative', padding: '0.45rem 0.75rem' }}
                onClick={onOpenNotifications}
                title="Notifications"
                id="notifications-toggle-btn"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="notif-badge" id="notifications-unread-count">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Sign Out Button */}
              <button
                className="btn btn-secondary btn-sm"
                onClick={logout}
                title="Sign Out"
                id="logout-btn"
                style={{ padding: '0.45rem 0.85rem' }}
              >
                <LogOut className="w-4 h-4 text-slate-400" />
                <span className="sm-inline" style={{ fontWeight: 600 }}>
                  Logout
                </span>
              </button>
            </>
          )}

          {/* Theme Toggle — always visible */}
          <button
            className="btn btn-secondary btn-sm theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
            id="theme-toggle-btn"
            aria-label={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
            aria-pressed={theme === 'light'}
            style={{ padding: '0.45rem 0.65rem' }}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-400" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
