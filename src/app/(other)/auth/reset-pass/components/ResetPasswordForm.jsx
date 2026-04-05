'use client';

import { useState } from 'react';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
import { Alert, Col, Form, Row } from 'react-bootstrap';
import { useNotificationContext } from '@/context/useNotificationContext';

const ResetPasswordForm = () => {
  const { showNotification } = useNotificationContext();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('send');
  const [error, setError] = useState('');

  const handleSendCode = async event => {
    event.preventDefault();
    setError('');

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/password/send-reset-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send reset code');
      }

      setEmail(normalizedEmail);
      setStep('reset');
      showNotification({
        message: `Password reset code sent to ${normalizedEmail}`,
        variant: 'success'
      });
    } catch (requestError) {
      setError(requestError.message || 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async event => {
    event.preventDefault();
    setError('');

    if (String(code).trim().length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }

    if (String(password).trim().length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code: String(code).trim(),
          password
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      setCode('');
      setPassword('');
      setConfirmPassword('');
      setStep('send');
      showNotification({
        message: data.message || 'Password updated successfully',
        variant: 'success'
      });
    } catch (requestError) {
      setError(requestError.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return <form className="my-4" onSubmit={step === 'send' ? handleSendCode : handleResetPassword}>
      {error ? <Alert variant="danger" className="py-2">{error}</Alert> : null}
      <Form.Group className="form-group mb-2">
        <Form.Label>Email</Form.Label>
        <Form.Control type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Enter your email" disabled={loading || step === 'reset'} />
      </Form.Group>

      {step === 'reset' ? <>
          <Form.Group className="form-group mb-2">
            <Form.Label>Verification Code</Form.Label>
            <Form.Control value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter the 6-digit code" inputMode="numeric" />
          </Form.Group>
          <Form.Group className="form-group mb-2">
            <Form.Label>New Password</Form.Label>
            <Form.Control type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your new password" />
          </Form.Group>
          <Form.Group className="form-group mb-2">
            <Form.Label>Confirm Password</Form.Label>
            <Form.Control type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Repeat your new password" />
          </Form.Group>
          <div className="text-muted small mb-3">Use the same email saved in User Management. After resetting, you can sign in with your email or your username.</div>
        </> : <div className="text-muted small mb-3">Enter the email saved on your user account and we will send you a 6-digit reset code.</div>}

      <Row className="form-group mb-0">
        <Col xs={12}>
          <div className="d-grid mt-3">
            <button className="btn btn-primary flex-centered" type="submit" disabled={loading}>
              {step === 'send' ? 'Send Code' : 'Save Password'} <IconifyIcon icon="fa6-solid:right-to-bracket" className="ms-1" />
            </button>
          </div>
        </Col>
      </Row>

      {step === 'reset' ? <div className="text-center mt-3">
          <button type="button" className="btn btn-link text-decoration-none p-0" onClick={() => {
        setStep('send');
        setCode('');
        setPassword('');
        setConfirmPassword('');
        setError('');
      }} disabled={loading}>
            Use another email or request a new code
          </button>
        </div> : null}
    </form>;
};
export default ResetPasswordForm;