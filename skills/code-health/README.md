# code-health

Structural code-health metrics, a rolled-up **CodeHealth** score, and the **Code
Health Dashboard** pipeline — the "is this code maintainable / well-structured /
low-risk" half of code quality, kept separate from coverage/lint (`/code-quality`),
docs (`/code-readability`), and security (`/security-audit`).

## What it measures

| Producer | Metric | Tool |
|---|---|---|
| `maintainability-report` | Maintainability Index (per file, banded) | TS compiler API (Halstead + cyclomatic) |
| `complexity-report` | cyclomatic complexity per function (mean/max/over-15) | TS AST |
| `hotspot-report` | churn × complexity hotspots | git log + AST |
| `coupling-report` | fan-out + folder instability | `dependency-cruiser` CLI |
| `change-coupling-report` | files that change together (cross-layer = smell) | git log |
| `duplication-report` | copy-paste % | `jscpd` |
| `check-circular-deps` | import cycles (gate) | `madge` |
| `check-doc-coverage` | exported-symbol TSDoc % (gate) | static scan |
| `security-report` | dependency advisories by severity | `npm audit` |
| `codehealth-report` | **the weighted 0–100 roll-up + grade** + dashboard stamp facts | reads the above |
| `stamp-codehealth` | fills `<!--ch:*-->` markers in the dashboard | — |
| `run-all` | every producer in order, then the roll-up (+ optional `--stamp`) | — |

## Install (per repo)

1. Add `code-health.config.json` at the repo root (see `SKILL.md` for fields:
   `dirs`, `docDirs`, `coverageWorkspaces`, `tsconfig`, `historyDir`, `blobBase`).
2. devDeps: `typescript`, `dependency-cruiser`, `madge` (`jscpd`/`eslint`/`vitest`
   via the repo's toolchain / `npx`).
3. Add `npm run` aliases pointing at the installed skill (`.claude/skills/code-health/scripts/...`
   when vendored in CI, or `~/.claude/skills/code-health/scripts/...` for local-only).
4. `npm run codehealth:report` to seed the trend; create + stamp the
   `Code-Health-Dashboard` wiki page.

## Reuse

The scripts are repo-agnostic — all paths come from `code-health.config.json` /
`process.cwd()`, and GitHub file links derive from the `origin` remote. The same
skill drives any TS/React repo.

See `SKILL.md` for modes (`instrument` / `read` / `refresh`) and
`references/methodology.md` for formulas, anchors, and the dashboard template.
