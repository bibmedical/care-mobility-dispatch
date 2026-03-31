'use client';

import { useEffect, useState } from 'react';
import { useNotificationContext } from '@/context/useNotificationContext';
import styles from './SystemLogsWorkspace.module.scss';

const SystemLogsWorkspace = () => {
  const { showNotification } = useNotificationContext();
  
  const [logs, setLogs] = useState([]);
  const [allLogs, setAllLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalEvents: 0,
    todayEvents: 0,
    onlineUsers: []
  });
  
  const [filterRole, setFilterRole] = useState('all'); // 'all', 'admin', 'driver', etc.
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetailLogs, setUserDetailLogs] = useState([]);
  const [showUserDetail, setShowUserDetail] = useState(false);

  // Fetch logs and summary
  const fetchLogs = async () => {
    try {
      setLoading(true);
      
      // Get summary
      const summaryRes = await fetch('/api/system-logs?summary=true');
      const summaryData = await summaryRes.json();
      setStats(summaryData);

      // Get all logs
      const logsRes = await fetch('/api/system-logs');
      const logsData = await logsRes.json();
      
      if (logsData.success) {
        setAllLogs(logsData.logs);
        
        // Apply filter
        if (filterRole === 'all') {
          setLogs(logsData.logs);
        } else {
          setLogs(logsData.logs.filter(log => log.userRole === filterRole));
        }
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
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchLogs, 30000);
    return () => clearInterval(interval);
  }, [filterRole]);

  // Handle user detail view
  const handleUserClick = (log) => {
    setSelectedUser(log);
    const userLogs = allLogs.filter(l => l.userId === log.userId);
    setUserDetailLogs(userLogs);
    setShowUserDetail(true);
  };

  // Group logs by date for user detail
  const groupLogsByDate = (logs) => {
    const grouped = {};
    logs.forEach(log => {
      if (!grouped[log.date]) {
        grouped[log.date] = [];
      }
      grouped[log.date].push(log);
    });
    return Object.entries(grouped).sort((a, b) => new Date(b[0]) - new Date(a[0]));
  };

  // Format time for display
  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className={styles.systemLogsWorkspace}>
      <div className={styles.header}>
        <h1>System Logs</h1>
        <p>Rastreo de Login/Logout para Administradores y Choferes</p>
      </div>

      {/* Stats Cards */}
      <div className={styles.statsContainer}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total de Eventos</div>
          <div className={styles.statValue}>{stats.totalEvents}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Eventos Hoy</div>
          <div className={styles.statValue}>{stats.todayEvents}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>En Línea Ahora</div>
          <div className={styles.statValue}>{stats.onlineUsers?.length || 0}</div>
        </div>
      </div>

      {/* Filter and Actions */}
      <div className={styles.controls}>
        <div className={styles.filterGroup}>
          <label>Filtrar por Rol:</label>
          <select 
            value={filterRole} 
            onChange={(e) => setFilterRole(e.target.value)}
            className={styles.select}
          >
            <option value="all">Todos</option>
            <option value="admin">Administradores</option>
            <option value="driver">Choferes</option>
            <option value="attendant">Asistentes</option>
          </select>
        </div>

        <button 
          onClick={fetchLogs}
          className={styles.button}
          disabled={loading}
        >
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      {/* Main logs table or detailed view */}
      {!showUserDetail ? (
        <div className={styles.logsTableContainer}>
          <table className={styles.logsTable}>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Correo</th>
                <th>Acción</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className={styles.loading}>Cargando...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="6" className={styles.noData}>No hay logs disponibles</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr 
                    key={log.id}
                    onClick={() => handleUserClick(log)}
                    className={styles.clickableRow}
                  >
                    <td>{log.time}</td>
                    <td className={styles.userNameCell}>{log.userName}</td>
                    <td>
                      <span className={`${styles.badge} ${styles[`badge-${log.userRole}`]}`}>
                        {log.userRole}
                      </span>
                    </td>
                    <td>{log.userEmail}</td>
                    <td>
                      <span className={`${styles.action} ${styles[`action-${log.eventType}`]}`}>
                        {log.eventType === 'LOGIN' ? '🟢 ENTRADA' : '🔴 SALIDA'}
                      </span>
                    </td>
                    <td>{log.date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.detailView}>
          <button 
            onClick={() => setShowUserDetail(false)}
            className={styles.backButton}
          >
            ← Volver a los Logs
          </button>

          <div className={styles.userDetailHeader}>
            <h2>{selectedUser?.userName}</h2>
            <p>{selectedUser?.userEmail}</p>
            <span className={styles.roleBadge}>{selectedUser?.userRole}</span>
          </div>

          <div className={styles.activityTimeline}>
            {groupLogsByDate(userDetailLogs).length === 0 ? (
              <div className={styles.noActivity}>Sin actividad</div>
            ) : (
              groupLogsByDate(userDetailLogs).map(([date, dateLogs]) => (
                <div key={date} className={styles.dateGroup}>
                  <h3 className={styles.dateHeader}>{new Date(date).toLocaleDateString('es-ES', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}</h3>
                  
                  <div className={styles.timelineEvents}>
                    {dateLogs.map((log) => (
                      <div key={log.id} className={styles.timelineEvent}>
                        <div className={`${styles.eventDot} ${styles[`dot-${log.eventType}`]}`}></div>
                        <div className={styles.eventContent}>
                          <span className={styles.eventTime}>{log.time}</span>
                          <span className={`${styles.eventType} ${styles[`type-${log.eventType}`]}`}>
                            {log.eventType === 'LOGIN' ? 'ENTRADA (Login)' : 'SALIDA (Logout)'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Current Online Users */}
      <div className={styles.onlineUsersSection}>
        <h3>Actualmente en Línea ({stats.onlineUsers?.length || 0})</h3>
        <div className={styles.onlineUsersList}>
          {stats.onlineUsers && stats.onlineUsers.length > 0 ? (
            stats.onlineUsers.map((user) => (
              <div key={user.userId} className={styles.onlineUser}>
                <span className={styles.onlineDot}></span>
                <span className={styles.onlineUserName}>{user.userName}</span>
                <span className={styles.onlineUserRole}>{user.userRole}</span>
                <span className={styles.onlineUserTime}>
                  {new Date(user.lastTimestamp).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
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
