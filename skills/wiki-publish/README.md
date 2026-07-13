# wiki-publish

The **shared GitHub-Wiki publishing substrate** — the common layer beneath
`/code-readability` (doc pages) and `/code-health` (dashboard). It owns *how*
generated facts reach the wiki and stay current, not *what* the content is.

## Why it exists

Both doc producers were reimplementing the same two things:
1. **Marker stamping** — filling `<!--PREFIX:NAME-->…<!--/PREFIX:NAME-->` regions
   so prose can't drift from facts (`code-health` used `ch:`, `code-readability`
   uses `cr:`).
2. **Wiki git plumbing** — the SSH-only clone/commit/push, and not clobbering
   hand-authored pages.

`wiki-publish` factors both out so each producer just emits pages + a facts JSON.

## Scripts

| Script | Does |
|---|---|
| `scripts/stamp.mjs <facts.json> <prefix> <file.md>...` | generic marker fill (any prefix) |
| `scripts/wiki-repo.mjs url <repo>` | derive the `…/<repo>.wiki.git` SSH URL |
| `scripts/wiki-repo.mjs clone <wiki-url> <dest>` | clone the wiki |
| `scripts/wiki-repo.mjs guard <marker> <page.md>...` | refuse to overwrite a hand-authored page |
| `scripts/wiki-repo.mjs push <wiki-dir> "<msg>"` | add/commit/push (no-op if clean) |

## Consumers

- **`/code-health`** — `stamp-codehealth.mjs` delegates to `stamp.mjs` (prefix `ch`),
  falling back to inline stamping if `wiki-publish` isn't installed.
- **`/code-readability`** — team-page (`cr:`) stamping + the publish flow.
- **`quality-steward`** — composes it in the "document" step.

See `SKILL.md` for the publish protocol and the marker convention.
