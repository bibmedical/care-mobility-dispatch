import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { getDriverAccentColor, withDriverAccentAlpha } from './driverColor';
import { driverSharedStyles, driverTheme } from './driverTheme';

type Props = {
  runtime: DriverRuntime;
};

export const DriverControlSection = ({ runtime }: Props) => {
  const driverAccent = getDriverAccentColor({
    id: runtime.driverSession?.driverId,
    name: runtime.driverSession?.name || runtime.driverCode
  });
  const textMessagesEnabled = runtime.notificationMode !== 'silent';
  const phoneCallAlertsEnabled = runtime.notificationMode === 'sound';

  return <View style={styles.screen}>
      <Text style={styles.pageTitle}>Settings</Text>

      <View style={[styles.profileCard, { borderColor: withDriverAccentAlpha(driverAccent, 0.2) }]}>
        <View style={[styles.avatarCircle, { backgroundColor: withDriverAccentAlpha(driverAccent, 0.14) }]}>
          <Text style={styles.avatarText}>{(runtime.driverSession?.name || 'D').slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.profileCopy}>
          <Text style={styles.profileName}>{runtime.driverSession?.name || 'Driver'}</Text>
          <Text style={styles.profileSubline}>Basic Member</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>

      <Pressable style={[styles.accountButton, { backgroundColor: driverAccent }]} onPress={() => runtime.setActiveTab('profile')}>
        <Text style={styles.accountButtonText}>Account</Text>
      </Pressable>

      <View style={styles.groupCard}>
        <SettingRow label="Change Password" onPress={() => runtime.setActiveTab('profile')} />
        <SettingRow label="Vehicle Management" onPress={() => runtime.setActiveTab('history')} />
        <SettingRow label="Document Management" onPress={() => runtime.setActiveTab('documents')} />
        <SettingRow label="Fuel Receipts & Mileage" onPress={() => runtime.setActiveTab('fuel')} />
        <SettingRow label="Time Off Appointment" onPress={() => runtime.setActiveTab('timeoff')} />
        <SettingRow label="Payment" onPress={() => runtime.setActiveTab('help')} />
        <SettingRow label="Sign Out" onPress={() => void runtime.signOut()} />
      </View>

      <Text style={[styles.groupTitle, { color: driverAccent }]}>More Options</Text>
      <View style={styles.groupCard}>
        <SettingSwitchRow label="Newsletter" value={runtime.trackingEnabled} onValueChange={runtime.setTrackingEnabled} />
        <SettingSwitchRow label="Text Message" value={textMessagesEnabled} onValueChange={enabled => runtime.setDriverNotificationMode(enabled ? 'vibrate' : 'silent')} />
        <SettingSwitchRow label="Phone Call" value={phoneCallAlertsEnabled} onValueChange={enabled => runtime.setDriverNotificationMode(enabled ? 'sound' : 'vibrate')} />
        <SettingRow label="Language" value="English" onPress={() => runtime.setActiveTab('help')} />
        <SettingRow label="Linked Accounts" value="Facebook, Google" onPress={() => runtime.setActiveTab('profile')} />
      </View>

      {!runtime.notificationPermissionGranted ? <Pressable style={[styles.permissionButton, { backgroundColor: driverAccent }]} onPress={() => void runtime.requestNotificationPermission()}>
          <Text style={styles.permissionButtonText}>Enable notifications</Text>
        </Pressable> : null}

      <View style={styles.quickActions}>
        <Pressable style={styles.quickButton} onPress={() => void runtime.requestLocationPermission()}>
          {runtime.isRequestingPermission ? <ActivityIndicator color="#3263ff" /> : <Text style={styles.quickButtonText}>Set GPS Always Allow</Text>}
        </Pressable>
        <Pressable style={styles.quickButton} onPress={() => runtime.setActiveTab('messages')}>
          <Text style={styles.quickButtonText}>Open Messages</Text>
        </Pressable>
      </View>

      {runtime.notificationError ? <Text style={styles.errorText}>{runtime.notificationError}</Text> : null}
    </View>;
};

const SettingRow = ({
  label,
  value,
  onPress
}: {
  label: string;
  value?: string;
  onPress: () => void;
}) => <Pressable style={styles.row} onPress={onPress}>
    <Text style={styles.rowLabel}>{label}</Text>
    <View style={styles.rowRight}>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      <Text style={styles.chevron}>›</Text>
    </View>
  </Pressable>;

const SettingSwitchRow = ({
  label,
  value,
  onValueChange
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) => <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#d8dce2', true: '#8aa6ff' }} thumbColor="#ffffff" />
  </View>;

const styles = StyleSheet.create({
  screen: {
    ...driverSharedStyles.card,
    backgroundColor: '#f4f5f7'
  },
  pageTitle: {
    color: '#26303c',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center'
  },
  profileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e8ee',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#dbe4f4',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    color: '#2d3b4c',
    fontWeight: '800'
  },
  profileCopy: {
    flex: 1
  },
  profileName: {
    color: '#26303c',
    fontWeight: '800',
    fontSize: 15
  },
  profileSubline: {
    color: '#8390a0',
    fontSize: 12,
    marginTop: 2
  },
  accountButton: {
    backgroundColor: '#3263ff',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center'
  },
  accountButtonText: {
    color: '#ffffff',
    fontWeight: '800'
  },
  groupTitle: {
    color: '#4f6df2',
    fontWeight: '700',
    marginTop: 2
  },
  groupCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e8ee',
    overflow: 'hidden'
  },
  row: {
    minHeight: 46,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#edf0f5'
  },
  rowLabel: {
    color: '#1f2c39',
    fontSize: 13
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  rowValue: {
    color: '#8b97a6',
    fontSize: 12
  },
  chevron: {
    color: '#b0bac6',
    fontSize: 18,
    fontWeight: '700'
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8
  },
  quickButton: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dbe3ef'
  },
  quickButtonText: {
    color: '#2f3e4e',
    fontWeight: '800'
  },
  permissionButton: {
    backgroundColor: '#3263ff',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 10
  },
  permissionButtonText: {
    color: '#ffffff',
    fontWeight: '800'
  },
  errorText: {
    color: '#c6465f',
    lineHeight: 19
  }
});