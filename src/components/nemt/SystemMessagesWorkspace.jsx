'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Table } from 'react-bootstrap';

const PRIORITY_VARIANT = { high: 'danger', normal: 'warning', low: 'secondary' };
const STATUS_VARIANT = { active: 'warning', resolved: 'success' };

const formatDate = iso => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

const SystemMessagesWorkspace = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningCheck, setRunningCheck] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [filter, setFilter] = useState('active'); // 'active' | 'all'
  const [selectedDriverId, setSelectedDriverId] = useState(null); // null = all drivers

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/system-messages');
      if (!res.ok) return;
      const data = await res.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 60000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  const handleResolve = async id => {
    try {
      const res = await fetch('/api/system-messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'resolve' })
      });
      if (res.ok) await fetchMessages();
    } catch { /* silent */ }
  };

  const handleResolveAllByDriver = async driverId => {
    try {
      const res = await fetch('/api/system-messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: driverId, action: 'resolve-by-driver' })
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      }
    } catch { /* silent */ }
  };

  const handleReactivateAllByDriver = async driverId => {
    try {
      const res = await fetch('/api/system-messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: driverId, action: 'reactivate-by-driver' })
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      }
    } catch { /* silent */ }
  };

  const handleRunCheck = async () => {
    setRunningCheck(true);
    setCheckResult(null);
    try {
      const res = await fetch('/api/cron/license-check');
      const data = await res.json();
      setCheckResult(data);
      await fetchMessages();
    } catch {
      setCheckResult({ error: 'Request failed' });
    } finally {
      setRunningCheck(false);
    }
  };

  // Build driver list with counts from all messages
  const driverList = useMemo(() => {
    const map = new Map();
    messages.forEach(msg => {
      const key = msg.driverId || '';
      const name = msg.driverName || msg.audience || 'Unknown';
      if (!map.has(key)) {
        map.set(key, { driverId: key, name, active: 0, resolved: 0, total: 0 });
      }
      const entry = map.get(key);
      entry.total += 1;
      if (msg.status === 'active') entry.active += 1;
      else entry.resolved += 1;
    });
    return Array.from(map.values()).sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
  }, [messages]);

  const activeMessages = messages.filter(m => m.status === 'active');
  const countActive = activeMessages.length;
  const countDriverAlerts = messages.filter(m => m.audience === 'Driver' && m.status === 'active').length;
  const countHigh = messages.filter(m => m.priority === 'high' && m.status === 'active').length;
  const countResolved = messages.filter(m => m.status === 'resolved').length;

  // Filter by driver and status
  const displayed = messages.filter(m => {
    const matchDriver = selectedDriverId === null || (m.driverId || '') === selectedDriverId;
    const matchStatus = filter === 'all' || m.status === 'active';
    return matchDriver && matchStatus;
  });

  const selectedDriver = selectedDriverId !== null ? driverList.find(d => d.driverId === selectedDriverId) : null;

  const surface = { bg: '#141420', border: '#2a2a3e', header: '#1a1a2e', text: '#ddd', muted: '#888', dimmer: '#555' };

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ margin: 0 }}>System Messages</h4>
        <p style={{ color: surface.muted, marginTop: 4, marginBottom: 0, fontSize: 13 }}>
          Internal messages, operational alerts and notices ready for review.
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Active', value: countActive, color: '#f39c12' },
          { label: 'Driver Alerts', value: countDriverAlerts, color: '#e74c3c' },
          { label: 'High Priority', value: countHigh, color: '#c0392b' },
          { label: 'Resolved', value: countResolved, color: '#27ae60' }
        ].map(s => (
          <Card key={s.label} style={{ flex: '1 1 140px', minWidth: 120, background: surface.header, border: `1px solid ${surface.border}` }}>
            <Card.Body style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            </Card.Body>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <Button size="sm" variant={filter === 'active' ? 'primary' : 'outline-secondary'} onClick={() => setFilter('active')}>Active</Button>
          <Button size="sm" variant={filter === 'all' ? 'primary' : 'outline-secondary'} onClick={() => setFilter('all')}>All</Button>
        </div>
        <Button size="sm" variant="outline-info" onClick={fetchMessages} disabled={loading}>
          {loading ? '...' : 'Refresh'}
        </Button>
        <Button size="sm" variant="warning" onClick={handleRunCheck} disabled={runningCheck} style={{ marginLeft: 'auto' }}>
          {runningCheck ? 'Checking...' : '🔍 Run License Check'}
        </Button>
      </div>

      {/* Check result summary */}
      {checkResult && (
        <div style={{
          background: checkResult.ok ? '#1a3a1a' : '#3a1a1a',
          border: `1px solid ${checkResult.ok ? '#27ae60' : '#e74c3c'}`,
          borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 13
        }}>
          {checkResult.ok ? (
            <>
              <span style={{ color: '#2ecc71' }}>
                ✓ Check complete — checked: <strong>{checkResult.checked}</strong>,
                created: <strong>{checkResult.created}</strong>,
                emailed: <strong>{checkResult.emailed}</strong>,
                resolved: <strong>{checkResult.resolved}</strong>
                {checkResult.errors?.length > 0 && (
                  <span style={{ color: '#e67e22' }}> | Errors: {checkResult.errors.join('; ')}</span>
                )}
              </span>
              {checkResult.driverSummary?.length > 0 && (
                <div style={{ marginTop: 10, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#ccc' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #2a4a2a' }}>
                        <th style={{ padding: '4px 10px', textAlign: 'left', color: '#aaa' }}>Driver</th>
                        <th style={{ padding: '4px 10px', textAlign: 'center', color: '#aaa' }}>Expiration Date</th>
                        <th style={{ padding: '4px 10px', textAlign: 'center', color: '#aaa' }}>Remaining Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checkResult.driverSummary.map((d, i) => {
                        const days = d.daysUntilExpiry;
                        const color = days === null ? '#666' : days <= 0 ? '#e74c3c' : days <= 7 ? '#e67e22' : days <= 30 ? '#f39c12' : '#2ecc71';
                        const label = days === null ? 'No date' : days <= 0 ? 'EXPIRED' : `${days} days`;
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #1a2e1a' }}>
                            <td style={{ padding: '4px 10px' }}>{d.name}</td>
                            <td style={{ padding: '4px 10px', textAlign: 'center', color: '#aaa' }}>{d.expirationDate || '—'}</td>
                            <td style={{ padding: '4px 10px', textAlign: 'center', fontWeight: 600, color }}>{label}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <span style={{ color: '#e74c3c' }}>Error: {checkResult.error || JSON.stringify(checkResult)}</span>
          )}
        </div>
      )}

      {/* Main 2-column layout */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>

        {/* ── Left: Driver list ── */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <div style={{ background: surface.bg, border: `1px solid ${surface.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: surface.header, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
              Drivers
            </div>
            {/* "All" row */}
            <button
              type="button"
              onClick={() => setSelectedDriverId(null)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '10px 14px', background: selectedDriverId === null ? 'rgba(99,102,241,0.18)' : 'transparent',
                border: 'none', borderBottom: `1px solid ${surface.border}`, color: surface.text, cursor: 'pointer', textAlign: 'left'
              }}
            >
              <span style={{ fontWeight: selectedDriverId === null ? 700 : 400, fontSize: 13 }}>All drivers</span>
              <span style={{
                background: '#e67e22', color: '#fff', borderRadius: 999, minWidth: 20,
                height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, padding: '0 6px'
              }}>{countActive}</span>
            </button>
            {/* Per-driver rows */}
            {driverList.map(d => (
              <button
                key={d.driverId}
                type="button"
                onClick={() => setSelectedDriverId(d.driverId)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '10px 14px', background: selectedDriverId === d.driverId ? 'rgba(99,102,241,0.18)' : 'transparent',
                  border: 'none', borderBottom: `1px solid ${surface.border}`, color: surface.text, cursor: 'pointer', textAlign: 'left'
                }}
              >
                <span style={{ fontWeight: selectedDriverId === d.driverId ? 700 : 400, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
                  {d.name}
                </span>
                {d.active > 0 && (
                  <span style={{
                    background: '#e67e22', color: '#fff', borderRadius: 999, minWidth: 20,
                    height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, padding: '0 6px', flexShrink: 0
                  }}>{d.active}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Right: Messages table ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Selected driver actions */}
          {selectedDriver && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
              padding: '10px 14px', background: surface.header, border: `1px solid ${surface.border}`, borderRadius: 8, flexWrap: 'wrap'
            }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: surface.text, flex: 1 }}>
                {selectedDriver.name}
              </span>
              <span style={{ fontSize: 12, color: surface.muted }}>{selectedDriver.active} active · {selectedDriver.resolved} resolved</span>
              {selectedDriver.active > 0 && (
                <Button size="sm" variant="outline-success" style={{ fontSize: 11 }}
                  onClick={() => handleResolveAllByDriver(selectedDriver.driverId)}>
                  Resolve All
                </Button>
              )}
              {selectedDriver.resolved > 0 && (
                <Button size="sm" variant="outline-warning" style={{ fontSize: 11 }}
                  onClick={() => handleReactivateAllByDriver(selectedDriver.driverId)}>
                  Reset (Reactivate)
                </Button>
              )}
            </div>
          )}

          <Card style={{ background: surface.bg, border: `1px solid ${surface.border}` }}>
            <Table responsive hover style={{ marginBottom: 0, color: surface.text, fontSize: 13 }}>
              <thead style={{ background: surface.header }}>
                <tr>
                  <th style={{ padding: '10px 14px', color: '#aaa', fontWeight: 600 }}>Time</th>
                  <th style={{ padding: '10px 14px', color: '#aaa', fontWeight: 600 }}>Driver</th>
                  <th style={{ padding: '10px 14px', color: '#aaa', fontWeight: 600 }}>Subject</th>
                  <th style={{ padding: '10px 14px', color: '#aaa', fontWeight: 600 }}>Expires</th>
                  <th style={{ padding: '10px 14px', color: '#aaa', fontWeight: 600 }}>Last Email</th>
                  <th style={{ padding: '10px 14px', color: '#aaa', fontWeight: 600 }}>Emails Sent</th>
                  <th style={{ padding: '10px 14px', color: '#aaa', fontWeight: 600 }}>Priority</th>
                  <th style={{ padding: '10px 14px', color: '#aaa', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '10px 14px', color: '#aaa', fontWeight: 600 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: surface.dimmer }}>Loading...</td></tr>
                ) : displayed.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: surface.dimmer }}>
                    {filter === 'active' ? 'No active messages — all clear ✓' : 'No messages found'}
                  </td></tr>
                ) : (
                  displayed.map(msg => (
                    <tr key={msg.id} style={{ background: msg.status === 'resolved' ? 'transparent' : msg.priority === 'high' ? 'rgba(192,57,43,0.08)' : 'transparent' }}>
                      <td style={{ padding: '9px 14px', whiteSpace: 'nowrap', color: surface.muted }}>{formatDate(msg.createdAt)}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <div style={{ fontWeight: 600 }}>{msg.driverName || msg.audience}</div>
                        {msg.driverEmail && <div style={{ fontSize: 11, color: '#777' }}>{msg.driverEmail}</div>}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <div>{msg.subject}</div>
                        {msg.body && <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>{msg.body}</div>}
                      </td>
                      <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                        {msg.expirationDate
                          ? <span style={{ color: msg.daysUntilExpiry <= 0 ? '#e74c3c' : msg.daysUntilExpiry <= 7 ? '#e67e22' : surface.text }}>
                              {msg.expirationDate}
                              {msg.daysUntilExpiry !== null && (
                                <span style={{ fontSize: 11, marginLeft: 6 }}>
                                  ({msg.daysUntilExpiry <= 0 ? 'EXPIRED' : `${msg.daysUntilExpiry}d`})
                                </span>
                              )}
                            </span>
                          : '—'}
                      </td>
                      <td style={{ padding: '9px 14px', whiteSpace: 'nowrap', color: surface.muted, fontSize: 12 }}>
                        {msg.lastEmailSentAt ? formatDate(msg.lastEmailSentAt) : '—'}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                        <Badge bg={msg.emailSentCount > 0 ? 'info' : 'secondary'}>{msg.emailSentCount || 0}</Badge>
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <Badge bg={PRIORITY_VARIANT[msg.priority] || 'secondary'}>{msg.priority || 'normal'}</Badge>
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <Badge bg={STATUS_VARIANT[msg.status] || 'secondary'}>{msg.status || 'active'}</Badge>
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        {msg.status === 'active' && (
                          <Button size="sm" variant="outline-success" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => handleResolve(msg.id)}>
                            Resolve
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Card>
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: surface.dimmer }}>
        Emails are sent automatically every 3 days per driver until the issue is resolved. Configure SMTP via environment variables.
      </div>
    </div>
  );
};

export default SystemMessagesWorkspace;

const PRIORITY_VARIANT = { high: 'danger', normal: 'warning', low: 'secondary' };
const STATUS_VARIANT = { active: 'warning', resolved: 'success' };

const formatDate = iso => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

const SystemMessagesWorkspace = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningCheck, setRunningCheck] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [filter, setFilter] = useState('active'); // 'active' | 'all'

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/system-messages');
      if (!res.ok) return;
      const data = await res.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 60000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  const handleResolve = async id => {
    try {
      const res = await fetch('/api/system-messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'resolve' })
      });
      if (res.ok) await fetchMessages();
    } catch {
      // silent
    }
  };

  const handleRunCheck = async () => {
    setRunningCheck(true);
    setCheckResult(null);
    try {
      const res = await fetch('/api/cron/license-check');
      const data = await res.json();
      setCheckResult(data);
      await fetchMessages();
    } catch {
      setCheckResult({ error: 'Request failed' });
    } finally {
      setRunningCheck(false);
    }
  };

  const displayed = filter === 'all' ? messages : messages.filter(m => m.status === 'active');

  const countActive = messages.filter(m => m.status === 'active').length;
  const countDriverAlerts = messages.filter(m => m.audience === 'Driver' && m.status === 'active').length;
  const countHigh = messages.filter(m => m.priority === 'high' && m.status === 'active').length;
  const countResolved = messages.filter(m => m.status === 'resolved').length;

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ margin: 0 }}>System Messages</h4>
        <p style={{ color: '#888', marginTop: 4, marginBottom: 0, fontSize: 13 }}>
          Internal messages, operational alerts and notices ready for review.
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Active', value: countActive, color: '#f39c12' },
          { label: 'Driver Alerts', value: countDriverAlerts, color: '#e74c3c' },
          { label: 'High Priority', value: countHigh, color: '#c0392b' },
          { label: 'Resolved', value: countResolved, color: '#27ae60' }
        ].map(s => (
          <Card key={s.label} style={{ flex: '1 1 140px', minWidth: 120, background: '#1a1a2e', border: '1px solid #333' }}>
            <Card.Body style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            </Card.Body>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <Button
            size="sm"
            variant={filter === 'active' ? 'primary' : 'outline-secondary'}
            onClick={() => setFilter('active')}
          >
            Active
          </Button>
          <Button
            size="sm"
            variant={filter === 'all' ? 'primary' : 'outline-secondary'}
            onClick={() => setFilter('all')}
          >
            All
          </Button>
        </div>

        <Button
          size="sm"
          variant="outline-info"
          onClick={fetchMessages}
          disabled={loading}
        >
          {loading ? '...' : 'Refresh'}
        </Button>

        <Button
          size="sm"
          variant="warning"
          onClick={handleRunCheck}
          disabled={runningCheck}
          style={{ marginLeft: 'auto' }}
        >
          {runningCheck ? 'Checking...' : '🔍 Run License Check'}
        </Button>
      </div>

      {/* Check result summary */}
      {checkResult && (
        <div style={{
          background: checkResult.ok ? '#1a3a1a' : '#3a1a1a',
          border: `1px solid ${checkResult.ok ? '#27ae60' : '#e74c3c'}`,
          borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 13
        }}>
          {checkResult.ok ? (
            <>
              <span style={{ color: '#2ecc71' }}>
                ✓ Check complete — checked: <strong>{checkResult.checked}</strong>,
                created: <strong>{checkResult.created}</strong>,
                emailed: <strong>{checkResult.emailed}</strong>,
                resolved: <strong>{checkResult.resolved}</strong>
                {checkResult.errors?.length > 0 && (
                  <span style={{ color: '#e67e22' }}> | Errors: {checkResult.errors.join('; ')}</span>
                )}
              </span>
              {checkResult.driverSummary?.length > 0 && (
                <div style={{ marginTop: 10, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#ccc' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #2a4a2a' }}>
                        <th style={{ padding: '4px 10px', textAlign: 'left', color: '#aaa' }}>Driver</th>
                        <th style={{ padding: '4px 10px', textAlign: 'center', color: '#aaa' }}>Expiration Date</th>
                        <th style={{ padding: '4px 10px', textAlign: 'center', color: '#aaa' }}>Remaining Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checkResult.driverSummary.map((d, i) => {
                        const days = d.daysUntilExpiry;
                        const color = days === null ? '#666' : days <= 0 ? '#e74c3c' : days <= 7 ? '#e67e22' : days <= 30 ? '#f39c12' : '#2ecc71';
                        const label = days === null ? 'No date' : days <= 0 ? 'EXPIRED' : `${days} days`;
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #1a2e1a' }}>
                            <td style={{ padding: '4px 10px' }}>{d.name}</td>
                            <td style={{ padding: '4px 10px', textAlign: 'center', color: '#aaa' }}>{d.expirationDate || '—'}</td>
                            <td style={{ padding: '4px 10px', textAlign: 'center', fontWeight: 600, color }}>{label}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <span style={{ color: '#e74c3c' }}>Error: {checkResult.error || JSON.stringify(checkResult)}</span>
          )}
        </div>
      )}

      {/* Messages table */}
      <Card style={{ background: '#141420', border: '1px solid #2a2a3e' }}>
        <Table responsive hover style={{ marginBottom: 0, color: '#ddd', fontSize: 13 }}>
          <thead style={{ background: '#1a1a2e' }}>
            <tr>
              <th style={{ padding: '10px 14px', color: '#aaa', fontWeight: 600 }}>Time</th>
              <th style={{ padding: '10px 14px', color: '#aaa', fontWeight: 600 }}>Driver</th>
              <th style={{ padding: '10px 14px', color: '#aaa', fontWeight: 600 }}>Subject</th>
              <th style={{ padding: '10px 14px', color: '#aaa', fontWeight: 600 }}>Expires</th>
              <th style={{ padding: '10px 14px', color: '#aaa', fontWeight: 600 }}>Last Email</th>
              <th style={{ padding: '10px 14px', color: '#aaa', fontWeight: 600 }}>Emails Sent</th>
              <th style={{ padding: '10px 14px', color: '#aaa', fontWeight: 600 }}>Priority</th>
              <th style={{ padding: '10px 14px', color: '#aaa', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '10px 14px', color: '#aaa', fontWeight: 600 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 24, color: '#666' }}>Loading...</td>
              </tr>
            ) : displayed.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 24, color: '#555' }}>
                  {filter === 'active' ? 'No active messages — all clear ✓' : 'No messages found'}
                </td>
              </tr>
            ) : (
              displayed.map(msg => (
                <tr
                  key={msg.id}
                  style={{ background: msg.status === 'resolved' ? 'transparent' : msg.priority === 'high' ? 'rgba(192,57,43,0.08)' : 'transparent' }}
                >
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap', color: '#888' }}>
                    {formatDate(msg.createdAt)}
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <div style={{ fontWeight: 600 }}>{msg.driverName || msg.audience}</div>
                    {msg.driverEmail && <div style={{ fontSize: 11, color: '#777' }}>{msg.driverEmail}</div>}
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <div>{msg.subject}</div>
                    {msg.body && <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>{msg.body}</div>}
                  </td>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                    {msg.expirationDate
                      ? <span style={{ color: msg.daysUntilExpiry <= 0 ? '#e74c3c' : msg.daysUntilExpiry <= 7 ? '#e67e22' : '#ddd' }}>
                          {msg.expirationDate}
                          {msg.daysUntilExpiry !== null && (
                            <span style={{ fontSize: 11, marginLeft: 6 }}>
                              ({msg.daysUntilExpiry <= 0 ? 'EXPIRED' : `${msg.daysUntilExpiry}d`})
                            </span>
                          )}
                        </span>
                      : '—'}
                  </td>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap', color: '#888', fontSize: 12 }}>
                    {msg.lastEmailSentAt ? formatDate(msg.lastEmailSentAt) : '—'}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                    <Badge bg={msg.emailSentCount > 0 ? 'info' : 'secondary'}>
                      {msg.emailSentCount || 0}
                    </Badge>
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <Badge bg={PRIORITY_VARIANT[msg.priority] || 'secondary'}>
                      {msg.priority || 'normal'}
                    </Badge>
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <Badge bg={STATUS_VARIANT[msg.status] || 'secondary'}>
                      {msg.status || 'active'}
                    </Badge>
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    {msg.status === 'active' && (
                      <Button
                        size="sm"
                        variant="outline-success"
                        style={{ fontSize: 11, padding: '2px 8px' }}
                        onClick={() => handleResolve(msg.id)}
                      >
                        Resolve
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <div style={{ marginTop: 10, fontSize: 11, color: '#555' }}>
        Emails are sent automatically every 3 days per driver until the issue is resolved. Configure SMTP via environment variables.
      </div>
    </div>
  );
};

export default SystemMessagesWorkspace;
