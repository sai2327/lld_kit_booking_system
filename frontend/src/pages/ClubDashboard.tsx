import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { api, Booking } from '../services/api.js';
import { getSocket } from '../services/socket.js';
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  PlusCircle,
  Package,
  Layers,
  Camera,
  Mic,
  ShieldCheck,
} from 'lucide-react';

const TripodIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v3" />
    <path d="M12 10L6 21" />
    <path d="M12 10l6 21" />
    <path d="M12 10v11" />
  </svg>
);

export const ClubDashboard: React.FC = () => {
  const { user } = useAuth();
  const [kitId, setKitId] = useState<string>('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingFilter, setBookingFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'>('ALL');

  // New Booking Form State
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');

  // Availability Search State
  const [availabilityResult, setAvailabilityResult] = useState<{
    checked: boolean;
    available?: boolean;
    message?: string;
  }>({ checked: false });
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Load initial data
  const loadData = async () => {
    try {
      setLoading(true);
      // 1. Fetch shared kit directly from backend
      const kitStatus = await api.getSharedKit();
      if (kitStatus?.kit?.id) {
        setKitId(kitStatus.kit.id);
      }

      // 2. Fetch bookings list
      const bookingsData = await api.listBookings();
      setBookings(bookingsData);
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Listen for real-time socket events
    const socket = getSocket();
    const handleUpdate = () => {
      loadData();
    };

    socket.on('booking_created', handleUpdate);
    socket.on('booking_cancelled', handleUpdate);
    socket.on('equipment_checked_out', handleUpdate);
    socket.on('equipment_returned', handleUpdate);

    return () => {
      socket.off('booking_created', handleUpdate);
      socket.off('booking_cancelled', handleUpdate);
      socket.off('equipment_checked_out', handleUpdate);
      socket.off('equipment_returned', handleUpdate);
    };
  }, []);

  const getIsoInterval = (): { startIso: string; endIso: string } | null => {
    if (!startDate || !startTime || !endDate || !endTime) return null;
    const s = new Date(`${startDate}T${startTime}:00`);
    const e = new Date(`${endDate}T${endTime}:00`);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
    return { startIso: s.toISOString(), endIso: e.toISOString() };
  };

  const handleCheckAvailability = async () => {
    if (!kitId) {
      setFormError('Shared event kit is still loading. Please refresh and try again.');
      return;
    }

    const interval = getIsoInterval();
    if (!interval) {
      setFormError('Please select both start and end date and time');
      return;
    }

    setFormError(null);
    setFormSuccess(null);
    setCheckingAvailability(true);

    try {
      const res = await api.checkAvailability(kitId, interval.startIso, interval.endIso);
      setAvailabilityResult({
        checked: true,
        available: res.available,
        message: res.available
          ? 'Slot is available! Complies with the mandatory 15-minute buffer.'
          : 'Conflict detected: requested slot overlaps an active reservation or sits within the 15-minute buffer.',
      });
    } catch (err: any) {
      setAvailabilityResult({
        checked: true,
        available: false,
        message: err.message || 'Availability check failed',
      });
    } finally {
      setCheckingAvailability(false);
    }
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kitId) {
      setFormError('Shared event kit is still loading. Please refresh and try again.');
      return;
    }

    const interval = getIsoInterval();
    if (!interval) {
      setFormError('Please select valid start and end dates and times');
      return;
    }

    setFormError(null);
    setFormSuccess(null);
    setSubmittingBooking(true);

    try {
      await api.createBooking(kitId, interval.startIso, interval.endIso);
      setFormSuccess('Reservation successfully created for the complete event kit!');
      setAvailabilityResult({ checked: false });
      // Reset form
      setStartDate('');
      setStartTime('');
      setEndDate('');
      setEndTime('');
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Booking creation failed');
    } finally {
      setSubmittingBooking(false);
    }
  };

  const handleCancelBooking = async (id: string) => {
    if (!window.confirm('Are you sure you want to cancel this booking? This will release the slot.')) {
      return;
    }

    try {
      await api.cancelBooking(id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel booking');
    }
  };

  // Filter bookings belonging to this club
  const myClubBookings = bookings.filter((b) => b.clubId === user?.clubId);

  const filteredMyBookings = myClubBookings.filter((b) => {
    if (bookingFilter === 'ALL') return true;
    if (bookingFilter === 'ACTIVE') return b.status === 'RESERVED' || b.status === 'CHECKED_OUT' || b.status === 'AT_RISK';
    if (bookingFilter === 'COMPLETED') return b.status === 'COMPLETED';
    if (bookingFilter === 'CANCELLED') return b.status === 'CANCELLED';
    return true;
  });

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'RESERVED':
        return (
          <span className="badge badge-success">
            <span className="status-dot available"></span> Reserved
          </span>
        );
      case 'AT_RISK':
        return (
          <span className="badge badge-warning">
            <span className="status-dot at-risk"></span> At Risk
          </span>
        );
      case 'CHECKED_OUT':
        return (
          <span className="badge badge-info">
            <Package className="w-3 h-3" /> Checked Out
          </span>
        );
      case 'RETURNED_PENDING_INSPECTION':
        return (
          <span className="badge badge-purple">
            <Clock className="w-3 h-3" /> Inspected
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="badge badge-success">
            <CheckCircle2 className="w-3 h-3" /> Completed
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="badge badge-danger">
            <XCircle className="w-3 h-3" /> Cancelled
          </span>
        );
      default:
        return <span className="badge badge-info">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="main-content" style={{ textAlign: 'center', padding: '6rem 1rem' }}>
        <div style={{ maxWidth: '400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="skeleton" style={{ height: '40px', width: '80%', margin: '0 auto' }}></div>
          <div className="skeleton" style={{ height: '140px', width: '100%' }}></div>
          <div className="skeleton" style={{ height: '140px', width: '100%' }}></div>
        </div>
      </div>
    );
  }

  const activeReservationsCount = myClubBookings.filter(
    (b) => b.status === 'RESERVED' || b.status === 'CHECKED_OUT' || b.status === 'AT_RISK'
  ).length;

  return (
    <div className="main-content">
      {/* Top Banner Overview */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem' }}>
            <h2>{user?.club?.name || 'Club'} Console</h2>
            <span className="role-chip" style={{ background: 'rgba(6, 182, 212, 0.2)', color: '#38bdf8' }}>
              USER
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Book the entire physical event kit (Camera + Mic + Tripod) for your upcoming club events.
          </p>
        </div>

        {/* Live Kit Health Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.625rem 1rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-full)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <span className="status-dot available"></span>
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Kit Readiness:</span>
          <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
            100% Whole Kit
          </span>
        </div>
      </div>

      {/* KPI Stats Ribbon */}
      <div className="grid-cols-4" style={{ marginBottom: '2rem' }}>
        <div className="stat-card" style={{ '--stat-accent': 'var(--accent-primary)' } as any}>
          <div className="stat-icon-wrapper" style={{ '--icon-bg': 'rgba(99, 102, 241, 0.15)', '--icon-color': '#818cf8' } as any}>
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="stat-value">{activeReservationsCount}</div>
            <div className="stat-label">Active Bookings</div>
          </div>
        </div>

        <div className="stat-card" style={{ '--stat-accent': 'var(--color-info)' } as any}>
          <div className="stat-icon-wrapper" style={{ '--icon-bg': 'rgba(6, 182, 212, 0.15)', '--icon-color': '#06b6d4' } as any}>
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="stat-value">15 min</div>
            <div className="stat-label">Buffer Guard</div>
          </div>
        </div>

        <div className="stat-card" style={{ '--stat-accent': 'var(--color-success)' } as any}>
          <div className="stat-icon-wrapper" style={{ '--icon-bg': 'rgba(16, 185, 129, 0.15)', '--icon-color': '#10b981' } as any}>
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="stat-value">3 / 3</div>
            <div className="stat-label">Physical Items</div>
          </div>
        </div>

        <div className="stat-card" style={{ '--stat-accent': 'var(--color-purple)' } as any}>
          <div className="stat-icon-wrapper" style={{ '--icon-bg': 'rgba(168, 85, 247, 0.15)', '--icon-color': '#c084fc' } as any}>
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="stat-value">{myClubBookings.length}</div>
            <div className="stat-label">Total History</div>
          </div>
        </div>
      </div>

      {/* Booking Form and Kit Inventory Grid */}
      <div className="grid-cols-2" style={{ marginBottom: '2.5rem' }}>
        {/* Reservation Creator Card */}
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <PlusCircle className="w-5 h-5 text-indigo-400" />
              <h3>Reserve Event Kit</h3>
            </div>
            <span className="badge badge-info">15-min Buffer Enforced</span>
          </div>

          {/* Stepper Indicator */}
          <div className="booking-stepper">
            <div className={`step-item ${startDate && startTime && endDate && endTime ? 'active' : ''}`}>
              <span className="step-number">1</span>
              <span>Select Interval</span>
            </div>
            <span className="step-arrow">&rarr;</span>
            <div className={`step-item ${availabilityResult.checked ? 'active' : ''}`}>
              <span className="step-number">2</span>
              <span>Check Buffer</span>
            </div>
            <span className="step-arrow">&rarr;</span>
            <div className="step-item">
              <span className="step-number">3</span>
              <span>Atomic Lock</span>
            </div>
          </div>

          {formError && (
            <div className="banner-alert danger" style={{ padding: '0.85rem 1rem', fontSize: '0.875rem' }}>
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <div>{formError}</div>
            </div>
          )}

          {formSuccess && (
            <div className="banner-alert success" style={{ padding: '0.85rem 1rem', fontSize: '0.875rem' }}>
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <div>{formSuccess}</div>
            </div>
          )}

          <form onSubmit={handleCreateBooking}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="booking-start-date">
                  Start Date
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  id="booking-start-date"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="booking-start-time">
                  Start Time
                </label>
                <input
                  type="time"
                  className="form-input"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  id="booking-start-time"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="booking-end-date">
                  End Date
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  id="booking-end-date"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="booking-end-time">
                  End Time
                </label>
                <input
                  type="time"
                  className="form-input"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                  id="booking-end-time"
                />
              </div>
            </div>

            {/* Live Availability Result Pill / Banner */}
            {availabilityResult.checked && (
              <div
                className={`banner-alert ${availabilityResult.available ? 'success' : 'danger'}`}
                style={{ padding: '0.85rem 1.15rem', fontSize: '0.875rem', marginBottom: '1.25rem' }}
              >
                {availabilityResult.available ? (
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                )}
                <div>
                  <strong>{availabilityResult.available ? 'Slot Available:' : 'Booking Conflict:'}</strong>{' '}
                  {availabilityResult.message}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.875rem', marginTop: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={handleCheckAvailability}
                disabled={checkingAvailability || !kitId}
                id="check-availability-btn"
              >
                {checkingAvailability ? 'Checking Buffer...' : !kitId ? 'Loading Kit...' : 'Check Availability'}
              </button>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={submittingBooking || !kitId || (availabilityResult.checked && !availabilityResult.available)}
                id="submit-booking-btn"
              >
                {submittingBooking ? 'Reserving Whole Kit...' : !kitId ? 'Loading Kit...' : 'Book Complete Kit'}
              </button>
            </div>
          </form>
        </div>

        {/* Physical Kit Inventory Details */}
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <Package className="w-5 h-5 text-cyan-400" />
              <h3>Event Kit Inventory (All 3 Included)</h3>
            </div>
            <span className="badge badge-success">Atomic Kit</span>
          </div>

          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Reservations apply to all 3 physical items together. Single items cannot be checked out separately.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {/* Camera Item */}
            <div className="equipment-item-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                  <div className="equipment-icon-halo">
                    <Camera className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.95rem' }}>4K Cinema Camera Body</strong>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Sony Alpha 4K Body + 24-70mm f/2.8 GM Lens
                    </p>
                  </div>
                </div>
                <span className="badge badge-success">
                  <span className="status-dot available"></span> Usable
                </span>
              </div>
            </div>

            {/* Mic Item */}
            <div className="equipment-item-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                  <div className="equipment-icon-halo">
                    <Mic className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.95rem' }}>Wireless Dual Microphone</strong>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Rode Wireless Pro Dual Transmitter + Receiver Pair
                    </p>
                  </div>
                </div>
                <span className="badge badge-success">
                  <span className="status-dot available"></span> Usable
                </span>
              </div>
            </div>

            {/* Tripod Item */}
            <div className="equipment-item-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                  <div className="equipment-icon-halo">
                    <TripodIcon className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.95rem' }}>Pro Video Fluid Tripod</strong>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Manfrotto Fluid Head + Quick-Release Plate
                    </p>
                  </div>
                </div>
                <span className="badge badge-success">
                  <span className="status-dot available"></span> Usable
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* My Club's Bookings Section */}
      <div className="card" style={{ marginBottom: '2.5rem' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <Calendar className="w-5 h-5 text-indigo-400" />
            <h3>My Club's Bookings</h3>
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {(['ALL', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const).map((tab) => (
              <button
                key={tab}
                className={`btn btn-sm ${bookingFilter === tab ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                onClick={() => setBookingFilter(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {filteredMyBookings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
            <Calendar className="w-10 h-10" style={{ margin: '0 auto 0.75rem', opacity: 0.35 }} />
            <p style={{ fontSize: '0.95rem', fontWeight: 500 }}>
              {bookingFilter === 'ALL'
                ? 'Your club does not have any active or past reservations yet.'
                : `No bookings found matching filter "${bookingFilter}".`}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredMyBookings.map((b) => {
              const isAtRisk = b.status === 'AT_RISK';
              const canCancel = b.status === 'RESERVED' || b.status === 'AT_RISK';

              return (
                <div
                  key={b.id}
                  className="interactive-card"
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: `1px solid ${isAtRisk ? 'rgba(245, 158, 11, 0.45)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '1.25rem',
                    boxShadow: isAtRisk ? '0 0 15px -3px var(--color-warning-glow)' : 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.875rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.35rem' }}>
                        {renderStatusBadge(b.status)}
                        <span className="mono-text" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          ID: {b.id.slice(0, 8)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          fontSize: '0.95rem',
                          fontWeight: 600,
                        }}
                      >
                        <Clock className="w-4 h-4 text-indigo-400" />
                        <span>
                          {new Date(b.start).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {' '}&rarr;{' '}
                          {new Date(b.end).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>

                    {canCancel && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleCancelBooking(b.id)}
                        id={`cancel-booking-btn-${b.id.slice(0, 8)}`}
                      >
                        Cancel Reservation
                      </button>
                    )}
                  </div>

                  {isAtRisk && (
                    <div
                      className="banner-alert warning"
                      style={{ margin: '0.875rem 0 0 0', padding: '0.75rem 1rem' }}
                    >
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <div style={{ fontSize: '0.825rem' }}>
                        <strong>Disruption Notice:</strong> Equipment was returned damaged or missing from a prior booking. Handover is currently blocked while coordinators recover or replace the missing unit. Check notifications for live resolution updates.
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Shared Campus Calendar Schedule */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <Layers className="w-5 h-5 text-cyan-400" />
            <h3>Shared Campus Kit Schedule</h3>
          </div>
          <span className="badge badge-info">Real-Time Sync</span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Club Name</th>
                <th>Reserved Time Window</th>
                <th>Kit Status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.filter((b) => b.status !== 'CANCELLED').length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    No scheduled reservations on the calendar.
                  </td>
                </tr>
              ) : (
                bookings
                  .filter((b) => b.status !== 'CANCELLED')
                  .map((b) => (
                    <tr key={b.id} className="table-row">
                      <td style={{ fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>{b.club.name}</span>
                          {b.clubId === user?.clubId && (
                            <span className="badge badge-info" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                              Your Club
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {new Date(b.start).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {' '}&rarr;{' '}
                          {new Date(b.end).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>
                      <td>{renderStatusBadge(b.status)}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
