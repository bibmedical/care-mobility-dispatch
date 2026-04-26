import ModulePage from '@/components/nemt/ModulePage';

export const metadata = {
  title: 'Administrators'
};

const AdministratorsPage = () => {
  return <ModulePage title="Administrators" description="Accesos internos para despachadores, billing, coordinadores y supervisores." stats={[{
      label: 'Active admins',
      value: '6'
    }, {
      label: 'Dispatchers',
      value: '3'
    }, {
      label: 'Billing users',
      value: '2'
    }, {
      label: 'Supervisors',
      value: '1'
    }]} actions={[{
      label: 'Add admin'
    }, {
      label: 'Reset access',
      variant: 'outline-secondary'
    }]} columns={['Name', 'Role', 'Shift', 'Email', 'Status']} rows={[["Carla Reyes", 'Dispatcher', 'Morning', 'carla@caremobility.local', 'Active'], ["Luis Romero", 'Dispatcher', 'Afternoon', 'luis@caremobility.local', 'Active'], ["Nina Paul", 'Billing', 'Day', 'nina@caremobility.local', 'Active'], ["Oscar Vega", 'Supervisor', 'Full day', 'oscar@caremobility.local', 'Active']]} />;
};

export default AdministratorsPage;