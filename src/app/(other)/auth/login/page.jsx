import Image from 'next/image';
import { Col } from 'react-bootstrap';
import LoginForm from './components/LoginForm';

export const metadata = {
  title: 'Login'
};

const Login = () => {
  return <Col xl={11} xxl={10} className="mx-auto">
      <div className="position-relative overflow-hidden rounded-5" style={{
      minHeight: '86vh',
      padding: '32px 18px',
      background: 'radial-gradient(circle at top, rgba(17, 196, 194, 0.1), transparent 28%), linear-gradient(180deg, #fcfcfd 0%, #f4f5f8 100%)',
      boxShadow: '0 30px 70px rgba(148, 163, 184, 0.18)'
    }}>
        <div className="position-absolute" style={{ left: '-8%', top: '18%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(17, 196, 194, 0.12) 0%, rgba(17,196,194,0) 72%)' }} />
        <div className="position-absolute" style={{ right: '-6%', bottom: '10%', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(79, 70, 229, 0.08) 0%, rgba(79,70,229,0) 72%)' }} />

        <div className="position-relative mx-auto d-flex flex-column justify-content-center align-items-center text-center" style={{ minHeight: '78vh', maxWidth: 760 }}>
          <div className="mb-4">
            <Image src="/care-mobility-logo.png" alt="Care Mobility" width={330} height={113} priority style={{ width: 'min(330px, 82vw)', height: 'auto' }} />
          </div>

          <div className="w-100 rounded-5 px-3 px-md-5 py-4 py-md-5" style={{ maxWidth: 520, background: 'rgba(255, 255, 255, 0.74)', border: '1px solid rgba(255,255,255,0.72)', boxShadow: '0 28px 60px rgba(148, 163, 184, 0.18)', backdropFilter: 'blur(12px)' }}>
            <div className="mx-auto" style={{ maxWidth: 360 }}>
              <LoginForm />
            </div>
          </div>

          <div className="mt-4 small fw-semibold" style={{ color: '#8b8fa0' }}>
            Secure staff login only
          </div>
        </div>
      </div>
    </Col>;
};

export default Login;