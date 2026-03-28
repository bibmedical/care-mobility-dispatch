import Image from 'next/image';
import Link from 'next/link';
import LockScreenForm from './components/LockScreenForm';
import logoSmImg from '@/assets/images/logo-sm.png';
import { Card, CardBody, Col } from 'react-bootstrap';
export const metadata = {
  title: 'Lock Screen'
};
const LockScreen = () => {
  return <Col lg={4} className="mx-auto">
      <Card>
        <CardBody className="p-0 bg-black auth-header-box rounded-top">
          <div className="text-center p-3">
            <Link href="/" className="logo logo-admin">
              <Image src={logoSmImg} height={50} alt="logo" className="auth-logo" />
            </Link>
            <h4 className="mt-3 mb-1 fw-semibold text-white fs-18">Enter Password</h4>
            <p className="text-muted fw-medium mb-0">Hello Mark, enter your password to unlock the screen !</p>
          </div>
        </CardBody>
        <CardBody>
          <LockScreenForm />

          <div className="text-center  mb-2">
            <p className="text-muted">
              Not you ? return
              <Link href="/auth/login" className="text-primary ms-2">
                Login in here
              </Link>
            </p>
          </div>
        </CardBody>
      </Card>
    </Col>;
};
export default LockScreen;