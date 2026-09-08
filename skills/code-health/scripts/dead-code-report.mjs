#!/usr/bin/env node
//
// What is still here that nothing uses?
//
// **Assistance adds code readily and removes it almost never.** Every other
// measure in this skill asks whether what exists is any good; this one asks
// whether it should exist at all, and it is the question that goes unasked
// longest because nothing about dead code is red. It compiles. It is covered by
// no test and lowers no score. It sits there being read by the next person, and
// by the next model, as though it means something.
//
// **`noUnusedLocals` does not cover this, and the gap is exactly where a model
// works.** An unused local is a compiler error; an unused *export* is a public
// API with no callers, which is indistinguishable from a public API whose
// callers are elsewhere. A session that extracts a helper, changes its mind, and
// leaves the export behind produces one of these every time — and the extraction
// is usually the right call, which is why nobody goes back.
//
// Measured on the repo this was written for: three exports orphaned in a single
// day's work, one of them found only because somebody happened to look.
//
// `knip` does the reading. This turns it into a number that trends, so the
// question becomes "is this getting worse" rather than "does anybody feel like
// running knip today".
//
//   node dead-code-report.mjs             # print + append a reading
//   node dead-code-report.mjs --no-write  # print only
//   node dead-code-report.mjs --list      # name them, for a worklist
//
// **The ignore list is the thing to watch.** Every path knip is told to skip is
// code the detector has been instructed not to look at, and an ignore added to
// quiet a false positive stays for years. The count of ignored patterns is
// recorded beside the findings for that reason: a falling dead-code count and a
// rising ignore count is not an improvement.
//
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { WRITE, cfg, hist, today, appendHistory, HISTORY_DIR } from './config.mjs';

/**
 * Whether this was run, or imported.
 *
 * **A module that shells out on import cannot be tested.** Its own test file
 * imports `parseReport`, and until this guard existed that import fired a knip
 * run in whatever directory the test happened to be in — slow, and it wrote a
 * history row in the wrong repo if it succeeded.
 */
const RUN_DIRECTLY = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

const argv = process.argv.slice(2);
const LIST = argv.includes('--list');
const HISTORY = hist('dead-code-history.tsv');
const TMP = path.join(HISTORY_DIR, '.knip-report.json');

/**
 * knip's own config, if the repo has one.
 *
 * Read rather than written. A repo that has tuned knip has made decisions this
 * script has no business overriding, and a repo that has not gets knip's
 * defaults — which are conservative, and wrong in the safe direction.
 */
function ignoreCount() {
  for (const f of ['knip.json', 'knip.jsonc', '.knip.json']) {
    if (!fs.existsSync(f)) continue;
    try {
      const raw = fs.readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '');
      const c = JSON.parse(raw);
      return [c.ignore, c.ignoreDependencies, c.ignoreBinaries, c.ignoreExportsUsedInFile]
        .filter(Array.isArray).reduce((n, a) => n + a.length, 0);
    } catch { return 0; }
  }
  // Also counts a `knip` key in package.json, which is where small repos put it.
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const c = pkg.knip ?? {};
    return [c.ignore, c.ignoreDependencies, c.ignoreBinaries]
      .filter(Array.isArray).reduce((n, a) => n + a.length, 0);
  } catch { return 0; }
}

/** What knip found, flattened into the four things worth counting separately. */
function read(report) {
  const files = report.files?.length ?? 0;
  let exports = 0; let types = 0; let deps = 0;
  const named = { files: report.files ?? [], exports: [], deps: [] };

  for (const issue of report.issues ?? []) {
    for (const e of issue.exports ?? []) {
      exports += 1;
      named.exports.push(`${issue.file}:${e.line ?? '?'} ${e.name}`);
    }
    for (const e of issue.types ?? []) {
      types += 1;
      named.exports.push(`${issue.file}:${e.line ?? '?'} type ${e.name}`);
    }
    for (const d of [...(issue.dependencies ?? []), ...(issue.devDependencies ?? [])]) {
      deps += 1;
      named.deps.push(`${issue.file} → ${d.name}`);
    }
  }
  return { files, exports, types, deps, named };
}

