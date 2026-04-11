export type LocationSnapshot = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
};

export type DriverShiftState = 'available' | 'en-route' | 'arrived' | 'completed';

export type DriverAppTab = 'home' | 'trips' | 'messages' | 'alerts' | 'gps' | 'settings' | 'profile' | 'history' | 'documents' | 'help' | 'fuel';

export type DriverFuelReceipt = {
  id: string;
  serviceDate: string;
  amount: number;
  gallons: number;
  vehicleMileage: number | null;
  receiptReference: string;
  receiptImageUrl: string;
  notes: string;
  source: string;
  createdAt: string;
};

export type DriverTrip = {
  id: string;
  rideId?: string;
  rider: string;
  pickup: string;
  dropoff: string;
  scheduledPickup?: string;
  scheduledDropoff?: string;
  actualPickup?: string;
  actualDropoff?: string;
  serviceDate?: string;
  address: string;
  pickupZip?: string;
  destination: string;
  dropoffZip?: string;
  notes?: string;
  note?: string;
  patientPhoneNumber?: string;
  assistanceNeeds?: string;
  mobilityType?: string;
  subMobilityType?: string;
  assistLevel?: string;
  hasServiceAnimal?: boolean;
  wheelChairIsXL?: boolean;
  wheelChairFoldable?: boolean;
  confirmationStatus?: string;
  confirmationSentAt?: string;
  confirmationRespondedAt?: string;
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
  status?: string;
  vehicleType?: string;
  miles?: number;
  leg?: string;
  brokerTripId?: string;
  punctualityLabel?: string;
  punctualityVariant?: 'success' | 'danger' | 'secondary';
  lateMinutes?: string;
  isWillCall?: boolean;
  isNextDayTrip?: boolean;
  enRouteAt?: number | null;
  arrivedAt?: number | null;
  patientOnboardAt?: number | null;
  startTripAt?: number | null;
  arrivedDestinationAt?: number | null;
  completedAt?: number | null;
  riderSignatureName?: string;
  riderSignedAt?: number | null;
  canceledAt?: number | null;
  canceledByDriverId?: string;
  canceledByDriverName?: string;
  cancellationReason?: string;
  cancellationPhotoDataUrl?: string;
  completionPhotoDataUrl?: string;
  driverWorkflow?: {
    status?: string;
    acceptedAt?: number | null;
    acceptedTimeLabel?: string;
    departureAt?: number | null;
    departureTimeLabel?: string;
    departureToPickupAt?: number | null;
    departureToPickupTimeLabel?: string;
    departureLocationSnapshot?: LocationSnapshot | null;
    arrivalAt?: number | null;
    arrivalTimeLabel?: string;
    arrivedPickupAt?: number | null;
    arrivedPickupTimeLabel?: string;
    arrivalLocationSnapshot?: LocationSnapshot | null;
    patientOnboardAt?: number | null;
    patientOnboardTimeLabel?: string;
    pickupAt?: number | null;
    pickupTimeLabel?: string;
    startTripAt?: number | null;
    startTripTimeLabel?: string;
    destinationDepartureAt?: number | null;
    destinationDepartureTimeLabel?: string;
    destinationDepartureLocationSnapshot?: LocationSnapshot | null;
    arrivedDestinationAt?: number | null;
    arrivedDestinationTimeLabel?: string;
    destinationArrivalAt?: number | null;
    destinationArrivalTimeLabel?: string;
    destinationArrivalLocationSnapshot?: LocationSnapshot | null;
    completedAt?: number | null;
    completedTimeLabel?: string;
    completionLocationSnapshot?: LocationSnapshot | null;
    startedLate?: boolean;
    startLateMinutes?: number | null;
    pickupLate?: boolean;
    pickupLateMinutes?: number | null;
    dropoffLate?: boolean;
    dropoffLateMinutes?: number | null;
    riderSignatureName?: string;
    riderSignedAt?: number | null;
    auditTrail?: Array<{
      id: string;
      action: string;
      timestamp: number;
      timeLabel?: string;
      riderSignatureName?: string;
      compliance?: {
        measured?: boolean;
        isLate?: boolean;
        lateByMinutes?: number | null;
      } | null;
    }>;
  } | null;
};

export type DriverSession = {
  driverId: string;
  driverCode: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  vehicleId: string;
  passwordResetRequired: boolean;
  deviceId: string;
  sessionToken: string;
  profilePhotoUrl?: string;
  gpsSettings?: {
    mapRadiusMeters?: number;
    fgTimeIntervalMs?: number;
    fgDistanceIntervalMeters?: number;
    bgTimeIntervalMs?: number;
    bgDistanceIntervalMeters?: number;
  };
};

export type DriverDocumentValue = {
  name?: string;
  dataUrl?: string;
  url?: string;
  path?: string;
  updatedAt?: string;
} | string | null;

export type DriverDocuments = {
  profilePhoto: DriverDocumentValue;
  licenseFront: DriverDocumentValue;
  licenseBack: DriverDocumentValue;
  insuranceCertificate: DriverDocumentValue;
  w9Document: DriverDocumentValue;
  trainingCertificate: DriverDocumentValue;
};

export type DriverMessage = {
  id: string;
  type?: string;
  priority?: string;
  audience?: string;
  subject?: string;
  body: string;
  driverId?: string | null;
  driverName?: string | null;
  status?: string;
  createdAt?: string;
  resolvedAt?: string | null;
  source?: string;
  deliveryMethod?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
};

export type DriverReviewItem = {
  id: string;
  tripId: string;
  rating: number;
  comment: string;
  riderName: string;
  createdAt?: string | null;
};

export type DriverReviewSummary = {
  driverId: string;
  driverName: string;
  vehicle: string;
  totalReviews: number;
  averageRating: number;
  completedTrips: number;
  yearsWithCompany: number;
  ratingBreakdown: Record<number, number>;
  recentReviews: DriverReviewItem[];
};

export type RoadmapVersion = {
  id: string;
  title: string;
  goal: string;
  items: string[];
};