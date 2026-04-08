'use client';

import DispatchingMessageHub from '@/components/nemt/DispatchingMessageHub';
import TripDashboardWorkspace from '@/components/nemt/TripDashboardWorkspace';
import { useNemtContext } from '@/context/useNemtContext';
import { useMemo, useState } from 'react';
import { Badge, Button, ButtonGroup, Card, CardBody, Form, Modal, ToggleButton } from 'react-bootstrap';

const DISPATCHING2_LAYOUT_PRESETS = [
  {
    id: 'full-workspace',
    label: 'Full workspace',
    description: 'Trip A + Trip B arriba, mensajeria abajo.',
    showBoardA: true,
    showBoardB: true,
    showMessages: true,
    gridTemplateColumns: '1fr 1fr',
    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
    boardAArea: '1 / 1 / 2 / 2',
    boardBArea: '1 / 2 / 2 / 3',
    messagesArea: '2 / 1 / 3 / 3'
  },
  {
    id: 'dispatch-focus',
    label: 'Dispatch focus',
    description: 'Trip A + mensajeria en paralelo.',
    showBoardA: true,
    showBoardB: false,
    showMessages: true,
    gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)',
    gridTemplateRows: 'minmax(0, 1fr)',
    boardAArea: '1 / 1 / 2 / 2',
    boardBArea: '1 / 1 / 2 / 2',
    messagesArea: '1 / 2 / 2 / 3'
  },
  {
    id: 'boards-only',
    label: 'Boards only',
    description: 'Solo los dos Trip Boards.',
    showBoardA: true,
    showBoardB: true,
    showMessages: false,
    gridTemplateColumns: '1fr 1fr',
    gridTemplateRows: 'minmax(0, 1fr)',
    boardAArea: '1 / 1 / 2 / 2',
    boardBArea: '1 / 2 / 2 / 3',
    messagesArea: '1 / 1 / 2 / 3'
  },
  {
    id: 'messages-priority',
    label: 'Messages priority',
    description: 'Mensajeria arriba + dos boards abajo.',
    showBoardA: true,
    showBoardB: true,
    showMessages: true,
    gridTemplateColumns: '1fr 1fr',
    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
    boardAArea: '2 / 1 / 3 / 2',
    boardBArea: '2 / 2 / 3 / 3',
    messagesArea: '1 / 1 / 2 / 3'
  },
  {
    id: 'stacked',
    label: 'Stacked',
    description: 'Trip A, Trip B, mensajeria en vertical.',
    showBoardA: true,
    showBoardB: true,
    showMessages: true,
    gridTemplateColumns: '1fr',
    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
    boardAArea: '1 / 1 / 2 / 2',
    boardBArea: '2 / 1 / 3 / 2',
    messagesArea: '3 / 1 / 4 / 2'
  }
];

const getDispatching2Preset = presetId => DISPATCHING2_LAYOUT_PRESETS.find(preset => preset.id === presetId) || DISPATCHING2_LAYOUT_PRESETS[0];

