# Security Audit Skill

Differential, high-signal security audit of the pending changes on the current branch. A coexisting alternative to Anthropic's bundled `/security-review` that pairs deterministic SAST/SCA/secrets scanners with LLM verification. Fewer false positives, broader coverage, optional sandbox-validated fixes.

## What's new vs the bundled `/security-review`

| | Bundled `/security-review` (Anthropic) | `/security-audit` (this skill) |
|---|---|---|
| Differential by default | ✓ | ✓ |
| LLM diff review | ✓ | ✓ |
| Hard exclusion list | ✓ (21 rules) | ✓ (25 rules, extended) |
| Confidence floor | 0.7 | 0.7 publish · 0.8 flag · 0.9 fix |
| Deterministic pre-pass (SAST/SCA/secrets) | ✗ | **✓ (semgrep + gitleaks + osv-scanner + lang-specific)** |
| OWASP/CWE/ATT&CK tagging | ✗ | **✓** |
| Touched-chapter ASVS checklist | ✗ | **✓ (only loads chapters the diff touches)** |
| Per-repo Memories (FP suppression) | ✗ | **✓ (`.claude/security-memories.md`)** |
| Semantic dedup across alarms | ✗ | **✓** |
| Dual prompt chain (FP-detector + TP-explainer, parallel, independent) | ✗ | **✓ (Semgrep Assistant pattern)** |
| Sandbox-validated fixes | ✗ | **✓ (with `--fix`)** |
| SARIF outputs for GitHub Code Scanning | ✗ | **✓ (per-tool, post-2025-07 compliant)** |

The two skills coexist (different slugs, different commands). Run either or both. `/security-review` for a fast LLM-only check, `/security-audit` when you want the tools-augmented review.

## Install

### Per project

```bash
git clone https://github.com/PrairieAster-Ai/claude-code-skills.git /tmp/ccs
cp -r /tmp/ccs/skills/security-audit .claude/skills/
```

### Global

```bash
git clone https://github.com/PrairieAster-Ai/claude-code-skills.git ~/.claude/skills-collection
ln -s ~/.claude/skills-collection/skills/security-audit ~/.claude/skills/security-audit
```

### Required tooling (installed once)

```bash
# Always-on stack
pipx install semgrep
brew install gitleaks osv-scanner   # or: go install github.com/google/osv-scanner/v2/cmd/osv-scanner@latest
pipx install lizard

# Conditional (installed on first need)
brew install aquasecurity/trivy/trivy       # IaC + containers
pipx install bandit                          # Python SAST
pipx install pip-audit                       # Python SCA
go install golang.org/x/vuln/cmd/govulncheck@latest   # Go SCA + reachability
npm i -g socket                              # Supply-chain typosquat detection
```

Six of seven are OSS and need no API key. Socket's `scan create` (the recommended invocation) requires `socket login` even on the free tier; the `socket npm install` install-time guard works unauthenticated. Run `socket login` once and the skill will pick up the credential from `~/.socket/`.

## Usage

```bash
/security-audit                  # vs origin/HEAD
/security-audit main             # vs explicit base
/security-audit --fix            # propose sandbox-validated patches for High-confidence findings
/security-audit --tools-only     # SAST/SCA pre-pass only — CI mode, writes per-tool SARIF
/security-audit --post-pr 123    # run audit + post results as a PR #123 comment (mirrors /code-review's format)
/security-audit --deep           # adds complexity hotspots + full-history secret scan
```

## Deterministic CLI

The tool-driven portion of this workflow is also available as a standalone script:

```bash
python3 <skill>/scripts/security_audit.py scan
python3 <skill>/scripts/security_audit.py scan --base origin/main --deep
python3 <skill>/scripts/security_audit.py ci --base origin/main
python3 <skill>/scripts/security_audit.py comment --pr 123
```

What the script owns:
- diff discovery
- conditional scanner selection
- SARIF/JSON artifact generation
- markdown/json summary generation
- optional PR comment posting via `gh`

What stays in the skill:
- LLM verification of raw findings
- semantic deduplication and confidence judgment
- memory management and false-positive suppression logic
- fix recommendation and patch validation

Artifacts are written under `.artifacts/security-audit/` by default.

## Hooks and CI

Example automation entrypoints are included at the repo root:

- `hooks/pre-push.security-audit`
- `.github/workflows/security-audit-tools-only.yml`

These are templates, not mandatory installation paths. The expectation is that consuming repos copy or adapt them to local needs.

## How it works (5 phases + optional 6th)

