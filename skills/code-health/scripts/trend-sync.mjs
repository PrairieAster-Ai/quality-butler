#!/usr/bin/env node
//
// Hydrate the local trend from the durable state branch, or show the drift.
//
//   node <skill>/scripts/trend-sync.mjs [--check] [--branch butler-state]
//
// **There can only be one trend, and it cannot live on the default branch.**
// The butler's own guardrail forbids pushing there, so a reading taken in CI
// can only be persisted to the state branch. A repo that also commits
// `<historyDir>/` therefore keeps a second history that CI overwrites on
// restore and never reads again — two series, diverging, with whichever ran
// last silently winning.
//
// That is not hypothetical. One repo published a score-over-time chart
// containing three readings that had never happened in its own committed
// history, because the CI step charted the other copy.
//
// So: the state branch is canonical, `<historyDir>/` is gitignored, and this
// pulls it down when you want to take a reading locally. `--check` reports
// whether the two agree without writing anything.
//
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { HISTORY_DIR } from './config.mjs';

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const at = args.indexOf('--branch');
const BRANCH = at >= 0 ? args[at + 1] : 'butler-state';

const DIR = HISTORY_DIR || 'code-health';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();

let remoteFiles;
try {
  git('fetch', '--depth', '1', 'origin', BRANCH);
  remoteFiles = git('ls-tree', '--name-only', 'FETCH_HEAD', `${DIR}/`).split('\n').filter(Boolean);
} catch {
  console.error(`No \`${BRANCH}\` branch yet: it is created by the first sweep that persists a reading.`);
  process.exit(CHECK ? 0 : 1);
}

if (CHECK) {
  let same = 0; let differ = 0; let onlyRemote = 0;
  for (const f of remoteFiles) {
    const remote = git('show', `FETCH_HEAD:${f}`);
    if (!fs.existsSync(f)) { onlyRemote += 1; continue; }
    if (fs.readFileSync(f, 'utf8').trim() === remote.trim()) same += 1;
    else { differ += 1; console.log(`  ✗ ${f} differs from ${BRANCH}`); }
  }
  console.log(`\n  ${same} in sync · ${differ} diverged · ${onlyRemote} only on ${BRANCH}`);
  if (differ) {
    console.error(`\n✗ Two histories. The one on ${BRANCH} is canonical: CI reads and writes it,`);
    console.error('  and cannot write the default branch. Run without --check to take it.');
    process.exit(1);
  }
  console.log(`✓ local trend matches ${BRANCH}.`);
  process.exit(0);
}

fs.mkdirSync(DIR, { recursive: true });
for (const f of remoteFiles) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, `${git('show', `FETCH_HEAD:${f}`)}\n`);
  console.log(`  ${f}`);
}
console.log(`\n✓ restored ${remoteFiles.length} file(s) from ${BRANCH}. Readings you take locally are`);
console.log('  scratch until a sweep persists them; the branch is the record.');
