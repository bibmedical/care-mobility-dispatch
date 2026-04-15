const DEFAULT_PRINT_TEMPLATE = 'ride-id-office';

export const PRINT_TEMPLATE_OPTIONS = [{
  id: 'ride-id-office',
  label: 'Ride ID Office',
  description: 'Ride ID reconocido, horarios, millas, rider, telefono y direcciones.'
}, {
  id: 'ride-id-compact',
  label: 'Ride ID Compact',
  description: 'Ride ID reconocido, PU, DO, millas y rider en un formato mas corto.'
}, {
  id: 'ride-id-manifest',
  label: 'Ride ID Manifest',
  description: 'Ride ID reconocido con type, telefono y direcciones completas para oficina.'
}];

const PRINT_TEMPLATE_LOOKUP = new Map(PRINT_TEMPLATE_OPTIONS.map(option => [option.id, option]));

const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export const normalizePrintTemplate = value => {
  const normalized = String(value ?? DEFAULT_PRINT_TEMPLATE).trim().toLowerCase();
  return PRINT_TEMPLATE_LOOKUP.has(normalized) ? normalized : DEFAULT_PRINT_TEMPLATE;
};

export const normalizePrintSetup = value => ({
  template: normalizePrintTemplate(value?.template)
});

export const formatPrintGeneratedAt = value => {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear());
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day}/${year}, ${hours}:${minutes}`;
};

export const getTripRideIdDisplay = trip => {
  const rideId = String(trip?.rideId || '').trim();
  if (rideId) return rideId;
  const brokerTripId = String(trip?.brokerTripId || '').trim();
  if (brokerTripId) return brokerTripId;
  const tripId = String(trip?.id || '').trim();
  if (!tripId) return '';
  return tripId.split('-')[0] || tripId;
};

export const getTripPhoneDisplay = trip => String(trip?.patientPhoneNumber || trip?.phone || trip?.mobile || trip?.riderPhone || '').trim() || '-';

const getMilesDisplay = trip => {
  const miles = Number(trip?.miles);
  return Number.isFinite(miles) && miles > 0 ? miles.toFixed(2) : '-';
};

const parseTripClockMinutes = value => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const match = text.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = String(match[3] ?? '').toLowerCase();
  if (suffix === 'pm' && hours < 12) hours += 12;
  if (suffix === 'am' && hours === 12) hours = 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const formatMinutesTo24Hour = minutes => {
  if (!Number.isFinite(minutes)) return '';
  const normalized = ((Math.round(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = String(Math.floor(normalized / 60)).padStart(2, '0');
  const mins = String(normalized % 60).padStart(2, '0');
  return `${hours}:${mins}`;
};

const getTripPrintTimeDisplay = (scheduledValue, fallbackValue) => {
  const text = String(scheduledValue || fallbackValue || '').trim();
  if (!text) return '-';
  const minutes = parseTripClockMinutes(text);
  if (minutes == null) return text;
  return formatMinutesTo24Hour(minutes);
};

const getPrintColumns = getTripTypeLabel => ({
  'ride-id-office': [{
    key: 'sequence',
    label: '#',
    render: (_, index) => String(index + 1)
  }, {
    key: 'rideId',
    label: 'Ride ID',
    render: trip => getTripRideIdDisplay(trip) || '-'
  }, {
    key: 'pickup',
    label: 'PU',
    render: trip => getTripPrintTimeDisplay(trip?.scheduledPickup, trip?.pickup)
  }, {
    key: 'dropoff',
    label: 'DO',
    render: trip => getTripPrintTimeDisplay(trip?.scheduledDropoff, trip?.dropoff)
  }, {
    key: 'rider',
    label: 'Rider',
    render: trip => trip?.rider || '-'
  }, {
    key: 'phone',
    label: 'Phone',
    render: trip => getTripPhoneDisplay(trip)
  }, {
    key: 'miles',
    label: 'Miles',
    render: trip => getMilesDisplay(trip)
  }, {
    key: 'address',
    label: 'PU Address',
    render: trip => trip?.address || '-'
  }, {
    key: 'destination',
    label: 'DO Address',
    render: trip => trip?.destination || '-'
  }],
  'ride-id-compact': [{
    key: 'sequence',
    label: '#',
    render: (_, index) => String(index + 1)
  }, {
    key: 'rideId',
    label: 'Ride ID',
    render: trip => getTripRideIdDisplay(trip) || '-'
  }, {
    key: 'pickup',
    label: 'PU',
    render: trip => getTripPrintTimeDisplay(trip?.scheduledPickup, trip?.pickup)
  }, {
    key: 'dropoff',
    label: 'DO',
    render: trip => getTripPrintTimeDisplay(trip?.scheduledDropoff, trip?.dropoff)
  }, {
    key: 'miles',
    label: 'Miles',
    render: trip => getMilesDisplay(trip)
  }, {
    key: 'rider',
    label: 'Rider',
    render: trip => trip?.rider || '-'
  }],
  'ride-id-manifest': [{
    key: 'sequence',
    label: '#',
    render: (_, index) => String(index + 1)
  }, {
    key: 'rideId',
    label: 'Ride ID',
    render: trip => getTripRideIdDisplay(trip) || '-'
  }, {
    key: 'type',
    label: 'Type',
    render: trip => getTripTypeLabel(trip)
  }, {
    key: 'pickup',
    label: 'PU',
    render: trip => getTripPrintTimeDisplay(trip?.scheduledPickup, trip?.pickup)
  }, {
    key: 'dropoff',
    label: 'DO',
    render: trip => getTripPrintTimeDisplay(trip?.scheduledDropoff, trip?.dropoff)
  }, {
    key: 'miles',
    label: 'Miles',
    render: trip => getMilesDisplay(trip)
  }, {
    key: 'rider',
    label: 'Rider',
    render: trip => trip?.rider || '-'
  }, {
    key: 'phone',
    label: 'Phone',
    render: trip => getTripPhoneDisplay(trip)
  }, {
    key: 'address',
    label: 'PU Address',
    render: trip => trip?.address || '-'
  }, {
    key: 'destination',
    label: 'DO Address',
    render: trip => trip?.destination || '-'
  }]
});

export const buildRoutePrintDocument = ({
  routeTitle,
  driverName,
  generatedAt,
  routeTrips,
  printSetup,
  getTripTypeLabel
}) => {
  const template = normalizePrintTemplate(printSetup?.template);
  const templateColumns = getPrintColumns(getTripTypeLabel)[template] || getPrintColumns(getTripTypeLabel)[DEFAULT_PRINT_TEMPLATE];
  const totalMiles = routeTrips.reduce((sum, trip) => {
    const miles = Number(trip?.miles);
    return Number.isFinite(miles) ? sum + miles : sum;
  }, 0);
  const headerMarkup = templateColumns.map(column => `<th>${escapeHtml(column.label)}</th>`).join('');
  const rowsMarkup = routeTrips.map((trip, index) => `<tr>${templateColumns.map(column => `<td>${escapeHtml(column.render(trip, index))}</td>`).join('')}</tr>`).join('');
  const templateLabel = PRINT_TEMPLATE_LOOKUP.get(template)?.label || 'Ride ID Office';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(routeTitle)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 18px; color: #111827; }
      h1 { margin: 0 0 8px; font-size: 24px; }
      table { width: 100%; border-collapse: collapse; table-layout: auto; }
      th, td { border: 1px solid #d1d5db; padding: 6px 7px; text-align: left; font-size: 11px; vertical-align: top; }
      th { background: #f3f4f6; white-space: nowrap; }
      td { word-break: break-word; }
      .meta { display: flex; gap: 16px; margin-bottom: 14px; font-size: 12px; flex-wrap: wrap; }
      .meta strong { color: #111827; }
      .template { color: #4b5563; font-size: 12px; margin-bottom: 12px; }
      @media print {
        body { margin: 10px; }
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(routeTitle)}</h1>
    <div class="template"><strong>Template:</strong> ${escapeHtml(templateLabel)}</div>
    <div class="meta">
      <div><strong>Driver:</strong> ${escapeHtml(driverName || 'No driver selected')}</div>
      <div><strong>Generado:</strong> ${escapeHtml(generatedAt)}</div>
      <div><strong>Total trips:</strong> ${routeTrips.length}</div>
      <div><strong>Total millas:</strong> ${escapeHtml(totalMiles > 0 ? totalMiles.toFixed(2) : '-')}</div>
    </div>
    <table>
      <thead>
        <tr>${headerMarkup}</tr>
      </thead>
      <tbody>${rowsMarkup}</tbody>
    </table>
  </body>
</html>`;
};

