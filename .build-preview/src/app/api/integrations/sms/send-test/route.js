import { NextResponse } from 'next/server';
import { sendTestSmsRequest } from '@/server/sms-confirmation-service';

export async function POST(request) {
  try {
    const body = await request.json();
    const payload = await sendTestSmsRequest({
      to: body?.to,
      message: body?.message
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Unable to send test SMS'
    }, {
      status: 400
    });
  }
}