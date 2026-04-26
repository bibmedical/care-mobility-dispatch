import DriversManagementWorkspace from '@/components/nemt/DriversManagementWorkspace';

export const metadata = {
  title: 'Driver Vehicles'
};

const DriverVehiclesPage = () => {
  return <DriversManagementWorkspace activeTab="vehicles" />;
};

export default DriverVehiclesPage;