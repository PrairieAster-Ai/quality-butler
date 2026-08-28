#!/usr/bin/env node
//
// The plugin's own metadata drifted three minor versions from its tags: every
// release from 0.4.0 to 0.6.1 was tagged, and plugin.json still advertised
// 0.3.0 while the changelog's newest entry was the same. Nothing looked wrong,
// because nothing was looking.
//
// The same drift then happened to the thing with the widest blast radius. The
// workflow template ships a SKILLS_REF pin, and every repo that copies it runs
// whatever that pin names. It sat on v0.3.0 for seven minor versions, so a new
// install silently got skills from before no-silent-defaults, gate-liveness,
// duplicate-declarations and the assisted-development metrics existed. That is
// v0.6.2's stale-copy bug again, shipped by default to everyone downstream.
//
//   node scripts/check-manifests.mjs            check this repo
//   node scripts/check-manifests.mjs --selftest negative controls for the checks above
//
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Every consistency rule, against a repo root. Returns the failures. */
export function checkManifests(root = '.') {
  const fail = [];
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
  JSON.parse(read('.claude-plugin/marketplace.json')); // parse-only: malformed JSON is the failure

  // Every path the manifest advertises must exist.
  for (const s of [...(plugin.skills || []), ...(plugin.agents || [])]) {
    if (!fs.existsSync(path.join(root, s.replace(/^\.\//, '')))) fail.push(`plugin.json points at ${s}, which does not exist`);
  }

  // Every skill directory on disk must be advertised, or an install silently ships fewer.
  for (const d of fs.readdirSync(path.join(root, 'skills'), { withFileTypes: true }).filter((e) => e.isDirectory())) {
    if (!(plugin.skills || []).some((s) => s.endsWith(`/${d.name}`))) fail.push(`skills/${d.name} exists but plugin.json does not list it`);
  }

  // The version must match the newest changelog entry.
  const newest = read('CHANGELOG.md').match(/^## \[([0-9.]+)\]/m)?.[1];
  if (!newest) fail.push('CHANGELOG.md has no parseable version heading');
  else if (newest !== plugin.version) fail.push(`plugin.json says ${plugin.version}, newest changelog entry is ${newest}`);

  // The workflow template's skill pin must name the current release. A consumer may
  // pin to any reviewed commit; what ships from here must not be stale.
  if (newest) {
    const wf = read('agents/quality-butler.yml');
    const ref = wf.match(/^\s*SKILLS_REF:\s*(\S+)/m)?.[1];
    if (!ref) fail.push('agents/quality-butler.yml has no SKILLS_REF pin');
    else if (ref !== `v${newest}`) fail.push(`agents/quality-butler.yml pins SKILLS_REF to ${ref}, but the current release is v${newest}`);
  }
  return fail;
}

// ── Negative controls ────────────────────────────────────────────────────────
// A gate that has never been shown to fail has not been shown to work. Each
// negative plants one known-bad input; the positive proves the suite can pass.
function selftest() {
  const results = [];
  const check = (name, fn) => {
    try { fn(); results.push([true, name]); } catch (e) { results.push([false, `${name}\n      ${e.message}`]); }
  };
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

  /** A repo root every rule passes on, so a control fails for its own reason. */
  const fixture = (mutate = () => {}) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-selftest-'));
    fs.mkdirSync(path.join(d, '.claude-plugin'), { recursive: true });
    fs.mkdirSync(path.join(d, 'skills/code-health'), { recursive: true });
    fs.mkdirSync(path.join(d, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(d, '.claude-plugin/plugin.json'),
      JSON.stringify({ name: 'quality-butler', version: '9.9.9', skills: ['./skills/code-health'] }));
    fs.writeFileSync(path.join(d, '.claude-plugin/marketplace.json'), JSON.stringify({ name: 'm' }));
    fs.writeFileSync(path.join(d, 'CHANGELOG.md'), '# Changelog\n\n## [9.9.9] - 2026-01-01\n');
    fs.writeFileSync(path.join(d, 'agents/quality-butler.yml'), '          SKILLS_REF: v9.9.9 # pinned\n');
    mutate(d);
    return d;
  };
  const fails = (d) => checkManifests(d);

  check('a consistent repo passes every rule', () => {
    const f = fails(fixture());
    assert(f.length === 0, `expected no failures, got: ${f.join(' | ')}`);
  });
  check('a skill on disk that plugin.json omits is reported', () => {
    const f = fails(fixture((d) => fs.mkdirSync(path.join(d, 'skills/orphan'))));
    assert(f.some((m) => m.includes('skills/orphan')), `not reported: ${f.join(' | ')}`);
  });
  check('a plugin.json path that does not exist is reported', () => {
    const f = fails(fixture((d) => {
      const p = path.join(d, '.claude-plugin/plugin.json');
      const j = JSON.parse(fs.readFileSync(p, 'utf8')); j.skills.push('./skills/ghost');
      fs.writeFileSync(p, JSON.stringify(j));
    }));
    assert(f.some((m) => m.includes('ghost')), `not reported: ${f.join(' | ')}`);
  });
  check('a version behind the changelog is reported', () => {
    const f = fails(fixture((d) => fs.writeFileSync(path.join(d, 'CHANGELOG.md'), '## [9.9.10] - 2026-01-02\n')));
    assert(f.some((m) => m.includes('newest changelog entry')), `not reported: ${f.join(' | ')}`);
  });
  check('a SKILLS_REF pin behind the release is reported', () => {
    const f = fails(fixture((d) => fs.writeFileSync(path.join(d, 'agents/quality-butler.yml'), '          SKILLS_REF: v0.3.0 # stale\n')));
    assert(f.some((m) => m.includes('SKILLS_REF')), `not reported: ${f.join(' | ')}`);
  });
  check('a missing SKILLS_REF pin is reported', () => {
    const f = fails(fixture((d) => fs.writeFileSync(path.join(d, 'agents/quality-butler.yml'), 'name: ci\n')));
    assert(f.some((m) => m.includes('no SKILLS_REF')), `not reported: ${f.join(' | ')}`);
  });

  for (const [ok, name] of results) console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  const passed = results.filter(([ok]) => ok).length;
  console.log(`\n${passed}/${results.length} manifest negative controls passing`);
  return passed === results.length ? 0 : 1;
}

if (process.argv.includes('--selftest')) process.exit(selftest());

const fail = checkManifests('.');
for (const f of fail) console.error(`  ✗ ${f}`);
if (!fail.length) {
  const plugin = JSON.parse(fs.readFileSync('.claude-plugin/plugin.json', 'utf8'));
  console.log(`  ✓ manifests consistent (v${plugin.version}, ${plugin.skills.length} skills)`);
}
process.exit(fail.length ? 1 : 0);
