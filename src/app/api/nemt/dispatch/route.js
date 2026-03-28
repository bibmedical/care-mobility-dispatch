import { NextResponse } from 'next/server';
import { readNemtDispatchState, writeNemtDispatchState } from '@/server/nemt-dispatch-store';

export async function GET() {
  const payload = await readNemtDispatchState();
  return NextResponse.json(payload);
}

export async function PUT(request) {
  const body = await request.json();
  const nextState = await writeNemtDispatchState(body);
  return NextResponse.json({
    ...nextState,
    ok: true
  });
}
