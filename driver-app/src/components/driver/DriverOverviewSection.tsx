import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { DRIVER_APP_CONFIG } from '../../config/driverAppConfig';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { driverSharedStyles, driverTheme } from './driverTheme';
import { getTripTone, getTripWindow } from './driverUtils';

type Props = {
  runtime: DriverRuntime;
};

export const DriverOverviewSection = ({ runtime }: Props) => {
  const focusTrip = runtime.activeTrip || runtime.assignedTrips[0] || null;
  const urgentMessages = runtime.messages.filter(message => message.priority === 'high' || message.status === 'active').length;
  const lateTrips = runtime.assignedTrips.filter(trip => trip.punctualityVariant === 'danger' || Number(trip.lateMinutes || 0) >= DRIVER_APP_CONFIG.lateAlertThresholdMinutes).length;

  return <>
      <View style={styles.overviewGrid}>
        <View style={styles.overviewTile}>
          <Text style={styles.overviewLabel}>Trips today</Text>
          <Text style={styles.overviewValue}>{runtime.assignedTrips.length}</Text>
        </View>
        <View style={styles.overviewTile}>
          <Text style={styles.overviewLabel}>Urgent inbox</Text>
          <Text style={styles.overviewValue}>{urgentMessages}</Text>
        </View>
        <View style={styles.overviewTile}>
          <Text style={styles.overviewLabel}>Late risk</Text>
          <Text style={styles.overviewValue}>{lateTrips}</Text>
        </View>
        <View style={styles.overviewTile}>
          <Text style={styles.overviewLabel}>Background GPS</Text>
          <Text style={styles.overviewValueSmall}>{runtime.isBackgroundTrackingEnabled ? 'ON' : 'OFF'}</Text>
        </View>
      </View>

      {runtime.currentAlert ? <View style={[styles.alertCard, runtime.currentAlert.type === 'late-trip' ? styles.alertCardDanger : styles.alertCardInfo]}>
          <Text style={styles.alertLabel}>{runtime.currentAlert.type === 'late-trip' ? 'Late alert' : 'Dispatcher alert'}</Text>
          <Text style={styles.alertTitle}>{runtime.currentAlert.title}</Text>
          <Text style={styles.alertBody}>{runtime.currentAlert.body}</Text>
        </View> : null}

      {focusTrip ? <View style={driverSharedStyles.card}>
          <View style={driverSharedStyles.rowBetween}>
            <View style={styles.focusCopy}>
              <Text style={driverSharedStyles.eyebrow}>Main route</Text>
              <Text style={styles.focusTitle}>{focusTrip.rider}</Text>
              <Text style={styles.focusMeta}>{focusTrip.rideId || focusTrip.id} | {getTripWindow(focusTrip)}</Text>
            </View>
            <View style={[driverSharedStyles.pill, { backgroundColor: getTripTone(focusTrip.punctualityVariant) }]}>
              <Text style={driverSharedStyles.pillText}>{focusTrip.punctualityLabel || focusTrip.status || 'Pending'}</Text>
            </View>
          </View>

          <View style={styles.routeBox}>
            <View style={styles.routeRow}>
              <View style={styles.routeMarkerPickup} />
              <View style={styles.routeTextBlock}>
                <Text style={styles.routeLabel}>Pickup</Text>
                <Text style={styles.routeText}>{focusTrip.address}</Text>
              </View>
              <Text style={styles.routeTime}>{focusTrip.scheduledPickup || focusTrip.pickup || '--'}</Text>
            </View>
            <View style={styles.routeDivider} />
            <View style={styles.routeRow}>
              <View style={styles.routeMarkerDropoff} />
              <View style={styles.routeTextBlock}>
                <Text style={styles.routeLabel}>Dropoff</Text>
                <Text style={styles.routeText}>{focusTrip.destination}</Text>
              </View>
              <Text style={styles.routeTime}>{focusTrip.scheduledDropoff || focusTrip.dropoff || '--'}</Text>
            </View>
          </View>

          <View style={styles.quickActionsRow}>
            <Pressable style={driverSharedStyles.primaryButton} onPress={() => runtime.setActiveTab('trips')}>
              <Text style={driverSharedStyles.primaryButtonText}>Open trip</Text>
            </Pressable>
            <Pressable style={driverSharedStyles.secondaryButton} onPress={() => runtime.setActiveTab('messages')}>
              <Text style={driverSharedStyles.secondaryButtonText}>Open inbox</Text>
            </Pressable>
          </View>
        </View> : null}

      <View style={driverSharedStyles.card}>
        <View style={driverSharedStyles.rowBetween}>
          <Text style={driverSharedStyles.title}>Today route queue</Text>
          <Text style={driverSharedStyles.hint}>{runtime.assignedTrips.length} assigned</Text>
        </View>

        {runtime.isLoadingTrips ? <ActivityIndicator color="#0f766e" /> : null}
        {runtime.tripSyncError ? <Text style={driverSharedStyles.warningText}>{runtime.tripSyncError}</Text> : null}
        {runtime.assignedTrips.length === 0 ? <Text style={driverSharedStyles.emptyText}>No trips assigned yet.</Text> : runtime.assignedTrips.map(trip => <Pressable key={trip.id} onPress={() => {
        runtime.setActiveTrip(trip);
        runtime.setActiveTab('trips');
      }} style={[styles.tripListItem, runtime.activeTrip?.id === trip.id ? styles.tripListItemActive : null]}>
              <View style={driverSharedStyles.rowBetween}>
                <View style={styles.tripCopy}>
                  <Text style={styles.tripName}>{trip.rider || 'Unnamed rider'}</Text>
                  <Text style={styles.tripMeta}>{trip.rideId || trip.id} | {getTripWindow(trip)}</Text>
                </View>
                <View style={[driverSharedStyles.pill, { backgroundColor: getTripTone(trip.punctualityVariant) }]}>
                  <Text style={driverSharedStyles.pillText}>{trip.punctualityLabel || trip.status || 'Pending'}</Text>
                </View>
              </View>
              <Text style={styles.tripAddress}>PU {trip.address}</Text>
              <Text style={styles.tripAddress}>DO {trip.destination}</Text>
              <View style={styles.tripFooter}>
                <Text style={styles.tripMeta}>{trip.leg || 'Leg pending'}</Text>
                <Text style={styles.tripMeta}>{trip.miles ? `${trip.miles} mi` : 'Miles pending'}</Text>
                <Text style={styles.tripMeta}>{trip.status || 'Unassigned'}</Text>
              </View>
            </Pressable>)}
      </View>
    </>;
};

