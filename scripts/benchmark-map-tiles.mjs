#!/usr/bin/env node

import { performance } from 'node:perf_hooks';

const SAMPLE_TILES = [
  { z: 11, x: 562, y: 828 },
  { z: 12, x: 1125, y: 1657 },
  { z: 13, x: 2251, y: 3315 },
  { z: 14, x: 4502, y: 6631 },
  { z: 15, x: 9005, y: 13262 }
];

const DEFAULT_TIMEOUT_MS = 12000;

const normalizeBaseUrl = value => String(value || '').trim();

const localTileUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_LOCAL_TILE_URL);

const providers = [
  {
    name: 'external-osm-light',
    urlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    enabled: true
  },
  {
    name: 'external-carto-dark',
    urlTemplate: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    enabled: true
  },
  {
    name: 'local-server',
    urlTemplate: localTileUrl,
    enabled: Boolean(localTileUrl)
  }
].filter(provider => provider.enabled);

if (providers.length === 0) {
  console.error('No tile providers configured. Set NEXT_PUBLIC_LOCAL_TILE_URL for local benchmark.');
  process.exit(1);
}

const randomSubdomain = () => ['a', 'b', 'c'][Math.floor(Math.random() * 3)];

const resolveTileUrl = (template, tile) => {
  const url = String(template || '');
  return url
    .replaceAll('{s}', randomSubdomain())
    .replaceAll('{z}', String(tile.z))
    .replaceAll('{x}', String(tile.x))
    .replaceAll('{y}', String(tile.y))
    .replaceAll('{r}', '');
};

const fetchWithTimeout = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store'
    });

    const buffer = await response.arrayBuffer();
    const endedAt = performance.now();

    return {
      ok: response.ok,
      status: response.status,
      durationMs: endedAt - startedAt,
      bytes: buffer.byteLength
    };
  } catch (error) {
    const endedAt = performance.now();
    return {
      ok: false,
      status: 0,
      durationMs: endedAt - startedAt,
      bytes: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
};

const percentile = (values, ratio) => {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
};

const benchmarkProvider = async provider => {
  const attempts = [];

  for (const tile of SAMPLE_TILES) {
    const tileUrl = resolveTileUrl(provider.urlTemplate, tile);
    const result = await fetchWithTimeout(tileUrl, DEFAULT_TIMEOUT_MS);
    attempts.push({
      tile,
      url: tileUrl,
      ...result
    });
  }

  const successAttempts = attempts.filter(item => item.ok);
  const durations = successAttempts.map(item => item.durationMs);
  const totalBytes = successAttempts.reduce((sum, item) => sum + item.bytes, 0);

  return {
    provider: provider.name,
    attempts,
    successCount: successAttempts.length,
    totalCount: attempts.length,
    avgMs: durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0,
    p95Ms: durations.length > 0 ? percentile(durations, 0.95) : 0,
    minMs: durations.length > 0 ? Math.min(...durations) : 0,
    maxMs: durations.length > 0 ? Math.max(...durations) : 0,
    totalBytes
  };
};

const formatMs = value => `${value.toFixed(1)} ms`;
const formatKb = value => `${(value / 1024).toFixed(1)} KB`;

const printSummary = results => {
  console.log('\nMap Tile Benchmark Results\n');
  console.log('Provider                      Success   Avg         P95         Min         Max         Data');
  console.log('-----------------------------------------------------------------------------------------------');

  for (const result of results) {
    const provider = result.provider.padEnd(28, ' ');
    const success = `${result.successCount}/${result.totalCount}`.padEnd(9, ' ');
    const avg = formatMs(result.avgMs).padEnd(11, ' ');
    const p95 = formatMs(result.p95Ms).padEnd(11, ' ');
    const min = formatMs(result.minMs).padEnd(11, ' ');
    const max = formatMs(result.maxMs).padEnd(11, ' ');
    const data = formatKb(result.totalBytes).padEnd(8, ' ');

    console.log(`${provider}${success}${avg}${p95}${min}${max}${data}`);
  }

  const best = [...results]
    .filter(item => item.successCount > 0)
    .sort((left, right) => left.avgMs - right.avgMs)[0];

  if (best) {
    console.log(`\nFastest average provider: ${best.provider} (${formatMs(best.avgMs)})`);
  } else {
    console.log('\nNo successful tile responses. Check provider URLs and network access.');
  }
};

const printFailures = results => {
  const failedAttempts = results.flatMap(result =>
    result.attempts
      .filter(item => !item.ok)
      .map(item => ({ provider: result.provider, ...item }))
  );

  if (failedAttempts.length === 0) return;

  console.log('\nFailed requests:\n');
  for (const attempt of failedAttempts) {
    const tileLabel = `z${attempt.tile.z}/${attempt.tile.x}/${attempt.tile.y}`;
    const reason = attempt.error || `HTTP ${attempt.status}`;
    console.log(`- ${attempt.provider} ${tileLabel} -> ${reason}`);
  }
};

const main = async () => {
  console.log('Running tile benchmark...');

  const results = [];
  for (const provider of providers) {
    console.log(`Testing ${provider.name}...`);
    results.push(await benchmarkProvider(provider));
  }

  printSummary(results);
  printFailures(results);
};

await main();
