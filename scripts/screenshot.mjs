// Visual QA & Pixel Regression Screenshot Suite (M1.5).
// Captures 6 standardized camera viewpoints per region (Esenler + Fatih = 12 shots)
// plus 20:9 mobile driving & diagnostics shots, checks HUD overflow/overlap,
// compares against reference PNGs if available, and writes qa-summary.{json,md}.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { preview } from 'vite';

const OUT_DIR = process.env.QA_OUT_DIR || 'qa-out/web';
const REF_DIR = process.env.QA_REF_DIR || 'qa-ref/web';
const DIFF_WARN_THRESHOLD_PCT = Number(process.env.VISUAL_DIFF_THRESHOLD_PCT || '6.0');
const REGIONS = ['esenler-namik-kemal', 'fatih-sultanahmet-eminonu'];

mkdirSync(OUT_DIR, { recursive: true });

const server = process.env.URL
  ? null
  : await preview({
      preview: { host: '127.0.0.1', port: 5183 },
    });
const BASE_URL = (process.env.URL || server.resolvedUrls.local[0]).replace(/\/$/, '');

const browser = await chromium.launch({
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--use-gl=angle',
  ],
});

function analyzePng(buf) {
  const png = PNG.sync.read(buf);
  const colors = new Set();
  let bright = 0;
  const stride = 4 * 9;
  for (let i = 0; i < png.data.length; i += stride) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    colors.add(`${r >> 3},${g >> 3},${b >> 3}`);
    if (r + g + b > 340) bright += 1;
  }
  const sampled = Math.max(1, Math.floor(png.data.length / stride));
  return {
    width: png.width,
    height: png.height,
    uniqueColors: colors.size,
    brightFrac: Number((bright / sampled).toFixed(4)),
    png,
  };
}

function compareWithReference(name, currentPng) {
  const refPath = join(REF_DIR, name);
  if (!existsSync(refPath)) {
    return { hasReference: false, diffPct: null, warning: false };
  }
  try {
    const refPng = PNG.sync.read(readFileSync(refPath));
    if (refPng.width !== currentPng.width || refPng.height !== currentPng.height) {
      return {
        hasReference: true,
        diffPct: 100,
        warning: true,
        reason: `Resolution changed ${refPng.width}x${refPng.height} -> ${currentPng.width}x${currentPng.height}`,
      };
    }
    const totalPixels = currentPng.width * currentPng.height;
    let changed = 0;
    for (let i = 0; i < currentPng.data.length; i += 4) {
      const dr = Math.abs(currentPng.data[i] - refPng.data[i]);
      const dg = Math.abs(currentPng.data[i + 1] - refPng.data[i + 1]);
      const db = Math.abs(currentPng.data[i + 2] - refPng.data[i + 2]);
      if (dr > 24 || dg > 24 || db > 24) changed += 1;
    }
    const diffPct = Number(((changed / totalPixels) * 100).toFixed(2));
    return {
      hasReference: true,
      diffPct,
      warning: diffPct > DIFF_WARN_THRESHOLD_PCT,
    };
  } catch (err) {
    return { hasReference: false, diffPct: null, warning: false, error: String(err) };
  }
}

async function checkHudLayout(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const issues = [];
    const card = document.querySelector('.hud-card');
    const actions = document.querySelector('.hud-actions');
    if (card && actions) {
      const r1 = card.getBoundingClientRect();
      const r2 = actions.getBoundingClientRect();
      if (r1.right > r2.left && r1.bottom > r2.top && r2.right > r1.left && r2.bottom > r1.top) {
        issues.push('HUD card overlaps top action buttons');
      }
      if (r1.right > vw + 1 || r2.right > vw + 1) {
        issues.push('Top HUD overflows viewport width');
      }
    }
    const btns = document.querySelectorAll('.hud-btn');
    for (const btn of btns) {
      const r = btn.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (r.right > vw + 1 || r.bottom > vh + 1)) {
        issues.push(`Button "${btn.textContent}" clips outside viewport`);
      }
    }
    const minimap = document.querySelector('.minimap-canvas');
    if (minimap) {
      const rm = minimap.getBoundingClientRect();
      if (rm.right > vw + 1 || rm.bottom > vh + 1 || rm.left < -1 || rm.top < -1) {
        issues.push('Minimap radar clips outside viewport');
      }
      if (card) {
        const rc = card.getBoundingClientRect();
        if (rm.right > rc.left && rm.bottom > rc.top && rc.right > rm.left && rc.bottom > rm.top) {
          issues.push('Minimap overlaps HUD card');
        }
      }
    }
    return issues;
  });
}

