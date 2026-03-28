import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

type LocationSnapshot = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
};

type DriverShiftState = 'available' | 'en-route' | 'arrived' | 'completed';

const API_BASE_URL = 'http://YOUR-COMPUTER-IP:3005';

const sampleTrip = {
  tripId: '138493-01',
  rider: 'Maria Lopez',
  pickupTime: '11:40 AM',
  pickupAddress: '6900 Turkey Lake Rd, Orlando, FL',
  dropoffAddress: '601 E Rollins St, Orlando, FL',
  notes: 'Call rider on arrival'
};

const formatDateTime = (value: number | null) => {
  if (!value) return 'No update yet';
  return new Date(value).toLocaleString();
};

export default function App() {
  const [driverCode, setDriverCode] = useState('3358');
  const [password, setPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [locationSnapshot, setLocationSnapshot] = useState<LocationSnapshot | null>(null);
  const [watchError, setWatchError] = useState('');
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [shiftState, setShiftState] = useState<DriverShiftState>('available');

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    const startWatching = async () => {
      if (!trackingEnabled || !loggedIn) return;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionStatus('denied');
        setTrackingEnabled(false);
        setWatchError('Location permission denied.');
        return;
      }

      setPermissionStatus('granted');
      setWatchError('');

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      setLocationSnapshot({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        accuracy: current.coords.accuracy ?? null,
        speed: current.coords.speed ?? null,
        heading: current.coords.heading ?? null,
        timestamp: current.timestamp
      });

      subscription = await Location.watchPositionAsync({
        accuracy: Location.Accuracy.Highest,
        distanceInterval: 10,
        timeInterval: 10000
      }, update => {
        setLocationSnapshot({
          latitude: update.coords.latitude,
          longitude: update.coords.longitude,
          accuracy: update.coords.accuracy ?? null,
          speed: update.coords.speed ?? null,
          heading: update.coords.heading ?? null,
          timestamp: update.timestamp
        });
      });
    };

    startWatching().catch(error => {
      setWatchError(error instanceof Error ? error.message : 'Unable to start tracking.');
    });

    return () => {
      subscription?.remove();
    };
  }, [loggedIn, trackingEnabled]);

  const statusCard = useMemo(() => {
    if (!loggedIn) return 'Sign in to begin driver tracking.';
    if (!trackingEnabled) return 'Tracking is off. Turn it on when your shift starts.';
    if (permissionStatus !== 'granted') return 'Waiting for GPS permission.';
    if (locationSnapshot) return 'GPS is active and ready to sync with dispatcher.';
    return 'Preparing GPS...';
  }, [locationSnapshot, loggedIn, permissionStatus, trackingEnabled]);

  const handleSignIn = () => {
    if (!driverCode.trim()) {
      Alert.alert('Missing driver code', 'Enter the driver or unit code first.');
      return;
    }
    setLoggedIn(true);
  };

  const handlePermissionRequest = async () => {
    setIsRequestingPermission(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(status === 'granted' ? 'granted' : 'denied');
      if (status !== 'granted') {
        Alert.alert('Permission required', 'The driver app needs GPS permission to show real location in dispatcher.');
      }
    } finally {
      setIsRequestingPermission(false);
    }
  };

  return <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Care Mobility</Text>
          <Text style={styles.title}>Driver App</Text>
          <Text style={styles.subtitle}>Separate Expo app for real GPS, trip status, ETA and mobile dispatch actions.</Text>
        </View>

        {!loggedIn ? <View style={styles.card}>
            <Text style={styles.cardTitle}>Driver Sign In</Text>
            <Text style={styles.cardText}>Use this app apart from the dispatcher web panel so mobile tracking stays isolated.</Text>
            <TextInput value={driverCode} onChangeText={setDriverCode} placeholder="Driver code or username" placeholderTextColor="#7f8ca8" style={styles.input} autoCapitalize="none" />
            <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#7f8ca8" style={styles.input} secureTextEntry />
            <Pressable style={styles.primaryButton} onPress={handleSignIn}>
              <Text style={styles.primaryButtonText}>Enter Driver App</Text>
            </Pressable>
            <Text style={styles.hint}>Later this sign-in should connect to your real backend instead of local state.</Text>
          </View> : <>
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <View>
                  <Text style={styles.cardTitle}>Shift Status</Text>
                  <Text style={styles.cardText}>{statusCard}</Text>
                </View>
                <View style={styles.statusBadgeWrap}>
                  <Text style={styles.statusBadge}>{shiftState.toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Live GPS Tracking</Text>
                  <Text style={styles.toggleText}>Only real Android GPS should appear in dispatcher.</Text>
                </View>
                <Switch value={trackingEnabled} onValueChange={setTrackingEnabled} trackColor={{ false: '#374151', true: '#0f766e' }} thumbColor={trackingEnabled ? '#f8fafc' : '#d1d5db'} />
              </View>

              <Pressable style={styles.secondaryButton} onPress={handlePermissionRequest}>
                {isRequestingPermission ? <ActivityIndicator color="#dce9ff" /> : <Text style={styles.secondaryButtonText}>Request GPS Permission</Text>}
              </Pressable>

              <View style={styles.metricsGrid}>
                <View style={styles.metricCard}><Text style={styles.metricLabel}>Permission</Text><Text style={styles.metricValue}>{permissionStatus}</Text></View>
                <View style={styles.metricCard}><Text style={styles.metricLabel}>Last update</Text><Text style={styles.metricValue}>{formatDateTime(locationSnapshot?.timestamp ?? null)}</Text></View>
              </View>

              <View style={styles.locationCard}>
                <Text style={styles.locationTitle}>Current GPS</Text>
                <Text style={styles.locationLine}>Lat: {locationSnapshot?.latitude?.toFixed(6) ?? '--'}</Text>
                <Text style={styles.locationLine}>Lng: {locationSnapshot?.longitude?.toFixed(6) ?? '--'}</Text>
                <Text style={styles.locationLine}>Accuracy: {locationSnapshot?.accuracy ? `${Math.round(locationSnapshot.accuracy)} m` : '--'}</Text>
                <Text style={styles.locationLine}>Heading: {locationSnapshot?.heading ? `${Math.round(locationSnapshot.heading)}°` : '--'}</Text>
                <Text style={styles.locationLine}>Speed: {locationSnapshot?.speed != null && locationSnapshot.speed >= 0 ? `${locationSnapshot.speed.toFixed(1)} m/s` : '--'}</Text>
                {watchError ? <Text style={styles.errorText}>{watchError}</Text> : null}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Active Trip</Text>
              <Text style={styles.tripId}>{sampleTrip.tripId}</Text>
              <Text style={styles.tripRider}>{sampleTrip.rider}</Text>
              <Text style={styles.tripLine}>Pickup: {sampleTrip.pickupTime}</Text>
              <Text style={styles.tripLine}>{sampleTrip.pickupAddress}</Text>
              <Text style={styles.tripLine}>Dropoff: {sampleTrip.dropoffAddress}</Text>
              <Text style={styles.tripNotes}>{sampleTrip.notes}</Text>

              <View style={styles.actionRow}>
                <Pressable style={styles.actionButton} onPress={() => setShiftState('en-route')}><Text style={styles.actionText}>En Route</Text></Pressable>
                <Pressable style={styles.actionButton} onPress={() => setShiftState('arrived')}><Text style={styles.actionText}>Arrived</Text></Pressable>
                <Pressable style={styles.actionButton} onPress={() => setShiftState('completed')}><Text style={styles.actionText}>Complete</Text></Pressable>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Dispatcher Sync</Text>
              <Text style={styles.cardText}>When you are ready, the app should send GPS updates to:</Text>
              <Text style={styles.endpoint}>{API_BASE_URL}/api/mobile/driver-location</Text>
              <Text style={styles.hint}>Change YOUR-COMPUTER-IP to the IP of the machine running the dispatcher web server.</Text>
            </View>
          </>}
      </ScrollView>
    </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0b1220'
  },
  scrollContent: {
    padding: 20,
    gap: 16
  },
  heroCard: {
    backgroundColor: '#111c34',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1e2a47'
  },
  eyebrow: {
    color: '#53c7b6',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 12,
    fontWeight: '700'
  },
  title: {
    color: '#f8fafc',
    fontSize: 34,
    fontWeight: '800',
    marginTop: 8
  },
  subtitle: {
    color: '#9fb0d1',
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22
  },
  card: {
    backgroundColor: '#121a2b',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#24314f',
    gap: 14
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '700'
  },
  cardText: {
    color: '#a8b7d4',
    lineHeight: 21
  },
  input: {
    backgroundColor: '#09101d',
    borderColor: '#24314f',
    borderWidth: 1,
    color: '#f8fafc',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16
  },
  primaryButton: {
    backgroundColor: '#1fa38a',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center'
  },
  primaryButtonText: {
    color: '#061317',
    fontSize: 16,
    fontWeight: '800'
  },
  secondaryButton: {
    backgroundColor: '#20314d',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center'
  },
  secondaryButtonText: {
    color: '#dce9ff',
    fontWeight: '700'
  },
  hint: {
    color: '#7f8ca8',
    fontSize: 13,
    lineHeight: 19
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12
  },
  statusBadgeWrap: {
    backgroundColor: '#0b2a2d',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  statusBadge: {
    color: '#6ee7d8',
    fontWeight: '800',
    fontSize: 12
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16
  },
  toggleTitle: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 16
  },
  toggleText: {
    color: '#8ea2c7',
    marginTop: 4
  },
  metricsGrid: {
    gap: 12
  },
  metricCard: {
    backgroundColor: '#0a1120',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#24314f'
  },
  metricLabel: {
    color: '#7f8ca8',
    fontSize: 12,
    textTransform: 'uppercase',
    marginBottom: 4
  },
  metricValue: {
    color: '#f8fafc',
    fontWeight: '600'
  },
  locationCard: {
    backgroundColor: '#08111d',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#24314f',
    gap: 6
  },
  locationTitle: {
    color: '#53c7b6',
    fontWeight: '700',
    marginBottom: 4
  },
  locationLine: {
    color: '#d7e2f4'
  },
  errorText: {
    color: '#fda4af',
    marginTop: 8
  },
  tripId: {
    color: '#53c7b6',
    fontWeight: '800',
    fontSize: 16
  },
  tripRider: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '800'
  },
  tripLine: {
    color: '#c5d2eb',
    lineHeight: 22
  },
  tripNotes: {
    color: '#facc15',
    fontWeight: '600'
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  actionButton: {
    backgroundColor: '#20314d',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14
  },
  actionText: {
    color: '#f8fafc',
    fontWeight: '700'
  },
  endpoint: {
    color: '#93c5fd',
    fontFamily: 'monospace'
  }
});
