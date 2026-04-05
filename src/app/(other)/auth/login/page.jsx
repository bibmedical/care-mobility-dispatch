import Image from 'next/image';
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
            <Link href="/" className="text-decoration-none" aria-label="Care Mobility home">
              <Image src="/care-mobility-logo.png" alt="Care Mobility logo" width={631} height={292} style={{ width: '100%', maxWidth: 440, height: 'auto' }} priority />
            </Link>
          </div>
          <LoginForm />
        </CardBody>
      </Card>
    </Col>;
};

export default Login;