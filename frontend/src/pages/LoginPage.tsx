import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useTheme } from '../context/ThemeContext.js';
import { Film, LogIn, ShieldAlert, Sparkles, ArrowRight, Sun, Moon } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const setDemoCredentials = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.25rem',
        position: 'relative',
      }}
    >
      {/* Theme toggle pinned top-right */}
      <button
        onClick={toggleTheme}
        id="theme-toggle-btn"
        aria-label={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
        aria-pressed={theme === 'light'}
        title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
        style={{
          position: 'fixed',
          top: '1rem',
          right: '1.25rem',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-full)',
          padding: '0.5rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all var(--transition-base)',
          zIndex: 100,
        }}
      >
        {theme === 'dark' ? (
          <Sun style={{ width: '1rem', height: '1rem', color: '#fbbf24' }} />
        ) : (
          <Moon style={{ width: '1rem', height: '1rem', color: '#6366f1' }} />
        )}
      </button>
      <div className="card" style={{ maxWidth: '460px', width: '100%', padding: '2.5rem 2.25rem' }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '1rem',
              borderRadius: 'var(--radius-xl)',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(6, 182, 212, 0.25))',
              marginBottom: '1rem',
              border: '1px solid var(--border-accent)',
              boxShadow: '0 0 25px -4px var(--accent-glow)',
            }}
          >
            <Film className="w-8 h-8 text-indigo-400" />
          </div>
          <h2 style={{ fontSize: '1.85rem', fontWeight: 800 }}>
            Shared Event Kit <span className="gradient-text">Pro</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.35rem' }}>
            Production Equipment Booking & Handover Management
          </p>
        </div>

        {error && (
          <div className="banner-alert danger" style={{ marginBottom: '1.5rem' }}>
            <ShieldAlert className="w-5 h-5 flex-shrink-0" />
            <div style={{ fontSize: '0.875rem' }}>{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email-input">
              Email Address
            </label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. coordinator@campus.edu"
              required
              id="login-email-input"
              autoComplete="username"
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" htmlFor="login-password-input">
              Password
            </label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              id="login-password-input"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.8rem 1.5rem' }}
            disabled={loading}
            id="login-submit-btn"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'Authenticating Session...' : 'Sign In'}
          </button>
        </form>

        {/* 1-Click Demo Accounts Section */}
        <div style={{ marginTop: '2.25rem', paddingTop: '1.75rem', borderTop: '1px solid var(--border-subtle)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                color: 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Demo Roles (1-Click Fill)
            </span>
            <span className="badge badge-purple" style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem' }}>
              Local Testing
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {/* Coordinator (Admin) */}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{
                justifyContent: 'space-between',
                padding: '0.65rem 0.85rem',
                border: '1px solid rgba(168, 85, 247, 0.25)',
              }}
              onClick={() => setDemoCredentials('coordinator@campus.edu', 'Coordinator123!')}
              id="demo-coordinator-btn"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="role-chip" style={{ background: 'rgba(168, 85, 247, 0.25)', color: '#c084fc' }}>
                  ADMIN
                </span>
                <span style={{ fontWeight: 600 }}>Coordinator</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="mono-text" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  coordinator@campus.edu
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
              </div>
            </button>

            {/* Robotics Club (User) */}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{
                justifyContent: 'space-between',
                padding: '0.65rem 0.85rem',
                border: '1px solid rgba(6, 182, 212, 0.25)',
              }}
              onClick={() => setDemoCredentials('robotics_lead@campus.edu', 'ClubPass123!')}
              id="demo-robotics-btn"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="role-chip" style={{ background: 'rgba(6, 182, 212, 0.25)', color: '#38bdf8' }}>
                  USER
                </span>
                <span style={{ fontWeight: 600 }}>Robotics Club</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="mono-text" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  robotics_lead@campus.edu
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
              </div>
            </button>

            {/* Drama Society (User) */}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{
                justifyContent: 'space-between',
                padding: '0.65rem 0.85rem',
                border: '1px solid rgba(99, 102, 241, 0.25)',
              }}
              onClick={() => setDemoCredentials('drama_lead@campus.edu', 'ClubPass123!')}
              id="demo-drama-btn"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="role-chip" style={{ background: 'rgba(99, 102, 241, 0.25)', color: '#818cf8' }}>
                  USER
                </span>
                <span style={{ fontWeight: 600 }}>Drama Society</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="mono-text" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  drama_lead@campus.edu
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
