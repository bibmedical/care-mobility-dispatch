import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { driverSharedStyles, driverTheme } from './driverTheme';

type Props = {
  runtime: DriverRuntime;
};

export const DriverAlertsSection = ({ runtime }: Props) => {
  return <View style={driverSharedStyles.card}>
      <Text style={driverSharedStyles.eyebrow}>Alerts</Text>
      <Text style={driverSharedStyles.title}>Operational alerts</Text>
      <Text style={driverSharedStyles.body}>Keep urgent items on a separate page so the dashboard stays clean.</Text>

      {runtime.currentAlert ? <View style={styles.heroAlert}>
          <Text style={styles.heroLabel}>Current alert</Text>
          <Text style={styles.heroTitle}>{runtime.currentAlert.title}</Text>
          <Text style={styles.heroBody}>{runtime.currentAlert.body}</Text>
        </View> : <Text style={driverSharedStyles.emptyText}>No live alerts right now.</Text>}

      <View style={styles.quickActions}>
        <Pressable style={styles.actionButton} onPress={() => runtime.setActiveTab('messages')}>
          <Text style={styles.actionButtonText}>Open Messages</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => runtime.setActiveTab('trips')}>
          <Text style={styles.actionButtonText}>Open Trips</Text>
        </Pressable>
      </View>

      <View style={styles.alertCard}>
        <Text style={styles.alertSubject}>Messages stay in the Messages page</Text>
        <Text style={styles.alertBody}>This Alerts page now only shows operational alerts. Dispatch chat messages will not be duplicated here.</Text>
      </View>
    </View>;
};

const styles = StyleSheet.create({
  heroAlert: {
    backgroundColor: driverTheme.colors.surfaceElevated,
    borderRadius: 20,
    padding: 18,
    gap: 6,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  heroLabel: {
    color: driverTheme.colors.primaryText,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  heroTitle: {
    color: driverTheme.colors.text,
    fontSize: 20,
    fontWeight: '800'
  },
  heroBody: {
    color: driverTheme.colors.textMuted,
    lineHeight: 20
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10
  },
  actionButton: {
    flex: 1,
    backgroundColor: driverTheme.colors.primarySoft,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center'
  },
  actionButtonText: {
    color: driverTheme.colors.primaryText,
    fontWeight: '800'
  },
  alertCard: {
    backgroundColor: driverTheme.colors.surfaceMuted,
    borderRadius: 18,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  alertSubject: {
    color: driverTheme.colors.text,
    fontWeight: '800'
  },
  alertBody: {
    color: driverTheme.colors.textMuted,
    lineHeight: 20
  }
});
