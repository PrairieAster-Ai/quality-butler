# quality-steward

**Turn code quality from an invisible liability into a metric you can govern by.**

quality-steward is an autonomous Claude Code agent that watches your codebase's health, fixes the
safe things itself, escalates the non-trivial ones with evidence, and keeps your documentation
current — on every pull request and every week, without anyone having to remember to do it.

It gives you one number that trends over time — a **CodeHealth grade** — and a running record of
what was improved and what needs a decision. So "how healthy is our code, and is it getting better
or worse?" becomes a question you can actually answer.

---

## Why this matters to the business

Code quality decays silently. Nobody files a ticket for "this module is getting harder to change safely";
you find out when a routine change causes an incident, when a feature that should take two days
takes two weeks, or when the one engineer who understands a system leaves. By then the cost is
already paid.

The usual response — a quality dashboard, a coverage gate, a complexity report in CI — fails for a
predictable reason: **the upkeep competes with shipping features, and loses.** The metrics go
stale, the dashboard goes unread, and quality work keeps getting deferred to "after this release."

quality-steward removes the upkeep from the critical path. It runs unattended on your existing CI,
so the practice sustains itself. Quality stops being a project you launch and becomes a background
condition you maintain.

## What you get

Every metric maps to a business outcome — and the steward doesn't just report it, it acts on it.

### 🛡️ Lower risk from change
Fewer incidents from routine work, and security issues caught in review instead of production.
The steward reviews every pull request for correctness and security regressions, flags the files
that are both complex *and* changed often (where bugs concentrate), and files the non-trivial
findings as tracked issues with the evidence attached.
> *On the [live example project](docs/example-nearest-nice-weather.md), the weekly sweep filed two
> real bug reports — a resource-cleanup flaw and an unchecked type cast that bypassed a null-guard
> — for a human to decide on, rather than silently editing logic it shouldn't touch.*

### 🚀 Faster, more predictable delivery
Complex, duplicated, tangled code is a tax on every future change. The steward tracks that tax as
a trend and automatically pays down the cheap parts — removing dead code, cleaning up mechanical
issues — so estimates hold and changes stay quick.
> *It removed ~350 lines of dead code in one pull request, and refactored the app's most-churned
> file — moving the overall grade from **B to A** — targeting the exact hotspot the metrics
> flagged.*

### 🧑‍💻 Lower key-person & onboarding risk
When quality lives in one person's head, they're a single point of failure and new hires are slow
to ramp. The steward keeps documentation and API references generated and current as a byproduct
of its normal run, so the knowledge lives in the repo, not in someone's memory.

### 📋 Governance & audit-readiness
A single graded score with a trend gives you a defensible, at-a-glance answer to "is our code
health improving?" — and an auditable record of what was fixed and what was flagged, produced
automatically. No quality theater; just the actual history.
> *The example project holds a steady **CodeHealth A (94/100)**, with the full component breakdown
> and trend maintained without manual effort.*

## Three ways teams use it

The steward is built for one job — keep quality visible and maintained — but teams adopt it at
three different points in a project's life:

### 1. Onboard an existing codebase — find and pay down technical debt
Point it at a project that's accumulated debt. It takes a **baseline** CodeHealth reading, ranks
the hotspots worth fixing first (complex *and* frequently changed), **auto-fixes the safe debt**
(dead code, formatting, documentation gaps) through pull requests, and **generates the
documentation and dashboard** you never had time to write. You go from "we're not sure how bad it
is" to a graded starting point, a cleanup already underway, and living docs — in days, not
quarters.

### 2. Wire it into CI/CD — define and maintain a quality standard
Run it on every pull request to make your quality bar continuous instead of aspirational. It does
a differential correctness and security review of the diff, comments inline where the change is
being made, and holds **ratcheting gates** — coverage can't drop, complexity stays capped, no new
circular imports. New work meets the standard *as it's written*, and the standard only tightens.

### 3. Keep it running — long-term monitoring and up-to-date docs
Left on the weekly schedule, it becomes standing maintenance: it **monitors the trend** and makes
a regression the headline (the delta, not the raw number), catches decay early, and keeps the
docs, API references, and onboarding guides **current as the code evolves**. Quality stays a
background condition instead of a periodic fire drill.

## Safe by design

An agent that can edit your code needs a hard boundary, and this is the whole point of the design:

- **It auto-fixes only provably safe, mechanical changes** — comments, formatting, lint — and only
  through a pull request on its own branch. **It never pushes to your main branch.**
- **Everything that touches logic, dependencies, or security is only *suggested*** — as a pull
  request comment or a tracked issue — for a human to decide.

Eager on the harmless, hands-off on the consequential. That asymmetry is what makes it safe to
leave running.

## What it costs

- **Near-zero ongoing effort.** It runs on your existing GitHub Actions on every PR and weekly.
- **No new vendor bill.** It authenticates with your existing Claude subscription — no separate
  API key, no API billing.
- **A few minutes to set up.** Copy one workflow file, add one secret, configure your commands.
  → **[Installation guide](INSTALL.md)**

## See it on a real project

**[The nearestniceweather case study](docs/example-nearest-nice-weather.md)** shows the steward
running unattended on a live repository — its real CodeHealth grade, the hotspots it surfaced, the
pull requests it opened to pay down debt, the findings it escalated for a human to decide, and the
dashboard and onboarding docs it keeps current.

## Learn more

- **[Installation guide](INSTALL.md)** — set it up on your repo in a few minutes.
- **[What good software metrics are](docs/metrics.md)** — the strategy behind *which* metrics are
  worth tracking, and how the CodeHealth grade is computed.
- **[The steward on a real project](docs/example-nearest-nice-weather.md)** — the live example,
  with real numbers.
- **[Technical documentation](docs/technical.md)** — architecture, the composed skills, the
  autonomy contract, run modes, and security.
- **[Blog: Good software metrics, and how to actually keep them](blog/using-ai-to-track-software-metrics.md)**

## License

[Apache License 2.0](LICENSE).
