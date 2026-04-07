import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
  const [riderSignatureName, setRiderSignatureName] = useState('');
  const focusTrip = runtime.activeTrip || runtime.assignedTrips[0] || null;

  const openDirections = async () => {
    if (!focusTrip) return;
    const headingToPickup = !focusTrip.enRouteAt || !focusTrip.arrivedAt;
    const targetAddress = headingToPickup ? focusTrip.address : focusTrip.destination;
    if (!targetAddress) return;
    const query = encodeURIComponent(targetAddress);
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

  const workflow = focusTrip?.driverWorkflow || null;
  const canMarkArrived = Boolean(focusTrip?.enRouteAt);
  const canCompleteTrip = Boolean(focusTrip?.arrivedAt) && riderSignatureName.trim().length > 1;

  const renderSupportBadges = (trip?: DriverRuntime['activeTrip']) => {
    if (!trip || (!trip.hasServiceAnimal && !trip.mobilityType && !trip.assistLevel)) return null;

    return <View style={styles.supportBadgeRow}>
        {trip.hasServiceAnimal ? <View style={[styles.supportBadge, styles.supportBadgeAnimal]}>
            <Text style={styles.supportBadgeAnimalText}>🐕 Service Animal</Text>
          </View> : null}
        {trip.mobilityType ? <View style={styles.supportBadge}>
            <Text style={styles.supportBadgeText}>{trip.mobilityType}</Text>
          </View> : null}
        {trip.assistLevel ? <View style={styles.supportBadge}>
            <Text style={styles.supportBadgeText}>{trip.assistLevel}</Text>
          </View> : null}
      </View>;
  };

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
                    {renderSupportBadges(trip)}
                  </View>
                  <View style={styles.routeTopMeta}>
                    <Text style={styles.routeTopMetaText}>{trip.miles ? `${trip.miles} mi` : '--'}</Text>
                    <Text style={styles.routeTopMetaText}>{trip.vehicleType || 'Route'}</Text>
                  </View>
                </View>

                <View style={styles.routeCardBottom}>
                  <View style={styles.routeBottomLeft}>
                    <Text style={styles.routeServiceText}>{trip.leg || 'Route'}</Text>
                    <Text style={styles.routeRiderText}>{trip.rider || 'Florida Mobility Group Service'}</Text>
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
              {renderSupportBadges(focusTrip)}
            </View>
            <View style={[driverSharedStyles.pill, { backgroundColor: getTripTone(focusTrip.punctualityVariant) }]}>
              <Text style={driverSharedStyles.pillText}>{focusTrip.punctualityLabel || focusTrip.status || 'Pending'}</Text>
            </View>
          </View>

          <Text style={styles.routeText}>PU {focusTrip.address}</Text>
          <Text style={styles.routeText}>DO {focusTrip.destination}</Text>

          <View style={styles.workflowCard}>
            <Text style={styles.workflowTitle}>Trip workflow</Text>
            <Text style={styles.workflowLine}>Departure: {workflow?.departureTimeLabel || 'Pending'}</Text>
            <Text style={styles.workflowLine}>Arrival: {workflow?.arrivalTimeLabel || 'Pending'}</Text>
            <Text style={styles.workflowLine}>Passenger signature: {focusTrip.riderSignatureName || 'Required before complete'}</Text>
            <Text style={styles.workflowLine}>Completion: {workflow?.completedTimeLabel || 'Pending'}</Text>
          </View>

          <TextInput
            value={riderSignatureName}
            onChangeText={setRiderSignatureName}
            placeholder="Passenger signature name"
            placeholderTextColor={driverTheme.colors.textSoft}
            style={styles.signatureInput}
          />

          <View style={styles.actionRow}>
            <Pressable style={[driverSharedStyles.secondaryButton, runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void runtime.submitTripAction('en-route')} disabled={runtime.activeTripAction.length > 0}>
              <Text style={driverSharedStyles.secondaryButtonText}>{runtime.activeTripAction === 'en-route' ? 'Sending...' : 'En Route'}</Text>
            </Pressable>
            <Pressable style={[driverSharedStyles.secondaryButton, !canMarkArrived || runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void runtime.submitTripAction('arrived')} disabled={!canMarkArrived || runtime.activeTripAction.length > 0}>
              <Text style={driverSharedStyles.secondaryButtonText}>{runtime.activeTripAction === 'arrived' ? 'Sending...' : 'Arrived'}</Text>
            </Pressable>
            <Pressable style={[driverSharedStyles.secondaryButton, styles.mapButton]} onPress={() => void openDirections()}>
              <Text style={driverSharedStyles.secondaryButtonText}>Directions</Text>
            </Pressable>
            <Pressable style={[driverSharedStyles.primaryButton, !canCompleteTrip || runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void runtime.submitTripAction('complete', { riderSignatureName })} disabled={!canCompleteTrip || runtime.activeTripAction.length > 0}>
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
    gap: 12
  },
  routeShell: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.lg,
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
    borderRadius: driverTheme.radius.sm,
    borderWidth: 1,
    borderColor: '#d2dbe2',
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#f6f8fa'
  },
  queueChipDate: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a'
  },
  queueChipDateText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  queueChipActive: {
    backgroundColor: driverTheme.colors.primary,
    borderColor: driverTheme.colors.primary
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
    borderRadius: driverTheme.radius.sm,
    overflow: 'hidden'
  },
  modeTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#f6f8fa'
  },
  modeTabActive: {
    backgroundColor: driverTheme.colors.primary
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
    color: driverTheme.colors.primaryText,
    fontWeight: '700',
    fontSize: 12
  },
  routeCard: {
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    backgroundColor: '#ffffff',
    borderRadius: driverTheme.radius.sm,
    overflow: 'hidden'
  },
  routeCardActive: {
    borderColor: driverTheme.colors.primary,
    borderWidth: 2
  },
  routeCardTop: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  callBadge: {
    width: 34,
    height: 34,
    borderRadius: driverTheme.radius.sm,
    backgroundColor: driverTheme.colors.primary,
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
    color: '#cbd5e1',
    fontWeight: '700',
    fontSize: 11
  },
  routeAddressText: {
    color: '#ffffff',
    fontWeight: '700',
    marginTop: 2
  },
  routeAddressSubText: {
    color: '#dbeafe',
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
  supportBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6
  },
  supportBadge: {
    backgroundColor: '#eef4f8',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#d8e2ea'
  },
  supportBadgeAnimal: {
    backgroundColor: '#fff2cc',
    borderColor: '#f3d26b'
  },
  supportBadgeText: {
    color: '#334a59',
    fontSize: 11,
    fontWeight: '700'
  },
  supportBadgeAnimalText: {
    color: '#6f4e00',
    fontSize: 11,
    fontWeight: '800'
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
  workflowCard: {
    backgroundColor: driverTheme.colors.surfaceMuted,
    borderRadius: driverTheme.radius.md,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  workflowTitle: {
    color: driverTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  workflowLine: {
    color: driverTheme.colors.textMuted,
    lineHeight: 18
  },
  signatureInput: {
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    borderRadius: driverTheme.radius.sm,
    backgroundColor: '#ffffff',
    color: driverTheme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  actionDisabled: {
    opacity: 0.65
  },
  tripCard: {
    backgroundColor: driverTheme.colors.surfaceMuted,
    borderRadius: driverTheme.radius.md,
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
