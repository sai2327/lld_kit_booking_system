import React, { useState } from 'react';
import { Booking, KitItem, api } from '../services/api.js';
import { X, AlertTriangle, ShieldCheck } from 'lucide-react';

interface CheckoutModalProps {
  booking: Booking;
  kitItems: KitItem[];
  onClose: () => void;
  onSuccess: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  booking,
  kitItems,
  onClose,
  onSuccess,
}) => {
  const [conditions, setConditions] = useState<Record<string, 'USABLE' | 'DAMAGED' | 'MISSING'>>(() => {
    const initial: Record<string, 'USABLE' | 'DAMAGED' | 'MISSING'> = {};
    for (const item of kitItems) {
      initial[item.id] = 'USABLE';
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
      await api.checkout(booking.id, conditions);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Checkout failed');
    } finally {
      setLoading(false);
    }
  };

  const hasUnusableItem = Object.values(conditions).some((c) => c !== 'USABLE');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h3>Kit Handover & Checkout Verification</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Booking: <span className="mono-text">{booking.club.name}</span>
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
              Requirement R3 Guard: All 3 physical items must be verified present and USABLE before handover.
            </p>

            {kitItems.map((item) => (
              <div key={item.id} className="equipment-item-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <strong>{item.type}</strong>
                    <div className="mono-text" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      SN: {item.serialNumber}
                    </div>
                  </div>
                  <div style={{ minWidth: '140px' }}>
                    <select
                      className="form-select"
                      style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                      value={conditions[item.id] || 'USABLE'}
                      onChange={(e) =>
                        setConditions((prev) => ({
                          ...prev,
                          [item.id]: e.target.value as any,
                        }))
                      }
                    >
                      <option value="USABLE">✅ USABLE</option>
                      <option value="DAMAGED">⚠️ DAMAGED</option>
                      <option value="MISSING">❌ MISSING</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {hasUnusableItem && (
            <div className="banner-alert warning" style={{ marginBottom: '1rem' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <div style={{ fontSize: '0.8rem' }}>
                Handover guard will block checkout if any item is DAMAGED or MISSING.
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
              disabled={loading || hasUnusableItem}
              id="confirm-checkout-btn"
            >
              <ShieldCheck className="w-4 h-4" />
              {loading ? 'Processing Handover...' : 'Authorize Checkout & Handover'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
