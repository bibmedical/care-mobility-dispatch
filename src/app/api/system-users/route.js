import { NextResponse } from 'next/server';
import { readSystemUsersPayload, writeSystemUsersState } from '@/server/system-users-store';

export async function GET() {
  const payload = await readSystemUsersPayload();
  return NextResponse.json(payload);
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const payload = await writeSystemUsersState(body);
    return NextResponse.json({
      ...payload,
      ok: true
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Unable to save users'
    }, {
      status: 400
    });
  }
}
