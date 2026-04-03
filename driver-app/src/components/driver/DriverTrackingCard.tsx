import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { driverSharedStyles, driverTheme } from './driverTheme';

type Props = {
  runtime: DriverRuntime;
};

export const DriverTrackingCard = ({ runtime }: Props) => {
  return <View style={driverSharedStyles.card}>
      <View style={driverSharedStyles.rowBetween}>
        <View style={styles.copyBlock}>
          <Text style={driverSharedStyles.eyebrow}>Live Vehicle</Text>
          <Text style={driverSharedStyles.title}>GPS and dispatch sync</Text>
          <Text style={driverSharedStyles.body}>Everything related to tracking stays here so it does not get mixed into trips and messages.</Text>
        </View>
        <Switch value={runtime.trackingEnabled} onValueChange={runtime.setTrackingEnabled} trackColor={{ false: '#415468', true: driverTheme.colors.primary }} thumbColor={driverTheme.colors.white} />
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricPanel}>
          <Text style={styles.metricLabel}>Permission</Text>
          <Text style={styles.metricValue}>{runtime.permissionStatus}</Text>
        </View>
        <View style={styles.metricPanel}>
          <Text style={styles.metricLabel}>Last GPS</Text>
          <Text style={styles.metricValue}>{runtime.locationSnapshot ? runtime.formatDateTime(runtime.locationSnapshot.timestamp) : 'No ping'}</Text>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricPanel}>
          <Text style={styles.metricLabel}>Current city</Text>
          <Text style={styles.metricValue}>{runtime.currentCity || 'Unknown city'}</Text>
        </View>
        <View style={styles.metricPanel}>
          <Text style={styles.metricLabel}>Accuracy</Text>
          <Text style={styles.metricValue}>{runtime.locationSnapshot?.accuracy ? `${Math.round(runtime.locationSnapshot.accuracy)} m` : 'No signal yet'}</Text>
        </View>
      </View>

      <Pressable style={styles.permissionButton} onPress={() => void runtime.requestLocationPermission()}>
        {runtime.isRequestingPermission ? <ActivityIndicator color={driverTheme.colors.primaryText} /> : <Text style={styles.permissionButtonText}>Set GPS to Always Allow</Text>}
      </Pressable>

      {runtime.watchError ? <Text style={driverSharedStyles.warningText}>{runtime.watchError}</Text> : null}
      {runtime.backgroundTrackingError ? <Text style={driverSharedStyles.warningText}>{runtime.backgroundTrackingError}</Text> : null}
    </View>;
};

const styles = StyleSheet.create({
  copyBlock: {
    flex: 1
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10
  },
  metricPanel: {
    flex: 1,
    backgroundColor: driverTheme.colors.surfaceMuted,
    borderRadius: driverTheme.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  metricLabel: {
    color: driverTheme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  metricValue: {
    color: driverTheme.colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6
  },
  permissionButton: {
    backgroundColor: driverTheme.colors.primarySoft,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 13
  },
  permissionButtonText: {
    color: driverTheme.colors.primaryText,
    fontWeight: '800'
  }
});