const styles = StyleSheet.create({
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  overviewTile: {
    width: '48%',
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.sm,
    padding: 16,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  overviewLabel: {
    color: '#71838d',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  overviewValue: {
    color: driverTheme.colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 8
  },
  overviewValueSmall: {
    color: driverTheme.colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 10
  },
  alertCard: {
    borderRadius: driverTheme.radius.sm,
    padding: 16,
    gap: 6
  },
  alertCardDanger: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: driverTheme.colors.primary
  },
  alertCardInfo: {
    backgroundColor: '#eef7fb',
    borderWidth: 1,
    borderColor: '#b0d6e6'
  },
  alertLabel: {
    color: driverTheme.colors.primaryText,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  alertTitle: {
    color: driverTheme.colors.text,
    fontSize: 18,
    fontWeight: '800'
  },
  alertBody: {
    color: '#5f727d',
    lineHeight: 20
  },
  focusCopy: {
    flex: 1
  },
  focusTitle: {
    color: driverTheme.colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4
  },
  focusMeta: {
    color: driverTheme.colors.textMuted,
    marginTop: 4
  },
  routeBox: {
    backgroundColor: driverTheme.colors.surfaceMuted,
    borderRadius: driverTheme.radius.sm,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  routeTextBlock: {
    flex: 1
  },
  routeMarkerPickup: {
    width: 12,
    height: 12,
    borderRadius: driverTheme.radius.pill,
    backgroundColor: '#0f766e',
    marginTop: 5
  },
  routeMarkerDropoff: {
    width: 12,
    height: 12,
    borderRadius: driverTheme.radius.pill,
    backgroundColor: driverTheme.colors.accent,
    marginTop: 5
  },
  routeLabel: {
    color: '#71838d',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  routeText: {
    color: driverTheme.colors.text,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 2
  },
  routeTime: {
    color: driverTheme.colors.text,
    fontWeight: '800'
  },
  routeDivider: {
    marginLeft: 5,
    height: 18,
    width: 2,
    backgroundColor: '#d6e0e5'
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10
  },
  tripListItem: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.sm,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  tripListItemActive: {
    borderColor: driverTheme.colors.primary,
    borderLeftWidth: 3,
    backgroundColor: driverTheme.colors.surfaceElevated
  },
  tripCopy: {
    flex: 1
  },
  tripName: {
    color: driverTheme.colors.text,
    fontSize: 17,
    fontWeight: '800'
  },
  tripMeta: {
    color: '#6a7d86',
    fontSize: 12,
    fontWeight: '700'
  },
  tripAddress: {
    color: '#304754',
    lineHeight: 19
  },
  tripFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  }
});