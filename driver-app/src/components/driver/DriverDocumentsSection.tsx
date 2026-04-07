import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { driverSharedStyles, driverTheme } from './driverTheme';
import { DriverDocumentValue, DriverDocuments } from '../../types/driver';

type Props = {
  runtime: DriverRuntime;
};

export const DriverDocumentsSection = ({ runtime }: Props) => {
  const [activeUploadKey, setActiveUploadKey] = useState<keyof DriverDocuments | ''>('');

  const documents: Array<{ key: keyof DriverDocuments; title: string; detail: string }> = [
    { key: 'licenseFront', title: 'License front', detail: 'Front side of the driver license' },
    { key: 'licenseBack', title: 'License back', detail: 'Back side of the driver license' },
    { key: 'insuranceCertificate', title: 'Insurance certificate', detail: 'Current insurance card or certificate' },
    { key: 'w9Document', title: 'W-9 document', detail: 'Signed W-9 form used by dispatch/admin' },
    { key: 'trainingCertificate', title: 'Training certificate', detail: 'Driver training or onboarding certificate' }
  ];

  const getDocumentMeta = (value: DriverDocumentValue) => {
    if (!value) {
      return {
        label: 'Missing',
        updatedAt: 'Upload needed',
        previewUri: ''
      };
    }

    if (typeof value === 'string') {
      return {
        label: 'Saved on file',
        updatedAt: '',
        previewUri: value
      };
    }

    return {
      label: value.name || 'Saved on file',
      updatedAt: value.updatedAt ? new Date(value.updatedAt).toLocaleString() : '',
      previewUri: value.dataUrl || value.url || value.path || ''
    };
  };

  const pickAndUpload = async (documentKey: keyof DriverDocuments) => {
    setActiveUploadKey(documentKey);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setActiveUploadKey('');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: documentKey === 'profilePhoto',
      base64: true
    });

    if (result.canceled || !result.assets?.[0]?.base64) {
      setActiveUploadKey('');
      return;
    }

    const asset = result.assets[0];
    const mimeType = asset.mimeType || 'image/jpeg';
    const fallbackFileName = `${documentKey}-${Date.now()}.jpg`;
    await runtime.uploadDriverDocument(documentKey, `data:${mimeType};base64,${asset.base64}`, asset.fileName || fallbackFileName);
    setActiveUploadKey('');
  };

  const profilePhotoMeta = getDocumentMeta(runtime.driverDocuments.profilePhoto);

  return <ScrollView contentContainerStyle={styles.screen}>
      <View style={driverSharedStyles.card}>
        <Text style={driverSharedStyles.eyebrow}>Documents</Text>
        <Text style={driverSharedStyles.title}>Driver records synced with the website</Text>
        <Text style={driverSharedStyles.body}>This screen now reads the same saved documents from the backend used by the web. Upload a clear photo or scan to replace any missing file.</Text>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View>
            <Text style={styles.summaryTitle}>{runtime.driverSession?.name || 'Driver'}</Text>
            <Text style={styles.summarySubline}>{runtime.driverSession?.vehicleId || 'Pending assignment'}</Text>
          </View>
          <Pressable style={styles.refreshButton} onPress={() => void runtime.reloadDriverDocuments()}>
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </Pressable>
        </View>

        <View style={styles.profileStrip}>
          <View style={styles.profilePhotoFrame}>
            {runtime.driverSession?.profilePhotoUrl || profilePhotoMeta.previewUri ? <Image source={{ uri: runtime.driverSession?.profilePhotoUrl || profilePhotoMeta.previewUri }} style={styles.profilePhoto} resizeMode="cover" /> : <Text style={styles.profilePhotoPlaceholder}>No photo</Text>}
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.profileLabel}>Profile photo</Text>
            <Text style={styles.profileValue}>{profilePhotoMeta.label}</Text>
            <Text style={styles.profileHint}>{profilePhotoMeta.updatedAt || 'Upload from Profile or here if needed.'}</Text>
          </View>
        </View>

        <Row label="Status" value={runtime.loggedIn ? 'Active session' : 'Logged out'} />
        <Row label="Email" value={runtime.driverSession?.email || runtime.driverSession?.username || 'No email'} />
      </View>

      {runtime.documentsError ? <Text style={styles.errorText}>{runtime.documentsError}</Text> : null}
      {runtime.isLoadingDocuments ? <View style={styles.loadingCard}>
          <ActivityIndicator color={driverTheme.colors.primary} />
          <Text style={styles.loadingText}>Loading saved documents...</Text>
        </View> : null}

      {documents.map(item => {
      const meta = getDocumentMeta(runtime.driverDocuments[item.key]);
      const isUploadingThisCard = runtime.isUploadingDocument && activeUploadKey === item.key;
      return <View key={item.key} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.detail}</Text>
              </View>
              <View style={[styles.statusBadge, meta.previewUri ? styles.statusBadgeReady : styles.statusBadgeMissing]}>
                <Text style={[styles.statusBadgeText, meta.previewUri ? styles.statusBadgeTextReady : styles.statusBadgeTextMissing]}>{meta.previewUri ? 'Saved' : 'Missing'}</Text>
              </View>
            </View>

            {meta.previewUri ? <Image source={{ uri: meta.previewUri }} style={styles.previewImage} resizeMode="cover" /> : <View style={styles.emptyPreview}>
                <Text style={styles.emptyPreviewText}>No file uploaded yet</Text>
              </View>}

            <Row label="Saved file" value={meta.label} />
            <Row label="Last update" value={meta.updatedAt || 'No timestamp available'} />

            <Pressable style={styles.uploadButton} onPress={() => void pickAndUpload(item.key)} disabled={runtime.isUploadingDocument}>
              {isUploadingThisCard ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.uploadButtonText}>{meta.previewUri ? 'Replace file' : 'Upload file'}</Text>}
            </Pressable>
          </View>;
    })}
    </ScrollView>;
};

