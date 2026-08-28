#!/usr/bin/env node
//
// The same exported name, declared in two places, with two shapes.
//
// **This is the characteristic failure of AI-assisted work**, and it is not the
// one copy-paste detectors look for. jscpd finds duplicated *blocks*; this finds
// duplicated *contracts* — one `PlannedRow` in the API and another in the web
// app, agreeing on the day they were written and drifting apart afterwards.
//
// An assistant works in the context it was given. Asked to add a field to a
// screen, it declares the type it needs where it is looking, because the other
// declaration is in a file it never opened. The result compiles, passes review,
// and is wrong later rather than now: the server starts sending `locations` and
// the screen cannot show them, because its copy of the type never learned the
// field exists.
//
// Found by hand on one repo: six silent drifts across seventeen duplicated
// declarations, including one where a preview screen could not display where an
// import said its items go.
//
// Same name + same shape is a warning (it will drift). Same name + different
// shape is a bug that has already happened.
//
//   node duplicate-declarations.mjs [--no-write]
//
import fs from 'node:fs';
import path from 'node:path';
import { DIRS, WRITE, walk, hist, today, appendHistory, HISTORY_DIR } from './config.mjs';

const HISTORY = hist('duplicate-declarations-history.tsv');
/** `export interface Foo {`, `export type Foo =`, `export const FOO =` … */
const DECL = /^export\s+(?:declare\s+)?(interface|type|const|enum)\s+([A-Za-z_$][\w$]*)/;
/** Names too generic to mean the same thing in two places. */
const IGNORE = new Set(['default', 'Props', 'Options', 'Config', 'State', 'Result', 'Params']);

/** The declaration body, normalized so formatting differences are not "drift". */
function bodyOf(lines, i) {
  const out = [];
  let depth = 0;
  for (let j = i; j < lines.length && j < i + 200; j += 1) {
    const l = lines[j];
    out.push(l.replace(/\/\/.*$/, '').trim());
    depth += (l.match(/[{[]/g) || []).length - (l.match(/[}\]]/g) || []).length;
    if (j > i || /[{[]/.test(l)) { if (depth <= 0) break; } else if (/;\s*$/.test(l)) break;
  }
  // Strip comments BEFORE collapsing whitespace. Doing it the other way round
  // leaves a double space where the comment was, so a documented declaration
  // never matched its undocumented twin and every such pair read as drift —
  // which is the noisy failure this tool exists to avoid, committed by the tool.
  return out.join(' ')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/;\s*}/g, ' }')
    .replace(/,\s*}/g, ' }')
    .trim();
}

const decls = new Map(); // name -> [{ file, body }]
for (const file of DIRS.flatMap(walk)) {
  if (/\.(test|spec)\.[tj]sx?$/.test(file) || /\.d\.ts$/.test(file)) continue;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const m = DECL.exec(line);
    if (!m || IGNORE.has(m[2])) return;
    // A re-export is the fix, not the problem: `export type { X } from '…'`.
    if (/\bfrom\s+['"]/.test(line)) return;
    const body = bodyOf(lines, i);
    // **A derivation is the fix, not another copy.** `type Location =
    // Pick<Location, 'id' | 'name'>` in a screen, over a canonical row declared
    // once, is exactly what this tool asks for when it finds one entity with
    // many views — and counting it as a second declaration meant the
    // recommended fix produced a finding. A utility type is derived by
    // construction: it cannot exist without something to derive from.
    if (/=\s*(Pick|Omit|Partial|Required|Readonly|Exclude|Extract|Record|ReturnType|Awaited)\s*</.test(body)
      || /=\s*typeof\s/.test(body)) return;
    if (!decls.has(m[2])) decls.set(m[2], []);
    decls.get(m[2]).push({ file, body });
  });
}

/** Which top-level source root a file belongs to, so we can spot cross-layer pairs. */
const layerOf = (f) => (DIRS.find((d) => f.startsWith(d)) || path.dirname(f));

const dupes = [...decls.entries()]
  .filter(([, v]) => v.length > 1)
  .map(([name, v]) => ({
    name,
    sites: v,
    drifted: new Set(v.map((x) => x.body)).size > 1,
    crossLayer: new Set(v.map((x) => layerOf(x.file))).size > 1,
  }))
  .sort((a, b) => (Number(b.drifted) - Number(a.drifted)) || (Number(b.crossLayer) - Number(a.crossLayer)));

const drifted = dupes.filter((d) => d.drifted);
const crossLayer = dupes.filter((d) => d.crossLayer);

console.log(`\nDuplicate exported declarations: ${DIRS.join(', ')}\n`);
if (!dupes.length) {
  console.log('  ✓ every exported name is declared exactly once\n');
} else {
  for (const d of dupes.slice(0, 25)) {
    const tag = d.drifted ? '✗ DRIFTED' : (d.crossLayer ? '⚠ cross-layer' : '· same layer');
    console.log(`  ${tag}  ${d.name}`);
    for (const s of d.sites) console.log(`      ${s.file}`);
  }
  if (dupes.length > 25) console.log(`  … and ${dupes.length - 25} more`);
  console.log(`\n  ${dupes.length} duplicated · ${crossLayer.length} cross-layer · ${drifted.length} already drifted`);
  if (drifted.length) {
    console.log('\n  A drifted pair is not a future problem: one side is already missing');
    console.log('  something the other has. Three different things hide in this list, and');
    console.log('  they want three different fixes:');
    console.log('    · one concept, copied      → give it one home, re-export from the other');
    console.log('    · one entity, many views   → derive each from the canonical type (Pick<…>)');
    console.log('    · different concepts, one name → rename them apart; nothing to unify');
    console.log('  Only the first is a contract to share. Widening a view type until it');
    console.log('  covers every screen makes each screen depend on fields it never reads.');
  }
}

if (WRITE) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  appendHistory(HISTORY, 'date\tduplicated\tcross_layer\tdrifted\n',
    `${today()}\t${dupes.length}\t${crossLayer.length}\t${drifted.length}\n`);
  console.log(`\nappended reading → ${path.relative(process.cwd(), HISTORY)}`);
}
