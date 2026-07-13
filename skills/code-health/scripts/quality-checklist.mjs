#!/usr/bin/env node
//
// Quality-coverage checklist — the steward's "what quality capability is available,
// and is it actually turned on here?" tracker. Probes the repo (CI workflows, ESLint
// config, package.json scripts, pre-commit, code-health history, installed skills,
// and — with --wiki — published wiki pages) for every capability the quality skills
// offer, classifies each ✅ done / ⚠️ partial / ❌ gap / ➖ n/a, and renders a grouped
// matrix + summary. Writes facts to <historyDir>/quality-checklist.json and, with
// --stamp, fills the <!--ql:*--> markers on the Quality-Coverage dashboard. Surfaces
// the things an audit forgot (e.g. metrics measured but never made CI gates).
//
//   node quality-checklist.mjs [--wiki <wiki-dir>] [--stamp <page.md>...]
//
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { HISTORY_DIR, today } from './config.mjs';

const argv = process.argv.slice(2);
const wikiDir = argv.includes('--wiki') ? argv[argv.indexOf('--wiki') + 1] : null;
const stampIdx = argv.indexOf('--stamp');
const stampTargets = stampIdx >= 0 ? argv.slice(stampIdx + 1).filter((a) => !a.startsWith('--')) : [];

const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const exists = (p) => fs.existsSync(p);
function find(globs, roots = ['.', 'apps/web', 'apps/api']) {
  const out = [];
  for (const r of roots) for (const g of globs) { const p = path.join(r, g); if (exists(p)) out.push(p); }
  return out;
}
const ci = find(['.github/workflows']).flatMap((d) => exists(d) ? fs.readdirSync(d).map((f) => read(path.join(d, f))) : []).join('\n')
  || (exists('.github/workflows') ? fs.readdirSync('.github/workflows').map((f) => read(path.join('.github/workflows', f))).join('\n') : '');
const pkg = (() => { try { return JSON.parse(read('package.json')); } catch { return {}; } })();
const scripts = pkg.scripts || {};
const eslintTxt = find(['eslint.config.js', 'eslint.config.mjs', '.eslintrc.js', '.eslintrc.json', '.eslintrc.cjs']).map(read).join('\n');
const vitestTxt = find(['vitest.config.ts', 'vitest.config.js', 'vite.config.ts']).map(read).join('\n');
const preCommit = read('.pre-commit-config.yaml') + (exists('.husky') ? fs.readdirSync('.husky').map((f) => read(path.join('.husky', f))).join('\n') : '');

const npmScript = (re) => Object.keys(scripts).some((k) => re.test(k));
const ciHas = (re) => re.test(ci);
const usesDrizzle = /drizzle/.test(JSON.stringify(pkg.dependencies || {}) + JSON.stringify(pkg.devDependencies || {}));

// status: 'done' | 'partial' | 'gap' | 'na' | 'manual'
const DONE = 'done', GAP = 'gap', PARTIAL = 'partial', NA = 'na', MANUAL = 'manual';
// Wiki-output probes: without --wiki we can't tell (manual check); with it, done/gap.
const wikiStatus = (name) => wikiDir ? (exists(path.join(wikiDir, `${name}.md`)) ? DONE : GAP) : MANUAL;
const ICON = { done: '✅', partial: '⚠️', gap: '❌', na: '➖', manual: '🔍' };

