'use client';

import { useCallback, useEffect, useState } from 'react';

const STATUS_LABELS = {
  pending: 'REQUESTING FUEL',
  approved: 'Approved – Awaiting Receipt',
  receipt_submitted: 'Receipt Submitted',
  rejected: 'Rejected'
};

const STATUS_COLORS = {
  pending: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  approved: { bg: '#dcfce7', text: '#14532d', border: '#86efac' },
  receipt_submitted: { bg: '#f0fdf4', text: '#15803d', border: '#4ade80' },
  rejected: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' }
};

const TRANSFER_METHODS = ['Zelle', 'Bank Wire', 'Cash', 'Check', 'Venmo', 'CashApp', 'Other'];

export default function FuelRequestsWorkspace() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');
  const [approving, setApproving] = useState(null); // request being approved
  const [approvalForm, setApprovalForm] = useState({
    approvedAmount: '',
    transferMethod: 'Zelle',
    transferReference: '',
    transferNotes: ''
  });
  const [approvalError, setApprovalError] = useState('');
  const [approvalSuccess, setApprovalSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/fuel-requests?status=${encodeURIComponent(filter)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Load failed.');
      setRequests(Array.isArray(data.rows) ? data.rows : []);
    } catch (err) {
      setError(err?.message || 'Unable to load fuel requests.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 30 seconds when viewing pending
  useEffect(() => {
    if (filter !== 'pending') return;
    const id = setInterval(() => { void load(); }, 30000);
    return () => clearInterval(id);
  }, [filter, load]);

  const openApprove = (request) => {
    setApproving(request);
    setApprovalForm({ approvedAmount: '', transferMethod: 'Zelle', transferReference: '', transferNotes: '' });
    setApprovalError('');
    setApprovalSuccess('');
  };

  const handleApprove = async () => {
    if (!approving) return;
    setApprovalError('');
    setApprovalSuccess('');
    const amount = parseFloat(approvalForm.approvedAmount);
    if (!approvalForm.approvedAmount || isNaN(amount) || amount <= 0) {
      setApprovalError('Enter the amount sent to the driver.');
      return;
    }
    if (!approvalForm.transferMethod) {
      setApprovalError('Select the transfer method.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/fuel-requests/${encodeURIComponent(approving.id)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvedAmount: amount,
          transferMethod: approvalForm.transferMethod,
          transferReference: approvalForm.transferReference.trim(),
          transferNotes: approvalForm.transferNotes.trim()
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Unable to approve.');
      setApprovalSuccess(`Approved! ${approving.driverName} will be notified.`);
      setApproving(null);
      await load();
    } catch (err) {
      setApprovalError(err?.message || 'Unable to approve. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>⛽ Fuel Requests</h1>
          <p style={styles.pageSubtitle}>Drivers request fuel → you approve + send funds → driver submits receipt to Genius</p>
        </div>
        <button style={styles.refreshBtn} onClick={load}>↻ Refresh</button>
      </div>

      {/* Filter tabs */}
      <div style={styles.tabRow}>
        {['pending', 'approved', 'receipt_submitted'].map(s => (
          <button
            key={s}
            style={{ ...styles.tab, ...(filter === s ? styles.tabActive : {}) }}
            onClick={() => setFilter(s)}
          >
            {STATUS_LABELS[s]}
            {s === 'pending' && pendingCount > 0 && filter !== 'pending' ? (
              <span style={styles.badge}>{pendingCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && <div style={styles.alertDanger}>{error}</div>}

      {/* Loading */}
      {loading && <div style={styles.loadingText}>Loading...</div>}

      {/* Empty */}
      {!loading && requests.length === 0 && (
        <div style={styles.emptyState}>No fuel requests with status "{filter}".</div>
      )}

      {/* Request cards */}
      {!loading && requests.map(req => {
        const colors = STATUS_COLORS[req.status] || STATUS_COLORS.pending;
        return (
          <div key={req.id} style={{ ...styles.card, borderColor: colors.border }}>
            <div style={styles.cardTop}>
              <div>
                <div style={styles.driverName}>{req.driverName || req.driverId}</div>
                <div style={styles.requestedAt}>
                  Requested {new Date(req.requestedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </div>
              <span style={{ ...styles.statusPill, backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}>
                {STATUS_LABELS[req.status] || req.status}
              </span>
            </div>

            {/* Approval details if approved */}
            {(req.status === 'approved' || req.status === 'receipt_submitted') && (
              <div style={styles.approvalInfo}>
                {req.approvedAmount != null && (
                  <span style={styles.infoChip}>💵 ${Number(req.approvedAmount).toFixed(2)}</span>
                )}
                {req.transferMethod && (
                  <span style={styles.infoChip}>🏦 {req.transferMethod}</span>
                )}
                {req.transferReference && (
                  <span style={styles.infoChip}>🔖 {req.transferReference}</span>
                )}
                {req.approvedByUser && (
                  <span style={styles.infoChip}>👤 Approved by {req.approvedByUser}</span>
                )}
              </div>
            )}

            {/* Receipt submitted */}
            {req.status === 'receipt_submitted' && (
              <div style={styles.receiptRow}>
                {req.receiptImageUrl && (
                  <a href={req.receiptImageUrl} target="_blank" rel="noreferrer">
                    <img
                      src={req.receiptImageUrl}
                      alt="Receipt"
                      style={styles.receiptThumb}
                    />
                  </a>
                )}
                <div style={styles.receiptMeta}>
                  {req.gallons != null && <div>⛽ {Number(req.gallons).toFixed(3)} gal</div>}
                  {req.vehicleMileage != null && <div>🛣 {Number(req.vehicleMileage).toFixed(1)} mi</div>}
                  {req.receiptSubmittedAt && (
                    <div style={{ color: '#6b7280', fontSize: 12 }}>
                      Submitted {new Date(req.receiptSubmittedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Approve button for pending */}
            {req.status === 'pending' && (
              <button
                style={styles.approveBtn}
                onClick={() => openApprove(req)}
              >
                ✅  Approve &amp; Send Funds
              </button>
            )}
          </div>
        );
      })}

      {/* Approval modal */}
      {approving && (
        <div style={styles.modalOverlay} onClick={() => setApproving(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Approve Fuel Request</h2>
            <p style={styles.modalDriver}>Driver: <strong>{approving.driverName || approving.driverId}</strong></p>

            <label style={styles.modalLabel}>Amount Sent ($) *</label>
            <input
              style={styles.modalInput}
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 120.00"
              value={approvalForm.approvedAmount}
              onChange={e => setApprovalForm(f => ({ ...f, approvedAmount: e.target.value }))}
            />

            <label style={styles.modalLabel}>Transfer Method *</label>
            <select
              style={styles.modalInput}
              value={approvalForm.transferMethod}
              onChange={e => setApprovalForm(f => ({ ...f, transferMethod: e.target.value }))}
            >
              {TRANSFER_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>

            <label style={styles.modalLabel}>Reference / Confirmation # (optional)</label>
            <input
              style={styles.modalInput}
              type="text"
              placeholder="Zelle confirmation, wire ref, etc."
              value={approvalForm.transferReference}
              onChange={e => setApprovalForm(f => ({ ...f, transferReference: e.target.value }))}
            />

            <label style={styles.modalLabel}>Notes for driver (optional)</label>
            <textarea
              style={{ ...styles.modalInput, minHeight: 60, resize: 'vertical' }}
              placeholder="e.g. Check Zelle at 3pm"
              value={approvalForm.transferNotes}
              onChange={e => setApprovalForm(f => ({ ...f, transferNotes: e.target.value }))}
            />

            {approvalError && <div style={styles.alertDanger}>{approvalError}</div>}
            {approvalSuccess && <div style={styles.alertSuccess}>{approvalSuccess}</div>}

            <div style={styles.modalButtons}>
              <button style={styles.cancelBtn} onClick={() => setApproving(null)}>Cancel</button>
              <button
                style={{ ...styles.confirmBtn, opacity: submitting ? 0.5 : 1 }}
                onClick={() => void handleApprove()}
                disabled={submitting}
              >
                {submitting ? 'Approving...' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { padding: '24px', maxWidth: '900px', margin: '0 auto', fontFamily: 'inherit' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  pageTitle: { margin: 0, fontSize: '24px', fontWeight: 800, color: '#111827' },
  pageSubtitle: { margin: '4px 0 0', fontSize: '14px', color: '#6b7280' },
  refreshBtn: { padding: '8px 16px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '14px' },

  tabRow: { display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' },
  tab: { padding: '8px 16px', borderRadius: '20px', border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#374151', position: 'relative' },
  tabActive: { background: '#111827', color: '#fff', borderColor: '#111827' },
  badge: { marginLeft: '6px', background: '#dc2626', color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '11px', fontWeight: 700 },

  loadingText: { padding: '32px', textAlign: 'center', color: '#6b7280' },
  emptyState: { padding: '40px', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', borderRadius: '12px', border: '1px dashed #d1d5db' },

  card: { background: '#fff', border: '1px solid', borderRadius: '12px', padding: '20px', marginBottom: '12px' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' },
  driverName: { fontSize: '18px', fontWeight: 800, color: '#111827', marginBottom: '2px' },
  requestedAt: { fontSize: '12px', color: '#9ca3af' },
  statusPill: { padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, border: '1px solid' },

  approvalInfo: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' },
  infoChip: { background: '#f3f4f6', borderRadius: '8px', padding: '4px 10px', fontSize: '13px', fontWeight: 600, color: '#374151' },

  receiptRow: { display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '12px' },
  receiptThumb: { width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb' },
  receiptMeta: { fontSize: '14px', color: '#374151', display: 'flex', flexDirection: 'column', gap: '4px' },

  approveBtn: { background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', marginTop: '4px' },

  alertDanger: { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px', color: '#991b1b', fontSize: '13px', marginBottom: '16px' },
  alertSuccess: { background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '12px', color: '#15803d', fontSize: '13px', marginBottom: '16px' },

  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  modal: { background: '#fff', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' },
  modalTitle: { margin: '0 0 4px', fontSize: '20px', fontWeight: 800, color: '#111827' },
  modalDriver: { margin: '0 0 20px', fontSize: '14px', color: '#6b7280' },
  modalLabel: { display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px', marginTop: '14px' },
  modalInput: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box', outline: 'none' },
  modalButtons: { display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' },
  cancelBtn: { padding: '10px 20px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '14px' },
  confirmBtn: { padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '14px' }
};
