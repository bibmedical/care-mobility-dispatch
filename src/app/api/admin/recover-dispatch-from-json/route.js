import { NextResponse } from 'next/server';

const legacyJsonDisabledResponse = () =>
  NextResponse.json(
    {
      ok: false,
      error: 'legacy-json-disabled',
      message: 'Legacy NEMT JSON recovery is disabled. Use SQL-backed admin and dispatch state only.'
    },
    { status: 410 }
  );

// Legacy JSON recovery endpoints are disabled
// All data is stored in PostgreSQL via dispatch_state and admin_state tables

export async function GET() {
  return legacyJsonDisabledResponse();
}

export async function POST() {
  return legacyJsonDisabledResponse();
}
