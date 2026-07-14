## Summary

<!-- What does this change and why. One or two sentences. -->

## Type of change

<!-- Check all that apply. -->

- [ ] `fix` — bug fix
- [ ] `feat` — new capability
- [ ] `docs` — documentation only
- [ ] `refactor` — no behavior change
- [ ] `chore` — tooling / maintenance (incl. `SKILLS_REF` bump)

## Checklist

- [ ] PR title follows **Conventional Commits** (`feat:` / `fix:` / `docs:` / `chore:` …), scoped
      to the skill or area touched.
- [ ] **Docs updated in the same PR** — behavior, metric, flag, or workflow changes are reflected
      in the affected `docs/` files and the [CHANGELOG](../CHANGELOG.md).
- [ ] No links to external websites added in prose (plain-text tool/standard names; internal
      relative links are fine).
- [ ] **`SKILLS_REF` note** — if this changes what a pinned consumer would run (agent prompt, a
      skill, or `agents/quality-steward.yml`), I've flagged it so the pin bump is intentional. See
      [Technical](https://github.com/PrairieAster-Ai/quality-steward/wiki/Technical#supply-chain--security).

## How this was tested

<!-- Skill invoked locally, script run against a repo, verify-mode run, etc. -->

## Notes for reviewers

<!-- Anything the steward's own review (it dogfoods this repo) or a human should know. -->
