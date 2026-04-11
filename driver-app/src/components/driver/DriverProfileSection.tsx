import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { driverSharedStyles, driverTheme } from './driverTheme';

type Props = {
  runtime: DriverRuntime;
};

const getDocumentUri = (value: unknown) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const candidate = value as { dataUrl?: string; url?: string; path?: string };
    return String(candidate.dataUrl || candidate.url || candidate.path || '').trim();
  }
  return '';
};

export const DriverProfileSection = ({ runtime }: Props) => {
  const name = runtime.driverSession?.name || runtime.driverCode || 'Driver';
  const resolvedProfilePhotoUrl = runtime.driverSession?.profilePhotoUrl || getDocumentUri(runtime.driverDocuments.profilePhoto);
  const [draftName, setDraftName] = useState(name);
  const [draftPhone, setDraftPhone] = useState(runtime.driverSession?.phone || '');
  const [draftAddress, setDraftAddress] = useState(runtime.driverSession?.address || '');
  const [avatarUploadError, setAvatarUploadError] = useState('');

  useEffect(() => {
    setDraftName(runtime.driverSession?.name || runtime.driverCode || 'Driver');
    setDraftPhone(runtime.driverSession?.phone || '');
    setDraftAddress(runtime.driverSession?.address || '');
  }, [runtime.driverCode, runtime.driverSession]);

  const uploadSelectedAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!asset.uri) {
      setAvatarUploadError('Could not read selected image. Try another photo.');
      return;
    }

    const targetWidth = Number(asset.width) > 0 ? Math.min(Number(asset.width), 960) : 960;
    const optimized = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: targetWidth } }], {
      compress: 0.55,
      format: ImageManipulator.SaveFormat.JPEG
    });

    const fileName = `profile-photo-${Date.now()}.jpg`;
    const uploaded = await runtime.uploadDriverDocumentFile('profilePhoto', optimized.uri, 'image/jpeg', fileName);

    if (!uploaded) {
      setAvatarUploadError(runtime.documentsError || 'Unable to upload profile photo.');
    }
  };

  const pickProfilePhotoFromCamera = async () => {
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    if (cameraPermission.status !== 'granted') {
      setAvatarUploadError('No camera permission available.');
      return;
    }

    const cameraResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.55,
      allowsEditing: true,
      aspect: [1, 1]
    });

    if (cameraResult.canceled || !cameraResult.assets?.[0]) return;
    await uploadSelectedAsset(cameraResult.assets[0]);
  };

  const pickProfilePhoto = async () => {
    if (runtime.isUploadingDocument) return;
    setAvatarUploadError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.55,
        allowsEditing: true,
        aspect: [1, 1],
        selectionLimit: 1
      });

      if (result.canceled || !result.assets?.[0]) return;

      await uploadSelectedAsset(result.assets[0]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to choose photo.';
      if (/permission|access|denied|not granted/i.test(message)) {
        await pickProfilePhotoFromCamera();
      } else {
        setAvatarUploadError(message);
      }
    }
  };

  return <View style={driverSharedStyles.card}>
      <View style={styles.headerBlock}>
        <Pressable style={[styles.avatarButton, runtime.isUploadingDocument ? styles.avatarButtonDisabled : null]} onPress={() => void pickProfilePhoto()} disabled={runtime.isUploadingDocument}>
          <View style={styles.avatarBubble}>
            {resolvedProfilePhotoUrl
              ? <Image source={{ uri: resolvedProfilePhotoUrl }} style={styles.avatarImage} resizeMode="cover" />
              : <Image source={require('../../../assets/iconnew-cropped.png')} style={styles.avatarLogoFallback} resizeMode="contain" />}
          </View>
          <View style={styles.avatarBadge}>
            {runtime.isUploadingDocument ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.avatarBadgeText}>Photo</Text>}
          </View>
        </Pressable>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.photoHint}>Tap the round photo to upload or replace it.</Text>
      </View>

      <View style={styles.infoCard}>
        <InfoRow label="Driver code" value={runtime.driverSession?.driverCode || '-'} />
        <InfoRow label="Vehicle" value={runtime.driverSession?.vehicleId || 'Pending assignment'} />
        <InfoRow label="Shift" value={runtime.shiftState} />
        <InfoRow label="Base address" value={runtime.driverSession?.address || 'Not set'} />
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formLabel}>Name</Text>
        <TextInput value={draftName} onChangeText={setDraftName} style={styles.input} placeholder="Driver name" placeholderTextColor="#95a0c5" />

        <Text style={styles.formLabel}>Phone</Text>
        <TextInput value={draftPhone} onChangeText={setDraftPhone} style={styles.input} placeholder="Phone" placeholderTextColor="#95a0c5" keyboardType="phone-pad" />

        <Text style={styles.formLabel}>Address</Text>
        <TextInput value={draftAddress} onChangeText={setDraftAddress} style={styles.input} placeholder="Where vehicle sleeps / route start" placeholderTextColor="#95a0c5" />

        {runtime.profileError ? <Text style={styles.errorText}>{runtime.profileError}</Text> : null}
        {avatarUploadError ? <Text style={styles.errorText}>{avatarUploadError}</Text> : null}
        {!avatarUploadError && runtime.documentsError ? <Text style={styles.errorText}>{runtime.documentsError}</Text> : null}

        <Pressable style={styles.primaryButton} onPress={() => void runtime.updateDriverProfile({ name: draftName, phone: draftPhone, address: draftAddress })} disabled={runtime.isSavingProfile}>
          {runtime.isSavingProfile ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Save profile</Text>}
        </Pressable>
      </View>

      <Pressable style={styles.primaryButton} onPress={() => runtime.setActiveTab('settings')}>
        <Text style={styles.primaryButtonText}>Open settings</Text>
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={() => void runtime.signOut()}>
        <Text style={styles.secondaryButtonText}>Logout</Text>
      </Pressable>
    </View>;
};

