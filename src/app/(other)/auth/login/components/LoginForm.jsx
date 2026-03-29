'use client';

import PasswordFormInput from '@/components/form/PasswordFormInput';
import TextFormInput from '@/components/form/TextFormInput';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
import Link from 'next/link';
import { Controller } from 'react-hook-form';
import { Col } from 'react-bootstrap';
import useSignIn, { PAGE_OPTIONS } from '../useSignIn';

const LoginForm = () => {
  const {
    loading,
    login,
    control
  } = useSignIn();

  return <form onSubmit={login} className="my-4">
      <Controller name="companyKey" control={control} render={({
      field
    }) => <input {...field} type="hidden" />} />

      <Controller name="portalPage" control={control} render={({
      field
    }) => <input {...field} type="hidden" value={field.value || PAGE_OPTIONS[0].value} />} />

      <TextFormInput control={control} name="identifier" label="Username or Email" containerClassName="form-group mb-2" placeholder="Enter your username or email" />

      <PasswordFormInput control={control} name="password" label="Password" containerClassName="form-group" placeholder="Enter your password" />

      <div className="form-group row mt-3">
        <Col sm={6}>
          <div className="form-check form-switch form-switch-primary">
            <input className="form-check-input" type="checkbox" id="customSwitchSuccess" />
            <label className="form-check-label" htmlFor="customSwitchSuccess">
              Remember me
            </label>
          </div>
        </Col>
        <Col sm={6} className="text-end">
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
    </form>;
};

export default LoginForm;
