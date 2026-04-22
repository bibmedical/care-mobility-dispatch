'use client';

import PageTitle from '@/components/PageTitle';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
import { useLayoutContext } from '@/context/useLayoutContext';
import useSmsIntegrationApi from '@/hooks/useSmsIntegrationApi';
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

const PROVIDER_LABELS = {
  disabled: 'Disabled',
  twilio: 'Twilio',
  telnyx: 'Telnyx',
  ringcentral: 'RingCentral',
  mock: 'Mock'
};

const PROVIDER_PORTALS = {
  twilio: 'https://console.twilio.com/',
  telnyx: 'https://portal.telnyx.com/',
  ringcentral: 'https://developers.ringcentral.com/'
};

const buildBlankDraft = () => ({
  activeProvider: 'disabled',
  defaultCountryCode: '1',
  consentRequestTemplate: 'Hello {{rider}}, this is Care Mobility Services LLC. Reply YES to allow transportation-related SMS updates for your trips. Reply STOP to opt out. Msg & data rates may apply.',
  confirmationTemplate: 'Hello {{rider}}, this is Care Mobility Services LLC about trip {{tripId}}. Reply 1 {{code}} to confirm, 2 {{code}} to cancel, or 3 {{code}} if you need a call.',
  arrivalNotifications: {
    patientEnabled: true,
    officeEnabled: true,
    patientTemplate: 'Hello {{rider}}, this is Care Mobility Services LLC. Your driver {{driver}} has arrived for pickup at {{pickupAddress}}. If you need help, call the office.',
    officeTemplate: 'Arrival notice: driver {{driver}} has arrived for {{rider}} at {{pickupAddress}} for trip {{tripId}}.',
    officeRecipients: []
  },
  groupTemplates: {
    AL: '',
    BL: '',
    CL: '',
    A: '',
    W: '',
    STR: ''
  },
  webhookBaseUrl: '',
  notes: '',
  lastValidatedAt: '',
  lastInboundAt: '',
  consentList: [],
  twilio: {
    accountSid: '',
    authToken: '',
    messagingServiceSid: '',
    fromNumber: '',
    connectionStatus: 'Not configured'
  },
  telnyx: {
    apiKey: '',
    messagingProfileId: '',
    fromNumber: '',
    connectionStatus: 'Not configured'
  },
  ringcentral: {
    clientId: '',
    clientSecret: '',
    serverUrl: 'https://platform.ringcentral.com',
    accessToken: '',
    extension: '1',
    fromNumber: '',
    connectionStatus: 'Not configured'
  },
  mock: {
    enabled: true,
    connectionStatus: 'Ready for local testing'
  },
  optOutList: []
});

const getProviderReadiness = draft => {
  if (draft.activeProvider === 'disabled') return 'Provider disabled';
  if (draft.activeProvider === 'twilio') {
    const ready = Boolean(draft.twilio.accountSid && draft.twilio.authToken && (draft.twilio.messagingServiceSid || draft.twilio.fromNumber));
    return ready ? 'Ready' : 'Missing Twilio credentials';
  }
  if (draft.activeProvider === 'telnyx') {
    return draft.telnyx.apiKey && draft.telnyx.fromNumber ? 'Ready' : 'Missing Telnyx credentials';
  }
  if (draft.activeProvider === 'ringcentral') {
    return draft.ringcentral.accessToken && draft.ringcentral.fromNumber && draft.ringcentral.serverUrl ? 'Ready' : 'Missing RingCentral credentials';
  }
  if (draft.activeProvider === 'mock') return 'Ready for local testing';
  return 'Unknown provider';
};

const buildStatusBadge = ready => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 24,
  padding: '4px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  backgroundColor: ready ? 'rgba(33, 186, 115, 0.18)' : 'rgba(255, 255, 255, 0.08)',
  border: ready ? '1px solid rgba(33, 186, 115, 0.38)' : '1px solid rgba(255, 255, 255, 0.12)',
  color: ready ? '#7ef0b1' : '#e6ecff'
});

