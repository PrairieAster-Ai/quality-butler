# Good software metrics, and how to actually keep them: putting an AI agent on the job

*How a Claude Code agent turns code-quality metrics from a number nobody reads into a standing
practice — with a real, unremarkable app as the example.*

---

Every engineering org has a graveyard of dashboards. The quality dashboard someone set up with
great enthusiasm in Q1, linked in the team channel twice, and never opened again. The coverage
gate that got bumped down "temporarily." The complexity report that runs in CI and scrolls past
in a log nobody reads. The metrics were never wrong. They just weren't *used* — and an unused
metric is indistinguishable from no metric at all.

That's the real problem with software metrics, and it has almost nothing to do with measurement.
Measuring code is a solved problem: cyclomatic complexity, the Maintainability Index, coupling,
duplication, churn — the formulas are decades old and the tools are free. The hard part has
always been the *upkeep*: taking a reading every week, noticing the trend, deciding what's worth
fixing, actually fixing the cheap stuff, and keeping the docs honest while you do. That upkeep is
tedious, easy to skip, and the first thing to go when a deadline looms.

Which is exactly the kind of work that changed cost the moment capable AI agents arrived. This
post is about what a *good* metric looks like, and then about handing the upkeep to an agent —
using a small, real project as the running example: [nearestniceweather](https://github.com/PrairieAster-Ai/nearest-nice-weather),
a Minnesota weather app maintained by one person. If a metrics practice is worth anything, it
should be worth it even at a team of one.

## What makes a metric worth tracking

Before you automate anything, it's worth being honest about which metrics deserve the effort. A
metric earns its place only if it changes a decision. Five properties separate the ones that do
from the ones that decorate a dashboard. (There's a [fuller treatment with the formulas and
sources here](../docs/metrics.md); the short version:)

**It maps to a business outcome.** "Cyclomatic complexity = 14" moves no one. "This file changes
every week and is complex enough that every change is a coin-flip" is a risk statement someone
acts on. Good metrics sit under the outcome they drive — lower risk from change, higher
throughput, lower key-person risk — not under a category of the code.

**It's honest about a skewed distribution.** Code complexity follows a power law: most files are
trivial, a few are monsters. So the *average* of nearly any per-file metric is dragged around by
the boring majority and hides the handful of files that cause the pain. The fix is to report the
shape — what share of the code is healthy, *and* how bad the worst file is — never a single mean
that describes neither. This is why the Maintainability Index is notoriously misleading as an
average and useful as a *proportion of green files*.

**It's a trend, not a snapshot.** One reading is a location; you need the delta to know if you're
sliding. The headline should always be the change — "Maintainability down 4 points this week" —
because that's what prompts action. A snapshot committed once and forgotten just goes stale.

**It's actionable.** A metric you can't act on is trivia. Every good one comes with an owner, a
concrete fix, and a payoff: "refactor `App.tsx`'s effects into hooks" beats "complexity is high."

**It can become a gate.** The strongest metric is one you can ratchet — circular imports = 0,
cognitive complexity ≤ 15, coverage that can't drop. A metric that's *measured* but never
*enforced* is a silent gap: you have the smoke detector, you just never turned it on.

Notice that four of those five properties are about *use*, not measurement. That's the leverage
point.

## The four jobs, and why an agent can do them

