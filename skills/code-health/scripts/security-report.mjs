#!/usr/bin/env node
//
// Dependency-vulnerability trend (SCA). Runs `npm audit --json` and records
// advisory counts by severity to <historyDir>/security-history.tsv. Feeds the
// CodeHealth Security dimension. The authoritative per-PR code-level vulns +
// secrets are /security-audit's job (semgrep + gitleaks + osv-scanner on the
// diff); this is just the time-varying dependency-advisory count.
//
//   node security-report.mjs            # print + append a reading
//   node security-report.mjs --no-write # print only
//
import { execSync } from 'node:child_process';
import { WRITE, hist, today, appendHistory } from './config.mjs';

const HISTORY = hist('security-history.tsv');

let v = { critical: 0, high: 0, moderate: 0, low: 0, total: 0 };
try {
  v = JSON.parse(execSync('npm audit --json', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })).metadata.vulnerabilities;
} catch (e) {
  try { v = JSON.parse(e.stdout).metadata.vulnerabilities; } catch { /* leave zeros */ }
}

console.log(`\nDependency advisories (npm audit): ${v.critical} critical · ${v.high} high · ${v.moderate} moderate · ${v.low} low · ${v.total} total`);

if (WRITE) {
  appendHistory(HISTORY, 'date\tcritical\thigh\tmoderate\tlow\ttotal\n',
    `${today()}\t${v.critical}\t${v.high}\t${v.moderate}\t${v.low}\t${v.total}\n`);
  console.log(`\nappended reading → ${HISTORY}`);
}
