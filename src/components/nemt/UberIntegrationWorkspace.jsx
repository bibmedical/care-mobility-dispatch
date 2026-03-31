'use client';

import PageTitle from '@/components/PageTitle';
import { useLayoutContext } from '@/context/useLayoutContext';
import useUberIntegrationApi from '@/hooks/useUberIntegrationApi';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, Col, Form, Row, Spinner } from 'react-bootstrap';

const buildSurfaceStyles = isLight => ({
  card: {
    backgroundColor: isLight ? '#ffffff' : '#171b27',
    borderColor: isLight ? '#d5deea' : '#2a3144',
    color: isLight ? '#0f172a' : '#e6ecff'
  },
  input: {
    backgroundColor: isLight ? '#f8fbff' : '#101521',
    borderColor: isLight ? '#c8d4e6' : '#2a3144',
    color: isLight ? '#0f172a' : '#e6ecff'
  },
  button: {
    backgroundColor: isLight ? '#f3f7fc' : '#101521',
    borderColor: isLight ? '#c8d4e6' : '#2a3144',
    color: isLight ? '#0f172a' : '#e6ecff'
  }
});

const buildBlankDraft = () => ({
  organizationName: '',
  accountEmail: '',
  accountType: 'Uber Health',
  clientId: '',
  clientSecret: '',
  redirectUri: '',
  scopes: 'rides.read rides.request',
  notes: '',
  connectionStatus: 'Not configured',
  tokenStatus: 'No token',
  lastValidatedAt: '',
  lastCallbackAt: '',
  lastCallbackCode: ''
});

