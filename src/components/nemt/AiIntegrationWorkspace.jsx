'use client';

import PageTitle from '@/components/PageTitle';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
import useAiIntegrationApi from '@/hooks/useAiIntegrationApi';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, Col, Form, Row, Spinner } from 'react-bootstrap';

const surfaceStyles = {
  card: {
    backgroundColor: '#171b27',
    borderColor: '#2a3144',
    color: '#e6ecff'
  },
  input: {
    backgroundColor: '#101521',
    borderColor: '#2a3144',
    color: '#e6ecff'
  },
  button: {
    backgroundColor: '#101521',
    borderColor: '#2a3144',
    color: '#e6ecff'
  }
};

const buildBlankDraft = () => ({
  provider: 'openai',
  enabled: false,
  apiKey: '',
  model: 'gpt-5.4-nano',
  notes: '',
  connectionStatus: 'Not configured',
  lastValidatedAt: ''
});

const buildConnectionStatus = draft => {
  if (!draft.enabled) return 'Disabled';
  if (!draft.apiKey.trim()) return 'Missing API key';
  return 'Ready';
};

const AiIntegrationWorkspace = () => {
  const { data, loading, saving, error, refresh, saveData } = useAiIntegrationApi();
  const [draft, setDraft] = useState(buildBlankDraft());
  const [message, setMessage] = useState('Pega aqui tu OpenAI API key para que el asistente de la esquina responda con IA real en lugar del modo basico.');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (!data?.ai) return;
    setDraft({
      ...buildBlankDraft(),
      ...data.ai
    });
  }, [data]);

  const readiness = useMemo(() => buildConnectionStatus(draft), [draft]);

  const handleSave = async nextDraft => {
    try {
      const payload = await saveData({
        ai: nextDraft
      });
      setDraft(payload.ai);
      setMessage('Configuracion AI guardada. El widget ya puede usar esta clave.');
    } catch {
      return;
    }
  };

  const handleValidate = async () => {
    const nextDraft = {
      ...draft,
      connectionStatus: buildConnectionStatus(draft),
      lastValidatedAt: new Date().toISOString()
    };
    await handleSave(nextDraft);
  };

  const handleOpenPortal = () => {
    if (typeof window === 'undefined') return;
    window.open('https://platform.openai.com/api-keys', '_blank', 'noopener,noreferrer');
    setMessage('Se abrio OpenAI API Keys para crear o copiar tu llave.');
  };

  return <>
      <PageTitle title="AI Integration" subName="Integrations" />
      <Row className="g-3 mb-3">
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">Provider</p>
              <h4 className="mb-0 text-uppercase">{draft.provider}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">Status</p>
              <h4 className="mb-0">{readiness}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">Model</p>
              <h4 className="mb-0">{draft.model || 'Pending'}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">Last validation</p>
              <h4 className="mb-0">{draft.lastValidatedAt || 'Pending'}</h4>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Card style={surfaceStyles.card} className="border">
        <CardBody>
          <div className="d-flex flex-column flex-xl-row justify-content-between gap-3 mb-4">
            <div>
              <h5 className="mb-1">Integrations &gt; AI Assistant</h5>
              <p className="text-secondary mb-2">Guarda aqui la llave de OpenAI y el modelo que quieres usar. El bot flotante tomara esta configuracion automaticamente.</p>
              <div className="small text-secondary">{saving ? 'Saving AI integration...' : message}</div>
            </div>
            <div className="d-flex flex-wrap gap-2 align-items-start">
              <Badge bg={draft.enabled ? 'success-subtle' : 'secondary'} text={draft.enabled ? 'success' : 'light'}>{draft.enabled ? 'Enabled' : 'Disabled'}</Badge>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={refresh} disabled={loading || saving}><IconifyIcon icon="iconoir:refresh-double" className="me-2" />Refresh</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={() => handleSave({
              ...draft,
              connectionStatus: readiness
            })} disabled={saving}>Save</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={handleValidate} disabled={saving}>Validate setup</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={handleOpenPortal}>Open OpenAI</Button>
            </div>
          </div>

          {error ? <Alert variant="danger" className="py-2">{error}</Alert> : null}
          {loading ? <div className="py-5 text-center text-secondary"><Spinner animation="border" size="sm" className="me-2" />Loading AI integration...</div> : <Row className="g-3">
              <Col md={4}>
                <Form.Label className="small text-uppercase text-secondary fw-semibold">Provider</Form.Label>
                <Form.Select value={draft.provider} style={surfaceStyles.input} onChange={event => setDraft(current => ({
                ...current,
                provider: event.target.value
              }))}>
                  <option value="openai">OpenAI</option>
                </Form.Select>
              </Col>
              <Col md={4}>
                <Form.Label className="small text-uppercase text-secondary fw-semibold">Model</Form.Label>
                <Form.Control value={draft.model} style={surfaceStyles.input} onChange={event => setDraft(current => ({
                ...current,
                model: event.target.value
              }))} placeholder="gpt-5.4-nano" />
              </Col>
              <Col md={4} className="d-flex align-items-end">
                <Form.Check type="switch" id="ai-enabled" label="Enable AI assistant" checked={draft.enabled} onChange={event => setDraft(current => ({
                ...current,
                enabled: event.target.checked
              }))} />
              </Col>
              <Col md={12}>
                <Form.Label className="small text-uppercase text-secondary fw-semibold">OpenAI API Key</Form.Label>
                <div className="d-flex gap-2">
                  <Form.Control type={showKey ? 'text' : 'password'} value={draft.apiKey} style={surfaceStyles.input} onChange={event => setDraft(current => ({
                  ...current,
                  apiKey: event.target.value
                }))} placeholder="sk-..." />
                  <Button style={surfaceStyles.button} onClick={() => setShowKey(current => !current)}>{showKey ? 'Hide' : 'Show'}</Button>
                </div>
                <div className="small text-secondary mt-2">La clave se guarda en tu almacenamiento local del proyecto para que el widget AI la use sin depender de `.env.local`.</div>
              </Col>
              <Col md={12}>
                <Form.Label className="small text-uppercase text-secondary fw-semibold">Notes</Form.Label>
                <Form.Control as="textarea" rows={3} value={draft.notes} style={surfaceStyles.input} onChange={event => setDraft(current => ({
                ...current,
                notes: event.target.value
              }))} placeholder="Ejemplo: usar este modelo para dispatcher y respuestas cortas." />
              </Col>
              <Col md={12}>
                <div className="border rounded-3 p-3 h-100" style={surfaceStyles.input}>
                  <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                    <div>
                      <div className="small text-secondary">Assistant behavior</div>
                      <div>Cuando esta integracion este activa, el widget flotante usara esta llave y este modelo. Si la IA esta desactivada o no hay llave, seguira usando el modo basico.</div>
                    </div>
                    <Badge bg={readiness === 'Ready' ? 'success' : 'warning'} text={readiness === 'Ready' ? 'success' : 'dark'}>{readiness}</Badge>
                  </div>
                  <div className="small text-secondary">Tip: despues de guardar, abre el bot flotante y haz una pregunta sobre viajes o modulos de la web para confirmar que ya responde con IA real.</div>
                </div>
              </Col>
            </Row>}
        </CardBody>
      </Card>
    </>;
};

export default AiIntegrationWorkspace;