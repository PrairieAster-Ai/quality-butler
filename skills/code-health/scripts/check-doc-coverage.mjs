#!/usr/bin/env node
//
// Documentation drift-check. Reports/gates exported declarations in the
// `docDirs` that lack an adjacent TSDoc `/** */` block (directly above the
// export, no blank line — what react-docgen-typescript and IDE quick-info read).
// The /code-readability skill is the authoritative doc owner + annotator; this is
// the lightweight reading the CodeHealth roll-up consumes for its Documentation
// dimension, and it can also serve as a CI gate.
//
//   node check-doc-coverage.mjs                  # check docDirs, exit 1 on any gap
//   node check-doc-coverage.mjs --list           # list every export + status
//   node check-doc-coverage.mjs <dir> [dir...]   # ad-hoc dirs
//
import fs from 'node:fs';
import { DOC_DIRS, walk } from './config.mjs';

const args = process.argv.slice(2);
const LIST = args.includes('--list');
const dirArgs = args.filter((a) => !a.startsWith('--'));
const DIRS = dirArgs.length ? dirArgs : DOC_DIRS;

const DECL = /^export\s+(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:function|class|const|interface|enum)\s+(\w+)|^export\s+type\s+(\w+)\s*[=<]/;
const REEXPORT = /^export\s+(?:type\s+)?\{|^export\s+\*|from\s+['"][^'"]+['"];?\s*$/;

const files = DIRS.flatMap((d) => walk(d)).sort();
let total = 0, documented = 0;
const gaps = [];

for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (REEXPORT.test(lines[i])) continue;
    const m = lines[i].match(DECL);
    if (!m) continue;
    const name = m[1] || m[2];
    if (!name) continue;
    total++;
    const ok = (lines[i - 1] || '').trim().endsWith('*/');
    if (ok) documented++;
    else gaps.push({ file, line: i + 1, name });
    if (LIST) console.log(`${ok ? '✓' : '✗'}  ${file}:${i + 1}  ${name}`);
  }
}

const pct = total ? Math.round((documented / total) * 100) : 100;
console.log(`\nTSDoc coverage of exported declarations in ${DIRS.join(', ')}: ${documented}/${total} (${pct}%)`);

if (gaps.length && process.argv.includes('--gate')) {
  console.error(`\n✗ ${gaps.length} exported declaration(s) missing adjacent TSDoc:`);
  for (const g of gaps) console.error(`  ${g.file}:${g.line}  ${g.name}`);
  console.error('\nFix: add a /** ... */ block on the line directly above each export. See /code-readability.');
  process.exit(1);
}
