import React, { useState } from 'react';
import { Disruption, api } from '../services/api.js';
import { X, AlertTriangle, RotateCcw } from 'lucide-react';

interface RecoverModalProps {
  disruption: Disruption;
  onClose: () => void;
  onSuccess: () => void;
}

export const RecoverModal: React.FC<RecoverModalProps> = ({
  disruption,
  onClose,
  onSuccess,
}) => {
  const affectedItemIds: string[] = JSON.parse(disruption.affectedItemIds || '[]');
  const [selectedItemId, setSelectedItemId] = useState<string>(affectedItemIds[0] || '');
  const [inspectionResult, setInspectionResult] = useState<'PASS' | 'DAMAGED' | 'MISSING'>('PASS');
  const [note, setNote] = useState('Item recovered and physically tested');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) {
      setError('Please select an item to recover');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.recoverItem(disruption.id, selectedItemId, inspectionResult, note);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Recovery failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h3>Record Physical Equipment Recovery</h3>
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
            Requirement R5: Recovered equipment must pass physical inspection before it becomes available and restores the kit.
          </p>

          <div className="form-group">
            <label className="form-label">Select Recovered Item ID</label>
            <select
              className="form-select"
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
            >
              {affectedItemIds.map((id) => (
                <option key={id} value={id}>
                  Item ID: {id}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Inspection Outcome</label>
            <select
              className="form-select"
              value={inspectionResult}
              onChange={(e) => setInspectionResult(e.target.value as any)}
            >
              <option value="PASS">✅ Inspection PASS (Restores item to AVAILABLE)</option>
              <option value="DAMAGED">⚠️ Inspection DAMAGED (Item remains unusable)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Inspection & Recovery Notes</label>
            <input
              type="text"
              className="form-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Returned by student; fully functional"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              id="confirm-recover-btn"
            >
              <RotateCcw className="w-4 h-4" />
              {loading ? 'Processing Recovery...' : 'Record Recovery & Inspection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
