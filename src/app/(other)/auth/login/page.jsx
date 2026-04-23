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
        </CardBody>
      </Card>
    </Col>;
};

export default Login;