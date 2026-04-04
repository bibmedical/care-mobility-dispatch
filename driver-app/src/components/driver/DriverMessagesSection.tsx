import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { formatShortClock } from './driverUtils';
import { DriverMessage } from '../../types/driver';

type Props = {
  runtime: DriverRuntime;
};

export const DriverMessagesSection = ({ runtime }: Props) => {
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [selectedPhotoDataUrl, setSelectedPhotoDataUrl] = useState('');
  const pinnedDispatchers = ['Lexy', 'Balbino', 'Robert', 'Carlos'];

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
        quality: 0.35,
        base64: true,
        allowsEditing: true
      });

      if (result.canceled || !result.assets?.[0]?.base64) return;

      setSelectedPhotoDataUrl(`data:image/jpeg;base64,${result.assets[0].base64}`);
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
    return <View style={styles.screen}>
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>Messages</Text>
          <Pressable style={styles.newMessageButton} onPress={() => setSelectedThread('Lexy')}>
            <Text style={styles.newMessageText}>New</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.listWrap}>
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
      </View>;
  }

  return <View style={styles.screen}>
      <View style={styles.chatHeader}>
        <Pressable onPress={() => setSelectedThread(null)}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.chatTitle}>{selectedThread}</Text>
        <View style={styles.chatHeaderSpacer} />
      </View>

      <Text style={styles.dayLabel}>Today</Text>

      <ScrollView style={styles.chatScroll} contentContainerStyle={styles.chatBody}>
        {selectedMessages.length === 0 ? <Text style={styles.emptyText}>No messages yet. Send the first message.</Text> : selectedMessages.map(message => <View key={message.id} style={[styles.bubble, isOutgoing(message) ? styles.bubbleOutgoing : styles.bubbleIncoming]}>
              <Text style={[styles.bubbleText, isOutgoing(message) ? styles.bubbleTextOutgoing : null]}>{message.body}</Text>
              {message.mediaType === 'image' && message.mediaUrl ? <Image source={{ uri: message.mediaUrl }} style={styles.bubbleImage} resizeMode="cover" /> : null}
              <Text style={[styles.bubbleTime, isOutgoing(message) ? styles.bubbleTimeOutgoing : null]}>{formatShortClock(message.createdAt)}</Text>
            </View>)}
      </ScrollView>

      {selectedPhotoDataUrl ? <View style={styles.attachmentPreviewCard}>
          <Image source={{ uri: selectedPhotoDataUrl }} style={styles.attachmentPreviewImage} resizeMode="cover" />
          <Pressable onPress={() => setSelectedPhotoDataUrl('')} style={styles.removeAttachmentButton}>
            <Text style={styles.removeAttachmentText}>Remove photo</Text>
          </Pressable>
        </View> : null}

      <View style={styles.composer}>
        <TextInput value={runtime.messageDraft} onChangeText={runtime.setMessageDraft} placeholder="Type a message..." placeholderTextColor="#a6afbb" style={styles.composerInput} multiline />
        <Pressable style={styles.attachButton} onPress={() => void pickPhoto()}>
          <Text style={styles.attachButtonText}>+</Text>
        </Pressable>
        <Pressable style={styles.sendButton} onPress={() => void sendCurrentMessage()}>
          {runtime.isSendingMessage ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.sendButtonText}>➤</Text>}
        </Pressable>
      </View>

      {runtime.messagesError ? <Text style={styles.errorText}>{runtime.messagesError}</Text> : null}
    </View>;
};

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#f3f4f7',
    borderRadius: 22,
    padding: 14,
    minHeight: 620,
    gap: 10
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
    color: '#1f2b36',
    fontSize: 28,
    fontWeight: '800'
  },
  newMessageButton: {
    backgroundColor: '#3263ff',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999
  },
  newMessageText: {
    color: '#ffffff',
    fontWeight: '800'
  },
  listWrap: {
    gap: 6,
    paddingBottom: 8
  },
  threadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e4e8ef',
    backgroundColor: '#ffffff'
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#dce4f8',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarLabel: {
    color: '#30425f',
    fontWeight: '800'
  },
  threadCopy: {
    flex: 1,
    gap: 3
  },
  threadName: {
    color: '#23313f',
    fontSize: 17,
    fontWeight: '700'
  },
  threadPreview: {
    color: '#8a97a8'
  },
  threadMeta: {
    alignItems: 'flex-end',
    gap: 6
  },
  threadTime: {
    color: '#97a2b2',
    fontSize: 12
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: '#3263ff',
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
    borderBottomColor: '#e4e8ef'
  },
  backText: {
    color: '#1f2b36',
    fontWeight: '900',
    fontSize: 18
  },
  chatTitle: {
    color: '#1f2b36',
    fontSize: 18,
    fontWeight: '800'
  },
  chatHeaderSpacer: {
    width: 34
  },
  dayLabel: {
    color: '#a5adb9',
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
    borderRadius: 16,
    padding: 14,
    gap: 6
  },
  bubbleIncoming: {
    alignSelf: 'flex-start',
    backgroundColor: '#f4c326'
  },
  bubbleOutgoing: {
    alignSelf: 'flex-end',
    backgroundColor: '#3263ff'
  },
  bubbleText: {
    color: '#ffffff',
    lineHeight: 20
  },
  bubbleTextOutgoing: {
    color: '#ffffff'
  },
  bubbleImage: {
    width: 210,
    height: 210,
    borderRadius: 12,
    marginTop: 2
  },
  bubbleTime: {
    color: 'rgba(255,255,255,0.8)',
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
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e1e6ee'
  },
  attachButton: {
    backgroundColor: '#eef2f8',
    borderRadius: 999,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center'
  },
  attachButtonText: {
    color: '#5c6f86',
    fontWeight: '900',
    fontSize: 17
  },
  composerInput: {
    flex: 1,
    color: '#263646',
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e8ef'
  },
  sendButton: {
    backgroundColor: '#3263ff',
    borderRadius: 999,
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
    color: '#95a3b5'
  },
  attachmentPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e1e6ee'
  },
  attachmentPreviewImage: {
    width: 56,
    height: 56,
    borderRadius: 10
  },
  removeAttachmentButton: {
    backgroundColor: '#eef2f8',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  removeAttachmentText: {
    color: '#4d6077',
    fontWeight: '700'
  }
});