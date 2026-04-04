'use client';

import IconifyIcon from '@/components/wrappers/IconifyIcon';
import { useNemtContext } from '@/context/useNemtContext';
import { useNotificationContext } from '@/context/useNotificationContext';
import { formatDispatchTime } from '@/helpers/nemt-dispatch-state';
import { normalizePhoneDigits } from '@/helpers/system-users';
import useUserPreferencesApi from '@/hooks/useUserPreferencesApi';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Form, Modal } from 'react-bootstrap';

const greenToolbarButtonStyle = {
  color: '#08131a',
  borderColor: 'rgba(8, 19, 26, 0.35)',
  backgroundColor: 'transparent'
};

const MOBILE_ALERT_POLL_MS = 5000;

const DRIVER_ALERT_SMS_TEMPLATES = {
  'delay-alert': driverName => `Dispatch update for ${driverName}: we received your delay alert. Send your best ETA as soon as traffic clears or conditions change.`,
  'backup-driver-request': driverName => `Dispatch update for ${driverName}: we are reviewing backup driver coverage now. Stay with the trip until dispatch confirms the swap.`,
  'uber-request': driverName => `Dispatch update for ${driverName}: dispatch is reviewing Uber backup coverage now. Keep dispatch updated before leaving the trip.`,
  fallback: driverName => `Dispatch update for ${driverName}: your alert was received. Keep dispatch updated and wait for coverage instructions.`
};

const MOBILE_DRIVER_ALERT_TYPES = new Set(['delay-alert', 'backup-driver-request', 'uber-request']);

const CHAT_THEME_OPTIONS = {
  ocean: {
    label: 'Ocean',
    activeThread: '#3157c7',
    activeThreadText: '#ffffff',
    activeThreadSubtle: 'rgba(255,255,255,0.72)',
    outgoingBubble: '#3157c7',
    outgoingText: '#ffffff',
    outgoingMeta: 'rgba(255,255,255,0.72)',
    incomingBubble: '#eff6ff',
    incomingBorder: '#bfdbfe',
    incomingText: '#0f172a',
    incomingMeta: '#64748b',
    accent: '#3157c7'
  },
  emerald: {
    label: 'Emerald',
    activeThread: '#0f766e',
    activeThreadText: '#ffffff',
    activeThreadSubtle: 'rgba(255,255,255,0.72)',
    outgoingBubble: '#0f766e',
    outgoingText: '#ffffff',
    outgoingMeta: 'rgba(255,255,255,0.72)',
    incomingBubble: '#ecfdf5',
    incomingBorder: '#a7f3d0',
    incomingText: '#052e2b',
    incomingMeta: '#4b5563',
    accent: '#10b981'
  },
  sunset: {
    label: 'Sunset',
    activeThread: '#c2410c',
    activeThreadText: '#ffffff',
    activeThreadSubtle: 'rgba(255,255,255,0.72)',
    outgoingBubble: '#c2410c',
    outgoingText: '#ffffff',
    outgoingMeta: 'rgba(255,255,255,0.72)',
    incomingBubble: '#fff7ed',
    incomingBorder: '#fdba74',
    incomingText: '#431407',
    incomingMeta: '#7c2d12',
    accent: '#f97316'
  }
};

const NOTIFICATION_TONE_OPTIONS = {
  classic: { label: 'Classic' },
  soft: { label: 'Soft' },
  urgent: { label: 'Urgent' },
  custom: { label: 'My Sound' },
  silent: { label: 'Silent' }
};

const COORDINATE_LIKE_TEXT = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/;

const getAlertVariant = priority => {
  if (priority === 'high' || priority === 'urgent') return 'danger';
  if (priority === 'normal') return 'warning';
  return 'secondary';
};

const getAlertSurfaceStyle = alert => {
  if (alert?.type === 'uber-request') return { backgroundColor: '#fff1f2', borderColor: '#be123c', borderWidth: 2 };
  if (alert?.type === 'backup-driver-request') return { backgroundColor: '#eff6ff', borderColor: '#1d4ed8', borderWidth: 2 };
  if (alert?.type === 'delay-alert') return { backgroundColor: '#fff7ed', borderColor: '#ea580c', borderWidth: 2 };
  if (alert?.priority === 'high' || alert?.priority === 'urgent') return { backgroundColor: '#fef2f2', borderColor: '#b91c1c', borderWidth: 2 };
  return { backgroundColor: '#fff8e1', borderColor: '#f59e0b', borderWidth: 1 };
};

const getAlertLabel = alert => {
  if (alert?.type === 'delay-alert') return 'Late ETA';
  if (alert?.type === 'backup-driver-request') return 'Backup Driver';
  if (alert?.type === 'uber-request') return 'Uber Coverage';
  return 'Driver Alert';
};

const logSystemActivity = async (eventLabel, target = '', metadata = null) => {
  try {
    await fetch('/api/system-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventLabel, target, metadata })
    });
  } catch (error) {
    console.error('Error recording dispatcher messaging activity:', error);
  }
};

const readJsonResponse = async response => {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const rawText = await response.text();
  if (!rawText) return {};
  if (!contentType.includes('application/json')) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Your session expired or this account cannot open dispatcher alerts.');
    }
    throw new Error('Driver alerts API returned HTML instead of JSON.');
  }
  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error('Driver alerts API returned invalid JSON.');
  }
};

const mergeThreads = (threads, drivers) => {
  const existingThreads = Array.isArray(threads) ? threads : [];
  const byDriverId = new Map(existingThreads.map(thread => [thread.driverId, thread]));
  return drivers.map(driver => byDriverId.get(driver.id) ?? {
    driverId: driver.id,
    messages: []
  });
};

const getDriverLocationLabel = driver => {
  const checkpoint = String(driver?.checkpoint || '').trim();
  if (checkpoint && !COORDINATE_LIKE_TEXT.test(checkpoint)) return checkpoint;
  if (Array.isArray(driver?.position) && driver.position.length === 2) return 'Live location';
  return 'No GPS location';
};

