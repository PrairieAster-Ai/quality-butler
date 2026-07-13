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
    const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
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
  if (!fs.existsSync(file)) fs.writeFileSync(file, header);
  fs.appendFileSync(file, row);
}
