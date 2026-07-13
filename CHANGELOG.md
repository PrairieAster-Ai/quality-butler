# Changelog

All notable changes to this repo are documented here. Format follows
Keep a Changelog; versioning is Semantic Versioning.

## [Unreleased]

### Added

- **`docs/features.md`** — a complete feature reference: every mode, command, flag, metric, gate,
  and output across the agent and all six composed skills (code-health, code-review, security-audit,
  code-quality, code-readability, github, wiki-publish).
- **`docs/usage.md`** — step-by-step playbooks for the three use cases (onboard an existing
  codebase; wire into CI/CD; long-term maintenance).
- Cross-links from the README, `metrics.md`, and `technical.md` into the new references.

## [0.1.0] — 2026-07-13

Initial public release. Extracted from the `PrairieAster-Ai/claude-code-skills`
collection into a self-contained repo.

### Added

- **The `quality-steward` agent** (`agents/quality-steward.md`) — an orchestration agent that
  monitors code-quality metrics, auto-fixes safe mechanical issues via a PR, surfaces risky
  findings as issues / inline PR comments, and keeps living docs in sync. Enforces an autonomy
  contract: safe fixes go through a `steward/auto-fix-*` PR (never a direct push to the default
  branch); risky findings are only suggested.
- **The portable workflow** (`agents/quality-steward.yml`) — PR + weekly + on-demand triggers, a
  zero-side-effect `verify` mode, subscription-token auth (`CLAUDE_CODE_OAUTH_TOKEN`), the durable
  `steward-state` sweep marker, and pull-at-runtime install of the bundled skills.
- **Six bundled skills** under `skills/`: `code-health` (metrics engine + CodeHealth roll-up +
  dashboard), `code-readability`, `security-audit`, `code-quality`, `github`, and the shared
  `wiki-publish` substrate. The steward also composes Claude Code's built-in `code-review`.
- **Documentation** — `docs/metrics.md` (what good software metrics are, with the roll-up
  methodology and sources) and `docs/example-nearest-nice-weather.md` (the steward running on a
  real project, with real numbers).
- **Blog post** — `blog/using-ai-to-track-software-metrics.md`.

### Fixed (during extraction)

- Reconciled the composed-skill set across the agent definition and workflow: `code-health` and
  `code-quality` are now named and installed; corrected the prior claim that `code-quality` was
  built into Claude Code (only `code-review` is).
- Vendored the deterministic Python CLIs (`security_audit.py`, `code_quality.py`) into their
  skills so they ship with the bundle; fixed their path references.
- `security-audit`: fixed an undefined-variable bug (`$BASE_REF` → `$BASE`) that stopped the
  convention/false-positive memory files from loading; corrected the exclusion-count doc (21 → 25).
- Genericized private-project references in the bundled skills for public release.
