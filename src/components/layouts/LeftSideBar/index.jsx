"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Form } from 'react-bootstrap';
import { useNemtContext } from '@/context/useNemtContext';
import { usePathname } from 'next/navigation';
import { formatDispatchTime } from '@/helpers/nemt-dispatch-state';
import { getDriverColor, withDriverAlpha } from '@/helpers/nemt-driver-colors';

const SIDEBAR_EXPANDED_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 22;

const offlineDriverBadgeStyle = {
  backgroundColor: '#cbd5e1',
  color: '#475569'
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
  const isDispatcherPage = pathname === '/dispatcher';
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
  const [collapsed, setCollapsed] = useState(false);

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
      const haystack = [driver?.name, driver?.vehicle, driver?.live, thread.messages[thread.messages.length - 1]?.text].filter(Boolean).join(' ').toLowerCase();
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
    const filtered = !term ? drivers : drivers.filter(driver => [driver?.name, driver?.vehicle, driver?.attendant, driver?.live, driver?.code].some(value => String(value || '').toLowerCase().includes(term)));
    return [...filtered].sort((leftDriver, rightDriver) => String(leftDriver?.name || '').localeCompare(String(rightDriver?.name || ''), undefined, { numeric: true, sensitivity: 'base' }));
  }, [drivers, driverSearch]);

  return <div className="startbar d-print-none" style={{
    display: 'flex',
    flexDirection: 'column',
    width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
    minWidth: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
    height: '100%',
    background: '#f8fafc',
    borderRight: '1px solid #e5e7eb',
    position: 'relative',
    zIndex: 1200,
    overflow: 'hidden',
    transition: 'width 160ms ease, min-width 160ms ease'
  }}>
      <button
        type="button"
        onClick={() => setCollapsed(value => !value)}
        style={{
          position: 'absolute',
          right: collapsed ? -10 : -12,
          top: 16,
          width: 32,
          height: 32,
          background: '#222e36',
          color: '#fff',
          border: 'none',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 1300,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
        }}
        title={collapsed ? 'Mostrar menu izquierdo' : 'Ocultar menu izquierdo'}
        aria-label={collapsed ? 'Mostrar menu izquierdo' : 'Ocultar menu izquierdo'}
      >
        <span style={{ display: 'inline-block', transform: collapsed ? 'rotate(180deg)' : 'none', fontSize: 18, lineHeight: 1 }}>
          &#x25C0;
        </span>
      </button>
      {!collapsed ? <>
          <div className="p-2 border-bottom bg-white">
            <Form.Control size="sm" value={driverSearch} onChange={event => setDriverSearch(event.target.value)} placeholder={isDispatcherPage ? 'Search driver, message, vehicle...' : 'Search driver'} />
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
                  width: '100%',
                  border: 'none',
                  borderBottom: '1px solid #e2e8f0',
                  borderLeft: `4px solid ${driverColor}`,
                  background: isSelected ? withDriverAlpha(driverColor, 0.18) : '#f8fafc',
                  textAlign: 'left',
                  padding: '0.6rem 0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  cursor: 'pointer'
                }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ minWidth: 0, fontSize: '0.92rem', color: '#0f172a', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {driver?.name || 'Driver'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {unreadCount > 0 ? <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, backgroundColor: '#ef4444', color: '#ffffff', fontSize: '0.7rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{unreadCount}</span> : null}
                        <span style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        border: isSelected ? '4px solid #2563eb' : '2px solid #cbd5e1',
                        backgroundColor: isSelected ? '#ffffff' : 'transparent'
                      }} />
                      </div>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {driver?._isDaily ? 'Daily Driver' : driver?.vehicle || 'Pending vehicle'}
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
                const vehicleLabel = String(driver?.vehicle || '').trim() || 'No vehicle';
                const driverLive = String(driver?.live || 'Offline').trim() || 'Offline';
                const attendantLabel = String(driver?.attendant || '').trim();

                return <button
                  key={driver.id}
                  type="button"
                  onClick={() => setSelectedDriverId(driver.id)}
                  style={{
                  width: '100%',
                  border: 'none',
                  borderBottom: '1px solid #e2e8f0',
                  background: isSelected ? '#dbeafe' : '#f8fafc',
                  textAlign: 'left',
                  padding: '0.7rem 0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  cursor: 'pointer'
                }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 600, lineHeight: 1.2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {vehicleLabel}
                      </div>
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
                        <span style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        border: isSelected ? '4px solid #2563eb' : '2px solid #cbd5e1',
                        backgroundColor: isSelected ? '#ffffff' : 'transparent'
                      }} />
                      </div>
                    </div>
                    <div style={{ fontSize: '0.98rem', color: '#1e3a8a', fontWeight: 500, lineHeight: 1.2 }}>
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
        </> : null}
    </div>;
};

export default LeftSideBar;