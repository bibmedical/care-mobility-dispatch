import BrandImage from '@/components/BrandImage';
import Link from 'next/link';
import RegisterForm from './components/RegisterForm';
import { Card, CardBody, Col } from 'react-bootstrap';
export const metadata = {
  title: 'Register'
};
const Register = () => {
  return <Col lg={4} className="mx-auto">
      <Card>
        <CardBody className="p-0 bg-black auth-header-box rounded-top">
          <div className="text-center p-3">
            <Link href="/" className="logo logo-admin">
              <BrandImage target="authRegister" height={50} width={180} alt="Register logo" className="auth-logo" style={{ width: '100%', maxWidth: 180, height: 'auto', objectFit: 'contain' }} />
            </Link>
            <h4 className="mt-3 mb-1 fw-semibold text-white fs-18">Create an account</h4>
            <p className="text-muted fw-medium mb-0">Enter your detail to Create your account today.</p>
          </div>
        </CardBody>
        <CardBody>
          <RegisterForm />

          <div className="text-center">
            <p className="text-muted">
              Already have an account ?
              <Link href="/auth/login" className="text-primary ms-2">
                Log in
              </Link>
            </p>
          </div>
        </CardBody>
      </Card>
    </Col>;
};
export default Register;