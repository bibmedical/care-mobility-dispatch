import { NextResponse } from 'next/server';
import { readNemtAdminPayload, writeNemtAdminState } from '@/server/nemt-admin-store';

export async function GET() {
  const payload = await readNemtAdminPayload();
  return NextResponse.json(payload);
}

export async function PUT(request) {
  const body = await request.json();
  const nextState = await writeNemtAdminState(body);
  return NextResponse.json({
    ...nextState,
    ok: true
  });
}
