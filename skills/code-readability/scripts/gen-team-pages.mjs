#!/usr/bin/env node
//
// Stamp the *factual* parts of the two "Team" wiki pages straight from the repo
// so they can never drift from the code:
//
//   Getting-Started.md   onboarding / localhost setup (Diátaxis How-to)
//   Skill-Inventory.md    team competency matrix       (Diátaxis Explanation)
//
// Four marker regions are regenerated from repo facts; the prose around them is
// hand-authored and preserved (same pattern as the CodeHealth badge/chart stamp):
//
//   cr:prereqs   runtime + package-manager prerequisites (engines / .nvmrc)
//   cr:scripts   the `npm run` script catalog (root package.json)
//   cr:env       the environment-variable table (parsed from .env.example)
//   cr:stack     detected stack + versions (scanned across every package.json)
//
//   node .claude/skills/code-readability/scripts/gen-team-pages.mjs <wiki-dir> [--scaffold]
//
// Default: stamp the four markers into existing <wiki-dir>/Getting-Started.md and
// Skill-Inventory.md (leaves prose untouched; idempotent — run it first on every
// publish). With --scaffold: also write a starter page (prose template + markers)
// for any of the two that does not yet exist, so you can fill in project prose.
//
// Config (env, with sensible defaults so it works zero-config in a repo root):
//   CR_PKG          root package.json with the dev scripts   (default package.json)
//   CR_ENV_EXAMPLE  the committed env template               (default .env.example)
//   CR_REPO_ROOT    root to scan for stack package.json files (default .)
//
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] || '/tmp/cr-wiki';
const SCAFFOLD = process.argv.includes('--scaffold');
const PKG = process.env.CR_PKG || 'package.json';
const ENV_EXAMPLE = process.env.CR_ENV_EXAMPLE || '.env.example';
const ROOT = process.env.CR_REPO_ROOT || '.';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };

// --- prereqs: runtime + package manager -------------------------------------
function prereqs() {
  const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
  let node = (pkg.engines && pkg.engines.node) || '';
  if (!node && exists('.nvmrc')) node = fs.readFileSync('.nvmrc', 'utf8').trim();
  const pm = pkg.packageManager || '';
  const rows = [['Node.js', node ? `\`${node}\`` : '—', node ? 'pinned for the project' : 'install an LTS release'],
    ['Package manager', pm ? `\`${pm}\`` : 'npm', pm ? 'use the pinned version (Corepack will honor it)' : 'comes with Node'],
    ['Git', '—', 'clone + the pre-push security hook']];
  return table(['Tool', 'Version', 'Notes'], rows);
}

// --- scripts: the npm run catalog -------------------------------------------
function scripts() {
  const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
  const s = pkg.scripts || {};
  const rows = Object.entries(s).map(([name, cmd]) => [`\`npm run ${name}\``, `\`${clean(cmd)}\``]);
  return table(['Script', 'Runs'], rows);
}

// --- env: the environment-variable table from .env.example ------------------
function env() {
  if (!exists(ENV_EXAMPLE)) return '_No `.env.example` found._';
  const lines = fs.readFileSync(ENV_EXAMPLE, 'utf8').split('\n');
  const rows = [];
  let group = [];
  let lastWasVar = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) { group = []; lastWasVar = false; continue; }
    if (l.startsWith('#')) {
      if (lastWasVar) group = [];            // a comment after a var starts a new group
      group.push(l.replace(/^#\s?/, ''));
      lastWasVar = false;
      continue;
    }
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) {
      const [, key, val] = m;
      rows.push([`\`${key}\``, val ? `\`${val}\`` : '_(blank)_', clean(group.join(' ')) || '—']);
      lastWasVar = true;
    }
  }
  return table(['Variable', 'Example', 'What it is'], rows);
}

