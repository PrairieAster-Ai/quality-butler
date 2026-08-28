#!/usr/bin/env node
//
// DORA, re-pointed for assisted development.
//
// **Throughput metrics inflate under AI assistance and stop meaning anything.**
// Deploy frequency and lead time measure how fast work leaves the keyboard, and
// that is the part that got cheap. Five pull requests in an afternoon says
// nothing about whether any of them was right.
//
// What still discriminates is the other half of DORA — how often a change had to
// be corrected, and how long the problem sat there first — plus one measure that
// is specific to this way of working:
//
//   verification ratio   non-test lines changed per test line changed.
//                        A large diff with no test movement is either safe by
//                        construction or unverified, and the number makes you
//                        say which. Assisted refactors are routinely enormous
//                        and touch no tests at all.
//
//   change-failure rate  share of commits that fix or revert something. A proxy
//                        rather than the DORA definition, which needs incident
//                        data this cannot see — but it moves for the same reasons.
//
//   time to detect       for each fix, how old the lines it changed were. This is
//                        the one that hurts: a defect found in an hour and a
//                        defect found in six weeks are the same entry in a
//                        changelog and completely different failures of process.
//
//   node delivery-metrics.mjs [--window "90 days ago"] [--no-write]
//
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { WRITE, WINDOW, hist, today, appendHistory, HISTORY_DIR } from './config.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SINCE = arg('--window', WINDOW || '90 days ago');
const HISTORY = hist('delivery-history.tsv');
const sh = (c) => { try { return execSync(c, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }); } catch { return ''; } };
const isTest = (f) => /\.(test|spec)\.[tj]sx?$|(^|\/)(tests?|__tests__|e2e)\//.test(f);
const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

// **git does not complain about a window it could not use.** `--since` with a
// value it cannot parse returns the entire history, so a typo reports every
// commit ever made under a label claiming three months. Validate the form here
// rather than trying to detect the damage afterwards.
if (!/^\d+\s+(day|week|month|year)s?\s+ago$/i.test(SINCE) && Number.isNaN(Date.parse(SINCE))) {
  console.error(`\n✗ "${SINCE}" is not a window git will honour: it would return the whole history.`);
  console.error('  Use "90 days ago", or an ISO date like "2026-01-01".\n');
  process.exit(1);
}
if (!Number.isNaN(Date.parse(SINCE)) && Date.parse(SINCE) > Date.now()) {
  console.error(`\n✗ the window "${SINCE}" is in the future; git would return everything.\n`);
  process.exit(1);
}

const commits = sh(`git log --since="${SINCE}" --no-merges --format=%H%x09%s`)
  .split('\n').filter(Boolean)
  .map((l) => { const [sha, ...rest] = l.split('\t'); return { sha, subject: rest.join('\t') }; });

if (!commits.length) {
  console.log(`\nDelivery metrics: no commits since ${SINCE}.\n`);
  process.exit(0);
}

// ── verification ratio ───────────────────────────────────────────────────────
let prod = 0; let test = 0;
const unverified = [];
for (const c of commits) {
  const stat = sh(`git show --numstat --format= ${c.sha}`).split('\n').filter(Boolean);
  let p = 0; let t = 0;
  for (const row of stat) {
    const [add, del, file] = row.split('\t');
    if (!file || add === '-') continue;
    const n = Number(add) + Number(del);
    if (isTest(file)) t += n; else p += n;
  }
  prod += p; test += t;
  // A big change with no test movement at all is the shape worth naming.
  if (p >= 200 && t === 0) unverified.push({ ...c, lines: p });
}

// ── change-failure proxy + time to detect ────────────────────────────────────
const FIX = /^(fix|revert|hotfix)\b|\brevert\b/i;
const fixes = commits.filter((c) => FIX.test(c.subject));
const ages = [];
for (const f of fixes.slice(0, 30)) {
  // How old were **the lines this fix changed**, not the files.
  //
  // The first version blamed the file's previous commit, which in an actively
  // edited file is always yesterday: it reported a median of 0.2 days and was
  // really measuring how recently anyone had touched the file. Blaming the
  // specific line ranges the fix rewrote is the difference between "this file
  // is busy" and "this bug was six weeks old".
  const files = sh(`git show --name-only --format= ${f.sha}`)
    .split('\n').filter((x) => x && !isTest(x) && fs.existsSync(x)).slice(0, 4);
  const fixedAt = Number(sh(`git log -1 --format=%ct ${f.sha}`).trim());
  const lineAges = [];
  for (const file of files) {
    // -U0 so each hunk header names exactly the pre-image lines being replaced.
    const hunks = sh(`git diff -U0 ${f.sha}^ ${f.sha} -- "${file}"`)
      .split('\n').filter((l) => l.startsWith('@@'));
    for (const h of hunks.slice(0, 6)) {
      const m = /@@ -(\d+)(?:,(\d+))? /.exec(h);
      if (!m) continue;
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      if (count === 0) continue; // pure insertion: nothing pre-existing to age
      const blame = sh(`git blame -L ${start},${start + count - 1} --porcelain ${f.sha}^ -- "${file}"`);
      for (const line of blame.split('\n')) {
        const t = /^author-time (\d+)$/.exec(line);
        if (t && fixedAt) lineAges.push((fixedAt - Number(t[1])) / 86400);
      }
    }
  }
  if (lineAges.length) ages.push(median(lineAges));
}

const ratio = test > 0 ? (prod / test) : Infinity;
const failRate = Math.round((fixes.length / commits.length) * 100);
const ttd = Math.round(median(ages) * 10) / 10;

console.log(`\nDelivery metrics: ${commits.length} commits since ${SINCE}\n`);
console.log(`  verification ratio   ${test > 0 ? `${ratio.toFixed(1)} : 1` : 'no test lines changed at all'}`);
console.log(`                       ${prod} non-test lines / ${test} test lines`);
console.log(`  change-failure rate  ${failRate}%  (${fixes.length} of ${commits.length} commits fix or revert)`);
console.log(`  time to detect       ${ages.length ? `${ttd} days (median)` : 'not enough fix history'}`);
console.log(`\n  Deploy frequency and lead time are deliberately absent. They measure how`);
console.log(`  fast work leaves the keyboard, which is the part assistance made cheap.`);

if (unverified.length) {
  console.log(`\n  Large changes that moved no test line:`);
  for (const u of unverified.slice(0, 8)) console.log(`    ${u.lines.toString().padStart(5)} lines  ${u.sha.slice(0, 7)}  ${u.subject.slice(0, 70)}`);
  if (unverified.length > 8) console.log(`    … and ${unverified.length - 8} more`);
  console.log('  Safe by construction, or unverified? The number does not know; you do.');
}
console.log('');

if (WRITE) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  appendHistory(HISTORY, 'date\tcommits\tprod_lines\ttest_lines\tverification_ratio\tchange_failure_pct\ttime_to_detect_days\n',
    `${today()}\t${commits.length}\t${prod}\t${test}\t${test > 0 ? ratio.toFixed(1) : ''}\t${failRate}\t${ttd}\n`);
  console.log(`appended reading → ${path.relative(process.cwd(), HISTORY)}\n`);
}
