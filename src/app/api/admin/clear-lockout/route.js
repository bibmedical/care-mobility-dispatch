import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { clearLoginFailures, getAllFailureLogs } from '@/server/login-failures-store';

export async function POST(req) {
  try {
    const session = await getServerSession(options);
    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const identifier = String(body?.identifier || '').trim().toLowerCase();

    if (!identifier) {
      return new Response(JSON.stringify({ error: 'identifier is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const deleted = await clearLoginFailures(identifier);

    return new Response(JSON.stringify({ success: true, deleted, identifier }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error clearing lockout:', error);
    return new Response(JSON.stringify({ error: 'Failed to clear lockout', message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function GET(req) {
  try {
    const session = await getServerSession(options);
    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500);
    const logs = await getAllFailureLogs(limit);

    // Group by identifier so we can show which accounts have recent failures
    const byIdentifier = new Map();
    const now = Date.now();
    const lockWindowMs = 15 * 60 * 1000;

    logs.forEach(log => {
      const key = String(log.identifier || '').toLowerCase();
      if (!key) return;
      if (!byIdentifier.has(key)) {
        byIdentifier.set(key, { identifier: key, count: 0, lastAttempt: 0, isLocked: false });
      }
      const entry = byIdentifier.get(key);
      entry.count += 1;
      const ts = Number(log.timestamp || 0);
      if (ts > entry.lastAttempt) entry.lastAttempt = ts;
    });

    // Mark locked: 5+ failures within 15 min window
    byIdentifier.forEach(entry => {
      const recentCount = logs.filter(
        l => String(l.identifier || '').toLowerCase() === entry.identifier &&
             Number(l.timestamp || 0) > now - lockWindowMs
      ).length;
      entry.recentCount = recentCount;
      entry.isLocked = recentCount >= 5;
    });

    const accounts = Array.from(byIdentifier.values())
      .sort((a, b) => b.lastAttempt - a.lastAttempt);

    return new Response(JSON.stringify({ success: true, accounts, rawLogs: logs }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching lockout data:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch lockout data', message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
