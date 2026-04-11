'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const STATUS_LABELS = {
  all: 'All',
  pending: 'REQUESTING FUEL',
  approved: 'Approved - Awaiting Receipt',
  receipt_submitted: 'Receipt Submitted'
};

const STATUS_COLORS = {
  pending: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  approved: { bg: '#dcfce7', text: '#14532d', border: '#86efac' },
  receipt_submitted: { bg: '#f0fdf4', text: '#15803d', border: '#4ade80' },
  rejected: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' }
};

const TRANSFER_METHODS = ['Zelle', 'Bank Wire', 'Cash', 'Check', 'Venmo', 'CashApp', 'Other'];

const toDateTime = value => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

const toDriverKey = row => `${String(row?.driverId || '').trim()}|${String(row?.driverName || '').trim()}`;

export default function FuelRequestsWorkspace() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedDriverKey, setSelectedDriverKey] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [approving, setApproving] = useState(null);
  const [approvalForm, setApprovalForm] = useState({
    approvedAmount: '',
    transferMethod: 'Zelle',
    transferReference: '',
    transferNotes: ''
  });
  const [approvalError, setApprovalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = filter === 'all' ? '' : `?status=${encodeURIComponent(filter)}`;
      const res = await fetch(`/api/fuel-requests${query}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Load failed.');
      const nextRows = Array.isArray(data.rows) ? data.rows : [];
      setRows(nextRows);
    } catch (err) {
      setError(err?.message || 'Unable to load fuel requests.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const id = setInterval(() => { void load(); }, 30000);
    return () => clearInterval(id);
  }, [load]);

  const drivers = useMemo(() => {
    const map = new Map();
    rows.forEach(row => {
      const key = toDriverKey(row);
      const current = map.get(key) || {
        key,
        driverId: row.driverId || '',
        driverName: row.driverName || row.driverId || 'Unknown driver',
        vehicleLabel: row.vehicleLabel || '',
        vehicleType: row.vehicleType || '',
        requests: []
      };
      current.requests.push(row);
      if (!current.vehicleLabel && row.vehicleLabel) current.vehicleLabel = row.vehicleLabel;
      if (!current.vehicleType && row.vehicleType) current.vehicleType = row.vehicleType;
      map.set(key, current);
    });

    return Array.from(map.values()).map(driver => ({
      ...driver,
      requests: [...driver.requests].sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0))
    })).sort((a, b) => new Date(b.requests[0]?.requestedAt || 0) - new Date(a.requests[0]?.requestedAt || 0));
  }, [rows]);

  useEffect(() => {
    if (!drivers.length) {
      setSelectedDriverKey('');
      setSelectedRequestId('');
      return;
    }

    if (!selectedDriverKey || !drivers.some(driver => driver.key === selectedDriverKey)) {
      const firstKey = drivers[0].key;
      setSelectedDriverKey(firstKey);
      setSelectedRequestId(drivers[0].requests[0]?.id || '');
      return;
    }

    const selectedDriver = drivers.find(driver => driver.key === selectedDriverKey);
    if (selectedDriver && (!selectedRequestId || !selectedDriver.requests.some(request => request.id === selectedRequestId))) {
      setSelectedRequestId(selectedDriver.requests[0]?.id || '');
    }
  }, [drivers, selectedDriverKey, selectedRequestId]);

  const selectedDriver = drivers.find(driver => driver.key === selectedDriverKey) || null;
  const selectedRequest = selectedDriver?.requests.find(request => request.id === selectedRequestId)
    || selectedDriver?.requests[0]
    || null;

  const openApprove = request => {
    setApproving(request);
    setApprovalForm({ approvedAmount: '', transferMethod: 'Zelle', transferReference: '', transferNotes: '' });
    setApprovalError('');
  };

  const handleApprove = async () => {
    if (!approving) return;
    setApprovalError('');
    const amount = parseFloat(approvalForm.approvedAmount);
    if (!approvalForm.approvedAmount || Number.isNaN(amount) || amount <= 0) {
      setApprovalError('Enter the amount sent to the driver.');
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
      setApproving(null);
      await load();
    } catch (err) {
      setApprovalError(err?.message || 'Unable to approve. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = rows.filter(row => row.status === 'pending').length;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>⛽ Fuel Requests</h1>
          <p style={styles.pageSubtitle}>Left: drivers + vehicle. Right: all fuel request dates and receipt details.</p>
        </div>
        <button style={styles.refreshBtn} onClick={load}>Refresh</button>
      </div>

      <div style={styles.tabRow}>
        {['all', 'pending', 'approved', 'receipt_submitted'].map(statusKey => (
          <button
            key={statusKey}
            style={{ ...styles.tab, ...(filter === statusKey ? styles.tabActive : {}) }}
            onClick={() => setFilter(statusKey)}
          >
            {STATUS_LABELS[statusKey]}
            {statusKey === 'pending' && pendingCount > 0 ? <span style={styles.badge}>{pendingCount}</span> : null}
          </button>
        ))}
      </div>

      {error ? <div style={styles.alertDanger}>{error}</div> : null}
      {loading ? <div style={styles.loading}>Loading fuel requests...</div> : null}

      {!loading && (
        <div style={styles.layout}>
          <aside style={styles.leftPane}>
            <div style={styles.leftTitle}>Drivers ({drivers.length})</div>
            {!drivers.length ? <div style={styles.emptyText}>No drivers in this filter.</div> : null}
            {drivers.map(driver => {
              const active = selectedDriverKey === driver.key;
              return (
                <button
                  key={driver.key}
                  style={{ ...styles.driverBtn, ...(active ? styles.driverBtnActive : {}) }}
                  onClick={() => {
                    setSelectedDriverKey(driver.key);
                    setSelectedRequestId(driver.requests[0]?.id || '');
                  }}
                >
                  <div style={styles.driverName}>{driver.driverName}</div>
                  <div style={styles.driverMeta}>{driver.vehicleLabel || 'No vehicle assigned'}</div>
                  <div style={styles.driverMeta}>{driver.vehicleType || 'Vehicle type: -'}</div>
                </button>
              );
            })}
          </aside>

          <section style={styles.rightPane}>
            {!selectedDriver ? (
              <div style={styles.emptyText}>Select a driver on the left.</div>
            ) : (
              <>
                <div style={styles.rightHeader}>
                  <div>
                    <h2 style={styles.driverHeaderName}>{selectedDriver.driverName}</h2>
                    <div style={styles.driverHeaderMeta}>
                      Vehicle: {selectedDriver.vehicleLabel || '-'} | Type: {selectedDriver.vehicleType || '-'}
                    </div>
                  </div>
                </div>

                <div style={styles.datesWrap}>
                  {selectedDriver.requests.map(request => (
                    <button
                      key={request.id}
                      style={{ ...styles.dateBtn, ...(selectedRequest?.id === request.id ? styles.dateBtnActive : {}) }}
                      onClick={() => setSelectedRequestId(request.id)}
                    >
                      {toDateTime(request.requestedAt)}
                    </button>
                  ))}
                </div>

                {selectedRequest ? (
                  <div style={styles.detailCard}>
                    <div style={styles.detailTop}>
                      <span style={{ ...styles.statusPill, ...(STATUS_COLORS[selectedRequest.status] || STATUS_COLORS.pending) }}>
                        {STATUS_LABELS[selectedRequest.status] || selectedRequest.status}
                      </span>
                      <span style={styles.detailTime}>Requested: {toDateTime(selectedRequest.requestedAt)}</span>
                    </div>

                    <div style={styles.detailGrid}>
                      <div><strong>Approved by:</strong> {selectedRequest.approvedByUser || '-'}</div>
                      <div><strong>Approved amount:</strong> {selectedRequest.approvedAmount != null ? `$${Number(selectedRequest.approvedAmount).toFixed(2)}` : '-'}</div>
                      <div><strong>Transfer method:</strong> {selectedRequest.transferMethod || '-'}</div>
                      <div><strong>Transfer reference:</strong> {selectedRequest.transferReference || '-'}</div>
                      <div><strong>Receipt submitted:</strong> {toDateTime(selectedRequest.receiptSubmittedAt)}</div>
                      <div><strong>Gallons:</strong> {selectedRequest.gallons != null ? Number(selectedRequest.gallons).toFixed(3) : '-'}</div>
                      <div><strong>Mileage:</strong> {selectedRequest.vehicleMileage != null ? Number(selectedRequest.vehicleMileage).toFixed(1) : '-'}</div>
                      <div><strong>Car:</strong> {selectedDriver.vehicleLabel || '-'}</div>
                    </div>

                    {selectedRequest.transferNotes ? (
                      <div style={styles.notesBox}><strong>Notes:</strong> {selectedRequest.transferNotes}</div>
                    ) : null}

                    {selectedRequest.receiptImageUrl ? (
                      <a href={selectedRequest.receiptImageUrl} target="_blank" rel="noreferrer" style={styles.imageLink}>
                        <img src={selectedRequest.receiptImageUrl} alt="Receipt" style={styles.receiptImage} />
                      </a>
                    ) : null}

                    {selectedRequest.status === 'pending' ? (
                      <button style={styles.approveBtn} onClick={() => openApprove(selectedRequest)}>Approve This Request</button>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      )}

      {approving ? (
        <div style={styles.modalOverlay} onClick={() => setApproving(null)}>
          <div style={styles.modal} onClick={event => event.stopPropagation()}>
            <h3 style={styles.modalTitle}>Approve Fuel Request</h3>
            <div style={styles.modalDriver}>{approving.driverName || approving.driverId}</div>

            <label style={styles.modalLabel}>Amount sent ($)</label>
            <input
              style={styles.modalInput}
              type="number"
              step="0.01"
              value={approvalForm.approvedAmount}
              onChange={event => setApprovalForm(current => ({ ...current, approvedAmount: event.target.value }))}
            />

            <label style={styles.modalLabel}>Transfer method</label>
            <select
              style={styles.modalInput}
              value={approvalForm.transferMethod}
              onChange={event => setApprovalForm(current => ({ ...current, transferMethod: event.target.value }))}
            >
              {TRANSFER_METHODS.map(method => <option key={method} value={method}>{method}</option>)}
            </select>

            <label style={styles.modalLabel}>Reference</label>
            <input
              style={styles.modalInput}
              value={approvalForm.transferReference}
              onChange={event => setApprovalForm(current => ({ ...current, transferReference: event.target.value }))}
            />

            <label style={styles.modalLabel}>Notes</label>
            <textarea
              style={{ ...styles.modalInput, minHeight: 72, resize: 'vertical' }}
              value={approvalForm.transferNotes}
              onChange={event => setApprovalForm(current => ({ ...current, transferNotes: event.target.value }))}
            />

            {approvalError ? <div style={styles.alertDanger}>{approvalError}</div> : null}

            <div style={styles.modalButtons}>
              <button style={styles.cancelBtn} onClick={() => setApproving(null)}>Cancel</button>
              <button style={styles.confirmBtn} onClick={() => void handleApprove()} disabled={submitting}>
                {submitting ? 'Approving...' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  page: { padding: 24 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  pageTitle: { margin: 0, fontSize: 34, fontWeight: 800, color: '#111827' },
  pageSubtitle: { margin: '4px 0 0', color: '#6b7280', fontSize: 14 },
  refreshBtn: { border: '1px solid #d1d5db', background: '#fff', borderRadius: 10, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' },

  tabRow: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  tab: { border: '1px solid #d1d5db', background: '#fff', borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  tabActive: { background: '#111827', color: '#fff', borderColor: '#111827' },
  badge: { marginLeft: 8, background: '#dc2626', color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, padding: '1px 7px' },

  alertDanger: { marginTop: 8, marginBottom: 8, padding: 12, borderRadius: 10, border: '1px solid #fca5a5', background: '#fef2f2', color: '#991b1b', fontSize: 13 },
  loading: { padding: 18, color: '#6b7280' },

  layout: { display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14, minHeight: 520 },
  leftPane: { border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 10, overflow: 'auto' },
  leftTitle: { fontSize: 14, fontWeight: 800, color: '#111827', marginBottom: 8 },
  driverBtn: { width: '100%', textAlign: 'left', border: '1px solid #e5e7eb', borderRadius: 10, background: '#f9fafb', padding: 10, marginBottom: 8, cursor: 'pointer' },
  driverBtnActive: { background: '#e0f2fe', borderColor: '#38bdf8' },
  driverName: { fontSize: 14, fontWeight: 800, color: '#111827' },
  driverMeta: { fontSize: 12, color: '#4b5563', marginTop: 2 },

  rightPane: { border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 14, overflow: 'auto' },
  rightHeader: { marginBottom: 10 },
  driverHeaderName: { margin: 0, fontSize: 22, fontWeight: 800, color: '#111827' },
  driverHeaderMeta: { color: '#4b5563', fontSize: 13, marginTop: 2 },

  datesWrap: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  dateBtn: { border: '1px solid #d1d5db', background: '#fff', borderRadius: 999, padding: '6px 12px', fontSize: 12, cursor: 'pointer' },
  dateBtnActive: { background: '#111827', color: '#fff', borderColor: '#111827' },

  detailCard: { border: '1px solid #e5e7eb', borderRadius: 12, background: '#f9fafb', padding: 12 },
  detailTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  statusPill: { border: '1px solid', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 },
  detailTime: { fontSize: 12, color: '#6b7280' },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 8, fontSize: 13, color: '#1f2937', marginBottom: 10 },
  notesBox: { border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, background: '#fff', fontSize: 13, marginBottom: 10 },
  imageLink: { display: 'inline-block', marginBottom: 10 },
  receiptImage: { width: 180, height: 180, objectFit: 'cover', borderRadius: 10, border: '1px solid #d1d5db' },
  approveBtn: { border: 'none', background: '#16a34a', color: '#fff', borderRadius: 8, padding: '10px 14px', fontWeight: 700, cursor: 'pointer' },

  emptyText: { color: '#6b7280', fontSize: 13, padding: 12 },

  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  modal: { width: '100%', maxWidth: 480, background: '#fff', borderRadius: 12, padding: 18, boxShadow: '0 18px 40px rgba(0,0,0,0.2)' },
  modalTitle: { margin: 0, fontSize: 20, fontWeight: 800, color: '#111827' },
  modalDriver: { marginTop: 4, marginBottom: 8, fontSize: 13, color: '#6b7280' },
  modalLabel: { display: 'block', marginTop: 10, marginBottom: 4, fontSize: 12, fontWeight: 700, color: '#374151' },
  modalInput: { width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 10px', fontSize: 14 },
  modalButtons: { marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 },
  cancelBtn: { border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' },
  confirmBtn: { border: 'none', background: '#16a34a', color: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontWeight: 700 }
};
