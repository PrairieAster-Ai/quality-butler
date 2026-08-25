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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const stampIdx = argv.indexOf('--stamp');
const stampTargets = stampIdx >= 0 ? argv.slice(stampIdx + 1) : [];
const passthru = argv.includes('--no-write') ? '--no-write' : '';

// **Refuse to run a copy the repo did not pin.** A repo that vendors this skill
// into .claude/skills is telling you which build its history and its CI agree
// on; running a different one (a global ~/.claude/skills install, say) produces
// numbers that look fine and are not comparable to the rows already recorded.
// A wrong reading is worse than no reading, because it comes with a narrative.
// Pass --any-copy when you mean it.
const pinned = path.join(process.cwd(), '.claude/skills/code-health/scripts');
if (fs.existsSync(pinned) && path.resolve(pinned) !== path.resolve(DIR) && !argv.includes('--any-copy')) {
  console.error(`✗ this repo pins its own copy of code-health, and you are running a different one.
    running: ${DIR}
    pinned:  ${pinned}
  Run the pinned copy, or pass --any-copy if you know the builds match.`);
  process.exit(1);
}
console.log(`code-health — running ${DIR}\n`);

// Producers first (each independent), roll-up last (reads their TSVs).
const producers = [
  'maintainability-report', 'complexity-report', 'hotspot-report',
  'coupling-report', 'change-coupling-report', 'duplication-report',
  'security-report', 'coverage-report', 'duplicate-declarations', 'delivery-metrics',
  // Last because it is the slow one: roughly one API call per CI run examined.
  // Degrades to a one-line notice when `gh` is absent or unauthenticated.
  'gate-liveness',
  // `mutation-score` is deliberately absent: it runs the whole test suite once
  // per mutant, so it belongs in a nightly job, not in every reading.
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
