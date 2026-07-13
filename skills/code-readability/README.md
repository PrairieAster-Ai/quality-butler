# code-readability

A skill that makes a codebase readable for **four readers at once** — humans, IDEs, doc generators (`react-docgen-typescript` / TypeDoc), and AI agents — by enforcing a TSDoc-native comment standard and turning those comments into GitHub Wiki documentation cross-linked to the source.

TypeScript-native: **TSDoc, never PropTypes** (the types already are the prop contract). TypeScript/React/MUI first; also covers HTML (semantic/ARIA), CSS/Sass (KSS/SassDoc), and vanilla JS (JSDoc) — see `references/comment-style.md`.

Project-agnostic: it ships with generic defaults and a small set of env-var knobs, so it works in any TypeScript repo (single-package or monorepo). The worked examples in `SKILL.md` come from the project it was built in (a residential-care menu app) and are illustrative — substitute your own domain.

## When to use

- You want consistent, IDE-friendly doc comments across a TS/React codebase.
- You want generated, always-in-sync API reference docs published to your GitHub Wiki.
- You're onboarding and want a "how each screen works" data-flow map derived from real code.

## Modes

```
/code-readability assess [path]      # score doc-comment coverage + readability gaps (default)
/code-readability annotate <path>    # add/upgrade TSDoc on a target (the only code-editing mode)
/code-readability generate [scope]   # hybrid extract → Markdown in /tmp/cr-docs/
/code-readability publish [scope]    # generate + push to the GitHub Wiki
/code-readability team [scaffold|stamp] # onboarding + skill-inventory pages (prose + repo-stamped facts)
```

`path`/`scope` defaults to the branch's changed files; pass a dir under your source tree (e.g. `src/components`) or `all` for a full pass.

- **assess** — grep/glob coverage scorecard; ranks the files where missing docs cost the most.
- **annotate** — applies the house style (`references/comment-style.md`); comments/formatting only, behavior-preserving (lint/type-check/test must stay green).
- **generate** — *hybrid*: deterministic tool layer (`scripts/extract-docs.mjs` + TypeDoc) for props tables/signatures, plus a model-written prose layer (overviews, real-call-site examples, cross-links, AI-context callouts). Both read the same TSDoc, so they can't drift.
- **publish** — SSH push to `<repo>.wiki.git` (reuses the `/github wiki` flow); never overwrites hand-authored pages (HTML-marker check).
- **team** — maintains the two *human* pages (Getting-Started + Skill-Inventory): hand-authored prose with `<!--cr:…-->` fact-blocks (prereqs, env, scripts, stack) stamped from the repo by `scripts/gen-team-pages.mjs`. `team scaffold` creates them; `team stamp` refreshes the facts. See `SKILL.md` → Phase 5.

## Configure

Set these once for your repo (see `SKILL.md` → "Configure for your project" for the full table). The scripts read them from the environment:

| Env var | Purpose | Default |
|---|---|---|
| `CR_TSCONFIG` | tsconfig used for doc extraction | `tsconfig.json` |
| `CR_SCHEMA` | Drizzle schema path for the schema-page generator | `src/db/schema.ts` |

Other knobs flow in as CLI args: the source globs/dirs you pass to `assess`/`annotate`/`extract-docs.mjs`, and the `<repo-root> <wiki-dir> <blob-base-url>` args to `linkify-wiki.mjs`. The project-specific domain terms to cross-link in generated prose are listed by you (drawn from `CLAUDE.md`/`AGENTS.md`).

## Setup (for generate/publish)

Doc tools aren't project deps; install on first generate (drop `--workspace=<pkg>` if not a monorepo, or target the package that owns your components):

```bash
npm i -D react-docgen-typescript
npm i -D typedoc typedoc-plugin-markdown
```

## Files

| File | Purpose |
|---|---|
| `SKILL.md` | Modes + workflow (the skill prompt) |
| `references/comment-style.md` | TSDoc house style: rules + good/bad examples |
| `references/doc-generation.md` | Hybrid pipeline, page layout, Wiki publishing |
| `scripts/extract-docs.mjs` | `react-docgen-typescript` → component-doc JSON |
| `scripts/wiki-slug.mjs` | Canonical GitHub heading-anchor slug (`ghSlug`) for wiki `[text](#anchor)` links |
| `scripts/gen-schema-page.mjs` | Generate the Database-Schema wiki page from `schema.ts` |
| `scripts/linkify-wiki.mjs` | Cross-reference docs → link backtick file mentions to source on GitHub |
