'use client';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import useQueryParams from '@/hooks/useQueryParams';
import { useNotificationContext } from '@/context/useNotificationContext';
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
    password: yup.string().required('Please enter your password')
  });
  const {
    control,
    handleSubmit
  } = useForm({
    resolver: yupResolver(loginFormSchema),
    defaultValues: {
      identifier: '',
      password: ''
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
      push(queryParams['redirectTo'] ?? '/dispatcher');
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