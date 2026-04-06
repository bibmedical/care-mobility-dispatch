'use client';

import PageTitle from '@/components/PageTitle';
import { useNemtContext } from '@/context/useNemtContext';
import { getTripLateMinutes, getTripPunctualityLabel, getTripServiceDateKey } from '@/helpers/nemt-dispatch-state';
import { useRouter } from 'next/navigation';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, Col, Form, Row, Table } from 'react-bootstrap';
import * as XLSX from 'xlsx';

const COLUMN_ALIASES = {
  id: ['rideid', 'trip id', 'tripid', 'id', 'trip'],
  brokerTripId: ['tripid'],
  rider: ['rider', 'member', 'passenger', 'patient', 'name'],
  pickup: ['pickup', 'pu', 'pickup time', 'appointment time'],
  dropoff: ['dropoff', 'do', 'drop off', 'return time'],
  address: ['address', 'pickup address', 'pu address', 'origin address', 'pickup location'],
  destination: ['destination', 'dropoff address', 'do address', 'destination address', 'dropoff location'],
  lat: ['lat', 'latitude', 'pickup lat'],
  lng: ['lng', 'lon', 'long', 'longitude', 'pickup lng'],
  fromAddress: ['fromaddress'],
  toAddress: ['toaddress'],
  fromZipcode: ['fromzipcode'],
  toZipcode: ['tozipcode'],
  pickupTime: ['pickuptime'],
  appointmentTime: ['appointmenttime'],
  fromLatitude: ['fromlatitude'],
  fromLongitude: ['fromlongitude'],
  toLatitude: ['tolatitude'],
  toLongitude: ['tologitude', 'tolongitude'],
  patientFirstName: ['patientfirstname'],
  patientLastName: ['patientlastname'],
  patientPhoneNumber: ['patientphonenumber'],
  assistanceNeeds: ['assistanceneeds'],
  status: ['status'],
  confirmationStatus: ['confirmationstatus'],
  vehicleType: ['requestedvehicletype', 'vehicletype'],
  miles: ['distance'],
  notes: ['additionalnotes', 'otherdetails'],
  tripType: ['triptype'],
  driverName: ['drivername'],
  onTimeStatus: ['ontimestatus', 'on time status', 'punctuality', 'punctuality status'],
  delay: ['delay', 'delayminutes', 'delay minutes', 'late', 'late minutes', 'lateminutes'],
  avgDelay: ['avgdelay', 'average delay', 'average delay minutes'],
  lateMinutes: ['lateminutes', 'late minutes', 'minutes late'],
  scheduledPickup: ['scheduledpickup', 'scheduled pickup', 'scheduled pu'],
  actualPickup: ['actualpickup', 'actual pickup', 'actual pu'],
  scheduledDropoff: ['scheduleddropoff', 'scheduled dropoff', 'scheduled do'],
  actualDropoff: ['actualdropoff', 'actual dropoff', 'actual do'],
  lateFlag: ['lateflag', 'islate', 'late flag'],
  delayedFlag: ['delayed', 'delay flag', 'isdelayed']
};

const DEFAULT_CENTER = [28.5383, -81.3792];

const toRadians = value => value * (Math.PI / 180);

const getDistanceMiles = (from, to) => {
  if (!Array.isArray(from) || !Array.isArray(to) || from.length !== 2 || to.length !== 2) return '';
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(to[0] - from[0]);
  const dLon = toRadians(to[1] - from[1]);
  const lat1 = toRadians(from[0]);
  const lat2 = toRadians(to[0]);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const miles = earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number.isFinite(miles) ? miles.toFixed(1) : '';
};

const getParsedDate = value => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 1) {
    const parsedDate = XLSX.SSF.parse_date_code(numericValue);
    if (parsedDate) {
      return new Date(parsedDate.y, parsedDate.m - 1, parsedDate.d, parsedDate.H, parsedDate.M, Math.round(parsedDate.S || 0));
    }
  }

  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  const parsedDate = new Date(normalized);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const normalizeHeader = value => String(value ?? '').trim().toLowerCase();

const getValueByAliases = (row, aliases) => {
  const entries = Object.entries(row ?? {});
  for (const alias of aliases) {
    const match = entries.find(([key]) => normalizeHeader(key) === alias);
    if (match && String(match[1] ?? '').trim()) {
      return String(match[1]).trim();
    }
  }
  return '';
};

