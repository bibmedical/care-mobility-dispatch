import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { mergeUserPreferences } from '@/helpers/user-preferences';
import { readUserPreferences, writeUserPreferences } from '@/server/user-preferences-store';

export async function GET() {
  const session = await getServerSession(options);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const preferences = await readUserPreferences(session.user.id);
  return NextResponse.json({ ok: true, preferences });
}

export async function PUT(request) {
  const session = await getServerSession(options);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const currentPreferences = await readUserPreferences(session.user.id);
  const nextPreferences = mergeUserPreferences(currentPreferences, body?.preferences ?? body ?? {});
  const savedPreferences = await writeUserPreferences(session.user.id, nextPreferences);
  return NextResponse.json({ ok: true, preferences: savedPreferences });
}