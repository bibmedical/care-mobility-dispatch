'use client';

import PageTitle from '@/components/PageTitle';
import { useLayoutContext } from '@/context/useLayoutContext';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, CardBody, Col, Form, Row, Spinner } from 'react-bootstrap';

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
  },
  code: {
    fontFamily: 'monospace',
    fontSize: 13,
    wordBreak: 'break-all',
    padding: '10px 12px',
    borderRadius: 10,
    backgroundColor: isLight ? '#f8fbff' : '#101521',
    border: `1px solid ${isLight ? '#d5deea' : '#2a3144'}`
  }
});

const buildBlankDraft = () => ({
  apiBaseUrl: '',
  notes: ''
});

const DriverAppRemoteConfigWorkspace = () => {
  const { themeMode } = useLayoutContext();
  const surfaceStyles = useMemo(() => buildSurfaceStyles(themeMode === 'light'), [themeMode]);
  const [draft, setDraft] = useState(buildBlankDraft());
  const [resolvedApiBaseUrl, setResolvedApiBaseUrl] = useState('');
  const [currentServiceOrigin, setCurrentServiceOrigin] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [updatedBy, setUpdatedBy] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('La APK puede leer esta config remota al arrancar para cambiar de API sin rebuild.');

  const bootstrapEndpoint = useMemo(() => {
    if (!currentServiceOrigin) return '';
    return `${currentServiceOrigin}/api/mobile/app-config`;
  }, [currentServiceOrigin]);

  const loadConfig = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/integrations/driver-app', {
        credentials: 'same-origin'
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to load driver app config.');
      }

      setDraft({
        ...buildBlankDraft(),
        ...payload?.driverApp,
        apiBaseUrl: String(payload?.driverApp?.apiBaseUrl || ''),
        notes: String(payload?.driverApp?.notes || '')
      });
      setResolvedApiBaseUrl(String(payload?.driverApp?.resolvedApiBaseUrl || ''));
      setCurrentServiceOrigin(String(payload?.driverApp?.currentServiceOrigin || ''));
      setUpdatedAt(String(payload?.driverApp?.updatedAt || ''));
      setUpdatedBy(String(payload?.driverApp?.updatedBy || ''));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load driver app config.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/integrations/driver-app', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          driverApp: draft
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to save driver app config.');
      }

      setDraft({
        ...buildBlankDraft(),
        ...payload?.driverApp,
        apiBaseUrl: String(payload?.driverApp?.apiBaseUrl || ''),
        notes: String(payload?.driverApp?.notes || '')
      });
      setResolvedApiBaseUrl(String(payload?.driverApp?.resolvedApiBaseUrl || ''));
      setCurrentServiceOrigin(String(payload?.driverApp?.currentServiceOrigin || ''));
      setUpdatedAt(String(payload?.driverApp?.updatedAt || ''));
      setUpdatedBy(String(payload?.driverApp?.updatedBy || ''));
      setMessage('Configuracion remota guardada. Las APK nuevas o abiertas de nuevo pueden tomar la URL activa sin rebuild.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save driver app config.');
    } finally {
      setSaving(false);
    }
  };

  return <>
      <PageTitle title="Driver App Remote Config" subName="Integrations" />
      <Row>
        <Col xl={8}>
          <Card style={surfaceStyles.card}>
            <CardBody>
              <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
                <div>
                  <h4 className="mb-1">API remota de la APK</h4>
                  <p className="mb-0 text-muted">Deja vacio el campo si quieres que la APK use este mismo servicio web como backend.</p>
                </div>
                {(loading || saving) && <Spinner animation="border" size="sm" />}
              </div>

              {error ? <Alert variant="danger">{error}</Alert> : null}
              {message ? <Alert variant="info">{message}</Alert> : null}

              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Driver API base URL</Form.Label>
                  <Form.Control style={surfaceStyles.input} type="url" placeholder="https://your-driver-api.onrender.com" value={draft.apiBaseUrl} onChange={event => setDraft(current => ({
                  ...current,
                  apiBaseUrl: event.target.value
                }))} />
                  <Form.Text className="text-muted">Usa una URL HTTPS publica. Si la vacias, la APK cae al origen actual de esta web.</Form.Text>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Notas</Form.Label>
                  <Form.Control style={surfaceStyles.input} as="textarea" rows={4} value={draft.notes} onChange={event => setDraft(current => ({
                  ...current,
                  notes: event.target.value
                }))} placeholder="Ejemplo: mover APK al clon de pruebas por rollout de mensajes." />
                </Form.Group>
              </Form>

              <div className="d-flex flex-wrap gap-2 mb-4">
                <Button variant="primary" onClick={() => void handleSave()} disabled={loading || saving}>Guardar</Button>
                <Button variant="outline-secondary" style={surfaceStyles.button} onClick={() => setDraft(current => ({
                ...current,
                apiBaseUrl: currentServiceOrigin
              }))} disabled={!currentServiceOrigin || loading || saving}>Usar esta web</Button>
                <Button variant="outline-secondary" style={surfaceStyles.button} onClick={() => setDraft(current => ({
                ...current,
                apiBaseUrl: ''
              }))} disabled={loading || saving}>Reset al origen actual</Button>
                <Button variant="outline-secondary" style={surfaceStyles.button} onClick={() => void loadConfig()} disabled={loading || saving}>Recargar</Button>
              </div>

              <Row className="g-3">
                <Col md={12}>
                  <div style={surfaceStyles.code}>
                    <strong>API resuelta para la APK</strong>
                    <div>{resolvedApiBaseUrl || 'No resolved API base URL yet.'}</div>
                  </div>
                </Col>
                <Col md={12}>
                  <div style={surfaceStyles.code}>
                    <strong>Bootstrap endpoint fijo</strong>
                    <div>{bootstrapEndpoint || 'No bootstrap endpoint yet.'}</div>
                  </div>
                </Col>
                <Col md={12}>
                  <div style={surfaceStyles.code}>
                    <strong>Origen actual de esta web</strong>
                    <div>{currentServiceOrigin || 'No current service origin yet.'}</div>
                  </div>
                </Col>
              </Row>

              {(updatedAt || updatedBy) ? <p className="mt-3 mb-0 text-muted">Ultima actualizacion: {updatedAt || '-'}{updatedBy ? ` por ${updatedBy}` : ''}</p> : null}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </>;
};

export default DriverAppRemoteConfigWorkspace;
