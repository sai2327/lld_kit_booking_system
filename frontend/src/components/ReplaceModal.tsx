import React, { useState } from 'react';
import { Disruption, api } from '../services/api.js';
import { X, AlertTriangle, PlusCircle } from 'lucide-react';

interface ReplaceModalProps {
  disruption: Disruption;
  onClose: () => void;
  onSuccess: () => void;
}

export const ReplaceModal: React.FC<ReplaceModalProps> = ({
  disruption,
  onClose,
  onSuccess,
}) => {
  const affectedItemIds: string[] = JSON.parse(disruption.affectedItemIds || '[]');
  const [selectedOldItemId, setSelectedOldItemId] = useState<string>(affectedItemIds[0] || '');
  const [serialNumber, setSerialNumber] = useState('');
  const [conditionNote, setConditionNote] = useState('Brand new replacement unit');
  const [initialInspectionResult, setInitialInspectionResult] = useState<'PASS' | 'DAMAGED'>('PASS');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serialNumber.trim()) {
      setError('Serial number is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.replaceItem(
        disruption.id,
        selectedOldItemId,
        serialNumber.trim(),
        conditionNote.trim(),
        initialInspectionResult
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Replacement failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h3>Register Replacement Equipment</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Disruption ID: <span className="mono-text">{disruption.id.slice(0, 8)}</span>
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
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Requirement R5: The old item transitions to terminal state REPLACED. The replacement item enters inventory and must pass inspection to become AVAILABLE.
          </p>

          <div className="form-group">
            <label className="form-label">Item Being Replaced</label>
            <select
              className="form-select"
              value={selectedOldItemId}
              onChange={(e) => setSelectedOldItemId(e.target.value)}
            >
              {affectedItemIds.map((id) => (
                <option key={id} value={id}>
                  Item ID: {id}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Replacement Serial Number</label>
            <input
              type="text"
              className="form-input"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="e.g. TRI-MANFROTTO-PRO-02"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Condition & Model Details</label>
            <input
              type="text"
              className="form-input"
              value={conditionNote}
              onChange={(e) => setConditionNote(e.target.value)}
              placeholder="e.g. Brand new replacement unit in sealed packaging"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Initial Inspection Result</label>
            <select
              className="form-select"
              value={initialInspectionResult}
              onChange={(e) => setInitialInspectionResult(e.target.value as any)}
            >
              <option value="PASS">✅ PASS (Verified operational & restores kit)</option>
              <option value="DAMAGED">⚠️ DAMAGED (Failed initial verification)</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              id="confirm-replace-btn"
            >
              <PlusCircle className="w-4 h-4" />
              {loading ? 'Adding Replacement...' : 'Register & Inspect Replacement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
