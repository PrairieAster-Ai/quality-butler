# Changelog

All notable changes to this repo are documented here. Format follows
Keep a Changelog; versioning is Semantic Versioning.

## [0.2.4] — 2026-07-14

Documentation reorganization + a consistency pass across the repo, the vendored skills, and the
wiki. No behavioral change to the agent.

### Changed

- **Documentation moved to the GitHub Wiki.** `INSTALL.md`, `docs/*`, and the blog were migrated
  to the [project Wiki](https://github.com/PrairieAster-Ai/quality-steward/wiki) and removed from
  the repo; the README is now a slim landing page pointing there. Functional files (the agent def,
  the six skills' `SKILL.md` + references, `.github` templates) and the community-health files
  (`CONTRIBUTING`, `SECURITY`, `CODE_OF_CONDUCT`, `CHANGELOG`) stay in the repo.
- **Prompt-driven install/usage docs.** The README quickstart and the wiki Installation/Usage pages
  are now copy-paste Claude Code prompts rather than hand-run shell commands.
- **New wiki page: Generated Documentation** — what living docs, dashboards, and onboarding pages
  (Getting-Started, Skill-Inventory) the steward generates for a watched project and how they stay
  stamped from source.

### Fixed

- **Skill-doc consistency:** code-health's `package.json` alias examples now use the vendored
  `.claude/skills/` path (were `~/.claude/` only) and list the new `agnostic-report` /
  `portfolio-report` scripts; security-audit's README install snippets point at this repo (were the
  old `claude-code-skills` repo) and the `owasp-security` companion is de-linked (not bundled); the
  security-audit verifiers note now states the `references/verifiers/` prompts don't ship yet.
- **Terminology:** standardized the finding classification on "non-trivial" (the workflow header
  comments, the GitLab CI example, and the CHANGELOG still said "risky").

## [0.2.3] — 2026-07-13

### Fixed

- Clarify the trend-chart title delta as `(Δ …)` instead of a bare `(0)`.

## [0.2.2] — 2026-07-13

### Fixed

- **Run the metric reading and self-metrics as deterministic workflow steps**, not agent
  discretion. A live sweep on nearestniceweather revealed the agent could skip the code-health
  roll-up and `steward-metrics.mjs`, so the `trend`/`ch:trend` sparkline and `steward-metrics.tsv`
  weren't produced. New "Take a code-health reading" and "Record steward self-metrics" steps make
  them always fire; the agent now reads the CI-produced reading rather than running it.

## [0.2.1] — 2026-07-13

### Fixed

- **Quality-gate Check Run targets the PR head SHA** (`github.event.pull_request.head.sha`), not
  the ephemeral merge commit — surfaced by the steward reviewing its own v0.2.0 adoption PR.

## [0.2.0] — 2026-07-13

A capability + hardening release addressing a competitive-landscape review. Adds enforcement, a
safer autonomy model, honesty about scope, and OSS hygiene.

### Added

- **Optional quality gate** — a `quality-gate policy` publishes a `quality-steward/gate` GitHub
  Check Run (score delta / new HIGH finding / coverage drop / new circular import) that branch
  protection can require. Turns the steward from advisor into enforcer. (`checks: write` added.)
- **Suggestion policy** — severity floor + per-run cap + aging so findings don't flood.
- **Draft-PR middle gear** — with `fix policy: draft`, skill-validated non-trivial fixes open a
  *draft* PR (never merged) instead of only an issue.
- **Prompt-injection guardrail** — repo/PR/issue content is treated as untrusted data, never
  instructions; injection attempts surface as a `security:prompt-injection` finding, writes are
  confined to the `steward/*` branch.
- **Concrete dismissal loop** — `steward:wontfix` / close-as-not-planned records a finding
  fingerprint (`rule + file:symbol`) so it's never re-raised.
- **Self-effectiveness metrics** — `scripts/steward-metrics.mjs` trends fixes-merged and
  findings open vs. resolved (vendored to `.claude/steward/` at runtime; persisted on
  `steward-state`).
- **Language-agnostic backend** — `code-health/scripts/agnostic-report.mjs` (`scc`) gives non-TS
  repos a partial CodeHealth; plus `docs/language-support.md` stating scope honestly.
- **Portfolio rollup** — `code-health/scripts/portfolio-report.mjs` aggregates CodeHealth across
  repos.
- **Trend sparkline** — the dashboard gains a `ch:trend` score-over-time chart.
- **Large-repo chunking** — the sweep partitions wide diffs to avoid `error_max_turns`; the
  workflow now restores + persists the durable trend on `steward-state`.
- **CI portability** — `docs/ci-portability.md` + a GitLab CI example
  (`agents/quality-steward.gitlab-ci.yml`).
- **Cost transparency** — the report notes model usage / diff size.
- **Docs** — `docs/features.md` (complete feature reference), `docs/usage.md` (the three use-case
  playbooks), `docs/comparison.md` (competitive positioning).
- **OSS hygiene** — `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue/PR templates.

## [0.1.0] — 2026-07-13

Initial public release. Extracted from the `PrairieAster-Ai/claude-code-skills`
collection into a self-contained repo.

### Added

- **The `quality-steward` agent** (`agents/quality-steward.md`) — an orchestration agent that
  monitors code-quality metrics, auto-fixes safe mechanical issues via a PR, surfaces non-trivial
  findings as issues / inline PR comments, and keeps living docs in sync. Enforces an autonomy
  contract: safe fixes go through a `steward/auto-fix-*` PR (never a direct push to the default
  branch); non-trivial findings are only suggested.
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
