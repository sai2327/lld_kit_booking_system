import React, { useState } from 'react';
import { Booking, KitItem, api } from '../services/api.js';
import { X, AlertTriangle, CheckSquare } from 'lucide-react';

interface ReturnModalProps {
  booking: Booking;
  kitItems: KitItem[];
  onClose: () => void;
  onSuccess: () => void;
}

export const ReturnModal: React.FC<ReturnModalProps> = ({
  booking,
  kitItems,
  onClose,
  onSuccess,
}) => {
  const [observations, setObservations] = useState<
    Record<
      string,
      {
        returned: boolean;
        condition: 'USABLE' | 'DAMAGED' | 'MISSING';
        result: 'PASS' | 'DAMAGED' | 'MISSING';
        note: string;
      }
    >
  >(() => {
    const initial: any = {};
    for (const item of kitItems) {
      initial[item.id] = {
        returned: true,
        condition: 'USABLE',
        result: 'PASS',
        note: 'Returned in good working condition',
      };
    }
    return initial;
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await api.returnAndInspect(booking.id, observations);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Return recording failed');
    } finally {
      setLoading(false);
    }
  };

  const hasIssues = Object.values(observations).some(
    (o) => !o.returned || o.result !== 'PASS'
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '650px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h3>Item-by-Item Return & Inspection</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Reconciliation for <span className="mono-text">{booking.club.name}</span>
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="banner-alert danger">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div style={{ fontSize: '0.875rem' }}>{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Requirement R3 & R4: Inspect each item physically. If an item is missing or damaged, an automatic disruption warning will be generated for the next at-risk booking.
            </p>

            {kitItems.map((item) => {
              const obs = observations[item.id] || {
                returned: true,
                condition: 'USABLE',
                result: 'PASS',
                note: '',
              };

              return (
                <div key={item.id} className="equipment-item-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <strong>{item.type}</strong>
                      <div className="mono-text" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        SN: {item.serialNumber}
                      </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                      <input
                        type="checkbox"
                        checked={obs.returned}
                        onChange={(e) => {
                          const ret = e.target.checked;
                          setObservations((prev) => ({
                            ...prev,
                            [item.id]: {
                              ...prev[item.id],
                              returned: ret,
                              condition: ret ? 'USABLE' : 'MISSING',
                              result: ret ? 'PASS' : 'MISSING',
                              note: ret ? 'Present' : 'Not physically returned',
                            },
                          }));
                        }}
                      />
                      Physically Present
                    </label>
                  </div>

                  {obs.returned ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Inspection Outcome</span>
                        <select
                          className="form-select"
                          style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                          value={obs.result}
                          onChange={(e) => {
                            const val = e.target.value as any;
                            setObservations((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...prev[item.id],
                                result: val,
                                condition: val === 'PASS' ? 'USABLE' : 'DAMAGED',
                              },
                            }));
                          }}
                        >
                          <option value="PASS">✅ Inspection Passed (USABLE)</option>
                          <option value="DAMAGED">⚠️ Damaged / Needs Repair</option>
                        </select>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Notes</span>
                        <input
                          type="text"
                          className="form-input"
                          style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                          placeholder="e.g. Lens clean, audio tested"
                          value={obs.note}
                          onChange={(e) =>
                            setObservations((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...prev[item.id],
                                note: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="banner-alert danger" style={{ margin: 0, padding: '0.5rem 0.75rem' }}>
                      <span style={{ fontSize: '0.75rem' }}>Item marked MISSING. Will trigger disruption.</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {hasIssues && (
            <div className="banner-alert warning" style={{ marginBottom: '1rem' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <div style={{ fontSize: '0.8rem' }}>
                Disruption Alert: Missing or damaged items will automatically mark the next scheduled booking AT_RISK and deliver warnings.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              id="confirm-return-btn"
            >
              <CheckSquare className="w-4 h-4" />
              {loading ? 'Submitting Inspection...' : 'Finalize Return & Inspection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
