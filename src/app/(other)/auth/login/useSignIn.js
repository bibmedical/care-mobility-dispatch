'use client';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import useQueryParams from '@/hooks/useQueryParams';
import { useNotificationContext } from '@/context/useNotificationContext';

export const COMPANY_KEY = 'CMS255';

export const PAGE_OPTIONS = [{
  value: 'dispatching',
  label: 'Dispatching',
  href: '/dispatcher'
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

const useSignIn = () => {
  const [loading, setLoading] = useState(false);
  const [loginMode, setLoginMode] = useState('credentials'); // 'credentials' or 'email'
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailStep, setEmailStep] = useState('send'); // 'send' or 'verify'
  const [emailValue, setEmailValue] = useState('');
  const [codeValue, setCodeValue] = useState('');
  const [portalPageValue, setPortalPageValue] = useState(PAGE_OPTIONS[0].value);

  const { push } = useRouter();
  const { showNotification } = useNotificationContext();
  const queryParams = useQueryParams();

  const loginFormSchema = yup.object({
    identifier: yup.string().trim().min(1, 'Please enter your username or email').required('Please enter your username or email'),
    password: yup.string().trim().min(1, 'Please enter your password').required('Please enter your password'),
    companyKey: yup.string().transform(value => String(value ?? '').trim().toUpperCase()).oneOf([COMPANY_KEY], 'Please enter the company code correctly').required('Please enter the company code'),
    portalPage: yup.string().oneOf(PAGE_OPTIONS.map(option => option.value)).required('Please choose a page')
  });

  const { control, handleSubmit } = useForm({
    resolver: yupResolver(loginFormSchema),
    defaultValues: {
      identifier: '',
      password: '',
      companyKey: COMPANY_KEY,
      portalPage: PAGE_OPTIONS[0].value
    }
  });

  const login = handleSubmit(async values => {
    setLoading(true);
    const response = await signIn('credentials', {
      redirect: false,
      identifier: values?.identifier,
      password: values?.password,
      clientType: 'web'
    });

    if (response?.ok) {
      const targetPage = PAGE_OPTIONS.find(option => option.value === values?.portalPage)?.href ?? '/dispatcher';
      push(queryParams['redirectTo'] ?? targetPage);
      showNotification({
        message: 'Successfully logged in. Redirecting....',
        variant: 'success'
      });
    } else {
      showNotification({
        message: response?.error ?? 'Unable to sign in',
        variant: 'danger'
      });
    }

    setLoading(false);
  });

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
    control,
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
    portalPageValue,
    setPortalPageValue
  };
};

export default useSignIn;