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
        <CardBody>
          <LoginForm />
        </CardBody>
      </Card>
    </Col>;
};

export default Login;