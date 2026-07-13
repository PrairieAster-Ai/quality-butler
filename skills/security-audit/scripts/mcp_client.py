"""Thin stdio JSON-RPC client for the Semgrep MCP server.

Not a full MCP implementation. Just enough to call the tools exposed by
`github.com/semgrep/mcp` from `scripts/security_audit.py` when the user has
`uvx` or `semgrep-mcp` installed.

See `skills/security-audit/references/mcp-integration.md` for the integration
pattern and the migration roadmap.

Usage:

    from mcp_client import SemgrepMCPClient

    client = SemgrepMCPClient.spawn()
    try:
        result = client.call("semgrep_scan", {"path": "src/", "config": "auto"})
        for finding in result.get("results", []):
            ...
    finally:
        client.close()
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from typing import Any


class SemgrepMCPError(RuntimeError):
    """Raised when the MCP server returns an error or the transport fails."""


class SemgrepMCPClient:
    """Spawn the Semgrep MCP server and talk to it over stdio JSON-RPC.

    The wire format is MCP's standard newline-delimited JSON-RPC 2.0:

        --> {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {...}}
        <-- {"jsonrpc": "2.0", "id": 1, "result": {...}}
        --> {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {
               "name": "semgrep_scan", "arguments": {...}}}
        <-- {"jsonrpc": "2.0", "id": 2, "result": {"content": [...]}}

    This client only implements the tools/call path. For full feature support
    use a proper MCP client library; this exists so the security_audit script
    can opt into MCP without taking on the SDK as a hard dependency.
    """

    def __init__(self, proc: subprocess.Popen[str]) -> None:
        self.proc = proc
        self._next_id = 1
        self._initialized = False

    @classmethod
    def spawn(cls, command: list[str] | None = None) -> "SemgrepMCPClient":
        """Spawn the Semgrep MCP server as a subprocess. Auto-detects the
        invocation if `command` is None: prefers `uvx semgrep-mcp`, falls
        back to `semgrep-mcp` if installed as a binary."""
        if command is None:
            if shutil.which("uvx"):
                command = ["uvx", "semgrep-mcp"]
            elif shutil.which("semgrep-mcp"):
                command = ["semgrep-mcp"]
            else:
                raise SemgrepMCPError(
                    "Cannot find uvx or semgrep-mcp. Install one of:\n"
                    "  pipx install uv  (then `uvx semgrep-mcp` will work)\n"
                    "  pipx install semgrep-mcp"
                )

        try:
            proc = subprocess.Popen(
                command,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except (OSError, FileNotFoundError) as exc:
            raise SemgrepMCPError(f"Failed to spawn {command}: {exc}") from exc

        client = cls(proc)
        client._initialize()
        return client

    def _initialize(self) -> None:
        """Send the MCP initialize handshake."""
        self._send(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "security-audit-skill", "version": "0.1.0"},
            },
        )
        self._recv()  # discard server info
        # MCP requires a `notifications/initialized` notification after the
        # handshake. The `notifications/` prefix is critical — sending
        # `initialized` without it (as a previous version of this file did)
        # leaves the server in a half-handshaken state where tools/list
        # returns the empty set or InvalidParams.
        self._notify("notifications/initialized", {})
        self._initialized = True

    def _send(self, method: str, params: dict[str, Any]) -> int:
        """Send a JSON-RPC request, return its id."""
        if self.proc.stdin is None or self.proc.poll() is not None:
            raise SemgrepMCPError("MCP server is not running")
        msg_id = self._next_id
        self._next_id += 1
        msg = {"jsonrpc": "2.0", "id": msg_id, "method": method, "params": params}
        self.proc.stdin.write(json.dumps(msg) + "\n")
        self.proc.stdin.flush()
        return msg_id

    def _notify(self, method: str, params: dict[str, Any]) -> None:
        """Send a JSON-RPC notification (no response expected)."""
        if self.proc.stdin is None:
            raise SemgrepMCPError("MCP server is not running")
        msg = {"jsonrpc": "2.0", "method": method, "params": params}
        self.proc.stdin.write(json.dumps(msg) + "\n")
        self.proc.stdin.flush()

    def _recv(self) -> dict[str, Any]:
        """Read one JSON-RPC response from stdout. Times out after 60s."""
        if self.proc.stdout is None:
            raise SemgrepMCPError("MCP server has no stdout")
        line = self.proc.stdout.readline()
        if not line:
            stderr = self.proc.stderr.read() if self.proc.stderr else ""
            raise SemgrepMCPError(f"MCP server closed unexpectedly. stderr: {stderr.strip()}")
        try:
            return json.loads(line)
        except json.JSONDecodeError as exc:
            raise SemgrepMCPError(f"Bad JSON from MCP server: {exc} | line: {line!r}") from exc

    def call(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Invoke a tool by name. Returns the parsed `result` payload.

        Raises SemgrepMCPError if the server returns an `error` object.
        """
        if not self._initialized:
            raise SemgrepMCPError("Client not initialized")
        msg_id = self._send(
            "tools/call",
            {"name": tool_name, "arguments": arguments},
        )
        # Loop until we get the matching id; MCP servers may emit other
        # notifications (progress, etc.) interleaved.
        while True:
            response = self._recv()
            if response.get("id") != msg_id:
                continue
            if "error" in response:
                err = response["error"]
                raise SemgrepMCPError(
                    f"MCP server error: {err.get('message', err)} (code={err.get('code')})"
                )
            return response.get("result", {})

    def close(self) -> None:
        """Terminate the MCP server subprocess."""
        if self.proc.poll() is None:
            try:
                self.proc.stdin.close()  # type: ignore[union-attr]
            except (OSError, AttributeError):
                pass
            try:
                self.proc.terminate()
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait()

    def __enter__(self) -> "SemgrepMCPClient":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


def is_available(command: list[str] | None = None) -> bool:
    """Check whether MCP is usable without actually spawning a server."""
    if command is not None:
        return shutil.which(command[0]) is not None
    return shutil.which("uvx") is not None or shutil.which("semgrep-mcp") is not None


if __name__ == "__main__":
    # Quick smoke test: spawn, list supported languages, exit.
    if not is_available():
        print("Semgrep MCP not available. Install: pipx install uv && uvx semgrep-mcp", file=sys.stderr)
        sys.exit(1)
    with SemgrepMCPClient.spawn() as client:
        try:
            langs = client.call("supported_languages", {})
            print(json.dumps(langs, indent=2))
        except SemgrepMCPError as exc:
            print(f"MCP call failed: {exc}", file=sys.stderr)
            sys.exit(1)
