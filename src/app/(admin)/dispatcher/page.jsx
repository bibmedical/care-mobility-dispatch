import 'leaflet/dist/leaflet.css';
import DispatcherWorkspace from '@/components/nemt/DispatcherWorkspace';

export const metadata = {
  title: 'Dispatcher'
};

const DispatcherPage = () => {
  return <>
      <style jsx global>{`
        .page-wrapper .page-content {
          padding-bottom: 8px !important;
        }

        .page-wrapper .page-content .container-fluid {
          padding-bottom: 0 !important;
        }
      `}</style>
      <div data-dispatcher-page-root="true" style={{ marginBottom: -8 }}>
        <DispatcherWorkspace />
      </div>
    </>;
};

export default DispatcherPage;