import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { MENU_ITEMS } from '@/assets/data/menu-items';
import { options as authOptions } from '@/app/api/auth/[...nextauth]/options';
import { getTripLateMinutes as getSharedTripLateMinutes } from '@/helpers/nemt-dispatch-state';
import { readAssistantKnowledgeOverview, searchAssistantKnowledge } from '@/server/assistant-knowledge-store';
import { readBlacklistState } from '@/server/blacklist-store';
import { readAssistantConversation, readAssistantFacts, mergeAssistantFact, writeAssistantConversation } from '@/server/assistant-memory-store';
import { readNemtAdminPayload } from '@/server/nemt-admin-store';
import { readNemtDispatchState, writeNemtDispatchState } from '@/server/nemt-dispatch-store';
import { readIntegrationsState } from '@/server/integrations-store';
import { logUserActionEvent } from '@/server/activity-logs-store';
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

const detectLanguage = message => {
  const m = normalizeLookupValue(String(message || ''));
  const hits = (m.match(/\b(hola|buenos|gracias|viaje|viajes|ruta|rutas|chofer|choferes|asigna|confirma|crea|crear|dame|muestra|abre|cierra|salir|ayuda|cuantos|cuantas|paciente|todos|todas|pues|manda|mandale|envia|enviale|hay|sin|asignados|busca|dime|pon|dale|que|como|quien|donde|cuando)\b/g) || []).length;
  return hits >= 1 ? 'es' : 'en';
};

const getSessionFirstName = session => String(session?.user?.firstName || session?.user?.name || session?.user?.username || '').trim().split(/\s+/)[0] || 'jefe';

const buildPersonalizedLead = session => {
  const firstName = getSessionFirstName(session);
  return `Si ${firstName}, `;
};

