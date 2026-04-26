import { NextResponse } from 'next/server';
import { verifyEmailAuthCode } from '@/server/email-auth-store';
import { findPersistedSystemUserByEmail } from '@/server/system-users-store';

export const POST = async req => {
  try {
    const { email, code } = await req.json();
    
    if (!email || !code) {
      return NextResponse.json(
        { error: 'Email and code are required' },
        { status: 400 }
      );
    }

    // Verify the code
    await verifyEmailAuthCode(email, code);

    const user = await findPersistedSystemUserByEmail(email);

    if (!user) {
      return NextResponse.json(
        { error: 'User with this email not found' },
        { status: 404 }
      );
    }

    // Check if user has web access
    if (!user.webAccess) {
      return NextResponse.json(
        { error: 'User does not have web access' },
        { status: 403 }
      );
    }

    // Return authenticated user object (will be used by NextAuth)
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        webAccess: user.webAccess,
        androidAccess: user.androidAccess,
        inactivityTimeoutMinutes: user.inactivityTimeoutMinutes || 15
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Verification failed' },
      { status: 400 }
    );
  }
};
