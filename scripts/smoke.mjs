// Headless Chromium smoke test for Istanbul Streets (M1: Fatih Sultanahmet-Eminönü).
// Self-hosts dist/, verifies zero console/page errors, real OSM+DEM tile streaming,
// walking movement, sanctuary zone enforcement, Lite/About/Pause UI, draw call budget,
// and non-blank 3D rasterization.
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { preview } from 'vite';

const OUT = process.env.OUT || 'smoke.png';
const SIM_DURATION_MS = Number(process.env.SMOKE_DURATION_MS || '8000');

const server = process.env.URL
  ? null
  : await preview({
      preview: { host: '127.0.0.1', port: 5181 },
    });
const URL = process.env.URL || server.resolvedUrls.local[0];

const browser = await chromium.launch({
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--use-gl=angle',
  ],
});

const fail = (msg) => {
  console.error('SMOKE FAIL:', msg);
  process.exitCode = 1;
};

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
      (window.__game?.perf?.loadedTiles ?? 0) >= 1 &&
      (window.__game?.perf?.activeBuildings ?? 0) >= 20,
    { timeout: 20000 },
  );
  await page.waitForTimeout(800);

  const initialPos = await page.evaluate(() => ({ ...window.__game.player }));

  // Walk & sprint through Sultanahmet Square
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyE');
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');

  const movedPos = await page.evaluate(() => ({ ...window.__game.player }));
  const movedDist = Math.hypot(movedPos.x - initialPos.x, movedPos.z - initialPos.z);

  // Verify Ayasofya sanctuary zone activates when inside precinct
  await page.evaluate(() => window.__game.teleportTo(385.2, -38.8));
  await page.waitForTimeout(600);
  const sanctuaryAtAyasofya = await page.evaluate(() => window.__game.sanctuaryId);

  // Return to Sultanahmet Square spawn for screenshot & remaining walkthrough
  await page.evaluate(() => window.__game.teleportTo(31.5, 229.7));
  await page.waitForTimeout(800);

  // Verify Lite mode toggle
  const beforeTier = await page.evaluate(() => window.__game.qualityTier);
  await page.getByTestId('btn-quality').click();
  await page.waitForTimeout(250);
  const toggledTier = await page.evaluate(() => window.__game.qualityTier);
  await page.getByTestId('btn-quality').click();
  await page.waitForTimeout(250);

  // Verify About & Attributions modal
  await page.getByTestId('btn-about').click();
  await page.waitForTimeout(200);
  const aboutText = await page.evaluate(() => document.body.innerText);
  const hasAttributions =
    aboutText.includes('OpenStreetMap') &&
    aboutText.includes('İBB') &&
    aboutText.includes('Copernicus');
  await page.getByTestId('modal-close').click();
  await page.waitForTimeout(200);

  // Verify Pause toggle via Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const isPaused = await page.evaluate(() => window.__game.paused);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Run remaining simulated gameplay window
  const remaining = Math.max(800, SIM_DURATION_MS - 3500);
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(Math.floor(remaining / 2));
  await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(Math.ceil(remaining / 2));
  await page.keyboard.up('KeyW');

  const snapshot = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return {
      hasCanvas: Boolean(c),
      canvasW: c?.width ?? 0,
      canvasH: c?.height ?? 0,
      version: window.__game?.version ?? null,
      regionId: window.__game?.regionId ?? null,
      regionLoaded: window.__game?.regionLoaded ?? false,
      physicsReady: window.__game?.physicsReady ?? false,
      crashCount: window.__game?.getCrashCount() ?? -1,
      perf: window.__game?.perf ?? null,
    };
  });

  const shot = await page.screenshot();
  writeFileSync(OUT, shot);
  const png = PNG.sync.read(shot);

  const colors = new Set();
  let bright = 0;
  const stride = 4 * 7;
  for (let i = 0; i < png.data.length; i += stride) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    colors.add(`${r >> 3},${g >> 3},${b >> 3}`);
    if (r + g + b > 360) bright += 1;
  }
  const sampled = Math.floor(png.data.length / stride);
  const brightFrac = bright / sampled;

  const report = {
    snapshot,
    movedDist: Number(movedDist.toFixed(2)),
    sanctuaryAtAyasofya,
    qualityToggleOk: beforeTier !== toggledTier,
    hasAttributions,
    pauseToggleOk: isPaused === true,
    uniqueColors: colors.size,
    brightFrac: Number(brightFrac.toFixed(4)),
    errors,
  };

  console.log('SMOKE_REPORT', JSON.stringify(report, null, 2));
  writeFileSync('smoke-report.json', JSON.stringify(report, null, 2));

  if (errors.length > 0) fail(`${errors.length} console/page error(s)`);
  if (!snapshot.hasCanvas || snapshot.canvasW === 0 || snapshot.canvasH === 0) {
    fail('Canvas missing or zero size');
  }
  if (!snapshot.regionLoaded) fail('Offline Fatih region did not load');
  if (!snapshot.physicsReady) fail('Rapier3D physics did not initialize');
  if ((snapshot.perf?.loadedTiles ?? 0) < 1) fail('No 300m tiles streamed');
  if ((snapshot.perf?.activeBuildings ?? 0) < 20) {
    fail(`Too few real OSM buildings loaded: ${snapshot.perf?.activeBuildings}`);
  }
  if (sanctuaryAtAyasofya !== 'ayasofya') {
    fail(`Sanctuary zone did not activate at Ayasofya (got ${sanctuaryAtAyasofya})`);
  }
  if (snapshot.crashCount !== 0) fail(`Unexpected crash log entries: ${snapshot.crashCount}`);
  if (movedDist < 0.5) fail(`Player did not move on input (movedDist=${movedDist})`);
  if (beforeTier === toggledTier) fail('Lite/Normal quality toggle did not change state');
  if (!hasAttributions) fail('About modal missing required OSM/İBB/Copernicus attributions');
  if (!isPaused) fail('Escape key did not pause the game');
  if ((snapshot.perf?.drawCalls ?? 999) > 150) {
    fail(`Draw calls exceeded 150 budget: ${snapshot.perf?.drawCalls}`);
  }
  if (colors.size < 40) fail(`Rendered scene looks blank/flat (${colors.size} unique colors)`);
  if (brightFrac < 0.01) fail(`Rendered scene too dark (brightFrac=${brightFrac})`);

  if (!process.exitCode) {
    console.log('SMOKE PASS');
  }
} finally {
  await browser.close();
  server?.httpServer.close();
}