/**
 * knip's JSON, out of a stdout that is not only JSON.
 *
 * It prints a dotenv notice above the report, on stdout, and `--reporter json`
 * does not suppress it:
 *
 *     ◇ injected env (18) from .env // tip: ⌘ custom filepath { path: '…/.env' }
 *
 * **That notice contains a brace**, which is what makes this two bugs rather
 * than one. Parsing the stream whole throws, so the first version reported
 * "could not run" against a knip that ran perfectly; parsing from the first
 * `{` then landed inside the tip and threw again, with a message about JSON
 * position 2 that pointed nowhere useful.
 *
 * So: try every brace and keep the first that yields a whole object. The
 * output is tens of kilobytes and the candidates are few, which is cheap
 * enough to be worth not being clever about — a regex for the notice would
 * break the next time knip changed its wording, silently.
 */
export function parseReport(out) {
  const problems = [];
  for (let i = out.indexOf('{'); i >= 0; i = out.indexOf('{', i + 1)) {
    try {
      const parsed = JSON.parse(out.slice(i));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (e) {
      problems.push(e.message);
      if (problems.length > 20) break;
    }
  }
  throw new Error(`no JSON object in knip output (${problems.length} candidates tried): `
    + out.slice(0, 160).replace(/\s+/g, ' '));
}

if (RUN_DIRECTLY) {
  let found = { files: 0, exports: 0, types: 0, deps: 0, named: { files: [], exports: [], deps: [] } };
  let ran = false;
  let why = '';
  try {
    // `--no-exit-code` because a finding is a reading, not a failure. This script
    // records a trend; whether a number is allowed to rise is the butler's call
    // and belongs in a gate, not in the measurement.
    const out = execSync('npx --yes knip --reporter json --no-exit-code',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
    found = read(parseReport(out));
    ran = true;
  } catch (e) {
    why = String(e?.stderr || e?.message || e).split('\n').find((l) => l.trim()) ?? '';
  } finally {
    fs.rmSync(TMP, { force: true });
  }

  if (!ran) {
    // **Silence here would be the failure this skill exists to catch.** A
    // detector that cannot run and says nothing is a green check measuring
    // nothing — see gate-liveness.mjs for the nine of those this repo family has
    // already shipped. So it says so, and says why, because "could not run" on
    // its own sent the first reader looking in the wrong place.
    console.log('\nDead code (knip): could not run.');
    if (why) console.log(`  ${why}`);
    console.log('  npx knip --reporter json   # to reproduce');
  }

  if (ran) {
    const ignores = ignoreCount();
    const total = found.files + found.exports + found.types + found.deps;
    console.log(`\nDead code (knip): ${total} findings`
      + ` · ${found.files} unimported files`
      + ` · ${found.exports} unused exports`
      + ` · ${found.types} unused types`
      + ` · ${found.deps} unused dependencies`);
    if (ignores > 0) {
      console.log(`  ${ignores} ignore patterns configured — code the detector was told not to read.`);
    }

    if (LIST) {
      const show = (label, xs) => {
        if (xs.length === 0) return;
        console.log(`\n  ${label}`);
        for (const x of xs.slice(0, 40)) console.log(`    ${x}`);
        if (xs.length > 40) console.log(`    …and ${xs.length - 40} more`);
      };
      show('Unimported files', found.named.files);
      show('Unused exports', found.named.exports);
      show('Unused dependencies', found.named.deps);
    }

    if (WRITE) {
      appendHistory(HISTORY,
        'date\ttotal\tfiles\texports\ttypes\tdeps\tignores\n',
        `${today()}\t${total}\t${found.files}\t${found.exports}\t${found.types}\t${found.deps}\t${ignores}\n`);
      console.log(`\nappended reading → ${HISTORY}`);
    }
  }
}

void cfg;
