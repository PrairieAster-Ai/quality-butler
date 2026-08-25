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
/**
 * The tail of the MI distribution, scored on a percentile rather than the floor.
 *
 * **A minimum over hundreds of files reports the unluckiest one, not the tail.**
 * It gets worse as a repo grows however healthy the repo is, and refactoring
 * cannot fix it: splitting a dense file yields two files that both land in the
 * same band, so the count below any threshold does not fall. Measured in one
 * repo — 38 files under MI 25 before a split, 38 after.
 *
 * It also mismeasures what it claims to. MI is dominated by line count, so in
 * that same repo a 46-line file at cyclomatic 99 scored *better* than an 87-line
 * file at cyclomatic 57. A single file drawn from the wrong end of that noise
 * was pinning a tenth of the score.
 *
 * So the dimension scores the 5th percentile — still the tail, which is the
 * whole point of Resilience, but not one file's opinion of it. `minMi` is still
 * reported and still names the file to open, because that is the actionable
 * number even when it is not the scored one.
 *
 * Falls back to `minMi` for histories written before p5 was recorded.
 */
const p5Mi = mi && mi.p5_mi !== undefined && mi.p5_mi !== '' ? Number(mi.p5_mi) : minMi;
/**
 * Bumped whenever a dimension's formula changes.
 *
 * **A score is comparable to another only if the formula was the same.** When
 * Structure moved from `100 − 5·pairs` to a share-based penalty, one repo's
 * score jumped 11 points between two consecutive commands with no code change
 * in between. Recorded here so the trend can say that, instead of drawing it as
 * a very good week.
 */
const METHOD_VERSION = '4';
const crossLayer = cc ? Number(cc.cross_layer) : 0;
/** Total coupled pairs, the denominator that makes cross-layer scale-free. */
const coupledPairs = cc ? Number(cc.coupled_pairs) : 0;

const sevCritical = sec ? Number(sec.critical) : 0;
const sevHigh = sec ? Number(sec.high) : 0;
const sevModerate = sec ? Number(sec.moderate) : 0;
const sevLow = sec ? Number(sec.low) : 0;
const securityScore = Math.max(0, 100 - 25 * sevCritical - 10 * sevHigh - 1 * sevModerate - 0.25 * sevLow);

// MI **health proportion**: share of files in good MI shape (yellow half, red none).
const healthPct = miFiles ? ((greenFiles + 0.5 * yellowFiles) / miFiles) * 100 : 100;

/**
 * Structure: circular imports, and how much of your change-coupling crosses a layer.
 *
 * **Was `100 − 5·crossLayerPairs`, which had two defects.** It was absolute, so
 * 16 pairs cost a 268-file monorepo exactly what it costs a 30-file service
 * although larger repos accumulate pairs mechanically. And it hit zero at 20
 * pairs, after which more coupling was free and any improvement invisible until
 * you crossed back under — a measure that has stopped discriminating.
 *
 * It is now the **share** of coupled pairs that cross a layer, which is
 * scale-free and matches the stated intent: cross-layer coupling is the smell,
 * within-feature coupling is usually fine. The penalty is simply that
 * percentage, so it reads without a lookup — "a third of your co-change crosses
 * a layer" costs 33.
 *
 * **Cycles stay absolute and stay harsh.** Zero is achievable in any codebase
 * and is the gate; there is no denominator that makes a circular import
 * proportionate.
 *
 * Below `MIN_PAIRS_FOR_SHARE` the share is too noisy to use — two coupled pairs
 * that both cross a layer is 100%, and means almost nothing — so the old
 * absolute rule still applies to repos with little co-change history.
 */
const MIN_PAIRS_FOR_SHARE = 10;
const crossShare = coupledPairs >= MIN_PAIRS_FOR_SHARE
  ? (crossLayer / coupledPairs) * 100
  : crossLayer * 5;
const structureScore = Math.max(0, 100 - 25 * cycles - crossShare);

