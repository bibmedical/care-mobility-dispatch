'use client';

import BrandImage from '@/components/BrandImage';
import PageTitle from '@/components/PageTitle';
import { useLayoutContext } from '@/context/useLayoutContext';
import { BRANDING_PAGE_OPTIONS, DEFAULT_BRANDING_SETTINGS, normalizeBrandingSettings } from '@/helpers/branding';
import useBrandingApi from '@/hooks/useBrandingApi';
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
  },
  previewShell: {
    backgroundColor: isLight ? '#f8fbff' : '#101521',
    borderColor: isLight ? '#d5deea' : '#2a3144'
  }
});

const BRANDING_PRESETS = [
  '/fmg-login-logo.png',
  '/fmg-app-icon.png',
  '/care-mobility-logo.png',
  '/florida-mobility-group-logo.svg',
  '/florida-mobility-group-logo-classic.svg',
  '/app.png'
];

const createDraft = branding => {
  const normalized = normalizeBrandingSettings(branding || DEFAULT_BRANDING_SETTINGS);
  return {
    pages: { ...normalized.pages },
    combinations: Array.isArray(normalized.combinations) ? normalized.combinations.map(item => ({
      ...item,
      pages: { ...item.pages }
    })) : [],
    activeCombinationId: normalized.activeCombinationId,
    updatedAt: normalized.updatedAt,
    loginLogo: normalized.loginLogo,
    appLogo: normalized.appLogo
  };
};

const createCombinationId = () => `combo-${Date.now()}`;