const UberIntegrationWorkspace = () => {
  const { themeMode } = useLayoutContext();
  const surfaceStyles = useMemo(() => buildSurfaceStyles(themeMode === 'light'), [themeMode]);
  const { data, loading, saving, error, refresh, saveData } = useUberIntegrationApi();
  const [draft, setDraft] = useState(buildBlankDraft());
  const [message, setMessage] = useState('Configura las credenciales de Uber y deja listo el callback para cuando tengas la cuenta autorizada.');

  useEffect(() => {
    if (!data?.uber) return;
    setDraft(current => ({
      ...buildBlankDraft(),
      ...data.uber,
      redirectUri: current.redirectUri || data.uber.redirectUri
    }));
  }, [data]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDraft(current => current.redirectUri ? current : {
      ...current,
      redirectUri: `${window.location.origin}/api/integrations/uber/callback`
    });
  }, []);

  const readiness = useMemo(() => {
    const completed = [draft.organizationName, draft.accountEmail, draft.clientId, draft.clientSecret, draft.redirectUri].filter(Boolean).length;
    return `${completed}/5 ready`;
  }, [draft]);

  const handleSave = async nextDraft => {
    try {
      const payload = await saveData({
        version: data?.version ?? 1,
        uber: nextDraft
      });
      setDraft(payload.uber);
      setMessage('Configuracion de Uber guardada.');
    } catch {
      return;
    }
  };

  const handleValidate = async () => {
    const nextDraft = {
      ...draft,
      lastValidatedAt: new Date().toISOString(),
      connectionStatus: draft.clientId && draft.clientSecret && draft.redirectUri ? 'Ready for OAuth handoff' : 'Missing required credentials',
      tokenStatus: draft.lastCallbackCode ? 'Authorization code captured' : draft.tokenStatus
    };
    await handleSave(nextDraft);
  };

  const handleOpenUberPortal = () => {
    if (typeof window !== 'undefined') {
      window.open('https://developer.uber.com/', '_blank', 'noopener,noreferrer');
    }
    setMessage('Se abrio Uber Developers para completar el alta de la app y registrar el redirect URI.');
  };

  const handleCopyCallback = async () => {
    if (typeof navigator === 'undefined' || !draft.redirectUri) return;
    await navigator.clipboard.writeText(draft.redirectUri);
    setMessage('Callback URL copiado. Pegalo tal cual en tu app de Uber Developers.');
  };

  return <>
      <PageTitle title="Uber Integration" subName="Integrations" />
      <Row className="g-3 mb-3">
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">Connection status</p>
              <h4 className="mb-0">{draft.connectionStatus}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">OAuth readiness</p>
              <h4 className="mb-0">{readiness}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">Token status</p>
              <h4 className="mb-0">{draft.tokenStatus}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">Last callback</p>
              <h4 className="mb-0">{draft.lastCallbackAt || 'Pending'}</h4>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Card style={surfaceStyles.card} className="border">
        <CardBody>
          <div className="d-flex flex-column flex-xl-row justify-content-between gap-3 mb-4">
            <div>
              <h5 className="mb-1">Integrations &gt; Uber</h5>
              <p className="text-secondary mb-2">Este flujo deja lista la configuracion local, el callback y el estado de conexion. Cuando tengas credenciales reales de Uber, solo faltara el intercambio de token final.</p>
              <div className="small text-secondary">{saving ? 'Saving Uber integration...' : message}</div>
            </div>
            <div className="d-flex flex-wrap gap-2 align-items-start">
              <Badge bg="success-subtle" text="success">{draft.accountType}</Badge>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={refresh} disabled={loading || saving}><IconifyIcon icon="iconoir:refresh-double" className="me-2" />Refresh</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={() => handleSave(draft)} disabled={saving}>Save</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={handleValidate} disabled={saving}>Validate setup</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={handleCopyCallback} disabled={!draft.redirectUri}>Copy callback</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={handleOpenUberPortal}>Open Uber Developers</Button>
            </div>
          </div>

          {error ? <Alert variant="danger" className="py-2">{error}</Alert> : null}
          {loading ? <div className="py-5 text-center text-secondary"><Spinner animation="border" size="sm" className="me-2" />Loading Uber integration...</div> : <Row className="g-3">
              <Col md={6}><Form.Label className="small text-uppercase text-secondary fw-semibold">Organization</Form.Label><Form.Control value={draft.organizationName} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, organizationName: event.target.value }))} /></Col>
              <Col md={6}><Form.Label className="small text-uppercase text-secondary fw-semibold">Account Email</Form.Label><Form.Control value={draft.accountEmail} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, accountEmail: event.target.value }))} /></Col>
              <Col md={4}><Form.Label className="small text-uppercase text-secondary fw-semibold">Account Type</Form.Label><Form.Select value={draft.accountType} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, accountType: event.target.value }))}><option>Uber Health</option><option>Uber for Business</option><option>Guest Rides</option></Form.Select></Col>
              <Col md={4}><Form.Label className="small text-uppercase text-secondary fw-semibold">Client ID</Form.Label><Form.Control value={draft.clientId} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, clientId: event.target.value }))} /></Col>
              <Col md={4}><Form.Label className="small text-uppercase text-secondary fw-semibold">Client Secret</Form.Label><Form.Control type="password" value={draft.clientSecret} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, clientSecret: event.target.value }))} /></Col>
              <Col md={8}><Form.Label className="small text-uppercase text-secondary fw-semibold">Redirect URI</Form.Label><Form.Control value={draft.redirectUri} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, redirectUri: event.target.value }))} /></Col>
              <Col md={4}><Form.Label className="small text-uppercase text-secondary fw-semibold">Scopes</Form.Label><Form.Control value={draft.scopes} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, scopes: event.target.value }))} /></Col>
              <Col md={12}><Form.Label className="small text-uppercase text-secondary fw-semibold">Notes</Form.Label><Form.Control as="textarea" rows={4} value={draft.notes} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} /></Col>
              <Col md={6}><div className="border rounded-3 p-3 h-100" style={surfaceStyles.input}><div className="small text-secondary mb-2">Callback endpoint</div><div>{draft.redirectUri || 'Pending browser origin'}</div><div className="small text-secondary mt-2">La ruta /api/integrations/uber/callback ya guarda el codigo de autorizacion si Uber redirige hacia esta app.</div></div></Col>
              <Col md={6}><div className="border rounded-3 p-3 h-100" style={surfaceStyles.input}><div className="small text-secondary mb-2">Last validation</div><div>{draft.lastValidatedAt || 'Not validated yet'}</div><div className="small text-secondary mt-2">Ultimo callback: {draft.lastCallbackAt || 'Pending'}<br />Authorization code: {draft.lastCallbackCode || 'Not captured yet'}</div></div></Col>
            </Row>}
        </CardBody>
      </Card>
    </>;
};

export default UberIntegrationWorkspace;