const dims = [
  { key: 'Documentation', weight: 0.20, raw: `${r1(docPct)}% TSDoc`, score: norm(docPct, 100, 50) },
  { key: 'Maintainability', weight: 0.25, raw: `${r1(healthPct)}% MI-healthy (${greenFiles}🟢/${yellowFiles}🟡)`, score: norm(healthPct, 100, 70) },
  { key: 'Structure', weight: 0.20, raw: `${cycles} cycles · ${crossLayer}/${coupledPairs || 0} cross-layer`, score: structureScore },
  { key: 'Resilience (worst files)', weight: 0.10, raw: `MI p5 ${r1(p5Mi)} · worst ${r1(minMi)}`, score: norm(p5Mi, 25, 5) },
  { key: 'Type & size safety', weight: 0.15, raw: `${anyCount} any · ${over500} files >500`, score: (norm(anyCount, 0, 30) + norm((over500 / files.length) * 100, 0, 10)) / 2 },
  { key: 'Security (deps)', weight: 0.10, raw: `${sevCritical}C/${sevHigh}H/${sevModerate}M advisories`, score: securityScore },
];

const score = dims.reduce((s, d) => s + d.weight * d.score, 0);
/** The letter for any score. One definition, so the headline and the trend agree. */
const gradeOf = (n) => (n >= 90 ? 'A' : n >= 80 ? 'B' : n >= 70 ? 'C' : n >= 60 ? 'D' : 'F');
const grade = gradeOf(score);

// ── Interpretation layer (business meaning + relative context) ────────────────
// Promotes the dashboard's "metrics by business outcome / why it's worth money"
// framing out of hand-authored wiki prose and into GENERATED facts, so every
// install ships plain-language verdicts, direction-of-travel, and citable
// benchmarks next to each number — not bare numbers a non-technical reader can't
// judge. Who this serves (the PM author + the non-technical VP audience) and the
// encoding principles behind it live in references/methodology.md and the
// Audience-Personas wiki page.
const sanitize = (k) => k.toLowerCase().replace(/[^a-z]+/g, '_'); // matches the history-TSV column names
const prevReading = lastRow(HISTORY); // previous run's row (read before this run's append) → direction-of-travel

// Q1 "is it good or bad?" — the same 80/60 spirit as the A–F grade, per dimension.
function verdict(s) {
  if (s >= 80) return { icon: '✅', word: 'Healthy' };
  if (s >= 60) return { icon: '⚠️', word: 'Watch' };
  return { icon: '❌', word: 'Act now' };
}
// Q2 "which way is it moving?" — Δ vs the previous reading's per-dimension score.
function deltaFor(key, s) {
  if (!prevReading) return { arrow: '', text: 'new' };
  const prev = Number(prevReading[sanitize(key)]);
  if (!Number.isFinite(prev)) return { arrow: '', text: '' };
  const d = r1(s - prev);
  if (d > 0.1) return { arrow: '▲', text: `+${d}` };
  if (d < -0.1) return { arrow: '▼', text: `${d}` };
  return { arrow: '▬', text: '±0' };
}

// Per-dimension business framing: which outcome it drives (Q3 "do I care?"), a
// plain-language "so what", a citable benchmark (defensibility), and the ROI
// action + payoff (Q4 "do I act?"). outcome ∈ risk | throughput | keyperson.
const nAdv = sevCritical + sevHigh + sevModerate + sevLow;
const META = {
  'Documentation': {
    outcome: 'keyperson', plain: 'Documentation',
    soWhat: 'New teammates find how things work without interrupting the author — smaller bus factor.',
    benchmark: 'target: 100% TSDoc on the public API',
    action: `document the undocumented public APIs (now ${r1(docPct)}%)`,
    payoff: 'faster onboarding, less key-person dependency',
  },
  'Maintainability': {
    outcome: 'throughput', plain: 'Ease of change',
    soWhat: `${r1(healthPct)}% of the code is in easy-to-change shape, so routine work stays fast and cheap.`,
    benchmark: "Microsoft Maintainability Index: ≥20 = maintainable",
    action: `refactor the ${yellowFiles + redFiles} file(s) below the MI threshold`,
    payoff: 'less time lost fighting brittle code',
  },
  'Structure': {
    outcome: 'risk', plain: 'Clean structure',
    soWhat: (cycles || crossLayer)
      ? `${cycles} circular import(s) and ${crossLayer} cross-layer coupling(s) make changes ripple unpredictably.`
      : 'Modules are cleanly separated, so a change in one place rarely breaks another.',
    benchmark: 'healthy target: 0 circular imports (Stable-Dependencies Principle)',
    action: cycles ? `break the ${cycles} circular import(s)` : `decouple the ${crossLayer} cross-layer pair(s)`,
    payoff: 'changes stay local and predictable',
  },
  'Resilience (worst files)': {
    outcome: 'risk', plain: 'Worst-file safety',
    soWhat: `The hardest-to-change 5% of files sit at MI ${r1(p5Mi)} or below, and the very worst `
      + `scores ${r1(minMi)} — ${minMi >= 20 ? 'still workable' : 'a landmine when it must change under deadline'}.`,
    benchmark: "MI ≥20 is Microsoft's 'maintainable' threshold",
    action: `split or add tests to the worst file (MI ${r1(minMi)})`,
    payoff: 'the riskiest edit gets safer',
  },
  'Type & size safety': {
    outcome: 'throughput', plain: 'Type & size safety',
    soWhat: `${anyCount} untyped value(s) and ${over500} oversized file(s) — each is a place bugs hide and changes slow down.`,
    benchmark: 'rule of thumb: files < 500 LOC, minimal `any`',
    action: `type the ${anyCount} \`any\`(s) and split the ${over500} file(s) > 500 LOC`,
    payoff: 'fewer runtime surprises, easier reviews',
  },
  'Security (deps)': {
    outcome: 'risk', plain: 'Dependency security',
    soWhat: nAdv === 0
      ? 'No known-vulnerable dependencies shipping.'
      : `${nAdv} dependency advisor${nAdv === 1 ? 'y' : 'ies'} (${sevCritical}C/${sevHigh}H) — known vulnerabilities in your supply chain.`,
    benchmark: 'target: 0 critical/high advisories',
    action: `patch the ${nAdv} dependency advisor${nAdv === 1 ? 'y' : 'ies'}`,
    payoff: 'closes known attack surface',
  },
};

