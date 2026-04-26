import { StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { driverTheme } from './driverTheme';

type Props = {
  runtime: DriverRuntime;
};

const formatTs = (ts?: number | string | null) => {
  if (!ts) return '';
  const date = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
};

const ACTION_LABELS: Record<string, string> = {
  accept: 'Accepted by driver',
  'activate-willcall': 'WillCall activated by driver',
  'en-route': 'Driver started route to pickup',
  arrived: 'Driver arrived at pickup',
  'patient-onboard': 'Patient onboard',
  'start-trip': 'Started trip to destination',
  'arrived-destination': 'Arrived at destination',
  complete: 'Trip completed',
  cancel: 'Trip cancelled by driver',
};

type TimelineEvent = {
  key: string;
  label: string;
  time: string;
  timestamp: number;
  source: 'dispatcher' | 'driver';
};

const toTimestamp = (value?: number | string | null) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const buildTimelineEvents = (trip: DriverRuntime['assignedTrips'][number]): TimelineEvent[] => {
  const wf = trip.driverWorkflow;
  const dispatchEvents: TimelineEvent[] = [];
  const driverEvents: TimelineEvent[] = [];

  if (trip.createdAt) {
    dispatchEvents.push({
      key: `${trip.id}-created`,
      label: 'Trip loaded from Excel/import',
      time: formatTs(trip.createdAt),
      timestamp: toTimestamp(trip.createdAt),
      source: 'dispatcher'
    });
  }

  if (trip.confirmationStatus) {
    const confirmationTime = trip.confirmationRespondedAt || trip.confirmationSentAt || '';
    dispatchEvents.push({
      key: `${trip.id}-confirmation`,
      label: `Confirmation: ${trip.confirmationStatus}`,
      time: formatTs(confirmationTime) || String(confirmationTime || ''),
      timestamp: toTimestamp(confirmationTime),
      source: 'dispatcher'
    });
  }

  if (trip.serviceDate) {
    dispatchEvents.push({
      key: `${trip.id}-service-date`,
      label: 'Trip assigned (service date)',
      time: String(trip.serviceDate),
      timestamp: toTimestamp(trip.serviceDate),
      source: 'dispatcher'
    });
  }

  if (String(trip.status || '').toLowerCase().includes('cancel') && !trip.canceledAt) {
    dispatchEvents.push({
      key: `${trip.id}-dispatch-cancelled`,
      label: 'Trip cancelled by dispatcher',
      time: '',
      timestamp: 0,
      source: 'dispatcher'
    });
  }

  if (wf?.acceptedAt) driverEvents.push({ key: `${trip.id}-accept`, label: ACTION_LABELS.accept, time: formatTs(wf.acceptedAt), timestamp: toTimestamp(wf.acceptedAt), source: 'driver' });
  if (wf?.willCallActivatedAt || trip.willCallActivatedAt) driverEvents.push({ key: `${trip.id}-activate-willcall`, label: ACTION_LABELS['activate-willcall'], time: formatTs(wf?.willCallActivatedAt || trip.willCallActivatedAt), timestamp: toTimestamp(wf?.willCallActivatedAt || trip.willCallActivatedAt), source: 'driver' });
  if (wf?.departureToPickupAt || wf?.departureAt) driverEvents.push({ key: `${trip.id}-en-route`, label: ACTION_LABELS['en-route'], time: formatTs(wf?.departureToPickupAt || wf?.departureAt), timestamp: toTimestamp(wf?.departureToPickupAt || wf?.departureAt), source: 'driver' });
  if (wf?.arrivedPickupAt || wf?.arrivalAt) driverEvents.push({ key: `${trip.id}-arrived`, label: ACTION_LABELS.arrived, time: formatTs(wf?.arrivedPickupAt || wf?.arrivalAt), timestamp: toTimestamp(wf?.arrivedPickupAt || wf?.arrivalAt), source: 'driver' });
  if (wf?.patientOnboardAt) driverEvents.push({ key: `${trip.id}-patient-onboard`, label: ACTION_LABELS['patient-onboard'], time: formatTs(wf.patientOnboardAt), timestamp: toTimestamp(wf.patientOnboardAt), source: 'driver' });
  if (wf?.startTripAt || wf?.destinationDepartureAt) driverEvents.push({ key: `${trip.id}-start-trip`, label: ACTION_LABELS['start-trip'], time: formatTs(wf?.startTripAt || wf?.destinationDepartureAt), timestamp: toTimestamp(wf?.startTripAt || wf?.destinationDepartureAt), source: 'driver' });
  if (wf?.arrivedDestinationAt || wf?.destinationArrivalAt) driverEvents.push({ key: `${trip.id}-arrived-destination`, label: ACTION_LABELS['arrived-destination'], time: formatTs(wf?.arrivedDestinationAt || wf?.destinationArrivalAt), timestamp: toTimestamp(wf?.arrivedDestinationAt || wf?.destinationArrivalAt), source: 'driver' });
  if (wf?.completedAt) driverEvents.push({ key: `${trip.id}-complete`, label: ACTION_LABELS.complete, time: formatTs(wf.completedAt), timestamp: toTimestamp(wf.completedAt), source: 'driver' });
  if (trip.canceledAt) driverEvents.push({ key: `${trip.id}-cancel`, label: ACTION_LABELS.cancel, time: formatTs(trip.canceledAt), timestamp: toTimestamp(trip.canceledAt), source: 'driver' });

  return [...dispatchEvents, ...driverEvents].sort((a, b) => {
    if (a.timestamp === b.timestamp) return a.label.localeCompare(b.label);
    if (!a.timestamp) return -1;
    if (!b.timestamp) return 1;
    return a.timestamp - b.timestamp;
  });
};

export const DriverHistorySection = ({ runtime }: Props) => {
  const entries = useMemo(() => {
    return [...runtime.assignedTrips]
      .filter(trip => {
        const normalizedStatus = String(trip.status || '').toLowerCase();
        return normalizedStatus.includes('complet') || normalizedStatus.includes('cancel');
      })
      .sort((a, b) => {
        const aTime = Number(a.canceledAt || a.completedAt || a.arrivedDestinationAt || a.startTripAt || a.patientOnboardAt || a.arrivedAt || a.enRouteAt || 0);
        const bTime = Number(b.canceledAt || b.completedAt || b.arrivedDestinationAt || b.startTripAt || b.patientOnboardAt || b.arrivedAt || b.enRouteAt || 0);
        return bTime - aTime;
      });
  }, [runtime.assignedTrips]);

  if (entries.length === 0) {
    return <View style={styles.screen}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No trip history yet.</Text>
          <Text style={styles.emptyMeta}>Completed and cancelled trips will appear here.</Text>
        </View>
      </View>;
  }

  return <View style={styles.screen}>
      {entries.map(trip => {
        const isCompleted = String(trip.status || '').toLowerCase().includes('complet');
        const isCancelled = String(trip.status || '').toLowerCase().includes('cancel');
        const timelineEvents = buildTimelineEvents(trip);

        const cancellationReason = String(trip.cancellationReason || '').trim();
        const cancellationPhoto = String(trip.cancellationPhotoDataUrl || '').trim();

        const statusColor = isCompleted ? '#14532d' : isCancelled ? '#7f1d1d' : '#1e3a5f';
        const statusLabel = isCompleted ? 'Completed' : isCancelled ? 'Cancelled' : trip.status || 'In Progress';

        return <View key={trip.id} style={styles.tripCard}>
            <View style={styles.tripCardHeader}>
              <View style={styles.tripCardTitleBlock}>
                <Text style={styles.tripRider}>{trip.rider || 'Unknown rider'}</Text>
                <Text style={styles.tripMeta}>{trip.rideId || trip.id} · {trip.serviceDate || ''}</Text>
                {trip.address ? <Text style={styles.tripAddr} numberOfLines={1}>PU {trip.address}</Text> : null}
                {trip.destination ? <Text style={styles.tripAddr} numberOfLines={1}>DO {trip.destination}</Text> : null}
              </View>
              <View style={[styles.statusPill, { backgroundColor: statusColor }]}>
                <Text style={styles.statusPillText}>{statusLabel}</Text>
              </View>
            </View>

            {timelineEvents.length > 0 && <View style={styles.eventSection}>
              <Text style={styles.eventSectionTitle}>Trip line</Text>
              {timelineEvents.map((ev, index) => <View key={ev.key} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View style={[styles.timelineDot, ev.source === 'driver' ? styles.timelineDotDriver : styles.timelineDotDispatcher]} />
                    {index < timelineEvents.length - 1 ? <View style={styles.timelineLine} /> : null}
                  </View>
                  <View style={styles.timelineContent}>
                    <View style={styles.timelineHeader}>
                      <Text style={styles.eventLabel}>{ev.label}</Text>
                      {ev.time ? <Text style={styles.eventTime}>{ev.time}</Text> : null}
                    </View>
                    <Text style={styles.timelineSource}>{ev.source === 'driver' ? 'Driver' : 'Dispatcher'}</Text>
                  </View>
                </View>)}
            </View>}

            {cancellationReason || cancellationPhoto ? <View style={styles.eventSection}>
                <Text style={styles.eventSectionTitle}>Cancellation evidence</Text>
                {cancellationReason ? <Text style={styles.eventLabel}>Reason: {cancellationReason}</Text> : null}
                {cancellationPhoto ? <Text style={styles.eventTime}>Photo attached</Text> : null}
              </View> : null}

            {timelineEvents.length === 0 && <Text style={styles.noEventsText}>No recorded events yet.</Text>}
          </View>;
      })}
    </View>;
};

const styles = StyleSheet.create({
  screen: {
    gap: 12
  },
  emptyCard: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.xl,
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    padding: 20,
    gap: 6
  },
  emptyText: {
    color: driverTheme.colors.text,
    fontSize: 18,
    fontWeight: '800'
  },
  emptyMeta: {
    color: driverTheme.colors.textMuted,
    fontSize: 13
  },
  tripCard: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.xl,
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    padding: 14,
    gap: 10
  },
  tripCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  tripCardTitleBlock: {
    flex: 1,
    gap: 2
  },
  tripRider: {
    color: driverTheme.colors.text,
    fontSize: 17,
    fontWeight: '800'
  },
  tripMeta: {
    color: driverTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600'
  },
  tripAddr: {
    color: driverTheme.colors.textSoft,
    fontSize: 12
  },
  statusPill: {
    borderRadius: driverTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  statusPillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800'
  },
  eventSection: {
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: driverTheme.colors.border,
    paddingTop: 8
  },
  eventSectionTitle: {
    color: driverTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10
  },
  timelineRail: {
    width: 16,
    alignItems: 'center'
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 4
  },
  timelineDotDispatcher: {
    backgroundColor: '#64748b'
  },
  timelineDotDriver: {
    backgroundColor: '#14532d'
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
    backgroundColor: driverTheme.colors.border
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 10,
    gap: 2
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8
  },
  timelineSource: {
    color: driverTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6
  },
  eventDot: {
    color: driverTheme.colors.textMuted,
    fontSize: 16,
    lineHeight: 18
  },
  eventLabel: {
    flex: 1,
    color: driverTheme.colors.text,
    fontSize: 13,
    lineHeight: 18
  },
  eventTime: {
    color: driverTheme.colors.textSoft,
    fontSize: 12,
    lineHeight: 18
  },
  noEventsText: {
    color: driverTheme.colors.textSoft,
    fontSize: 12,
    fontStyle: 'italic'
  }
});
