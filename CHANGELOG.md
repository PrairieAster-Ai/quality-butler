# Changelog

All notable changes to this repo are documented here. Format follows
Keep a Changelog; versioning is Semantic Versioning.

## [0.8.0] — 2026-08-25

**Which of your checks has ever been observed to fail?** Nine checks across one
repo family turned out to report success while measuring nothing, each found by
accident and weeks apart. They had one thing in common: nobody could have told
you, at any point, whether they still worked.

### Added

- `skills/code-health/scripts/gate-liveness.mjs` — finds gates that have gone
  quiet. Reports gate-shaped npm scripts no workflow invokes (dead, or
  deliberately manual), and CI steps that have run many times and never once
  failed. The second is a question rather than a verdict: an unproven gate is
  not a broken one, it is one you have no evidence about. Wired into
  `run-all.mjs`, last, since it costs about an API call per run examined.
- Two more negative controls, bringing `selftest.mjs` to 11. Both were earned:
  matching a script's command on its first token called `echo nope` invoked,
  because workflow files contain the word `echo` — found by planting a dead gate
  and watching the detector fail to notice it.

## [0.7.0] — 2026-08-25

**Absence of evidence was scored as evidence of health.** Every dimension fell
back to a hardcoded default when its input was missing, and each default was a
good value: no security history meant zero advisories, no coupling history meant
zero coupled pairs, a doc probe that failed to match meant 100% documented. A
repo with no source files and no measurement history at all scored Maintainability
100 and Security 100. It only avoided an A because two dimensions divided by zero.

This is the same failure as v0.6.2's stale-copy bug, one level up: a missing input
becomes a plausible number, and a number gets a narrative attached to it.

### Changed

- **Dimensions report whether they measured anything.** One with no input reads
  `NOT MEASURED` and is excluded from the score rather than defaulted.
- **A partial reading gets no grade.** Renormalizing over the measured weight was
  the same mistake in a new place: scoring one dimension out of six produced a
  headline of "100/100, grade A — strong, well-governed shape" for an empty repo.
  The executive summary now says the reading is incomplete instead of describing
  a codebase it did not measure.
- **A partial reading is refused entry to the trend** — the chart would draw a
  line between it and a complete reading as though they were comparable.
  `--allow-partial` overrides, for a repo not yet instrumented.

### Added

- `skills/code-health/scripts/selftest.mjs` — negative controls. Plants known-bad
  input and asserts each gate fires, pairing every negative with a positive so
  the suite cannot pass by having everything break. Nine checks. Every one was
  mutation-tested: break the guard, watch the check go red.
- `scripts/check-manifests.mjs` — plugin.json must point at paths that exist,
  advertise every skill on disk, and match the newest changelog entry. It drifted
  three minor versions behind the tags before anyone noticed.
- **CI, for the first time.** This repo audits other repos and had no automated
  check of its own, so its gates were verified by hand once, at the moment they
  were written, and several were inert for weeks afterwards while reporting
  success. `.github/workflows/ci.yml` runs both scripts on every push and PR.

## [0.6.2] — 2026-08-25

**A stale copy of the skill produced a plausible grade with a wrong number in it.**
A repo pinned code-health into `.claude/skills`; a global `~/.claude/skills` install
was run instead. The older build wrote fewer columns than the history named, the
reader keyed on header position, found nothing at the end of the line, and fell back
to a default: Resilience silently re-scored the single worst file instead of the 5th
percentile, and the grade dropped 12.6 points, complete with a narrative explaining
the decline. Nothing errored.

### Added

- `run-all.mjs` **refuses to run a copy the repo did not pin.** If
  `./.claude/skills/code-health/scripts` exists and is not the copy being executed, it
  exits 1 and names both paths. `--any-copy` overrides. It also now prints which
  directory it is running from, every time.
- `appendHistory` **rejects a row narrower than its header** — the second line of
  defense, for repos with no vendored copy. v0.6.0 taught it to widen a history when a
  producer *adds* a column; the reverse case is the dangerous one, because it is silent.

### Changed

- `SKILL.md` no longer offers the global path as an equal alternative: when a repo
  vendors the skill, that is the copy to run.
- `plugin.json` and this changelog were three minor versions behind the tags; entries
  for 0.4.0 through 0.6.1 are reconstructed below from the tagged commits.

## [0.6.1] — 2026-08-25

