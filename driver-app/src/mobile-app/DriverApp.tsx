import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import '../services/driverBackgroundLocation';
import { driverTheme } from '../components/driver/driverTheme';
import { useDriverRuntime } from '../hooks/useDriverRuntime';
import { DriverHomeScreen } from '../screens/DriverHomeScreen';
import { DriverLoginScreen } from '../screens/DriverLoginScreen';

export default function DriverApp() {
  const runtime = useDriverRuntime();

  return <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {runtime.loggedIn ? <DriverHomeScreen runtime={runtime} /> : <DriverLoginScreen runtime={runtime} />}
    </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: driverTheme.colors.appBg
  }
});