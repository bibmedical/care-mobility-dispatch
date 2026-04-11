import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { formatShortClock } from './driverUtils';
import { DriverMessage } from '../../types/driver';
import { driverTheme } from './driverTheme';
import { compressImageToJpegDataUrl } from '../../utils/imageCompression';

type Props = {
  runtime: DriverRuntime;
};

export const DriverMessagesSection = ({ runtime }: Props) => {
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [selectedPhotoDataUrl, setSelectedPhotoDataUrl] = useState('');
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [keyboardInset, setKeyboardInset] = useState(0);
  const pinnedDispatchers = ['Lexy', 'Balbino', 'Robert', 'Carlos'];

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, event => {
      const height = Number(event?.endCoordinates?.height || 0);
      setKeyboardInset(Math.max(0, height - 12));
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardInset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const getThreadName = (message: DriverMessage) => {
    const subject = String(message.subject || '');
    const taggedRecipient = subject.match(/\[(?:To|From):\s*([^\]]+)\]/i)?.[1]?.trim();
    if (taggedRecipient) return taggedRecipient;
    const senderMatch = subject.match(/from\s+([A-Za-z ]+)$/i)?.[1]?.trim();
    if (senderMatch) return senderMatch;
    return 'Dispatch';
  };

  const isOutgoing = (message: DriverMessage) => String(message.source || '').toLowerCase() === 'mobile-driver-app';

  const threads = useMemo(() => {
    const groups = new Map<string, DriverMessage[]>();

    [...pinnedDispatchers, 'Dispatch'].forEach(name => groups.set(name, []));
    runtime.messages.forEach(message => {
      const key = getThreadName(message);
      const current = groups.get(key) || [];
      groups.set(key, [...current, message]);
    });

    return Array.from(groups.entries()).map(([name, messages]) => ({
      name,
      messages: [...messages].sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
    })).sort((a, b) => {
      const left = a.messages[a.messages.length - 1]?.createdAt || '';
      const right = b.messages[b.messages.length - 1]?.createdAt || '';
      return new Date(right).getTime() - new Date(left).getTime();
    });
  }, [runtime.messages]);

  const selectedMessages = threads.find(thread => thread.name === selectedThread)?.messages || [];

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        allowsEditing: true
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      const compressedDataUrl = await compressImageToJpegDataUrl(result.assets[0].uri, {
        maxSide: 1080,
        initialQuality: 0.46,
        maxApproxBytes: 300_000
      });
      setSelectedPhotoDataUrl(compressedDataUrl);
    } catch {
      setSelectedPhotoDataUrl('');
    }
  };

  const sendCurrentMessage = async () => {
    const sent = await runtime.sendDriverMessage(selectedThread || undefined, selectedPhotoDataUrl ? {
      mediaUrl: selectedPhotoDataUrl,
      mediaType: 'image'
    } : undefined);

    if (sent) {
      setSelectedPhotoDataUrl('');
    }
  };

  if (!selectedThread) {
    return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>Messages</Text>
          <Pressable style={styles.newMessageButton} onPress={() => setSelectedThread('Lexy')}>
            <Text style={styles.newMessageText}>New</Text>
          </Pressable>
        </View>

        <View style={styles.debugCard}>
          <View style={styles.debugRow}>
            <Text style={styles.debugLabel}>Messages</Text>
            <Text style={styles.debugValue}>{String(runtime.messages.length)}</Text>
          </View>
          {runtime.isLoadingMessages ? <Text style={styles.syncingText}>Syncing messages...</Text> : null}
          <Pressable style={styles.debugRefreshButton} onPress={() => void runtime.reloadMessages()}>
            <Text style={styles.debugRefreshText}>Refresh messages</Text>
          </Pressable>
          {runtime.messagesError ? <Text style={styles.debugErrorText}>{runtime.messagesError}</Text> : null}
        </View>

        <ScrollView contentContainerStyle={styles.listWrap} keyboardShouldPersistTaps="handled">
          {threads.map(thread => {
          const lastMessage = thread.messages[thread.messages.length - 1];
          const unread = thread.messages.filter(message => !isOutgoing(message) && (message.status === 'active' || message.priority === 'high')).length;
          return <Pressable key={thread.name} style={styles.threadRow} onPress={() => setSelectedThread(thread.name)}>
                <View style={styles.avatarCircle}><Text style={styles.avatarLabel}>{thread.name.slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.threadCopy}>
                  <Text style={styles.threadName}>{thread.name}</Text>
                  <Text numberOfLines={1} style={styles.threadPreview}>{lastMessage?.body || 'Start a conversation'}</Text>
                </View>
                <View style={styles.threadMeta}>
                  <Text style={styles.threadTime}>{formatShortClock(lastMessage?.createdAt)}</Text>
                  {unread > 0 ? <View style={styles.unreadBadge}><Text style={styles.unreadText}>{unread}</Text></View> : null}
                </View>
              </Pressable>;
        })}
        </ScrollView>
      </KeyboardAvoidingView>;
  }

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
      <View style={styles.chatHeader}>
        <Pressable onPress={() => setSelectedThread(null)}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.chatTitle}>{selectedThread}</Text>
        <View style={styles.chatHeaderSpacer} />
      </View>

      <Text style={styles.dayLabel}>Today</Text>

      <ScrollView style={styles.chatScroll} contentContainerStyle={styles.chatBody} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          {selectedMessages.length === 0 ? <Text style={styles.emptyText}>No messages yet. Send the first message.</Text> : selectedMessages.map(message => <View key={message.id} style={[styles.bubble, isOutgoing(message) ? styles.bubbleOutgoing : styles.bubbleIncoming]}>
              <Text style={[styles.bubbleText, isOutgoing(message) ? styles.bubbleTextOutgoing : null]}>{message.body}</Text>
            {(String(message.mediaType || '').toLowerCase() === 'image' || String(message.mediaType || '').toLowerCase().startsWith('image/')) && message.mediaUrl ? <Pressable onPress={() => setPreviewImageUrl(message.mediaUrl || '')}>
            <Image source={{ uri: message.mediaUrl }} style={styles.bubbleImage} resizeMode="cover" />
              </Pressable> : null}
              <Text style={[styles.bubbleTime, isOutgoing(message) ? styles.bubbleTimeOutgoing : null]}>{formatShortClock(message.createdAt)}</Text>
            </View>)}
      </ScrollView>

      {selectedPhotoDataUrl ? <View style={styles.attachmentPreviewCard}>
          <Image source={{ uri: selectedPhotoDataUrl }} style={styles.attachmentPreviewImage} resizeMode="cover" />
          <Pressable onPress={() => setSelectedPhotoDataUrl('')} style={styles.removeAttachmentButton}>
            <Text style={styles.removeAttachmentText}>Remove photo</Text>
          </Pressable>
        </View> : null}

      <View style={[styles.composer, keyboardInset > 0 ? { marginBottom: keyboardInset } : null]}>
        <TextInput value={runtime.messageDraft} onChangeText={runtime.setMessageDraft} placeholder="Type a message..." placeholderTextColor="#a6afbb" style={styles.composerInput} multiline textAlignVertical="top" />
        <Pressable style={styles.attachButton} onPress={() => void pickPhoto()}>
          <Text style={styles.attachButtonText}>+</Text>
        </Pressable>
        <Pressable style={styles.sendButton} onPress={() => void sendCurrentMessage()}>
          {runtime.isSendingMessage ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.sendButtonText}>➤</Text>}
        </Pressable>
      </View>

      <Modal visible={Boolean(previewImageUrl)} transparent animationType="fade" onRequestClose={() => setPreviewImageUrl('')}>
        <View style={styles.previewOverlay}>
          <Pressable style={styles.previewBackdrop} onPress={() => setPreviewImageUrl('')} />
          <View style={styles.previewCard}>
            {previewImageUrl ? <Image source={{ uri: previewImageUrl }} style={styles.previewImage} resizeMode="contain" /> : null}
            <Pressable onPress={() => setPreviewImageUrl('')} style={styles.previewCloseButton}>
              <Text style={styles.previewCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {runtime.messagesError ? <Text style={styles.errorText}>{runtime.messagesError}</Text> : null}
    </KeyboardAvoidingView>;
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.xl,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  chatScroll: {
    flex: 1,
    minHeight: 320
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  pageTitle: {
    color: driverTheme.colors.text,
    fontSize: 28,
    fontWeight: '800'
  },
  newMessageButton: {
    backgroundColor: driverTheme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: driverTheme.radius.sm
  },
  newMessageText: {
    color: '#ffffff',
    fontWeight: '800'
  },
  listWrap: {
    gap: 6,
    paddingBottom: 8
  },
  debugCard: {
    backgroundColor: driverTheme.colors.info,
    borderRadius: driverTheme.radius.md,
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    padding: 10,
    gap: 6
  },
  debugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  debugLabel: {
    color: driverTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700'
  },
  debugValue: {
    flex: 1,
    color: driverTheme.colors.text,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right'
  },
  syncingText: {
    color: driverTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700'
  },
  debugRefreshButton: {
    marginTop: 2,
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    borderRadius: driverTheme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  debugRefreshText: {
    color: driverTheme.colors.primaryText,
    fontWeight: '800',
    fontSize: 12
  },
  debugErrorText: {
    color: '#b03050',
    fontSize: 12,
    lineHeight: 18
  },
  threadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: driverTheme.radius.sm,
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    backgroundColor: driverTheme.colors.surfaceMuted
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: driverTheme.radius.sm,
    backgroundColor: driverTheme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarLabel: {
    color: driverTheme.colors.primaryText,
    fontWeight: '800'
  },
  threadCopy: {
    flex: 1,
    gap: 3
  },
  threadName: {
    color: driverTheme.colors.text,
    fontSize: 17,
    fontWeight: '700'
  },
  threadPreview: {
    color: driverTheme.colors.textSoft
  },
  threadMeta: {
    alignItems: 'flex-end',
    gap: 6
  },
  threadTime: {
    color: driverTheme.colors.textSoft,
    fontSize: 12
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: driverTheme.radius.sm,
    paddingHorizontal: 6,
    backgroundColor: driverTheme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  unreadText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800'
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: driverTheme.colors.border
  },
  backText: {
    color: driverTheme.colors.text,
    fontWeight: '900',
    fontSize: 18
  },
  chatTitle: {
    color: driverTheme.colors.text,
    fontSize: 18,
    fontWeight: '800'
  },
  chatHeaderSpacer: {
    width: 34
  },
  dayLabel: {
    color: driverTheme.colors.textSoft,
    textAlign: 'center',
    fontSize: 11,
    marginTop: 6
  },
  chatBody: {
    gap: 8,
    paddingBottom: 12,
    flexGrow: 1
  },
  bubble: {
    maxWidth: '84%',
    borderRadius: driverTheme.radius.md,
    padding: 14,
    gap: 6
  },
  bubbleIncoming: {
    alignSelf: 'flex-start',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  bubbleOutgoing: {
    alignSelf: 'flex-end',
    backgroundColor: driverTheme.colors.headerBg
  },
  bubbleText: {
    color: driverTheme.colors.text,
    lineHeight: 20
  },
  bubbleTextOutgoing: {
    color: '#ffffff'
  },
  bubbleImage: {
    width: 210,
    height: 210,
    borderRadius: driverTheme.radius.sm,
    marginTop: 2
  },
  bubbleTime: {
    color: driverTheme.colors.textSoft,
    fontSize: 11,
    alignSelf: 'flex-end'
  },
  bubbleTimeOutgoing: {
    color: 'rgba(255,255,255,0.85)'
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: driverTheme.colors.surfaceMuted,
    borderRadius: driverTheme.radius.md,
    padding: 8,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  attachButton: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.sm,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  attachButtonText: {
    color: driverTheme.colors.textMuted,
    fontWeight: '900',
    fontSize: 17
  },
  composerInput: {
    flex: 1,
    color: driverTheme.colors.text,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderRadius: driverTheme.radius.sm,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  sendButton: {
    backgroundColor: driverTheme.colors.primary,
    borderRadius: driverTheme.radius.sm,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sendButtonText: {
    color: '#ffffff',
    fontWeight: '900'
  },
  errorText: {
    color: '#c6465f',
    fontSize: 12,
    lineHeight: 18
  },
  emptyText: {
    color: driverTheme.colors.textSoft
  },
  attachmentPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: driverTheme.colors.surfaceMuted,
    borderRadius: driverTheme.radius.md,
    padding: 8,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  attachmentPreviewImage: {
    width: 56,
    height: 56,
    borderRadius: driverTheme.radius.sm
  },
  removeAttachmentButton: {
    backgroundColor: '#ffffff',
    borderRadius: driverTheme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  removeAttachmentText: {
    color: driverTheme.colors.textMuted,
    fontWeight: '700'
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18
  },
  previewBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  },
  previewCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: driverTheme.radius.lg,
    padding: 12,
    gap: 10
  },
  previewImage: {
    width: '100%',
    height: 420,
    borderRadius: driverTheme.radius.sm,
    backgroundColor: driverTheme.colors.surfaceMuted
  },
  previewCloseButton: {
    alignSelf: 'center',
    backgroundColor: driverTheme.colors.primary,
    borderRadius: driverTheme.radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  previewCloseText: {
    color: '#ffffff',
    fontWeight: '800'
  }
});