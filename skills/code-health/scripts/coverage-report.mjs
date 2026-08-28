#!/usr/bin/env node
//
// Test-coverage trend. Runs `vitest --coverage` per configured workspace and
// records statement + branch coverage to <historyDir>/coverage-history.tsv.
// /code-quality is the authoritative coverage owner; this records the trend the
// CodeHealth roll-up reads for its Test-safety dimension.
//
//   node coverage-report.mjs            # print + append a reading
//   node coverage-report.mjs --no-write # print only
//
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { COV_WORKSPACES, WRITE, r1, hist, today, appendHistory } from './config.mjs';

const HISTORY = hist('coverage-history.tsv');

function coverageOf(ws) {
  const dir = path.join(ws, '.covtmp');
  try {
    execSync('npx vitest run --coverage --coverage.reporter=json-summary --coverage.reportsDirectory=.covtmp',
      { cwd: ws, stdio: 'ignore' });
    const t = JSON.parse(fs.readFileSync(path.join(dir, 'coverage-summary.json'), 'utf8')).total;
    return { statements: t.statements.pct, branches: t.branches.pct };
  } catch {
    return { statements: 0, branches: 0 };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// **An empty `coverageWorkspaces` means "this repo does not measure coverage",
// not "measure nothing and then read it".** Without this the line below prints a
// header, `cov[COV_WORKSPACES[0]]` is undefined, and the run dies on
// `Cannot read properties of undefined (reading 'statements')` — which the
// caller catches and downgrades to "its dimension will use defaults", so the
// score silently falls back every week and the log line scrolls past.
if (!COV_WORKSPACES.length) {
  console.log('\nTest coverage (unit): no `coverageWorkspaces` configured, skipping.');
  console.log('  Set it in code-health.config.json to include coverage in the roll-up.');
  process.exit(0);
}

const cov = Object.fromEntries(COV_WORKSPACES.map((w) => [w, coverageOf(w)]));
console.log('\nTest coverage (unit), statements · branches:');
for (const w of COV_WORKSPACES) console.log(`  ${w.padEnd(12)} ${r1(cov[w].statements)}% statements · ${r1(cov[w].branches)}% branches`);

if (WRITE) {
  const primary = cov[COV_WORKSPACES[0]];
  appendHistory(HISTORY, 'date\tstatements\tbranches\n', `${today()}\t${r1(primary.statements)}\t${r1(primary.branches)}\n`);
  console.log(`\nappended reading → ${HISTORY}`);
}