const CAPS = [
  // group, capability, status, detail
  ['🛡️ Build & test gates (CI)', 'Lint', ciHas(/lint/i) ? DONE : GAP, '`eslint --max-warnings 0`'],
  ['🛡️ Build & test gates (CI)', 'Type-check', ciHas(/type.?check|tsc/i) ? DONE : GAP, '`tsc --noEmit`'],
  ['🛡️ Build & test gates (CI)', 'Unit tests', npmScript(/^test/) ? DONE : GAP, 'vitest'],
  ['🛡️ Build & test gates (CI)', 'Build validation', ciHas(/build/i) ? DONE : GAP, 'vite build'],
  ['🛡️ Build & test gates (CI)', 'Coverage threshold gate', /thresholds\s*:\s*\{[^}]*\d/.test(vitestTxt) ? DONE : GAP, 'fail CI below a coverage floor'],

  ['🔒 Security', 'Secret scanning', (ciHas(/trufflehog|gitleaks/i) || /gitleaks|detect-secret/i.test(preCommit)) ? DONE : GAP, 'TruffleHog (CI) / gitleaks (pre-commit)'],
  ['🔒 Security', 'Dependency audit (SCA)', ciHas(/npm audit|security audit/i) ? DONE : GAP, '`npm audit` in CI + code-health trend'],
  ['🔒 Security', 'SAST (CodeQL)', ciHas(/codeql/i) ? DONE : GAP, 'GitHub CodeQL'],
  ['🔒 Security', '/security-audit per-PR (semgrep + osv)', ciHas(/security-audit/i) && /run/.test(ci) ? DONE : GAP, 'differential SAST/SCA + LLM verify on the diff'],

  ['📊 Code-health metrics', 'Maintainability Index', npmScript(/^mi:report/) ? DONE : GAP, ''],
  ['📊 Code-health metrics', 'Cyclomatic complexity', npmScript(/^complexity:report/) ? DONE : GAP, ''],
  ['📊 Code-health metrics', 'Hotspots (churn × complexity)', npmScript(/^hotspot:report/) ? DONE : GAP, ''],
  ['📊 Code-health metrics', 'Coupling / instability', npmScript(/^coupling:report/) ? DONE : GAP, ''],
  ['📊 Code-health metrics', 'Change coupling', npmScript(/^change-coupling:report/) ? DONE : GAP, ''],
  ['📊 Code-health metrics', 'Duplication', npmScript(/^duplication:report/) ? DONE : GAP, ''],
  ['📊 Code-health metrics', 'CodeHealth roll-up + dashboard', exists(path.join(HISTORY_DIR, 'codehealth-stamp.json')) ? DONE : GAP, ''],

  ['⛓️ Enforcement gates (measured → enforced)', 'Circular-imports gate', ciHas(/madge|check-circular|lint:circular/i) ? DONE : GAP, 'madge `--circular` as a CI gate'],
  ['⛓️ Enforcement gates (measured → enforced)', 'Cognitive-complexity gate', /sonarjs.*cognitive|cognitive-complexity/i.test(eslintTxt) ? DONE : GAP, 'eslint-plugin-sonarjs `cognitive-complexity` (ratchet)'],
  ['⛓️ Enforcement gates (measured → enforced)', 'Cyclomatic-complexity rule', /(?:^|[\s{,])complexity\s*:\s*\[/m.test(eslintTxt) ? DONE : GAP, 'eslint `complexity` rule (ratchet)'],
  ['⛓️ Enforcement gates (measured → enforced)', 'Doc-coverage gate', ciHas(/check-doc-coverage|docs:(check|gate)/i) ? DONE : GAP, '`check-doc-coverage --gate` in CI'],

  ['📚 Documentation', 'TSDoc coverage measured', npmScript(/doc/) || exists(path.join(HISTORY_DIR, 'codehealth-stamp.json')) ? DONE : PARTIAL, '/code-readability'],
  ['📚 Documentation', 'API reference published', wikiStatus('Reference-Home'), 'Reference-Home/Components/Hooks/Lib/Types'],
  ['📚 Documentation', 'Page-Anatomy (screen flows)', wikiStatus('Page-Anatomy'), 'Mermaid sequence diagrams'],
  ['📚 Documentation', 'Team pages (onboarding)', wikiStatus('Getting-Started'), 'Getting-Started + Skill-Inventory'],
  ['📚 Documentation', 'DB schema page', usesDrizzle ? (wikiStatus('Reference-Database-Schema')) : NA, usesDrizzle ? 'gen-schema-page' : 'N/A — no Drizzle ORM'],

  ['🤖 Steward automation', 'Weekly sweep', /quality-steward[\s\S]*cron:/.test(ci) ? DONE : GAP, 'scheduled CodeHealth + review'],
  ['🤖 Steward automation', 'Per-PR review', /quality-steward[\s\S]*pull_request/.test(ci) ? DONE : GAP, 'differential review on PRs'],
  ['🤖 Steward automation', 'Shared wiki-publish substrate', exists('.claude/skills/wiki-publish') ? DONE : GAP, 'stamp + push'],
];

// ── Render ──
const groups = [...new Set(CAPS.map((c) => c[0]))];
const rows = ['| Capability | Status | Notes |', '|---|:--:|---|'];
for (const g of groups) {
  rows.push(`| **${g}** | | |`);
  for (const [, name, status, detail] of CAPS.filter((c) => c[0] === g)) {
    rows.push(`| ${name} | ${ICON[status]} | ${detail} |`);
  }
}
const matrix = rows.join('\n');

const counts = CAPS.reduce((a, [, , s]) => { a[s] = (a[s] || 0) + 1; return a; }, {});
const applicable = CAPS.filter((c) => c[2] !== NA && c[2] !== MANUAL).length;
const done = counts[DONE] || 0;
const gaps = CAPS.filter((c) => c[2] === GAP);
const summary = `**${done} / ${applicable}** auto-detected capabilities enabled · **${gaps.length} gaps** · ${counts[manualOr('manual')] || 0} need a manual/wiki check`;

console.log(`\nQuality coverage — ${done}/${applicable} enabled, ${gaps.length} gaps (${today()})`);
for (const g of groups) {
  console.log(`  ${g}`);
  for (const [, name, status, detail] of CAPS.filter((c) => c[0] === g)) {
    console.log(`    ${ICON[status]} ${name}${detail ? `  — ${detail}` : ''}`);
  }
}
if (gaps.length) {
  console.log(`\n  GAPS to close:`);
  for (const [, name, , detail] of gaps) console.log(`    ❌ ${name}${detail ? ` — ${detail}` : ''}`);
}

function manualOr(x) { return x; }

const facts = {
  matrix,
  summary,
  date: today(),
  enabled: `${done} / ${applicable}`,
  gaps: gaps.length ? gaps.map((g) => `\`${g[1]}\``).join(' · ') : 'none',
};
fs.mkdirSync(HISTORY_DIR, { recursive: true });
fs.writeFileSync(path.join(HISTORY_DIR, 'quality-checklist.json'), JSON.stringify(facts, null, 2) + '\n');
console.log(`\nwrote facts → ${path.join(HISTORY_DIR, 'quality-checklist.json')}`);

if (stampTargets.length) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const shared = path.resolve(here, '../../wiki-publish/scripts/stamp.mjs');
  const factsFile = path.join(HISTORY_DIR, 'quality-checklist.json');
  if (exists(shared)) {
    execSync(`node "${shared}" "${factsFile}" ql ${stampTargets.map((t) => `"${t}"`).join(' ')}`, { stdio: 'inherit' });
  } else {
    console.error('  (/wiki-publish not installed — wrote facts JSON; stamp manually)');
  }
}
