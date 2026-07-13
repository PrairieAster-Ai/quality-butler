---
name: code-readability
description: Make code readable for humans, IDEs, doc generators, and AI at once — by enforcing a TSDoc-native comment standard and turning those comments into GitHub Wiki documentation (cross-linked to the source). Use to assess doc-comment coverage, annotate a file/area with quality docs, or generate + publish project docs. TypeScript/React/MUI first; also covers HTML (semantic/ARIA), CSS/Sass (KSS/SassDoc), and vanilla JS (JSDoc) — see references/comment-style.md.
allowed-tools: "Bash(npx:*),Bash(node:*),Bash(git:*),Bash(ssh:*),Read,Write,Edit,Grep,Glob,Task"
argument-hint: "[assess|annotate|generate|publish|team] [path-or-scope]"
---

# Code Readability & Documentation Skill

One well-written comment should satisfy **four readers at once**:

1. **The human** skimming the file — a "why-not-what" header that explains intent.
2. **The IDE** — a TSDoc `/** */` block so hover, signature help, and quick-info show the doc inline.
3. **The doc generator** — `react-docgen-typescript` (components) and `TypeDoc` (everything else) read the *same* TSDoc to build the GitHub Wiki.
4. **An AI agent** — dense, accurate context at the point of use, so a model can act without re-deriving intent.

This skill enforces that standard and turns it into published docs. It is **TypeScript-native: TSDoc, never PropTypes** — the types already are the prop contract; PropTypes would duplicate it, drift, and add runtime weight (see `references/comment-style.md`).

## Configure for your project

The skill is project-agnostic; set these knobs once for your repo. The scripts read the listed environment variables (export them, or prefix the command), and a few values flow in as CLI args.

| Knob | How to set | Default |
|---|---|---|
| Source globs / dirs to scan | pass as `scope`/`path` args (e.g. `src/components`, or a glob to `extract-docs.mjs`) | `src/**/*.{ts,tsx}` |
| tsconfig for doc extraction | `CR_TSCONFIG` env (or `--tsconfig` on `extract-docs.mjs`) | `tsconfig.json` |
| Drizzle schema path (schema-page generator) | `CR_SCHEMA` env | `src/db/schema.ts` |
| Team-page facts (`team` mode: package.json / env / stack roots) | `CR_PKG`, `CR_ENV_EXAMPLE`, `CR_REPO_ROOT` env | `package.json`, `.env.example`, `.` |
| GitHub repo + blob base URL (for linkify) | passed as args to `linkify-wiki.mjs` (`<repo-root> <wiki-dir> https://github.com/<owner>/<repo>/blob/<branch>`) | — |
| Domain concepts / terms to cross-link in prose | list your own project's terms (the model uses them as wiki cross-link targets) | — |

> **The worked examples below are illustrative, not requirements.** They are drawn from the reference project this skill was built in — a residential-care menu app with a "Bill of Materials" food model — so the sample TSDoc, table names, and wiki page names reflect that domain. **Substitute your own domain throughout:** your symbols, your invariants, your schema, your architecture concepts.

## Modes

| Invocation | What it does | Edits code? |
|---|---|---|
| `assess [path]` | Score doc-comment coverage + readability/IDE-affordance gaps; rank the worst files. **Default.** | No |
| `annotate <path>` | Add/upgrade TSDoc + readability structure on the target. The **only** code-editing mode; always scoped to an explicit path. | Yes (comments/format only) |
| `generate [scope]` | Hybrid extract → Markdown into `/tmp/cr-docs/` for review. | No |
| `publish [scope]` | `generate`, then push the pages to the GitHub Wiki. | No (writes the wiki repo) |
| `team [scaffold\|stamp]` | Maintain the **Team pages** (Getting-Started + Skill-Inventory): scaffold them, fill the prose, and stamp the repo-derived fact-blocks. For humans, not code symbols. | No (writes the wiki repo) |

`scope`/`path` defaults to the changed files on the branch (`git diff --name-only origin/HEAD...`) so the skill rides the current work; pass a directory under `<your source dirs>` (e.g. `src/components`) to target an area, or `all` for a full pass.

**Hard invariant for every mode that edits:** comments and formatting only. Never change runtime behavior, identifiers, or control flow. After `annotate`, `npm run lint && npm run type-check && npm test` must stay green and the non-comment diff must be empty (`git diff -G'^[^/ ]' --stat` shows only whitespace/comment churn).

---

## Phase 1 — Assess

Goal: a coverage scorecard + a ranked worklist, not a lecture.

