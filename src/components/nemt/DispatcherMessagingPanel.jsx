'use client';

import IconifyIcon from '@/components/wrappers/IconifyIcon';
import { useNemtContext } from '@/context/useNemtContext';
import { formatDispatchTime } from '@/helpers/nemt-dispatch-state';
import { normalizePhoneDigits } from '@/helpers/system-users';
import useUserPreferencesApi from '@/hooks/useUserPreferencesApi';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Form } from 'react-bootstrap';

const greenToolbarButtonStyle = {
  color: '#08131a',
  borderColor: 'rgba(8, 19, 26, 0.35)',
  backgroundColor: 'transparent'
};

const MOBILE_ALERT_POLL_MS = 5000;

const DRIVER_ALERT_SMS_TEMPLATES = {
  'delay-alert': driverName => `Dispatch update for ${driverName}: we received your delay alert. Send your best ETA as soon as traffic clears or conditions change.`,
  'backup-driver-request': driverName => `Dispatch update for ${driverName}: we are reviewing backup driver coverage now. Stay with the trip until dispatch confirms the swap.`,
  'uber-request': driverName => `Dispatch update for ${driverName}: dispatch is reviewing Uber backup coverage now. Keep dispatch updated before leaving the trip.`,
  fallback: driverName => `Dispatch update for ${driverName}: your alert was received. Keep dispatch updated and wait for coverage instructions.`
};

const getAlertVariant = priority => {
  if (priority === 'high' || priority === 'urgent') return 'danger';
  if (priority === 'normal') return 'warning';
  return 'secondary';
};

const getAlertSurfaceStyle = alert => {
  if (alert?.type === 'uber-request') return { backgroundColor: '#fff1f2', borderColor: '#be123c', borderWidth: 2 };
  if (alert?.type === 'backup-driver-request') return { backgroundColor: '#eff6ff', borderColor: '#1d4ed8', borderWidth: 2 };
  if (alert?.type === 'delay-alert') return { backgroundColor: '#fff7ed', borderColor: '#ea580c', borderWidth: 2 };
  if (alert?.priority === 'high' || alert?.priority === 'urgent') return { backgroundColor: '#fef2f2', borderColor: '#b91c1c', borderWidth: 2 };
  return { backgroundColor: '#fff8e1', borderColor: '#f59e0b', borderWidth: 1 };
};

const getAlertLabel = alert => {
  if (alert?.type === 'delay-alert') return 'Late ETA';
  if (alert?.type === 'backup-driver-request') return 'Backup Driver';
  if (alert?.type === 'uber-request') return 'Uber Coverage';
  return 'Driver Alert';
};

const logSystemActivity = async (eventLabel, target = '', metadata = null) => {
  try {
    await fetch('/api/system-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventLabel, target, metadata })
    });
  } catch (error) {
    console.error('Error recording dispatcher messaging activity:', error);
  }
};

const readJsonResponse = async response => {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const rawText = await response.text();
  if (!rawText) return {};
  if (!contentType.includes('application/json')) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Your session expired or this account cannot open dispatcher alerts.');
    }
    throw new Error('Driver alerts API returned HTML instead of JSON.');
  }
  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error('Driver alerts API returned invalid JSON.');
  }
};

const mergeThreads = (threads, drivers) => {
  const existingThreads = Array.isArray(threads) ? threads : [];
  const byDriverId = new Map(existingThreads.map(thread => [thread.driverId, thread]));
  return drivers.map(driver => byDriverId.get(driver.id) ?? {
    driverId: driver.id,
    messages: []
  });
};

