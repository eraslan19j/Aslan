#!/usr/bin/env node
/**
 * sync-version.mjs — Tek sürüm kaynağından (version.json) diğer dosyalara yazar.
 *
 * Kullanım:
 *   node scripts/sync-version.mjs           # yazar (sync)
 *   node scripts/sync-version.mjs --check   # yazmaz, yalnızca doğrular (CI)
 *
 * Neden: v0.9.1'e kadar sürüm 6 farklı yerde tutuluyordu ve birbirinden ayrışmıştı
 * (package.json 0.8.0, build.gradle 0.9.1, strings.ts hem 0.8.0 hem 0.9.1).
 * Bu script tek kaynak ilkesini zorunlu kılar.
 *
 * Hedefler:
 *   1. package.json                          -> "version"
 *   2. src/main.ts                           -> const APP_VERSION = '...'
 *   3. android/app/build.gradle              -> versionCode + versionName
 *   4. src/i18n/strings.ts                   -> milestoneTag + aboutSubtitle (tr + en)
 *   5. README.md                             -> sürüm başlığı
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const p = (rel) => resolve(ROOT, rel);
const read = (rel) => readFileSync(p(rel), 'utf8');

const meta = JSON.parse(read('version.json'));
const VERSION = meta.version;
const CODE = String(meta.versionCode);

if (!/^\d+\.\d+\.\d+$/.test(VERSION)) {
  console.error(`❌ version.json: geçersiz sürüm "${VERSION}" (beklenen X.Y.Z)`);
  process.exit(1);
}
if (!/^\d+$/.test(CODE)) {
  console.error(`❌ version.json: geçersiz versionCode "${CODE}"`);
  process.exit(1);
}

/** Her hedef: { file, label, pattern (bulucu), build(match) -> replacement } */
const targets = [
  {
    file: 'package.json',
    label: 'package.json version',
    pattern: /"version":\s*"[^"]*"/,
    build: () => `"version": "${VERSION}"`,
  },
  {
    file: 'src/main.ts',
    label: 'src/main.ts APP_VERSION',
    pattern: /const APP_VERSION = '[^']*';/,
    build: () => `const APP_VERSION = '${VERSION}';`,
  },
  {
    file: 'android/app/build.gradle',
    label: 'build.gradle versionCode',
    pattern: /versionCode \d+/,
    build: () => `versionCode ${CODE}`,
  },
  {
    file: 'android/app/build.gradle',
    label: 'build.gradle versionName',
    pattern: /versionName "[^"]*"/,
    build: () => `versionName "${VERSION}"`,
  },
  // Godot export preset — 2026-11-19'da eklendi.
  // Bu hedef YOKKEN APK'da 0.10.0 kalırken proje 0.10.1'e çıkmıştı:
  // Faz 0'ın öldürmesi gereken "sürüm ayrışması" hatasının aynısı.
  // Godot export sürümü preset dosyasından okur, project.godot'tan DEĞİL.
  {
    file: 'godot/export_presets.cfg',
    label: 'Godot export versionCode',
    pattern: /^version\/code=\d+$/m,
    build: () => `version/code=${CODE}`,
  },
  {
    file: 'godot/export_presets.cfg',
    label: 'Godot export versionName',
    pattern: /^version\/name="[^"]*"$/m,
    build: () => `version/name="${VERSION}"`,
  },
  {
    file: 'src/i18n/strings.ts',
    label: 'strings.ts milestoneTag (tr)',
    pattern: /milestoneTag: 'v[0-9.]+ · Hasar & Ses'/,
    build: () => `milestoneTag: 'v${VERSION} · Hasar & Ses'`,
  },
  {
    file: 'src/i18n/strings.ts',
    label: 'strings.ts milestoneTag (en)',
    pattern: /milestoneTag: 'v[0-9.]+ · Damage & Audio'/,
    build: () => `milestoneTag: 'v${VERSION} · Damage & Audio'`,
  },
  {
    file: 'src/i18n/strings.ts',
    label: 'strings.ts aboutSubtitle (tr)',
    pattern: /'Istanbul Streets v[0-9.]+ — 240 Hz 4-teker Pacejka/,
    build: () => `'Istanbul Streets v${VERSION} — 240 Hz 4-teker Pacejka`,
  },
  {
    file: 'src/i18n/strings.ts',
    label: 'strings.ts aboutSubtitle (en)',
    pattern: /'Istanbul Streets v[0-9.]+ — 240 Hz 4-wheel Pacejka/,
    build: () => `'Istanbul Streets v${VERSION} — 240 Hz 4-wheel Pacejka`,
  },
  {
    file: 'README.md',
    label: 'README.md sürüm başlığı',
    pattern: /\*\*`v[0-9.]+`\s+"Hasar & Ses"\*\*/,
    build: () => `**\`v${VERSION}\` "Hasar & Ses"**`,
  },
];

const mismatches = [];
/** file -> { text, changed } */
const buffers = new Map();

for (const t of targets) {
  if (!buffers.has(t.file)) {
    buffers.set(t.file, { text: read(t.file), changed: false });
  }
  const buf = buffers.get(t.file);
  if (!t.pattern.test(buf.text)) {
    mismatches.push(`${t.file}: "${t.label}" deseni bulunamadı (dosya yapısı değişmiş olabilir)`);
    continue;
  }
  const before = buf.text;
  buf.text = buf.text.replace(t.pattern, t.build());
  if (buf.text !== before) buf.changed = true;

  const current = before.match(t.pattern)?.[0] ?? '';
  const expected = t.build();
  if (current !== expected) {
    mismatches.push(
      `${t.file} [${t.label}]: "${current}" → beklenen "${expected}"`,
    );
  }
}

if (CHECK) {
  if (mismatches.length > 0) {
    console.error(`❌ Sürüm kaynakları ayrışmış (${mismatches.length} uyumsuzluk):\n`);
    for (const m of mismatches) console.error(`   • ${m}`);
    console.error('\n   Düzeltmek için: npm run version:sync');
    process.exit(1);
  }
  console.log(`✅ Sürüm kaynakları eşit: v${VERSION} (code ${CODE}) — ${targets.length} hedef doğrulandı`);
  process.exit(0);
}

let written = 0;
for (const [file, buf] of buffers) {
  if (buf.changed) {
    writeFileSync(p(file), buf.text, 'utf8');
    console.log(`✏️  ${file} güncellendi`);
    written++;
  }
}

console.log(
  written === 0
    ? `✅ Zaten güncel: v${VERSION} (code ${CODE})`
    : `✅ ${written} dosya senkronize edildi → v${VERSION} (code ${CODE})`,
);
