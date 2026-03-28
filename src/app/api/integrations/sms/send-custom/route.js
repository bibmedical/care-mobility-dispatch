import { NextResponse } from 'next/server';
import { sendCustomSmsRequests } from '@/server/sms-confirmation-service';

export async function POST(request) {
  try {
    const body = await request.json();
    const tripIds = Array.isArray(body?.tripIds) ? body.tripIds : body?.tripId ? [body.tripId] : [];
    const payload = await sendCustomSmsRequests({
      tripIds,
      message: body?.message
    });
    return NextResponse.json({
      ...payload,
      ok: true
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Unable to send custom SMS'
    }, {
      status: 400
    });
  }
}