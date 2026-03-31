import { NextResponse } from 'next/server';

// Send message through WhatsApp, Telegram, Viber, Signal, or SMS
export const POST = async (request) => {
  try {
    const { method, phoneNumber, telegramHandle, viberNumber, signalNumber, message, driverId, driverName } = await request.json();

    if (!method || !message) {
      return NextResponse.json({ error: 'Missing method or message' }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${method.toUpperCase()} - Driver: ${driverName} (${driverId}) - Message: ${message}`;

    switch (method) {
      case 'whatsapp':
        return await sendWhatsApp(phoneNumber, message, driverId, logEntry);
      case 'telegram':
        return await sendTelegram(telegramHandle, message, driverId, logEntry);
      case 'viber':
        return await sendViber(viberNumber, message, driverId, logEntry);
      case 'signal':
        return await sendSignal(signalNumber, message, driverId, logEntry);
      case 'sms':
        return await sendSMS(phoneNumber, message, driverId, logEntry);
      default:
        return NextResponse.json({ error: 'Invalid method' }, { status: 400 });
    }
  } catch (error) {
    console.error('Send message error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

const sendWhatsApp = async (phoneNumber, message, driverId, logEntry) => {
  try {
    const twilio_sid = process.env.TWILIO_ACCOUNT_SID;
    const twilio_auth = process.env.TWILIO_AUTH_TOKEN;
    const twilio_from = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

    if (!twilio_sid || !twilio_auth) {
      console.warn('[DEMO] WhatsApp - Twilio not configured:', logEntry);
      return NextResponse.json({ success: true, provider: 'whatsapp', demo: true, message: 'WhatsApp message would be sent (demo mode - no Twilio configured)' }, { status: 200 });
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${twilio_sid}/Messages.json`;
    const toNumber = formatPhoneNumber(phoneNumber, 'whatsapp');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${twilio_sid}:${twilio_auth}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        From: twilio_from,
        To: toNumber,
        Body: message
      })
    });

    const data = await response.json();
    console.log('[SUCCESS] WhatsApp message sent:', logEntry, data.sid);
    return NextResponse.json({ success: true, provider: 'whatsapp', messageId: data.sid }, { status: 200 });
  } catch (error) {
    console.error('[ERROR] WhatsApp:', logEntry, error);
    return NextResponse.json({ success: false, provider: 'whatsapp', error: error.message }, { status: 200 });
  }
};

const sendTelegram = async (telegramHandle, message, driverId, logEntry) => {
  try {
    const telegram_token = process.env.TELEGRAM_BOT_TOKEN;

    if (!telegram_token) {
      console.warn('[DEMO] Telegram - Token not configured:', logEntry);
      return NextResponse.json({ success: true, provider: 'telegram', demo: true, message: 'Telegram message would be sent (demo mode - no token configured)' }, { status: 200 });
    }

    // Telegram requires chat_id, not username. In production, you'd need to resolve handle to chat_id
    // For now, we'll send to a channel or store mapping
    const url = `https://api.telegram.org/bot${telegram_token}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramHandle, // Should be numeric ID or @channel_name
        text: message,
        parse_mode: 'HTML'
      })
    });

    const data = await response.json();
    if (data.ok) {
      console.log('[SUCCESS] Telegram message sent:', logEntry, data.result.message_id);
      return NextResponse.json({ success: true, provider: 'telegram', messageId: data.result.message_id }, { status: 200 });
    } else {
      throw new Error(data.description || 'Telegram API error');
    }
  } catch (error) {
    console.error('[ERROR] Telegram:', logEntry, error);
    return NextResponse.json({ success: false, provider: 'telegram', error: error.message }, { status: 200 });
  }
};

const sendViber = async (viberNumber, message, driverId, logEntry) => {
  try {
    const viber_token = process.env.VIBER_BOT_TOKEN;

    if (!viber_token) {
      console.warn('[DEMO] Viber - Token not configured:', logEntry);
      return NextResponse.json({ success: true, provider: 'viber', demo: true, message: 'Viber message would be sent (demo mode - no token configured)' }, { status: 200 });
    }

    const url = 'https://chatapi.viber.com/pa/send_message';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Viber-Auth-Token': viber_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        receiver: viberNumber,
        min_api_version: 1,
        sender: { name: 'Care Mobility', avatar: 'https://caremobility.com/logo.png' },
        type: 'text',
        text: message
      })
    });

    const data = await response.json();
    console.log('[SUCCESS] Viber message sent:', logEntry, data);
    return NextResponse.json({ success: true, provider: 'viber', response: data }, { status: 200 });
  } catch (error) {
    console.error('[ERROR] Viber:', logEntry, error);
    return NextResponse.json({ success: false, provider: 'viber', error: error.message }, { status: 200 });
  }
};

const sendSignal = async (signalNumber, message, driverId, logEntry) => {
  try {
    const signal_server = process.env.SIGNAL_SERVER_URL;

    if (!signal_server) {
      console.warn('[DEMO] Signal - Server not configured:', logEntry);
      return NextResponse.json({ success: true, provider: 'signal', demo: true, message: 'Signal message would be sent (demo mode - no server configured)' }, { status: 200 });
    }

    const url = `${signal_server}/v1/send`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: [signalNumber],
        message: message
      })
    });

    const data = await response.json();
    console.log('[SUCCESS] Signal message sent:', logEntry);
    return NextResponse.json({ success: true, provider: 'signal', response: data }, { status: 200 });
  } catch (error) {
    console.error('[ERROR] Signal:', logEntry, error);
    return NextResponse.json({ success: false, provider: 'signal', error: error.message }, { status: 200 });
  }
};

const sendSMS = async (phoneNumber, message, driverId, logEntry) => {
  try {
    const twilio_sid = process.env.TWILIO_ACCOUNT_SID;
    const twilio_auth = process.env.TWILIO_AUTH_TOKEN;
    const twilio_from = process.env.TWILIO_SMS_NUMBER;

    if (!twilio_sid || !twilio_auth || !twilio_from) {
      console.warn('[DEMO] SMS - Twilio not configured:', logEntry);
      return NextResponse.json({ success: true, provider: 'sms', demo: true, message: 'SMS would be sent (demo mode - no Twilio configured)' }, { status: 200 });
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${twilio_sid}/Messages.json`;
    const toNumber = formatPhoneNumber(phoneNumber, 'sms');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${twilio_sid}:${twilio_auth}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        From: twilio_from,
        To: toNumber,
        Body: message
      })
    });

    const data = await response.json();
    console.log('[SUCCESS] SMS sent:', logEntry, data.sid);
    return NextResponse.json({ success: true, provider: 'sms', messageId: data.sid }, { status: 200 });
  } catch (error) {
    console.error('[ERROR] SMS:', logEntry, error);
    return NextResponse.json({ success: false, provider: 'sms', error: error.message }, { status: 200 });
  }
};

const formatPhoneNumber = (phoneNumber, type) => {
  if (!phoneNumber) return '';
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  if (type === 'whatsapp') {
    return `whatsapp:+${cleaned}`;
  } else if (type === 'sms') {
    return `+${cleaned}`;
  }
  return phoneNumber;
};
