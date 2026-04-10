import { ActivityIndicator, Alert, Image, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { driverSharedStyles, driverTheme } from './driverTheme';
import { getTripTone, getTripWindow } from './driverUtils';

type Props = {
  runtime: DriverRuntime;
};

type QueueMode = 'scheduled' | 'in-progress';

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

const parseScheduledPickup = (timeStr?: string | null): Date | null => {
  const text = String(timeStr || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
};

const parseScheduledDropoff = (timeStr?: string | null): Date | null => parseScheduledPickup(timeStr);

const getCleanTripReference = (trip: { rideId?: string; brokerTripId?: string; id?: string }) => {
  const candidate = String(trip.rideId || trip.brokerTripId || '').trim();
  if (!candidate) return '';
  if (/test\s*-\s*yanelis/i.test(candidate)) return '';
  return candidate;
};

export const DriverTripsSection = ({ runtime }: Props) => {
  const OUTSIDE_SMS_TEMPLATE = 'Hi this is Care Mobility. Your driver is outside waiting for you.';
  const [queueMode, setQueueMode] = useState<QueueMode>('scheduled');
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [destinationElapsedSecs, setDestinationElapsedSecs] = useState(0);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelPhotoDataUrl, setCancelPhotoDataUrl] = useState('');
  const [completionPhotoDataUrl, setCompletionPhotoDataUrl] = useState('');
  const lateAlertSentRef = useRef<string>('');

  const isClosedTrip = (status?: string) => {
    const normalized = String(status || '').toLowerCase();
    return normalized.includes('completed') || normalized.includes('cancelled') || normalized.includes('canceled');
  };

  const isInProgressTrip = (status?: string) => {
    const normalized = String(status || '').toLowerCase();
    return normalized.includes('en-route') || normalized.includes('arrived') || normalized.includes('progress') || normalized.includes('destination');
  };

  const openTrips = useMemo(() => runtime.assignedTrips.filter(trip => !isClosedTrip(trip.status)), [runtime.assignedTrips]);
  const focusTrip = openTrips.find(trip => trip.id === runtime.activeTrip?.id) || null;

  const filteredTrips = useMemo(() => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayKey = toDateKey(today);
    const tomorrowKey = toDateKey(tomorrow);
    const matchesDateFilter = (trip: (typeof openTrips)[number]) => {
      const serviceDateKey = normalizeServiceDateKey(trip.serviceDate);
      if (!serviceDateKey) return true;
      if (runtime.tripDateFilter === 'today') return serviceDateKey === todayKey;
      if (runtime.tripDateFilter === 'next-day') return serviceDateKey === tomorrowKey || Boolean(trip.isNextDayTrip);
      return serviceDateKey === todayKey || serviceDateKey === tomorrowKey || Boolean(trip.isNextDayTrip);
    };

    if (queueMode === 'in-progress') {
      return openTrips.filter(trip => isInProgressTrip(trip.status)).filter(matchesDateFilter);
    }

    return openTrips.filter(trip => !isInProgressTrip(trip.status)).filter(matchesDateFilter);
  }, [openTrips, queueMode, runtime.tripDateFilter]);

  const workflow = focusTrip?.driverWorkflow || null;
  const hasAcceptedState = Boolean(
    focusTrip && (
      Boolean(workflow?.acceptedAt)
      || String(workflow?.status || '').toLowerCase() === 'accepted'
      || String(focusTrip.status || '').toLowerCase().includes('progress')
    )
  );
  const hasStartedRouteToPickup = Boolean(focusTrip?.enRouteAt || workflow?.departureToPickupAt || workflow?.departureAt);
  const hasArrivedPickup = Boolean(focusTrip?.arrivedAt || workflow?.arrivedPickupAt || workflow?.arrivalAt);
  const hasPatientOnboard = Boolean(focusTrip?.patientOnboardAt || workflow?.patientOnboardAt || focusTrip?.actualPickup);
  const hasStartedTripToDestination = Boolean(focusTrip?.startTripAt || workflow?.startTripAt || workflow?.destinationDepartureAt);
  const hasArrivedDestination = Boolean(focusTrip?.arrivedDestinationAt || workflow?.arrivedDestinationAt || workflow?.destinationArrivalAt);

  const canAcceptTrip = !hasAcceptedState;
  const canStartRoute = hasAcceptedState && !hasStartedRouteToPickup;
  const canArrivePickup = hasStartedRouteToPickup && !hasArrivedPickup;
  const canMarkPatientOnboard = hasArrivedPickup && !hasPatientOnboard;
  const canStartTripToDestination = hasPatientOnboard && !hasStartedTripToDestination;
  const canArriveDestination = hasStartedTripToDestination && !hasArrivedDestination;
  const canCompleteTrip = hasArrivedDestination;

  const showAcceptAction = !hasAcceptedState;
  const showStartRouteAction = hasAcceptedState && !hasStartedRouteToPickup;
  const showArrivedPickupAction = hasStartedRouteToPickup && !hasArrivedPickup;
  const showPatientOnboardAction = hasArrivedPickup && !hasPatientOnboard;
  const showStartTripAction = hasPatientOnboard && !hasStartedTripToDestination;
  const showArrivedDestinationAction = hasStartedTripToDestination && !hasArrivedDestination;
  const showCompleteAction = hasArrivedDestination;
  const showDirectionsAction = hasStartedRouteToPickup && !Boolean(focusTrip?.completedAt || workflow?.completedAt);

  const routeStartedAt = hasStartedRouteToPickup && !hasArrivedPickup
    ? Number(workflow?.departureToPickupAt || workflow?.departureAt || focusTrip?.enRouteAt || 0)
    : 0;

  useEffect(() => {
    if (!routeStartedAt || !focusTrip) {
      setElapsedSecs(0);
      return;
    }

    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - routeStartedAt) / 1000);
      setElapsedSecs(secs);
      const scheduled = parseScheduledPickup(focusTrip.scheduledPickup);
      const lateKey = `${focusTrip.id}:${focusTrip.scheduledPickup || ''}`;
      if (scheduled && Date.now() > scheduled.getTime() && lateAlertSentRef.current !== lateKey) {
        lateAlertSentRef.current = lateKey;
        void runtime.sendPresetDriverAlert('delay');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [routeStartedAt, focusTrip?.id, focusTrip?.scheduledPickup]);

  const destinationStartedAt = hasStartedTripToDestination && !hasArrivedDestination
    ? Number(workflow?.startTripAt || workflow?.destinationDepartureAt || focusTrip?.startTripAt || 0)
    : 0;

  useEffect(() => {
    if (!destinationStartedAt || !focusTrip) {
      setDestinationElapsedSecs(0);
      return;
    }

    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - destinationStartedAt) / 1000);
      setDestinationElapsedSecs(secs);
    }, 1000);

    return () => clearInterval(interval);
  }, [destinationStartedAt, focusTrip?.id]);

  const elapsedLabel = routeStartedAt
    ? `${String(Math.floor(elapsedSecs / 60)).padStart(2, '0')}:${String(elapsedSecs % 60).padStart(2, '0')}`
    : null;
  const destinationElapsedLabel = destinationStartedAt
    ? `${String(Math.floor(destinationElapsedSecs / 60)).padStart(2, '0')}:${String(destinationElapsedSecs % 60).padStart(2, '0')}`
    : null;

  const scheduledPickupDate = parseScheduledPickup(focusTrip?.scheduledPickup);
  const isLateToPickup = Boolean(routeStartedAt && scheduledPickupDate && Date.now() > scheduledPickupDate.getTime());
  const scheduledDropoffDate = parseScheduledDropoff(focusTrip?.scheduledDropoff || focusTrip?.dropoff);
  const isLateToDestination = Boolean(destinationStartedAt && scheduledDropoffDate && Date.now() > scheduledDropoffDate.getTime());

  const openDirectionsToPickup = async (trip: NonNullable<typeof focusTrip>) => {
    const query = encodeURIComponent(trip.address || '');
    if (!query) return;
    await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${query}&travelmode=driving`);
  };

  const openDirections = async () => {
    if (!focusTrip) return;
    const headingToPickup = !focusTrip.patientOnboardAt && !focusTrip.actualPickup;
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

  const pickCancelPhoto = async () => {
    const openSettings = () => {
      Alert.alert(
        'Photo permission',
        'Please allow Photos/Camera access in app settings to continue.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open settings', onPress: () => void Linking.openSettings() }
        ]
      );
    };

    const pickFromCamera = async () => {
      try {
        const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
        if (cameraPermission.status !== 'granted') {
          openSettings();
          return;
        }
        const cameraResult = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.35,
          allowsEditing: true,
          base64: true
        });
        if (cameraResult.canceled || !cameraResult.assets?.[0]?.base64) return;
        setCancelPhotoDataUrl(`data:image/jpeg;base64,${cameraResult.assets[0].base64}`);
      } catch {
        openSettings();
      }
    };

    const pickFromGallery = async () => {
      try {
        const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (libraryPermission.status !== 'granted') {
          openSettings();
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.35,
          allowsEditing: true,
          base64: true
        });
        if (result.canceled || !result.assets?.[0]?.base64) return;
        setCancelPhotoDataUrl(`data:image/jpeg;base64,${result.assets[0].base64}`);
      } catch {
        openSettings();
      }
    };

    Alert.alert(
      'Attach cancellation photo',
      'Choose where to get the photo.',
      [
        { text: 'Take photo', onPress: () => void pickFromCamera() },
        { text: 'Choose from gallery', onPress: () => void pickFromGallery() },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const submitCancelTrip = async () => {
    if (!cancelReason.trim()) {
      Alert.alert('Cancellation', 'Write why the rider cancelled.');
      return;
    }
    if (!cancelPhotoDataUrl) {
      Alert.alert('Cancellation', 'Attach a photo before cancelling.');
      return;
    }
    const ok = await runtime.submitTripAction('cancel', {
      cancellationReason: cancelReason.trim(),
      cancellationPhotoDataUrl: cancelPhotoDataUrl
    });
    if (ok) {
      setCancelReason('');
      setCancelPhotoDataUrl('');
    }
  };

  const pickCompletionPhoto = async () => {
    const openSettings = () => {
      Alert.alert(
        'Photo permission',
        'Please allow Photos/Camera access in app settings to continue.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open settings', onPress: () => void Linking.openSettings() }
        ]
      );
    };

    const pickFromCamera = async () => {
      try {
        const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
        if (cameraPermission.status !== 'granted') {
          openSettings();
          return;
        }
        const cameraResult = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.3,
          allowsEditing: true,
          aspect: [1, 1],
          base64: true
        });
        if (cameraResult.canceled || !cameraResult.assets?.[0]?.base64) return;
        setCompletionPhotoDataUrl(`data:image/jpeg;base64,${cameraResult.assets[0].base64}`);
      } catch {
        openSettings();
      }
    };

    const pickFromGallery = async () => {
      try {
        const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (libraryPermission.status !== 'granted') {
          openSettings();
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.3,
          allowsEditing: true,
          aspect: [1, 1],
          base64: true
        });
        if (result.canceled || !result.assets?.[0]?.base64) return;
        setCompletionPhotoDataUrl(`data:image/jpeg;base64,${result.assets[0].base64}`);
      } catch {
        openSettings();
      }
    };

    Alert.alert(
      'Attach completion photo',
      'Choose where to get the photo.',
      [
        { text: 'Take photo', onPress: () => void pickFromCamera() },
        { text: 'Choose from gallery', onPress: () => void pickFromGallery() },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const submitCompleteTrip = async () => {
    if (!completionPhotoDataUrl) {
      Alert.alert('Complete trip', 'Take a photo before closing the trip.');
      return;
    }
    const ok = await runtime.submitTripAction('complete', {
      completionPhotoDataUrl
    });
    if (ok) {
      setCompletionPhotoDataUrl('');
    }
  };

  const renderSupportBadges = (trip?: DriverRuntime['activeTrip']) => {
    if (!trip) return null;
    const wheelText = `${trip.mobilityType || ''} ${trip.vehicleType || ''} ${trip.subMobilityType || ''} ${trip.notes || ''}`.toLowerCase();
    const hasWheelchair = /wheel/.test(wheelText);
    const isXL = Boolean(trip.wheelChairIsXL) || /(\bxl\b|extra\s*large)/.test(wheelText);
    const isFoldable = Boolean(trip.wheelChairFoldable) || /(fold|foldable)/.test(wheelText);
    const confirmed = String(trip.confirmationStatus || '').toLowerCase().includes('confirm');

    return <View style={styles.supportBadgeRow}>
        <View style={styles.supportBadge}>
          <Text style={styles.supportBadgeText}>Animal: {trip.hasServiceAnimal ? 'Yes' : 'No'}</Text>
        </View>
        <View style={styles.supportBadge}>
          <Text style={styles.supportBadgeText}>Wheelchair: {hasWheelchair ? 'Yes' : 'No'}</Text>
        </View>
        <View style={styles.supportBadge}>
          <Text style={styles.supportBadgeText}>XL: {isXL ? 'Yes' : 'No'}</Text>
        </View>
        <View style={styles.supportBadge}>
          <Text style={styles.supportBadgeText}>Foldable: {isFoldable ? 'Yes' : 'No'}</Text>
        </View>
        <View style={styles.supportBadge}>
          <Text style={styles.supportBadgeText}>Confirmed: {confirmed ? 'Yes' : (trip.confirmationStatus || 'No')}</Text>
        </View>
        {trip.isNextDayTrip ? <View style={[styles.supportBadge, styles.supportBadgeNextDay]}>
            <Text style={styles.supportBadgeNextDayText}>Next day trip</Text>
          </View> : null}
      </View>;
  };

  const handleTripCardPress = (trip: typeof openTrips[number]) => {
    const tripStatus = String(trip.status || '').toLowerCase();
    const tripHasAccepted = Boolean(
      trip.driverWorkflow?.acceptedAt
      || tripStatus.includes('progress')
      || tripStatus === 'accepted'
      || tripStatus.includes('route')
      || tripStatus.includes('arrived')
    );
    if (!tripHasAccepted) {
      Alert.alert(
        'Accept trip?',
        `${trip.rider || 'Patient'}\n${trip.address || ''}${trip.scheduledPickup ? `\nPickup: ${trip.scheduledPickup}` : ''}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Accept',
            onPress: () => {
              runtime.setActiveTrip(trip);
              void runtime.submitTripAction('accept', { tripId: trip.id });
              setQueueMode('in-progress');
            }
          }
        ]
      );
      return;
    }
    runtime.setActiveTrip(trip);
  };

  return <View style={styles.screen}>
      <View style={styles.routeShell}>
        <View style={styles.queueHeaderRow}>
          <Pressable style={[styles.queueChip, queueMode === 'scheduled' ? styles.queueChipActive : null]} onPress={() => setQueueMode('scheduled')}>
            <Text style={[styles.queueChipText, queueMode === 'scheduled' ? styles.queueChipTextActive : null]}>Scheduled</Text>
          </Pressable>
          <Pressable style={[styles.queueChip, queueMode === 'in-progress' ? styles.queueChipActive : null]} onPress={() => setQueueMode('in-progress')}>
            <Text style={[styles.queueChipText, queueMode === 'in-progress' ? styles.queueChipTextActive : null]}>In Progress</Text>
          </Pressable>
        </View>
      </View>

      {runtime.isLoadingTrips && runtime.assignedTrips.length === 0 ? <ActivityIndicator color={driverTheme.colors.primary} /> : null}
      {runtime.tripSyncError ? <Text style={driverSharedStyles.warningText}>{runtime.tripSyncError}</Text> : null}

      {filteredTrips.length === 0 ? <View style={driverSharedStyles.card}>
          <Text style={driverSharedStyles.emptyText}>No trips in this queue.</Text>
        </View> : filteredTrips.map(trip => <Pressable key={trip.id} onPress={() => handleTripCardPress(trip)} style={[styles.routeCard, runtime.activeTrip?.id === trip.id ? styles.routeCardActive : null]}>
              <View style={styles.routeCardTop}>
                <View style={styles.routeTopHeaderRow}>
                  <View style={styles.routeTopCopy}>
                    <Text style={styles.routeIdText}>Patient: {trip.rider || 'Patient'}</Text>
                    <Text style={styles.routeAddressText} numberOfLines={1}>{trip.address}</Text>
                    <Text style={styles.routeAddressSubText} numberOfLines={1}>{trip.destination}</Text>
                  </View>
                  <View style={styles.routeTopMeta}>
                    <Text style={styles.routeTopMetaText}>{trip.miles ? `${trip.miles} mi` : '--'}</Text>
                    <Text style={styles.routeTopMetaText}>{trip.vehicleType || 'Route'}</Text>
                  </View>
                </View>
                {renderSupportBadges(trip)}
              </View>

              <View style={styles.routeCardBottom}>
                <View style={styles.routeBottomLeft}>
                  <View style={styles.quickContactRow}>
                    <Pressable style={styles.callBadge} onPress={() => void openPhoneCall(trip.patientPhoneNumber)}>
                      <Text style={styles.callBadgeText}>Call</Text>
                    </Pressable>
                    <Pressable style={styles.smsBadge} onPress={() => void sendOutsideSms(trip)}>
                      <Text style={styles.smsBadgeText}>SMS</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.routeTimeColumn}>
                  <Text style={styles.routeTimeText}>{getTripWindow(trip)}</Text>
                  <Text style={styles.routeRiderText}>{trip.rider || 'Florida Mobility Group Service'}</Text>
                </View>
                <Text style={styles.routeStatusText}>{trip.punctualityLabel || trip.status || 'Assigned'}</Text>
              </View>
            </Pressable>)}

      {focusTrip ? <View style={driverSharedStyles.card}>
          <View style={driverSharedStyles.rowBetween}>
            <View style={styles.copyBlock}>
              <Text style={driverSharedStyles.eyebrow}>Current trip</Text>
              <Text style={styles.focusTitle}>{focusTrip.rider}</Text>
              <Text style={styles.focusMeta}>{getCleanTripReference(focusTrip) ? `${getCleanTripReference(focusTrip)} | ` : ''}{getTripWindow(focusTrip)}</Text>
              <View style={styles.focusDirectionsBlock}>
                <View style={styles.routeRow}>
                  <Text style={styles.routeText}>PU {focusTrip.address}</Text>
                  {hasStartedRouteToPickup && !hasArrivedPickup ? <Text style={styles.enRouteCheck}>Going to pickup</Text> : null}
                </View>
                <Text style={styles.routeText}>DO {focusTrip.destination}</Text>
              </View>
            </View>
            <View style={[driverSharedStyles.pill, { backgroundColor: getTripTone(focusTrip.punctualityVariant) }]}>
              <Text style={driverSharedStyles.pillText}>{focusTrip.punctualityLabel || focusTrip.status || 'Pending'}</Text>
            </View>
          </View>

          <View style={styles.focusRequirementsRow}>
            <View style={styles.focusRequirementsLeft}>
              {renderSupportBadges(focusTrip)}
            </View>
            <View style={styles.focusRequirementsRight}>
              <Text style={styles.focusRequirementsRightValue}>{focusTrip.miles ? `${focusTrip.miles} mi` : '--'}</Text>
              <Text style={styles.focusRequirementsRightSub}>{focusTrip.vehicleType || 'Vehicle'}</Text>
            </View>
          </View>

          {focusTrip.notes ? <Text style={styles.noteText}>Notes: {focusTrip.notes}</Text> : null}

          {elapsedLabel ? <View style={[styles.timerBanner, isLateToPickup ? styles.timerBannerLate : styles.timerBannerOk]}>
              <Text style={styles.timerLabel}>{isLateToPickup ? 'LATE - En route' : 'En route to pickup'}</Text>
              <Text style={styles.timerValue}>{elapsedLabel}</Text>
              {isLateToPickup && focusTrip.scheduledPickup ? <Text style={styles.timerSub}>Pickup was at {focusTrip.scheduledPickup}. Alert sent to dispatcher.</Text> : null}
            </View> : null}

          {destinationElapsedLabel ? <View style={[styles.timerBanner, isLateToDestination ? styles.timerBannerLate : styles.timerBannerOk]}>
              <Text style={styles.timerLabel}>{isLateToDestination ? 'LATE - To destination' : 'To destination'}</Text>
              <Text style={styles.timerValue}>{destinationElapsedLabel}</Text>
              {focusTrip.scheduledDropoff ? <Text style={styles.timerSubNeutral}>Dropoff target: {focusTrip.scheduledDropoff}</Text> : null}
              {isLateToDestination && focusTrip.scheduledDropoff ? <Text style={styles.timerSub}>Destination is running late.</Text> : null}
            </View> : null}

          <View style={styles.workflowCard}>
            <Text style={styles.workflowTitle}>Trip workflow</Text>
            <Text style={styles.workflowLine}>Accepted: {workflow?.acceptedTimeLabel || 'Pending'}</Text>
            <Text style={styles.workflowLine}>Start route: {workflow?.departureToPickupTimeLabel || workflow?.departureTimeLabel || 'Pending'}</Text>
            <Text style={styles.workflowLine}>Arrived pickup: {workflow?.arrivedPickupTimeLabel || workflow?.arrivalTimeLabel || 'Pending'}</Text>
            <Text style={styles.workflowLine}>Patient onboard: {workflow?.patientOnboardTimeLabel || focusTrip.actualPickup || 'Pending'}</Text>
            <Text style={styles.workflowLine}>Start trip: {workflow?.startTripTimeLabel || workflow?.destinationDepartureTimeLabel || 'Pending'}</Text>
            <Text style={styles.workflowLine}>Arrived destination: {workflow?.arrivedDestinationTimeLabel || workflow?.destinationArrivalTimeLabel || 'Pending'}</Text>
            <Text style={styles.workflowLine}>Completion: {workflow?.completedTimeLabel || 'Pending'}</Text>
          </View>

          <View style={styles.actionRow}>
            {showAcceptAction ? <Pressable style={[driverSharedStyles.secondaryButton, !canAcceptTrip || runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void runtime.submitTripAction('accept')} disabled={!canAcceptTrip || runtime.activeTripAction.length > 0}>
                <Text style={driverSharedStyles.secondaryButtonText}>{runtime.activeTripAction === 'accept' ? 'Sending...' : 'Accept'}</Text>
              </Pressable> : null}

            {showStartRouteAction ? <Pressable style={[driverSharedStyles.secondaryButton, !canStartRoute || runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => {
                void runtime.submitTripAction('en-route');
                void openDirectionsToPickup(focusTrip);
              }} disabled={!canStartRoute || runtime.activeTripAction.length > 0}>
                <Text style={driverSharedStyles.secondaryButtonText}>{runtime.activeTripAction === 'en-route' ? 'Sending...' : 'Start Route'}</Text>
              </Pressable> : null}

            {showArrivedPickupAction ? <Pressable style={[driverSharedStyles.secondaryButton, !canArrivePickup || runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void runtime.submitTripAction('arrived')} disabled={!canArrivePickup || runtime.activeTripAction.length > 0}>
                <Text style={driverSharedStyles.secondaryButtonText}>{runtime.activeTripAction === 'arrived' ? 'Sending...' : 'Arrived Pickup'}</Text>
              </Pressable> : null}

            {showPatientOnboardAction ? <Pressable style={[driverSharedStyles.secondaryButton, !canMarkPatientOnboard || runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void runtime.submitTripAction('patient-onboard')} disabled={!canMarkPatientOnboard || runtime.activeTripAction.length > 0}>
                <Text style={driverSharedStyles.secondaryButtonText}>{runtime.activeTripAction === 'patient-onboard' ? 'Sending...' : 'Patient Onboard'}</Text>
              </Pressable> : null}

            {showStartTripAction ? <Pressable style={[driverSharedStyles.secondaryButton, !canStartTripToDestination || runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void runtime.submitTripAction('start-trip')} disabled={!canStartTripToDestination || runtime.activeTripAction.length > 0}>
                <Text style={driverSharedStyles.secondaryButtonText}>{runtime.activeTripAction === 'start-trip' ? 'Sending...' : 'Start Trip'}</Text>
              </Pressable> : null}

            {showArrivedDestinationAction ? <Pressable style={[driverSharedStyles.secondaryButton, !canArriveDestination || runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void runtime.submitTripAction('arrived-destination')} disabled={!canArriveDestination || runtime.activeTripAction.length > 0}>
                <Text style={driverSharedStyles.secondaryButtonText}>{runtime.activeTripAction === 'arrived-destination' ? 'Sending...' : 'Arrived Destination'}</Text>
              </Pressable> : null}

            {showDirectionsAction ? <Pressable style={[driverSharedStyles.secondaryButton, styles.mapButton, runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void openDirections()} disabled={runtime.activeTripAction.length > 0}>
                <Text style={driverSharedStyles.secondaryButtonText}>Directions</Text>
              </Pressable> : null}

            {showCompleteAction ? <Pressable style={[driverSharedStyles.primaryButton, !canCompleteTrip || runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void submitCompleteTrip()} disabled={!canCompleteTrip || runtime.activeTripAction.length > 0}>
                <Text style={driverSharedStyles.primaryButtonText}>{runtime.activeTripAction === 'complete' ? 'Sending...' : 'Complete'}</Text>
              </Pressable> : null}
          </View>

          {showCompleteAction ? <View style={styles.completePhotoCard}>
              <Text style={styles.completePhotoTitle}>Completion photo required</Text>
              <Text style={styles.completePhotoBody}>This closes only after attaching a low-quality photo.</Text>
              {completionPhotoDataUrl ? <Image source={{ uri: completionPhotoDataUrl }} style={styles.cancelPhotoPreview} resizeMode="cover" /> : null}
              <Pressable style={[styles.cancelAttachButton, runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void pickCompletionPhoto()} disabled={runtime.activeTripAction.length > 0}>
                <Text style={styles.cancelAttachButtonText}>{completionPhotoDataUrl ? 'Change Photo' : 'Add Completion Photo'}</Text>
              </Pressable>
            </View> : null}

          {hasArrivedPickup && !hasPatientOnboard && !hasStartedTripToDestination ? <View style={styles.cancelCard}>
              <Text style={styles.cancelTitle}>Cancel trip (rider no-show / rider refused)</Text>
              <TextInput value={cancelReason} onChangeText={setCancelReason} placeholder="Reason for cancellation" placeholderTextColor="#6b7280" multiline style={styles.cancelInput} />
              {cancelPhotoDataUrl ? <Image source={{ uri: cancelPhotoDataUrl }} style={styles.cancelPhotoPreview} resizeMode="cover" /> : null}
              <View style={styles.cancelButtonsRow}>
                <Pressable style={[styles.cancelAttachButton, runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void pickCancelPhoto()} disabled={runtime.activeTripAction.length > 0}>
                  <Text style={styles.cancelAttachButtonText}>{cancelPhotoDataUrl ? 'Change Photo' : 'Add Photo'}</Text>
                </Pressable>
                <Pressable style={[styles.cancelSubmitButton, runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void submitCancelTrip()} disabled={runtime.activeTripAction.length > 0}>
                  <Text style={styles.cancelSubmitButtonText}>{runtime.activeTripAction === 'cancel' ? 'Sending...' : 'Cancel Trip'}</Text>
                </Pressable>
              </View>
            </View> : null}

          {runtime.tripActionError ? <Text style={driverSharedStyles.warningText}>{runtime.tripActionError}</Text> : null}
        </View> : null}
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
    gap: 8,
    flexWrap: 'wrap'
  },
  queueChip: {
    borderRadius: driverTheme.radius.sm,
    borderWidth: 1,
    borderColor: '#b6ddd3',
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#eefaf6'
  },
  queueChipActive: {
    backgroundColor: driverTheme.colors.primary,
    borderColor: driverTheme.colors.primary
  },
  queueChipText: {
    color: '#1f4d41',
    fontSize: 12,
    fontWeight: '700'
  },
  queueChipTextActive: {
    color: '#ffffff'
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
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 6,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    flexDirection: 'column',
    width: '100%'
  },
  routeTopHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
    justifyContent: 'space-between'
  },
  routeTopCopy: {
    flex: 1,
    gap: 10
  },
  quickContactColumn: {
    gap: 6
  },
  quickContactRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6
  },
  callBadge: {
    width: 34,
    height: 34,
    borderRadius: driverTheme.radius.sm,
    backgroundColor: '#2f855a',
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
    minWidth: 86
  },
  routeTimeColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start'
  },
  routeServiceText: {
    color: '#1f2f3b',
    fontSize: 12,
    fontWeight: '700'
  },
  routeRiderText: {
    color: '#2f4252',
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center'
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
  focusDirectionsBlock: {
    gap: 4,
    marginTop: 6
  },
  focusRequirementsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10
  },
  focusRequirementsLeft: {
    flex: 1,
    maxWidth: '76%'
  },
  focusRequirementsRight: {
    minWidth: 72,
    alignItems: 'flex-end',
    paddingTop: 4,
    gap: 2
  },
  focusRequirementsRightValue: {
    color: driverTheme.colors.text,
    fontSize: 14,
    fontWeight: '800'
  },
  focusRequirementsRightSub: {
    color: driverTheme.colors.text,
    fontSize: 12,
    fontWeight: '700'
  },
  routeText: {
    flex: 1,
    color: driverTheme.colors.text,
    lineHeight: 20
  },
  noteText: {
    color: driverTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18
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
  actionDisabled: {
    opacity: 0.65
  },
  timerBanner: {
    borderRadius: driverTheme.radius.md,
    padding: 12,
    gap: 2
  },
  timerBannerOk: {
    backgroundColor: '#d1fae5',
    borderWidth: 1,
    borderColor: '#6ee7b7'
  },
  timerBannerLate: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5'
  },
  timerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151'
  },
  timerValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#111827',
    fontVariant: ['tabular-nums']
  },
  timerSub: {
    fontSize: 11,
    color: '#b91c1c',
    fontWeight: '700'
  },
  timerSubNeutral: {
    fontSize: 11,
    color: '#374151',
    fontWeight: '700'
  },
  completePhotoCard: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: driverTheme.radius.md,
    padding: 12,
    gap: 10
  },
  completePhotoTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  completePhotoBody: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 18
  },
  cancelCard: {
    marginTop: 8,
    backgroundColor: '#fff7f7',
    borderColor: '#f8b4b4',
    borderWidth: 1,
    borderRadius: driverTheme.radius.md,
    padding: 10,
    gap: 8
  },
  cancelTitle: {
    color: '#7f1d1d',
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase'
  },
  cancelInput: {
    minHeight: 70,
    borderRadius: driverTheme.radius.sm,
    borderColor: '#f1b9b9',
    borderWidth: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: driverTheme.colors.text,
    textAlignVertical: 'top'
  },
  cancelPhotoPreview: {
    width: '100%',
    height: 150,
    borderRadius: driverTheme.radius.sm,
    borderWidth: 1,
    borderColor: '#f1b9b9'
  },
  cancelButtonsRow: {
    flexDirection: 'row',
    gap: 8
  },
  cancelAttachButton: {
    flex: 1,
    borderRadius: driverTheme.radius.sm,
    borderWidth: 1,
    borderColor: '#f1b9b9',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    alignItems: 'center'
  },
  cancelAttachButtonText: {
    color: '#7f1d1d',
    fontWeight: '800'
  },
  cancelSubmitButton: {
    flex: 1,
    borderRadius: driverTheme.radius.sm,
    backgroundColor: '#b91c1c',
    paddingVertical: 10,
    alignItems: 'center'
  },
  cancelSubmitButtonText: {
    color: '#ffffff',
    fontWeight: '800'
  }
});
