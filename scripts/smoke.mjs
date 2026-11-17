// Headless Chromium smoke test for Istanbul Streets (v0.2.0: Esenler default + Fatih + M2 driving & traffic).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { preview } from 'vite';

const OUT = process.env.OUT || 'smoke.png';
const SIM_DURATION_MS = Number(process.env.SMOKE_DURATION_MS || '8000');

const esenlerManifest = JSON.parse(
  readFileSync(
    join(process.cwd(), 'public', 'derived-data', 'esenler-namik-kemal', 'manifest.json'),
    'utf8',
  ),
);

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
    { timeout: 25000 },
  );
  await page.waitForTimeout(800);

  const initialRegion = await page.evaluate(() => window.__game.regionId);
  const initialHudText = await page.getByTestId('location-telemetry').innerText();
  const hudFreeOfDirectDistrictName = !/esenler|namık/i.test(initialHudText);
  const hasMinimap = await page.getByTestId('minimap-radar').isVisible();
  const initialPos = await page.evaluate(() => ({ ...window.__game.player }));

  // Check camera cycling (C) & audio mute toggle (M) + horn (H)
  const camBefore = await page.evaluate(() => window.__game.cameraView);
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(80);
  const camAfter = await page.evaluate(() => window.__game.cameraView);
  // Cycle back to chase for normal walk/drive test
  await page.keyboard.press('KeyC');
  await page.keyboard.press('KeyC');
  await page.keyboard.press('KeyC');
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(60);
  const audioMutedAfterM = await page.evaluate(() => window.__game.audioMuted);
  await page.keyboard.press('KeyM');
  await page.keyboard.press('KeyH');

  // 1. On-foot walk in Esenler Namık Kemal
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  const walkedPos = await page.evaluate(() => ({ ...window.__game.player }));
  const walkDist = Math.hypot(walkedPos.x - initialPos.x, walkedPos.z - initialPos.z);

  // 2. Enter Yellow Taxi, drive along street until >= 2.5m (SwiftShader-safe), then exit
  await page.evaluate(() => window.__game.enterVehicle());
  const driveStart = await page.evaluate(() => ({ ...window.__game.vehicle }));
  await page.keyboard.down('KeyW');
  await page.waitForFunction(
    ([sx, sz]) => {
      const v = window.__game?.vehicle;
      return v ? Math.hypot(v.x - sx, v.z - sz) >= 2.5 : false;
    },
    [driveStart.x, driveStart.z],
    { timeout: 15000 },
  );
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(350);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyW');
  const driveState = await page.evaluate(() => ({
    inVehicle: window.__game.inVehicle,
    speedKph: window.__game.speedKph,
    trafficCount: window.__game.trafficCount,
    vehicle: { ...window.__game.vehicle },
  }));
  const driveDist = Math.hypot(
    driveState.vehicle.x - driveStart.x,
    driveState.vehicle.z - driveStart.z,
  );
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(100);
  const exitedOk = await page.evaluate(() => window.__game.inVehicle === false);

  // 3. Verify automatic amenity=place_of_worship Sanctuary Zone in Esenler
  const firstSanctuary = esenlerManifest.sanctuaryZones[0];
  await page.evaluate(
    ([sx, sz]) => window.__game.teleportTo(sx, sz),
    [firstSanctuary.x, firstSanctuary.z],
  );
  await page.waitForTimeout(100);
  const esenlerSanctuaryId = await page.evaluate(() => window.__game.sanctuaryId);

  // 4. Verify Settings & Diagnostics Panel JSON report
  await page.getByTestId('btn-settings').click();
  await page.waitForTimeout(250);
  const diagJsonText = await page.getByTestId('diagnostics-json').innerText();
  const diagParsed = JSON.parse(diagJsonText);
  const diagOk =
    typeof diagParsed.fps === 'number' &&
    typeof diagParsed.drawCalls === 'number' &&
    typeof diagParsed.gpuRenderer === 'string' &&
    typeof diagParsed.webViewVersion === 'string';
  await page.getByTestId('modal-close').click();
  await page.waitForTimeout(200);

  // 5. Verify About modal ODbL + OpenStreetMap + Copernicus + İBB attributions
  await page.getByTestId('btn-about').click();
  await page.waitForTimeout(200);
  const aboutText = await page.evaluate(() => document.body.innerText);
  const hasAttributions =
    aboutText.includes('OpenStreetMap') &&
    aboutText.includes('ODbL') &&
    aboutText.includes('Copernicus') &&
    aboutText.includes('İBB');
  await page.getByTestId('modal-close').click();
  await page.waitForTimeout(200);

  // 6. Verify Pause + Region Switch to Fatih (second region preserved!) and back to Esenler
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const isPaused = await page.evaluate(() => window.__game.paused);
  await page.getByTestId('region-fatih-sultanahmet-eminonu').click();
  await page.waitForFunction(
    () =>
      window.__game?.regionId === 'fatih-sultanahmet-eminonu' &&
      (window.__game?.perf?.loadedTiles ?? 0) >= 1 &&
      (window.__game?.perf?.activeBuildings ?? 0) >= 20,
    { timeout: 20000 },
  );
  await page.waitForTimeout(500);
  const fatihSwitchedOk = await page.evaluate(
    () => window.__game.regionId === 'fatih-sultanahmet-eminonu',
  );

  // Switch back to Esenler default for final snapshot & screenshot
  await page.evaluate(() => window.__game.switchRegion('esenler-namik-kemal'));
  await page.waitForFunction(
    () =>
      window.__game?.regionId === 'esenler-namik-kemal' &&
      (window.__game?.perf?.loadedTiles ?? 0) >= 1 &&
      (window.__game?.perf?.activeBuildings ?? 0) >= 20,
    { timeout: 20000 },
  );

  // Quality toggle check
  const beforeTier = await page.evaluate(() => window.__game.qualityTier);
  await page.getByTestId('btn-quality').click();
  await page.waitForTimeout(250);
  const toggledTier = await page.evaluate(() => window.__game.qualityTier);
  await page.getByTestId('btn-quality').click();
  await page.waitForTimeout(Math.max(400, Math.min(1200, SIM_DURATION_MS - 5000)));

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
      trafficCount: window.__game?.trafficCount ?? 0,
      pedestrianCount: window.__game?.pedestrianCount ?? 0,
      activeMissionPhase: window.__game?.activeMissionPhase ?? null,
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
    initialRegion,
    initialHudText,
    hudFreeOfDirectDistrictName,
    hasMinimap,
    cameraCycleOk: camBefore !== camAfter,
    audioToggleOk: audioMutedAfterM === true,
    walkDist: Number(walkDist.toFixed(2)),
    driveDist: Number(driveDist.toFixed(2)),
    driveSpeedKph: driveState.speedKph,
    exitedOk,
    esenlerSanctuaryId,
    fatihSwitchedOk,
    diagOk,
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
  if (initialRegion !== 'esenler-namik-kemal') {
    fail(`Expected default start region esenler-namik-kemal, got ${initialRegion}`);
  }
  if (!hudFreeOfDirectDistrictName) {
    fail(`HUD leaked direct district name: ${initialHudText}`);
  }
  if (!hasMinimap) fail('Minimap radar canvas is not visible');
  if (camBefore === camAfter) fail('Camera angle cycle (KeyC) did not change view');
  if (!audioMutedAfterM) fail('Audio mute toggle (KeyM) did not mute sound');
  if ((snapshot.pedestrianCount ?? 0) < 10) {
    fail(`Too few sidewalk pedestrians: ${snapshot.pedestrianCount}`);
  }
  if (!snapshot.activeMissionPhase) fail('No active Sarı Taksi fare mission generated');
  if (!snapshot.hasCanvas || snapshot.canvasW === 0 || snapshot.canvasH === 0) {
    fail('Canvas missing or zero size');
  }
  if (!snapshot.regionLoaded) fail('Offline region did not load');
  if (!snapshot.physicsReady) fail('Rapier3D physics did not initialize');
  if ((snapshot.perf?.loadedTiles ?? 0) < 1) fail('No 300m tiles streamed');
  if ((snapshot.perf?.activeBuildings ?? 0) < 20) {
    fail(`Too few real OSM buildings loaded: ${snapshot.perf?.activeBuildings}`);
  }
  if (walkDist < 0.5) fail(`Player did not walk on input (walkDist=${walkDist})`);
  if (driveDist < 2.0) fail(`Vehicle did not drive on input (driveDist=${driveDist})`);
  if (!exitedOk) fail('KeyF did not exit player vehicle');
  if ((snapshot.trafficCount ?? 0) < 5) fail(`Too few AI traffic vehicles: ${snapshot.trafficCount}`);
  if (esenlerSanctuaryId !== firstSanctuary.id) {
    fail(`Esenler worship sanctuary did not activate (got ${esenlerSanctuaryId})`);
  }
  if (!fatihSwitchedOk) fail('Region switch to Fatih failed');
  if (!diagOk) fail('Diagnostics panel JSON incomplete');
  if (snapshot.crashCount !== 0) fail(`Unexpected crash log entries: ${snapshot.crashCount}`);
  if (beforeTier === toggledTier) fail('Lite/Normal quality toggle did not change state');
  if (!hasAttributions) fail('About modal missing required OSM/ODbL/Copernicus/İBB attributions');
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
