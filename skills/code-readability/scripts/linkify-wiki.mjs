#!/usr/bin/env node
//
// Cross-reference generated wiki pages to the source repo: wrap backtick-quoted
// file references — `src/lib/foo.ts`, `scripts/foo.mjs`, `schema.ts` — in links
// to that file on GitHub, so every file/script mention in the docs is
// one click from the code. Run as the LAST step before publishing (idempotent).
//
//   node linkify-wiki.mjs <repo-root> <wiki-dir> <blob-base-url>
//   e.g. … /repo /tmp/cr-wiki https://github.com/OWNER/REPO/blob/main
//
// Safe by construction: only links backtick tokens that resolve to a real
// tracked file (exact repo path, or an *unambiguous* basename); never touches
// code fences, existing link labels, commands, type names, or table names.
//
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// `--all` also cross-references hand-authored pages (default: only our own
// generated/curated pages, identified by the `/code-readability` marker).
const args = process.argv.slice(2);
const ALL = args.includes('--all');
const [repoRoot, wikiDir, blobBase] = args.filter((a) => !a.startsWith('--'));
if (!repoRoot || !wikiDir || !blobBase) {
  console.error('usage: linkify-wiki.mjs <repo-root> <wiki-dir> <blob-base-url> [--all]');
  process.exit(2);
}

const tracked = execSync('git ls-files', { cwd: repoRoot, encoding: 'utf8' }).split('\n').filter(Boolean);
const trackedSet = new Set(tracked);
const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs|css|scss|ya?ml|tsv|json|md|sql)$/;
// basename → unique tracked path, or null when ambiguous (e.g. two supabase.ts).
const byBase = new Map();
for (const f of tracked) {
  if (!CODE_EXT.test(f)) continue;
  const b = path.basename(f);
  byBase.set(b, byBase.has(b) ? null : f);
}

function resolve(token) {
  if (trackedSet.has(token)) return token;                              // exact repo path
  if (!token.includes('/') && CODE_EXT.test(token)) return byBase.get(token) || null; // unique basename
  return null;
}

// A backtick token, not already a markdown link label (`[`x`]`) nor a link.
const TOKEN = /(?<!\[)`([^`\n]+)`(?!\])/g;
const linkifyLine = (line) => line.replace(TOKEN, (m, tok) => {
  const file = resolve(tok.trim());
  return file ? `[\`${tok}\`](${blobBase}/${file})` : m;
});

let total = 0;
for (const name of fs.readdirSync(wikiDir)) {
  if (!name.endsWith('.md')) continue;
  const p = path.join(wikiDir, name);
  const src = fs.readFileSync(p, 'utf8');
  // By default only our own (generated / curated) pages; `--all` includes hand-authored ones.
  if (!ALL && !src.split('\n', 1)[0].includes('code-readability')) continue;
  let inFence = false;
  let changed = 0;
  const out = src.split('\n').map((line) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return line; }
    if (inFence) return line; // never linkify inside code samples
    const next = linkifyLine(line);
    if (next !== line) changed++;
    return next;
  });
  if (changed) { fs.writeFileSync(p, out.join('\n')); total += changed; console.log(`  ${name}: +links on ${changed} line(s)`); }
}
console.log(`\n✓ cross-referenced ${total} file mention(s) in ${wikiDir} → ${blobBase}`);
