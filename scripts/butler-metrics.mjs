#!/usr/bin/env node
//
// Butler self-effectiveness metrics — turns the quality-butler agent's OWN
// activity into a trend, so the ROI/governance story has numbers behind it. Uses
// the `gh` CLI (assumed authenticated in CI) to count the butler's output for a
// repo: merged `butler/*` PRs (fixes shipped), open `butler/*` PRs (in flight),
// and butler-authored issues open vs closed (findings raised vs resolved). Prints
// a one-line summary suitable for the agent's final report and appends a dated row
// to a `butler-metrics.tsv` (default code-health/butler-metrics.tsv so it rides
// along on the butler-state branch with the rest of the trend). Graceful if `gh`
// is unauthenticated — prints a hint and exits 0, never blocks a run.
//
//   node scripts/butler-metrics.mjs
//   node scripts/butler-metrics.mjs --repo owner/name --out path/to/butler-metrics.tsv
//
// ASSUMPTION — butler-authored issues: the agent runs in CI as the
// github-actions bot, so "butler finding" is heuristically any issue whose author
// login is `github-actions`/`github-actions[bot]`, OR that carries a label
// matching /butler/i (e.g. a `butler` label the workflow applies), OR whose title
// carries a `[butler]` marker. This is best-effort; tighten it to your workflow's
// exact label if you adopt one.
//
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const argv = process.argv.slice(2);
const getFlag = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const OUT = getFlag('--out', path.join('code-health', 'butler-metrics.tsv'));
const today = () => new Date().toISOString().slice(0, 10);

// gh runner: returns null on any failure (unauth, missing repo, etc.).
function gh(args) {
  try { return execSync(`gh ${args}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return null; }
}
function ghJson(args) {
  const out = gh(args);
  if (out == null) return null;
  try { return JSON.parse(out); } catch { return null; }
}

// Require an authenticated gh; derive the repo if not given.
let repo = getFlag('--repo', null);
if (!repo) {
  const view = ghJson('repo view --json nameWithOwner');
  repo = view && view.nameWithOwner;
}
if (!repo) {
  console.log('butler-metrics: `gh` unavailable/unauthenticated (or no repo). Run `gh auth login`, or pass --repo owner/name. Skipping.');
  process.exit(0);
}

const isButler = (branch) => typeof branch === 'string' && branch.startsWith('butler/');

// Merged butler/* PRs (fixes shipped). The `head:` search is a hint; we filter
// on headRefName client-side so the count is exact regardless of search matching.
const mergedPrs = (ghJson(`pr list --repo ${repo} --state merged --search "head:butler/" --json number,headRefName --limit 1000`) || [])
  .filter((p) => isButler(p.headRefName));
// Open butler/* PRs (in flight).
const openPrs = (ghJson(`pr list --repo ${repo} --state open --json number,headRefName --limit 1000`) || [])
  .filter((p) => isButler(p.headRefName));

// Butler-authored issues (best-effort — see ASSUMPTION header).
const butlerIssue = (i) => {
  const login = ((i.author && i.author.login) || '').toLowerCase();
  if (login === 'github-actions' || login === 'github-actions[bot]') return true;
  if ((i.labels || []).some((l) => /butler/i.test(l.name || ''))) return true;
  if (/\[butler\]/i.test(i.title || '')) return true;
  return false;
};
const allIssues = (ghJson(`issue list --repo ${repo} --state all --json number,state,author,labels,title --limit 1000`) || [])
  .filter(butlerIssue);
const issuesOpen = allIssues.filter((i) => String(i.state).toLowerCase() === 'open').length;
const issuesClosed = allIssues.filter((i) => String(i.state).toLowerCase() === 'closed').length;

const merged = mergedPrs.length;
const open = openPrs.length;

console.log(`butler to date: ${merged} fixes merged, ${issuesOpen} findings open, ${issuesClosed} resolved (${open} PR${open === 1 ? '' : 's'} in flight) · ${repo}`);

// Append a dated trend row (create with header on first write).
const header = 'date\tmerged_prs\topen_prs\tfindings_open\tfindings_resolved\n';
const row = `${today()}\t${merged}\t${open}\t${issuesOpen}\t${issuesClosed}\n`;
try {
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  if (!fs.existsSync(OUT)) fs.writeFileSync(OUT, header);
  fs.appendFileSync(OUT, row);
  console.log(`appended reading → ${OUT}`);
} catch (e) {
  console.log(`butler-metrics: could not write ${OUT} (${e.message}); summary printed above.`);
}
