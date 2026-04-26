import { NextResponse } from 'next/server';
import { processInboundConfirmationReply } from '@/server/sms-confirmation-service';
import { readIntegrationsState, writeIntegrationsState } from '@/server/integrations-store';

export async function POST(request) {
  const body = await request.json();
  const eventBody = Array.isArray(body?.body) ? body.body[0] : body?.body || body;
  const result = await processInboundConfirmationReply({
    provider: 'ringcentral',
    fromPhone: eventBody?.from?.phoneNumber || eventBody?.from || '',
    messageText: eventBody?.text || eventBody?.subject || '',
    providerMessageId: eventBody?.id || body?.uuid || ''
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