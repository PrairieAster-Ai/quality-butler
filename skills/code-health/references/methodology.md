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
| Structure | 20% | `100 − 25·cycles − %·of coupled pairs that cross a layer` (absolute `5·pairs` below 10 coupled pairs, where the share is too noisy) |
| Resilience (worst files) | 10% | **5th-percentile** file MI (25 → 100, 5 → 0); the minimum is still reported, and still names the file to open |
| Type & size safety | 15% | `any` count (0→100, 30→0) + files>500 LOC, averaged |
| Security (deps) | 10% | `100 − 25·critical − 10·high − 1·moderate − 0.25·low` |

**Why health-proportion, not the MI mean?** Code complexity follows a power law
(most files are trivial), so the MI *mean* is always low and dominated by file
length — it hides the few files that cause real pain
([van Deursen](https://avandeursen.com/2014/08/29/think-twice-before-using-the-maintainability-index/) ·
[arXiv:2307.12082](https://arxiv.org/abs/2307.12082)). CodeScene aggregates the
same way: a weighted **proportion of healthy code** + a separate **lowest-module**
KPI. So Maintainability = "what share of code is in good shape" and Resilience =
"how bad is the tail" — body and tail of the distribution, which a single mean
cannot capture.

**Why the 5th percentile and not the minimum.** A minimum over hundreds of files
is an extreme-value statistic: it reports whichever file happened to land lowest,
so it degrades as a repo grows however healthy the repo is. Worse, refactoring
cannot move it — splitting a dense file yields two files that both land in the
same band. Measured in one repo: 38 files under MI 25 before a split, 38 after.
And because MI is dominated by line count, the file it picks is often not the
complex one — in that same repo a 46-line file at cyclomatic 99 scored *better*
than an 87-line file at cyclomatic 57. The percentile still measures the tail,
which is the point of the dimension, without letting one file speak for it.

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

## Who the dashboard serves (and the encoding it dictates)

The dashboard is a **relay**: the butler produces it → a **product/project manager** (semi-technical,
time-pressured) lifts pieces into a leadership deck → a **non-technical VP/Director** reads a metric
for ~10 seconds inside that deck and never opens a glossary. See the **Audience-Personas** wiki page
for the full personas. The PM needs a *defensible* narrative she can relay near-verbatim; the VP
needs every metric to answer four reflexive questions on its face:

1. **Is it good or bad?** → an explicit ✅/⚠️/❌ verdict + a word, never a bare number.
2. **Which way is it moving?** → direction-of-travel ▲/▼/▬ vs the last reading.
3. **Do I care — does it cost/risk money?** → a plain-language "so what" tied to risk/throughput/onboarding.
4. **Do I need to do anything?** → a clear action + payoff in the ROI block.

Encoding principles that follow: lead with the verdict (number is evidence); group by **business
outcome**, not metric family; attach a **citable benchmark** so a challenged number holds; keep each
block **screenshot-survivable** (self-labeled, meaningful alone in a slide). **Relative
quantification** uses honest yardsticks only — historical trend (Δ vs last reading) + published
thresholds (Microsoft MI ≥20, SonarSource cognitive ≤15, dup <2%). *Never* invent industry
percentiles ("top X% of repos"): there is no such dataset, so the claim is fabricated and collapses
under scrutiny — taking the initiative's credibility with it.

## Dashboard template (layout)

0. **Executive summary** (`ch:exec`, **generated**) — a screenshot-survivable headline a VP can
   repeat verbatim: `🩺 CodeHealth: <grade> · <score>/100 — <improving|slipping|steady>` + a plain
   verdict sentence, the overall Δ, the one thing to watch, and the top strength. Placed **first**,
   above the badge.
1. **Headline** — `🩺 CodeHealth — <grade> · <score>/100` (`ch:badge`) + the weighted bar chart.
2. **Metrics by business outcome** (`ch:outcomes`, **generated**) — 🛡️ Lower risk from change ·
   🚀 Higher throughput · 🧑‍💻 Lower key-person risk. Each dimension is auto-placed under the outcome
   it drives, rendered as `<verdict icon> <plain name> — <word> <Δ>. <so-what>. <raw evidence · benchmark>`.
   This section is now **produced by `codehealth-report.mjs`**, not hand-authored.
3. **Detailed views** — MI-band pie, hotspot table, coupling/instability bars,
   change-coupling pairs, security.
4. **Improve & ROI** (`ch:roi`, **generated**) — the two lowest dimensions → the action → the payoff.
5. **Glossary & methodology** — a condensed version of this file + reproduce commands.

Markers the stamp fills: `ch:exec ch:outcomes ch:roi ch:badge ch:chart ch:trend ch:pie ch:files
ch:loc ch:green ch:yellow ch:red ch:doc_pct ch:security ch:mi_mean ch:hotspots ch:top_hotspot
ch:hotspot_table ch:fanout ch:pairs ch:cross_layer ch:cc_mean ch:cc_max ch:fn_count
ch:fn_over15 ch:dup`. `ch:exec` / `ch:outcomes` / `ch:roi` are the generated interpretation layer
(above). `ch:trend` is a score-over-time chart (Mermaid `xychart-beta` line of the last ~12
`codehealth-history.tsv` readings; Unicode-sparkline fallback, or an "insufficient history" note
with <2 readings). The stamper is tolerant — a page missing the new regions simply keeps them
unfilled, so already-instrumented repos just paste the three regions once and the next refresh fills
them.

## Sources

[Microsoft — MI](https://learn.microsoft.com/en-us/visualstudio/code-quality/code-metrics-maintainability-index-range-and-meaning) ·
[SonarSource — Cognitive Complexity](https://www.sonarsource.com/resources/cognitive-complexity/) ·
[CodeScene — behavioral code analysis](https://codescene.com/product/behavioral-code-analysis) ·
[Package metrics (coupling/instability)](https://en.wikipedia.org/wiki/Software_package_metrics) ·
[Think twice about the MI](https://avandeursen.com/2014/08/29/think-twice-before-using-the-maintainability-index/)
