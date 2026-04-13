'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#020617', color: '#e2e8f0', fontFamily: 'Segoe UI, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: 720, border: '1px solid rgba(148, 163, 184, 0.28)', borderRadius: 18, background: 'rgba(15, 23, 42, 0.96)', padding: 28 }}>
          <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Global Error</div>
          <h1 style={{ margin: '0 0 10px', fontSize: 28 }}>The app failed to render.</h1>
          <p style={{ margin: '0 0 16px', color: '#cbd5e1' }}>Next.js triggered the global error boundary. Retry the render after the failing route code is corrected.</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ border: '1px solid #334155', borderRadius: 10, background: '#1d4ed8', color: '#ffffff', padding: '10px 14px', fontWeight: 700, cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      </body>
    </html>
  );
}