// The three business outcomes David (the non-technical audience) actually cares
// about — every dimension rolls up under exactly one.
const OUTCOMES = [
  { key: 'risk', title: '🛡️ Lower risk from change', blurb: 'How safely the code can change without breaking things.' },
  { key: 'throughput', title: '🚀 Higher throughput', blurb: 'How fast the team can ship changes.' },
  { key: 'keyperson', title: '🧑‍💻 Lower key-person risk', blurb: "How little the team depends on one person's memory." },
];

function dimBullet(d) {
  const v = verdict(d.score);
  const dl = deltaFor(d.key, d.score);
  const m = META[d.key];
  const trend = dl.arrow ? ` ${dl.arrow}${dl.text}` : dl.text === 'new' ? ' (new)' : '';
  return `- ${v.icon} **${m.plain}** — ${v.word}${trend}. ${m.soWhat} <sub>${d.raw} · _${m.benchmark}_</sub>`;
}

// ch:outcomes — the generated "Metrics by business outcome" section.
function buildOutcomes() {
  const rows = [];
  for (const o of OUTCOMES) {
    const ds = dims.filter((d) => META[d.key].outcome === o.key);
    if (!ds.length) continue;
    rows.push(`### ${o.title}`, `_${o.blurb}_`, '');
    for (const d of ds) rows.push(dimBullet(d));
    rows.push('');
  }
  return rows.join('\n').trimEnd();
}

const VERDICT_SENTENCE = {
  A: 'The codebase is in strong, well-governed shape.',
  B: 'The codebase is healthy, with a few areas worth watching.',
  C: 'The codebase is serviceable but carries real maintenance drag.',
  D: 'The codebase is fragile — change is risky and slow.',
  F: 'The codebase is in critical shape — a live risk to delivery.',
};
function trendWord(scoreDelta) {
  if (scoreDelta === null) return 'first reading';
  if (scoreDelta > 0.5) return 'improving';
  if (scoreDelta < -0.5) return 'slipping';
  return 'holding steady';
}

// ch:exec — the screenshot-survivable executive summary (a VP can repeat the
// headline verbatim). Leads with the verdict; the number is supporting evidence.
function buildExec() {
  const scoreDelta = prevReading && Number.isFinite(Number(prevReading.score))
    ? r1(score - Number(prevReading.score)) : null;
  const deltaClause = scoreDelta === null ? 'no prior reading yet'
    : scoreDelta === 0 ? 'unchanged since last reading'
      : `${scoreDelta > 0 ? '+' : ''}${scoreDelta} vs last reading`;
  const sorted = [...dims].sort((a, b) => a.score - b.score);
  const weakest = sorted[0], strongest = sorted[sorted.length - 1];
  const wv = verdict(weakest.score);
  return [
    `**🩺 CodeHealth: ${grade} · ${r1(score)}/100 — ${trendWord(scoreDelta)}.** ${VERDICT_SENTENCE[grade]}`,
    '',
    `- 🚦 **Overall:** grade ${grade} (${r1(score)}/100), ${deltaClause}.`,
    `- ${wv.icon} **Watch:** ${META[weakest.key].plain} (${r1(weakest.score)}/100). ${META[weakest.key].soWhat}`,
    `- ✅ **Strength:** ${META[strongest.key].plain} (${r1(strongest.score)}/100).`,
  ].join('\n');
}

