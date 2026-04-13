'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ width: '100%', maxWidth: 640, border: '1px solid rgba(148, 163, 184, 0.25)', borderRadius: 16, background: 'rgba(15, 23, 42, 0.92)', padding: 24 }}>
        <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Application Error</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>This page crashed.</h2>
        <p style={{ margin: '0 0 16px', color: '#cbd5e1' }}>A runtime error interrupted the page. Use retry first. If it keeps failing, the current route still has a code issue.</p>
        <button
          type="button"
          onClick={() => reset()}
          style={{ border: '1px solid #334155', borderRadius: 10, background: '#1d4ed8', color: '#ffffff', padding: '10px 14px', fontWeight: 700, cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    </div>
  );
}