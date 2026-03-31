'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Form, Tab, Tabs } from 'react-bootstrap';

const VARIABLES = [
  { token: '{{driverName}}', desc: "Driver's full name" },
  { token: '{{expirationDate}}', desc: 'License expiration date (YYYY-MM-DD)' },
  { token: '{{daysUntilExpiry}}', desc: 'Days until expiry (negative = already expired)' },
  { token: '{{statusLine}}', desc: 'Auto-generated status sentence (HTML version)' },
  { token: '{{urgencyText}}', desc: 'Auto-generated urgency message' },
  { token: '{{urgencyColor}}', desc: 'Hex color matching urgency level' }
];

const EmailTemplatesWorkspace = () => {
  const [templates, setTemplates] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saved' | 'error'
  const [previewMode, setPreviewMode] = useState('html');
  const activeInputRef = useRef(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/email-templates');
      if (!res.ok) return;
      const data = await res.json();
      setTemplates(data.templates);
      setDefaults(data.defaults);
      setDraft(JSON.parse(JSON.stringify(data.templates)));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleChange = (templateId, field, value) => {
    setDraft(prev => ({
      ...prev,
      [templateId]: { ...prev[templateId], [field]: value }
    }));
    setSaveStatus(null);
  };

  const insertToken = (templateId, field, token) => {
    const el = activeInputRef.current;
    if (el && el.dataset.tpl === templateId && el.dataset.field === field) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const current = draft[templateId][field] || '';
      const newVal = current.slice(0, start) + token + current.slice(end);
      handleChange(templateId, field, newVal);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      }, 0);
    } else {
      handleChange(templateId, field, (draft[templateId][field] || '') + token);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch('/api/email-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates: draft })
      });
      if (res.ok) {
        setSaveStatus('saved');
        const data = await res.json();
        setTemplates(data.templates);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = templateId => {
    if (!defaults?.[templateId]) return;
    setDraft(prev => ({ ...prev, [templateId]: JSON.parse(JSON.stringify(defaults[templateId])) }));
    setSaveStatus(null);
  };

  if (loading || !draft) {
    return <div style={{ padding: 32, color: '#888' }}>Loading templates...</div>;
  }

  const tpl = draft.licenseExpiry;
  const defTpl = defaults?.licenseExpiry;
  const isDirty = JSON.stringify(draft) !== JSON.stringify(templates);

  // Build preview with sample data
  const buildPreview = () => {
    const sample = {
      driverName: 'John Driver',
      expirationDate: '2026-04-15',
      daysUntilExpiry: '15',
      statusLine: 'Your driver license <strong>expires on 2026-04-15</strong> (15 days remaining).',
      urgencyText: 'Please renew as soon as possible to avoid service interruption.',
      urgencyColor: '#2980b9'
    };
    const replace = str =>
      str?.replace(/\{\{(\w+)\}\}/g, (_, key) => sample[key] || `{{${key}}}`);

    return {
      subject: replace(tpl.subject),
      html: replace(tpl.htmlBody),
      text: replace(tpl.textBody)
    };
  };

  const preview = buildPreview();

  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h4 style={{ margin: 0 }}>Email Templates</h4>
          <p style={{ color: '#888', marginTop: 4, marginBottom: 0, fontSize: 13 }}>
            Customize the emails sent to drivers when licenses are expiring.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isDirty && <Badge bg="warning" style={{ fontSize: 11 }}>Unsaved changes</Badge>}
          {saveStatus === 'saved' && <Badge bg="success" style={{ fontSize: 11 }}>✓ Saved</Badge>}
          {saveStatus === 'error' && <Badge bg="danger" style={{ fontSize: 11 }}>Save failed</Badge>}
          <Button size="sm" variant="outline-secondary" onClick={() => handleReset('licenseExpiry')}>
            Reset to Default
          </Button>
          <Button size="sm" variant="primary" onClick={handleSave} disabled={saving || !isDirty}>
            {saving ? 'Saving...' : 'Save Template'}
          </Button>
        </div>
      </div>

      {/* Variable reference card */}
      <Card style={{ background: '#141420', border: '1px solid #2a2a3e', marginBottom: 20 }}>
        <Card.Body style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#aaa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            Available Variables — click to insert at cursor
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {VARIABLES.map(v => (
              <button
                key={v.token}
                title={v.desc}
                onClick={() => {
                  const el = activeInputRef.current;
                  if (el) insertToken('licenseExpiry', el.dataset.field, v.token);
                }}
                style={{
                  background: '#1e2035', border: '1px solid #3a3a5e', borderRadius: 4,
                  color: '#a78bfa', fontSize: 12, padding: '2px 8px', cursor: 'pointer',
                  fontFamily: 'monospace'
                }}
              >
                {v.token}
              </button>
            ))}
          </div>
        </Card.Body>
      </Card>

      {/* Template editor — License Expiry */}
      <Card style={{ background: '#141420', border: '1px solid #2a2a3e', marginBottom: 20 }}>
        <Card.Header style={{ background: '#1a1a2e', borderBottom: '1px solid #2a2a3e', padding: '12px 16px' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>License Expiry Alert</span>
          <span style={{ marginLeft: 10, fontSize: 12, color: '#888' }}>Sent when a driver's license is expiring within 30 days</span>
        </Card.Header>
        <Card.Body style={{ padding: 16 }}>

          {/* Subject — normal */}
          <Form.Group className="mb-3">
            <Form.Label style={{ fontSize: 13, color: '#bbb' }}>
              Subject <span style={{ color: '#666', fontWeight: 400 }}>(when expiring)</span>
            </Form.Label>
            <Form.Control
              data-tpl="licenseExpiry"
              data-field="subject"
              ref={el => { if (el) activeInputRef.current = el; }}
              onFocus={e => { activeInputRef.current = e.target; }}
              value={tpl.subject || ''}
              onChange={e => handleChange('licenseExpiry', 'subject', e.target.value)}
              style={{ background: '#0d0d1a', border: '1px solid #2a2a3e', color: '#ddd', fontSize: 13 }}
              placeholder="Email subject for expiring license"
            />
          </Form.Group>

          {/* Subject — expired */}
          <Form.Group className="mb-3">
            <Form.Label style={{ fontSize: 13, color: '#bbb' }}>
              Subject <span style={{ color: '#e74c3c', fontWeight: 400 }}>(when already expired)</span>
            </Form.Label>
            <Form.Control
              data-tpl="licenseExpiry"
              data-field="subjectExpired"
              onFocus={e => { activeInputRef.current = e.target; }}
              value={tpl.subjectExpired || ''}
              onChange={e => handleChange('licenseExpiry', 'subjectExpired', e.target.value)}
              style={{ background: '#0d0d1a', border: '1px solid #2a2a3e', color: '#ddd', fontSize: 13 }}
              placeholder="Email subject for expired license"
            />
          </Form.Group>

          {/* HTML Body */}
          <Form.Group className="mb-3">
            <Form.Label style={{ fontSize: 13, color: '#bbb' }}>HTML Body</Form.Label>
            <Form.Control
              as="textarea"
              rows={12}
              data-tpl="licenseExpiry"
              data-field="htmlBody"
              onFocus={e => { activeInputRef.current = e.target; }}
              value={tpl.htmlBody || ''}
              onChange={e => handleChange('licenseExpiry', 'htmlBody', e.target.value)}
              style={{
                background: '#0d0d1a', border: '1px solid #2a2a3e', color: '#ddd',
                fontSize: 12, fontFamily: 'monospace', lineHeight: 1.6, resize: 'vertical'
              }}
              placeholder="HTML email body..."
            />
          </Form.Group>

          {/* Plain Text Body */}
          <Form.Group>
            <Form.Label style={{ fontSize: 13, color: '#bbb' }}>Plain Text Body</Form.Label>
            <Form.Control
              as="textarea"
              rows={6}
              data-tpl="licenseExpiry"
              data-field="textBody"
              onFocus={e => { activeInputRef.current = e.target; }}
              value={tpl.textBody || ''}
              onChange={e => handleChange('licenseExpiry', 'textBody', e.target.value)}
              style={{
                background: '#0d0d1a', border: '1px solid #2a2a3e', color: '#ddd',
                fontSize: 12, fontFamily: 'monospace', lineHeight: 1.6, resize: 'vertical'
              }}
              placeholder="Plain text fallback..."
            />
          </Form.Group>
        </Card.Body>
      </Card>

      {/* Preview */}
      <Card style={{ background: '#141420', border: '1px solid #2a2a3e' }}>
        <Card.Header style={{ background: '#1a1a2e', borderBottom: '1px solid #2a2a3e', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Preview</span>
          <span style={{ fontSize: 12, color: '#666' }}>— sample data (15 days until expiry)</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {['html', 'text', 'subject'].map(m => (
              <Button
                key={m}
                size="sm"
                variant={previewMode === m ? 'primary' : 'outline-secondary'}
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => setPreviewMode(m)}
              >
                {m.toUpperCase()}
              </Button>
            ))}
          </div>
        </Card.Header>
        <Card.Body style={{ padding: 16 }}>
          {previewMode === 'html' && (
            <iframe
              srcDoc={preview.html}
              style={{ width: '100%', height: 320, border: '1px solid #2a2a3e', borderRadius: 4, background: '#fff' }}
              title="Email HTML Preview"
              sandbox="allow-same-origin"
            />
          )}
          {previewMode === 'text' && (
            <pre style={{ color: '#bbb', fontSize: 12, whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'monospace' }}>
              {preview.text}
            </pre>
          )}
          {previewMode === 'subject' && (
            <div style={{ fontSize: 14, color: '#ddd', padding: '10px 0' }}>
              <div style={{ marginBottom: 8 }}><span style={{ color: '#888', fontSize: 12 }}>Expiring: </span>{preview.subject}</div>
              <div><span style={{ color: '#888', fontSize: 12 }}>Expired: </span>{buildPreview().subject.replace('15 days', 'EXPIRED')}</div>
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default EmailTemplatesWorkspace;
