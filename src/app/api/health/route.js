import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'care-mobility-dispatch',
    timestamp: new Date().toISOString()
  });
}