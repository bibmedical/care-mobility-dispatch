import CredentialsProvider from 'next-auth/providers/credentials';
import { randomBytes } from 'crypto';
import { authorizePersistedSystemUser, findPersistedSystemUserByIdentifier } from '@/server/system-users-store';
import { logLoginFailure } from '@/server/login-failures-store';
import { consumeVerifiedTemp2FASession } from '@/server/temp-2fa-session-store';
import { createWebAuthSession, hasActiveWebSession, revokeOtherWebAuthSessions } from '@/server/web-auth-session-store';

const isLocalPasswordlessWebEnabled = () => process.env.NODE_ENV !== 'production';

const normalizeIp = value => {
  const raw = String(value ?? '').split(',')[0].trim();
  if (!raw) return '';
  if (raw === '::1' || raw === '127.0.0.1' || raw === '::ffff:127.0.0.1') return 'localhost';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
};

const getRequestIp = req => {
  const headers = req?.headers;
  const forwarded = typeof headers?.get === 'function' ? headers.get('x-forwarded-for') : headers?.['x-forwarded-for'];
  const realIp = typeof headers?.get === 'function' ? headers.get('x-real-ip') : headers?.['x-real-ip'];
  const socketIp = req?.socket?.remoteAddress;
  return normalizeIp(forwarded || realIp || socketIp || '');
};

const isWebDuplicateSessionGuardEnabled = () => String(process.env.ENABLE_WEB_SESSION_GUARD || '').trim().toLowerCase() === 'true';

export const options = {
  providers: [CredentialsProvider({
    name: 'credentials',
    credentials: {
      identifier: {
        label: 'Username or Email:',
        type: 'text',
        placeholder: 'Enter your username'
      },
      password: {
        label: 'Password',
        type: 'password'
      },
      clientType: {
        label: 'Client Type',
        type: 'text'
      },
      webLoginToken: {
        label: 'Web Login Token',
        type: 'text'
      },
      webLoginMode: {
        label: 'Web Login Mode',
        type: 'text'
      }
    },
    async authorize(credentials, req) {
      try {
        const requestIp = getRequestIp(req);
        const userAgent = typeof req?.headers?.get === 'function' ? req.headers.get('user-agent') : req?.headers?.['user-agent'];
        const clientType = credentials?.clientType ?? 'web';
        const forceSessionTakeover = String(credentials?.forceSessionTakeover || '').trim().toLowerCase() === 'true';
        const identifier = String(credentials?.identifier || '').trim();
        const password = String(credentials?.password || '').trim();
        const webLoginToken = String(credentials?.webLoginToken || '').trim();
        const webLoginMode = String(credentials?.webLoginMode || 'web-pin').trim() || 'web-pin';
        const result = !password && clientType === 'web' && isLocalPasswordlessWebEnabled()
          ? await findPersistedSystemUserByIdentifier(identifier)
          : await authorizePersistedSystemUser({
            identifier,
            password,
            clientType
          });

        if (result && clientType === 'web' && isWebDuplicateSessionGuardEnabled()) {
          const hasActiveSession = await hasActiveWebSession(result.id, { requestIp });
          if (hasActiveSession) {
            if (forceSessionTakeover) {
              await revokeOtherWebAuthSessions(result.id, {
                reason: 'Forced takeover during credentials login'
              });
            } else {
              throw new Error('This account is already active on another web session.');
            }
          }

          const hasVerifiedWebChallenge = await consumeVerifiedTemp2FASession({
            token: webLoginToken,
            userId: result.id,
            mode: webLoginMode
          });

          if (!hasVerifiedWebChallenge) {
            throw new Error('Web verification code is required.');
          }
        }

        if (!result) {
          // Log failed attempt
          void logLoginFailure({
            identifier: credentials?.identifier,
            reason: 'Invalid credentials',
            clientType: credentials?.clientType ?? 'web',
            ip: req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown'
          });
        }

        return result ? {
          ...result,
          loginIp: requestIp,
          authSessionId: randomBytes(24).toString('hex'),
          userAgent: String(userAgent || '')
        } : null;
      } catch (error) {
        // Log failed attempt on error
        void logLoginFailure({
          identifier: credentials?.identifier,
          reason: error.message || 'Authentication error',
          clientType: credentials?.clientType ?? 'web',
          ip: req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown'
        });
        return null;
      }
    }
  }), CredentialsProvider({
    id: 'email-verified',
    name: 'Email Verified',
    credentials: {
      email: {
        label: 'Email',
        type: 'email'
      },
      user: {
        label: 'User',
        type: 'text'
      },
      clientType: {
        label: 'Client Type',
        type: 'text'
      }
    },
    async authorize(credentials, req) {
      // User has already been verified by email verification endpoint
      try {
        const requestIp = getRequestIp(req);
        const userAgent = typeof req?.headers?.get === 'function' ? req.headers.get('user-agent') : req?.headers?.['user-agent'];
        const user = JSON.parse(credentials?.user || '{}');
        if (!user.id || !user.email) {
          // Log failed attempt
          void logLoginFailure({
            identifier: credentials?.email,
            reason: 'Invalid user data from email verification',
            clientType: credentials?.clientType ?? 'web',
            ip: req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown'
          });
          throw new Error('Invalid user data');
        }
        return {
          ...user,
          loginIp: requestIp,
          authSessionId: randomBytes(24).toString('hex'),
          userAgent: String(userAgent || '')
        };
      } catch (error) {
        // Log failed attempt
        void logLoginFailure({
          identifier: credentials?.email,
          reason: error.message || 'Email auth error',
          clientType: credentials?.clientType ?? 'web',
          ip: req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown'
        });
        return null;
      }
    }
  })],
  secret: process.env.NEXTAUTH_SECRET || 'kvwLrfri/MBznUCofIoRH9+NvGu6GqvVdqO3mor1GuA=',
  pages: {
    signIn: '/auth/login'
  },
  callbacks: {
    async signIn({
      user,
      account
    }) {
      if (user?.id && user?.authSessionId && account?.provider) {
        try {
          await createWebAuthSession({
            sessionId: user.authSessionId,
            userId: user.id,
            username: user.username || user.email,
            email: user.email,
            role: user.role || 'unknown',
            ipAddress: normalizeIp(user.loginIp || ''),
            userAgent: user.userAgent || ''
          });
        } catch (error) {
          console.error('Failed to create web auth session:', error);
        }
      }
      return true;
    },
    async jwt({
      token,
      user
    }) {
      if (user) {
        token.user = {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          webAccess: user.webAccess,
          androidAccess: user.androidAccess,
          inactivityTimeoutMinutes: user.inactivityTimeoutMinutes || 15
        };
        token.loginIp = normalizeIp(user.loginIp || '');
        token.authenticatedAt = Date.now();
        token.authSessionId = user.authSessionId || '';
      }
      return token;
    },
    session: ({
      session,
      token
    }) => {
      session.user = {
        ...token.user,
        name: token.user ? `${token.user.firstName} ${token.user.lastName}`.trim() : '',
        inactivityTimeoutMinutes: token.user?.inactivityTimeoutMinutes || 15,
        authSessionId: token.authSessionId || ''
      };
      return Promise.resolve(session);
    }
  },
  session: {
    // Inactivity is enforced in-app; keep auth session long enough to avoid
    // hard sign-outs during normal navigation between modules.
    maxAge: 12 * 60 * 60,
    updateAge: 5 * 60,
    generateSessionToken: () => {
      return randomBytes(32).toString('hex');
    }
  }
};