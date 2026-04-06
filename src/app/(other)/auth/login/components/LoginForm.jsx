'use client';

import IconifyIcon from '@/components/wrappers/IconifyIcon';
import Link from 'next/link';
import PortalMark from './PortalMark';
import { Alert, Button, Card, CardBody, Col, Form, FormControl, FormGroup, FormLabel } from 'react-bootstrap';
import { useState } from 'react';
import useSignIn, { PAGE_OPTIONS } from '../useSignIn';

const shellStyles = {
  border: '1px solid rgba(19, 28, 45, 0.12)',
  borderRadius: 20,
  boxShadow: '0 20px 60px rgba(15, 23, 42, 0.08)',
  backgroundColor: '#ffffff'
};

const headerStyles = {
  admin: {
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
  }
};

const LoginForm = () => {
  const {
    loading,
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
    requires2FA,
    twoFACode,
    setTwoFACode,
    verify2FALogin,
    cancel2FA,
    lockoutStatus
  } = useSignIn();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async event => {
    event.preventDefault();
    await submitCredentialsLogin({
      identifier,
      password,
      companyKey: 'CMS255',
      portalPage: PAGE_OPTIONS[0].value
    });
  };

  return <>
      {requires2FA ? <Alert variant="warning" className="mb-4">
          <div className="fw-semibold">Admin 2FA required</div>
          <div className="small mb-3">Enter the 6-digit code from your authenticator app to finish the sign-in.</div>
          <Form onSubmit={verify2FALogin}>
            <FormGroup className="mb-3">
              <FormLabel>2FA Code</FormLabel>
              <FormControl value={twoFACode} onChange={event => setTwoFACode(event.target.value.replace(/[^\d]/g, '').slice(0, 6))} maxLength={6} placeholder="123456" />
            </FormGroup>
            <div className="d-flex gap-2">
              <Button type="submit" variant="dark" disabled={loading || twoFACode.length !== 6}>Verify</Button>
              <Button type="button" variant="outline-secondary" onClick={cancel2FA} disabled={loading}>Cancel</Button>
            </div>
          </Form>
        </Alert> : null}

        {loginMode === 'credentials' ? <div className="mt-4 mb-2">
          {lockoutStatus?.isBlocked ? <Alert variant="danger" className="mb-3 py-2">
              <div className="fw-semibold">Account temporarily locked</div>
              <div className="small">{lockoutStatus.message}</div>
              {lockoutStatus.lockRemaining ? <div className="small mt-1">Time remaining: {lockoutStatus.lockRemaining}</div> : null}
              <div className="small mt-1">If you need immediate access, contact your admin.</div>
            </Alert> : null}
          <Form onSubmit={handleSubmit}>
            <FormGroup className="mb-3">
              <FormLabel>Username or Email</FormLabel>
              <FormControl value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="Enter your username or email" autoComplete="username" />
            </FormGroup>
            <FormGroup className="mb-2">
              <FormLabel>Password</FormLabel>
              <div className="input-group">
                <FormControl type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" />
                <button type="button" className="btn btn-outline-secondary" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
                  <IconifyIcon icon={showPassword ? 'fa6-solid:eye-slash' : 'fa6-solid:eye'} />
                </button>
              </div>
            </FormGroup>
            <div className="text-end mb-3">
              <Link href="/auth/reset-pass" className="text-muted font-13">Forgot password?</Link>
            </div>
            <div className="d-grid mb-3">
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? 'Logging in...' : 'Log In'} <IconifyIcon icon="fa6-solid:right-to-bracket" className="ms-1" />
              </Button>
            </div>
          </Form>
          <div className="text-center">
            <button type="button" className="btn btn-link p-0 font-13" onClick={() => setLoginMode('email')}>or Log In with Email Code →</button>
          </div>
        </div> : <form onSubmit={emailStep === 'send' ? sendEmailCode : verifyEmailCode} className="my-4">
          <Card style={shellStyles} className="overflow-hidden">
            <CardBody style={headerStyles.admin} className="p-4 border-0">
              <div className="d-flex align-items-center justify-content-between gap-3">
                <div>
                  <div className="text-uppercase small fw-semibold" style={{ letterSpacing: '0.14em', opacity: 0.8 }}>Administrator</div>
                  <h4 className="mt-2 mb-1 text-white">Email code access</h4>
                  <div className="small" style={{ opacity: 0.82 }}>Passwordless admin sign-in for web access.</div>
                </div>
                <PortalMark size={52} />
              </div>
            </CardBody>
            <CardBody className="p-4">
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
                  ← Back to admin and driver login
                </button>
              </div>
            </CardBody>
          </Card>
        </form>}
    </>;
};

export default LoginForm;
