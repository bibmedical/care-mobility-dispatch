export const normalizeWhatsAppPhone = value => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `1${digits}`;
  return digits;
};

export const resolveRouteShareDriver = ({ selectedDriver, selectedRoute, routeTrips, drivers }) => {
  if (selectedDriver) return selectedDriver;

  if (selectedRoute?.driverId) {
    return (Array.isArray(drivers) ? drivers : []).find(driver => driver.id === selectedRoute.driverId) || null;
  }

  const assignedDriverIds = Array.from(new Set((Array.isArray(routeTrips) ? routeTrips : []).map(trip => trip.driverId).filter(Boolean)));
  if (assignedDriverIds.length === 1) {
    return (Array.isArray(drivers) ? drivers : []).find(driver => driver.id === assignedDriverIds[0]) || null;
  }

  return null;
};

export const openWhatsAppConversation = ({ phoneNumber, message }) => {
  const normalizedPhone = normalizeWhatsAppPhone(phoneNumber);
  if (!normalizedPhone) {
    return {
      ok: false,
      reason: 'missing-phone'
    };
  }

  const openedWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!openedWindow) {
    return {
      ok: false,
      reason: 'popup-blocked'
    };
  }

  openedWindow.opener = null;
  openedWindow.location.replace(`https://wa.me/${normalizedPhone}?text=${encodeURIComponent(String(message || '').trim())}`);

  return {
    ok: true,
    normalizedPhone
  };
};