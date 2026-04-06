'use client';

import { useEffect, useMemo, useState } from 'react';
import { useNotificationContext } from '@/context/useNotificationContext';
import { useLayoutContext } from '@/context/useLayoutContext';
import styles from './SystemLogsWorkspace.module.scss';

const SESSION_EVENT_TYPES = new Set(['LOGIN', 'LOGOUT']);
const WORK_EVENT_TYPES = new Set(['LOGIN', 'LOGOUT', 'ACTION']);
const DRIVER_ALERT_ACTION_LABELS = {
  'Sent dispatcher SMS escalation': 'sms-escalation',
  'Resolved mobile driver alert': 'resolve-alert',
  'Loaded mobile driver alert into draft': 'use-as-draft'
};

const getTodayDateKey = nowMs => new Date(nowMs).toISOString().split('T')[0];
const getDateKeyFromTimestampMs = timestampMs => new Date(timestampMs).toISOString().split('T')[0];
const getUtcDayStartMs = dateKey => new Date(`${dateKey}T00:00:00.000Z`).getTime();

const addDurationAcrossUtcDays = (totalsMap, userId, startMs, endMs) => {
  if (!userId || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return;

  let cursor = startMs;
  while (cursor < endMs) {
    const dateKey = getDateKeyFromTimestampMs(cursor);
    const dayStartMs = getUtcDayStartMs(dateKey);
    if (!dateKey || !Number.isFinite(dayStartMs)) break;
    const nextDayMs = dayStartMs + 24 * 60 * 60 * 1000;
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

const formatClock12 = value => {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return text || '--';
  const sourceHours = Number(match[1]);
  const minutes = match[2];
  const seconds = match[3];
  if (!Number.isFinite(sourceHours)) return text || '--';
  const meridiem = sourceHours >= 12 ? 'PM' : 'AM';
  const normalizedHours = sourceHours % 12 || 12;
  return seconds
    ? `${String(normalizedHours).padStart(2, '0')}:${minutes}:${seconds} ${meridiem}`
    : `${String(normalizedHours).padStart(2, '0')}:${minutes} ${meridiem}`;
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
    .filter(log => log?.userId && WORK_EVENT_TYPES.has(log.eventType) && log?.timestamp && log?.date)
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
        addDurationAcrossUtcDays(totalByUserDate, userId, previousTimestampMs, timestampMs);
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
      addDurationAcrossUtcDays(totalByUserDate, userId, previousTimestampMs, nowMs);
      const todayTotalMs = totalByUserDate.get(`${userId}::${todayKey}`) || 0;
      if (todayTotalMs > 0) {
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

const getRoleBadgeClass = role => {
  const normalizedRole = String(role || '').toLowerCase();
  if (normalizedRole.includes('driver') || normalizedRole.includes('chofer')) return 'badgeDriver';
  if (normalizedRole.includes('attendant') || normalizedRole.includes('assistant')) return 'badgeAttendant';
  return 'badgeAdmin';
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

const buildDriverAlertSummary = log => {
  if (log?.metadata?.smsMessage) return String(log.metadata.smsMessage).trim();
  if (log?.metadata?.driverName && log?.metadata?.alertType) {
    return `${log.metadata.driverName} | ${getDriverAlertTypeLabel(log.metadata.alertType)}`;
  }
  return String(log?.target || '').trim();
};

const SystemLogsWorkspace = () => {
  const { showNotification } = useNotificationContext();
  const { themeMode } = useLayoutContext();

  const [logs, setLogs] = useState([]);
  const [allLogs, setAllLogs] = useState([]);
  const [systemUsers, setSystemUsers] = useState([]);
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

      const summaryRes = await fetch('/api/system-logs?summary=true');
      const summaryData = await summaryRes.json();
      setStats(summaryData);

      const logsRes = await fetch('/api/system-logs');
      const logsData = await logsRes.json();

      const usersRes = await fetch('/api/system-users', { cache: 'no-store' });
      const usersData = await usersRes.json();

      if (logsData.success) {
        setAllLogs(logsData.logs);
        setLogs(filterRole === 'all' ? logsData.logs : logsData.logs.filter(log => getRoleFilterKey(log.userRole) === filterRole));
      }

      if (usersRes.ok) {
        const allUsers = Array.isArray(usersData?.users) ? usersData.users : [];
        setSystemUsers(filterRole === 'all' ? allUsers : allUsers.filter(user => getRoleFilterKey(user?.role) === filterRole));
      } else {
        setSystemUsers([]);
      }
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
  const workdayState = useMemo(() => buildWorkdayState(logs, clockTick), [logs, clockTick]);
  const detailWorkdayState = useMemo(() => buildWorkdayState(userDetailLogs, clockTick), [userDetailLogs, clockTick]);
  const todayDateKey = useMemo(() => getTodayDateKey(clockTick), [clockTick]);

  const summaryLogs = useMemo(() => logs.filter(log => WORK_EVENT_TYPES.has(log.eventType)), [logs]);
  const visibleLogs = useMemo(() => summaryLogs.slice(0, 300), [summaryLogs]);

  const workerSummaries = useMemo(() => {
    const summaryMap = new Map();

    systemUsers.forEach(user => {
      summaryMap.set(user.id, {
        userId: user.id,
        userName: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.username || user.email || user.id,
        userRole: user.role || 'Unknown',
        userEmail: user.email || '-',
        todayWorkedMs: workdayState.totalByUserDate.get(`${user.id}::${todayDateKey}`) || 0,
        todayActionCount: 0,
        todayLastTime: '',
        todayLastAction: 'Sin actividad',
        isOnline: workdayState.activeDayByUserId.has(user.id)
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
          todayLastTime: '',
          todayLastAction: 'Sin actividad',
          isOnline: false
        });
      }

      const current = summaryMap.get(log.userId);
      const todayWorkedMs = workdayState.totalByUserDate.get(`${log.userId}::${todayDateKey}`) || current.todayWorkedMs;
      const isToday = log.date === todayDateKey;
      summaryMap.set(log.userId, {
        ...current,
        userName: current.userName || log.userName || log.userId,
        userRole: current.userRole || log.userRole || 'Unknown',
        userEmail: current.userEmail || log.userEmail || '-',
        todayWorkedMs,
        todayActionCount: current.todayActionCount + (isToday ? 1 : 0),
        todayLastTime: isToday && (!current.todayLastTime || new Date(`${log.date}T${log.time}`) >= new Date(`${todayDateKey}T${current.todayLastTime || '00:00:00'}`)) ? log.time : current.todayLastTime,
        todayLastAction: isToday && (!current.todayLastTime || new Date(`${log.date}T${log.time}`) >= new Date(`${todayDateKey}T${current.todayLastTime || '00:00:00'}`)) ? getActionLabel(log) : current.todayLastAction,
        isOnline: workdayState.activeDayByUserId.has(log.userId)
      });
    });

    return Array.from(summaryMap.values())
      .sort((a, b) => {
        if (b.todayWorkedMs !== a.todayWorkedMs) return b.todayWorkedMs - a.todayWorkedMs;
        return String(a.userName || '').localeCompare(String(b.userName || ''));
      });
  }, [systemUsers, summaryLogs, workdayState, todayDateKey]);

  const activeOnlineUsers = useMemo(
    () => Array.from(workdayState.activeDayByUserId.values()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    [workdayState]
  );

  const driverAlertLogs = useMemo(() => {
    return allLogs.filter(log => {
      if (!isDriverAlertActionLog(log)) return false;
      if (filterRole !== 'all' && getRoleFilterKey(log.userRole) !== filterRole) return false;
      if (alertActionFilter !== 'all' && getDriverAlertActionKey(log) !== alertActionFilter) return false;
      return true;
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [alertActionFilter, allLogs, filterRole]);

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

  const todayLogs = useMemo(() => summaryLogs.filter(log => log.date === todayDateKey), [todayDateKey, summaryLogs]);

  const activeUsersTodayCount = useMemo(
    () => workerSummaries.filter(worker => worker.todayActionCount > 0 || worker.todayWorkedMs > 0).length,
    [workerSummaries]
  );

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

  const groupLogsByDate = sourceLogs => {
    const grouped = {};
    sourceLogs.forEach(log => {
      if (!grouped[log.date]) grouped[log.date] = [];
      grouped[log.date].push(log);
    });
    return Object.entries(grouped).sort((a, b) => new Date(b[0]) - new Date(a[0]));
  };

  const selectedUserActiveSession = selectedUser?.userId
    ? detailSessionState.activeSessionByUserId.get(selectedUser.userId) || null
    : null;

  const selectedUserTodayWorkedMs = selectedUser?.userId
    ? detailWorkdayState.totalByUserDate.get(`${selectedUser.userId}::${todayDateKey}`) || 0
    : 0;

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
          <p>Actividad diaria conectada: login, mensajes, rutas, will-calls y acciones operativas.</p>
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
        <div className={styles.filterGroup}>
          <label>Filtrar por Rol:</label>
          <select value={filterRole} onChange={event => setFilterRole(event.target.value)} className={styles.select}>
            <option value="all">Todos</option>
            <option value="admin">Administradores</option>
            <option value="driver">Choferes</option>
            <option value="attendant">Asistentes</option>
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label>Vista:</label>
          <select value={activityView} onChange={event => setActivityView(event.target.value)} className={styles.select}>
            <option value="workers">Trabajadores</option>
            <option value="driver-alerts">Escalaciones de Alertas</option>
          </select>
        </div>

        {activityView === 'driver-alerts' ? <div className={styles.filterGroup}>
            <label>Accion:</label>
            <select value={alertActionFilter} onChange={event => setAlertActionFilter(event.target.value)} className={styles.select}>
              <option value="all">Todas</option>
              <option value="sms-escalation">SMS</option>
              <option value="resolve-alert">Resueltas</option>
              <option value="use-as-draft">Draft</option>
            </select>
          </div> : null}

        <div className={styles.controlsMeta}>
          <span>{stats.todayEvents} eventos hoy en todo el sistema</span>
          <button onClick={fetchLogs} className={styles.button} disabled={loading}>
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {activityView === 'driver-alerts' ? <div className={styles.statsContainer}>
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
        </div> : null}

      {!showUserDetail && activityView === 'workers' ? (
        <div className={styles.logsTableContainer}>
          <div className={styles.tableHeader}>
            <div>
              <h3>Lista de Trabajadores</h3>
              <p>Afuera ves todos los trabajadores con sus horas del dia. Entra a uno para ver todo el detalle.</p>
            </div>
            <div className={styles.tableBadge}>{workerSummaries.length} trabajadores</div>
          </div>
          <table className={styles.logsTable}>
            <thead>
              <tr>
                <th>Trabajador</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Correo</th>
                <th>Ultima Accion</th>
                <th>Horas Hoy</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className={styles.loading}>Cargando...</td>
                </tr>
              ) : workerSummaries.length === 0 ? (
                <tr>
                  <td colSpan="7" className={styles.noData}>No hay trabajadores disponibles</td>
                </tr>
              ) : (
                workerSummaries.map((worker, index) => {
                  return (
                    <tr
                      key={`${worker.userId || 'user'}-${index}`}
                      onClick={() => handleUserClick(worker)}
                      className={styles.clickableRow}
                    >
                      <td className={styles.userNameCell}>{worker.userName}</td>
                      <td>{worker.userId}</td>
                      <td>
                        <span className={`${styles.badge} ${styles[getRoleBadgeClass(worker.userRole)]}`}>
                          {worker.userRole}
                        </span>
                      </td>
                      <td>{worker.userEmail}</td>
                      <td>
                        <span className={`${styles.action} ${styles.actionACTION}`}>
                          {worker.todayLastTime ? `${worker.todayLastAction} ${formatClock12(worker.todayLastTime)}` : 'Sin actividad hoy'}
                        </span>
                      </td>
                      <td>{formatDurationMs(worker.todayWorkedMs)}</td>
                      <td>
                        <span className={`${styles.badge} ${worker.isOnline ? styles.statusOnline : styles.statusOffline}`}>
                          {worker.isOnline ? 'En linea' : 'Offline'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : !showUserDetail ? (
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
              ) : (
                driverAlertLogs.slice(0, 300).map((log, index) => (
                  <tr key={`${log.id || 'alert-log'}-${index}`}>
                    <td>{log.date} {formatClock12(log.time)}</td>
                    <td className={styles.userNameCell}>{log.userName || log.userId}</td>
                    <td>{log.metadata?.driverName || log.metadata?.driverId || '-'}</td>
                    <td>
                      <span className={`${styles.badge} ${styles.alertTypeBadge}`}>
                        {getDriverAlertTypeLabel(log.metadata?.alertType)}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${styles[`alertAction${getDriverAlertActionKey(log).replace(/(^|-)\w/g, match => match.replace('-', '').toUpperCase())}`] || styles.alertActionDefault}`}>
                        {getDriverAlertActionLabel(getDriverAlertActionKey(log))}
                      </span>
                    </td>
                    <td>{getDriverAlertChannelLabel(log)}</td>
                    <td className={styles.alertSummaryCell}>{buildDriverAlertSummary(log)}</td>
                  </tr>
                ))
              )}
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
              <span className={styles.roleBadge}>{selectedUser?.userRole}</span>
              <span className={styles.sessionBadge}>Horas hoy: {formatDurationMs(selectedUserTodayWorkedMs)}</span>
              {selectedUserActiveSession ? <span className={styles.sessionBadge}>Sesion activa</span> : <span className={styles.sessionBadgeOffline}>Fuera de linea</span>}
            </div>
          </div>

          <div className={styles.activityTimeline}>
            {groupLogsByDate(userDetailLogs).length === 0 ? (
              <div className={styles.noActivity}>Sin actividad</div>
            ) : (
              groupLogsByDate(userDetailLogs).map(([date, dateLogs]) => {
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
                            <span className={styles.eventTime}>{formatClock12(log.time)}</span>
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
              })
            )}
          </div>
        </div>
      )}

      <div className={styles.onlineUsersSection}>
        <div className={styles.tableHeader}>
          <div>
            <h3>Usuarios En Linea</h3>
            <p>Tiempo vivo acumulado del dia actual por usuario conectado.</p>
          </div>
          <div className={styles.tableBadge}>{activeOnlineUsers.length} en linea</div>
        </div>
        <div className={styles.onlineUsersList}>
          {activeOnlineUsers.length > 0 ? (
            activeOnlineUsers.map((user, index) => (
              <div key={`${user.userId || 'online-user'}-${user.timestamp || 'ts'}-${index}`} className={styles.onlineUser}>
                <span className={styles.onlineDot}></span>
                <span className={styles.onlineUserName}>{user.userName}</span>
                <span className={styles.onlineUserRole}>{user.userRole}</span>
                <span className={styles.onlineUserTime}>{formatDurationMs(user.totalMs)}</span>
              </div>
            ))
          ) : (
            <div className={styles.noOnlineUsers}>Nadie conectado</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemLogsWorkspace;