```
1. Context              — diff scope, touched-chapter detection
2. Pre-pass (tools)     — semgrep, gitleaks, osv-scanner, lang-specific (parallel, <30s typical)
3. LLM verification     — dual prompt chain per finding (FP-detector + TP-explainer, parallel), then triage combine
4. Triage + dedup       — memories applied, semantic dedup, exclusion filter
5. Report               — markdown with CWE/OWASP/ATT&CK tags
5b. --post-pr (optional)— post the report as a GH PR comment (mirrors /code-review's shape)
6. --fix (optional)     — generate patch → apply to worktree → re-run rule → run tests → discard if regression
```

## Output

Each finding includes:

- Severity (High/Medium/Low)
- Confidence (0.0–1.0)
- CWE id + OWASP Top 10:2025 tag + MITRE ATT&CK technique
- Concrete source → sink chain
- Exploit scenario with a sample request/payload
- Fix sketch referencing the repo's existing secure pattern where applicable

### Example output

A real-shaped finding looks like this (illustrative, not from a real diff):

````markdown
# Security Audit, feat/user-search vs main

**Scope:** 3 files, 4 commits, ASVS chapters loaded: V5.
**Pre-pass:** semgrep 1 finding, gitleaks 0, osv-scanner 0, eslint-plugin-security 0.
**Auto-dismissed:** 0 (memories: 0, FP filter: 0, dedup: 0).

## Findings (1 High, 0 Medium, 0 Low)

### Vuln 1: SQL Injection, `apps/api/src/routes/users.ts:42`

- **Severity:** High
- **Confidence:** 0.92
- **CWE:** CWE-89  ·  **OWASP:** A03:2025 Injection  ·  **ATT&CK:** T1190
- **Source → Sink:** `req.query.q` is concatenated directly into `db.execute()` at line 42 (no `sql` template tag, no parameter binding).
- **Exploit:** `GET /api/users?q=' OR 1=1 --` returns the full users table; `q=' UNION SELECT password_hash FROM admins --` exfiltrates hashes.
- **Fix:** Switch to Drizzle's parameterized form: `db.select().from(users).where(eq(users.name, q))`. Repo already uses this pattern in `routes/orders.ts:88`; mirror it.
- **Detected by:** semgrep `javascript.lang.security.audit.sqli.tagged-template-no-params`
````

In `--post-pr` mode, the same finding is rendered as a numbered list item with a sha1-pinned permalink to the line range, plus an HTML-comment marker (`<!-- security-audit:sha=... -->`) for deterministic dedup on subsequent pushes.

## Designed-in references

The skill draws on:

