import { DriverRuntime } from '../hooks/useDriverRuntime';
import { DriverOperationsScreen } from './DriverOperationsScreen';
import { DriverPasswordResetScreen } from './DriverPasswordResetScreen';

type Props = {
  runtime: DriverRuntime;
};

export const DriverHomeScreen = ({ runtime }: Props) => {
  if (runtime.requiresPasswordReset) {
    return <DriverPasswordResetScreen runtime={runtime} />;
  }

  return <DriverOperationsScreen runtime={runtime} />;
};