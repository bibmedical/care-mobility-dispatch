import { NextResponse } from 'next/server';
import { sendPasswordResetCode } from '@/server/password-reset-store';
import { findPersistedSystemUserByEmail } from '@/server/system-users-store';

export const POST = async req => {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const user = await findPersistedSystemUserByEmail(email);

    if (!user) {
      return NextResponse.json({ error: 'User with this email not found' }, { status: 404 });
    }

    if (!user.webAccess) {
      return NextResponse.json({ error: 'User does not have web access' }, { status: 403 });
    }

    const result = await sendPasswordResetCode(email);

    return NextResponse.json({
      success: true,
      message: `Password reset code sent to ${String(email).trim().toLowerCase()}`,
      expiresIn: result.expiresIn
    });
  } catch (error) {
    const message = error.message || 'Failed to send password reset code';
    const status = message.includes('not configured') ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
};