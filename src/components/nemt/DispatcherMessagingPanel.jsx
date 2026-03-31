'use client';

import IconifyIcon from '@/components/wrappers/IconifyIcon';
import useLocalStorage from '@/hooks/useLocalStorage';
import { useMemo, useRef, useState } from 'react';
import { Badge, Button, Form } from 'react-bootstrap';

const DAILY_DRIVERS_KEY = '__CARE_MOBILITY_DAILY_DRIVERS__';

const greenToolbarButtonStyle = {
  color: '#08131a',
  borderColor: 'rgba(8, 19, 26, 0.35)',
  backgroundColor: 'transparent'
};

const formatTime = value => new Date(value).toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit'
});

const buildSeedThreads = drivers => drivers.slice(0, 4).map((driver, index) => ({
  driverId: driver.id,
  messages: [{
    id: `${driver.id}-welcome`,
    direction: 'incoming',
    text: ['Driver app connected.', 'At pickup location.', 'Minor delay on route.', 'Need rider confirmation.'][index] ?? 'Driver app connected.',
    timestamp: new Date(Date.now() - (index + 1) * 600000).toISOString(),
    status: 'read'
  }]
}));

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
  const [threads, setThreads] = useLocalStorage('__CARE_MOBILITY_DISPATCH_MESSAGES__', buildSeedThreads(drivers));
  const [hiddenDriverIds, setHiddenDriverIds] = useLocalStorage('__CARE_MOBILITY_DISPATCH_HIDDEN_DRIVERS__', []);
  const [dailyDrivers, setDailyDrivers] = useLocalStorage(DAILY_DRIVERS_KEY, []);
  const [dailyForm, setDailyForm] = useState({ firstName: '', lastNameOrOrg: '' });
  const [draftMessage, setDraftMessage] = useState('');
  const [driverSearch, setDriverSearch] = useState('');
  const [showAddDriver, setShowAddDriver] = useState(false);
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

  const normalizedThreads = useMemo(() => mergeThreads(threads, allDrivers), [allDrivers, threads]);
  const hiddenDriverIdSet = useMemo(() => new Set(Array.isArray(hiddenDriverIds) ? hiddenDriverIds : []), [hiddenDriverIds]);
  const visibleThreads = useMemo(() => normalizedThreads.filter(thread => !hiddenDriverIdSet.has(thread.driverId)), [hiddenDriverIdSet, normalizedThreads]);
  const normalizedSearch = driverSearch.trim().toLowerCase();
  const filteredThreads = useMemo(() => visibleThreads.filter(thread => {
    if (!normalizedSearch) return true;
    const driver = allDrivers.find(item => item.id === thread.driverId);
    const haystack = [driver?.name, driver?.vehicle, driver?.live, thread.messages[thread.messages.length - 1]?.text].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(normalizedSearch);
  }), [allDrivers, normalizedSearch, visibleThreads]);
  const activeDriverId = selectedDriverId && visibleThreads.some(thread => thread.driverId === selectedDriverId) ? selectedDriverId : visibleThreads[0]?.driverId ?? null;
  const activeThread = normalizedThreads.find(thread => thread.driverId === activeDriverId) ?? null;
  const unreadCount = visibleThreads.reduce((total, thread) => total + thread.messages.filter(message => message.direction === 'incoming' && message.status !== 'read').length, 0);

  const handleSelectDriver = driverId => {
    setSelectedDriverId(driverId);
    setThreads(currentThreads => mergeThreads(currentThreads, allDrivers).map(thread => thread.driverId === driverId ? {
      ...thread,
      messages: thread.messages.map(message => message.direction === 'incoming' ? {
        ...message,
        status: 'read'
      } : message)
    } : thread));
  };

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
    setThreads(currentThreads => mergeThreads(currentThreads, allDrivers).map(thread => thread.driverId === activeDriverId ? {
      ...thread,
      messages: [...thread.messages, outgoingMessage]
    } : thread));
    setDraftMessage('');
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
    setDailyDrivers(current => [...(Array.isArray(current) ? current : []), newDriver]);
    setDailyForm({ firstName: '', lastNameOrOrg: '' });
    setShowAddDriver(false);
  };

  const handleDeleteDailyDriver = driverId => {
    setDailyDrivers(current => (Array.isArray(current) ? current : []).filter(dd => dd.id !== driverId));
    if (driverId === activeDriverId) {
      const next = visibleThreads.find(t => t.driverId !== driverId);
      setSelectedDriverId(next?.driverId ?? null);
    }
  };

  return (
    <div className="h-100 d-flex flex-column">
      <div className="d-flex justify-content-between align-items-center p-3 border-bottom bg-success text-dark flex-wrap gap-2">
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
      <div className="d-flex flex-grow-1" style={{ minHeight: 0 }}>
        <div className="border-end" style={{ width: '40%', minWidth: 220 }}>
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
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {filteredThreads.length > 0 ? filteredThreads.map(thread => {
              const driver = allDrivers.find(item => item.id === thread.driverId);
              const isDaily = driver?._isDaily === true;
              const lastMessage = thread.messages[thread.messages.length - 1];
              const threadUnreadCount = thread.messages.filter(message => message.direction === 'incoming' && message.status !== 'read').length;
              return (
                <div key={thread.driverId} className={`border-bottom ${thread.driverId === activeDriverId ? 'text-white' : 'text-body'}`} style={{ backgroundColor: thread.driverId === activeDriverId ? '#6c5ce7' : 'transparent' }}>
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
                            <div className="small">{lastMessage ? formatTime(lastMessage.timestamp) : '--:--'}</div>
                            {threadUnreadCount > 0 ? <Badge bg="danger">{threadUnreadCount}</Badge> : null}
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
            <div className="fw-semibold">{activeDriver?.name ?? 'Select a driver'}</div>
            <div className="small text-muted">{activeDriver ? `${activeDriver.live} | ${activeDriver.vehicle}` : 'Choose a thread to start dispatch messaging.'}</div>
          </div>
          <div className="flex-grow-1 p-3" style={{ overflowY: 'auto', minHeight: 0 }}>
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
                  <div className={`small mt-1 ${message.direction === 'outgoing' ? 'text-white-50' : 'text-muted'}`}>{formatTime(message.timestamp)} {message.direction === 'outgoing' ? `| ${message.status}` : ''}</div>
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
