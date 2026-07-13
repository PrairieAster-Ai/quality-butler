#!/usr/bin/env node
//
// Rolled-up CodeHealth score (0–100 + letter grade) — one headline number that
// blends the dashboard's dimensions. Inspired by CodeScene's CodeHealth, fully
// transparent: each dimension is normalized 0–100 against documented anchors,
// then weighted. Git-history dimensions are read from the other trend TSVs (run
// this AFTER mi/hotspot/complexity/coupling/change-coupling/duplication/security
// :report — run-all.mjs does that); cheap static dimensions are computed inline.
// Appends to <historyDir>/codehealth-history.tsv and writes the dashboard stamp.
//
//   node codehealth-report.mjs            # print + append a reading + write stamp
//   node codehealth-report.mjs --no-write # print only
//
import fs from 'node:fs';
import path from 'node:path';
import {
  DIRS, WRITE, SKILL_DIR, HISTORY_DIR,
  norm, r1, bar, walk, lastRow, tryExec, hist, today,
} from './config.mjs';

const HISTORY = hist('codehealth-history.tsv');
const STAMP_FILE = hist('codehealth-stamp.json');

// ── Static dimensions (computed inline, always fresh) ──
const docRun = tryExec(`node "${path.join(SKILL_DIR, 'check-doc-coverage.mjs')}"`);
const docMatch = docRun.out.match(/(\d+)\s*\/\s*(\d+)/);
const docPct = docMatch ? (Number(docMatch[1]) / Number(docMatch[2])) * 100 : 100;

const circRun = tryExec(`node "${path.join(SKILL_DIR, 'check-circular-deps.mjs')}"`);
const cycMatch = circRun.out.match(/(\d+)\s+circular import/);
const cycles = circRun.ok ? 0 : (cycMatch ? Number(cycMatch[1]) : 1);

