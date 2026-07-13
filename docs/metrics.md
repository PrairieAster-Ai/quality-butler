# What good software metrics are

> The reference behind the steward's **Monitor** step. If you only read one doc to understand
> what the CodeHealth score means and why it's built the way it is, read this one.

Most code metrics fail not because they measure the wrong thing but because of *how* they're
used: a number lands in a CI log, nobody reads it, and it only surfaces when something is already
on fire. A metric earns its place only if it changes a decision. This doc lays out the five
properties that make a metric worth tracking, then documents the specific metrics the
`code-health` skill rolls up into a single **CodeHealth** grade.

## Five properties of a metric worth tracking

**1. It maps to a business outcome, not a vanity of the code.** "Cyclomatic complexity = 14"
means nothing to anyone deciding where to spend an afternoon. "This file changes every week and
is complex enough that every change is a coin-flip" is a *risk* statement someone can act on. The
CodeHealth dashboard groups every metric under the outcome it drives — **lower risk from change**,
**higher throughput**, **lower onboarding / key-person risk** — and states, per metric, *why it's
worth money*.

**2. It's statistically honest about a skewed distribution.** Code complexity follows a power
law: most files are trivial, a few are monstrous. So the *mean* of almost any per-file metric is
dominated by the boring majority and hides the handful of files that actually cause pain. A good
roll-up reports the **shape** — what share of the code is healthy (the body) *and* how bad the
worst file is (the tail) — never a single average that splits the difference and describes
nothing. (See [Why a proportion, not a mean](#why-a-proportion-not-a-mean).)

**3. It's a trend, not a snapshot.** One reading tells you where you are; it can't tell you
whether you're improving or sliding. The steward accumulates a reading every week into a trend
file, so the headline is always a **delta** — "Maintainability down 4 points, duplication up to
2.3%" — which is what actually prompts action. A snapshot committed once and left to rot silently
goes stale and becomes worse than nothing.

**4. It's actionable — it comes with an owner, a fix, and an ROI.** A metric you can't act on is
trivia. Every view on the dashboard ends with an **Improve & ROI** line: the lowest-scoring
dimension, the concrete action that raises it, and the payoff. "Refactor `App.tsx`'s effects into
hooks" beats "complexity is high."

**5. It can become a gate.** The strongest form of a metric is one you can *ratchet*: circular
imports = 0 as a CI gate, cognitive complexity ≤ 15 as a lint rule, coverage that can't drop.
A metric that is *measured* but never *enforced* is a silent gap — the value is available but the
protection isn't turned on. (The steward's quality-coverage checklist exists specifically to
catch that: a capability you have but never enabled.)

## The CodeHealth roll-up

A single **0–100 score with a letter grade (A–F)** over six dimensions. Each dimension is
normalized against documented anchors — `norm(v, good, bad) = clamp((v − bad) / (good − bad) · 100)`
— then weighted. The roll-up is deliberately transparent (every input is a metric you can
reproduce), inspired by CodeScene's CodeHealth
but with the formula fully in the open.

| Dimension | Weight | Anchors (good → 100, poor → 0) |
|---|--:|---|
| **Documentation** | 20% | doc coverage % (100% → 100, 50% → 0) |
| **Maintainability** | 25% | MI health proportion = (green + ½·yellow) / files (100% → 100, 70% → 0) |
| **Structure** | 20% | `100 − 25·cycles − 5·cross_layer_pairs` |
| **Resilience** (worst file) | 10% | lowest single-file MI (25 → 100, 5 → 0) |
| **Type & size safety** | 15% | `any` count (0 → 100, 30 → 0) + files > 500 LOC, averaged |
| **Security** (deps) | 10% | `100 − 25·critical − 10·high − 1·moderate − 0.25·low` |

Grade bands: **A ≥ 90 · B 80–89 · C 70–79 · D 60–69 · F < 60.**

Note the two maintainability dimensions doing different jobs: **Maintainability** (25%) is *what
share of the code is in good shape* — the body of the distribution — while **Resilience** (10%) is
*how bad is the single worst file* — the tail. One number can't capture both, so the roll-up
keeps them separate.

### Why a proportion, not a mean

The Maintainability Index mean is famously misleading: because it's heavily penalized by raw
lines of code and complexity follows a power law, the average is always dragged down by file
length and hides the few files that cause real pain (van Deursen; arXiv:2307.12082). So CodeHealth aggregates the way CodeScene
does: a weighted **proportion of healthy code** plus a separate **lowest-module** KPI. "What
fraction of files are green" is a stable, honest signal; "the average MI" is not.

## The metrics, and what each is for

**Maintainability Index (MI)** — `MAX(0, (171 − 5.2·ln(V) − 0.23·CC − 16.2·ln(SLOC)) · 100/171)`
(Microsoft),
where `V` is Halstead Volume and `CC` cyclomatic complexity. Bands: 0–9 red · 10–19 yellow ·
20–100 green. Over-penalizes LOC, so read it as a **direction**, not an absolute — which is
exactly why the roll-up uses the *proportion green*, not the raw value.

**Cyclomatic Complexity (McCabe)** — independent execution paths (≈ decision points + 1), roughly
the minimum number of test cases. 1–10 simple · 11–15 moderate · 16–20 complex · 20+ refactor.

**Cognitive Complexity (SonarSource)** — penalizes nesting and broken linear flow; tracks
*readability*, not just testability. Best enforced as a CI gate
(SonarSource).

**Coupling & instability** — per module: Afferent (`Ca`, incoming), Efferent (`Ce`, outgoing),
and **Instability** `I = Ce / (Ce + Ca)` (0 = stable foundation, 1 = volatile leaf). Healthy
systems rise monotonically from foundation to leaves (the Stable-Dependencies Principle).

**Circular imports** — cycles couple modules and break tree-shaking; the gate is **0**.

**Change coupling** — files repeatedly edited in the same commit: a *behavioral* dependency the
import graph can miss. **Cross-layer** coupling (e.g. web ↔ api) is the smell worth chasing;
coupling within a feature is usually fine.

**Hotspots (churn × complexity)** — `revisions(window) × cyclomatic`. The files that are both
complex *and* changed often are where bugs concentrate and where a refactor pays back fastest —
refactor and add tests **here first**.

**Duplication** — token-level clones; rising duplication is the early signal that a shared helper
is overdue. Target < 2%.

For the **complete metric table** — every metric measured, the tool or formula behind it, its
thresholds, and which CodeHealth dimension it feeds — see the
[feature reference](features.md#every-metric-it-measures).

## Sources

- Microsoft — Maintainability Index
- SonarSource — Cognitive Complexity
- CodeScene — behavioral code analysis
- Software package metrics — coupling & instability
- van Deursen — Think twice before using the Maintainability Index

For the exact formulas, thresholds, and the dashboard layout, see
[`skills/code-health/references/methodology.md`](../skills/code-health/references/methodology.md).
