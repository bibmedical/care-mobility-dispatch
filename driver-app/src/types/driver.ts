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