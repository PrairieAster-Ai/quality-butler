#!/usr/bin/env python3
"""
Deterministic code quality runner extracted from the code-quality skill.

This script handles measurable checks and emits JSON or Markdown summaries.
Prioritization and sprint planning remain in the skill layer.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = ROOT / ".artifacts" / "code-quality"
DEFAULT_THRESHOLDS = {
    "lint_errors": 0,
    "type_errors": 0,
    "coverage_percent": 80.0,
    "duplication_percent": 2.0,
    "any_count": 50,
    "large_files": 0,
}


def run_shell(command: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=ROOT,
        shell=True,
        text=True,
        capture_output=True,
        check=False,
    )


def read_package_json() -> dict:
    package_json = ROOT / "package.json"
    if not package_json.exists():
        return {}
    try:
        return json.loads(package_json.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def command_available(name: str) -> bool:
    return shutil.which(name) is not None


def default_command(script_name: str, fallback: str | None = None) -> str | None:
    package = read_package_json()
    scripts = package.get("scripts", {}) if isinstance(package, dict) else {}
    if script_name in scripts:
        return f"npm run {script_name}"
    return fallback


def count_eslint_errors(stdout: str, stderr: str) -> int | None:
    """Count ESLint errors from stdout/stderr.

    Prefers the canonical "✖ N problems (E errors, W warnings)" summary
    line, falls back to counting `error` markers, last-resort returns None.
    Avoids the brittle "first number anywhere" heuristic which matches
    line numbers, column numbers, and rule names with digits.
    """
    import re

    text = stdout + "\n" + stderr
    # Canonical ESLint summary: "✖ 3 problems (2 errors, 1 warning)"
    summary = re.search(r"\b(\d+)\s+errors?\b", text)
    if summary:
        return int(summary.group(1))
    # Fallback: count occurrences of "  error  " (ESLint stylish formatter)
    err_count = len(re.findall(r"^\s*\d+:\d+\s+error\s", text, re.MULTILINE))
    if err_count > 0:
        return err_count
    return None


def count_tsc_errors(stdout: str, stderr: str) -> int | None:
    """Count TypeScript errors from `tsc --noEmit` output by counting the
    canonical `error TS<code>:` markers."""
    import re

    text = stdout + "\n" + stderr
    matches = re.findall(r"\berror TS\d+:", text)
    return len(matches) if matches or "error TS" in text else None


# Regex for `: any` that excludes JSDoc/comment lines and matches at a word
# boundary so it ignores `:: anything` and `: anything-else`.
_ANY_RE = re.compile(r":\s*any\b")
_LINE_COMMENT_RE = re.compile(r"^\s*(//|\*|/\*)")


def _strip_comments(text: str) -> str:
    """Best-effort strip of `//` line comments and `/* ... */` block
    comments before scanning for `: any`. We don't need a full parser;
    we just want to drop the obvious false-positive cases."""
    import re

    # Block comments
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    # Single-line comments — only strip from `//` to end-of-line
    text = re.sub(r"//.*?$", "", text, flags=re.MULTILINE)
    return text


def count_any_types(src_dir: Path) -> dict:
    count = 0
    files: dict[str, int] = {}
    if not src_dir.exists():
        return {"count": 0, "files": {}}
    for path in src_dir.rglob("*"):
        if path.suffix not in {".ts", ".tsx"}:
            continue
        if ".test." in path.name or "__tests__" in path.parts:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        # Strip comments so `// can be: any` and JSDoc don't inflate the count.
        stripped = _strip_comments(text)
        hits = len(_ANY_RE.findall(stripped))
        if hits:
            rel = str(path.relative_to(ROOT))
            files[rel] = hits
            count += hits
    return {"count": count, "files": dict(sorted(files.items(), key=lambda item: item[1], reverse=True))}


def large_file_report(src_dir: Path, threshold: int) -> dict:
    files: dict[str, int] = {}
    if not src_dir.exists():
        return {"count": 0, "files": {}}
    for path in src_dir.rglob("*"):
        if path.suffix not in {".ts", ".tsx"}:
            continue
        if ".test." in path.name or "__tests__" in path.parts:
            continue
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        if len(lines) > threshold:
            files[str(path.relative_to(ROOT))] = len(lines)
    return {"count": len(files), "files": dict(sorted(files.items(), key=lambda item: item[1], reverse=True))}


def parse_coverage(stdout: str) -> float | None:
    import re

    for pattern in (r"All files\s+\|\s+([\d.]+)", r"Lines\s*:\s*([\d.]+)%"):
        match = re.search(pattern, stdout)
        if match:
            return float(match.group(1))
    return None


def parse_duplication(output_dir: Path) -> float | None:
    report = output_dir / "duplication-report" / "jscpd-report.json"
    if not report.exists():
        return None
    try:
        payload = json.loads(report.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    statistics = payload.get("statistics", {})
    total = statistics.get("total", {})
    percentage = total.get("percentage")
    return float(percentage) if isinstance(percentage, (int, float)) else None


def quality_markdown(summary: dict) -> str:
    lines = [
        "# Code Quality Assessment",
        "",
        f"- Source directory: `{summary['source_dir']}`",
        "",
        "| Metric | Value | Target | Status |",
        "|---|---:|---:|---|",
    ]
    metrics = summary["metrics"]
    thresholds = summary["thresholds"]
    lines.append(f"| Lint errors | {metrics['lint_errors']['value_display']} | {thresholds['lint_errors']} | {metrics['lint_errors']['status']} |")
    lines.append(f"| Type errors | {metrics['type_errors']['value_display']} | {thresholds['type_errors']} | {metrics['type_errors']['status']} |")
    lines.append(f"| Coverage % | {metrics['coverage_percent']['value_display']} | {thresholds['coverage_percent']} | {metrics['coverage_percent']['status']} |")
    lines.append(f"| Duplication % | {metrics['duplication_percent']['value_display']} | {thresholds['duplication_percent']} | {metrics['duplication_percent']['status']} |")
    lines.append(f"| `any` count | {metrics['any_count']['value_display']} | {thresholds['any_count']} | {metrics['any_count']['status']} |")
    lines.append(f"| Large files | {metrics['large_files']['value_display']} | {thresholds['large_files']} | {metrics['large_files']['status']} |")

    if summary["hotspots"]:
        lines.extend(["", "## Hotspots", ""])
        for item in summary["hotspots"]:
            lines.append(f"- `{item['file']}`: {item['reason']}")

    return "\n".join(lines) + "\n"


def evaluate_metric(value: float | int | None, threshold: float | int, lower_is_better: bool = True) -> dict:
    if value is None:
        return {"value": None, "value_display": "skipped", "status": "SKIP"}
    passed = value <= threshold if lower_is_better else value >= threshold
    if isinstance(value, float):
        display = f"{value:.1f}"
    else:
        display = str(value)
    return {"value": value, "value_display": display, "status": "PASS" if passed else "FAIL"}


def cmd_assess(args: argparse.Namespace) -> int:
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    src_dir = (ROOT / args.src_dir).resolve()

    lint_cmd = args.lint_cmd or default_command("lint")
    typecheck_cmd = args.typecheck_cmd or default_command("type-check")
    # Most `npm test` scripts don't emit coverage by themselves; default to
    # vitest's explicit coverage invocation rather than `npm run test`.
    coverage_cmd = args.coverage_cmd or "npx vitest run --coverage"
    duplication_cmd = args.duplication_cmd or f"npx jscpd {args.src_dir} --reporters json --output {output_dir / 'duplication-report'}"

    command_results = {}

    lint_errors = None
    if lint_cmd:
        lint_result = run_shell(lint_cmd)
        command_results["lint"] = {"command": lint_cmd, "returncode": lint_result.returncode}
        if lint_result.returncode == 0:
            lint_errors = 0
        else:
            lint_errors = count_eslint_errors(lint_result.stdout, lint_result.stderr)

    type_errors = None
    if typecheck_cmd:
        type_result = run_shell(typecheck_cmd)
        command_results["typecheck"] = {"command": typecheck_cmd, "returncode": type_result.returncode}
        if type_result.returncode == 0:
            type_errors = 0
        else:
            type_errors = count_tsc_errors(type_result.stdout, type_result.stderr)

    coverage_percent = None
    if coverage_cmd and command_available("npx"):
        coverage_result = run_shell(coverage_cmd)
        command_results["coverage"] = {"command": coverage_cmd, "returncode": coverage_result.returncode}
        coverage_percent = parse_coverage(coverage_result.stdout + "\n" + coverage_result.stderr)

    duplication_percent = None
    if duplication_cmd and command_available("npx"):
        duplication_result = run_shell(duplication_cmd)
        command_results["duplication"] = {"command": duplication_cmd, "returncode": duplication_result.returncode}
        duplication_percent = parse_duplication(output_dir)

    any_report = count_any_types(src_dir)
    large_files = large_file_report(src_dir, args.large_file_threshold)

    metrics = {
        "lint_errors": evaluate_metric(lint_errors, args.max_lint_errors),
        "type_errors": evaluate_metric(type_errors, args.max_type_errors),
        "coverage_percent": evaluate_metric(coverage_percent, args.min_coverage_percent, lower_is_better=False),
        "duplication_percent": evaluate_metric(duplication_percent, args.max_duplication_percent),
        "any_count": evaluate_metric(any_report["count"], args.max_any_count),
        "large_files": evaluate_metric(large_files["count"], args.max_large_files),
    }

    hotspots = []
    hotspots.extend(
        {"file": file, "reason": f"{count} `any` types"}
        for file, count in list(any_report["files"].items())[:5]
    )
    hotspots.extend(
        {"file": file, "reason": f"{lines} lines"}
        for file, lines in list(large_files["files"].items())[:5]
    )

    summary = {
        "source_dir": args.src_dir,
        "thresholds": {
            "lint_errors": args.max_lint_errors,
            "type_errors": args.max_type_errors,
            "coverage_percent": args.min_coverage_percent,
            "duplication_percent": args.max_duplication_percent,
            "any_count": args.max_any_count,
            "large_files": args.max_large_files,
        },
        "metrics": metrics,
        "details": {
            "any_count_by_file": any_report["files"],
            "large_files_by_file": large_files["files"],
            "commands": command_results,
        },
        "hotspots": hotspots,
    }

    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    (output_dir / "summary.md").write_text(quality_markdown(summary), encoding="utf-8")

    if args.format == "json":
        print(json.dumps(summary, indent=2))
    else:
        print(quality_markdown(summary))

    if args.fail_on_thresholds and any(metric["status"] == "FAIL" for metric in metrics.values()):
        return 1
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src-dir", default="src", help="Source directory to inspect.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Artifact output directory.")
    parser.add_argument("--format", choices=["json", "markdown"], default="json", help="Output format.")
    parser.add_argument("--lint-cmd", help="Override lint command.")
    parser.add_argument("--typecheck-cmd", help="Override typecheck command.")
    parser.add_argument("--coverage-cmd", help="Override coverage command.")
    parser.add_argument("--duplication-cmd", help="Override duplication command.")
    parser.add_argument("--large-file-threshold", type=int, default=500, help="Line threshold for large file detection.")
    parser.add_argument("--max-lint-errors", type=int, default=DEFAULT_THRESHOLDS["lint_errors"])
    parser.add_argument("--max-type-errors", type=int, default=DEFAULT_THRESHOLDS["type_errors"])
    parser.add_argument("--min-coverage-percent", type=float, default=DEFAULT_THRESHOLDS["coverage_percent"])
    parser.add_argument("--max-duplication-percent", type=float, default=DEFAULT_THRESHOLDS["duplication_percent"])
    parser.add_argument("--max-any-count", type=int, default=DEFAULT_THRESHOLDS["any_count"])
    parser.add_argument("--max-large-files", type=int, default=DEFAULT_THRESHOLDS["large_files"])
    parser.add_argument("--fail-on-thresholds", action="store_true", help="Exit non-zero when any threshold fails.")
    parser.set_defaults(func=cmd_assess)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
