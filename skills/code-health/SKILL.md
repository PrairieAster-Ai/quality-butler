---
name: code-health
description: >-
  Structural code-health metrics, the rolled-up CodeHealth score, and the Code
  Health Dashboard pipeline (Maintainability Index, cyclomatic/cognitive
  complexity, churn×complexity hotspots, coupling/instability, change-coupling,
  duplication, circular imports). Measures + trends + renders; the quality-steward
  composes it. Use to instrument a repo, take a reading, or refresh the dashboard.
---

# Code Health Skill

Owns the **structural-health** concern: how maintainable, well-structured, and
low-risk the code is — measured, trended, and rolled up into one **CodeHealth**
grade and a published dashboard. Bundles repo-agnostic scripts that run against
whatever repo invokes them (config from the repo root).

## Separation of concerns (where this sits)

One dashboard, several producers — each skill owns its dimension:

| Concern | Owner | Feeds the roll-up |
|---|---|---|
| Structural metrics (MI, complexity, hotspots, coupling, change-coupling, duplication, cycles) + **CodeHealth roll-up** + **dashboard render/stamp/trend** | **code-health** (this) | Maintainability, Structure, Resilience, Type & size |
| Docs / TSDoc / wiki publish | **code-readability** | Documentation |
| Coverage / lint / sprint planning | **code-quality** | (Test trend, informational) |
| SAST · secrets · SCA (per-PR + dep advisories) | **security-audit** | Security |

This skill **measures and aggregates**; it does not annotate docs, write tests, or
run the full security toolchain — it reads those signals (doc%, npm-audit counts,
coverage) where they live and rolls them into the score. The `quality-steward`
agent is the orchestrator that runs all four and publishes the dashboard.

## Configure for your project

Add `code-health.config.json` at the repo root (defaults assume a single `src/`):

```json
{
  "dirs": ["apps/web/src"],
  "docDirs": ["apps/web/src/components", "apps/web/src/hooks", "apps/web/src/services",
              "apps/web/src/utils", "apps/web/src/types", "apps/web/src/config"],
  "coverageWorkspaces": ["apps/web"],
  "tsconfig": "apps/web/tsconfig.json",
  "historyDir": "code-health",
  "window": "365 days ago"
}
```

`blobBase` (GitHub file links) is auto-derived from `origin`; override if needed.
`changeCoupling` thresholds and `thresholds.{miGreen,miYellow,dupMinLines}` are
tunable. All output goes to `<historyDir>/*-history.tsv` (the trend) +
`codehealth-stamp.json` (the dashboard facts).

**Install (repo devDeps):** `typescript`, `dependency-cruiser`, `madge`. `eslint`
(complexity), `jscpd`, and `vitest --coverage` are invoked via the repo's existing
toolchain / `npx`.

## Modes

- **`instrument`** — first-time setup in a repo: write `code-health.config.json`,
  add devDeps + `npm run` aliases (see below), run `run-all.mjs` once to seed the
  history TSVs, and create/stamp the `Code-Health-Dashboard` wiki page.
- **`read`** — take a fresh reading: `node <skill>/scripts/run-all.mjs` (all
  producers then the roll-up). Add `--no-write` to print without appending history.
- **`refresh`** — regenerate the dashboard: `run-all.mjs --stamp <wiki>/Code-Health-Dashboard.md <wiki>/Home.md` fills the `<!--ch:*-->` markers.

Suggested `package.json` aliases (point at the global skill dir):

```jsonc
"mi:report":             "node ~/.claude/skills/code-health/scripts/maintainability-report.mjs",
"complexity:report":     "node ~/.claude/skills/code-health/scripts/complexity-report.mjs",
"hotspot:report":        "node ~/.claude/skills/code-health/scripts/hotspot-report.mjs",
"coupling:report":       "node ~/.claude/skills/code-health/scripts/coupling-report.mjs",
"change-coupling:report":"node ~/.claude/skills/code-health/scripts/change-coupling-report.mjs",
"duplication:report":    "node ~/.claude/skills/code-health/scripts/duplication-report.mjs",
"codehealth:report":     "node ~/.claude/skills/code-health/scripts/run-all.mjs"
```

