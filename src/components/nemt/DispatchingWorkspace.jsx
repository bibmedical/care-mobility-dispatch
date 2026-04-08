'use client';

import DispatchingMessageHub from '@/components/nemt/DispatchingMessageHub';
import TripDashboardWorkspace from '@/components/nemt/TripDashboardWorkspace';
import { useNemtContext } from '@/context/useNemtContext';
import { useState } from 'react';
import { Badge, ButtonGroup, ToggleButton } from 'react-bootstrap';

const DispatchingWorkspace = ({ title = 'Dispatching' }) => {
  const [activeView, setActiveView] = useState('board-a');
  const { dispatchThreads } = useNemtContext();

  const unreadCount = (Array.isArray(dispatchThreads) ? dispatchThreads : []).reduce((total, thread) => {
    const incomingUnread = (Array.isArray(thread?.messages) ? thread.messages : []).filter(message => {
      return message.direction === 'incoming' && message.status !== 'read';
    }).length;
    return total + incomingUnread;
  }, 0);

  return <div className="d-flex flex-column gap-2">
      <div className="d-flex justify-content-between align-items-center px-2 py-1 border rounded-3 bg-body-tertiary">
        <div className="d-flex align-items-center gap-2">
          <strong style={{ fontSize: '0.92rem' }}>{title}</strong>
          <Badge bg="secondary">Trip Dashboard x2</Badge>
          <Badge bg={unreadCount > 0 ? 'danger' : 'success'}>{unreadCount} unread</Badge>
        </div>
        <ButtonGroup size="sm">
          <ToggleButton id="dispatching-view-board-a" type="radio" variant={activeView === 'board-a' ? 'primary' : 'outline-primary'} name="dispatching-view" value="board-a" checked={activeView === 'board-a'} onChange={() => setActiveView('board-a')}>
            Trip Board A
          </ToggleButton>
          <ToggleButton id="dispatching-view-board-b" type="radio" variant={activeView === 'board-b' ? 'primary' : 'outline-primary'} name="dispatching-view" value="board-b" checked={activeView === 'board-b'} onChange={() => setActiveView('board-b')}>
            Trip Board B
          </ToggleButton>
          <ToggleButton id="dispatching-view-messages" type="radio" variant={activeView === 'messages' ? 'primary' : 'outline-primary'} name="dispatching-view" value="messages" checked={activeView === 'messages'} onChange={() => setActiveView('messages')}>
            Message Center
          </ToggleButton>
        </ButtonGroup>
      </div>
      {activeView === 'messages' ? <DispatchingMessageHub key={`${title}-messages`} /> : <TripDashboardWorkspace key={`${title}-${activeView}`} />}
    </div>;
};

export default DispatchingWorkspace;