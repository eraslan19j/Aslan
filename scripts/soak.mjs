// Extended soak test (default 10 minutes via SOAK_MINUTES=10) checking for memory leaks,
// draw-call drift, GPU geometry/texture leaks, and zero console errors.
import { chromium } from 'playwright';
import { preview } from 'vite';

const SOAK_MINUTES = Number(process.env.SOAK_MINUTES || '10');
const SAMPLE_INTERVAL_MS = 15000;
const TOTAL_MS = Math.max(15000, Math.round(SOAK_MINUTES * 60 * 1000));

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
    () => Boolean(window.__game?.regionLoaded) && Boolean(window.__game?.physicsReady),
    { timeout: 20000 },
  );

  const samples = [];
  const start = Date.now();
  const keys = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
  let keyIndex = 0;

  while (Date.now() - start < TOTAL_MS) {
    const k = keys[keyIndex % keys.length];
    keyIndex += 1;
    await page.keyboard.down(k);
    await page.waitForTimeout(Math.min(SAMPLE_INTERVAL_MS, TOTAL_MS - (Date.now() - start)));
    await page.keyboard.up(k);

    const sample = await page.evaluate(() => {
      const mem = performance.memory;
      return {
        perf: window.__game?.perf ?? null,
        usedHeapMb: mem ? Number((mem.usedJSHeapSize / (1024 * 1024)).toFixed(2)) : null,
      };
    });
    samples.push({ elapsedSec: Math.round((Date.now() - start) / 1000), ...sample });
    console.log('SOAK_SAMPLE', JSON.stringify(samples[samples.length - 1]));
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const geoDrift = (last?.perf?.geometries ?? 0) - (first?.perf?.geometries ?? 0);
  const texDrift = (last?.perf?.textures ?? 0) - (first?.perf?.textures ?? 0);
  const heapGrowthMb =
    first?.usedHeapMb != null && last?.usedHeapMb != null
      ? Number((last.usedHeapMb - first.usedHeapMb).toFixed(2))
      : null;

  console.log('SOAK_SUMMARY', JSON.stringify({ samples: samples.length, geoDrift, texDrift, heapGrowthMb, errors }, null, 2));

  if (errors.length > 0) throw new Error(`${errors.length} console/page errors during soak`);
  if (geoDrift > 18 || texDrift > 4) {
    throw new Error(`GPU resource leak: geoDrift=${geoDrift}, texDrift=${texDrift}`);
  }
  if (heapGrowthMb !== null && heapGrowthMb > 60) {
    throw new Error(`JS heap grew by ${heapGrowthMb} MB during soak`);
  }
  console.log('SOAK PASS');
} finally {
  await browser.close();
  server?.httpServer.close();
}
