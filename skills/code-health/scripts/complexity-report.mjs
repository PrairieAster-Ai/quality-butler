#!/usr/bin/env node
//
// Cyclomatic-complexity trend (per function), computed from the TypeScript AST so
// it works in any repo without depending on a particular ESLint config. Walks
// every function-like node, computes its cyclomatic complexity (decision points +
// 1), and summarizes the population to <historyDir>/complexity-history.tsv.
// Trivial branch-free functions (cc 1) are excluded so the mean reflects code that
// actually has logic. Pairs with the `sonarjs/cognitive-complexity` CI gate (which
// tracks readability) — this trend watches the cyclomatic/testability direction.
//
//   node complexity-report.mjs            # print + append a reading
//   node complexity-report.mjs --no-write # print only
//
import fs from 'node:fs';
import { DIRS, WRITE, r1, walk, hist, today, appendHistory, requireRepo } from './config.mjs';

const ts = requireRepo('typescript');
const HISTORY = hist('complexity-history.tsv');

const isFn = (n) => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)
  || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)
  || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n);

// Cyclomatic complexity of a single function body (decision points + 1), not
// descending into nested functions (each is counted on its own).
function fnComplexity(fn) {
  let cc = 1;
  const visit = (node) => {
    if (node !== fn && isFn(node)) return; // nested fn counted separately
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
  ts.forEachChild(fn, visit);
  return cc;
}

const ccs = [];
for (const file of DIRS.flatMap(walk)) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const collect = (node) => {
    if (isFn(node)) { const cc = fnComplexity(node); if (cc > 1) ccs.push(cc); }
    ts.forEachChild(node, collect);
  };
  collect(sf);
}

const functions = ccs.length;
const mean = functions ? r1(ccs.reduce((a, b) => a + b, 0) / functions) : 0;
const max = functions ? Math.max(...ccs) : 0;
const over15 = ccs.filter((c) => c > 15).length;

console.log(`\nCyclomatic complexity (per function): ${functions} functions · mean cc ${mean} · max ${max} · ${over15} over 15`);

if (WRITE) {
  appendHistory(HISTORY, 'date\tfunctions\tmean_cc\tmax_cc\tover15\n',
    `${today()}\t${functions}\t${mean}\t${max}\t${over15}\n`);
  console.log(`\nappended reading → ${HISTORY}`);
}
