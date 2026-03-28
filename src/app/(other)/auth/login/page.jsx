import Link from 'next/link';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
import LoginForm from './components/LoginForm';
import PortalMark from './components/PortalMark';
import { Col } from 'react-bootstrap';
export const metadata = {
  title: 'Login'
};
const Login = () => {
  return <Col xl={11} xxl={10} className="mx-auto">
      <div className="position-relative overflow-hidden rounded-5" style={{
      minHeight: '86vh',
      padding: '32px',
      background: 'radial-gradient(circle at top left, rgba(30, 214, 209, 0.18), transparent 34%), radial-gradient(circle at bottom right, rgba(21, 112, 166, 0.22), transparent 28%), linear-gradient(180deg, #030712 0%, #071523 100%)',
      border: '1px solid rgba(94, 234, 212, 0.12)',
      boxShadow: '0 30px 80px rgba(2, 6, 23, 0.55)'
    }}>
        <div className="position-absolute" style={{ left: -80, top: 140, width: 280, height: 280, borderRadius: '44% 56% 61% 39% / 42% 44% 56% 58%', background: 'linear-gradient(145deg, rgba(30, 214, 209, 0.2), rgba(7,21,35,0.02))', filter: 'blur(6px)' }} />
        <div className="position-absolute" style={{ right: -50, top: 90, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(21, 112, 166, 0.24) 0%, rgba(255,255,255,0) 72%)' }} />

        <div className="position-relative mx-auto rounded-5" style={{
        maxWidth: 980,
        padding: '34px 42px 26px',
        background: 'linear-gradient(135deg, rgba(8, 18, 31, 0.94), rgba(11, 31, 45, 0.88))',
        border: '1px solid rgba(94, 234, 212, 0.12)',
        boxShadow: '0 22px 48px rgba(2, 6, 23, 0.42)',
        backdropFilter: 'blur(12px)'
      }}>
          <div className="d-flex justify-content-between align-items-start gap-4 flex-wrap">
            <div>
              <PortalMark showWordmark textColor="#e8fbff" />
              <div className="d-inline-flex align-items-center rounded-pill px-3 py-1 fw-semibold mt-3" style={{ backgroundColor: 'rgba(30, 214, 209, 0.14)', color: '#a7f3f0', fontSize: 13, border: '1px solid rgba(30, 214, 209, 0.16)' }}>Secure staff access</div>
              <div className="mt-4" style={{ color: '#d8e8f1' }}>
                <div className="fw-semibold fs-5">One portal for daily operations</div>
                <div className="fw-medium" style={{ color: '#8eabc1', maxWidth: 500 }}>Sign in to manage dispatch routes, schedules, submissions, billing, and driver activity without repeating the brand all over the page.</div>
              </div>
            </div>

            <div className="text-md-end">
              <Link href="/" className="d-inline-flex align-items-center gap-3 text-decoration-none" style={{ color: '#ecfeff' }}>
                <div className="rounded-4 p-2" style={{ backgroundColor: 'rgba(30, 214, 209, 0.12)', border: '1px solid rgba(30, 214, 209, 0.14)' }}>
                  <PortalMark size={54} />
                </div>
                <span className="fw-bold" style={{ fontSize: 24 }}>Driver App</span>
              </Link>
              <div className="mt-2 fw-medium" style={{ color: '#8eabc1' }}>Download the latest Android and iPhone build.</div>
              <div className="mt-3 d-flex justify-content-md-end">
                <div className="rounded-4 p-2 d-grid gap-2" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148, 163, 184, 0.12)' }}>
                  <div className="rounded-4 px-3 py-2 d-flex align-items-center gap-3" style={{ minWidth: 290, background: 'linear-gradient(180deg, #0b1220 0%, #050a13 100%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}>
                    <div className="rounded-3 d-inline-flex align-items-center justify-content-center" style={{ width: 42, height: 42, background: 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(74,222,128,0.06))', color: '#86efac' }}>
                      <IconifyIcon icon="logos:google-play-icon" width={24} />
                    </div>
                    <div className="text-start">
                      <div style={{ color: '#7f9bb1', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Get it on</div>
                      <div className="fw-semibold" style={{ color: '#f8fdff', fontSize: 18, lineHeight: 1.1 }}>Google Play</div>
                    </div>
                  </div>
                  <div className="rounded-4 px-3 py-2 d-flex align-items-center gap-3" style={{ minWidth: 290, background: 'linear-gradient(180deg, #0b1220 0%, #050a13 100%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}>
                    <div className="rounded-3 d-inline-flex align-items-center justify-content-center" style={{ width: 42, height: 42, background: 'linear-gradient(135deg, rgba(125,211,252,0.18), rgba(56,189,248,0.06))', color: '#bae6fd' }}>
                      <IconifyIcon icon="logos:apple-app-store" width={24} />
                    </div>
                    <div className="text-start">
                      <div style={{ color: '#7f9bb1', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Download on the</div>
                      <div className="fw-semibold" style={{ color: '#f8fdff', fontSize: 18, lineHeight: 1.1 }}>App Store</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 row g-4 align-items-stretch">
            <div className="col-lg-4">
              <div className="h-100 rounded-4 p-4 d-flex flex-column justify-content-between" style={{ background: 'linear-gradient(180deg, rgba(12, 33, 48, 0.98), rgba(7, 23, 37, 0.98))', border: '1px solid rgba(94, 234, 212, 0.12)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
                <div>
                  <div className="small fw-semibold text-uppercase" style={{ color: '#7dd3fc', letterSpacing: '0.12em' }}>Brand Mark</div>
                  <div className="mt-3 d-flex justify-content-center justify-content-lg-start">
                    <div className="rounded-4 p-3" style={{ backgroundColor: 'rgba(30, 214, 209, 0.08)', border: '1px solid rgba(30, 214, 209, 0.12)' }}>
                      <PortalMark size={188} />
                    </div>
                  </div>
                </div>
                <p className="mb-0 mt-4" style={{ color: '#90aabd', lineHeight: 1.6 }}>Custom portal symbol inspired by the original identity, with a curved mobility form and route line, without repeating the full logo everywhere.</p>
              </div>
            </div>
            <div className="col-lg-8">
              <div className="rounded-4 p-4 p-lg-5" style={{ background: 'linear-gradient(180deg, rgba(6, 15, 26, 0.96), rgba(9, 24, 38, 0.96))', border: '1px solid rgba(94, 234, 212, 0.12)', boxShadow: '0 18px 40px rgba(2, 6, 23, 0.38)' }}>
                <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-4">
                  <div>
                    <div className="small fw-semibold text-uppercase" style={{ color: '#7dd3fc', letterSpacing: '0.12em' }}>Portal Access</div>
                    <h2 className="h3 mb-2 mt-2" style={{ color: '#f8fdff' }}>Sign in to continue</h2>
                    <p className="mb-0" style={{ color: '#8eabc1' }}>Use your username, password, company key, and destination page.</p>
                  </div>
                  <div className="rounded-pill px-3 py-2 fw-semibold" style={{ backgroundColor: 'rgba(30, 214, 209, 0.1)', color: '#a7f3f0', border: '1px solid rgba(30, 214, 209, 0.12)' }}>CMS255</div>
                </div>
                <LoginForm />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Col>;
};
export default Login;