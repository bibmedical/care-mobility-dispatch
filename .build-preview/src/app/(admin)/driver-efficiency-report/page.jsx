import ModulePage from '@/components/nemt/ModulePage';

export const metadata = {
  title: 'Driver Efficiency Report'
};

const DriverEfficiencyReportPage = () => {
  return <ModulePage title="Driver Efficiency Report" description="Driver efficiency report focused on time usage, trips and checkpoint compliance." stats={[{
      label: 'Avg trips/driver',
      value: '0'
    }, {
      label: 'Idle time',
      value: '0m'
    }, {
      label: 'Miles tracked',
      value: '0'
    }, {
      label: 'Efficiency score',
      value: '0'
    }]} actions={[{
      label: 'Build report'
    }, {
      label: 'Daily snapshot',
      href: '/daily-driver-snapshot',
      variant: 'outline-secondary'
    }]} columns={['Driver', 'Trips', 'Tracked miles', 'Idle time', 'Score']} rows={[["No drivers loaded", '0', '0', '0m', '0']]} />;
};

export default DriverEfficiencyReportPage;