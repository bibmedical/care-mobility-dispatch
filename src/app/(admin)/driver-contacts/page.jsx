import ModulePage from '@/components/nemt/ModulePage';

export const metadata = {
  title: 'Driver Contacts'
};

const DriverContactsPage = () => {
  return <ModulePage title="Driver Contacts" description="Quick directory of drivers, coordinators, repair shops and operational contacts." stats={[{
      label: 'Driver contacts',
      value: '24'
    }, {
      label: 'Dispatch extensions',
      value: '6'
    }, {
      label: 'Mechanic vendors',
      value: '4'
    }, {
      label: 'Emergency contacts',
      value: '12'
    }]} actions={[{
      label: 'Add contact'
    }, {
      label: 'Export list',
      variant: 'outline-secondary'
    }]} columns={['Contact', 'Role', 'Phone', 'Email', 'Notes']} rows={[["Yosbeny Torres", 'Driver', '(407) 555-0118', 'yosbeny@caremobility.local', 'Morning route'], ["Carla Reyes", 'Dispatcher', '(407) 555-0131', 'carla@caremobility.local', 'Extension 102'], ["RoadCare Shop", 'Mechanic', '(407) 555-0174', 'service@roadcare.local', 'Fleet vendor'], ["Fleet Tow South", 'Emergency', '(407) 555-0188', 'ops@fleettow.local', '24/7 tow support']]} />;
};

export default DriverContactsPage;