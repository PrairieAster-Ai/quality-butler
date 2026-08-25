#!/usr/bin/env node
//
// Which gates have ever been observed to fail?
//
// **A gate that has never failed has not been shown to work.** Over one session
// this repo family turned up nine checks that reported success while measuring
// nothing: a mermaid check that passed on an empty diagram list, a doc generator
// that exited 0 with none of its tooling installed, a trend chart drawn from a
// history nobody wrote, a ratchet no workflow invoked, a smoke test that passed
// against a host that did not exist. Every one was found by accident, weeks
// apart, and every one was green the whole time.
//
// Noise gets noticed. Silence does not. So this looks for silence, in the two
// places it hides:
//
//   1. **Declared but never run** — a gate script in package.json that no
//      workflow invokes. It exists, it is documented, it is dead.
//   2. **Run but never failed** — a step that has executed many times across CI
//      history and has never once gone red.
//
// The second is deliberately NOT a pass/fail signal. Plenty of gates never fail
// because the code is good, and a green lint over a clean repo is exactly what
// you want. The output is a question, not a verdict: here are the checks you
// have no evidence about — go write a negative control for them (see
// selftest.mjs for the pattern).
//
//   node gate-liveness.mjs [--limit 100] [--repo owner/name] [--no-write]
//
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { WRITE, hist, today, appendHistory, HISTORY_DIR } from './config.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const LIMIT = Number(arg('--limit', 100));
/** How many green runs before never-having-failed is worth remarking on. */
const UNPROVEN_AFTER = 10;
const HISTORY = hist('gate-liveness-history.tsv');

const sh = (cmd) => {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch { return ''; }
};

// ── 1. Gates declared in package.json that no workflow runs ──────────────────
/** Script names that read as a check rather than a build or a dev server. */
const GATEY = /^(lint|test|typecheck|type-check|verify|audit|check|e2e)|(:check|:verify|:audit|:lint|:test)$/;

