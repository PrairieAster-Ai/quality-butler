# quality-steward

**Turn code quality from an invisible liability into a metric you can govern by.**

quality-steward is an autonomous [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
agent that watches your codebase's health, fixes the safe things itself, escalates the non-trivial
ones with evidence, and keeps your documentation current — on every pull request and every week,
without anyone having to remember to do it.

- 🩺 **Monitors** a transparent, reproducible **CodeHealth** score and its trend.
- 🔧 **Auto-fixes** only provably behavior-preserving changes via a PR — **never pushes to your
  default branch.**
- 🚩 **Escalates** everything non-trivial (logic, security, dependencies) as GitHub issues or
  inline PR comments for a human to decide.
- 📚 **Publishes** living docs and a Code Health Dashboard, so documentation never drifts.

## 📖 Documentation lives in the Wiki

All guides and reference material are in the **[project Wiki](https://github.com/PrairieAster-Ai/quality-steward/wiki)**:

| | |
|---|---|
| **Get started** | [Installation](https://github.com/PrairieAster-Ai/quality-steward/wiki/Installation) · [Usage](https://github.com/PrairieAster-Ai/quality-steward/wiki/Usage) |
| **Reference** | [Features](https://github.com/PrairieAster-Ai/quality-steward/wiki/Features) · [Metrics](https://github.com/PrairieAster-Ai/quality-steward/wiki/Metrics) · [Generated docs](https://github.com/PrairieAster-Ai/quality-steward/wiki/Generated-Documentation) · [Technical](https://github.com/PrairieAster-Ai/quality-steward/wiki/Technical) · [Language support](https://github.com/PrairieAster-Ai/quality-steward/wiki/Language-Support) · [CI portability](https://github.com/PrairieAster-Ai/quality-steward/wiki/CI-Portability) |
| **Understand** | [How it compares](https://github.com/PrairieAster-Ai/quality-steward/wiki/Comparison) · [On a real project](https://github.com/PrairieAster-Ai/quality-steward/wiki/Example-nearestniceweather) · [Code Health Dashboard](https://github.com/PrairieAster-Ai/quality-steward/wiki/Code-Health-Dashboard) · [Blog](https://github.com/PrairieAster-Ai/quality-steward/wiki/Blog-Good-software-metrics) |

## Quickstart

quality-steward *is* a Claude Code agent, so you install it by handing Claude Code a prompt — not
by running commands yourself. Open Claude Code in your repo and paste this:

```text
Install the quality-steward agent into this repository.

1. Download the workflow template from
   https://raw.githubusercontent.com/PrairieAster-Ai/quality-steward/main/agents/quality-steward.yml
   into .github/workflows/quality-steward.yml.
2. Read the quality-steward wiki (https://github.com/PrairieAster-Ai/quality-steward/wiki),
   inspect THIS repo, and adapt the template: swap the Node/npm stack-setup steps for my toolchain,
   fill PROJECT_CONFIG (metric command, green-gate, auto-fixable surface, doc-publish flow), and
   pin SKILLS_REF to the latest quality-steward release tag.
3. Walk me through authenticating CI: tell me to run `claude setup-token`, then set the token I
   paste back as the CLAUDE_CODE_OAUTH_TOKEN Actions secret (and warn me off ANTHROPIC_API_KEY,
   which silently overrides it).
4. Run the workflow in verify mode and confirm auth is wired correctly.

Show me the diff before committing anything.
```

The workflow is the only file you commit; it pulls the agent + skills from this repo at the pinned
`SKILLS_REF`. Full setup, the quality gate, and the three adoption playbooks are in the
[Installation](https://github.com/PrairieAster-Ai/quality-steward/wiki/Installation) and
[Usage](https://github.com/PrairieAster-Ai/quality-steward/wiki/Usage) wiki pages — all as
copy-paste prompts.

## What's in this repo

```
agents/
  quality-steward.md       the agent definition — the brain (canonical source)
  quality-steward.yml      the GitHub Actions workflow — the file you copy into your repo
  quality-steward.gitlab-ci.yml   a community GitLab CI example
skills/                    the six bundled skills (code-health, code-readability,
                           security-audit, code-quality, github, wiki-publish)
scripts/                   agent-level helpers (steward self-metrics)
CHANGELOG.md · CONTRIBUTING.md · SECURITY.md · CODE_OF_CONDUCT.md
```

Everything else — how it works, every metric and mode, the competitive positioning, and the live
example — is in the [Wiki](https://github.com/PrairieAster-Ai/quality-steward/wiki).

## License

[Apache License 2.0](LICENSE).
