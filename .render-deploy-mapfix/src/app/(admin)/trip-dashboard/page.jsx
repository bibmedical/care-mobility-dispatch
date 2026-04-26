import 'leaflet/dist/leaflet.css';
import TripDashboardWorkspace from '@/components/nemt/TripDashboardWorkspace';
import styles from './trip-dashboard-page.module.css';

export const metadata = {
  title: 'Trip Dashboard'
};

const TripDashboardPage = () => {
  return <div className={styles.tripDashboardPageRoot} data-trip-dashboard-page-root="true" style={{ marginBottom: -8 }}>
      <TripDashboardWorkspace />
    </div>;
};

export default TripDashboardPage;