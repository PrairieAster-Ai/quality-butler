# Technical documentation

How the quality-steward is built and how it behaves. For setup, see [INSTALL.md](../INSTALL.md);
for the business case, see the [README](../README.md).

## What it is: an orchestration agent, not a skill

A *skill* is one instruction set that does one thing. The quality-steward is an **agent**: it's
given a goal (`monitor → suggest → document`) and a toolbox, and it decides what to do with what
it finds. It composes existing skills rather than re-implementing them, and it never blocks on a
question (`AskUserQuestion` is disallowed) — when unsure, it takes the conservative option and
notes it in its report.

The full behavioral contract lives in [`agents/quality-steward.md`](../agents/quality-steward.md),
which is the canonical definition the workflow loads at runtime.

## The composed skills

The steward orchestrates six skills. `code-review` is built into Claude Code; the other five plus
the shared `wiki-publish` substrate are bundled in this repo and installed at runtime. This is a
**one-dashboard, several-producers** model — each skill owns one dimension:

| Skill | Owns | Feeds the roll-up |
|---|---|---|
| **code-health** | Structural metrics (Maintainability Index, cyclomatic/cognitive complexity, churn×complexity hotspots, coupling/instability, change-coupling, duplication, circular imports) + the **CodeHealth roll-up** + the dashboard render/stamp/trend | Maintainability, Structure, Resilience, Type & size |
| **code-review** *(built in)* | Correctness / bug review on a diff | non-trivial suggestions |
| **security-audit** | SAST · secrets · SCA on a diff, with LLM verification | Security |
| **code-readability** | TSDoc-native comments + generated, cross-linked API docs | Documentation |
| **code-quality** | Lint · type-check · coverage · sprint planning | test/coverage trend |
| **github** | Wiki + Projects plumbing (auth quirks handled) | where docs are published |

`code-health` is the metrics engine behind the Monitor step. See
[docs/metrics.md](metrics.md) for how the roll-up is computed.

## The playbook

**1. Monitor.** If a metric command is configured, run it and read its trend file to compute
**deltas vs. the previous reading** — a regression (score down, complexity/duplication up,
coverage down, a new advisory) is the headline. With no metric harness, skip to step 2 and let
the skills' own findings stand in.

**2. Assess & suggest.** Run `code-review` and `security-audit` on the mode's diff, and
`code-readability assess` for doc-coverage gaps. Dedupe across the three, rank by impact ×
regression. Apply the *safe* auto-fixes (below); emit everything else as suggestions to the mode's
channel, each with what · where (`file:line`) · why it matters · the proposed fix · confidence.

**3. Document.** Run the doc-publish flow to refresh living docs and the dashboard — only when the
code surface actually changed (a no-op refresh produces no diff). Respect generator markers; never
clobber hand-authored pages.

**4. Report.** A tight summary: detected mode · metric deltas · the auto-fix PR link · the count
and links of suggestions raised · docs refreshed.

## The autonomy contract

This is the safety model — the boundary between what the agent may change and what it must leave
to a human.

- **Auto-fix the SAFE, mechanical things** — and only on a `steward/auto-fix-*` branch + PR,
  **never a direct push to the default branch.** "Safe" means comments/formatting/lint that cannot
  change runtime behavior. After any edit, two conditions must both hold: the **green-gate** stays
  green, *and* the **non-comment diff is empty** (`git diff -G'^[^/ ]'` shows only
  whitespace/comment churn). If an edit can't be proven behavior-preserving, the steward suggests
  it instead of making it.
- **Suggest the NON-TRIVIAL things — leave them to a human.** Anything from `code-review` or
  `security-audit` that touches logic, control flow, dependencies, or security posture is a
  *suggestion*, routed to the right channel. The agent does not edit it.

## Run modes

The agent detects its mode from the invocation context:

| Trigger | Mode | Scope | Where suggestions go |
|---|---|---|---|
| `pull_request` | **per-PR** | the PR diff (differential) | inline PR review comments |
| `schedule` (weekly) | **sweep** | commits merged since the last sweep (`git diff <last-sweep-sha>...HEAD`) + repo-wide trend deltas | durable GitHub issues |
| `workflow_dispatch` | **on-demand / verify** | as instructed | issues / none |

**Why a diff and not the whole tree:** `code-review` and `security-audit` are *differential* — a
sweep against a clean working tree gives them nothing to chew on. The weekly sweep reviews the
range of commits merged since the last sweep, so the review skills always have a real diff.

### Sweep state: the `steward-state` branch

CI runners are ephemeral, so agent memory does **not** persist across runs. The steward tracks
its state on a dedicated, auto-created **`steward-state`** branch that never touches your default
branch:

- `last-sweep-sha` — the commit the last successful sweep ended on, so the next sweep resumes from
  there. The first run falls back to a bounded `HEAD~20`.
- the durable **metric trend** (`code-health/*.tsv`, `codehealth-stamp.json`) — restored before a
  run and persisted after, so the trend survives ephemeral runners. (Committing the trend to the
  default branch instead would leave a snapshot that silently goes stale.)

The workflow persists the new marker only **after a successful sweep**, using the immutable commit
SHA the workflow ran against (not `git rev-parse HEAD`, which would reflect whatever branch the
agent left the working tree on).

## Idempotency

Re-running on an unchanged repo opens **no duplicate PRs or issues** — the agent checks for an
existing open `steward/*` PR or a matching open issue (`gh pr list`, `gh issue list --search`) and
updates rather than duplicates. `memory: project` lets it remember decisions across runs (e.g. a
finding the maintainer dismissed — don't re-raise it).

## Supply chain & security

- **Pin `SKILLS_REF` to a reviewed commit SHA, never a branch.** The steward runs with
  `contents/pull-requests/issues: write` plus the OAuth token; fetching a moving branch would let
  a compromised upstream execute inside that context. Bump the pin intentionally after reviewing
  the upstream diff.
- **`id-token: write` is required** — the Claude Code action uses GitHub OIDC during auth.
- **Never switch the trigger to `pull_request_target`** on a public repo. GitHub withholds secrets
  from fork PRs by design; `pull_request_target` would run with secrets in the context of
  untrusted fork code.
- **Subscription-token auth only.** Do not set `ANTHROPIC_API_KEY` alongside
  `CLAUDE_CODE_OAUTH_TOKEN` — it silently takes precedence.

## Repository layout

```
agents/
  quality-steward.md     the agent definition — the brain (canonical source)
  quality-steward.yml    the GitHub Actions workflow — the only file you copy into your repo
skills/
  code-health/           metrics engine + CodeHealth roll-up + dashboard
  code-readability/       TSDoc standard + generated API docs
  security-audit/         differential SAST/SCA/secrets audit (+ deterministic Python CLI)
  code-quality/           lint / type-check / coverage / sprint planning (+ CLI)
  github/                 wiki + projects plumbing
  wiki-publish/           shared marker-stamping + wiki push substrate
docs/
  metrics.md             what good software metrics are (the methodology)
  technical.md           this file
  example-nearest-nice-weather.md   the steward on a real project
INSTALL.md               setup guide
```
