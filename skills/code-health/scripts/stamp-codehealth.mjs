#!/usr/bin/env node
//
// Stamp the current CodeHealth readings into the dashboard's `<!--ch:NAME-->`
// markers. Reads <historyDir>/codehealth-stamp.json (written by codehealth-report.mjs
// — run it first) and fills the markers. Delegates to the shared **/wiki-publish**
// `stamp.mjs` (the common marker substrate, prefix `ch`) when that sibling skill is
// installed; otherwise falls back to an inline stamp so code-health stays
// self-contained. Idempotent.
//
//   node stamp-codehealth.mjs <file.md>...
//
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { hist } from './config.mjs';

const STAMP = hist('codehealth-stamp.json');
const targets = process.argv.slice(2);
if (!targets.length) { console.error('usage: stamp-codehealth.mjs <file.md>...'); process.exit(1); }
if (!fs.existsSync(STAMP)) { console.error(`${STAMP} missing — run the codehealth report first`); process.exit(1); }

const here = path.dirname(fileURLToPath(import.meta.url));
const shared = path.resolve(here, '../../wiki-publish/scripts/stamp.mjs');

if (fs.existsSync(shared)) {
  // Shared substrate (DRY): /wiki-publish owns marker stamping for all producers.
  execSync(`node "${shared}" "${STAMP}" ch ${targets.map((t) => `"${t}"`).join(' ')}`, { stdio: 'inherit' });
} else {
  // Fallback: inline stamp so code-health works without /wiki-publish installed.
  const s = JSON.parse(fs.readFileSync(STAMP, 'utf8'));
  const VALUES = {};
  for (const [k, v] of Object.entries(s)) {
    const str = String(v);
    VALUES[k] = str.includes('\n') ? `\n${str}\n` : str;
  }
  let stamped = 0;
  for (const f of targets) {
    const src = fs.readFileSync(f, 'utf8');
    let out = src;
    for (const [name, val] of Object.entries(VALUES)) {
      out = out.replace(new RegExp(`(<!--ch:${name}-->)[\\s\\S]*?(<!--/ch:${name}-->)`, 'g'), (_m, p1, p2) => `${p1}${val}${p2}`);
    }
    if (out !== src) { fs.writeFileSync(f, out); stamped++; console.log(`  stamped ${f}`); }
    else console.log(`  already current: ${f}`);
  }
  console.log(`\nCodeHealth ${s.badge} · ${s.files} files · ${s.loc} LOC — ${stamped} file(s) updated`);
}
