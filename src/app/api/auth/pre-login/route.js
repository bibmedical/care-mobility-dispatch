import { authorizePersistedSystemUser } from '@/server/system-users-store';
import { is2FAEnabled } from '@/server/2fa-store';
import { randomBytes } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { getStorageFilePath, getStorageRoot } from '@/server/storage-paths';

const STORAGE_DIR = getStorageRoot();
const TEMP_2FA_FILE = getStorageFilePath('temp-2fa-sessions.json');

const writeTempSession = async (sessions) => {
  try {
    await mkdir(STORAGE_DIR, { recursive: true });
    await writeFile(TEMP_2FA_FILE, JSON.stringify(sessions, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing temp 2FA session:', error);
  }
};

const readTempSessions = async () => {
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(TEMP_2FA_FILE, 'utf8');
    return JSON.parse(content) || {};
  } catch {
    return {};
  }
};

export async function POST(req) {
  try {
    const { identifier, password } = await req.json();

    if (!identifier || !password) {
      return new Response(JSON.stringify({ error: 'Missing credentials' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify credentials
    const user = await authorizePersistedSystemUser({
      identifier,
      password,
      clientType: 'web'
    });

    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if user has 2FA enabled and is admin
    if (user.role === 'admin') {
      const twoFAEnabled = await is2FAEnabled(user.id);

      if (twoFAEnabled) {
        // Generate temporary token for 2FA verification
        const tempToken = randomBytes(32).toString('hex');
        
        // Store temp session with expiration (5 minutes)
        const sessions = await readTempSessions();
        sessions[tempToken] = {
          userId: user.id,
          email: user.email,
          username: user.username,
          createdAt: Date.now(),
          expiresAt: Date.now() + 5 * 60 * 1000
        };
        
        // Clean up expired sessions
        Object.keys(sessions).forEach(key => {
          if (sessions[key].expiresAt < Date.now()) {
            delete sessions[key];
          }
        });

        await writeTempSession(sessions);

        return new Response(JSON.stringify({
          requires2FA: true,
          tempToken,
          message: 'Please verify with 2FA'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // No 2FA required, proceed with normal login
    return new Response(JSON.stringify({
      requires2FA: false,
      message: 'Credentials verified. Please complete signin.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error in pre-login check:', error);
    return new Response(JSON.stringify({
      error: 'Pre-login check failed',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
