import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { getDriverAccentColor } from './driverColor';
import { driverSharedStyles, driverTheme } from './driverTheme';
import { compressImageToJpegDataUrl } from '../../utils/imageCompression';

type Props = {
  runtime: DriverRuntime;
};

const toDateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

export const DriverTimeOffSection = ({ runtime }: Props) => {
  const accent = getDriverAccentColor({
    id: runtime.driverSession?.driverId,
    name: runtime.driverSession?.name || runtime.driverCode
  });

  const [appointmentType, setAppointmentType] = useState('Medical Appointment');
  const [appointmentDate, setAppointmentDate] = useState(toDateKey(new Date()));
  const [note, setNote] = useState('');
  const [excuseImageUrl, setExcuseImageUrl] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

  const activeAppointment = runtime.driverTimeOffAppointment;
  const canSubmit = appointmentType.trim() && appointmentDate.trim() && note.trim() && excuseImageUrl.trim();

  useEffect(() => {
    void runtime.loadDriverTimeOff();
  }, []);

  useEffect(() => {
    if (!activeAppointment) return;
    setAppointmentType(activeAppointment.appointmentType || 'Medical Appointment');
    setAppointmentDate(activeAppointment.appointmentDate || toDateKey(new Date()));
    setNote(activeAppointment.note || '');
    setExcuseImageUrl(activeAppointment.excuseImageUrl || '');
  }, [activeAppointment?.id]);

  const appointmentStatusLabel = useMemo(() => {
    if (!activeAppointment) return 'No active appointment';
    return `Scheduled for ${activeAppointment.appointmentDate}`;
  }, [activeAppointment?.id, activeAppointment?.appointmentDate]);

  const pickPhoto = async (source: 'camera' | 'gallery') => {
    setPhotoError('');
    try {
      let result;
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== 'granted') {
          setPhotoError('Camera permission required.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
          setPhotoError('Gallery permission required.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
      }

      if (result.canceled || !result.assets?.[0]) return;
      setIsProcessingPhoto(true);
      const compressed = await compressImageToJpegDataUrl(result.assets[0].uri, {
        maxSide: 1080,
        initialQuality: 0.48,
        maxApproxBytes: 320_000
      });
      setExcuseImageUrl(compressed);
    } catch {
      setPhotoError('Unable to process photo. Please try again.');
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.headerCard, { borderColor: accent }]}>
        <Text style={styles.headerTitle}>Time Off Appointment</Text>
        <Text style={styles.headerText}>Submit your appointment so dispatch sees it and route assignment is blocked for that date.</Text>
        <Text style={styles.headerMeta}>{appointmentStatusLabel}</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>Appointment Type</Text>
        <TextInput
          style={styles.input}
          value={appointmentType}
          onChangeText={setAppointmentType}
          placeholder="Medical, Court, Family, Other"
          placeholderTextColor={driverTheme.colors.textMuted}
        />

        <Text style={styles.label}>Appointment Date (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={appointmentDate}
          onChangeText={setAppointmentDate}
          placeholder="2026-04-12"
          placeholderTextColor={driverTheme.colors.textMuted}
        />

        <Text style={styles.label}>Note / Reason</Text>
        <TextInput
          style={[styles.input, styles.noteInput]}
          value={note}
          onChangeText={setNote}
          placeholder="Type your appointment details..."
          placeholderTextColor={driverTheme.colors.textMuted}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>Excuse Note Photo</Text>
        {excuseImageUrl ? (
          <View style={styles.photoWrap}>
            <Image source={{ uri: excuseImageUrl }} style={styles.photo} resizeMode="cover" />
            <Pressable style={styles.removePhotoBtn} onPress={() => setExcuseImageUrl('')}>
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
          <View style={styles.photoButtons}>
            <Pressable style={[styles.photoButton, { backgroundColor: accent }]} onPress={() => void pickPhoto('camera')}>
              <Text style={styles.photoButtonText}>Camera</Text>
            </Pressable>
            <Pressable style={[styles.photoButton, styles.photoButtonSecondary]} onPress={() => void pickPhoto('gallery')}>
              <Text style={[styles.photoButtonText, { color: accent }]}>Gallery</Text>
            </Pressable>
          </View>
        )}

        {photoError ? <Text style={styles.errorText}>{photoError}</Text> : null}
        {runtime.driverTimeOffError ? <Text style={styles.errorText}>{runtime.driverTimeOffError}</Text> : null}
        {runtime.driverTimeOffSuccess ? <Text style={styles.successText}>{runtime.driverTimeOffSuccess}</Text> : null}

        <Pressable
          style={[styles.submitButton, { backgroundColor: accent }, runtime.isSubmittingDriverTimeOff || !canSubmit ? styles.submitButtonDisabled : null]}
          onPress={() => {
            void runtime.submitDriverTimeOff({
              appointmentType,
              appointmentDate,
              note,
              excuseImageUrl
            });
          }}
          disabled={runtime.isSubmittingDriverTimeOff || !canSubmit}
        >
          {runtime.isSubmittingDriverTimeOff
            ? <ActivityIndicator color="#ffffff" />
            : <Text style={styles.submitButtonText}>Submit Time Off</Text>}
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    ...driverSharedStyles.card,
    gap: 12
  },
  headerCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#ffffff'
  },
  headerTitle: {
    color: driverTheme.colors.text,
    fontSize: 18,
    fontWeight: '800'
  },
  headerText: {
    color: driverTheme.colors.text,
    marginTop: 6,
    fontSize: 13
  },
  headerMeta: {
    marginTop: 8,
    color: driverTheme.colors.textMuted,
    fontWeight: '700',
    fontSize: 12
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    padding: 12,
    gap: 8
  },
  label: {
    color: driverTheme.colors.text,
    fontSize: 12,
    fontWeight: '700'
  },
  input: {
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: driverTheme.colors.text,
    backgroundColor: '#f8fafc'
  },
  noteInput: {
    minHeight: 80
  },
  photoWrap: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  photo: {
    width: '100%',
    height: 160,
    backgroundColor: '#e5e7eb'
  },
  removePhotoBtn: {
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#111827'
  },
  removePhotoText: {
    color: '#ffffff',
    fontWeight: '700'
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  processingText: {
    color: driverTheme.colors.textMuted,
    fontSize: 12
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 8
  },
  photoButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center'
  },
  photoButtonSecondary: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  photoButtonText: {
    color: '#ffffff',
    fontWeight: '800'
  },
  submitButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4
  },
  submitButtonDisabled: {
    opacity: 0.55
  },
  submitButtonText: {
    color: '#ffffff',
    fontWeight: '800'
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '700'
  },
  successText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700'
  }
});
