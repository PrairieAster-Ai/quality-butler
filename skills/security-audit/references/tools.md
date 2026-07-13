# Tool reference

Curated, opinionated toolchain for the deterministic pre-pass. All recommendations are OSS, no API keys required (except where noted), and emit JSON or SARIF.

## Default stack (~25s on a 20-file PR)

| # | Tool | Purpose | Install | Diff-scoped command |
|---|---|---|---|---|
| 1 | **semgrep** | Multi-language SAST + OWASP/CWE | `pipx install semgrep` | `semgrep ci --baseline-commit="$(git merge-base HEAD origin/HEAD)" --sarif -o sr-semgrep.sarif --quiet` |
| 2 | **gitleaks** | Secrets in the diff | `brew install gitleaks` | `gitleaks git --report-format sarif --report-path sr-gitleaks.sarif --log-opts="origin/HEAD..HEAD"` |
| 3 | **osv-scanner** | SCA across manifests | `brew install osv-scanner` | `osv-scanner scan source --format=sarif --output=sr-osv.sarif --recursive .` |
| 4 | **lizard** | Complexity hotspots | `pipx install lizard` | `lizard -X $(git diff --name-only origin/HEAD...) > sr-lizard.xml` |

## Conditional add-ons

| Condition | Tool | Purpose | Command |
|---|---|---|---|
| `Dockerfile` / `*.tf` / `k8s/*.yaml` | **trivy** | IaC + container | `trivy config --format=sarif -o sr-trivy-iac.sarif .` |
| `package.json` / `requirements.txt` / `go.mod` changed | **socket** | Supply-chain / typosquat | `socket scan create --json . > sr-socket.json`. Requires `socket login` once (free tier OK). Skip silently if unauthenticated. |
| `*.py` in diff | **bandit** | Python SAST | `bandit -r <files> -f sarif -o sr-bandit.sarif --quiet` |
| `*.py` deps changed | **pip-audit** | Python SCA | `pip-audit -f json -o sr-pip-audit.json` |
| `*.go` in diff | **govulncheck** | Go SCA + reachability | `govulncheck -format sarif ./... > sr-govulncheck.sarif` |
| `*.ts` / `*.tsx` / `*.js` / `*.jsx` | **eslint-plugin-security** | JS/TS security lint | `npx eslint --plugin security --format @microsoft/eslint-formatter-sarif -o sr-eslint-sec.sarif <files>` |
| Suspicious `*.go` patterns | **gosec** | Go SAST | `gosec -fmt=sarif -out=sr-gosec.sarif ./...` |
| `--deep` mode | **trufflehog** | Verified secrets (whole history) | `trufflehog git file://. --only-verified --json` |

## Alternates considered

| Category | Primary | Alternates | Verdict |
|---|---|---|---|
| Multi-lang SAST | semgrep | CodeQL CLI, Snyk Code | CodeQL is precise but slow; Snyk requires login |
| Secrets | gitleaks | trufflehog, detect-secrets | gitleaks for SARIF + speed; trufflehog `--only-verified` complements |
| SCA | osv-scanner | trivy fs, Grype | trivy good for combined IaC+SCA in one invocation; osv-scanner cleaner for SCA alone |
| IaC | trivy | checkov | checkov is deeper for Terraform; trivy folds in containers + tfsec coverage |

## Avoid list

| Tool | Why |
|---|---|
| `safety` (Python) | Requires login since v3.x → fragile in CI |
| `tfsec` standalone | Archived, folded into trivy |
| `npm-audit-resolver` | Interactive only |
| `npq` | Unmaintained since 2024 |
| `kics` | Noisy unless you specifically need its breadth |
| `npm audit --json` | Schema unstable, no CWE mapping |
| `FOSSA CLI` | Requires API key + project setup |

## OWASP / CWE / ATT&CK mapping

- **Semgrep** rules carry `metadata.cwe` and `metadata.owasp`. Surfaces in SARIF as `properties.tags`.
- **Bandit, gosec, checkov** emit CWE IDs in SARIF `properties.cwe`.
- **gitleaks** → map to CWE-798 (Use of Hard-coded Credentials).
- **osv-scanner** → map to CWE-1395 (Dependency on Vulnerable Third-Party Component) + OWASP A06:2025.
- **ATT&CK** mapping is a post-processing step the skill does itself. Small lookup from `(category, sink)` → technique ID. Example:
  - Hardcoded token → T1552 (Credential Access)
  - `curl | bash` in Dockerfile → T1059 (Execution)
  - Obfuscated `postinstall` → T1048 (Exfiltration)
  - SQL injection in a user-facing route → T1190 (Exploit Public-Facing Application)

## Combined SARIF for the LLM only

```bash
jq -s '{runs: map(.runs[]?)}' /tmp/sr-*.sarif > /tmp/sr-combined.json
```

This combined file is fed to the verification prompt. **Never re-upload it.** Since GitHub's 2025-07-21 change, code scanning rejects multiple runs sharing `tool.driver.name + runAutomationDetails.id`. Upload each tool's SARIF separately with distinct `tool_name` / `category`.