function declaredGates() {
  const out = [];
  const seen = new Set();
  const pkgs = ['package.json', ...sh("find . -name package.json -not -path '*/node_modules/*' -maxdepth 4")
    .split('\n').filter(Boolean).map((p) => p.replace(/^\.\//, ''))];
  for (const p of pkgs) {
    if (seen.has(p) || !fs.existsSync(p)) continue;
    seen.add(p);
    let scripts = {};
    try { scripts = JSON.parse(fs.readFileSync(p, 'utf8')).scripts || {}; } catch { continue; }
    for (const [name, cmd] of Object.entries(scripts)) if (GATEY.test(name)) out.push({ pkg: p, name, cmd });
  }
  return out;
}

/**
 * A script counts as invoked if a workflow names it, or runs something
 * distinctive from the command it wraps. `test:e2e:prod` is invoked by a
 * workflow calling `playwright test` directly, and reporting it as dead would
 * be the noisy inverse of the bug this script exists to find.
 *
 * "Distinctive" is doing real work here. Matching on the first token alone
 * called `echo nope` invoked, because workflows contain the word `echo` —
 * caught by planting a dead gate and watching this fail to notice it. Runners
 * and shell builtins say nothing about which script ran, so they are skipped
 * and the path or tool name is what gets matched.
 */
const GENERIC = new Set(['echo', 'node', 'npm', 'npx', 'run', 'bash', 'sh', 'cd', 'rm',
  'cp', 'mv', 'mkdir', 'set', 'true', 'false', 'exec', 'cross-env', 'tsx', 'test', '&&', '||']);

function invoked(script, cmd, wf) {
  if (wf.includes(script)) return true;
  const tokens = (cmd || '').split(/\s+/)
    .filter((t) => t && !/^[A-Z_][A-Z0-9_]*=/.test(t) && !t.startsWith('-'));
  const distinctive = tokens.filter((t) => !GENERIC.has(t)
    && (t.includes('/') || /^[a-z][\w.@-]{3,}$/i.test(t)));
  return distinctive.some((t) => wf.includes(t));
}

function workflowText() {
  const dir = '.github/workflows';
  if (!fs.existsSync(dir)) return '';
  return fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
}

// ── 2. Steps that have run in CI and never gone red ──────────────────────────
function ciSteps() {
  const runsRaw = sh(`gh run list --limit ${LIMIT} --json databaseId,conclusion,createdAt`);
  if (!runsRaw) return null; // no gh, no auth, or not a GitHub repo
  let runs = [];
  try { runs = JSON.parse(runsRaw).filter((r) => r.conclusion); } catch { return null; }
  if (!runs.length) return null;

  const steps = new Map(); // "job / step" -> { ran, failed, lastFail }
  for (const r of runs) {
    const jobsRaw = sh(`gh api repos/{owner}/{repo}/actions/runs/${r.databaseId}/jobs --paginate`);
    if (!jobsRaw) continue;
    let jobs = [];
    try { jobs = JSON.parse(jobsRaw).jobs || []; } catch { continue; }
    for (const j of jobs) {
      for (const s of j.steps || []) {
        // Setup/teardown are the harness, not gates.
        if (/^(Set up job|Complete job|Post |Run actions\/)/.test(s.name)) continue;
        // Install, upload and notify steps are plumbing. They can fail, but a
        // green `npm ci` is not evidence about any gate.
        if (/^(run npm ci|run npm install|install |upload |download |post |build the run|checkout)/i.test(s.name)) continue;
        if (s.conclusion === 'skipped' || s.conclusion === null) continue;
        const key = `${j.name} / ${s.name}`;
        const e = steps.get(key) || { ran: 0, failed: 0, lastFail: '' };
        e.ran += 1;
        if (s.conclusion === 'failure') { e.failed += 1; if (!e.lastFail) e.lastFail = r.createdAt.slice(0, 10); }
        steps.set(key, e);
      }
    }
  }
  return steps;
}

// ── report ───────────────────────────────────────────────────────────────────
const wf = workflowText();
const orphans = declaredGates().filter((g) => !invoked(g.name, g.cmd, wf));

console.log(`\nGate liveness — last ${LIMIT} CI runs\n`);

if (orphans.length) {
  console.log('  Gate-shaped scripts no workflow runs — dead, or deliberately manual:');
  for (const g of orphans) console.log(`    ✗ ${g.name}  (${g.pkg})`);
  console.log('');
} else {
  console.log('  ✓ every gate-shaped npm script is invoked by a workflow\n');
}

const steps = ciSteps();
let unproven = [];
if (!steps) {
  console.log('  (no CI history available — needs `gh` authenticated against a GitHub repo)');
} else {
  const rows = [...steps.entries()]
    .map(([name, e]) => ({ name, ...e }))
    .sort((a, b) => (a.failed - b.failed) || (b.ran - a.ran));
  unproven = rows.filter((r) => r.failed === 0 && r.ran >= UNPROVEN_AFTER);
  const proven = rows.filter((r) => r.failed > 0);

  const w = Math.max(24, ...rows.map((r) => r.name.length));
  console.log(`  ${'step'.padEnd(w)}  ran  failed  last red`);
  for (const r of rows) {
    const mark = r.failed > 0 ? '✓' : (r.ran >= UNPROVEN_AFTER ? '⚠' : '·');
    console.log(`  ${mark} ${r.name.padEnd(w - 2)} ${String(r.ran).padStart(4)}  ${String(r.failed).padStart(6)}  ${r.lastFail || '—'}`);
  }
  console.log(`\n  ✓ ${proven.length} proven (seen to fail, so seen to discriminate)`);
  console.log(`  ⚠ ${unproven.length} unproven (${UNPROVEN_AFTER}+ runs, never red — no evidence either way)`);
  if (unproven.length) {
    console.log('\n  An unproven gate is not a broken one. It is one you have nothing on.');
    console.log('  Write it a negative control: plant the failure it claims to catch and');
    console.log('  watch it go red. See selftest.mjs for the pattern.');
  }
}

if (WRITE && steps) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  appendHistory(HISTORY, 'date\tsteps\tproven\tunproven\torphan_gates\n',
    `${today()}\t${steps.size}\t${steps.size - unproven.length}\t${unproven.length}\t${orphans.length}\n`);
  console.log(`\nappended reading → ${path.relative(process.cwd(), HISTORY)}`);
}
