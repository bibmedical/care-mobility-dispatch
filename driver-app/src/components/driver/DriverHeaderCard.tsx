import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { getDriverAccentColor, withDriverAccentAlpha } from './driverColor';
import { driverTheme } from './driverTheme';
import { getTrackingLabel, getTrackingTone } from './driverUtils';

type Props = {
  runtime: DriverRuntime;
};

export const DriverHeaderCard = ({ runtime }: Props) => {
  const driverAccent = getDriverAccentColor({
    id: runtime.driverSession?.driverId,
    name: runtime.driverSession?.name || runtime.driverCode
  });

  return <View style={[styles.card, { backgroundColor: driverAccent, borderColor: withDriverAccentAlpha(driverAccent, 0.55) }]}>
      <View style={styles.topRow}>
        <View style={styles.identityBlock}>
          <Text style={styles.eyebrow}>Florida Mobility Group Driver</Text>
          <Text style={styles.name}>{runtime.driverSession?.name || runtime.driverCode || 'Driver'}</Text>
          <Text style={styles.subline}>{runtime.driverSession?.driverCode || runtime.driverSession?.username || 'Unit pending'} | {runtime.shiftState.replace('-', ' ')}</Text>
        </View>
        <Pressable style={[styles.signOutButton, { borderColor: withDriverAccentAlpha(driverAccent, 0.18) }]} onPress={() => void runtime.signOut()}>
          <Text style={[styles.signOutText, { color: driverAccent }]}>Sign Out</Text>
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
    gap: 12,
    borderWidth: 1,
    borderColor: '#1e293b'
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
    color: 'rgba(226,232,240,0.82)',
    fontSize: 14,
    marginTop: 4
  },
  signOutButton: {
    backgroundColor: '#ffffff',
    borderRadius: driverTheme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1'
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
    borderRadius: driverTheme.radius.sm,
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
    borderRadius: driverTheme.radius.sm,
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