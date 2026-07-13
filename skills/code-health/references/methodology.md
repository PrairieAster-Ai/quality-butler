# Code Health — methodology & glossary

Formulas, thresholds, and how every number is produced. The dashboard's own
Glossary section should be a condensed version of this.

## CodeHealth score

A 0–100 roll-up, inspired by [CodeScene's CodeHealth](https://codescene.com/product/behavioral-code-analysis)
but fully transparent: each dimension is normalized against documented anchors
(good → 100, poor → 0) via `norm(v, good, bad) = clamp((v−bad)/(good−bad)·100)`,
then weighted. `codehealth-report.mjs` runs **last** (reading the producers' fresh
TSV rows).

| Dimension | Weight | Anchors |
|---|--:|---|
| Documentation | 20% | doc coverage % (100% → 100, 50% → 0) |
| Maintainability | 25% | MI health proportion = (green + ½·yellow) / files (100% → 100, 70% → 0) |
| Structure | 20% | `100 − 25·cycles − 5·cross_layer_pairs` |
| Resilience (worst file) | 10% | lowest single-file MI (25 → 100, 5 → 0) |
| Type & size safety | 15% | `any` count (0→100, 30→0) + files>500 LOC, averaged |
| Security (deps) | 10% | `100 − 25·critical − 10·high − 1·moderate − 0.25·low` |

**Why health-proportion, not the MI mean?** Code complexity follows a power law
(most files are trivial), so the MI *mean* is always low and dominated by file
length — it hides the few files that cause real pain
([van Deursen](https://avandeursen.com/2014/08/29/think-twice-before-using-the-maintainability-index/) ·
[arXiv:2307.12082](https://arxiv.org/abs/2307.12082)). CodeScene aggregates the
same way: a weighted **proportion of healthy code** + a separate **lowest-module**
KPI. So Maintainability = "what share of code is in good shape" and Resilience =
"how bad is the worst file" — body and tail of the distribution, which a single
mean cannot capture.

## Complexity & maintainability

- **Cyclomatic Complexity (McCabe)** — independent execution paths (≈ decision
  points + 1); ≈ minimum test cases. 1–10 simple · 11–15 moderate · 16–20 complex
  · 20+ refactor. Computed from the AST (`maintainability`/`hotspot-report.mjs`)
  and via ESLint's `complexity` rule (`complexity-report.mjs`).
- **Cognitive Complexity (SonarSource)** — penalizes nesting / broken linear flow;
  tracks *readability*, not just testability. Best enforced as a CI gate
  (`sonarjs/cognitive-complexity ≤ 15`).
- **Halstead Volume** — `V = N·log₂(n)` from operator/operand counts; feeds MI.
- **Maintainability Index** —
  `MI = MAX(0, (171 − 5.2·ln(V) − 0.23·CC − 16.2·ln(SLOC)) · 100/171)`
  ([Microsoft](https://learn.microsoft.com/en-us/visualstudio/code-quality/code-metrics-maintainability-index-range-and-meaning)).
  Bands: 0–9 red · 10–19 yellow · 20–100 green. Over-penalizes raw LOC — read as a
  *direction*, not an absolute.

## Structure

- **Coupling / instability** — `dependency-cruiser` per module/folder: Afferent
  (Ca, incoming), Efferent (Ce, outgoing), **Instability** `I = Ce/(Ce+Ca)`
  (0 = stable foundation, 1 = volatile leaf). Healthy systems rise monotonically
  foundation → leaves (Stable-Dependencies Principle).
- **Circular imports** — `madge --circular`; 0 is the gate. Cycles couple modules
  and break tree-shaking.
- **Change coupling** — files repeatedly edited in the same commit (behavioral
  dependency the import graph may miss). Degree = co-changes / min(revisions).
  **Cross-layer** coupling (e.g. web ↔ api) is the smell; within-feature is usually
  fine.
- **Hotspots** — churn × complexity: `revisions(window) × cyclomatic`. The count
  is the top-right quadrant (both above median) — refactor / add tests here first.

## Duplication

`jscpd` token-level clones (≥ `dupMinLines`). Rising duplication is the early
signal a shared helper is overdue. Target < 2%.

## Dashboard template (layout)

1. **Headline** — `🩺 CodeHealth — <grade> · <score>/100` + the weighted bar chart.
2. **Metrics by business outcome** — 🛡️ Lower risk from change · 🚀 Higher
   throughput · 🧑‍💻 Lower onboarding/key-person risk. Each metric sits under the
   outcome it drives, with ✅/⚠️/❌ and *why it's worth money*.
3. **Detailed views** — MI-band pie, hotspot table, coupling/instability bars,
   change-coupling pairs, security.
4. **Every view ends with “Improve & ROI”** — the lowest dimensions + the action
   + the payoff.
5. **Glossary & methodology** — a condensed version of this file + reproduce commands.

Markers the stamp fills: `ch:badge ch:chart ch:pie ch:files ch:loc ch:green
ch:yellow ch:red ch:mi_mean ch:hotspots ch:top_hotspot ch:hotspot_table ch:fanout
ch:pairs ch:cross_layer ch:cc_mean ch:cc_max ch:fn_count ch:fn_over15 ch:dup`.

## Sources

[Microsoft — MI](https://learn.microsoft.com/en-us/visualstudio/code-quality/code-metrics-maintainability-index-range-and-meaning) ·
[SonarSource — Cognitive Complexity](https://www.sonarsource.com/resources/cognitive-complexity/) ·
[CodeScene — behavioral code analysis](https://codescene.com/product/behavioral-code-analysis) ·
[Package metrics (coupling/instability)](https://en.wikipedia.org/wiki/Software_package_metrics) ·
[Think twice about the MI](https://avandeursen.com/2014/08/29/think-twice-before-using-the-maintainability-index/)