const DispatcherMessagingPanel = ({
  drivers,
  selectedDriverId,
  setSelectedDriverId,
  openFullChat
}) => {
  const {
    dispatchThreads,
    dailyDrivers,
    uiPreferences,
    upsertDispatchThreadMessage,
    markDispatchThreadRead,
    addDailyDriver,
    removeDailyDriver
  } = useNemtContext();
  const { data: userPreferences, loading: userPreferencesLoading, saveData: saveUserPreferences } = useUserPreferencesApi();
  const [hiddenDriverIds, setHiddenDriverIds] = useState([]);
  const [dailyForm, setDailyForm] = useState({ firstName: '', lastNameOrOrg: '' });
  const [draftMessage, setDraftMessage] = useState('');
  const [driverSearch, setDriverSearch] = useState('');
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [driverAlerts, setDriverAlerts] = useState([]);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);
  const [alertsError, setAlertsError] = useState('');
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsStatus, setSmsStatus] = useState('');
  const [resolvingAlertId, setResolvingAlertId] = useState('');
  const photoInputRef = useRef(null);
  const documentInputRef = useRef(null);

  const allDrivers = useMemo(() => [
    ...drivers,
    ...(Array.isArray(dailyDrivers) ? dailyDrivers : []).map(dd => ({
      id: dd.id,
      name: dd.firstName + (dd.lastNameOrOrg ? ' ' + dd.lastNameOrOrg : ''),
      vehicle: 'Daily Driver',
      live: 'Online',
      _isDaily: true
    }))
  ], [drivers, dailyDrivers]);

  const normalizedThreads = useMemo(() => mergeThreads(dispatchThreads, allDrivers), [allDrivers, dispatchThreads]);
  const hiddenDriverIdSet = useMemo(() => new Set(Array.isArray(hiddenDriverIds) ? hiddenDriverIds : []), [hiddenDriverIds]);
  const visibleThreads = useMemo(() => normalizedThreads.filter(thread => !hiddenDriverIdSet.has(thread.driverId)), [hiddenDriverIdSet, normalizedThreads]);

  useEffect(() => {
    if (userPreferencesLoading) return;
    setHiddenDriverIds(Array.isArray(userPreferences?.dispatcherMessaging?.hiddenDriverIds) ? userPreferences.dispatcherMessaging.hiddenDriverIds : []);
  }, [userPreferences?.dispatcherMessaging?.hiddenDriverIds, userPreferencesLoading]);

  useEffect(() => {
    if (userPreferencesLoading) return;
    void saveUserPreferences({
      ...userPreferences,
      dispatcherMessaging: {
        ...userPreferences?.dispatcherMessaging,
        hiddenDriverIds
      }
    });
  }, [hiddenDriverIds, saveUserPreferences, userPreferences, userPreferencesLoading]);
  const normalizedSearch = driverSearch.trim().toLowerCase();
  const filteredThreads = useMemo(() => visibleThreads.filter(thread => {
    if (!normalizedSearch) return true;
    const driver = allDrivers.find(item => item.id === thread.driverId);
    const haystack = [driver?.name, driver?.vehicle, driver?.live, thread.messages[thread.messages.length - 1]?.text].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(normalizedSearch);
  }), [allDrivers, normalizedSearch, visibleThreads]);
  const activeDriverId = selectedDriverId && visibleThreads.some(thread => thread.driverId === selectedDriverId) ? selectedDriverId : visibleThreads[0]?.driverId ?? null;
  const activeThread = normalizedThreads.find(thread => thread.driverId === activeDriverId) ?? null;
  const activeAlertCounts = useMemo(() => driverAlerts.reduce((accumulator, alert) => {
    if (!alert?.driverId || alert?.status === 'resolved') return accumulator;
    accumulator[alert.driverId] = (accumulator[alert.driverId] || 0) + 1;
    return accumulator;
  }, {}), [driverAlerts]);
  const unreadCount = visibleThreads.reduce((total, thread) => total + thread.messages.filter(message => message.direction === 'incoming' && message.status !== 'read').length, 0);
  const activeDriverAlerts = useMemo(() => driverAlerts.filter(alert => alert.driverId === activeDriverId && alert.status !== 'resolved'), [activeDriverId, driverAlerts]);

  const handleSelectDriver = driverId => {
    setSelectedDriverId(driverId);
    markDispatchThreadRead(driverId);
    setSmsStatus('');
  };

  useEffect(() => {
    let active = true;

    const loadDriverAlerts = async () => {
      if (active) setIsLoadingAlerts(true);
      try {
        const response = await fetch('/api/system-messages', { cache: 'no-store' });
        const payload = await readJsonResponse(response);
        if (!response.ok) throw new Error(payload?.error || 'Unable to load driver alerts.');
        if (!active) return;

        const nextAlerts = (Array.isArray(payload?.messages) ? payload.messages : []).filter(message => {
          return message?.driverId && message?.source === 'mobile-driver-app';
        }).sort((left, right) => new Date(right?.createdAt || 0) - new Date(left?.createdAt || 0));

        setDriverAlerts(nextAlerts);
        setAlertsError('');
      } catch (error) {
        if (!active) return;
        setAlertsError(error.message || 'Unable to load driver alerts.');
      } finally {
        if (active) setIsLoadingAlerts(false);
      }
    };

    void loadDriverAlerts();
    const intervalId = window.setInterval(() => {
      void loadDriverAlerts();
    }, MOBILE_ALERT_POLL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const handleSendMessage = (text, options = {}) => {
    const messageText = text.trim();
    const attachments = Array.isArray(options.attachments) ? options.attachments : [];
    if (!activeDriverId || (!messageText && attachments.length === 0)) return;
    const outgoingMessage = {
      id: `${activeDriverId}-${Date.now()}`,
      direction: 'outgoing',
      text: messageText || (attachments.length > 0 ? 'Attachment sent.' : ''),
      timestamp: new Date().toISOString(),
      status: 'sent',
      attachments
    };
    upsertDispatchThreadMessage({ driverId: activeDriverId, message: outgoingMessage });
    setDraftMessage('');
  };

  const handleResolveAlert = async alertId => {
    if (!alertId) return;
    setResolvingAlertId(alertId);
    setAlertsError('');
    try {
      const response = await fetch('/api/system-messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alertId, action: 'resolve' })
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) throw new Error(payload?.error || 'Unable to resolve alert.');
      setDriverAlerts(currentAlerts => currentAlerts.map(alert => alert.id === alertId ? payload.message : alert));
      await logSystemActivity('Resolved mobile driver alert', activeDriverId || '', {
        alertId,
        driverId: activeDriverId || '',
        driverName: activeDriver?.name || '',
        action: 'resolve-alert'
      });
    } catch (error) {
      setAlertsError(error.message || 'Unable to resolve alert.');
    } finally {
      setResolvingAlertId('');
    }
  };

  const handleEscalateAlertSms = async alert => {
    await handleSendSmsTemplate(alert, `Dispatch follow-up: ${alert.body}`);
  };

  const handleSendSmsTemplate = async (alert, smsMessage) => {
    const phoneNumber = normalizePhoneDigits(activeDriver?.phone);
    if (!activeDriverId || !phoneNumber || !smsMessage) {
      setSmsStatus('Driver phone is missing, so SMS escalation cannot be sent.');
      return;
    }

    setIsSendingSms(true);
    setSmsStatus('');
    try {
      const response = await fetch('/api/extensions/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'sms',
          phoneNumber,
          message: smsMessage,
          driverId: activeDriverId,
          driverName: activeDriver?.name || 'Driver'
        })
      });
      const payload = await response.json();
      if (!response.ok || payload?.success === false) throw new Error(payload?.error || 'Unable to escalate via SMS.');

      handleSendMessage(`SMS escalation sent: ${smsMessage}`);
      await logSystemActivity('Sent dispatcher SMS escalation', activeDriverId || '', {
        alertId: alert?.id || '',
        driverId: activeDriverId || '',
        driverName: activeDriver?.name || '',
        alertType: alert?.type || 'unknown',
        smsMessage,
        mode: alert?.body === smsMessage.replace(/^Dispatch follow-up:\s*/, '') ? 'raw-forward' : 'template'
      });
      setSmsStatus(payload?.demo ? 'SMS escalation sent in demo mode.' : 'SMS escalation sent to driver.');
    } catch (error) {
      setSmsStatus(error.message || 'Unable to escalate via SMS.');
    } finally {
      setIsSendingSms(false);
    }
  };

  const handleSendTemplateByType = async alert => {
    const driverName = activeDriver?.name || 'driver';
    const templateBuilder = DRIVER_ALERT_SMS_TEMPLATES[alert?.type] || DRIVER_ALERT_SMS_TEMPLATES.fallback;
    await handleSendSmsTemplate(alert, templateBuilder(driverName));
  };

  const readFileAsDataUrl = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });

  const handleAttachmentPick = async (event, kind) => {
    const file = event?.target?.files?.[0];
    event.target.value = '';
    if (!file || !activeDriverId) return;
    if (file.size > 5 * 1024 * 1024) {
      handleSendMessage('Attachment blocked: file exceeds 5MB limit.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      handleSendMessage('', {
        attachments: [{
          id: `${kind}-${Date.now()}`,
          kind,
          name: file.name,
          mimeType: file.type || '',
          dataUrl
        }]
      });
    } catch {
      handleSendMessage('Attachment failed: unable to read selected file.');
    }
  };

  const handleHideDriver = driverId => {
    setHiddenDriverIds(currentHiddenDriverIds => {
      const nextHiddenDriverIds = Array.isArray(currentHiddenDriverIds) ? [...currentHiddenDriverIds] : [];
      if (!nextHiddenDriverIds.includes(driverId)) nextHiddenDriverIds.push(driverId);
      return nextHiddenDriverIds;
    });
    if (driverId === activeDriverId) {
      const nextVisibleThread = visibleThreads.find(thread => thread.driverId !== driverId);
      setSelectedDriverId(nextVisibleThread?.driverId ?? null);
    }
  };

  const activeDriver = allDrivers.find(driver => driver.id === activeDriverId) ?? null;

  const handleAddDailyDriver = () => {
    const firstName = dailyForm.firstName.trim();
    const lastNameOrOrg = dailyForm.lastNameOrOrg.trim();
    if (!firstName) return;
    const newDriver = {
      id: `daily-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      firstName,
      lastNameOrOrg,
      createdAt: new Date().toISOString()
    };
    addDailyDriver(newDriver);
    setDailyForm({ firstName: '', lastNameOrOrg: '' });
    setShowAddDriver(false);
  };

  const handleDeleteDailyDriver = driverId => {
    removeDailyDriver(driverId);
    if (driverId === activeDriverId) {
      const next = visibleThreads.find(t => t.driverId !== driverId);
      setSelectedDriverId(next?.driverId ?? null);
    }
  };

  return (
    <div className="h-100 d-flex flex-column">
      <div className="d-flex justify-content-between align-items-center p-2 border-bottom bg-success text-dark flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <strong>Messaging</strong>
          <Badge bg="light" text="dark">{visibleThreads.length} threads</Badge>
          <Badge bg="warning" text="dark">{unreadCount} unread</Badge>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => setShowAddDriver(current => !current)}>{showAddDriver ? 'Cancelar' : 'Add Driver'}</Button>
          <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => handleSendMessage('ETA update sent from dispatch.')}>Quick ETA</Button>
        </div>
      </div>
      <div className="d-flex flex-grow-1" style={{ minHeight: 0, overflow: 'hidden' }}>
        <div className="border-end d-flex flex-column" style={{ width: '40%', minWidth: 220, minHeight: 0 }}>
          <div className="p-3 border-bottom bg-light">
            <Form.Control value={driverSearch} onChange={event => setDriverSearch(event.target.value)} placeholder="Search driver" />
            {showAddDriver ? (
              <div className="mt-3 border rounded p-2 bg-white">
                <div className="fw-semibold small mb-2">Daily Driver de emergencia</div>
                <Form.Control
                  size="sm"
                  className="mb-2"
                  placeholder="Nombre *"
                  value={dailyForm.firstName}
                  onChange={e => setDailyForm(f => ({ ...f, firstName: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddDailyDriver(); }}
                />
                <Form.Control
                  size="sm"
                  className="mb-2"
                  placeholder="Apellido u Organizacion (ej. Uber)"
                  value={dailyForm.lastNameOrOrg}
                  onChange={e => setDailyForm(f => ({ ...f, lastNameOrOrg: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddDailyDriver(); }}
                />
                <Button size="sm" variant="success" onClick={handleAddDailyDriver} disabled={!dailyForm.firstName.trim()}>
                  Agregar
                </Button>
              </div>
            ) : null}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {filteredThreads.length > 0 ? filteredThreads.map(thread => {
              const driver = allDrivers.find(item => item.id === thread.driverId);
              const isDaily = driver?._isDaily === true;
              const lastMessage = thread.messages[thread.messages.length - 1];
              const threadUnreadCount = thread.messages.filter(message => message.direction === 'incoming' && message.status !== 'read').length;
              const threadAlertCount = activeAlertCounts[thread.driverId] || 0;
              const hasUrgentAlert = driverAlerts.some(alert => alert.driverId === thread.driverId && alert.status !== 'resolved' && (alert.priority === 'high' || alert.priority === 'urgent'));
              return (
                <div key={thread.driverId} className={`border-bottom ${thread.driverId === activeDriverId ? 'text-white' : 'text-body'}`} style={{ backgroundColor: thread.driverId === activeDriverId ? '#6c5ce7' : hasUrgentAlert ? '#fff7ed' : 'transparent', borderLeft: hasUrgentAlert ? '4px solid #ea580c' : '4px solid transparent' }}>
                  <div className="d-flex align-items-start gap-2 px-2 pt-2">
                    <div className="flex-grow-1">
                      <button type="button" onClick={() => handleSelectDriver(thread.driverId)} className={`w-100 text-start border-0 px-1 pb-2 ${thread.driverId === activeDriverId ? 'text-white' : 'text-body'}`} style={{ backgroundColor: 'transparent' }}>
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <div className="d-flex align-items-start gap-2">
                            <div className="pt-1">
                              <IconifyIcon icon="iconoir:map-pin" className={driver?.live === 'Online' ? 'text-success' : 'text-secondary'} />
                            </div>
                            <div>
                              <div className="fw-semibold d-flex align-items-center gap-2">
                                {driver?.name ?? 'Driver'}
                                {driver?.live === 'Online' ? <span className="rounded-circle bg-success d-inline-block" style={{ width: 8, height: 8 }} /> : null}
                              </div>
                              <div className="small text-muted">{isDaily ? <span className="badge bg-warning text-dark">Daily Driver</span> : driver?.vehicle || 'Vehicle pending'}</div>
                              <div className="small text-muted">{lastMessage?.text ?? 'No messages yet.'}</div>
                            </div>
                          </div>
                          <div className="text-end">
                            <div className="small">{lastMessage ? formatDispatchTime(lastMessage.timestamp, uiPreferences?.timeZone) : '--:--'}</div>
                            {threadUnreadCount > 0 ? <Badge bg="danger">{threadUnreadCount}</Badge> : null}
                            {threadAlertCount > 0 ? <Badge bg="warning" text="dark" className="ms-1">{threadAlertCount} alert</Badge> : null}
                          </div>
                        </div>
                      </button>
                    </div>
                    <Button variant="link" size="sm" className="p-1 text-decoration-none" style={{ color: thread.driverId === activeDriverId ? '#ffffff' : '#6b7280' }} onClick={() => handleHideDriver(thread.driverId)} title="Remove driver from this panel">
                      <IconifyIcon icon="iconoir:xmark" />
                    </Button>
                    {isDaily ? (
                      <Button variant="link" size="sm" className="p-1 text-decoration-none text-danger" onClick={() => handleDeleteDailyDriver(thread.driverId)} title="Borrar Daily Driver">
                        <IconifyIcon icon="iconoir:trash" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            }) : <div className="text-center text-muted py-4 small">{driverSearch.trim() ? 'No drivers match this search.' : 'No driver threads available.'}</div>}
          </div>
        </div>
        <div className="d-flex flex-column flex-grow-1" style={{ minWidth: 0 }}>
          <div className="p-3 border-bottom bg-light">
            <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
              <div>
                <div className="fw-semibold">{activeDriver?.name ?? 'Select a driver'}</div>
                <div className="small text-muted">{activeDriver ? `${activeDriver.live} | ${activeDriver.vehicle}` : 'Choose a thread to start dispatch messaging.'}</div>
              </div>
              {activeDriver ? <div className="d-flex gap-2 align-items-center flex-wrap">
                  {activeDriverAlerts.length > 0 ? <Badge bg="danger">{activeDriverAlerts.length} active mobile alert{activeDriverAlerts.length === 1 ? '' : 's'}</Badge> : null}
                  <Badge bg={normalizePhoneDigits(activeDriver.phone).length >= 10 ? 'success' : 'secondary'}>{normalizePhoneDigits(activeDriver.phone).length >= 10 ? 'SMS ready' : 'No SMS number'}</Badge>
                  {alertsError ? <Badge bg="warning" text="dark" title={alertsError}>Alerts issue</Badge> : null}
                </div> : null}
            </div>
          </div>
          <div className="flex-grow-1 p-3" style={{ overflowY: 'auto', minHeight: 0 }}>
            {isLoadingAlerts && activeDriverAlerts.length === 0 ? <div className="small text-muted mb-3">Loading driver alerts...</div> : null}
            {smsStatus ? <div className={`alert ${smsStatus.toLowerCase().includes('unable') || smsStatus.toLowerCase().includes('missing') ? 'alert-warning' : 'alert-success'} py-2 mb-3`}>{smsStatus}</div> : null}
            {activeDriverAlerts.length > 0 ? <div className="d-flex flex-column gap-2 mb-3">
                {activeDriverAlerts.map(alert => <div key={alert.id} className="border rounded p-3 shadow-sm" style={getAlertSurfaceStyle(alert)}>
                    <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                      <div>
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <strong>{alert.subject || 'Driver alert'}</strong>
                          <Badge bg={getAlertVariant(alert.priority)}>{alert.priority || 'normal'}</Badge>
                          <Badge bg="dark">{getAlertLabel(alert)}</Badge>
                        </div>
                        <div className="small text-muted mt-1">{formatDispatchTime(alert.createdAt, uiPreferences?.timeZone)} | {alert.deliveryMethod || 'in-app'}</div>
                      </div>
                      <div className="d-flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline-secondary" onClick={() => {
                          setDraftMessage(alert.body || '');
                          void logSystemActivity('Loaded mobile driver alert into draft', activeDriverId || '', {
                            alertId: alert.id,
                            driverId: activeDriverId || '',
                            driverName: activeDriver?.name || '',
                            alertType: alert?.type || 'unknown',
                            action: 'use-as-draft'
                          });
                        }}>Use As Draft</Button>
                        <Button size="sm" variant="outline-dark" onClick={() => void handleSendTemplateByType(alert)} disabled={isSendingSms || normalizePhoneDigits(activeDriver?.phone).length < 10}>Send Template</Button>
                        <Button size="sm" variant="outline-danger" onClick={() => void handleEscalateAlertSms(alert)} disabled={isSendingSms || normalizePhoneDigits(activeDriver?.phone).length < 10}>Forward Raw</Button>
                        <Button size="sm" variant="success" onClick={() => void handleResolveAlert(alert.id)} disabled={resolvingAlertId === alert.id}>{resolvingAlertId === alert.id ? 'Resolving...' : 'Resolve'}</Button>
                      </div>
                    </div>
                    <div className="mt-2 small">{alert.body}</div>
                    <div className="mt-3 d-flex gap-2 flex-wrap">
                      <Button size="sm" variant="warning" onClick={() => void handleSendSmsTemplate(alert, DRIVER_ALERT_SMS_TEMPLATES['delay-alert'](activeDriver?.name || 'driver'))} disabled={isSendingSms || normalizePhoneDigits(activeDriver?.phone).length < 10}>Late ETA SMS</Button>
                      <Button size="sm" variant="primary" onClick={() => void handleSendSmsTemplate(alert, DRIVER_ALERT_SMS_TEMPLATES['backup-driver-request'](activeDriver?.name || 'driver'))} disabled={isSendingSms || normalizePhoneDigits(activeDriver?.phone).length < 10}>Backup Driver SMS</Button>
                      <Button size="sm" variant="danger" onClick={() => void handleSendSmsTemplate(alert, DRIVER_ALERT_SMS_TEMPLATES['uber-request'](activeDriver?.name || 'driver'))} disabled={isSendingSms || normalizePhoneDigits(activeDriver?.phone).length < 10}>Uber SMS</Button>
                    </div>
                  </div>)}
              </div> : null}
            {activeThread?.messages?.length ? activeThread.messages.map(message => (
              <div key={message.id} className={`d-flex mb-3 ${message.direction === 'outgoing' ? 'justify-content-end' : 'justify-content-start'}`}>
                <div className={`rounded-3 px-3 py-2 ${message.direction === 'outgoing' ? 'bg-primary text-white' : 'bg-light border'}`} style={{ maxWidth: '80%' }}>
                  <div>{message.text}</div>
                  {Array.isArray(message.attachments) && message.attachments.length > 0 ? (
                    <div className="mt-2 d-flex flex-column gap-2">
                      {message.attachments.map(attachment => (
                        <div key={attachment.id} className="small">
                          {attachment.kind === 'photo' ? (
                            <a href={attachment.dataUrl} target="_blank" rel="noreferrer" className="d-inline-flex flex-column text-reset text-decoration-none">
                              <img src={attachment.dataUrl} alt={attachment.name} style={{ width: 140, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)' }} />
                              <span className="mt-1">{attachment.name}</span>
                            </a>
                          ) : (
                            <a href={attachment.dataUrl} download={attachment.name} className="text-reset">Document: {attachment.name}</a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className={`small mt-1 ${message.direction === 'outgoing' ? 'text-white-50' : 'text-muted'}`}>{formatDispatchTime(message.timestamp, uiPreferences?.timeZone)} {message.direction === 'outgoing' ? `| ${message.status}` : ''}</div>
                </div>
              </div>
            )) : <div className="text-center text-muted py-5">No messages yet for this driver.</div>}
          </div>
          <div className="p-3 border-top bg-light">
            <div className="d-flex gap-2 mb-2">
              <Button variant="outline-secondary" size="sm" disabled={!activeDriver} onClick={() => photoInputRef.current?.click()}>Foto</Button>
              <Button variant="outline-secondary" size="sm" disabled={!activeDriver} onClick={() => documentInputRef.current?.click()}>Documento</Button>
              <input ref={photoInputRef} type="file" accept="image/*" className="d-none" onChange={event => {
                void handleAttachmentPick(event, 'photo');
              }} />
              <input ref={documentInputRef} type="file" accept=".pdf,.doc,.docx,.txt,image/*" className="d-none" onChange={event => {
                void handleAttachmentPick(event, 'document');
              }} />
            </div>
            <div className="d-flex gap-2">
              <Form.Control value={draftMessage} onChange={event => setDraftMessage(event.target.value)} placeholder={activeDriver ? `Message ${activeDriver.name}` : 'Select a driver first'} disabled={!activeDriver} onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleSendMessage(draftMessage);
                }
              }} />
              <Button variant="dark" onClick={() => handleSendMessage(draftMessage)} disabled={!activeDriver || !draftMessage.trim()}>Send</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DispatcherMessagingPanel;
