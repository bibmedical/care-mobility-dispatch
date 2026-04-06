import { NextResponse } from 'next/server';
import { sendEmailAuthCode } from '@/server/email-auth-store';
import { findPersistedSystemUserByEmail } from '@/server/system-users-store';

export const POST = async req => {
  try {
    const { email } = await req.json();
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await findPersistedSystemUserByEmail(normalizedEmail);

    if (!user) {
      return NextResponse.json({ error: 'User with this email not found' }, { status: 404 });
    }

    if (!user.webAccess) {
      return NextResponse.json({ error: 'User does not have web access' }, { status: 403 });
    }

    const result = await sendEmailAuthCode(normalizedEmail);
    
    return NextResponse.json({
      success: true,
      message: `Verification code sent to ${normalizedEmail}`,
      expiresIn: result.expiresIn,
      // In development only - remove in production
      developerCode: process.env.NODE_ENV === 'development' ? result.developerCode : undefined
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to send code' },
      { status: 400 }
    );
  }
};
