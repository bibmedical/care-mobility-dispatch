import { DriverRuntime } from '../hooks/useDriverRuntime';
import { DriverOperationsScreen } from './DriverOperationsScreen';

type Props = {
  runtime: DriverRuntime;
};

export const DriverHomeScreen = ({ runtime }: Props) => {
  return <DriverOperationsScreen runtime={runtime} />;
};