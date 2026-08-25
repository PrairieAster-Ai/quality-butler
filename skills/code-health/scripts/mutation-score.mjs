#!/usr/bin/env node
//
// Do the tests actually test anything?
//
// **Coverage says a line ran. It does not say anyone checked the result.** A
// suite can execute every branch and assert almost nothing, and under AI
// assistance that is the default failure rather than a rare one: test volume is
// nearly free, and a test that calls the function and asserts it did not throw
// looks exactly like a test that verifies the answer.
//
// This changes the source under the tests' feet and asks whether they notice.
// Flip a comparison, swap `&&` for `||`, negate a boolean. If the suite still
// passes, some behaviour has no test behind it — the mutant "survived".
//
// Only files with a colocated test are mutated. A file with no test at all is a
// coverage question, and answering it here would drown the signal that matters:
// **you have a test for this, and it does not catch a changed comparison.**
//
//   node mutation-score.mjs [--sample 20] [--test "npm test"] [--no-write]
//
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DIRS, WRITE, walk, cfg, hist, today, appendHistory, HISTORY_DIR } from './config.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SAMPLE = Number(arg('--sample', 20));
const TEST_CMD = arg('--test', cfg.testCommand || 'npm test');
const TIMEOUT = Number(arg('--timeout', 300)) * 1000;
const HISTORY = hist('mutation-history.tsv');

/** Each rule rewrites one operator into a different, still-valid one. */
const MUTATORS = [
  { name: 'boundary', find: /([^<>=!])>=/g, to: '$1>' },
  { name: 'boundary', find: /([^<>=!])<=/g, to: '$1<' },
  { name: 'equality', find: /===/g, to: '!==' },
  { name: 'logic', find: /&&/g, to: '||' },
  { name: 'arith', find: /([\w)\]])\s\+\s(?=[\w(])/g, to: '$1 - ' },
  { name: 'literal', find: /\btrue\b/g, to: 'false' },
];
/** Lines where a rewrite means nothing, or breaks compilation rather than behaviour. */
const SKIP = /^\s*(\/\/|\*|\/\*|import |export .* from |type |interface )/;

/** Every (file, line, mutator) site, in a stable order. */
function sites() {
  const out = [];
  for (const file of DIRS.flatMap(walk)) {
    if (/\.(test|spec)\.[tj]sx?$/.test(file) || /\.d\.ts$/.test(file)) continue;
    // Only mutate what someone has claimed to test.
    const stem = file.replace(/\.(ts|tsx|js|jsx)$/, '');
    if (!['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'].some((e) => fs.existsSync(stem + e))) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (SKIP.test(line)) return;
      for (const m of MUTATORS) {
        m.find.lastIndex = 0;
        if (m.find.test(line)) out.push({ file, line: i, mutator: m });
      }
    });
  }
  return out;
}

/** Spread the sample across the whole list rather than taking the first N. */
function spread(all, n) {
  if (all.length <= n) return all;
  const step = all.length / n;
  return Array.from({ length: n }, (_, i) => all[Math.floor(i * step)]);
}

const all = sites();
if (!all.length) {
  console.log('\nMutation score: no mutable file has a colocated test — nothing to measure.\n');
  process.exit(0);
}
const chosen = spread(all, SAMPLE);
console.log(`\nMutation score — ${chosen.length} of ${all.length} sites, \`${TEST_CMD}\`\n`);

const runTests = () => {
  try { execSync(TEST_CMD, { stdio: 'ignore', timeout: TIMEOUT }); return true; }
  catch { return false; }
};

// A suite that is already red cannot kill anything, and every mutant would read
// as "killed" — a perfect score for a broken build.
process.stdout.write('  baseline… ');
if (!runTests()) {
  console.log('FAILING\n\n  ✗ the suite is red before any mutation. Fix that first: every mutant');
  console.log('    would count as killed and the score would read 100%.\n');
  process.exit(1);
}
console.log('green');

let killed = 0;
const survivors = [];
for (const [i, s] of chosen.entries()) {
  const original = fs.readFileSync(s.file, 'utf8');
  const lines = original.split('\n');
  s.mutator.find.lastIndex = 0;
  lines[s.line] = lines[s.line].replace(s.mutator.find, s.mutator.to);
  fs.writeFileSync(s.file, lines.join('\n'));
  const caught = !runTests();
  fs.writeFileSync(s.file, original);
  if (caught) killed += 1;
  else survivors.push({ ...s, code: original.split('\n')[s.line].trim().slice(0, 90) });
  process.stdout.write(`\r  ${i + 1}/${chosen.length} — ${killed} killed, ${survivors.length} survived   `);
}

const score = Math.round((killed / chosen.length) * 100);
console.log(`\n\n  score ${score}%  (${killed} killed / ${chosen.length})\n`);
if (survivors.length) {
  console.log('  Survived — the code changed here and the tests stayed green:');
  for (const s of survivors.slice(0, 12)) {
    console.log(`    ${s.file}:${s.line + 1}  [${s.mutator.name}]`);
    console.log(`      ${s.code}`);
  }
  if (survivors.length > 12) console.log(`    … and ${survivors.length - 12} more`);
  console.log('\n  Each one is a behaviour with a test in front of it that does not check it.');
}

if (WRITE) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  appendHistory(HISTORY, 'date\tscore\tkilled\tsampled\ttotal_sites\n',
    `${today()}\t${score}\t${killed}\t${chosen.length}\t${all.length}\n`);
  console.log(`appended reading → ${path.relative(process.cwd(), HISTORY)}`);
}
