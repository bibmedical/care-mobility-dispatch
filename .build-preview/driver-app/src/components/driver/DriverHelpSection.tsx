import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { driverSharedStyles, driverTheme } from './driverTheme';

type Props = {
  runtime: DriverRuntime;
};

export const DriverHelpSection = ({ runtime }: Props) => {
  return <View style={styles.screen}>
      <View style={driverSharedStyles.card}>
        <Text style={driverSharedStyles.eyebrow}>Help</Text>
        <Text style={driverSharedStyles.title}>Help and support page</Text>
        <Text style={driverSharedStyles.body}>Support actions live here so they are not mixed with trips, GPS, or settings.</Text>
      </View>

      <Pressable style={styles.helpCard} onPress={() => runtime.setActiveTab('messages')}>
        <Text style={styles.helpTitle}>Contact dispatch</Text>
        <Text style={styles.helpBody}>Open the message center and send an update to dispatch.</Text>
      </Pressable>

      <Pressable style={styles.helpCard} onPress={() => runtime.setActiveTab('gps')}>
        <Text style={styles.helpTitle}>Fix GPS permissions</Text>
        <Text style={styles.helpBody}>Open the GPS page and review Always Allow setup.</Text>
      </Pressable>

      <Pressable style={styles.helpCard} onPress={() => runtime.setActiveTab('settings')}>
        <Text style={styles.helpTitle}>Open app settings</Text>
        <Text style={styles.helpBody}>Check sync, route controls, and app configuration.</Text>
      </Pressable>
    </View>;
};

const styles = StyleSheet.create({
  screen: {
    gap: 14
  },
  helpCard: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: 22,
    padding: 18,
    gap: 6,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  helpTitle: {
    color: driverTheme.colors.text,
    fontWeight: '800',
    fontSize: 18
  },
  helpBody: {
    color: driverTheme.colors.textMuted,
    lineHeight: 20
  }
});
