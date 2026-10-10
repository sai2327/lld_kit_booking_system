import React, { useState } from 'react';
import { NotificationItem } from '../services/api.js';
import { X, CheckCheck, AlertTriangle, Info, Bell } from 'lucide-react';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkRead: (id: string) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkRead,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');

  if (!isOpen) return null;

  const filteredNotifs = notifications.filter((n) => {
    if (filter === 'UNREAD') return !n.isRead;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ padding: 0 }}>
      <div
        className="notification-drawer"
        onClick={(e) => e.stopPropagation()}
        id="notification-drawer-panel"
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(13, 18, 34, 0.95)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="brand-icon-box" style={{ width: '34px', height: '34px' }}>
              <Bell className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Notifications & Alerts</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                Equipment disruption alerts & live schedule warnings
              </p>
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            style={{ padding: '0.35rem 0.5rem', borderRadius: 'var(--radius-sm)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Bar */}
        <div
          style={{
            padding: '0.625rem 1.5rem',
            background: 'var(--bg-tertiary)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              className={`btn btn-sm ${filter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
              onClick={() => setFilter('ALL')}
            >
              All ({notifications.length})
            </button>
            <button
              className={`btn btn-sm ${filter === 'UNREAD' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
              onClick={() => setFilter('UNREAD')}
            >
              Unread ({unreadCount})
            </button>
          </div>
          {unreadCount > 0 && (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-warning)', fontWeight: 600 }}>
              {unreadCount} action item{unreadCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Notification Items List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
          {filteredNotifs.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '3.5rem 1rem',
                color: 'var(--text-muted)',
              }}
            >
              <Info
                className="w-9 h-9"
                style={{ margin: '0 auto 0.75rem', opacity: 0.35, color: 'var(--text-muted)' }}
              />
              <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                {filter === 'UNREAD' ? 'No unread notifications' : 'No notifications yet'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {filteredNotifs.map((n) => {
                const isRisk =
                  n.title.toLowerCase().includes('risk') || n.title.toLowerCase().includes('disruption');

                return (
                  <div
                    key={n.id}
                    className="interactive-card"
                    style={{
                      background: n.isRead ? 'var(--bg-tertiary)' : 'rgba(99, 102, 241, 0.1)',
                      border: `1px solid ${
                        !n.isRead
                          ? 'rgba(99, 102, 241, 0.4)'
                          : isRisk
                          ? 'rgba(245, 158, 11, 0.3)'
                          : 'var(--border-subtle)'
                      }`,
                      borderRadius: 'var(--radius-md)',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      boxShadow: !n.isRead ? '0 0 15px -4px var(--accent-glow)' : 'none',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {isRisk ? (
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                        ) : (
                          <Info className="w-4 h-4 text-cyan-400" />
                        )}
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            color: isRisk ? '#fbbf24' : 'var(--text-primary)',
                          }}
                        >
                          {n.title}
                        </span>
                      </div>

                      {!n.isRead && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.25rem 0.55rem', fontSize: '0.725rem' }}
                          onClick={() => onMarkRead(n.id)}
                          title="Mark as read"
                        >
                          <CheckCheck className="w-3.5 h-3.5 text-cyan-400" /> Mark Read
                        </button>
                      )}
                    </div>

                    <p style={{ fontSize: '0.835rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                      {n.message}
                    </p>

                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {new Date(n.createdAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
