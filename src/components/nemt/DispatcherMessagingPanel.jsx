'use client';

import IconifyIcon from '@/components/wrappers/IconifyIcon';
import useLocalStorage from '@/hooks/useLocalStorage';
import { useMemo, useState } from 'react';
import { Badge, Button, Form } from 'react-bootstrap';

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
  const [draftMessage, setDraftMessage] = useState('');
  const [driverSearch, setDriverSearch] = useState('');
  const [showAddDriver, setShowAddDriver] = useState(false);

  const normalizedThreads = useMemo(() => mergeThreads(threads, drivers), [drivers, threads]);
  const hiddenDriverIdSet = useMemo(() => new Set(Array.isArray(hiddenDriverIds) ? hiddenDriverIds : []), [hiddenDriverIds]);
  const visibleThreads = useMemo(() => normalizedThreads.filter(thread => !hiddenDriverIdSet.has(thread.driverId)), [hiddenDriverIdSet, normalizedThreads]);
  const normalizedSearch = driverSearch.trim().toLowerCase();
  const filteredThreads = useMemo(() => visibleThreads.filter(thread => {
    if (!normalizedSearch) return true;
    const driver = drivers.find(item => item.id === thread.driverId);
    const haystack = [driver?.name, driver?.vehicle, driver?.live, thread.messages[thread.messages.length - 1]?.text].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(normalizedSearch);
  }), [drivers, normalizedSearch, visibleThreads]);
  const hiddenDrivers = useMemo(() => drivers.filter(driver => hiddenDriverIdSet.has(driver.id)), [drivers, hiddenDriverIdSet]);
  const activeDriverId = selectedDriverId && visibleThreads.some(thread => thread.driverId === selectedDriverId) ? selectedDriverId : visibleThreads[0]?.driverId ?? null;
  const activeThread = normalizedThreads.find(thread => thread.driverId === activeDriverId) ?? null;
  const unreadCount = visibleThreads.reduce((total, thread) => total + thread.messages.filter(message => message.direction === 'incoming' && message.status !== 'read').length, 0);

  const handleSelectDriver = driverId => {
    setSelectedDriverId(driverId);
    setThreads(currentThreads => mergeThreads(currentThreads, drivers).map(thread => thread.driverId === driverId ? {
      ...thread,
      messages: thread.messages.map(message => message.direction === 'incoming' ? {
        ...message,
        status: 'read'
      } : message)
    } : thread));
  };

  const handleSendMessage = text => {
    const messageText = text.trim();
    if (!activeDriverId || !messageText) return;

    const outgoingMessage = {
      id: `${activeDriverId}-${Date.now()}`,
      direction: 'outgoing',
      text: messageText,
      timestamp: new Date().toISOString(),
      status: 'sent'
    };

    setThreads(currentThreads => mergeThreads(currentThreads, drivers).map(thread => thread.driverId === activeDriverId ? {
      ...thread,
      messages: [...thread.messages, outgoingMessage]
    } : thread));
    setDraftMessage('');
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

  const handleRestoreDriver = driverId => {
    setHiddenDriverIds(currentHiddenDriverIds => (Array.isArray(currentHiddenDriverIds) ? currentHiddenDriverIds.filter(hiddenDriverId => hiddenDriverId !== driverId) : []));
    setSelectedDriverId(driverId);
    setShowAddDriver(false);
  };

  const activeDriver = drivers.find(driver => driver.id === activeDriverId) ?? null;

  return <div className="h-100 d-flex flex-column">
      <div className="d-flex justify-content-between align-items-center p-3 border-bottom bg-success text-dark flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <strong>Messaging</strong>
          <Badge bg="light" text="dark">{visibleThreads.length} threads</Badge>
          <Badge bg="warning" text="dark">{unreadCount} unread</Badge>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => setShowAddDriver(current => !current)}>{showAddDriver ? 'Close Add' : 'Add Driver'}</Button>
          <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => handleSendMessage('ETA update sent from dispatch.')}>Quick ETA</Button>
          <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={openFullChat}>Open Chat</Button>
        </div>
      </div>
      <div className="d-flex flex-grow-1" style={{ minHeight: 0 }}>
        <div className="border-end" style={{ width: '40%', minWidth: 220 }}>
          <div className="p-3 border-bottom bg-light">
            <Form.Control value={driverSearch} onChange={event => setDriverSearch(event.target.value)} placeholder="Search driver" />
            {showAddDriver ? <div className="mt-3">
                <div className="small text-muted mb-2">Add a hidden driver back to this panel.</div>
                {hiddenDrivers.length > 0 ? <div className="d-flex flex-wrap gap-2">
                    {hiddenDrivers.map(driver => <Button key={driver.id} variant="outline-secondary" size="sm" onClick={() => handleRestoreDriver(driver.id)}>
                        <IconifyIcon icon="iconoir:user-plus" className="me-1" />
                        {driver.name}
                      </Button>)}
                  </div> : <div className="small text-muted">No hidden drivers to add.</div>}
              </div> : null}
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {filteredThreads.length > 0 ? filteredThreads.map(thread => {
            const driver = drivers.find(item => item.id === thread.driverId);
            const lastMessage = thread.messages[thread.messages.length - 1];
            const threadUnreadCount = thread.messages.filter(message => message.direction === 'incoming' && message.status !== 'read').length;
            return <div key={thread.driverId} className={`border-bottom ${thread.driverId === activeDriverId ? 'text-white' : 'text-body'}`} style={{
              backgroundColor: thread.driverId === activeDriverId ? '#6c5ce7' : 'transparent'
            }}>
                    <div className="d-flex align-items-start gap-2 px-2 pt-2">
                      <div className="flex-grow-1">
                        <button type="button" onClick={() => handleSelectDriver(thread.driverId)} className={`w-100 text-start border-0 px-1 pb-2 ${thread.driverId === activeDriverId ? 'text-white' : 'text-body'}`} style={{
                      backgroundColor: 'transparent'
                    }}>
                          <div className="d-flex justify-content-between align-items-start gap-2">
                            <div className="d-flex align-items-start gap-2">
                              <div className="pt-1">
                                <IconifyIcon icon="iconoir:map-pin" className={driver?.live === 'Online' ? 'text-success' : 'text-secondary'} />
                              </div>
                              <div>
                                <div className="fw-semibold d-flex align-items-center gap-2">{driver?.name ?? 'Driver'}{driver?.live === 'Online' ? <span className="rounded-circle bg-success d-inline-block" style={{ width: 8, height: 8 }} /> : null}</div>
                                <div className="small text-muted">{driver?.vehicle || 'Vehicle pending'}</div>
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
                    </div>
                  </div>;
          }) : <div className="text-center text-muted py-4 small">{driverSearch.trim() ? 'No drivers match this search.' : 'No driver threads available.'}</div>}
          </div>
        </div>
        <div className="d-flex flex-column flex-grow-1" style={{ minWidth: 0 }}>
          <div className="p-3 border-bottom bg-light">
            <div className="fw-semibold">{activeDriver?.name ?? 'Select a driver'}</div>
            <div className="small text-muted">{activeDriver ? `${activeDriver.live} | ${activeDriver.vehicle}` : 'Choose a thread to start dispatch messaging.'}</div>
          </div>
          <div className="flex-grow-1 p-3" style={{ overflowY: 'auto', maxHeight: 260 }}>
            {activeThread?.messages?.length ? activeThread.messages.map(message => <div key={message.id} className={`d-flex mb-3 ${message.direction === 'outgoing' ? 'justify-content-end' : 'justify-content-start'}`}>
                  <div className={`rounded-3 px-3 py-2 ${message.direction === 'outgoing' ? 'bg-primary text-white' : 'bg-light border'}`} style={{ maxWidth: '80%' }}>
                    <div>{message.text}</div>
                    <div className={`small mt-1 ${message.direction === 'outgoing' ? 'text-white-50' : 'text-muted'}`}>{formatTime(message.timestamp)} {message.direction === 'outgoing' ? `| ${message.status}` : ''}</div>
                  </div>
                </div>) : <div className="text-center text-muted py-5">No messages yet for this driver.</div>}
          </div>
          <div className="p-3 border-top bg-light">
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
    </div>;
};

export default DispatcherMessagingPanel;