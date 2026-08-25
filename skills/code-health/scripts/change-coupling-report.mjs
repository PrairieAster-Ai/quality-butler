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

/**
 * Roots holding shared libraries rather than applications.
 *
 * Configurable because the convention is not universal; `packages/` is the npm
 * workspace default.
 */
const SHARED_ROOTS = cfg.sharedRoots ?? ['packages'];

/** The application a file belongs to — `apps/api`, `packages/database`. */
const appOf = (p) => p.split('/').slice(0, 2).join('/');

/** Is this file part of a shared library rather than an application? */
const isShared = (p) => SHARED_ROOTS.includes(p.split('/')[0]);

/**
 * Do these two files belong to different applications?
 *
 * **Two applications changing together is the smell. An application changing
 * with a library it depends on is not.** Adding a column means changing the
 * schema and the route that reads it — that is the Stable-Dependencies
 * Principle working, and there is no refactor that stops it. A measure that
 * flags an unavoidable, correct relationship is reporting noise as debt.
 *
 * It was doing exactly that: in one repo five of sixteen "cross-layer" pairs
 * were routes co-changing with the Drizzle schema, which is what routes and
 * schemas do. The remaining eleven were a real finding — a web app and an API
 * sharing a contract that had no home, and which had silently drifted twice.
 */
function isCrossLayer(a, b) {
  if (isShared(a) || isShared(b)) return false;
  return appOf(a) !== appOf(b);
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
  const crossLayer = isCrossLayer(a, b);
  coupled.push({ a, b, co, degree, crossLayer });
}
coupled.sort((x, y) => y.degree - x.degree || y.co - x.co);

const pct = (d) => `${Math.round(d * 100)}%`;
console.log(`\nChange coupling — files that change together over the last 365 days (${used} commits ≤ ${MAX_FILES} files)`);
console.log(`  ${coupled.length} coupled pair(s) (≥ ${MIN_CO} co-changes, each file ≥ ${MIN_REV} revs, ≥ ${pct(MIN_DEGREE)} degree)`);
console.log('  strongest coupling (consider why these always move together):');
// Twelve is enough to read; the whole list is what you need when deciding
// whether a cross-layer count is a real finding or a heuristic misfiring.
for (const c of coupled.slice(0, Number(process.env.CC_TOP ?? 12))) {
  console.log(`    ${pct(c.degree).padStart(4)}  ${String(c.co).padStart(2)}×  ${c.crossLayer ? '⚠ cross ' : '        '}${c.a}  ⇄  ${c.b}`);
}

if (WRITE) {
  const top = coupled[0];
  const cross = coupled.filter((c) => c.crossLayer).length;
  appendHistory(HISTORY, 'date\tcommits\tcoupled_pairs\tcross_layer\ttop_pair\ttop_degree_pct\n',
    `${today()}\t${used}\t${coupled.length}\t${cross}\t${top ? `${top.a} ⇄ ${top.b}` : '-'}\t${top ? Math.round(top.degree * 100) : 0}\n`);
  console.log(`\nappended reading → ${HISTORY}`);
}
