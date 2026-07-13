# The steward on a real project: nearestniceweather

This is the quality-steward running unattended on a live repository —
[**PrairieAster-Ai/nearest-nice-weather**](https://github.com/PrairieAster-Ai/nearest-nice-weather),
a Minnesota outdoor-recreation weather app. Every number and PR reference below is real, pulled
from the repo on **2026-07-13**. It's a deliberately modest project — a single maintainer, a few
visitors a month — which is the point: **a mature metrics practice is about the discipline, not
the traffic.**

## The project

A TypeScript + React 18 single-page app (Vite, MUI, a Leaflet map) backed by Vercel serverless
functions, organized as an npm-workspaces monorepo on Node 24. The `code-health` skill measures
about **10.4k LOC across 64 files** in `apps/web/src`; the app is tested with Vitest, Playwright,
and Jest. Over the last 30 days the repo saw **69 commits** — actively developed, and maintained
with heavy bot assistance (Dependabot plus the steward itself).

## The headline: CodeHealth A · 94 / 100

The most recent reading rolls up to an **A (94/100)**. The component breakdown shows exactly the
body-and-tail story the [methodology](metrics.md#why-a-proportion-not-a-mean) is built around:

| Dimension | Weight | Score | What it says |
|---|--:|--:|---|
| Documentation | 20% | **100** | all six configured doc dirs covered |
| Maintainability | 25% | **97.4** | 63 of 64 files green, 1 yellow |
| Structure | 20% | **100** | no circular imports, no cross-layer change-coupling |
| Resilience (worst file) | 10% | **67** | the single worst file sits at MI 18.4 |
| Type & size safety | 15% | **86.7** | a few `any`s / large files |
| Security (deps) | 10% | **100** | 0 advisories |

Note Maintainability (97.4 — the body of the distribution is healthy) sitting well above
Resilience (67 — one file is dragging). A single average would have blurred those into a
meaningless middle; kept separate, they point at a specific file.

**Under the hood** (the metrics that feed those dimensions):

- **Maintainability Index** — 64 files, mean 38.4, min **18.4**; 63 green / 1 yellow / 0 red.
- **Complexity** — 201 functions, mean cyclomatic 4.4, max 18, only **3** functions over CC 15.
- **Duplication** — **1.14%** (5 clones, 122 lines) — under the 2% target.
- **Coupling** — 68 modules, mean instability 30%, max fan-out 13.
- **Change-coupling** — 14 coupled file-pairs over 99 commits, **0 cross-layer**; the tightest is
  `AdManager.tsx ⇄ AdUnit.tsx` (co-change 83% — a real, and reasonable, feature-local coupling).
- **Coverage** — 82.1% statements / 78.2% branches.

### Where to spend the next afternoon: the hotspots

Churn × complexity ranks the files worth refactoring first — high complexity *and* frequently
changed:

| Score | Revisions | Cyclomatic | File |
|--:|--:|--:|---|
| 840 | 60 | 14 | `apps/web/src/App.tsx` |
| 300 | 12 | 25 | `apps/web/src/hooks/usePOINavigation.ts` |
| 272 | 8 | 34 | `apps/web/src/components/ads/AdManager.tsx` |
| 210 | 5 | 42 | `apps/web/src/services/UserLocationEstimator.ts` |
| 200 | 4 | 50 | `apps/web/src/utils/locationEstimationUtils.ts` |

`App.tsx` tops the list not because it's the most complex file (it isn't — CC 14) but because it
changes constantly (60 revisions). That's the churn×complexity insight a static complexity
ranking misses.

## The steward at work

The steward was installed in **PR #311** (merged 2026-06-29) and has run on every PR and every
Monday sweep since — the latest scheduled full sweep completed **2026-07-13**. What it has
actually done splits cleanly along the [autonomy contract](../README.md#the-autonomy-contract):

**Safe, mechanical work → auto-fix PRs it opened and a human merged:**

- **#315** — removed ~350 LOC of dead code (an unused dependency and a stale manager).
- **#314 / #316 / #319** — raised TSDoc coverage across services, components, utils, and config.
- **#317 / #318** — added test coverage for untested services, hooks, and UI components.
- **#322** — instrumented the code-health metrics and wired the weekly CI trend.
- **#324** — refactored `MapContainer`'s effects into hooks, moving the score **B → A (92.7)** —
  a documented, before-and-after improvement on the exact hotspot the metrics flagged.
- **#328** — simplified `useMapPopupNavigation` and tightened the complexity ratchets.

**Risky findings → GitHub issues it filed for a human to decide** (never auto-edited):

- **[#342](https://github.com/PrairieAster-Ai/nearest-nice-weather/issues/342)** *(open, `bug`)* —
  `dev-start.mjs`: a process-group kill gated on the wrong flag.
- **[#343](https://github.com/PrairieAster-Ai/nearest-nice-weather/issues/343)** *(open, `bug`)* —
  `mapPopup.ts`: an unchecked `as number` cast on nullable precipitation that bypasses the
  null-guard used for the sibling fields.

Both were opened by the **2026-07-06 weekly sweep** — textbook examples of the steward correctly
declining to touch logic and instead surfacing it. It also files issues about its *own* pipeline
when it drifts (**#331**, since fixed): the steward is subject to the same review it applies.

**Durable memory across ephemeral runners.** The trend and the last-swept commit live on the
`steward-state` branch (the `code-health/*` history TSVs, `codehealth-stamp.json`, and a
`last-sweep-sha` marker), so each weekly sweep resumes exactly where the last ended — without the
agent ever pushing to the default branch.

## Beyond code health: the app measures itself, too

Structural metrics are only half of a metrics culture. nearestniceweather also instruments its
own **runtime** behavior via product analytics — and this is where the "traffic doesn't matter"
point lands hardest. Despite only a handful of visitors a month, the app emits:

- `purchase_list_generated` — the core product action (a real conversion event to trend).
- `api_request_failed` / `api_request_slow` — self-reported **reliability** telemetry.
- `deploy_version_drift_detected` / `stale_bundle_recovered` — deploy-freshness telemetry that
  catches users stuck on a stale bundle.
- `$web_vitals` and `$exception` — real Core Web Vitals and unhandled errors.

A one-visitor app that measures its own deploy drift, API reliability, and web vitals has a more
mature metrics practice than a high-traffic app that measures none of it. **The maturity is in
the instrumentation, not the numbers.**

## The takeaway

The steward didn't make this a healthy repo by fiat — it made the health *visible and
maintained*: a grade with a trend, a ranked list of where to spend effort next, safe fixes
handled automatically, risky calls left to a human with the evidence attached, and docs that stay
current. That's the difference between *having* metrics and *running on* them.