1. **Resolve scope** → list of `.ts`/`.tsx` files (exclude `*.test.*`, `*.spec.*`, generated, `dist/`).
2. **Enumerate exported symbols** per file (components, hooks, functions, `const` values, `type`/`interface`). A symbol is **documented** when an immediately-preceding `/** */` block exists; a component prop is documented when its type member has a `/** */`.
3. **Score** each area (components / hooks / lib / api / database):

   | Metric | Target |
   |---|---|
   | Exported symbols with a TSDoc summary | ≥ 90% |
   | Component props with a `/** */` description | ≥ 90% |
   | Public components/hooks with an `@example` | 100% of "API surface" symbols |
   | Modules with a file-header comment (intent) | 100% of non-trivial modules |
   | Non-obvious logic blocks with a "why" comment | sampled, qualitative |

4. **Rank hotspots** by `(exported symbols) × (1 − coverage)` — the files where missing docs cost the most. Surface the top ~10 with the specific gaps.

Report format:

```markdown
## Readability assessment — <scope>
| Area | Symbols | TSDoc % | Props % | @example | Header % |
|------|--------:|--------:|--------:|---------:|---------:|
| components | 41 | 72% | 64% | 6/14 | 88% |
...
### Top gaps
1. components/RecipeIngredientsTable.tsx — 9 exported symbols, 3 documented; no @example on the table; SortableRow props undocumented → `annotate` candidate
```

Provide a Grep/Glob recipe so it's reproducible; do not hand-wave the numbers.

---

## Phase 2 — Annotate

Apply the standard in `references/comment-style.md` to the target. Work file-by-file; for each exported symbol add or upgrade:

- **Components** → summary (what it renders + when to use) · per-prop `/** */` · `@example` showing real usage · `@remarks` for gotchas. Put the summary **directly above the component**, not above its `Props` interface — react-docgen-typescript reads the description from the component's own JSDoc and drops one placed on the type. react-docgen-typescript turns these into the component's Wiki page verbatim.
- **Hooks** → summary · `@param` for each arg · `@returns` describing the returned object's shape (document each returned field) · `@example`.
- **Functions** → summary · `@param` · `@returns` · `@example` when non-trivial · `@throws` if it can reject/throw meaningfully.
- **Types / interfaces** → summary · per-member `/** */`.
- **Modules** → a top-of-file block stating the module's job and how its pieces fit (keep/upgrade the existing "why-not-what" style).

Rules:
- **Preserve existing intent comments** — upgrade, don't delete the hard-won "why" notes the codebase already has.
- Match the file's surrounding voice and density. Honor any project conventions in `CLAUDE.md`/`AGENTS.md` (e.g. a "no em dashes" prose rule may apply to user-facing copy but not code comments — match the file you're in).
- Document the **why and the contract**, not the obvious mechanics. `// increments i` is noise; `/** Cycles asc → desc → off; null falls back to default order. */` is signal.
- Behavior-preserving. Re-run `lint`/`type-check`/`test` before declaring done.

---

## Phase 3 — Generate (hybrid: tools + prose)

Deterministic structure from the tools, narrative from the model. Both layers read the **same** TSDoc, so prose and tables can't drift from the code.

**Tool layer** (`references/doc-generation.md` has exact commands):
- Components → `scripts/extract-docs.mjs` (wraps `react-docgen-typescript`) → JSON of `{ displayName, description, props[], tags }`, then a Markdown props table per component.
- Hooks / lib / api / database → `npx typedoc --plugin typedoc-plugin-markdown` → Markdown.

