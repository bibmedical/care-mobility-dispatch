'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useNotificationContext } from '@/context/useNotificationContext';
import { useLayoutContext } from '@/context/useLayoutContext';
import { isAdminRole } from '@/helpers/system-users';
import styles from './SystemLogsWorkspace.module.scss';

const SESSION_EVENT_TYPES = new Set(['LOGIN', 'LOGOUT']);
const WORK_EVENT_TYPES = new Set(['LOGIN', 'LOGOUT', 'ACTION']);
const WORKDAY_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ONLINE_RECENT_ACTIVITY_MS = 15 * 60 * 1000;
const PRESENCE_HEARTBEAT_LABEL = 'Presence heartbeat';
const DRIVER_ALERT_ACTION_LABELS = {
  'Sent dispatcher SMS escalation': 'sms-escalation',
  'Resolved mobile driver alert': 'resolve-alert',
  'Loaded mobile driver alert into draft': 'use-as-draft'
};

const pad = value => String(value).padStart(2, '0');
const getDateKeyFromTimestampMs = timestampMs => {
  const date = new Date(timestampMs);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const getTodayDateKey = nowMs => getDateKeyFromTimestampMs(nowMs);
const getLocalDayStartMs = dateKey => {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return Number.NaN;
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
};

const addDurationAcrossLocalDays = (totalsMap, userId, startMs, endMs) => {
  if (!userId || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return;

  let cursor = startMs;
  while (cursor < endMs) {
    const dateKey = getDateKeyFromTimestampMs(cursor);
    const dayStartMs = getLocalDayStartMs(dateKey);
    if (!dateKey || !Number.isFinite(dayStartMs)) break;
    const nextDayMs = new Date(dayStartMs);
    nextDayMs.setDate(nextDayMs.getDate() + 1);
    const sliceEndMs = Math.min(endMs, nextDayMs);
    const bucketKey = `${userId}::${dateKey}`;
    totalsMap.set(bucketKey, (totalsMap.get(bucketKey) || 0) + Math.max(0, sliceEndMs - cursor));
    cursor = sliceEndMs;
  }
};

const formatDurationMs = milliseconds => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '00:00:00';
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const formatTimestamp12 = value => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '--';
  return date.toLocaleTimeString('en-US', {
    hour12: true,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const buildSessionState = logs => {
  const activeSessionByUserId = new Map();
  const durationByLoginId = new Map();
  const sessionLogs = [...(Array.isArray(logs) ? logs : [])]
    .filter(log => log?.userId && SESSION_EVENT_TYPES.has(log.eventType))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  sessionLogs.forEach(log => {
    if (log.eventType === 'LOGIN') {
      const previousOpenSession = activeSessionByUserId.get(log.userId);
      if (previousOpenSession) {
        durationByLoginId.set(
          previousOpenSession.id,
          Math.max(0, new Date(log.timestamp).getTime() - new Date(previousOpenSession.timestamp).getTime())
        );
      }
      activeSessionByUserId.set(log.userId, log);
      return;
    }

    const activeSession = activeSessionByUserId.get(log.userId);
    if (!activeSession) return;
    durationByLoginId.set(
      activeSession.id,
      Math.max(0, new Date(log.timestamp).getTime() - new Date(activeSession.timestamp).getTime())
    );
    activeSessionByUserId.delete(log.userId);
  });

  return {
    activeSessionByUserId,
    durationByLoginId
  };
};

const buildWorkdayState = (logs, nowMs) => {
  const logsByUserId = new Map();
  const totalByUserDate = new Map();
  const activeDayByUserId = new Map();
  const todayKey = getTodayDateKey(nowMs);

  (Array.isArray(logs) ? logs : [])
    .filter(log => log?.userId && WORK_EVENT_TYPES.has(log.eventType) && log?.timestamp)
    .forEach(log => {
      if (!logsByUserId.has(log.userId)) logsByUserId.set(log.userId, []);
      logsByUserId.get(log.userId).push(log);
    });

  logsByUserId.forEach((groupLogs, userId) => {
    const orderedLogs = [...groupLogs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    let segmentStartMs = null;
    let previousTimestampMs = null;
    let lastOpenLog = null;

    orderedLogs.forEach(log => {
      const timestampMs = new Date(log.timestamp).getTime();
      if (!Number.isFinite(timestampMs)) return;

      if (segmentStartMs === null) {
        segmentStartMs = timestampMs;
        previousTimestampMs = timestampMs;
        lastOpenLog = log;
      } else {
        const gapMs = Math.max(0, timestampMs - previousTimestampMs);
        const countedEndMs = gapMs > WORKDAY_IDLE_TIMEOUT_MS ? previousTimestampMs + WORKDAY_IDLE_TIMEOUT_MS : timestampMs;
        addDurationAcrossLocalDays(totalByUserDate, userId, previousTimestampMs, countedEndMs);
        previousTimestampMs = timestampMs;
        lastOpenLog = log;
      }

      if (log.eventType === 'LOGOUT') {
        segmentStartMs = null;
        previousTimestampMs = null;
        lastOpenLog = null;
      }
    });

    if (segmentStartMs !== null && previousTimestampMs != null && lastOpenLog) {
      const tailGapMs = Math.max(0, nowMs - previousTimestampMs);
      const tailEndMs = tailGapMs > WORKDAY_IDLE_TIMEOUT_MS ? previousTimestampMs + WORKDAY_IDLE_TIMEOUT_MS : nowMs;
      addDurationAcrossLocalDays(totalByUserDate, userId, previousTimestampMs, tailEndMs);
      const todayTotalMs = totalByUserDate.get(`${userId}::${todayKey}`) || 0;
      const hasRecentActivity = tailGapMs <= ONLINE_RECENT_ACTIVITY_MS;
      if (todayTotalMs > 0 && hasRecentActivity) {
        activeDayByUserId.set(userId, {
          ...lastOpenLog,
          totalMs: todayTotalMs,
          startedAt: segmentStartMs
        });
      }
    }
  });

  return {
    totalByUserDate,
    activeDayByUserId
  };
};

const truncateAction = value => {
  const text = String(value || '').trim();
  if (!text) return 'ACCION';
  return text.length > 48 ? `${text.slice(0, 48)}...` : text;
};

const getActionLabel = log => {
  if (log.eventType === 'LOGIN') return 'ENTRADA';
  if (log.eventType === 'LOGOUT') return 'SALIDA';
  return truncateAction(log.eventLabel || 'ACCION');
};

const isPresenceHeartbeatLog = log => {
  if (log?.eventType !== 'ACTION') return false;
  const eventLabel = String(log?.eventLabel || '').trim().toLowerCase();
  if (eventLabel === PRESENCE_HEARTBEAT_LABEL.toLowerCase()) return true;
  const metadataKind = String(log?.metadata?.kind || '').trim().toLowerCase();
  return metadataKind === 'presence-heartbeat';
};

const getActionClass = actionLabel => {
  const normalized = String(actionLabel || '').trim().toUpperCase();
  if (normalized.startsWith('ENTRADA')) return 'actionLOGIN';
  if (normalized.startsWith('SALIDA')) return 'actionLOGOUT';
  return 'actionACTION';
};

const getRoleFilterKey = role => {
  const normalizedRole = String(role || '').toLowerCase();
  if (normalizedRole.includes('driver') || normalizedRole.includes('chofer')) return 'driver';
  if (normalizedRole.includes('attendant') || normalizedRole.includes('assistant')) return 'attendant';
  return 'admin';
};

const getDriverAlertActionKey = log => {
  const eventLabel = String(log?.eventLabel || '').trim();
  if (DRIVER_ALERT_ACTION_LABELS[eventLabel]) return DRIVER_ALERT_ACTION_LABELS[eventLabel];
  const metadataAction = String(log?.metadata?.action || '').trim();
  if (metadataAction) return metadataAction;
  return '';
};

const isDriverAlertActionLog = log => {
  if (log?.eventType !== 'ACTION') return false;
  return Boolean(getDriverAlertActionKey(log));
};

const getDriverAlertTypeLabel = alertType => {
  if (alertType === 'delay-alert') return 'Late ETA';
  if (alertType === 'backup-driver-request') return 'Backup Driver';
  if (alertType === 'uber-request') return 'Uber Coverage';
  return 'Driver Alert';
};

const getDriverAlertActionLabel = actionKey => {
  if (actionKey === 'sms-escalation') return 'SMS Escalated';
  if (actionKey === 'resolve-alert') return 'Resolved';
  if (actionKey === 'use-as-draft') return 'Loaded Draft';
  return actionKey || 'Action';
};

const getDriverAlertChannelLabel = log => {
  const actionKey = getDriverAlertActionKey(log);
  if (actionKey === 'sms-escalation') return log?.metadata?.mode === 'template' ? 'SMS Template' : 'SMS Raw';
  if (actionKey === 'resolve-alert') return 'Resolved In App';
  if (actionKey === 'use-as-draft') return 'Draft Prepared';
  return 'Internal';
};

const formatDateTime = value => {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return '--';
  return date.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const getSmsStatusLabel = status => {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (normalizedStatus === 'sent') return 'Sent';
  if (normalizedStatus === 'failed') return 'Failed';
  if (normalizedStatus === 'skipped') return 'Skipped';
  return normalizedStatus || 'Queued';
};

const getSmsStatusClass = status => {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (normalizedStatus === 'sent') return 'statusSent';
  if (normalizedStatus === 'failed') return 'statusFailed';
  if (normalizedStatus === 'skipped') return 'statusSkipped';
  return 'statusQueued';
};

const getSeverityLabel = severity => {
  const normalizedSeverity = String(severity || '').trim().toLowerCase();
  if (normalizedSeverity === 'high') return 'High';
  return normalizedSeverity ? normalizedSeverity.replace(/(^|-)(\w)/g, (_, separator, letter) => `${separator ? ' ' : ''}${letter.toUpperCase()}`) : 'Normal';
};

const getSeverityClass = severity => {
  const normalizedSeverity = String(severity || '').trim().toLowerCase();
  return normalizedSeverity === 'high' ? 'severityHigh' : 'severityNormal';
};

const getDisciplineStatusLabel = status => {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (normalizedStatus === 'resolved') return 'Resolved';
  if (normalizedStatus === 'active') return 'Active';
  return normalizedStatus ? normalizedStatus.replace(/(^|-)(\w)/g, (_, separator, letter) => `${separator ? ' ' : ''}${letter.toUpperCase()}`) : 'Logged';
};

const getDisciplineStatusClass = status => {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (normalizedStatus === 'resolved') return 'disciplineResolved';
  if (normalizedStatus === 'active') return 'disciplineActive';
  return 'disciplineLogged';
};

const getWorkflowActionLabel = action => {
  const normalizedAction = String(action || '').trim().toLowerCase();
  if (normalizedAction === 'en-route') return 'En Route';
  if (normalizedAction === 'arrived') return 'Arrived';
  if (normalizedAction === 'complete') return 'Complete';
  return normalizedAction || 'Action';
};

const summarizeArrivalNotifications = summary => {
  const results = Array.isArray(summary?.results) ? summary.results : [];
  return {
    patientSent: results.filter(result => result?.audience === 'patient' && result?.ok).length,
    officeSent: results.filter(result => result?.audience === 'office' && result?.ok).length,
    failed: results.filter(result => !result?.ok).length,
    provider: summary?.provider || '--'
  };
};

const buildWorkflowSummary = event => {
  const summaryParts = [];
  if (event?.compliance?.measured) {
    summaryParts.push(event?.compliance?.isLate ? `Late ${Math.max(0, Number(event?.compliance?.lateByMinutes) || 0)} min` : 'On time');
  } else {
    summaryParts.push('Not measured');
  }
  if (event?.metadata?.locationRecorded || Number.isFinite(Number(event?.locationSnapshot?.latitude))) {
    summaryParts.push('GPS captured');
  }
  if (event?.riderSignatureName) {
    summaryParts.push(`Signed by ${event.riderSignatureName}`);
  }
  return summaryParts.join(' | ');
};

const buildDriverAlertSummary = log => {
  if (log?.metadata?.smsMessage) return String(log.metadata.smsMessage).trim();
  if (log?.metadata?.driverName && log?.metadata?.alertType) {
    return `${log.metadata.driverName} | ${getDriverAlertTypeLabel(log.metadata.alertType)}`;
  }
  return String(log?.target || '').trim();
};

const SystemLogsWorkspace = () => {
  const { data: session } = useSession();
  const { showNotification } = useNotificationContext();
  const { themeMode } = useLayoutContext();
  const canClearLogs = isAdminRole(session?.user?.role);

  const [logs, setLogs] = useState([]);
  const [allLogs, setAllLogs] = useState([]);
  const [systemUsers, setSystemUsers] = useState([]);
  const [smsDeliveryLogs, setSmsDeliveryLogs] = useState([]);
  const [tripArrivalEvents, setTripArrivalEvents] = useState([]);
  const [driverDisciplineEvents, setDriverDisciplineEvents] = useState([]);
  const [tripWorkflowEvents, setTripWorkflowEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalEvents: 0,
    todayEvents: 0,
    onlineUsers: []
  });
  const [filterRole, setFilterRole] = useState('all');
  const [activityView, setActivityView] = useState('workers');
  const [alertActionFilter, setAlertActionFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetailLogs, setUserDetailLogs] = useState([]);
  const [showUserDetail, setShowUserDetail] = useState(false);
  const [clockTick, setClockTick] = useState(Date.now());

  const fetchLogs = async () => {
    try {
      setLoading(true);

      const [summaryRes, logsRes, usersRes, smsRes, arrivalsRes, disciplineRes, workflowRes] = await Promise.all([
        fetch('/api/system-logs?summary=true', { cache: 'no-store' }),
        fetch('/api/system-logs', { cache: 'no-store' }),
        fetch('/api/system-users', { cache: 'no-store' }),
        fetch('/api/nemt/sms-delivery-logs?limit=300', { cache: 'no-store' }),
        fetch('/api/nemt/trip-arrival-events?limit=300', { cache: 'no-store' }),
        fetch('/api/nemt/driver-discipline?limit=300', { cache: 'no-store' }),
        fetch('/api/nemt/trip-workflow-events?limit=300', { cache: 'no-store' })
      ]);

      const [summaryData, logsData, usersData, smsData, arrivalsData, disciplineData, workflowData] = await Promise.all([
        summaryRes.json(),
        logsRes.json(),
        usersRes.json(),
        smsRes.json(),
        arrivalsRes.json(),
        disciplineRes.json(),
        workflowRes.json()
      ]);

      setStats(summaryRes.ok ? summaryData : {
        totalEvents: 0,
        todayEvents: 0,
        onlineUsers: []
      });

      if (logsData?.success) {
        const nextAllLogs = Array.isArray(logsData.logs) ? logsData.logs : [];
        setAllLogs(nextAllLogs);
        setLogs(filterRole === 'all' ? nextAllLogs : nextAllLogs.filter(log => getRoleFilterKey(log.userRole) === filterRole));
      } else {
        setAllLogs([]);
        setLogs([]);
      }

      if (usersRes.ok) {
        const nextUsers = Array.isArray(usersData?.users) ? usersData.users : [];
        setSystemUsers(filterRole === 'all' ? nextUsers : nextUsers.filter(user => getRoleFilterKey(user?.role) === filterRole));
      } else {
        setSystemUsers([]);
      }

      setSmsDeliveryLogs(smsRes.ok && Array.isArray(smsData?.logs) ? smsData.logs : []);
      setTripArrivalEvents(arrivalsRes.ok && Array.isArray(arrivalsData?.events) ? arrivalsData.events : []);
      setDriverDisciplineEvents(disciplineRes.ok && Array.isArray(disciplineData?.events) ? disciplineData.events : []);
      setTripWorkflowEvents(workflowRes.ok && Array.isArray(workflowData?.events) ? workflowData.events : []);
    } catch (error) {
      console.error('Error fetching logs:', error);
      showNotification({
        message: 'Error al cargar los logs',
        variant: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearAllLogs = async () => {
    const shouldClear = typeof window !== 'undefined' ? window.confirm('Clear all System Logs now? This cannot be undone.') : false;
    if (!shouldClear) return;

    try {
      const response = await fetch('/api/system-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clear-all',
          eventLabel: 'Clear all logs'
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || 'Unable to clear logs');
      }

      showNotification({
        message: 'System Logs cleared successfully.',
        variant: 'success'
      });
      await fetchLogs();
    } catch (error) {
      showNotification({
        message: `Could not clear logs: ${error?.message || 'Unknown error'}`,
        variant: 'error'
      });
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 30000);
    return () => clearInterval(interval);
  }, [filterRole]);

  useEffect(() => {
    const timer = setInterval(() => setClockTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const detailSessionState = useMemo(() => buildSessionState(userDetailLogs), [userDetailLogs]);
  const sessionState = useMemo(() => buildSessionState(logs), [logs]);
  const workdayState = useMemo(() => buildWorkdayState(logs, clockTick), [logs, clockTick]);
  const detailWorkdayState = useMemo(() => buildWorkdayState(userDetailLogs, clockTick), [userDetailLogs, clockTick]);
  const todayDateKey = useMemo(() => getTodayDateKey(clockTick), [clockTick]);

  const summaryLogs = useMemo(() => logs.filter(log => WORK_EVENT_TYPES.has(log.eventType) && !isPresenceHeartbeatLog(log)), [logs]);
  const presenceHeartbeatLogs = useMemo(() => logs.filter(log => isPresenceHeartbeatLog(log)), [logs]);

  const workerSummaries = useMemo(() => {
    const summaryMap = new Map();
    const nowMs = Number(clockTick) || Date.now();
    const lastPresenceHeartbeatByUserId = new Map();

    presenceHeartbeatLogs.forEach(log => {
      if (!log?.userId || !log?.timestamp) return;
      const timestampMs = new Date(log.timestamp).getTime();
      if (!Number.isFinite(timestampMs)) return;
      const previousTimestamp = Number(lastPresenceHeartbeatByUserId.get(log.userId) || 0);
      if (timestampMs >= previousTimestamp) lastPresenceHeartbeatByUserId.set(log.userId, timestampMs);
    });

    systemUsers.forEach(user => {
      summaryMap.set(user.id, {
        userId: user.id,
        userName: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.username || user.email || user.id,
        userRole: user.role || 'Unknown',
        userEmail: user.email || '-',
        todayWorkedMs: workdayState.totalByUserDate.get(`${user.id}::${todayDateKey}`) || 0,
        todayActionCount: 0,
        todayLastTimestamp: 0,
        todayLastAction: 'Sin actividad',
        isOnline: false
      });
    });

    presenceHeartbeatLogs.forEach(log => {
      if (!log?.userId) return;
      if (summaryMap.has(log.userId)) return;
      summaryMap.set(log.userId, {
        userId: log.userId,
        userName: log.userName || log.userId,
        userRole: log.userRole || 'Unknown',
        userEmail: log.userEmail || '-',
        todayWorkedMs: workdayState.totalByUserDate.get(`${log.userId}::${todayDateKey}`) || 0,
        todayActionCount: 0,
        todayLastTimestamp: 0,
        todayLastAction: 'Sin actividad',
        isOnline: false
      });
    });

    summaryLogs.forEach(log => {
      if (!log?.userId) return;
      if (!summaryMap.has(log.userId)) {
        summaryMap.set(log.userId, {
          userId: log.userId,
          userName: log.userName || log.userId,
          userRole: log.userRole || 'Unknown',
          userEmail: log.userEmail || '-',
          todayWorkedMs: 0,
          todayActionCount: 0,
          todayLastTimestamp: 0,
          todayLastAction: 'Sin actividad',
          isOnline: false
        });
      }

      const current = summaryMap.get(log.userId);
      const todayWorkedMs = workdayState.totalByUserDate.get(`${log.userId}::${todayDateKey}`) || current.todayWorkedMs;
      const timestampMs = new Date(log.timestamp).getTime();
      const isToday = Number.isFinite(timestampMs) && getDateKeyFromTimestampMs(timestampMs) === todayDateKey;
      const shouldUpdateLastAction = isToday && timestampMs >= Number(current.todayLastTimestamp || 0);
      const lastHeartbeatMs = Number(lastPresenceHeartbeatByUserId.get(log.userId) || 0);
      const hasRecentActivity = Number.isFinite(lastHeartbeatMs) && lastHeartbeatMs > 0 && nowMs - lastHeartbeatMs <= ONLINE_RECENT_ACTIVITY_MS;
      const hasOpenSession = sessionState.activeSessionByUserId.has(log.userId);
      const isOnline = hasRecentActivity || hasOpenSession;
      summaryMap.set(log.userId, {
        ...current,
        userName: current.userName || log.userName || log.userId,
        userRole: current.userRole || log.userRole || 'Unknown',
        userEmail: current.userEmail || log.userEmail || '-',
        todayWorkedMs,
        todayActionCount: current.todayActionCount + (isToday ? 1 : 0),
        todayLastTimestamp: shouldUpdateLastAction ? timestampMs : current.todayLastTimestamp,
        todayLastAction: shouldUpdateLastAction ? getActionLabel(log) : current.todayLastAction,
        isOnline
      });
    });

    summaryMap.forEach((value, userId) => {
      const lastHeartbeatMs = Number(lastPresenceHeartbeatByUserId.get(userId) || 0);
      const hasRecentActivity = Number.isFinite(lastHeartbeatMs) && lastHeartbeatMs > 0 && nowMs - lastHeartbeatMs <= ONLINE_RECENT_ACTIVITY_MS;
      const hasOpenSession = sessionState.activeSessionByUserId.has(userId);
      const isOnline = hasRecentActivity || hasOpenSession;
      summaryMap.set(userId, {
        ...value,
        isOnline
      });
    });

    return Array.from(summaryMap.values())
      .sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        if (b.todayWorkedMs !== a.todayWorkedMs) return b.todayWorkedMs - a.todayWorkedMs;
        return String(a.userName || '').localeCompare(String(b.userName || ''));
      });
  }, [clockTick, presenceHeartbeatLogs, sessionState, systemUsers, summaryLogs, workdayState, todayDateKey]);

  const activeOnlineUsers = useMemo(
    () => workerSummaries.filter(worker => worker.isOnline).sort((a, b) => b.todayLastTimestamp - a.todayLastTimestamp),
    [workerSummaries]
  );

  const onlineUserNamesSummary = useMemo(() => {
    if (activeOnlineUsers.length === 0) return 'Nadie conectado en este momento.';
    return `En linea ahora: ${activeOnlineUsers.map(user => user.userName).filter(Boolean).join(', ')}`;
  }, [activeOnlineUsers]);

  const driverAlertLogs = useMemo(() => allLogs.filter(log => {
    if (!isDriverAlertActionLog(log)) return false;
    if (filterRole !== 'all' && getRoleFilterKey(log.userRole) !== filterRole) return false;
    if (alertActionFilter !== 'all' && getDriverAlertActionKey(log) !== alertActionFilter) return false;
    return true;
  }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)), [alertActionFilter, allLogs, filterRole]);

  const driverAlertStats = useMemo(() => {
    const statsAccumulator = {
      total: driverAlertLogs.length,
      smsEscalations: 0,
      resolved: 0,
      drafts: 0,
      uniqueDrivers: new Set(),
      uniqueDispatchers: new Set()
    };

    driverAlertLogs.forEach(log => {
      const actionKey = getDriverAlertActionKey(log);
      if (actionKey === 'sms-escalation') statsAccumulator.smsEscalations += 1;
      if (actionKey === 'resolve-alert') statsAccumulator.resolved += 1;
      if (actionKey === 'use-as-draft') statsAccumulator.drafts += 1;
      if (log?.metadata?.driverId) statsAccumulator.uniqueDrivers.add(log.metadata.driverId);
      if (log?.userId) statsAccumulator.uniqueDispatchers.add(log.userId);
    });

    return {
      total: statsAccumulator.total,
      smsEscalations: statsAccumulator.smsEscalations,
      resolved: statsAccumulator.resolved,
      drafts: statsAccumulator.drafts,
      uniqueDrivers: statsAccumulator.uniqueDrivers.size,
      uniqueDispatchers: statsAccumulator.uniqueDispatchers.size
    };
  }, [driverAlertLogs]);

  const smsDeliveryStats = useMemo(() => {
    const tripIds = new Set();
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let arrival = 0;
    smsDeliveryLogs.forEach(log => {
      if (log?.tripId) tripIds.add(log.tripId);
      const normalizedStatus = String(log?.status || '').trim().toLowerCase();
      if (normalizedStatus === 'sent') sent += 1;
      if (normalizedStatus === 'failed') failed += 1;
      if (normalizedStatus === 'skipped') skipped += 1;
      if (String(log?.eventType || '').trim().toLowerCase().startsWith('arrival')) arrival += 1;
    });
    return {
      total: smsDeliveryLogs.length,
      sent,
      failed,
      skipped,
      arrival,
      uniqueTrips: tripIds.size
    };
  }, [smsDeliveryLogs]);

  const arrivalEventStats = useMemo(() => {
    const drivers = new Set();
    let patientSent = 0;
    let officeSent = 0;
    let failed = 0;
    tripArrivalEvents.forEach(event => {
      if (event?.driverId) drivers.add(event.driverId);
      const summary = summarizeArrivalNotifications(event?.notificationSummary);
      patientSent += summary.patientSent;
      officeSent += summary.officeSent;
      failed += summary.failed;
    });
    return {
      total: tripArrivalEvents.length,
      patientSent,
      officeSent,
      failed,
      uniqueDrivers: drivers.size
    };
  }, [tripArrivalEvents]);

  const disciplineStats = useMemo(() => {
    const drivers = new Set();
    let active = 0;
    let resolved = 0;
    let high = 0;
    driverDisciplineEvents.forEach(event => {
      if (event?.driverId) drivers.add(event.driverId);
      if (String(event?.status || '').trim().toLowerCase() === 'resolved') resolved += 1;
      else active += 1;
      if (String(event?.severity || '').trim().toLowerCase() === 'high') high += 1;
    });
    return {
      total: driverDisciplineEvents.length,
      active,
      resolved,
      high,
      uniqueDrivers: drivers.size
    };
  }, [driverDisciplineEvents]);

  const workflowStats = useMemo(() => {
    let enRoute = 0;
    let arrived = 0;
    let completed = 0;
    let signed = 0;
    tripWorkflowEvents.forEach(event => {
      const action = String(event?.action || '').trim().toLowerCase();
      if (action === 'en-route') enRoute += 1;
      if (action === 'arrived') arrived += 1;
      if (action === 'complete') completed += 1;
      if (event?.riderSignatureName) signed += 1;
    });
    return {
      total: tripWorkflowEvents.length,
      enRoute,
      arrived,
      completed,
      signed
    };
  }, [tripWorkflowEvents]);

  const todayLogs = useMemo(
    () => summaryLogs.filter(log => getDateKeyFromTimestampMs(new Date(log.timestamp).getTime()) === todayDateKey),
    [todayDateKey, summaryLogs]
  );

  const activeUsersTodayCount = useMemo(() => workerSummaries.filter(worker => worker.todayActionCount > 0 || worker.todayWorkedMs > 0).length, [workerSummaries]);

  const todayWorkedMs = useMemo(() => {
    let total = 0;
    workdayState.totalByUserDate.forEach((durationMs, key) => {
      if (key.endsWith(`::${todayDateKey}`)) total += durationMs;
    });
    return total;
  }, [todayDateKey, workdayState]);

  const todayActionCount = useMemo(() => todayLogs.filter(log => log.eventType === 'ACTION').length, [todayLogs]);

  const handleUserClick = worker => {
    setSelectedUser(worker);
    setUserDetailLogs(allLogs.filter(item => item.userId === worker.userId));
    setShowUserDetail(true);
  };

  const handleActivityViewChange = event => {
    setActivityView(event.target.value);
    setShowUserDetail(false);
  };

  const groupLogsByDate = sourceLogs => {
    const grouped = {};
    sourceLogs.forEach(log => {
      const timestampMs = new Date(log?.timestamp).getTime();
      const dateKey = getDateKeyFromTimestampMs(timestampMs) || String(log?.date || 'unknown');
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(log);
    });
    return Object.entries(grouped).sort((a, b) => {
      const [aYear, aMonth, aDay] = String(a[0]).split('-').map(Number);
      const [bYear, bMonth, bDay] = String(b[0]).split('-').map(Number);
      const aValue = Number.isFinite(aYear) ? new Date(aYear, aMonth - 1, aDay).getTime() : 0;
      const bValue = Number.isFinite(bYear) ? new Date(bYear, bMonth - 1, bDay).getTime() : 0;
      return bValue - aValue;
    });
  };

  const selectedUserActiveSession = selectedUser?.userId ? detailSessionState.activeSessionByUserId.get(selectedUser.userId) || null : null;
  const selectedUserTodayWorkedMs = selectedUser?.userId ? detailWorkdayState.totalByUserDate.get(`${selectedUser.userId}::${todayDateKey}`) || 0 : 0;

  const renderEventDetail = log => {
    if (isDriverAlertActionLog(log)) {
      return `Chofer: ${log?.metadata?.driverName || log?.metadata?.driverId || '-'} | Alerta: ${getDriverAlertTypeLabel(log?.metadata?.alertType)} | Canal: ${getDriverAlertChannelLabel(log)}`;
    }
    if (log.metadata?.preview) return `Detalle: ${log.metadata.preview}`;
    return '';
  };

  return (
    <div className={`${styles.systemLogsWorkspace} ${themeMode === 'light' ? styles.lightTheme : ''}`}>
      <div className={styles.header}>
        <div>
          <h1>System Logs</h1>
          <p>Actividad diaria conectada y auditoria SQL de SMS, llegadas, disciplina y workflow del chofer.</p>
        </div>
        <div className={styles.headerNote}>Cada evento suma trabajo del dia para el usuario.</div>
      </div>

      <div className={styles.statsContainer}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Usuarios Activos Hoy</div>
          <div className={styles.statValue}>{activeUsersTodayCount}</div>
          <div className={styles.statHint}>Con actividad registrada hoy</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Horas Trabajadas Hoy</div>
          <div className={styles.statValue}>{formatDurationMs(todayWorkedMs)}</div>
          <div className={styles.statHint}>Suma diaria por login + acciones</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Acciones Hoy</div>
          <div className={styles.statValue}>{todayActionCount}</div>
          <div className={styles.statHint}>Mensajes, rutas, IA, confirmaciones</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Usuarios En Linea</div>
          <div className={styles.statValue}>{activeOnlineUsers.length}</div>
          <div className={styles.statHint}>{stats.totalEvents} eventos historicos</div>
        </div>
      </div>

      <div className={styles.controls}>
        {activityView === 'workers' || activityView === 'driver-alerts' ? (
          <div className={styles.filterGroup}>
            <label>Filtrar por Rol:</label>
            <select value={filterRole} onChange={event => setFilterRole(event.target.value)} className={styles.select}>
              <option value="all">Todos</option>
              <option value="admin">Administradores</option>
              <option value="driver">Choferes</option>
              <option value="attendant">Asistentes</option>
            </select>
          </div>
        ) : null}

        <div className={styles.filterGroup}>
          <label>Vista:</label>
          <select value={activityView} onChange={handleActivityViewChange} className={styles.select}>
            <option value="workers">Trabajadores</option>
            <option value="driver-alerts">Escalaciones de Alertas</option>
            <option value="sms-delivery">SMS Delivery</option>
            <option value="trip-arrivals">Trip Arrivals</option>
            <option value="driver-discipline">Driver Discipline</option>
            <option value="trip-workflow">Trip Workflow</option>
          </select>
        </div>

        {activityView === 'driver-alerts' ? (
          <div className={styles.filterGroup}>
            <label>Accion:</label>
            <select value={alertActionFilter} onChange={event => setAlertActionFilter(event.target.value)} className={styles.select}>
              <option value="all">Todas</option>
              <option value="sms-escalation">SMS</option>
              <option value="resolve-alert">Resueltas</option>
              <option value="use-as-draft">Draft</option>
            </select>
          </div>
        ) : null}

        <div className={styles.controlsMeta}>
          <span>{stats.todayEvents} eventos hoy en todo el sistema</span>
          {canClearLogs ? (
            <button onClick={handleClearAllLogs} className={styles.backButton} disabled={loading}>
              Limpiar Logs
            </button>
          ) : null}
          <button onClick={fetchLogs} className={styles.button} disabled={loading}>
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {activityView === 'driver-alerts' ? (
        <div className={styles.statsContainer}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Escalaciones Totales</div>
            <div className={styles.statValue}>{driverAlertStats.total}</div>
            <div className={styles.statHint}>Acciones auditadas de alertas del chofer</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>SMS Enviados</div>
            <div className={styles.statValue}>{driverAlertStats.smsEscalations}</div>
            <div className={styles.statHint}>Seguimientos salidos por SMS</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Alertas Resueltas</div>
            <div className={styles.statValue}>{driverAlertStats.resolved}</div>
            <div className={styles.statHint}>Cierres operativos desde Dispatcher</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Choferes Impactados</div>
            <div className={styles.statValue}>{driverAlertStats.uniqueDrivers}</div>
            <div className={styles.statHint}>{driverAlertStats.uniqueDispatchers} dispatchers actuaron</div>
          </div>
        </div>
      ) : null}

      {activityView === 'sms-delivery' ? (
        <div className={styles.statsContainer}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>SMS Totales</div>
            <div className={styles.statValue}>{smsDeliveryStats.total}</div>
            <div className={styles.statHint}>{smsDeliveryStats.uniqueTrips} trips auditados</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Sent</div>
            <div className={styles.statValue}>{smsDeliveryStats.sent}</div>
            <div className={styles.statHint}>Mensajes entregados al proveedor</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Failed</div>
            <div className={styles.statValue}>{smsDeliveryStats.failed}</div>
            <div className={styles.statHint}>Errores de envio</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Arrival SMS</div>
            <div className={styles.statValue}>{smsDeliveryStats.arrival}</div>
            <div className={styles.statHint}>{smsDeliveryStats.skipped} omitidos</div>
          </div>
        </div>
      ) : null}

      {activityView === 'trip-arrivals' ? (
        <div className={styles.statsContainer}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Llegadas Marcadas</div>
            <div className={styles.statValue}>{arrivalEventStats.total}</div>
            <div className={styles.statHint}>{arrivalEventStats.uniqueDrivers} choferes</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Paciente Notificado</div>
            <div className={styles.statValue}>{arrivalEventStats.patientSent}</div>
            <div className={styles.statHint}>SMS exitosos a pacientes</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Oficina Notificada</div>
            <div className={styles.statValue}>{arrivalEventStats.officeSent}</div>
            <div className={styles.statHint}>SMS exitosos a oficina</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Fallos</div>
            <div className={styles.statValue}>{arrivalEventStats.failed}</div>
            <div className={styles.statHint}>Destinatarios omitidos o con error</div>
          </div>
        </div>
      ) : null}

      {activityView === 'driver-discipline' ? (
        <div className={styles.statsContainer}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Eventos</div>
            <div className={styles.statValue}>{disciplineStats.total}</div>
            <div className={styles.statHint}>{disciplineStats.uniqueDrivers} choferes impactados</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Abiertos</div>
            <div className={styles.statValue}>{disciplineStats.active}</div>
            <div className={styles.statHint}>Aun visibles en historial activo</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Resueltos</div>
            <div className={styles.statValue}>{disciplineStats.resolved}</div>
            <div className={styles.statHint}>Eventos cerrados</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>High Severity</div>
            <div className={styles.statValue}>{disciplineStats.high}</div>
            <div className={styles.statHint}>Incidentes fuertes</div>
          </div>
        </div>
      ) : null}

      {activityView === 'trip-workflow' ? (
        <div className={styles.statsContainer}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Workflow Events</div>
            <div className={styles.statValue}>{workflowStats.total}</div>
            <div className={styles.statHint}>Historial SQL reciente</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>En Route</div>
            <div className={styles.statValue}>{workflowStats.enRoute}</div>
            <div className={styles.statHint}>Salidas marcadas</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Arrived</div>
            <div className={styles.statValue}>{workflowStats.arrived}</div>
            <div className={styles.statHint}>Llegadas marcadas</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Completed</div>
            <div className={styles.statValue}>{workflowStats.completed}</div>
            <div className={styles.statHint}>{workflowStats.signed} con firma</div>
          </div>
        </div>
      ) : null}

      {!showUserDetail && activityView === 'workers' ? (
        <div className={styles.logsTableContainer}>
          <div className={styles.tableHeader}>
            <div>
              <h3>Lista de Trabajadores</h3>
              <p>{onlineUserNamesSummary}</p>
            </div>
            <div className={styles.tableBadge}>{workerSummaries.length} trabajadores</div>
          </div>
          <table className={styles.logsTable}>
            <thead>
              <tr>
                <th>Trabajador</th>
                <th>Correo</th>
                <th>Ultima Actividad</th>
                <th>Horas Hoy</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className={styles.loading}>Cargando...</td>
                </tr>
              ) : workerSummaries.length === 0 ? (
                <tr>
                  <td colSpan="5" className={styles.noData}>No hay trabajadores disponibles</td>
                </tr>
              ) : workerSummaries.map((worker, index) => (
                <tr key={`${worker.userId || 'user'}-${index}`} onClick={() => handleUserClick(worker)} className={styles.clickableRow}>
                  <td className={styles.userNameCell}>{worker.userName}</td>
                  <td>{worker.userEmail}</td>
                  <td>
                    <span className={`${styles.action} ${styles[getActionClass(worker.todayLastAction)]}`}>
                      {worker.todayLastTimestamp ? `${worker.todayLastAction} ${formatTimestamp12(worker.todayLastTimestamp)}` : 'Sin actividad hoy'}
                    </span>
                  </td>
                  <td>{formatDurationMs(worker.todayWorkedMs)}</td>
                  <td>
                    <span className={`${styles.badge} ${worker.isOnline ? styles.statusOnline : styles.statusOffline}`}>
                      {worker.isOnline ? 'En linea' : 'Offline'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !showUserDetail && activityView === 'driver-alerts' ? (
        <div className={styles.logsTableContainer}>
          <div className={styles.tableHeader}>
            <div>
              <h3>Escalaciones de Alertas del Chofer</h3>
              <p>Auditoria operativa de respuestas desde Dispatcher: draft, resolucion y SMS.</p>
            </div>
            <div className={styles.tableBadge}>{driverAlertLogs.length} acciones</div>
          </div>
          <table className={styles.logsTable}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Dispatcher</th>
                <th>Chofer</th>
                <th>Alerta</th>
                <th>Accion</th>
                <th>Canal</th>
                <th>Resumen</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className={styles.loading}>Cargando...</td>
                </tr>
              ) : driverAlertLogs.length === 0 ? (
                <tr>
                  <td colSpan="7" className={styles.noData}>No hay escalaciones de alertas para este filtro</td>
                </tr>
              ) : driverAlertLogs.slice(0, 300).map((log, index) => (
                <tr key={`${log.id || 'alert-log'}-${index}`}>
                  <td>{getDateKeyFromTimestampMs(new Date(log.timestamp).getTime())} {formatTimestamp12(log.timestamp)}</td>
                  <td className={styles.userNameCell}>{log.userName || log.userId}</td>
                  <td>{log.metadata?.driverName || log.metadata?.driverId || '-'}</td>
                  <td>
                    <span className={`${styles.badge} ${styles.alertTypeBadge}`}>
                      {getDriverAlertTypeLabel(log.metadata?.alertType)}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${styles[`alertAction${getDriverAlertActionKey(log).replace(/(^|-)(\w)/g, (_, separator, letter) => `${separator ? '' : ''}${letter.toUpperCase()}`)}`] || styles.alertActionDefault}`}>
                      {getDriverAlertActionLabel(getDriverAlertActionKey(log))}
                    </span>
                  </td>
                  <td>{getDriverAlertChannelLabel(log)}</td>
                  <td className={styles.alertSummaryCell}>{buildDriverAlertSummary(log)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !showUserDetail && activityView === 'sms-delivery' ? (
        <div className={styles.logsTableContainer}>
          <div className={styles.tableHeader}>
            <div>
              <h3>SMS Delivery Logs</h3>
              <p>Bitacora SQL por mensaje enviado, fallado u omitido para pacientes y oficina.</p>
            </div>
            <div className={styles.tableBadge}>{smsDeliveryLogs.length} SMS</div>
          </div>
          <table className={styles.logsTable}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Trip</th>
                <th>Driver</th>
                <th>Audience</th>
                <th>Evento</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Resumen</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className={styles.loading}>Cargando...</td>
                </tr>
              ) : smsDeliveryLogs.length === 0 ? (
                <tr>
                  <td colSpan="8" className={styles.noData}>No hay SMS registrados todavia</td>
                </tr>
              ) : smsDeliveryLogs.map(log => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.createdAt)}</td>
                  <td>{log.tripId || '-'}</td>
                  <td>{log.driverId || '-'}</td>
                  <td>{log.audience || '-'}</td>
                  <td>{log.eventType || '-'}</td>
                  <td>{log.provider || '-'}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[getSmsStatusClass(log.status)]}`}>
                      {getSmsStatusLabel(log.status)}
                    </span>
                  </td>
                  <td className={styles.alertSummaryCell}>
                    {log.recipientName || '-'} {log.recipientPhone ? `| ${log.recipientPhone}` : ''}
                    {log.error ? ` | ${log.error}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !showUserDetail && activityView === 'trip-arrivals' ? (
        <div className={styles.logsTableContainer}>
          <div className={styles.tableHeader}>
            <div>
              <h3>Trip Arrival Events</h3>
              <p>Cada marca de llegada queda en SQL con el resumen de notificaciones que salieron.</p>
            </div>
            <div className={styles.tableBadge}>{tripArrivalEvents.length} llegadas</div>
          </div>
          <table className={styles.logsTable}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Trip</th>
                <th>Paciente</th>
                <th>Driver</th>
                <th>Pickup</th>
                <th>Provider</th>
                <th>Notificaciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className={styles.loading}>Cargando...</td>
                </tr>
              ) : tripArrivalEvents.length === 0 ? (
                <tr>
                  <td colSpan="7" className={styles.noData}>No hay llegadas registradas todavia</td>
                </tr>
              ) : tripArrivalEvents.map(event => {
                const summary = summarizeArrivalNotifications(event.notificationSummary);
                return (
                  <tr key={event.id}>
                    <td>{formatDateTime(event.arrivalTimestamp || event.createdAt)}</td>
                    <td>{event.tripId || '-'}</td>
                    <td className={styles.userNameCell}>{event.rider || '-'}</td>
                    <td>{event.driverId || '-'}</td>
                    <td className={styles.alertSummaryCell}>{event.pickupAddress || event.actualPickup || '-'}</td>
                    <td>{summary.provider}</td>
                    <td className={styles.alertSummaryCell}>{`Patient ${summary.patientSent} | Office ${summary.officeSent} | Failed ${summary.failed}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : !showUserDetail && activityView === 'driver-discipline' ? (
        <div className={styles.logsTableContainer}>
          <div className={styles.tableHeader}>
            <div>
              <h3>Driver Discipline History</h3>
              <p>Registro SQL de no-departure, late start, late pickup y late dropoff.</p>
            </div>
            <div className={styles.tableBadge}>{driverDisciplineEvents.length} eventos</div>
          </div>
          <table className={styles.logsTable}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Driver</th>
                <th>Trip</th>
                <th>Evento</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Resumen</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className={styles.loading}>Cargando...</td>
                </tr>
              ) : driverDisciplineEvents.length === 0 ? (
                <tr>
                  <td colSpan="7" className={styles.noData}>No hay disciplina registrada todavia</td>
                </tr>
              ) : driverDisciplineEvents.map(event => (
                <tr key={event.id}>
                  <td>{formatDateTime(event.occurredAt || event.createdAt)}</td>
                  <td>{event.driverId || '-'}</td>
                  <td>{event.tripId || '-'}</td>
                  <td>{String(event.eventType || '').replace(/-/g, ' ') || '-'}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[getSeverityClass(event.severity)]}`}>
                      {getSeverityLabel(event.severity)}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${styles[getDisciplineStatusClass(event.status)]}`}>
                      {getDisciplineStatusLabel(event.status)}
                    </span>
                  </td>
                  <td className={styles.alertSummaryCell}>{event.summary || event.body || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !showUserDetail && activityView === 'trip-workflow' ? (
        <div className={styles.logsTableContainer}>
          <div className={styles.tableHeader}>
            <div>
              <h3>Trip Workflow Events</h3>
              <p>Historial SQL de En Route, Arrived y Complete con GPS, cumplimiento y firma.</p>
            </div>
            <div className={styles.tableBadge}>{tripWorkflowEvents.length} eventos</div>
          </div>
          <table className={styles.logsTable}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Trip</th>
                <th>Driver</th>
                <th>Action</th>
                <th>Time Label</th>
                <th>Compliance</th>
                <th>Signature</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className={styles.loading}>Cargando...</td>
                </tr>
              ) : tripWorkflowEvents.length === 0 ? (
                <tr>
                  <td colSpan="8" className={styles.noData}>No hay workflow registrado todavia</td>
                </tr>
              ) : tripWorkflowEvents.map(event => (
                <tr key={event.id}>
                  <td>{formatDateTime(event.timestamp || event.createdAt)}</td>
                  <td>{event.tripId || '-'}</td>
                  <td>{event.driverId || '-'}</td>
                  <td>
                    <span className={`${styles.badge} ${styles.alertActionDefault}`}>
                      {getWorkflowActionLabel(event.action)}
                    </span>
                  </td>
                  <td>{event.timeLabel || '-'}</td>
                  <td>{event.compliance?.measured ? (event.compliance?.isLate ? `${Math.max(0, Number(event.compliance?.lateByMinutes) || 0)} min late` : 'On time') : 'Not measured'}</td>
                  <td>{event.riderSignatureName || '-'}</td>
                  <td className={styles.alertSummaryCell}>{buildWorkflowSummary(event)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.detailView}>
          <button onClick={() => setShowUserDetail(false)} className={styles.backButton}>
            Volver a los Logs
          </button>

          <div className={styles.userDetailHeader}>
            <h2>{selectedUser?.userName}</h2>
            <p>{selectedUser?.userEmail}</p>
            <div className={styles.detailBadges}>
              <span className={styles.sessionBadge}>Horas hoy: {formatDurationMs(selectedUserTodayWorkedMs)}</span>
              {selectedUserActiveSession ? <span className={styles.sessionBadge}>Sesion activa</span> : <span className={styles.sessionBadgeOffline}>Fuera de linea</span>}
            </div>
          </div>

          <div className={styles.activityTimeline}>
            {groupLogsByDate(userDetailLogs).length === 0 ? (
              <div className={styles.noActivity}>Sin actividad</div>
            ) : groupLogsByDate(userDetailLogs).map(([date, dateLogs]) => {
              const dateWorkedMs = detailWorkdayState.totalByUserDate.get(`${selectedUser?.userId}::${date}`) || 0;
              return (
                <div key={date} className={styles.dateGroup}>
                  <div className={styles.dateHeaderRow}>
                    <h3 className={styles.dateHeader}>{new Date(date).toLocaleDateString('es-ES', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}</h3>
                    <span className={styles.dateWorkedBadge}>{formatDurationMs(dateWorkedMs)}</span>
                  </div>

                  <div className={styles.timelineEvents}>
                    {dateLogs.map((log, index) => (
                      <div key={`${log.id || 'timeline'}-${log.userId || 'user'}-${log.timestamp || log.time || 'time'}-${index}`} className={styles.timelineEvent}>
                        <div className={`${styles.eventDot} ${styles[`dot${log.eventType}`]}`}></div>
                        <div className={styles.eventContent}>
                          <span className={styles.eventTime}>{formatTimestamp12(log.timestamp)}</span>
                          <span className={`${styles.eventType} ${styles[`type${log.eventType}`]}`}>
                            {getActionLabel(log)}
                          </span>
                          {log.target ? <span className={styles.eventMeta}>Target: {log.target}</span> : null}
                          {renderEventDetail(log) ? <span className={styles.eventMeta}>{renderEventDetail(log)}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.onlineUsersSection}>
        <div className={styles.tableHeader}>
          <div>
            <h3>Usuarios En Linea</h3>
            <p>Usuarios con sesion abierta en este momento.</p>
          </div>
          <div className={styles.tableBadge}>{activeOnlineUsers.length} en linea</div>
        </div>
        <div className={styles.onlineUsersList}>
          {activeOnlineUsers.length > 0 ? activeOnlineUsers.map((user, index) => (
            <div key={`${user.userId || 'online-user'}-${user.todayLastTimestamp || 'ts'}-${index}`} className={styles.onlineUser}>
              <span className={styles.onlineDot}></span>
              <span className={styles.onlineUserName}>{user.userName}</span>
              <span className={styles.onlineUserTime}>{formatDurationMs(user.todayWorkedMs)}</span>
            </div>
          )) : (
            <div className={styles.noOnlineUsers}>Nadie conectado</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemLogsWorkspace;
