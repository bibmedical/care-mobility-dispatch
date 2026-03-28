import { NextResponse } from 'next/server';
import { processInboundConfirmationReply } from '@/server/sms-confirmation-service';
import { readIntegrationsState, writeIntegrationsState } from '@/server/integrations-store';

const buildTwimlResponse = message => `<?xml version="1.0" encoding="UTF-8"?><Response>${message ? `<Message>${message}</Message>` : ''}</Response>`;

export async function POST(request) {
  const formData = await request.formData();
  const result = await processInboundConfirmationReply({
    provider: 'twilio',
    fromPhone: String(formData.get('From') || ''),
    messageText: String(formData.get('Body') || ''),
    providerMessageId: String(formData.get('MessageSid') || '')
  });

  const integrationsState = await readIntegrationsState();
  await writeIntegrationsState({
    ...integrationsState,
    sms: {
      ...integrationsState.sms,
      lastInboundAt: new Date().toISOString()
    }
  });

  return new NextResponse(buildTwimlResponse(result.replyMessage || ''), {
    status: 200,
    headers: {
      'Content-Type': 'text/xml'
    }
  });
}