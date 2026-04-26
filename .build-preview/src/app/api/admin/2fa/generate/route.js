import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { generate2FASecret, is2FAEnabled } from '@/server/2fa-store';
import QRCode from 'qrcode';

export async function POST(req) {
  try {
    const session = await getServerSession(options);
    if (!session || session.user.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Unauthorized: Admin access required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { generate } = await req.json();

    // Check if already enabled
    if (!generate) {
      const alreadyEnabled = await is2FAEnabled(session.user.id);
      if (alreadyEnabled) {
        return new Response(JSON.stringify({ error: '2FA already enabled for this user' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Generate new secret
    const secretData = await generate2FASecret(
      session.user.id,
      session.user.email || session.user.username,
      'Assistant App'
    );

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secretData.otpauth_url);

    return new Response(JSON.stringify({
      success: true,
      secret: secretData.secret,
      qrCode,
      message: 'Scan the QR code with your authenticator app'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error generating 2FA secret:', error);
    return new Response(JSON.stringify({
      error: 'Failed to generate 2FA secret',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function GET(req) {
  try {
    const session = await getServerSession(options);
    if (!session || session.user.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Unauthorized: Admin access required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const enabled = await is2FAEnabled(session.user.id);

    return new Response(JSON.stringify({
      success: true,
      enabled
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error checking 2FA status:', error);
    return new Response(JSON.stringify({
      error: 'Failed to check 2FA status',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
