const DRIVER_COLOR_PALETTE = ['#2563eb', '#0f766e', '#dc2626', '#7c3aed', '#ea580c', '#0891b2', '#65a30d', '#be185d'];

export const getDriverColorKey = driverOrKey => {
  if (driverOrKey && typeof driverOrKey === 'object') {
    return String(driverOrKey.id || driverOrKey.driverId || driverOrKey.name || driverOrKey.label || '').trim().toLowerCase();
  }
  return String(driverOrKey || '').trim().toLowerCase();
};

export const getDriverColor = driverOrKey => {
  const normalizedKey = getDriverColorKey(driverOrKey);
  if (!normalizedKey) return DRIVER_COLOR_PALETTE[0];
  let hash = 0;
  for (let index = 0; index < normalizedKey.length; index += 1) {
    hash = (hash * 31 + normalizedKey.charCodeAt(index)) >>> 0;
  }
  return DRIVER_COLOR_PALETTE[hash % DRIVER_COLOR_PALETTE.length];
};

export const withDriverAlpha = (hexColor, alpha = 1) => {
  const normalizedHex = String(hexColor || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalizedHex)) return `rgba(37, 99, 235, ${alpha})`;
  const red = Number.parseInt(normalizedHex.slice(0, 2), 16);
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16);
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};