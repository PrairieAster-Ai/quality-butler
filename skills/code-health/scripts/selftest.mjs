#!/usr/bin/env node
//
// Negative controls for the measurement layer.
//
// **Every gate here was inert at some point, and passed while inert.** A
// mermaid check that passed on an empty diagram list; a doc generator that
// exited 0 with none of its tooling installed; a ratchet no CI step invoked; a
// trend chart drawn from a history nobody wrote; an `appendHistory` that hid a
// new column; a stale copy of this skill that graded a repo on a statistic it
// was not writing. Each was found by accident, weeks apart, and each time the
// fix was verified by hand once and never again.
//
// A gate that has never been shown to fail has not been shown to work. This
// plants known-bad input and asserts each one fires — and pairs every negative
// with a positive, so the suite cannot pass by having everything break.
//
//   node selftest.mjs
//
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendHistory } from './config.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const results = [];
const check = (name, fn) => {
  try { fn(); results.push([true, name]); } catch (e) { results.push([false, `${name}\n      ${e.message}`]); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const MI = 'date\tfiles\tmean_mi\tmedian_mi\tmin_mi\tgreen\tyellow\tred\tp5_mi\n';
const CC = 'date\tcommits\tcoupled_pairs\tcross_layer\ttop_pair\ttop_degree_pct\n';
const SEC = 'date\tcritical\thigh\tmoderate\tlow\ttotal\n';

/** A repo the roll-up can fully measure: real source, and every producer's history present. */
function fixture({ withSecurity = true } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-selftest-'));
  fs.mkdirSync(path.join(d, 'src'), { recursive: true });
  fs.writeFileSync(path.join(d, 'src/a.ts'), '/** Adds. */\nexport function add(a: number, b: number) { return a + b; }\n');
  fs.writeFileSync(path.join(d, 'tsconfig.json'), '{"compilerOptions":{"strict":true}}');
  fs.writeFileSync(path.join(d, 'code-health.config.json'), JSON.stringify({
    dirs: ['src'], docDirs: ['src'], tsconfig: 'tsconfig.json', historyDir: 'code-health',
  }));
  const h = path.join(d, 'code-health');
  fs.mkdirSync(h, { recursive: true });
  fs.writeFileSync(path.join(h, 'maintainability-history.tsv'), `${MI}2026-01-01\t1\t60\t60\t60\t1\t0\t0\t60\n`);
  fs.writeFileSync(path.join(h, 'change-coupling-history.tsv'), `${CC}2026-01-01\t20\t12\t1\ta ⇄ b\t50\n`);
  if (withSecurity) fs.writeFileSync(path.join(h, 'security-history.tsv'), `${SEC}2026-01-01\t0\t0\t0\t0\t0\n`);
  execFileSync('git', ['init', '-q'], { cwd: d });
  execFileSync('git', ['add', '-A'], { cwd: d });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'f'], { cwd: d });
  return d;
}
const rollup = (cwd, args = []) => {
  try {
    return { code: 0, out: execFileSync('node', [path.join(DIR, 'codehealth-report.mjs'), ...args], { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }) };
  } catch (e) { return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') }; }
};

// ── positive control: a fully measured repo still produces a grade ───────────
check('a fully measured repo produces a grade', () => {
  const { out } = rollup(fixture(), ['--no-write']);
  assert(/grade [A-F]/.test(out), 'expected a letter grade, got:\n' + out.slice(0, 400));
  assert(!out.includes('PARTIAL'), 'a complete reading must not report as partial');
});

// ── absence of evidence must not score as health ─────────────────────────────
check('a dimension with no input is excluded, not defaulted', () => {
  const { out } = rollup(fixture({ withSecurity: false }), ['--no-write']);
  assert(out.includes('NOT MEASURED'), 'missing security history should read NOT MEASURED');
  assert(/Security \(deps\)\s+-/.test(out), 'Security should show no score, got:\n' + out.slice(0, 600));
});

check('a partial reading gets no grade', () => {
  const { out } = rollup(fixture({ withSecurity: false }), ['--no-write']);
  assert(out.includes('PARTIAL READING'), 'headline must say the reading is partial');
  assert(!/grade [A-F]\b/.test(out), 'a partial reading must not carry a letter grade');
  assert(!/well-governed|strong,/.test(out), 'must not characterize a codebase it did not measure');
});

check('a partial reading is refused entry to the trend', () => {
  const d = fixture({ withSecurity: false });
  const { code, out } = rollup(d);
  assert(code !== 0, 'writing a partial reading should exit non-zero');
  assert(out.includes('refusing to record a partial reading'), 'should say why');
  assert(!fs.existsSync(path.join(d, 'code-health/codehealth-history.tsv')), 'no row should have been written');
});

check('--allow-partial still records, for an uninstrumented first run', () => {
  const d = fixture({ withSecurity: false });
  const { code } = rollup(d, ['--allow-partial']);
  assert(code === 0, 'explicit override should succeed');
  assert(fs.existsSync(path.join(d, 'code-health/codehealth-history.tsv')), 'row should have been written');
});

// ── history-shape guards (v0.6.2) ────────────────────────────────────────────
check('appendHistory refuses a row narrower than its header', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-hist-'));
  const f = path.join(d, 'code-health', 't-history.tsv');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, 'date\ta\tb\tc\n2026-01-01\t1\t2\t3\n');
  let threw = false;
  try { appendHistory(f, 'date\ta\tb\tc\n', '2026-01-02\t9\t9\n'); } catch { threw = true; }
  assert(threw, 'a 3-field row against a 4-column header must be refused');
  assert(fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length === 2, 'the bad row must not be appended');
});

