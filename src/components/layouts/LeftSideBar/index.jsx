"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Form } from 'react-bootstrap';
import { useNemtContext } from '@/context/useNemtContext';
import { usePathname } from 'next/navigation';
import { formatDispatchTime } from '@/helpers/nemt-dispatch-state';
import { getDriverColor, withDriverAlpha } from '@/helpers/nemt-driver-colors';

const SIDEBAR_EXPANDED_WIDTH = 240;
const offlineDriverBadgeStyle = {
  backgroundColor: '#cbd5e1',
  color: '#475569'
};

const listButtonBaseStyle = {
  width: '100%',
  borderTop: 'none',
  borderRight: 'none',
  borderBottom: '1px solid #e2e8f0',
  borderLeft: 'none',
  textAlign: 'left',
  cursor: 'pointer'
};

const mergeThreads = (threads, drivers) => {
  const existingThreads = Array.isArray(threads) ? threads : [];
  const byDriverId = new Map(existingThreads.map(thread => [thread.driverId, thread]));
  return drivers.map(driver => byDriverId.get(driver.id) ?? {
    driverId: driver.id,
    messages: []
  });
};

const LeftSideBar = () => {
  const pathname = usePathname();
  const isDispatcherPage = String(pathname || '').toLowerCase().startsWith('/dispatcher');
  const {
    drivers,
    trips,
    selectedDriverId,
    setSelectedDriverId,
    dispatchThreads,
    dailyDrivers,
    markDispatchThreadRead
  } = useNemtContext();
  const [driverSearch, setDriverSearch] = useState('');

  const dispatcherDrivers = useMemo(() => [
    ...drivers,
    ...(Array.isArray(dailyDrivers) ? dailyDrivers : []).map(driver => ({
      id: driver.id,
      name: driver.firstName + (driver.lastNameOrOrg ? ` ${driver.lastNameOrOrg}` : ''),
      vehicle: 'Daily Driver',
      live: 'Online',
      _isDaily: true
    }))
  ], [dailyDrivers, drivers]);

  const normalizedThreads = useMemo(() => mergeThreads(dispatchThreads, dispatcherDrivers), [dispatchThreads, dispatcherDrivers]);

  const filteredThreads = useMemo(() => {
    const term = driverSearch.trim().toLowerCase();
    return normalizedThreads.filter(thread => {
      const driver = dispatcherDrivers.find(item => item.id === thread.driverId);
      if (!term) return true;
      const haystack = [driver?.name, driver?.live, thread.messages[thread.messages.length - 1]?.text].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [dispatcherDrivers, driverSearch, normalizedThreads]);

  const driverAssignedTripCounts = useMemo(() => {
    const counts = new Map();

    for (const trip of Array.isArray(trips) ? trips : []) {
      const primaryDriverId = String(trip?.driverId || '').trim();
      const secondaryDriverId = String(trip?.secondaryDriverId || '').trim();

      if (primaryDriverId) counts.set(primaryDriverId, (counts.get(primaryDriverId) || 0) + 1);
      if (secondaryDriverId) counts.set(secondaryDriverId, (counts.get(secondaryDriverId) || 0) + 1);
    }

    return counts;
  }, [trips]);

  useEffect(() => {
    if (!isDispatcherPage) return;
    if (selectedDriverId) return;
    const firstThreadDriverId = filteredThreads[0]?.driverId ?? null;
    if (firstThreadDriverId) {
      setSelectedDriverId(firstThreadDriverId);
    }
  }, [filteredThreads, isDispatcherPage, selectedDriverId, setSelectedDriverId]);

  const filteredDrivers = useMemo(() => {
    const term = driverSearch.trim().toLowerCase();
    const filtered = !term ? drivers : drivers.filter(driver => [driver?.name, driver?.attendant, driver?.live, driver?.code].some(value => String(value || '').toLowerCase().includes(term)));
    return [...filtered].sort((leftDriver, rightDriver) => String(leftDriver?.name || '').localeCompare(String(rightDriver?.name || ''), undefined, { numeric: true, sensitivity: 'base' }));
  }, [drivers, driverSearch]);

  return <div className="nemt-left-sidebar d-print-none" style={{
    display: 'flex',
    flexDirection: 'column',
    width: SIDEBAR_EXPANDED_WIDTH,
    minWidth: SIDEBAR_EXPANDED_WIDTH,
    height: 'calc(100dvh - 24px)',
    margin: '12px',
    alignSelf: 'flex-start',
    background: '#f8fafc',
    borderRight: '1px solid #e5e7eb',
    border: '1px solid #e5e7eb',
    borderRadius: 16,
    position: 'relative',
    zIndex: 1200,
    overflow: 'hidden',
    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.08)'
  }}>
      <>
          <div className="p-2 border-bottom bg-white">
            <Form.Control size="sm" value={driverSearch} onChange={event => setDriverSearch(event.target.value)} placeholder={isDispatcherPage ? 'Search driver or message...' : 'Search driver'} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#f8fafc' }}>
            {isDispatcherPage ? <>
                {filteredThreads.length > 0 ? filteredThreads.map(thread => {
                const driver = dispatcherDrivers.find(item => item.id === thread.driverId);
                const isSelected = String(selectedDriverId || '').trim() === String(thread.driverId || '').trim();
                const driverColor = getDriverColor(driver?.id || driver?.name || thread.driverId);
                const lastMessage = thread.messages[thread.messages.length - 1];
                const unreadCount = thread.messages.filter(message => message.direction === 'incoming' && message.status !== 'read').length;

                return <button
                  key={thread.driverId}
                  type="button"
                  onClick={() => {
                  setSelectedDriverId(thread.driverId);
                  markDispatchThreadRead?.(thread.driverId);
                }}
                  style={{
                  ...listButtonBaseStyle,
                  borderLeft: `4px solid ${driverColor}`,
                  background: isSelected ? withDriverAlpha(driverColor, 0.18) : '#f8fafc',
                  padding: '0.6rem 0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ minWidth: 0, fontSize: '0.92rem', color: '#0f172a', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {driver?.name || 'Driver'}
                      </div>
                      {unreadCount > 0 ? <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, backgroundColor: '#ef4444', color: '#ffffff', fontSize: '0.7rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{unreadCount}</span>
                        </div> : null}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: '0.72rem', color: '#1d4ed8', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lastMessage?.text || 'No messages yet'}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', flexShrink: 0 }}>
                        {lastMessage ? formatDispatchTime(lastMessage.timestamp) : '--:--'}
                      </div>
                    </div>
                  </button>;
              }) : <div className="text-muted" style={{ padding: '1rem' }}>No driver threads available.</div>}
              </> : <>
                {filteredDrivers.length > 0 ? filteredDrivers.map(driver => {
                const isSelected = String(selectedDriverId || '').trim() === String(driver?.id || '').trim();
                const assignedTripCount = driverAssignedTripCounts.get(String(driver?.id || '').trim()) || 0;
                const driverLive = String(driver?.live || 'Offline').trim() || 'Offline';
                const attendantLabel = String(driver?.attendant || '').trim();

                return <button
                  key={driver.id}
                  type="button"
                  onClick={() => setSelectedDriverId(driver.id)}
                  style={{
                  ...listButtonBaseStyle,
                  background: isSelected ? '#dbeafe' : '#f8fafc',
                  padding: '0.7rem 0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{
                        minWidth: 20,
                        height: 20,
                        padding: '0 6px',
                        borderRadius: 999,
                        backgroundColor: assignedTripCount > 0 ? '#dbeafe' : '#e2e8f0',
                        color: assignedTripCount > 0 ? '#1d4ed8' : '#64748b',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                          {assignedTripCount}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.98rem', color: '#1e3a8a', fontWeight: isSelected ? 700 : 500, lineHeight: 1.2 }}>
                      {driver.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {attendantLabel || 'No attendant'}
                      </div>
                      <Badge bg={driverLive === 'Online' ? 'success' : 'secondary'} style={driverLive === 'Online' ? undefined : offlineDriverBadgeStyle}>{driverLive}</Badge>
                    </div>
                  </button>;
              }) : <div className="text-muted" style={{ padding: '1rem' }}>No drivers found.</div>}
              </>}
          </div>
          </>
    </div>;
};

export default LeftSideBar;