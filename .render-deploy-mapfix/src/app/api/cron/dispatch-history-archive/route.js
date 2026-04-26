import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { runDispatchArchiveMaintenance } from '@/server/nemt-dispatch-store';

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const headerSecret = request.headers.get('x-cron-secret');
  const isCronCall = cronSecret && headerSecret === cronSecret;

  if (!isCronCall) {
    const session = await getServerSession(options);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
  }

  const result = await runDispatchArchiveMaintenance();

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    archivedDates: result.archivedDates,
    archiveSummaries: result.archiveSummaries,
    remainingTrips: Array.isArray(result.state?.trips) ? result.state.trips.length : 0,
    remainingThreads: Array.isArray(result.state?.dispatchThreads) ? result.state.dispatchThreads.length : 0
  });
}