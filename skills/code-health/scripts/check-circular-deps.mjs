#!/usr/bin/env node
//
// Circular-import drift-check (CI gate). Fails when any source dir contains a
// circular dependency. Import cycles couple modules tightly, make refactors and
// tree-shaking risky, and are a readability smell for humans and AI. Uses `madge`.
//
//   node check-circular-deps.mjs
//
import { DIRS, cfg, requireRepo } from './config.mjs';

const madge = requireRepo('madge');

let total = 0;
for (const dir of DIRS) {
  const opts = { fileExtensions: ['ts', 'tsx'] };
  if (cfg.tsconfig) opts.tsConfig = cfg.tsconfig;
  const res = await madge(dir, opts);
  const cycles = res.circular();
  if (cycles.length) {
    console.error(`\n✗ ${dir}: ${cycles.length} circular dependenc${cycles.length === 1 ? 'y' : 'ies'}:`);
    for (const c of cycles) console.error(`    ${[...c, c[0]].join(' → ')}`);
    total += cycles.length;
  } else {
    console.log(`✓ ${dir}: no circular dependencies`);
  }
}

if (total) {
  console.error(`\n${total} circular import${total === 1 ? '' : 's'} found. Break the cycle — move the shared`
    + ' type/value into a module both sides import, or invert one dependency.');
  process.exit(1);
}
console.log('\n✓ no circular imports.');
