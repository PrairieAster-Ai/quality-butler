# Hard exclusion list

These categories are **never reported**, regardless of confidence. Adapted from Anthropic's `claude-code-security-review` filter, extended with patterns from Cursor, Semgrep, and CodeRabbit production data.

The bar: every finding should be something a security engineer would confidently raise in a PR review. If a category routinely produces noise without actionable fixes, it lives here.

| # | Excluded | Rationale |
|---|---|---|
| 1 | Denial of Service / resource exhaustion / rate limiting | Handled by infra (WAF, load balancer, k8s limits), not code review |
| 2 | Memory / CPU exhaustion | Same. Infra concern, and most are theoretical |
| 3 | Secrets stored on disk if otherwise secured | Other processes (env-secrets-manager, gitleaks history scan) handle these |
| 4 | Lack of input validation on non-security-critical fields | Type checks belong to lint/type-check, not security review |
| 5 | GitHub Actions input sanitization unless concretely triggerable by untrusted input | Most flagged GH Action issues are not reachable in practice |
| 6 | "Lack of hardening" | Code is not required to implement every best practice; flag concrete vulns only |
| 7 | Theoretical race conditions / timing attacks without concrete attack path | Need a real scenario |
| 8 | Outdated third-party libraries | Tracked by SCA tooling as its own SARIF run, not duplicated here |
| 9 | Memory safety in memory-safe languages (Rust, Go, JS/TS, Python, Java, C#) | Impossible in these languages |
| 10 | Files that are only unit tests or test helpers | Test code is not production attack surface |
| 11 | Log spoofing (unsanitized user input to logs) | Not a vulnerability. Logs are a record of attacker behavior |
| 12 | Path-only SSRF | SSRF is only meaningful when host or protocol is attacker-controlled |
| 13 | User-controlled content inside AI system prompts | Different threat model. Not a code vuln in the traditional sense |
| 14 | Regex injection / ReDoS | Most are non-exploitable in practice; treated as code quality |
| 15 | Findings in documentation files (`*.md`, `*.mdx`, `*.rst`) | Docs are not executed |
| 16 | Lack of audit logs | Architectural concern, not a code vuln |
| 17 | Tabnabbing, XS-Leaks, prototype pollution, open redirects | Low-impact web vulns; only report at very high confidence |
| 18 | XSS in React / Angular / Vue 3 templates | Framework auto-escapes; exception when `dangerouslySetInnerHTML` / `bypassSecurityTrust*` / `v-html` is used |
| 19 | Client-side authentication / permission checks | Server is responsible. Client checks are UX, not security |
| 20 | Command injection in shell scripts | Most shell scripts don't take untrusted input; require concrete attack path |
| 21 | Vulnerabilities in `.ipynb` notebooks | Most are not exploitable in practice; require concrete attack path |
| 22 | Logging non-PII data, even if "sensitive feeling" | Only flag if it exposes secrets, passwords, or PII |
| 23 | UUIDs treated as guessable | UUIDs (v4+) are assumed unguessable; don't require additional validation |
| 24 | Attacks that rely on controlling an environment variable | Env vars and CLI flags are trusted inputs |
| 25 | Resource leaks (memory, file descriptors) | Not security vulnerabilities |

## File-extension overrides

| Category | Applies only to |
|---|---|
| Buffer overflows / use-after-free | `*.c`, `*.cc`, `*.cpp`, `*.h`, `*.hpp` |
| SSRF | Server-side code (`.ts`, `.js`, `.py`, `.go`, `.rb`, `.java`, `.cs`, `.rs`, `.php`). Never `.html`, `.md` |
| SQL injection | Files containing SQL keywords or ORM imports. Never `.md` |

## Per-repo overrides

Each repo can extend or override via `.claude/security-config.yaml`:

```yaml
exclusions:
  # Suppress a category entirely for this repo
  - category: ssrf
    reason: "API is behind an egress proxy that blocks all non-allowlisted destinations"

  # Suppress a specific rule
  - rule: javascript.lang.security.audit.xss.template-injection
    paths: ["packages/internal-tools/**"]
    reason: "Internal-only admin tool, threat model excludes XSS"

  # Enable a category that's off by default
  enable:
    - dos    # we run user-supplied code; DoS is in-scope here
```

## Confidence-based behavior

- **Below 0.7.** Drop silently
- **0.7–0.8.** Include only if no exclusion matches AND severity ≥ Medium
- **0.8–0.9.** Include
- **0.9–1.0.** Include and eligible for `--fix` mode
