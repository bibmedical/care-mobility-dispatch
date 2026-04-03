import { NextResponse } from 'next/server';
import { readNemtDispatchState, writeNemtDispatchState } from '@/server/nemt-dispatch-store';

export async function GET() {
  const payload = await readNemtDispatchState();
  return NextResponse.json(payload);
}

export async function PUT(request) {
  const body = await request.json();
  const allowTripShrink = request.headers.get('x-dispatch-allow-trip-shrink') === '1';
  const nextState = await writeNemtDispatchState(body, {
    allowTripShrink
  });
  return NextResponse.json({
    ...nextState,
    ok: true
  });
}