const DispatcherMessagingPanel = ({
  drivers,
  selectedDriverId,
  setSelectedDriverId,
  onLocateDriver,
  openFullChat
}) => {
  const { data: session } = useSession();
  const { showNotification } = useNotificationContext();
  const {
    dispatchThreads,
    dailyDrivers,
    uiPreferences,
    upsertDispatchThreadMessage,
    markDispatchThreadRead,
    removeDispatchThreadMessageMedia,
    addDailyDriver,
    removeDailyDriver,
    refreshDispatchState
  } = useNemtContext();
  const { data: userPreferences, loading: userPreferencesLoading, saveData: saveUserPreferences } = useUserPreferencesApi();
  const [hiddenDriverIds, setHiddenDriverIds] = useState([]);
  const [chatTheme, setChatTheme] = useState('ocean');
  const [notificationTone, setNotificationTone] = useState('classic');
  const [customNotificationSoundName, setCustomNotificationSoundName] = useState('');
  const [customNotificationSoundDataUrl, setCustomNotificationSoundDataUrl] = useState('');
  const [dailyForm, setDailyForm] = useState({ firstName: '', lastNameOrOrg: '' });
  const [draftMessage, setDraftMessage] = useState('');
  const [driverSearch, setDriverSearch] = useState('');
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [driverAlerts, setDriverAlerts] = useState([]);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);
  const [alertsError, setAlertsError] = useState('');
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsStatus, setSmsStatus] = useState('');
  const [resolvingAlertId, setResolvingAlertId] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [showPanelSettings, setShowPanelSettings] = useState(false);
  const photoInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const customSoundInputRef = useRef(null);
  const notificationAudioRef = useRef(null);
  const seenIncomingMessageIdsRef = useRef(new Set());
  const seenAlertIdsRef = useRef(new Set());

  const allDrivers = useMemo(() => [
    ...drivers,
    ...(Array.isArray(dailyDrivers) ? dailyDrivers : []).map(dd => ({
      id: dd.id,
      name: dd.firstName + (dd.lastNameOrOrg ? ' ' + dd.lastNameOrOrg : ''),
      vehicle: 'Daily Driver',
      live: 'Online',
      _isDaily: true
    }))
  ], [drivers, dailyDrivers]);

  const normalizedThreads = useMemo(() => mergeThreads(dispatchThreads, allDrivers), [allDrivers, dispatchThreads]);
  const hiddenDriverIdSet = useMemo(() => new Set(Array.isArray(hiddenDriverIds) ? hiddenDriverIds : []), [hiddenDriverIds]);
  const visibleThreads = useMemo(() => normalizedThreads.filter(thread => !hiddenDriverIdSet.has(thread.driverId)), [hiddenDriverIdSet, normalizedThreads]);

  useEffect(() => {
    if (userPreferencesLoading) return;
    setHiddenDriverIds(Array.isArray(userPreferences?.dispatcherMessaging?.hiddenDriverIds) ? userPreferences.dispatcherMessaging.hiddenDriverIds : []);
    setChatTheme(String(userPreferences?.dispatcherMessaging?.chatTheme || 'ocean').trim() || 'ocean');
    setNotificationTone(String(userPreferences?.dispatcherMessaging?.notificationTone || 'classic').trim() || 'classic');
    setCustomNotificationSoundName(String(userPreferences?.dispatcherMessaging?.customNotificationSoundName || '').trim());
    setCustomNotificationSoundDataUrl(String(userPreferences?.dispatcherMessaging?.customNotificationSoundDataUrl || '').trim());
  }, [userPreferences?.dispatcherMessaging?.chatTheme, userPreferences?.dispatcherMessaging?.customNotificationSoundDataUrl, userPreferences?.dispatcherMessaging?.customNotificationSoundName, userPreferences?.dispatcherMessaging?.hiddenDriverIds, userPreferences?.dispatcherMessaging?.notificationTone, userPreferencesLoading]);

  useEffect(() => {
    if (userPreferencesLoading) return;
    void saveUserPreferences({
      ...userPreferences,
      dispatcherMessaging: {
        ...userPreferences?.dispatcherMessaging,
        hiddenDriverIds,
        chatTheme,
        notificationTone,
        customNotificationSoundName,
        customNotificationSoundDataUrl
      }
    });
  }, [chatTheme, customNotificationSoundDataUrl, customNotificationSoundName, hiddenDriverIds, notificationTone, saveUserPreferences, userPreferences, userPreferencesLoading]);
  const normalizedSearch = driverSearch.trim().toLowerCase();
  const filteredThreads = useMemo(() => visibleThreads.filter(thread => {
    if (!normalizedSearch) return true;
    const driver = allDrivers.find(item => item.id === thread.driverId);
    const haystack = [driver?.name, driver?.vehicle, driver?.live, thread.messages[thread.messages.length - 1]?.text].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(normalizedSearch);
  }), [allDrivers, normalizedSearch, visibleThreads]);
  const activeDriverId = selectedDriverId && visibleThreads.some(thread => thread.driverId === selectedDriverId) ? selectedDriverId : visibleThreads[0]?.driverId ?? null;
  const activeThread = normalizedThreads.find(thread => thread.driverId === activeDriverId) ?? null;
  const activeAlertCounts = useMemo(() => driverAlerts.reduce((accumulator, alert) => {
    if (!alert?.driverId || alert?.status === 'resolved') return accumulator;
    accumulator[alert.driverId] = (accumulator[alert.driverId] || 0) + 1;
    return accumulator;
  }, {}), [driverAlerts]);
  const unreadCount = visibleThreads.reduce((total, thread) => total + thread.messages.filter(message => message.direction === 'incoming' && message.status !== 'read').length, 0);
  const activeDriverAlerts = useMemo(() => driverAlerts.filter(alert => alert.driverId === activeDriverId && alert.status !== 'resolved'), [activeDriverId, driverAlerts]);
  const dispatcherSenderName = String(session?.user?.name || session?.user?.email || 'Dispatch').trim() || 'Dispatch';
  const selectedChatTheme = CHAT_THEME_OPTIONS[chatTheme] || CHAT_THEME_OPTIONS.ocean;
  const gpsOnlineCount = useMemo(() => allDrivers.filter(driver => {
    const isOnline = String(driver?.live || '').trim().toLowerCase() === 'online';
    const hasGps = driver?.hasRealLocation || (Array.isArray(driver?.position) && driver.position.length === 2 && driver.position.every(value => Number.isFinite(Number(value))));
    return isOnline && hasGps;
  }).length, [allDrivers]);

  const playIncomingTone = () => {
    if (typeof window === 'undefined') return;
    if (notificationTone === 'silent') return;
    if (notificationTone === 'custom' && customNotificationSoundDataUrl) {
      try {
        if (notificationAudioRef.current) {
          notificationAudioRef.current.pause();
        }
        const audio = new Audio(customNotificationSoundDataUrl);
        audio.volume = 1;
        notificationAudioRef.current = audio;
        void audio.play();
        return;
      } catch {
        // Fall back to web audio.
      }
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = notificationTone === 'urgent' ? 'square' : notificationTone === 'soft' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(notificationTone === 'urgent' ? 980 : notificationTone === 'soft' ? 620 : 880, audioContext.currentTime);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(notificationTone === 'urgent' ? 0.12 : 0.08, audioContext.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + (notificationTone === 'soft' ? 0.48 : 0.35));
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + (notificationTone === 'soft' ? 0.5 : 0.36));
      oscillator.onended = () => {
        void audioContext.close();
      };
    } catch {
      // Ignore browser audio failures.
    }
  };

  const showBrowserNotification = (title, body) => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
      return;
    }
    if (Notification.permission === 'default') {
      void Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(title, { body });
        }
      });
    }
  };

  const handleSelectDriver = driverId => {
    setSelectedDriverId(driverId);
    markDispatchThreadRead(driverId);
    setSmsStatus('');
  };

  useEffect(() => {
    const incomingMessages = normalizedThreads.flatMap(thread => thread.messages.filter(message => message.direction === 'incoming').map(message => ({
      ...message,
      driverId: thread.driverId,
      driverName: allDrivers.find(driver => driver.id === thread.driverId)?.name || 'Driver'
    })));

    if (seenIncomingMessageIdsRef.current.size === 0) {
      incomingMessages.forEach(message => seenIncomingMessageIdsRef.current.add(message.id));
      return;
    }

    const nextMessages = incomingMessages.filter(message => !seenIncomingMessageIdsRef.current.has(message.id));
    if (nextMessages.length === 0) return;

    nextMessages.forEach(message => seenIncomingMessageIdsRef.current.add(message.id));
    const latest = nextMessages[0];
    showNotification({
      title: `Message from ${latest.driverName}`,
      message: latest.text || '[Photo]',
      variant: 'primary',
      delay: 5000
    });
    showBrowserNotification(`Message from ${latest.driverName}`, latest.text || '[Photo]');
    playIncomingTone();
  }, [allDrivers, normalizedThreads, showNotification]);

  useEffect(() => {
    if (seenAlertIdsRef.current.size === 0) {
      driverAlerts.forEach(alert => seenAlertIdsRef.current.add(alert.id));
      return;
    }

    const nextAlerts = driverAlerts.filter(alert => !seenAlertIdsRef.current.has(alert.id));
    if (nextAlerts.length === 0) return;

    nextAlerts.forEach(alert => seenAlertIdsRef.current.add(alert.id));
    const latest = nextAlerts[0];
    showNotification({
      title: `Driver alert: ${latest.driverName || 'Driver'}`,
      message: latest.subject || latest.body || 'New driver alert',
      variant: 'warning',
      delay: 6000
    });
    showBrowserNotification(`Driver alert: ${latest.driverName || 'Driver'}`, latest.subject || latest.body || 'New driver alert');
    playIncomingTone();
  }, [driverAlerts, showNotification]);

  useEffect(() => {
    let active = true;

    const loadDriverAlerts = async () => {
      if (active) setIsLoadingAlerts(true);
      try {
        const response = await fetch('/api/system-messages', { cache: 'no-store' });
        const payload = await readJsonResponse(response);
        if (!response.ok) throw new Error(payload?.error || 'Unable to load driver alerts.');
        if (!active) return;

        const nextAlerts = (Array.isArray(payload?.messages) ? payload.messages : []).filter(message => {
          return message?.driverId && message?.source === 'mobile-driver-app' && MOBILE_DRIVER_ALERT_TYPES.has(String(message?.type || '').trim());
        }).sort((left, right) => new Date(right?.createdAt || 0) - new Date(left?.createdAt || 0));

        setDriverAlerts(nextAlerts);
        nextAlerts.forEach(message => {
          const attachment = message?.mediaUrl ? [{
            id: `${message.id}-media`,
            kind: String(message?.mediaType || '').toLowerCase().includes('image') ? 'photo' : 'document',
            name: String(message?.mediaType || '').toLowerCase().includes('image') ? 'Driver photo' : 'Driver attachment',
            mimeType: String(message?.mediaType || '').trim(),
            dataUrl: String(message?.mediaUrl || '').trim()
          }] : [];
          upsertDispatchThreadMessage({
            driverId: message.driverId,
            markIncomingRead: activeDriverId === message.driverId,
            message: {
              id: message.id,
              direction: 'incoming',
              text: String(message?.body || '').trim(),
              timestamp: message.createdAt,
              status: activeDriverId === message.driverId ? 'read' : 'sent',
              attachments: attachment
            }
          });
        });
        setAlertsError('');
      } catch (error) {
        if (!active) return;
        setAlertsError(error.message || 'Unable to load driver alerts.');
      } finally {
        if (active) setIsLoadingAlerts(false);
      }
    };

    void loadDriverAlerts();
    const intervalId = window.setInterval(() => {
      void loadDriverAlerts();
    }, MOBILE_ALERT_POLL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [activeDriverId, upsertDispatchThreadMessage]);

  const handleSendMessage = async (text, options = {}) => {
    const messageText = text.trim();
    const attachments = Array.isArray(options.attachments) ? options.attachments : [];
    if (!activeDriverId || (!messageText && attachments.length === 0)) return false;
    const firstAttachment = attachments[0] || null;
    const messageId = `${activeDriverId}-${Date.now()}`;
    const persistedBody = messageText || (firstAttachment?.kind === 'photo' ? '[Photo]' : firstAttachment?.name ? `[Attachment] ${firstAttachment.name}` : '[Attachment]');

    try {
      const response = await fetch('/api/system-messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: messageId,
          type: 'dispatch-message',
          priority: 'normal',
          audience: 'Driver',
          subject: `[From: ${dispatcherSenderName}] Dispatch message for ${activeDriver?.name || 'driver'}`,
          body: persistedBody,
          driverId: activeDriverId,
          driverName: activeDriver?.name || null,
          source: 'dispatcher-web',
          deliveryMethod: 'in-app',
          mediaUrl: firstAttachment?.dataUrl || null,
          mediaType: firstAttachment?.kind === 'photo' || String(firstAttachment?.mimeType || '').toLowerCase().startsWith('image/') ? 'image' : firstAttachment?.mimeType || firstAttachment?.kind || null
        })
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) throw new Error(payload?.error || 'Unable to send dispatch message.');

    const outgoingMessage = {
      id: payload?.message?.id || messageId,
      direction: 'outgoing',
      text: messageText || (attachments.length > 0 ? 'Attachment sent.' : ''),
      timestamp: payload?.message?.createdAt || new Date().toISOString(),
      status: 'sent',
      attachments
    };
    upsertDispatchThreadMessage({ driverId: activeDriverId, message: outgoingMessage });
    setDraftMessage('');
      setSmsStatus('');
      return true;
    } catch (error) {
      setSmsStatus(error?.message || 'Unable to send dispatch message.');
      return false;
    }
  };

  const handleResolveAlert = async alertId => {
    if (!alertId) return;
    setResolvingAlertId(alertId);
    setAlertsError('');
    try {
      const response = await fetch('/api/system-messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alertId, action: 'resolve' })
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) throw new Error(payload?.error || 'Unable to resolve alert.');
      setDriverAlerts(currentAlerts => currentAlerts.map(alert => alert.id === alertId ? payload.message : alert));
      await logSystemActivity('Resolved mobile driver alert', activeDriverId || '', {
        alertId,
        driverId: activeDriverId || '',
        driverName: activeDriver?.name || '',
        action: 'resolve-alert'
      });
    } catch (error) {
      setAlertsError(error.message || 'Unable to resolve alert.');
    } finally {
      setResolvingAlertId('');
    }
  };

  const handleEscalateAlertSms = async alert => {
    await handleSendSmsTemplate(alert, `Dispatch follow-up: ${alert.body}`);
  };

  const handleDeleteAttachment = async messageId => {
    if (!messageId) return;
    setDeletingMessageId(messageId);
    setSmsStatus('');
    try {
      const response = await fetch('/api/system-messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: messageId, action: 'remove-media' })
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) throw new Error(payload?.error || 'Unable to delete photo.');
      removeDispatchThreadMessageMedia(messageId);
      await refreshDispatchState({ forceServer: true });
      setPreviewImage(null);
      setSmsStatus('Photo deleted from chat.');
    } catch (error) {
      setSmsStatus(error?.message || 'Unable to delete photo.');
    } finally {
      setDeletingMessageId('');
    }
  };

  const openDeleteConfirmation = message => {
    const photoAttachment = Array.isArray(message?.attachments) ? message.attachments.find(attachment => attachment.kind === 'photo') : null;
    if (!message?.id || !photoAttachment) return;
    setDeleteConfirmation({
      messageId: message.id,
      name: photoAttachment.name || 'Driver photo',
      dataUrl: photoAttachment.dataUrl || ''
    });
  };

  const confirmDeleteAttachment = async () => {
    if (!deleteConfirmation?.messageId) return;
    await handleDeleteAttachment(deleteConfirmation.messageId);
    setDeleteConfirmation(null);
  };

  const handleSendSmsTemplate = async (alert, smsMessage) => {
    const phoneNumber = normalizePhoneDigits(activeDriver?.phone);
    if (!activeDriverId || !phoneNumber || !smsMessage) {
      setSmsStatus('Driver phone is missing, so SMS escalation cannot be sent.');
      return;
    }

    setIsSendingSms(true);
    setSmsStatus('');
    try {
      const response = await fetch('/api/extensions/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'sms',
          phoneNumber,
          message: smsMessage,
          driverId: activeDriverId,
          driverName: activeDriver?.name || 'Driver'
        })
      });
      const payload = await response.json();
      if (!response.ok || payload?.success === false) throw new Error(payload?.error || 'Unable to escalate via SMS.');

      void handleSendMessage(`SMS escalation sent: ${smsMessage}`);
      await logSystemActivity('Sent dispatcher SMS escalation', activeDriverId || '', {
        alertId: alert?.id || '',
        driverId: activeDriverId || '',
        driverName: activeDriver?.name || '',
        alertType: alert?.type || 'unknown',
        smsMessage,
        mode: alert?.body === smsMessage.replace(/^Dispatch follow-up:\s*/, '') ? 'raw-forward' : 'template'
      });
      setSmsStatus(payload?.demo ? 'SMS escalation sent in demo mode.' : 'SMS escalation sent to driver.');
    } catch (error) {
      setSmsStatus(error.message || 'Unable to escalate via SMS.');
    } finally {
      setIsSendingSms(false);
    }
  };

  const handleSendTemplateByType = async alert => {
    const driverName = activeDriver?.name || 'driver';
    const templateBuilder = DRIVER_ALERT_SMS_TEMPLATES[alert?.type] || DRIVER_ALERT_SMS_TEMPLATES.fallback;
    await handleSendSmsTemplate(alert, templateBuilder(driverName));
  };

  const readFileAsDataUrl = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });

  const readPhotoAsCompressedDataUrl = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSide = 1280;
        const scale = Math.min(1, maxSide / Math.max(image.width || 1, image.height || 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Unable to prepare image.'));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      image.onerror = () => reject(new Error('Unable to read image.'));
      image.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });

  const handleAttachmentPick = async (event, kind) => {
    const file = event?.target?.files?.[0];
    event.target.value = '';
    if (!file || !activeDriverId) return;
    if (file.size > 5 * 1024 * 1024) {
      setSmsStatus('Attachment blocked: file exceeds 5MB limit.');
      return;
    }
    try {
      const dataUrl = kind === 'photo' ? await readPhotoAsCompressedDataUrl(file) : await readFileAsDataUrl(file);
      await handleSendMessage('', {
        attachments: [{
          id: `${kind}-${Date.now()}`,
          kind,
          name: file.name,
          mimeType: kind === 'photo' ? 'image/jpeg' : file.type || '',
          dataUrl
        }]
      });
    } catch {
      setSmsStatus('Attachment failed: unable to read selected file.');
    }
  };

  const handleHideDriver = driverId => {
    setHiddenDriverIds(currentHiddenDriverIds => {
      const nextHiddenDriverIds = Array.isArray(currentHiddenDriverIds) ? [...currentHiddenDriverIds] : [];
      if (!nextHiddenDriverIds.includes(driverId)) nextHiddenDriverIds.push(driverId);
      return nextHiddenDriverIds;
    });
    if (driverId === activeDriverId) {
      const nextVisibleThread = visibleThreads.find(thread => thread.driverId !== driverId);
      setSelectedDriverId(nextVisibleThread?.driverId ?? null);
    }
  };

  const activeDriver = allDrivers.find(driver => driver.id === activeDriverId) ?? null;

  const handleAddDailyDriver = () => {
    const firstName = dailyForm.firstName.trim();
    const lastNameOrOrg = dailyForm.lastNameOrOrg.trim();
    if (!firstName) return;
    const newDriver = {
      id: `daily-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      firstName,
      lastNameOrOrg,
      createdAt: new Date().toISOString()
    };
    addDailyDriver(newDriver);
    setDailyForm({ firstName: '', lastNameOrOrg: '' });
    setShowAddDriver(false);
  };

  const handleDeleteDailyDriver = driverId => {
    removeDailyDriver(driverId);
    if (driverId === activeDriverId) {
      const next = visibleThreads.find(t => t.driverId !== driverId);
      setSelectedDriverId(next?.driverId ?? null);
    }
  };

  const handleCustomNotificationSoundPick = event => {
    const file = event?.target?.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setSmsStatus('Custom sound blocked: file exceeds 2MB limit.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCustomNotificationSoundName(file.name);
      setCustomNotificationSoundDataUrl(String(reader.result || ''));
      setNotificationTone('custom');
      setSmsStatus('Custom notification sound saved.');
    };
    reader.onerror = () => {
      setSmsStatus('Unable to read custom notification sound.');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="h-100 d-flex flex-column border rounded-3 overflow-hidden bg-white" style={{ borderColor: '#dbe3ef' }}>
      <div className="d-flex justify-content-between align-items-center p-2 border-bottom flex-wrap gap-2" style={{ backgroundColor: '#f8fafc', borderColor: '#dbe3ef', color: '#0f172a' }}>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <strong>Messaging</strong>
          <Badge bg="light" text="dark">{visibleThreads.length} threads</Badge>
          <Badge bg="warning" text="dark">{unreadCount} unread</Badge>
          <Badge bg="success">{gpsOnlineCount} live GPS</Badge>
        </div>
        <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ minWidth: 220, maxWidth: 360 }}>
          <Form.Control value={driverSearch} onChange={event => setDriverSearch(event.target.value)} placeholder="Search driver, message, vehicle..." />
          <button
            type="button"
            onClick={() => setShowPanelSettings(true)}
            className="border-0 rounded-circle d-inline-flex align-items-center justify-content-center"
            style={{ width: 18, height: 18, backgroundColor: selectedChatTheme.accent, boxShadow: `0 0 0 2px ${selectedChatTheme.accent}33` }}
            title="Messaging colors and notification sound"
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#ffffff', display: 'inline-block' }} />
          </button>
        </div>
        <div className="d-flex gap-2 flex-wrap justify-content-end">
          <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => setShowAddDriver(current => !current)}>{showAddDriver ? 'Cancelar' : 'Add Driver'}</Button>
          <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => handleSendMessage('ETA update sent from dispatch.')}>Quick ETA</Button>
        </div>
      </div>
      <div className="d-flex flex-grow-1" style={{ minHeight: 0, overflow: 'hidden' }}>
        <div className="border-end d-flex flex-column bg-white" style={{ width: '40%', minWidth: 220, minHeight: 0, borderColor: '#dbe3ef' }}>
          <div className="p-3 border-bottom" style={{ backgroundColor: '#f8fafc', borderColor: '#dbe3ef' }}>
            <div className="d-flex flex-column gap-2">
              <div className="d-flex flex-wrap align-items-center gap-2 small" style={{ color: '#64748b' }}>
                <span className="d-inline-flex align-items-center gap-1" title="Flag = driver alert or urgent issue">
                  <IconifyIcon icon="iconoir:triangle-flag" style={{ color: '#dc2626' }} /> Alert
                </span>
                <span className="d-inline-flex align-items-center gap-1" title="Pin = driver with live GPS available for the map">
                  <IconifyIcon icon="iconoir:map-pin" style={{ color: '#16a34a' }} /> GPS
                </span>
                <span className="d-inline-flex align-items-center gap-1" title="Message = this thread has unread chat activity">
                  <IconifyIcon icon="iconoir:message-text" style={{ color: selectedChatTheme.accent }} /> Chat
                </span>
              </div>
            </div>
            {showAddDriver ? (
              <div className="mt-3 border rounded p-2 bg-white">
                <div className="fw-semibold small mb-2">Daily Driver de emergencia</div>
                <Form.Control
                  size="sm"
                  className="mb-2"
                  placeholder="Nombre *"
                  value={dailyForm.firstName}
                  onChange={e => setDailyForm(f => ({ ...f, firstName: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddDailyDriver(); }}
                />
                <Form.Control
                  size="sm"
                  className="mb-2"
                  placeholder="Apellido u Organizacion (ej. Uber)"
                  value={dailyForm.lastNameOrOrg}
                  onChange={e => setDailyForm(f => ({ ...f, lastNameOrOrg: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddDailyDriver(); }}
                />
                <Button size="sm" variant="success" onClick={handleAddDailyDriver} disabled={!dailyForm.firstName.trim()}>
                  Agregar
                </Button>
              </div>
            ) : null}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {filteredThreads.length > 0 ? filteredThreads.map(thread => {
              const driver = allDrivers.find(item => item.id === thread.driverId);
              const isDaily = driver?._isDaily === true;
              const hasGps = Boolean(driver?.hasRealLocation || (Array.isArray(driver?.position) && driver.position.length === 2));
              const lastMessage = thread.messages[thread.messages.length - 1];
              const threadUnreadCount = thread.messages.filter(message => message.direction === 'incoming' && message.status !== 'read').length;
              const threadAlertCount = activeAlertCounts[thread.driverId] || 0;
              const hasUrgentAlert = driverAlerts.some(alert => alert.driverId === thread.driverId && alert.status !== 'resolved' && (alert.priority === 'high' || alert.priority === 'urgent'));
              return (
                <div
                  key={thread.driverId}
                  className={`border-bottom ${thread.driverId === activeDriverId ? 'text-white' : 'text-body'}`}
                  style={{
                    backgroundColor: thread.driverId === activeDriverId ? selectedChatTheme.activeThread : hasUrgentAlert ? '#fff1f2' : '#ffffff',
                    borderBottomColor: '#e2e8f0',
                    borderLeft: hasUrgentAlert ? '4px solid #ea580c' : '4px solid transparent'
                  }}
                >
                  <div className="d-flex align-items-center gap-2 px-2 py-1" style={{ minHeight: 58 }}>
                    <div className="flex-grow-1">
                      <button
                        type="button"
                        onClick={() => handleSelectDriver(thread.driverId)}
                        className={`w-100 text-start border-0 px-1 ${thread.driverId === activeDriverId ? 'text-white' : 'text-body'}`}
                        style={{ backgroundColor: 'transparent' }}
                      >
                        <div className="d-flex justify-content-between align-items-center gap-2">
                          <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                            <div className="d-flex align-items-center gap-1">
                              <IconifyIcon icon="iconoir:triangle-flag" className={threadAlertCount > 0 || hasUrgentAlert ? 'text-danger' : thread.driverId === activeDriverId ? 'text-white-50' : 'text-secondary'} title={threadAlertCount > 0 || hasUrgentAlert ? 'This driver has alert activity' : 'No active alerts'} />
                              <IconifyIcon icon="iconoir:map-pin" className={driver?.hasRealLocation || (Array.isArray(driver?.position) && driver.position.length === 2) ? 'text-success' : thread.driverId === activeDriverId ? 'text-white-50' : 'text-secondary'} title={driver?.hasRealLocation || (Array.isArray(driver?.position) && driver.position.length === 2) ? 'Driver GPS is available on the map' : 'No live GPS available'} />
                              <IconifyIcon icon="iconoir:message-text" className={threadUnreadCount > 0 ? 'text-warning' : thread.messages.length > 0 ? '' : thread.driverId === activeDriverId ? 'text-white-50' : 'text-secondary'} style={threadUnreadCount > 0 ? undefined : thread.messages.length > 0 ? { color: selectedChatTheme.accent } : undefined} title={threadUnreadCount > 0 ? `${threadUnreadCount} unread messages` : thread.messages.length > 0 ? 'Chat history available' : 'No chat messages yet'} />
                              {threadAlertCount > 0 ? <span className="rounded-circle bg-danger d-inline-block" style={{ width: 7, height: 7 }} /> : null}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div className="fw-semibold d-flex align-items-center gap-2 text-truncate" style={{ maxWidth: 210 }}>
                                {driver?.name ?? 'Driver'}
                                {driver?.live === 'Online' ? <span className="rounded-circle bg-success d-inline-block" style={{ width: 8, height: 8 }} /> : null}
                              </div>
                              <button
                                type="button"
                                onClick={event => {
                                  event.stopPropagation();
                                  handleSelectDriver(thread.driverId);
                                  if (hasGps) onLocateDriver?.(thread.driverId);
                                }}
                                disabled={!hasGps}
                                className="border-0 p-0 mt-1 bg-transparent text-start small"
                                style={{
                                  maxWidth: 220,
                                  color: hasGps ? (thread.driverId === activeDriverId ? '#dbeafe' : selectedChatTheme.accent) : (thread.driverId === activeDriverId ? selectedChatTheme.activeThreadSubtle : '#94a3b8'),
                                  textDecoration: hasGps ? 'underline' : 'none',
                                  cursor: hasGps ? 'pointer' : 'default'
                                }}
                                title={hasGps ? 'Center this driver on the map and follow live ETA' : 'This driver has no live GPS yet'}
                              >
                                <IconifyIcon icon="iconoir:map-pin" className="me-1" />
                                {getDriverLocationLabel(driver)}
                              </button>
                              <div className="small text-truncate" style={{ maxWidth: 220, color: thread.driverId === activeDriverId ? selectedChatTheme.activeThreadSubtle : '#64748b' }}>{isDaily ? 'Daily Driver' : driver?.vehicle || 'Pending vehicle'}</div>
                            </div>
                          </div>
                          <div className="text-end">
                            <div className="small">{lastMessage ? formatDispatchTime(lastMessage.timestamp, uiPreferences?.timeZone) : '--:--'}</div>
                            {threadUnreadCount > 0 ? <Badge bg="danger">{threadUnreadCount}</Badge> : null}
                            {threadAlertCount > 0 ? <Badge bg="warning" text="dark" className="ms-1">{threadAlertCount}</Badge> : null}
                          </div>
                        </div>
                      </button>
                    </div>
                    <Button variant="link" size="sm" className="p-1 text-decoration-none" style={{ color: thread.driverId === activeDriverId ? '#ffffff' : '#64748b' }} onClick={() => handleHideDriver(thread.driverId)} title="Remove driver from this panel">
                      <IconifyIcon icon="iconoir:xmark" />
                    </Button>
                    {isDaily ? (
                      <Button variant="link" size="sm" className="p-1 text-decoration-none text-danger" onClick={() => handleDeleteDailyDriver(thread.driverId)} title="Borrar Daily Driver">
                        <IconifyIcon icon="iconoir:trash" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            }) : <div className="text-center text-muted py-4 small">{driverSearch.trim() ? 'No drivers match this search.' : 'No driver threads available.'}</div>}
          </div>
        </div>
        <div className="d-flex flex-column flex-grow-1 bg-white" style={{ minWidth: 0 }}>
          <div className="flex-grow-1 p-3" style={{ overflowY: 'auto', minHeight: 0 }}>
            {isLoadingAlerts && activeDriverAlerts.length === 0 ? <div className="small text-muted mb-3">Loading driver alerts...</div> : null}
            {smsStatus ? <div className={`alert ${smsStatus.toLowerCase().includes('unable') || smsStatus.toLowerCase().includes('missing') ? 'alert-warning' : 'alert-success'} py-2 mb-3`}>{smsStatus}</div> : null}
            {activeDriverAlerts.length > 0 ? <div className="d-flex flex-column gap-2 mb-3">
                {activeDriverAlerts.map(alert => <div key={alert.id} className="border rounded p-3 shadow-sm" style={getAlertSurfaceStyle(alert)}>
                    <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                      <div>
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <strong>{alert.subject || 'Driver alert'}</strong>
                          <Badge bg={getAlertVariant(alert.priority)}>{alert.priority || 'normal'}</Badge>
                          <Badge bg="dark">{getAlertLabel(alert)}</Badge>
                        </div>
                        <div className="small text-muted mt-1">{formatDispatchTime(alert.createdAt, uiPreferences?.timeZone)} | {alert.deliveryMethod || 'in-app'}</div>
                      </div>
                      <div className="d-flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline-secondary" onClick={() => {
                          setDraftMessage(alert.body || '');
                          void logSystemActivity('Loaded mobile driver alert into draft', activeDriverId || '', {
                            alertId: alert.id,
                            driverId: activeDriverId || '',
                            driverName: activeDriver?.name || '',
                            alertType: alert?.type || 'unknown',
                            action: 'use-as-draft'
                          });
                        }}>Use As Draft</Button>
                        <Button size="sm" variant="outline-dark" onClick={() => void handleSendTemplateByType(alert)} disabled={isSendingSms || normalizePhoneDigits(activeDriver?.phone).length < 10}>Send Template</Button>
                        <Button size="sm" variant="outline-danger" onClick={() => void handleEscalateAlertSms(alert)} disabled={isSendingSms || normalizePhoneDigits(activeDriver?.phone).length < 10}>Forward Raw</Button>
                        <Button size="sm" variant="success" onClick={() => void handleResolveAlert(alert.id)} disabled={resolvingAlertId === alert.id}>{resolvingAlertId === alert.id ? 'Resolving...' : 'Resolve'}</Button>
                      </div>
                    </div>
                    <div className="mt-2 small">{alert.body}</div>
                    <div className="mt-3 d-flex gap-2 flex-wrap">
                      <Button size="sm" variant="warning" onClick={() => void handleSendSmsTemplate(alert, DRIVER_ALERT_SMS_TEMPLATES['delay-alert'](activeDriver?.name || 'driver'))} disabled={isSendingSms || normalizePhoneDigits(activeDriver?.phone).length < 10}>Late ETA SMS</Button>
                      <Button size="sm" variant="primary" onClick={() => void handleSendSmsTemplate(alert, DRIVER_ALERT_SMS_TEMPLATES['backup-driver-request'](activeDriver?.name || 'driver'))} disabled={isSendingSms || normalizePhoneDigits(activeDriver?.phone).length < 10}>Backup Driver SMS</Button>
                      <Button size="sm" variant="danger" onClick={() => void handleSendSmsTemplate(alert, DRIVER_ALERT_SMS_TEMPLATES['uber-request'](activeDriver?.name || 'driver'))} disabled={isSendingSms || normalizePhoneDigits(activeDriver?.phone).length < 10}>Uber SMS</Button>
                    </div>
                  </div>)}
              </div> : null}
            {activeThread?.messages?.length ? activeThread.messages.map(message => (
              <div key={message.id} className={`d-flex mb-3 ${message.direction === 'outgoing' ? 'justify-content-end' : 'justify-content-start'}`}>
                <div
                  className="rounded-3 px-3 py-2"
                  style={{
                    maxWidth: '80%',
                    backgroundColor: message.direction === 'outgoing' ? selectedChatTheme.outgoingBubble : selectedChatTheme.incomingBubble,
                    color: message.direction === 'outgoing' ? selectedChatTheme.outgoingText : selectedChatTheme.incomingText,
                    border: message.direction === 'outgoing' ? '1px solid transparent' : `1px solid ${selectedChatTheme.incomingBorder}`,
                    boxShadow: message.direction === 'outgoing' ? '0 10px 22px rgba(15,23,42,0.12)' : 'none'
                  }}
                >
                  <div>{message.text}</div>
                  {Array.isArray(message.attachments) && message.attachments.length > 0 ? (
                    <div className="mt-2 d-flex flex-column gap-2">
                      {message.attachments.map(attachment => (
                        <div key={attachment.id} className="small">
                          {attachment.kind === 'photo' ? (
                            <div className="d-inline-flex flex-column gap-1">
                              <button type="button" onClick={() => setPreviewImage({ name: attachment.name, dataUrl: attachment.dataUrl, messageId: message.id })} className="d-inline-flex flex-column text-reset text-decoration-none border-0 p-0 bg-transparent text-start">
                                <img src={attachment.dataUrl} alt={attachment.name} style={{ width: 140, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)' }} />
                                <span className="mt-1">{attachment.name}</span>
                              </button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => openDeleteConfirmation(message)}
                                disabled={deletingMessageId === message.id}
                                className="align-self-start rounded-pill px-3 d-inline-flex align-items-center gap-2"
                                style={{ backgroundColor: '#b91c1c', borderColor: '#b91c1c', fontWeight: 600 }}
                              >
                                <IconifyIcon icon="iconoir:trash" />
                                {deletingMessageId === message.id ? 'Deleting...' : 'Delete photo'}
                              </Button>
                            </div>
                          ) : (
                            <a href={attachment.dataUrl} download={attachment.name} className="text-reset">Document: {attachment.name}</a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div style={{ fontSize: 12, marginTop: 4, color: message.direction === 'outgoing' ? selectedChatTheme.outgoingMeta : selectedChatTheme.incomingMeta }}>{formatDispatchTime(message.timestamp, uiPreferences?.timeZone)} {message.direction === 'outgoing' ? `| ${message.status}` : ''}</div>
                </div>
              </div>
            )) : <div className="text-center text-muted py-5">No messages yet for this driver.</div>}
          </div>
          <div className="p-3 border-top" style={{ backgroundColor: '#f8fafc', borderColor: '#dbe3ef' }}>
            <input ref={photoInputRef} type="file" accept="image/*" className="d-none" onChange={event => {
              void handleAttachmentPick(event, 'photo');
            }} />
            <input ref={documentInputRef} type="file" accept=".pdf,.doc,.docx,.txt,image/*" className="d-none" onChange={event => {
              void handleAttachmentPick(event, 'document');
            }} />
            <div className="d-flex align-items-center gap-2 border rounded-3 px-2 py-2 bg-white" style={{ borderColor: '#dbe3ef' }}>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={!activeDriver}
                className="border-0 bg-transparent d-inline-flex align-items-center justify-content-center rounded-circle"
                style={{ width: 32, height: 32, color: activeDriver ? selectedChatTheme.accent : '#94a3b8' }}
                title="Add photo"
              >
                <IconifyIcon icon="iconoir:media-image" />
              </button>
              <button
                type="button"
                onClick={() => documentInputRef.current?.click()}
                disabled={!activeDriver}
                className="border-0 bg-transparent d-inline-flex align-items-center justify-content-center rounded-circle"
                style={{ width: 32, height: 32, color: activeDriver ? selectedChatTheme.accent : '#94a3b8' }}
                title="Add document"
              >
                <IconifyIcon icon="iconoir:page" />
              </button>
              <Form.Control value={draftMessage} onChange={event => setDraftMessage(event.target.value)} placeholder={activeDriver ? `Message ${activeDriver.name}` : 'Select a driver first'} disabled={!activeDriver} className="border-0 shadow-none" style={{ backgroundColor: 'transparent' }} onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleSendMessage(draftMessage);
                }
              }} />
              <Button variant="dark" onClick={() => handleSendMessage(draftMessage)} disabled={!activeDriver || !draftMessage.trim()} className="rounded-3 px-3">Send</Button>
            </div>
          </div>
        </div>
      </div>
      <Modal show={Boolean(previewImage)} onHide={() => setPreviewImage(null)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{previewImage?.name || 'Photo preview'}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center">
          {previewImage?.dataUrl ? <img src={previewImage.dataUrl} alt={previewImage.name || 'Photo preview'} style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 12 }} /> : null}
        </Modal.Body>
        <Modal.Footer className="justify-content-between">
          <div className="small text-muted">You can preview first and delete from here.</div>
          <Button
            variant="danger"
            className="rounded-pill px-3"
            style={{ backgroundColor: '#b91c1c', borderColor: '#b91c1c', fontWeight: 600 }}
            onClick={() => setDeleteConfirmation(previewImage ? {
              messageId: previewImage.messageId,
              name: previewImage.name || 'Driver photo',
              dataUrl: previewImage.dataUrl || ''
            } : null)}
            disabled={!previewImage?.messageId || deletingMessageId === previewImage?.messageId}
          >
            {deletingMessageId === previewImage?.messageId ? 'Deleting...' : 'Delete photo'}
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal show={Boolean(deleteConfirmation)} onHide={() => setDeleteConfirmation(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Delete this photo?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="small text-muted mb-3">This will remove the photo from the dispatcher chat and any synced view that still has this message.</div>
          {deleteConfirmation?.dataUrl ? (
            <div className="border rounded-4 p-2" style={{ backgroundColor: '#fff7ed', borderColor: '#fdba74' }}>
              <img
                src={deleteConfirmation.dataUrl}
                alt={deleteConfirmation.name || 'Photo to delete'}
                style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 14 }}
              />
              <div className="mt-2 d-flex align-items-center justify-content-between gap-2">
                <span className="fw-semibold small text-dark">{deleteConfirmation.name || 'Driver photo'}</span>
                <Badge bg="danger">Will be deleted</Badge>
              </div>
            </div>
          ) : null}
        </Modal.Body>
        <Modal.Footer className="justify-content-between">
          <Button variant="outline-secondary" onClick={() => setDeleteConfirmation(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="rounded-pill px-3 d-inline-flex align-items-center gap-2"
            style={{ backgroundColor: '#b91c1c', borderColor: '#b91c1c', fontWeight: 600 }}
            onClick={() => void confirmDeleteAttachment()}
            disabled={!deleteConfirmation?.messageId || deletingMessageId === deleteConfirmation?.messageId}
          >
            <IconifyIcon icon="iconoir:trash" />
            {deletingMessageId === deleteConfirmation?.messageId ? 'Deleting...' : 'Yes, delete photo'}
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal show={showPanelSettings} onHide={() => setShowPanelSettings(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Messaging Settings</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="small fw-semibold text-muted mb-2">Chat colors</div>
          <div className="d-flex flex-wrap gap-2 mb-4">
            {Object.entries(CHAT_THEME_OPTIONS).map(([themeKey, theme]) => (
              <button
                key={themeKey}
                type="button"
                onClick={() => setChatTheme(themeKey)}
                className="border-0 rounded-pill px-3 py-2 small"
                style={{
                  backgroundColor: theme.activeThread,
                  color: '#ffffff',
                  opacity: chatTheme === themeKey ? 1 : 0.72,
                  boxShadow: chatTheme === themeKey ? `0 0 0 2px ${theme.accent}33` : 'none'
                }}
              >
                {theme.label}
              </button>
            ))}
          </div>
          <div className="small fw-semibold text-muted mb-2">Notification sound</div>
          <div className="d-flex flex-wrap gap-2 mb-3">
            {Object.entries(NOTIFICATION_TONE_OPTIONS).map(([toneKey, tone]) => (
              <Button
                key={toneKey}
                size="sm"
                variant={notificationTone === toneKey ? 'dark' : 'outline-secondary'}
                onClick={() => setNotificationTone(toneKey)}
              >
                {tone.label}
              </Button>
            ))}
          </div>
          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            <Button size="sm" variant="outline-dark" onClick={playIncomingTone}>Preview sound</Button>
            <Button size="sm" variant="outline-secondary" onClick={() => customSoundInputRef.current?.click()}>Upload my sound</Button>
            {customNotificationSoundName ? <span className="small text-muted">{customNotificationSoundName}</span> : null}
          </div>
          <input ref={customSoundInputRef} type="file" accept="audio/*" className="d-none" onChange={handleCustomNotificationSoundPick} />
          <div className="small text-muted">You can use a custom sound file or keep one of the built-in tones.</div>
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default DispatcherMessagingPanel;
