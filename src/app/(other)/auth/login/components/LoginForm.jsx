'use client';

import { Controller } from 'react-hook-form';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
import { useState } from 'react';
import useSignIn, { COMPANY_KEY, PAGE_OPTIONS } from '../useSignIn';

const fieldShellStyle = {
  border: '1px solid rgba(125, 211, 252, 0.16)',
  borderRadius: 18,
  backgroundColor: 'rgba(10, 26, 41, 0.9)',
  boxShadow: '0 14px 30px rgba(2, 6, 23, 0.22)'
};

const fieldStyle = {
  border: 0,
  boxShadow: 'none',
  background: 'transparent',
  padding: '13px 16px',
  fontSize: 18,
  color: '#f8fdff'
};

const labelStyle = {
  display: 'inline-block',
  marginBottom: 6,
  padding: '0 10px',
  borderRadius: 999,
  backgroundColor: 'rgba(30, 214, 209, 0.16)',
  color: '#a7f3f0',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase'
};

const LoginForm = () => {
  const [showPassword, setShowPassword] = useState(false);
  const {
    loading,
    login,
    control
  } = useSignIn();
  return <form onSubmit={login} className="mt-4">
      <div className="row g-3">
        <div className="col-md-6">
          <Controller name="identifier" control={control} render={({
          field,
          fieldState
        }) => <div>
                <label style={labelStyle}>Username</label>
                <div style={fieldShellStyle}>
                  <input {...field} className="form-control" placeholder="Username" style={fieldStyle} />
                </div>
                {fieldState.error ? <div className="small text-danger mt-1">{fieldState.error.message}</div> : null}
              </div>} />
        </div>

        <div className="col-md-6">
          <Controller name="password" control={control} render={({
          field,
          fieldState
        }) => <div>
                <label style={labelStyle}>Password</label>
                <div style={{
              ...fieldShellStyle,
              display: 'flex',
              alignItems: 'center'
            }}>
                  <input {...field} type={showPassword ? 'text' : 'password'} className="form-control" placeholder="Enter password" style={fieldStyle} />
                  <button type="button" className="btn btn-link pe-3" onClick={() => setShowPassword(current => !current)} style={{ color: '#7dd3fc' }}>
                    <IconifyIcon icon={showPassword ? 'iconoir:eye-off' : 'iconoir:eye'} />
                  </button>
                </div>
                {fieldState.error ? <div className="small text-danger mt-1">{fieldState.error.message}</div> : null}
              </div>} />
        </div>

        <div className="col-md-6">
          <Controller name="companyKey" control={control} render={({
          field,
          fieldState
        }) => <div>
                <label style={labelStyle}>Company Key</label>
                <div style={fieldShellStyle}>
                  <input {...field} className="form-control" placeholder="Company key" style={fieldStyle} />
                </div>
                {fieldState.error ? <div className="small text-danger mt-1">{fieldState.error.message}</div> : <div className="small mt-1" style={{ color: '#7f9bb1' }}>Use this company code: {COMPANY_KEY}</div>}
              </div>} />
        </div>

        <div className="col-md-6">
          <Controller name="portalPage" control={control} render={({
          field,
          fieldState
        }) => <div>
                <label style={labelStyle}>Page</label>
                <div style={fieldShellStyle}>
                  <select {...field} className="form-select" style={{
                ...fieldStyle,
                cursor: 'pointer'
              }}>
                    {PAGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                {fieldState.error ? <div className="small text-danger mt-1">{fieldState.error.message}</div> : null}
              </div>} />
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mt-4">
        <div>
          <div className="d-flex align-items-center gap-2 mb-2">
            <span className="rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: 22, height: 22, backgroundColor: 'rgba(30, 214, 209, 0.18)', color: '#a7f3f0', border: '1px solid rgba(30, 214, 209, 0.18)' }}>
              <IconifyIcon icon="iconoir:check" />
            </span>
            <span className="fw-semibold text-decoration-underline" style={{ color: '#cbe8f7' }}>Privacy Policy</span>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: 22, height: 22, backgroundColor: 'rgba(30, 214, 209, 0.18)', color: '#a7f3f0', border: '1px solid rgba(30, 214, 209, 0.18)' }}>
              <IconifyIcon icon="iconoir:check" />
            </span>
            <span className="fw-semibold text-decoration-underline" style={{ color: '#cbe8f7' }}>Terms & Conditions</span>
          </div>
        </div>

        <button type="submit" className="btn border-0 px-5 py-3 fw-semibold" disabled={loading} style={{
        minWidth: 190,
        borderRadius: 18,
        background: 'linear-gradient(135deg, #14b8a6 0%, #0f766e 45%, #155e75 100%)',
        color: '#fff',
        fontSize: 18,
        letterSpacing: '0.04em',
        boxShadow: '0 18px 34px rgba(8, 145, 178, 0.28)'
      }}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </div>
    </form>;
};
export default LoginForm;