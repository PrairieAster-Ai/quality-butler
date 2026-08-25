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
  'Resilience (worst file)': {
    outcome: 'risk', plain: 'Worst-file safety',
    soWhat: `The single hardest-to-change file scores ${r1(minMi)} — ${minMi >= 20 ? 'still workable' : 'a landmine when it must change under deadline'}.`,
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
      const byDate = new Map();
      for (const v of lines.slice(1).map((l) => l.split('\t'))) {
        const date = v[di]; const score = Number(v[si]);
        if (date && Number.isFinite(score)) byDate.set(date, { date, score });
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
    ].join('\n');
  } catch {
    // Fallback: Unicode sparkline scaled across the observed score range.
    const min = Math.min(...scores), max = Math.max(...scores), span = max - min || 1;
    const spark = scores.map((s) => SPARK[Math.min(SPARK.length - 1, Math.floor(((s - min) / span) * (SPARK.length - 1)))]).join('');
    return `${spark}  ${r1(first)}→${r1(last)} (Δ ${sign}${delta})`;
  }
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
  if (!fs.existsSync(HISTORY)) {
    fs.writeFileSync(HISTORY, `date\tscore\tgrade\t${dims.map((d) => d.key.toLowerCase().replace(/[^a-z]+/g, '_')).join('\t')}\n`);
  }
  fs.appendFileSync(HISTORY, `${today()}\t${r1(score)}\t${grade}\t${dims.map((d) => r1(d.score)).join('\t')}\n`);
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
