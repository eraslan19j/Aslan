/**
 * Workflow YAML bütünlük testi
 *
 * Neden var: 2026-11-18'de release notlarını inline yazarken YAML
 * girintisi bozuldu ve GitHub Actions koşuyu hiç başlatmadı
 * (jobs total_count: 0). Tek belirti "failure" idi; hata mesajı yoktu.
 *
 * Bu test, scripts/check-workflows.mjs'in exit kodunu doğrular; yani
 * CI'da `npm test` çalıştığı her yerde workflow'lar da denetlenir.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROOT_DIR = join(ROOT, '..');
const SCRIPT = join(ROOT_DIR, 'scripts', 'check-workflows.mjs');
const WF_DIR = join(ROOT_DIR, '.github', 'workflows');

describe('GitHub Actions workflow dosyaları', () => {
  it('tüm workflow YAML dosyaları geçerli', () => {
    const out = execFileSync(process.execPath, [SCRIPT], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(out).toContain('workflow dosyası geçerli');
  });

  it('godot-build.yml var ve Godot sürümü sabitlenmiş', () => {
    const files = readdirSync(WF_DIR);
    expect(files).toContain('godot-build.yml');

    const text = execFileSync(
      process.execPath,
      ['-e', `process.stdout.write(require('fs').readFileSync(${JSON.stringify(join(WF_DIR, 'godot-build.yml'))},'utf8'))`],
      { encoding: 'utf8' },
    );
    // Sürüm pinlenmemişse (latest) derleme tekrar üretilemez
    expect(text).toMatch(/GODOT_VERSION:\s*'4\.\d+\.\d+'/);
    // Play kapıları workflow içinde olmalı
    expect(text).toContain('targetSdk');
    expect(text).toContain('llvm-readelf');
  });
});
