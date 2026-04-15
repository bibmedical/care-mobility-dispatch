import { NextResponse } from 'next/server';

const formatMb = value => Math.round((Number(value) || 0) / 1024 / 1024);

const buildMemoryPayload = () => {
  const memoryUsage = process.memoryUsage();

  return {
    ok: true,
    service: 'care-mobility-dispatch-web-v2',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    memory: {
      rssMb: formatMb(memoryUsage.rss),
      heapUsedMb: formatMb(memoryUsage.heapUsed),
      heapTotalMb: formatMb(memoryUsage.heapTotal),
      externalMb: formatMb(memoryUsage.external),
      arrayBuffersMb: formatMb(memoryUsage.arrayBuffers)
    }
  };
};

export function GET() {
  return NextResponse.json(buildMemoryPayload());
}

export async function POST() {
  const gcAvailable = typeof global.gc === 'function';

  if (gcAvailable) {
    global.gc();
    await new Promise(resolve => setTimeout(resolve, 50));
    global.gc();
  }

  return NextResponse.json({
    ...buildMemoryPayload(),
    resetRequested: true,
    gcAvailable,
    message: gcAvailable ? 'Server garbage collection executed.' : 'Server garbage collection is not exposed in this runtime.'
  });
}