import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMemo, useState } from 'react';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { driverSharedStyles, driverTheme } from './driverTheme';
import { getTripTone, getTripWindow } from './driverUtils';

type Props = {
  runtime: DriverRuntime;
};

type ListMode = 'routes' | 'trips';
type QueueMode = 'scheduled' | 'in-progress';

export const DriverTripsSection = ({ runtime }: Props) => {
  const [listMode, setListMode] = useState<ListMode>('routes');
  const [queueMode, setQueueMode] = useState<QueueMode>('scheduled');
  const focusTrip = runtime.activeTrip || runtime.assignedTrips[0] || null;

  const openDirections = async () => {
    if (!focusTrip?.destination) return;
    const query = encodeURIComponent(focusTrip.destination);
    await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${query}&travelmode=driving`);
  };

  const openPhoneCall = async (phoneNumber?: string) => {
    const digits = String(phoneNumber || '').replace(/\D+/g, '');
    if (!digits) return;
    await Linking.openURL(`tel:${digits}`);
  };

  const isInProgressTrip = (status?: string) => {
    const normalized = String(status || '').toLowerCase();
    return normalized.includes('en-route') || normalized.includes('arrived') || normalized.includes('progress');
  };

  const filteredTrips = useMemo(() => {
    if (queueMode === 'in-progress') {
      return runtime.assignedTrips.filter(trip => isInProgressTrip(trip.status));
    }

    return runtime.assignedTrips.filter(trip => !isInProgressTrip(trip.status));
  }, [queueMode, runtime.assignedTrips]);

  return <View style={styles.screen}>
      <View style={styles.routeShell}>
        <View style={styles.queueHeaderRow}>
          <Pressable style={[styles.queueChip, styles.queueChipDate]}>
            <Text style={styles.queueChipDateText}>Scheduled</Text>
          </Pressable>
          <Pressable style={[styles.queueChip, queueMode === 'scheduled' ? styles.queueChipActive : null]} onPress={() => setQueueMode('scheduled')}>
            <Text style={[styles.queueChipText, queueMode === 'scheduled' ? styles.queueChipTextActive : null]}>Scheduled</Text>
          </Pressable>
          <Pressable style={[styles.queueChip, queueMode === 'in-progress' ? styles.queueChipActive : null]} onPress={() => setQueueMode('in-progress')}>
            <Text style={[styles.queueChipText, queueMode === 'in-progress' ? styles.queueChipTextActive : null]}>In Progress</Text>
          </Pressable>
        </View>

        <View style={styles.routeSubHeader}>
          <View style={styles.modeTabs}>
            <Pressable style={[styles.modeTab, listMode === 'routes' ? styles.modeTabActive : null]} onPress={() => setListMode('routes')}>
              <Text style={[styles.modeTabText, listMode === 'routes' ? styles.modeTabTextActive : null]}>Routes</Text>
            </Pressable>
            <Pressable style={[styles.modeTab, listMode === 'trips' ? styles.modeTabActive : null]} onPress={() => setListMode('trips')}>
              <Text style={[styles.modeTabText, listMode === 'trips' ? styles.modeTabTextActive : null]}>Trips</Text>
            </Pressable>
          </View>
          <Text style={styles.selectedRouteText}>Selected Route: {focusTrip?.rideId || focusTrip?.id || '--'}</Text>
        </View>
      </View>

      {runtime.isLoadingTrips ? <ActivityIndicator color={driverTheme.colors.primary} /> : null}
      {runtime.tripSyncError ? <Text style={driverSharedStyles.warningText}>{runtime.tripSyncError}</Text> : null}

      {listMode === 'routes' ? <>
          {filteredTrips.length === 0 ? <View style={driverSharedStyles.card}>
              <Text style={driverSharedStyles.emptyText}>No routes in this queue.</Text>
            </View> : filteredTrips.map(trip => <Pressable key={trip.id} onPress={() => runtime.setActiveTrip(trip)} style={[styles.routeCard, runtime.activeTrip?.id === trip.id ? styles.routeCardActive : null]}>
                <View style={styles.routeCardTop}>
                  <Pressable style={styles.callBadge} onPress={() => void openPhoneCall(trip.patientPhoneNumber)}>
                    <Text style={styles.callBadgeText}>Call</Text>
                  </Pressable>
                  <View style={styles.routeTopCopy}>
                    <Text style={styles.routeIdText}>ID: {trip.rideId || trip.id}</Text>
                    <Text style={styles.routeAddressText} numberOfLines={1}>{trip.address}</Text>
                    <Text style={styles.routeAddressSubText} numberOfLines={1}>{trip.destination}</Text>
                  </View>
                  <View style={styles.routeTopMeta}>
                    <Text style={styles.routeTopMetaText}>{trip.miles ? `${trip.miles} mi` : '--'}</Text>
                    <Text style={styles.routeTopMetaText}>{trip.vehicleType || 'Route'}</Text>
                  </View>
                </View>

                <View style={styles.routeCardBottom}>
                  <View style={styles.routeBottomLeft}>
                    <Text style={styles.routeServiceText}>{trip.leg || 'Route'}</Text>
                    <Text style={styles.routeRiderText}>{trip.rider || 'Care Mobility Service'}</Text>
                  </View>
                  <Text style={styles.routeTimeText}>{trip.pickup || trip.scheduledPickup || '--'} - {trip.dropoff || trip.scheduledDropoff || '--'}</Text>
                  <Text style={styles.routeStatusText}>{trip.punctualityLabel || trip.status || 'Accepted'}</Text>
                </View>
              </Pressable>)}
        </> : focusTrip ? <View style={driverSharedStyles.card}>
          <View style={driverSharedStyles.rowBetween}>
            <View style={styles.copyBlock}>
              <Text style={driverSharedStyles.eyebrow}>Current trip</Text>
              <Text style={styles.focusTitle}>{focusTrip.rider}</Text>
              <Text style={styles.focusMeta}>{focusTrip.rideId || focusTrip.id} | {getTripWindow(focusTrip)}</Text>
            </View>
            <View style={[driverSharedStyles.pill, { backgroundColor: getTripTone(focusTrip.punctualityVariant) }]}>
              <Text style={driverSharedStyles.pillText}>{focusTrip.punctualityLabel || focusTrip.status || 'Pending'}</Text>
            </View>
          </View>

          <Text style={styles.routeText}>PU {focusTrip.address}</Text>
          <Text style={styles.routeText}>DO {focusTrip.destination}</Text>

          <View style={styles.actionRow}>
            <Pressable style={[driverSharedStyles.secondaryButton, runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void runtime.submitTripAction('en-route')} disabled={runtime.activeTripAction.length > 0}>
              <Text style={driverSharedStyles.secondaryButtonText}>{runtime.activeTripAction === 'en-route' ? 'Sending...' : 'En Route'}</Text>
            </Pressable>
            <Pressable style={[driverSharedStyles.secondaryButton, styles.mapButton]} onPress={() => void openDirections()}>
              <Text style={driverSharedStyles.secondaryButtonText}>Directions</Text>
            </Pressable>
            <Pressable style={[driverSharedStyles.primaryButton, runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void runtime.submitTripAction('complete')} disabled={runtime.activeTripAction.length > 0}>
              <Text style={driverSharedStyles.primaryButtonText}>{runtime.activeTripAction === 'complete' ? 'Sending...' : 'Complete'}</Text>
            </Pressable>
          </View>

          {runtime.tripActionError ? <Text style={driverSharedStyles.warningText}>{runtime.tripActionError}</Text> : null}
        </View> : <View style={driverSharedStyles.card}>
            <Text style={driverSharedStyles.emptyText}>No trips assigned yet.</Text>
          </View>}
    </View>;
};

const styles = StyleSheet.create({
  screen: {
    gap: 14
  },
  routeShell: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    padding: 10,
    gap: 8
  },
  queueHeaderRow: {
    flexDirection: 'row',
    gap: 8
  },
  queueChip: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d2dbe2',
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#f6f8fa'
  },
  queueChipDate: {
    backgroundColor: '#ef3340',
    borderColor: '#ef3340'
  },
  queueChipDateText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  queueChipActive: {
    backgroundColor: '#1f66c2',
    borderColor: '#1f66c2'
  },
  queueChipText: {
    color: '#2f4453',
    fontSize: 12,
    fontWeight: '700'
  },
  queueChipTextActive: {
    color: '#ffffff'
  },
  routeSubHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10
  },
  modeTabs: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#b7c7d5',
    borderRadius: 3,
    overflow: 'hidden'
  },
  modeTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#f6f8fa'
  },
  modeTabActive: {
    backgroundColor: '#1f66c2'
  },
  modeTabText: {
    color: '#2c4151',
    fontWeight: '700',
    fontSize: 12
  },
  modeTabTextActive: {
    color: '#ffffff'
  },
  selectedRouteText: {
    color: '#1f66c2',
    fontWeight: '700',
    fontSize: 12
  },
  routeCard: {
    borderWidth: 1,
    borderColor: '#e5e8ee',
    backgroundColor: '#ffffff',
    borderRadius: 4,
    overflow: 'hidden'
  },
  routeCardActive: {
    borderColor: '#3263ff',
    borderWidth: 2
  },
  routeCardTop: {
    backgroundColor: '#3263ff',
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  callBadge: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: '#1a45cc',
    alignItems: 'center',
    justifyContent: 'center'
  },
  callBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800'
  },
  routeTopCopy: {
    flex: 1
  },
  routeIdText: {
    color: '#d4e0ff',
    fontWeight: '700',
    fontSize: 11
  },
  routeAddressText: {
    color: '#ffffff',
    fontWeight: '700',
    marginTop: 2
  },
  routeAddressSubText: {
    color: '#ebffee',
    fontSize: 12
  },
  routeTopMeta: {
    alignItems: 'flex-end',
    gap: 4
  },
  routeTopMetaText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700'
  },
  routeCardBottom: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  routeBottomLeft: {
    flex: 1
  },
  routeServiceText: {
    color: '#1f2f3b',
    fontSize: 12,
    fontWeight: '700'
  },
  routeRiderText: {
    color: '#2f4252',
    fontSize: 12,
    marginTop: 2
  },
  routeTimeText: {
    color: '#17242f',
    fontWeight: '800',
    fontSize: 13,
    marginTop: 2
  },
  routeStatusText: {
    color: '#3a4d5d',
    fontStyle: 'italic',
    marginTop: 3,
    fontSize: 12
  },
  copyBlock: {
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
  routeText: {
    color: driverTheme.colors.text,
    lineHeight: 20
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap'
  },
  mapButton: {
    backgroundColor: driverTheme.colors.primarySoft
  },
  actionDisabled: {
    opacity: 0.65
  },
  tripCard: {
    backgroundColor: driverTheme.colors.surfaceMuted,
    borderRadius: 18,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  tripCardActive: {
    borderColor: driverTheme.colors.primary,
    backgroundColor: driverTheme.colors.surfaceElevated
  },
  tripName: {
    color: driverTheme.colors.text,
    fontSize: 17,
    fontWeight: '800'
  },
  tripMeta: {
    color: driverTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700'
  },
  tripMiles: {
    color: driverTheme.colors.text,
    fontWeight: '800'
  }
});
