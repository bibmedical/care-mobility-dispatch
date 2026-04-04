import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isAdminRole } from '@/helpers/system-users';
import { readDispatchHistoryArchive, readDispatchHistoryArchiveIndex } from '@/server/dispatch-history-store';

const normalizeDateKey = value => {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
};

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
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 120, 1), 365);
  const availableDates = await readDispatchHistoryArchiveIndex(limit);
  const selectedDateKey = requestedDateKey || availableDates[0]?.dateKey || '';
  const archive = selectedDateKey ? await readDispatchHistoryArchive(selectedDateKey) : null;

  return NextResponse.json({
    ok: true,
    selectedDateKey,
    availableDates,
    archive
  });
}