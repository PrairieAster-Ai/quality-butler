# ASVS 5.0 touched-chapter map

Don't load all 286 ASVS requirements on every review. Detect which chapters the diff touches, then load only those.

Each row: regex (case-insensitive) → ASVS V5.0 chapter(s) to include in the verification prompt.

| Diff signal | Load chapter(s) | Why |
|---|---|---|
| `jwt`, `session`, `bcrypt`, `argon2`, `oauth`, `passport`, `next-auth`, `clerk`, `auth0`, `descope`, `lucia`, `supabase.auth` | V6 (Authentication), V7 (Session) | Identity & session lifecycle |
| `crypto.subtle`, `WebCrypto`, `node:crypto`, `pycryptodome`, `openssl`, `KMS`, `AWS::KMS`, `secretsmanager`, `vault.read`, `signWith`, `verify(` | V11 (Cryptography) | Algorithm selection, key management |
| `Drizzle`, `Prisma`, `knex`, `sequelize`, `mongoose`, `mongodb.collection`, raw `SELECT`/`UPDATE`/`DELETE`/`INSERT`, `db.query(`, `cursor.execute(`, string concatenation into SQL | V5 (Validation, Sanitization, Encoding) | Injection |
| `dangerouslySetInnerHTML`, `bypassSecurityTrust*`, `innerHTML`, `document.write`, `v-html`, `\{\{\{` Handlebars, `\|safe` Jinja, `Markup(` Flask | V5 (XSS) | DOM injection |
| `child_process`, `subprocess`, `os.system`, `shell=True`, `exec(`, `eval(`, `pickle.loads`, `yaml.load` (unsafe), `marshal.loads`, `Marshaller.unmarshal` | V5 (Injection), V12 (Files & Resources) | Code execution |
| `fetch(`, `axios`, `requests.`, `urllib`, `http.get`, `node-fetch`, URL coming from user input | V10 (Communication), SSRF subsection of V5 | SSRF, TLS verification |
| `multer`, `formidable`, `file_get_contents`, `path.join(req.`, `os.path.join`, `extractall`, `tarfile.extract`, `zip.extract` | V12 (Files & Resources) | Path traversal, zip-slip |
| `Dockerfile`, `*.tf`, `*.yaml` under `k8s/` or `helm/`, `vercel.json`, `vercel.ts` | V14 (Configuration) | Infra config |
| `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `requirements.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `Gemfile` | V8 (Data Protection. Supply chain), Supply chain pre-pass | New dependencies |
| `CORS`, `Access-Control-Allow-Origin`, `helmet`, `Content-Security-Policy`, `cookie` flags | V13 (API & Web Service Security) | Web headers, CORS |
| `RLS`, `row level security`, role checks, `if (user.role`, `requirePermission`, `casbin`, `oso`, `cancan` | V4 (Access Control) | Authorization logic |
| `log.info`/`logger.warn` with variable interpolation that may contain secrets, `console.log` of objects containing tokens | V9 (Logging & Error Handling) | Sensitive data in logs |

## Detection script

```bash
load_chapters() {
  local diff=$(git diff "$BASE"... -U0)
  local chapters=""
  echo "$diff" | grep -qiE 'jwt|session|bcrypt|argon2|oauth|passport|next-auth|clerk' && chapters+="V6 V7 "
  echo "$diff" | grep -qiE 'crypto\.subtle|node:crypto|pycryptodome|KMS|secretsmanager' && chapters+="V11 "
  echo "$diff" | grep -qiE 'drizzle|prisma|knex|sequelize|\.query\(|\.execute\(|SELECT|UPDATE|DELETE|INSERT' && chapters+="V5 "
  echo "$diff" | grep -qiE 'dangerouslySetInnerHTML|bypassSecurityTrust|innerHTML|document\.write|v-html' && chapters+="V5 "
  echo "$diff" | grep -qiE 'child_process|subprocess|os\.system|shell=True|exec\(|eval\(|pickle\.loads|yaml\.load' && chapters+="V5 V12 "
  echo "$diff" | grep -qiE 'fetch\(|axios|requests\.|urllib|http\.get|node-fetch' && chapters+="V10 "
  echo "$diff" | grep -qiE 'multer|formidable|file_get_contents|path\.join|extractall|tarfile\.extract' && chapters+="V12 "
  echo "$diff" | grep -qE 'Dockerfile|\.tf$|k8s/.*\.ya?ml$|helm/.*\.ya?ml$' && chapters+="V14 "
  echo "$diff" | grep -qE 'package\.json|package-lock|pnpm-lock|requirements\.txt|pyproject|go\.mod|Cargo\.toml' && chapters+="V8 "
  echo "$diff" | grep -qiE 'CORS|helmet|Content-Security-Policy|sameSite|httpOnly' && chapters+="V13 "
  echo "$diff" | grep -qiE 'RLS|row level security|user\.role|requirePermission|casbin|oso' && chapters+="V4 "
  echo "$chapters" | tr ' ' '\n' | sort -u | tr '\n' ' '
}
```

If `load_chapters` returns empty AND the pre-pass finds nothing, exit with "No security-relevant changes."

## ASVS 5.0 chapter quick reference

| Chapter | Title | Typical findings the LLM hunts for |
|---|---|---|
| V2 | Architecture | (rarely diff-triggered) |
| V4 | Access Control | IDOR, broken authz, missing tenant scoping |
| V5 | Validation, Sanitization, Encoding | SQLi, command injection, XSS, deserialization, template injection |
| V6 | Authentication | Bypass logic, weak password handling, MFA gaps |
| V7 | Session Management | Fixation, weak token entropy, missing `Secure`/`HttpOnly`/`SameSite` |
| V8 | Data Protection | Sensitive data at rest unencrypted, PII over-fetching |
| V9 | Logging & Error Handling | Secrets in logs, stack traces in responses |
| V10 | Communication | TLS verification disabled, weak ciphers, plaintext fallback |
| V11 | Cryptography | Weak algorithms (MD5/SHA1/DES/ECB), `Math.random` for tokens, missing IV reuse protection |
| V12 | Files & Resources | Path traversal, zip-slip, unsafe deserialization of uploads |
| V13 | API & Web Service | CORS misconfig, missing CSRF for cookie-auth, GraphQL introspection |
| V14 | Configuration | Hardcoded secrets in config, debug flags in prod, default credentials |

Full standard: <https://owasp.org/www-project-application-security-verification-standard/>
