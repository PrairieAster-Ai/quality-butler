# quality-steward

**A Claude Code agent that stands watch over a repository's code quality and documentation** —
on every pull request and on a weekly schedule. It reads the health metrics, proposes
improvements, and keeps the docs true to the code, composing a bundle of focused skills toward
three outcomes:

> **monitor** the metrics → **suggest** improvements → **document** (keep the docs honest)

It is an *orchestration agent*, not a single skill: one agent given a goal and a toolbox that
**decides what to do with what it finds** — auto-fixing the safe, mechanical things through a
pull request, and surfacing the risky things for a human to review.

- 🩺 **Monitors** a rolled-up **CodeHealth** score and its trend, so a regression is the headline.
- 🔧 **Auto-fixes** only provably behavior-preserving changes (doc-comments, formatting, lint
  `--fix`) — on a branch + PR, **never a direct push to your default branch**.
- 🚩 **Suggests** everything risky (logic, security, dependencies) as GitHub issues or inline PR
  comments — it never silently edits those.
- 📚 **Publishes** living docs and a Code Health Dashboard, so documentation never drifts.

See it running on a real project: **[the nearestniceweather case study](docs/example-nearest-nice-weather.md)**.

---

## Why this exists

Most quality tooling produces a *snapshot* — a number in a CI log that nobody reads until
something breaks. The quality-steward turns quality into a **standing practice**: a trend that
is watched, changes that are triaged by risk, and docs + a dashboard that stay current without
anyone remembering to update them. The judgment about what's safe to fix versus what a human
must decide lives in the [autonomy contract](#the-autonomy-contract) below — that boundary is
the whole point.

For the argument behind *which* metrics are worth tracking (and why a raw average is the wrong
way to roll them up), read **[docs/metrics.md](docs/metrics.md)**.

## What it composes

The steward orchestrates six skills. `code-review` ships with Claude Code; the other five (plus
the shared `wiki-publish` substrate) are **bundled in this repo** and installed at runtime.

| Skill | Owns | Feeds |
|---|---|---|
| **code-health** | Structural metrics + the **CodeHealth roll-up** + the dashboard (Maintainability Index, cyclomatic/cognitive complexity, churn×complexity hotspots, coupling/instability, change-coupling, duplication, circular imports) | the score & trend (step 1) |
| **code-review** *(built in)* | Correctness / bug review on a diff | risky suggestions |
| **security-audit** | SAST · secrets · SCA on a diff, with LLM verification | Security dimension + suggestions |
| **code-readability** | TSDoc-native comments + generated, cross-linked API docs | Documentation dimension + published docs |
| **code-quality** | Lint · type-check · coverage · sprint planning | test/coverage trend |
| **github** | Wiki + Projects plumbing (auth quirks handled) | where docs are published |

One dashboard, several producers — each skill owns its dimension; the steward runs them and
publishes the result.

## The autonomy contract

This is the safety model. Read it before you turn the steward loose.

- **Auto-fix the SAFE, mechanical things** — and only on a `steward/auto-fix-*` branch + PR,
  **never a direct push to the default branch.** Safe means comments/formatting/lint that cannot
  change runtime behavior. After any edit the **green-gate** (your lint/type-check/test commands)
  must stay green *and* the non-comment diff must be empty. If an edit can't be proven
  behavior-preserving, the steward suggests it instead of making it.
- **Suggest the RISKY things — don't touch them.** Anything touching logic, control flow,
  dependencies, or security posture is a *suggestion*, routed to the right channel:
  **inline PR comments** per-PR, durable **GitHub issues** on the weekly sweep.

## Run modes

| Trigger | Mode | Diff window | Output |
|---|---|---|---|
| `pull_request` | per-PR | the PR diff | inline PR review comments |
| `schedule` (weekly) | sweep | commits merged since the last sweep (`git diff <last-sweep-sha>...HEAD`) | GitHub issues + an auto-fix PR + a doc refresh |
| `workflow_dispatch` | on-demand / `verify` | as instructed | issues / none |

**Sweep state.** CI runners are ephemeral, so the steward tracks the last-swept commit on a
dedicated, auto-created **`steward-state`** branch (one file, `last-sweep-sha`, plus the durable
metric trend). That branch — not agent memory — is what lets each weekly sweep resume where the
last one ended. It never touches your default branch. The first run falls back to `HEAD~20`.

---

## Install

The workflow **pulls the agent definition and skills from this repo at runtime** (pinned to a
reviewed commit), so the repo you install into commits **only the workflow file** — nothing to
keep in sync, one source of truth.

**1. Copy the workflow** into your repo:

```bash
mkdir -p .github/workflows
curl -fsSL https://raw.githubusercontent.com/PrairieAster-Ai/quality-steward/main/agents/quality-steward.yml \
  -o .github/workflows/quality-steward.yml
```

**2. Configure it for your project.** In the workflow, edit the **`PROJECT_CONFIG`** env block
(under *Build the run instruction*) with your metric command, green-gate, auto-fixable surface,
and doc-publish flow; swap the `setup-node` / `npm ci` steps for your toolchain; and pin
**`SKILLS_REF`** to a commit of this repo you've reviewed (it controls both the skills and the
agent definition — bump it intentionally to take upstream updates).

