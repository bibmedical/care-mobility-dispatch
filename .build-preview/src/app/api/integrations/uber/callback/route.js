import { NextResponse } from 'next/server';
import { readIntegrationsState, writeIntegrationsState } from '@/server/integrations-store';

export async function GET(request) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code') ?? '';
  const error = searchParams.get('error') ?? '';
  const state = await readIntegrationsState();
  const now = new Date().toISOString();

  await writeIntegrationsState({
    ...state,
    uber: {
      ...state.uber,
      lastCallbackAt: now,
      lastCallbackCode: code,
      connectionStatus: error ? `Callback error: ${error}` : code ? 'Authorization callback received' : state.uber.connectionStatus,
      tokenStatus: code ? 'Authorization code captured' : state.uber.tokenStatus
    }
  });

  const title = error ? 'Uber callback error' : 'Uber callback received';
  const body = error ? `The callback returned an error: ${error}` : code ? 'Authorization code stored. The next step is exchanging it for an access token with your real Uber credentials.' : 'Callback route is ready. Provide a code query parameter to complete the flow.';

  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title><style>body{font-family:Segoe UI,Arial,sans-serif;background:#101521;color:#e6ecff;padding:40px}main{max-width:720px;margin:0 auto;background:#171b27;border:1px solid #2a3144;border-radius:18px;padding:24px}h1{margin:0 0 12px;font-size:28px}p{line-height:1.6;color:#c4cee7}</style></head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    }
  });
}