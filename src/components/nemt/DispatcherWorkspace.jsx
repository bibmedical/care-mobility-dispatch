'use client';

import IconifyIcon from '@/components/wrappers/IconifyIcon';
import DispatcherMessagingPanel from '@/components/nemt/DispatcherMessagingPanel';
import { useNemtContext } from '@/context/useNemtContext';
import { DISPATCH_TRIP_COLUMN_OPTIONS } from '@/helpers/nemt-dispatch-state';
import { getMapTileConfig, hasMapboxConfigured } from '@/utils/map-tiles';
import { openWhatsAppConversation, resolveRouteShareDriver } from '@/utils/whatsapp';
import { divIcon } from 'leaflet';
import { useRouter } from 'next/navigation';
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import { TileLayer } from 'react-leaflet/TileLayer';
import { ZoomControl } from 'react-leaflet/ZoomControl';
import { Badge, Button, Card, CardBody, Col, Form, Row, Table } from 'react-bootstrap';

const greenToolbarButtonStyle = {
  color: '#08131a',
  borderColor: 'rgba(8, 19, 26, 0.35)',
  backgroundColor: 'transparent'
};

const DispatcherMapResizer = ({ resizeKey }) => {
  const map = useMap();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      map.invalidateSize();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [map, resizeKey]);

  return null;
};

const getStatusBadge = status => {
  if (status === 'Assigned') return 'primary';
  if (status === 'In Progress') return 'success';
  if (status === 'Cancelled') return 'danger';
  return 'secondary';
};

const getLegBadge = trip => {
  if (trip.legVariant && trip.legLabel) return {
    variant: trip.legVariant,
    label: trip.legLabel
  };
  return null;
};

