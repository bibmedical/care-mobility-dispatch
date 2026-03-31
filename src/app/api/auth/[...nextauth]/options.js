import CredentialsProvider from 'next-auth/providers/credentials';
import { randomBytes } from 'crypto';
import { authorizePersistedSystemUser } from '@/server/system-users-store';

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
      }
    },
    async authorize(credentials, req) {
      return authorizePersistedSystemUser({
        identifier: credentials?.identifier,
        password: credentials?.password,
        clientType: credentials?.clientType ?? 'web'
      });
    }
  })],
  secret: process.env.NEXTAUTH_SECRET || 'kvwLrfri/MBznUCofIoRH9+NvGu6GqvVdqO3mor1GuA=',
  pages: {
    signIn: '/auth/login'
  },
  callbacks: {
    async signIn({
      user,
      account,
      profile,
      email,
      credentials
    }) {
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
        inactivityTimeoutMinutes: token.user?.inactivityTimeoutMinutes || 15
      };
      return Promise.resolve(session);
    }
  },
  session: {
    maxAge: 24 * 60 * 60,
    generateSessionToken: () => {
      return randomBytes(32).toString('hex');
    }
  }
};