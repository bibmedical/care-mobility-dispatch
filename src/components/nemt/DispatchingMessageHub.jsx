'use client';

import { useLayoutContext } from '@/context/useLayoutContext';
import { useNemtContext } from '@/context/useNemtContext';
import { formatDispatchTime } from '@/helpers/nemt-dispatch-state';
import { useSession } from 'next-auth/react';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardBody, Form } from 'react-bootstrap';

const buildSurface = isDarkMode => ({
  card: {
    borderRadius: 12,
    border: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.55)' : '#dbe3ef'}`,
    background: isDarkMode ? 'linear-gradient(180deg, #0f172a 0%, #111827 100%)' : '#ffffff',
    color: isDarkMode ? '#e5eefc' : '#0f172a'
  },
  header: {
    background: isDarkMode ? 'rgba(15, 23, 42, 0.75)' : '#f8fafc',
    borderBottom: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.55)' : '#dbe3ef'}`
  },
  pane: {
    border: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.55)' : '#dbe3ef'}`,
    borderRadius: 10,
    backgroundColor: isDarkMode ? '#0f172a' : '#ffffff'
  },
  activeThread: {
    backgroundColor: isDarkMode ? 'rgba(37, 99, 235, 0.3)' : '#eff6ff',
    borderColor: isDarkMode ? 'rgba(96, 165, 250, 0.8)' : '#93c5fd'
  },
  messageIncoming: {
    backgroundColor: isDarkMode ? '#1f2937' : '#f8fafc',
    color: isDarkMode ? '#e5eefc' : '#0f172a',
    border: `1px solid ${isDarkMode ? '#374151' : '#e2e8f0'}`
  },
  messageOutgoing: {
    backgroundColor: '#1d4ed8',
    color: '#ffffff',
    border: '1px solid #1d4ed8'
  },
  input: {
    backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
    color: isDarkMode ? '#e5eefc' : '#0f172a',
    borderColor: isDarkMode ? 'rgba(100, 116, 139, 0.7)' : '#cbd5e1'
  }
});

const MESSAGE_TYPE_OPTIONS = [
  { key: 'update', label: 'Update', prefix: '[UPDATE]' },
  { key: 'eta', label: 'ETA', prefix: '[ETA]' },
  { key: 'alert', label: 'Alert', prefix: '[ALERT]' }
];

const normalizeThread = (thread, driversById) => {
  const driver = driversById.get(thread.driverId);
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const unreadCount = messages.filter(message => message.direction === 'incoming' && message.status !== 'read').length;
  return {
    driverId: thread.driverId,
    driverName: driver?.name || thread.driverId,
    live: String(driver?.live || '').trim() || 'Offline',
    messages,
    lastMessage: messages[messages.length - 1] || null,
    unreadCount
  };
};

