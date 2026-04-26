import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Col } from 'react-bootstrap';
import { options } from '@/app/api/auth/[...nextauth]/options';
import DriverPortalWorkspace from '@/components/driver/DriverPortalWorkspace';
import { isDriverRole } from '@/helpers/system-users';

export const metadata = {
  title: 'Driver Portal'
};

export default async function DriverPortalPage() {
  const session = await getServerSession(options);

  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  if (!isDriverRole(session?.user?.role)) {
    redirect('/trip-analytics');
  }

  return <Col xs={12}>
      <DriverPortalWorkspace />
    </Col>;
}