import BrandImage from '@/components/BrandImage';
import Link from 'next/link';
import LoginForm from './components/LoginForm';
import { Card, CardBody, Col } from 'react-bootstrap';

export const metadata = {
  title: 'Login'
};

const Login = () => {
  return <Col xl={5} lg={6} md={8} sm={11} className="mx-auto">
      <Card>
        <CardBody>
          <div className="d-flex justify-content-center mb-4">
            <Link href="/" className="text-decoration-none" aria-label="Florida Mobility Group home">
              <BrandImage target="authLogin" alt="Florida Mobility Group login logo" width={640} height={360} style={{ width: '100%', maxWidth: 420, height: 'auto', objectFit: 'contain' }} />
            </Link>
          </div>
          <LoginForm />
          <div className="mt-4 p-3 rounded" style={{ backgroundColor: '#f8fafc', border: '1px solid rgba(15, 23, 42, 0.08)' }}>
            <div className="fw-semibold mb-2">SMS Consent Notice</div>
            <div className="small text-muted">
              Riders consent to receive transportation-related SMS messages by providing their phone number during scheduling, intake, registration, or trip confirmation workflows and agreeing to receive service updates. Messages may include trip confirmations, reminders, arrival alerts, schedule changes, and dispatch support. Message frequency varies. Message and data rates may apply. Reply <strong>STOP</strong> to opt out and <strong>HELP</strong> for support.
            </div>
          </div>
          <div className="text-center mt-3 small text-muted">
            <Link href="/privacy-policy" className="text-decoration-none me-3">
              Privacy Policy
            </Link>
            <Link href="/terms-and-conditions" className="text-decoration-none">
              Terms and Conditions
            </Link>
          </div>
        </CardBody>
      </Card>
    </Col>;
};

export default Login;