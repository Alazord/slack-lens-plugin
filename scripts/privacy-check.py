#!/usr/bin/env python3
"""
Privacy sweep for SlackLens. Run before every public-distribution release.

Scans the working tree for patterns that indicate a real-workspace leak:
colleague names, customer/channel names, the unifyapps.slack.com
workspace, and real Slack user/channel IDs matching U0[A-Z0-9]{8,10}.

Exits 0 when the tree is clean, 1 when any leak is found.

Carve-outs:
  - "Shailendra Singh" (plugin author name) is allowed.
  - Four documented placeholder user IDs are allowed:
      U01EXAMPLE99, U02EXAMPLE11, U01ALICE000, U01BOB00000.

Usage:
  python3 scripts/privacy-check.py                    # scan current dir
  python3 scripts/privacy-check.py --root path/to/x   # scan elsewhere
  python3 scripts/privacy-check.py --list-patterns    # print patterns
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

# Directories we never scan.
EXCLUDE_DIRS = {".git", ".claude", ".superpowers", "node_modules", "venv", ".venv"}

# Files we never scan.
EXCLUDE_FILES: set[str] = {
    # privacy-check itself contains the patterns literally — would false-positive.
    "privacy-check.py",
    # The test harness must embed each leak literal to verify the detector fires.
    "test_privacy_check.sh",
    # This plan + spec explicitly describe the patterns.
    "2026-04-22-slacklens-ship-readiness-design.md",
    "2026-04-22-slacklens-ship-readiness.md",
}

# Real-data patterns. Each is a compiled regex.
PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("email",       re.compile(r"shailendra\.singh@unifyapps\.com", re.IGNORECASE)),
    ("workspace",   re.compile(r"unifyapps\.slack\.com",             re.IGNORECASE)),
    ("real_id",     re.compile(r"\bU0[A-Z0-9]{8,10}\b")),
    ("colleagues",  re.compile(
        r"\b(Abhinav|Ankit|Abhishek|Dharmin|Divyam|Samarth|Darshan|"
        r"Raksha|Ishu|Akhila|Nilesh|Rahul|Anuj|Dhruv|Mudit|Nirav|Thanusha)\b"
    )),
    ("customers",   re.compile(
        r"(keka[_-]?(dev|pm|prod)|copilot[- ]automation|docebo|"
        r"vodafone[- ]poc|boat[- ]?cdp|dda[- ]govgpt|psg[- ]poc|"
        r"amn[- ]new|belcorp[- ]poc)",
        re.IGNORECASE,
    )),
]

# Whole-match exemptions (checked after a pattern fires).
PLACEHOLDER_IDS = {"U01EXAMPLE99", "U02EXAMPLE11", "U01ALICE000", "U01BOB00000"}
AUTHOR_NAME_LITERAL = "Shailendra Singh"


def is_text_file(path: Path, sample_size: int = 4096) -> bool:
    """Return True if the file looks like UTF-8 text."""
    try:
        with path.open("rb") as f:
            chunk = f.read(sample_size)
    except OSError:
        return False
    if b"\x00" in chunk:
        return False
    try:
        chunk.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True


def walk_files(root: Path):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for name in filenames:
            if name in EXCLUDE_FILES:
                continue
            yield Path(dirpath) / name


def line_is_exempt(line: str, pattern_name: str, match: re.Match) -> bool:
    """Apply carve-outs that the raw regex can't express."""
    if pattern_name == "real_id" and match.group(0) in PLACEHOLDER_IDS:
        return True
    # Only carve out colleague-name 'Shailendra' when it's part of the author
    # literal ("Shailendra Singh"). Plain 'Shailendra' in prose would still
    # match 'colleagues' — but 'Shailendra' isn't in the colleagues regex.
    # The exemption here is conceptual; no pattern actually needs it today.
    return False


def scan(root: Path) -> int:
    hits = 0
    for path in walk_files(root):
        if not is_text_file(path):
            continue
        try:
            with path.open("r", encoding="utf-8", errors="replace") as f:
                for lineno, raw in enumerate(f, start=1):
                    for name, rx in PATTERNS:
                        for m in rx.finditer(raw):
                            if line_is_exempt(raw, name, m):
                                continue
                            rel = path.relative_to(root)
                            snippet = raw.rstrip("\n")
                            if len(snippet) > 160:
                                snippet = snippet[:160] + "..."
                            print(f"{rel}:{lineno}: [{name}] {snippet}")
                            hits += 1
        except OSError as exc:
            print(f"warn: could not read {path}: {exc}", file=sys.stderr)
    return hits


def main() -> int:
    ap = argparse.ArgumentParser(description="Privacy sweep for SlackLens.")
    ap.add_argument("--root", default=".", help="Directory to scan (default: .)")
    ap.add_argument("--list-patterns", action="store_true",
                    help="Print the patterns and exit.")
    args = ap.parse_args()

    if args.list_patterns:
        for name, rx in PATTERNS:
            print(f"{name}: {rx.pattern}")
        print(f"placeholders (allowed): {sorted(PLACEHOLDER_IDS)}")
        print(f"author carve-out: {AUTHOR_NAME_LITERAL!r}")
        return 0

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"error: --root {root} is not a directory", file=sys.stderr)
        return 2

    hits = scan(root)
    if hits:
        print(f"\n{hits} leak(s) found. Fix before distributing.", file=sys.stderr)
        return 1
    print("clean.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
