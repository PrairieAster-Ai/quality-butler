#!/usr/bin/env python3
"""
Deterministic security audit runner extracted from the security-audit skill.

This script handles the tool-driven portion of the workflow:
- diff discovery
- tool selection
- scanner execution
- SARIF/JSON artifact collection
- markdown/json summary generation
- optional PR commenting

It intentionally does not attempt LLM verification, deduplication, or patching.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = ROOT / ".artifacts" / "security-audit"


@dataclass
class CommandResult:
    name: str
    command: list[str]
    artifact: str | None
    status: str
    returncode: int | None
    findings: int | None
    stdout: str
    stderr: str
    skipped_reason: str | None = None


def run(cmd: list[str], check: bool = True, capture: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        capture_output=capture,
        check=check,
    )


def command_exists(name: str) -> bool:
    return shutil.which(name) is not None


def git_changed_files(base: str) -> list[str]:
    try:
        result = run(["git", "diff", "--name-only", f"{base}..."])
    except subprocess.CalledProcessError as exc:
        raise SystemExit(exc.stderr.strip() or exc.stdout.strip() or f"git diff failed for base {base}")
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def merge_base(base: str) -> str:
    try:
        result = run(["git", "merge-base", "HEAD", base])
    except subprocess.CalledProcessError as exc:
        raise SystemExit(exc.stderr.strip() or exc.stdout.strip() or f"git merge-base failed for base {base}")
    return result.stdout.strip()


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def load_json(path: Path) -> dict | list | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def count_sarif_findings(path: Path) -> int | None:
    payload = load_json(path)
    if not isinstance(payload, dict):
        return None
    count = 0
    for run_item in payload.get("runs", []):
        if isinstance(run_item, dict):
            results = run_item.get("results", [])
            if isinstance(results, list):
                count += len(results)
    return count


def count_socket_findings(path: Path) -> int | None:
    payload = load_json(path)
    if isinstance(payload, dict):
        if isinstance(payload.get("issues"), list):
            return len(payload["issues"])
        if isinstance(payload.get("findings"), list):
            return len(payload["findings"])
    return None


def count_artifact_findings(path: Path) -> int | None:
    if not path.exists():
        return None
    if path.suffix == ".sarif":
        return count_sarif_findings(path)
    if path.suffix == ".json":
        return count_socket_findings(path)
    return None


def run_tool(
    name: str,
    command: list[str],
    artifact: Path | None,
    required_binary: str,
) -> CommandResult:
    if not command_exists(required_binary):
        return CommandResult(
            name=name,
            command=command,
            artifact=str(artifact) if artifact else None,
            status="skipped",
            returncode=None,
            findings=None,
            stdout="",
            stderr="",
            skipped_reason=f"missing dependency: {required_binary}",
        )

    try:
        result = run(command, check=False)
    except OSError as exc:
        return CommandResult(
            name=name,
            command=command,
            artifact=str(artifact) if artifact else None,
            status="error",
            returncode=None,
            findings=None,
            stdout="",
            stderr=str(exc),
        )

    findings = count_artifact_findings(artifact) if artifact else None
    status = "ok" if result.returncode == 0 else "warning"

    return CommandResult(
        name=name,
        command=command,
        artifact=str(artifact) if artifact else None,
        status=status,
        returncode=result.returncode,
        findings=findings,
        stdout=result.stdout,
        stderr=result.stderr,
    )


def detect_categories(files: Iterable[str]) -> dict[str, bool]:
    files = list(files)
    return {
        "python": any(file.endswith(".py") for file in files),
        "go": any(file.endswith(".go") for file in files),
        "js": any(file.endswith((".js", ".jsx", ".ts", ".tsx")) for file in files),
        "iac": any(
            file == "Dockerfile"
            or file.endswith(".tf")
            or file.startswith("k8s/")
            or file.startswith("helm/")
            for file in files
        ),
        "deps": any(
            Path(file).name in {
                "package.json",
                "package-lock.json",
                "requirements.txt",
                "pyproject.toml",
                "go.mod",
                "Cargo.toml",
            }
            for file in files
        ),
    }


def build_tool_plan(base: str, changed_files: list[str], output_dir: Path, deep: bool) -> list[tuple[str, list[str], Path | None, str]]:
    mb = merge_base(base)
    categories = detect_categories(changed_files)
    plan: list[tuple[str, list[str], Path | None, str]] = []

    semgrep_out = output_dir / "semgrep.sarif"
    # `semgrep ci` requires `semgrep login`; `--config=auto` requires
    # metrics enabled. Use `--config=p/default` (the curated registry
    # pack) with metrics off — works locally and in CI without any
    # account or telemetry. The MCP path (--use-mcp) bypasses this.
    plan.append(
        (
            "semgrep",
            [
                "semgrep",
                "scan",
                "--config=p/default",
                f"--baseline-commit={mb}",
                "--sarif",
                f"--sarif-output={semgrep_out}",
                "--metrics=off",
                "--quiet",
            ],
            semgrep_out,
            "semgrep",
        )
    )

    gitleaks_out = output_dir / "gitleaks.sarif"
    # Resolve symbolic refs (origin/HEAD) to a concrete SHA before passing to
    # --log-opts; some gitleaks versions choke on two-dot ranges with symbolic
    # refs.
    plan.append(
        (
            "gitleaks",
            [
                "gitleaks",
                "git",
                "--report-format",
                "sarif",
                "--report-path",
                str(gitleaks_out),
                f"--log-opts={mb}..HEAD",
                "--no-banner",
            ],
            gitleaks_out,
            "gitleaks",
        )
    )

    osv_out = output_dir / "osv.sarif"
    plan.append(
        (
            "osv-scanner",
            [
                "osv-scanner",
                "scan",
                "source",
                "--format=sarif",
                f"--output={osv_out}",
                "--recursive",
                ".",
            ],
            osv_out,
            "osv-scanner",
        )
    )

    if changed_files:
        lizard_out = output_dir / "lizard.xml"
        plan.append(
            (
                "lizard",
                ["lizard", "-X", *changed_files],
                lizard_out,
                "lizard",
            )
        )

    if categories["iac"]:
        trivy_out = output_dir / "trivy-config.sarif"
        plan.append(
            (
                "trivy",
                ["trivy", "config", "--format=sarif", f"-o={trivy_out}", "."],
                trivy_out,
                "trivy",
            )
        )

    if categories["deps"]:
        socket_out = output_dir / "socket.json"
        plan.append(
            (
                "socket",
                ["socket", "scan", "create", "--json", "."],
                socket_out,
                "socket",
            )
        )

    if categories["python"]:
        python_files = [file for file in changed_files if file.endswith(".py")]
        bandit_out = output_dir / "bandit.sarif"
        plan.append(
            (
                "bandit",
                ["bandit", "-r", *python_files, "-f", "sarif", "-o", str(bandit_out), "--quiet"],
                bandit_out,
                "bandit",
            )
        )

    if categories["go"]:
        govuln_out = output_dir / "govulncheck.sarif"
        plan.append(
            (
                "govulncheck",
                ["govulncheck", "-format", "sarif", "./..."],
                govuln_out,
                "govulncheck",
            )
        )

    if categories["js"]:
        js_files = [file for file in changed_files if file.endswith((".js", ".jsx", ".ts", ".tsx"))]
        eslint_out = output_dir / "eslint-security.sarif"

        # ESLint flat config resolves imported plugins relative to the config
        # file's own directory, NOT relative to npx's install cache. So
        # `npx --yes -p eslint-plugin-security eslint --config /elsewhere/cfg.mjs`
        # always errors with "Cannot find package 'eslint-plugin-security'".
        #
        # Fix: set up a proper sibling project at output_dir/eslint-runner
        # with its own package.json + node_modules. After the first invocation,
        # `npm install` is a no-op and subsequent runs are fast.
        eslint_dir = output_dir / "eslint-runner"
        eslint_dir.mkdir(parents=True, exist_ok=True)
        (eslint_dir / "package.json").write_text(
            json.dumps(
                {
                    "name": "sr-eslint-runner",
                    "version": "0.0.0",
                    "private": True,
                    "dependencies": {
                        "eslint": "^9.0.0",
                        "eslint-plugin-security": "^3.0.0",
                        "@microsoft/eslint-formatter-sarif": "^3.0.0",
                    },
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        (eslint_dir / "config.mjs").write_text(
            "import security from 'eslint-plugin-security';\n"
            "export default [{\n"
            "  plugins: { security },\n"
            "  rules: {\n"
            "    'security/detect-eval-with-expression': 'error',\n"
            "    'security/detect-non-literal-fs-filename': 'warn',\n"
            "    'security/detect-child-process': 'error',\n"
            "    'security/detect-unsafe-regex': 'warn',\n"
            "  },\n"
            "}];\n",
            encoding="utf-8",
        )
        # First-run install. After this lands the node_modules dir is cached
        # in the artifact tree, so subsequent runs reuse it.
        if not (eslint_dir / "node_modules" / "eslint-plugin-security").exists():
            try:
                subprocess.run(
                    ["npm", "install", "--silent", "--no-audit", "--no-fund", "--no-progress"],
                    cwd=eslint_dir,
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
            except (OSError, subprocess.TimeoutExpired):
                pass  # fall through; the eslint step will report missing deps

        # ESLint v9's flat-config base-path check ignores files outside cwd.
        # We run with cwd=ROOT (project root, set by run_tool) and pass file
        # paths as relative to ROOT. The eslint binary, config, and formatter
        # are referenced by absolute path so the resolution works regardless.
        # `--no-warn-ignored` silences harmless warnings about paths that look
        # outside cwd to eslint's heuristics.
        formatter_path = (
            eslint_dir / "node_modules" / "@microsoft" / "eslint-formatter-sarif" / "sarif.js"
        )

        plan.append(
            (
                "eslint-security",
                [
                    str(eslint_dir / "node_modules" / ".bin" / "eslint"),
                    "--no-warn-ignored",
                    "--config",
                    str(eslint_dir / "config.mjs"),
                    "--format",
                    str(formatter_path),
                    "-o",
                    str(eslint_out),
                    *js_files,  # relative to ROOT (project root) — run_tool sets cwd=ROOT
                ],
                eslint_out,
                str(eslint_dir / "node_modules" / ".bin" / "eslint"),
            )
        )

    if deep:
        trufflehog_out = output_dir / "trufflehog.json"
        plan.append(
            (
                "trufflehog",
                ["trufflehog", "git", "file://.", "--only-verified", "--json"],
                trufflehog_out,
                "trufflehog",
            )
        )

    return plan


def persist_artifact_output(result: CommandResult, plan_artifact: Path | None) -> None:
    if result.name == "lizard" and plan_artifact:
        write_text(plan_artifact, result.stdout)
    elif result.name in {"govulncheck", "socket", "trufflehog"} and plan_artifact:
        write_text(plan_artifact, result.stdout)


def make_summary(base: str, changed_files: list[str], results: list[CommandResult]) -> dict:
    total_findings = 0
    findings_known = 0
    for result in results:
        if result.findings is not None:
            findings_known += 1
            total_findings += result.findings

    return {
        "base": base,
        "changed_files": changed_files,
        "changed_file_count": len(changed_files),
        "total_findings": total_findings if findings_known else None,
        "tool_results": [
            {
                "name": result.name,
                "status": result.status,
                "returncode": result.returncode,
                "findings": result.findings,
                "artifact": result.artifact,
                "command": result.command,
                "skipped_reason": result.skipped_reason,
            }
            for result in results
        ],
    }


def summary_markdown(summary: dict) -> str:
    lines = [
        "# Security Audit Summary",
        "",
        f"- Base: `{summary['base']}`",
        f"- Changed files: `{summary['changed_file_count']}`",
        f"- Total findings: `{summary['total_findings'] if summary['total_findings'] is not None else 'unknown'}`",
        "",
        "| Tool | Status | Findings | Artifact |",
        "|---|---|---:|---|",
    ]
    for tool in summary["tool_results"]:
        artifact = tool["artifact"] or "-"
        findings = tool["findings"] if tool["findings"] is not None else "-"
        status = tool["status"]
        if tool["skipped_reason"]:
            status = f"{status} ({tool['skipped_reason']})"
        lines.append(f"| {tool['name']} | {status} | {findings} | `{artifact}` |")
    if summary["changed_files"]:
        lines.extend(["", "## Changed Files", ""])
        lines.extend([f"- `{path}`" for path in summary["changed_files"]])
    return "\n".join(lines) + "\n"


def _try_mcp_scan(args: argparse.Namespace, changed_files: list[str], output_dir: Path) -> dict | None:
    """Attempt to run the Semgrep portion of the audit via MCP.

    Returns a CommandResult-like dict for the semgrep tool on success, or
    None if MCP is unavailable / failed (caller falls back to subprocess).

    Only handles the Semgrep call; gitleaks/osv-scanner/etc. remain on the
    subprocess path. See `references/mcp-integration.md` for the migration
    plan.
    """
    if not getattr(args, "use_mcp", False):
        return None
    try:
        from mcp_client import SemgrepMCPClient, is_available, SemgrepMCPError
    except ImportError:
        return None
    if not is_available():
        return None

    semgrep_out = output_dir / "semgrep.sarif"
    try:
        with SemgrepMCPClient.spawn() as client:
            mb = merge_base(args.base)
            # The semgrep_scan tool takes path + config. We use --config=auto
            # for parity with the recommended subprocess invocation.
            result = client.call(
                "semgrep_scan",
                {
                    "path": str(ROOT),
                    "config": "auto",
                    "baseline_commit": mb,
                    "sarif_output": str(semgrep_out),
                },
            )
        return {
            "name": "semgrep (via MCP)",
            "status": "ok",
            "returncode": 0,
            "findings": count_artifact_findings(semgrep_out),
            "artifact": str(semgrep_out),
            "skipped_reason": None,
            "command": ["mcp:semgrep_scan", "--config=auto"],
        }
    except SemgrepMCPError as exc:
        # MCP path failed; let the caller fall through to subprocess.
        return {
            "name": "semgrep (via MCP)",
            "status": "warning",
            "returncode": None,
            "findings": None,
            "artifact": None,
            "skipped_reason": f"MCP error, falling back to subprocess: {exc}",
            "command": ["mcp:semgrep_scan"],
        }


def cmd_scan(args: argparse.Namespace) -> int:
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    changed_files = git_changed_files(args.base)
    if not changed_files:
        summary = {
            "base": args.base,
            "changed_files": [],
            "changed_file_count": 0,
            "total_findings": 0,
            "tool_results": [],
            "message": f"No changes vs {args.base}",
        }
        write_text(output_dir / "summary.json", json.dumps(summary, indent=2) + "\n")
        write_text(output_dir / "summary.md", "# Security Audit Summary\n\nNo changes to audit.\n")
        print(f"No changes vs {args.base}")
        return 0

    results: list[CommandResult] = []

    # MCP-aware Semgrep path: if --use-mcp is set, try to route Semgrep through
    # the MCP server. On success, skip the subprocess Semgrep entry in the plan.
    # On failure (MCP unavailable or error), fall through to subprocess as
    # though --use-mcp wasn't passed.
    mcp_semgrep = _try_mcp_scan(args, changed_files, output_dir)
    if mcp_semgrep and mcp_semgrep.get("status") == "ok":
        results.append(
            CommandResult(
                name=mcp_semgrep["name"],
                command=mcp_semgrep["command"],
                artifact=mcp_semgrep["artifact"],
                status=mcp_semgrep["status"],
                returncode=mcp_semgrep["returncode"],
                findings=mcp_semgrep["findings"],
                stdout="",
                stderr="",
                skipped_reason=mcp_semgrep["skipped_reason"],
            )
        )

    for name, command, artifact, required_binary in build_tool_plan(args.base, changed_files, output_dir, args.deep):
        # Skip subprocess Semgrep when MCP successfully handled it.
        if name == "semgrep" and mcp_semgrep and mcp_semgrep.get("status") == "ok":
            continue
        result = run_tool(name, command, artifact, required_binary)
        persist_artifact_output(result, artifact)
        results.append(result)

    summary = make_summary(args.base, changed_files, results)
    write_text(output_dir / "summary.json", json.dumps(summary, indent=2) + "\n")
    write_text(output_dir / "summary.md", summary_markdown(summary))

    print(json.dumps(summary, indent=2))

    if args.fail_on_findings and summary["total_findings"]:
        return 1
    return 0


def cmd_comment(args: argparse.Namespace) -> int:
    output_dir = Path(args.output_dir).resolve()
    summary_path = output_dir / "summary.md"
    if not summary_path.exists():
        print(f"Missing summary markdown: {summary_path}", file=sys.stderr)
        return 1
    if not command_exists("gh"):
        print("Missing dependency: gh", file=sys.stderr)
        return 1

    # Pre-flight: load PR metadata so we can do the cross-repo check and
    # build the dedup marker.
    try:
        pr_meta = subprocess.run(
            [
                "gh", "pr", "view", str(args.pr),
                "--json", "state,headRefOid,baseRepository",
                "-q", ".",
            ],
            cwd=ROOT, text=True, capture_output=True, check=True,
        )
    except subprocess.CalledProcessError as exc:
        print(f"gh pr view failed: {exc.stderr.strip() or exc.stdout.strip()}", file=sys.stderr)
        return 1
    pr = json.loads(pr_meta.stdout)
    state = pr.get("state")
    head_sha = pr.get("headRefOid", "")
    base_repo = (pr.get("baseRepository") or {}).get("nameWithOwner")

    # Cross-repo safety: the cwd's repo must match the PR's base repo so we
    # don't post to a different repo by accident.
    cwd_repo_proc = subprocess.run(
        ["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
        cwd=ROOT, text=True, capture_output=True, check=False,
    )
    cwd_repo = cwd_repo_proc.stdout.strip() if cwd_repo_proc.returncode == 0 else None
    if base_repo and cwd_repo and cwd_repo != base_repo:
        print(f"Refusing to post: cwd repo ({cwd_repo}) != PR base repo ({base_repo})", file=sys.stderr)
        return 1

    if state and state != "OPEN":
        print(f"PR #{args.pr} is {state}; skipping comment", file=sys.stderr)
        return 0

    # HTML-comment marker for deterministic dedup on subsequent pushes.
    marker = f"<!-- security-audit:sha={head_sha} -->"
    existing_proc = subprocess.run(
        ["gh", "pr", "view", str(args.pr), "--json", "comments", "-q", ".comments[].body"],
        cwd=ROOT, text=True, capture_output=True, check=False,
    )
    if marker and marker in (existing_proc.stdout or ""):
        print(f"Already audited {head_sha}; skipping comment", file=sys.stderr)
        return 0

    body = summary_path.read_text(encoding="utf-8")
    if not body.startswith(marker):
        body = f"{marker}\n{body}"

    # Write a temp file with the marker prepended so gh --body-file sees it.
    marked_path = output_dir / "summary-pr-comment.md"
    marked_path.write_text(body, encoding="utf-8")

    result = run(
        ["gh", "pr", "comment", str(args.pr), "--body-file", str(marked_path)],
        check=False,
    )
    sys.stdout.write(result.stdout)
    sys.stderr.write(result.stderr)
    return result.returncode


def cmd_promote_memories(args: argparse.Namespace) -> int:
    """Promote pending suggested_memory entries into .claude/security-memories.md.

    Reads .claude/security-audit/pending-memories.jsonl (one JSON object per
    line), applies safety filters (T8 mitigations), and appends the survivors
    to .claude/security-memories.md.

    Safety filters:
      1. Never promote a memory whose path-scope intersects files changed in
         this PR (the contributor must not be able to suppress findings about
         their own diff).
      2. Verify the rationale's cited sanitizer/file exists on the base ref
         (cheap "not making up references" check).
      3. Apply a default 14-day expiry unless --no-expire.
    """
    import datetime
    from pathlib import Path as _Path

    pending_path = ROOT / ".claude" / "security-audit" / "pending-memories.jsonl"
    if not pending_path.exists():
        print(f"No pending memories at {pending_path}", file=sys.stderr)
        return 0

    memories_path = ROOT / ".claude" / "security-memories.md"
    memories_path.parent.mkdir(parents=True, exist_ok=True)

    base = args.base or "origin/HEAD"
    try:
        changed = set(
            run(["git", "diff", "--name-only", f"{base}..."], check=False).stdout.splitlines()
        )
    except Exception:
        changed = set()

    promoted = 0
    rejected: list[tuple[str, str]] = []
    appended_blocks: list[str] = []

    for raw in pending_path.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            mem = json.loads(raw)
        except json.JSONDecodeError as exc:
            rejected.append((raw[:60], f"invalid JSON: {exc}"))
            continue

        scope = mem.get("scope") or {}
        rule = scope.get("rule", "?")
        paths = scope.get("paths") or []
        rationale = mem.get("rationale", "").strip()

        # Filter 1: scope must not intersect changed files
        intersects = False
        for pattern in paths:
            for path in changed:
                if _Path(path).match(pattern):
                    intersects = True
                    break
            if intersects:
                break
        if intersects:
            rejected.append((rule, f"scope intersects changed files: {paths}"))
            continue

        # Filter 2: if rationale references a file:line, verify the file exists on base
        ref_match = re.search(r"`([^`]+\.\w{1,8}):\d+`", rationale)
        if ref_match:
            cited_path = ref_match.group(1)
            check = run(["git", "show", f"{base}:{cited_path}"], check=False)
            if check.returncode != 0:
                rejected.append((rule, f"rationale cites {cited_path} which doesn't exist on {base}"))
                continue

        # Filter 3: default 14-day expiry
        if not args.no_expire:
            expires = mem.get("expires")
            if not expires:
                expires = (datetime.date.today() + datetime.timedelta(days=14)).isoformat()
                mem["expires"] = expires

        scope_str = f"rule={rule}"
        if paths:
            scope_str += " path=" + ",".join(paths)

        block = "\n## FP (auto-promoted): {title}\n\n- **Rule:** {rule}\n- **Scope:** {scope}\n- **Reason:** {reason}\n- **Created:** {today} by /security-audit promote-memories\n".format(
            title=rule.split(":", 1)[-1].split(".")[-1][:60],
            rule=rule,
            scope=scope_str,
            reason=rationale or "(no rationale provided)",
            today=datetime.date.today().isoformat(),
        )
        if mem.get("expires"):
            block += f"- **Expires:** {mem['expires']}\n"
        appended_blocks.append(block)
        promoted += 1

    if appended_blocks:
        with memories_path.open("a", encoding="utf-8") as fp:
            if memories_path.stat().st_size == 0:
                fp.write("# Security audit memories\n")
            fp.write("\n".join(appended_blocks))
            fp.write("\n")

    print(f"Promoted: {promoted}", file=sys.stderr)
    if rejected:
        print(f"Rejected: {len(rejected)}", file=sys.stderr)
        for rule, reason in rejected:
            print(f"  {rule}: {reason}", file=sys.stderr)

    # Clear pending file after successful promotion
    if promoted > 0 and not args.dry_run:
        pending_path.unlink()

    return 0


def cmd_rule_stats(args: argparse.Namespace) -> int:
    """Summarize .claude/security-audit/rule-stats.jsonl to identify rules
    with poor signal-to-noise in this repo. Append-only ledger; one row
    per triage decision."""
    import datetime
    from collections import defaultdict

    ledger = ROOT / ".claude" / "security-audit" / "rule-stats.jsonl"
    if not ledger.exists():
        print(f"No ledger at {ledger}", file=sys.stderr)
        return 0

    # Parse --since: "180d" or "30d" or an ISO date
    cutoff = None
    if args.since:
        if args.since.endswith("d") and args.since[:-1].isdigit():
            days = int(args.since[:-1])
            cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=days)
        else:
            try:
                cutoff = datetime.datetime.fromisoformat(args.since.replace("Z", "+00:00"))
            except ValueError:
                print(f"Bad --since value: {args.since}", file=sys.stderr)
                return 1

    by_rule: dict[str, dict[str, int]] = defaultdict(lambda: {"tp": 0, "fp": 0, "unconfirmed": 0})
    parsed = 0
    skipped = 0

    for raw in ledger.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            row = json.loads(raw)
        except json.JSONDecodeError:
            skipped += 1
            continue
        if cutoff is not None:
            ts = row.get("ts", "")
            try:
                row_ts = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                continue
            if row_ts.replace(tzinfo=None) < cutoff:
                continue
        rule = f"{row.get('tool', '?')}:{row.get('rule_id', '?')}"
        verdict = row.get("verdict", "unconfirmed")
        if verdict in by_rule[rule]:
            by_rule[rule][verdict] += 1
        else:
            by_rule[rule]["unconfirmed"] += 1
        parsed += 1

    if not by_rule:
        print(f"No entries in window. Parsed: {parsed}, skipped: {skipped}", file=sys.stderr)
        return 0

    rows = []
    for rule, counts in by_rule.items():
        total = sum(counts.values())
        fp_rate = counts["fp"] / total if total else 0.0
        rows.append((rule, counts, total, fp_rate))
    rows.sort(key=lambda r: r[3], reverse=True)

    for rule, counts, total, fp_rate in rows:
        print(f"Rule: {rule}")
        print(f"  Total triaged: {total}  (TP: {counts['tp']}, FP: {counts['fp']}, unconfirmed: {counts['unconfirmed']})")
        print(f"  FP rate: {fp_rate:.0%}")
        if fp_rate >= args.threshold and total >= args.min_total:
            print(
                "  Suggestion: high FP rate. Consider promoting a global memory, "
                "adjusting the confidence floor for this rule, or excluding it via "
                ".claude/security-config.yaml."
            )
        elif fp_rate == 0 and counts["tp"] >= 3:
            print("  Suggestion: high-signal rule, keep at default sensitivity.")
        print()

    return 0


def cmd_validate_rule(args: argparse.Namespace) -> int:
    """Run the Autogrep-style 4-stage filter on a candidate Semgrep rule.

    Inputs:
      --rule       Path to a Semgrep rule YAML (single rule or rules block).
      --vuln       Path to a code snippet that the rule MUST fire on.
      --fixed      Path to a code snippet that the rule MUST NOT fire on.
      --append-to  (optional) If all filters pass, append the rule to this
                   file (typically .semgrep/repo-rules.yml).

    Filter stages:
      1. Schema validation: `semgrep scan --validate --config=<rule>`
      2. Fires on vulnerable: `semgrep scan --config=<rule> <vuln>` must
         emit at least one result.
      3. Does NOT fire on fixed: `semgrep scan --config=<rule> <fixed>`
         must emit zero results.
      4. LLM quality scoring is intentionally NOT done here. The skill
         layer orchestrates the LLM step; this command emits a deterministic
         pass/fail that the skill can act on.

    Output is JSON to stdout:
      {
        "stages": {
          "schema": {"passed": bool, "detail": "..."},
          "fires_on_vuln": {"passed": bool, "detail": "..."},
          "silent_on_fixed": {"passed": bool, "detail": "..."}
        },
        "all_passed": bool,
        "appended_to": <path or null>
      }
    """
    rule_path = Path(args.rule).resolve()
    vuln_path = Path(args.vuln).resolve()
    fixed_path = Path(args.fixed).resolve()

    for p in (rule_path, vuln_path, fixed_path):
        if not p.exists():
            print(json.dumps({"error": f"missing: {p}"}), file=sys.stderr)
            return 2

    if not command_exists("semgrep"):
        print(json.dumps({"error": "missing dependency: semgrep"}), file=sys.stderr)
        return 2

    result: dict[str, dict] = {
        "stages": {
            "schema": {"passed": False, "detail": ""},
            "fires_on_vuln": {"passed": False, "detail": ""},
            "silent_on_fixed": {"passed": False, "detail": ""},
        },
        "all_passed": False,
        "appended_to": None,
    }

    # Stage 1: schema validation
    sv = run(
        ["semgrep", "scan", "--validate", f"--config={rule_path}", "--metrics=off"],
        check=False,
    )
    if sv.returncode == 0:
        result["stages"]["schema"]["passed"] = True
        result["stages"]["schema"]["detail"] = "Schema valid"
    else:
        result["stages"]["schema"]["detail"] = (sv.stderr or sv.stdout).strip()[:500]
        print(json.dumps(result))
        return 1

    # Stage 2: fires on vulnerable snippet
    sv_out = run(
        [
            "semgrep", "scan", f"--config={rule_path}", "--json", "--metrics=off",
            "--no-git-ignore", str(vuln_path),
        ],
        check=False,
    )
    try:
        vuln_results = json.loads(sv_out.stdout or "{}").get("results", [])
    except json.JSONDecodeError:
        vuln_results = []
    if vuln_results:
        result["stages"]["fires_on_vuln"]["passed"] = True
        result["stages"]["fires_on_vuln"]["detail"] = f"{len(vuln_results)} match(es)"
    else:
        result["stages"]["fires_on_vuln"]["detail"] = "Rule did not match vulnerable snippet"
        print(json.dumps(result))
        return 1

    # Stage 3: silent on fixed snippet
    sf_out = run(
        [
            "semgrep", "scan", f"--config={rule_path}", "--json", "--metrics=off",
            "--no-git-ignore", str(fixed_path),
        ],
        check=False,
    )
    try:
        fixed_results = json.loads(sf_out.stdout or "{}").get("results", [])
    except json.JSONDecodeError:
        fixed_results = []
    if not fixed_results:
        result["stages"]["silent_on_fixed"]["passed"] = True
        result["stages"]["silent_on_fixed"]["detail"] = "No matches on fixed snippet"
    else:
        result["stages"]["silent_on_fixed"]["detail"] = (
            f"Rule still fires on fixed snippet ({len(fixed_results)} match(es)). "
            "Rule is too broad."
        )
        print(json.dumps(result))
        return 1

    result["all_passed"] = True

    # Optional append to repo-rules.yml
    if args.append_to and result["all_passed"]:
        target = Path(args.append_to).resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        rule_yaml = rule_path.read_text(encoding="utf-8")
        if not target.exists():
            target.write_text("rules:\n", encoding="utf-8")
        with target.open("a", encoding="utf-8") as fp:
            # If the rule file is a full "rules:" doc, strip the header
            # before appending so we don't duplicate the "rules:" key.
            for line in rule_yaml.splitlines(keepends=True):
                if line.strip() == "rules:":
                    continue
                fp.write(line)
            fp.write("\n")
        result["appended_to"] = str(target)

    print(json.dumps(result, indent=2))
    return 0 if result["all_passed"] else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    scan = subparsers.add_parser("scan", help="Run tool-driven security audit against a git diff.")
    scan.add_argument("--base", default="origin/HEAD", help="Git base ref to diff against.")
    scan.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Artifact output directory.")
    scan.add_argument("--deep", action="store_true", help="Enable deep mode add-ons such as trufflehog.")
    scan.add_argument("--fail-on-findings", action="store_true", help="Exit non-zero if findings are detected.")
    scan.add_argument(
        "--use-mcp",
        action="store_true",
        help="Route Semgrep through the Semgrep MCP server (requires `uvx` or `semgrep-mcp`). Falls back to subprocess on failure. See references/mcp-integration.md.",
    )
    scan.set_defaults(func=cmd_scan)

    ci = subparsers.add_parser("ci", help="CI-friendly alias for scan with non-zero exit on findings.")
    ci.add_argument("--base", default="origin/HEAD", help="Git base ref to diff against.")
    ci.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Artifact output directory.")
    ci.add_argument("--deep", action="store_true", help="Enable deep mode add-ons such as trufflehog.")
    ci.add_argument(
        "--use-mcp",
        action="store_true",
        help="Route Semgrep through the Semgrep MCP server. See references/mcp-integration.md.",
    )
    ci.set_defaults(func=lambda args: cmd_scan(argparse.Namespace(**vars(args), fail_on_findings=True)))

    comment = subparsers.add_parser("comment", help="Post the latest markdown summary to a GitHub PR.")
    comment.add_argument("--pr", required=True, help="Pull request number.")
    comment.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Artifact output directory.")
    comment.set_defaults(func=cmd_comment)

    vr = subparsers.add_parser(
        "validate-rule",
        help="Autogrep-style filter: validate a candidate Semgrep rule against (vuln, fixed) snippet pair.",
    )
    vr.add_argument("--rule", required=True, help="Path to a Semgrep rule YAML.")
    vr.add_argument("--vuln", required=True, help="Path to a code snippet the rule MUST fire on.")
    vr.add_argument("--fixed", required=True, help="Path to a code snippet the rule MUST NOT fire on.")
    vr.add_argument("--append-to", help="If all filters pass, append the rule to this file.")
    vr.set_defaults(func=cmd_validate_rule)

    promote = subparsers.add_parser(
        "promote-memories",
        help="Promote pending suggested_memory entries to .claude/security-memories.md (with T8 safety filters).",
    )
    promote.add_argument("--base", default="origin/HEAD", help="Base ref for the changed-files safety check.")
    promote.add_argument("--no-expire", action="store_true", help="Don't add a default 14-day expiry.")
    promote.add_argument("--dry-run", action="store_true", help="Show what would be promoted without writing.")
    promote.set_defaults(func=cmd_promote_memories)

    stats = subparsers.add_parser(
        "rule-stats",
        help="Summarize .claude/security-audit/rule-stats.jsonl to identify high-FP rules in this repo.",
    )
    stats.add_argument("--since", default="180d", help="Look-back window. Format: NNd or ISO date. Default: 180d.")
    stats.add_argument("--threshold", type=float, default=0.5, help="FP-rate threshold for the high-FP suggestion. Default: 0.5.")
    stats.add_argument("--min-total", type=int, default=3, help="Minimum triage count before suggesting changes. Default: 3.")
    stats.set_defaults(func=cmd_rule_stats)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