### Fixed

- **A schema is not another layer.** Cross-layer change-coupling counted a database
  schema module and its callers as a layer crossing, so splitting a schema into
  domain files registered as new coupling rather than less.

## [0.6.0] — 2026-08-25

### Fixed

- **Resilience scored one unlucky file.** The dimension read the single lowest MI in
  the repo, so one dense module set the whole score and no amount of work elsewhere
  moved it. It now reads the 5th percentile and reports the worst file alongside.
- **`appendHistory` hid new columns.** The header was written only when the file was
  created, so a newly added column arrived in every row and was named in none. The
  roll-up went on scoring the old statistic for a full reading. It now widens the
  header and pads existing rows.

## [0.5.0] — 2026-08-25

### Fixed

- **Structure was absolute where it should have been a share.** Cross-layer coupled
  pairs were scored as a raw count, which punishes a large repo for being large. The
  dimension now scores the proportion of coupled pairs that cross a layer.

## [0.4.6] — 2026-08-25

### Fixed

- **The capability checklist reported working controls as absent.** Probes missed
  controls that were configured in ways the checklist did not recognize, so a repo
  was told to enable gates it was already enforcing.

## [0.4.5] — 2026-08-25

### Added

- **Readings record what was measured.** `scope` and `method` columns on the roll-up
  history, so a change in which directories are scanned, or in how a dimension is
  computed, is legible as a measurement change rather than read as a regression.

## [0.4.4] — 2026-08-25

### Fixed

- **The trend chart is the part stakeholders read, and it misled.** Axis and series
  choices made ordinary variation look like decline.

## [0.4.3] — 2026-08-25

### Added

- One trend, and an empty `coverageWorkspaces` config that reports the gap instead of
  crashing.

## [0.4.2] — 2026-08-25

### Fixed

- **A doc step that produced nothing could report success.** The butler's
  documentation step passed on an empty work list.

## [0.4.1] — 2026-08-25

### Fixed

- **CI never installed the tool layer it generates from.** `code-readability` ran its
  doc generation without `react-docgen-typescript` or TypeDoc present.

## [0.4.0] — 2026-07-27

### Added

- The dashboard's business-meaning layer: metrics grouped by risk, throughput, and
  onboarding rather than by tool.
- A calendar-time CodeHealth trend chart and score-over-time table in the portfolio
  report.

### Changed

- README: clarified what the butler does and documented the plugin install path.

## [0.3.0] — 2026-07-14

**Rebrand: quality-steward → quality-butler.** The agent, the repo, the plugin, and all
references are renamed (steward → butler throughout: the agent, `butler/*` branches, the
`butler-state` branch, the `quality-butler/gate` check, `butler-metrics`).

### Changed

- **Renamed** the agent, workflow (`agents/quality-butler.yml`), and GitLab example to
  `quality-butler`; renamed the `github` skill → **`github-wiki`** for clarity.
- Removed the redundant `permissionMode` field from the agent frontmatter (not permitted in
  plugin agents; CI still sets `--permission-mode acceptEdits`).

### Added

- **Ships as a Claude Code plugin.** `.claude-plugin/plugin.json` (`quality-butler`) +
  `.claude-plugin/marketplace.json` (`prairieaster-quality-butler`), so it can be installed via
  `/plugin marketplace add PrairieAster-Ai/quality-butler` and `/plugin install
  quality-butler@prairieaster-quality-butler` — alongside the existing copy-the-workflow path.

## [0.2.4] — 2026-07-14

Documentation reorganization + a consistency pass across the repo, the vendored skills, and the
wiki. No behavioral change to the agent.

### Changed