// ch:roi — where the next hour pays back most (the two weakest dimensions).
function buildRoi() {
  const lowest = [...dims].sort((a, b) => a.score - b.score).slice(0, 2);
  const rows = ['**Where the next effort pays back most** (weakest dimensions first):', ''];
  lowest.forEach((d, i) => {
    const m = META[d.key]; const v = verdict(d.score);
    rows.push(`${i + 1}. ${v.icon} **${m.plain}** (${r1(d.score)}/100) → ${m.action}. _Payoff: ${m.payoff}._`);
  });
  rows.push('', '<sub>Effort estimates are directional, not commitments.</sub>');
  return rows.join('\n');
}

const DISPLAY = {
  'Documentation': 'Documentation', 'Maintainability': 'Maintainability', 'Structure': 'Structure',
  'Resilience (worst files)': 'Resilience (worst)', 'Type & size safety': 'Type & size', 'Security (deps)': 'Security (deps)',
};
function chartNote(key) {
  switch (key) {
    case 'Maintainability': return yellowFiles === 0 ? `all ${miFiles} files MI-green` : `${greenFiles}🟢 / ${yellowFiles}🟡`;
    case 'Resilience (worst files)': return `MI p5 ${r1(p5Mi)}, worst file ${r1(minMi)}`;
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
// Score-over-time trend for the dashboard.
//
// **Written to be read by somebody who does not know what an MI is.** The chart
// is usually the only part of this page a stakeholder looks at, and the first
// version of it misled in five separate ways: it plotted two readings taken on
// the same day as two points (a flat step that means nothing), labelled the axis
// `06-25` with no year, titled itself "last 12 readings" in internal jargon,
// reported a delta measured across a sliding window so the same history produced
// a different number every week, and gave a bare score with no way to know that
// 73.7 is a C or where the bands sit.
//
// So: one point per day, dates a person can read, both grades named, and the
// bands stated underneath. Unicode-sparkline fallback if the chart cannot be
// built. Reads the freshly appended history, so run it inside the WRITE block.
function buildTrend(n = 12) {
  const SPARK = '▁▂▃▄▅▆▇█';
  let series = [];
  try {
    if (fs.existsSync(HISTORY)) {
      const lines = fs.readFileSync(HISTORY, 'utf8').trim().split('\n');
      const header = lines[0].split('\t');
      const di = header.indexOf('date');
      const si = header.indexOf('score');
      // Collapse same-day readings to the last one taken. Two runs on one day is
      // ordinary — a scheduled sweep plus a manual check — and plotting both draws
      // a flat segment that reads as "a week where nothing improved".
      const ci = header.indexOf('scope');
      const mi = header.indexOf('method');
      const byDate = new Map();
      for (const v of lines.slice(1).map((l) => l.split('\t'))) {
        const date = v[di]; const score = Number(v[si]);
        if (date && Number.isFinite(score)) {
          byDate.set(date, { date, score, scope: ci >= 0 ? v[ci] : '', method: mi >= 0 ? v[mi] : '' });
        }
      }
      series = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-n);
    }
  } catch { /* fall through to insufficient-history */ }

  if (series.length < 2) return 'insufficient history — need ≥2 readings to plot a trend';

  const scores = series.map((p) => p.score);
  const first = scores[0], last = scores[scores.length - 1];
  const delta = r1(last - first);
  const sign = delta > 0 ? '+' : '';

  try {
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    // "25 Jun" rather than "06-25": unambiguous, and readable by somebody who does
    // not already know which end the month is on.
    const human = (d) => {
      const [, m, day] = String(d).split('-');
      return `${Number(day)} ${MON[Number(m) - 1] ?? m}`;
    };
    const year = String(series[series.length - 1].date).slice(0, 4);
    const labels = series.map((p) => `"${human(p.date)}"`).join(', ');
    const values = scores.map((s) => r1(s)).join(', ');
    const span = `${human(series[0].date)} to ${human(series[series.length - 1].date)} ${year}`;
    // Both ends named with their grade. A reader should not have to hold the band
    // table in their head to know whether the line ending at 73.7 is good news.
    const arc = `${gradeOf(first)} ${r1(first)} to ${gradeOf(last)} ${r1(last)}`;
    return [
      '```mermaid',
      'xychart-beta',
      `    title "Code health, ${span} (${arc})"`,
      `    x-axis [${labels}]`,
      '    y-axis "Score, higher is better" 0 --> 100',
      `    line [${values}]`,
      '```',
      '',
      `_${series.length} readings, one point per day. Change over the period shown: `
        + `**${sign}${delta}**. Grade bands: A 90+ · B 80-89 · C 70-79 · D 60-69 · F under 60._`,
      ...scopeNote(series),
    ].join('\n');
  } catch {
    // Fallback: Unicode sparkline scaled across the observed score range.
    const min = Math.min(...scores), max = Math.max(...scores), span = max - min || 1;
    const spark = scores.map((s) => SPARK[Math.min(SPARK.length - 1, Math.floor(((s - min) / span) * (SPARK.length - 1)))]).join('');
    return `${spark}  ${r1(first)}→${r1(last)} (Δ ${sign}${delta})`;
  }
}

/**
 * Say so when the thing being measured changed inside the plotted window.
 *
 * **A score is only comparable to another taken over the same scope.** Adding a
 * directory to `dirs` can move the number several points with no code change,
 * and a line that steps down for that reason reads exactly like a regression.
 * Silence here is how a measurement correction gets mistaken for a bad week.
 */
function scopeNote(series) {
  const known = series.filter((p) => p.scope);
  if (known.length < 2) return [];
  const changes = [];
  for (let i = 1; i < known.length; i += 1) {
    if (known[i].scope !== known[i - 1].scope) {
      const before = new Set(known[i - 1].scope.split(','));
      const after = known[i].scope.split(',');
      const added = after.filter((d) => !before.has(d));
      const removed = [...before].filter((d) => !after.includes(d));
      const what = [
        added.length ? `added ${added.join(', ')}` : '',
        removed.length ? `dropped ${removed.join(', ')}` : '',
      ].filter(Boolean).join(' and ');
      changes.push(`${known[i].date} (${what || 'scope changed'})`);
    }
  }
  // Same treatment for a formula change: a dimension rescored is a new ruler,
  // and a step drawn under a new ruler is not progress.
  const scored = series.filter((p) => p.method);
  for (let i = 1; i < scored.length; i += 1) {
    if (scored[i].method !== scored[i - 1].method) {
      changes.push(`${scored[i].date} (scoring formula v${scored[i - 1].method} → v${scored[i].method})`);
    }
  }
  if (!changes.length) return [];
  return ['', `> **What is measured changed during this period:** ${changes.join('; ')}. `
    + 'Readings either side are not directly comparable, and a step at that point '
    + 'is the measurement moving rather than the code.'];
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
console.log(`\n${buildExec()}`); // the generated executive summary (also stamped as ch:exec)

if (WRITE) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  // **Record what was measured, not just the number.** Widening `dirs` by one
  // directory moved this repo's score 73.7 → 68.5 in an afternoon with no code
  // change — a config correction that made the trend read as "they broke
  // something today". A score is only comparable to another score taken over the
  // same scope, so the scope travels with it and the chart can say when it moved.
  const scope = (DIRS || []).join(',');
  if (!fs.existsSync(HISTORY)) {
    fs.writeFileSync(HISTORY, `date\tscore\tgrade\t${dims.map((d) => d.key.toLowerCase().replace(/[^a-z]+/g, '_')).join('\t')}\tscope\tmethod\n`);
  }
  fs.appendFileSync(HISTORY, `${today()}\t${r1(score)}\t${grade}\t${dims.map((d) => r1(d.score)).join('\t')}\t${scope}\t${METHOD_VERSION}\n`);
  const stampObj = {
    badge: `${grade} · ${r1(score)} / 100`,
    exec: buildExec(), outcomes: buildOutcomes(), roi: buildRoi(),
    chart: chartMarkdown(), pie: pieMarkdown(), trend: buildTrend(),
    files: miFiles, loc: locK, green: greenFiles, yellow: yellowFiles, red: redFiles,
    doc_pct: r1(docPct), security: r1(securityScore),
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
