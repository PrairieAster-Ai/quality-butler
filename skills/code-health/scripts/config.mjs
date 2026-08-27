#!/usr/bin/env node
//
// Shared config + helpers for the code-health skill. The skill is installed
// globally but runs against whatever repo invokes it: every path is resolved
// from process.cwd() (the target repo), and per-repo settings come from a
// `code-health.config.json` at the repo root. Defaults assume a single `src/`
// dir; override `dirs`, `docDirs`, `coverageWorkspaces`, `tsconfig`, etc. for
// monorepos. The GitHub blob base for file links is derived from `origin` if
// not set explicitly.
//
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

export const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));

// The skill is global, but the analysis packages (typescript, madge,
// dependency-cruiser) are installed in the TARGET repo. ESM resolves relative to
// the script file, so resolve those from the repo's package.json instead.
export const requireRepo = createRequire(pathToFileURL(path.join(process.cwd(), 'package.json')));

const CFG_FILE = path.resolve(process.cwd(), 'code-health.config.json');
const DEFAULTS = {
  dirs: ['src'],
  docDirs: null,                 // null → defaults to `dirs`
  coverageWorkspaces: ['.'],
  tsconfig: null,                // for madge accuracy; optional
  historyDir: 'code-health',
  window: '365 days ago',
  blobBase: null,                // null → derive from git remote
  changeCoupling: { maxFiles: 25, minRev: 5, minCo: 4, minDegree: 0.4 },
  thresholds: { miGreen: 20, miYellow: 10, dupMinLines: 8 },
};

const userCfg = fs.existsSync(CFG_FILE) ? JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')) : {};
export const cfg = {
  ...DEFAULTS, ...userCfg,
  changeCoupling: { ...DEFAULTS.changeCoupling, ...(userCfg.changeCoupling || {}) },
  thresholds: { ...DEFAULTS.thresholds, ...(userCfg.thresholds || {}) },
};

export const DIRS = cfg.dirs;
export const DOC_DIRS = cfg.docDirs || cfg.dirs;
export const COV_WORKSPACES = cfg.coverageWorkspaces;
export const HISTORY_DIR = cfg.historyDir;
export const WINDOW = cfg.window;
export const WRITE = !process.argv.includes('--no-write');

function deriveBlob() {
  if (cfg.blobBase) return cfg.blobBase;
  try {
    const url = execSync('git remote get-url origin', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const m = url.match(/github-wiki\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
    if (m) {
      let branch = 'main';
      try { branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'main'; } catch { /* default main */ }
      return `https://github.com/${m[1]}/${m[2]}/blob/${branch}`;
    }
  } catch { /* no remote */ }
  return '';
}
export const BLOB = deriveBlob();

export const r1 = (x) => Math.round(x * 10) / 10;
export const r2 = (x) => Math.round(x * 100) / 100;
export const hist = (name) => path.join(HISTORY_DIR, name);
export const today = () => new Date().toISOString().slice(0, 10);
export const bar = (s) => { const f = Math.max(0, Math.min(20, Math.round(s / 5))); return '█'.repeat(f) + '░'.repeat(20 - f); };
// clamp((v−bad)/(good−bad)·100) — works whether higher or lower is better.
export const norm = (v, good, bad) => Math.max(0, Math.min(100, ((v - bad) / (good - bad)) * 100));
// Shared verdict banding for the generated interpretation layer (see
// code-health/references/methodology.md, "Who the dashboard serves"): every
// 0–100 score gets an explicit good / watch / act verdict + a word, so no
// deliverable ever ships a bare number a non-technical reader can't judge.
export const verdict = (s) => (s >= 80 ? { icon: '✅', word: 'Healthy' }
  : s >= 60 ? { icon: '⚠️', word: 'Watch' }
    : { icon: '❌', word: 'Act now' });

export function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') out.push(...walk(p)); }
    else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

export function lastRow(file) {
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  if (lines.length < 2) return null;
  const header = lines[0].split('\t');
  const vals = lines[lines.length - 1].split('\t');
  return Object.fromEntries(header.map((h, i) => [h, vals[i]]));
}

export const tryExec = (cmd) => {
  try { return { ok: true, out: execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 }) }; }
  catch (e) { return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}` }; }
};

export function appendHistory(file, header, row) {
  if (!WRITE) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, header);
    fs.appendFileSync(file, row);
    return;
  }
  // **Widen the header when a producer adds a column.** This used to write the
  // header only on first creation, so a new column arrived in every row and was
  // named in none of them — readers key on header position, found nothing, and
  // fell back to a default. Silently: the value was right there at the end of
  // the line. Observed when the MI producer began emitting a 5th percentile and
  // the roll-up went on scoring the minimum for a full reading.
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const want = header.replace(/\n$/, '');
  if (lines[0] !== want) {
    const wantCols = want.split('\t').length;
    if (wantCols > lines[0].split('\t').length) {
      lines[0] = want;
      for (let i = 1; i < lines.length; i += 1) {
        if (!lines[i].trim()) continue;
        const short = wantCols - lines[i].split('\t').length;
        if (short > 0) lines[i] += '\t'.repeat(short);
      }
      fs.writeFileSync(file, lines.join('\n'));
    }
  }
  // **A narrower row means an older copy of this skill is running.** The block
  // above widens a history when a producer *adds* a column; the reverse is the
  // dangerous case. A stale script writes fewer fields than the header names,
  // the reader keys on header position, finds nothing at the end of the line,
  // and falls back to a default — producing a plausible reading with a
  // confidently wrong number in it. Observed when a global copy of this skill
  // shadowed a repo's pinned one: MI's p5 and the roll-up's scope/method went
  // missing, Resilience silently re-scored the single worst file instead of the
  // 5th percentile, and the grade fell 12.6 points with a narrative explaining
  // the drop. Refuse the row rather than record it.
  const cols = header.replace(/\n$/, '').split('\t').length;
  const got = row.replace(/\n$/, '').split('\t').length;
  if (got < cols) {
    throw new Error(
      `${path.basename(file)}: producer wrote ${got} fields, header names ${cols}. `
      + 'This build of the skill is older than the history it is appending to. '
      + 'Run the copy the repo pins (.claude/skills/code-health) rather than a global one.',
    );
  }
  fs.appendFileSync(file, row);
}
