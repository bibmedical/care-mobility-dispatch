import 'leaflet/dist/leaflet.css';
import StandaloneDispatchMapScreen from '@/components/nemt/StandaloneDispatchMapScreen';

export const metadata = {
  title: 'Map Screen'
};

const MapScreenPage = () => {
  return <StandaloneDispatchMapScreen />;
};

export default MapScreenPage;