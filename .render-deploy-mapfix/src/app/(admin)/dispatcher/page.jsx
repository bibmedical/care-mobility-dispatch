import 'leaflet/dist/leaflet.css';
import DispatcherWorkspace from '@/components/nemt/DispatcherWorkspace';
import styles from './dispatcher-page.module.css';

export const metadata = {
  title: 'Dispatcher'
};

const DispatcherPage = () => {
  return <>
      <div className={styles.dispatcherPageRoot} data-dispatcher-page-root="true" style={{ marginBottom: -8 }}>
        <DispatcherWorkspace />
      </div>
    </>;
};

export default DispatcherPage;