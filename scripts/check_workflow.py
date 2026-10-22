#!/usr/bin/env python3
"""Check whitespace across an entire CI change range, without network access."""
import argparse
import json
import os
from pathlib import Path
import subprocess


def git(*args, cwd=None):
    return subprocess.run(["git", *args], cwd=cwd, text=True, capture_output=True, input="")


def check(event, payload, cwd=None):
    """Use the PR base or pre-push commit; scan the full tree for other events."""
    if not isinstance(payload, dict):
        raise ValueError("GitHub event payload must be an object")
    base = None
    if event == "pull_request":
        request = payload.get("pull_request", {})
        if not isinstance(request, dict) or not isinstance(request.get("base", {}), dict):
            raise ValueError("GitHub event payload requires pull_request.base objects")
        base = request.get("base", {}).get("sha")
    elif event == "push":
        base = payload.get("before")
    if event in ("push", "pull_request"):
        # Validate even all-zero IDs: only a complete zero ID denotes first push.
        if not isinstance(base, str) or len(base) not in (40, 64) or any(
                c not in "0123456789abcdef" for c in base):
            raise ValueError("Missing or invalid base commit ID")
        if event == "pull_request" and set(base) == {"0"}:
            raise ValueError("Pull request requires a nonzero base commit ID")
    if base and set(base) != {"0"}:
        resolved = git("cat-file", "-e", base + "^{commit}", cwd=cwd)
        if resolved.returncode:
            raise ValueError("Base commit is unavailable; fetch complete history")
    else:
        base = git("hash-object", "-t", "tree", "--stdin", cwd=cwd).stdout.strip()
    result = git("diff", "--check", base, "HEAD", "--", cwd=cwd)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    path = os.environ.get("GITHUB_EVENT_PATH")
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8")) if path else {}
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        parser.exit(1, f"ERROR Cannot read GitHub event payload: {exc}\n")
    try:
        result = check(os.environ.get("GITHUB_EVENT_NAME", "workflow_dispatch"), payload)
    except ValueError as exc:
        parser.exit(1, f"ERROR {exc}\n")
    print(result.stdout, end="")
    print(result.stderr, end="")
    if not result.returncode:
        print("Checked whitespace across the complete change range (full tree for manual/scheduled runs).")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
