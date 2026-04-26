import { NextResponse } from 'next/server';
import { processInboundConfirmationReply } from '@/server/sms-confirmation-service';
import { readIntegrationsState, writeIntegrationsState } from '@/server/integrations-store';

export async function POST(request) {
  const body = await request.json();
  const payload = body?.data?.payload || body?.payload || {};
  const result = await processInboundConfirmationReply({
    provider: 'telnyx',
    fromPhone: payload?.from?.phone_number || payload?.from || '',
    messageText: payload?.text || payload?.body || '',
    providerMessageId: payload?.id || body?.data?.id || ''
  });

  const integrationsState = await readIntegrationsState();
  await writeIntegrationsState({
    ...integrationsState,
    sms: {
      ...integrationsState.sms,
      lastInboundAt: new Date().toISOString()
    }
  });

  return NextResponse.json({
    ok: true,
    ...result
  });
}