check('appendHistory still widens when a producer adds a column', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-hist-'));
  const f = path.join(d, 'code-health', 't-history.tsv');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, 'date\ta\tb\n2026-01-01\t1\t2\n');
  appendHistory(f, 'date\ta\tb\tc\n', '2026-01-02\t1\t2\t3\n');
  const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
  assert(lines[0] === 'date\ta\tb\tc', 'header should have widened');
  assert(lines[1].split('\t').length === 4, 'the old row should have been padded');
});

// ── wrong-copy guard (v0.6.2) ────────────────────────────────────────────────
check('run-all refuses a copy the repo did not pin', () => {
  const d = fixture();
  fs.mkdirSync(path.join(d, '.claude/skills/code-health/scripts'), { recursive: true });
  let code = 0, out = '';
  try { execFileSync('node', [path.join(DIR, 'run-all.mjs'), '--no-write'], { cwd: d, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch (e) { code = e.status; out = (e.stdout || '') + (e.stderr || ''); }
  assert(code === 1, 'should exit 1 when a pinned copy exists elsewhere');
  assert(out.includes('pins its own copy'), 'should name the problem');
});

check('--any-copy overrides the pin check', () => {
  const d = fixture();
  fs.mkdirSync(path.join(d, '.claude/skills/code-health/scripts'), { recursive: true });
  const out = execFileSync('node', [path.join(DIR, 'run-all.mjs'), '--no-write', '--any-copy'], { cwd: d, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  assert(!out.includes('pins its own copy'), 'override should proceed');
});

// ── gate liveness: does the dead-gate detector discriminate? ─────────────────
/** A repo with one gate script, optionally referenced by a workflow. */
function gateFixture({ referenced }) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-gate-'));
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({
    name: 'f', scripts: { 'bogus:check': 'node scripts/probe-zzz.mjs' },
  }));
  fs.mkdirSync(path.join(d, '.github/workflows'), { recursive: true });
  fs.writeFileSync(path.join(d, '.github/workflows/ci.yml'),
    referenced ? 'jobs:\n  a:\n    steps:\n      - run: node scripts/probe-zzz.mjs\n'
               : 'jobs:\n  a:\n    steps:\n      - run: echo hello\n');
  fs.writeFileSync(path.join(d, 'code-health.config.json'), JSON.stringify({ dirs: ['src'], historyDir: 'code-health' }));
  return d;
}
const liveness = (cwd) => {
  try { return execFileSync('node', [path.join(DIR, 'gate-liveness.mjs'), '--limit', '1', '--no-write'], { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch (e) { return (e.stdout || '') + (e.stderr || ''); }
};

check('a gate no workflow runs is reported', () => {
  assert(liveness(gateFixture({ referenced: false })).includes('bogus:check'),
    'a script nothing invokes should be listed');
});

check('a gate a workflow does run is not reported', () => {
  assert(!liveness(gateFixture({ referenced: true })).includes('bogus:check'),
    'matching only the first token called `echo nope` invoked; this is that regression');
});

// ── duplicate declarations: same name, two shapes ────────────────────────────
function declFixture({ duplicate }) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-decl-'));
  fs.mkdirSync(path.join(d, 'src/a'), { recursive: true });
  fs.mkdirSync(path.join(d, 'src/b'), { recursive: true });
  fs.writeFileSync(path.join(d, 'src/a/t.ts'), 'export interface Row {\n  id: string;\n  name: string;\n}\n');
  fs.writeFileSync(path.join(d, 'src/b/t.ts'), duplicate
    ? 'export interface Row {\n  id: string;\n}\n'          // same name, fewer fields: drifted
    : 'export interface Other {\n  id: string;\n}\n');
  fs.writeFileSync(path.join(d, 'code-health.config.json'), JSON.stringify({ dirs: ['src'], historyDir: 'code-health' }));
  return d;
}
const dupes = (cwd) => {
  try { return execFileSync('node', [path.join(DIR, 'duplicate-declarations.mjs'), '--no-write'], { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch (e) { return (e.stdout || '') + (e.stderr || ''); }
};

check('the same name declared twice with different shapes is reported as drifted', () => {
  const out = dupes(declFixture({ duplicate: true }));
  assert(/DRIFTED\s+Row/.test(out), 'expected Row flagged as drifted, got:\n' + out.slice(0, 400));
});

check('distinct names are not reported', () => {
  const out = dupes(declFixture({ duplicate: false }));
  assert(out.includes('declared exactly once'), 'a clean tree must report clean, got:\n' + out.slice(0, 400));
});

// ── the new metrics refuse to report a number they cannot stand behind ───────
check('mutation scoring refuses to run against a red suite', () => {
  const d = fixture();
  // A mutable file WITH a colocated test, so the run reaches the baseline check
  // rather than stopping at "nothing to mutate".
  fs.writeFileSync(path.join(d, 'src/b.ts'), 'export const ok = (n: number) => n >= 2 && true;\n');
  fs.writeFileSync(path.join(d, 'src/b.test.ts'), 'export {};\n');
  let out = '';
  try { out = execFileSync('node', [path.join(DIR, 'mutation-score.mjs'), '--test', 'false', '--no-write'], { cwd: d, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  // Every mutant "passes" against a suite that was already failing, which would
  // score 100%. Refusing is the only honest answer.
  assert(/red before any mutation|nothing to measure/.test(out),
    'expected a refusal or a nothing-to-measure notice, got:\n' + out.slice(0, 300));
});

check('delivery metrics refuse a window git silently ignored', () => {
  const d = fixture();
  let out = '';
  // git answers `--since` with a date it cannot parse by returning everything,
  // so an unusable window reads as a full-history report wearing the window's label.
  try { out = execFileSync('node', [path.join(DIR, 'delivery-metrics.mjs'), '--window', 'not-a-date', '--no-write'], { cwd: d, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  assert(/not a window git will honour|no commits/.test(out), 'expected a refusal, got:\n' + out.slice(0, 300));
});

let failed = 0;
for (const [ok, name] of results) { console.log(`  ${ok ? '✓' : '✗'} ${name}`); if (!ok) failed += 1; }
console.log(`\n${results.length - failed}/${results.length} negative controls passing`);
process.exit(failed ? 1 : 0);