- **OWASP Top 10:2025** and **OWASP ASVS 5.0.** The [`owasp-security`](https://github.com/PrairieAster-Ai/claude-code-skills) skill is a complementary deep-reference companion.
- **MITRE ATT&CK** for technique tagging
- **CWE Top 25** for category mapping
- **Anthropic's published `claude-code-security-review`** prompt and findings filter (baseline)
- **Semgrep AI-powered Memories**, **Snyk CodeReduce**, **GitHub Copilot Autofix**, **Vercel Agent**, **Greptile**, **Cursor Bugbot/Security MCP** for specific design patterns

## Threat model

The skill itself is a target:

1. **Prompt injection from PR-introduced files.** Fixed-rubric verification prompt; PR content is evidence, never instructions.
2. **PR-introduced tool config** (e.g., malicious `.semgrep.yml`). Explicit `--config=p/default`, never honor PR config.
3. **Patch application in `--fix` mode.** Always on a scratch worktree, never the working tree.

See `references/threat-model.md` for the full list.

## Companion skills

`/security-audit` is **deliberately scoped to security only**. Run it alongside a general code reviewer for full coverage. The boundaries are non-overlapping by design.

| Skill | Owns | Doesn't own |
|---|---|---|
| **`/security-audit`** (this skill) | Injection, authn/authz, crypto, secrets, supply chain, ASVS findings, SSRF, deserialization, XSS in unsafe escape hatches | Bugs, lint, type errors, style, test coverage, perf, docs |
| **`/security-review`** (bundled in Claude Code) | LLM-only diff review with 21-rule exclusion list and 0.7 confidence floor | No tools, no memories, no fixes |
| **`/code-review`** (marketplace plugin: `claude-plugins-official/code-review`) | Bugs, CLAUDE.md compliance, git-history context, prior-PR comments, code-comment guidance | General security issues (explicit exclusion in its prompt. Defers to a dedicated security reviewer) |
| **`/review`** (bundled in Claude Code) | Quick conversational PR review. Broad scope | Single-pass, no agent fleet |
| **`/code-quality`** (this collection) | Lint, type-check, coverage, duplication, complexity | Anything diff-specific |
| **`/owasp-security`** (companion) | Deep OWASP Top 10:2025 / ASVS 5.0 / Agentic AI 2026 reference for implementing controls | Diff review |
| **`/semgrep-rule-creator`** ([trailofbits/skills](https://github.com/trailofbits/skills/tree/main/plugins/semgrep-rule-creator)) | Test-driven Semgrep rule authoring (positive/negative test corpus, AST inspection, `semgrep --test` iteration loop) | Running the rule against a real diff |
| **`/semgrep-rule-variant-creator`** ([trailofbits/skills](https://github.com/trailofbits/skills/tree/main/plugins/semgrep-rule-variant-creator)) | Porting an existing Semgrep rule across languages | Authoring the rule in the first place |

### Authoring custom rules for your repo

The most common gap in `/security-audit` output is missing project-specific patterns. Semgrep's registry packs (`p/default`, `p/typescript`, `p/react`, etc.) catch the common classes but not your stack's idioms. For a typical stack that might mean your ORM's raw-query escape hatches, service-role/admin credential bypasses, and your app's auth middleware. Generic rules miss these. Hand-rolled rules catch them and produce zero false positives because they encode actual project knowledge.

**Workflow:**

1. `/security-audit` flags a finding (or you spot a pattern by hand).
2. Delegate to `/semgrep-rule-creator` with: a positive example (vulnerable snippet), a negative example (the safe version that the repo already uses elsewhere), and a one-line description of the pattern.
3. The rule-creator skill drafts a rule, runs `semgrep --test` against your corpus, iterates until both tests pass.
4. Commit the resulting rule to `.semgrep/repo-rules.yml` in your project.
5. `/security-audit` picks it up automatically on the next run via `--config=.semgrep/`.

**When to delegate:** anytime `/security-audit` produces a fix for a class of bug that could recur. The fix patches one instance; a rule catches every future instance.

**Example invocation pattern:**

```
You: I just fixed a Drizzle raw-query SQL injection in users.ts:42.
     /semgrep-rule-creator: author a rule that catches this pattern across the repo.

     Positive test (should fire):
       db.execute(sql`SELECT * FROM users WHERE name = ${req.query.q}`)

     Negative test (must NOT fire):
       db.select().from(users).where(eq(users.name, req.query.q))

     Description: Drizzle sql template literal interpolating user input from req.*
```

The rule-creator skill is maintained by Trail of Bits (the security firm). We depend on it rather than reinventing test-first rule authoring inside this skill.

### Recommended workflow

```
1. Pre-push (local)
   └─ /security-audit              # catch vulns before they leave your laptop

2. PR opened
   ├─ /security-audit --post-pr N  # post security findings as a PR comment (CI or manual)
   └─ /code-review N               # marketplace plugin — posts bugs/CLAUDE.md as a separate PR comment

3. Merge gate (CI)
   └─ /security-audit --tools-only # per-tool SARIF → GitHub Code Scanning
```

Three independent signals on the same PR, no duplicated findings.

### CLAUDE.md "Review ownership" pattern

To make the boundary explicit per-repo, add this to your `CLAUDE.md`:

```markdown
## Review ownership
- /security-audit owns: injection, authn/authz, crypto, secrets, supply chain
- /code-review owns: bugs, CLAUDE.md compliance, historical context
- Neither owns: lint, type errors, formatting, test coverage (CI handles these)
```

Both skills read CLAUDE.md and will respect this boundary.

### Shared context files

| File | Read by | Purpose |
|---|---|---|
| `CLAUDE.md`, `AGENTS.md`, `.cursorrules` | both skills | Repo conventions |
| `.claude/security-memories.md` | `/security-audit` only | Per-repo FP suppressions for security findings |
| `.claude/security-config.yaml` | `/security-audit` only | Per-repo exclusion / enable overrides |

## Limitations

- **No whole-repo graph index.** Greptile-style graph grounding would improve reachability calls but requires infra beyond Claude Code's built-ins. The skill compensates with `Grep`/`Glob` + lang-specific tools.
- **Custom rule packs aren't shipped here.** Defaults use Semgrep's `p/default`. Add `--config=p/your-custom-pack` to the skill invocation for your team's rules.
- **No persistent cross-PR findings store.** Cursor's Security MCP pattern (Lambda + classifier) would be a follow-up.

## Files

| File | Purpose |
|---|---|
| `SKILL.md` | Main skill prompt with full workflow |
| `scripts/security_audit.py` | Deterministic CLI for scanners, artifacts, and CI integration |
| `references/tools.md` | Tool-by-tool comparison + install + scope-to-diff commands |
| `references/exclusions.md` | The 25-rule hard exclusion list with rationale |
| `references/asvs-chapter-map.md` | Touched-chapter detection patterns |
| `references/threat-model.md` | Threats against the skill |
| `references/memories-template.md` | Starter `.claude/security-memories.md` |

## License

Same as the parent repo.
