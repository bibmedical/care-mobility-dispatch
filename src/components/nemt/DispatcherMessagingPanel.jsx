'use client';

import IconifyIcon from '@/components/wrappers/IconifyIcon';
import { useNemtContext } from '@/context/useNemtContext';
import { useLayoutContext } from '@/context/useLayoutContext';
import { useNotificationContext } from '@/context/useNotificationContext';
import { buildStableDriverId, createBlankDriver, getCurrentRosterWeekKey, normalizeRouteRoster } from '@/helpers/nemt-admin-model';
import { getDriverColor, withDriverAlpha } from '@/helpers/nemt-driver-colors';
import { formatDispatchTime } from '@/helpers/nemt-dispatch-state';
import { normalizePhoneDigits } from '@/helpers/system-users';
import { openWhatsAppConversation } from '@/utils/whatsapp';
import useUserPreferencesApi from '@/hooks/useUserPreferencesApi';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Form, Modal } from 'react-bootstrap';

const greenToolbarButtonStyle = {
  color: '#08131a',
  borderColor: 'rgba(8, 19, 26, 0.35)',
  backgroundColor: 'transparent'
};

const messagingStatusRowStyle = {
  minHeight: 24
};

const buildMessagingSurfaceStyles = isDarkMode => ({
  shell: {
    background: isDarkMode ? 'linear-gradient(180deg, #0f172a 0%, #111827 100%)' : '#ffffff',
    borderColor: isDarkMode ? 'rgba(71, 85, 105, 0.68)' : '#dbe3ef',
    color: isDarkMode ? '#e5eefc' : '#0f172a'
  },
  header: {
    background: isDarkMode ? 'linear-gradient(180deg, rgba(17, 24, 39, 0.98) 0%, rgba(15, 23, 42, 0.96) 100%)' : '#f8fafc',
    borderColor: isDarkMode ? 'rgba(71, 85, 105, 0.58)' : '#dbe3ef',
    color: isDarkMode ? '#e5eefc' : '#0f172a'
  },
  input: {
    backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
    color: isDarkMode ? '#e5eefc' : '#0f172a',
    borderColor: isDarkMode ? 'rgba(100, 116, 139, 0.7)' : '#cbd5e1'
  },
  button: {
    color: isDarkMode ? '#dbeafe' : '#0f172a',
    borderColor: isDarkMode ? 'rgba(96, 165, 250, 0.45)' : '#cbd5e1',
    backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.58)' : '#f8fafc'
  },
  sidebar: {
    backgroundColor: isDarkMode ? '#111827' : '#ffffff',
    borderColor: isDarkMode ? 'rgba(71, 85, 105, 0.52)' : '#dbe3ef'
  },
  sidebarHeader: {
    backgroundColor: isDarkMode ? '#172033' : '#f8fafc',
    borderColor: isDarkMode ? 'rgba(71, 85, 105, 0.52)' : '#dbe3ef'
  },
  secondaryText: isDarkMode ? '#94a3b8' : '#64748b',
  threadUrgentBackground: isDarkMode ? 'rgba(127, 29, 29, 0.65)' : '#fff1f2',
  mainPane: {
    backgroundColor: isDarkMode ? '#0f172a' : '#ffffff'
  },
  mainPaneGradient: isDarkMode ? 'linear-gradient(180deg, rgba(15, 23, 42, 0.82) 0%, rgba(17, 24, 39, 0.96) 100%)' : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
  footer: {
    backgroundColor: isDarkMode ? '#172033' : '#f8fafc',
    borderColor: isDarkMode ? 'rgba(71, 85, 105, 0.52)' : '#dbe3ef'
  },
  composer: {
    backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
    borderColor: isDarkMode ? 'rgba(71, 85, 105, 0.52)' : '#dbe3ef'
  }
});

const MOBILE_ALERT_POLL_MS = 15000;

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

