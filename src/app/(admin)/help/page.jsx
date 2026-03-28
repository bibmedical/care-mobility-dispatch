import ModulePage from '@/components/nemt/ModulePage';

export const metadata = {
  title: 'Help'
};

const HelpPage = () => {
  return <ModulePage title="Help" description="Centro rapido de ayuda para despacho, rutas, importaciones y seguimiento de choferes." stats={[{
      label: 'Guides',
      value: '4'
    }, {
      label: 'Setup steps',
      value: '3'
    }, {
      label: 'Imports',
      value: '1'
    }, {
      label: 'Tracking docs',
      value: '1'
    }]} actions={[{
      label: 'Open dispatcher',
      href: '/dispatcher'
    }, {
      label: 'Import center',
      href: '/forms-safe-ride-import',
      variant: 'outline-secondary'
    }]} columns={['Topic', 'Description', 'Route', 'Status']} rows={[["Dispatcher", 'Control en vivo de trips y drivers', '/dispatcher', 'Ready'], ["Trip Dashboard", 'Creacion de rutas conectadas', '/trip-dashboard', 'Ready'], ["Excel Loader", 'Carga de datos SafeRide desde Excel o CSV', '/forms-safe-ride-import', 'Ready'], ["Driver Tracking", 'Checkpoint/GPS para Android', '/drivers', 'In progress']]} />;
};

export default HelpPage;