const PreferencesWorkspace = () => {
  const { themeMode } = useLayoutContext();
  const { data, loading, saving, error, refresh, saveData } = useBrandingApi();
  const surfaceStyles = useMemo(() => buildSurfaceStyles(themeMode === 'light'), [themeMode]);
  const [draft, setDraft] = useState(createDraft(DEFAULT_BRANDING_SETTINGS));
  const [message, setMessage] = useState('Edit each page logo independently and save your own combinations in SQL.');
  const [combinationName, setCombinationName] = useState('');

  useEffect(() => {
    setDraft(createDraft(data?.branding || DEFAULT_BRANDING_SETTINGS));
  }, [data?.branding]);

  const groupedPages = useMemo(() => BRANDING_PAGE_OPTIONS.reduce((accumulator, option) => {
    accumulator[option.group] = accumulator[option.group] || [];
    accumulator[option.group].push(option);
    return accumulator;
  }, {}), []);

  const applyCombination = combinationId => {
    const combination = draft.combinations.find(item => item.id === combinationId);
    if (!combination) return;
    setDraft(current => ({
      ...current,
      pages: { ...combination.pages },
      activeCombinationId: combination.id,
      loginLogo: combination.pages.authLogin,
      appLogo: combination.pages.portalSidebar
    }));
    setMessage(`Combination ${combination.name} applied locally. Save to persist it.`);
  };

  const handlePageValueChange = (pageKey, value) => {
    setDraft(current => {
      const nextPages = {
        ...current.pages,
        [pageKey]: value
      };
      return {
        ...current,
        pages: nextPages,
        loginLogo: nextPages.authLogin,
        appLogo: nextPages.portalSidebar,
        activeCombinationId: 'custom'
      };
    });
  };

  const handlePickFile = pageKey => event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage(`${pageKey} blocked: file exceeds 2MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '').trim();
      if (!result) return;
      handlePageValueChange(pageKey, result);
      setMessage(`${pageKey} image loaded from ${file.name}. Save to apply it.`);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCurrentAsCombination = () => {
    const name = combinationName.trim();
    if (!name) {
      setMessage('Write a combination name first.');
      return;
    }
    const nextCombination = {
      id: createCombinationId(),
      name,
      pages: { ...draft.pages },
      updatedAt: new Date().toISOString()
    };
    setDraft(current => ({
      ...current,
      combinations: [...current.combinations.filter(item => item.name.toLowerCase() !== name.toLowerCase()), nextCombination],
      activeCombinationId: nextCombination.id
    }));
    setCombinationName('');
    setMessage(`Combination ${name} created locally. Save to store it in SQL.`);
  };

  const handleDeleteCombination = combinationId => {
    if (combinationId === 'default') return;
    setDraft(current => ({
      ...current,
      combinations: current.combinations.filter(item => item.id !== combinationId),
      activeCombinationId: current.activeCombinationId === combinationId ? 'custom' : current.activeCombinationId
    }));
    setMessage('Combination removed locally. Save to persist the change.');
  };

  const handleSave = async () => {
    const normalized = await saveData({
      pages: draft.pages,
      combinations: draft.combinations,
      activeCombinationId: draft.activeCombinationId,
      loginLogo: draft.pages.authLogin,
      appLogo: draft.pages.portalSidebar
    });
    setDraft(createDraft(normalized));
    setMessage('Branding saved. Every configured page now uses your SQL branding setup.');
  };

  return <>
      <PageTitle title="Preferences" subName="Branding" />
      <Row className="g-3 mb-3">
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">Configured pages</p>
              <h4 className="mb-0">{BRANDING_PAGE_OPTIONS.length}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">Saved combinations</p>
              <h4 className="mb-0">{draft.combinations.length}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">Active combination</p>
              <h4 className="mb-0">{draft.combinations.find(item => item.id === draft.activeCombinationId)?.name || 'Custom'}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card style={surfaceStyles.card} className="h-100 border">
            <CardBody>
              <p className="text-secondary mb-2">Updated</p>
              <h4 className="mb-0">{data?.branding?.updatedAt || 'Pending'}</h4>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Card style={surfaceStyles.card} className="border mb-3">
        <CardBody>
          <div className="d-flex flex-column flex-xl-row justify-content-between gap-3 mb-4">
            <div>
              <h5 className="mb-1">Settings &gt; Preferences &gt; Branding</h5>
              <p className="text-secondary mb-2">You can edit each page individually, then save your own combinations to SQL and reapply them any time.</p>
              <div className="small text-secondary">{saving ? 'Saving branding settings...' : message}</div>
            </div>
            <div className="d-flex flex-wrap gap-2 align-items-start">
              <Badge bg="info-subtle" text="info">Per page</Badge>
              <Badge bg="success-subtle" text="success">SQL combinations</Badge>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={refresh} disabled={loading || saving}>Refresh</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={() => setDraft(createDraft(DEFAULT_BRANDING_SETTINGS))} disabled={saving}>Reset</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={handleSave} disabled={saving}>Save Branding</Button>
            </div>
          </div>

          {error ? <Alert variant="danger" className="py-2">{error}</Alert> : null}
          {loading ? <div className="py-5 text-center text-secondary"><Spinner animation="border" size="sm" className="me-2" />Loading branding settings...</div> : <>
              <div className="border rounded-4 p-3 mb-4" style={surfaceStyles.previewShell}>
                <div className="d-flex flex-column flex-lg-row gap-3 align-items-start align-items-lg-center justify-content-between">
                  <div>
                    <div className="small text-uppercase text-secondary fw-semibold mb-2">Combination Manager</div>
                    <div className="small text-secondary">Apply, save, or remove your own page-by-page branding combinations.</div>
                  </div>
                  <div className="d-flex flex-wrap gap-2 align-items-center w-100 justify-content-lg-end">
                    <Form.Control value={combinationName} style={{ ...surfaceStyles.input, maxWidth: 260 }} onChange={event => setCombinationName(event.target.value)} placeholder="My orange auth combo" />
                    <Button style={surfaceStyles.button} className="rounded-pill" onClick={handleSaveCurrentAsCombination}>Save Current As Combo</Button>
                  </div>
                </div>
                <div className="d-flex flex-wrap gap-2 mt-3">
                  {draft.combinations.map(item => <div key={item.id} className="d-inline-flex align-items-center gap-2 border rounded-pill px-3 py-2" style={{ borderColor: surfaceStyles.input.borderColor }}>
                      <button type="button" className="btn btn-link p-0 text-decoration-none" style={{ color: surfaceStyles.card.color }} onClick={() => applyCombination(item.id)}>{item.name}</button>
                      {item.id !== 'default' ? <button type="button" className="btn btn-link p-0 text-danger text-decoration-none" onClick={() => handleDeleteCombination(item.id)}>Delete</button> : null}
                    </div>)}
                </div>
              </div>

              {Object.entries(groupedPages).map(([groupName, items]) => <Card key={groupName} style={surfaceStyles.card} className="border mb-3">
                  <CardBody>
                    <div className="small text-uppercase text-secondary fw-semibold mb-3">{groupName}</div>
                    <Row className="g-4">
                      {items.map(option => <Col lg={6} key={option.key}>
                          <div className="border rounded-4 p-3 h-100" style={surfaceStyles.previewShell}>
                            <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
                              <div>
                                <div className="fw-semibold">{option.label}</div>
                                <div className="small text-secondary">{option.key}</div>
                              </div>
                              <Badge bg="secondary-subtle" text="secondary">{option.group}</Badge>
                            </div>
                            <div className="rounded-4 d-flex align-items-center justify-content-center mb-3" style={{ minHeight: 120, background: groupName === 'Portal' ? '#071226' : '#000000' }}>
                              <BrandImage target={option.key} alt={`${option.label} preview`} fallbackSrc={draft.pages[option.key]} style={{ width: '100%', maxWidth: option.key === 'portalSidebar' || option.key === 'authPortalMark' ? 120 : 240, maxHeight: 80, objectFit: 'contain' }} />
                            </div>
                            <Form.Label className="small text-uppercase text-secondary fw-semibold">Path or uploaded image</Form.Label>
                            <Form.Control value={draft.pages[option.key] || ''} style={surfaceStyles.input} onChange={event => handlePageValueChange(option.key, event.target.value)} placeholder="/fmg-login-logo.png" />
                            <Form.Control type="file" accept="image/*" style={{ ...surfaceStyles.input, marginTop: 12 }} onChange={handlePickFile(option.key)} />
                            <div className="d-flex flex-wrap gap-2 mt-3">
                              {BRANDING_PRESETS.map(image => <Button key={`${option.key}-${image}`} style={surfaceStyles.button} className="rounded-pill" onClick={() => handlePageValueChange(option.key, image)}>{image.split('/').pop()}</Button>)}
                            </div>
                          </div>
                        </Col>)}
                    </Row>
                  </CardBody>
                </Card>)}
            </>}
        </CardBody>
      </Card>
    </>;
};

export default PreferencesWorkspace;
