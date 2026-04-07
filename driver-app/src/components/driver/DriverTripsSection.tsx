import { ActivityIndicator, Linking, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { driverSharedStyles, driverTheme } from './driverTheme';
import { getTripTone, getTripWindow } from './driverUtils';

type Props = {
  runtime: DriverRuntime;
};

type ListMode = 'routes' | 'trips';
type QueueMode = 'scheduled' | 'in-progress';
type TripDateMode = 'today' | 'next-day';

const toDateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

const normalizeServiceDateKey = (value?: string | null) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const slashMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    const mm = String(slashMatch[1]).padStart(2, '0');
    const dd = String(slashMatch[2]).padStart(2, '0');
    const yyyy = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
};

export const DriverTripsSection = ({ runtime }: Props) => {
  const OUTSIDE_SMS_TEMPLATE = 'Hi this is Care Mobility. Your driver is outside waiting for you.';
  const [listMode, setListMode] = useState<ListMode>('routes');
  const [queueMode, setQueueMode] = useState<QueueMode>('scheduled');
  const [tripDateMode, setTripDateMode] = useState<TripDateMode>('today');
  const [signaturePoints, setSignaturePoints] = useState<Array<{ x: number; y: number }>>([]);
  const [signaturePadSize, setSignaturePadSize] = useState({ width: 1, height: 1 });
  const signaturePointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const focusTrip = runtime.activeTrip || runtime.assignedTrips[0] || null;

  const openDirections = async () => {
    if (!focusTrip) return;
    const headingToPickup = !focusTrip.enRouteAt || !focusTrip.arrivedAt;
    if (headingToPickup && !String(focusTrip.riderSignatureName || '').trim() && signaturePoints.length < 12) return;
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

  const sendOutsideSms = async (trip: NonNullable<DriverRuntime['activeTrip']>) => {
    const digits = String(trip.patientPhoneNumber || '').replace(/\D+/g, '');
    if (!digits) return;
    const encodedText = encodeURIComponent(OUTSIDE_SMS_TEMPLATE);
    const querySeparator = Platform.OS === 'ios' ? '&' : '?';
    await Linking.openURL(`sms:${digits}${querySeparator}body=${encodedText}`);
    await runtime.sendOutsideSmsNotice(trip, OUTSIDE_SMS_TEMPLATE, digits);
  };

  const isInProgressTrip = (status?: string) => {
    const normalized = String(status || '').toLowerCase();
    return normalized.includes('en-route') || normalized.includes('arrived') || normalized.includes('progress');
  };

  const filteredTrips = useMemo(() => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayKey = toDateKey(today);
    const tomorrowKey = toDateKey(tomorrow);

    if (queueMode === 'in-progress') {
      return runtime.assignedTrips.filter(trip => isInProgressTrip(trip.status)).filter(trip => {
        const serviceDateKey = normalizeServiceDateKey(trip.serviceDate);
        if (!serviceDateKey) return tripDateMode === 'today';
        return tripDateMode === 'today' ? serviceDateKey === todayKey : serviceDateKey === tomorrowKey;
      });
    }

    return runtime.assignedTrips.filter(trip => !isInProgressTrip(trip.status)).filter(trip => {
      const serviceDateKey = normalizeServiceDateKey(trip.serviceDate);
      if (!serviceDateKey) return tripDateMode === 'today';
      return tripDateMode === 'today' ? serviceDateKey === todayKey : serviceDateKey === tomorrowKey;
    });
  }, [queueMode, runtime.assignedTrips, tripDateMode]);

  const workflow = focusTrip?.driverWorkflow || null;
  const hasRequiredSignature = signaturePoints.length >= 12;
  const hasExistingSignature = Boolean(String(focusTrip?.riderSignatureName || '').trim());
  const hasSignatureForAccept = hasRequiredSignature || hasExistingSignature;
  const hasAcceptedState = Boolean(focusTrip && (String(focusTrip.status || '').toLowerCase().includes('progress') || String(focusTrip.driverWorkflow?.status || '').toLowerCase() === 'accepted'));
  const canAcceptTrip = hasSignatureForAccept && !hasAcceptedState;
  const canMarkArrived = Boolean(focusTrip?.enRouteAt);
  const canCompleteTrip = Boolean(focusTrip?.arrivedAt) && hasRequiredSignature;
  const canStartTrip = hasAcceptedState;

  const clampPoint = (value: number, max: number) => Math.max(0, Math.min(max, value));

  const pushSignaturePoint = (x: number, y: number) => {
    const width = Math.max(1, signaturePadSize.width);
    const height = Math.max(1, signaturePadSize.height);
    const nextPoint = {
      x: clampPoint(x, width),
      y: clampPoint(y, height)
    };
    signaturePointsRef.current = [...signaturePointsRef.current, nextPoint].slice(-900);
    setSignaturePoints(signaturePointsRef.current);
  };

  const clearSignature = () => {
    signaturePointsRef.current = [];
    setSignaturePoints([]);
  };

  const signaturePanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: event => {
      pushSignaturePoint(event.nativeEvent.locationX, event.nativeEvent.locationY);
    },
    onPanResponderMove: event => {
      pushSignaturePoint(event.nativeEvent.locationX, event.nativeEvent.locationY);
    }
  }), [signaturePadSize.height, signaturePadSize.width]);

  useEffect(() => {
    clearSignature();
  }, [focusTrip?.id]);

  const renderSupportBadges = (trip?: DriverRuntime['activeTrip']) => {
    if (!trip || (!trip.hasServiceAnimal && !trip.mobilityType && !trip.assistLevel && !trip.isNextDayTrip)) return null;

    return <View style={styles.supportBadgeRow}>
        {trip.isNextDayTrip ? <View style={[styles.supportBadge, styles.supportBadgeNextDay]}>
            <Text style={styles.supportBadgeNextDayText}>Next day trip</Text>
          </View> : null}
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
          <Pressable style={[styles.queueChip, tripDateMode === 'today' ? styles.queueChipDate : null]} onPress={() => setTripDateMode('today')}>
            <Text style={[styles.queueChipDateText, tripDateMode !== 'today' ? styles.queueChipDateTextMuted : null]}>Today</Text>
          </Pressable>
          <Pressable style={[styles.queueChip, tripDateMode === 'next-day' ? styles.queueChipDate : null]} onPress={() => setTripDateMode('next-day')}>
            <Text style={[styles.queueChipDateText, tripDateMode !== 'next-day' ? styles.queueChipDateTextMuted : null]}>Next day</Text>
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
          <Text style={styles.selectedRouteText}>Selected Trip: {focusTrip?.rider || '--'}</Text>
        </View>
      </View>

      {runtime.isLoadingTrips ? <ActivityIndicator color={driverTheme.colors.primary} /> : null}
      {runtime.tripSyncError ? <Text style={driverSharedStyles.warningText}>{runtime.tripSyncError}</Text> : null}

      {listMode === 'routes' ? <>
          {filteredTrips.length === 0 ? <View style={driverSharedStyles.card}>
              <Text style={driverSharedStyles.emptyText}>No routes in this queue.</Text>
            </View> : filteredTrips.map(trip => <Pressable key={trip.id} onPress={() => {
            runtime.setActiveTrip(trip);
            setListMode('trips');
          }} style={[styles.routeCard, runtime.activeTrip?.id === trip.id ? styles.routeCardActive : null]}>
                <View style={styles.routeCardTop}>
                  <View style={styles.quickContactColumn}>
                    <Pressable style={styles.callBadge} onPress={() => void openPhoneCall(trip.patientPhoneNumber)}>
                      <Text style={styles.callBadgeText}>Call</Text>
                    </Pressable>
                    <Pressable style={styles.smsBadge} onPress={() => void sendOutsideSms(trip)}>
                      <Text style={styles.smsBadgeText}>SMS</Text>
                    </Pressable>
                  </View>
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
                  <Text style={styles.routeTimeText}>{getTripWindow(trip)}</Text>
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

          <View style={styles.routeRow}>
            <Text style={styles.routeText}>PU {focusTrip.address}</Text>
            {focusTrip.enRouteAt && !focusTrip.arrivedAt ? <Text style={styles.enRouteCheck}>✓ Going</Text> : null}
          </View>
          <Text style={styles.routeText}>DO {focusTrip.destination}</Text>

          <View style={styles.workflowCard}>
            <Text style={styles.workflowTitle}>Trip workflow</Text>
            <Text style={styles.workflowLine}>Accepted: {workflow?.acceptedTimeLabel || 'Pending'}</Text>
            <Text style={styles.workflowLine}>Departure: {workflow?.departureTimeLabel || 'Pending'}</Text>
            <Text style={styles.workflowLine}>Arrival: {workflow?.arrivalTimeLabel || 'Pending'}</Text>
            <Text style={styles.workflowLine}>Passenger signature: {focusTrip.riderSignatureName || 'Required before en route'}</Text>
            <Text style={styles.workflowLine}>Completion: {workflow?.completedTimeLabel || 'Pending'}</Text>
          </View>

          <View style={styles.signatureCard}>
            <View style={styles.signatureHeaderRow}>
              <Text style={styles.signatureLabel}>Passenger signature (draw on screen)</Text>
              <Pressable onPress={clearSignature}>
                <Text style={styles.signatureClearText}>Clear</Text>
              </Pressable>
            </View>
            <View
              style={styles.signaturePad}
              onLayout={event => {
                const { width, height } = event.nativeEvent.layout;
                setSignaturePadSize({ width: Math.max(1, width), height: Math.max(1, height) });
              }}
              {...signaturePanResponder.panHandlers}
            >
              {signaturePoints.slice(1).map((point, index) => {
              const previousPoint = signaturePoints[index];
              const dx = point.x - previousPoint.x;
              const dy = point.y - previousPoint.y;
              const segmentLength = Math.max(2, Math.hypot(dx, dy));
              const segmentAngle = Math.atan2(dy, dx) * 180 / Math.PI;
              return <View key={`${previousPoint.x}-${previousPoint.y}-${point.x}-${point.y}-${index}`} style={[styles.signatureStroke, {
                left: previousPoint.x,
                top: previousPoint.y,
                width: segmentLength,
                transform: [{
                  rotate: `${segmentAngle}deg`
                }]
              }]} />;
            })}
              {signaturePoints.length === 0 ? <Text style={styles.signatureHint}>Sign here with your finger</Text> : null}
            </View>
            {!hasSignatureForAccept ? <Text style={styles.signatureRequirementText}>Signature required before Accept.</Text> : null}
          </View>

          <View style={styles.actionRow}>
            <Pressable style={[driverSharedStyles.secondaryButton, !canAcceptTrip || runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void runtime.submitTripAction('accept', {
            riderSignatureName: hasRequiredSignature ? 'Signed on device' : String(focusTrip.riderSignatureName || '').trim() || 'Signed on device',
            riderSignatureData: hasRequiredSignature ? {
              points: signaturePoints,
              width: signaturePadSize.width,
              height: signaturePadSize.height
            } : undefined
          })} disabled={!canAcceptTrip || runtime.activeTripAction.length > 0}>
              <Text style={driverSharedStyles.secondaryButtonText}>{runtime.activeTripAction === 'accept' ? 'Sending...' : 'Accept'}</Text>
            </Pressable>
            <Pressable style={[driverSharedStyles.secondaryButton, !canMarkArrived || runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void runtime.submitTripAction('arrived')} disabled={!canMarkArrived || runtime.activeTripAction.length > 0}>
              <Text style={driverSharedStyles.secondaryButtonText}>{runtime.activeTripAction === 'arrived' ? 'Sending...' : 'Arrived'}</Text>
            </Pressable>
            <Pressable style={[driverSharedStyles.secondaryButton, styles.mapButton, !canStartTrip ? styles.actionDisabled : null]} onPress={async () => {
            if (!focusTrip) return;
            if (!focusTrip.enRouteAt) {
              const ok = await runtime.submitTripAction('en-route');
              if (!ok) return;
            }
            await openDirections();
          }} disabled={!canStartTrip || runtime.activeTripAction.length > 0}>
              <Text style={driverSharedStyles.secondaryButtonText}>{runtime.activeTripAction === 'en-route' ? 'Sending...' : 'Directions'}</Text>
            </Pressable>
            <Pressable style={[driverSharedStyles.primaryButton, !canCompleteTrip || runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void runtime.submitTripAction('complete', {
            riderSignatureName: 'Signed on device',
            riderSignatureData: {
              points: signaturePoints,
              width: signaturePadSize.width,
              height: signaturePadSize.height
            }
          })} disabled={!canCompleteTrip || runtime.activeTripAction.length > 0}>
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
  queueChipDateTextMuted: {
    color: '#2f4453'
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
  quickContactColumn: {
    gap: 6
  },
  callBadge: {
    width: 34,
    height: 34,
    borderRadius: driverTheme.radius.sm,
    backgroundColor: driverTheme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  smsBadge: {
    width: 34,
    height: 34,
    borderRadius: driverTheme.radius.sm,
    backgroundColor: '#0ea5a5',
    alignItems: 'center',
    justifyContent: 'center'
  },
  callBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800'
  },
  smsBadgeText: {
    color: '#ffffff',
    fontSize: 9,
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
  supportBadgeNextDay: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b'
  },
  supportBadgeText: {
    color: '#334a59',
    fontSize: 11,
    fontWeight: '700'
  },
  supportBadgeNextDayText: {
    color: '#92400e',
    fontSize: 11,
    fontWeight: '800'
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
    flex: 1,
    color: driverTheme.colors.text,
    lineHeight: 20
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  enRouteCheck: {
    color: '#0f766e',
    fontWeight: '800',
    fontSize: 12
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
  signatureCard: {
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    borderRadius: driverTheme.radius.sm,
    backgroundColor: '#ffffff',
    padding: 10,
    gap: 8
  },
  signatureHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  signatureLabel: {
    color: driverTheme.colors.text,
    fontWeight: '700',
    fontSize: 12
  },
  signatureClearText: {
    color: '#c2410c',
    fontWeight: '700',
    fontSize: 12
  },
  signaturePad: {
    height: 120,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    overflow: 'hidden'
  },
  signatureStroke: {
    position: 'absolute',
    height: 3,
    borderRadius: 2,
    backgroundColor: '#111827',
    transformOrigin: 'left center'
  },
  signatureDot: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#111827'
  },
  signatureHint: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600'
  },
  signatureRequirementText: {
    color: '#b45309',
    fontSize: 12,
    fontWeight: '700'
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
