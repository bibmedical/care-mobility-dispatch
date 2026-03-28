import { NextResponse } from 'next/server';
import { sendTripConfirmationRequests } from '@/server/sms-confirmation-service';

export async function POST(request) {
  try {
    const body = await request.json();
    const tripIds = Array.isArray(body?.tripIds) ? body.tripIds : body?.tripId ? [body.tripId] : [];
    const payload = await sendTripConfirmationRequests({ tripIds });
    return NextResponse.json({
      ...payload,
      ok: true
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Unable to send confirmation SMS'
    }, {
      status: 400
    });
  }
}