import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { driverSharedStyles, driverTheme } from './driverTheme';

type Props = {
  runtime: DriverRuntime;
};

const todayDateKey = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const EMPTY_FORM = {
  serviceDate: todayDateKey(),
  amount: '',
  gallons: '',
  vehicleMileage: '',
  receiptReference: '',
  notes: '',
  receiptImageUri: '' as string
};

export const DriverFuelReceiptsSection = ({ runtime }: Props) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [photoError, setPhotoError] = useState('');
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

  useEffect(() => {
    void runtime.loadFuelReceipts();
  }, []);

  const set = (key: keyof typeof EMPTY_FORM, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const pickPhotoFromCamera = async () => {
    setPhotoError('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      setPhotoError('Camera permission is required to take a receipt photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      allowsEditing: false
    });
    if (result.canceled || !result.assets?.[0]) return;
    await processPhoto(result.assets[0].uri);
  };

  const pickPhotoFromGallery = async () => {
    setPhotoError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setPhotoError('Gallery permission is required to select a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      allowsEditing: false
    });
    if (result.canceled || !result.assets?.[0]) return;
    await processPhoto(result.assets[0].uri);
  };

  const processPhoto = async (uri: string) => {
    try {
      setIsProcessingPhoto(true);
      const optimized = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 800 } }],
        { compress: 0.45, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!optimized.base64) {
        setPhotoError('Unable to process the photo. Try again.');
        return;
      }
      const dataUrl = `data:image/jpeg;base64,${optimized.base64}`;
      setForm(prev => ({ ...prev, receiptImageUri: dataUrl }));
    } catch {
      setPhotoError('Unable to process the photo. Try again.');
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleSubmit = async () => {
    runtime.setFuelReceiptError('');
    runtime.setFuelReceiptSuccess('');

    const serviceDate = form.serviceDate.trim();
    if (!serviceDate) {
      runtime.setFuelReceiptError('Service date is required.');
      return;
    }
    const amount = parseFloat(form.amount);
    if (!form.amount || isNaN(amount) || amount < 0) {
      runtime.setFuelReceiptError('Enter a valid fuel amount ($).');
      return;
    }
    const gallons = parseFloat(form.gallons);
    if (!form.gallons || isNaN(gallons) || gallons < 0) {
      runtime.setFuelReceiptError('Enter a valid gallon amount.');
      return;
    }
    if (!form.receiptReference.trim() && !form.receiptImageUri) {
      runtime.setFuelReceiptError('Add a receipt reference number or take a photo of the receipt.');
      return;
    }

    const vehicleMileage = form.vehicleMileage.trim()
      ? parseFloat(form.vehicleMileage)
      : null;

    const ok = await runtime.submitFuelReceipt({
      serviceDate,
      amount,
      gallons,
      vehicleMileage: vehicleMileage !== null && !isNaN(vehicleMileage) ? vehicleMileage : null,
      receiptReference: form.receiptReference.trim(),
      receiptImageUrl: form.receiptImageUri,
      notes: form.notes.trim()
    });

    if (ok) {
      setForm({ ...EMPTY_FORM, serviceDate: todayDateKey() });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {/* Header */}
      <View style={driverSharedStyles.card}>
        <Text style={driverSharedStyles.eyebrow}>Fuel &amp; Mileage</Text>
        <Text style={driverSharedStyles.title}>Submit a Fuel Receipt</Text>
        <Text style={driverSharedStyles.body}>
          Enter your fuel purchase details and take a photo of the receipt. Mileage is optional but helps dispatch track vehicle usage.
        </Text>
      </View>

      {/* Form card */}
      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Receipt Details</Text>

        <Text style={styles.label}>Service Date</Text>
        <TextInput
          style={styles.input}
          value={form.serviceDate}
          onChangeText={v => set('serviceDate', v)}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={driverTheme.colors.textMuted}
        />

        <Text style={styles.label}>Fuel Amount ($)</Text>
        <TextInput
          style={styles.input}
          value={form.amount}
          onChangeText={v => set('amount', v)}
          placeholder="e.g. 85.40"
          keyboardType="decimal-pad"
          placeholderTextColor={driverTheme.colors.textMuted}
        />

        <Text style={styles.label}>Gallons</Text>
        <TextInput
          style={styles.input}
          value={form.gallons}
          onChangeText={v => set('gallons', v)}
          placeholder="e.g. 22.5"
          keyboardType="decimal-pad"
          placeholderTextColor={driverTheme.colors.textMuted}
        />

        <Text style={styles.label}>Vehicle Mileage (optional)</Text>
        <TextInput
          style={styles.input}
          value={form.vehicleMileage}
          onChangeText={v => set('vehicleMileage', v)}
          placeholder="Odometer reading in miles"
          keyboardType="decimal-pad"
          placeholderTextColor={driverTheme.colors.textMuted}
        />

        <Text style={styles.label}>Receipt Reference # (optional if photo attached)</Text>
        <TextInput
          style={styles.input}
          value={form.receiptReference}
          onChangeText={v => set('receiptReference', v)}
          placeholder="Ticket or invoice number"
          placeholderTextColor={driverTheme.colors.textMuted}
        />

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={form.notes}
          onChangeText={v => set('notes', v)}
          placeholder="Gas station, reason, etc."
          multiline
          numberOfLines={3}
          placeholderTextColor={driverTheme.colors.textMuted}
        />

        {/* Photo section */}
        <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Receipt Photo</Text>

        {form.receiptImageUri ? (
          <View style={styles.photoPreviewWrap}>
            <Image source={{ uri: form.receiptImageUri }} style={styles.photoPreview} resizeMode="cover" />
            <Pressable style={styles.removePhotoButton} onPress={() => set('receiptImageUri', '')}>
              <Text style={styles.removePhotoText}>Remove photo</Text>
            </Pressable>
          </View>
        ) : null}

        {photoError ? <Text style={styles.errorText}>{photoError}</Text> : null}

        {isProcessingPhoto ? (
          <View style={styles.processingRow}>
            <ActivityIndicator color={driverTheme.colors.primary} />
            <Text style={styles.processingText}>Processing photo...</Text>
          </View>
        ) : (
          <View style={styles.photoButtonRow}>
            <Pressable style={styles.photoButton} onPress={pickPhotoFromCamera} disabled={isProcessingPhoto}>
              <Text style={styles.photoButtonText}>📷  Take Photo</Text>
            </Pressable>
            <Pressable style={[styles.photoButton, styles.photoButtonSecondary]} onPress={pickPhotoFromGallery} disabled={isProcessingPhoto}>
              <Text style={[styles.photoButtonText, styles.photoButtonTextSecondary]}>🖼  Gallery</Text>
            </Pressable>
          </View>
        )}

        {/* Errors / Success */}
        {runtime.fuelReceiptError ? (
          <View style={styles.alertDanger}>
            <Text style={styles.alertText}>{runtime.fuelReceiptError}</Text>
          </View>
        ) : null}
        {runtime.fuelReceiptSuccess ? (
          <View style={styles.alertSuccess}>
            <Text style={styles.alertSuccessText}>{runtime.fuelReceiptSuccess}</Text>
          </View>
        ) : null}

        {/* Submit */}
        <Pressable
          style={[styles.submitButton, runtime.isSubmittingFuelReceipt ? styles.submitButtonDisabled : null]}
          onPress={handleSubmit}
          disabled={runtime.isSubmittingFuelReceipt}
        >
          {runtime.isSubmittingFuelReceipt
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitButtonText}>Submit Fuel Receipt</Text>}
        </Pressable>
      </View>

      {/* Past receipts */}
      {runtime.fuelReceipts.length > 0 ? (
        <View style={styles.historyCard}>
          <Text style={styles.sectionTitle}>Your Recent Submittals</Text>
          {runtime.fuelReceipts.slice(0, 20).map(item => (
            <View key={item.id} style={styles.historyRow}>
              <View style={styles.historyLeft}>
                <Text style={styles.historyDate}>{item.serviceDate || '-'}</Text>
                <Text style={styles.historyDetail}>
                  ${Number(item.amount || 0).toFixed(2)}  ·  {Number(item.gallons || 0).toFixed(3)} gal
                  {item.vehicleMileage != null ? `  ·  ${Number(item.vehicleMileage).toFixed(1)} mi` : ''}
                </Text>
                {item.receiptReference ? <Text style={styles.historyRef}>Ref: {item.receiptReference}</Text> : null}
              </View>
              {item.receiptImageUrl ? (
                <Image source={{ uri: item.receiptImageUrl }} style={styles.historyThumb} resizeMode="cover" />
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: driverTheme.colors.appBg
  },
  formCard: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: driverTheme.colors.text,
    marginBottom: 10
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: driverTheme.colors.text,
    marginBottom: 4,
    marginTop: 10
  },
  input: {
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    borderRadius: driverTheme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: driverTheme.colors.text,
    backgroundColor: driverTheme.colors.appBg
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top'
  },
  photoPreviewWrap: {
    marginBottom: 10
  },
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: driverTheme.radius.sm,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  removePhotoButton: {
    marginTop: 6,
    alignSelf: 'flex-end'
  },
  removePhotoText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '600'
  },
  photoButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8
  },
  photoButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: driverTheme.colors.headerBg,
    borderRadius: driverTheme.radius.sm,
    alignItems: 'center'
  },
  photoButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: driverTheme.colors.headerBg
  },
  photoButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13
  },
  photoButtonTextSecondary: {
    color: driverTheme.colors.headerBg
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8
  },
  processingText: {
    color: driverTheme.colors.textMuted,
    fontSize: 13
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
    marginTop: 6
  },
  alertDanger: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: driverTheme.radius.sm,
    padding: 10,
    marginTop: 10
  },
  alertText: {
    color: '#b91c1c',
    fontSize: 13
  },
  alertSuccess: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: driverTheme.radius.sm,
    padding: 10,
    marginTop: 10
  },
  alertSuccessText: {
    color: '#15803d',
    fontSize: 13,
    fontWeight: '600'
  },
  submitButton: {
    marginTop: 20,
    backgroundColor: driverTheme.colors.headerBg,
    paddingVertical: 14,
    borderRadius: driverTheme.radius.sm,
    alignItems: 'center'
  },
  submitButtonDisabled: {
    opacity: 0.6
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15
  },
  historyCard: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: driverTheme.colors.border
  },
  historyLeft: {
    flex: 1,
    paddingRight: 10
  },
  historyDate: {
    fontWeight: '700',
    fontSize: 13,
    color: driverTheme.colors.text
  },
  historyDetail: {
    fontSize: 12,
    color: driverTheme.colors.textMuted,
    marginTop: 2
  },
  historyRef: {
    fontSize: 11,
    color: driverTheme.colors.textMuted,
    marginTop: 2
  },
  historyThumb: {
    width: 52,
    height: 52,
    borderRadius: driverTheme.radius.sm,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  }
});