const getDriverCheckpoint = driver => {
  if (driver.checkpoint) return driver.checkpoint;
  if (!driver.position) return 'No GPS';
  return `${driver.position[0].toFixed(4)}, ${driver.position[1].toFixed(4)}`;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toRadians = value => value * (Math.PI / 180);

const getDistanceMiles = (from, to) => {
  if (!Array.isArray(from) || !Array.isArray(to) || from.length !== 2 || to.length !== 2) return null;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(to[0] - from[0]);
  const dLon = toRadians(to[1] - from[1]);
  const lat1 = toRadians(from[0]);
  const lat2 = toRadians(to[0]);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatEta = miles => {
  if (miles == null) return 'ETA unavailable';
  const speedMph = 28;
  const minutes = Math.max(1, Math.round(miles / speedMph * 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

const formatDriveMinutes = minutes => {
  if (!Number.isFinite(minutes)) return 'Time unavailable';
  const roundedMinutes = Math.max(1, Math.round(minutes));
  if (roundedMinutes < 60) return `${roundedMinutes} min`;
  const hours = Math.floor(roundedMinutes / 60);
  const remainder = roundedMinutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

const sortTripsByPickupTime = items => [...items].sort((leftTrip, rightTrip) => {
  const leftTime = leftTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
  const rightTime = rightTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return String(leftTrip.id).localeCompare(String(rightTrip.id));
});

const normalizeSortValue = value => {
  if (value == null) return '';
  if (typeof value === 'number') return value;
  return String(value).trim().toLowerCase();
};

const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const getDisplayTripId = trip => {
  const rideId = String(trip?.rideId || '').trim();
  if (rideId) return rideId;
  const brokerTripId = String(trip?.brokerTripId || '').trim();
  if (brokerTripId) return brokerTripId;
  const tripId = String(trip?.id || '').trim();
  if (!tripId) return '';
  return tripId.split('-')[0] || tripId;
};

const getTripSortValue = (trip, sortKey, getDriverName) => {
  switch (sortKey) {
    case 'trip':
      return trip.brokerTripId || trip.id;
    case 'status':
      return trip.status;
    case 'driver':
      return getDriverName(trip.driverId);
    case 'pickup':
      return trip.pickupSortValue ?? trip.pickup;
    case 'dropoff':
      return trip.dropoff;
    case 'rider':
      return trip.rider;
    case 'address':
      return trip.address;
    case 'destination':
      return trip.destination;
    case 'phone':
      return trip.patientPhoneNumber;
    case 'miles':
      return Number(trip.miles) || 0;
    case 'vehicle':
      return trip.vehicleType;
    case 'leg':
      return trip.legLabel;
    default:
      return trip.pickupSortValue ?? trip.id;
  }
};

const getTripTypeLabel = trip => {
  const source = `${trip?.vehicleType || ''} ${trip?.assistanceNeeds || ''} ${trip?.tripType || ''}`.toLowerCase();
  if (source.includes('stretcher') || source.includes('str')) return 'STR';
  if (source.includes('wheelchair') || source.includes('wheel') || source.includes('wc') || source.includes('w/c')) return 'W';
  return 'A';
};

const getTripLegFilterKey = trip => {
  const legLabel = String(trip?.legLabel || '').trim().toLowerCase();
  if (!legLabel) return 'AL';
  if (legLabel.includes('outbound') || legLabel.includes('appointment') || legLabel.includes('appt')) return 'AL';
  if (legLabel.includes('return') || legLabel.includes('home') || legLabel.includes('house') || legLabel.includes('back')) return 'BL';
  if (legLabel.includes('3') || legLabel.includes('third') || legLabel.includes('connector') || legLabel.includes('cross')) return 'CL';
  return 'CL';
};

const getTripTargetPosition = trip => trip?.status === 'In Progress' ? trip?.destinationPosition ?? trip?.position : trip?.position;

const createDriverMapIcon = ({ isSelected, isOnline }) => divIcon({
  className: 'driver-map-icon-shell',
  html: `<div style="width:34px;height:34px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:${isSelected ? '#f59e0b' : isOnline ? '#16a34a' : '#475569'};border:2px solid #ffffff;box-shadow:0 6px 18px rgba(15,23,42,0.28);color:#ffffff;font-size:16px;line-height:1;">&#128663;</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -16]
});

const createRouteStopIcon = (label, variant = 'pickup') => divIcon({
  className: 'route-stop-icon-shell',
  html: `<div style="width:28px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:${variant === 'pickup' ? '#16a34a' : '#2563eb'};border:2px solid #ffffff;box-shadow:0 6px 18px rgba(15,23,42,0.28);color:#ffffff;font-size:13px;font-weight:700;line-height:1;">${label}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14]
});

const DispatcherWorkspace = () => {
  const router = useRouter();
  const {
    drivers,
    trips,
    routePlans,
    selectedTripIds,
    selectedDriverId,
    selectedRouteId,
    setSelectedDriverId,
    setSelectedRouteId,
    setSelectedTripIds,
    uiPreferences,
    toggleTripSelection,
    assignTripsToDriver,
    unassignTrips,
    cancelTrips,
    reinstateTrips,
    refreshDrivers,
    refreshDispatchState,
    getDriverName,
    setDispatcherVisibleTripColumns,
    setMapProvider
  } = useNemtContext();
  const [tripStatusFilter, setTripStatusFilter] = useState('all');
  const [tripIdSearch, setTripIdSearch] = useState('');
  const [tripLegFilter, setTripLegFilter] = useState('all');
  const [tripTypeFilter, setTripTypeFilter] = useState('all');
  const [routeSearch, setRouteSearch] = useState('');
  const [showInfo, setShowInfo] = useState(true);
  const [showRoute, setShowRoute] = useState(true);
  const [showBottomPanels, setShowBottomPanels] = useState(false);
  const [mapLocked, setMapLocked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Dispatcher listo.');
  const [columnSplit, setColumnSplit] = useState(50);
  const [rowSplit, setRowSplit] = useState(56);
  const [dragMode, setDragMode] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState([]);
  const [routeMetrics, setRouteMetrics] = useState(null);
  const [tripOrderMode, setTripOrderMode] = useState('original');
  const [quickReassignDriverId, setQuickReassignDriverId] = useState('');
  const [tripSort, setTripSort] = useState({
    key: 'pickup',
    direction: 'asc'
  });
  const workspaceRef = useRef(null);
  const deferredRouteSearch = useDeferredValue(routeSearch);

  const selectedDriver = useMemo(() => drivers.find(driver => driver.id === selectedDriverId) ?? null, [drivers, selectedDriverId]);
  const selectedRoute = useMemo(() => routePlans.find(routePlan => routePlan.id === selectedRouteId) ?? null, [routePlans, selectedRouteId]);
  const mapTileConfig = useMemo(() => getMapTileConfig(uiPreferences?.mapProvider), [uiPreferences?.mapProvider]);
  const hasSelectedTrips = selectedTripIds.length > 0;

  const filteredTrips = useMemo(() => trips.filter(trip => {
    const normalizedStatus = String(trip.status || '').toLowerCase();
    const matchesStatus = tripStatusFilter === 'all' ? normalizedStatus !== 'cancelled' : normalizedStatus === tripStatusFilter;
    if (!matchesStatus) return false;
    if (!selectedDriverId) return true;
    return !trip.driverId || trip.driverId === selectedDriverId;
  }).filter(trip => {
    if (tripLegFilter === 'all') return true;
    return getTripLegFilterKey(trip) === tripLegFilter;
  }).filter(trip => {
    if (tripTypeFilter === 'all') return true;
    return getTripTypeLabel(trip) === tripTypeFilter;
  }).filter(trip => {
    const searchValue = tripIdSearch.trim().toLowerCase();
    if (!searchValue) return true;
    return String(trip.id || '').toLowerCase().includes(searchValue) || String(trip.brokerTripId || '').toLowerCase().includes(searchValue);
  }), [selectedDriverId, tripIdSearch, tripLegFilter, tripStatusFilter, tripTypeFilter, trips]);
  const visibleTripIds = filteredTrips.map(trip => trip.id);
  const visibleTripColumns = uiPreferences?.dispatcherVisibleTripColumns ?? [];
  const filteredDrivers = drivers;
  const tripOriginalOrderLookup = useMemo(() => new Map(trips.map((trip, index) => [trip.id, index])), [trips]);
  const selectedDriverAssignedTripCount = useMemo(() => selectedDriverId ? trips.filter(trip => trip.driverId === selectedDriverId).length : 0, [selectedDriverId, trips]);
  const selectedDriverOpenTripCount = useMemo(() => selectedDriverId ? trips.filter(trip => !trip.driverId && String(trip.status || '').toLowerCase() !== 'cancelled').length : 0, [selectedDriverId, trips]);
  const groupedFilteredTripRows = useMemo(() => {
    const compareTrips = (leftTrip, rightTrip) => {
      const leftAssignedToSelectedDriver = selectedDriverId && leftTrip.driverId === selectedDriverId ? 1 : 0;
      const rightAssignedToSelectedDriver = selectedDriverId && rightTrip.driverId === selectedDriverId ? 1 : 0;
      if (leftAssignedToSelectedDriver !== rightAssignedToSelectedDriver) return rightAssignedToSelectedDriver - leftAssignedToSelectedDriver;
      if (tripOrderMode === 'time') {
        const leftTime = leftTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
        const rightTime = rightTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
        if (leftTime !== rightTime) return leftTime - rightTime;
      } else if (tripOrderMode === 'custom') {
        const leftValue = normalizeSortValue(getTripSortValue(leftTrip, tripSort.key, getDriverName));
        const rightValue = normalizeSortValue(getTripSortValue(rightTrip, tripSort.key, getDriverName));
        if (leftValue !== rightValue) {
          const result = leftValue > rightValue ? 1 : -1;
          return tripSort.direction === 'asc' ? result : -result;
        }
      } else {
        const leftOriginalIndex = tripOriginalOrderLookup.get(leftTrip.id) ?? Number.MAX_SAFE_INTEGER;
        const rightOriginalIndex = tripOriginalOrderLookup.get(rightTrip.id) ?? Number.MAX_SAFE_INTEGER;
        if (leftOriginalIndex !== rightOriginalIndex) return leftOriginalIndex - rightOriginalIndex;
      }
      const leftTime = leftTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
      const rightTime = rightTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return String(leftTrip.id).localeCompare(String(rightTrip.id));
    };

    const groups = filteredTrips.reduce((map, trip) => {
      const groupKey = trip.brokerTripId || trip.id;
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey).push(trip);
      return map;
    }, new Map());

    return Array.from(groups.entries()).map(([groupKey, groupTrips]) => ({
      groupKey,
      trips: [...groupTrips].sort(compareTrips)
    })).sort((leftGroup, rightGroup) => compareTrips(leftGroup.trips[0], rightGroup.trips[0])).flatMap(group => [{
      type: 'group',
      groupKey: group.groupKey,
      ridesCount: group.trips.length,
      label: group.trips.length > 1 ? `Trip ${group.groupKey} • ${group.trips.length} rides` : `Trip ${group.groupKey}`
    }, ...group.trips.map(trip => ({
      type: 'trip',
      groupKey: group.groupKey,
      trip
    }))]);
  }, [filteredTrips, getDriverName, selectedDriverId, tripOrderMode, tripOriginalOrderLookup, tripSort.direction, tripSort.key]);

  const routeTrips = useMemo(() => {
    const baseTrips = selectedRoute ? trips.filter(trip => selectedRoute.tripIds.includes(trip.id)) : selectedDriver ? trips.filter(trip => trip.driverId === selectedDriver.id) : trips.filter(trip => selectedTripIds.includes(trip.id));
    const term = deferredRouteSearch.trim().toLowerCase();
    return sortTripsByPickupTime(baseTrips.filter(trip => !term || [trip.id, trip.rider, trip.address].some(value => value.toLowerCase().includes(term))));
  }, [deferredRouteSearch, selectedDriver, selectedRoute, selectedTripIds, trips]);

  const routeStops = useMemo(() => {
    if (!showRoute) return [];

    if (selectedTripIds.length > 0) {
      return sortTripsByPickupTime(trips.filter(trip => selectedTripIds.includes(trip.id))).flatMap((trip, index) => [{
        key: `${trip.id}-pickup`,
        label: `${index * 2 + 1}`,
        variant: 'pickup',
        position: trip.position,
        title: `Pickup ${trip.pickup}`,
        detail: trip.address
      }, {
        key: `${trip.id}-dropoff`,
        label: `${index * 2 + 2}`,
        variant: 'dropoff',
        position: trip.destinationPosition ?? trip.position,
        title: `Dropoff ${trip.dropoff}`,
        detail: trip.destination || 'Destination pending'
      }]);
    }

    if (selectedRoute) {
      return routeTrips.flatMap((trip, index) => [{
        key: `${trip.id}-pickup`,
        label: `${index * 2 + 1}`,
        variant: 'pickup',
        position: trip.position,
        title: `Pickup ${trip.pickup}`,
        detail: trip.address
      }, {
        key: `${trip.id}-dropoff`,
        label: `${index * 2 + 2}`,
        variant: 'dropoff',
        position: trip.destinationPosition ?? trip.position,
        title: `Dropoff ${trip.dropoff}`,
        detail: trip.destination || 'Destination pending'
      }]);
    }

    return [];
  }, [routeTrips, selectedRoute, selectedTripIds, showRoute, trips]);

  const fallbackRoutePath = useMemo(() => routeStops.map(stop => stop.position), [routeStops]);
  const routePath = routeGeometry.length > 1 ? routeGeometry : fallbackRoutePath;

  const liveDrivers = drivers.filter(driver => driver.live === 'Online').length;
  const assignedTripsCount = trips.filter(trip => trip.status === 'Assigned').length;
  const activeInfoTrip = useMemo(() => {
    if (selectedTripIds.length > 0) {
      return trips.find(trip => selectedTripIds.includes(trip.id)) ?? null;
    }

    if (selectedRoute) {
      return routeTrips[0] ?? null;
    }

    if (selectedDriver) {
      return trips.find(trip => trip.driverId === selectedDriver.id) ?? null;
    }

    return null;
  }, [routeTrips, selectedDriver, selectedRoute, selectedTripIds, trips]);
  const allVisibleSelected = visibleTripIds.length > 0 && visibleTripIds.every(id => selectedTripIds.includes(id));
  const tripTableColumnCount = visibleTripColumns.length + 2;
  const selectedDriverActiveTrip = useMemo(() => {
    if (!selectedDriver) return null;
    const preferredTrip = trips.find(trip => selectedTripIds.includes(trip.id) && trip.driverId === selectedDriver.id);
    if (preferredTrip) return preferredTrip;
    const routeTrip = routeTrips.find(trip => trip.driverId === selectedDriver.id);
    if (routeTrip) return routeTrip;
    return trips.find(trip => trip.driverId === selectedDriver.id) ?? null;
  }, [routeTrips, selectedDriver, selectedTripIds, trips]);
  const selectedDriverEta = useMemo(() => {
    if (!selectedDriver || !selectedDriver.hasRealLocation || !selectedDriverActiveTrip) return null;
    const miles = getDistanceMiles(selectedDriver.position, getTripTargetPosition(selectedDriverActiveTrip));
    return {
      miles,
      label: formatEta(miles)
    };
  }, [selectedDriver, selectedDriverActiveTrip]);
  const driversWithRealLocation = useMemo(() => drivers.filter(driver => driver.hasRealLocation), [drivers]);
  const activeDrivers = useMemo(() => {
    const onlineDrivers = drivers.filter(driver => driver.live === 'Online');
    return onlineDrivers.length > 0 ? onlineDrivers : drivers;
  }, [drivers]);

  const handleToggleTripColumn = columnKey => {
    const nextColumns = visibleTripColumns.includes(columnKey) ? visibleTripColumns.filter(item => item !== columnKey) : [...visibleTripColumns, columnKey];
    if (nextColumns.length === 0) {
      setStatusMessage('Debe quedar al menos una columna visible.');
      return;
    }
    setDispatcherVisibleTripColumns(nextColumns);
    setStatusMessage('Vista de columnas actualizada.');
  };

  const handleSelectAll = checked => {
    if (checked) {
      setSelectedTripIds(Array.from(new Set([...selectedTripIds, ...visibleTripIds])));
      setStatusMessage('Trips visibles seleccionados.');
      return;
    }
    setSelectedTripIds(selectedTripIds.filter(id => !visibleTripIds.includes(id)));
    setStatusMessage('Trips visibles deseleccionados.');
  };

  const handleTripSelectionToggle = tripId => {
    const trip = trips.find(item => item.id === tripId);
    const isSelecting = !selectedTripIds.includes(tripId);

    toggleTripSelection(tripId);

    if (isSelecting && trip?.driverId) {
      setSelectedDriverId(trip.driverId);
      if (!showBottomPanels) {
        setShowBottomPanels(true);
      }
      setStatusMessage(`SMS listo con ${getDriverName(trip.driverId)} para el trip ${trip.id}.`);
    }
  };

  const handleAssign = driverId => {
    if (!driverId || selectedTripIds.length === 0) {
      setStatusMessage('Selecciona chofer y al menos un trip.');
      return;
    }

    const driver = drivers.find(item => item.id === driverId);
    if (!driver) {
      setStatusMessage('El chofer seleccionado ya no esta disponible. Recarga la lista.');
      return;
    }

    assignTripsToDriver(driverId);
    setStatusMessage(`${selectedTripIds.length} trip(s) asignados a ${driver.name}.`);
  };

  const handleAssignTrip = tripId => {
    if (!selectedDriverId) {
      setStatusMessage('Primero escoge un chofer para asignar este trip.');
      return;
    }

    const driver = drivers.find(item => item.id === selectedDriverId);
    if (!driver) {
      setStatusMessage('El chofer seleccionado no esta disponible.');
      return;
    }

    assignTripsToDriver(selectedDriverId, [tripId]);
    setSelectedTripIds([tripId]);
    setStatusMessage(`Trip ${tripId} asignado a ${driver.name}.`);
  };

  const handleQuickReassignSelectedTrips = () => {
    if (!quickReassignDriverId || selectedTripIds.length === 0) {
      setStatusMessage('Escoge un chofer activo y al menos un trip abajo para reasignar.');
      return;
    }

    const driver = drivers.find(item => item.id === quickReassignDriverId);
    if (!driver) {
      setStatusMessage('Ese chofer ya no esta disponible.');
      return;
    }

    const selectedCount = selectedTripIds.length;
    assignTripsToDriver(quickReassignDriverId, selectedTripIds);
    setSelectedTripIds([]);
    setSelectedDriverId(quickReassignDriverId);
    setSelectedRouteId('');
    setQuickReassignDriverId('');
    if (!showBottomPanels) {
      setShowBottomPanels(true);
    }
    setStatusMessage(`${selectedCount} trip(s) reasignados a ${driver.name}.`);
  };

  const handleDriverSelectionChange = nextDriverId => {
    setSelectedDriverId(nextDriverId);
    setSelectedRouteId('');

    if (!nextDriverId) {
      setSelectedTripIds([]);
      setStatusMessage('Mostrando todos los trips otra vez.');
      return;
    }

    const nextSelectedTripIds = selectedTripIds.filter(id => {
      const trip = trips.find(item => item.id === id);
      return trip && (!trip.driverId || trip.driverId === nextDriverId);
    });

    setSelectedTripIds(nextSelectedTripIds);

    const driver = drivers.find(item => item.id === nextDriverId);
    if (!driver) {
      setStatusMessage('Chofer no encontrado.');
      return;
    }

    const assignedCount = trips.filter(trip => trip.driverId === nextDriverId).length;
    const openCount = trips.filter(trip => !trip.driverId).length;
    setStatusMessage(`Viendo ${driver.name}: ${assignedCount} asignados y ${openCount} pendientes.`);
  };

  const handleUnassign = () => {
    if (selectedTripIds.length === 0) {
      setStatusMessage('Selecciona al menos un trip para quitar asignacion.');
      return;
    }
    unassignTrips();
    setStatusMessage('Trips desasignados.');
  };

  const handleUnassignTrip = tripId => {
    unassignTrips([tripId]);
    setSelectedTripIds(currentIds => currentIds.filter(id => id !== tripId));
    setStatusMessage(`Trip ${tripId} desasignado.`);
  };

  const handleCancelTrip = tripId => {
    cancelTrips([tripId]);
    setStatusMessage(`Trip ${tripId} cancelado.`);
  };

  const handleCancelSelectedTrips = () => {
    if (selectedTripIds.length === 0) {
      setStatusMessage('Selecciona al menos un trip para cancelar.');
      return;
    }

    cancelTrips(selectedTripIds);
    setStatusMessage(`${selectedTripIds.length} trip(s) cancelados.`);
  };

  const handleReinstateTrip = tripId => {
    reinstateTrips([tripId]);
    setStatusMessage(`Trip ${tripId} incorporado otra vez.`);
  };

  const handleReinstateSelectedTrips = () => {
    if (selectedTripIds.length === 0) {
      setStatusMessage('Selecciona al menos un trip para incorporar.');
      return;
    }

    reinstateTrips(selectedTripIds);
    setStatusMessage(`${selectedTripIds.length} trip(s) incorporados otra vez.`);
  };

  const handleTripSortChange = columnKey => {
    setTripOrderMode('custom');
    setTripSort(currentSort => currentSort.key === columnKey ? {
      key: columnKey,
      direction: currentSort.direction === 'asc' ? 'desc' : 'asc'
    } : {
      key: columnKey,
      direction: 'asc'
    });
  };

  const handleTripOrderModeToggle = () => {
    setTripOrderMode(currentMode => {
      const nextMode = currentMode === 'time' ? 'original' : 'time';
      setStatusMessage(nextMode === 'time' ? 'Trips ordenados por hora.' : 'Trips en el orden original.');
      return nextMode;
    });
  };

  const handlePrintRoute = () => {
    if (routeTrips.length === 0) {
      setStatusMessage('No hay ruta para imprimir todavia.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=960,height=720');
    if (!printWindow) {
      setStatusMessage('No se pudo abrir la ventana de impresion.');
      return;
    }

    const title = selectedDriver ? `Ruta de ${selectedDriver.name}` : selectedRoute ? `Ruta ${selectedRoute.name}` : 'Ruta actual';
    const generatedAt = new Date().toLocaleString();
    const rowsMarkup = routeTrips.map((trip, index) => `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(getDriverName(trip.driverId))}</td>
        <td>${escapeHtml(getTripTypeLabel(trip))}</td>
        <td>${escapeHtml(trip.pickup)}</td>
        <td>${escapeHtml(trip.dropoff)}</td>
        <td>${escapeHtml(trip.rider)}</td>
        <td>${escapeHtml(trip.patientPhoneNumber || '-')}</td>
        <td>${escapeHtml(trip.address)}</td>
        <td>${escapeHtml(trip.destination || '-')}</td>
      </tr>`).join('');

    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
      h1 { margin: 0 0 8px; font-size: 24px; }
      p { margin: 0 0 16px; color: #4b5563; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 12px; }
      th { background: #f3f4f6; }
      .meta { display: flex; gap: 16px; margin-bottom: 16px; font-size: 12px; }
      .meta strong { color: #111827; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      <div><strong>Generado:</strong> ${escapeHtml(generatedAt)}</div>
      <div><strong>Total de viajes:</strong> ${routeTrips.length}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Driver</th>
          <th>Type</th>
          <th>PU</th>
          <th>DO</th>
          <th>Rider</th>
          <th>Phone</th>
          <th>PU Address</th>
          <th>DO Address</th>
        </tr>
      </thead>
      <tbody>${rowsMarkup}</tbody>
    </table>
  </body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    setStatusMessage(`Imprimiendo ${title.toLowerCase()}.`);
  };

  const handleSendConfirmationSms = async () => {
    const targetTripIds = selectedTripIds.length > 0 ? selectedTripIds : routeTrips.map(trip => trip.id);
    if (targetTripIds.length === 0) {
      setStatusMessage('Selecciona al menos un trip o una ruta antes de mandar SMS de confirmacion.');
      return;
    }

    try {
      const response = await fetch('/api/integrations/sms/send-confirmation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tripIds: targetTripIds
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to send confirmation SMS');

      if (payload.failedCount > 0) {
        await refreshDispatchState({ forceServer: true });
        setStatusMessage(`SMS enviados: ${payload.sentCount}. Fallidos: ${payload.failedCount}.`);
        return;
      }

      await refreshDispatchState({ forceServer: true });
      setStatusMessage(`SMS de confirmacion enviados para ${payload.sentCount} trip(s).`);
    } catch (error) {
      setStatusMessage(error.message || 'No se pudo mandar el SMS de confirmacion.');
    }
  };

  const handleShareRouteWhatsapp = () => {
    const targetDriver = resolveRouteShareDriver({
      selectedDriver,
      selectedRoute,
      routeTrips,
      drivers
    });

    if (!targetDriver) {
      setStatusMessage('Selecciona un chofer antes de enviar por WhatsApp.');
      return;
    }
    if (routeTrips.length === 0) {
      setStatusMessage('No hay ruta para enviar por WhatsApp todavia.');
      return;
    }

    const title = targetDriver ? `Ruta de ${targetDriver.name}` : selectedRoute ? `Ruta ${selectedRoute.name}` : 'Ruta actual';
    const message = [`Hola ${targetDriver.name},`, '', `Tu ruta: ${title}`, `Total de viajes: ${routeTrips.length}`, '', routeTrips.map((trip, index) => [`${index + 1}. ${trip.pickup} - ${trip.dropoff} | ${trip.rider}`,
      `PU: ${trip.address || 'No pickup address'}`,
      `DO: ${trip.destination || 'No dropoff address'}`
    ].join('\n')).join('\n\n')].join('\n');
    const whatsappResult = openWhatsAppConversation({
      phoneNumber: targetDriver.phone,
      message
    });

    if (!whatsappResult.ok) {
      if (whatsappResult.reason === 'missing-phone') {
        setStatusMessage(`El chofer ${targetDriver.name} no tiene un numero valido para WhatsApp.`);
        return;
      }

      if (whatsappResult.reason === 'popup-blocked') {
        setStatusMessage('El navegador bloqueo la nueva pestaña de WhatsApp. Permite popups para esta pagina.');
        return;
      }

      setStatusMessage('No se pudo abrir WhatsApp.');
      return;
    }

    setStatusMessage(`Abriendo WhatsApp en una nueva pestaña para ${targetDriver.name}.`);
  };

  const renderTripHeader = (columnKey, label, width) => <th style={width ? { width } : undefined}>
      <button type="button" onClick={() => handleTripSortChange(columnKey)} className="btn btn-link text-decoration-none text-reset p-0 d-inline-flex align-items-center gap-1 fw-semibold">
        <span>{label}</span>
        <span className="small">{tripSort.key === columnKey ? tripSort.direction === 'asc' ? '↑' : '↓' : '↕'}</span>
      </button>
    </th>;

  useEffect(() => {
    if (!showRoute || routeStops.length < 2) {
      setRouteGeometry([]);
      setRouteMetrics(null);
      return;
    }

    const uniqueStops = routeStops.filter((stop, index, stops) => index === 0 || stop.position[0] !== stops[index - 1].position[0] || stop.position[1] !== stops[index - 1].position[1]);
    if (uniqueStops.length < 2) {
      setRouteGeometry(uniqueStops.map(stop => stop.position));
      setRouteMetrics(null);
      return;
    }

    const abortController = new AbortController();
    const coordinates = uniqueStops.map(stop => `${stop.position[0]},${stop.position[1]}`).join(';');

    const loadRouteGeometry = async () => {
      try {
        const response = await fetch(`/api/maps/route?coordinates=${encodeURIComponent(coordinates)}`, {
          signal: abortController.signal,
          cache: 'no-store'
        });
        if (!response.ok) throw new Error('Routing service unavailable');
        const payload = await response.json();
        const geometry = Array.isArray(payload?.geometry) ? payload.geometry : [];
        if (geometry.length < 2) throw new Error('No drivable route found');
        setRouteGeometry(geometry);
        setRouteMetrics({
          distanceMiles: Number.isFinite(payload?.distanceMiles) ? payload.distanceMiles : null,
          durationMinutes: Number.isFinite(payload?.durationMinutes) ? payload.durationMinutes : null,
          isFallback: Boolean(payload?.isFallback)
        });
      } catch {
        if (abortController.signal.aborted) return;
        setRouteGeometry(uniqueStops.map(stop => stop.position));
        setRouteMetrics(null);
      }
    };

    loadRouteGeometry();

    return () => {
      abortController.abort();
    };
  }, [routeStops, showRoute]);

  useEffect(() => {
    if (!dragMode) return;

    const handlePointerMove = event => {
      if (!workspaceRef.current) return;
      const bounds = workspaceRef.current.getBoundingClientRect();
      const nextColumnSplit = clamp((event.clientX - bounds.left) / bounds.width * 100, 28, 72);
      const nextRowSplit = clamp((event.clientY - bounds.top) / bounds.height * 100, 32, 74);

      if (dragMode === 'column' || dragMode === 'both') {
        setColumnSplit(nextColumnSplit);
      }

      if (dragMode === 'row' || dragMode === 'both') {
        setRowSplit(nextRowSplit);
      }
    };

    const stopDragging = () => {
      setDragMode(null);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', stopDragging);
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', stopDragging);
      document.body.style.userSelect = '';
    };
  }, [dragMode]);

  const workspaceHeight = expanded ? 1100 : 980;
  const dividerSize = 10;
  const workspaceGridStyle = {
    display: 'grid',
    gridTemplateColumns: `${columnSplit}% ${dividerSize}px minmax(0, ${100 - columnSplit}%)`,
    gridTemplateRows: showBottomPanels ? `${rowSplit}% ${dividerSize}px minmax(0, ${100 - rowSplit}%)` : '1fr 0px 0px',
    height: workspaceHeight,
    minHeight: workspaceHeight,
    position: 'relative'
  };
  const dividerBaseStyle = {
    backgroundColor: '#1f2433',
    borderRadius: 999,
    position: 'relative',
    zIndex: 30
  };

  return <>
      <div ref={workspaceRef} style={workspaceGridStyle}>
        <div style={{ minWidth: 0, minHeight: 0 }}>
          <Card className="h-100">
            <CardBody className="p-0">
              <div className="position-relative h-100">
                <div className="position-absolute top-0 start-0 p-2 d-flex align-items-center gap-2 flex-wrap" style={{ zIndex: 650, maxWidth: '100%' }}>
                  <Button variant="dark" size="sm" onClick={() => setShowRoute(current => !current)}>Route</Button>
                  <Button variant="dark" size="sm" onClick={() => setSelectedTripIds([])}>Clear</Button>
                  <Button variant="dark" size="sm" onClick={() => setShowInfo(current => !current)}>{showInfo ? 'Hide Info' : 'Show Info'}</Button>
                  <Button variant="dark" size="sm" onClick={() => router.push('/drivers/grouping')}>Grouping</Button>
                  <Button variant="dark" size="sm" onClick={() => {
                  setShowBottomPanels(current => !current);
                  setStatusMessage(showBottomPanels ? 'Paneles inferiores ocultos.' : 'Paneles inferiores visibles.');
                }}>{showBottomPanels ? 'Hide SMS' : 'SMS'}</Button>
                  <Button variant="dark" size="sm" onClick={() => setMapLocked(current => !current)}>{mapLocked ? 'Unlock' : 'Lock'}</Button>
                </div>
                {selectedDriver?.hasRealLocation && selectedDriverActiveTrip ? <div className="position-absolute bottom-0 start-0 m-3 bg-dark text-white border rounded shadow-sm p-3" style={{ zIndex: 500, minWidth: 260, borderColor: '#2a3144' }}>
                    <div className="small text-uppercase text-secondary">Driver ETA</div>
                    <div className="fw-semibold d-flex align-items-center gap-2"><IconifyIcon icon="iconoir:map-pin" /> {selectedDriver.name}</div>
                    <div className="small mt-1">Heading to {selectedDriverActiveTrip.id} • {selectedDriverActiveTrip.rider}</div>
                    <div className="small text-secondary">{selectedDriverActiveTrip.pickup} • {selectedDriverActiveTrip.address}</div>
                    <div className="mt-2 d-flex align-items-center gap-2 flex-wrap">
                      <Badge bg="info">{selectedDriverEta?.label || 'ETA unavailable'}</Badge>
                      <Badge bg="secondary">{selectedDriverEta?.miles != null ? `${selectedDriverEta.miles.toFixed(1)} mi` : 'No distance'}</Badge>
                      <Badge bg={selectedDriver.live === 'Online' ? 'success' : 'dark'}>{selectedDriver.live}</Badge>
                    </div>
                  </div> : null}
                <MapContainer className="dispatcher-map" center={selectedDriver?.position ?? [28.5383, -81.3792]} zoom={10} zoomControl={false} scrollWheelZoom={!mapLocked} dragging={!mapLocked} doubleClickZoom={!mapLocked} touchZoom={!mapLocked} boxZoom={!mapLocked} keyboard={!mapLocked} style={{ height: '100%', width: '100%' }}>
                  <DispatcherMapResizer resizeKey={`${showBottomPanels}-${columnSplit}-${rowSplit}-${selectedTripIds.join(',')}`} />
                  <TileLayer attribution={mapTileConfig.attribution} url={mapTileConfig.url} />
                  <ZoomControl position="bottomleft" />
                  {showRoute && routePath.length > 1 ? <Polyline positions={routePath} pathOptions={{ color: selectedRoute?.color ?? '#2563eb', weight: 4 }} /> : null}
                  {selectedDriver?.hasRealLocation && selectedDriverActiveTrip ? <Polyline positions={[selectedDriver.position, getTripTargetPosition(selectedDriverActiveTrip)]} pathOptions={{ color: '#f59e0b', weight: 3, dashArray: '8 8' }} /> : null}
                  {hasSelectedTrips ? routeStops.map(stop => <Marker key={stop.key} position={stop.position} icon={createRouteStopIcon(stop.label, stop.variant)}>
                      <Popup>
                        <div className="fw-semibold">{stop.title}</div>
                        <div>{stop.detail}</div>
                      </Popup>
                    </Marker>) : null}
                  {hasSelectedTrips ? filteredTrips.filter(trip => selectedTripIds.includes(trip.id)).map(trip => <CircleMarker key={trip.id} center={trip.position} radius={10} pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.9 }} eventHandlers={{
                    click: () => toggleTripSelection(trip.id)
                  }}>
                      <Popup>{`${trip.brokerTripId || trip.id} | ${trip.legLabel || 'Ride'} | ${trip.rider} | ${trip.pickup}`}</Popup>
                    </CircleMarker>) : null}
                </MapContainer>
              </div>
            </CardBody>
          </Card>
        </div>

        <div onMouseDown={() => setDragMode('column')} style={{
        ...dividerBaseStyle,
        cursor: 'col-resize',
        gridColumn: 2,
        gridRow: '1 / span 3'
      }}>
          <div className="position-absolute start-50 translate-middle-x rounded-pill" style={{ top: 10, bottom: 10, width: 4, backgroundColor: '#4c536a' }} />
        </div>

        <div style={{ minWidth: 0, minHeight: 0 }}>
          <Card className="h-100">
            <CardBody className="p-0 d-flex flex-column h-100">
              <div className="d-flex justify-content-between align-items-center p-3 border-bottom bg-success text-dark flex-wrap gap-2 flex-shrink-0">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <strong>Trips</strong>
                  <Badge bg="light" text="dark">{assignedTripsCount}/{trips.length}</Badge>
                  <Form.Select size="sm" value={tripStatusFilter} onChange={event => setTripStatusFilter(event.target.value)} style={{ width: 130 }}>
                    <option value="all">All</option>
                    <option value="assigned">Assigned</option>
                    <option value="unassigned">Unassigned</option>
                    <option value="cancelled">Cancelled</option>
                  </Form.Select>
                  <Form.Control size="sm" value={tripIdSearch} onChange={event => setTripIdSearch(event.target.value)} placeholder="Search Trip ID" style={{ width: 150 }} />
                  <Form.Select size="sm" value={selectedDriverId ?? ''} onChange={event => handleDriverSelectionChange(event.target.value)} style={{ width: 220 }}>
                    <option value="">Select driver</option>
                    {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
                  </Form.Select>
                  {selectedDriver ? <Badge bg="light" text="dark">{selectedDriverAssignedTripCount} assigned</Badge> : null}
                  {selectedDriver ? <Badge bg="warning" text="dark">{selectedDriverOpenTripCount} open</Badge> : null}
                  <span className="small">{selectedTripIds.length} sel.</span>
                </div>
                <div className="d-flex gap-2 small flex-wrap position-relative">
                  <Badge bg="primary">{trips.length} trips</Badge>
                  <Badge bg="info">{drivers.length} drivers</Badge>
                  <Badge bg="secondary">{liveDrivers} live</Badge>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => router.push('/drivers/grouping')}>Billing Grouping</Button>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => setShowColumnPicker(current => !current)}>
                    Columns
                  </Button>
                  <Form.Select size="sm" value={uiPreferences?.mapProvider || 'auto'} onChange={event => setMapProvider(event.target.value)} style={{ ...greenToolbarButtonStyle, width: 150, backgroundColor: '#ffffff', color: '#08131a' }}>
                    <option value="auto">Map: Auto</option>
                    <option value="openstreetmap">Map: OSM</option>
                    <option value="mapbox" disabled={!hasMapboxConfigured}>Map: Mapbox</option>
                  </Form.Select>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handleTripOrderModeToggle}>
                    {tripOrderMode === 'time' ? 'Como Vienen' : 'Por Hora'}
                  </Button>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => router.push('/forms-safe-ride-import')}>Import Excel</Button>
                  <div className="d-flex align-items-center gap-1 flex-wrap">
                    <span className="fw-semibold small">Leg</span>
                    <Button variant={tripLegFilter === 'AL' ? 'dark' : 'outline-dark'} size="sm" style={tripLegFilter === 'AL' ? undefined : greenToolbarButtonStyle} onClick={() => setTripLegFilter(current => current === 'AL' ? 'all' : 'AL')} title="Primer viaje a la cita">AL</Button>
                    <Button variant={tripLegFilter === 'BL' ? 'dark' : 'outline-dark'} size="sm" style={tripLegFilter === 'BL' ? undefined : greenToolbarButtonStyle} onClick={() => setTripLegFilter(current => current === 'BL' ? 'all' : 'BL')} title="Viajes de regreso a casa">BL</Button>
                    <Button variant={tripLegFilter === 'CL' ? 'dark' : 'outline-dark'} size="sm" style={tripLegFilter === 'CL' ? undefined : greenToolbarButtonStyle} onClick={() => setTripLegFilter(current => current === 'CL' ? 'all' : 'CL')} title="Tercer viaje o connector leg">CL</Button>
                  </div>
                  <div className="d-flex align-items-center gap-1 flex-wrap">
                    <span className="fw-semibold small">Type</span>
                    <Button variant={tripTypeFilter === 'A' ? 'dark' : 'outline-dark'} size="sm" style={tripTypeFilter === 'A' ? undefined : greenToolbarButtonStyle} onClick={() => setTripTypeFilter(current => current === 'A' ? 'all' : 'A')} title="Ambulatory">A</Button>
                    <Button variant={tripTypeFilter === 'W' ? 'dark' : 'outline-dark'} size="sm" style={tripTypeFilter === 'W' ? undefined : greenToolbarButtonStyle} onClick={() => setTripTypeFilter(current => current === 'W' ? 'all' : 'W')} title="Wheelchair">W</Button>
                    <Button variant={tripTypeFilter === 'STR' ? 'dark' : 'outline-dark'} size="sm" style={tripTypeFilter === 'STR' ? undefined : greenToolbarButtonStyle} onClick={() => setTripTypeFilter(current => current === 'STR' ? 'all' : 'STR')} title="Stretcher">STR</Button>
                  </div>
                  {routeMetrics?.distanceMiles != null ? <Badge bg="light" text="dark">Miles {routeMetrics.distanceMiles.toFixed(1)}</Badge> : null}
                  {routeMetrics?.durationMinutes != null ? <Badge bg="light" text="dark">{formatDriveMinutes(routeMetrics.durationMinutes)}</Badge> : null}
                  {showColumnPicker ? <Card className="shadow position-absolute end-0 mt-5" style={{ zIndex: 35, width: 240 }}>
                      <CardBody className="p-3 text-dark">
                        <div className="fw-semibold mb-2">Escoge que quieres ver</div>
                        <div className="small text-muted mb-3">Estos cambios se guardan para la proxima vez.</div>
                        <div className="d-flex flex-column gap-2">
                          {DISPATCH_TRIP_COLUMN_OPTIONS.map(option => <Form.Check key={option.key} type="switch" id={`dispatcher-column-${option.key}`} label={option.label} checked={visibleTripColumns.includes(option.key)} onChange={() => handleToggleTripColumn(option.key)} />)}
                        </div>
                      </CardBody>
                    </Card> : null}
                </div>
              </div>
              <div className="table-responsive flex-grow-1" style={{ minHeight: 0, maxHeight: showBottomPanels ? expanded ? 520 : 390 : '100%' }}>
                <Table hover className="align-middle mb-0" style={{ whiteSpace: 'nowrap' }}>
                  <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ width: 48 }}><Form.Check checked={allVisibleSelected} onChange={event => handleSelectAll(event.target.checked)} /></th>
                      <th style={{ width: 170, whiteSpace: 'nowrap' }}>
                        <div className="d-flex align-items-center gap-2">
                          <span>ACT</span>
                          {tripStatusFilter === 'cancelled' ? <Button variant="primary" size="sm" onClick={handleReinstateSelectedTrips}>I</Button> : <>
                              <Button variant="success" size="sm" onClick={() => handleAssign(selectedDriverId)}>A</Button>
                              <Button variant="secondary" size="sm" onClick={handleUnassign}>U</Button>
                              <Button variant="danger" size="sm" onClick={handleCancelSelectedTrips}>C</Button>
                            </>}
                        </div>
                      </th>
                      {visibleTripColumns.includes('trip') ? renderTripHeader('trip', 'Trip / Ride') : null}
                      {visibleTripColumns.includes('status') ? renderTripHeader('status', 'Status') : null}
                      {visibleTripColumns.includes('driver') ? renderTripHeader('driver', 'Driver') : null}
                      {visibleTripColumns.includes('pickup') ? renderTripHeader('pickup', 'PU') : null}
                      {visibleTripColumns.includes('dropoff') ? renderTripHeader('dropoff', 'DO') : null}
                      {visibleTripColumns.includes('miles') ? renderTripHeader('miles', 'Miles') : null}
                      {visibleTripColumns.includes('rider') ? renderTripHeader('rider', 'Rider') : null}
                      {visibleTripColumns.includes('address') ? renderTripHeader('address', 'PU Address') : null}
                      {visibleTripColumns.includes('destination') ? renderTripHeader('destination', 'DO Address') : null}
                      {visibleTripColumns.includes('phone') ? renderTripHeader('phone', 'Phone') : null}
                      {visibleTripColumns.includes('vehicle') ? renderTripHeader('vehicle', 'Vehicle') : null}
                      {visibleTripColumns.includes('leg') ? renderTripHeader('leg', 'Leg') : null}
                    </tr>
                  </thead>
                  <tbody>
                    {groupedFilteredTripRows.length > 0 ? groupedFilteredTripRows.map(row => row.type === 'group' ? <tr key={`group-${row.groupKey}`} className="table-light">
                        <td colSpan={tripTableColumnCount} className="small fw-semibold text-uppercase text-muted">{row.label}</td>
                      </tr> : <tr key={row.trip.id} className={selectedTripIds.includes(row.trip.id) ? 'table-primary' : row.trip.driverId && row.trip.driverId === selectedDriverId ? 'table-success' : ''}>
                        <td><Form.Check checked={selectedTripIds.includes(row.trip.id)} onChange={() => handleTripSelectionToggle(row.trip.id)} /></td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div className="d-flex align-items-center gap-1" style={{ whiteSpace: 'nowrap' }}>
                            <Button variant={row.trip.status === 'Assigned' ? 'success' : 'outline-secondary'} size="sm" onClick={() => {
                          setSelectedTripIds([row.trip.id]);
                          setSelectedDriverId(row.trip.driverId ?? selectedDriverId);
                          setSelectedRouteId(row.trip.routeId);
                          if (row.trip.driverId && !showBottomPanels) {
                            setShowBottomPanels(true);
                          }
                          setStatusMessage(`Trip ${row.trip.id} activo.`);
                        }}>ACT</Button>
                            {tripStatusFilter === 'cancelled' || row.trip.status === 'Cancelled' ? <Button variant="primary" size="sm" onClick={() => handleReinstateTrip(row.trip.id)}>I</Button> : <>
                                <Button variant="success" size="sm" onClick={() => handleAssignTrip(row.trip.id)}>A</Button>
                                <Button variant="secondary" size="sm" onClick={() => handleUnassignTrip(row.trip.id)}>U</Button>
                                <Button variant="danger" size="sm" onClick={() => handleCancelTrip(row.trip.id)}>C</Button>
                              </>}
                          </div>
                        </td>
                        {visibleTripColumns.includes('trip') ? <td style={{ whiteSpace: 'nowrap' }}>
                          <div className="fw-semibold">{getDisplayTripId(row.trip)}</div>
                            {getLegBadge(row.trip) ? <Badge bg={getLegBadge(row.trip).variant} className="mt-1">{getLegBadge(row.trip).label}</Badge> : null}
                          </td> : null}
                        {visibleTripColumns.includes('status') ? <td style={{ whiteSpace: 'nowrap' }}><Badge bg={row.trip.driverId && row.trip.driverId === selectedDriverId ? 'success' : getStatusBadge(row.trip.status)}>{row.trip.driverId && row.trip.driverId === selectedDriverId ? 'Assigned Here' : row.trip.status}</Badge>{row.trip.safeRideStatus && row.trip.status !== 'Cancelled' ? <div className="small text-muted mt-1">{row.trip.safeRideStatus}</div> : null}</td> : null}
                        {visibleTripColumns.includes('driver') ? <td style={{ whiteSpace: 'nowrap' }}>{getDriverName(row.trip.driverId)}</td> : null}
                        {visibleTripColumns.includes('pickup') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.pickup}</td> : null}
                        {visibleTripColumns.includes('dropoff') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.dropoff}</td> : null}
                        {visibleTripColumns.includes('miles') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.miles || '-'}</td> : null}
                        {visibleTripColumns.includes('rider') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.rider}</td> : null}
                        {visibleTripColumns.includes('address') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.address}</td> : null}
                        {visibleTripColumns.includes('destination') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.destination || '-'}</td> : null}
                        {visibleTripColumns.includes('phone') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.patientPhoneNumber || '-'}</td> : null}
                        {visibleTripColumns.includes('vehicle') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.vehicleType || '-'}</td> : null}
                        {visibleTripColumns.includes('leg') ? <td style={{ whiteSpace: 'nowrap' }}>{getLegBadge(row.trip) ? <Badge bg={getLegBadge(row.trip).variant}>{getLegBadge(row.trip).label}</Badge> : '-'}</td> : null}
                      </tr>) : <tr>
                        <td colSpan={tripTableColumnCount} className="text-center text-muted py-4">No hay viajes cargados. Esperando tus trips reales.</td>
                      </tr>}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>
        </div>

        <div onMouseDown={() => showBottomPanels ? setDragMode('row') : undefined} style={{
        ...dividerBaseStyle,
        cursor: 'row-resize',
        gridColumn: '1 / span 3',
        gridRow: 2,
        display: showBottomPanels ? 'block' : 'none'
      }}>
          <div className="position-absolute top-50 start-50 translate-middle rounded-pill" style={{ width: 42, height: 4, backgroundColor: '#4c536a' }} />
        </div>

        <div onMouseDown={() => showBottomPanels ? setDragMode('both') : undefined} style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        backgroundColor: '#58607a',
        border: '3px solid #0f1320',
        position: 'absolute',
        left: `calc(${columnSplit}% - ${dividerSize / 2}px)`,
        top: `calc(${rowSplit}% - ${dividerSize / 2}px)`,
        transform: 'translate(-50%, -50%)',
        cursor: 'move',
        zIndex: 50,
        boxShadow: '0 0 0 2px rgba(88, 96, 122, 0.25)',
        display: showBottomPanels ? 'block' : 'none'
      }} />

        <div style={{ minWidth: 0, minHeight: 0, display: showBottomPanels ? 'block' : 'none' }}>
          <Card className="h-100">
            <CardBody className="p-0">
              <DispatcherMessagingPanel drivers={filteredDrivers} selectedDriverId={selectedDriverId} setSelectedDriverId={setSelectedDriverId} openFullChat={() => {
              refreshDrivers();
              router.push('/driver-chat');
              setStatusMessage('Abriendo mensajeria completa de choferes.');
            }} />
            </CardBody>
          </Card>
        </div>

        <div style={{ minWidth: 0, minHeight: 0, display: showBottomPanels ? 'block' : 'none' }}>
          <Card className="h-100">
            <CardBody className="p-0">
              <div className="d-flex justify-content-between align-items-center p-2 border-bottom bg-success text-dark gap-2 flex-wrap">
                <div className="d-flex gap-2 flex-wrap align-items-center">
                  <Form.Select size="sm" value={selectedRouteId ?? ''} onChange={event => setSelectedRouteId(event.target.value)} style={{ width: 180 }}>
                    <option value="">Current selection</option>
                    {routePlans.map(routePlan => <option key={routePlan.id} value={routePlan.id}>{routePlan.name}</option>)}
                  </Form.Select>
                  <Form.Select size="sm" value={quickReassignDriverId} onChange={event => setQuickReassignDriverId(event.target.value)} style={{ width: 220 }}>
                    <option value="">Reassign to active driver</option>
                    {activeDrivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
                  </Form.Select>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handleQuickReassignSelectedTrips}>Reassign</Button>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handleSendConfirmationSms}>Confirm SMS</Button>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handlePrintRoute}>Print Route</Button>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handleShareRouteWhatsapp}>WhatsApp</Button>
                </div>
                <Form.Control size="sm" value={routeSearch} onChange={event => setRouteSearch(event.target.value)} placeholder="Search" style={{ width: 180 }} />
              </div>
              <div className="table-responsive" style={{ minHeight: 360, maxHeight: 360 }}>
                <Table className="align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 48 }} />
                      <th>Driver</th>
                      <th>Type</th>
                      <th>PU</th>
                      <th>DO</th>
                      <th>Rider</th>
                      <th>Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeTrips.length > 0 ? routeTrips.map(trip => <tr key={trip.id} className={selectedTripIds.includes(trip.id) ? 'table-success' : ''}>
                        <td>
                          <div className="d-flex align-items-center gap-1">
                            <Form.Check checked={selectedTripIds.includes(trip.id)} onChange={() => handleTripSelectionToggle(trip.id)} />
                            <Badge bg={trip.status === 'Assigned' ? 'primary' : 'secondary'}>{trip.status === 'Assigned' ? 'A' : 'U'}</Badge>
                          </div>
                        </td>
                        <td className="fw-semibold">{getDriverName(trip.driverId)}</td>
                        <td>{getTripTypeLabel(trip)}</td>
                        <td>{trip.pickup}</td>
                        <td>{trip.dropoff}</td>
                        <td>{trip.rider}</td>
                        <td>{trip.patientPhoneNumber || '-'}</td>
                      </tr>) : <tr>
                        <td colSpan={6} className="text-center text-muted py-4">Selecciona una ruta, un chofer o trips para ver el menu de ruta.</td>
                      </tr>}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>;
};

export default DispatcherWorkspace;