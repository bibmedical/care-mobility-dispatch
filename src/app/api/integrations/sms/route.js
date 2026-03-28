import { NextResponse } from 'next/server';
import { readIntegrationsState, writeIntegrationsState } from '@/server/integrations-store';

export async function GET() {
  const state = await readIntegrationsState();
  return NextResponse.json(state);
}

export async function PUT(request) {
  try {
    const currentState = await readIntegrationsState();
    const body = await request.json();
    const payload = await writeIntegrationsState({
      ...currentState,
      ...body,
      sms: body?.sms ?? currentState.sms
    });
    return NextResponse.json({
      ...payload,
      ok: true
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Unable to save SMS integration'
    }, {
      status: 400
    });
  }
}