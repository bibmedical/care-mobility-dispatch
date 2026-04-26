import { NextResponse } from 'next/server';
import { verifyPasswordResetCode } from '@/server/password-reset-store';
import { findPersistedSystemUserByEmail, updatePersistedSystemUserPasswordByEmail } from '@/server/system-users-store';

const isStrongEnoughPassword = password => String(password ?? '').trim().length >= 6;

export const POST = async req => {
  try {
    const { email, code, password } = await req.json();

    if (!email || !code || !password) {
      return NextResponse.json({ error: 'Email, code, and new password are required' }, { status: 400 });
    }

    if (!isStrongEnoughPassword(password)) {
      return NextResponse.json({ error: 'Password must be at least 6 characters long' }, { status: 400 });
    }

    const user = await findPersistedSystemUserByEmail(email);

    if (!user) {
      return NextResponse.json({ error: 'User with this email not found' }, { status: 404 });
    }

    if (!user.webAccess) {
      return NextResponse.json({ error: 'User does not have web access' }, { status: 403 });
    }

    await verifyPasswordResetCode(email, code);
    await updatePersistedSystemUserPasswordByEmail(email, password);

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully. You can now sign in with your email or username.'
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to reset password' }, { status: 400 });
  }
};