// --- stack: detected dependencies + versions across the monorepo ------------
// label/category for the deps worth surfacing; anything not listed is ignored.
const SIGNAL = {
  react: ['React', 'Frontend'], 'react-dom': ['React DOM', 'Frontend'],
  next: ['Next.js', 'Frontend'], vue: ['Vue', 'Frontend'], svelte: ['Svelte', 'Frontend'],
  vite: ['Vite', 'Build'], turbo: ['Turborepo', 'Build'], webpack: ['Webpack', 'Build'],
  '@mui/material': ['MUI', 'UI'], '@mui/x-data-grid': ['MUI Data Grid', 'UI'],
  '@emotion/react': ['Emotion', 'UI'], tailwindcss: ['Tailwind CSS', 'UI'],
  '@dnd-kit/core': ['dnd-kit', 'UI'],
  express: ['Express', 'Backend'], fastify: ['Fastify', 'Backend'], hono: ['Hono', 'Backend'],
  'drizzle-orm': ['Drizzle ORM', 'Database'], 'drizzle-kit': ['Drizzle Kit', 'Database'],
  '@prisma/client': ['Prisma', 'Database'], postgres: ['postgres.js', 'Database'],
  '@supabase/supabase-js': ['Supabase JS', 'Database'],
  typescript: ['TypeScript', 'Language'], zod: ['Zod', 'Validation'],
  '@tanstack/react-query': ['TanStack Query', 'Data'],
  'posthog-js': ['PostHog', 'Analytics'],
  '@playwright/test': ['Playwright', 'Testing'], vitest: ['Vitest', 'Testing'], jest: ['Jest', 'Testing'],
};

function findPkgJson(dir, depth, acc) {
  if (depth < 0) return acc;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name === 'build') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findPkgJson(p, depth - 1, acc);
    else if (e.name === 'package.json') acc.push(p);
  }
  return acc;
}

function stack() {
  const files = findPkgJson(ROOT, 3, []);
  const seen = new Map(); // pkg -> { version, where:Set }
  for (const f of files) {
    let json;
    try { json = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    const deps = { ...json.dependencies, ...json.devDependencies };
    const where = json.name || path.relative(ROOT, path.dirname(f)) || 'root';
    for (const [pkg, ver] of Object.entries(deps)) {
      if (!SIGNAL[pkg]) continue;
      const cur = seen.get(pkg) || { version: ver, where: new Set() };
      cur.version = ver; // last wins; versions are usually aligned in a monorepo
      cur.where.add(where);
      seen.set(pkg, cur);
    }
  }
  const order = ['Language', 'Frontend', 'UI', 'Build', 'Backend', 'Database', 'Data', 'Validation', 'Testing', 'Analytics'];
  const rows = [...seen.entries()]
    .map(([pkg, info]) => ({ cat: SIGNAL[pkg][1], label: SIGNAL[pkg][0], ver: info.version }))
    .sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat) || a.label.localeCompare(b.label))
    .map((r) => [r.cat, r.label, `\`${clean(r.ver)}\``]);
  return table(['Area', 'Technology', 'Version'], rows);
}

