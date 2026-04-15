const DEFAULT_PRINT_TEMPLATE = 'ride-id-office';
export const DEFAULT_ROUTE_PRINT_COLUMNS = ['sequence', 'rideId', 'pickup', 'dropoff', 'rider', 'phone', 'miles', 'address', 'destination'];

export const PRINT_COLUMN_OPTIONS = [{
  key: 'sequence',
  label: '#'
}, {
  key: 'rideId',
  label: 'Ride ID'
}, {
  key: 'tripId',
  label: 'Trip ID'
}, {
  key: 'type',
  label: 'Type'
}, {
  key: 'pickup',
  label: 'PU'
}, {
  key: 'dropoff',
  label: 'DO'
}, {
  key: 'rider',
  label: 'Rider'
}, {
  key: 'phone',
  label: 'Phone'
}, {
  key: 'miles',
  label: 'Miles'
}, {
  key: 'address',
  label: 'PU Address'
}, {
  key: 'destination',
  label: 'DO Address'
}];

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

const PRINT_COLUMN_KEY_LOOKUP = new Set(PRINT_COLUMN_OPTIONS.map(option => option.key));

export const normalizeRoutePrintColumns = value => {
  const normalized = Array.from(new Set((Array.isArray(value) ? value : []).map(item => String(item || '').trim()).filter(item => PRINT_COLUMN_KEY_LOOKUP.has(item))));
  return normalized.length > 0 ? normalized : [...DEFAULT_ROUTE_PRINT_COLUMNS];
};

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

const parseSpreadsheetTimeMinutes = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const fractionalDay = numeric - Math.floor(numeric);
  const totalMinutes = Math.round(fractionalDay * 24 * 60);
  if (!Number.isFinite(totalMinutes)) return null;
  return ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
};

const looksLikeExcelSerialTime = value => /^\d{4,6}(?:\.\d+)?$/.test(String(value || '').trim());

const getTripPrintTimeDisplay = (scheduledValue, fallbackValue) => {
  const scheduledText = String(scheduledValue || '').trim();
  const fallbackText = String(fallbackValue || '').trim();
  if (!scheduledText && !fallbackText) return '-';

  const scheduledClockMinutes = parseTripClockMinutes(scheduledText);
  if (scheduledClockMinutes != null) return formatMinutesTo24Hour(scheduledClockMinutes);

  const fallbackClockMinutes = parseTripClockMinutes(fallbackText);
  if (fallbackClockMinutes != null) return formatMinutesTo24Hour(fallbackClockMinutes);

  const scheduledSpreadsheetMinutes = looksLikeExcelSerialTime(scheduledText)
    ? parseSpreadsheetTimeMinutes(scheduledText)
    : null;
  if (scheduledSpreadsheetMinutes != null && (scheduledText.includes('.') || !fallbackText || String(fallbackText).trim().toLowerCase() === 'tbd')) {
    return formatMinutesTo24Hour(scheduledSpreadsheetMinutes);
  }

  const fallbackSpreadsheetMinutes = looksLikeExcelSerialTime(fallbackText)
    ? parseSpreadsheetTimeMinutes(fallbackText)
    : null;
  if (fallbackSpreadsheetMinutes != null) return formatMinutesTo24Hour(fallbackSpreadsheetMinutes);

  if (scheduledSpreadsheetMinutes != null) return formatMinutesTo24Hour(scheduledSpreadsheetMinutes);
  if (fallbackText.toLowerCase() === 'tbd' || scheduledText.toLowerCase() === 'tbd') return 'TBD';
  return scheduledText || fallbackText;
};

const getAllPrintColumnDefinitions = getTripTypeLabel => ({
  sequence: {
    key: 'sequence',
    label: '#',
    render: (_, index) => String(index + 1)
  },
  rideId: {
    key: 'rideId',
    label: 'Ride ID',
    render: trip => getTripRideIdDisplay(trip) || '-'
  },
  tripId: {
    key: 'tripId',
    label: 'Trip ID',
    render: trip => String(trip?.id || '').trim() || '-'
  },
  type: {
    key: 'type',
    label: 'Type',
    render: trip => getTripTypeLabel(trip)
  },
  pickup: {
    key: 'pickup',
    label: 'PU',
    render: trip => getTripPrintTimeDisplay(trip?.scheduledPickup, trip?.pickup)
  },
  dropoff: {
    key: 'dropoff',
    label: 'DO',
    render: trip => getTripPrintTimeDisplay(trip?.scheduledDropoff, trip?.dropoff)
  },
  rider: {
    key: 'rider',
    label: 'Rider',
    render: trip => trip?.rider || '-'
  },
  phone: {
    key: 'phone',
    label: 'Phone',
    render: trip => getTripPhoneDisplay(trip)
  },
  miles: {
    key: 'miles',
    label: 'Miles',
    render: trip => getMilesDisplay(trip)
  },
  address: {
    key: 'address',
    label: 'PU Address',
    render: trip => trip?.address || '-'
  },
  destination: {
    key: 'destination',
    label: 'DO Address',
    render: trip => trip?.destination || '-'
  }
});

const PRINT_TEMPLATE_COLUMN_KEYS = {
  'ride-id-office': ['sequence', 'rideId', 'pickup', 'dropoff', 'rider', 'phone', 'miles', 'address', 'destination'],
  'ride-id-compact': ['sequence', 'rideId', 'pickup', 'dropoff', 'miles', 'rider'],
  'ride-id-manifest': ['sequence', 'rideId', 'type', 'pickup', 'dropoff', 'miles', 'rider', 'phone', 'address', 'destination']
};