const InfoRow = ({ label, value }: { label: string; value: string }) => <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>;

const styles = StyleSheet.create({
  headerBlock: {
    alignItems: 'center',
    gap: 8
  },
  avatarButton: {
    alignItems: 'center',
    gap: 10
  },
  avatarButtonDisabled: {
    opacity: 0.7
  },
  avatarBubble: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#ffffff'
  },
  avatarImage: {
    width: '100%',
    height: '100%'
  },
  avatarLogoFallback: {
    width: 62,
    height: 62
  },
  avatarBadge: {
    minWidth: 72,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: driverTheme.colors.headerBg
  },
  avatarBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  name: {
    color: driverTheme.colors.text,
    fontSize: 24,
    fontWeight: '800'
  },
  photoHint: {
    color: driverTheme.colors.textSoft,
    textAlign: 'center'
  },
  infoCard: {
    backgroundColor: driverTheme.colors.surfaceMuted,
    borderRadius: 20,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  formCard: {
    backgroundColor: driverTheme.colors.surfaceMuted,
    borderRadius: 20,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  formLabel: {
    color: driverTheme.colors.textSoft,
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '700'
  },
  input: {
    backgroundColor: driverTheme.colors.surfaceElevated,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    color: driverTheme.colors.text
  },
  infoRow: {
    gap: 4
  },
  infoLabel: {
    color: driverTheme.colors.textSoft,
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '700'
  },
  infoValue: {
    color: driverTheme.colors.text,
    fontWeight: '800'
  },
  primaryButton: {
    backgroundColor: driverTheme.colors.primary,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center'
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '800'
  },
  secondaryButton: {
    backgroundColor: driverTheme.colors.danger,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center'
  },
  secondaryButtonText: {
    color: '#b03050',
    fontWeight: '800'
  },
  errorText: {
    color: '#f0a7b3'
  }
});
