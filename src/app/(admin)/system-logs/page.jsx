import ModulePage from '@/components/nemt/ModulePage';

export const metadata = {
  title: 'System Logs'
};

const SystemLogsPage = () => {
  return <ModulePage title="System Logs" description="Historial de acciones del sistema, cambios de despacho y eventos tecnicos." stats={[{
      label: 'Events today',
      value: '0'
    }, {
      label: 'Warnings',
      value: '0'
    }, {
      label: 'Errors',
      value: '0'
    }, {
      label: 'Exports',
      value: '0'
    }]} actions={[{
      label: 'Refresh logs'
    }, {
      label: 'Download',
      variant: 'outline-secondary'
    }]} columns={['Time', 'Source', 'Action', 'Reference', 'Result']} rows={[["No logs yet", 'System', 'Waiting data', '-', '-']]} />;
};

export default SystemLogsPage;