export type LocationSnapshot = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
};

export type DriverShiftState = 'available' | 'en-route' | 'arrived' | 'completed';

export type DriverAppTab = 'home' | 'trips' | 'messages' | 'alerts' | 'gps' | 'settings' | 'profile' | 'history' | 'documents' | 'help';

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
  patientPhoneNumber?: string;
  status?: string;
  vehicleType?: string;
  miles?: number;
  leg?: string;
  brokerTripId?: string;
  punctualityLabel?: string;
  punctualityVariant?: 'success' | 'danger' | 'secondary';
  lateMinutes?: string;
  isWillCall?: boolean;
  enRouteAt?: number | null;
  arrivedAt?: number | null;
  completedAt?: number | null;
  riderSignatureName?: string;
  riderSignedAt?: number | null;
  driverWorkflow?: {
    status?: string;
    departureAt?: number | null;
    departureTimeLabel?: string;
    departureLocationSnapshot?: LocationSnapshot | null;
    arrivalAt?: number | null;
    arrivalTimeLabel?: string;
    arrivalLocationSnapshot?: LocationSnapshot | null;
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
};

export type DriverDocumentValue = {
  name?: string;
  dataUrl?: string;
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

export type RoadmapVersion = {
  id: string;
  title: string;
  goal: string;
  items: string[];
};