## The CodeHealth roll-up

A 0–100 score (letter grade A–F) over six dimensions, each normalized against
documented anchors then weighted. **Run the producers first** — the roll-up reads
their latest TSV rows; `run-all.mjs` sequences this for you.

| Dimension | Weight | Source |
|---|--:|---|
| Documentation | 20% | doc coverage % |
| Maintainability | 25% | MI health proportion (green + ½·yellow) / files |
| Structure | 20% | circular imports + cross-layer change-coupling |
| Resilience (worst file) | 10% | lowest single-file MI |
| Type & size safety | 15% | `any` count + files > 500 LOC |
| Security (deps) | 10% | npm-audit advisory counts |

Full formulas, bands, and the "why health-proportion not the MI mean" rationale
live in `references/methodology.md`. Grade bands: A ≥ 90 · B 80–89 · C 70–79 ·
D 60–69 · F < 60.

## The dashboard

`Code-Health-Dashboard.md` (wiki) is the single rendering. Hand-authored prose +
`<!--ch:NAME-->…<!--/ch:NAME-->` markers that `stamp-codehealth.mjs` fills from
`codehealth-stamp.json`, so the prose never drifts from the numbers. The marker
stamping + wiki clone/commit/push are the shared **`/wiki-publish`** substrate
(`stamp-codehealth.mjs` delegates to it, prefix `ch`, with an inline fallback so
code-health stays self-contained). Structure:
headline grade → metrics by **business outcome** (risk / throughput / onboarding)
→ detailed views (MI pie, hotspots, coupling) → glossary. Every view ends with
**Improve & ROI**. Mirror the layout in `references/methodology.md`.

## Quality-coverage checklist (steward feature)

`quality-checklist.mjs` is a steward-level tracker that ships here (it reuses this
skill's config + the `/wiki-publish` stamper). It probes the repo — CI workflows,
ESLint config, `package.json`, pre-commit, the code-health history, installed
skills, and (with `--wiki`) published pages — for **every** capability the quality
skills offer, and classifies each ✅ enabled / ⚠️ partial / ❌ gap / ➖ n/a. It exists
to stop audits from forgetting things: a capability that's available but never
turned on is a silent gap (e.g. a metric *measured* but never made a CI **gate**).

```bash
node <skill>/scripts/quality-checklist.mjs --wiki <wiki> --stamp <wiki>/Quality-Coverage.md
```

Writes `<historyDir>/quality-checklist.json` and stamps the `<!--ql:*-->` markers on
the **Quality-Coverage** dashboard. The steward runs it in its weekly document step.

## Trend it (optional)

Schedule the steward (or a `maintainability.yml` workflow) weekly to accumulate the
`*-history.tsv` rows and re-stamp the dashboard, turning a one-time reading into
an early-warning trend.

**Where the trend lives:** the `<historyDir>/*-history.tsv` + stamp JSON are
**generated artifacts — gitignore them on the default branch.** The durable trend
belongs on the steward's `steward-state` branch (the quality-steward workflow
restores it before a run and persists it after), so it survives ephemeral CI
runners without the agent ever pushing to the default branch. Committing the trend
to the default branch instead leaves a snapshot that silently goes stale.

## Don'ts

- Don't annotate docs or write tests here — that's code-readability / code-quality.
- Don't hardcode repo paths in the scripts — everything comes from config.
- Don't stamp a dashboard without running the roll-up first (stale `codehealth-stamp.json`).

## Files

- `scripts/config.mjs` — shared config loader + helpers
- `scripts/{maintainability,complexity,hotspot,coupling,change-coupling,duplication,security,coverage}-report.mjs` — producers
- `scripts/{check-circular-deps,check-doc-coverage}.mjs` — gate-able checks
- `scripts/codehealth-report.mjs` — the roll-up + stamp facts
- `scripts/stamp-codehealth.mjs` — fill dashboard markers
- `scripts/run-all.mjs` — produce everything in order (+ optional `--stamp`)
- `scripts/quality-checklist.mjs` — capability-coverage checklist → Quality-Coverage dashboard
- `references/methodology.md` — formulas, anchors, glossary, dashboard template
