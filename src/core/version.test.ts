import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Sürüm tekilliği testi.
 *
 * Neden var: v0.9.1'e kadar sürüm 6 farklı dosyada tutuluyor ve birbirinden
 * ayrışmıştı (package.json 0.8.0, build.gradle 0.9.1, strings.ts hem 0.8.0 hem
 * 0.9.1). Telefondaki APK'nın hangi koddan geldiği belirsizdi.
 *
 * Bu test, `version.json` ile diğer tüm kaynakların eşit olduğunu doğrular.
 * `scripts/sync-version.mjs --check` çıktısını kullanır (tek doğruluk kaynağı).
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const versionJsonPath = resolve(ROOT, 'version.json');

describe('sürüm tekilliği (version.json = tek kaynak)', () => {
  const meta = JSON.parse(readFileSync(versionJsonPath, 'utf8')) as {
    version: string;
    versionCode: number;
  };

  it('version.json geçerli semver ve pozitif versionCode içerir', () => {
    expect(meta.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Number.isInteger(meta.versionCode)).toBe(true);
    expect(meta.versionCode).toBeGreaterThan(0);
  });

  it('tüm sürüm kaynakları version.json ile eşit (sync-version --check)', () => {
    // Çıkış kodu 0 değilse execFileSync hata fırlatır ve test kırmızı olur.
    const out = execFileSync(
      process.execPath,
      [resolve(ROOT, 'scripts/sync-version.mjs'), '--check'],
      { cwd: ROOT, encoding: 'utf8' },
    );
    expect(out).toContain(`v${meta.version}`);
    expect(out).toContain(`code ${meta.versionCode}`);
  });
});