const DispatchingWorkspace = ({ title = 'Dispatching', advancedLayouts = false }) => {
  const [activeView, setActiveView] = useState('board-a');
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [presetId, setPresetId] = useState('full-workspace');
  const [showBoardA, setShowBoardA] = useState(true);
  const [showBoardB, setShowBoardB] = useState(true);
  const [showMessages, setShowMessages] = useState(true);
  const { dispatchThreads } = useNemtContext();

  const unreadCount = (Array.isArray(dispatchThreads) ? dispatchThreads : []).reduce((total, thread) => {
    const incomingUnread = (Array.isArray(thread?.messages) ? thread.messages : []).filter(message => {
      return message.direction === 'incoming' && message.status !== 'read';
    }).length;
    return total + incomingUnread;
  }, 0);

  const activePreset = useMemo(() => getDispatching2Preset(presetId), [presetId]);

  const applyPreset = nextPresetId => {
    const preset = getDispatching2Preset(nextPresetId);
    setPresetId(preset.id);
    setShowBoardA(preset.showBoardA);
    setShowBoardB(preset.showBoardB);
    setShowMessages(preset.showMessages);
  };

  const canRenderWorkspace = advancedLayouts && activeView === 'workspace';

  return <div className="d-flex flex-column gap-2">
      <div className="d-flex justify-content-between align-items-center px-2 py-1 border rounded-3 bg-body-tertiary">
        <div className="d-flex align-items-center gap-2">
          <strong style={{ fontSize: '0.92rem' }}>{title}</strong>
          <Badge bg="secondary">Trip Dashboard x2</Badge>
          <Badge bg={unreadCount > 0 ? 'danger' : 'success'}>{unreadCount} unread</Badge>
          {advancedLayouts ? <Badge bg="dark">Advanced Layouts</Badge> : null}
        </div>
        <ButtonGroup size="sm">
          {advancedLayouts ? <ToggleButton id="dispatching-view-workspace" type="radio" variant={activeView === 'workspace' ? 'primary' : 'outline-primary'} name="dispatching-view" value="workspace" checked={activeView === 'workspace'} onChange={() => setActiveView('workspace')}>
              Workspace
            </ToggleButton> : null}
          <ToggleButton id="dispatching-view-board-a" type="radio" variant={activeView === 'board-a' ? 'primary' : 'outline-primary'} name="dispatching-view" value="board-a" checked={activeView === 'board-a'} onChange={() => setActiveView('board-a')}>
            Trip Board A
          </ToggleButton>
          <ToggleButton id="dispatching-view-board-b" type="radio" variant={activeView === 'board-b' ? 'primary' : 'outline-primary'} name="dispatching-view" value="board-b" checked={activeView === 'board-b'} onChange={() => setActiveView('board-b')}>
            Trip Board B
          </ToggleButton>
          <ToggleButton id="dispatching-view-messages" type="radio" variant={activeView === 'messages' ? 'primary' : 'outline-primary'} name="dispatching-view" value="messages" checked={activeView === 'messages'} onChange={() => setActiveView('messages')}>
            Message Center
          </ToggleButton>
          {advancedLayouts ? <Button variant="outline-dark" size="sm" onClick={() => setShowLayoutModal(true)}>Layout</Button> : null}
        </ButtonGroup>
      </div>

      {canRenderWorkspace ? <Card className="h-100" style={{ minHeight: 'calc(100dvh - 150px)' }}>
          <CardBody className="p-2" style={{ minHeight: 0 }}>
            <div style={{
            display: 'grid',
            gap: 8,
            minHeight: 'calc(100dvh - 180px)',
            gridTemplateColumns: activePreset.gridTemplateColumns,
            gridTemplateRows: activePreset.gridTemplateRows
          }}>
              {showBoardA ? <div style={{ gridArea: activePreset.boardAArea, minHeight: 0, overflow: 'auto' }}>
                  <TripDashboardWorkspace key={`${title}-workspace-board-a`} />
                </div> : null}
              {showBoardB ? <div style={{ gridArea: activePreset.boardBArea, minHeight: 0, overflow: 'auto' }}>
                  <TripDashboardWorkspace key={`${title}-workspace-board-b`} />
                </div> : null}
              {showMessages ? <div style={{ gridArea: activePreset.messagesArea, minHeight: 0, overflow: 'auto' }}>
                  <DispatchingMessageHub key={`${title}-workspace-messages`} />
                </div> : null}
            </div>
          </CardBody>
        </Card> : activeView === 'messages' ? <DispatchingMessageHub key={`${title}-messages`} /> : <TripDashboardWorkspace key={`${title}-${activeView}`} />}

      {advancedLayouts ? <Modal show={showLayoutModal} onHide={() => setShowLayoutModal(false)} centered>
          <Modal.Header closeButton>
            <Modal.Title>Dispatching 2 Layout</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="small text-muted mb-3">Choose style presets with different panel positions.</div>
            <div className="d-flex flex-column gap-2 mb-3">
              {DISPATCHING2_LAYOUT_PRESETS.map(preset => <button
                key={preset.id}
                type="button"
                className="btn btn-sm text-start"
                style={{
                border: preset.id === activePreset.id ? '1px solid #0f766e' : '1px solid #d1d5db',
                backgroundColor: preset.id === activePreset.id ? '#123247' : '#0f172a',
                color: '#e5eefc'
              }}
                onClick={() => applyPreset(preset.id)}
              >
                <div className="fw-semibold">{preset.label}</div>
                <div className="small text-muted">{preset.description}</div>
              </button>)}
            </div>

            <div className="small text-uppercase text-muted fw-semibold mb-2">Custom visibility</div>
            <div className="d-flex flex-column gap-2">
              <Form.Check type="switch" id="dispatching2-toggle-board-a" label="Trip Board A" checked={showBoardA} onChange={event => setShowBoardA(event.target.checked)} />
              <Form.Check type="switch" id="dispatching2-toggle-board-b" label="Trip Board B" checked={showBoardB} onChange={event => setShowBoardB(event.target.checked)} />
              <Form.Check type="switch" id="dispatching2-toggle-messages" label="Driver Messaging" checked={showMessages} onChange={event => setShowMessages(event.target.checked)} />
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => applyPreset('full-workspace')}>Restore full workspace</Button>
            <Button variant="dark" onClick={() => setShowLayoutModal(false)}>Close</Button>
          </Modal.Footer>
        </Modal> : null}
    </div>;
};

export default DispatchingWorkspace;