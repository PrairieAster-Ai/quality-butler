#!/usr/bin/env node
//
// Language-agnostic size/complexity backend — the fallback used when the
// TypeScript-based producers (maintainability/complexity/hotspot) don't apply
// (Go, Rust, Python, mixed-language, or any non-TS repo). Shells out to `scc`
// (Sloc, Cloc and Code — https://github.com/boyter/scc) which counts files,
// code lines, comments, and a cyclomatic-complexity estimate across ~200
// languages, then records a per-repo summary to <historyDir>/agnostic-history.tsv.
// If `scc` isn't installed it prints a one-line install hint and exits 0
// (graceful, non-fatal — same tolerance the TS producers show for missing tools).
//
//   node agnostic-report.mjs            # print + append a reading
//   node agnostic-report.mjs --no-write # print only
//
import { execSync } from 'node:child_process';
import { DIRS, WRITE, r1, r2, hist, today, appendHistory } from './config.mjs';

const HISTORY = hist('agnostic-history.tsv');

// scc must be on PATH. Bail gracefully with an install hint if it isn't.
function hasScc() {
  try { execSync('command -v scc', { stdio: ['ignore', 'ignore', 'ignore'] }); return true; }
  catch { return false; }
}
if (!hasScc()) {
  console.log('\nLanguage-agnostic size/complexity: `scc` not installed. Install it, then re-run:');
  console.log('  go install github.com/boyter/scc/v3@latest   # or:  brew install scc');
  process.exit(0);
}

let langs = [];
try {
  const out = execSync(`scc --format json ${DIRS.join(' ')}`,
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  langs = JSON.parse(out);
} catch (e) {
  console.log(`\nLanguage-agnostic size/complexity: scc produced no parseable output (${(e.message || '').split('\n')[0]})`);
  process.exit(0);
}
if (!Array.isArray(langs) || !langs.length) {
  console.log('\nLanguage-agnostic size/complexity: scc found no source under the configured `dirs`');
  process.exit(0);
}

// scc returns one object per language; there is no total row, so aggregate here.
const sum = (k) => langs.reduce((a, l) => a + (Number(l[k]) || 0), 0);
const files = sum('Count');
const codeLines = sum('Code');
const commentLines = sum('Comment');
const complexityTotal = sum('Complexity');
const complexityMean = files ? r1(complexityTotal / files) : 0;
const commentRatio = (codeLines + commentLines) ? r2((commentLines / (codeLines + commentLines)) * 100) : 0;
const top = [...langs].sort((a, b) => (Number(b.Code) || 0) - (Number(a.Code) || 0))[0];
const topLanguage = top ? top.Name : '';

console.log(`\nLanguage-agnostic size/complexity (scc): ${files} files · ${codeLines} code lines · complexity ${complexityTotal} (mean ${complexityMean}/file) · ${commentRatio}% comments`);
console.log(`  by language (top by code):`);
for (const l of [...langs].sort((a, b) => (Number(b.Code) || 0) - (Number(a.Code) || 0)).slice(0, 8)) {
  console.log(`    ${String(l.Name).padEnd(16)} ${String(l.Count).padStart(4)} files · ${String(l.Code).padStart(7)} code · cx ${String(l.Complexity).padStart(5)}`);
}

if (WRITE) {
  appendHistory(HISTORY, 'date\tfiles\tcode_lines\tcomplexity_total\tcomplexity_mean\tcomment_lines\ttop_language\n',
    `${today()}\t${files}\t${codeLines}\t${complexityTotal}\t${complexityMean}\t${commentLines}\t${topLanguage}\n`);
  console.log(`\nappended reading → ${HISTORY}`);
}
