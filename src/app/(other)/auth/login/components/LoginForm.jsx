'use client';

import PasswordFormInput from '@/components/form/PasswordFormInput';
import TextFormInput from '@/components/form/TextFormInput';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
import Link from 'next/link';
import { Controller } from 'react-hook-form';
import { Col, FormControl, FormLabel, FormGroup } from 'react-bootstrap';
import { useState } from 'react';
import useSignIn, { PAGE_OPTIONS } from '../useSignIn';

const LoginForm = () => {
  const {
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
    setCodeValue
  } = useSignIn();

  return <>
      {loginMode === 'credentials' ? <form onSubmit={login} className="my-4">
          <Controller name="companyKey" control={control} render={({
          field
        }) => <input {...field} type="hidden" />} />

          <Controller name="portalPage" control={control} render={({
          field
        }) => <input {...field} type="hidden" value={field.value || PAGE_OPTIONS[0].value} />} />

          <TextFormInput control={control} name="identifier" label="Username or Email" containerClassName="form-group mb-2" placeholder="Enter your username or email" />

          <PasswordFormInput control={control} name="password" label="Password" containerClassName="form-group" placeholder="Enter your password" />

          <div className="form-group row mt-3">
            <Col sm={12} className="text-end">
              <Link href="/auth/reset-pass" className="text-muted font-13">
                Forgot password?
              </Link>
            </Col>
          </div>

          <div className="form-group mb-0 row">
            <Col xs={12}>
              <div className="d-grid mt-3">
                <button className="btn btn-primary flex-centered" type="submit" disabled={loading}>
                  {loading ? 'Logging in...' : 'Log In'} <IconifyIcon icon="fa6-solid:right-to-bracket" className="ms-1" />
                </button>
              </div>
            </Col>
          </div>

          <div className="text-center mt-4">
            <button type="button" className="btn btn-link text-primary p-0 font-13" onClick={() => setLoginMode('email')}>
              or Log In with Email Code →
            </button>
          </div>
        </form> : <form onSubmit={emailStep === 'send' ? sendEmailCode : verifyEmailCode} className="my-4">
          <Controller name="companyKey" control={control} render={({
          field
        }) => <input {...field} type="hidden" />} />

          <Controller name="portalPage" control={control} render={({
          field
        }) => <input {...field} type="hidden" value={field.value || PAGE_OPTIONS[0].value} />} />

          {emailStep === 'send' ? <>
              <FormGroup className="form-group mb-2">
                <FormLabel>Email Address</FormLabel>
                <FormControl value={emailValue} onChange={e => setEmailValue(e.target.value)} placeholder="Enter your email" disabled={emailLoading} />
              </FormGroup>

              <div className="form-group mb-0 row">
                <Col xs={12}>
                  <div className="d-grid mt-3">
                    <button type="submit" className="btn btn-primary flex-centered" disabled={emailLoading}>
                      {emailLoading ? 'Sending code...' : 'Send Code'} <IconifyIcon icon="fa6-solid:envelope" className="ms-1" />
                    </button>
                  </div>
                </Col>
              </div>
            </> : <>
              <div className="small text-secondary mb-3">
                A verification code has been sent to <strong>{emailValue}</strong>
              </div>

              <FormGroup className="form-group mb-2">
                <FormLabel>Verification Code</FormLabel>
                <FormControl value={codeValue} onChange={e => setCodeValue(e.target.value.replace(/[^\d]/g, '').slice(0, 6))} placeholder="Enter 6-digit code" maxLength="6" disabled={emailLoading} />
              </FormGroup>

              <div className="form-group mb-0 row">
                <Col xs={12}>
                  <div className="d-grid mt-3">
                    <button type="submit" className="btn btn-primary flex-centered" disabled={emailLoading || codeValue.length !== 6}>
                      {emailLoading ? 'Verifying...' : 'Verify & Log In'} <IconifyIcon icon="fa6-solid:check-circle" className="ms-1" />
                    </button>
                  </div>
                </Col>
              </div>
            </>}

          <div className="text-center mt-4">
            <button type="button" className="btn btn-link text-primary p-0 font-13" onClick={() => {
            setEmailStep('send');
            setEmailValue('');
            setCodeValue('');
            setLoginMode('credentials');
          }}>
              ← Back to Username/Password
            </button>
          </div>
        </form>}
    </>;
};

export default LoginForm;
