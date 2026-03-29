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

  const whatsappUrl = `https://api.whatsapp.com/send?phone=${normalizedPhone}&text=${encodeURIComponent(String(message || '').trim())}`;
  const openedWindow = window.open(whatsappUrl, '_blank');

  if (!openedWindow) {
    try {
      const link = document.createElement('a');
      link.href = whatsappUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      return {
        ok: true,
        normalizedPhone,
        usedFallback: true
      };
    } catch {
      return {
        ok: false,
        reason: 'popup-blocked'
      };
    }
  }

  try {
    openedWindow.opener = null;
  } catch {
    // Ignore cross-window restrictions after the browser opens the tab.
  }

  return {
    ok: true,
    normalizedPhone
  };
};