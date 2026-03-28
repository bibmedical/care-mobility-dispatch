import ModulePage from '@/components/nemt/ModulePage';

export const metadata = {
  title: 'Full Shift Analysis'
};

const FullShiftAnalysisPage = () => {
  return <ModulePage title="Full Shift Analysis" description="Resumen completo del turno: volumen, puntualidad, ocupacion y cobertura." stats={[{
      label: 'Trips completed',
      value: '0'
    }, {
      label: 'Avg delay',
      value: '0m'
    }, {
      label: 'Utilization',
      value: '0%'
    }, {
      label: 'Coverage gaps',
      value: '0'
    }]} actions={[{
      label: 'Run analysis'
    }, {
      label: 'Trip analytics',
      href: '/trip-analytics',
      variant: 'outline-secondary'
    }]} columns={['Metric', 'Morning', 'Afternoon', 'Night', 'Total']} rows={[["Trips", '0', '0', '0', '0'], ["On-time", '0%', '0%', '0%', '0%']]} />;
};

export default FullShiftAnalysisPage;