const anyRun = tryExec(`grep -rEn ":\\s*any\\b" ${DIRS.join(' ')} --include=*.ts --include=*.tsx`);
const anyCount = anyRun.out.split('\n').filter((l) => {
  if (!l || /\.(test|spec)\./.test(l)) return false;
  const code = l.replace(/^[^:]+:\d+:/, '').trim();
  return code && !/^(\/\/|\*|\/\*|\{\/\*)/.test(code);
}).length;

const files = DIRS.flatMap(walk);
let totalLoc = 0;
const over500 = files.filter((f) => { const n = fs.readFileSync(f, 'utf8').split('\n').length; totalLoc += n; return n > 500; }).length;
const locK = `${(totalLoc / 1000).toFixed(1)}k`;

// ── Trend dimensions (latest rows from the other reports' TSVs) ──
const mi = lastRow(hist('maintainability-history.tsv'));
const cc = lastRow(hist('change-coupling-history.tsv'));
const sec = lastRow(hist('security-history.tsv'));
const coup = lastRow(hist('coupling-history.tsv'));
const hs = lastRow(hist('hotspot-history.tsv'));
const cx = lastRow(hist('complexity-history.tsv'));
const dup = lastRow(hist('duplication-history.tsv'));
const greenFiles = mi ? Number(mi.green) : 0;
const yellowFiles = mi ? Number(mi.yellow) : 0;
const miFiles = mi ? Number(mi.files) : files.length;
const redFiles = Math.max(0, miFiles - greenFiles - yellowFiles);
const minMi = mi ? Number(mi.min_mi) : 20;
const crossLayer = cc ? Number(cc.cross_layer) : 0;

const sevCritical = sec ? Number(sec.critical) : 0;
const sevHigh = sec ? Number(sec.high) : 0;
const sevModerate = sec ? Number(sec.moderate) : 0;
const sevLow = sec ? Number(sec.low) : 0;
const securityScore = Math.max(0, 100 - 25 * sevCritical - 10 * sevHigh - 1 * sevModerate - 0.25 * sevLow);

// MI **health proportion**: share of files in good MI shape (yellow half, red none).
const healthPct = miFiles ? ((greenFiles + 0.5 * yellowFiles) / miFiles) * 100 : 100;

const dims = [
  { key: 'Documentation', weight: 0.20, raw: `${r1(docPct)}% TSDoc`, score: norm(docPct, 100, 50) },
  { key: 'Maintainability', weight: 0.25, raw: `${r1(healthPct)}% MI-healthy (${greenFiles}🟢/${yellowFiles}🟡)`, score: norm(healthPct, 100, 70) },
  { key: 'Structure', weight: 0.20, raw: `${cycles} cycles · ${crossLayer} cross-layer`, score: Math.max(0, 100 - 25 * cycles - 5 * crossLayer) },
  { key: 'Resilience (worst file)', weight: 0.10, raw: `min MI ${r1(minMi)}`, score: norm(minMi, 25, 5) },
  { key: 'Type & size safety', weight: 0.15, raw: `${anyCount} any · ${over500} files >500`, score: (norm(anyCount, 0, 30) + norm((over500 / files.length) * 100, 0, 10)) / 2 },
  { key: 'Security (deps)', weight: 0.10, raw: `${sevCritical}C/${sevHigh}H/${sevModerate}M advisories`, score: securityScore },
];

const score = dims.reduce((s, d) => s + d.weight * d.score, 0);
const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

const DISPLAY = {
  'Documentation': 'Documentation', 'Maintainability': 'Maintainability', 'Structure': 'Structure',
  'Resilience (worst file)': 'Resilience (worst)', 'Type & size safety': 'Type & size', 'Security (deps)': 'Security (deps)',
};
function chartNote(key) {
  switch (key) {
    case 'Maintainability': return yellowFiles === 0 ? `all ${miFiles} files MI-green` : `${greenFiles}🟢 / ${yellowFiles}🟡`;
    case 'Resilience (worst file)': return `worst file MI ${r1(minMi)}`;
    case 'Structure': return crossLayer ? `${crossLayer} cross-layer pair${crossLayer === 1 ? '' : 's'}` : '';
    case 'Security (deps)': {
      const adv = [];
      if (sevCritical) adv.push(`${sevCritical} critical`);
      if (sevHigh) adv.push(`${sevHigh} high`);
      if (sevModerate) adv.push(`${sevModerate} moderate`);
      if (sevLow) adv.push(`${sevLow} low`);
      const n = sevCritical + sevHigh + sevModerate + sevLow;
      return adv.length ? `${adv.join(' · ')} advisor${n === 1 ? 'y' : 'ies'}` : 'no advisories';
    }
    default: return '';
  }
}
function chartMarkdown() {
  const rows = ['```text', `${' '.repeat(28)}weight  score (0–100)`];
  for (const d of dims) {
    const note = chartNote(d.key);
    rows.push(DISPLAY[d.key].padEnd(21) + `${Math.round(d.weight * 100)}%`.padStart(4) + '   '
      + bar(d.score) + '  ' + String(r1(d.score)).padStart(4) + (note ? `   ${note}` : ''));
  }
  rows.push(' '.repeat(28) + '─'.repeat(20));
  rows.push('CodeHealth'.padEnd(21) + ' '.repeat(4) + '   ' + bar(score) + '  ' + String(r1(score)).padStart(4) + `   grade ${grade}`);
  rows.push('```');
  return rows.join('\n');
}
function pieMarkdown() {
  const rows = [
    '```mermaid',
    '%%{init: {"theme": "base", "themeVariables": {"pie1": "#2e7d32", "pie2": "#f9a825", "pie3": "#c62828"}}}%%',
    `pie showData title Maintainability Index bands (${miFiles} files)`,
    `  "Green (>=20)" : ${greenFiles}`,
    `  "Yellow (10-19)" : ${yellowFiles}`,
  ];
  if (redFiles > 0) rows.push(`  "Red (<10)" : ${redFiles}`);
  rows.push('```');
  return rows.join('\n');
}

console.log(`\n┌─ CodeHealth: ${r1(score)} / 100  (grade ${grade}) ─ a weighted blend of the dashboard's dimensions`);
for (const d of dims) {
  console.log(`│  ${d.key.padEnd(24)} ${String(r1(d.score)).padStart(5)}  × ${d.weight.toFixed(2)}   (${d.raw})`);
}
console.log(`└─ gates (pass/fail, enforced in CI): lint · types · tests`);

if (WRITE) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  if (!fs.existsSync(HISTORY)) {
    fs.writeFileSync(HISTORY, `date\tscore\tgrade\t${dims.map((d) => d.key.toLowerCase().replace(/[^a-z]+/g, '_')).join('\t')}\n`);
  }
  fs.appendFileSync(HISTORY, `${today()}\t${r1(score)}\t${grade}\t${dims.map((d) => r1(d.score)).join('\t')}\n`);
  const stampObj = {
    badge: `${grade} · ${r1(score)} / 100`,
    chart: chartMarkdown(), pie: pieMarkdown(),
    files: miFiles, loc: locK, green: greenFiles, yellow: yellowFiles, red: redFiles,
  };
  if (mi) stampObj.mi_mean = Math.round(Number(mi.mean_mi));
  if (hs) { stampObj.hotspots = Number(hs.hotspots); stampObj.top_hotspot = String(hs.top_file).split('/').pop(); }
  if (fs.existsSync(hist('hotspot-table.md'))) stampObj.hotspot_table = fs.readFileSync(hist('hotspot-table.md'), 'utf8').trimEnd();
  if (coup) stampObj.fanout = Number(coup.max_fanout);
  if (cc) { stampObj.pairs = Number(cc.coupled_pairs); stampObj.cross_layer = Number(cc.cross_layer); }
  if (cx) { stampObj.cc_mean = cx.mean_cc; stampObj.cc_max = cx.max_cc; stampObj.fn_count = cx.functions; stampObj.fn_over15 = cx.over15; }
  if (dup) stampObj.dup = dup.pct;
  fs.writeFileSync(STAMP_FILE, JSON.stringify(stampObj, null, 2) + '\n');
  console.log(`\nappended reading → ${HISTORY}\nwrote stamp facts → ${STAMP_FILE}`);
}
