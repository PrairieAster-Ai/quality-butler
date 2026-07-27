#!/usr/bin/env node
//
// Multi-repo CodeHealth rollup — an org/portfolio dashboard backend. Reads each
// repo's `codehealth-stamp.json` (written by codehealth-report.mjs) and emits a
// single "worst first" Markdown table (Repo · Grade · Score · Top hotspot · Doc% ·
// Security) plus a `portfolio-stamp.json` aggregate (mean score, count by grade,
// the per-repo list). Repo-agnostic: point it at repo paths, or a config file. A
// missing/unreadable stamp is skipped with a warning line, never a crash — so one
// un-instrumented repo doesn't sink the whole rollup.
//
//   node portfolio-report.mjs <repoPathA> <repoPathB> ...
//   node portfolio-report.mjs --config portfolio.config.json
//
// portfolio.config.json is an array of { name, path } (stamp resolved under the
// repo's historyDir) or { name, stampPath } (an explicit stamp file).
//
import fs from 'node:fs';
import path from 'node:path';

const OUT_STAMP = 'portfolio-stamp.json';
const argv = process.argv.slice(2);

// ── Resolve the list of { name, ... } repo entries from args or a config file ──
let entries = [];
const cfgIdx = argv.indexOf('--config');
if (cfgIdx >= 0) {
  const cfgPath = argv[cfgIdx + 1];
  if (!cfgPath || !fs.existsSync(cfgPath)) { console.error(`portfolio: --config file not found: ${cfgPath}`); process.exit(1); }
  try { entries = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); }
  catch (e) { console.error(`portfolio: could not parse ${cfgPath} (${e.message})`); process.exit(1); }
  if (!Array.isArray(entries)) { console.error('portfolio: config must be a JSON array of { name, path } | { name, stampPath }'); process.exit(1); }
} else {
  const paths = argv.filter((a) => !a.startsWith('--'));
  if (!paths.length) { console.error('usage: portfolio-report.mjs <repoPathA> <repoPathB> ...  |  --config portfolio.config.json'); process.exit(1); }
  entries = paths.map((p) => ({ name: path.basename(path.resolve(p)), path: p }));
}

// Each repo may set its own historyDir in code-health.config.json (default 'code-health').
function historyDirFor(repoPath) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(repoPath, 'code-health.config.json'), 'utf8'));
    if (cfg.historyDir) return cfg.historyDir;
  } catch { /* default below */ }
  return 'code-health';
}
function resolveStamp(entry) {
  if (entry.stampPath) return entry.stampPath;
  if (entry.path) return path.join(entry.path, historyDirFor(entry.path), 'codehealth-stamp.json');
  return null;
}

// "A · 92.5 / 100" → { grade: 'A', score: 92.5 }
function parseBadge(badge) {
  const m = String(badge || '').match(/([A-F])\s*·\s*([\d.]+)/);
  return m ? { grade: m[1], score: Number(m[2]) } : { grade: '?', score: null };
}