const DARK_CHAT_THEME_OVERRIDES = {
  ocean: {
    incomingBubble: '#162033',
    incomingBorder: '#3157c7',
    incomingText: '#e2e8f0',
    incomingMeta: '#94a3b8'
  },
  emerald: {
    incomingBubble: '#10261f',
    incomingBorder: '#10b981',
    incomingText: '#dcfce7',
    incomingMeta: '#94a3b8'
  },
  sunset: {
    incomingBubble: '#2a1b12',
    incomingBorder: '#f97316',
    incomingText: '#ffedd5',
    incomingMeta: '#fdba74'
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

const normalizeDriverId = value => String(value || '').trim();

const getAlertVariant = priority => {
  if (priority === 'high' || priority === 'urgent') return 'danger';
  if (priority === 'normal') return 'warning';
  return 'secondary';
};

const getAlertSurfaceStyle = (alert, isDarkMode) => {
  if (isDarkMode) {
    if (alert?.type === 'uber-request') return { backgroundColor: '#3f1020', borderColor: '#fb7185', borderWidth: 2, color: '#ffe4e6' };
    if (alert?.type === 'backup-driver-request') return { backgroundColor: '#12203c', borderColor: '#60a5fa', borderWidth: 2, color: '#dbeafe' };
    if (alert?.type === 'delay-alert') return { backgroundColor: '#3a2312', borderColor: '#fb923c', borderWidth: 2, color: '#ffedd5' };
    if (alert?.priority === 'high' || alert?.priority === 'urgent') return { backgroundColor: '#3c1114', borderColor: '#ef4444', borderWidth: 2, color: '#fee2e2' };
    return { backgroundColor: '#33270f', borderColor: '#f59e0b', borderWidth: 1, color: '#fef3c7' };
  }
  if (alert?.type === 'uber-request') return { backgroundColor: '#fff1f2', borderColor: '#be123c', borderWidth: 2 };
  if (alert?.type === 'backup-driver-request') return { backgroundColor: '#eff6ff', borderColor: '#1d4ed8', borderWidth: 2 };
  if (alert?.type === 'delay-alert') return { backgroundColor: '#fff7ed', borderColor: '#ea580c', borderWidth: 2 };
  if (alert?.priority === 'high' || alert?.priority === 'urgent') return { backgroundColor: '#fef2f2', borderColor: '#b91c1c', borderWidth: 2 };
  return { backgroundColor: '#fff8e1', borderColor: '#f59e0b', borderWidth: 1 };
};

const resolveChatThemeColors = (themeKey, isDarkMode) => {
  const baseTheme = CHAT_THEME_OPTIONS[themeKey] || CHAT_THEME_OPTIONS.ocean;
  return isDarkMode ? { ...baseTheme, ...(DARK_CHAT_THEME_OVERRIDES[themeKey] || {}) } : baseTheme;
};

const getAlertLabel = alert => {
  if (alert?.type === 'delay-alert') return 'Late ETA';
  if (alert?.type === 'backup-driver-request') return 'Backup Driver';
  if (alert?.type === 'uber-request') return 'Uber Coverage';
  return 'Driver Alert';
};

const getAlertDisplayBody = alert => {
  const rawBody = String(alert?.body || '').trim();
  if (!rawBody) return '';
  const tripMatch = String(alert?.subject || '').match(/trip\s+([^\s]+)/i);
  const lateMinutesMatch = rawBody.match(/late by about\s+([^\s.]+)\s+minutes?/i);
  const riderMatch = rawBody.match(/for\s+(.+?)\s+is\s+(?:running\s+)?late/i);
  const tripLabel = tripMatch?.[1] ? `Trip ${tripMatch[1]}` : 'Trip alert';
  const riderLabel = riderMatch?.[1] ? ` | ${riderMatch[1].trim()}` : '';
  const lateLabel = lateMinutesMatch?.[1] ? ` late by ~${lateMinutesMatch[1]} min` : ' running late';

  if (alert?.type === 'delay-alert') return `${tripLabel}${lateLabel}${riderLabel}`;
  if (alert?.type === 'backup-driver-request') return `${tripLabel} needs backup driver${riderLabel}`;
  if (alert?.type === 'uber-request') return `${tripLabel} may need Uber coverage${riderLabel}`;

  return rawBody.length > 120 ? `${rawBody.slice(0, 117).trim()}...` : rawBody;
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
  const byDriverId = new Map(existingThreads.map(thread => [normalizeDriverId(thread?.driverId), {
    ...thread,
    driverId: normalizeDriverId(thread?.driverId)
  }]));
  return drivers.map(driver => byDriverId.get(normalizeDriverId(driver?.id)) ?? {
    driverId: normalizeDriverId(driver?.id),
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
  driverSequencePreviewById,
  selectedDriverId,
  setSelectedDriverId,
  onLocateDriver,
  onOpenLayout,
  openFullChat,
  hideThreadList = false
}) => {
  const { themeMode } = useLayoutContext();
  const isDarkMode = themeMode === 'dark';
  const messagingSurfaceStyles = useMemo(() => buildMessagingSurfaceStyles(isDarkMode), [isDarkMode]);
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
  const [officialDriverForm, setOfficialDriverForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    licenseNumber: ''
  });
  const [draftMessage, setDraftMessage] = useState('');
  const [driverSearch, setDriverSearch] = useState('');
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [showAddOfficialDriver, setShowAddOfficialDriver] = useState(false);
  const [isSavingOfficialDriver, setIsSavingOfficialDriver] = useState(false);
  const [driverAlerts, setDriverAlerts] = useState([]);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);
  const [alertsError, setAlertsError] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
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
  const activeDriverIdRef = useRef(null);
  const hasLoadedAlertsRef = useRef(false);
  const hasHydratedMessagingPrefsRef = useRef(false);
  const lastSavedMessagingPrefsRef = useRef('');
  const latestUserPreferencesRef = useRef(userPreferences);
  const upsertDispatchThreadMessageRef = useRef(upsertDispatchThreadMessage);

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
  const allDriversById = useMemo(() => new Map(allDrivers.map(driver => [normalizeDriverId(driver?.id), driver])), [allDrivers]);

  const normalizedThreads = useMemo(() => mergeThreads(dispatchThreads, allDrivers), [allDrivers, dispatchThreads]);
  const hiddenDriverIdSet = useMemo(() => new Set((Array.isArray(hiddenDriverIds) ? hiddenDriverIds : []).map(normalizeDriverId).filter(Boolean)), [hiddenDriverIds]);
  const visibleThreads = useMemo(() => normalizedThreads.filter(thread => !hiddenDriverIdSet.has(normalizeDriverId(thread?.driverId))), [hiddenDriverIdSet, normalizedThreads]);

  useEffect(() => {
    latestUserPreferencesRef.current = userPreferences;
  }, [userPreferences]);

  useEffect(() => {
    upsertDispatchThreadMessageRef.current = upsertDispatchThreadMessage;
  }, [upsertDispatchThreadMessage]);

  useEffect(() => {
    if (userPreferencesLoading) return;
    const normalizedDispatcherMessaging = {
      hiddenDriverIds: (Array.isArray(userPreferences?.dispatcherMessaging?.hiddenDriverIds) ? userPreferences.dispatcherMessaging.hiddenDriverIds : []).map(normalizeDriverId).filter(Boolean),
      chatTheme: String(userPreferences?.dispatcherMessaging?.chatTheme || 'ocean').trim() || 'ocean',
      notificationTone: String(userPreferences?.dispatcherMessaging?.notificationTone || 'classic').trim() || 'classic',
      customNotificationSoundName: String(userPreferences?.dispatcherMessaging?.customNotificationSoundName || '').trim(),
      customNotificationSoundDataUrl: String(userPreferences?.dispatcherMessaging?.customNotificationSoundDataUrl || '').trim()
    };

    setHiddenDriverIds(normalizedDispatcherMessaging.hiddenDriverIds);
    setChatTheme(normalizedDispatcherMessaging.chatTheme);
    setNotificationTone(normalizedDispatcherMessaging.notificationTone);
    setCustomNotificationSoundName(normalizedDispatcherMessaging.customNotificationSoundName);
    setCustomNotificationSoundDataUrl(normalizedDispatcherMessaging.customNotificationSoundDataUrl);
    lastSavedMessagingPrefsRef.current = JSON.stringify(normalizedDispatcherMessaging);
    hasHydratedMessagingPrefsRef.current = true;
  }, [userPreferences?.dispatcherMessaging?.chatTheme, userPreferences?.dispatcherMessaging?.customNotificationSoundDataUrl, userPreferences?.dispatcherMessaging?.customNotificationSoundName, userPreferences?.dispatcherMessaging?.hiddenDriverIds, userPreferences?.dispatcherMessaging?.notificationTone, userPreferencesLoading]);

  useEffect(() => {
    if (userPreferencesLoading || !hasHydratedMessagingPrefsRef.current) return;
    const nextDispatcherMessaging = {
      ...latestUserPreferencesRef.current?.dispatcherMessaging,
      hiddenDriverIds,
      chatTheme,
      notificationTone,
      customNotificationSoundName,
      customNotificationSoundDataUrl
    };
    const nextSerialized = JSON.stringify(nextDispatcherMessaging);
    if (nextSerialized === lastSavedMessagingPrefsRef.current) return;
    lastSavedMessagingPrefsRef.current = nextSerialized;
    void saveUserPreferences({
      ...latestUserPreferencesRef.current,
      dispatcherMessaging: nextDispatcherMessaging
    }).catch(() => {});
  }, [chatTheme, customNotificationSoundDataUrl, customNotificationSoundName, hiddenDriverIds, notificationTone, saveUserPreferences, userPreferencesLoading]);

  const normalizedSearch = driverSearch.trim().toLowerCase();
  const filteredThreads = useMemo(() => visibleThreads.filter(thread => {
    if (!normalizedSearch) return true;
    const driver = allDriversById.get(normalizeDriverId(thread?.driverId));
    const haystack = [driver?.name, driver?.vehicle, driver?.live, thread.messages[thread.messages.length - 1]?.text].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(normalizedSearch);
  }), [allDriversById, normalizedSearch, visibleThreads]);
  const activeDriverId = useMemo(() => {
    const normalizedSelectedDriverId = normalizeDriverId(selectedDriverId);
    if (normalizedSelectedDriverId && visibleThreads.some(thread => normalizeDriverId(thread?.driverId) === normalizedSelectedDriverId)) return normalizedSelectedDriverId;
    return normalizeDriverId(visibleThreads[0]?.driverId) || null;
  }, [selectedDriverId, visibleThreads]);
  const activeThread = normalizedThreads.find(thread => normalizeDriverId(thread?.driverId) === activeDriverId) ?? null;
  const activeAlertCounts = useMemo(() => driverAlerts.reduce((accumulator, alert) => {
    const driverId = normalizeDriverId(alert?.driverId);
    if (!driverId || alert?.status === 'resolved') return accumulator;
    accumulator[driverId] = (accumulator[driverId] || 0) + 1;
    return accumulator;
  }, {}), [driverAlerts]);
  const unreadCount = visibleThreads.reduce((total, thread) => total + thread.messages.filter(message => message.direction === 'incoming' && message.status !== 'read').length, 0);
  const activeDriverAlerts = useMemo(() => driverAlerts.filter(alert => normalizeDriverId(alert?.driverId) === activeDriverId && alert.status !== 'resolved'), [activeDriverId, driverAlerts]);
  const dispatcherSenderName = String(session?.user?.name || session?.user?.email || 'Dispatch').trim() || 'Dispatch';
  const selectedChatTheme = useMemo(() => resolveChatThemeColors(chatTheme, isDarkMode), [chatTheme, isDarkMode]);
  const sortedActiveMessages = useMemo(() => {
    const items = Array.isArray(activeThread?.messages) ? [...activeThread.messages] : [];
    return items.sort((left, right) => {
      const leftTime = new Date(left?.timestamp || 0).getTime();
      const rightTime = new Date(right?.timestamp || 0).getTime();
      const leftValue = Number.isFinite(leftTime) ? leftTime : 0;
      const rightValue = Number.isFinite(rightTime) ? rightTime : 0;
      if (leftValue !== rightValue) return leftValue - rightValue;
      return String(left?.id || '').localeCompare(String(right?.id || ''));
    });
  }, [activeThread?.messages]);
  const gpsOnlineCount = useMemo(() => allDrivers.filter(driver => {
    const isOnline = String(driver?.live || '').trim().toLowerCase() === 'online';
    const hasGps = driver?.hasRealLocation || (Array.isArray(driver?.position) && driver.position.length === 2 && driver.position.every(value => Number.isFinite(Number(value))));
    return isOnline && hasGps;
  }).length, [allDrivers]);

  useEffect(() => {
    activeDriverIdRef.current = activeDriverId;
  }, [activeDriverId]);

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
    const normalizedDriverId = normalizeDriverId(driverId);
    setSelectedDriverId(normalizedDriverId || null);
    markDispatchThreadRead(normalizedDriverId);
    setSmsStatus('');
  };

  useEffect(() => {
    const incomingMessages = normalizedThreads.flatMap(thread => thread.messages.filter(message => message.direction === 'incoming').map(message => ({
      ...message,
      driverId: normalizeDriverId(thread?.driverId),
      driverName: allDriversById.get(normalizeDriverId(thread?.driverId))?.name || 'Driver'
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
  }, [allDriversById, normalizedThreads, showNotification]);

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

    const loadDriverAlerts = async ({ silent = false } = {}) => {
      if (active) setIsLoadingAlerts(!silent && !hasLoadedAlertsRef.current);
      try {
        const response = await fetch('/api/system-messages?alertsOnly=1&status=active&includeMedia=0&limit=200', { cache: 'no-store' });
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
          upsertDispatchThreadMessageRef.current({
            driverId: message.driverId,
            markDispatchDirty: false,
            markIncomingRead: activeDriverIdRef.current === message.driverId,
            message: {
              id: message.id,
              direction: 'incoming',
              text: String(message?.body || '').trim(),
              timestamp: message.createdAt,
              status: activeDriverIdRef.current === message.driverId ? 'read' : 'sent',
              attachments: attachment
            }
          });
        });
        hasLoadedAlertsRef.current = true;
        setAlertsError('');
      } catch (error) {
        if (!active) return;
        hasLoadedAlertsRef.current = true;
        setAlertsError('');
        console.warn('[DispatcherMessaging] Alerts poll error (transient):', error.message);
      } finally {
        if (active) setIsLoadingAlerts(false);
      }
    };

    void loadDriverAlerts();
    const intervalId = window.setInterval(() => {
      void loadDriverAlerts({ silent: true });
    }, MOBILE_ALERT_POLL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const handleSendMessage = async (text, options = {}) => {
    const messageText = text.trim();
    const attachments = Array.isArray(options.attachments) ? options.attachments : [];
    if (!activeDriverId || (!messageText && attachments.length === 0) || isSendingMessage) return false;
    const firstAttachment = attachments[0] || null;
    const messageId = `${activeDriverId}-${Date.now()}`;
    const persistedBody = messageText || (firstAttachment?.kind === 'photo' ? '[Photo]' : firstAttachment?.name ? `[Attachment] ${firstAttachment.name}` : '[Attachment]');
    const optimisticMessage = {
      id: messageId,
      direction: 'outgoing',
      text: messageText || (attachments.length > 0 ? 'Attachment sent.' : ''),
      timestamp: new Date().toISOString(),
      status: 'sending',
      attachments
    };

    try {
      setIsSendingMessage(true);
      setSmsStatus('Sending message...');
      upsertDispatchThreadMessage({ driverId: activeDriverId, message: optimisticMessage, markDispatchDirty: false });

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
        ...optimisticMessage,
        id: payload?.message?.id || messageId,
        timestamp: payload?.message?.createdAt || optimisticMessage.timestamp,
        status: 'sent'
      };
      upsertDispatchThreadMessage({ driverId: activeDriverId, message: outgoingMessage, markDispatchDirty: false });
      await refreshDispatchState({ forceServer: true });
      setDraftMessage('');
      setSmsStatus('');
      return true;
    } catch (error) {
      upsertDispatchThreadMessage({ driverId: activeDriverId, message: {
        ...optimisticMessage,
        status: 'failed'
      }, markDispatchDirty: false });
      setSmsStatus(error?.message || 'Unable to send dispatch message.');
      return false;
    } finally {
      setIsSendingMessage(false);
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
        const maxSide = 1080;
        const maxDataUrlLength = 380_000;
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
        let quality = 0.56;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > maxDataUrlLength && quality > 0.3) {
          quality = Math.round((quality - 0.06) * 100) / 100;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
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
      if (String(dataUrl || '').length > 1_600_000) {
        setSmsStatus('Attachment blocked: optimized file is still too large. Please send a smaller image.');
        return;
      }
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
    const normalizedDriverId = normalizeDriverId(driverId);
    setHiddenDriverIds(currentHiddenDriverIds => {
      const nextHiddenDriverIds = (Array.isArray(currentHiddenDriverIds) ? currentHiddenDriverIds : []).map(normalizeDriverId).filter(Boolean);
      if (!nextHiddenDriverIds.includes(normalizedDriverId)) nextHiddenDriverIds.push(normalizedDriverId);
      return nextHiddenDriverIds;
    });
    if (normalizedDriverId === activeDriverId) {
      const nextVisibleThread = visibleThreads.find(thread => normalizeDriverId(thread?.driverId) !== normalizedDriverId);
      setSelectedDriverId(normalizeDriverId(nextVisibleThread?.driverId) || null);
    }
  };

  const activeDriver = allDriversById.get(activeDriverId) ?? null;

  const handleOpenDriverWhatsApp = () => {
    const phoneNumber = normalizePhoneDigits(activeDriver?.phone);
    if (!activeDriver || phoneNumber.length < 10) {
      setSmsStatus('WhatsApp unavailable: missing driver phone number.');
      return;
    }

    const whatsappResult = openWhatsAppConversation({
      phoneNumber,
      message: ''
    });

    if (!whatsappResult.ok) {
      if (whatsappResult.reason === 'missing-phone') {
        setSmsStatus('WhatsApp unavailable: missing driver phone number.');
        return;
      }
      if (whatsappResult.reason === 'popup-blocked') {
        setSmsStatus('WhatsApp blocked by browser popup settings.');
        return;
      }
      setSmsStatus('Unable to open WhatsApp right now.');
      return;
    }

    setSmsStatus(`WhatsApp opened for ${activeDriver.name || 'driver'}.`);
  };

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

  const handleAddOfficialDriver = async () => {
    const firstName = officialDriverForm.firstName.trim();
    const lastName = officialDriverForm.lastName.trim();
    const email = String(officialDriverForm.email || '').trim().toLowerCase();
    const password = String(officialDriverForm.password || '').trim();
    const phone = normalizePhoneDigits(officialDriverForm.phone);
    const licenseNumber = String(officialDriverForm.licenseNumber || '').trim();
    if (!firstName || !email || !password || !licenseNumber || isSavingOfficialDriver) return;

    setIsSavingOfficialDriver(true);
    try {
      const usersResponse = await fetch('/api/system-users', {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const usersPayload = await readJsonResponse(usersResponse);
      if (!usersResponse.ok) throw new Error(usersPayload?.error || 'Unable to load users.');

      const existingUsers = Array.isArray(usersPayload?.users) ? usersPayload.users : [];
      const hasEmailInUse = existingUsers.some(user => String(user?.email || '').trim().toLowerCase() === email);
      if (hasEmailInUse) {
        throw new Error('That email is already in use. Use another email for this official driver.');
      }

      const usernameBase = [firstName, lastName].filter(Boolean).join('.').toLowerCase().replace(/[^a-z0-9.]+/g, '.').replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, '') || email.split('@')[0] || 'driver';
      const existingUsernames = new Set(existingUsers.map(user => String(user?.username || '').trim().toLowerCase()).filter(Boolean));
      let nextUsername = usernameBase;
      let usernameIndex = 1;
      while (existingUsernames.has(nextUsername)) {
        nextUsername = `${usernameBase}${usernameIndex}`;
        usernameIndex += 1;
      }

      const nextUserId = `user-driver-${Date.now()}`;
      const nextUser = {
        id: nextUserId,
        firstName,
        middleInitial: '',
        lastName,
        isCompany: false,
        companyName: '',
        taxId: '',
        email,
        phone,
        role: 'Driver(Driver)',
        username: nextUsername,
        password,
        webAccess: false,
        androidAccess: true,
        inactivityTimeoutMinutes: 15,
        lastEventTime: '',
        eventType: 'Created from messaging panel'
      };

      const saveUsersResponse = await fetch('/api/system-users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          ...usersPayload,
          users: [...existingUsers, nextUser]
        })
      });
      const saveUsersPayload = await readJsonResponse(saveUsersResponse);
      if (!saveUsersResponse.ok) throw new Error(saveUsersPayload?.error || 'Unable to save official driver user.');

      const adminResponse = await fetch('/api/nemt/admin', {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const adminPayload = await readJsonResponse(adminResponse);
      if (!adminResponse.ok) throw new Error(adminPayload?.error || 'Unable to load admin drivers.');

      const currentAdminDrivers = Array.isArray(adminPayload?.drivers) ? adminPayload.drivers : [];
      const linkedDriverIndex = currentAdminDrivers.findIndex(driver => String(driver?.authUserId || '').trim() === nextUserId || String(driver?.email || '').trim().toLowerCase() === email || String(driver?.portalEmail || '').trim().toLowerCase() === email);
      const nowIso = new Date().toISOString();
      const displayName = [firstName, lastName].filter(Boolean).join(' ').trim();
      const activeRoster = normalizeRouteRoster({
        mode: 'weekly',
        weekKey: getCurrentRosterWeekKey(),
        workStart: '12:00 AM',
        workEnd: '11:59 PM',
        atd: 'none'
      });

      const updatedDrivers = linkedDriverIndex >= 0 ? currentAdminDrivers.map((driver, index) => index === linkedDriverIndex ? {
        ...driver,
        authUserId: nextUserId,
        firstName,
        lastName,
        displayName,
        email,
        phone,
        username: nextUsername,
        portalUsername: nextUsername,
        portalEmail: email,
        password,
        role: 'Driver(Driver)',
        profileStatus: String(driver?.profileStatus || 'Pending').trim() || 'Pending',
        licenseNumber,
        licenseState: String(driver?.licenseState || 'FL').trim() || 'FL',
        licenseClass: String(driver?.licenseClass || '').trim(),
        licenseIssueDate: String(driver?.licenseIssueDate || nowIso.slice(0, 10)).trim(),
        licenseExpirationDate: String(driver?.licenseExpirationDate || '2027-12-31').trim(),
        backgroundCheckStatus: String(driver?.backgroundCheckStatus || 'Pending').trim() || 'Pending',
        drugScreenStatus: String(driver?.drugScreenStatus || 'Pending').trim() || 'Pending',
        checkpoint: String(driver?.checkpoint || 'Pending vehicle assignment').trim() || 'Pending vehicle assignment',
        routeRoster: activeRoster,
        notes: 'Official driver created from Dispatcher Messaging panel.',
        updatedAt: nowIso,
        documents: {
          ...(driver?.documents && typeof driver.documents === 'object' ? driver.documents : {}),
          licenseFront: driver?.documents?.licenseFront ?? null,
          licenseBack: driver?.documents?.licenseBack ?? null
        }
      } : driver) : [...currentAdminDrivers, {
        ...createBlankDriver(),
        id: buildStableDriverId({ authUserId: nextUserId, username: nextUsername, email, firstName, lastName }),
        authUserId: nextUserId,
        firstName,
        lastName,
        displayName,
        email,
        phone,
        username: nextUsername,
        portalUsername: nextUsername,
        portalEmail: email,
        password,
        role: 'Driver(Driver)',
        groupingId: 'grp-3',
        profileStatus: 'Pending',
        licenseNumber,
        licenseState: 'FL',
        licenseIssueDate: nowIso.slice(0, 10),
        licenseExpirationDate: '2027-12-31',
        checkpoint: 'Pending vehicle assignment',
        routeRoster: activeRoster,
        notes: 'Official driver created from Dispatcher Messaging panel.',
        createdAt: nowIso,
        updatedAt: nowIso
      }];

      const saveAdminResponse = await fetch('/api/nemt/admin', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          ...adminPayload,
          drivers: updatedDrivers
        })
      });
      const saveAdminPayload = await readJsonResponse(saveAdminResponse);
      if (!saveAdminResponse.ok) throw new Error(saveAdminPayload?.error || 'Official driver user was saved, but driver profile update failed.');

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('nemt-admin-updated'));
      }
      await refreshDispatchState({ forceServer: true });
      setOfficialDriverForm({ firstName: '', lastName: '', email: '', password: '', phone: '', licenseNumber: '' });
      setShowAddOfficialDriver(false);
      setSmsStatus('Official driver saved with login credentials and license profile.');
    } catch (error) {
      setSmsStatus(error?.message || 'Unable to save official driver.');
    } finally {
      setIsSavingOfficialDriver(false);
    }
  };

  const handleDeleteDailyDriver = driverId => {
    const normalizedDriverId = normalizeDriverId(driverId);
    removeDailyDriver(normalizedDriverId);
    if (normalizedDriverId === activeDriverId) {
      const next = visibleThreads.find(thread => normalizeDriverId(thread?.driverId) !== normalizedDriverId);
      setSelectedDriverId(normalizeDriverId(next?.driverId) || null);
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
    <div className="h-100 d-flex flex-column border rounded-3 overflow-hidden" style={messagingSurfaceStyles.shell}>
      <div className="d-flex justify-content-between align-items-center p-2 border-bottom flex-wrap gap-2" style={messagingSurfaceStyles.header}>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <strong>Messaging</strong>
          <Badge bg="light" text="dark">{visibleThreads.length} threads</Badge>
          <Badge bg="warning" text="dark">{unreadCount} unread</Badge>
          <Badge bg="success">{gpsOnlineCount} live GPS</Badge>
          <Button variant="outline-dark" size="sm" style={messagingSurfaceStyles.button} onClick={() => onOpenLayout?.()}>Layout</Button>
          <Button variant="outline-dark" size="sm" style={messagingSurfaceStyles.button} onClick={() => setShowPanelSettings(true)}>Sound</Button>
          {!hideThreadList ? <Button variant="outline-dark" size="sm" style={messagingSurfaceStyles.button} onClick={() => setShowAddDriver(current => !current)}>{showAddDriver ? 'Cancel Add Driver' : 'Add Driver'}</Button> : null}
          {!hideThreadList ? <Button variant="dark" size="sm" onClick={() => setShowAddOfficialDriver(current => !current)}>{showAddOfficialDriver ? 'Cancel Official Driver' : 'Official Driver'}</Button> : null}
        </div>
        {!hideThreadList ? <>
            <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ minWidth: 140, maxWidth: 250 }}>
              <Form.Control value={driverSearch} onChange={event => setDriverSearch(event.target.value)} placeholder="Search driver, message, vehicle..." style={messagingSurfaceStyles.input} spellCheck={false} autoComplete="off" />
            </div>
          </> : null}
      </div>
      <div className="d-flex flex-grow-1" style={{ minHeight: 0, overflow: 'hidden' }}>
        {!hideThreadList ? <div className="border-end d-flex flex-column" style={{ width: '40%', minWidth: 220, minHeight: 0, ...messagingSurfaceStyles.sidebar }}>
          <div className="p-3 border-bottom" style={messagingSurfaceStyles.sidebarHeader}>
            {showAddDriver ? (
              <div className="mt-3 border rounded p-2" style={{ backgroundColor: messagingSurfaceStyles.input.backgroundColor, borderColor: messagingSurfaceStyles.sidebar.borderColor }}>
                <div className="fw-semibold small mb-2">Daily Driver de emergencia</div>
                <Form.Control
                  size="sm"
                  className="mb-2"
                  style={messagingSurfaceStyles.input}
                  placeholder="Nombre *"
                  value={dailyForm.firstName}
                  onChange={e => setDailyForm(f => ({ ...f, firstName: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddDailyDriver(); }}
                />
                <Form.Control
                  size="sm"
                  className="mb-2"
                  style={messagingSurfaceStyles.input}
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
            {showAddOfficialDriver ? (
              <div className="mt-3 border rounded p-2" style={{ backgroundColor: messagingSurfaceStyles.input.backgroundColor, borderColor: messagingSurfaceStyles.sidebar.borderColor }}>
                <div className="fw-semibold small mb-2">Official Driver (se guarda en sistema)</div>
                <Form.Control
                  size="sm"
                  className="mb-2"
                  style={messagingSurfaceStyles.input}
                  placeholder="First name *"
                  value={officialDriverForm.firstName}
                  onChange={event => setOfficialDriverForm(current => ({ ...current, firstName: event.target.value }))}
                  onKeyDown={event => { if (event.key === 'Enter') void handleAddOfficialDriver(); }}
                />
                <Form.Control
                  size="sm"
                  className="mb-2"
                  style={messagingSurfaceStyles.input}
                  placeholder="Last name"
                  value={officialDriverForm.lastName}
                  onChange={event => setOfficialDriverForm(current => ({ ...current, lastName: event.target.value }))}
                  onKeyDown={event => { if (event.key === 'Enter') void handleAddOfficialDriver(); }}
                />
                <Form.Control
                  size="sm"
                  className="mb-2"
                  style={messagingSurfaceStyles.input}
                  placeholder="Email *"
                  value={officialDriverForm.email}
                  onChange={event => setOfficialDriverForm(current => ({ ...current, email: event.target.value }))}
                  onKeyDown={event => { if (event.key === 'Enter') void handleAddOfficialDriver(); }}
                />
                <Form.Control
                  size="sm"
                  className="mb-2"
                  type="password"
                  style={messagingSurfaceStyles.input}
                  placeholder="Password *"
                  value={officialDriverForm.password}
                  onChange={event => setOfficialDriverForm(current => ({ ...current, password: event.target.value }))}
                  onKeyDown={event => { if (event.key === 'Enter') void handleAddOfficialDriver(); }}
                />
                <Form.Control
                  size="sm"
                  className="mb-2"
                  style={messagingSurfaceStyles.input}
                  placeholder="Phone"
                  value={officialDriverForm.phone}
                  onChange={event => setOfficialDriverForm(current => ({ ...current, phone: event.target.value }))}
                  onKeyDown={event => { if (event.key === 'Enter') void handleAddOfficialDriver(); }}
                />
                <Form.Control
                  size="sm"
                  className="mb-2"
                  style={messagingSurfaceStyles.input}
                  placeholder="License number *"
                  value={officialDriverForm.licenseNumber}
                  onChange={event => setOfficialDriverForm(current => ({ ...current, licenseNumber: event.target.value }))}
                  onKeyDown={event => { if (event.key === 'Enter') void handleAddOfficialDriver(); }}
                />
                <div className="small mb-2" style={{ opacity: 0.8 }}>
                  Docs upload (license front/back and other files) stays in User Management profile.
                </div>
                <Button size="sm" variant="primary" onClick={() => void handleAddOfficialDriver()} disabled={!officialDriverForm.firstName.trim() || !officialDriverForm.email.trim() || !officialDriverForm.password.trim() || !officialDriverForm.licenseNumber.trim() || isSavingOfficialDriver}>
                  {isSavingOfficialDriver ? 'Saving...' : 'Save Official Driver'}
                </Button>
              </div>
            ) : null}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {filteredThreads.length > 0 ? filteredThreads.map(thread => {
              const threadDriverId = normalizeDriverId(thread?.driverId);
              const driver = allDriversById.get(threadDriverId) ?? null;
              const isDaily = driver?._isDaily === true;
              const hasGps = Boolean(driver?.hasRealLocation || (Array.isArray(driver?.position) && driver.position.length === 2 && driver.position.every(value => Number.isFinite(Number(value)))));
              const sequencePreview = driverSequencePreviewById?.get?.(threadDriverId) ?? null;
              const lastMessage = thread.messages[thread.messages.length - 1];
              const threadUnreadCount = thread.messages.filter(message => message.direction === 'incoming' && message.status !== 'read').length;
              const threadAlertCount = activeAlertCounts[threadDriverId] || 0;
              const hasUrgentAlert = driverAlerts.some(alert => normalizeDriverId(alert?.driverId) === threadDriverId && alert.status !== 'resolved' && (alert.priority === 'high' || alert.priority === 'urgent'));
              const isActiveThread = threadDriverId === activeDriverId;
              const driverColor = getDriverColor(driver?.id || driver?.name || threadDriverId);
              return (
                <div
                  key={threadDriverId}
                  className={`border-bottom ${isActiveThread ? 'text-white' : 'text-body'}`}
                  style={{
                    backgroundColor: isActiveThread ? driverColor : hasUrgentAlert ? messagingSurfaceStyles.threadUrgentBackground : withDriverAlpha(driverColor, isDarkMode ? 0.16 : 0.05),
                    borderBottomColor: isDarkMode ? 'rgba(71, 85, 105, 0.4)' : '#e2e8f0',
                    borderLeft: `4px solid ${hasUrgentAlert ? '#ea580c' : driverColor}`
                  }}
                >
                  <div className="d-flex align-items-center gap-2 px-2 py-1" style={{ minHeight: 58 }}>
                    <div className="flex-grow-1">
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectDriver(threadDriverId);
                          if (hasGps) onLocateDriver?.(threadDriverId);
                        }}
                        className={`w-100 text-start border-0 px-1 ${isActiveThread ? 'text-white' : 'text-body'}`}
                        style={{ backgroundColor: 'transparent' }}
                      >
                        <div className="d-flex justify-content-between align-items-center gap-2">
                          <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                            <div style={{ minWidth: 0 }}>
                              <div className="fw-semibold d-flex align-items-center gap-2 text-truncate" style={{ maxWidth: 210 }}>
                                <span className="rounded-circle d-inline-block" style={{ width: 10, height: 10, backgroundColor: driverColor, boxShadow: `0 0 0 2px ${isActiveThread ? 'rgba(255,255,255,0.35)' : withDriverAlpha(driverColor, 0.18)}` }} />
                                {driver?.name ?? 'Driver'}
                                {hasGps ? <span className="rounded-circle bg-success d-inline-block" style={{ width: 8, height: 8 }} /> : null}
                              </div>
                              {sequencePreview ? <div
                                className="small text-truncate"
                                style={{
                                  maxWidth: 220,
                                  color: isActiveThread ? selectedChatTheme.activeThreadSubtle : messagingSurfaceStyles.secondaryText,
                                  fontWeight: 600
                                }}
                                title={`${sequencePreview.rider || sequencePreview.tripId || 'Current trip'} | ${sequencePreview.stageLabel} ${sequencePreview.timeLabel}`}
                              >
                                {sequencePreview.rider || sequencePreview.tripId || 'Current trip'}
                              </div> : null}
                              <span
                                role={hasGps ? 'button' : undefined}
                                tabIndex={hasGps ? 0 : undefined}
                                onClick={event => {
                                  event.stopPropagation();
                                  if (!hasGps) return;
                                  handleSelectDriver(threadDriverId);
                                  onLocateDriver?.(threadDriverId);
                                }}
                                onKeyDown={event => {
                                  if (!hasGps) return;
                                  if (event.key !== 'Enter' && event.key !== ' ') return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                  handleSelectDriver(threadDriverId);
                                  onLocateDriver?.(threadDriverId);
                                }}
                                className="d-inline-block mt-1 text-start small"
                                style={{
                                  maxWidth: 220,
                                  color: hasGps ? (isActiveThread ? '#dbeafe' : driverColor) : (isActiveThread ? selectedChatTheme.activeThreadSubtle : messagingSurfaceStyles.secondaryText),
                                  textDecoration: hasGps ? 'underline' : 'none',
                                  cursor: hasGps ? 'pointer' : 'default'
                                }}
                                title={hasGps ? 'Center this driver on the map' : 'This driver has no live GPS yet'}
                              >
                                {sequencePreview ? `${sequencePreview.stageLabel} ${sequencePreview.timeLabel}${sequencePreview.targetLabel ? ` | ${sequencePreview.targetLabel}` : ''}` : getDriverLocationLabel(driver)}
                              </span>
                              <div className="small text-truncate" style={{ maxWidth: 220, color: isActiveThread ? selectedChatTheme.activeThreadSubtle : messagingSurfaceStyles.secondaryText }}>{isDaily ? 'Daily Driver' : driver?.vehicle || 'Pending vehicle'}</div>
                            </div>
                          </div>
                          <div className="text-end">
                            <div className="small">{lastMessage ? formatDispatchTime(lastMessage.timestamp, uiPreferences?.timeZone) : '--:--'}</div>
                            {hasGps ? <div className="d-flex justify-content-end mt-1"><span className="rounded-circle bg-success d-inline-block" style={{ width: 10, height: 10 }} title="GPS active" /></div> : null}
                            {threadUnreadCount > 0 ? <Badge bg="danger">{threadUnreadCount}</Badge> : null}
                            {threadAlertCount > 0 ? <Badge bg="warning" text="dark" className="ms-1">{threadAlertCount}</Badge> : null}
                          </div>
                        </div>
                      </button>
                    </div>
                    <Button variant="link" size="sm" className="p-1 text-decoration-none" style={{ color: isActiveThread ? '#ffffff' : '#64748b' }} onClick={() => handleHideDriver(threadDriverId)} title="Remove driver from this panel">
                      <IconifyIcon icon="iconoir:xmark" />
                    </Button>
                    {isDaily ? (
                      <Button variant="link" size="sm" className="p-1 text-decoration-none text-danger" onClick={() => handleDeleteDailyDriver(threadDriverId)} title="Borrar Daily Driver">
                        <IconifyIcon icon="iconoir:trash" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            }) : <div className="text-center py-4 small" style={{ color: messagingSurfaceStyles.secondaryText }}>{driverSearch.trim() ? 'No drivers match this search.' : 'No driver threads available.'}</div>}
          </div>
        </div> : null}
        <div className="d-flex flex-column flex-grow-1" style={{ minWidth: 0, ...messagingSurfaceStyles.mainPane }}>
          <div className="flex-grow-1 p-3 d-flex flex-column" style={{ overflowY: 'auto', minHeight: 0, background: messagingSurfaceStyles.mainPaneGradient }}>
            <div className="mb-3" style={messagingStatusRowStyle}>
              {!isLoadingAlerts && alertsError ? <div className="small text-warning">{alertsError}</div> : null}
              {!alertsError && isLoadingAlerts && activeDriverAlerts.length === 0 ? <div className="small text-muted">Loading driver alerts...</div> : null}
            </div>
            {smsStatus ? <div className={`alert ${smsStatus.toLowerCase().includes('unable') || smsStatus.toLowerCase().includes('missing') || smsStatus.toLowerCase().includes('failed') ? 'alert-warning' : smsStatus.toLowerCase().includes('sending') ? 'alert-info' : 'alert-success'} py-2 mb-3`}>{smsStatus}</div> : null}
            {activeDriverAlerts.length > 0 ? <div className="d-flex flex-column gap-2 mb-3">
                {activeDriverAlerts.map(alert => alert?.type === 'delay-alert' ? <div key={alert.id} className="border rounded p-2 shadow-sm" style={getAlertSurfaceStyle(alert, isDarkMode)}>
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <strong style={{ fontSize: '0.95rem', lineHeight: 1.2 }}>{alert.subject || 'Driver alert'}</strong>
                      <Badge bg={getAlertVariant(alert.priority)}>{alert.priority || 'normal'}</Badge>
                      <Badge bg="dark">{getAlertLabel(alert)}</Badge>
                    </div>
                    <div className="small text-muted mt-1">{formatDispatchTime(alert.createdAt, uiPreferences?.timeZone)} | {alert.deliveryMethod || 'in-app'}</div>
                    <div className="mt-2 small">{getAlertDisplayBody(alert)}</div>
                  </div> : <div key={alert.id} className="border rounded p-3 shadow-sm" style={getAlertSurfaceStyle(alert, isDarkMode)}>
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
                    <div className="mt-2 small">{getAlertDisplayBody(alert)}</div>
                    <div className="mt-3 d-flex gap-2 flex-wrap">
                      <Button size="sm" variant="warning" onClick={() => void handleSendSmsTemplate(alert, DRIVER_ALERT_SMS_TEMPLATES['delay-alert'](activeDriver?.name || 'driver'))} disabled={isSendingSms || normalizePhoneDigits(activeDriver?.phone).length < 10}>Late ETA SMS</Button>
                      <Button size="sm" variant="primary" onClick={() => void handleSendSmsTemplate(alert, DRIVER_ALERT_SMS_TEMPLATES['backup-driver-request'](activeDriver?.name || 'driver'))} disabled={isSendingSms || normalizePhoneDigits(activeDriver?.phone).length < 10}>Backup Driver SMS</Button>
                      {alert?.type !== 'delay-alert' ? <Button size="sm" variant="danger" onClick={() => void handleSendSmsTemplate(alert, DRIVER_ALERT_SMS_TEMPLATES['uber-request'](activeDriver?.name || 'driver'))} disabled={isSendingSms || normalizePhoneDigits(activeDriver?.phone).length < 10}>Uber SMS</Button> : null}
                    </div>
                  </div>)}
              </div> : null}
            {sortedActiveMessages.length ? sortedActiveMessages.map(message => (
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
                  <div style={{ fontSize: 12, marginTop: 4, color: message.direction === 'outgoing' ? selectedChatTheme.outgoingMeta : selectedChatTheme.incomingMeta }}>{formatDispatchTime(message.timestamp, uiPreferences?.timeZone)} {message.direction === 'outgoing' ? `| ${message.status === 'sending' ? 'sending...' : message.status}` : ''}</div>
                </div>
              </div>
            )) : <div className="text-center py-5" style={{ color: messagingSurfaceStyles.secondaryText }}>No messages yet for this driver.</div>}
          </div>
          <div className="p-3 border-top" style={messagingSurfaceStyles.footer}>
            <input ref={photoInputRef} type="file" accept="image/*" className="d-none" onChange={event => {
              void handleAttachmentPick(event, 'photo');
            }} />
            <input ref={documentInputRef} type="file" accept=".pdf,.doc,.docx,.txt,image/*" className="d-none" onChange={event => {
              void handleAttachmentPick(event, 'document');
            }} />
            <div className="d-flex align-items-center gap-2 border rounded-3 px-2 py-2" style={messagingSurfaceStyles.composer}>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={!activeDriver || isSendingMessage}
                className="border-0 bg-transparent d-inline-flex align-items-center justify-content-center rounded-circle"
                style={{ width: 32, height: 32, color: activeDriver ? selectedChatTheme.accent : '#94a3b8' }}
                title="Add photo"
              >
                <IconifyIcon icon="iconoir:media-image" />
              </button>
              <button
                type="button"
                onClick={() => documentInputRef.current?.click()}
                disabled={!activeDriver || isSendingMessage}
                className="border-0 bg-transparent d-inline-flex align-items-center justify-content-center rounded-circle"
                style={{ width: 32, height: 32, color: activeDriver ? selectedChatTheme.accent : '#94a3b8' }}
                title="Add document"
              >
                <IconifyIcon icon="iconoir:page" />
              </button>
              <button
                type="button"
                onClick={handleOpenDriverWhatsApp}
                disabled={!activeDriver || isSendingMessage || normalizePhoneDigits(activeDriver?.phone).length < 10}
                className="border-0 bg-transparent d-inline-flex align-items-center justify-content-center rounded-circle"
                style={{ width: 32, height: 32, color: activeDriver ? '#16a34a' : '#94a3b8' }}
                title="Open driver WhatsApp"
              >
                <IconifyIcon icon="mdi:whatsapp" />
              </button>
              <Form.Control value={draftMessage} onChange={event => setDraftMessage(event.target.value)} placeholder={activeDriver ? `Message ${activeDriver.name}` : 'Select a driver first'} disabled={!activeDriver || isSendingMessage} className="border-0 shadow-none" style={{ backgroundColor: 'transparent', color: messagingSurfaceStyles.shell.color }} onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleSendMessage(draftMessage);
                }
              }} />
              <Button variant="dark" onClick={() => void handleSendMessage(draftMessage)} disabled={!activeDriver || !draftMessage.trim() || isSendingMessage} className="rounded-3 px-3">{isSendingMessage ? 'Sending...' : 'Send'}</Button>
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
