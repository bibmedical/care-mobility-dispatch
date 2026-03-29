import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { MENU_ITEMS } from '@/assets/data/menu-items';
import { options as authOptions } from '@/app/api/auth/[...nextauth]/options';
import { getTripLateMinutes as getSharedTripLateMinutes } from '@/helpers/nemt-dispatch-state';
import { readBlacklistState } from '@/server/blacklist-store';
import { readAssistantConversation, writeAssistantConversation } from '@/server/assistant-memory-store';
import { readNemtAdminPayload } from '@/server/nemt-admin-store';
import { readNemtDispatchState } from '@/server/nemt-dispatch-store';
import { readIntegrationsState } from '@/server/integrations-store';
import { readSystemUsersPayload } from '@/server/system-users-store';

const DEFAULT_MODEL = 'gpt-5.4-nano';

const stripRichText = value => String(value || '')
  .replace(/\*\*(.*?)\*\*/g, '$1')
  .replace(/__(.*?)__/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/^[\-*+]\s+/gm, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const normalizeLookupValue = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const getSessionFirstName = session => String(session?.user?.firstName || session?.user?.name || session?.user?.username || '').trim().split(/\s+/)[0] || 'jefe';

const buildPersonalizedLead = session => {
  const firstName = getSessionFirstName(session);
  return `Si ${firstName}, `;
};

const trySolveSimpleMathSafe = message => {
  const normalized = String(message || '')
    .toLowerCase()
    .replace(/,/g, '.')
    .replace(/cu[aá]nto es|cu[aá]l es|cuanto da|dime|resuelve/g, ' ')
    .replace(/m[aá]s/g, '+')
    .replace(/menos/g, '-')
    .replace(/por|x|multiplicado por/g, '*')
    .replace(/dividido entre|dividido por|entre/g, '/')
    .replace(/\bles\b|\bes\b|\bson\b/g, ' ')
    .replace(/\band\b/g, ' ')
    .replace(/\bwhat is\b/g, ' ')
    .replace(/\bplus\b/g, '+')
    .replace(/\bminus\b/g, '-')
    .replace(/\btimes\b/g, '*')
    .replace(/\bover\b/g, '/')
    .replace(/[^\d.+\-*/() ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const left = Number(match[1]);
  const operator = match[2];
  const right = Number(match[3]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;

  let result = null;
  if (operator === '+') result = left + right;
  if (operator === '-') result = left - right;
  if (operator === '*') result = left * right;
  if (operator === '/') result = right === 0 ? null : left / right;
  if (result === null || !Number.isFinite(result)) {
    return 'No puedo dividir entre cero.';
  }

  return `El resultado es ${Number.isInteger(result) ? result : result.toFixed(2)}.`;
};

const buildLocalLearnedFacts = history => {
  const facts = [];
  for (const item of Array.isArray(history) ? history : []) {
    if (item?.role !== 'user') continue;
    const text = String(item?.text || '').trim();
    if (!text) continue;

    const rememberMatch = text.match(/(?:recuerda|aprende|guarda)(?: que)?\s+(.+?)\s+(?:es|=)\s+(.+)/i);
    if (rememberMatch) {
      facts.push({
        subject: rememberMatch[1].trim(),
        value: rememberMatch[2].trim(),
        kind: 'general'
      });
    }

    const phoneMatch = text.match(/(?:telefono|tel[eé]fono|numero|n[uú]mero)\s+de\s+(.+?)\s+(?:es|=)\s+([+()\d\s-]+)/i);
    if (phoneMatch) {
      facts.push({
        subject: phoneMatch[1].trim(),
        value: phoneMatch[2].trim(),
        kind: 'phone'
      });
    }
  }
  return facts;
};

const buildConfiguredMemoryFacts = integrationsState => String(integrationsState?.ai?.memoryNotes || '')
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean)
  .map((line, index) => {
    const pair = line.match(/^([^:=\-]+?)\s*(?::|=|-)\s*(.+)$/);
    if (pair) {
      return {
        id: `cfg-${index}`,
        subject: pair[1].trim(),
        value: pair[2].trim(),
        kind: 'configured'
      };
    }
    return {
      id: `cfg-${index}`,
      subject: line,
      value: line,
      kind: 'configured'
    };
  });

const buildConfiguredSectionFacts = integrationsState => {
  const sections = integrationsState?.ai?.memorySections || {};
  return Object.entries(sections).flatMap(([sectionName, sectionValue]) => String(sectionValue || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const pair = line.match(/^([^:=\-]+?)\s*(?::|=|-)\s*(.+)$/);
      if (pair) {
        return {
          id: `cfg-${sectionName}-${index}`,
          subject: pair[1].trim(),
          value: pair[2].trim(),
          kind: sectionName
        };
      }
      return {
        id: `cfg-${sectionName}-${index}`,
        subject: sectionName,
        value: line,
        kind: sectionName
      };
    }));
};

const findLearnedFactReply = (message, history, integrationsState) => {
  const prompt = normalizeLookupValue(message);
  const facts = [...buildConfiguredSectionFacts(integrationsState), ...buildConfiguredMemoryFacts(integrationsState), ...buildLocalLearnedFacts(history)];
  if (facts.length === 0) return null;

  const wantedPhone = /telefono|tel[eé]fono|numero|n[uú]mero|phone|cell|cel/.test(prompt);
  const match = [...facts].reverse().find(fact => {
    const subject = normalizeLookupValue(fact.subject);
    if (!subject) return false;
    if (wantedPhone && fact.kind !== 'phone') return false;
    return prompt.includes(subject);
  });

  if (!match) return null;
  if (match.kind === 'phone') {
    return `El telefono guardado de ${match.subject} es ${match.value}.`;
  }
  if (match.kind === 'configured') {
    return `${match.subject}: ${match.value}.`;
  }
  return `Recuerdo esto sobre ${match.subject}: ${match.value}.`;
};

const buildLocalTripIndex = trips => (Array.isArray(trips) ? trips : []).slice(0, 2000).map(trip => ({
  id: String(trip?.id || '').trim(),
  rideId: String(trip?.rideId || trip?.riderId || trip?.memberId || trip?.tripId || trip?.tripNumber || '').trim(),
  brokerTripId: String(trip?.brokerTripId || '').trim(),
  rider: String(trip?.rider || trip?.patientName || trip?.passengerName || trip?.memberName || trip?.clientName || '').trim(),
  patientPhoneNumber: String(trip?.patientPhoneNumber || trip?.phone || trip?.mobile || '').trim(),
  status: String(trip?.status || '').trim(),
  driverId: String(trip?.driverId || '').trim(),
  onTimeStatus: String(trip?.onTimeStatus || '').trim(),
  lateMinutes: trip?.lateMinutes ?? '',
  delay: trip?.delay ?? '',
  avgDelay: trip?.avgDelay ?? '',
  late: trip?.late ?? '',
  delayed: trip?.delayed ?? '',
  scheduledPickup: String(trip?.scheduledPickup || '').trim(),
  scheduledDropoff: String(trip?.scheduledDropoff || '').trim(),
  actualPickup: String(trip?.actualPickup || '').trim(),
  actualDropoff: String(trip?.actualDropoff || '').trim(),
  pickup: String(trip?.pickup || '').trim(),
  dropoff: String(trip?.dropoff || '').trim(),
  address: String(trip?.address || '').trim(),
  destination: String(trip?.destination || '').trim(),
  notes: String(trip?.notes || '').trim()
}));

const tokenizeLookupValue = value => normalizeLookupValue(value).split(/\s+/).filter(word => word.length >= 2);

const getTripLateMinutes = trip => getSharedTripLateMinutes(trip);

const buildDriverDelayReply = snapshot => {
  const trips = Array.isArray(snapshot?.localTripIndex) ? snapshot.localTripIndex : [];
  const drivers = Array.isArray(snapshot?.sampleDrivers) ? snapshot.sampleDrivers : [];
  const delayedTrips = trips.map(trip => ({ ...trip, lateMinutes: getTripLateMinutes(trip) })).filter(trip => trip.lateMinutes != null && trip.lateMinutes > 0);
  if (delayedTrips.length === 0) {
    return 'No veo datos de llegadas tarde en los viajes cargados ahora mismo.';
  }

  const byDriver = new Map();
  delayedTrips.forEach(trip => {
    const key = trip.driverId || 'sin-chofer';
    const current = byDriver.get(key) || { count: 0, riders: [], totalLate: 0 };
    current.count += 1;
    current.totalLate += trip.lateMinutes;
    current.riders.push({ rider: trip.rider || 'Paciente sin nombre', lateMinutes: trip.lateMinutes });
    byDriver.set(key, current);
  });

  const summary = [...byDriver.entries()].sort((left, right) => right[1].count - left[1].count || right[1].totalLate - left[1].totalLate);
  const totalDriversLate = summary.length;
  const driverLines = summary.slice(0, 4).map(([driverId, data]) => {
    const driverName = drivers.find(driver => String(driver.id) === String(driverId))?.name || (driverId === 'sin-chofer' ? 'Sin chofer asignado' : driverId);
    const riderNames = data.riders.slice(0, 3).map(item => `${item.rider} (${Math.round(item.lateMinutes)} min tarde)`).join(', ');
    return `${driverName}: ${data.count} viajes tarde. Pacientes: ${riderNames}`;
  });

  return `${totalDriversLate} choferes tuvieron retrasos en su ruta. ${driverLines.join(' | ')}`;
};

const buildWorstDriverDelayReply = snapshot => {
  const trips = Array.isArray(snapshot?.localTripIndex) ? snapshot.localTripIndex : [];
  const drivers = Array.isArray(snapshot?.sampleDrivers) ? snapshot.sampleDrivers : [];
  const delayedTrips = trips.map(trip => ({ ...trip, lateMinutes: getTripLateMinutes(trip) })).filter(trip => trip.lateMinutes != null && trip.lateMinutes > 0);
  if (delayedTrips.length === 0) {
    return 'No veo datos de llegadas tarde en los viajes cargados ahora mismo.';
  }

  const byDriver = delayedTrips.reduce((accumulator, trip) => {
    const key = trip.driverId || 'sin-chofer';
    const current = accumulator.get(key) || { trips: 0, totalLate: 0, maxLate: 0 };
    current.trips += 1;
    current.totalLate += trip.lateMinutes;
    current.maxLate = Math.max(current.maxLate, trip.lateMinutes);
    accumulator.set(key, current);
    return accumulator;
  }, new Map());

  const [driverId, driverData] = [...byDriver.entries()].sort((left, right) => right[1].totalLate - left[1].totalLate || right[1].trips - left[1].trips || right[1].maxLate - left[1].maxLate)[0];
  const driverName = drivers.find(driver => String(driver.id) === String(driverId))?.name || (driverId === 'sin-chofer' ? 'Sin chofer asignado' : driverId);
  return `${driverName} tuvo mas retrasos hoy: ${Math.round(driverData.totalLate)} minutos acumulados en ${driverData.trips} viajes tarde.`;
};

const buildLatePatientsReply = snapshot => {
  const trips = Array.isArray(snapshot?.localTripIndex) ? snapshot.localTripIndex : [];
  const delayedTrips = trips.map(trip => ({ ...trip, lateMinutes: getTripLateMinutes(trip) })).filter(trip => trip.lateMinutes != null && trip.lateMinutes > 0);
  if (delayedTrips.length === 0) {
    return 'No veo pacientes con retraso en los viajes cargados ahora mismo.';
  }

  const patientLines = delayedTrips
    .sort((left, right) => right.lateMinutes - left.lateMinutes)
    .slice(0, 6)
    .map(trip => `${trip.rider || 'Paciente sin nombre'} (${Math.round(trip.lateMinutes)} min tarde${trip.rideId ? `, ride ${trip.rideId}` : ''})`);

  return `Pacientes que llegaron tarde hoy: ${patientLines.join(', ')}.`;
};

const findMatchingTrips = (message, snapshot) => {
  const prompt = normalizeLookupValue(message);
  const trips = Array.isArray(snapshot?.localTripIndex) ? snapshot.localTripIndex : [];
  if (trips.length === 0) return [];

  const explicitTripId = prompt.match(/(?:ride|trip|viaje|paciente)\s*(?:id|numero|#)?\s*([a-z0-9-]{3,})/i)?.[1] || '';
  const explicitLookup = normalizeLookupValue(explicitTripId);
  if (explicitLookup) {
    const exactMatches = trips.filter(trip => [trip.id, trip.rideId, trip.brokerTripId].some(value => normalizeLookupValue(value) === explicitLookup));
    if (exactMatches.length > 0) return exactMatches;
  }

  const meaningfulWords = prompt.split(/\s+/).filter(word => word.length >= 2 && !['de', 'del', 'con', 'para', 'que', 'por', 'una', 'uno', 'los', 'las', 'tel', 'telefono', 'numero', 'paciente', 'viaje', 'trip', 'ride', 'pickup', 'dropoff', 'status', 'estado', 'nota', 'notas', 'hay', 'cual', 'cuales', 'dime', 'busca', 'buscar'].includes(word));
  if (meaningfulWords.length === 0) return [];

  const scoredTrips = trips.map(trip => {
    const riderTokens = tokenizeLookupValue(trip.rider);
    const haystack = normalizeLookupValue([trip.rider, trip.address, trip.destination, trip.notes, trip.rideId, trip.brokerTripId].join(' '));
    let score = 0;
    meaningfulWords.forEach(word => {
      if (riderTokens.some(token => token.startsWith(word) || word.startsWith(token))) {
        score += 3;
      } else if (haystack.includes(word)) {
        score += 1;
      }
    });
    return {
      trip,
      score
    };
  }).filter(item => item.score > 0);

  return scoredTrips.sort((left, right) => right.score - left.score || String(left.trip.rider).localeCompare(String(right.trip.rider))).slice(0, 6).map(item => item.trip);
};

const findTripReply = (message, snapshot) => {
  const prompt = normalizeLookupValue(message);
  const matches = findMatchingTrips(message, snapshot);
  if (matches.length === 0) return null;

  const trip = matches[0];
  const sameRiderMatches = matches.filter(item => normalizeLookupValue(item.rider) === normalizeLookupValue(trip.rider));
  const wantsPhone = /telefono|tel[eé]fono|numero|n[uú]mero|phone|cell|cel/.test(prompt);
  const wantsStatus = /estado|status/.test(prompt);
  const wantsPickup = /pickup|recogida|buscar|pu\b/.test(prompt);
  const wantsDropoff = /dropoff|destino|llevar|do\b/.test(prompt);
  const wantsNotes = /nota|notas|notes/.test(prompt);
  const wantsDriver = /driver|chofer/.test(prompt);

  if (wantsPhone) {
    return trip.patientPhoneNumber ? `El telefono de ${trip.rider || 'ese paciente'} es ${trip.patientPhoneNumber}.` : `No veo telefono cargado para ${trip.rider || 'ese paciente'}.`;
  }
  if (wantsStatus) {
    return `El estado de ${trip.rider || 'ese viaje'} es ${trip.status || 'sin estado'}${trip.rideId ? ` y el ride id es ${trip.rideId}` : ''}.`;
  }
  if (wantsPickup) {
    return `La recogida de ${trip.rider || 'ese viaje'} es ${trip.address || 'sin direccion'}${trip.pickup ? ` a las ${trip.pickup}` : ''}.`;
  }
  if (wantsDropoff) {
    return `El destino de ${trip.rider || 'ese viaje'} es ${trip.destination || 'sin destino'}${trip.dropoff ? ` a las ${trip.dropoff}` : ''}.`;
  }
  if (wantsNotes) {
    return trip.notes ? `La nota de ${trip.rider || 'ese viaje'} dice: ${trip.notes}.` : `Ese viaje no tiene nota guardada.`;
  }
  if (wantsDriver) {
    return trip.driverId ? `El viaje de ${trip.rider || 'ese paciente'} esta asignado a ${trip.driverId}.` : `El viaje de ${trip.rider || 'ese paciente'} no tiene chofer asignado.`;
  }

  if (sameRiderMatches.length > 1) {
    const rideList = sameRiderMatches.map(item => `${item.rideId || item.id} (${item.status || 'sin estado'})`).join(', ');
    return `${trip.rider || 'Ese paciente'} tiene ${sameRiderMatches.length} viajes cargados: ${rideList}.`;
  }

  if (matches.length > 1 && !wantsPhone && !wantsStatus && !wantsPickup && !wantsDropoff && !wantsNotes && !wantsDriver) {
    return `Encontre varios pacientes parecidos: ${matches.slice(0, 5).map(item => item.rider || item.rideId || item.id).join(', ')}. Dime cual quieres revisar.`;
  }

  return `Encontre a ${trip.rider || 'ese paciente'}${trip.rideId ? ` con ride id ${trip.rideId}` : ''}. Estado ${trip.status || 'sin estado'}, pickup ${trip.pickup || '-'}, dropoff ${trip.dropoff || '-'}${trip.patientPhoneNumber ? `, telefono ${trip.patientPhoneNumber}` : ''}.`;
};

const findModuleAction = (message, snapshot) => {
  const prompt = normalizeLookupValue(message);
  if (!/(abre|abrir|open|ve a|ll[eé]vame|go to)/.test(prompt)) return null;
  const modules = Array.isArray(snapshot?.modules) ? snapshot.modules : [];
  const candidates = modules.map(module => ({
    ...module,
    haystack: normalizeLookupValue(`${module.label} ${module.key} ${module.url}`)
  }));
  const match = candidates.find(module => prompt.includes(module.haystack) || tokenizeLookupValue(module.label).some(token => prompt.includes(token)) || tokenizeLookupValue(module.url).some(token => token && prompt.includes(token)));
  if (!match) return null;
  return {
    action: {
      type: 'open-module',
      href: match.url,
      label: match.label
    },
    reply: `${match.label}. Te lo abro ahora mismo.`
  };
};

const findDriverMessageAction = (message, snapshot) => {
  const prompt = String(message || '').trim();
  const normalizedPrompt = normalizeLookupValue(prompt);
  if (!/(manda|mandale|envia|enviale|send|dile)/.test(normalizedPrompt)) return null;
  const strippedPrompt = normalizedPrompt
    .replace(/^(manda(?:le)?|envia(?:le)?|send|dile)(?:\s+un)?(?:\s+mensaje)?\s+a\s+/, '')
    .trim();
  const splitToken = [' que ', ' diciendo ', ' saying '].find(token => strippedPrompt.includes(token));
  if (!splitToken) return null;
  const [rawTargetText, rawMessageText] = strippedPrompt.split(splitToken);
  const targetText = normalizeLookupValue(rawTargetText);
  const messageText = String(rawMessageText || '').trim();
  if (!targetText || !messageText) return null;
  const drivers = Array.isArray(snapshot?.driverDirectory) ? snapshot.driverDirectory : [];
  const matchedDriver = drivers.find(driver => {
    const name = normalizeLookupValue(driver.name);
    const nameTokens = tokenizeLookupValue(name);
    const targetTokens = tokenizeLookupValue(targetText);
    const sharedTokens = targetTokens.filter(token => token.length >= 3 && nameTokens.some(nameToken => nameToken.includes(token) || token.includes(nameToken)));
    return name.includes(targetText) || targetText.includes(name) || sharedTokens.length > 0;
  });
  if (!matchedDriver) return null;
  return {
    action: {
      type: 'driver-message',
      driverId: matchedDriver.id,
      driverName: matchedDriver.name,
      message: messageText
    },
    reply: `Listo. Le dejé el mensaje a ${matchedDriver.name}: ${messageText}`
  };
};

const getAssistantConfig = integrationsState => {
  const storedAi = integrationsState?.ai || {};
  const storedApiKey = String(storedAi.apiKey || '').trim();
  const envApiKey = process.env.OPENAI_API_KEY?.trim() || '';
  const apiKey = storedAi.enabled && storedApiKey ? storedApiKey : envApiKey;
  const model = String(storedAi.model || process.env.OPENAI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;

  return {
    apiKey,
    model,
    enabled: Boolean(storedAi.enabled && storedApiKey) || Boolean(envApiKey),
    source: storedAi.enabled && storedApiKey ? 'integrations' : envApiKey ? 'env' : 'fallback'
  };
};

const buildConversationKey = ({ session, clientId }) => {
  const userId = String(session?.user?.id || '').trim();
  if (userId) return `user:${userId}`;
  const normalizedClientId = String(clientId || '').trim();
  if (normalizedClientId) return `client:${normalizedClientId}`;
  return '';
};

const flattenMenuItems = items => items.flatMap(item => item.children ? [{
  key: item.key,
  label: item.label,
  url: item.url || '',
  isTitle: Boolean(item.isTitle)
}, ...flattenMenuItems(item.children)] : [{
  key: item.key,
  label: item.label,
  url: item.url || '',
  isTitle: Boolean(item.isTitle)
}]);

const buildDispatchSnapshot = async session => {
  const [adminPayload, dispatchState, integrationsState, systemUsersPayload, blacklistState] = await Promise.all([readNemtAdminPayload(), readNemtDispatchState(), readIntegrationsState(), readSystemUsersPayload(), readBlacklistState()]);
  const drivers = Array.isArray(adminPayload?.dispatchDrivers) ? adminPayload.dispatchDrivers : [];
  const trips = Array.isArray(dispatchState?.trips) ? dispatchState.trips : [];
  const routePlans = Array.isArray(dispatchState?.routePlans) ? dispatchState.routePlans : [];
  const users = Array.isArray(systemUsersPayload?.users) ? systemUsersPayload.users : [];
  const blacklistEntries = Array.isArray(blacklistState?.entries) ? blacklistState.entries : [];

  const cancelledTrips = trips.filter(trip => ['cancelled', 'canceled'].includes(String(trip?.status || '').trim().toLowerCase()));
  const unassignedTrips = trips.filter(trip => !trip?.driverId && !['cancelled', 'canceled'].includes(String(trip?.status || '').trim().toLowerCase()));
  const onlineDrivers = drivers.filter(driver => String(driver?.live || '').toLowerCase() === 'online');
  const driverUsers = users.filter(user => String(user?.role || '').toLowerCase().includes('driver'));
  const adminUsers = users.filter(user => !String(user?.role || '').toLowerCase().includes('driver'));
  const enabledSmsProviders = Object.entries(integrationsState?.sms || {}).filter(([, config]) => Boolean(config?.enabled)).map(([provider]) => provider);

  return {
    modules: flattenMenuItems(MENU_ITEMS).filter(item => !item.isTitle).map(item => ({
      key: item.key,
      label: item.label,
      url: item.url
    })),
    totals: {
      trips: trips.length,
      drivers: drivers.length,
      routePlans: routePlans.length,
      onlineDrivers: onlineDrivers.length,
      unassignedTrips: unassignedTrips.length,
      cancelledTrips: cancelledTrips.length,
      users: users.length,
      adminUsers: adminUsers.length,
      driverUsers: driverUsers.length,
      blacklistEntries: blacklistEntries.length
    },
    integrations: {
      uberConfigured: Boolean(integrationsState?.uber?.clientId || integrationsState?.uber?.enabled),
      aiConfigured: Boolean(integrationsState?.ai?.enabled && integrationsState?.ai?.apiKey),
      aiModel: String(integrationsState?.ai?.model || '').trim(),
      assistantName: String(integrationsState?.ai?.avatarName || 'Balby').trim(),
      assistantMemoryNotes: String(integrationsState?.ai?.memoryNotes || '').trim(),
      smsProvidersEnabled: enabledSmsProviders,
      smsProvidersConfigured: Object.entries(integrationsState?.sms || {}).filter(([, config]) => Boolean(config?.accountSid || config?.apiKey || config?.messagingProfileId || config?.enabled)).map(([provider]) => provider)
    },
    currentUser: {
      id: String(session?.user?.id || '').trim(),
      name: String(session?.user?.name || '').trim(),
      username: String(session?.user?.username || '').trim(),
      firstName: String(session?.user?.firstName || '').trim(),
      role: String(session?.user?.role || '').trim()
    },
    sampleDrivers: drivers.slice(0, 12).map(driver => ({
      id: driver.id,
      name: driver.name,
      code: driver.code,
      vehicle: driver.vehicle,
      live: driver.live,
      checkpoint: driver.checkpoint
    })),
    driverDirectory: drivers.slice(0, 250).map(driver => ({
      id: driver.id,
      name: String(driver.name || '').trim(),
      vehicle: String(driver.vehicle || '').trim(),
      live: String(driver.live || '').trim()
    })),
    sampleTrips: trips.slice(0, 25).map(trip => ({
      id: trip.id,
      rideId: trip.rideId,
      brokerTripId: trip.brokerTripId,
      rider: trip.rider,
      patientPhoneNumber: trip.patientPhoneNumber || trip.phone || trip.mobile || '',
      status: trip.status,
      driverId: trip.driverId,
      pickup: trip.pickup,
      dropoff: trip.dropoff,
      address: trip.address,
      destination: trip.destination,
      notes: trip.notes || ''
    })),
    localTripIndex: buildLocalTripIndex(trips),
    currentPageHelp: {
      dispatcher: 'Main live operations board for trips, assignments, map and driver messaging.',
      tripDashboard: 'Trip dashboard focused on trip list, route planning and driver roster.',
      userManagement: 'Manage system users, passwords and access for web and Android.',
      drivers: 'Manage drivers, attendants, grouping and vehicles.',
      integrations: 'Configure Uber, SMS and AI assistant integrations.'
    }
  };
};

const trySolveSimpleMath = message => {
  const normalized = String(message || '')
    .toLowerCase()
    .replace(/,/g, '.')
    .replace(/cu[aá]nto es|cu[aá]l es|cuanto da|dime|resuelve/g, ' ')
    .replace(/m[aá]s/g, '+')
    .replace(/menos/g, '-')
    .replace(/por|x|multiplicado por/g, '*')
    .replace(/dividido entre|dividido por|entre/g, '/')
    .replace(/les|es|son/g, ' ')
    .replace(/and/g, ' ')
    .replace(/what is/g, ' ')
    .replace(/plus/g, '+')
    .replace(/minus/g, '-')
    .replace(/times/g, '*')
    .replace(/over/g, '/')
    .replace(/[^\d.+\-*/() ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const left = Number(match[1]);
  const operator = match[2];
  const right = Number(match[3]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;

  let result = null;
  if (operator === '+') result = left + right;
  if (operator === '-') result = left - right;
  if (operator === '*') result = left * right;
  if (operator === '/') result = right === 0 ? null : left / right;
  if (result === null || !Number.isFinite(result)) {
    return 'No puedo dividir entre cero.';
  }

  return `El resultado es ${Number.isInteger(result) ? result : result.toFixed(2)}.`;
};

const buildFallbackReply = (message, snapshot, pathname = '', history = [], session = null, integrationsState = null) => {
  const prompt = String(message || '').toLowerCase();
  const personalizedLead = buildPersonalizedLead(session);
  const mathReply = trySolveSimpleMathSafe(message);
  if (mathReply) {
    return mathReply;
  }
  const learnedFactReply = findLearnedFactReply(message, history, integrationsState);
  if (learnedFactReply) {
    return learnedFactReply;
  }
  if (/cual es tu nombre|como te llamas|tu nombre/.test(prompt)) {
    return `Soy ${snapshot?.integrations?.assistantName || 'Balby'}.`;
  }
  if (/quien soy|mi nombre|como me llamo/.test(prompt)) {
    const firstName = getSessionFirstName(session);
    return `${personalizedLead}tu nombre es ${firstName}.`;
  }
  if (/cerrar sesion|cierra sesion|sign out|logout|log out/.test(prompt)) {
    return `${personalizedLead}te voy a cerrar la sesion.`;
  }
  const moduleAction = findModuleAction(message, snapshot);
  if (moduleAction) {
    return `${personalizedLead}${moduleAction.reply}`;
  }
  const driverMessageAction = findDriverMessageAction(message, snapshot);
  if (driverMessageAction) {
    return `${personalizedLead}${driverMessageAction.reply}`;
  }
  const tripReply = findTripReply(message, snapshot);
  if (tripReply) {
    return tripReply;
  }
  if (/(chofer|driver)/.test(prompt) && /(mas|mayor|peor|worst)/.test(prompt) && /(tarde|late|retras)/.test(prompt)) {
    return buildWorstDriverDelayReply(snapshot);
  }
  if (/(paciente|patient|rider|member)/.test(prompt) && /(llegaron|llego|fueron|estan|estuvieron)?\s*(tarde|late|retras)/.test(prompt)) {
    return buildLatePatientsReply(snapshot);
  }
  if (/chofer|driver/.test(prompt) && /tarde|late|retras/.test(prompt)) {
    return buildDriverDelayReply(snapshot);
  }
  if (/telefono|tel[eé]fono|numero|n[uú]mero|phone|cell|cel/.test(prompt)) {
    return 'Puedo buscar telefono, pero dime el nombre del paciente o el ride id del viaje.';
  }
  if (/cuantos|cuantas|cantidad|total/.test(prompt) && /viajes|trips/.test(prompt)) {
    return `${personalizedLead}ahora mismo hay ${snapshot.totals.trips} viajes cargados y ${snapshot.totals.unassignedTrips} siguen sin asignar.`;
  }
  if (/paciente|rider|member|trip|viaje|ride/.test(prompt)) {
    return 'Puedo revisar datos del viaje, pero necesito el nombre del paciente o el ride id para buscarlo bien.';
  }
  if (prompt.includes('sin asign') || prompt.includes('unassigned')) {
    return `Ahora mismo hay ${snapshot.totals.unassignedTrips} viajes sin asignar.`;
  }
  if (prompt.includes('cancel')) {
    return `Ahora mismo hay ${snapshot.totals.cancelledTrips} viajes cancelados.`;
  }
  if (prompt.includes('driver') || prompt.includes('chofer')) {
    return `${personalizedLead}hay ${snapshot.totals.drivers} choferes en la plantilla y ${snapshot.totals.onlineDrivers} estan online.`;
  }
  if (prompt.includes('trip') || prompt.includes('viaje')) {
    return `${personalizedLead}hay ${snapshot.totals.trips} viajes cargados y ${snapshot.totals.unassignedTrips} siguen abiertos.`;
  }
  if (prompt.includes('modul') || prompt.includes('pantalla') || prompt.includes('web')) {
    const moduleLabels = snapshot.modules.map(module => module.label).join(', ');
    return `Esta web incluye estos modulos principales: ${moduleLabels}. Pantalla actual: ${pathname || 'desconocida'}.`;
  }
  if (prompt.includes('usuario') || prompt.includes('user management')) {
    return `Hay ${snapshot.totals.users} usuarios del sistema: ${snapshot.totals.adminUsers} administrativos y ${snapshot.totals.driverUsers} choferes.`;
  }
  if (prompt.includes('integr') || prompt.includes('sms') || prompt.includes('uber')) {
    return `Resumen de integraciones: Uber configurado ${snapshot.integrations.uberConfigured ? 'si' : 'no'}. IA configurada ${snapshot.integrations.aiConfigured ? `si, usando ${snapshot.integrations.aiModel || DEFAULT_MODEL}` : 'no'}. Proveedores SMS activos: ${snapshot.integrations.smsProvidersEnabled.join(', ') || 'ninguno'}.`;
  }
  return `${personalizedLead}dime en que te ayudo.`;
};

const callOpenAI = async ({ message, history, snapshot, pathname, integrationsState, providerMode, session }) => {
  const mathReply = trySolveSimpleMathSafe(message);
  const moduleAction = findModuleAction(message, snapshot);
  const driverMessageAction = findDriverMessageAction(message, snapshot);
  const directAction = driverMessageAction?.action || moduleAction?.action || (/cerrar sesion|cierra sesion|sign out|logout|log out/.test(String(message || '').toLowerCase()) ? 'signout' : null);
  if (mathReply) {
    return {
      reply: mathReply,
      provider: 'local',
      action: directAction
    };
  }

  if (providerMode === 'local') {
    return {
      reply: buildFallbackReply(message, snapshot, pathname, history, session, integrationsState),
      provider: 'local',
      action: directAction
    };
  }
  const assistantConfig = getAssistantConfig(integrationsState);
  if (!assistantConfig.apiKey) {
    return {
      reply: buildFallbackReply(message, snapshot, pathname, history, session, integrationsState),
      provider: 'fallback',
      action: directAction
    };
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${assistantConfig.apiKey}`
    },
    body: JSON.stringify({
      model: assistantConfig.model,
      temperature: 0.3,
      messages: [{
        role: 'system',
        content: 'Eres un asistente de dispatch para una operacion NEMT y para toda la web de Care Mobility. Responde siempre en espanol claro, natural y profesional, salvo que el usuario pida explicitamente ingles. No mezcles ingles y espanol en la misma respuesta. Usa el snapshot proporcionado como fuente de verdad. Conoces modulos, viajes, choferes, rutas, integraciones, usuarios y blacklist. Si sugieres una accion operativa, expresala como recomendacion y no como accion automatica. Si conoces el nombre del usuario logueado, contestale de forma directa y personal, por ejemplo: Si Robert, dime en que te ayudo. No uses markdown, no uses asteriscos y no uses listas con simbolos salvo que el usuario las pida.'
      }, {
        role: 'system',
        content: `Pantalla actual: ${pathname || 'desconocida'}. Snapshot de la app: ${JSON.stringify(snapshot)}`
      }, ...history.slice(-10).map(item => ({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        content: item.text
      })), {
        role: 'user',
        content: message
      }]
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'OpenAI request failed.');
  }

  return {
    reply: stripRichText(payload?.choices?.[0]?.message?.content?.trim() || buildFallbackReply(message, snapshot, pathname, history, session, integrationsState)),
    provider: assistantConfig.source === 'integrations' ? 'openai-integrations' : 'openai',
    action: directAction
  };
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = String(searchParams.get('clientId') || '').trim();
  const session = await getServerSession(authOptions);
  const conversationKey = buildConversationKey({
    session,
    clientId
  });
  if (!conversationKey) {
    return NextResponse.json({
      error: 'clientId or authenticated session is required.'
    }, { status: 400 });
  }

  const conversation = await readAssistantConversation(conversationKey);
  return NextResponse.json({
    ok: true,
    conversation,
    scope: session?.user?.id ? 'user' : 'client'
  });
}

export async function POST(request) {
  const body = await request.json();
  const message = String(body?.message || '').trim();
  const history = Array.isArray(body?.history) ? body.history : [];
  const clientId = String(body?.clientId || '').trim();
  const pathname = String(body?.pathname || '').trim();
  const providerMode = String(body?.providerMode || 'local').trim().toLowerCase() === 'openai' ? 'openai' : 'local';
  const session = await getServerSession(authOptions);
  const conversationKey = buildConversationKey({
    session,
    clientId
  });

  if (!message) {
    return NextResponse.json({
      error: 'Message is required.'
    }, { status: 400 });
  }

  try {
    const snapshot = await buildDispatchSnapshot(session);
    const integrationsState = await readIntegrationsState();
    const result = await callOpenAI({
      message,
      history,
      snapshot,
      pathname,
      integrationsState,
      providerMode,
      session
    });
    if (conversationKey) {
      const nextMessages = [...history.slice(-20).map((item, index) => ({
        id: `hist-${index}-${Date.now()}`,
        role: item.role,
        text: item.text,
        createdAt: Date.now()
      })), {
        id: `user-${Date.now()}`,
        role: 'user',
        text: message,
        createdAt: Date.now()
      }, {
        id: `assistant-${Date.now() + 1}`,
        role: 'assistant',
        text: result.reply,
        createdAt: Date.now() + 1
      }];
      await writeAssistantConversation(conversationKey, {
        updatedAt: Date.now(),
        path: pathname,
        messages: nextMessages.slice(-30)
      });
    }
    return NextResponse.json({
      ok: true,
      reply: result.reply,
      provider: result.provider,
      action: result.action || null,
      scope: session?.user?.id ? 'user' : 'client'
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to contact the assistant.'
    }, { status: 500 });
  }
}