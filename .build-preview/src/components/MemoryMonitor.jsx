'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

const REFRESH_INTERVAL_MS = 10000;
const AUTO_RESET_HEAP_MB = 900;
const AUTO_RESET_RSS_MB = 1600;
const AUTO_RESET_COOLDOWN_MS = 90000;
const RESET_REFRESH_DELAYS_MS = [300, 1200];

const formatNumber = value => Number.isFinite(value) ? value.toFixed(0) : '--';
const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));

const readBrowserMemory = () => {
  if (typeof window === 'undefined') return null;

  const memory = window.performance?.memory;
  if (!memory) return null;

  return {
    jsHeapUsedMb: Math.round(memory.usedJSHeapSize / 1024 / 1024),
    jsHeapTotalMb: Math.round(memory.totalJSHeapSize / 1024 / 1024),
    jsHeapLimitMb: Math.round(memory.jsHeapSizeLimit / 1024 / 1024)
  };
};

const MemoryMonitor = () => {
  const [serverMemory, setServerMemory] = useState(null);
  const [browserMemory, setBrowserMemory] = useState(null);
  const [updatedAt, setUpdatedAt] = useState('');
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [resetting, setResetting] = useState(false);
  const lastAutoResetAtRef = useRef(0);

  const loadMemory = async () => {
    const response = await fetch('/api/health', {
      cache: 'no-store'
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Unable to load memory stats.');
    }

    setServerMemory(payload?.memory || null);
    setBrowserMemory(readBrowserMemory());
    setUpdatedAt(new Date().toLocaleTimeString());
    setError('');
    return payload;
  };

  useEffect(() => {
    let active = true;

    const syncMemory = async () => {
      try {
        const payload = await loadMemory();
        if (!active) return;
        setStatusMessage(payload?.resetRequested ? (payload?.message || '') : '');
      } catch (fetchError) {
        if (!active) return;
        setBrowserMemory(readBrowserMemory());
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load memory stats.');
      }
    };

    void syncMemory();
    const intervalId = window.setInterval(() => {
      void syncMemory();
    }, REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const serverSummary = useMemo(() => {
    if (!serverMemory) return 'Server RAM --';
    return `Server RSS ${formatNumber(serverMemory.rssMb)} MB`;
  }, [serverMemory]);

  const browserSummary = useMemo(() => {
    if (!browserMemory) return 'Browser heap n/a';
    return `Browser JS ${formatNumber(browserMemory.jsHeapUsedMb)} / ${formatNumber(browserMemory.jsHeapLimitMb)} MB`;
  }, [browserMemory]);

  const handleResetMemory = async () => {
    setResetting(true);
    setError('');
    setStatusMessage('');

    try {
      const previousRssMb = Number(serverMemory?.rssMb) || 0;
      const previousHeapUsedMb = Number(serverMemory?.heapUsedMb) || 0;
      const response = await fetch('/api/health', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to reset memory.');
      }

      let latestPayload = payload;

      for (const delayMs of RESET_REFRESH_DELAYS_MS) {
        await wait(delayMs);
        latestPayload = await loadMemory();
      }

      const nextRssMb = Number(latestPayload?.memory?.rssMb) || 0;
      const nextHeapUsedMb = Number(latestPayload?.memory?.heapUsedMb) || 0;
      const rssDelta = previousRssMb > 0 ? previousRssMb - nextRssMb : 0;
      const heapDelta = previousHeapUsedMb > 0 ? previousHeapUsedMb - nextHeapUsedMb : 0;

      if (!payload?.gcAvailable) {
        setStatusMessage(payload?.message || 'Server garbage collection is not exposed in this runtime.');
      } else if (rssDelta > 0 || heapDelta > 0) {
        setStatusMessage(`Reset done. RSS ${rssDelta > 0 ? `-${formatNumber(rssDelta)}` : formatNumber(nextRssMb)} MB, heap ${heapDelta > 0 ? `-${formatNumber(heapDelta)}` : formatNumber(nextHeapUsedMb)} MB.`);
      } else {
        setStatusMessage('GC executed, but this process is still retaining memory.');
      }
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to reset memory.');
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    if (!serverMemory || resetting) return;

    const rssMb = Number(serverMemory?.rssMb) || 0;
    const heapUsedMb = Number(serverMemory?.heapUsedMb) || 0;
    const shouldAutoReset = rssMb >= AUTO_RESET_RSS_MB || heapUsedMb >= AUTO_RESET_HEAP_MB;
    const now = Date.now();

    if (!shouldAutoReset) return;
    if (now - lastAutoResetAtRef.current < AUTO_RESET_COOLDOWN_MS) return;

    lastAutoResetAtRef.current = now;
    setStatusMessage(`High memory detected (${rssMb} MB RSS / ${heapUsedMb} MB heap). Running auto reset...`);
    void handleResetMemory();
  }, [resetting, serverMemory]);

  return <div
      className="d-print-none"
      style={{
        width: '100%',
        padding: '10px 12px',
        borderRadius: 14,
        background: 'rgba(15, 23, 42, 0.76)',
        border: '1px solid rgba(148, 163, 184, 0.18)',
        color: '#e2e8f0',
        backdropFilter: 'blur(10px)',
        fontSize: 12,
        lineHeight: 1.45
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <strong style={{ fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#93c5fd' }}>Memory Live</strong>
        <span style={{ color: '#94a3b8' }}>{updatedAt || '...'}</span>
      </div>
      <div style={{ fontWeight: 600 }}>{serverSummary}</div>
      {serverMemory ? <div style={{ color: '#cbd5e1' }}>Heap {formatNumber(serverMemory.heapUsedMb)} / {formatNumber(serverMemory.heapTotalMb)} MB</div> : null}
      {serverMemory ? <div style={{ color: '#94a3b8' }}>Auto reset at {AUTO_RESET_HEAP_MB} MB heap or {AUTO_RESET_RSS_MB} MB RSS</div> : null}
      <div style={{ color: '#cbd5e1' }}>{browserSummary}</div>
      <button
        type="button"
        onClick={() => {
          void handleResetMemory();
        }}
        disabled={resetting}
        className="btn btn-sm mt-2"
        style={{
          width: '100%',
          borderRadius: 10,
          border: '1px solid rgba(96, 165, 250, 0.35)',
          background: resetting ? 'rgba(71, 85, 105, 0.7)' : 'rgba(30, 41, 59, 0.95)',
          color: '#dbeafe'
        }}
      >
        {resetting ? 'Resetting...' : 'Reset Memory'}
      </button>
      {statusMessage ? <div style={{ color: '#93c5fd', marginTop: 6 }}>{statusMessage}</div> : null}
      {error ? <div style={{ color: '#fca5a5', marginTop: 6 }}>{error}</div> : null}
    </div>;
};

export default MemoryMonitor;