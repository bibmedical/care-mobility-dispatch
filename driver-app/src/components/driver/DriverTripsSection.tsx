import { ActivityIndicator, Alert, Image, Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { driverSharedStyles, driverTheme } from './driverTheme';
import { getTripTone, getTripWindow } from './driverUtils';
import { compressImageToJpegDataUrl } from '../../utils/imageCompression';

type Props = {
  runtime: DriverRuntime;
};

type QueueMode = 'scheduled' | 'in-progress';
type CancelComposerMode = 'quick' | 'full';

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

const getTripPatientPhone = (trip?: DriverRuntime['activeTrip'] | null) => {
  if (!trip) return '';
  return String(
    trip.patientPhoneNumber
    || trip.patientPhone
    || trip.phone
    || trip.phoneNumber
    || trip.memberPhone
    || trip.mobile
    || trip.riderPhone
    || ''
  ).trim();
};

const formatActionPhone = (phoneNumber?: string) => {
  const digits = String(phoneNumber || '').replace(/\D+/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return String(phoneNumber || '').trim();
};

export const DriverTripsSection = ({ runtime }: Props) => {
  const OUTSIDE_SMS_TEMPLATE = 'Hi this is Care Mobility. Your driver is outside waiting for you.';
  const isAndroidDevice = Platform.OS === 'android';
  const hasPersistedInProgressTrip = runtime.assignedTrips.some(trip => {
    const normalized = String(trip.status || '').toLowerCase();
    return normalized.includes('en-route') || normalized.includes('arrived') || normalized.includes('progress') || normalized.includes('destination');
  });
  const [queueMode, setQueueMode] = useState<QueueMode>(() => hasPersistedInProgressTrip ? 'in-progress' : 'scheduled');
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [showCancelComposer, setShowCancelComposer] = useState(false);
  const [cancelComposerMode, setCancelComposerMode] = useState<CancelComposerMode>('full');
  const [cancelTargetTrip, setCancelTargetTrip] = useState<DriverRuntime['activeTrip'] | null>(null);
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
  const isDriverLockedIntoTrip = (trip?: typeof openTrips[number] | null) => {
    if (!trip) return false;
    const normalizedStatus = String(trip.status || '').toLowerCase();
    return Boolean(
      trip.driverWorkflow?.acceptedAt
      || trip.enRouteAt
      || trip.arrivedAt
      || trip.patientOnboardAt
      || trip.startTripAt
      || trip.arrivedDestinationAt
      || normalizedStatus === 'accepted'
      || normalizedStatus.includes('progress')
      || normalizedStatus.includes('route')
      || normalizedStatus.includes('arrived')
    );
  };
  const blockingTrip = useMemo(() => openTrips.find(trip => isDriverLockedIntoTrip(trip)) || null, [openTrips]);
  const inProgressFocusTrip = useMemo(() => {
    if (focusTrip && isInProgressTrip(focusTrip.status)) {
      return focusTrip;
    }
    return openTrips.find(trip => isInProgressTrip(trip.status)) || null;
  }, [focusTrip, openTrips]);

  useEffect(() => {
    const interval = setInterval(() => {
      setClockNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setCancelReason('');
    setCancelPhotoDataUrl('');
  }, [focusTrip?.id]);

  const closeCancelComposer = () => {
    setShowCancelComposer(false);
    setCancelComposerMode('full');
    setCancelTargetTrip(null);
    setCancelReason('');
    setCancelPhotoDataUrl('');
  };

  const openCancelComposer = (trip?: typeof openTrips[number] | null, mode: CancelComposerMode = 'full') => {
    const targetTrip = trip || displayedFocusTrip || runtime.activeTrip || null;
    if (!targetTrip) return;
    if (trip && mode === 'full') {
      runtime.setActiveTrip(trip);
    }
    setCancelComposerMode(mode);
    setCancelTargetTrip(targetTrip);
    setCancelReason('');
    setCancelPhotoDataUrl('');
    setShowCancelComposer(true);
  };

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

  const displayedScheduledTrips = queueMode === 'scheduled' ? filteredTrips : [];
  const displayedFocusTrip = queueMode === 'in-progress' ? inProgressFocusTrip : null;

  const workflow = displayedFocusTrip?.driverWorkflow || null;
  const hasAcceptedState = Boolean(
    displayedFocusTrip && (
      Boolean(workflow?.acceptedAt)
      || String(workflow?.status || '').toLowerCase() === 'accepted'
      || String(displayedFocusTrip.status || '').toLowerCase().includes('progress')
    )
  );
  const hasStartedRouteToPickup = Boolean(displayedFocusTrip?.enRouteAt || workflow?.departureToPickupAt || workflow?.departureAt);
  const hasArrivedPickup = Boolean(displayedFocusTrip?.arrivedAt || workflow?.arrivedPickupAt || workflow?.arrivalAt);
  const hasPatientOnboard = Boolean(displayedFocusTrip?.patientOnboardAt || workflow?.patientOnboardAt || displayedFocusTrip?.actualPickup);
  const hasStartedTripToDestination = Boolean(displayedFocusTrip?.startTripAt || workflow?.startTripAt || workflow?.destinationDepartureAt);
  const hasArrivedDestination = Boolean(displayedFocusTrip?.arrivedDestinationAt || workflow?.arrivedDestinationAt || workflow?.destinationArrivalAt);

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
    ? Number(workflow?.departureToPickupAt || workflow?.departureAt || displayedFocusTrip?.enRouteAt || 0)
    : 0;

  const destinationStartedAt = hasStartedTripToDestination && !hasArrivedDestination
    ? Number(workflow?.startTripAt || workflow?.destinationDepartureAt || displayedFocusTrip?.startTripAt || 0)
    : 0;

  const elapsedSecs = routeStartedAt
    ? Math.max(0, Math.floor((clockNow - routeStartedAt) / 1000))
    : 0;

  const destinationElapsedSecs = destinationStartedAt
    ? Math.max(0, Math.floor((clockNow - destinationStartedAt) / 1000))
    : 0;

  useEffect(() => {
    if (!routeStartedAt || !displayedFocusTrip) return;

    const interval = setInterval(() => {
      const scheduled = parseScheduledPickup(displayedFocusTrip.scheduledPickup);
      const lateKey = `${displayedFocusTrip.id}:${displayedFocusTrip.scheduledPickup || ''}`;
      if (scheduled && Date.now() > scheduled.getTime() && lateAlertSentRef.current !== lateKey) {
        lateAlertSentRef.current = lateKey;
        void runtime.sendPresetDriverAlert('delay');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [routeStartedAt, displayedFocusTrip?.id, displayedFocusTrip?.scheduledPickup]);

  const elapsedLabel = routeStartedAt
    ? `${String(Math.floor(elapsedSecs / 60)).padStart(2, '0')}:${String(elapsedSecs % 60).padStart(2, '0')}`
    : null;
  const destinationElapsedLabel = destinationStartedAt
    ? `${String(Math.floor(destinationElapsedSecs / 60)).padStart(2, '0')}:${String(destinationElapsedSecs % 60).padStart(2, '0')}`
    : null;

  const scheduledPickupDate = parseScheduledPickup(displayedFocusTrip?.scheduledPickup);
  const isLateToPickup = Boolean(routeStartedAt && scheduledPickupDate && clockNow > scheduledPickupDate.getTime());
  const scheduledDropoffDate = parseScheduledDropoff(displayedFocusTrip?.scheduledDropoff || displayedFocusTrip?.dropoff);
  const isLateToDestination = Boolean(destinationStartedAt && scheduledDropoffDate && clockNow > scheduledDropoffDate.getTime());
  const driverNotes = String(displayedFocusTrip?.notes || '').trim();
  const providerNotes = String(displayedFocusTrip?.providerNotes || '').trim();
  const showDispatcherNotesCard = Boolean(driverNotes);
  const showPickupTimeChange = Boolean(displayedFocusTrip?.hasPickupTimeOverride && displayedFocusTrip?.providerScheduledPickup && displayedFocusTrip?.scheduledPickup);
  const showDropoffTimeChange = Boolean(displayedFocusTrip?.hasDropoffTimeOverride && displayedFocusTrip?.providerScheduledDropoff && displayedFocusTrip?.scheduledDropoff);

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
    const digits = getTripPatientPhone(trip).replace(/\D+/g, '');
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
          quality: 0.6,
          allowsEditing: true,
        });
        if (cameraResult.canceled || !cameraResult.assets?.[0]?.uri) return;
        const compressedDataUrl = await compressImageToJpegDataUrl(cameraResult.assets[0].uri, {
          maxSide: 1080,
          initialQuality: 0.44,
          maxApproxBytes: 280_000
        });
        setCancelPhotoDataUrl(compressedDataUrl);
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
          quality: 0.6,
          allowsEditing: true,
        });
        if (result.canceled || !result.assets?.[0]?.uri) return;
        const compressedDataUrl = await compressImageToJpegDataUrl(result.assets[0].uri, {
          maxSide: 1080,
          initialQuality: 0.44,
          maxApproxBytes: 280_000
        });
        setCancelPhotoDataUrl(compressedDataUrl);
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
    if (!cancelTargetTrip?.id) {
      Alert.alert('Cancellation', 'No trip selected for cancellation.');
      return;
    }
    const confirmed = await new Promise<boolean>(resolve => {
      Alert.alert('Submit cancellation', `Reason: ${cancelReason.trim()}`, [
        { text: 'Back', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Submit', onPress: () => resolve(true) }
      ]);
    });
    if (!confirmed) return;

    const ok = await runtime.submitTripAction('cancel', {
      tripId: cancelTargetTrip.id,
      cancellationReason: cancelReason.trim(),
      cancellationPhotoDataUrl: cancelComposerMode === 'full' ? cancelPhotoDataUrl || undefined : undefined
    });
    if (ok) {
      closeCancelComposer();
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
          quality: 0.6,
          allowsEditing: true,
          aspect: [1, 1],
        });
        if (cameraResult.canceled || !cameraResult.assets?.[0]?.uri) return;
        const compressedDataUrl = await compressImageToJpegDataUrl(cameraResult.assets[0].uri, {
          maxSide: 1080,
          initialQuality: 0.42,
          maxApproxBytes: 280_000
        });
        setCompletionPhotoDataUrl(compressedDataUrl);
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
          quality: 0.6,
          allowsEditing: true,
          aspect: [1, 1],
        });
        if (result.canceled || !result.assets?.[0]?.uri) return;
        const compressedDataUrl = await compressImageToJpegDataUrl(result.assets[0].uri, {
          maxSide: 1080,
          initialQuality: 0.42,
          maxApproxBytes: 280_000
        });
        setCompletionPhotoDataUrl(compressedDataUrl);
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
    const isWillCall = Boolean(trip.isWillCall) || String(trip.status || '').trim().toLowerCase() === 'willcall';

    return <View style={styles.supportBadgeRow}>
        {isWillCall ? <View style={[styles.supportBadge, styles.supportBadgeWillCall]}>
            <Text style={styles.supportBadgeWillCallText}>WILLCALL</Text>
          </View> : null}
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
    const hasOtherBlockingTrip = blockingTrip && String(blockingTrip.id || '').trim() !== String(trip.id || '').trim();
    if (!tripHasAccepted) {
      if (hasOtherBlockingTrip) {
        Alert.alert(
          'Finish current trip first',
          `${blockingTrip.rider || 'The current patient'} is still active. Complete or cancel that trip before accepting another one.`
        );
        return;
      }

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
        {isAndroidDevice ? <View style={styles.androidPatchBanner}>
            <Text style={styles.androidPatchBannerText}>Android local patch active: Cancel + queued send + GPS checks</Text>
          </View> : null}
      </View>

      {runtime.isLoadingTrips && runtime.assignedTrips.length === 0 ? <ActivityIndicator color={driverTheme.colors.primary} /> : null}
      {runtime.tripSyncError ? <View style={styles.syncErrorCard}>
          <Text style={driverSharedStyles.warningText}>{runtime.tripSyncError}</Text>
          <Pressable style={styles.syncRetryButton} onPress={() => void runtime.reloadTrips()}>
            <Text style={styles.syncRetryButtonText}>Retry trips</Text>
          </Pressable>
        </View> : null}

      {queueMode === 'scheduled' && filteredTrips.length === 0 ? <View style={driverSharedStyles.card}>
          <Text style={driverSharedStyles.emptyText}>No trips in this queue.</Text>
        </View> : null}

      {displayedScheduledTrips.map(trip => <View key={trip.id} style={[styles.routeCard, runtime.activeTrip?.id === trip.id ? styles.routeCardActive : null]}>
              <Pressable onPress={() => handleTripCardPress(trip)}>
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
                <View style={styles.routeTimeColumn}>
                  <Text style={styles.routeTimeText}>{getTripWindow(trip)}</Text>
                  <Text style={styles.routeRiderText}>{trip.rider || 'Florida Mobility Group Service'}</Text>
                </View>
                <Text style={styles.routeStatusText}>{trip.punctualityLabel || trip.status || 'Assigned'}</Text>
              </View>
              </Pressable>
              <View style={styles.routeQuickActionsRow}>
                <Pressable style={[styles.callBadge, isAndroidDevice ? styles.androidQuickActionButton : null]} onPress={() => void openPhoneCall(getTripPatientPhone(trip))}>
                  <Text style={styles.callBadgeText}>{getTripPatientPhone(trip) ? `Call ${formatActionPhone(getTripPatientPhone(trip))}` : 'Call'}</Text>
                </Pressable>
                <Pressable style={[styles.smsBadge, isAndroidDevice ? styles.androidQuickActionButton : null]} onPress={() => void sendOutsideSms(trip)}>
                  <Text style={styles.smsBadgeText}>{getTripPatientPhone(trip) ? `${isAndroidDevice ? 'Text' : 'SMS'} ${formatActionPhone(getTripPatientPhone(trip))}` : (isAndroidDevice ? 'Text' : 'SMS')}</Text>
                </Pressable>
                <Pressable style={[styles.cancelBadge, isAndroidDevice ? styles.androidQuickActionButton : null]} onPress={() => openCancelComposer(trip, 'quick')}>
                  <Text style={styles.cancelBadgeText}>Cancel</Text>
                </Pressable>
              </View>
            </View>)}

      {displayedFocusTrip ? <View style={driverSharedStyles.card}>
          <View style={driverSharedStyles.rowBetween}>
            <View style={styles.copyBlock}>
              <Text style={driverSharedStyles.eyebrow}>Current trip</Text>
              <Text style={styles.focusTitle}>{displayedFocusTrip.rider}</Text>
              <Text style={styles.focusMeta}>{getCleanTripReference(displayedFocusTrip) ? `${getCleanTripReference(displayedFocusTrip)} | ` : ''}{getTripWindow(displayedFocusTrip)}</Text>
              <View style={styles.focusDirectionsBlock}>
                <View style={styles.routeRow}>
                  <Text style={styles.routeText}>PU {displayedFocusTrip.address}</Text>
                  {hasStartedRouteToPickup && !hasArrivedPickup ? <Text style={styles.enRouteCheck}>Going to pickup</Text> : null}
                </View>
                <Text style={styles.routeText}>DO {displayedFocusTrip.destination}</Text>
              </View>
            </View>
            <View style={[driverSharedStyles.pill, { backgroundColor: getTripTone(displayedFocusTrip.punctualityVariant) }]}>
              <Text style={driverSharedStyles.pillText}>{displayedFocusTrip.punctualityLabel || displayedFocusTrip.status || 'Pending'}</Text>
            </View>
          </View>

          <View style={styles.focusRequirementsRow}>
            <View style={styles.focusRequirementsLeft}>
              <View style={styles.focusQuickActionsRow}>
                <Pressable style={[styles.callBadge, isAndroidDevice ? styles.androidQuickActionButton : null]} onPress={() => void openPhoneCall(getTripPatientPhone(displayedFocusTrip))}>
                  <Text style={styles.callBadgeText}>{getTripPatientPhone(displayedFocusTrip) ? `Call ${formatActionPhone(getTripPatientPhone(displayedFocusTrip))}` : 'Call'}</Text>
                </Pressable>
                <Pressable style={[styles.smsBadge, isAndroidDevice ? styles.androidQuickActionButton : null]} onPress={() => void sendOutsideSms(displayedFocusTrip)}>
                  <Text style={styles.smsBadgeText}>{getTripPatientPhone(displayedFocusTrip) ? `${isAndroidDevice ? 'Text' : 'SMS'} ${formatActionPhone(getTripPatientPhone(displayedFocusTrip))}` : (isAndroidDevice ? 'Text' : 'SMS')}</Text>
                </Pressable>
                <Pressable style={[styles.cancelBadge, isAndroidDevice ? styles.androidQuickActionButton : null]} onPress={() => openCancelComposer(displayedFocusTrip, 'full')}>
                  <Text style={styles.cancelBadgeText}>Cancel</Text>
                </Pressable>
              </View>
              {renderSupportBadges(displayedFocusTrip)}
            </View>
            <View style={styles.focusRequirementsRight}>
              <Text style={styles.focusRequirementsRightValue}>{displayedFocusTrip.miles ? `${displayedFocusTrip.miles} mi` : '--'}</Text>
              <Text style={styles.focusRequirementsRightSub}>{displayedFocusTrip.vehicleType || 'Vehicle'}</Text>
            </View>
          </View>

          {showDispatcherNotesCard ? <View style={styles.dispatchNoteCard}>
              <Text style={styles.dispatchNoteTitle}>Dispatcher Notes</Text>
              <Text style={styles.dispatchNoteBody}>{driverNotes}</Text>
              {displayedFocusTrip.hasNotesOverride && providerNotes ? <Text style={styles.dispatchNoteMeta}>Updated from web dispatch notes.</Text> : null}
            </View> : null}

          {showPickupTimeChange || showDropoffTimeChange ? <View style={styles.timeChangeCard}>
              <Text style={styles.timeChangeTitle}>Time Update</Text>
              {showPickupTimeChange ? <View style={styles.timeChangeRow}>
                  <Text style={styles.timeChangeLabel}>Pickup</Text>
                  <Text style={styles.timeChangeValue}>Hora: {displayedFocusTrip.providerScheduledPickup}</Text>
                  <Text style={styles.timeChangeValueStrong}>New hora: {displayedFocusTrip.scheduledPickup}</Text>
                </View> : null}
              {showDropoffTimeChange ? <View style={styles.timeChangeRow}>
                  <Text style={styles.timeChangeLabel}>Dropoff</Text>
                  <Text style={styles.timeChangeValue}>Hora: {displayedFocusTrip.providerScheduledDropoff}</Text>
                  <Text style={styles.timeChangeValueStrong}>New hora: {displayedFocusTrip.scheduledDropoff}</Text>
                </View> : null}
            </View> : null}

          {elapsedLabel ? <View style={[styles.timerBanner, isLateToPickup ? styles.timerBannerLate : styles.timerBannerOk]}>
              <Text style={styles.timerLabel}>{isLateToPickup ? 'LATE - En route' : 'En route to pickup'}</Text>
              <Text style={styles.timerValue}>{elapsedLabel}</Text>
              {isLateToPickup && displayedFocusTrip.scheduledPickup ? <Text style={styles.timerSub}>Pickup was at {displayedFocusTrip.scheduledPickup}. Alert sent to dispatcher.</Text> : null}
            </View> : null}

          {destinationElapsedLabel ? <View style={[styles.timerBanner, isLateToDestination ? styles.timerBannerLate : styles.timerBannerOk]}>
              <Text style={styles.timerLabel}>{isLateToDestination ? 'LATE - To destination' : 'To destination'}</Text>
              <Text style={styles.timerValue}>{destinationElapsedLabel}</Text>
              {displayedFocusTrip.scheduledDropoff ? <Text style={styles.timerSubNeutral}>Dropoff target: {displayedFocusTrip.scheduledDropoff}</Text> : null}
              {isLateToDestination && displayedFocusTrip.scheduledDropoff ? <Text style={styles.timerSub}>Destination is running late.</Text> : null}
            </View> : null}

          <View style={styles.workflowCard}>
            <Text style={styles.workflowTitle}>Trip workflow</Text>
            <Text style={styles.workflowLine}>Accepted: {workflow?.acceptedTimeLabel || 'Pending'}</Text>
            <Text style={styles.workflowLine}>Start route: {workflow?.departureToPickupTimeLabel || workflow?.departureTimeLabel || 'Pending'}</Text>
            <Text style={styles.workflowLine}>Arrived pickup: {workflow?.arrivedPickupTimeLabel || workflow?.arrivalTimeLabel || 'Pending'}</Text>
            <Text style={styles.workflowLine}>Patient onboard: {workflow?.patientOnboardTimeLabel || displayedFocusTrip.actualPickup || 'Pending'}</Text>
            <Text style={styles.workflowLine}>Start trip: {workflow?.startTripTimeLabel || workflow?.destinationDepartureTimeLabel || 'Pending'}</Text>
            <Text style={styles.workflowLine}>Arrived destination: {workflow?.arrivedDestinationTimeLabel || workflow?.destinationArrivalTimeLabel || 'Pending'}</Text>
            <Text style={styles.workflowLine}>Completion: {workflow?.completedTimeLabel || 'Pending'}</Text>
          </View>

          <View style={styles.actionRow}>
            {showAcceptAction ? <Pressable style={[driverSharedStyles.secondaryButton, !canAcceptTrip || runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => {
                setQueueMode('in-progress');
                void runtime.submitTripAction('accept');
              }} disabled={!canAcceptTrip || runtime.activeTripAction.length > 0}>
                <Text style={driverSharedStyles.secondaryButtonText}>{runtime.activeTripAction === 'accept' ? 'Sending...' : 'Accept'}</Text>
              </Pressable> : null}

            {showStartRouteAction ? <Pressable style={[driverSharedStyles.secondaryButton, !canStartRoute || runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => {
                void runtime.submitTripAction('en-route');
                void openDirectionsToPickup(displayedFocusTrip);
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

            {!hasPatientOnboard && !hasStartedTripToDestination ? <Pressable style={[styles.prominentCancelButton, runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => openCancelComposer(displayedFocusTrip, 'full')} disabled={runtime.activeTripAction.length > 0}>
                <Text style={styles.prominentCancelButtonText}>Cancel</Text>
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

          {runtime.tripActionError ? <Text style={driverSharedStyles.warningText}>{runtime.tripActionError}</Text> : null}
        </View> : null}

      {cancelTargetTrip && showCancelComposer ? <Modal transparent animationType="slide" visible={showCancelComposer} onRequestClose={closeCancelComposer}>
          <View style={styles.cancelModalOverlay}>
            <View style={styles.cancelModalCard}>
              <Text style={styles.cancelTitle}>{cancelComposerMode === 'quick' ? 'Quick cancel trip' : 'Cancel trip now'}</Text>
              <Text style={styles.cancelHelpText}>{cancelComposerMode === 'quick' ? 'This quick cancel is for a trip the driver has not started yet. Write the reason and submit immediately.' : 'Write the reason below. The driver does not have to wait for the server. The app queues the cancel first and sends it after.'}</Text>
              <Text style={styles.cancelTripName}>{cancelTargetTrip.rider || 'Patient'}</Text>
              <TextInput value={cancelReason} onChangeText={setCancelReason} placeholder="Reason for cancellation" placeholderTextColor="#6b7280" multiline autoFocus style={styles.cancelInput} />
              {cancelComposerMode === 'full' ? <>
                  {cancelPhotoDataUrl ? <Image source={{ uri: cancelPhotoDataUrl }} style={styles.cancelPhotoPreview} resizeMode="cover" /> : null}
                  <View style={styles.cancelButtonsRow}>
                    <Pressable style={styles.cancelCallButton} onPress={() => void openPhoneCall(getTripPatientPhone(cancelTargetTrip))}>
                      <Text style={styles.cancelCallButtonText}>{getTripPatientPhone(cancelTargetTrip) ? `Call ${formatActionPhone(getTripPatientPhone(cancelTargetTrip))}` : 'Call'}</Text>
                    </Pressable>
                    <Pressable style={[styles.cancelAttachButton, runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void pickCancelPhoto()} disabled={runtime.activeTripAction.length > 0}>
                      <Text style={styles.cancelAttachButtonText}>{cancelPhotoDataUrl ? 'Change Photo' : 'Photo Optional'}</Text>
                    </Pressable>
                  </View>
                </> : null}
              <View style={styles.cancelFooterRow}>
                <Pressable style={styles.cancelDismissButton} onPress={closeCancelComposer}>
                  <Text style={styles.cancelDismissButtonText}>Close</Text>
                </Pressable>
                <Pressable style={[styles.cancelSubmitButton, runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void submitCancelTrip()} disabled={runtime.activeTripAction.length > 0}>
                  <Text style={styles.cancelSubmitButtonText}>{runtime.activeTripAction === 'cancel' ? 'Queueing...' : cancelComposerMode === 'quick' ? 'Quick Cancel' : 'Submit Cancel'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal> : null}
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
  androidPatchBanner: {
    marginTop: 8,
    backgroundColor: '#fff7ed',
    borderRadius: driverTheme.radius.sm,
    borderWidth: 1,
    borderColor: '#fb923c',
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  androidPatchBannerText: {
    color: '#9a3412',
    fontSize: 12,
    fontWeight: '800'
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
    marginTop: 6,
    flexWrap: 'wrap'
  },
  routeQuickActionsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingBottom: 10,
    flexWrap: 'wrap'
  },
  focusQuickActionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    marginBottom: 4,
    flexWrap: 'wrap'
  },
  androidQuickActionButton: {
    flex: 1,
    minWidth: 96,
    height: 40
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
  cancelBadge: {
    minWidth: 72,
    height: 34,
    borderRadius: driverTheme.radius.sm,
    backgroundColor: '#b91c1c',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10
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
  cancelBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900'
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
  supportBadgeWillCall: {
    backgroundColor: '#fee2e2',
    borderColor: '#dc2626'
  },
  supportBadgeText: {
    color: '#334a59',
    fontSize: 11,
    fontWeight: '700'
  },
  supportBadgeWillCallText: {
    color: '#b91c1c',
    fontSize: 11,
    fontWeight: '800'
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
    maxWidth: '100%'
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
  dispatchNoteCard: {
    backgroundColor: '#fff7ed',
    borderRadius: driverTheme.radius.md,
    borderWidth: 1,
    borderColor: '#fdba74',
    padding: 12,
    gap: 6
  },
  dispatchNoteTitle: {
    color: '#9a3412',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  dispatchNoteBody: {
    color: '#7c2d12',
    lineHeight: 19,
    fontWeight: '700'
  },
  dispatchNoteMeta: {
    color: '#c2410c',
    fontSize: 12,
    fontWeight: '700'
  },
  timeChangeCard: {
    backgroundColor: '#eff6ff',
    borderRadius: driverTheme.radius.md,
    borderWidth: 1,
    borderColor: '#93c5fd',
    padding: 12,
    gap: 8
  },
  timeChangeTitle: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  timeChangeRow: {
    gap: 2
  },
  timeChangeLabel: {
    color: '#1e3a8a',
    fontSize: 12,
    fontWeight: '800'
  },
  timeChangeValue: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700'
  },
  timeChangeValueStrong: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '900'
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
  syncErrorCard: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
    borderWidth: 1,
    borderRadius: driverTheme.radius.md,
    padding: 12,
    gap: 8
  },
  syncRetryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#c2410c',
    borderRadius: driverTheme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  syncRetryButtonText: {
    color: '#ffffff',
    fontWeight: '800'
  },
  mapButton: {
    backgroundColor: driverTheme.colors.primarySoft
  },
  prominentCancelButton: {
    minWidth: 120,
    backgroundColor: '#b91c1c',
    borderRadius: driverTheme.radius.sm,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  prominentCancelButtonText: {
    color: '#ffffff',
    fontWeight: '900'
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
  cancelHelpText: {
    color: '#7f1d1d',
    fontSize: 12,
    lineHeight: 18
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
  cancelFooterRow: {
    flexDirection: 'row',
    gap: 8
  },
  cancelModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end'
  },
  cancelModalCard: {
    backgroundColor: '#fff7f7',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderColor: '#f8b4b4'
  },
  cancelTripName: {
    color: '#7f1d1d',
    fontWeight: '800'
  },
  cancelCallButton: {
    width: 52,
    borderRadius: driverTheme.radius.sm,
    backgroundColor: '#2f855a',
    alignItems: 'center',
    justifyContent: 'center'
  },
  cancelCallButtonText: {
    color: '#ffffff',
    fontWeight: '900'
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
  },
  cancelDismissButton: {
    minWidth: 84,
    borderRadius: driverTheme.radius.sm,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  cancelDismissButtonText: {
    color: '#111827',
    fontWeight: '800'
  }
});
