#!/usr/bin/env node
//
// Is the doc tool layer actually installed?
//
//   node <skill>/scripts/check-tools.mjs [--json]
//
// **Run this before generate/publish, and believe it.** The generators shell
// out to react-docgen-typescript and typedoc, which are deliberately not
// project dependencies. When they are absent the tool layer exits early, the
// publish produces nothing, and the run reports success — a failure shaped
// exactly like "the code did not change this week". One repo's reference pages
// drifted to describing 59% of its code that way, with clean logs throughout.
//
// Exits non-zero when anything is missing, so a CI step or an agent's playbook
// can treat it as a gate rather than a suggestion.
//
import { createRequire } from 'node:module';

const require = createRequire(`${process.cwd()}/`);

/** What each package unlocks, so a partial install reports what it costs. */
const TOOLS = [
  { pkg: 'react-docgen-typescript', covers: 'component descriptions + props tables' },
  { pkg: 'typedoc', covers: 'hooks / lib / api reference' },
  { pkg: 'typedoc-plugin-markdown', covers: 'markdown output for the above' },
];

const results = TOOLS.map((t) => {
  try {
    require.resolve(t.pkg);
    return { ...t, present: true };
  } catch {
    return { ...t, present: false };
  }
});

const missing = results.filter((r) => !r.present);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok: missing.length === 0, tools: results }, null, 2));
  process.exit(missing.length ? 1 : 0);
}

for (const r of results) {
  console.log(`  ${r.present ? '✓' : '✗'} ${r.pkg.padEnd(26)} ${r.covers}`);
}

if (!missing.length) {
  console.log('\n✓ doc tool layer present: generate/publish will produce real output.');
  process.exit(0);
}

console.error(`\n✗ ${missing.length} of ${TOOLS.length} missing. Generation will silently produce`);
console.error('  nothing and still look like it worked. Install them:\n');
console.error(`    npm i -D ${missing.map((m) => m.pkg).join(' ')}\n`);
console.error('  Or, if this repo prefers not to carry them, add the equivalent step to CI');
console.error('  (the shipped workflow template installs them with --no-save).');
process.exit(1);
