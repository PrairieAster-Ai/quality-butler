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
| **Reference** | [Features](https://github.com/PrairieAster-Ai/quality-steward/wiki/Features) · [Metrics](https://github.com/PrairieAster-Ai/quality-steward/wiki/Metrics) · [Technical](https://github.com/PrairieAster-Ai/quality-steward/wiki/Technical) · [Language support](https://github.com/PrairieAster-Ai/quality-steward/wiki/Language-Support) · [CI portability](https://github.com/PrairieAster-Ai/quality-steward/wiki/CI-Portability) |
| **Understand** | [How it compares](https://github.com/PrairieAster-Ai/quality-steward/wiki/Comparison) · [On a real project](https://github.com/PrairieAster-Ai/quality-steward/wiki/Example-nearestniceweather) · [Code Health Dashboard](https://github.com/PrairieAster-Ai/quality-steward/wiki/Code-Health-Dashboard) · [Blog](https://github.com/PrairieAster-Ai/quality-steward/wiki/Blog-Good-software-metrics) |

## Quickstart

The workflow is the only file you commit; it pulls the agent + skills from this repo at a pinned
commit. Copy it, add your Claude subscription token, and verify:

```bash
mkdir -p .github/workflows
curl -fsSL https://raw.githubusercontent.com/PrairieAster-Ai/quality-steward/main/agents/quality-steward.yml \
  -o .github/workflows/quality-steward.yml
claude setup-token   # add the printed token as the Actions secret CLAUDE_CODE_OAUTH_TOKEN
gh workflow run quality-steward.yml -f mode=verify
```

Full setup, configuration, and the three adoption playbooks are in the
[Installation](https://github.com/PrairieAster-Ai/quality-steward/wiki/Installation) and
[Usage](https://github.com/PrairieAster-Ai/quality-steward/wiki/Usage) wiki pages.

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
