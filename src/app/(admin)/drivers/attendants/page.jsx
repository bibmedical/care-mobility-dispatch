import DriversManagementWorkspace from '@/components/nemt/DriversManagementWorkspace';

export const metadata = {
  title: 'Attendants'
};

const AttendantsPage = () => {
  return <DriversManagementWorkspace activeTab="attendants" />;
};

export default AttendantsPage;