**Prose layer** (the model, per area):
- A narrative **overview** (what this area is for, the mental model, how the pieces compose) above the generated tables.
- **Usage examples** drawn from real call sites (grep the repo for actual usages, don't invent).
- **Cross-links** between related symbols (e.g. `[[Reference-Hooks#useMyHook]]`) and to your project's architecture concepts — the domain terms you listed in "Configure for your project" (in the reference project these were BOM, resident portioning, and computed views; substitute your own, drawn from `CLAUDE.md`/`AGENTS.md`).
- An **"AI context" callout** per page: the 2–3 facts a model most needs to use this correctly (invariants, gotchas, where the source of truth lives).

Assemble into pages under `/tmp/cr-docs/` and show the user the index + one sample page before publishing.

---

## Phase 4 — Publish to the GitHub Wiki

Reuse the repo's `/github wiki` flow (SSH push to `<repo>.wiki.git`, single `master` branch, no PRs). Do **not** invent new auth.

1. Resolve the wiki SSH URL: take the repo origin, swap `.git` → `.wiki.git`, ensure `git@github.com:` form. Verify `ssh -T git@github.com`.
2. Clone (or `git pull` an existing clone) into a temp dir.
3. Write the generated pages following the **GitHub Wiki Markdown conventions** in `references/doc-generation.md` (Gollum, not README markdown): Diátaxis separation (generated = Reference only; keep explanation in `Architecture.md`; never generate tutorials over hand-authored pages), `[[Page#anchor]]` wiki links, hyphenated page names (spaces and `/` both collapse to `-`), a manual "Jump to" anchor-link TOC on long pages (GitHub wiki ignores `[[_TOC_]]`), plain blockquotes for callouts (`> [!NOTE]` alerts are unreliable in wikis), Mermaid for diagrams. Suggested page set (hyphen-prefixed so they group in the sidebar):
   - `Home.md` — what the app is + a documentation index (link every page).
   - `Architecture.md` — your project's core domain model + key concepts + deployment (distil from `CLAUDE.md`/`AGENTS.md`, don't copy verbatim); include a Mermaid diagram. *(In the reference project this covered the BOM model, resident portioning, and computed views — substitute your own concepts.)*
   - `Reference-Components.md` (or per-area, e.g. `Reference-Components-<Area>.md`) — react-docgen output + prose.
   - `Reference-Hooks.md`, `Reference-API.md`, `Reference-Lib.md`, `Database-Schema.md`.
   - `Page-Anatomy.md` — **how each screen works end-to-end**: a shared-loop flowchart + per-UI Mermaid sequence diagrams of the UI→hook→API→ORM→DB round trip, with file links and "where to make changes". The Diátaxis *explanation* complement to the reference pages; highest-leverage for onboarding/throughput. Trace each screen from real code (see `references/doc-generation.md` → "Page Anatomy").
   - **Team pages** (Diátaxis *how-to* + *explanation*, for humans not code) — `Getting-Started.md` (fresh-clone → running localhost) and `Skill-Inventory.md` (the competency matrix a teammate needs). Unlike the Reference pages, these are **hand-authored prose with stamped fact-blocks**: `scripts/gen-team-pages.mjs --scaffold <wiki>` writes a starter page, you fill the prose, and re-running it (no flag) regenerates only the `<!--cr:prereqs/scripts/env/stack-->` markers from `package.json` + `.env.example` so commands, env vars, and stack versions never drift. Run it on every publish (before `linkify-wiki`), the same way `stamp-codehealth.mjs` keeps the dashboard current. See `references/doc-generation.md` → "Team pages".
   - `_Sidebar.md` (hand-built nav) + `_Footer.md` — regenerate every publish.
4. Each generated page starts with an HTML marker `<!-- generated by /code-readability — edits will be overwritten -->` so hand-written pages are never clobbered. **Before overwriting any page, confirm it carries that marker**; if a same-named page exists without it, surface it and ask rather than overwrite.
5. **Cross-reference to source:** run `scripts/linkify-wiki.mjs <repo-root> <wiki-dir> https://github.com/<owner>/<repo>/blob/main` so every backtick file/script mention links to its code on GitHub (idempotent; skips code fences / existing links / non-files). Add `--all` to also cross-reference hand-authored pages (default: only our `/code-readability`-marked pages).
6. Commit + push: `git -C <wiki> add . && git -C <wiki> commit -m "docs: regenerate API reference (/code-readability)" && git -C <wiki> push origin master`.
7. Report the published page URLs.

---

## Phase 5 — Team pages (`team` mode)

The Reference / Page-Anatomy pages document the **code**; the Team pages document the **team** — written for humans, not extracted from symbols. Two pages, both *hand-authored prose with repo-stamped fact-blocks* (the inverse of the generated reference pages):

- **`Getting-Started.md`** (Diátaxis *how-to*) — fresh `git clone` → running localhost: prerequisites, env config, dev commands, troubleshooting.
- **`Skill-Inventory.md`** (Diátaxis *explanation*) — a competency matrix (technology, design patterns, database, frontend, Agile/delivery) with proficiency targets (Aware / Working / Fluent) and "learn from" links into the repo + wiki.

`scripts/gen-team-pages.mjs` owns four marker regions — the same stamp mechanism as the CodeHealth badge — so the factual bits can't drift:

