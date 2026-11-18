#!/usr/bin/env node
/**
 * Workflow YAML doğrulayıcı
 *
 * Neden var:
 *   2026-11-18'de godot-build.yml'e release notlarını inline yazdım.
 *   Girinti kaydığı için YAML bozuldu ve GitHub Actions koşuyu HİÇ
 *   başlatmadı (jobs: total_count 0). Hata mesajı hiçbir yerde
 *   görünmedi — sadece "failure" yazdı. Bu script o sınıfı kapatır.
 *
 * Kullanım:
 *   node scripts/check-workflows.mjs
 *
 * Çıkış kodları:
 *   0 — tüm workflow dosyaları geçerli
 *   1 — en az bir dosya geçersiz
 *
 * Bağımlılık: yaml (devDependency)
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WF_DIR = join(ROOT, '.github', 'workflows');

const REQUIRED_TOP_LEVEL = ['on', 'jobs'];

let failures = 0;
let checked = 0;

const files = readdirSync(WF_DIR)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .sort();

for (const file of files) {
  const path = join(WF_DIR, file);
  const rel = relative(ROOT, path);
  checked += 1;

  let doc;
  try {
    doc = parse(readFileSync(path, 'utf8'));
  } catch (err) {
    failures += 1;
    console.error(`\n❌ ${rel}`);
    console.error(`   YAML ayrıştırma hatası: ${err.message.split('\n')[0]}`);
    const line = /at line (\d+)/.exec(err.message);
    if (line) {
      const src = readFileSync(path, 'utf8').split('\n');
      const n = Number(line[1]);
      for (let i = Math.max(0, n - 3); i < Math.min(src.length, n + 2); i += 1) {
        const marker = i + 1 === n ? '>>' : '  ';
        console.error(`   ${marker} ${String(i + 1).padStart(4)} | ${src[i]}`);
      }
    }
    continue;
  }

  if (!doc || typeof doc !== 'object') {
    failures += 1;
    console.error(`\n❌ ${rel}\n   Boş veya nesne olmayan YAML`);
    continue;
  }

  const problems = [];

  for (const key of REQUIRED_TOP_LEVEL) {
    if (!(key in doc)) problems.push(`"${key}" anahtarı yok`);
  }

  // 'on' YAML'de boolean true olarak ayrışabilir (YAML 1.1 tuzakları)
  if ('on' in doc && doc.on === null) {
    problems.push('"on" tetikleyicisi boş');
  }

  if (doc.jobs && typeof doc.jobs === 'object') {
    const jobNames = Object.keys(doc.jobs);
    if (jobNames.length === 0) problems.push('jobs boş');

    for (const jobName of jobNames) {
      const job = doc.jobs[jobName];
      if (!job || typeof job !== 'object') {
        problems.push(`jobs.${jobName} geçersiz`);
        continue;
      }
      if (!Array.isArray(job.steps) && !job.uses) {
        problems.push(`jobs.${jobName} için steps veya uses yok`);
      }
      if (Array.isArray(job.steps)) {
        job.steps.forEach((step, i) => {
          if (!step || typeof step !== 'object') {
            problems.push(`jobs.${jobName}.steps[${i}] geçersiz`);
            return;
          }
          if (!step.uses && !step.run) {
            problems.push(`jobs.${jobName}.steps[${i}] ne run ne uses içeriyor`);
          }
          if (step.uses && step.run) {
            problems.push(`jobs.${jobName}.steps[${i}] hem run hem uses içeriyor`);
          }
        });
      }
    }
  }

  if (problems.length > 0) {
    failures += 1;
    console.error(`\n❌ ${rel}`);
    for (const p of problems) console.error(`   - ${p}`);
  } else {
    const jobCount = Object.keys(doc.jobs).length;
    const stepCount = Object.values(doc.jobs).reduce(
      (n, j) => n + (Array.isArray(j.steps) ? j.steps.length : 0),
      0,
    );
    console.log(`✅ ${rel}  (${jobCount} job, ${stepCount} adım)`);
  }
}

console.log('');
if (failures > 0) {
  console.error(`❌ ${failures}/${checked} workflow dosyası geçersiz`);
  process.exit(1);
}
console.log(`✅ ${checked} workflow dosyası geçerli`);
