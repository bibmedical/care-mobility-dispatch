'use client';

import PageTitle from '@/components/PageTitle';
import { useLayoutContext } from '@/context/useLayoutContext';
import { DEFAULT_ASSISTANT_AVATAR } from '@/helpers/nemt-dispatch-state';
import useAvatarSettingsApi from '@/hooks/useAvatarSettingsApi';
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

const AVATAR_PRESETS = [DEFAULT_ASSISTANT_AVATAR.image, '/ai-avatar/cartoon-owner.svg', '/app.png'];

const buildDraft = avatar => ({
  name: String(avatar?.name || DEFAULT_ASSISTANT_AVATAR.name),
  image: String(avatar?.image || DEFAULT_ASSISTANT_AVATAR.image),
  memoryNotes: String(avatar?.memoryNotes || ''),
  visible: avatar?.visible !== false,
  memorySections: {
    patients: String(avatar?.memorySections?.patients || ''),
    drivers: String(avatar?.memorySections?.drivers || ''),
    rules: String(avatar?.memorySections?.rules || ''),
    phones: String(avatar?.memorySections?.phones || '')
  }
});

const AvatarSettingsWorkspace = ({
  embedded = false,
  pageTitle = 'Avatar',
  pageSubName = 'Settings',
  settingsPathLabel = 'Settings > Avatar'
}) => {
  const { data, loading, saving, error, refresh, saveData } = useAvatarSettingsApi();
  const { changeTheme, themeMode } = useLayoutContext();
  const surfaceStyles = useMemo(() => buildSurfaceStyles(themeMode === 'light'), [themeMode]);
  const [draft, setDraft] = useState(buildDraft());
  const [message, setMessage] = useState('Change the assistant name and photo. The floating widget will update automatically.');

  useEffect(() => {
    if (!data?.avatar) return;
    setDraft(buildDraft(data.avatar));
  }, [data]);

  const previewImage = useMemo(() => draft.image.trim() || DEFAULT_ASSISTANT_AVATAR.image, [draft.image]);

  const handleSave = async () => {
    const payload = await saveData({
      name: draft.name,
      image: draft.image,
      memoryNotes: draft.memoryNotes,
      visible: draft.visible,
      memorySections: draft.memorySections
    });
    setDraft(buildDraft(payload.avatar));
    setMessage('Avatar saved. The widget will now show the new name and photo.');
  };

  const handlePickFile = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '').trim();
      if (!result) return;
      setDraft(current => ({
        ...current,
        image: result
      }));
      setMessage(`Image loaded: ${file.name}. Save to apply it to the widget.`);
    };
    reader.readAsDataURL(file);
  };

    return <>
      {embedded ? null : <PageTitle title={pageTitle} subName={pageSubName} />}
      <Row className="g-3 mb-3">
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">Assistant name</p>
              <h4 className="mb-0">{draft.name || DEFAULT_ASSISTANT_AVATAR.name}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">Image source</p>
              <h4 className="mb-0">{previewImage.startsWith('data:') ? 'Uploaded file' : 'Public path'}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">Updated</p>
              <h4 className="mb-0">{data?.avatar?.updatedAt || 'Pending'}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">Widget</p>
              <h4 className="mb-0">{draft.visible ? 'Visible' : 'Hidden'}</h4>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Card style={surfaceStyles.card} className="border">
        <CardBody>
          <div className="d-flex flex-column flex-xl-row justify-content-between gap-3 mb-4">
            <div>
              <h5 className="mb-1">{settingsPathLabel}</h5>
              <p className="text-secondary mb-2">Puedes usar una imagen ya guardada en public o subir una foto nueva desde esta página. También puedes escribir memoria extra para que la IA local sepa más cosas de tu operación.</p>
              <div className="small text-secondary">{saving ? 'Saving avatar settings...' : message}</div>
            </div>
            <div className="d-flex flex-wrap gap-2 align-items-start">
              <Badge bg="success-subtle" text="success">Local AI</Badge>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={refresh} disabled={loading || saving}>Refresh</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={() => setDraft(buildDraft())} disabled={saving}>Reset</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={handleSave} disabled={saving}>Save Avatar</Button>
            </div>
          </div>

          {error ? <Alert variant="danger" className="py-2">{error}</Alert> : null}
          {loading ? <div className="py-5 text-center text-secondary"><Spinner animation="border" size="sm" className="me-2" />Loading avatar settings...</div> : <Row className="g-4">
              <Col lg={5}>
                <div className="border rounded-4 p-4 h-100 d-flex flex-column align-items-center justify-content-center gap-3" style={surfaceStyles.input}>
                  <div className="rounded-4 overflow-hidden" style={{ width: 220, height: 240, border: '1px solid #2a3144', backgroundColor: '#0b0f18' }}>
                    <img src={previewImage} alt="Assistant avatar preview" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                  <div className="text-center">
                    <div className="fw-semibold" style={{ fontSize: 22 }}>{draft.name || DEFAULT_ASSISTANT_AVATAR.name}</div>
                    <div className="small text-secondary">Vista previa del widget</div>
                  </div>
                </div>
              </Col>
              <Col lg={7}>
                <Row className="g-3">
                  <Col md={12}>
                    <Form.Label className="small text-uppercase text-secondary fw-semibold">Assistant name</Form.Label>
                    <Form.Control value={draft.name} style={surfaceStyles.input} onChange={event => setDraft(current => ({
                    ...current,
                    name: event.target.value
                  }))} placeholder="Balby" />
                  </Col>
                  <Col md={12} className="d-flex flex-wrap align-items-center justify-content-between gap-3">
                    <Form.Check type="switch" id="assistant-visible" label="Mostrar Balby en pantalla" checked={draft.visible} onChange={event => setDraft(current => ({
                    ...current,
                    visible: event.target.checked
                  }))} />
                    <div className="d-flex gap-2">
                      <Button
                        style={surfaceStyles.button}
                        className="rounded-pill d-inline-flex align-items-center gap-2"
                        onClick={() => changeTheme(themeMode === 'dark' ? 'light' : 'dark')}
                        title={themeMode === 'dark' ? 'Cambiar a claro' : 'Cambiar a oscuro'}
                      >
                        <i className={themeMode === 'dark' ? 'iconoir-sun-light' : 'iconoir-half-moon'} />
                        {themeMode === 'dark' ? 'Claro' : 'Oscuro'}
                      </Button>
                    </div>
                  </Col>
                  <Col md={12}>
                    <Form.Label className="small text-uppercase text-secondary fw-semibold">Image path or data URL</Form.Label>
                    <Form.Control value={draft.image} style={surfaceStyles.input} onChange={event => setDraft(current => ({
                    ...current,
                    image: event.target.value
                  }))} placeholder="/WhatsApp Image 2026-03-28 at 11.58.52 PM.jpeg" />
                    <div className="small text-secondary mt-2">Acepta rutas de public como /ai-avatar/cartoon-owner.svg o una imagen subida desde tu computadora.</div>
                  </Col>
                  <Col md={12}>
                    <Form.Label className="small text-uppercase text-secondary fw-semibold">Upload a new photo</Form.Label>
                    <Form.Control type="file" accept="image/*" style={surfaceStyles.input} onChange={handlePickFile} />
                  </Col>
                  <Col md={12}>
                    <Form.Label className="small text-uppercase text-secondary fw-semibold">Quick presets</Form.Label>
                    <div className="d-flex flex-wrap gap-2">
                      {AVATAR_PRESETS.map(image => <Button key={image} style={surfaceStyles.button} className="rounded-pill" onClick={() => setDraft(current => ({
                      ...current,
                      image
                    }))}>{image.split('/').pop()}</Button>)}
                    </div>
                  </Col>
                  <Col md={12}>
                    <Form.Label className="small text-uppercase text-secondary fw-semibold">Assistant memory summary</Form.Label>
                    <Form.Control as="textarea" rows={7} value={draft.memoryNotes} style={surfaceStyles.input} onChange={event => setDraft(current => ({
                    ...current,
                    memoryNotes: event.target.value
                  }))} placeholder={"Ejemplo:\nDespachador principal: Robert\nTeléfono base: 407-000-0000\nLa clínica central abre a las 8 AM\nSi Robert pide cerrar sesión, confirma y haz sign out."} />
                    <div className="small text-secondary mt-2">Escribe una idea por línea. Balby la usará como memoria extra cuando responda en modo local.</div>
                  </Col>
                  <Col md={6}>
                    <Form.Label className="small text-uppercase text-secondary fw-semibold">Pacientes</Form.Label>
                    <Form.Control as="textarea" rows={5} value={draft.memorySections.patients} style={surfaceStyles.input} onChange={event => setDraft(current => ({
                    ...current,
                    memorySections: {
                      ...current.memorySections,
                      patients: event.target.value
                    }
                  }))} placeholder="Maria Lopez: usa silla\nKenneth Pena: llamar al llegar" />
                  </Col>
                  <Col md={6}>
                    <Form.Label className="small text-uppercase text-secondary fw-semibold">Choferes</Form.Label>
                    <Form.Control as="textarea" rows={5} value={draft.memorySections.drivers} style={surfaceStyles.input} onChange={event => setDraft(current => ({
                    ...current,
                    memorySections: {
                      ...current.memorySections,
                      drivers: event.target.value
                    }
                  }))} placeholder="Juan: unidad 12\nPedro: prefiere WhatsApp" />
                  </Col>
                  <Col md={6}>
                    <Form.Label className="small text-uppercase text-secondary fw-semibold">Reglas</Form.Label>
                    <Form.Control as="textarea" rows={5} value={draft.memorySections.rules} style={surfaceStyles.input} onChange={event => setDraft(current => ({
                    ...current,
                    memorySections: {
                      ...current.memorySections,
                      rules: event.target.value
                    }
                  }))} placeholder="No mover trips cancelados sin confirmar\nPrioridad a dialysis AM" />
                  </Col>
                  <Col md={6}>
                    <Form.Label className="small text-uppercase text-secondary fw-semibold">Teléfonos</Form.Label>
                    <Form.Control as="textarea" rows={5} value={draft.memorySections.phones} style={surfaceStyles.input} onChange={event => setDraft(current => ({
                    ...current,
                    memorySections: {
                      ...current.memorySections,
                      phones: event.target.value
                    }
                  }))} placeholder="Base: 407-000-0000\nClinica central: 407-111-1111" />
                  </Col>
                </Row>
              </Col>
            </Row>}
        </CardBody>
      </Card>
    </>;
};

export default AvatarSettingsWorkspace;