| Marker | Source | Page |
|---|---|---|
| `<!--cr:prereqs-->` | `engines.node` / `.nvmrc` + `packageManager` | Getting-Started |
| `<!--cr:env-->` | parsed `.env.example` (var · example · grouping comment) | Getting-Started |
| `<!--cr:scripts-->` | every `npm run` target in the root `package.json` | Getting-Started |
| `<!--cr:stack-->` | signal deps + versions scanned across all `package.json` | Skill-Inventory |

**Sub-modes:**

- **`team scaffold`** — first-time setup. Resolve + clone the wiki (Phase 4 step 1–2), then `node scripts/gen-team-pages.mjs <wiki> --scaffold` writes starter pages (prose template + markers) for any that don't exist and stamps the fact-blocks. **Then fill the `<!-- TODO -->` prose** from the project: the accounts/services a dev needs, the run command + ports, the real troubleshooting list, and the matrix rows (pull design-patterns from `CLAUDE.md`/`AGENTS.md`, DB skills from the schema, frontend from the component library, Agile from the project board). Add the pages to `_Sidebar.md` + `Home.md` under a **Team** group, linkify, and publish (Phase 4 step 5–7).
- **`team stamp`** (default for `team`) — refresh only. `node scripts/gen-team-pages.mjs <wiki>` regenerates the four marker regions in the existing pages and leaves prose untouched (idempotent). Run it before `linkify-wiki` on every publish, and wire it into the same weekly job that stamps CodeHealth so onboarding never lists a command that no longer exists.

**Drift model:** facts are stamped from the repo (auto-fresh); prose is hand-maintained (reviewed when the stack or architecture changes). Config knobs: `CR_PKG`, `CR_ENV_EXAMPLE`, `CR_REPO_ROOT` (all default to repo root). `.gitignore`'d `.claude/`? Commit a copy of `gen-team-pages.mjs` into the repo's tracked `scripts/` so CI can run it (see "Configure for your project").

---

## TSDoc standard (summary — full guide in `references/comment-style.md`)

- Every **exported** symbol gets a `/** */` summary. First sentence is a noun-phrase that stands alone in an autocomplete popup.
- **Props/fields** are documented on the *type member*, not in the summary — that's what react-docgen-typescript and IDE quick-info surface.
- Use the tags that add value: `@param`, `@returns`, `@example`, `@remarks`, `@see`, `@throws`, `@defaultValue`, `@deprecated`. Skip ceremony tags that restate the signature.
- `@example` blocks are fenced ```tsx and must compile in spirit (real prop names, real imports).
- Keep the codebase's **"why-not-what" block comments** for non-obvious logic — they are the highest-value comments and AI's best context. TSDoc complements them; it doesn't replace them.
- **Never** add `prop-types` / `PropTypes`. In TS the interface is the contract; document it with TSDoc.

---

## Quality rubric (gate before declaring a file done)

- [ ] Every exported symbol has a TSDoc summary that reads well in an IDE hover.
- [ ] Every component prop / type field has a one-line description.
- [ ] Public components & hooks have a real, copy-pasteable `@example`.
- [ ] Non-obvious logic has a "why" comment; obvious mechanics are not over-commented.
- [ ] Comments state intent + invariants + gotchas (the AI-context test: could a model use this correctly from the comment alone?).
- [ ] `lint`, `type-check`, `test` green; non-comment diff empty.

## Don'ts
- No PropTypes (TS project).
- No behavior changes, renames, or reordering under the banner of "readability".
- No restating the obvious (`// the name` over `name`).
- No overwriting hand-authored Wiki pages (marker check).
- Don't invent examples — pull from real call sites.

## Files
| File | Purpose |
|---|---|
| `SKILL.md` | This file — modes + workflow |
| `references/comment-style.md` | The TSDoc house style: rules + good/bad examples |
| `references/doc-generation.md` | Hybrid pipeline: tool commands, page layout, wiki publish |
| `scripts/extract-docs.mjs` | `react-docgen-typescript` → component-doc JSON/Markdown |
| `scripts/wiki-slug.mjs` | Canonical GitHub heading-anchor slug (`ghSlug`) — use for every `[text](#anchor)` link |
| `scripts/gen-schema-page.mjs` | Generate the Database-Schema wiki page from `schema.ts` (table TSDoc + parsed columns) |
| `scripts/gen-team-pages.mjs` | Scaffold + stamp the Team pages (Getting-Started, Skill-Inventory): regenerates the `cr:` fact-blocks (prereqs, scripts, env, stack) from `package.json` + `.env.example` |
| `scripts/linkify-wiki.mjs` | Cross-reference wiki pages → link backtick file mentions to source on GitHub (publish step) |
| `README.md` | Overview + setup |
