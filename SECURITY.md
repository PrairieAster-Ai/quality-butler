# Security policy

The steward is an agent that runs in CI with write scopes and reads untrusted content, so its
security posture is part of the product. This document covers how to report a vulnerability, what
is in scope, the supply-chain model, and the agent's own threat model.

## Reporting a vulnerability

**Report privately — do not open a public issue for a security problem.**

Use a **GitHub Security Advisory** on this repository (the *Security* tab → *Report a vulnerability*).
That opens a private channel with the maintainers. There is no security mailing address; the
advisory flow is the intended path.

Please include:

- what the issue is and the impact you see,
- the affected file or capability (agent prompt, a skill, the workflow),
- a minimal reproduction or proof of concept if you have one,
- any suggested remediation.

We aim to acknowledge a report promptly, agree on a disclosure timeline with you, and credit you in
the advisory unless you prefer to stay anonymous. Please give us a reasonable window to fix an issue
before disclosing it publicly.

## Scope

In scope:

- the agent definition (`agents/quality-steward.md`) and the shipped workflow
  (`agents/quality-steward.yml`),
- the bundled skills under `skills/` — their scripts and the deterministic CLIs,
- the supply-chain and CI posture described below.

Out of scope:

- vulnerabilities in third-party tools the skills invoke (semgrep, gitleaks, osv-scanner, madge,
  dependency-cruiser, and the rest) — report those to their own projects; we'll adjust our usage if
  needed,
- issues that require a consumer to have already misconfigured their own repo against the guidance
  in [Installation](https://github.com/PrairieAster-Ai/quality-steward/wiki/Installation) and [Technical](https://github.com/PrairieAster-Ai/quality-steward/wiki/Technical) (for example, adding an
  `ANTHROPIC_API_KEY` secret, or switching the trigger to `pull_request_target`).

## Supply-chain posture

The steward runs with write scopes and a subscription token, so the trust boundary is enforced
deliberately. See [Technical](https://github.com/PrairieAster-Ai/quality-steward/wiki/Technical#supply-chain--security) for the full
rationale.

- **`SKILLS_REF` is pinned to a reviewed commit SHA, never a moving branch.** Consuming repos pull
  the agent definition and skills from this repo at runtime; pinning to an immutable SHA means a
  later upstream commit cannot execute inside a consumer's write-scoped, token-bearing context. A
  pin is bumped intentionally after reviewing the upstream diff.
- **`id-token: write` (OIDC) is scoped to auth only.** The Claude Code action uses GitHub OIDC
  during authentication; the job requests no more than it needs.
- **Subscription-token auth only.** CI authenticates with `CLAUDE_CODE_OAUTH_TOKEN`. Do not also set
  `ANTHROPIC_API_KEY` — it silently takes precedence and reroutes billing.
- **Never `pull_request_target`.** On a public repo, GitHub withholds secrets from fork PRs by
  design. `pull_request_target` would run untrusted fork code with secrets in context; the shipped
  workflow uses `pull_request` and keeps it that way.
- **State lives off the default branch.** The durable sweep marker and metric trend live on a
  dedicated `steward-state` branch; the agent never pushes to the default branch.

## The agent's own threat model

The steward reads content it does not control — pull-request diffs, issue and PR text, source files
from forks. It treats all of that as **data, not instructions**: repository and PR content is
material to review, never a source of commands that can change what the agent does. Two structural
defenses back this up:

- **Writes are restricted to the auto-fix branch.** Anything the agent changes goes onto a
  `steward/auto-fix-*` branch through a pull request, gated on the green-gate staying green *and* an
  empty non-comment diff. It never pushes to the default branch. So even a successful prompt-
  injection attempt is bounded by the autonomy contract — it cannot merge, cannot touch protected
  branches, and cannot silently edit logic.
- **Base-ref trust for suppressions.** Security false-positive memories load from the PR **base**
  ref, not the head, so a malicious PR cannot ship a memory that suppresses its own finding.

The full autonomy contract and boundary are documented in
[Technical](https://github.com/PrairieAster-Ai/quality-steward/wiki/Technical#the-autonomy-contract).
