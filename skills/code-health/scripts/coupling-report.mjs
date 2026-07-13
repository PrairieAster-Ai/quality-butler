#!/usr/bin/env node
//
// Coupling / fan-out / instability report + trend (dependency-cruiser CLI). Reports
// per-module fan-out (efferent coupling Ce) and folder-level instability (Robert
// Martin's I = Ce/(Ce+Ca): 0 = stable/widely-depended-on, 1 = volatile). Appends to
// <historyDir>/coupling-history.tsv. Uses the `depcruise` CLI (--metrics) so it
// works regardless of how the repo's dependency-cruiser exposes its module API.
//
//   node coupling-report.mjs            # print + append a reading
//   node coupling-report.mjs --no-write # print only
//
import { execSync } from 'node:child_process';
import { DIRS, WRITE, cfg, hist, today, appendHistory } from './config.mjs';

const HISTORY = hist('coupling-history.tsv');
const tsArg = cfg.tsconfig ? `--ts-config ${cfg.tsconfig}` : '';

let data = null;
try {
  const out = execSync(
    `npx depcruise ${DIRS.join(' ')} --no-config --output-type json --ts-pre-compilation-deps ${tsArg} --metrics --do-not-follow node_modules --exclude "node_modules|[.](test|spec)[.]"`,
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  data = JSON.parse(out);
} catch (e) {
  try { data = JSON.parse(e.stdout); } catch { /* leave null */ }
}
if (!data) { console.error('coupling: depcruise produced no parseable output (check dependency-cruiser install / tsconfig)'); process.exit(0); }

const ours = (s) => /^(apps|packages|src)\//.test(s) || DIRS.some((d) => s.startsWith(d));
const modules = (data.modules ?? []).filter((m) => ours(m.source) && !m.coreModule && !m.couldNotResolve);
const folders = (data.folders ?? []).filter((f) => ours(f.name) && f.moduleCount > 1);

if (!modules.length) { console.log('\nCoupling / fan-out — no modules resolved (check `dirs` / tsconfig)'); process.exit(0); }

const fanOuts = modules.map((m) => (m.dependencies ?? []).length);
const maxFanOut = Math.max(...fanOuts);
const highCoupling = modules.filter((m) => (m.dependencies ?? []).length > 10).length;
const meanInstab = modules.reduce((s, m) => s + (m.instability ?? 0), 0) / modules.length;
const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;

console.log(`\nCoupling / fan-out — ${modules.length} modules`);
console.log(`  max fan-out ${maxFanOut} · modules importing >10 of ours: ${highCoupling} · mean instability ${pct(meanInstab)}`);
console.log('  highest fan-out (most-coupled — hardest to change in isolation):');
for (const m of [...modules].sort((a, b) => (b.dependencies ?? []).length - (a.dependencies ?? []).length).slice(0, 8)) {
  console.log(`    Ce=${String((m.dependencies ?? []).length).padStart(2)} I=${pct(m.instability).padStart(4)}  ${m.source}`);
}
if (folders.length) {
  console.log('  folder instability (low = stable/depended-on, high = volatile):');
  for (const f of [...folders].sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`    I=${pct(f.instability).padStart(4)}  Ca=${String(f.afferentCouplings).padStart(3)} Ce=${String(f.efferentCouplings).padStart(3)}  ${f.name} (${f.moduleCount} files)`);
  }
}

if (WRITE) {
  appendHistory(HISTORY, 'date\tmodules\tmax_fanout\thigh_coupling_gt10\tmean_instability_pct\n',
    `${today()}\t${modules.length}\t${maxFanOut}\t${highCoupling}\t${Math.round(meanInstab * 100)}\n`);
  console.log(`\nappended reading → ${HISTORY}`);
}
