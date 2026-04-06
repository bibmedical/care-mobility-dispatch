'use client';

import PageTitle from '@/components/PageTitle';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
import { useLayoutContext } from '@/context/useLayoutContext';
import useAiIntegrationApi from '@/hooks/useAiIntegrationApi';
import useAvatarSettingsApi from '@/hooks/useAvatarSettingsApi';
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
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 24,
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: '1px solid transparent'
  }
});

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

const buildStatusPillStyle = (pillStyle, active) => ({
  ...pillStyle,
  backgroundColor: active ? 'rgba(33, 186, 115, 0.18)' : 'rgba(255, 193, 7, 0.18)',
  borderColor: active ? 'rgba(33, 186, 115, 0.42)' : 'rgba(255, 193, 7, 0.42)',
  color: active ? '#7ef0b1' : '#ffd76a'
});

const EMPTY_KNOWLEDGE = {
  documents: [],
  totals: {
    documents: 0,
    chunks: 0,
    characters: 0
  }
};

const AiIntegrationWorkspace = () => {
  const { themeMode } = useLayoutContext();
  const surfaceStyles = useMemo(() => buildSurfaceStyles(themeMode === 'light'), [themeMode]);
  const { data, loading, saving, error, refresh, saveData } = useAiIntegrationApi();
  const {
    data: avatarData,
    loading: avatarLoading,
    saving: avatarSaving,
    error: avatarError,
    refresh: refreshAvatar,
    saveData: saveAvatarData
  } = useAvatarSettingsApi();
  const [draft, setDraft] = useState(buildBlankDraft());
  const [message, setMessage] = useState('Pega aqui tu OpenAI API key para que el asistente de la esquina responda con IA real en lugar del modo basico.');
  const [showKey, setShowKey] = useState(false);
  const [assistantVisible, setAssistantVisible] = useState(true);
  const [knowledgeData, setKnowledgeData] = useState(EMPTY_KNOWLEDGE);
  const [knowledgeLoading, setKnowledgeLoading] = useState(true);
  const [knowledgeUploading, setKnowledgeUploading] = useState(false);
  const [knowledgeDeletingId, setKnowledgeDeletingId] = useState('');

  useEffect(() => {
    if (!data?.ai) return;
    setDraft({
      ...buildBlankDraft(),
      ...data.ai
    });
  }, [data]);

  useEffect(() => {
    if (!avatarData?.avatar) return;
    setAssistantVisible(avatarData.avatar.visible !== false);
  }, [avatarData]);

  const readiness = useMemo(() => buildConnectionStatus(draft), [draft]);
  const pageLoading = loading || avatarLoading;
  const pageSaving = saving || avatarSaving;
  const pageError = error || avatarError;

  const buildAvatarPayload = visible => ({
    name: String(avatarData?.avatar?.name || draft.avatarName || ''),
    image: String(avatarData?.avatar?.image || draft.avatarImage || ''),
    memoryNotes: String(avatarData?.avatar?.memoryNotes || draft.memoryNotes || ''),
    visible,
    memorySections: {
      patients: String(avatarData?.avatar?.memorySections?.patients || draft.memorySections?.patients || ''),
      drivers: String(avatarData?.avatar?.memorySections?.drivers || draft.memorySections?.drivers || ''),
      rules: String(avatarData?.avatar?.memorySections?.rules || draft.memorySections?.rules || ''),
      phones: String(avatarData?.avatar?.memorySections?.phones || draft.memorySections?.phones || '')
    }
  });

  const refreshKnowledge = async () => {
    setKnowledgeLoading(true);
    try {
      const response = await fetch('/api/assistant/knowledge', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to load knowledge documents');
      setKnowledgeData({
        documents: Array.isArray(payload?.documents) ? payload.documents : [],
        totals: payload?.totals || EMPTY_KNOWLEDGE.totals
      });
    } catch (knowledgeError) {
      setMessage(knowledgeError.message || 'No se pudo cargar la memoria documental.');
    } finally {
      setKnowledgeLoading(false);
    }
  };

  useEffect(() => {
    refreshKnowledge();
  }, []);

  const handleSave = async nextDraft => {
    try {
      const payload = await saveData({
        ai: nextDraft
      });
      setDraft(payload.ai);
      setMessage('AI configuration saved. The widget can now use this key.');
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

  const handleRefresh = async () => {
    await Promise.all([refresh(), refreshAvatar(), refreshKnowledge()]);
  };

  const handleAssistantVisibilityChange = async event => {
    const nextVisible = event.target.checked;
    setAssistantVisible(nextVisible);
    try {
      await saveAvatarData(buildAvatarPayload(nextVisible));
      setMessage(nextVisible ? 'La IA flotante ya esta visible en pantalla.' : 'La IA flotante se escondio de la pantalla.');
    } catch {
      setAssistantVisible(!nextVisible);
    }
  };

  const handleKnowledgeUpload = async event => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setKnowledgeUploading(true);
    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });
      const response = await fetch('/api/assistant/knowledge', {
        method: 'POST',
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to upload documents');
      setKnowledgeData({
        documents: Array.isArray(payload?.documents) ? payload.documents : [],
        totals: payload?.totals || EMPTY_KNOWLEDGE.totals
      });
      setMessage(`${Array.isArray(payload?.uploadedDocuments) ? payload.uploadedDocuments.length : files.length} documento(s) agregados a la memoria de la IA.`);
    } catch (uploadError) {
      setMessage(uploadError.message || 'No se pudo subir el documento.');
    } finally {
      event.target.value = '';
      setKnowledgeUploading(false);
    }
  };

  const handleKnowledgeDelete = async documentId => {
    setKnowledgeDeletingId(documentId);
    try {
      const response = await fetch(`/api/assistant/knowledge?id=${encodeURIComponent(documentId)}`, {
        method: 'DELETE'
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to delete knowledge document');
      setKnowledgeData({
        documents: Array.isArray(payload?.documents) ? payload.documents : [],
        totals: payload?.totals || EMPTY_KNOWLEDGE.totals
      });
      setMessage('Documento removido de la memoria de la IA.');
    } catch (deleteError) {
      setMessage(deleteError.message || 'No se pudo borrar el documento.');
    } finally {
      setKnowledgeDeletingId('');
    }
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
              <div className="small text-secondary">{pageSaving ? 'Saving AI integration...' : message}</div>
            </div>
            <div className="d-flex flex-wrap gap-2 align-items-start">
              <span style={buildStatusPillStyle(surfaceStyles.pill, draft.enabled)}>{draft.enabled ? 'Enabled' : 'Disabled'}</span>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={handleRefresh} disabled={pageLoading || pageSaving || knowledgeLoading || knowledgeUploading}><IconifyIcon icon="iconoir:refresh-double" className="me-2" />Refresh</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={() => handleSave({
              ...draft,
              connectionStatus: readiness
            })} disabled={pageSaving}>Save</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={handleValidate} disabled={pageSaving}>Validate setup</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={handleOpenPortal}>Open OpenAI</Button>
            </div>
          </div>

          {pageError ? <Alert variant="danger" className="py-2">{pageError}</Alert> : null}
          {pageLoading ? <div className="py-5 text-center text-secondary"><Spinner animation="border" size="sm" className="me-2" />Loading AI integration...</div> : <Row className="g-3">
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
              <Col md={4} className="d-flex flex-column justify-content-end gap-3">
                <Form.Check type="switch" id="ai-enabled" label="Enable AI assistant" checked={draft.enabled} onChange={event => setDraft(current => ({
                ...current,
                enabled: event.target.checked
              }))} />
                <Form.Check type="switch" id="assistant-visible" label={assistantVisible ? 'Mostrar IA en pantalla' : 'IA escondida de la pantalla'} checked={assistantVisible} onChange={handleAssistantVisibilityChange} disabled={avatarSaving} />
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
                <div className="small text-secondary mt-2">The key is stored in your project's local storage so the AI widget can use it without depending on <code>.env.local</code>.</div>
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
                    <span style={buildStatusPillStyle(surfaceStyles.pill, readiness === 'Ready')}>{readiness}</span>
                  </div>
                  <div className="small text-secondary">Tip: use this switch to hide or show the AI widget from the corner without leaving this page.</div>
                </div>
              </Col>
            </Row>}
        </CardBody>
      </Card>

      <Card style={surfaceStyles.card} className="border mt-3">
        <CardBody>
          <div className="d-flex flex-column flex-xl-row justify-content-between gap-3 mb-4">
            <div>
              <h5 className="mb-1">Document Memory</h5>
              <p className="text-secondary mb-2">Sube libros, manuales, diccionarios o instrucciones en PDF, TXT, MD o CSV. El asistente local y el modo con OpenAI podran buscar en ese contenido al responder.</p>
              <div className="small text-secondary">Documentos: {knowledgeData.totals.documents} | Chunks: {knowledgeData.totals.chunks} | Caracteres: {knowledgeData.totals.characters}</div>
            </div>
            <div className="d-flex flex-wrap gap-2 align-items-start">
              <Form.Control type="file" accept=".pdf,.txt,.md,.csv" multiple onChange={handleKnowledgeUpload} disabled={knowledgeUploading} style={{ maxWidth: 320, ...surfaceStyles.input }} />
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={refreshKnowledge} disabled={knowledgeLoading || knowledgeUploading}>Refresh docs</Button>
            </div>
          </div>

          {knowledgeUploading ? <Alert variant="info" className="py-2">Procesando documento y extrayendo texto...</Alert> : null}
          {knowledgeLoading ? <div className="py-5 text-center text-secondary"><Spinner animation="border" size="sm" className="me-2" />Loading document memory...</div> : <Row className="g-3">
              {knowledgeData.documents.length === 0 ? <Col xs={12}>
                  <div className="border rounded-3 p-4 text-secondary" style={surfaceStyles.input}>Todavia no hay documentos cargados. Cuando subas un PDF o TXT, la IA podra consultarlo como memoria local persistente.</div>
                </Col> : knowledgeData.documents.map(document => <Col md={6} xl={4} key={document.id}>
                    <div className="border rounded-3 p-3 h-100 d-flex flex-column gap-3" style={surfaceStyles.input}>
                      <div>
                        <div className="fw-semibold">{document.title || document.fileName}</div>
                        <div className="small text-secondary">{document.fileName}</div>
                      </div>
                      <div className="small text-secondary">{document.summary || 'No summary available.'}</div>
                      <div className="small text-secondary">Chunks: {document.chunkCount} | Caracteres: {document.charCount}</div>
                      <div className="small text-secondary">Subido: {document.uploadedAt ? new Date(document.uploadedAt).toLocaleString() : 'Pending'}</div>
                      <div className="d-flex flex-wrap gap-2 mt-auto">
                        <Button as="a" href={`/api/files/local?path=${encodeURIComponent(document.relativePath)}`} target="_blank" rel="noreferrer" style={surfaceStyles.button} size="sm">Open file</Button>
                        <Button variant="outline-danger" size="sm" onClick={() => handleKnowledgeDelete(document.id)} disabled={knowledgeDeletingId === document.id}>{knowledgeDeletingId === document.id ? 'Deleting...' : 'Delete'}</Button>
                      </div>
                    </div>
                  </Col>)}
            </Row>}
        </CardBody>
      </Card>
    </>;
};

export default AiIntegrationWorkspace;