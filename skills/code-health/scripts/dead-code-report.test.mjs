#!/usr/bin/env node
//
// The detector's own test.
//
// **A detector written by the thing it polices needs one.** This file exists
// because `parseReport` shipped two bugs in a row, on the same afternoon, and
// both of them presented as the detector working:
//
//   1. Parsing knip's whole stdout threw, and the script reported "could not
//      run" against a knip that had run perfectly. An honest error message
//      about the wrong thing.
//   2. Parsing from the first `{` landed inside knip's own dotenv tip —
//      `// tip: ⌘ custom filepath { path: '…/.env' }` — and threw again, this
//      time with a JSON position that pointed nowhere.
//
// Neither was found by reading it. Both were found by running it against a real
// repository, which is the thing a test is supposed to make unnecessary.
//
//   node --test dead-code-report.test.mjs
//
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReport } from './dead-code-report.mjs';

/** knip's real preamble, wording and braces intact. */
const NOTICE = "◇ injected env (18) from .env // tip: ⌘ custom filepath { path: '/custom/path/.env' }\n"
  + '◇ injected env (0) from ../../.env // tip: ⌘ multiple files { path: [\'.env.local\', \'.env\'] }\n';

const REPORT = { files: ['a.ts'], issues: [{ file: 'b.ts', exports: [{ name: 'x', line: 3 }] }] };

test('reads a report that arrives on its own', () => {
  assert.deepEqual(parseReport(JSON.stringify(REPORT)), REPORT);
});

test('reads a report behind knip\'s dotenv notice', () => {
  // The whole reason this function exists.
  assert.deepEqual(parseReport(NOTICE + JSON.stringify(REPORT)), REPORT);
});

test('is not fooled by the brace inside the notice', () => {
  // `{ path: '…' }` is not JSON, and it comes first. Taking the first brace
  // was bug two.
  const parsed = parseReport(NOTICE + JSON.stringify(REPORT));
  assert.ok(Array.isArray(parsed.files), 'parsed the tip instead of the report');
});

test('reads a pretty-printed report', () => {
  assert.deepEqual(parseReport(NOTICE + JSON.stringify(REPORT, null, 2)), REPORT);
});

test('refuses output with no report in it, rather than returning nothing found', () => {
  // **The failure this whole skill is about.** A detector that cannot read its
  // tool and reports zero findings is indistinguishable from a clean repo.
  assert.throws(() => parseReport('knip: command not found\n'), /no JSON object/);
  assert.throws(() => parseReport(NOTICE), /no JSON object/);
});

test('refuses a bare array, which is not a report', () => {
  assert.throws(() => parseReport('[1,2,3]'), /no JSON object/);
});

test('gives up rather than grinding through a large hostile input', () => {
  // Every `{` is a parse attempt, so an input made of them should stop early
  // rather than take quadratic time on a CI runner.
  const started = Date.now();
  assert.throws(() => parseReport('{'.repeat(50_000)), /no JSON object/);
  assert.ok(Date.now() - started < 5_000, 'took too long to give up');
});
