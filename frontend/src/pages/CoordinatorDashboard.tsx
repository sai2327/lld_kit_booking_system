import React, { useState, useEffect } from 'react';
import { api, Booking, KitItem, Disruption } from '../services/api.js';
import { getSocket } from '../services/socket.js';
import { CheckoutModal } from '../components/CheckoutModal.js';
import { ReturnModal } from '../components/ReturnModal.js';
import { RecoverModal } from '../components/RecoverModal.js';
import { ReplaceModal } from '../components/ReplaceModal.js';
import {
  ShieldCheck,
  Package,
  AlertTriangle,
  RotateCcw,
  PlusCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Layers,
  Camera,
  Mic,
  Calendar,
  Activity,
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

export const CoordinatorDashboard: React.FC = () => {
  const [kit, setKit] = useState<{ id: string; name: string; items: KitItem[] } | null>(null);
  const [isReady, setIsReady] = useState<boolean>(true);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [disruptions, setDisruptions] = useState<Disruption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'CHECKED_OUT' | 'AT_RISK' | 'COMPLETED'>('ALL');

  // Modal states
  const [checkoutBooking, setCheckoutBooking] = useState<Booking | null>(null);
  const [returnBooking, setReturnBooking] = useState<Booking | null>(null);
  const [recoverDisruption, setRecoverDisruption] = useState<Disruption | null>(null);
  const [replaceDisruption, setReplaceDisruption] = useState<Disruption | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const allBookings = await api.listBookings();
      setBookings(allBookings);

      const allDisruptions = await api.listDisruptions();
      setDisruptions(allDisruptions);

      // Get kit status directly from backend
      const kitStatus = await api.getSharedKit();
      if (kitStatus?.kit) {
        setKit(kitStatus.kit);
        setIsReady(kitStatus.isReadyForHandover);
      }
    } catch (err: any) {
      console.error('Coordinator data loading error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

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

  const handleCancelAtRisk = async (id: string) => {
    if (!window.confirm('Cancel this at-risk booking as organizer resolution (R5)?')) {
      return;
    }
    try {
      await api.cancelBooking(id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Cancellation failed');
    }
  };

  const renderItemBadge = (state: string) => {
    switch (state) {
      case 'AVAILABLE':
        return (
          <span className="badge badge-success">
            <span className="status-dot available"></span> Usable
          </span>
        );
      case 'CHECKED_OUT':
        return (
          <span className="badge badge-info">
            <Package className="w-3 h-3" /> Checked Out
          </span>
        );
      case 'DAMAGED':
        return (
          <span className="badge badge-danger">
            <span className="status-dot damaged"></span> Damaged
          </span>
        );
      case 'MISSING':
        return (
          <span className="badge badge-danger">
            <span className="status-dot missing"></span> Missing
          </span>
        );
      case 'REPLACED':
        return <span className="badge badge-purple">Replaced</span>;
      default:
        return <span className="badge">{state}</span>;
    }
  };

  const renderBookingStatusBadge = (status: string) => {
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
            <Clock className="w-3 h-3" /> Pending
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
        return <span className="badge">{status}</span>;
    }
  };

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'CAMERA':
        return <Camera className="w-5 h-5 text-indigo-400" />;
      case 'MIC':
        return <Mic className="w-5 h-5 text-cyan-400" />;
      case 'TRIPOD':
        return <TripodIcon className="w-5 h-5 text-purple-400" />;
      default:
        return <Package className="w-5 h-5 text-indigo-400" />;
    }
  };

  const openDisruptions = disruptions.filter((d) => d.status === 'OPEN');
  const activeHandoversCount = bookings.filter((b) => b.status === 'CHECKED_OUT').length;
  const activeReservedCount = bookings.filter((b) => b.status === 'RESERVED' || b.status === 'AT_RISK').length;
  const activeKitItems = kit?.items.filter((i) => i.state !== 'REPLACED') || [];
  const usableItemsCount = activeKitItems.filter((i) => i.state === 'AVAILABLE').length;

  const filteredBookings = bookings.filter((b) => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'ACTIVE') return b.status === 'RESERVED';
    if (statusFilter === 'CHECKED_OUT') return b.status === 'CHECKED_OUT';
    if (statusFilter === 'AT_RISK') return b.status === 'AT_RISK';
    if (statusFilter === 'COMPLETED') return b.status === 'COMPLETED';
    return true;
  });

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

  return (
    <div className="main-content">
      {/* Overview Header */}
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
            <h2>Coordinator Operations Console</h2>
            <span className="role-chip" style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc' }}>
              ADMIN (COORDINATOR)
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Handover authorization, physical return inspections, disruptions & organizer resolutions (R3–R5).
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isReady ? (
            <span
              className="badge badge-success"
              style={{ padding: '0.55rem 1.15rem', fontSize: '0.85rem' }}
            >
              <CheckCircle2 className="w-4 h-4" /> Kit Ready for Handover
            </span>
          ) : (
            <span
              className="badge badge-danger"
              style={{ padding: '0.55rem 1.15rem', fontSize: '0.85rem' }}
            >
              <AlertTriangle className="w-4 h-4" /> Kit Incomplete / Blocked
            </span>
          )}
        </div>
      </div>

      {/* KPI Stat Cards (Admin Overview) */}
      <div className="grid-cols-4" style={{ marginBottom: '2rem' }}>
        <div className="stat-card" style={{ '--stat-accent': 'var(--accent-indigo)' } as any}>
          <div className="stat-icon-wrapper" style={{ '--icon-bg': 'rgba(99, 102, 241, 0.15)', '--icon-color': '#818cf8' } as any}>
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="stat-value">{activeHandoversCount}</div>
            <div className="stat-label">Active Handovers</div>
          </div>
        </div>

        <div className="stat-card" style={{ '--stat-accent': 'var(--color-success)' } as any}>
          <div className="stat-icon-wrapper" style={{ '--icon-bg': 'rgba(16, 185, 129, 0.15)', '--icon-color': '#10b981' } as any}>
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="stat-value">{usableItemsCount} / {activeKitItems.length}</div>
            <div className="stat-label">Fleet Usability</div>
          </div>
        </div>

        <div className="stat-card" style={{ '--stat-accent': 'var(--color-info)' } as any}>
          <div className="stat-icon-wrapper" style={{ '--icon-bg': 'rgba(6, 182, 212, 0.15)', '--icon-color': '#06b6d4' } as any}>
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="stat-value">{activeReservedCount}</div>
            <div className="stat-label">Pending / Reserved</div>
          </div>
        </div>

        <div className="stat-card" style={{ '--stat-accent': openDisruptions.length > 0 ? 'var(--color-warning)' : 'var(--color-purple)' } as any}>
          <div className="stat-icon-wrapper" style={{ '--icon-bg': openDisruptions.length > 0 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(168, 85, 247, 0.15)', '--icon-color': openDisruptions.length > 0 ? '#f59e0b' : '#c084fc' } as any}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="stat-value">{openDisruptions.length}</div>
            <div className="stat-label">Open Disruptions</div>
          </div>
        </div>
      </div>

      {/* Disruption Alert Banner */}
      {openDisruptions.length > 0 && (
        <div className="banner-alert warning" style={{ marginBottom: '2rem' }}>
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: '0.95rem' }}>Active Equipment Disruption Detected (R4):</strong>
            <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
              One or more items are missing or damaged. An upcoming reservation has been transitioned to AT_RISK and requires recovery, replacement, or organizer cancellation.
            </p>
          </div>
        </div>
      )}

      {/* Kit Physical Fleet Inventory Card */}
      <div className="card" style={{ marginBottom: '2.5rem' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <Package className="w-5 h-5 text-indigo-400" />
            <h3>Physical Inventory Fleet (Camera, Microphone, Tripod)</h3>
          </div>
          <span className="badge badge-info">Item-by-Item Tracking</span>
        </div>

        <div className="grid-cols-3">
          {activeKitItems.map((item) => (
            <div key={item.id} className="equipment-item-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div className="equipment-icon-halo">
                    {getItemIcon(item.type)}
                  </div>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{item.type}</span>
                    <div className="mono-text" style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                      SN: {item.serialNumber}
                    </div>
                  </div>
                </div>
                {renderItemBadge(item.state)}
              </div>

              {item.conditionNote && (
                <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', background: 'rgba(255, 255, 255, 0.03)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                  {item.conditionNote}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Disruption Management Section */}
      {openDisruptions.length > 0 && (
        <div className="card" style={{ marginBottom: '2.5rem', borderColor: 'rgba(245, 158, 11, 0.45)', boxShadow: '0 0 25px -4px var(--color-warning-glow)' }}>
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <h3>Disruptions & Resolution Workflows (R5)</h3>
            </div>
            <span className="badge badge-warning">{openDisruptions.length} Open Issues</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {openDisruptions.map((d) => (
              <div
                key={d.id}
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <span className="badge badge-warning">OPEN DISRUPTION</span>
                      <span className="mono-text" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        ID: {d.id.slice(0, 8)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.925rem' }}>
                      <strong>Affected Booking:</strong> {d.affectedBooking?.club?.name} (
                      {new Date(d.affectedBooking?.start).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })})
                    </div>
                    <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Source Booking: {d.sourceBooking?.club?.name}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setRecoverDisruption(d)}
                      id={`recover-btn-${d.id.slice(0, 8)}`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Record Recovery
                    </button>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setReplaceDisruption(d)}
                      id={`replace-btn-${d.id.slice(0, 8)}`}
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Add Replacement
                    </button>

                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleCancelAtRisk(d.affectedBookingId)}
                      id={`cancel-at-risk-btn-${d.id.slice(0, 8)}`}
                    >
                      Cancel At-Risk Booking
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bookings & Handover Table */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <Layers className="w-5 h-5 text-indigo-400" />
            <h3>All Club Bookings & Handover Operations</h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {(['ALL', 'ACTIVE', 'CHECKED_OUT', 'AT_RISK', 'COMPLETED'] as const).map((tab) => (
              <button
                key={tab}
                className={`btn btn-sm ${statusFilter === tab ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                onClick={() => setStatusFilter(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Club Name & ID</th>
                <th>Reserved Time Window</th>
                <th>Booking Status</th>
                <th style={{ textAlign: 'right' }}>Handover Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    No bookings found matching filter.
                  </td>
                </tr>
              ) : (
                filteredBookings.map((b) => {
                  const isReservedOrRisk = b.status === 'RESERVED' || b.status === 'AT_RISK';
                  const isCheckedOut = b.status === 'CHECKED_OUT';

                  return (
                    <tr key={b.id} className="table-row">
                      <td style={{ fontWeight: 600 }}>
                        <div>{b.club.name}</div>
                        <div className="mono-text" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          ID: {b.id.slice(0, 8)}
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
                      <td>{renderBookingStatusBadge(b.status)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          {isReservedOrRisk && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => setCheckoutBooking(b)}
                              id={`checkout-btn-${b.id.slice(0, 8)}`}
                            >
                              <ShieldCheck className="w-3.5 h-3.5" /> Check Out
                            </button>
                          )}

                          {isCheckedOut && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setReturnBooking(b)}
                              id={`return-btn-${b.id.slice(0, 8)}`}
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Return & Inspect
                            </button>
                          )}

                          {isReservedOrRisk && (
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleCancelAtRisk(b.id)}
                              id={`cancel-btn-${b.id.slice(0, 8)}`}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {checkoutBooking && kit && (
        <CheckoutModal
          booking={checkoutBooking}
          kitItems={kit.items.filter((i) => i.state !== 'REPLACED')}
          onClose={() => setCheckoutBooking(null)}
          onSuccess={loadData}
        />
      )}

      {returnBooking && kit && (
        <ReturnModal
          booking={returnBooking}
          kitItems={kit.items.filter((i) => i.state !== 'REPLACED')}
          onClose={() => setReturnBooking(null)}
          onSuccess={loadData}
        />
      )}

      {recoverDisruption && (
        <RecoverModal
          disruption={recoverDisruption}
          onClose={() => setRecoverDisruption(null)}
          onSuccess={loadData}
        />
      )}

      {replaceDisruption && (
        <ReplaceModal
          disruption={replaceDisruption}
          onClose={() => setReplaceDisruption(null)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
};
