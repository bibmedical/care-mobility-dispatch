'use client';

import { useState } from 'react';
import { Controller } from 'react-hook-form';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
import useSignIn, { COMPANY_KEY, PAGE_OPTIONS } from '../useSignIn';

const fieldShellStyle = {
  border: '1px solid rgba(229, 231, 235, 0.98)',
  borderRadius: 999,
  backgroundColor: '#f3f4f6',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)'
};

const fieldStyle = {
  border: 0,
  boxShadow: 'none',
  background: 'transparent',
  padding: '16px 24px',
  fontSize: 18,
  color: '#4b5563'
};

const LoginForm = () => {
  const [showPassword, setShowPassword] = useState(false);
  const {
    loading,
    login,
    control
  } = useSignIn();

  return <form onSubmit={login}>
      <div className="d-grid gap-3">
        <div>
          <Controller name="companyKey" control={control} render={({
          field,
          fieldState
        }) => <div>
                <div style={fieldShellStyle}>
                  <input {...field} className="form-control" placeholder="Company" style={fieldStyle} />
                </div>
                {fieldState.error ? <div className="small text-danger mt-1 text-start">{fieldState.error.message}</div> : null}
              </div>} />
        </div>

        <div>
          <Controller name="identifier" control={control} render={({
          field,
          fieldState
        }) => <div>
                <div style={fieldShellStyle}>
                  <input {...field} className="form-control" placeholder="Username" style={fieldStyle} />
                </div>
                {fieldState.error ? <div className="small text-danger mt-1 text-start">{fieldState.error.message}</div> : null}
              </div>} />
        </div>

        <div>
          <Controller name="password" control={control} render={({
          field,
          fieldState
        }) => <div>
                <div style={{
              ...fieldShellStyle,
              display: 'flex',
              alignItems: 'center'
            }}>
                  <input {...field} type={showPassword ? 'text' : 'password'} className="form-control" placeholder="Password" style={fieldStyle} />
                  <button type="button" className="btn btn-link pe-4" onClick={() => setShowPassword(current => !current)} style={{ color: '#8b8fa0' }}>
                    <IconifyIcon icon={showPassword ? 'iconoir:eye-off' : 'iconoir:eye'} />
                  </button>
                </div>
                {fieldState.error ? <div className="small text-danger mt-1 text-start">{fieldState.error.message}</div> : null}
              </div>} />
        </div>
      </div>

      <div className="mt-3 text-start">
        <div className="small fw-semibold mb-2" style={{ color: '#8b8fa0', letterSpacing: '0.04em' }}>Open after login</div>
        <div className="rounded-5 p-2" style={{ backgroundColor: '#f3f4f6', border: '1px solid rgba(229, 231, 235, 0.98)' }}>
          <Controller name="portalPage" control={control} render={({
          field,
          fieldState
        }) => <div>
                <select {...field} className="form-select border-0" style={{
              ...fieldStyle,
              cursor: 'pointer',
              paddingTop: 14,
              paddingBottom: 14,
              backgroundColor: 'transparent'
            }}>
                  {PAGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                {fieldState.error ? <div className="small text-danger mt-1 text-start">{fieldState.error.message}</div> : null}
              </div>} />
        </div>
      </div>

      <div className="mt-4">
        <button type="submit" className="btn border-0 px-5 py-3 fw-semibold" disabled={loading} style={{
        width: '100%',
        borderRadius: 999,
        background: 'linear-gradient(180deg, #54536a 0%, #434257 100%)',
        color: '#fff',
        fontSize: 18,
        letterSpacing: '0.01em',
        boxShadow: '0 18px 34px rgba(67, 66, 87, 0.22)'
      }}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </div>

      <div className="mt-4 text-center" style={{ color: '#9497a6', fontSize: 15, lineHeight: 1.55 }}>
        <div>By logging in you agree to our</div>
        <div className="fw-semibold" style={{ color: '#626579' }}>terms of service</div>
      </div>

      <div className="mt-3 text-center small" style={{ color: '#a0a3b1' }}>
        Company code: {COMPANY_KEY}
      </div>
    </form>;
};

export default LoginForm;