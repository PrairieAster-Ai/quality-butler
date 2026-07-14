# Contributing to quality-steward

Thanks for helping improve the steward. This repo is small and opinionated; the sections below
cover how it's laid out, how to test a change, and the conventions a pull request is expected to
follow. For what the steward *does*, start with the [README](README.md); for how it works,
[Technical](https://github.com/PrairieAster-Ai/quality-steward/wiki/Technical).

## Repository layout

```
agents/
  quality-steward.md     the agent definition — the behavioral contract (canonical source)
  quality-steward.yml    the GitHub Actions workflow — the only file a consuming repo copies
skills/
  code-health/           metrics engine + CodeHealth roll-up + dashboard
  code-readability/      TSDoc standard + generated API docs
  security-audit/        differential SAST/SCA/secrets audit (+ deterministic Python CLI)
  code-quality/          lint / type-check / coverage / sprint planning (+ CLI)
  github/                wiki + projects plumbing
  wiki-publish/          shared marker-stamping + wiki push substrate
docs/                    the reference docs (metrics, technical, features, usage, comparison, …)
blog/                    long-form background
```

Three kinds of change land in three places:

- **Behavior of the agent** — edit `agents/quality-steward.md` (the prompt is the contract) and,
  if the run mechanics change, `agents/quality-steward.yml`.
- **A capability the agent composes** — edit the relevant skill under `skills/<name>/`. Each skill
  is self-contained: a `SKILL.md`, its `scripts/`, and its `references/`.
- **Documentation** — under `docs/`. Docs are part of the product here; see *Keep docs in sync*.

## How to test a skill locally

The skills are ordinary Claude Code skills, so you can exercise them directly without the workflow:

1. Make the skill visible to Claude Code. Either work inside this repo (the skills are already
   under `skills/`), or symlink the one you're editing into a target project's
   `.claude/skills/<name>/`.
2. Invoke it by its slash command in an interactive session — e.g. `/code-health`,
   `/security-audit`, `/code-readability assess`. The [feature reference](https://github.com/PrairieAster-Ai/quality-steward/wiki/Features) lists
   every mode and flag.
3. For the script-backed metrics, run the producers straight from Node against any TypeScript repo:

   ```bash
   node skills/code-health/scripts/run-all.mjs --no-write   # take a reading, don't append history
   ```

   The deterministic CLIs run the same way — `skills/security-audit/scripts/security_audit.py scan`
   and `skills/code-quality/scripts/code_quality.py assess`.

To exercise the whole agent, register it locally and run it against a scratch repo:

```bash
cp agents/quality-steward.md .claude/agents/quality-steward.md   # in the target repo
claude --agent quality-steward
```

The `verify` path in [Installation](https://github.com/PrairieAster-Ai/quality-steward/wiki/Installation) is the fastest end-to-end smoke test once the
workflow is wired up.

## The pull-at-runtime `SKILLS_REF` model

Consuming repos do **not** vendor the skills. The shipped workflow clones this repo at runtime and
copies the skills into `.claude/skills/`, pinned by the `SKILLS_REF` env var in
`agents/quality-steward.yml`:

```yaml
env:
  SKILLS_REF: <full commit SHA>   # pinned to a reviewed quality-steward commit
```

Two consequences for contributors:

- **`SKILLS_REF` is always a full commit SHA, never a moving branch.** The steward runs with
  `contents`/`pull-requests`/`issues: write` plus a subscription token, so a moving ref would let
  any later upstream commit execute in that context. See
  [Technical](https://github.com/PrairieAster-Ai/quality-steward/wiki/Technical#supply-chain--security).
- **Merging your change does not ship it.** It ships when a maintainer bumps `SKILLS_REF` to a
  reviewed SHA (and cuts a release / updates the [CHANGELOG](CHANGELOG.md)). If your PR changes the
  behavior a pinned consumer would get, call that out so the bump is intentional.

## Commit-message style

This repo uses **Conventional Commits**. The type prefix is required; keep the subject imperative
and lower-case. Match the existing history:

```
feat(code-health): add scc-based language-agnostic backend
fix(security-audit): correct BASE_REF resolution for base memories
docs(comparison): add positioning matrix
chore(steward): bump SKILLS_REF to <sha>
```

Common types here: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`. Scope to the skill or area
you touched (`code-health`, `security-audit`, `agents`, `docs`, …). PR titles follow the same
convention — the [PR template](.github/PULL_REQUEST_TEMPLATE.md) has a checklist for it.

## Proposing a new composed skill

The steward is a composition, not a monolith, so a new capability usually arrives as a new skill
the agent orchestrates. To propose one:

1. **Open an issue first** ([feature request](.github/ISSUE_TEMPLATE/feature_request.md)) describing
   the dimension it owns and why an existing skill can't. The design goal is *one dashboard, several
   producers* — each skill owns exactly one dimension and feeds the roll-up. A proposal that
   overlaps an existing skill's dimension is usually a change to that skill instead.
2. Add it under `skills/<name>/` with its own `SKILL.md`, `scripts/`, and `references/`, following
   the shape of an existing skill.
3. Wire it in: add it to the install loop in `agents/quality-steward.yml`, to the composed-skill
   table in `agents/quality-steward.md`, and to [Features](https://github.com/PrairieAster-Ai/quality-steward/wiki/Features) and
   [Technical](https://github.com/PrairieAster-Ai/quality-steward/wiki/Technical).
4. If it publishes to the wiki, build on the shared `wiki-publish` substrate rather than
   reimplementing the clone/guard/stamp/push plumbing — pick a marker prefix and emit a facts JSON.

## Keep docs in sync

Documentation is treated as part of the change, not a follow-up. A PR that alters behavior,
metrics, flags, or the workflow is expected to update the affected docs in the **same** PR —
typically some of the Features wiki page, the Technical wiki page, the Metrics wiki page,
the Language-Support wiki page, and the [CHANGELOG](CHANGELOG.md). The PR template asks you to confirm
this.

Two house rules for docs:

- **No links to external websites in prose.** Refer to other tools and standards by their
  plain-text name. Internal relative links between repo files are encouraged.
- Match the existing voice: direct and concrete, no marketing language.

## The project dogfoods itself

quality-steward reviews quality-steward. The agent can run on this repo's own pull requests — a
differential `code-review` + `security-audit` pass, with safe mechanical fixes offered as a
`steward/auto-fix-*` PR and anything non-trivial raised as a comment or issue. Treat its review
like any other: useful signal, not a gate you can't push back on. If it flags a false positive,
that's worth an issue too — improving its precision is a valid contribution.

## License

By contributing you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE), the same license as the project.
