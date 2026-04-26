import Image from 'next/image';
import Link from 'next/link';
import maintenanceImg from '@/assets/images/extra/card/maintenance.png';
import { Card, CardBody, Col } from 'react-bootstrap';
export const metadata = {
  title: 'Maintenance'
};
const Maintenance = () => {
  return <Col lg={6} className="mx-auto">
      <Card>
        <CardBody className="p-5">
          <div className="text-center">
            <Image src={maintenanceImg} alt="maintenance" className="img-fluid mb-3" />
            <h6 className="mb-2 fw-medium text-dark fs-24">We are down on maintenance right now</h6>
            <p className="text-muted mb-0 text-wrap fs-15">This website is currently undergoing Scheduled maintenance.</p>
            <div className="mt-3 text-center">
              <Link className="btn btn-primary w-50" href="/">
                Back to Dashboard <i className="fas fa-redo ms-1" />
              </Link>
            </div>
          </div>
        </CardBody>
      </Card>
    </Col>;
};
export default Maintenance;