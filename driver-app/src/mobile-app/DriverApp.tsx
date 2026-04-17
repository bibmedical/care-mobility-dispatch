import { StatusBar } from 'expo-status-bar';
import { Alert, AppState, SafeAreaView, StyleSheet } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef } from 'react';
import '../services/driverBackgroundLocation';
import { driverTheme } from '../components/driver/driverTheme';
import { useDriverRuntime } from '../hooks/useDriverRuntime';
import { DriverHomeScreen } from '../screens/DriverHomeScreen';
import { DriverLoginScreen } from '../screens/DriverLoginScreen';

const DRIVER_KEEP_AWAKE_TAG = 'care-mobility-driver-active-shift';

export default function DriverApp() {
  const runtime = useDriverRuntime();
  const gpsPromptShownRef = useRef(false);

  useEffect(() => {
    const shouldKeepTabletAwake = runtime.loggedIn && (runtime.trackingEnabled || Boolean(runtime.activeTrip));

    if (shouldKeepTabletAwake) {
      void activateKeepAwakeAsync(DRIVER_KEEP_AWAKE_TAG).catch(() => {
        // Ignore keep-awake failures and continue normal driver operations.
      });
      return () => {
        void deactivateKeepAwake(DRIVER_KEEP_AWAKE_TAG).catch(() => {
          // Ignore keep-awake cleanup failures.
        });
      };
    }

    void deactivateKeepAwake(DRIVER_KEEP_AWAKE_TAG).catch(() => {
      // Ignore keep-awake cleanup failures.
    });

    return undefined;
  }, [runtime.activeTrip, runtime.loggedIn, runtime.trackingEnabled]);

  useEffect(() => {
    const shouldPromptForGps = runtime.loggedIn && (!runtime.trackingEnabled || runtime.permissionStatus === 'denied' || !runtime.locationServicesEnabled);

    const showGpsPrompt = () => {
      if (!shouldPromptForGps || gpsPromptShownRef.current) return;

      gpsPromptShownRef.current = true;
      Alert.alert(
        'TURN GPS ON',
        'Turn GPS Tracking ON and allow Location all the time so dispatch can see the vehicle moving live on the map.',
        [
          {
            text: 'Not now',
            style: 'cancel'
          },
          {
            text: 'Turn GPS On',
            onPress: () => {
              runtime.setTrackingEnabled(true);
              void runtime.requestLocationPermission();
            }
          }
        ]
      );
    };

    showGpsPrompt();

    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        gpsPromptShownRef.current = false;
        showGpsPrompt();
        return;
      }

      if (nextState === 'background' || nextState === 'inactive') {
        gpsPromptShownRef.current = false;
      }
    });

    return () => {
      subscription.remove();
    };
  }, [runtime.locationServicesEnabled, runtime.loggedIn, runtime.permissionStatus, runtime.requestLocationPermission, runtime.setTrackingEnabled, runtime.trackingEnabled]);

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