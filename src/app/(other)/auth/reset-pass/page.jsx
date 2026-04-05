import Image from 'next/image';
import Link from 'next/link';
import ResetPasswordForm from './components/ResetPasswordForm';
import { Card, CardBody, Col } from 'react-bootstrap';
export const metadata = {
  title: 'Reset Password'
};
const ResetPassword = () => {
  return <Col lg={4} className="mx-auto">
      <Card>
        <CardBody className="p-0 bg-black auth-header-box rounded-top">
          <div className="text-center p-3">
            <Link href="/" className="logo logo-admin">
              <Image src="/florida-mobility-group-logo-classic.svg" width={420} height={156} alt="Florida Mobility Group logo" className="auth-logo" style={{ width: '100%', maxWidth: 320, height: 'auto' }} priority />
            </Link>
            <h4 className="mt-3 mb-1 fw-semibold text-white fs-18">Reset Password</h4>
            <p className="text-muted fw-medium mb-0">Enter your account email, receive a code, and create a new password.</p>
          </div>
        </CardBody>
        <CardBody>
          <ResetPasswordForm />

          <div className="text-center  mb-2">
            <p className="text-muted">
              Remember It ?{' '}
              <Link href="/auth/login" className="text-primary ms-2">
                Sign in here
              </Link>
            </p>
          </div>
        </CardBody>
      </Card>
    </Col>;
};
export default ResetPassword;