const SmsIntegrationWorkspace = () => {
  const { themeMode } = useLayoutContext();
  const surfaceStyles = useMemo(() => buildSurfaceStyles(themeMode === 'light'), [themeMode]);
  const { data, loading, saving, error, refresh, saveData } = useSmsIntegrationApi();
  const [draft, setDraft] = useState(buildBlankDraft());
  const [message, setMessage] = useState('Configura el proveedor SMS activo y deja listos los webhooks para recibir respuestas del paciente.');
  const [optOutName, setOptOutName] = useState('');
  const [optOutPhone, setOptOutPhone] = useState('');
  const [optOutReason, setOptOutReason] = useState('No automatic confirmation');
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Prueba de SMS desde Care Mobility Services LLC. Si recibes este mensaje, la integracion esta funcionando.');
  const [testSending, setTestSending] = useState(false);
  const [officeRecipientName, setOfficeRecipientName] = useState('');
  const [officeRecipientPhone, setOfficeRecipientPhone] = useState('');
  const [officeRecipientNotes, setOfficeRecipientNotes] = useState('Dispatch');

  useEffect(() => {
    if (!data?.sms) return;
    setDraft({
      ...buildBlankDraft(),
      ...data.sms,
      arrivalNotifications: {
        ...buildBlankDraft().arrivalNotifications,
        ...data.sms.arrivalNotifications,
        officeRecipients: Array.isArray(data.sms.arrivalNotifications?.officeRecipients) ? data.sms.arrivalNotifications.officeRecipients : []
      },
      groupTemplates: {
        ...buildBlankDraft().groupTemplates,
        ...data.sms.groupTemplates
      },
      twilio: {
        ...buildBlankDraft().twilio,
        ...data.sms.twilio
      },
      telnyx: {
        ...buildBlankDraft().telnyx,
        ...data.sms.telnyx
      },
      ringcentral: {
        ...buildBlankDraft().ringcentral,
        ...data.sms.ringcentral
      },
      mock: {
        ...buildBlankDraft().mock,
        ...data.sms.mock
      }
    });
  }, [data]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDraft(current => current.webhookBaseUrl ? current : {
      ...current,
      webhookBaseUrl: window.location.origin
    });
  }, []);

  const activeWebhookUrl = useMemo(() => {
    if (!draft.webhookBaseUrl || draft.activeProvider === 'disabled' || draft.activeProvider === 'mock') return '';
    return `${draft.webhookBaseUrl.replace(/\/$/, '')}/api/integrations/sms/${draft.activeProvider}/webhook`;
  }, [draft.activeProvider, draft.webhookBaseUrl]);

  const readiness = useMemo(() => getProviderReadiness(draft), [draft]);
  const twilioReady = Boolean(draft.twilio.accountSid && draft.twilio.authToken && (draft.twilio.messagingServiceSid || draft.twilio.fromNumber));

  const handleSave = async nextDraft => {
    try {
      const payload = await saveData({
        sms: nextDraft
      });
      setDraft(payload.sms);
      setMessage('Configuracion SMS guardada.');
    } catch {
      return;
    }
  };

  const handleValidate = async () => {
    const nextDraft = {
      ...draft,
      lastValidatedAt: new Date().toISOString(),
      twilio: {
        ...draft.twilio,
        connectionStatus: draft.twilio.accountSid && draft.twilio.authToken && (draft.twilio.messagingServiceSid || draft.twilio.fromNumber) ? 'Ready' : 'Missing Twilio credentials'
      },
      telnyx: {
        ...draft.telnyx,
        connectionStatus: draft.telnyx.apiKey && draft.telnyx.fromNumber ? 'Ready' : 'Missing Telnyx credentials'
      },
      ringcentral: {
        ...draft.ringcentral,
        connectionStatus: draft.ringcentral.accessToken && draft.ringcentral.fromNumber && draft.ringcentral.serverUrl ? 'Ready' : 'Missing RingCentral credentials'
      },
      mock: {
        ...draft.mock,
        connectionStatus: draft.mock.enabled ? 'Ready for local testing' : 'Disabled'
      }
    };
    await handleSave(nextDraft);
  };

  const handleCopyWebhook = async () => {
    if (!activeWebhookUrl || typeof navigator === 'undefined') return;
    await navigator.clipboard.writeText(activeWebhookUrl);
    setMessage('Webhook copiado. Pegalo tal cual en el proveedor SMS activo.');
  };

  const handleOpenProvider = () => {
    const providerUrl = PROVIDER_PORTALS[draft.activeProvider];
    if (providerUrl && typeof window !== 'undefined') {
      window.open(providerUrl, '_blank', 'noopener,noreferrer');
      setMessage(`Se abrio ${PROVIDER_LABELS[draft.activeProvider]} para terminar el alta del numero y webhook.`);
    }
  };

  const handleActivateTwilio = () => {
    setDraft(current => ({
      ...current,
      activeProvider: 'twilio'
    }));
    setMessage('Twilio quedo seleccionado como proveedor activo. Ahora dale Save Twilio para guardarlo.');
  };

  const handleSaveTwilio = async () => {
    const nextDraft = {
      ...draft,
      activeProvider: 'twilio',
      twilio: {
        ...draft.twilio,
        connectionStatus: twilioReady ? 'Ready' : 'Missing Twilio credentials'
      }
    };
    await handleSave(nextDraft);
  };

  const handleSendTestSms = async () => {
    setTestSending(true);
    try {
      const response = await fetch('/api/integrations/sms/send-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: testPhone,
          message: testMessage
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to send test SMS');
      setMessage(`SMS de prueba enviado a +${payload.to}. Provider: ${String(payload.provider || '').toUpperCase()}.`);
    } catch (sendError) {
      setMessage(sendError.message || 'No se pudo mandar el SMS de prueba.');
    } finally {
      setTestSending(false);
    }
  };

  const handleAddOptOut = () => {
    if (!optOutName.trim() && !optOutPhone.trim()) {
      setMessage('Escribe nombre o telefono para agregar a la lista Do Not Confirm.');
      return;
    }
    const nextEntry = {
      id: `${optOutPhone.replace(/\D/g, '') || optOutName.trim().toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      name: optOutName.trim(),
      phone: optOutPhone.trim(),
      reason: optOutReason.trim(),
      createdAt: new Date().toISOString()
    };
    setDraft(current => ({
      ...current,
      optOutList: [nextEntry, ...(Array.isArray(current.optOutList) ? current.optOutList : [])]
    }));
    setOptOutName('');
    setOptOutPhone('');
    setOptOutReason('No automatic confirmation');
    setMessage('Persona agregada a la lista Do Not Confirm. Guarda para aplicar el cambio.');
  };

  const handleRemoveOptOut = entryId => {
    setDraft(current => ({
      ...current,
      optOutList: (Array.isArray(current.optOutList) ? current.optOutList : []).filter(entry => entry.id !== entryId)
    }));
    setMessage('Persona removida de la lista Do Not Confirm. Guarda para aplicar el cambio.');
  };

  const handleGroupTemplateChange = (groupKey, value) => {
    setDraft(current => ({
      ...current,
      groupTemplates: {
        ...(current.groupTemplates || {}),
        [groupKey]: value
      }
    }));
  };

  const handleAddOfficeRecipient = () => {
    if (!officeRecipientName.trim() && !officeRecipientPhone.trim()) {
      setMessage('Escribe nombre o telefono para agregar un numero de oficina.');
      return;
    }

    const nextEntry = {
      id: `${officeRecipientPhone.replace(/\D/g, '') || officeRecipientName.trim().toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      name: officeRecipientName.trim(),
      phone: officeRecipientPhone.trim(),
      notes: officeRecipientNotes.trim(),
      enabled: true,
      createdAt: new Date().toISOString()
    };

    setDraft(current => ({
      ...current,
      arrivalNotifications: {
        ...current.arrivalNotifications,
        officeRecipients: [nextEntry, ...(Array.isArray(current.arrivalNotifications?.officeRecipients) ? current.arrivalNotifications.officeRecipients : [])]
      }
    }));
    setOfficeRecipientName('');
    setOfficeRecipientPhone('');
    setOfficeRecipientNotes('Dispatch');
    setMessage('Numero de oficina agregado. Guarda para activar este recipient.');
  };

  const handleRemoveOfficeRecipient = entryId => {
    setDraft(current => ({
      ...current,
      arrivalNotifications: {
        ...current.arrivalNotifications,
        officeRecipients: (Array.isArray(current.arrivalNotifications?.officeRecipients) ? current.arrivalNotifications.officeRecipients : []).filter(entry => entry.id !== entryId)
      }
    }));
    setMessage('Numero de oficina removido. Guarda para aplicar el cambio.');
  };

  return <>
      <PageTitle title="SMS Integration" subName="Integrations" />
      <Row className="g-3 mb-3">
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">Active provider</p>
              <h4 className="mb-0">{PROVIDER_LABELS[draft.activeProvider] || 'Disabled'}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">Readiness</p>
              <h4 className="mb-0">{readiness}</h4>
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
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">Last inbound SMS</p>
              <h4 className="mb-0">{draft.lastInboundAt || 'Pending'}</h4>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Card style={surfaceStyles.card} className="border">
        <CardBody>
          <div className="d-flex flex-column flex-xl-row justify-content-between gap-3 mb-4">
            <div>
              <h5 className="mb-1">Integrations &gt; SMS Confirmations</h5>
              <p className="text-secondary mb-2">This module sets up outbound sending, the response webhook, and provider activation. Twilio is the most direct option, but you can switch providers without touching the base config.</p>
              <div className="small text-secondary">{saving ? 'Saving SMS integration...' : message}</div>
            </div>
            <div className="d-flex flex-wrap gap-2 align-items-start">
              <Badge bg="success-subtle" text="success">{PROVIDER_LABELS[draft.activeProvider] || 'Disabled'}</Badge>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={refresh} disabled={loading || saving}><IconifyIcon icon="iconoir:refresh-double" className="me-2" />Refresh</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={() => handleSave(draft)} disabled={saving}>Save</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={handleValidate} disabled={saving}>Validate setup</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={handleCopyWebhook} disabled={!activeWebhookUrl}>Copy active webhook</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={handleOpenProvider} disabled={!PROVIDER_PORTALS[draft.activeProvider]}>Open provider</Button>
            </div>
          </div>

          {error ? <Alert variant="danger" className="py-2">{error}</Alert> : null}
          {loading ? <div className="py-5 text-center text-secondary"><Spinner animation="border" size="sm" className="me-2" />Loading SMS integration...</div> : <Row className="g-3">
              <Col md={4}><Form.Label className="small text-uppercase text-secondary fw-semibold">Active Provider</Form.Label><Form.Select value={draft.activeProvider} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, activeProvider: event.target.value }))}><option value="disabled">Disabled</option><option value="twilio">Twilio</option><option value="telnyx">Telnyx</option><option value="ringcentral">RingCentral</option><option value="mock">Mock</option></Form.Select></Col>
              <Col md={4}><Form.Label className="small text-uppercase text-secondary fw-semibold">Default Country Code</Form.Label><Form.Control value={draft.defaultCountryCode} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, defaultCountryCode: event.target.value.replace(/\D/g, '') }))} /></Col>
              <Col md={4}><Form.Label className="small text-uppercase text-secondary fw-semibold">Webhook Base URL</Form.Label><Form.Control value={draft.webhookBaseUrl} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, webhookBaseUrl: event.target.value }))} /></Col>
              <Col md={12}><Form.Label className="small text-uppercase text-secondary fw-semibold">Consent Request Template</Form.Label><Form.Control as="textarea" rows={3} value={draft.consentRequestTemplate} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, consentRequestTemplate: event.target.value }))} /></Col>
              <Col md={12}><Form.Label className="small text-uppercase text-secondary fw-semibold">Confirmation Template</Form.Label><Form.Control as="textarea" rows={3} value={draft.confirmationTemplate} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, confirmationTemplate: event.target.value }))} /></Col>
              <Col md={12}><div className="border rounded-3 p-3 h-100" style={surfaceStyles.input}><div className="small text-secondary mb-2">Template tokens</div><div>{'{{rider}}, {{tripId}}, {{driver}}, {{pickup}}, {{dropoff}}, {{pickupAddress}}, {{dropoffAddress}}, {{patientPhone}}, {{actualPickup}}, {{miles}}, {{code}}'}</div><div className="small text-secondary mt-2">Paciente responde con 1 code, 2 code o 3 code. El webhook actualiza la confirmacion a Confirmed, Cancelled o Needs Call.</div></div></Col>
              <Col md={12}><div className="border rounded-3 p-3 h-100" style={surfaceStyles.input}><div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2"><div><div className="small text-secondary">Arrival Notifications</div><div className="small text-secondary">Cuando el chofer marca Arrived, se puede mandar un SMS al paciente y otro a la oficina.</div></div><Badge bg="primary">Arrival SMS</Badge></div><Row className="g-3"><Col md={3}><Form.Check type="switch" id="arrival-patient-enabled" label="Send patient SMS" checked={draft.arrivalNotifications?.patientEnabled !== false} onChange={event => setDraft(current => ({ ...current, arrivalNotifications: { ...current.arrivalNotifications, patientEnabled: event.target.checked } }))} /></Col><Col md={3}><Form.Check type="switch" id="arrival-office-enabled" label="Send office SMS" checked={draft.arrivalNotifications?.officeEnabled !== false} onChange={event => setDraft(current => ({ ...current, arrivalNotifications: { ...current.arrivalNotifications, officeEnabled: event.target.checked } }))} /></Col><Col md={6}><div className="small text-secondary pt-1">Desactiva Send office SMS si la oficina no quiere recibir este aviso.</div></Col><Col md={6}><Form.Label className="small text-uppercase text-secondary fw-semibold">Patient Arrival Template</Form.Label><Form.Control as="textarea" rows={3} value={draft.arrivalNotifications?.patientTemplate || ''} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, arrivalNotifications: { ...current.arrivalNotifications, patientTemplate: event.target.value } }))} /></Col><Col md={6}><Form.Label className="small text-uppercase text-secondary fw-semibold">Office Arrival Template</Form.Label><Form.Control as="textarea" rows={3} value={draft.arrivalNotifications?.officeTemplate || ''} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, arrivalNotifications: { ...current.arrivalNotifications, officeTemplate: event.target.value } }))} /></Col><Col md={12}><div className="border rounded-3 p-3 h-100" style={surfaceStyles.input}><div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2"><div><div className="small text-secondary">Office recipients</div><div className="small text-secondary">Estos numeros reciben copia del arrival SMS cuando la opcion de oficina esta activada.</div></div><Badge bg="warning" text="dark">{Array.isArray(draft.arrivalNotifications?.officeRecipients) ? draft.arrivalNotifications.officeRecipients.length : 0} office numbers</Badge></div><Row className="g-2 mb-3"><Col md={3}><Form.Control placeholder="Office name" value={officeRecipientName} style={surfaceStyles.input} onChange={event => setOfficeRecipientName(event.target.value)} /></Col><Col md={3}><Form.Control placeholder="Phone" value={officeRecipientPhone} style={surfaceStyles.input} onChange={event => setOfficeRecipientPhone(event.target.value)} /></Col><Col md={4}><Form.Control placeholder="Notes" value={officeRecipientNotes} style={surfaceStyles.input} onChange={event => setOfficeRecipientNotes(event.target.value)} /></Col><Col md={2}><Button style={surfaceStyles.button} className="w-100" onClick={handleAddOfficeRecipient}>Add</Button></Col></Row><div className="table-responsive"><table className="table table-dark table-striped align-middle mb-0"><thead><tr><th>Name</th><th>Phone</th><th>Notes</th><th>Added</th><th style={{ width: 90 }}>Action</th></tr></thead><tbody>{Array.isArray(draft.arrivalNotifications?.officeRecipients) && draft.arrivalNotifications.officeRecipients.length > 0 ? draft.arrivalNotifications.officeRecipients.map(entry => <tr key={entry.id}><td>{entry.name || '-'}</td><td>{entry.phone || '-'}</td><td>{entry.notes || '-'}</td><td>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '-'}</td><td><Button variant="outline-light" size="sm" onClick={() => handleRemoveOfficeRecipient(entry.id)}>Remove</Button></td></tr>) : <tr><td colSpan={5} className="text-center text-secondary py-3">No office numbers configured yet.</td></tr>}</tbody></table></div></div></Col></Row></div></Col>
              <Col md={12}><Form.Label className="small text-uppercase text-secondary fw-semibold">Notes</Form.Label><Form.Control as="textarea" rows={3} value={draft.notes} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} /></Col>

              <Col md={12}><div className="border rounded-3 p-3 h-100" style={surfaceStyles.input}><div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2"><div><div className="small text-secondary">Saved Group Templates</div><div className="small text-secondary">Guarda mensajes predeterminados por grupo para cargarlos rapido en Confirmation.</div></div><Badge bg="info">AL / BL / CL / A / W / STR</Badge></div><Row className="g-3"><Col md={4}><Form.Label className="small text-uppercase text-secondary fw-semibold">AL Template</Form.Label><Form.Control as="textarea" rows={3} value={draft.groupTemplates?.AL || ''} style={surfaceStyles.input} onChange={event => handleGroupTemplateChange('AL', event.target.value)} /></Col><Col md={4}><Form.Label className="small text-uppercase text-secondary fw-semibold">BL Template</Form.Label><Form.Control as="textarea" rows={3} value={draft.groupTemplates?.BL || ''} style={surfaceStyles.input} onChange={event => handleGroupTemplateChange('BL', event.target.value)} /></Col><Col md={4}><Form.Label className="small text-uppercase text-secondary fw-semibold">CL Template</Form.Label><Form.Control as="textarea" rows={3} value={draft.groupTemplates?.CL || ''} style={surfaceStyles.input} onChange={event => handleGroupTemplateChange('CL', event.target.value)} /></Col><Col md={4}><Form.Label className="small text-uppercase text-secondary fw-semibold">A Template</Form.Label><Form.Control as="textarea" rows={3} value={draft.groupTemplates?.A || ''} style={surfaceStyles.input} onChange={event => handleGroupTemplateChange('A', event.target.value)} /></Col><Col md={4}><Form.Label className="small text-uppercase text-secondary fw-semibold">W Template</Form.Label><Form.Control as="textarea" rows={3} value={draft.groupTemplates?.W || ''} style={surfaceStyles.input} onChange={event => handleGroupTemplateChange('W', event.target.value)} /></Col><Col md={4}><Form.Label className="small text-uppercase text-secondary fw-semibold">STR Template</Form.Label><Form.Control as="textarea" rows={3} value={draft.groupTemplates?.STR || ''} style={surfaceStyles.input} onChange={event => handleGroupTemplateChange('STR', event.target.value)} /></Col></Row></div></Col>

              <Col md={12}><div className="border rounded-3 p-3 h-100" style={surfaceStyles.input}><div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2"><div><div className="small text-secondary">Send Test SMS</div><div className="small text-secondary">Manda un mensaje directo a tu numero para confirmar que el proveedor activo si esta enviando.</div></div><span style={buildStatusBadge(draft.activeProvider !== 'disabled')}>{PROVIDER_LABELS[draft.activeProvider] || 'Disabled'}</span></div><Row className="g-2"><Col md={4}><Form.Control placeholder="Test phone number" value={testPhone} style={surfaceStyles.input} onChange={event => setTestPhone(event.target.value)} /></Col><Col md={6}><Form.Control placeholder="Test message" value={testMessage} style={surfaceStyles.input} onChange={event => setTestMessage(event.target.value)} /></Col><Col md={2}><Button style={surfaceStyles.button} className="w-100" onClick={handleSendTestSms} disabled={testSending || saving}>{testSending ? 'Sending...' : 'Send Test SMS'}</Button></Col></Row><div className="small text-secondary mt-2">Usa tu numero con area code. Si tu proveedor activo es Twilio, este test saldra por Twilio sin crear trips.</div></div></Col>

              <Col md={12}><div className="border rounded-3 p-3 h-100" style={surfaceStyles.input}><div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2"><div><div className="small text-secondary">Do Not Confirm List</div><div className="small text-secondary">Estas personas no recibiran confirmacion automatica, pero todavia puedes mandarles mensajes manuales.</div></div><Badge bg="warning" text="dark">{Array.isArray(draft.optOutList) ? draft.optOutList.length : 0} blocked</Badge></div><Row className="g-2 mb-3"><Col md={4}><Form.Control placeholder="Rider name" value={optOutName} style={surfaceStyles.input} onChange={event => setOptOutName(event.target.value)} /></Col><Col md={3}><Form.Control placeholder="Phone" value={optOutPhone} style={surfaceStyles.input} onChange={event => setOptOutPhone(event.target.value)} /></Col><Col md={3}><Form.Control placeholder="Reason" value={optOutReason} style={surfaceStyles.input} onChange={event => setOptOutReason(event.target.value)} /></Col><Col md={2}><Button style={surfaceStyles.button} className="w-100" onClick={handleAddOptOut}>Add</Button></Col></Row><div className="table-responsive"><table className="table table-dark table-striped align-middle mb-0"><thead><tr><th>Name</th><th>Phone</th><th>Reason</th><th>Added</th><th style={{ width: 90 }}>Action</th></tr></thead><tbody>{Array.isArray(draft.optOutList) && draft.optOutList.length > 0 ? draft.optOutList.map(entry => <tr key={entry.id}><td>{entry.name || '-'}</td><td>{entry.phone || '-'}</td><td>{entry.reason || '-'}</td><td>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '-'}</td><td><Button variant="outline-light" size="sm" onClick={() => handleRemoveOptOut(entry.id)}>Remove</Button></td></tr>) : <tr><td colSpan={5} className="text-center text-secondary py-3">No patients blocked yet.</td></tr>}</tbody></table></div></div></Col>

              <Col md={6}><div className="border rounded-3 p-3 h-100" style={surfaceStyles.input}><div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2"><div className="small text-secondary">Twilio</div><span style={buildStatusBadge(twilioReady)}>{draft.twilio.connectionStatus}</span></div><Row className="g-2"><Col md={6}><Form.Control placeholder="Account SID" value={draft.twilio.accountSid} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, twilio: { ...current.twilio, accountSid: event.target.value } }))} /></Col><Col md={6}><Form.Control type="password" placeholder="Auth Token" value={draft.twilio.authToken} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, twilio: { ...current.twilio, authToken: event.target.value } }))} /></Col><Col md={6}><Form.Control placeholder="Messaging Service SID" value={draft.twilio.messagingServiceSid} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, twilio: { ...current.twilio, messagingServiceSid: event.target.value } }))} /></Col><Col md={6}><Form.Control placeholder="From Number" value={draft.twilio.fromNumber} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, twilio: { ...current.twilio, fromNumber: event.target.value } }))} /></Col></Row><div className="small text-secondary mt-2">Webhook: {draft.webhookBaseUrl ? `${draft.webhookBaseUrl.replace(/\/$/, '')}/api/integrations/sms/twilio/webhook` : 'Pending base URL'}</div><div className="small text-secondary mt-2">Para activarlo: 1) llena los datos, 2) pulsa Activate Twilio, 3) pulsa Save Twilio.</div><div className="d-flex flex-wrap gap-2 mt-3"><Button style={surfaceStyles.button} className="rounded-pill" onClick={handleActivateTwilio} disabled={saving}>Activate Twilio</Button><Button style={surfaceStyles.button} className="rounded-pill" onClick={handleSaveTwilio} disabled={saving}>Save Twilio</Button><Button style={surfaceStyles.button} className="rounded-pill" onClick={handleValidate} disabled={saving}>Validate Twilio</Button></div><div className="small mt-2" style={{ color: draft.activeProvider === 'twilio' ? '#7ef0b1' : '#9fb0d1' }}>{draft.activeProvider === 'twilio' ? 'Twilio ya esta marcado como proveedor activo.' : 'Twilio todavia no esta marcado como proveedor activo.'}</div></div></Col>

              <Col md={6}><div className="border rounded-3 p-3 h-100" style={surfaceStyles.input}><div className="d-flex justify-content-between align-items-center mb-2"><div className="small text-secondary">Telnyx</div><Badge bg="secondary">{draft.telnyx.connectionStatus}</Badge></div><Row className="g-2"><Col md={6}><Form.Control placeholder="API Key" type="password" value={draft.telnyx.apiKey} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, telnyx: { ...current.telnyx, apiKey: event.target.value } }))} /></Col><Col md={6}><Form.Control placeholder="Messaging Profile ID" value={draft.telnyx.messagingProfileId} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, telnyx: { ...current.telnyx, messagingProfileId: event.target.value } }))} /></Col><Col md={12}><Form.Control placeholder="From Number" value={draft.telnyx.fromNumber} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, telnyx: { ...current.telnyx, fromNumber: event.target.value } }))} /></Col></Row><div className="small text-secondary mt-2">Webhook: {draft.webhookBaseUrl ? `${draft.webhookBaseUrl.replace(/\/$/, '')}/api/integrations/sms/telnyx/webhook` : 'Pending base URL'}</div></div></Col>

              <Col md={6}><div className="border rounded-3 p-3 h-100" style={surfaceStyles.input}><div className="d-flex justify-content-between align-items-center mb-2"><div className="small text-secondary">RingCentral</div><Badge bg="secondary">{draft.ringcentral.connectionStatus}</Badge></div><Row className="g-2"><Col md={6}><Form.Control placeholder="Client ID" value={draft.ringcentral.clientId} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, ringcentral: { ...current.ringcentral, clientId: event.target.value } }))} /></Col><Col md={6}><Form.Control type="password" placeholder="Client Secret" value={draft.ringcentral.clientSecret} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, ringcentral: { ...current.ringcentral, clientSecret: event.target.value } }))} /></Col><Col md={6}><Form.Control placeholder="Server URL" value={draft.ringcentral.serverUrl} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, ringcentral: { ...current.ringcentral, serverUrl: event.target.value } }))} /></Col><Col md={6}><Form.Control type="password" placeholder="Access Token" value={draft.ringcentral.accessToken} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, ringcentral: { ...current.ringcentral, accessToken: event.target.value } }))} /></Col><Col md={6}><Form.Control placeholder="Extension" value={draft.ringcentral.extension} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, ringcentral: { ...current.ringcentral, extension: event.target.value } }))} /></Col><Col md={6}><Form.Control placeholder="From Number" value={draft.ringcentral.fromNumber} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, ringcentral: { ...current.ringcentral, fromNumber: event.target.value } }))} /></Col></Row><div className="small text-secondary mt-2">Webhook: {draft.webhookBaseUrl ? `${draft.webhookBaseUrl.replace(/\/$/, '')}/api/integrations/sms/ringcentral/webhook` : 'Pending base URL'}</div></div></Col>

              <Col md={6}><div className="border rounded-3 p-3 h-100" style={surfaceStyles.input}><div className="d-flex justify-content-between align-items-center mb-2"><div className="small text-secondary">Mock Provider</div><Badge bg="secondary">{draft.mock.connectionStatus}</Badge></div><Form.Check type="switch" id="sms-mock-enabled" label="Allow local mock confirmations" checked={draft.mock.enabled} onChange={event => setDraft(current => ({ ...current, mock: { ...current.mock, enabled: event.target.checked } }))} /><div className="small text-secondary mt-2">Usa este modo para probar el endpoint de envio sin gastar SMS reales mientras terminas de configurar Twilio o cualquier otro proveedor.</div></div></Col>
            </Row>}
        </CardBody>
      </Card>
    </>;
};

export default SmsIntegrationWorkspace;