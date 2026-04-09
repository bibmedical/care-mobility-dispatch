const DRIVER_ACCENT_COLOR = '#27b96a';

type DriverColorInput = string | { id?: string | null; driverId?: string | null; name?: string | null } | null | undefined;

const getDriverColorKey = (driver: DriverColorInput) => {
  if (driver && typeof driver === 'object') {
    return String(driver.id || driver.driverId || driver.name || '').trim().toLowerCase();
  }
  return String(driver || '').trim().toLowerCase();
};

export const getDriverAccentColor = (driver: DriverColorInput) => {
  const normalizedKey = getDriverColorKey(driver);
  if (!normalizedKey) return DRIVER_ACCENT_COLOR;

  let hash = 0;
  for (let index = 0; index < normalizedKey.length; index += 1) {
    hash = (hash * 31 + normalizedKey.charCodeAt(index)) >>> 0;
  }

  return DRIVER_ACCENT_COLOR;
};

export const withDriverAccentAlpha = (hexColor: string, alpha = 1) => {
  const normalizedHex = String(hexColor || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalizedHex)) return `rgba(39, 185, 106, ${alpha})`;
  const red = Number.parseInt(normalizedHex.slice(0, 2), 16);
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16);
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};