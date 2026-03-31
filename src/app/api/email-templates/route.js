import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isAdminRole } from '@/helpers/system-users';
import { getDefaultTemplates, readEmailTemplates, writeEmailTemplates } from '@/server/email-templates-store';

const unauthorized = () => NextResponse.json({ error: 'Authentication required' }, { status: 401 });
const forbidden = () => NextResponse.json({ error: 'Admin access required' }, { status: 403 });

export async function GET() {
  const session = await getServerSession(options);
  if (!session?.user?.id) return unauthorized();

  const templates = await readEmailTemplates();
  return NextResponse.json({ templates, defaults: getDefaultTemplates() });
}

export async function PUT(request) {
  const session = await getServerSession(options);
  if (!session?.user?.id) return unauthorized();
  if (!isAdminRole(session?.user?.role)) return forbidden();

  const { templates } = await request.json();
  if (!templates || typeof templates !== 'object') {
    return NextResponse.json({ error: 'Invalid templates object' }, { status: 400 });
  }

  const saved = await writeEmailTemplates(templates);
  return NextResponse.json({ templates: saved, ok: true });
}