const getCoordinate = (row, key, index) => {
  const aliases = key === 'lat' ? [...COLUMN_ALIASES.fromLatitude, ...COLUMN_ALIASES.lat] : [...COLUMN_ALIASES.fromLongitude, ...COLUMN_ALIASES.lng];
  const rawValue = getValueByAliases(row, aliases);
  const parsed = Number(rawValue);
  if (Number.isFinite(parsed)) return parsed;
  const offset = (index % 10) * 0.01;
  return key === 'lat' ? DEFAULT_CENTER[0] + offset : DEFAULT_CENTER[1] - offset;
};

const getDestinationCoordinate = (row, key, index) => {
  const aliases = key === 'lat' ? COLUMN_ALIASES.toLatitude : COLUMN_ALIASES.toLongitude;
  const rawValue = getValueByAliases(row, aliases);
  const parsed = Number(rawValue);
  if (Number.isFinite(parsed)) return parsed;
  const fallback = getCoordinate(row, key, index);
  return key === 'lat' ? fallback + 0.01 : fallback + 0.01;
};

const getRiderName = (row, index) => {
  const firstName = getValueByAliases(row, COLUMN_ALIASES.patientFirstName);
  const lastName = getValueByAliases(row, COLUMN_ALIASES.patientLastName);
  const combinedName = `${firstName} ${lastName}`.trim();
  return combinedName || getValueByAliases(row, COLUMN_ALIASES.rider) || `Rider ${index + 1}`;
};

const formatSafeRideTime = value => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return 'TBD';
  const date = getParsedDate(value);
  if (!date) return normalized;
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getTimeValue = value => {
  const date = getParsedDate(value);
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
};

const buildImportedTripId = ({
  rideId,
  tripId,
  rawPickupTime,
  rawDropoffTime,
  address,
  destination,
  rider
}, index) => {
  const stableId = String(rideId || '').trim() || [tripId, rawPickupTime, rawDropoffTime, address, destination, rider].map(value => String(value || '').trim()).filter(Boolean).join('|');
  return stableId || `trip-row-${index + 1}`;
};

const annotateSafeRideTrips = trips => {
  const groupedTrips = trips.reduce((accumulator, trip) => {
    const groupKey = trip.brokerTripId || trip.id;
    accumulator.set(groupKey, [...(accumulator.get(groupKey) ?? []), trip]);
    return accumulator;
  }, new Map());

  return Array.from(groupedTrips.entries()).flatMap(([groupKey, groupTrips]) => {
    const sortedTrips = [...groupTrips].sort((leftTrip, rightTrip) => leftTrip.pickupSortValue - rightTrip.pickupSortValue || leftTrip.id.localeCompare(rightTrip.id));

    if (sortedTrips.length === 1) {
      return sortedTrips.map(trip => ({
        ...trip,
        groupedTripKey: groupKey,
        legLabel: trip.tripType?.toLowerCase() === 'one way' ? 'One Way' : 'Single Ride',
        legVariant: 'secondary'
      }));
    }

    return sortedTrips.map((trip, index) => ({
      ...trip,
      groupedTripKey: groupKey,
      legLabel: index === 0 ? 'Outbound' : index === 1 ? 'Return' : `Leg ${index + 1}`,
      legVariant: index === 0 ? 'success' : index === 1 ? 'warning' : 'info'
    }));
  });
};