export const buildEarlyMorningRideReportDocument = ({
  reportTitle,
  selectedDate,
  generatedAt,
  trips
}) => {
  const totalMiles = trips.reduce((sum, trip) => {
    const miles = Number(trip?.miles);
    return Number.isFinite(miles) ? sum + miles : sum;
  }, 0);
  const rowsMarkup = trips.map((trip, index) => `<tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(getTripRideIdDisplay(trip) || '-')}</td>
      <td>${escapeHtml(String(trip?.id || '').trim() || '-')}</td>
      <td>${escapeHtml(getTripPrintTimeDisplay(trip?.scheduledPickup, trip?.pickup))}</td>
      <td>${escapeHtml(getTripPrintTimeDisplay(trip?.scheduledDropoff, trip?.dropoff))}</td>
      <td>${escapeHtml(trip?.rider || '-')}</td>
      <td>${escapeHtml(getTripPhoneDisplay(trip))}</td>
      <td>${escapeHtml(Number.isFinite(Number(trip?.miles)) ? Number(trip.miles).toFixed(2) : '-')}</td>
      <td>${escapeHtml(trip?.address || '-')}</td>
      <td>${escapeHtml(trip?.destination || '-')}</td>
    </tr>`).join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(reportTitle)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 18px; color: #111827; }
      h1 { margin: 0 0 8px; font-size: 24px; }
      table { width: 100%; border-collapse: collapse; table-layout: auto; }
      th, td { border: 1px solid #d1d5db; padding: 6px 7px; text-align: left; font-size: 11px; vertical-align: top; }
      th { background: #f3f4f6; white-space: nowrap; }
      td { word-break: break-word; }
      .meta { display: flex; gap: 16px; margin-bottom: 14px; font-size: 12px; flex-wrap: wrap; }
      .meta strong { color: #111827; }
      @media print {
        body { margin: 10px; }
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(reportTitle)}</h1>
    <div class="meta">
      <div><strong>Date:</strong> ${escapeHtml(selectedDate || '-')}</div>
      <div><strong>Generado:</strong> ${escapeHtml(generatedAt)}</div>
      <div><strong>Total trips:</strong> ${trips.length}</div>
      <div><strong>Total miles:</strong> ${escapeHtml(totalMiles > 0 ? totalMiles.toFixed(2) : '-')}</div>
      <div><strong>Filter:</strong> Ride ID starts with 4, PU from 2:00 AM to 8:00 AM</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Ride ID</th>
          <th>Trip ID</th>
          <th>PU</th>
          <th>DO</th>
          <th>Paciente</th>
          <th>Telefono</th>
          <th>Miles</th>
          <th>PU Address</th>
          <th>DO Address</th>
        </tr>
      </thead>
      <tbody>${rowsMarkup}</tbody>
    </table>
  </body>
</html>`;
};