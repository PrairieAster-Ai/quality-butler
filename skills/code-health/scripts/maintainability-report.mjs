#!/usr/bin/env node
//
// Maintainability Index (MI) report + trend. Computes a per-file MI from the
// TypeScript compiler API (Halstead Volume from the token stream, cyclomatic
// complexity from the AST, SLOC = code-bearing lines), aggregates, prints a
// report, and appends a dated reading to <historyDir>/maintainability-history.tsv.
//
//   MI = MAX(0, (171 - 5.2*ln(HalsteadVolume) - 0.23*CyclomaticComplexity
//                    - 16.2*ln(SLOC)) * 100/171)
//   Bands (Visual Studio): >= 20 green, 10-19 yellow, < 10 red.
//
//   node maintainability-report.mjs            # print + append a reading
//   node maintainability-report.mjs --no-write # print only
//
import fs from 'node:fs';
import { DIRS, WRITE, r1, walk, hist, today, appendHistory, requireRepo } from './config.mjs';

const ts = requireRepo('typescript');

const HISTORY = hist('maintainability-history.tsv');

const isOperand = (k) =>
  k === ts.SyntaxKind.Identifier
  || (k >= ts.SyntaxKind.FirstLiteralToken && k <= ts.SyntaxKind.LastLiteralToken)
  || (k >= ts.SyntaxKind.FirstTemplateToken && k <= ts.SyntaxKind.LastTemplateToken)
  || k === ts.SyntaxKind.TrueKeyword || k === ts.SyntaxKind.FalseKeyword || k === ts.SyntaxKind.NullKeyword;

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

function fileMetrics(file) {
  const text = fs.readFileSync(file, 'utf8');
  const tsx = file.endsWith('.tsx');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, tsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true,
    tsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, text);
  const operators = new Set();
  const operands = new Set();
  let N1 = 0, N2 = 0;
  const codeLines = new Set();
  let k;
  while ((k = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    const start = scanner.getTokenStart ? scanner.getTokenStart() : scanner.getTokenPos();
    codeLines.add(sf.getLineAndCharacterOfPosition(start).line);
    if (isOperand(k)) { operands.add(scanner.getTokenText()); N2++; } else { operators.add(k); N1++; }
  }
  const n = operators.size + operands.size;
  const N = N1 + N2;
  const volume = N > 0 && n > 0 ? N * Math.log2(n) : 1;
  const cc = cyclomatic(sf);
  const sloc = codeLines.size || 1;
  const raw = 171 - 5.2 * Math.log(volume) - 0.23 * cc - 16.2 * Math.log(sloc);
  return { file, mi: Math.max(0, Math.min(100, (raw * 100) / 171)), cc, sloc };
}

const files = DIRS.flatMap(walk);
const metrics = files.map(fileMetrics);
const mis = metrics.map((m) => m.mi);
const mean = mis.reduce((a, b) => a + b, 0) / mis.length;
const sorted = [...mis].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
const green = mis.filter((x) => x >= 20).length;
const yellow = mis.filter((x) => x >= 10 && x < 20).length;
const red = mis.filter((x) => x < 10).length;
const worst = [...metrics].sort((a, b) => a.mi - b.mi).slice(0, 8);

console.log(`\nMaintainability Index — ${files.length} files (${DIRS.join(', ')})`);
console.log(`  mean ${r1(mean)} · median ${r1(median)} · min ${r1(sorted[0])}`);
console.log(`  bands: 🟢 green (>=20) ${green} · 🟡 yellow (10-19) ${yellow} · 🔴 red (<10) ${red}`);
console.log('  lowest MI (size/complexity hotspots):');
for (const m of worst) console.log(`    ${r1(m.mi).toString().padStart(5)}  cc=${m.cc} sloc=${m.sloc}  ${m.file}`);

if (WRITE) {
  appendHistory(HISTORY, 'date\tfiles\tmean_mi\tmedian_mi\tmin_mi\tgreen\tyellow\tred\n',
    `${today()}\t${files.length}\t${r1(mean)}\t${r1(median)}\t${r1(sorted[0])}\t${green}\t${yellow}\t${red}\n`);
  console.log(`\nappended reading → ${HISTORY}`);
}
