'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, CardBody, Col, Form, Row, Table } from 'react-bootstrap';
import { clearJsonStorage, normalizeTargetPath, PAGE_MEMORY_DEFAULT_TARGETS, PAGE_MEMORY_PROBE_ACTIVE_KEY, PAGE_MEMORY_PROBE_EVENT, PAGE_MEMORY_PROBE_RESULTS_KEY, parseJsonStorage, readBrowserMemorySnapshot, writeJsonStorage } from '@/components/nemt/page-memory-probe';

const readServerMemorySnapshot = async () => {
  try {
    const response = await fetch('/api/health', {
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => null);
    return response.ok ? payload?.memory || null : null;
  } catch {
    return null;
  }
};

const formatMetric = value => Number.isFinite(value) ? `${value} MB` : '--';
const formatDelta = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value} MB` : '--';

const PageMemoryWorkspace = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedPath, setSelectedPath] = useState(PAGE_MEMORY_DEFAULT_TARGETS[0]?.path || '/dispatcher');
  const [customPath, setCustomPath] = useState('');
  const [results, setResults] = useState([]);
  const [arming, setArming] = useState(false);
  const [statusMessage, setStatusMessage] = useState('This page stays idle until you start a measurement.');
  const [supportMessage, setSupportMessage] = useState('');

  useEffect(() => {
    const syncResults = () => {
      setResults(parseJsonStorage(PAGE_MEMORY_PROBE_RESULTS_KEY, []));
    };

    syncResults();
    const handleStorage = event => {
      if (event.key && event.key !== PAGE_MEMORY_PROBE_RESULTS_KEY) return;
      syncResults();
    };
    const handleProbeUpdate = () => {
      syncResults();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(PAGE_MEMORY_PROBE_EVENT, handleProbeUpdate);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(PAGE_MEMORY_PROBE_EVENT, handleProbeUpdate);
    };
  }, []);

  useEffect(() => {
    const probeId = searchParams.get('probe');
    if (!probeId) return;
    setStatusMessage(`Measurement completed for run ${probeId}.`);
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.performance?.memory) {
      setSupportMessage('Browser heap metrics are available in this browser.');
      return;
    }
    setSupportMessage('Browser heap metrics are not available here. Server memory still works.');
  }, []);

  const activeTargetPath = useMemo(() => normalizeTargetPath(customPath) || normalizeTargetPath(selectedPath), [customPath, selectedPath]);

  const handleStartProbe = async () => {
    const targetPath = normalizeTargetPath(activeTargetPath);
    if (!targetPath) {
      setStatusMessage('Choose a page path before starting a measurement.');
      return;
    }

    setArming(true);
    setStatusMessage(`Preparing measurement for ${targetPath}...`);

    const baselineBrowserMemory = readBrowserMemorySnapshot();
    const baselineServerMemory = await readServerMemorySnapshot();
    const runId = `probe-${Date.now()}`;

    writeJsonStorage(PAGE_MEMORY_PROBE_ACTIVE_KEY, {
      runId,
      status: 'armed',
      startedAt: new Date().toISOString(),
      baselinePath: pathname,
      returnPath: '/settings/page-memory',
      targetPath,
      waitMs: 1800,
      baselineBrowserMemory,
      baselineServerMemory
    });

    setArming(false);
    setStatusMessage(`Measuring ${targetPath}. The app will return here automatically after capture.`);
    router.push(targetPath);
  };

  const latestResult = results[0] || null;

  return <div className="d-flex flex-column gap-3">
      <div>
        <h3 className="mb-1">Page Memory Profiler</h3>
        <p className="text-muted mb-0">Start a measurement here, open the target page, capture its memory, and return to this screen. Nothing keeps polling unless you launch a run from this page.</p>
      </div>

      <Alert variant="info" className="mb-0">
        {supportMessage || 'Checking browser memory support...'}
      </Alert>

      <Card>
        <CardBody>
          <Row className="g-3 align-items-end">
            <Col md={5}>
              <Form.Label>Preset page</Form.Label>
              <Form.Select value={selectedPath} onChange={event => setSelectedPath(event.target.value)}>
                {PAGE_MEMORY_DEFAULT_TARGETS.map(target => <option key={target.path} value={target.path}>{target.label} ({target.path})</option>)}
              </Form.Select>
            </Col>
            <Col md={5}>
              <Form.Label>Or custom path</Form.Label>
              <Form.Control value={customPath} onChange={event => setCustomPath(event.target.value)} placeholder="/trip-dashboard" />
            </Col>
            <Col md={2}>
              <Button className="w-100" onClick={() => {
              void handleStartProbe();
            }} disabled={arming}>{arming ? 'Arming...' : 'Start Test'}</Button>
            </Col>
          </Row>
          <div className="small text-muted mt-3">Target: {activeTargetPath || 'none selected'}</div>
          <div className="small mt-2">{statusMessage}</div>
        </CardBody>
      </Card>

      {latestResult ? <Card>
          <CardBody>
            <div className="fw-semibold mb-3">Latest result: {latestResult.targetPath}</div>
            <Row className="g-3">
              <Col md={6}>
                <div className="border rounded p-3 h-100">
                  <div className="fw-semibold mb-2">Browser</div>
                  <div>Heap used: {formatMetric(latestResult?.browserMemory?.jsHeapUsedMb)}</div>
                  <div>Heap total: {formatMetric(latestResult?.browserMemory?.jsHeapTotalMb)}</div>
                  <div>Delta heap used: {formatDelta(latestResult?.browserMemory?.deltaJsHeapUsedMb)}</div>
                  <div>Delta heap total: {formatDelta(latestResult?.browserMemory?.deltaJsHeapTotalMb)}</div>
                </div>
              </Col>
              <Col md={6}>
                <div className="border rounded p-3 h-100">
                  <div className="fw-semibold mb-2">Server</div>
                  <div>RSS: {formatMetric(latestResult?.serverMemory?.rssMb)}</div>
                  <div>Heap used: {formatMetric(latestResult?.serverMemory?.heapUsedMb)}</div>
                  <div>External: {formatMetric(latestResult?.serverMemory?.externalMb)}</div>
                  <div>Delta RSS: {formatDelta(latestResult?.serverMemory?.deltaRssMb)}</div>
                  <div>Delta heap used: {formatDelta(latestResult?.serverMemory?.deltaHeapUsedMb)}</div>
                </div>
              </Col>
            </Row>
          </CardBody>
        </Card> : null}

      <Card>
        <CardBody>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div className="fw-semibold">Recent measurements</div>
            <Button variant="outline-secondary" size="sm" onClick={() => {
            clearJsonStorage(PAGE_MEMORY_PROBE_RESULTS_KEY);
            clearJsonStorage(PAGE_MEMORY_PROBE_ACTIVE_KEY);
            setResults([]);
            setStatusMessage('Saved measurements cleared.');
          }}>Clear Results</Button>
          </div>
          <div className="table-responsive">
            <Table striped bordered hover size="sm" className="align-middle mb-0">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Measured</th>
                  <th>Browser Heap</th>
                  <th>Browser Delta</th>
                  <th>Server RSS</th>
                  <th>Server RSS Delta</th>
                  <th>Load</th>
                </tr>
              </thead>
              <tbody>
                {results.length > 0 ? results.map(result => <tr key={result.runId}>
                    <td>{result.targetPath}</td>
                    <td>{new Date(result.measuredAt).toLocaleString()}</td>
                    <td>{formatMetric(result?.browserMemory?.jsHeapUsedMb)}</td>
                    <td>{formatDelta(result?.browserMemory?.deltaJsHeapUsedMb)}</td>
                    <td>{formatMetric(result?.serverMemory?.rssMb)}</td>
                    <td>{formatDelta(result?.serverMemory?.deltaRssMb)}</td>
                    <td>{Number.isFinite(result?.navigation?.loadEventMs) ? `${result.navigation.loadEventMs} ms` : '--'}</td>
                  </tr>) : <tr>
                    <td colSpan={7} className="text-center text-muted py-4">No measurements yet.</td>
                  </tr>}
              </tbody>
            </Table>
          </div>
        </CardBody>
      </Card>
    </div>;
};

export default PageMemoryWorkspace;