const trySolveSimpleMathSafe = message => {
  const normalized = String(message || '')
    .toLowerCase()
    .replace(/,/g, '.')
    .replace(/cu[aÃ¡]nto es|cu[aÃ¡]l es|cuanto da|dime|resuelve/g, ' ')
    .replace(/m[aÃ¡]s/g, '+')
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

const buildLocalLearnedFacts = (history, persistedFacts) => {
  const facts = Array.isArray(persistedFacts) ? [...persistedFacts] : [];
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

    const phoneMatch = text.match(/(?:phone|telefono|numero)\s+(?:for|de)\s+(.+?)\s+(?:is|es|=)\s+([+()?d\s-]+)/i);
    if (phoneMatch) {
      facts.push({
        subject: phoneMatch[1].trim(),
        value: phoneMatch[2].trim(),
        kind: 'phone'
      });
    }

    const addressMatch = text.match(/(?:address|direccion|domicilio|location|vive en)\s+(?:for|de)\s+(.+?)\s+(?:is|es|=)\s+(.+)/i);
    if (addressMatch) {
      facts.push({
        subject: addressMatch[1].trim(),
        value: addressMatch[2].trim(),
        kind: 'address'
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

const findKnowledgeReply = (message, snapshot) => {
  const matches = Array.isArray(snapshot?.knowledgeMatches) ? snapshot.knowledgeMatches : [];
  if (matches.length === 0) return null;

  const es = detectLanguage(message) === 'es';
  const [primaryMatch, ...otherMatches] = matches;
  const uniqueSources = Array.from(new Set([primaryMatch.documentTitle, ...otherMatches.map(match => match.documentTitle)].filter(Boolean))).slice(0, 3);
  const sourceText = uniqueSources.join(', ');
  return es
    ? `En la base de conocimiento encontre esto en ${sourceText}: ${primaryMatch.text}`
    : `I found this in the knowledge base from ${sourceText}: ${primaryMatch.text}`;
};

const findLearnedFactReply = (message, history, integrationsState, snapshot) => {
  const prompt = normalizeLookupValue(message);
  const persistedFacts = Array.isArray(snapshot?.persistedFacts) ? snapshot.persistedFacts : [];
  const facts = [...buildConfiguredSectionFacts(integrationsState), ...buildConfiguredMemoryFacts(integrationsState), ...buildLocalLearnedFacts(history, persistedFacts)];
  if (facts.length === 0) return null;

  const wantedPhone = /phone|cell|tel|numero/.test(prompt);
  const wantedAddress = /address|direccion|domicilio|location/.test(prompt);
  const match = [...facts].reverse().find(fact => {
    const subject = normalizeLookupValue(fact.subject);
    if (!subject) return false;
    if (wantedPhone && fact.kind !== 'phone') return false;
    if (wantedAddress && fact.kind !== 'address') return false;
    return prompt.includes(subject);
  });

  if (!match) return null;
  if (match.kind === 'phone') {
    return `El telefono guardado de ${match.subject} es ${match.value}.`;
  }
  if (match.kind === 'address') {
    return `La direccion guardada de ${match.subject} es ${match.value}.`;
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
    return 'No late arrival data found in loaded trips.';
  }

  const byDriver = new Map();
  delayedTrips.forEach(trip => {
    const key = trip.driverId || 'unassigned-driver';
    const current = byDriver.get(key) || { count: 0, riders: [], totalLate: 0 };
    current.count += 1;
    current.totalLate += trip.lateMinutes;
    current.riders.push({ rider: trip.rider || 'Unnamed patient', lateMinutes: trip.lateMinutes });
    byDriver.set(key, current);
  });

  const summary = [...byDriver.entries()].sort((left, right) => right[1].count - left[1].count || right[1].totalLate - left[1].totalLate);
  const totalDriversLate = summary.length;
  const driverLines = summary.slice(0, 4).map(([driverId, data]) => {
    const driverName = drivers.find(driver => String(driver.id) === String(driverId))?.name || (driverId === 'unassigned-driver' ? 'No driver assigned' : driverId);
    const riderNames = data.riders.slice(0, 3).map(item => `${item.rider} (${Math.round(item.lateMinutes)} min late)`).join(', ');
    return `${driverName}: ${data.count} late trips. Patients: ${riderNames}`;
  });

  return `${totalDriversLate} drivers had delays on their route. ${driverLines.join(' | ')}`;
};

const buildWorstDriverDelayReply = snapshot => {
  const trips = Array.isArray(snapshot?.localTripIndex) ? snapshot.localTripIndex : [];
  const drivers = Array.isArray(snapshot?.sampleDrivers) ? snapshot.sampleDrivers : [];
  const delayedTrips = trips.map(trip => ({ ...trip, lateMinutes: getTripLateMinutes(trip) })).filter(trip => trip.lateMinutes != null && trip.lateMinutes > 0);
  if (delayedTrips.length === 0) {
    return 'No late arrival data found in loaded trips.';
  }

  const byDriver = delayedTrips.reduce((accumulator, trip) => {
    const key = trip.driverId || 'unassigned-driver';
    const current = accumulator.get(key) || { trips: 0, totalLate: 0, maxLate: 0 };
    current.totalLate += trip.lateMinutes;
    current.maxLate = Math.max(current.maxLate, trip.lateMinutes);
    accumulator.set(key, current);
    return accumulator;
  }, new Map());

  const [driverId, driverData] = [...byDriver.entries()].sort((left, right) => right[1].totalLate - left[1].totalLate || right[1].trips - left[1].trips || right[1].maxLate - left[1].maxLate)[0];
  const driverName = drivers.find(driver => String(driver.id) === String(driverId))?.name || (driverId === 'unassigned-driver' ? 'No driver assigned' : driverId);
  return `${driverName} had the most delays today: ${Math.round(driverData.totalLate)} accumulated minutes in ${driverData.trips} late trips.`;
};

const buildLatePatientsReply = snapshot => {
  const trips = Array.isArray(snapshot?.localTripIndex) ? snapshot.localTripIndex : [];
  const delayedTrips = trips.map(trip => ({ ...trip, lateMinutes: getTripLateMinutes(trip) })).filter(trip => trip.lateMinutes != null && trip.lateMinutes > 0);
  if (delayedTrips.length === 0) {
    return 'No patients with delays found in the trips loaded right now.';
  }

  const patientLines = delayedTrips
    .sort((left, right) => right.lateMinutes - left.lateMinutes)
    .slice(0, 6)
    .map(trip => `${trip.rider || 'Unnamed patient'} (${Math.round(trip.lateMinutes)} min late${trip.rideId ? `, ride ${trip.rideId}` : ''})`);

  return `Patients who arrived late today: ${patientLines.join(', ')}.`;
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

  const meaningfulWords = prompt.split(/\s+/).filter(word => word.length >= 2 && !['de', 'del', 'con', 'para', 'que', 'por', 'una', 'uno', 'los', 'las', 'tel', 'phone', 'number', 'patient', 'trip', 'ride', 'pickup', 'dropoff', 'status', 'note', 'notes', 'the', 'for', 'who', 'what', 'where', 'when', 'find', 'show', 'search', 'check'].includes(word));
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
  const es = detectLanguage(message) === 'es';
  const matches = findMatchingTrips(message, snapshot);
  if (matches.length === 0) return null;

  const trip = matches[0];
  const sameRiderMatches = matches.filter(item => normalizeLookupValue(item.rider) === normalizeLookupValue(trip.rider));
  const wantsPhone = /phone|cell|tel|numero/.test(prompt);
  const wantsStatus = /estado|status/.test(prompt);
  const wantsPickup = /pickup|recogida|buscar|pu\b/.test(prompt);
  const wantsDropoff = /dropoff|destino|llevar|do\b/.test(prompt);
  const wantsNotes = /nota|notas|notes/.test(prompt);
  const wantsDriver = /driver|chofer/.test(prompt);

  if (wantsPhone) {
    return trip.patientPhoneNumber
      ? (es ? `Telefono de ${trip.rider || 'ese paciente'}: ${trip.patientPhoneNumber}.` : `Phone number for ${trip.rider || 'that patient'} is ${trip.patientPhoneNumber}.`)
      : (es ? `No hay numero de telefono guardado para ${trip.rider || 'ese paciente'}.` : `No phone number loaded for ${trip.rider || 'that patient'}.`);
  }
  if (wantsStatus) {
    return es
      ? `Estado de ${trip.rider || 'ese viaje'}: ${trip.status || 'sin estado'}${trip.rideId ? `, ride id ${trip.rideId}` : ''}.`
      : `Status for ${trip.rider || 'that trip'} is ${trip.status || 'no status'}${trip.rideId ? ` and ride id is ${trip.rideId}` : ''}.`;
  }
  if (wantsPickup) {
    return es
      ? `Recogida de ${trip.rider || 'ese viaje'}: ${trip.address || 'sin direccion'}${trip.pickup ? ` a las ${trip.pickup}` : ''}.`
      : `Pickup for ${trip.rider || 'that trip'} is ${trip.address || 'no address'}${trip.pickup ? ` at ${trip.pickup}` : ''}.`;
  }
  if (wantsDropoff) {
    return es
      ? `Destino de ${trip.rider || 'ese viaje'}: ${trip.destination || 'sin destino'}${trip.dropoff ? ` a las ${trip.dropoff}` : ''}.`
      : `Dropoff for ${trip.rider || 'that trip'} is ${trip.destination || 'no destination'}${trip.dropoff ? ` at ${trip.dropoff}` : ''}.`;
  }
  if (wantsNotes) {
    return trip.notes
      ? (es ? `Nota de ${trip.rider || 'ese viaje'}: ${trip.notes}.` : `Note for ${trip.rider || 'that trip'}: ${trip.notes}.`)
      : (es ? `Ese viaje no tiene nota guardada.` : `That trip has no saved note.`);
  }
  if (wantsDriver) {
    return trip.driverId
      ? (es ? `El viaje de ${trip.rider || 'ese paciente'} esta asignado a ${trip.driverId}.` : `Trip for ${trip.rider || 'that patient'} is assigned to ${trip.driverId}.`)
      : (es ? `El viaje de ${trip.rider || 'ese paciente'} no tiene chofer asignado.` : `Trip for ${trip.rider || 'that patient'} has no driver assigned.`);
  }

  if (sameRiderMatches.length > 1) {
    const rideList = sameRiderMatches.map(item => `${item.rideId || item.id} (${item.status || 'no status'})`).join(', ');
    return es
      ? `${trip.rider || 'Ese paciente'} tiene ${sameRiderMatches.length} viajes cargados: ${rideList}.`
      : `${trip.rider || 'That patient'} has ${sameRiderMatches.length} trips loaded: ${rideList}.`;
  }

  if (matches.length > 1 && !wantsPhone && !wantsStatus && !wantsPickup && !wantsDropoff && !wantsNotes && !wantsDriver) {
    return es
      ? `Encontre varios pacientes similares: ${matches.slice(0, 5).map(item => item.rider || item.rideId || item.id).join(', ')}. Dime cual quieres revisar.`
      : `Found multiple similar patients: ${matches.slice(0, 5).map(item => item.rider || item.rideId || item.id).join(', ')}. Tell me which one you want to review.`;
  }

  return es
    ? `Encontre a ${trip.rider || 'ese paciente'}${trip.rideId ? ` con ride id ${trip.rideId}` : ''}. Estado ${trip.status || 'sin estado'}, recogida ${trip.pickup || '-'}, destino ${trip.dropoff || '-'}${trip.patientPhoneNumber ? `, telefono ${trip.patientPhoneNumber}` : ''}.`
    : `Found ${trip.rider || 'that patient'}${trip.rideId ? ` with ride id ${trip.rideId}` : ''}. Status ${trip.status || 'no status'}, pickup ${trip.pickup || '-'}, dropoff ${trip.dropoff || '-'}${trip.patientPhoneNumber ? `, phone ${trip.patientPhoneNumber}` : ''}.`;
};

const findModuleAction = (message, snapshot) => {
  const prompt = normalizeLookupValue(message);
  if (!/(abre|abrir|open|ve a|ll[eÃ©]vame|go to)/.test(prompt)) return null;
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
    reply: detectLanguage(message) === 'es' ? `${match.label}. Abriendo ahora.` : `${match.label}. Opening now.`
  };
};

const findDriverMessageAction = (message, snapshot) => {
  const prompt = String(message || '').trim();
  const normalizedPrompt = normalizeLookupValue(prompt);
  if (!/(manda|mandale|envia|enviale|send|message|text|tell)/.test(normalizedPrompt)) return null;
  const strippedPrompt = normalizedPrompt
    .replace(/^(manda(?:le)?|envia(?:le)?|send|text|message|tell)(?:\s+a?)?(?:\s+message)?\s+(?:to\s+)?/, '')
    .trim();
  const splitToken = [' that ', ' saying ', ' que ', ' diciendo '].find(token => strippedPrompt.includes(token));
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
    reply: detectLanguage(message) === 'es' ? `Listo. Mensaje enviado a ${matchedDriver.name}: ${messageText}` : `Done. Sent message to ${matchedDriver.name}: ${messageText}`
  };
};

const parseDateKeyword = text => {
  const t = normalizeLookupValue(text);
  const today = new Date();
  if (/hoy|today/.test(t)) return today.toISOString().slice(0, 10);
  if (/man[aá]ana|tomorrow/.test(t)) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  const dateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (dateMatch) {
    const month = String(dateMatch[1]).padStart(2, '0');
    const day = String(dateMatch[2]).padStart(2, '0');
    const year = dateMatch[3] ? (String(dateMatch[3]).length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : String(today.getFullYear());
    return `${year}-${month}-${day}`;
  }
  return today.toISOString().slice(0, 10);
};

const findDriverInSnapshot = (text, snapshot) => {
  const drivers = Array.isArray(snapshot?.driverDirectory) ? snapshot.driverDirectory : [];
  const norm = normalizeLookupValue(text);
  return drivers.find(driver => {
    const name = normalizeLookupValue(driver.name);
    if (norm.includes(name)) return true;
    return name.split(' ').some(token => token.length >= 3 && norm.includes(token));
  }) || null;
};

const findCreateRouteAction = (message, snapshot) => {
  const prompt = normalizeLookupValue(message);
  if (!(/(crea|crear|nueva|generar|hacer|haz|armar)\s*(la\s*)?ruta/.test(prompt)) && !/(create|build|make|generate)\s*(a\s*)?route/.test(prompt)) return null;
  const trips = Array.isArray(snapshot?.allTrips) ? snapshot.allTrips : [];
  const serviceDate = parseDateKeyword(message);

  const afterVerb = prompt.replace(/(crea|crear|nueva|generar|hacer|haz|armar)\s*(la\s*)?ruta\s*(de|del|para)?\s*/g, '').trim();
  const matchedDriver = findDriverInSnapshot(afterVerb, snapshot);

  let targetTripIds = [];
  let targetDriverId = null;
  let targetDriverName = '';

  if (matchedDriver) {
    const unassigned = trips.filter(t => !t.driverId && !['cancelled', 'canceled'].includes(String(t.status || '').toLowerCase()));
    const alreadyAssigned = trips.filter(t => t.driverId === matchedDriver.id);
    const combined = [...alreadyAssigned, ...unassigned];
    targetTripIds = combined.map(t => t.id);
    targetDriverId = matchedDriver.id;
    targetDriverName = matchedDriver.name;
  } else {
    targetTripIds = trips.filter(t => !t.driverId && !['cancelled', 'canceled'].includes(String(t.status || '').toLowerCase())).map(t => t.id).slice(0, 50);
  }

  const routeId = `route-${Date.now()}`;
  const lang = detectLanguage(message);
  return {
    action: {
      type: 'create-route',
      routePlan: { id: routeId, serviceDate, tripIds: targetTripIds },
      assignDriverId: targetDriverId,
      assignTripIds: targetTripIds
    },
    reply: lang === 'es'
      ? (targetDriverName
          ? `Listo. Ruta creada para ${serviceDate} asignada a ${targetDriverName} con ${targetTripIds.length} viaje${targetTripIds.length !== 1 ? 's' : ''}. El estado offline del chofer no afecta la asignacion.`
          : `Listo. Ruta creada para ${serviceDate} con ${targetTripIds.length} viaje${targetTripIds.length !== 1 ? 's' : ''} sin asignar.`)
      : (targetDriverName
          ? `Done. Route created for ${serviceDate} assigned to ${targetDriverName} with ${targetTripIds.length} trip${targetTripIds.length !== 1 ? 's' : ''}. Offline status does not affect assignment.`
          : `Done. Route created for ${serviceDate} with ${targetTripIds.length} unassigned trip${targetTripIds.length !== 1 ? 's' : ''}.`)
  };
};

const findAssignTripToDriverAction = (message, snapshot) => {
  const prompt = normalizeLookupValue(message);
  if (!/(asigna|asignar|pon|poner|dale|da|assign)\s/.test(prompt)) return null;
  const trips = Array.isArray(snapshot?.allTrips) ? snapshot.allTrips : [];

  // Detect driver name after "a [driver]" at the end
  const toDriverMatch = prompt.match(/\s+a\s+([a-z\s]{3,})\s*$/);
  if (!toDriverMatch) return null;
  const driverText = toDriverMatch[1].trim();
  const matchedDriver = findDriverInSnapshot(driverText, snapshot);
  if (!matchedDriver) return null;

  // Detect trip / patient in the middle portion
  const midText = prompt.replace(/(asigna(?:r)?|pon(?:er)?|dale|da|assign)\s+(?:el\s+)?(?:viaje\s+)?(?:de\s+)?/, '').replace(/\s+a\s+[a-z\s]+$/, '').trim();
  const scoredTrips = trips.map(trip => {
    const riderNorm = normalizeLookupValue(trip.rider || '');
    const rideNorm = normalizeLookupValue(trip.rideId || '');
    let score = 0;
    if (riderNorm && midText.includes(riderNorm)) score += 5;
    if (rideNorm && midText.includes(rideNorm)) score += 5;
    riderNorm.split(' ').filter(w => w.length >= 3).forEach(w => { if (midText.includes(w)) score += 2; });
    return { trip, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);

  // "asigna todos los viajes de hoy a [driver]" â€” assign all unassigned
  const allTripsMode = /todos|all/.test(prompt);
  if (allTripsMode || scoredTrips.length === 0) {
    const unassigned = trips.filter(t => !['cancelled', 'canceled'].includes(String(t.status || '').toLowerCase()));
    return {
      action: { type: 'assign-trips', driverId: matchedDriver.id, tripIds: unassigned.map(t => t.id) },
      reply: detectLanguage(message) === 'es'
        ? `Listo. ${unassigned.length} viaje${unassigned.length !== 1 ? 's' : ''} asignado${unassigned.length !== 1 ? 's' : ''} a ${matchedDriver.name}. El estado offline no afecta las asignaciones.`
        : `Done. Assigned ${unassigned.length} trip${unassigned.length !== 1 ? 's' : ''} to ${matchedDriver.name}. Offline status does not affect assignments.`
    };
  }

  const { trip } = scoredTrips[0];
  return {
    action: { type: 'assign-trips', driverId: matchedDriver.id, tripIds: [trip.id] },
    reply: detectLanguage(message) === 'es'
      ? `Listo. El viaje de ${trip.rider || trip.id} fue asignado a ${matchedDriver.name}.`
      : `Done. Trip for ${trip.rider || trip.id} has been assigned to ${matchedDriver.name}.`
  };
};

const findConfirmTripAction = (message, snapshot) => {
  const prompt = normalizeLookupValue(message);
  if (!/(confirma|confirmar|confirm)\s*(el\s*)?viaje/.test(prompt) && !/(confirma|confirmar|confirm)\s+/.test(prompt)) return null;
  const trips = Array.isArray(snapshot?.allTrips) ? snapshot.allTrips : [];

  const strippedPrompt = prompt.replace(/(confirma|confirmar|confirm)(?:\s+el)?(?:\s+viaje)?\s+(de|del|a|al)?\s*/, '').trim();
  const scoredTrips = trips.map(trip => {
    const riderNorm = normalizeLookupValue(trip.rider || '');
    const rideNorm = normalizeLookupValue(trip.rideId || '');
    let score = 0;
    if (riderNorm && strippedPrompt.includes(riderNorm)) score += 5;
    if (rideNorm && strippedPrompt.includes(rideNorm)) score += 5;
    riderNorm.split(' ').filter(w => w.length >= 3).forEach(w => { if (strippedPrompt.includes(w)) score += 2; });
    return { trip, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);

  if (scoredTrips.length === 0) return null;
  const { trip } = scoredTrips[0];
  return {
    action: {
      type: 'confirm-trip',
      tripId: trip.id,
      riderName: trip.rider
    },
    reply: detectLanguage(message) === 'es'
      ? `Listo. El viaje de ${trip.rider || trip.id} fue confirmado.`
      : `Done. Trip for ${trip.rider || trip.id} has been confirmed.`
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
  const [adminPayload, dispatchState, integrationsState, systemUsersPayload, blacklistState, persistedFacts, knowledgeOverview] = await Promise.all([readNemtAdminPayload(), readNemtDispatchState(), readIntegrationsState(), readSystemUsersPayload(), readBlacklistState(), readAssistantFacts(), readAssistantKnowledgeOverview()]);
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
      url: item.url || '',
      isTitle: Boolean(item.isTitle)
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
    },
    persistedFacts: Array.isArray(persistedFacts) ? persistedFacts : [],
    knowledge: {
      totalDocuments: Number(knowledgeOverview?.totals?.documents || 0),
      totalChunks: Number(knowledgeOverview?.totals?.chunks || 0),
      documents: Array.isArray(knowledgeOverview?.documents) ? knowledgeOverview.documents.slice(0, 10).map(document => ({
        id: document.id,
        title: document.title,
        fileName: document.fileName,
        summary: document.summary,
        relativePath: document.relativePath
      })) : []
    },
    allTrips: trips.map(trip => ({
      id: trip.id,
      rideId: trip.rideId,
      brokerTripId: trip.brokerTripId,
      rider: trip.rider,
      status: trip.status,
      driverId: trip.driverId,
      pickup: trip.pickup,
      dropoff: trip.dropoff,
      address: trip.address,
      destination: trip.destination,
      confirmation: trip.confirmation
    })),
    routePlans: routePlans.slice(0, 30).map(rp => ({
      id: rp.id,
      serviceDate: rp.serviceDate,
      tripIds: rp.tripIds
    }))
  };
};

const buildFallbackReply = (message, snapshot, pathname = '', history = [], session = null, integrationsState = null) => {
  const prompt = String(message || '').toLowerCase();
  const es = detectLanguage(message) === 'es';
  const myName = snapshot?.integrations?.assistantName || 'Balby';
  const personalizedLead = buildPersonalizedLead(session);

  const mathReply = trySolveSimpleMathSafe(message);
  if (mathReply) return mathReply;

  const learnedFactReply = findLearnedFactReply(message, history, integrationsState, snapshot);
  if (learnedFactReply) return learnedFactReply;

  const knowledgeReply = findKnowledgeReply(message, snapshot);
  if (knowledgeReply) return knowledgeReply;

  if (/cual es tu nombre|como te llamas|tu nombre|what.*your name|who are you/.test(prompt)) {
    return es ? `Soy ${myName}, tu asistente de despacho.` : `I'm ${myName}, your dispatch assistant.`;
  }
  if (/who am i|my name|what.*my name/.test(prompt)) {
    const firstName = getSessionFirstName(session);
    return es ? `${personalizedLead}tu nombre es ${firstName}.` : `${personalizedLead}your name is ${firstName}.`;
  }
  if (/hola|buenos dias|buenas tardes|buenas noches|hey|hi\b/.test(prompt)) {
    const firstName = getSessionFirstName(session);
    return es
      ? `Hola ${firstName}, soy ${myName}. Puedo crear rutas, confirmar viajes, mandar mensajes a choferes, buscar pacientes y responder preguntas de despacho. ¿En que te ayudo?`
      : `Hi ${firstName}, I'm ${myName}. I can create routes, confirm trips, send messages to drivers, search for patients and answer dispatch questions. How can I help?`;
  }
  if (/what can you do|que puedes hacer|que sabes|como me ayudas|ayuda|help/.test(prompt)) {
    return es
      ? `Soy ${myName} y puedo: crear rutas, confirmar viajes, mandar mensajes a choferes, buscar info de pacientes y viajes, navegar a cualquier modulo, y recordar cosas que me digas. Solo pregunta.`
      : `I'm ${myName} and I can: create routes for the day, confirm trips, send messages to drivers, look up patient and trip info, navigate to any module, and remember things you tell me. Just ask.`;
  }
  if (/cerrar sesion|cierra sesion|sign out|logout|log out/.test(prompt)) {
    return es ? `${personalizedLead}cerrando tu sesion ahora.` : `${personalizedLead}signing you out now.`;
  }

  const moduleAction = findModuleAction(message, snapshot);
  if (moduleAction) return `${personalizedLead}${moduleAction.reply}`;

  const createRouteAction = findCreateRouteAction(message, snapshot);
  if (createRouteAction) return `${personalizedLead}${createRouteAction.reply}`;

  const confirmTripAction = findConfirmTripAction(message, snapshot);
  if (confirmTripAction) return `${personalizedLead}${confirmTripAction.reply}`;

  const driverMessageAction = findDriverMessageAction(message, snapshot);
  if (driverMessageAction) return `${personalizedLead}${driverMessageAction.reply}`;

  const tripReply = findTripReply(message, snapshot);
  if (tripReply) return tripReply;

  if (/(chofer|driver)/.test(prompt) && /(mas|mayor|peor|worst)/.test(prompt) && /(tarde|late|retras)/.test(prompt)) {
    return buildWorstDriverDelayReply(snapshot);
  }
  if (/(paciente|patient|rider|member)/.test(prompt) && /(llegaron|llego|fueron|estan|estuvieron)?\s*(tarde|late|retras)/.test(prompt)) {
    return buildLatePatientsReply(snapshot);
  }
  if (/chofer|driver/.test(prompt) && /tarde|late|retras/.test(prompt)) {
    return buildDriverDelayReply(snapshot);
  }
  if (/phone|cell|tel/.test(prompt)) {
    return es
      ? "Puedo buscar un numero de telefono. Dame el nombre del paciente, o di: telefono de [nombre] es [numero]."
      : "I can look up a phone number. Tell me the patient's name or say: phone for [name] is [number].";
  }
  if (/address|location|where/.test(prompt)) {
    return es
      ? "Puedo buscar direcciones. Dame el nombre del paciente, o di: direccion de [nombre] es [direccion]."
      : "I can look up addresses. Tell me the patient name, or say: address for [name] is [address].";
  }
  if (/cuantos|cuantas|cantidad|total|how many/.test(prompt) && /viajes|trips/.test(prompt)) {
    return es
      ? `${personalizedLead}hay ${snapshot.totals.trips} viajes cargados y ${snapshot.totals.unassignedTrips} sin asignar.`
      : `${personalizedLead}there are currently ${snapshot.totals.trips} trips loaded and ${snapshot.totals.unassignedTrips} are still unassigned.`;
  }
  if (/rutas?|route/.test(prompt)) {
    const routeCount = Array.isArray(snapshot?.routePlans) ? snapshot.routePlans.length : 0;
    return es
      ? `Hay ${routeCount} plan${routeCount !== 1 ? 'es' : ''} de ruta guardado${routeCount !== 1 ? 's' : ''}. Para crear uno nuevo di: crea ruta para manana, o crea ruta para [nombre del chofer].`
      : `There are ${routeCount} route plan${routeCount !== 1 ? 's' : ''} saved. To create a new one say: create route for tomorrow, or create route for [driver name].`;
  }
  if (/paciente|rider|member|trip|viaje|ride/.test(prompt)) {
    return es
      ? "Puedo buscar datos de viajes, pero necesito el nombre del paciente o el ride ID. Intenta: busca viaje de [nombre]."
      : "I can look up trip data, but I need the patient's name or ride ID to find it. Try: find trip for [name].";
  }
  if (prompt.includes('sin asign') || prompt.includes('unassigned')) {
    return es
      ? `Hay ${snapshot.totals.unassignedTrips} viajes sin asignar en este momento.`
      : `There are currently ${snapshot.totals.unassignedTrips} unassigned trips.`;
  }
  if (prompt.includes('cancel')) {
    return es
      ? `Hay ${snapshot.totals.cancelledTrips} viajes cancelados en este momento.`
      : `There are currently ${snapshot.totals.cancelledTrips} cancelled trips.`;
  }
  if (/offline|online|en linea|en l.nea/.test(prompt) && /chofer|driver/.test(prompt)) {
    return es
      ? `El estado online/offline de un chofer solo indica si tiene el GPS activo en la app Android. No afecta la asignacion de viajes ni la creacion de rutas. Puedes asignar viajes y crear rutas para cualquier chofer sin importar su estado.`
      : `A driver's online/offline status only shows whether they have GPS active in the Android app. It does not affect trip assignment or route creation. You can assign trips and create routes for any driver regardless of their status.`;
  }
  if (prompt.includes('driver') || prompt.includes('chofer')) {
    return es
      ? `${personalizedLead}hay ${snapshot.totals.drivers} choferes en el roster. ${snapshot.totals.onlineDrivers} tienen GPS activo ahora. Los choferes offline igual pueden recibir viajes y rutas — offline solo significa que tienen la app cerrada.`
      : `${personalizedLead}there are ${snapshot.totals.drivers} drivers in the roster. ${snapshot.totals.onlineDrivers} have GPS active now. Offline drivers can still receive trips and routes — offline just means they have the app closed.`;
  }
  if (prompt.includes('trip') || prompt.includes('viaje')) {
    return es
      ? `${personalizedLead}hay ${snapshot.totals.trips} viajes cargados y ${snapshot.totals.unassignedTrips} siguen abiertos.`
      : `${personalizedLead}there are ${snapshot.totals.trips} trips loaded and ${snapshot.totals.unassignedTrips} are still open.`;
  }
  if (prompt.includes('modul') || prompt.includes('screen') || prompt.includes('page')) {
    const moduleLabels = snapshot.modules.map(module => module.label).join(', ');
    return es
      ? `La app tiene estos modulos principales: ${moduleLabels}. Pagina actual: ${pathname || 'desconocida'}.`
      : `This app includes these main modules: ${moduleLabels}. Current page: ${pathname || 'unknown'}.`;
  }
  if (prompt.includes('user') || prompt.includes('user management')) {
    return es
      ? `Hay ${snapshot.totals.users} usuarios del sistema: ${snapshot.totals.adminUsers} admin y ${snapshot.totals.driverUsers} choferes.`
      : `There are ${snapshot.totals.users} system users: ${snapshot.totals.adminUsers} admin and ${snapshot.totals.driverUsers} drivers.`;
  }
  if (prompt.includes('integr') || prompt.includes('sms') || prompt.includes('uber')) {
    return es
      ? `Resumen de integraciones: Uber ${snapshot.integrations.uberConfigured ? 'configurado' : 'no configurado'}. IA ${snapshot.integrations.aiConfigured ? `configurada, usando ${snapshot.integrations.aiModel || DEFAULT_MODEL}` : 'no configurada'}. Proveedores SMS activos: ${snapshot.integrations.smsProvidersEnabled.join(', ') || 'ninguno'}.`
      : `Integration summary: Uber configured ${snapshot.integrations.uberConfigured ? 'yes' : 'no'}. AI configured ${snapshot.integrations.aiConfigured ? `yes, using ${snapshot.integrations.aiModel || DEFAULT_MODEL}` : 'no'}. Active SMS providers: ${snapshot.integrations.smsProvidersEnabled.join(', ') || 'none'}.`;
  }
  if (/document|pdf|manual|libro|diccionario|knowledge|memoria/.test(prompt)) {
    return es
      ? `La memoria documental tiene ${snapshot?.knowledge?.totalDocuments || 0} documento${snapshot?.knowledge?.totalDocuments === 1 ? '' : 's'} cargado${snapshot?.knowledge?.totalDocuments === 1 ? '' : 's'}. Puedes preguntarme por el contenido y buscare en ellos.`
      : `The document memory currently has ${snapshot?.knowledge?.totalDocuments || 0} uploaded document${snapshot?.knowledge?.totalDocuments === 1 ? '' : 's'}. You can ask me about their contents and I will search them.`;
  }
  if (/remember|learn|save|recuerda|aprende|guarda/.test(prompt)) {
    return es ? `Listo. Lo recordare para la proxima vez.` : `Got it. I'll save that and remember it next time.`;
  }
  return es
    ? `${personalizedLead}¿en que te ayudo? Puedo crear rutas, confirmar viajes, mandar mensajes, buscar pacientes y responder preguntas de despacho.`
    : `${personalizedLead}how can I help? I can create routes, confirm trips, send messages, search for patients and answer dispatch questions.`;
};

const extractLearnFacts = message => {
  const results = [];
  const text = String(message || '');
  const rememberMatch = text.match(/(?:recuerda|aprende|guarda)(?: que)?\s+(.+?)\s+(?:es|=)\s+(.+)/i);
  if (rememberMatch) results.push({ subject: rememberMatch[1].trim(), value: rememberMatch[2].trim(), kind: 'general' });
  const phoneMatch = text.match(/(?:phone|telefono|numero)\s+(?:for|de)\s+(.+?)\s+(?:is|es|=)\s+([\d\s+\-().]+)/i);
  if (phoneMatch) results.push({ subject: phoneMatch[1].trim(), value: phoneMatch[2].trim(), kind: 'phone' });
  const addressMatch = text.match(/(?:address|direccion|domicilio|location)\s+(?:for|de)\s+(.+?)\s+(?:is|es|=)\s+(.+)/i);
  if (addressMatch) results.push({ subject: addressMatch[1].trim(), value: addressMatch[2].trim(), kind: 'address' });
  return results;
};

const callOpenAI = async ({ message, history, snapshot, pathname, integrationsState, providerMode, session }) => {
  const mathReply = trySolveSimpleMathSafe(message);
  const moduleAction = findModuleAction(message, snapshot);
  const createRouteAction = findCreateRouteAction(message, snapshot);
  const confirmTripAction = findConfirmTripAction(message, snapshot);
  const driverMessageAction = findDriverMessageAction(message, snapshot);
  const assignTripAction = findAssignTripToDriverAction(message, snapshot);
  const directAction = confirmTripAction?.action || assignTripAction?.action || createRouteAction?.action || driverMessageAction?.action || moduleAction?.action || (/cerrar sesion|cierra sesion|sign out|logout|log out/.test(String(message || '').toLowerCase()) ? 'signout' : null);
  if (mathReply) {
    return { reply: mathReply, provider: 'local', action: directAction };
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
        content: 'You are a dispatch assistant for a NEMT operation and the Care Mobility web platform. Always respond in the SAME language the user writes in \u2014 if they write in Spanish respond in Spanish, if in English respond in English. You know modules, trips, drivers, routes, integrations, users and blacklist. You CAN execute operational actions: creating routes, assigning trips to drivers, confirming trips, and sending driver messages. When the user asks you to create a route or assign trips, execute it and confirm it was done. If you know the logged-in user\'s name, address them directly. Do not use markdown, asterisks, or bullet symbols unless the user requests them.'
      }, {
        role: 'system',
        content: `Current page: ${pathname || 'unknown'}. App snapshot: ${JSON.stringify(snapshot)}`
      }, ...(Array.isArray(snapshot?.knowledgeMatches) && snapshot.knowledgeMatches.length > 0 ? [{
        role: 'system',
        content: `Knowledge matches: ${JSON.stringify(snapshot.knowledgeMatches)}`
      }] : []), ...history.slice(-10).map(item => ({
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
  const conversationKey = buildConversationKey({ session, clientId });

  if (!message) {
    return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  }

  try {
    const snapshot = await buildDispatchSnapshot(session);
    const integrationsState = await readIntegrationsState();
    const knowledgeMatches = await searchAssistantKnowledge(message, { limit: 4 });
    const result = await callOpenAI({ message, history, snapshot: {
      ...snapshot,
      knowledgeMatches
    }, pathname, integrationsState, providerMode, session });

    // Persist learned facts from this message
    const newFacts = extractLearnFacts(message);
    for (const fact of newFacts) {
      await mergeAssistantFact(fact);
    }

    // Execute create-route action server-side
    if (result.action?.type === 'create-route' && result.action?.routePlan) {
      try {
        const currentState = await readNemtDispatchState();
        await writeNemtDispatchState({
          ...currentState,
          routePlans: [...(Array.isArray(currentState.routePlans) ? currentState.routePlans : []), result.action.routePlan]
        });
      } catch {}
    }

    // Execute assign-trips action server-side
    if (result.action?.type === 'assign-trips' && result.action?.driverId && Array.isArray(result.action?.tripIds)) {
      try {
        const currentState = await readNemtDispatchState();
        const nextTrips = (Array.isArray(currentState.trips) ? currentState.trips : []).map(trip =>
          result.action.tripIds.includes(trip.id)
            ? { ...trip, driverId: result.action.driverId, status: 'Assigned' }
            : trip
        );
        await writeNemtDispatchState({ ...currentState, trips: nextTrips });
      } catch {}
    }

    // Execute confirm-trip action server-side
    if (result.action?.type === 'confirm-trip' && result.action?.tripId) {
      try {
        const currentState = await readNemtDispatchState();
        const nextTrips = (Array.isArray(currentState.trips) ? currentState.trips : []).map(trip =>
          trip.id === result.action.tripId
            ? { ...trip, confirmation: { ...trip.confirmation, status: 'Confirmed', respondedAt: new Date().toISOString() } }
            : trip
        );
        await writeNemtDispatchState({ ...currentState, trips: nextTrips });
      } catch {}
    }

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
    if (session?.user?.id) {
      await logUserActionEvent({
        userId: session.user.id,
        userName: `${session.user.firstName || ''} ${session.user.lastName || ''}`.trim() || session.user.username || 'Unknown',
        userRole: session.user.role,
        userEmail: session.user.email,
        eventLabel: `Assistant: ${message.slice(0, 80)}${message.length > 80 ? '...' : ''}`,
        target: pathname || 'assistant-dispatch',
        metadata: {
          provider: result.provider,
          action: result.action?.type || null
        }
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