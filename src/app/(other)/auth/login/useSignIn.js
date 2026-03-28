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
  const {
    push
  } = useRouter();
  const {
    showNotification
  } = useNotificationContext();
  const queryParams = useQueryParams();
  const loginFormSchema = yup.object({
    identifier: yup.string().required('Please enter your username or email'),
    password: yup.string().required('Please enter your password'),
    companyKey: yup.string().transform(value => String(value ?? '').trim().toUpperCase()).oneOf([COMPANY_KEY], 'Please enter the company code correctly').required('Please enter the company code'),
    portalPage: yup.string().oneOf(PAGE_OPTIONS.map(option => option.value)).required('Please choose a page')
  });
  const {
    control,
    handleSubmit
  } = useForm({
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
  return {
    loading,
    login,
    control
  };
};
export default useSignIn;