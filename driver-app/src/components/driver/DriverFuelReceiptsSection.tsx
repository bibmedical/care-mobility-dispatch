import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { DriverFuelRequest } from '../../types/driver';
import { getDriverAccentColor } from './driverColor';
import { driverTheme } from './driverTheme';
import { compressImageToJpegDataUrl } from '../../utils/imageCompression';

type Props = {
  runtime: DriverRuntime;
};

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

type ReceiptForm = {
  gallons: string;
  vehicleMileage: string;
  imageUri: string;
  cardImageUri: string;
  paymentCardLast4: string;
};

const EMPTY_RECEIPT: ReceiptForm = { gallons: '', vehicleMileage: '', imageUri: '', cardImageUri: '', paymentCardLast4: '' };

export const DriverFuelReceiptsSection = ({ runtime }: Props) => {
  const [receiptForm, setReceiptForm] = useState<ReceiptForm>(EMPTY_RECEIPT);
  const [requestMileage, setRequestMileage] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

  const accent = getDriverAccentColor({
    id: runtime.driverSession?.driverId,
    name: runtime.driverSession?.name || runtime.driverCode
  });

  useEffect(() => {
    void runtime.loadFuelRequests();
  }, []);

  // Auto-poll every 15 s while there is an active request (pending or approved)
  useEffect(() => {
    const hasActive = runtime.fuelRequests.some(r => r.status === 'pending' || r.status === 'approved');
    if (!hasActive) return;
    const id = setInterval(() => { void runtime.loadFuelRequests(); }, 15000);
    return () => clearInterval(id);
  }, [runtime.fuelRequests]);

  // Active request = most recent one that is not closed
  const activeRequest: DriverFuelRequest | undefined = runtime.fuelRequests
    .find(r => r.status === 'pending' || r.status === 'approved');

  const requestedMileageNumber = requestMileage !== '' ? Number(requestMileage) : NaN;

  const set = (key: keyof ReceiptForm, value: string) =>
    setReceiptForm(prev => ({ ...prev, [key]: value }));

  const pickPhoto = async (source: 'camera' | 'gallery', target: 'imageUri' | 'cardImageUri' = 'imageUri') => {
    setPhotoError('');
    try {
      let result;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== 'granted') { setPhotoError('Camera permission required.'); return; }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== 'granted') { setPhotoError('Gallery permission required.'); return; }
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
      }
      if (result.canceled || !result.assets?.[0]) return;
      setIsProcessingPhoto(true);
      const compressedDataUrl = await compressImageToJpegDataUrl(result.assets[0].uri, {
        maxSide: 1080,
        initialQuality: 0.48,
        maxApproxBytes: 320_000
      });
      set(target, compressedDataUrl);
    } catch {
      setPhotoError('Unable to take photo. Try again.');
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleSubmitReceipt = async () => {
    if (!activeRequest) return;
    runtime.setFuelRequestError('');
    runtime.setFuelRequestSuccess('');

    if (!receiptForm.imageUri) {
      runtime.setFuelRequestError('Receipt photo is required.');
      return;
    }
    if (!receiptForm.cardImageUri) {
      runtime.setFuelRequestError('Payment card photo is required.');
      return;
    }
    const digitsOnly = receiptForm.paymentCardLast4.replace(/\D/g, '');
    if (digitsOnly.length !== 4) {
      runtime.setFuelRequestError('Last 4 card digits are required.');
      return;
    }
    const gallons = parseFloat(receiptForm.gallons);
    if (!receiptForm.gallons || isNaN(gallons) || gallons <= 0) {
      runtime.setFuelRequestError('Gallons is required.');
      return;
    }
    const mileage = parseFloat(receiptForm.vehicleMileage);
    if (!receiptForm.vehicleMileage || isNaN(mileage) || mileage < 0) {
      runtime.setFuelRequestError('Vehicle mileage is required.');
      return;
    }

    const ok = await runtime.submitFuelRequestReceipt({
      requestId: activeRequest.id,
      serviceDate: todayKey(),
      receiptImageUrl: receiptForm.imageUri,
      paymentCardImageUrl: receiptForm.cardImageUri,
      paymentCardLast4: digitsOnly,
      gallons,
      vehicleMileage: mileage
    });

    if (ok) {
      setReceiptForm(EMPTY_RECEIPT);
      await runtime.loadFuelRequests();
    }
  };

  const handleResetFuel = async () => {
    const ok = await runtime.resetFuelData();
    if (ok) {
      setReceiptForm(EMPTY_RECEIPT);
      setRequestMileage('');
      await runtime.loadFuelRequests();
    }
  };

  // ── Status: pending ─────────────────────────────────────────────────────────
  if (activeRequest?.status === 'pending') {
    return (
      <ScrollView contentContainerStyle={styles.screen}>
        <View style={[styles.statusCard, { borderColor: '#f59e0b' }]}>
          <Text style={styles.statusEmoji}>⏳</Text>
          <Text style={[styles.statusTitle, { color: '#b45309' }]}>Awaiting Approval</Text>
          <Text style={styles.statusBody}>
            Your fuel request was sent to dispatch. Wait for a dispatcher to approve the amount and send you the funds.
          </Text>
          <Text style={styles.statusMeta}>
            Requested at {new Date(activeRequest.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {activeRequest.milesSinceLastFuel != null ? (
            <Text style={styles.statusMeta}>
              Miles since last fuel: {Number(activeRequest.milesSinceLastFuel).toFixed(1)} mi
            </Text>
          ) : null}
        </View>
        <Pressable style={styles.refreshButton} onPress={() => void runtime.loadFuelRequests()}>
          <Text style={styles.refreshButtonText}>Refresh Status</Text>
        </Pressable>
        <Pressable
          style={[styles.refreshButton, { borderColor: '#fca5a5', marginTop: -10 }]}
          onPress={() => void handleResetFuel()}
        >
          <Text style={[styles.refreshButtonText, { color: '#b91c1c' }]}>Reset Fuel and Start Over</Text>
        </Pressable>
        {renderHistory(runtime.fuelRequests)}
      </ScrollView>
    );
  }

  // ── Status: approved → show approval info + receipt form ────────────────────
  if (activeRequest?.status === 'approved') {
    return (
      <ScrollView contentContainerStyle={styles.screen}>
        <View style={[styles.statusCard, { borderColor: '#22c55e' }]}>
          <Text style={styles.statusEmoji}>✅</Text>
          <Text style={[styles.statusTitle, { color: '#15803d' }]}>
            Request Approved by {activeRequest.approvedByUser || 'Dispatcher'}
          </Text>
          <View style={styles.approvalDetails}>
            {activeRequest.approvedAmount != null && (
              <Text style={styles.approvalLine}>
                💵  Amount sent: <Text style={styles.approvalValue}>${Number(activeRequest.approvedAmount).toFixed(2)}</Text>
              </Text>
            )}
            {activeRequest.transferMethod && (
              <Text style={styles.approvalLine}>
                🏦  Via: <Text style={styles.approvalValue}>{activeRequest.transferMethod}</Text>
              </Text>
            )}
            {activeRequest.transferReference && (
              <Text style={styles.approvalLine}>
                🔖  Reference: <Text style={styles.approvalValue}>{activeRequest.transferReference}</Text>
              </Text>
            )}
            {activeRequest.transferNotes && (
              <Text style={styles.approvalNotes}>{activeRequest.transferNotes}</Text>
            )}
          </View>
        </View>

        {/* Receipt form — all fields required */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Submit Your Receipt</Text>
          <Text style={styles.formSubtitle}>All fields are required to complete this request.</Text>

          <Text style={styles.label}>📷  Photo of Receipt <Text style={styles.required}>*</Text></Text>
          {receiptForm.imageUri ? (
            <View style={styles.photoWrap}>
              <Image source={{ uri: receiptForm.imageUri }} style={styles.photo} resizeMode="cover" />
              <Pressable onPress={() => set('imageUri', '')} style={styles.removePhoto}>
                <Text style={styles.removePhotoText}>Remove</Text>
              </Pressable>
            </View>
          ) : null}
          {photoError ? <Text style={styles.errorInline}>{photoError}</Text> : null}
          {isProcessingPhoto ? (
            <View style={styles.processingRow}>
              <ActivityIndicator color={accent} />
              <Text style={styles.processingText}>Processing photo...</Text>
            </View>
          ) : (
            <View style={styles.photoBtns}>
              <Pressable style={[styles.photoBtn, { backgroundColor: accent }]} onPress={() => void pickPhoto('camera')}>
                <Text style={styles.photoBtnText}>📷  Camera</Text>
              </Pressable>
              <Pressable style={[styles.photoBtn, styles.photoBtnSecondary]} onPress={() => void pickPhoto('gallery')}>
                <Text style={[styles.photoBtnText, { color: accent }]}>🖼  Gallery</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.label}>💳  Photo of Card Used to Pay <Text style={styles.required}>*</Text></Text>
          {receiptForm.cardImageUri ? (
            <View style={styles.photoWrap}>
              <Image source={{ uri: receiptForm.cardImageUri }} style={styles.photo} resizeMode="cover" />
              <Pressable onPress={() => set('cardImageUri', '')} style={styles.removePhoto}>
                <Text style={styles.removePhotoText}>Remove</Text>
              </Pressable>
            </View>
          ) : null}
          {isProcessingPhoto ? (
            <View style={styles.processingRow}>
              <ActivityIndicator color={accent} />
              <Text style={styles.processingText}>Processing photo...</Text>
            </View>
          ) : (
            <View style={styles.photoBtns}>
              <Pressable style={[styles.photoBtn, { backgroundColor: accent }]} onPress={() => void pickPhoto('camera', 'cardImageUri')}>
                <Text style={styles.photoBtnText}>📷  Camera</Text>
              </Pressable>
              <Pressable style={[styles.photoBtn, styles.photoBtnSecondary]} onPress={() => void pickPhoto('gallery', 'cardImageUri')}>
                <Text style={[styles.photoBtnText, { color: accent }]}>🖼  Gallery</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.label}>Last 4 Card Digits <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            value={receiptForm.paymentCardLast4}
            onChangeText={v => set('paymentCardLast4', v.replace(/\D/g, '').slice(0, 4))}
            placeholder="e.g. 1234"
            keyboardType="number-pad"
            placeholderTextColor={driverTheme.colors.textMuted}
            maxLength={4}
          />

          <Text style={styles.label}>Gallons <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            value={receiptForm.gallons}
            onChangeText={v => set('gallons', v)}
            placeholder="e.g. 22.5"
            keyboardType="decimal-pad"
            placeholderTextColor={driverTheme.colors.textMuted}
          />

          <Text style={styles.label}>Vehicle Mileage (odometer) <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            value={receiptForm.vehicleMileage}
            onChangeText={v => set('vehicleMileage', v)}
            placeholder="e.g. 124500"
            keyboardType="decimal-pad"
            placeholderTextColor={driverTheme.colors.textMuted}
          />

          {runtime.fuelRequestError ? (
            <View style={styles.alertDanger}>
              <Text style={styles.alertText}>{runtime.fuelRequestError}</Text>
            </View>
          ) : null}
          {runtime.fuelRequestSuccess ? (
            <View style={styles.alertSuccess}>
              <Text style={styles.alertSuccessText}>{runtime.fuelRequestSuccess}</Text>
            </View>
          ) : null}

          <Pressable
            style={[styles.submitBtn, { backgroundColor: accent }, runtime.isSubmittingFuelRequest ? styles.submitBtnDisabled : null]}
            onPress={() => void handleSubmitReceipt()}
            disabled={runtime.isSubmittingFuelRequest}
          >
            {runtime.isSubmittingFuelRequest
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>Submit Receipt to Genius</Text>}
          </Pressable>
        </View>
        {renderHistory(runtime.fuelRequests)}
      </ScrollView>
    );
  }

  // ── Default: idle — show REQUEST FUEL ──────────────────────────────────────
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.heroCard}>
        <Text style={styles.heroEmoji}>⛽</Text>
        <Text style={styles.heroTitle}>Fuel</Text>
        <Text style={styles.heroBody}>
          Need fuel? Tap the button below to notify dispatch. Once approved and funds are sent to you, you&apos;ll be prompted to submit your receipt with the gallons and mileage.
        </Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Current Odometer</Text>
        <Text style={styles.formSubtitle}>Required before requesting fuel.</Text>
        <TextInput
          style={styles.input}
          value={requestMileage}
          onChangeText={setRequestMileage}
          placeholder="e.g. 125200"
          keyboardType="decimal-pad"
          placeholderTextColor={driverTheme.colors.textMuted}
        />
      </View>

      {runtime.fuelRequestError ? (
        <View style={styles.alertDanger}>
          <Text style={styles.alertText}>{runtime.fuelRequestError}</Text>
        </View>
      ) : null}
      {runtime.fuelRequestSuccess ? (
        <View style={styles.alertSuccess}>
          <Text style={styles.alertSuccessText}>{runtime.fuelRequestSuccess}</Text>
        </View>
      ) : null}

      <Pressable
        style={[styles.requestBtn, { backgroundColor: accent }, runtime.isSubmittingFuelRequest ? styles.submitBtnDisabled : null]}
        onPress={() => {
          if (!Number.isFinite(requestedMileageNumber) || requestedMileageNumber < 0) {
            runtime.setFuelRequestError('Current mileage is required.');
            return;
          }
          void (async () => {
            const ok = await runtime.submitFuelRequest({ requestedMileage: requestedMileageNumber });
            if (ok) setRequestMileage('');
          })();
        }}
        disabled={runtime.isSubmittingFuelRequest}
      >
        {runtime.isSubmittingFuelRequest
          ? <ActivityIndicator color="#fff" size="large" />
          : <Text style={styles.requestBtnText}>REQUEST FUEL</Text>}
      </Pressable>

      <Pressable
        style={[styles.refreshButton, { borderColor: '#fca5a5' }]}
        onPress={() => void handleResetFuel()}
      >
        <Text style={[styles.refreshButtonText, { color: '#b91c1c' }]}>Reset Fuel and Start Over</Text>
      </Pressable>

      {renderHistory(runtime.fuelRequests)}
    </ScrollView>
  );
};

function renderHistory(requests: DriverFuelRequest[]) {
  const past = requests.filter(r => r.status === 'receipt_submitted').slice(0, 10);
  if (past.length === 0) return null;
  return (
    <View style={styles.historyCard}>
      <Text style={styles.historyTitle}>Recent Fuel Requests</Text>
      {past.map(r => (
        <View key={r.id} style={styles.historyRow}>
          <Text style={styles.historyDate}>{new Date(r.requestedAt).toLocaleDateString()}</Text>
          <Text style={styles.historyDetail}>
            {r.approvedAmount != null ? `$${Number(r.approvedAmount).toFixed(2)}` : '—'}
            {r.gallons != null ? `  ·  ${Number(r.gallons).toFixed(3)} gal` : ''}
            {r.milesSinceLastFuel != null ? `  ·  +${Number(r.milesSinceLastFuel).toFixed(1)} mi since last fuel` : ''}
          </Text>
          {r.approvedByUser ? <Text style={styles.historyApprover}>Approved by {r.approvedByUser}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, paddingBottom: 48, backgroundColor: driverTheme.colors.appBg },

  heroCard: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.lg,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1, borderColor: driverTheme.colors.border,
    marginBottom: 20
  },
  heroEmoji: { fontSize: 48, marginBottom: 12 },
  heroTitle: { fontSize: 26, fontWeight: '800', color: driverTheme.colors.text, marginBottom: 8 },
  heroBody: { fontSize: 14, color: driverTheme.colors.textMuted, textAlign: 'center', lineHeight: 20 },

  requestBtn: {
    borderRadius: driverTheme.radius.lg,
    paddingVertical: 20,
    alignItems: 'center',
    marginBottom: 20
  },
  requestBtnText: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1.5 },

  statusCard: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.lg,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    marginBottom: 16
  },
  statusEmoji: { fontSize: 44, marginBottom: 10 },
  statusTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  statusBody: { fontSize: 14, color: driverTheme.colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  statusMeta: { fontSize: 12, color: driverTheme.colors.textMuted },

  refreshButton: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.md,
    paddingVertical: 12, paddingHorizontal: 24,
    alignSelf: 'center', marginBottom: 20,
    borderWidth: 1, borderColor: driverTheme.colors.border
  },
  refreshButtonText: { color: driverTheme.colors.text, fontWeight: '600', fontSize: 14 },

  approvalDetails: { alignSelf: 'stretch', marginTop: 12, gap: 6 },
  approvalLine: { fontSize: 15, color: driverTheme.colors.text },
  approvalValue: { fontWeight: '700', color: driverTheme.colors.text },
  approvalNotes: { fontSize: 13, color: driverTheme.colors.textMuted, fontStyle: 'italic', marginTop: 4 },

  formCard: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.lg,
    padding: 18,
    borderWidth: 1, borderColor: driverTheme.colors.border,
    marginBottom: 16
  },
  formTitle: { fontSize: 18, fontWeight: '800', color: driverTheme.colors.text, marginBottom: 4 },
  formSubtitle: { fontSize: 13, color: driverTheme.colors.textMuted, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: driverTheme.colors.text, marginBottom: 4, marginTop: 12 },
  required: { color: '#dc2626' },
  input: {
    borderWidth: 1, borderColor: driverTheme.colors.border,
    borderRadius: driverTheme.radius.sm,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: driverTheme.colors.text,
    backgroundColor: driverTheme.colors.appBg
  },

  photoWrap: { marginBottom: 8 },
  photo: { width: '100%', height: 200, borderRadius: driverTheme.radius.sm, borderWidth: 1, borderColor: driverTheme.colors.border },
  removePhoto: { marginTop: 4, alignSelf: 'flex-end' },
  removePhotoText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
  photoBtns: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 2 },
  photoBtn: { flex: 1, borderRadius: driverTheme.radius.sm, paddingVertical: 10, alignItems: 'center' },
  photoBtnSecondary: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: driverTheme.colors.border },
  photoBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  processingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 },
  processingText: { color: driverTheme.colors.textMuted, fontSize: 13 },
  errorInline: { color: '#dc2626', fontSize: 12, marginTop: 4 },

  submitBtn: { marginTop: 20, borderRadius: driverTheme.radius.md, paddingVertical: 16, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.55 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  alertDanger: {
    backgroundColor: '#fef2f2', borderRadius: driverTheme.radius.sm,
    borderWidth: 1, borderColor: '#fca5a5', padding: 12, marginTop: 12
  },
  alertText: { color: '#991b1b', fontSize: 13 },
  alertSuccess: {
    backgroundColor: '#f0fdf4', borderRadius: driverTheme.radius.sm,
    borderWidth: 1, borderColor: '#86efac', padding: 12, marginTop: 12
  },
  alertSuccessText: { color: '#15803d', fontSize: 13 },

  historyCard: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.lg,
    padding: 16, borderWidth: 1, borderColor: driverTheme.colors.border
  },
  historyTitle: { fontSize: 14, fontWeight: '700', color: driverTheme.colors.text, marginBottom: 10 },
  historyRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: driverTheme.colors.border },
  historyDate: { fontSize: 12, fontWeight: '700', color: driverTheme.colors.text },
  historyDetail: { fontSize: 12, color: driverTheme.colors.textMuted, marginTop: 2 },
  historyApprover: { fontSize: 11, color: '#15803d', marginTop: 2 }
});
