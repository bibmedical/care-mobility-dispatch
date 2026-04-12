import { revokeWebAuthSession } from '@/server/web-auth-session-store';

export async function POST(req) {
  try {
    const { userId, authSessionId } = await req.json();
    
    if (!userId && !authSessionId) {
      return Response.json(
        { success: false, error: 'userId or authSessionId is required' },
        { status: 400 }
      );
    }

    await revokeWebAuthSession({
      userId,
      sessionId: authSessionId,
      reason: 'User logout'
    });
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error closing web auth session:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
