#!/usr/bin/env node
//
// Copy-paste duplication trend. Runs `jscpd` over the source dirs and records the
// duplicated-line percentage, clone count, and duplicated-line total to
// <historyDir>/duplication-history.tsv.
//
//   node duplication-report.mjs            # print + append a reading
//   node duplication-report.mjs --no-write # print only
//
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { DIRS, WRITE, r2, cfg, hist, today, appendHistory, HISTORY_DIR } from './config.mjs';

const HISTORY = hist('duplication-history.tsv');
const TMP = path.join(HISTORY_DIR, '.jscpd-tmp');

let pct = 0, clones = 0, dupLines = 0;
try {
  execSync(`npx jscpd ${DIRS.join(' ')} --min-lines ${cfg.thresholds.dupMinLines} --ignore "**/__tests__/**,**/*.test.*" --reporters json --output ${TMP} --silent`,
    { stdio: 'ignore' });
  const t = JSON.parse(fs.readFileSync(path.join(TMP, 'jscpd-report.json'), 'utf8')).statistics.total;
  pct = r2(t.percentage);
  clones = t.clones;
  dupLines = t.duplicatedLines;
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(`\nCopy-paste duplication (jscpd): ${pct}% duplicated · ${clones} clones · ${dupLines} lines`);

if (WRITE) {
  appendHistory(HISTORY, 'date\tpct\tclones\tdup_lines\n', `${today()}\t${pct}\t${clones}\t${dupLines}\n`);
  console.log(`\nappended reading → ${HISTORY}`);
}
