#!/usr/bin/env node
//
// Wiki repo plumbing — the shared git mechanics for publishing to a GitHub Wiki,
// so neither /code-readability nor /code-health reimplements them. GitHub wikis
// are a separate `<repo>.wiki.git` repo; push requires SSH (the wiki has no PR/
// API write path). Subcommands:
//
//   node wiki-repo.mjs url <repo-ssh-or-https>     → print the wiki clone URL
//   node wiki-repo.mjs clone <wiki-url> <dest>     → clone the wiki (SSH)
//   node wiki-repo.mjs guard <marker> <page.md>... → fail if a page to be written
//                                                    lacks <marker> (i.e. it's
//                                                    hand-authored — don't clobber)
//   node wiki-repo.mjs push <wiki-dir> "<message>" → add -A, commit, push (no-op if clean)
//
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const [cmd, ...args] = process.argv.slice(2);
const run = (c, opts = {}) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

function wikiUrl(repo) {
  // git@github.com:Owner/Repo(.git) or https://github.com/Owner/Repo → SSH wiki URL
  const m = repo.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) throw new Error(`can't derive wiki URL from: ${repo}`);
  return `git@github.com:${m[1]}/${m[2]}.wiki.git`;
}

try {
  switch (cmd) {
    case 'url': {
      console.log(wikiUrl(args[0] || run('git remote get-url origin').trim()));
      break;
    }
    case 'clone': {
      const [url, dest] = args;
      fs.rmSync(dest, { recursive: true, force: true });
      run(`git clone ${url} ${dest}`, { stdio: 'inherit' });
      console.log(`cloned → ${dest}`);
      break;
    }
    case 'guard': {
      const [marker, ...pages] = args;
      const conflicts = pages.filter((p) => fs.existsSync(p) && !fs.readFileSync(p, 'utf8').includes(marker));
      if (conflicts.length) {
        console.error(`✗ refusing to overwrite hand-authored page(s) lacking "${marker}":`);
        for (const c of conflicts) console.error(`    ${c}`);
        console.error('  Add the marker to adopt the page, or write under a different name.');
        process.exit(1);
      }
      console.log(`✓ ${pages.length} page(s) safe to write (marker present or new)`);
      break;
    }
    case 'push': {
      const [dir, message] = args;
      run('git add -A', { cwd: dir });
      const status = run('git status --porcelain', { cwd: dir }).trim();
      if (!status) { console.log('  wiki already current — nothing to push'); break; }
      run(`git commit -m ${JSON.stringify(message)}`, { cwd: dir });
      run('git push', { cwd: dir, stdio: 'inherit' });
      console.log('  pushed wiki');
      break;
    }
    default:
      console.error('usage: wiki-repo.mjs <url|clone|guard|push> …');
      process.exit(1);
  }
} catch (e) {
  console.error(`wiki-repo ${cmd} failed: ${e.message?.split('\n')[0]}`);
  if (/Permission denied|publickey|Could not read/.test(e.message || '')) {
    console.error('  → wiki push needs SSH auth. Ensure your SSH key is loaded (the wiki has no HTTPS/PAT write path).');
  }
  process.exit(1);
}