const resolvePrintColumns = ({ getTripTypeLabel, template, selectedColumns }) => {
  const allColumns = getAllPrintColumnDefinitions(getTripTypeLabel);
  const requestedColumnKeys = Array.isArray(selectedColumns) && selectedColumns.length > 0
    ? normalizeRoutePrintColumns(selectedColumns)
    : (PRINT_TEMPLATE_COLUMN_KEYS[template] || PRINT_TEMPLATE_COLUMN_KEYS[DEFAULT_PRINT_TEMPLATE]);

  return requestedColumnKeys.map(columnKey => allColumns[columnKey]).filter(Boolean);
};

const getPrintColumnClassName = key => {
  switch (String(key || '').trim()) {
    case 'sequence':
      return 'col-sequence';
    case 'rideId':
      return 'col-ride-id';
    case 'pickup':
      return 'col-pickup-time';
    case 'dropoff':
      return 'col-dropoff-time';
    case 'type':
      return 'col-type';
    case 'phone':
      return 'col-phone';
    case 'miles':
      return 'col-miles';
    case 'rider':
      return 'col-rider';
    case 'address':
      return 'col-pickup-address';
    case 'destination':
      return 'col-dropoff-address';
    default:
      return '';
  }
};

export const buildRoutePrintDocument = ({
  routeTitle,
  driverName,
  generatedAt,
  routeTrips,
  printSetup,
  printColumns,
  getTripTypeLabel
}) => {
  const template = normalizePrintTemplate(printSetup?.template);
  const templateColumns = resolvePrintColumns({
    getTripTypeLabel,
    template,
    selectedColumns: printColumns
  });
  const totalMiles = routeTrips.reduce((sum, trip) => {
    const miles = Number(trip?.miles);
    return Number.isFinite(miles) ? sum + miles : sum;
  }, 0);
  const headerMarkup = templateColumns.map(column => {
    const className = getPrintColumnClassName(column.key);
    return `<th class="${escapeHtml(className)}">${escapeHtml(column.label)}</th>`;
  }).join('');
  const rowsMarkup = routeTrips.map((trip, index) => `<tr>${templateColumns.map(column => {
    const className = getPrintColumnClassName(column.key);
    return `<td class="${escapeHtml(className)}">${escapeHtml(column.render(trip, index))}</td>`;
  }).join('')}</tr>`).join('');
  const isCustomColumnSelection = Array.isArray(printColumns) && printColumns.length > 0;
  const templateLabel = isCustomColumnSelection
    ? `Custom columns (${templateColumns.length})`
    : (PRINT_TEMPLATE_LOOKUP.get(template)?.label || 'Ride ID Office');

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
      td { word-break: break-word; overflow-wrap: anywhere; }
      th.col-sequence, td.col-sequence { width: 28px; min-width: 28px; text-align: center; white-space: nowrap; }
      th.col-ride-id, td.col-ride-id { min-width: 74px; white-space: nowrap; word-break: keep-all; overflow-wrap: normal; }
      th.col-pickup-time, td.col-pickup-time, th.col-dropoff-time, td.col-dropoff-time { min-width: 78px; white-space: nowrap; word-break: keep-all; overflow-wrap: normal; }
      th.col-phone, td.col-phone { min-width: 74px; white-space: nowrap; word-break: keep-all; overflow-wrap: normal; }
      th.col-miles, td.col-miles { min-width: 48px; white-space: nowrap; word-break: keep-all; overflow-wrap: normal; }
      th.col-type, td.col-type { min-width: 52px; white-space: nowrap; }
      th.col-rider, td.col-rider { min-width: 92px; }
      th.col-pickup-address, td.col-pickup-address, th.col-dropoff-address, td.col-dropoff-address { min-width: 210px; }
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
      <td class="col-sequence">${index + 1}</td>
      <td class="col-ride-id">${escapeHtml(getTripRideIdDisplay(trip) || '-')}</td>
      <td class="col-ride-id">${escapeHtml(String(trip?.id || '').trim() || '-')}</td>
      <td class="col-pickup-time">${escapeHtml(getTripPrintTimeDisplay(trip?.scheduledPickup, trip?.pickup))}</td>
      <td class="col-dropoff-time">${escapeHtml(getTripPrintTimeDisplay(trip?.scheduledDropoff, trip?.dropoff))}</td>
      <td class="col-rider">${escapeHtml(trip?.rider || '-')}</td>
      <td class="col-phone">${escapeHtml(getTripPhoneDisplay(trip))}</td>
      <td class="col-miles">${escapeHtml(Number.isFinite(Number(trip?.miles)) ? Number(trip.miles).toFixed(2) : '-')}</td>
      <td class="col-pickup-address">${escapeHtml(trip?.address || '-')}</td>
      <td class="col-dropoff-address">${escapeHtml(trip?.destination || '-')}</td>
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
      td { word-break: break-word; overflow-wrap: anywhere; }
      th.col-sequence, td.col-sequence { width: 28px; min-width: 28px; text-align: center; white-space: nowrap; }
      th.col-ride-id, td.col-ride-id { min-width: 74px; white-space: nowrap; word-break: keep-all; overflow-wrap: normal; }
      th.col-pickup-time, td.col-pickup-time, th.col-dropoff-time, td.col-dropoff-time { min-width: 78px; white-space: nowrap; word-break: keep-all; overflow-wrap: normal; }
      th.col-phone, td.col-phone { min-width: 74px; white-space: nowrap; word-break: keep-all; overflow-wrap: normal; }
      th.col-miles, td.col-miles { min-width: 48px; white-space: nowrap; word-break: keep-all; overflow-wrap: normal; }
      th.col-rider, td.col-rider { min-width: 92px; }
      th.col-pickup-address, td.col-pickup-address, th.col-dropoff-address, td.col-dropoff-address { min-width: 210px; }
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