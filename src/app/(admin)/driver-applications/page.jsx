import ModulePage from '@/components/nemt/ModulePage';

export const metadata = {
  title: 'Driver Applications'
};

const DriverApplicationsPage = () => {
  return <ModulePage title="Driver Applications" description="Revisa solicitudes nuevas, documentos pendientes y entrevistas de choferes." stats={[{
      label: 'New applicants',
      value: '7'
    }, {
      label: 'Pending docs',
      value: '4'
    }, {
      label: 'Ready for interview',
      value: '3'
    }, {
      label: 'Approved this week',
      value: '5'
    }]} actions={[{
      label: 'Review queue'
    }, {
      label: 'Upload documents',
      variant: 'outline-secondary'
    }]} columns={['Applicant', 'License', 'Vehicle', 'Stage', 'Notes']} rows={[["Jose Martinez", 'Class E', 'Toyota Sienna 2021', 'Documents pending', 'Missing insurance'], ["Ana Lopez", 'Class E', 'Honda Odyssey 2020', 'Interview ready', 'Background check clear'], ["David Ortiz", 'Class E', 'Ford Transit 2019', 'Application received', 'Needs road test'], ["Martha Perez", 'Class E', 'Kia Carnival 2023', 'Approved', 'Ready for onboarding']]} />;
};

export default DriverApplicationsPage;