#!/usr/bin/env node
//
// The plugin's own metadata drifted three minor versions from its tags: every
// release from 0.4.0 to 0.6.1 was tagged, and plugin.json still advertised
// 0.3.0 while the changelog's newest entry was the same. Nothing looked wrong,
// because nothing was looking.
//
//   node scripts/check-manifests.mjs
//
import fs from 'node:fs';

const fail = [];
const read = (p) => fs.readFileSync(p, 'utf8');

const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
JSON.parse(read('.claude-plugin/marketplace.json')); // parse-only: malformed JSON is the failure

// Every path the manifest advertises must exist.
for (const s of [...(plugin.skills || []), ...(plugin.agents || [])]) {
  if (!fs.existsSync(s.replace(/^\.\//, ''))) fail.push(`plugin.json points at ${s}, which does not exist`);
}

// Every skill directory on disk must be advertised, or an install silently ships fewer.
for (const d of fs.readdirSync('skills', { withFileTypes: true }).filter((e) => e.isDirectory())) {
  if (!(plugin.skills || []).some((s) => s.endsWith(`/${d.name}`))) fail.push(`skills/${d.name} exists but plugin.json does not list it`);
}

// The version must match the newest changelog entry.
const newest = read('CHANGELOG.md').match(/^## \[([0-9.]+)\]/m)?.[1];
if (!newest) fail.push('CHANGELOG.md has no parseable version heading');
else if (newest !== plugin.version) fail.push(`plugin.json says ${plugin.version}, newest changelog entry is ${newest}`);

for (const f of fail) console.error(`  ✗ ${f}`);
if (!fail.length) console.log(`  ✓ manifests consistent (v${plugin.version}, ${plugin.skills.length} skills)`);
process.exit(fail.length ? 1 : 0);