// A repo's dated score history for the trend view. Reads <historyDir>/codehealth-history.tsv
// (date, score, …) — the same file a single repo's dashboard sparkline uses — and returns
// [{ date:'YYYY-MM-DD', score:Number }] deduped to the last reading per date, oldest first.
// Missing/short/malformed history → null (repo simply doesn't get a trend line).
function readHistory(entry) {
  const p = entry.historyPath
    || (entry.path ? path.join(entry.path, historyDirFor(entry.path), 'codehealth-history.tsv') : null);
  if (!p || !fs.existsSync(p)) return null;
  let lines;
  try { lines = fs.readFileSync(p, 'utf8').trim().split('\n'); } catch { return null; }
  if (lines.length < 2) return null;
  const header = lines[0].split('\t');
  const di = header.indexOf('date'), si = header.indexOf('score');
  if (di < 0 || si < 0) return null;
  const byDate = new Map(); // last reading wins per calendar day
  for (const ln of lines.slice(1)) {
    const c = ln.split('\t');
    const date = (c[di] || '').trim();
    const score = Number(c[si]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(score)) continue;
    byDate.set(date, score);
  }
  const out = [...byDate.entries()].map(([date, score]) => ({ date, score })).sort((a, b) => (a.date < b.date ? -1 : 1));
  return out.length ? out : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`; // 2026-06-30 → "Jun 30"

const rows = [];
for (const entry of entries) {
  const name = entry.name || (entry.path ? path.basename(path.resolve(entry.path)) : '(unnamed)');
  const stampPath = resolveStamp(entry);
  if (!stampPath || !fs.existsSync(stampPath)) { console.warn(`⚠ ${name}: no stamp at ${stampPath || '(unresolved)'} — skipping`); continue; }
  let s;
  try { s = JSON.parse(fs.readFileSync(stampPath, 'utf8')); }
  catch (e) { console.warn(`⚠ ${name}: unreadable stamp ${stampPath} (${e.message}) — skipping`); continue; }
  const { grade, score } = parseBadge(s.badge);
  rows.push({
    name, grade, score,
    top_hotspot: s.top_hotspot || '—',
    doc_pct: s.doc_pct != null ? `${s.doc_pct}%` : '—',
    security: s.security != null ? String(s.security) : '—',
  });
}

if (!rows.length) { console.error('portfolio: no readable stamps — nothing to report'); process.exit(0); }

// Worst first (ascending score; nulls last).
rows.sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity));

const md = [];
md.push('| Repo | Grade | Score | Top hotspot | Doc% | Security |');
md.push('|---|:--:|--:|---|--:|--:|');
for (const r of rows) {
  md.push(`| ${r.name} | ${r.grade} | ${r.score != null ? r.score : '—'} | ${r.top_hotspot} | ${r.doc_pct} | ${r.security} |`);
}
const table = md.join('\n');
console.log(`\n${table}\n`);

const scored = rows.filter((r) => r.score != null);
const meanScore = scored.length ? Math.round((scored.reduce((a, r) => a + r.score, 0) / scored.length) * 10) / 10 : null;
const byGrade = {};
for (const r of rows) byGrade[r.grade] = (byGrade[r.grade] || 0) + 1;

// ── Trend view: CodeHealth score on calendar time, one line per repo ──
// Each repo's series starts on the day it was first scored (the first row of its history);
// repos with no dated history fall back to a single point at today's reading. Ungraded repos
// (the language-agnostic lens, score = null) sit the score trend out.
const today = new Date().toISOString().slice(0, 10);
const series = [];
for (const entry of entries) {
  const name = entry.name || (entry.path ? path.basename(path.resolve(entry.path)) : '(unnamed)');
  const row = rows.find((r) => r.name === name);
  if (!row || row.score == null) continue;
  series.push({ name, points: readHistory(entry) || [{ date: today, score: row.score }] });
}

let trendTable = '', trendChart = '';
if (series.length) {
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const ordered = series.slice().sort((a, b) => a.points.at(-1).score - b.points.at(-1).score); // worst-first, like the snapshot
  // Score-over-time table: the real reading per date, blank where the repo has none — so each line's start shows.
  const scoreAt = (pts, d) => { const hit = pts.find((p) => p.date === d); return hit ? hit.score : ''; };
  const th = ['| Repo | ' + dates.map(label).join(' | ') + ' |', '|---|' + dates.map(() => '--:').join('|') + '|'];
  for (const s of ordered) th.push('| ' + s.name + ' | ' + dates.map((d) => scoreAt(s.points, d)).join(' | ') + ' |');
  trendTable = th.join('\n');
  // Mermaid line chart: full-length arrays with leading-flat backfill to the first reading, so all
  // series share one calendar axis. xychart-beta has no legend — lines are read by height.
  const lastKnown = (pts, d) => { let v = pts[0].score; for (const p of pts) if (p.date <= d) v = p.score; return v; };
  const lines = ordered.map((s) => `    line [${dates.map((d) => lastKnown(s.points, d)).join(', ')}]`);
  trendChart = [
    '```mermaid', 'xychart-beta',
    '    title "CodeHealth score over calendar time (0-100)"',
    `    x-axis [${dates.map((d) => `"${label(d)}"`).join(', ')}]`,
    '    y-axis "CodeHealth score" 0 --> 100',
    ...lines, '```',
  ].join('\n');
  console.log(`${trendChart}\n\n${trendTable}\n`);
}

const aggregate = {
  generated: today,
  repos: rows.length,
  mean_score: meanScore,
  by_grade: byGrade,
  table,
  trend_chart: trendChart,
  trend_table: trendTable,
  trend_series: series,
  list: rows,
};
fs.writeFileSync(OUT_STAMP, JSON.stringify(aggregate, null, 2) + '\n');
console.log(`portfolio: ${rows.length} repos · mean score ${meanScore ?? 'n/a'} · grades ${Object.entries(byGrade).map(([g, n]) => `${g}:${n}`).join(' ')}`);
console.log(`wrote aggregate → ${OUT_STAMP}`);
