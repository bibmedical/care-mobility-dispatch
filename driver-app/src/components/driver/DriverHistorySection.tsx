import { StyleSheet, Text, View } from 'react-native';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { driverSharedStyles, driverTheme } from './driverTheme';

type Props = {
  runtime: DriverRuntime;
};

export const DriverHistorySection = ({ runtime }: Props) => {
  return <View style={styles.screen}>
      <View style={driverSharedStyles.card}>
        <Text style={driverSharedStyles.eyebrow}>History</Text>
        <Text style={driverSharedStyles.title}>Trip history page</Text>
        <Text style={driverSharedStyles.body}>This page is separated so history does not mix with today's working screen.</Text>
      </View>

      <View style={driverSharedStyles.card}>
        <Text style={styles.value}>{runtime.assignedTrips.length}</Text>
        <Text style={styles.label}>Trips loaded in current session</Text>
        <Text style={styles.body}>The next step can connect full completed-trip history from the backend, but the page structure is already separated now.</Text>
      </View>
    </View>;
};

const styles = StyleSheet.create({
  screen: {
    gap: 14
  },
  value: {
    color: driverTheme.colors.text,
    fontSize: 34,
    fontWeight: '800'
  },
  label: {
    color: driverTheme.colors.text,
    fontSize: 18,
    fontWeight: '700'
  },
  body: {
    color: driverTheme.colors.textMuted,
    lineHeight: 20,
    marginTop: 6
  }
});
