import { mkdir, readFile, writeFile } from 'fs/promises';
import { getStorageFilePath, getStorageRoot } from '@/server/storage-paths';

const STORAGE_DIR = getStorageRoot();
const STORAGE_FILE = getStorageFilePath('activity-logs.json');

const ensureStorageFile = async () => {
  try {
    await mkdir(STORAGE_DIR, { recursive: true });
    try {
      await readFile(STORAGE_FILE, 'utf8');
    } catch {
      await writeFile(STORAGE_FILE, JSON.stringify({ logs: [] }, null, 2), 'utf8');
    }
  } catch (error) {
    console.error('Error ensuring activity logs storage:', error);
  }
};

const readActivityLogs = async () => {
  try {
    await ensureStorageFile();
    const content = await readFile(STORAGE_FILE, 'utf8');
    return JSON.parse(content) || { logs: [] };
  } catch (error) {
    console.error('Error reading activity logs:', error);
    return { logs: [] };
  }
};

const writeActivityLogs = async state => {
  try {
    await ensureStorageFile();
    await writeFile(STORAGE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing activity logs:', error);
  }
};

/**
 * Log a login event
 */
export const logLoginEvent = async (userId, userName, userRole, userEmail, ipAddress = '') => {
  try {
    const state = await readActivityLogs();
    const timestamp = new Date().toISOString();
    
    const logEntry = {
      id: `${userId}-${timestamp}`,
      userId,
      userName,
      userRole,
      userEmail,
      ipAddress,
      eventType: 'LOGIN',
      timestamp,
      date: new Date(timestamp).toISOString().split('T')[0],
      time: new Date(timestamp).toLocaleTimeString('en-US', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    };
    
    state.logs.push(logEntry);
    await writeActivityLogs(state);
    
    return logEntry;
  } catch (error) {
    console.error('Error logging login event:', error);
    throw error;
  }
};

/**
 * Log a logout event
 */
export const logLogoutEvent = async (userId) => {
  try {
    const state = await readActivityLogs();
    const timestamp = new Date().toISOString();
    
    // Find the corresponding login entry to get user details
    const lastLoginEntry = state.logs
      .filter(log => log.userId === userId && log.eventType === 'LOGIN')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    
    const logEntry = {
      id: `${userId}-${timestamp}`,
      userId,
      userName: lastLoginEntry?.userName || 'Unknown',
      userRole: lastLoginEntry?.userRole || 'Unknown',
      userEmail: lastLoginEntry?.userEmail || 'Unknown',
      ipAddress: lastLoginEntry?.ipAddress || '',
      eventType: 'LOGOUT',
      timestamp,
      date: new Date(timestamp).toISOString().split('T')[0],
      time: new Date(timestamp).toLocaleTimeString('en-US', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    };
    
    state.logs.push(logEntry);
    await writeActivityLogs(state);
    
    return logEntry;
  } catch (error) {
    console.error('Error logging logout event:', error);
  }
};

/**
 * Get all activity logs
 */
export const getAllActivityLogs = async () => {
  try {
    const state = await readActivityLogs();
    return state.logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.error('Error getting all activity logs:', error);
    return [];
  }
};

/**
 * Get logs by user ID
 */
export const getActivityLogsByUserId = async (userId) => {
  try {
    const state = await readActivityLogs();
    return state.logs
      .filter(log => log.userId === userId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.error('Error getting activity logs for user:', error);
    return [];
  }
};

/**
 * Get logs by role (admin, driver, attendant, etc.)
 */
export const getActivityLogsByRole = async (role) => {
  try {
    const state = await readActivityLogs();
    return state.logs
      .filter(log => log.userRole === role)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.error('Error getting activity logs by role:', error);
    return [];
  }
};

/**
 * Get logs by date
 */
export const getActivityLogsByDate = async (date) => {
  try {
    const state = await readActivityLogs();
    return state.logs
      .filter(log => log.date === date)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.error('Error getting activity logs by date:', error);
    return [];
  }
};

/**
 * Get summary stats
 */
export const getActivityLogsSummary = async () => {
  try {
    const state = await readActivityLogs();
    const logs = state.logs;
    
    // Count events today
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = logs.filter(log => log.date === today);
    
    // Unique users
    const uniqueUsers = new Set(logs.map(log => log.userId)).size;
    
    // Count by role
    const roleCount = {};
    logs.forEach(log => {
      if (!roleCount[log.userRole]) {
        roleCount[log.userRole] = 0;
      }
      roleCount[log.userRole]++;
    });
    
    // Count online (last event was login)
    const onlineUsers = new Map();
    logs.forEach(log => {
      onlineUsers.set(log.userId, {
        userName: log.userName,
        userRole: log.userRole,
        userEmail: log.userEmail,
        lastEvent: log.eventType,
        lastTimestamp: log.timestamp,
        isOnline: log.eventType === 'LOGIN'
      });
    });
    
    return {
      totalEvents: logs.length,
      todayEvents: todayLogs.length,
      uniqueUsers,
      roleCount,
      onlineUsers: Array.from(onlineUsers.values()).filter(u => u.isOnline)
    };
  } catch (error) {
    console.error('Error getting activity logs summary:', error);
    return {
      totalEvents: 0,
      todayEvents: 0,
      uniqueUsers: 0,
      roleCount: {},
      onlineUsers: []
    };
  }
};

/**
 * Clear old logs (older than N days)
 */
export const clearOldActivityLogs = async (daysOld = 90) => {
  try {
    const state = await readActivityLogs();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    state.logs = state.logs.filter(log => new Date(log.timestamp) > cutoffDate);
    
    await writeActivityLogs(state);
    return state.logs.length;
  } catch (error) {
    console.error('Error clearing old activity logs:', error);
  }
};
