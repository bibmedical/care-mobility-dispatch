import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { driverSharedStyles, driverTheme } from './driverTheme';

type Props = {
  runtime: DriverRuntime;
};

const getInitials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('') || 'DR';

export const DriverProfileSection = ({ runtime }: Props) => {
  const name = runtime.driverSession?.name || runtime.driverCode || 'Driver';
  const [draftName, setDraftName] = useState(name);
  const [draftEmail, setDraftEmail] = useState(runtime.driverSession?.email || '');
  const [draftPhone, setDraftPhone] = useState(runtime.driverSession?.phone || '');
  const [avatarUploadError, setAvatarUploadError] = useState('');

  useEffect(() => {
    setDraftName(runtime.driverSession?.name || runtime.driverCode || 'Driver');
    setDraftEmail(runtime.driverSession?.email || '');
    setDraftPhone(runtime.driverSession?.phone || '');
  }, [runtime.driverCode, runtime.driverSession]);

  const pickProfilePhoto = async () => {
    setAvatarUploadError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setAvatarUploadError('Allow photo access to upload the driver photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
      base64: true
    });

    if (result.canceled || !result.assets?.[0]?.base64) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType || 'image/jpeg';
    const fileName = asset.fileName || `profile-photo-${Date.now()}.jpg`;
    const uploaded = await runtime.uploadDriverDocument('profilePhoto', `data:${mimeType};base64,${asset.base64}`, fileName);

    if (!uploaded) {
      setAvatarUploadError(runtime.documentsError || 'Unable to upload profile photo.');
    }
  };

  return <View style={driverSharedStyles.card}>
      <View style={styles.headerBlock}>
        <Pressable style={styles.avatarButton} onPress={() => void pickProfilePhoto()}>
          <View style={styles.avatarBubble}>
            {runtime.driverSession?.profilePhotoUrl ? <Image source={{ uri: runtime.driverSession.profilePhotoUrl }} style={styles.avatarImage} resizeMode="cover" /> : <Text style={styles.avatarText}>{getInitials(name)}</Text>}
          </View>
          <View style={styles.avatarBadge}>
            {runtime.isUploadingDocument ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.avatarBadgeText}>Photo</Text>}
          </View>
        </Pressable>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.subline}>{runtime.driverSession?.email || runtime.driverSession?.username || 'No email set'}</Text>
        <Text style={styles.photoHint}>Tap the round photo to upload or replace it.</Text>
      </View>

      <View style={styles.infoCard}>
        <InfoRow label="Driver code" value={runtime.driverSession?.driverCode || '-'} />
        <InfoRow label="Vehicle" value={runtime.driverSession?.vehicleId || 'Pending assignment'} />
        <InfoRow label="Shift" value={runtime.shiftState} />
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formLabel}>Name</Text>
        <TextInput value={draftName} onChangeText={setDraftName} style={styles.input} placeholder="Driver name" placeholderTextColor="#95a0c5" />

        <Text style={styles.formLabel}>Email</Text>
        <TextInput value={draftEmail} onChangeText={setDraftEmail} style={styles.input} placeholder="Email" placeholderTextColor="#95a0c5" autoCapitalize="none" keyboardType="email-address" />

        <Text style={styles.formLabel}>Phone</Text>
        <TextInput value={draftPhone} onChangeText={setDraftPhone} style={styles.input} placeholder="Phone" placeholderTextColor="#95a0c5" keyboardType="phone-pad" />

        {runtime.profileError ? <Text style={styles.errorText}>{runtime.profileError}</Text> : null}
        {avatarUploadError ? <Text style={styles.errorText}>{avatarUploadError}</Text> : null}
        {!avatarUploadError && runtime.documentsError ? <Text style={styles.errorText}>{runtime.documentsError}</Text> : null}

        <Pressable style={styles.primaryButton} onPress={() => void runtime.updateDriverProfile({ name: draftName, email: draftEmail, phone: draftPhone })} disabled={runtime.isSavingProfile}>
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
  avatarBubble: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: driverTheme.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: driverTheme.colors.primary
  },
  avatarImage: {
    width: '100%',
    height: '100%'
  },
  avatarText: {
    color: '#2d3b4c',
    fontSize: 30,
    fontWeight: '800'
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
  subline: {
    color: driverTheme.colors.textMuted
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
