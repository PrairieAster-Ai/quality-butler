# Usage guide: the three use cases

The steward does one job — keep quality visible and maintained — but you adopt it at three
different points in a project's life. This guide is the step-by-step for each. All three assume
you've done the one-time [installation](../INSTALL.md) (copy the workflow, add the
`CLAUDE_CODE_OAUTH_TOKEN` secret, point the stack steps at your toolchain). They are not mutually
exclusive — most teams start with #1, then leave #2 and #3 running permanently.

For what each capability does, see the [feature reference](features.md); for what each metric
means, see [the metrics reference](metrics.md).

---

## Use case 1 — Onboard an existing codebase: find and pay down technical debt

**Goal:** take a repo that has accumulated debt from "we're not sure how bad it is" to a graded
baseline, an automatic first cleanup, and living documentation — in days, not a quarter.

### Steps

**1. Instrument the metrics.** Add a `code-health.config.json` at the repo root pointing at your
source dirs, install the analysis dev-dependencies, and take the first reading to seed the trend:

```jsonc
// code-health.config.json
{
  "dirs": ["src"],                 // or ["apps/web/src"] for a monorepo
  "docDirs": ["src/components", "src/hooks", "src/services", "src/utils"],
  "coverageWorkspaces": ["."],
  "tsconfig": "tsconfig.json",
  "historyDir": "code-health"
}
```

```bash
npm i -D typescript dependency-cruiser madge
node skills/code-health/scripts/run-all.mjs      # seeds the history TSVs + a baseline grade
```

**2. Take the baseline reading.** Run the steward on-demand for a first full pass:

```bash
gh workflow run quality-steward.yml -f mode=steward
```

The first sweep is bounded (it defaults to `HEAD~20` when there's no prior state) so it completes
within the turn budget. Widen it only if you want a deeper first look.

**3. Read what it produced.** You get four things:
- a **CodeHealth grade** (your baseline — the number every later reading is compared against);
- a **hotspot ranking** — the files that are both complex *and* frequently changed, i.e. where a
  refactor pays back fastest (fix these first, not the scariest-looking file);
- a **safe auto-fix PR** (`steward/auto-fix-*`) — dead code, formatting, lint, documentation
  comments, already done and green;
- **issues** for the non-trivial findings — correctness and security items it won't touch, each
  with `file:line`, why it matters, and a proposed fix.

**4. Merge the safe PR, triage the issues.** The PR is behavior-preserving by construction (green
gate + empty non-comment diff), so it's a fast review. Drop the issues into your backlog.

**5. Generate the documentation you never had time to write:**

```bash
# API reference from your TSDoc + the health dashboard, published to the wiki
/code-readability generate && /code-readability publish
/code-readability team scaffold      # Getting-Started + Skill-Inventory onboarding pages
```

**What you get:** a defensible starting grade, a cleanup already underway, a ranked debt-paydown
list, and living docs + a dashboard — without a dedicated "quality sprint."

---

## Use case 2 — Wire it into CI/CD: define and maintain a quality standard

**Goal:** make your quality bar continuous and enforced, so new work meets the standard *as it's
written* and the standard only tightens.

### Steps

**1. Keep the `pull_request` trigger** (it's on by default). On every PR the steward runs a
**differential** correctness + security review of the diff, posts findings as **inline PR
comments**, and opens a safe auto-fix PR for mechanical issues. Nothing here touches your default
branch.

**2. Define your green-gate** in the workflow's `PROJECT_CONFIG` — the commands that must stay
green for an auto-fix to be allowed:

```
green-gate: `npm run lint && npm run type-check && npm test`
```

**3. Turn metrics into gates.** A metric that's measured but never enforced is a silent gap. Add
the gate-able checks as CI steps that *fail the build*, and set thresholds in
`code-health.config.json`:

```bash
node skills/code-health/scripts/check-circular-deps.mjs     # exit non-zero if any cycle exists
node skills/code-health/scripts/check-doc-coverage.mjs      # exit non-zero below the doc-coverage floor
```

Add a cognitive-complexity lint gate (`sonarjs/cognitive-complexity: ["error", 15]`) and a
coverage floor in your test runner. These are the gates the [metrics reference](metrics.md)
marks as ratchet-able.

**4. Ratchet over time.** Set each threshold just below today's value, then tighten it as the
steward pays debt down — so quality can only improve, never regress. (On the reference project
this is exactly what PRs #327/#328 did: "close the enforcement-gate gaps" and "tighten the
complexity ratchets.")

**5. Require the checks in branch protection** so a PR can't merge below the bar.

> **Fork-PR note:** on a public repo, GitHub withholds secrets from outside-fork PRs, so the
> steward's review won't run there. Keep the trigger as `pull_request` — never
> `pull_request_target`, which would expose your token to untrusted fork code.

**What you get:** a quality standard that's enforced on every change, not aspirational — with the
bar visibly ratcheting upward.

---

## Use case 3 — Keep it running: long-term monitoring and up-to-date docs

**Goal:** standing maintenance. Catch decay early, keep the trend honest, and keep docs and
onboarding current as the code evolves — with no recurring human effort.

### Steps

**1. Keep the weekly `schedule` trigger** (Mondays 07:00 UTC by default). Each sweep reviews the
commits merged since the last sweep — a real diff for the differential review skills — and:
- recomputes the CodeHealth score and **compares it to the previous reading**, so a **regression
  is the headline** (the delta, not the raw number);
- opens **issues** for new non-trivial findings and a **safe auto-fix PR** for mechanical ones;
- **refreshes the docs and dashboard**, and re-stamps the onboarding pages (`/code-readability
  team stamp`) so their facts never drift.

**2. Confirm the durable trend is wired.** The trend and the last-swept commit live on the
auto-created `steward-state` branch, restored before each run and persisted after — so the trend
survives ephemeral CI runners without the agent ever pushing to your default branch. No action
needed; just don't delete that branch.

**3. Read the weekly report.** Each run ends with a tight summary: detected mode, metric deltas,
the auto-fix PR link, the issues raised, and docs refreshed. That summary is your standing quality
signal.

**4. Triage — and it remembers.** Dismiss a finding once and the agent records it in `project`
memory so the next sweep won't re-raise it. It dedupes against open `steward/*` PRs and matching
issues, so re-runs never pile up duplicates.

**5. Watch the trend earn its slope.** One reading is a location; the value compounds as the
weekly readings accumulate into a curve you can point at in a review.

**What you get:** quality as a background condition instead of a periodic fire drill — regressions
caught the week they appear, docs that never drift, and onboarding that stays true to the code.

---

## Which triggers power which use case

| Use case | Trigger | What runs |
|---|---|---|
| 1 · Onboard | `workflow_dispatch` (`mode=steward`) | one bounded full pass: baseline + cleanup PR + issues + docs |
| 2 · CI/CD standard | `pull_request` | differential review on the diff → inline comments + safe auto-fix PR |
| 3 · Maintenance | `schedule` (weekly) | sweep since last sweep → trend delta + issues + auto-fix PR + doc refresh |

All three are configured in the single workflow file; enabling one doesn't disable another.