**3. Authenticate CI with your Claude subscription** (Max/Pro — no separate API key or API
billing):

```bash
claude setup-token   # prints a one-year OAuth token
```

Add it as an Actions secret named exactly **`CLAUDE_CODE_OAUTH_TOKEN`**. **Do not** also add an
`ANTHROPIC_API_KEY` secret — it takes precedence and silently overrides the subscription token.

**4. Verify before you rely on it.** The workflow ships a zero-side-effect `verify` mode:

```bash
gh workflow run quality-steward.yml -f mode=verify
```

Green means the token is valid, scoped to this repo, and the action is wired correctly. Then run
one full pass and watch it (`-f mode=steward`) before trusting the unattended triggers.

> **Prefer to run it locally too?** Drop `agents/quality-steward.md` into `.claude/agents/` and
> invoke it via `/agents` or `claude --agent quality-steward` (restart Claude Code first — the
> agent registry loads at startup).

## Configure for your project

The agent is project-agnostic; set these knobs in the workflow's `PROJECT_CONFIG` (anything you
leave unset is skipped gracefully):

| Knob | What it is |
|---|---|
| **Metric command** | how metrics + a trend file are produced (e.g. `code-health`'s `run-all.mjs`) |
| **Green-gate** | what must stay green after an auto-fix (`lint && type-check && test`) |
| **Auto-fixable surface** | the mechanical fixes that are provably behavior-preserving |
| **Doc-publish flow** | how living docs get refreshed (e.g. `/code-readability publish`) |

Replace the `npm`-based examples with your stack's equivalents (pnpm/yarn, cargo, go, poetry…).

## Repository layout

```
agents/
  quality-steward.md     the agent definition — the brain (canonical source)
  quality-steward.yml    the GitHub Actions workflow — the only file you copy into your repo
skills/
  code-health/           metrics engine + CodeHealth roll-up + dashboard
  code-readability/       TSDoc standard + generated API docs
  security-audit/         differential SAST/SCA/secrets audit
  code-quality/           lint / type-check / coverage / sprint planning
  github/                 wiki + projects plumbing
  wiki-publish/           shared marker-stamping + wiki push substrate
docs/
  metrics.md              what good software metrics are (the methodology)
  example-nearest-nice-weather.md   the steward on a real project
```

## Documentation

- **[docs/metrics.md](docs/metrics.md)** — what makes a software metric worth tracking, and how
  the CodeHealth roll-up is computed (with sources).
- **[docs/example-nearest-nice-weather.md](docs/example-nearest-nice-weather.md)** — a real
  project running the steward: its CodeHealth grade, its hotspots, and the PRs and issues the
  steward has actually opened.
- Each skill's own `SKILL.md` documents its modes and configuration.

## License

[Apache License 2.0](LICENSE).
