import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { driverTheme } from './driverTheme';
import { getTrackingLabel, getTrackingTone } from './driverUtils';

type Props = {
  runtime: DriverRuntime;
};

export const DriverHeaderCard = ({ runtime }: Props) => {
  return <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.identityBlock}>
          <Text style={styles.eyebrow}>Care Mobility Driver</Text>
          <Text style={styles.name}>{runtime.driverSession?.name || runtime.driverCode || 'Driver'}</Text>
          <Text style={styles.subline}>{runtime.driverSession?.driverCode || runtime.driverSession?.username || 'Unit pending'} | {runtime.shiftState.replace('-', ' ')}</Text>
        </View>
        <Pressable style={styles.signOutButton} onPress={() => void runtime.signOut()}>
          <Text style={styles.signOutText}>Salir</Text>
        </Pressable>
      </View>

      <View style={styles.signalStrip}>
        <View style={[styles.signalBadge, { backgroundColor: getTrackingTone(runtime) }]}>
          <Text style={styles.signalText}>{getTrackingLabel(runtime)}</Text>
        </View>
        <View style={styles.signalMuted}>
          <Text style={styles.signalMutedText}>Trip sync {runtime.lastTripSyncAt ? runtime.formatDateTime(runtime.lastTripSyncAt) : 'waiting'}</Text>
        </View>
      </View>

      <Text style={styles.statusText}>{runtime.statusCard}</Text>
    </View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: driverTheme.colors.headerBg,
    borderRadius: driverTheme.radius.xl,
    padding: 20,
    gap: 12
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  identityBlock: {
    flex: 1
  },
  eyebrow: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  name: {
    color: driverTheme.colors.headerText,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 6
  },
  subline: {
    color: 'rgba(20,54,69,0.9)',
    fontSize: 14,
    marginTop: 4
  },
  signOutButton: {
    backgroundColor: driverTheme.colors.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  signOutText: {
    color: driverTheme.colors.headerBg,
    fontWeight: '700'
  },
  signalStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  signalBadge: {
    borderRadius: driverTheme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  signalText: {
    color: '#143645',
    fontWeight: '700',
    fontSize: 12
  },
  signalMuted: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: driverTheme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  signalMutedText: {
    color: '#e8f0f4',
    fontSize: 12,
    fontWeight: '600'
  },
  statusText: {
    color: '#dbe7ec',
    lineHeight: 20
  }
});