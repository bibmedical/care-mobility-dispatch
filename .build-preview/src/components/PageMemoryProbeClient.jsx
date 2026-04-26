'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { appendPageMemoryResult, buildMemoryDelta, clearJsonStorage, PAGE_MEMORY_PROBE_ACTIVE_KEY, readBrowserMemorySnapshot, writeJsonStorage } from '@/components/nemt/page-memory-probe';

const readServerMemorySnapshot = async () => {
  try {
    const response = await fetch('/api/health', {
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => null);
    return response.ok ? payload?.memory || null : null;
  } catch {
    return null;
  }
};

const readNavigationSnapshot = () => {
  if (typeof window === 'undefined') return null;
  const navigationEntry = window.performance?.getEntriesByType?.('navigation')?.[0];
  if (!navigationEntry) return null;

  return {
    type: navigationEntry.type,
    domContentLoadedMs: Math.round(Number(navigationEntry.domContentLoadedEventEnd) || 0),
    loadEventMs: Math.round(Number(navigationEntry.loadEventEnd) || 0),
    transferSizeKb: Math.round((Number(navigationEntry.transferSize) || 0) / 1024)
  };
};

const PageMemoryProbeClient = () => {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const activeProbe = (() => {
      try {
        const raw = window.localStorage.getItem(PAGE_MEMORY_PROBE_ACTIVE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    })();

    if (!activeProbe?.runId || !activeProbe?.targetPath) return undefined;
    if (activeProbe.targetPath !== pathname) return undefined;
    if (activeProbe.status === 'measuring') return undefined;

    writeJsonStorage(PAGE_MEMORY_PROBE_ACTIVE_KEY, {
      ...activeProbe,
      status: 'measuring'
    });

    let cancelled = false;
    const waitMs = Math.max(600, Number(activeProbe.waitMs) || 1600);

    const timeoutId = window.setTimeout(async () => {
      if (cancelled) return;

      const browserMemory = readBrowserMemorySnapshot();
      const serverMemory = await readServerMemorySnapshot();
      const navigation = readNavigationSnapshot();

      const nextResult = {
        runId: activeProbe.runId,
        targetPath: activeProbe.targetPath,
        startedAt: activeProbe.startedAt,
        measuredAt: new Date().toISOString(),
        baselinePath: activeProbe.baselinePath,
        browserMemory: browserMemory ? {
          ...browserMemory,
          deltaJsHeapUsedMb: buildMemoryDelta(activeProbe?.baselineBrowserMemory?.jsHeapUsedMb, browserMemory.jsHeapUsedMb),
          deltaJsHeapTotalMb: buildMemoryDelta(activeProbe?.baselineBrowserMemory?.jsHeapTotalMb, browserMemory.jsHeapTotalMb)
        } : null,
        serverMemory: serverMemory ? {
          ...serverMemory,
          deltaRssMb: buildMemoryDelta(activeProbe?.baselineServerMemory?.rssMb, serverMemory.rssMb),
          deltaHeapUsedMb: buildMemoryDelta(activeProbe?.baselineServerMemory?.heapUsedMb, serverMemory.heapUsedMb),
          deltaExternalMb: buildMemoryDelta(activeProbe?.baselineServerMemory?.externalMb, serverMemory.externalMb)
        } : null,
        navigation
      };

      appendPageMemoryResult(nextResult);
      clearJsonStorage(PAGE_MEMORY_PROBE_ACTIVE_KEY);

      if (activeProbe.returnPath) {
        router.replace(`${activeProbe.returnPath}?probe=${encodeURIComponent(activeProbe.runId)}`);
      }
    }, waitMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [pathname, router]);

  return null;
};

export default PageMemoryProbeClient;