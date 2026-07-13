#!/usr/bin/env node
//
// CodeScene-style hotspot trend. A *hotspot* is code that is BOTH complex and
// frequently changed — the highest-interest technical debt (you pay the
// complexity tax every time you touch it). Score = revisions × cyclomatic over a
// rolling window; the "hotspot count" is the top-right quadrant (churn AND
// complexity both above the median). Appends to <historyDir>/hotspot-history.tsv
// and writes a top-5 markdown table for the dashboard stamp.
//
//   node hotspot-report.mjs            # print + append a reading
//   node hotspot-report.mjs --no-write # print only
//
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { DIRS, WINDOW, WRITE, BLOB, walk, hist, today, appendHistory, requireRepo } from './config.mjs';

const ts = requireRepo('typescript');

const HISTORY = hist('hotspot-history.tsv');

function cyclomatic(sf) {
  let cc = 1;
  const visit = (node) => {
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ConditionalExpression:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CaseClause:
      case ts.SyntaxKind.CatchClause: cc++; break;
      case ts.SyntaxKind.BinaryExpression: {
        const op = node.operatorToken.kind;
        if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken
          || op === ts.SyntaxKind.QuestionQuestionToken) cc++;
        break;
      }
      default: break;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return cc;
}

function complexityOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  return { cc: cyclomatic(sf), loc: text.split('\n').filter((l) => l.trim()).length };
}

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const log = execSync(`git log --since="${WINDOW}" --format= --name-only -- ${DIRS.join(' ')}`,
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const revisions = new Map();
for (const raw of log.split('\n')) {
  const f = raw.trim();
  if (f) revisions.set(f, (revisions.get(f) || 0) + 1);
}

const files = DIRS.flatMap(walk);
const metrics = files.map((f) => {
  const { cc, loc } = complexityOf(f);
  const rev = revisions.get(f) || 0;
  return { file: f, rev, cc, loc, score: rev * cc };
});

const medRev = median(metrics.map((m) => m.rev));
const medCc = median(metrics.map((m) => m.cc));
const hotspots = metrics.filter((m) => m.rev > medRev && m.cc > medCc).sort((a, b) => b.score - a.score);
const top = [...metrics].sort((a, b) => b.score - a.score).slice(0, 10);

console.log(`\nHotspots — churn × complexity over the last 365 days (${files.length} files, medians: rev ${medRev} · cc ${medCc})`);
console.log(`  ${hotspots.length} hotspot${hotspots.length === 1 ? '' : 's'} (changed often AND complex — refactor / add tests here first)`);
console.log('  highest score = revisions × cyclomatic:');
for (const m of top) {
  console.log(`    ${String(m.score).padStart(5)}  rev=${String(m.rev).padStart(2)} cc=${String(m.cc).padStart(3)} loc=${String(m.loc).padStart(4)}  ${m.file}`);
}

function hotspotTable() {
  const rows = ['| Score | Revisions | Cyclomatic | File |', '|--:|--:|--:|---|'];
  for (const m of top.slice(0, 5)) rows.push(`| ${m.score} | ${m.rev} | ${m.cc} | [\`${m.file}\`](${BLOB}/${m.file}) |`);
  return rows.join('\n');
}

if (WRITE) {
  const t = top[0] || { file: '-', score: 0 };
  appendHistory(HISTORY, 'date\tfiles\thotspots\ttop_file\ttop_score\n',
    `${today()}\t${files.length}\t${hotspots.length}\t${t.file}\t${t.score}\n`);
  fs.writeFileSync(hist('hotspot-table.md'), hotspotTable() + '\n');
  console.log(`\nappended reading → ${HISTORY}`);
}
