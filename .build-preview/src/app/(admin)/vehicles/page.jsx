import ModulePage from '@/components/nemt/ModulePage';

export const metadata = {
  title: 'Vehicles'
};

const VehiclesPage = () => {
  return <ModulePage title="Vehicles" description="Control de flota, disponibilidad, seguros y mantenimiento preventivo." stats={[{
      label: 'Active vehicles',
      value: '24'
    }, {
      label: 'Wheelchair ready',
      value: '9'
    }, {
      label: 'Maintenance due',
      value: '2'
    }, {
      label: 'Out of service',
      value: '1'
    }]} actions={[{
      label: 'Add vehicle'
    }, {
      label: 'Maintenance log',
      variant: 'outline-secondary'
    }]} columns={['Unit', 'Model', 'Capacity', 'Insurance', 'Status']} rows={[["V-101", 'Toyota Sienna 2021', '4 + 1 wheelchair', 'Valid until 08/2026', 'Active'], ["V-118", 'Ford Transit 2019', '8 ambulatory', 'Valid until 05/2026', 'Maintenance due'], ["V-120", 'Honda Odyssey 2020', '4 ambulatory', 'Valid until 11/2026', 'Active'], ["V-131", 'Dodge Caravan 2018', '4 ambulatory', 'Expired', 'Out of service']]} />;
};

export default VehiclesPage;