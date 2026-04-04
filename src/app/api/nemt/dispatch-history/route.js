import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isAdminRole } from '@/helpers/system-users';
import { readDispatchHistoryArchive, readDispatchHistoryArchiveIndex, readDispatchHistoryDriverIndex, runDispatchHistoryBackfill } from '@/server/dispatch-history-store';

const normalizeDateKey = value => {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
};

const normalizeDriverId = value => String(value || '').trim();

export async function GET(request) {
  const session = await getServerSession(options);

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ error: 'Only administrators can access dispatch history' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const requestedDateKey = normalizeDateKey(searchParams.get('date'));
  const requestedDriverId = normalizeDriverId(searchParams.get('driverId'));
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 120, 1), 365);
  const availableDates = await readDispatchHistoryArchiveIndex(limit);
  const availableDrivers = await readDispatchHistoryDriverIndex(limit);
  const selectedDriver = requestedDriverId ? availableDrivers.find(driver => driver.driverId === requestedDriverId) || null : null;
  const selectedDateKey = requestedDateKey || selectedDriver?.days?.[0]?.dateKey || availableDates[0]?.dateKey || '';
  const archive = selectedDateKey ? await readDispatchHistoryArchive(selectedDateKey) : null;

  return NextResponse.json({
    ok: true,
    selectedDateKey,
    selectedDriverId: requestedDriverId,
    availableDates,
    availableDrivers,
    archive
  });
}

export async function POST() {
  const session = await getServerSession(options);

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ error: 'Only administrators can backfill dispatch history' }, { status: 403 });
  }

  const result = await runDispatchHistoryBackfill();

  return NextResponse.json({
    ok: true,
    ...result
  });
}