const results = [];
const allErrors = [];

try {
  for (const regionId of REGIONS) {
    const slug = regionId === 'esenler-namik-kemal' ? 'esenler' : 'fatih';
    const shots = [
      {
        file: `${slug}_01_start.png`,
        label: 'Başlangıç (3. Şahıs)',
        viewport: { width: 1280, height: 720 },
        query: `?region=${regionId}&touch=0&mode=normal&time=day`,
        setup: async (page) => {
          await page.evaluate(() => window.__game.setCameraMode('follow'));
        },
      },
      {
        file: `${slug}_02_street.png`,
        label: 'Sokak Seviyesi',
        viewport: { width: 1280, height: 720 },
        query: `?region=${regionId}&touch=0&mode=normal&time=day`,
        setup: async (page) => {
          await page.evaluate(() => window.__game.setCameraMode('street'));
        },
      },
      {
        file: `${slug}_03_overview.png`,
        label: 'Geniş Görünüm',
        viewport: { width: 1280, height: 720 },
        query: `?region=${regionId}&touch=0&mode=normal&time=day`,
        setup: async (page) => {
          await page.evaluate(() => window.__game.setCameraMode('overview'));
        },
      },
      {
        file: `${slug}_04_night.png`,
        label: 'Gece Modu',
        viewport: { width: 1280, height: 720 },
        query: `?region=${regionId}&touch=0&mode=normal&time=night`,
        setup: async (page) => {
          await page.evaluate(() => window.__game.setCameraMode('street'));
        },
      },
      {
        file: `${slug}_05_lite.png`,
        label: 'Lite Modu',
        viewport: { width: 1280, height: 720 },
        query: `?region=${regionId}&touch=0&mode=lite&time=day`,
        setup: async (page) => {
          await page.evaluate(() => window.__game.setCameraMode('follow'));
        },
      },
      {
        file: `${slug}_06_touch_20x9.png`,
        label: '20:9 Yatay Dokunmatik',
        viewport: { width: 880, height: 396 },
        query: `?region=${regionId}&touch=1&mode=normal&time=day`,
        setup: async (page) => {
          await page.evaluate(() => window.__game.setCameraMode('follow'));
        },
      },
    ];

    if (regionId === 'esenler-namik-kemal') {
      shots.push(
        {
          file: 'esenler_07_driving_20x9.png',
          label: '20:9 Sürüş Modu (Sarı Taksi)',
          viewport: { width: 880, height: 396 },
          query: `?region=${regionId}&touch=1&mode=normal&time=day`,
          setup: async (page) => {
            await page.evaluate(() => {
              window.__game.enterVehicle();
              window.__game.setCameraMode('follow');
            });
          },
        },
        {
          file: 'esenler_08_diagnostics_20x9.png',
          label: '20:9 Tanılama Paneli (Ayarlar)',
          viewport: { width: 880, height: 396 },
          query: `?region=${regionId}&touch=1&mode=normal&time=day`,
          setup: async (page) => {
            await page.evaluate(() => window.__game.openSettings());
          },
        },
      );
    }

    for (const s of shots) {
      const page = await browser.newPage({ viewport: s.viewport });
      page.setDefaultTimeout(45000);
      const pageErrors = [];
      page.on('console', (m) => {
        if (m.type() === 'error') pageErrors.push(m.text());
      });
      page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));

      await page.goto(`${BASE_URL}/${s.query}`, { waitUntil: 'load', timeout: 40000 });
      await page.waitForFunction(
        () =>
          Boolean(window.__game?.regionLoaded) &&
          (window.__game?.perf?.loadedTiles ?? 0) >= 1 &&
          (window.__game?.perf?.activeBuildings ?? 0) >= 20,
        { timeout: 40000 },
      );
      await s.setup(page);
      await page.waitForTimeout(750);

      const telemetry = await page.evaluate(() => ({
        regionId: window.__game.regionId,
        qualityTier: window.__game.qualityTier,
        timeOfDay: window.__game.timeOfDay,
        drawCalls: window.__game.perf.drawCalls,
        triangles: window.__game.perf.triangles,
        loadedTiles: window.__game.perf.loadedTiles,
        activeBuildings: window.__game.perf.activeBuildings,
      }));
      const hudIssues = await checkHudLayout(page);

      const buf = await page.screenshot();
      writeFileSync(join(OUT_DIR, s.file), buf);
      const analysis = analyzePng(buf);
      const regression = compareWithReference(s.file, analysis.png);

      if (regression.warning) {
        console.log(
          `::warning file=${s.file}::Visual regression diff ${regression.diffPct}% exceeded threshold ${DIFF_WARN_THRESHOLD_PCT}%`,
        );
      }

      if (pageErrors.length > 0) {
        allErrors.push({ file: s.file, errors: pageErrors });
      }

      results.push({
        file: s.file,
        regionId,
        label: s.label,
        viewport: `${s.viewport.width}x${s.viewport.height}`,
        telemetry,
        uniqueColors: analysis.uniqueColors,
        brightFrac: analysis.brightFrac,
        hudIssues,
        regression,
        errors: pageErrors,
      });

      await page.close();
    }
  }

  const summary = {
    generatedAtIso: new Date().toISOString(),
    diffWarnThresholdPct: DIFF_WARN_THRESHOLD_PCT,
    totalScreenshots: results.length,
    totalErrors: allErrors.length,
    regressionWarnings: results.filter((r) => r.regression.warning).length,
    hudWarnings: results.filter((r) => r.hudIssues.length > 0).length,
    screenshots: results,
  };

  writeFileSync(join(OUT_DIR, 'qa-summary.json'), JSON.stringify(summary, null, 2));

  const mdLines = [
    '# Visual QA Screenshot Summary (Playwright SwiftShader)',
    '',
    `Generated: \`${summary.generatedAtIso}\` · Total shots: **${summary.totalScreenshots}** · Console errors: **${summary.totalErrors}** · HUD warnings: **${summary.hudWarnings}** · Regression warnings (>${DIFF_WARN_THRESHOLD_PCT}%): **${summary.regressionWarnings}**`,
    '',
    '> Not: Headless Chromium SwiftShader CPU yazılım rasterizasyonu kullanır; FPS değeri gerçek Android donanımını temsil etmez. Yalnızca görsel, yerleşim, HUD taşması ve hata doğrulaması içindir.',
    '',
    '| Dosya | Bölge | Görünüm | Boyut | Draw / Tris | Karo / Bina | Renk | HUD Sorunu | Piksel Farkı |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of results) {
    const diffStr = r.regression.hasReference
      ? `${r.regression.diffPct}%${r.regression.warning ? ' ⚠' : ' ✓'}`
      : 'ilk referans';
    const hudStr = r.hudIssues.length > 0 ? `⚠ ${r.hudIssues.join('; ')}` : '✓';
    mdLines.push(
      `| \`${r.file}\` | ${r.regionId} | ${r.label} | ${r.viewport} | ${r.telemetry.drawCalls} / ${r.telemetry.triangles} | ${r.telemetry.loadedTiles} / ${r.telemetry.activeBuildings} | ${r.uniqueColors} | ${hudStr} | ${diffStr} |`,
    );
  }
  writeFileSync(join(OUT_DIR, 'qa-summary.md'), `${mdLines.join('\n')}\n`);

  console.log(
    'QA_SCREENSHOT_SUMMARY',
    JSON.stringify({
      totalScreenshots: summary.totalScreenshots,
      totalErrors: summary.totalErrors,
      hudWarnings: summary.hudWarnings,
      regressionWarnings: summary.regressionWarnings,
    }),
  );

  if (allErrors.length > 0) {
    console.error('QA FAIL: console/page errors detected:', JSON.stringify(allErrors, null, 2));
    process.exitCode = 1;
  }
  for (const r of results) {
    if (r.uniqueColors < 30) {
      console.error(`QA FAIL: ${r.file} looks blank (${r.uniqueColors} unique colors)`);
      process.exitCode = 1;
    }
    if (r.telemetry.drawCalls > 150) {
      console.error(`QA FAIL: ${r.file} drawCalls=${r.telemetry.drawCalls} > 150`);
      process.exitCode = 1;
    }
  }
} catch (err) {
  const msg = err instanceof Error ? err.stack || err.message : String(err);
  console.error('QA_SCREENS FATAL EXCEPTION:', msg);
  writeFileSync(join(OUT_DIR, 'qa-summary.md'), `# Visual QA Fatal Error\n\n\`\`\`\n${msg}\n\`\`\`\n`);
  process.exitCode = 1;
} finally {
  await browser.close();
  server?.httpServer.close();
}