- **Documentation moved to the GitHub Wiki.** `INSTALL.md`, `docs/*`, and the blog were migrated
  to the [project Wiki](https://github.com/PrairieAster-Ai/quality-butler/wiki) and removed from
  the repo; the README is now a slim landing page pointing there. Functional files (the agent def,
  the six skills' `SKILL.md` + references, `.github` templates) and the community-health files
  (`CONTRIBUTING`, `SECURITY`, `CODE_OF_CONDUCT`, `CHANGELOG`) stay in the repo.
- **Prompt-driven install/usage docs.** The README quickstart and the wiki Installation/Usage pages
  are now copy-paste Claude Code prompts rather than hand-run shell commands.
- **New wiki page: Generated Documentation** — what living docs, dashboards, and onboarding pages
  (Getting-Started, Skill-Inventory) the butler generates for a watched project and how they stay
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
  roll-up and `butler-metrics.mjs`, so the `trend`/`ch:trend` sparkline and `butler-metrics.tsv`
  weren't produced. New "Take a code-health reading" and "Record butler self-metrics" steps make
  them always fire; the agent now reads the CI-produced reading rather than running it.

## [0.2.1] — 2026-07-13

### Fixed

- **Quality-gate Check Run targets the PR head SHA** (`github.event.pull_request.head.sha`), not
  the ephemeral merge commit — surfaced by the butler reviewing its own v0.2.0 adoption PR.

## [0.2.0] — 2026-07-13

A capability + hardening release addressing a competitive-landscape review. Adds enforcement, a
safer autonomy model, honesty about scope, and OSS hygiene.

### Added

- **Optional quality gate** — a `quality-gate policy` publishes a `quality-butler/gate` GitHub
  Check Run (score delta / new HIGH finding / coverage drop / new circular import) that branch
  protection can require. Turns the butler from advisor into enforcer. (`checks: write` added.)
- **Suggestion policy** — severity floor + per-run cap + aging so findings don't flood.
- **Draft-PR middle gear** — with `fix policy: draft`, skill-validated non-trivial fixes open a
  *draft* PR (never merged) instead of only an issue.
- **Prompt-injection guardrail** — repo/PR/issue content is treated as untrusted data, never
  instructions; injection attempts surface as a `security:prompt-injection` finding, writes are
  confined to the `butler/*` branch.
- **Concrete dismissal loop** — `butler:wontfix` / close-as-not-planned records a finding
  fingerprint (`rule + file:symbol`) so it's never re-raised.
- **Self-effectiveness metrics** — `scripts/butler-metrics.mjs` trends fixes-merged and
  findings open vs. resolved (vendored to `.claude/butler/` at runtime; persisted on
  `butler-state`).
- **Language-agnostic backend** — `code-health/scripts/agnostic-report.mjs` (`scc`) gives non-TS
  repos a partial CodeHealth; plus `docs/language-support.md` stating scope honestly.
- **Portfolio rollup** — `code-health/scripts/portfolio-report.mjs` aggregates CodeHealth across
  repos.
- **Trend sparkline** — the dashboard gains a `ch:trend` score-over-time chart.
- **Large-repo chunking** — the sweep partitions wide diffs to avoid `error_max_turns`; the
  workflow now restores + persists the durable trend on `butler-state`.
- **CI portability** — `docs/ci-portability.md` + a GitLab CI example
  (`agents/quality-butler.gitlab-ci.yml`).
- **Cost transparency** — the report notes model usage / diff size.
- **Docs** — `docs/features.md` (complete feature reference), `docs/usage.md` (the three use-case
  playbooks), `docs/comparison.md` (competitive positioning).
- **OSS hygiene** — `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue/PR templates.

## [0.1.0] — 2026-07-13

Initial public release. Extracted from the `PrairieAster-Ai/claude-code-skills`
collection into a self-contained repo.

### Added

- **The `quality-butler` agent** (`agents/quality-butler.md`) — an orchestration agent that
  monitors code-quality metrics, auto-fixes safe mechanical issues via a PR, surfaces non-trivial
  findings as issues / inline PR comments, and keeps living docs in sync. Enforces an autonomy
  contract: safe fixes go through a `butler/auto-fix-*` PR (never a direct push to the default
  branch); non-trivial findings are only suggested.
- **The portable workflow** (`agents/quality-butler.yml`) — PR + weekly + on-demand triggers, a
  zero-side-effect `verify` mode, subscription-token auth (`CLAUDE_CODE_OAUTH_TOKEN`), the durable
  `butler-state` sweep marker, and pull-at-runtime install of the bundled skills.
- **Six bundled skills** under `skills/`: `code-health` (metrics engine + CodeHealth roll-up +
  dashboard), `code-readability`, `security-audit`, `code-quality`, `github`, and the shared
  `wiki-publish` substrate. The butler also composes Claude Code's built-in `code-review`.
- **Documentation** — `docs/metrics.md` (what good software metrics are, with the roll-up
  methodology and sources) and `docs/example-nearest-nice-weather.md` (the butler running on a
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