function table(head, rows) {
  if (!rows.length) return '_None detected._';
  const sep = head.map(() => '---');
  return [`| ${head.join(' | ')} |`, `| ${sep.join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

// --- assemble + stamp -------------------------------------------------------
const VALUES = { prereqs: prereqs(), scripts: scripts(), env: env(), stack: stack() };

function stampFile(file) {
  let src = fs.readFileSync(file, 'utf8');
  let out = src;
  for (const [name, val] of Object.entries(VALUES)) {
    // Function replacer so `$` in `val` (e.g. an npm script with $1, a $PORT env
    // example) is inserted literally, not interpreted as a replacement back-reference.
    out = out.replace(new RegExp(`(<!--cr:${name}-->)[\\s\\S]*?(<!--/cr:${name}-->)`, 'g'), (_m, p1, p2) => `${p1}\n${val}\n${p2}`);
  }
  if (out !== src) { fs.writeFileSync(file, out); console.log(`  stamped ${file}`); }
  else console.log(`  no markers changed: ${file}`);
}

const GETTING_STARTED = `<!-- generated by /code-readability — prose is hand-authored; the cr: marker blocks are regenerated by gen-team-pages.mjs -->
# Getting Started (Local Development)

> **Audience:** a new engineer going from a fresh \`git clone\` to a running localhost.
> The command lists and the env-var table below are stamped from the repo, so they
> stay correct as scripts change. The prose is hand-authored — edit it freely.

## Prerequisites

<!--cr:prereqs-->
<!--/cr:prereqs-->

<!-- TODO: list any service accounts a dev needs (database project, auth, analytics)
     and how to get access. Link to the relevant Architecture / Privacy pages. -->

## 1. Clone & install

\`\`\`bash
git clone <repo-url>
cd <repo>
npm install   # also wires the pre-push security hook
\`\`\`

## 2. Configure environment

Copy the template and fill in the values:

\`\`\`bash
cp .env.example .env
\`\`\`

<!--cr:env-->
<!--/cr:env-->

<!-- TODO: where to get each secret, and which are optional for local dev. -->

## 3. Run the app

<!-- TODO: name the primary dev command and what comes up (URLs/ports). -->

## Script reference

Every \`npm run\` target in the repo root:

<!--cr:scripts-->
<!--/cr:scripts-->

## Troubleshooting

<!-- TODO: the 3–5 issues a new dev actually hits (ports, env, DB access) and the fix. -->

---

_Stamped from \`${PKG}\` and \`${ENV_EXAMPLE}\` by \`/code-readability\`. See also:_ [[Architecture]] · [[Skill-Inventory]] · [[Page-Anatomy]]
`;

const SKILL_INVENTORY = `<!-- generated by /code-readability — prose is hand-authored; the cr:stack marker block is regenerated by gen-team-pages.mjs -->
# Skill Inventory

> **What this is:** the competencies a human teammate needs to work effectively in
> this codebase, grouped by area, with a proficiency target per area. Use it to
> onboard, to find learning gaps, and to staff work. The **Technology** versions
> are stamped from the repo; everything else is hand-curated.

## Proficiency levels

| Level | Means |
|---|---|
| **Aware** | Can read it and follow existing patterns with help. |
| **Working** | Can build a feature in this area unaided, following conventions. |
| **Fluent** | Can make architectural calls, review others, and teach it. |

## Technology (detected stack)

<!--cr:stack-->
<!--/cr:stack-->

<!-- TODO: for each area below, fill the matrix: the specific skill, the target
     level for this team, and a learning resource (repo file, wiki page, or doc). -->

## Competency matrix

### Technology & tooling
| Skill | Target | Learn from |
|---|---|---|
| <!-- e.g. TypeScript strict mode --> | Working | <!-- link --> |

### Design patterns
| Skill | Target | Learn from |
|---|---|---|
| <!-- the core domain patterns from CLAUDE.md / Architecture --> | Working | [[Architecture]] |

### Database
| Skill | Target | Learn from |
|---|---|---|
| <!-- schema, migrations, the ORM, access control --> | Working | [[Reference-Database-Schema]] |

### Frontend development & design
| Skill | Target | Learn from |
|---|---|---|
| <!-- component library, state/data fetching, responsive/a11y --> | Working | [[Reference-Components]] |

### Agile & delivery (GitHub Projects / kanban)
| Skill | Target | Learn from |
|---|---|---|
| <!-- board hygiene, issue writing, acceptance criteria, WIP limits --> | Working | <!-- link to the project board --> |

---

_Technology versions stamped by \`/code-readability\`. See also:_ [[Getting-Started]] · [[Architecture]] · [[Future-Roadmap]]
`;

const PAGES = { 'Getting-Started.md': GETTING_STARTED, 'Skill-Inventory.md': SKILL_INVENTORY };

fs.mkdirSync(OUT, { recursive: true });
for (const [name, template] of Object.entries(PAGES)) {
  const file = path.join(OUT, name);
  if (!exists(file)) {
    if (SCAFFOLD) { fs.writeFileSync(file, template); console.log(`  scaffolded ${file}`); stampFile(file); }
    else console.log(`  missing (run with --scaffold to create): ${file}`);
  } else {
    stampFile(file);
  }
}
console.log(`\nTeam pages: ${Object.keys(VALUES).map((k) => `cr:${k}`).join(', ')} stamped into ${OUT}`);
