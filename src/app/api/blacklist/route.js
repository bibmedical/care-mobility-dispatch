import { NextResponse } from 'next/server';
import { readBlacklistState, writeBlacklistState } from '@/server/blacklist-store';

export async function GET() {
  const state = await readBlacklistState();
  return NextResponse.json(state);
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const payload = await writeBlacklistState(body);
    return NextResponse.json({
      ...payload,
      ok: true
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Unable to save blacklist'
    }, {
      status: 400
    });
  }
}