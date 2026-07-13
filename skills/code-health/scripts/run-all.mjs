#!/usr/bin/env node
//
// Convenience runner: produce every code-health reading in the right order
// (trend producers first, then the roll-up which reads their TSVs), against the
// repo in process.cwd(). Pass --no-write to print without appending history.
// Pass --stamp <file.md>... to also stamp a dashboard at the end.
//
//   node run-all.mjs
//   node run-all.mjs --no-write
//   node run-all.mjs --stamp wiki/Code-Health-Dashboard.md wiki/Home.md
//
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const stampIdx = argv.indexOf('--stamp');
const stampTargets = stampIdx >= 0 ? argv.slice(stampIdx + 1) : [];
const passthru = argv.includes('--no-write') ? '--no-write' : '';

// Producers first (each independent), roll-up last (reads their TSVs).
const producers = [
  'maintainability-report', 'complexity-report', 'hotspot-report',
  'coupling-report', 'change-coupling-report', 'duplication-report',
  'security-report', 'coverage-report',
];
for (const p of producers) {
  try {
    execSync(`node "${path.join(DIR, p + '.mjs')}" ${passthru}`, { stdio: 'inherit' });
  } catch (e) {
    console.error(`  ⚠ ${p} failed (${e.message?.split('\n')[0]}) — continuing; its dimension will use defaults`);
  }
}
execSync(`node "${path.join(DIR, 'codehealth-report.mjs')}" ${passthru}`, { stdio: 'inherit' });

if (stampTargets.length && !passthru) {
  execSync(`node "${path.join(DIR, 'stamp-codehealth.mjs')}" ${stampTargets.map((t) => `"${t}"`).join(' ')}`, { stdio: 'inherit' });
}
