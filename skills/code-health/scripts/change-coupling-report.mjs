#!/usr/bin/env node
//
// CodeScene-style change-coupling trend. Two files are *change-coupled* when they
// keep getting edited in the same commits — a behavioral signal of a hidden
// dependency the static import graph may not show. High coupling across module
// boundaries is a refactoring target. Degree = co-changes / min(revisions).
// Appends to <historyDir>/change-coupling-history.tsv. Thresholds are configurable.
//
//   node change-coupling-report.mjs            # print + append a reading
//   node change-coupling-report.mjs --no-write # print only
//
import { execSync } from 'node:child_process';
import { DIRS, WINDOW, WRITE, cfg, walk, hist, today, appendHistory } from './config.mjs';

const { maxFiles: MAX_FILES, minRev: MIN_REV, minCo: MIN_CO, minDegree: MIN_DEGREE } = cfg.changeCoupling;
const HISTORY = hist('change-coupling-history.tsv');

const present = new Set(DIRS.flatMap(walk));

const log = execSync(`git log --since="${WINDOW}" --format=@@@%H --name-only -- ${DIRS.join(' ')}`,
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const commits = [];
let cur = null;
for (const line of log.split('\n')) {
  if (line.startsWith('@@@')) { if (cur) commits.push(cur); cur = []; continue; }
  const f = line.trim();
  if (cur && f && present.has(f)) cur.push(f);
}
if (cur) commits.push(cur);

const rev = new Map();
const pairCo = new Map();
let used = 0;
for (const files of commits) {
  const uniq = [...new Set(files)];
  if (uniq.length === 0 || uniq.length > MAX_FILES) continue;
  used++;
  for (const f of uniq) rev.set(f, (rev.get(f) || 0) + 1);
  for (let i = 0; i < uniq.length; i++) {
    for (let j = i + 1; j < uniq.length; j++) {
      const [a, b] = [uniq[i], uniq[j]].sort();
      const k = `${a}\t${b}`;
      pairCo.set(k, (pairCo.get(k) || 0) + 1);
    }
  }
}

const coupled = [];
for (const [k, co] of pairCo) {
  if (co < MIN_CO) continue;
  const [a, b] = k.split('\t');
  const ra = rev.get(a) || 0;
  const rb = rev.get(b) || 0;
  if (ra < MIN_REV || rb < MIN_REV) continue;
  const degree = co / Math.min(ra, rb);
  if (degree < MIN_DEGREE) continue;
  const crossLayer = a.split('/')[1] !== b.split('/')[1] || a.split('/').slice(0, 3).join('/') !== b.split('/').slice(0, 3).join('/');
  coupled.push({ a, b, co, degree, crossLayer });
}
coupled.sort((x, y) => y.degree - x.degree || y.co - x.co);

const pct = (d) => `${Math.round(d * 100)}%`;
console.log(`\nChange coupling — files that change together over the last 365 days (${used} commits ≤ ${MAX_FILES} files)`);
console.log(`  ${coupled.length} coupled pair(s) (≥ ${MIN_CO} co-changes, each file ≥ ${MIN_REV} revs, ≥ ${pct(MIN_DEGREE)} degree)`);
console.log('  strongest coupling (consider why these always move together):');
for (const c of coupled.slice(0, 12)) {
  console.log(`    ${pct(c.degree).padStart(4)}  ${String(c.co).padStart(2)}×  ${c.crossLayer ? '⚠ cross ' : '        '}${c.a}  ⇄  ${c.b}`);
}

if (WRITE) {
  const top = coupled[0];
  const cross = coupled.filter((c) => c.crossLayer).length;
  appendHistory(HISTORY, 'date\tcommits\tcoupled_pairs\tcross_layer\ttop_pair\ttop_degree_pct\n',
    `${today()}\t${used}\t${coupled.length}\t${cross}\t${top ? `${top.a} ⇄ ${top.b}` : '-'}\t${top ? Math.round(top.degree * 100) : 0}\n`);
  console.log(`\nappended reading → ${HISTORY}`);
}
