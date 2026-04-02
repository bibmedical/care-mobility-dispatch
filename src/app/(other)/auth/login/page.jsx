import Image from 'next/image';
import Link from 'next/link';
import LoginForm from './components/LoginForm';
import logoSmImg from '@/assets/images/logo-sm.png';
import { Card, CardBody, Col } from 'react-bootstrap';

export const metadata = {
  title: 'Login'
};

const Login = () => {
  return <Col xl={5} lg={6} md={8} sm={11} className="mx-auto">
      <Card>
        <CardBody className="p-0 bg-black auth-header-box rounded-top">
          <div className="text-center p-3">
            <Link href="/auth/login" className="logo logo-admin">
              <Image src={logoSmImg} height={50} alt="logo" className="auth-logo" />
            </Link>
            <h4 className="mt-3 mb-1 fw-semibold text-white fs-18">Inicia sesion en tu panel</h4>
            <p className="text-muted fw-medium mb-0">Entra para continuar al sistema.</p>
          </div>
        </CardBody>
        <CardBody>
          <LoginForm />
        </CardBody>
      </Card>
    </Col>;
};

export default Login;