const mapRowToTrip = (row, index) => {
  const rawPickupTime = getValueByAliases(row, COLUMN_ALIASES.pickupTime) || getValueByAliases(row, COLUMN_ALIASES.pickup);
  const rawDropoffTime = getValueByAliases(row, COLUMN_ALIASES.appointmentTime) || getValueByAliases(row, COLUMN_ALIASES.dropoff);
  const rider = getRiderName(row, index);
  const pickup = formatSafeRideTime(rawPickupTime);
  const dropoff = formatSafeRideTime(rawDropoffTime);
  const address = getValueByAliases(row, COLUMN_ALIASES.fromAddress) || getValueByAliases(row, COLUMN_ALIASES.address) || 'Address pending';
  const destination = getValueByAliases(row, COLUMN_ALIASES.toAddress) || getValueByAliases(row, COLUMN_ALIASES.destination) || '';
  const rideId = getValueByAliases(row, COLUMN_ALIASES.id) || `RIDE-${Date.now()}-${index + 1}`;
  const tripId = getValueByAliases(row, COLUMN_ALIASES.brokerTripId);
  const status = getValueByAliases(row, COLUMN_ALIASES.status) || 'Scheduled';
  const confirmationStatus = getValueByAliases(row, COLUMN_ALIASES.confirmationStatus) || 'confirmed';
  const position = [getCoordinate(row, 'lat', index), getCoordinate(row, 'lng', index)];
  const destinationPosition = [getDestinationCoordinate(row, 'lat', index), getDestinationCoordinate(row, 'lng', index)];
  const providedMiles = getValueByAliases(row, COLUMN_ALIASES.miles);
  const scheduledPickup = getValueByAliases(row, COLUMN_ALIASES.scheduledPickup) || rawPickupTime;
  const actualPickup = getValueByAliases(row, COLUMN_ALIASES.actualPickup);
  const scheduledDropoff = getValueByAliases(row, COLUMN_ALIASES.scheduledDropoff) || rawDropoffTime;
  const actualDropoff = getValueByAliases(row, COLUMN_ALIASES.actualDropoff);
  const importedDelay = getValueByAliases(row, COLUMN_ALIASES.delay) || getValueByAliases(row, COLUMN_ALIASES.lateMinutes);
  const avgDelay = getValueByAliases(row, COLUMN_ALIASES.avgDelay);

  const tripDraft = {
    scheduledPickup,
    actualPickup,
    scheduledDropoff,
    actualDropoff,
    delay: importedDelay,
    avgDelay,
    onTimeStatus: getValueByAliases(row, COLUMN_ALIASES.onTimeStatus),
    late: getValueByAliases(row, COLUMN_ALIASES.lateFlag),
    delayed: getValueByAliases(row, COLUMN_ALIASES.delayedFlag)
  };
  const lateMinutes = getTripLateMinutes(tripDraft);
  const onTimeStatus = tripDraft.onTimeStatus || getTripPunctualityLabel({
    ...tripDraft,
    lateMinutes
  });
  const uniqueTripId = buildImportedTripId({
    rideId,
    tripId,
    rawPickupTime,
    rawDropoffTime,
    address,
    destination,
    rider
  }, index);

  return {
    id: uniqueTripId,
    rideId,
    brokerTripId: tripId,
    rider,
    pickup,
    dropoff,
    address,
    destination,
    fromZipcode: getValueByAliases(row, COLUMN_ALIASES.fromZipcode),
    toZipcode: getValueByAliases(row, COLUMN_ALIASES.toZipcode),
    patientPhoneNumber: getValueByAliases(row, COLUMN_ALIASES.patientPhoneNumber),
    assistanceNeeds: getValueByAliases(row, COLUMN_ALIASES.assistanceNeeds),
    notes: getValueByAliases(row, COLUMN_ALIASES.notes),
    vehicleType: getValueByAliases(row, COLUMN_ALIASES.vehicleType),
    tripType: getValueByAliases(row, COLUMN_ALIASES.tripType),
    miles: providedMiles || getDistanceMiles(position, destinationPosition),
    safeRideStatus: status,
    confirmationStatus,
    source: 'SafeRide',
    status: 'Unassigned',
    driverId: null,
    routeId: null,
    importedDriverName: getValueByAliases(row, COLUMN_ALIASES.driverName),
    scheduledPickup,
    actualPickup,
    scheduledDropoff,
    actualDropoff,
    delay: importedDelay,
    avgDelay,
    lateMinutes,
    onTimeStatus,
    late: String(tripDraft.late || '').trim(),
    delayed: String(tripDraft.delayed || '').trim(),
    rawPickupTime,
    rawDropoffTime,
    pickupSortValue: getTimeValue(rawPickupTime),
    position,
    destinationPosition
  };
};

