import { NextResponse } from 'next/server';
import { verifyEmailAuthCode } from '@/server/email-auth-store';
import { authorizeSystemUser } from '@/helpers/system-users';
import { readSystemUsersPayload } from '@/server/system-users-store';

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

    // Find user by email
    const state = await readSystemUsersPayload();
    const user = state.users.find(u => {
      const userEmail = String(u.email || '').toLowerCase().trim();
      const checkEmail = String(email).toLowerCase().trim();
      return userEmail === checkEmail && userEmail !== '';
    });

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
