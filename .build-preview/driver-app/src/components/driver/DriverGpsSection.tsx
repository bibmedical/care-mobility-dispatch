import { StyleSheet, Text, View } from 'react-native';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { DriverTrackingCard } from './DriverTrackingCard';
import { driverSharedStyles, driverTheme } from './driverTheme';

type Props = {
  runtime: DriverRuntime;
};

export const DriverGpsSection = ({ runtime }: Props) => {
  return <View style={styles.screen}>
      <View style={driverSharedStyles.card}>
        <Text style={driverSharedStyles.eyebrow}>GPS</Text>
        <Text style={driverSharedStyles.title}>Live location page</Text>
        <Text style={driverSharedStyles.body}>This page is only for permissions, GPS signal, tracking status and dispatcher sync.</Text>
      </View>
      <DriverTrackingCard runtime={runtime} />
    </View>;
};

const styles = StyleSheet.create({
  screen: {
    gap: 14
  }
});
