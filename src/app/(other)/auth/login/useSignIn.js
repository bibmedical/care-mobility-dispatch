'use client';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useQueryParams from '@/hooks/useQueryParams';
import { useNotificationContext } from '@/context/useNotificationContext';

export const COMPANY_KEY = 'CMS255';

export const PAGE_OPTIONS = [{
  value: 'dispatching',
  label: 'Dispatching',
  href: '/dispatcher'
}, {
  value: 'driver',
  label: 'Driver',
  href: '/drivers'
}, {
  value: 'scheduling',
  label: 'Scheduling',
  href: '/trip-dashboard'
}, {
  value: 'submitting',
  label: 'Submitting',
  href: '/forms-safe-ride-import'
}, {
  value: 'billing',
  label: 'Billing',
  href: '/rates'
}];

const isLocalPasswordlessWebEnabled = process.env.NODE_ENV !== 'production';

const useSignIn = () => {
  const [loading, setLoading] = useState(false);
  const [loginMode, setLoginMode] = useState('credentials'); // 'credentials' or 'email'
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailStep, setEmailStep] = useState('send'); // 'send' or 'verify'
  const [emailValue, setEmailValue] = useState('');
  const [codeValue, setCodeValue] = useState('');
  const [portalPageValue, setPortalPageValue] = useState(PAGE_OPTIONS[0].value);
  const [requires2FA, setRequires2FA] = useState(false);
  const [requiresCodeSetup, setRequiresCodeSetup] = useState(false);
  const [twoFACode, setTwoFACode] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [confirmSetupCode, setConfirmSetupCode] = useState('');
  const [pendingLogin, setPendingLogin] = useState(null);
  const [lockoutStatus, setLockoutStatus] = useState(null);

  const { push } = useRouter();
  const { showNotification } = useNotificationContext();
  const queryParams = useQueryParams();

  const submitCredentialsLogin = async values => {
    const normalizedIdentifier = String(values?.identifier || '').trim();
    const normalizedPassword = String(values?.password || '').trim();
    const normalizedCompanyKey = String(values?.companyKey || '').trim().toUpperCase();
    const normalizedPortalPage = PAGE_OPTIONS.some(option => option.value === values?.portalPage) ? values.portalPage : PAGE_OPTIONS[0].value;

    if (!normalizedIdentifier) {
      showNotification({
        message: 'Please enter your username or email',
        variant: 'danger'
      });
      return false;
    }

    if (!normalizedPassword && !isLocalPasswordlessWebEnabled) {
      showNotification({
        message: 'Please enter your password',
        variant: 'danger'
      });
      return false;
    }

    if (normalizedCompanyKey !== COMPANY_KEY) {
      showNotification({
        message: 'Please enter the company key correctly',
        variant: 'danger'
      });
      return false;
    }

    setLoading(true);
    setLockoutStatus(null);
    try {
      // Step 1: Pre-login check to see if 2FA is required
      const preLoginResponse = await fetch('/api/auth/pre-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: normalizedIdentifier,
          password: normalizedPassword
        })
      });

      const preLoginData = await preLoginResponse.json();

      if (!preLoginResponse.ok) {
        if (preLoginData?.isBlocked) {
          setLockoutStatus({
            isBlocked: true,
            lockRemaining: preLoginData?.lockRemaining || null,
            retryAfterSeconds: preLoginData?.retryAfterSeconds || null,
            contactAdmin: Boolean(preLoginData?.contactAdmin),
            message: preLoginData?.message || 'Account temporarily locked. Contact your administrator.'
          });
        }

        showNotification({
          message: preLoginData.message || preLoginData.error || 'Unable to sign in',
          variant: 'danger'
        });
        setLoading(false);
        return false;
      }

      if (preLoginData.requires2FA) {
        // Store info for 2FA verification
        const loginMethod = preLoginData.method || 'web-pin';
        setPendingLogin({
          identifier: normalizedIdentifier,
          password: normalizedPassword,
          tempToken: preLoginData.tempToken,
          method: loginMethod,
          portalPage: normalizedPortalPage
        });
        const setupRequired = Boolean(preLoginData.requiresCodeSetup || loginMethod === 'web-pin-setup');
        setRequiresCodeSetup(setupRequired);
        setRequires2FA(true);
        showNotification({
          message: preLoginData.message || (setupRequired
            ? 'For security, create your 6-digit web code to continue.'
            : 'Enter your 6-digit web code to continue.'),
          variant: 'info'
        });
        setLoading(false);
        return true;
      }

      // If no 2FA required, proceed with normal signin
      const response = await signIn('credentials', {
        redirect: false,
        identifier: normalizedIdentifier,
        password: normalizedPassword,
        clientType: 'web'
      });

      if (response?.ok) {
        setLockoutStatus(null);
        const targetPage = PAGE_OPTIONS.find(option => option.value === normalizedPortalPage)?.href ?? '/dispatcher';
        push(queryParams['redirectTo'] ?? targetPage);
        showNotification({
          message: 'Successfully signed in. Redirecting...',
          variant: 'success'
        });
        return true;
      } else {
        showNotification({
          message: response?.error ?? 'Unable to sign in',
          variant: 'danger'
        });
        return false;
      }
    } catch (error) {
      showNotification({
        message: error.message || 'Unable to sign in',
        variant: 'danger'
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const login = async event => {
    event?.preventDefault();
    return submitCredentialsLogin({
      identifier: '',
      password: '',
      companyKey: COMPANY_KEY,
      portalPage: PAGE_OPTIONS[0].value
    });
  };

  const sendEmailCode = async e => {
    e?.preventDefault();
    
    if (!emailValue.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      showNotification({
        message: 'Please enter a valid email address',
        variant: 'danger'
      });
      return;
    }

    setEmailLoading(true);
    try {
      const response = await fetch('/api/auth/email/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailValue })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send code');
      }

      setEmailStep('verify');
      showNotification({
        message: `Code sent to ${emailValue}`,
        variant: 'success'
      });
      
      // Development: show code if available
      if (data.developerCode) {
        console.log('Development Code:', data.developerCode);
      }
    } catch (error) {
      showNotification({
        message: error.message || 'Failed to send code',
        variant: 'danger'
      });
    } finally {
      setEmailLoading(false);
    }
  };

  const verify2FALogin = async e => {
    e?.preventDefault();

    if (!twoFACode || twoFACode.length !== 6) {
      showNotification({
        message: 'Please enter a 6-digit code',
        variant: 'danger'
      });
      return;
    }

    if (!pendingLogin) {
      showNotification({
        message: 'Verification session expired',
        variant: 'danger'
      });
      setRequires2FA(false);
      return;
    }

    setLoading(true);
    try {
      // Verify 2FA code
      const verifyResponse = await fetch('/api/auth/2fa/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tempToken: pendingLogin.tempToken,
          code: twoFACode
        })
      });

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok) {
        showNotification({
          message: verifyData.error || 'Code verification failed',
          variant: 'danger'
        });
        return;
      }

      // 2FA verified, now do the actual signin
      const signInResponse = await signIn('credentials', {
        redirect: false,
        identifier: pendingLogin.identifier,
        password: pendingLogin.password,
        clientType: 'web',
        webLoginToken: pendingLogin.tempToken,
        webLoginMode: pendingLogin.method || 'web-pin'
      });

      if (signInResponse?.ok) {
        const targetPage = PAGE_OPTIONS.find(option => option.value === pendingLogin.portalPage)?.href ?? '/dispatcher';
        push(queryParams['redirectTo'] ?? targetPage);
        showNotification({
          message: 'Successfully signed in. Redirecting...',
          variant: 'success'
        });
        setRequires2FA(false);
        setRequiresCodeSetup(false);
        setPendingLogin(null);
        setTwoFACode('');
      } else {
        showNotification({
          message: signInResponse?.error ?? 'Unable to complete sign-in',
          variant: 'danger'
        });
      }
    } catch (error) {
      showNotification({
        message: error.message || 'Code verification failed',
        variant: 'danger'
      });
    } finally {
      setLoading(false);
    }
  };

  const cancel2FA = () => {
    setRequires2FA(false);
    setRequiresCodeSetup(false);
    setPendingLogin(null);
    setTwoFACode('');
    setSetupCode('');
    setConfirmSetupCode('');
  };

  const setupWebCodeAndLogin = async e => {
    e?.preventDefault();

    const normalizedSetupCode = String(setupCode || '').replace(/\D/g, '').slice(0, 6);
    const normalizedConfirmCode = String(confirmSetupCode || '').replace(/\D/g, '').slice(0, 6);

    if (normalizedSetupCode.length !== 6 || normalizedConfirmCode.length !== 6) {
      showNotification({
        message: 'Please enter and confirm a 6-digit web code',
        variant: 'danger'
      });
      return;
    }

    if (normalizedSetupCode !== normalizedConfirmCode) {
      showNotification({
        message: 'Web code confirmation does not match',
        variant: 'danger'
      });
      return;
    }

    if (!pendingLogin?.tempToken) {
      showNotification({
        message: 'Code setup session expired',
        variant: 'danger'
      });
      setRequires2FA(false);
      setRequiresCodeSetup(false);
      return;
    }

    setLoading(true);
    try {
      const setupResponse = await fetch('/api/auth/web-code/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tempToken: pendingLogin.tempToken,
          code: normalizedSetupCode,
          confirmCode: normalizedConfirmCode
        })
      });

      const setupData = await setupResponse.json();
      if (!setupResponse.ok) {
        showNotification({
          message: setupData.error || setupData.message || 'Unable to save web code',
          variant: 'danger'
        });
        return;
      }

      const signInResponse = await signIn('credentials', {
        redirect: false,
        identifier: pendingLogin.identifier,
        password: pendingLogin.password,
        clientType: 'web',
        webLoginToken: pendingLogin.tempToken,
        webLoginMode: 'web-pin-setup'
      });

      if (signInResponse?.ok) {
        const targetPage = PAGE_OPTIONS.find(option => option.value === pendingLogin.portalPage)?.href ?? '/dispatcher';
        push(queryParams['redirectTo'] ?? targetPage);
        showNotification({
          message: 'Web code created and sign-in completed. Redirecting...',
          variant: 'success'
        });
        setRequires2FA(false);
        setRequiresCodeSetup(false);
        setPendingLogin(null);
        setSetupCode('');
        setConfirmSetupCode('');
      } else {
        showNotification({
          message: signInResponse?.error ?? 'Unable to complete sign-in',
          variant: 'danger'
        });
      }
    } catch (error) {
      showNotification({
        message: error.message || 'Unable to create web code',
        variant: 'danger'
      });
    } finally {
      setLoading(false);
    }
  };

  const verifyEmailCode = async e => {
    e?.preventDefault();
    
    if (!codeValue || codeValue.length !== 6) {
      showNotification({
        message: 'Please enter a 6-digit code',
        variant: 'danger'
      });
      return;
    }

    setEmailLoading(true);
    try {
      const response = await fetch('/api/auth/email/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailValue, code: codeValue })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      // Sign in as the user
      const signInResponse = await signIn('email-verified', {
        redirect: false,
        email: emailValue,
        user: JSON.stringify(data.user),
        clientType: 'web'
      });

      if (signInResponse?.ok) {
        const targetPage = PAGE_OPTIONS.find(option => option.value === portalPageValue)?.href ?? '/dispatcher';
        push(queryParams['redirectTo'] ?? targetPage);
        showNotification({
          message: 'Successfully logged in. Redirecting....',
          variant: 'success'
        });
      } else {
        throw new Error(signInResponse?.error || 'Unable to create session');
      }
    } catch (error) {
      showNotification({
        message: error.message || 'Verification failed',
        variant: 'danger'
      });
    } finally {
      setEmailLoading(false);
    }
  };

  return {
    loading,
    login,
    submitCredentialsLogin,
    loginMode,
    setLoginMode,
    emailLoading,
    sendEmailCode,
    verifyEmailCode,
    emailStep,
    setEmailStep,
    emailValue,
    setEmailValue,
    codeValue,
    setCodeValue,
    lockoutStatus,
    portalPageValue,
    setPortalPageValue,
    requires2FA,
    requiresCodeSetup,
    twoFACode,
    setTwoFACode,
    setupCode,
    setSetupCode,
    confirmSetupCode,
    setConfirmSetupCode,
    verify2FALogin,
    setupWebCodeAndLogin,
    cancel2FA
  };
};

export default useSignIn;