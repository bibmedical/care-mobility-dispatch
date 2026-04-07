import { NextResponse } from 'next/server';
import { readNemtDispatchThreads } from '@/server/nemt-dispatch-store';

const internalError = error => NextResponse.json({ error: 'Internal server error', details: String(error?.message || error) }, { status: 500 });

export async function GET() {
  try {
    const dispatchThreads = await readNemtDispatchThreads();
    return NextResponse.json({ dispatchThreads });
  } catch (error) {
    return internalError(error);
  }
}