const Row = ({ label, value }: { label: string; value: string }) => <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>;

const styles = StyleSheet.create({
  screen: {
    gap: 14,
    paddingBottom: 28
  },
  summaryCard: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: 24,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12
  },
  summaryTitle: {
    color: driverTheme.colors.text,
    fontSize: 22,
    fontWeight: '800'
  },
  summarySubline: {
    color: driverTheme.colors.textSoft,
    marginTop: 4,
    fontWeight: '700'
  },
  refreshButton: {
    backgroundColor: driverTheme.colors.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  refreshButtonText: {
    color: '#ffffff',
    fontWeight: '800'
  },
  profileStrip: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center'
  },
  profilePhotoFrame: {
    width: 76,
    height: 76,
    borderRadius: 38,
    overflow: 'hidden',
    backgroundColor: driverTheme.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center'
  },
  profilePhoto: {
    width: '100%',
    height: '100%'
  },
  profilePhotoPlaceholder: {
    color: driverTheme.colors.textSoft,
    fontWeight: '700'
  },
  profileCopy: {
    flex: 1,
    gap: 4
  },
  profileLabel: {
    color: driverTheme.colors.primaryText,
    textTransform: 'uppercase',
    fontSize: 12,
    fontWeight: '800'
  },
  profileValue: {
    color: driverTheme.colors.text,
    fontWeight: '800'
  },
  profileHint: {
    color: driverTheme.colors.textSoft
  },
  loadingCard: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: 20,
    padding: 18,
    gap: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  loadingText: {
    color: driverTheme.colors.textMuted
  },
  card: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: 22,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  cardHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    justifyContent: 'space-between'
  },
  cardCopy: {
    flex: 1,
    gap: 4
  },
  cardTitle: {
    color: driverTheme.colors.text,
    fontSize: 18,
    fontWeight: '800'
  },
  cardBody: {
    color: driverTheme.colors.textMuted,
    lineHeight: 20
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  statusBadgeReady: {
    backgroundColor: driverTheme.colors.accentSoft
  },
  statusBadgeMissing: {
    backgroundColor: driverTheme.colors.danger
  },
  statusBadgeText: {
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase'
  },
  statusBadgeTextReady: {
    color: driverTheme.colors.primaryText
  },
  statusBadgeTextMissing: {
    color: '#f0a7b3'
  },
  previewImage: {
    width: '100%',
    height: 170,
    borderRadius: 16,
    backgroundColor: driverTheme.colors.surfaceElevated
  },
  emptyPreview: {
    height: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: driverTheme.colors.borderStrong,
    borderStyle: 'dashed',
    backgroundColor: driverTheme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyPreviewText: {
    color: driverTheme.colors.textSoft,
    fontWeight: '700'
  },
  row: {
    gap: 4
  },
  rowLabel: {
    color: driverTheme.colors.textSoft,
    textTransform: 'uppercase',
    fontWeight: '700',
    fontSize: 12
  },
  rowValue: {
    color: driverTheme.colors.text,
    fontWeight: '800'
  },
  uploadButton: {
    backgroundColor: driverTheme.colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center'
  },
  uploadButtonText: {
    color: '#ffffff',
    fontWeight: '800'
  },
  errorText: {
    color: '#f0a7b3'
  }
});
