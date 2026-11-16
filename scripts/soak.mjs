// Extended driving & tile-streaming soak test (default 10 min via SOAK_MINUTES=10).
// Enters the Sarı Taksi in Esenler / Namık Kemal, drives continuously across 300m tiles,
// checks JS heap drift, GPU geometry/texture leaks, draw-call ceiling, and zero console errors.
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { preview } from 'vite';

const SOAK_MINUTES = Number(process.env.SOAK_MINUTES || '10');
const SAMPLE_INTERVAL_MS = 15000;
const TOTAL_MS = Math.max(15000, Math.round(SOAK_MINUTES * 60 * 1000));
const OUT_REPORT = process.env.SOAK_OUT || 'soak-report.json';

const server = process.env.URL
  ? null
  : await preview({
      preview: { host: '127.0.0.1', port: 5182 },
    });
const URL = process.env.URL || server.resolvedUrls.local[0];

const browser = await chromium.launch({
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--use-gl=angle',
    '--enable-precise-memory-info',
  ],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(
    () =>
      Boolean(window.__game?.regionLoaded) &&
      Boolean(window.__game?.physicsReady) &&
      (window.__game?.perf?.loadedTiles ?? 0) >= 1,
    { timeout: 25000 },
  );

  // Enter player taxi so soak continuously stresses M2 driving + traffic + tile streaming
  await page.evaluate(() => window.__game.enterVehicle());

  const samples = [];
  const start = Date.now();
  const maneuvers = [
    ['KeyW'],
    ['KeyW', 'KeyD'],
    ['KeyW'],
    ['KeyW', 'KeyA'],
    ['KeyS', 'KeyD'],
  ];
  let idx = 0;

  while (Date.now() - start < TOTAL_MS) {
    const keys = maneuvers[idx % maneuvers.length];
    idx += 1;
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(Math.min(SAMPLE_INTERVAL_MS, Math.max(1000, TOTAL_MS - (Date.now() - start))));
    for (const k of keys) await page.keyboard.up(k);

    const sample = await page.evaluate(() => {
      const mem = performance.memory;
      return {
        regionId: window.__game?.regionId ?? null,
        inVehicle: window.__game?.inVehicle ?? false,
        speedKph: window.__game?.speedKph ?? 0,
        perf: window.__game?.perf ?? null,
        usedHeapMb: mem ? Number((mem.usedJSHeapSize / (1024 * 1024)).toFixed(2)) : null,
      };
    });
    samples.push({ elapsedSec: Math.round((Date.now() - start) / 1000), ...sample });
    console.log('SOAK_SAMPLE', JSON.stringify(samples[samples.length - 1]));
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const maxDrawCalls = Math.max(...samples.map((s) => s.perf?.drawCalls ?? 0));
  const geoDrift = (last?.perf?.geometries ?? 0) - (first?.perf?.geometries ?? 0);
  const texDrift = (last?.perf?.textures ?? 0) - (first?.perf?.textures ?? 0);
  const heapGrowthMb =
    first?.usedHeapMb != null && last?.usedHeapMb != null
      ? Number((last.usedHeapMb - first.usedHeapMb).toFixed(2))
      : null;

  const summary = {
    soakMinutesRequested: SOAK_MINUTES,
    elapsedSec: last?.elapsedSec ?? 0,
    sampleCount: samples.length,
    regionId: first?.regionId ?? null,
    maxDrawCalls,
    firstGeometries: first?.perf?.geometries ?? null,
    lastGeometries: last?.perf?.geometries ?? null,
    geoDrift,
    texDrift,
    firstHeapMb: first?.usedHeapMb ?? null,
    lastHeapMb: last?.usedHeapMb ?? null,
    heapGrowthMb,
    errors,
  };

  writeFileSync(OUT_REPORT, JSON.stringify({ summary, samples }, null, 2));
  console.log('SOAK_SUMMARY', JSON.stringify(summary, null, 2));

  if (errors.length > 0) throw new Error(`${errors.length} console/page errors during soak`);
  if (maxDrawCalls > 150) throw new Error(`Draw calls exceeded 150 budget: ${maxDrawCalls}`);
  if (geoDrift > 24 || texDrift > 4) {
    throw new Error(`GPU resource leak: geoDrift=${geoDrift}, texDrift=${texDrift}`);
  }
  if (heapGrowthMb !== null && heapGrowthMb > 65) {
    throw new Error(`JS heap grew by ${heapGrowthMb} MB during soak`);
  }
  console.log('SOAK PASS');
} finally {
  await browser.close();
  server?.httpServer.close();
}
