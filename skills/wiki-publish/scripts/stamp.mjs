#!/usr/bin/env node
//
// Generic marker stamper — the shared substrate for keeping facts in hand-authored
// wiki/markdown pages current. Fills every `<!--PREFIX:NAME-->…<!--/PREFIX:NAME-->`
// region in the target files from a facts JSON (`{ NAME: value }`), so prose can't
// drift from the numbers. Generic over PREFIX so it serves any producer:
//   /code-health  → prefix `ch`  (CodeHealth badge/chart/pie/metrics)
//   /code-readability → prefix `cr` (team-page prereqs/scripts/env/stack)
// Block values (containing newlines: charts, tables, mermaid) are padded onto
// their own lines; markers stay invisible so the whole block regenerates in place.
// Idempotent.
//
//   node stamp.mjs <facts.json> <prefix> <file.md>...
//
import fs from 'node:fs';

const [factsPath, prefix, ...targets] = process.argv.slice(2);
if (!factsPath || !prefix || !targets.length) {
  console.error('usage: stamp.mjs <facts.json> <prefix> <file.md>...');
  process.exit(1);
}
if (!fs.existsSync(factsPath)) { console.error(`${factsPath} missing`); process.exit(1); }

const facts = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
const VALUES = {};
for (const [k, v] of Object.entries(facts)) {
  const str = String(v);
  VALUES[k] = str.includes('\n') ? `\n${str}\n` : str;
}

let stamped = 0;
for (const f of targets) {
  if (!fs.existsSync(f)) { console.error(`  skip (missing): ${f}`); continue; }
  const src = fs.readFileSync(f, 'utf8');
  let out = src;
  for (const [name, val] of Object.entries(VALUES)) {
    // Function replacer so `$` in values (shell `$1`, `$PORT`) is inserted literally.
    out = out.replace(
      new RegExp(`(<!--${prefix}:${name}-->)[\\s\\S]*?(<!--/${prefix}:${name}-->)`, 'g'),
      (_m, p1, p2) => `${p1}${val}${p2}`,
    );
  }
  if (out !== src) { fs.writeFileSync(f, out); stamped++; console.log(`  stamped ${f}`); }
  else console.log(`  already current: ${f}`);
}
console.log(`\n${prefix}: ${Object.keys(facts).length} facts → ${stamped} file(s) updated`);
