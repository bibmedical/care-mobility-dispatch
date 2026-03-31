import { NextResponse } from 'next/server';
import { sendEmailAuthCode } from '@/server/email-auth-store';

export const POST = async req => {
  try {
    const { email } = await req.json();
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const result = await sendEmailAuthCode(email);
    
    return NextResponse.json({
      success: true,
      message: `Verification code sent to ${email}`,
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