const TripImportWorkspace = () => {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const {
    trips,
    upsertImportedTrips,
    clearTripsByServiceDates,
    clearTrips
  } = useNemtContext();
  const [message, setMessage] = useState('Importa un Excel o CSV de SafeRide. El archivo actualiza solo los dias que contiene para evitar mezclar fechas y se guarda tambien en el servidor.');
  const [pendingTrips, setPendingTrips] = useState([]);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  const importedServiceDateKeys = useMemo(() => Array.from(new Set(pendingTrips.map(trip => getTripServiceDateKey(trip)).filter(Boolean))).sort(), [pendingTrips]);

  const stats = useMemo(() => [{
    label: 'Trips en sistema',
    value: String(trips.length)
  }, {
    label: 'Preview rows',
    value: String(pendingTrips.length)
  }, {
    label: 'Formato',
    value: selectedFileName ? selectedFileName.split('.').pop()?.toUpperCase() || 'N/A' : 'XLSX/CSV'
  }, {
    label: 'Modo',
    value: 'Replace matching days'
  }], [pendingTrips.length, selectedFileName, trips.length]);

  const handleDownloadTemplate = () => {
    const templateRows = [
      ['rideId', 'tripId', 'fromAddress', 'fromZipcode', 'toAddress', 'toZipcode', 'pickupTime', 'appointmentTime', 'scheduledPickup', 'actualPickup', 'scheduledDropoff', 'actualDropoff', 'delayMinutes', 'onTimeStatus', 'fromLatitude', 'fromLongitude', 'toLatitude', 'toLogitude', 'patientFirstName', 'patientLastName', 'patientPhoneNumber', 'requestedVehicleType', 'additionalNotes', 'status', 'confirmationStatus', 'tripType', 'driverName'],
      ['37418742', '20590287', '6037 Scotchwood Glen, Orlando, FL', '32822', '401 S Chickasaw Trail, Orlando, FL', '32825', '03/28/2026 10:33', '03/28/2026 11:00', '10:33 AM', '10:41 AM', '11:00 AM', '11:06 AM', '8', 'Late', '28.514180', '-81.302910', '28.538208', '-81.274046', 'KENNETH', 'PENA', '3213484257', 'AMB', 'Need assistance', 'Scheduled', 'confirmed', 'Multi Leg', 'Unassigned']
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(templateRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Trips');
    XLSX.writeFile(workbook, 'trip-import-template.xlsx');
    setMessage('Plantilla SafeRide descargada. Llena el archivo con el formato oficial y luego importalo.');
  };

  const handleClearTrips = () => {
    clearTrips();
    setPendingTrips([]);
    setSelectedFileName('');
    setMessage('Todos los viajes y rutas guardadas fueron eliminados.');
  };

  const handleFileChange = async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setSelectedFileName(file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, {
        type: 'array'
      });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        defval: ''
      });

      if (!Array.isArray(rows) || rows.length === 0) {
        setPendingTrips([]);
        setMessage('El archivo no tiene filas para importar.');
        return;
      }

      const importedTrips = annotateSafeRideTrips(rows.map(mapRowToTrip).filter(trip => trip.id && trip.rider && trip.address));
      setPendingTrips(importedTrips);
      const dayCount = Array.from(new Set(importedTrips.map(trip => getTripServiceDateKey(trip)).filter(Boolean))).length;
      setMessage(`${importedTrips.length} viajes SafeRide listos para importar. Se actualizaran ${dayCount} dia${dayCount === 1 ? '' : 's'} segun el archivo.`);
    } catch {
      setPendingTrips([]);
      setMessage('No se pudo leer el archivo. Usa Excel .xlsx, .xls o CSV con encabezados.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleImportTrips = () => {
    if (pendingTrips.length === 0) {
      setMessage('Primero selecciona un archivo valido.');
      return;
    }

    upsertImportedTrips(pendingTrips);
    setMessage(`${pendingTrips.length} viajes procesados y guardados. Solo se actualizaron los dias presentes en el archivo.`);
  };

  const handleClearImportedDays = () => {
    if (importedServiceDateKeys.length === 0) {
      setMessage('Primero carga un archivo para detectar los dias a borrar.');
      return;
    }

    const confirmationMessage = `Vas a borrar ${importedServiceDateKeys.length} dia${importedServiceDateKeys.length === 1 ? '' : 's'} (${importedServiceDateKeys.join(', ')}). Esta accion no se puede deshacer. Deseas continuar?`;
    if (!window.confirm(confirmationMessage)) {
      setMessage('Borrado cancelado.');
      return;
    }

    clearTripsByServiceDates(importedServiceDateKeys);
    setMessage(`Se borraron los viajes de ${importedServiceDateKeys.length} dia${importedServiceDateKeys.length === 1 ? '' : 's'}: ${importedServiceDateKeys.join(', ')}.`);
  };

  return <>
      <PageTitle title="Trip Import" subName="Excel Loader" />
      <Row className="g-3 mb-3">
        {stats.map(stat => <Col md={6} xl={3} key={stat.label}>
            <Card className="h-100">
              <CardBody>
                <p className="text-muted mb-2">{stat.label}</p>
                <h4 className="mb-0">{stat.value}</h4>
              </CardBody>
            </Card>
          </Col>)}
      </Row>

      <Row className="g-3">
        <Col xl={5}>
          <Card className="h-100">
            <CardBody>
              <h5 className="mb-2">Importar plantilla oficial de SafeRide</h5>
              <p className="text-muted mb-3">Este modulo actualiza solo los dias presentes en el archivo para evitar mezclar viajes de fechas distintas. Ya esta adaptado al formato oficial de SafeRide con columnas como rideId, tripId, fromAddress, toAddress, pickupTime y patientFirstName. Si tu archivo trae puntualidad, tambien guarda scheduledPickup, actualPickup, delayMinutes y onTimeStatus.</p>
              <Alert variant="info" className="small">Formato oficial detectado: rideId, tripId, fromAddress, fromZipcode, toAddress, toZipcode, pickupTime, appointmentTime, fromLatitude, fromLongitude, patientFirstName, patientLastName y columnas relacionadas. Opcionalmente puedes incluir scheduledPickup, actualPickup, scheduledDropoff, actualDropoff, delayMinutes y onTimeStatus.</Alert>
              <div className="d-flex flex-wrap gap-2 mb-3">
                <Button variant="success" onClick={() => fileInputRef.current?.click()} disabled={isParsing}>{isParsing ? 'Leyendo archivo...' : 'Seleccionar Excel o CSV'}</Button>
                <Button variant="outline-primary" onClick={handleDownloadTemplate}>Descargar plantilla</Button>
                <Button variant="outline-warning" onClick={handleClearImportedDays} disabled={importedServiceDateKeys.length === 0}>Borrar dias del archivo</Button>
                <Button variant="outline-danger" onClick={handleClearTrips}>Borrar viajes actuales</Button>
              </div>
              <Form.Control ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} style={{ display: 'none' }} />
              <div className="small text-muted mb-3">{selectedFileName ? `Archivo seleccionado: ${selectedFileName}` : 'No hay archivo seleccionado.'}</div>
              <div className="small text-muted mb-2">{importedServiceDateKeys.length > 0 ? `Dias detectados en archivo: ${importedServiceDateKeys.join(', ')}` : 'Dias detectados en archivo: -'}</div>
              <div className="small text-muted mb-3">{message}</div>
              {pendingTrips.length > 0 ? <Alert variant="success" className="d-flex flex-wrap align-items-center justify-content-between gap-3">
                  <div>
                    <div className="fw-semibold">Archivo listo para importar</div>
                    <div className="small mb-0">Se encontraron {pendingTrips.length} viajes en preview. Presiona el boton verde para actualizar solamente los dias incluidos en este archivo.</div>
                  </div>
                  <Button variant="success" size="lg" onClick={handleImportTrips}>Importar {pendingTrips.length} viajes ahora</Button>
                </Alert> : null}
              <div className="d-flex flex-wrap gap-2">
                <Button variant="success" onClick={handleImportTrips} disabled={pendingTrips.length === 0}>Importar y actualizar dias</Button>
                <Button variant="outline-secondary" onClick={() => router.push('/dispatcher')}>Abrir Dispatcher</Button>
                <Button variant="outline-secondary" onClick={() => router.push('/trip-dashboard')}>Abrir Trip Dashboard</Button>
              </div>
            </CardBody>
          </Card>
        </Col>

        <Col xl={7}>
          <Card className="h-100">
            <CardBody className="p-0">
              <div className="d-flex justify-content-between align-items-center p-3 border-bottom bg-success text-dark">
                <strong>Preview de viajes importados</strong>
                <div className="d-flex align-items-center gap-2">
                  <Badge bg="light" text="dark">{pendingTrips.length}</Badge>
                  <Button variant="light" size="sm" onClick={handleImportTrips} disabled={pendingTrips.length === 0}>Importar</Button>
                </div>
              </div>
              <div className="table-responsive" style={{ maxHeight: 520 }}>
                <Table hover className="align-middle mb-0">
                  <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                    <tr>
                      <th>Ride ID</th>
                      <th>Trip ID</th>
                      <th>Leg</th>
                      <th>Rider</th>
                      <th>Status</th>
                      <th>Miles</th>
                      <th>Phone</th>
                      <th>PU</th>
                      <th>DO</th>
                      <th>PU Address</th>
                      <th>DO Address</th>
                      <th>Vehicle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingTrips.length > 0 ? pendingTrips.map(trip => <tr key={trip.id}>
                        <td className="fw-semibold">{trip.id}</td>
                        <td>{trip.brokerTripId || '-'}</td>
                        <td><Badge bg={trip.legVariant || 'secondary'}>{trip.legLabel || 'Ride'}</Badge></td>
                        <td>{trip.rider}</td>
                        <td><Badge bg="secondary">{trip.safeRideStatus || '-'}</Badge></td>
                        <td>{trip.miles || '-'}</td>
                        <td>{trip.patientPhoneNumber || '-'}</td>
                        <td>{trip.pickup}</td>
                        <td>{trip.dropoff}</td>
                        <td>{trip.address}</td>
                        <td>{trip.destination || '-'}</td>
                        <td>{trip.vehicleType || '-'}</td>
                      </tr>) : <tr>
                        <td colSpan={12} className="text-center text-muted py-5">Carga la plantilla oficial de SafeRide para ver el preview.</td>
                      </tr>}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </>;
};

export default TripImportWorkspace;