Keeping metrics alive is really four recurring jobs: **track** them, **maintain** the code
against them, **document** the result, and **communicate** it to humans. Each is exactly the kind
of judgment-plus-drudgery loop that a well-scoped agent handles well. The
[quality-steward](https://github.com/PrairieAster-Ai/quality-steward) is one such agent — a
Claude Code agent that runs on every pull request and on a weekly schedule. Here's how it maps to
the four jobs, with what it's actually done on nearestniceweather.

### 1. Track — a reading every week, and a trend that survives

The steward runs a metrics roll-up on a schedule and accumulates each reading into a trend, so a
regression is the *headline*, not a needle in a log. On nearestniceweather that roll-up is a
single **CodeHealth grade: A, 94/100**, composed from six weighted dimensions — documentation,
maintainability, structure, resilience, type/size safety, and dependency security.

The score is deliberately transparent (every input is a metric you can reproduce), and it's built
to be statistically honest: Maintainability (97.4 — 63 of 64 files green) and Resilience (67 —
the single worst file sits at a Maintainability Index of 18.4) are kept as *separate* dimensions,
because the body and the tail of the distribution tell different stories and one average would
blur both.

There's a genuine subtlety AI doesn't magically solve here: a trend needs history, and CI runners
are ephemeral. The steward handles it by persisting the trend and a `last-sweep-sha` marker on a
dedicated `steward-state` branch — never the default branch — so each weekly sweep resumes where
the last ended. (And to be honest about limits: nearestniceweather has only a handful of dated
readings so far. A trend line needs time to earn its slope; the machinery is what matters
early.)

### 2. Maintain — fix the safe things, *suggest* the non-trivial ones

This is where automating quality gets dangerous, and where the design matters most. An agent that
edits your code needs a hard boundary between what it's allowed to change and what it must leave
alone. The steward's **autonomy contract** draws it like this:

- **Safe, mechanical changes are auto-applied** — but only on a branch and a PR, never a direct
  push to the default branch, and only when the build stays green *and* the non-comment diff is
  empty. Comments, formatting, lint `--fix`: things that provably can't change runtime behavior.
- **Anything touching logic, control flow, dependencies, or security is only *suggested*** —
  routed to a GitHub issue or an inline PR comment, with the evidence attached, for a human to
  decide.

On nearestniceweather that boundary produced, on the safe side: a PR
[removing ~350 lines of dead code](https://github.com/PrairieAster-Ai/nearest-nice-weather/pull/315),
several PRs raising TSDoc and test coverage, and — the satisfying one —
[**PR #324**](https://github.com/PrairieAster-Ai/nearest-nice-weather/pull/324), which refactored
the map container's effects into hooks and moved the score **B → A (92.7)**, targeting the exact
hotspot the churn×complexity metric had flagged. The metric found the file; the agent did the
boring refactor; a human clicked merge. ([Browse every auto-fix PR it
opened.](https://github.com/PrairieAster-Ai/nearest-nice-weather/pulls?q=is%3Apr+head%3Asteward))

And on the other side of that line, the same week's sweep filed two bug issues instead of touching anything —
[#342](https://github.com/PrairieAster-Ai/nearest-nice-weather/issues/342) (a process-kill gated
on the wrong flag) and [#343](https://github.com/PrairieAster-Ai/nearest-nice-weather/issues/343)
(an unchecked `as number` cast on a nullable field that bypassed a null-guard). Neither is
something you'd want an agent silently "fixing." Both are exactly what you want it *noticing*.

That asymmetry — eager on the mechanical, hands-off on the consequential — is the whole reason
this is safe to leave running.

### 3. Document — living docs and a dashboard that don't drift

Documentation rots because updating it is a separate chore from changing the code. The steward
folds it into the same loop: it regenerates API docs from TSDoc, refreshes a
[Code Health Dashboard](https://github.com/PrairieAster-Ai/nearest-nice-weather/wiki/Code-Health-Dashboard),
and only publishes when the code surface actually changed. The metrics and the prose
around them are stitched together with markers, so the numbers can't silently diverge from the
words describing them. Documentation stops being a thing you remember to do and becomes a
byproduct of the sweep.

### 4. Communicate — put the number where a human will see it, in terms they care about

A metric that lives only in a JSON file communicates nothing. The steward's outputs are the
communication surface: a graded dashboard organized *by business outcome* (risk, throughput,
onboarding), inline PR comments where the change is being reviewed, and durable issues for the
things that need a human. The medium is chosen so the message lands where the decision is made.

Code health is only half of it, though. nearestniceweather also instruments its own *runtime* —
self-reported API-reliability and slow-request events, deploy-drift telemetry that catches users
stuck on a stale bundle, plus real Core Web Vitals and unhandled exceptions — so operational
problems surface as signals rather than support tickets. A codebase graded for structural health
*and* wired to report its own reliability is one you can operate with confidence, and an agent
watching both the structural trend and the runtime signals can tell you when *either* moves.

## What the AI is, and isn't, doing

It's worth being precise, because "AI-powered quality" invites the wrong mental model. The agent
is not exercising taste about your architecture, and it's not a substitute for review. What it's
doing is running the *upkeep loop* that humans reliably skip: take the reading, compute the delta,
rank the hotspots, do the mechanical fixes, file the findings that need a human, refresh the docs, remember
what it decided last week. The judgment about what's safe to touch is encoded up front in the
contract; the judgment about what to *do* with a filed issue stays with you.

That division is the point. The reason quality metrics die isn't that teams don't care — it's
that the upkeep is expensive and the payoff is deferred. An agent makes the upkeep nearly free,
which finally makes the practice sustainable. The metric that changes a decision is the one that's
still being taken next month.

---

*The quality-steward agent, its bundled skills, and the full methodology are open source at
[github.com/PrairieAster-Ai/quality-steward](https://github.com/PrairieAster-Ai/quality-steward).
Every figure in this post is a real reading from
[nearestniceweather](https://github.com/PrairieAster-Ai/nearest-nice-weather) as of July 2026.*