const DispatchingMessageHub = () => {
  const { themeMode } = useLayoutContext();
  const isDarkMode = themeMode === 'dark';
  const surface = useMemo(() => buildSurface(isDarkMode), [isDarkMode]);
  const { data: session } = useSession();
  const { drivers, dispatchThreads, upsertDispatchThreadMessage, markDispatchThreadRead } = useNemtContext();

  const [searchText, setSearchText] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [messageText, setMessageText] = useState('');
  const [messageType, setMessageType] = useState('update');

  const driversById = useMemo(() => new Map((Array.isArray(drivers) ? drivers : []).map(driver => [driver.id, driver])), [drivers]);

  const threads = useMemo(() => {
    const normalizedThreads = (Array.isArray(dispatchThreads) ? dispatchThreads : [])
      .filter(thread => thread?.driverId)
      .map(thread => normalizeThread(thread, driversById));
    return normalizedThreads.sort((a, b) => {
      const aTime = a.lastMessage ? Date.parse(a.lastMessage.timestamp || '') : 0;
      const bTime = b.lastMessage ? Date.parse(b.lastMessage.timestamp || '') : 0;
      return bTime - aTime;
    });
  }, [dispatchThreads, driversById]);

  const filteredThreads = useMemo(() => {
    const normalized = searchText.trim().toLowerCase();
    if (!normalized) return threads;
    return threads.filter(thread => {
      const haystack = `${thread.driverName} ${thread.live} ${thread.lastMessage?.text || ''}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [searchText, threads]);

  const activeDriverId = selectedDriverId && filteredThreads.some(thread => thread.driverId === selectedDriverId)
    ? selectedDriverId
    : filteredThreads[0]?.driverId || '';

  const activeThread = filteredThreads.find(thread => thread.driverId === activeDriverId) || null;

  const handleSendMessage = () => {
    if (!activeDriverId) return;
    const normalizedText = messageText.trim();
    if (!normalizedText) return;
    const selectedType = MESSAGE_TYPE_OPTIONS.find(option => option.key === messageType) || MESSAGE_TYPE_OPTIONS[0];
    const text = `${selectedType.prefix} ${normalizedText}`;
    upsertDispatchThreadMessage({
      driverId: activeDriverId,
      message: {
        id: `dispatching-${Date.now()}`,
        direction: 'outgoing',
        text,
        timestamp: new Date().toISOString(),
        status: 'sent',
        senderName: String(session?.user?.name || session?.user?.email || 'Dispatching').trim() || 'Dispatching'
      }
    });
    setMessageText('');
  };

  return <Card className="h-100 overflow-hidden" style={surface.card}>
      <CardBody className="p-0 d-flex flex-column" style={{ minHeight: 540 }}>
        <div className="d-flex justify-content-between align-items-center px-3 py-2 gap-2" style={surface.header}>
          <div className="d-flex align-items-center gap-2">
            <strong>Dispatching Message Center</strong>
            <Badge bg="primary">New System</Badge>
          </div>
          <div className="small text-secondary">Threads: {threads.length}</div>
        </div>
        <div className="d-grid" style={{ gridTemplateColumns: '320px 1fr', gap: 12, padding: 12, minHeight: 0, flex: 1 }}>
          <div className="d-flex flex-column" style={surface.pane}>
            <div className="p-2 border-bottom">
              <Form.Control size="sm" value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Search driver or message" style={surface.input} />
            </div>
            <div className="flex-grow-1 overflow-auto p-2 d-flex flex-column gap-2">
              {filteredThreads.length > 0 ? filteredThreads.map(thread => {
              const isActive = thread.driverId === activeDriverId;
              return <button key={thread.driverId} type="button" onClick={() => {
                setSelectedDriverId(thread.driverId);
                markDispatchThreadRead(thread.driverId);
              }} className="text-start border rounded p-2 bg-transparent" style={isActive ? surface.activeThread : undefined}>
                      <div className="d-flex justify-content-between align-items-center gap-2">
                        <div className="fw-semibold text-truncate" style={{ maxWidth: 190 }}>{thread.driverName}</div>
                        {thread.unreadCount > 0 ? <Badge bg="danger">{thread.unreadCount}</Badge> : null}
                      </div>
                      <div className="small text-secondary text-truncate">{thread.lastMessage?.text || 'No messages yet'}</div>
                    </button>;
            }) : <div className="small text-secondary p-2">No threads available.</div>}
            </div>
          </div>
          <div className="d-flex flex-column" style={surface.pane}>
            <div className="px-3 py-2 border-bottom d-flex justify-content-between align-items-center gap-2">
              <div>
                <div className="fw-semibold">{activeThread?.driverName || 'Select a thread'}</div>
                <div className="small text-secondary">{activeThread?.live || 'No driver selected'}</div>
              </div>
              {activeThread ? <Button size="sm" variant="outline-secondary" onClick={() => markDispatchThreadRead(activeThread.driverId)}>Mark Read</Button> : null}
            </div>
            <div className="flex-grow-1 overflow-auto d-flex flex-column gap-2 p-3" style={{ minHeight: 0 }}>
              {activeThread?.messages?.length ? activeThread.messages.map(message => {
              const outgoing = message.direction === 'outgoing';
              return <div key={message.id} className={`d-flex ${outgoing ? 'justify-content-end' : 'justify-content-start'}`}>
                    <div className="px-3 py-2 rounded" style={{ maxWidth: '80%', ...(outgoing ? surface.messageOutgoing : surface.messageIncoming) }}>
                      <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{message.text || '[Attachment]'}</div>
                      <div className="mt-1" style={{ fontSize: 11, opacity: 0.85 }}>{formatDispatchTime(message.timestamp)}</div>
                    </div>
                  </div>;
            }) : <div className="small text-secondary">No messages in this thread.</div>}
            </div>
            <div className="border-top p-2 d-flex flex-column gap-2">
              <div className="d-flex gap-2">
                <Form.Select size="sm" value={messageType} onChange={event => setMessageType(event.target.value)} style={{ ...surface.input, maxWidth: 160 }}>
                  {MESSAGE_TYPE_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
                </Form.Select>
                <Form.Control size="sm" value={messageText} onChange={event => setMessageText(event.target.value)} placeholder="Write a dispatch message..." style={surface.input} onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSendMessage();
                }
              }} />
                <Button size="sm" onClick={handleSendMessage} disabled={!activeThread || !messageText.trim()}>Send</Button>
              </div>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>;
};

export default DispatchingMessageHub;