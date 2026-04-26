import { normalizeAuthValue } from '@/helpers/system-users';
import { readNemtAdminState } from '@/server/nemt-admin-store';

export const resolveDriverForSession = async session => {
  if (!session?.user?.id) return null;

  const adminState = await readNemtAdminState();
  const drivers = Array.isArray(adminState?.drivers) ? adminState.drivers : [];
  const sessionUserId = String(session.user.id || '').trim();
  const sessionUsername = normalizeAuthValue(session.user.username);
  const sessionEmail = normalizeAuthValue(session.user.email);

  return drivers.find(driver => {
    const authUserId = String(driver?.authUserId || '').trim();
    if (authUserId && authUserId === sessionUserId) return true;

    const driverUsername = normalizeAuthValue(driver?.username || driver?.portalUsername);
    if (sessionUsername && driverUsername === sessionUsername) return true;

    const driverEmail = normalizeAuthValue(driver?.email || driver?.portalEmail);
    if (sessionEmail && driverEmail === sessionEmail) return true;

    return false;
  }) || null;
};