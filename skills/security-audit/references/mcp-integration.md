# Semgrep MCP integration

## Status as of 2026-05-14: no OSS MCP path is currently available

Empirical findings from running `pip install semgrep-mcp` (v0.9.0) and `semgrep mcp` (v1.163.0) on a fresh setup:

| Path | Status | Why |
|---|---|---|
| `uvx semgrep-mcp` / `pipx install semgrep-mcp` | **Deprecated.** The 0.9.0 release exposes a single `deprecation_notice` tool and rejects all other calls. | Semgrep retired the standalone Python MCP server. |
| `semgrep mcp` (built into the binary) | **Pro Engine required.** Returns `MCP subcommand requires Pro Engine--make sure you are using the proprietary semgrep binary.` | OSS binary doesn't include the MCP subcommand. |
| `mcp.semgrep.ai` hosted server | **Deprecated.** Same retirement notice as the standalone package. | — |

**Net effect:** there's no working OSS Semgrep MCP server for this skill to use today. The subprocess path (the default in `<skill>/scripts/security_audit.py`) is the only working option.

### Validation snippet

To reproduce this on your own setup:

```bash
# 1. The deprecated standalone returns only a notice:
pipx install semgrep-mcp
python3 -c "
import subprocess, json
p = subprocess.Popen(['semgrep-mcp'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
def send(r): p.stdin.write(json.dumps(r)+'\n'); p.stdin.flush()
def recv(): return json.loads(p.stdout.readline())
send({'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2024-11-05','capabilities':{},'clientInfo':{'name':'p','version':'0'}}}); recv()
send({'jsonrpc':'2.0','method':'notifications/initialized','params':{}})
send({'jsonrpc':'2.0','id':2,'method':'tools/list','params':{}})
print(json.dumps(recv().get('result',{}).get('tools',[]), indent=2))
"
# Output: only `deprecation_notice` is exposed.

# 2. The built-in subcommand requires Pro:
semgrep mcp  # ERROR: MCP subcommand requires Pro Engine
```

## What this means for the skill

- **`<skill>/scripts/security_audit.py --use-mcp` will fall back to subprocess silently** because the MCP server can't be spawned (or returns no useful tools). That's the right behavior; no remediation needed at the script level.
- **The `--use-mcp` flag stays in place** because Semgrep may re-publish an OSS path in the future, and users on Pro Engine *can* use it today via `semgrep mcp`.
- **The subprocess path is the default and works fine** with `semgrep scan --config=p/default --metrics=off --sarif`. See SKILL.md Phase 2.

If you have a Pro Engine license, the integration pattern below remains the target architecture.

---

## Original integration plan (target architecture, blocked on OSS MCP availability)

The Semgrep MCP server, when available, would expose seven tools. Where the current `<skill>/scripts/security_audit.py` invokes Semgrep via subprocess, the same operations could run through the MCP protocol with better error handling, typed responses, and access to capabilities that subprocess doesn't expose.

### What the Semgrep MCP server exposes

| Tool | Purpose | Replaces subprocess of |
|---|---|---|
| `semgrep_scan` | Scan a directory or files against a named rule pack | `semgrep scan --config=X` |
| `semgrep_scan_with_custom_rule` | Scan against a custom rule YAML | `semgrep scan --config=<file>` |
| `security_check` | Bundled "best practice" scan with a default rule set | `semgrep scan --config=auto` |
| `get_abstract_syntax_tree` | Inspect the AST of a code snippet for any supported language | (no subprocess equivalent) |
| `semgrep_findings` | Pull historical findings from a connected AppSec Platform tenant | (requires login) |
| `get_supported_languages` | List languages Semgrep can scan | `semgrep show supported-languages` |
| `semgrep_rule_schema` | Return the rule YAML grammar with examples | (no subprocess equivalent) |

The two that justify the pivot:

- **`get_abstract_syntax_tree`** lets the rule-authoring flow inspect the actual AST before drafting patterns. Subprocess Semgrep doesn't expose this.
- **`semgrep_rule_schema`** lets the LLM look up the grammar before writing a rule, instead of guessing. Used by Trail of Bits' `semgrep-rule-creator` skill internally.

### Integration pattern (when MCP works)

Three tiers, in order of preference:

#### Tier 1: Claude Code with Semgrep MCP server configured

```json
{
  "mcpServers": {
    "semgrep": {
      "command": "semgrep",
      "args": ["mcp"]
    }
  }
}
```

Currently requires a Pro Engine license. The previous `uvx semgrep-mcp` invocation no longer works.

#### Tier 2: Script calls MCP server via stdio

`<skill>/scripts/security_audit.py --use-mcp` attempts to spawn the MCP server as a subprocess. The implementation in `<skill>/scripts/mcp_client.py` correctly speaks the MCP wire protocol (including the `notifications/initialized` post-handshake notification — the bug we found and fixed during validation). On OSS setups today it falls back to subprocess transparently.

#### Tier 3: Plain subprocess (current default)

Works without any MCP server. This is the path everyone uses right now.

## Roadmap

- [x] Document the integration pattern.
- [x] Add `<skill>/scripts/mcp_client.py` as a thin stdio JSON-RPC client.
- [x] Add `--use-mcp` flag to `scan` subcommand; route through MCP when set.
- [x] Validate the MCP path against a real server install (this discovered the OSS deprecation).
- [ ] Re-validate when Semgrep re-publishes an OSS MCP path (track at https://mcp.semgrep.ai/).
- [ ] If Pro Engine becomes part of the team's stack, swap `command: "uvx"` → `command: "semgrep"` in the recommended `mcp.json`.

## Reading list

- [Semgrep MCP server (deprecated standalone)](https://github.com/semgrep/mcp)
- [Pro-engine `semgrep mcp` announcement / docs](https://mcp.semgrep.ai/) — landing page that explains the move
- [Semgrep blog: Cursor Hooks + MCP](https://semgrep.dev/blog/2025/cursor-hooks-mcp-server/) (predates the deprecation; valuable for the integration patterns)
- [MCP specification](https://spec.modelcontextprotocol.io/)
- [Trail of Bits semgrep-rule-creator skill](https://github.com/trailofbits/skills/tree/main/plugins/semgrep-rule-creator) — assumed MCP availability; same deprecation will affect them
