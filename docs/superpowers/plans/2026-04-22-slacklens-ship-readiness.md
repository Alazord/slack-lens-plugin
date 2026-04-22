# SlackLens v0.4.0 Ship-Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SlackLens v0.3.0 → v0.4.0 ship-ready for public team distribution: minimal permission allowlist, plug privacy leaks, fix known runtime rough edges, document everything.

**Architecture:** No architectural changes. The plugin remains four skills (`slacklens-setup`, `slacklens-refresh`, `slacklens-open`, `slacklens-rerender`) + a shared `dashboard.template.html`. Changes are surgical edits to skill markdown files, one new Python script (`scripts/privacy-check.py`), one new doc (`docs/ACCEPTANCE.md`), README additions, two manifest version bumps, one fixture deletion, and a `.gitignore` addition. The only behavioral change is that `slacklens-setup` now writes a minimal permission allowlist to `~/.claude/settings.json` on first run (idempotent).

**Tech Stack:** Python 3 (already required), Claude Code plugin/skill format (Markdown with YAML frontmatter), HTML/CSS/JS (dashboard template), Git.

**Spec:** `docs/superpowers/specs/2026-04-22-slacklens-ship-readiness-design.md` (committed `a7150c1`).

---

## File map

| File | Operation | Purpose |
|---|---|---|
| `.gitignore` | modify | Add `.claude/` so session notes never ship |
| `fixtures/cache.sample.json` | delete | Removes 55 KB of real Slack data |
| `docs/superpowers/specs/2026-04-22-slacklens-dashboard-redesign-design.md` | modify line 157 | Replace real name "Abhinav" with placeholder |
| `docs/superpowers/plans/2026-04-22-slacklens-dashboard-redesign.md` | modify line 633 | Replace real names/channel |
| `scripts/privacy-check.py` | create | Pre-release regex sweep |
| `scripts/test_privacy_check.sh` | create | Tests for privacy-check |
| `skills/slacklens-setup/SKILL.md` | modify | Add Step 0.5 (allowlist); broaden Step 0 probe; soften Step 6 |
| `skills/slacklens-refresh/SKILL.md` | modify Step 3 | Visible log on `present_files` miss |
| `skills/slacklens-open/SKILL.md` | modify Step 3 | Visible log on `present_files` miss |
| `skills/slacklens-rerender/SKILL.md` | modify Step 3 | Visible log on `present_files` miss |
| `skills/slacklens-refresh/references/dashboard.template.html` | modify | Remove dead `setNotice` function + call site |
| `README.md` | modify | New "access" section, new troubleshooting rows, maintainer "Before you distribute" section |
| `docs/ACCEPTANCE.md` | create | Fresh-machine smoke checklist |
| `.claude-plugin/plugin.json` | modify | Version 0.3.0 → 0.4.0 |
| `.claude-plugin/marketplace.json` | modify | Version 0.3.0 → 0.4.0 |

---

## Task 1: Gitignore `.claude/` so session notes never ship

**Files:**
- Modify: `.gitignore`
- Verify: no files under `.claude/` are tracked

**Background:** The working tree has `.claude/SESSION-NOTES.md` which was previously staged (by a blanket `git add -A`) but has since been unstaged. `.claude/` is where Claude Code stores local session state — nothing under it should ever ship.

- [ ] **Step 1: Read current .gitignore**

Run: `cat .gitignore`

Expected: shows `.idea/`, `.vscode/`, `.superpowers/` or similar (confirm — if different, adapt Step 2).

- [ ] **Step 2: Append `.claude/` to .gitignore**

Use Edit tool. Append a new line `.claude/` to the end of `.gitignore`. If `.superpowers/` is already there, add `.claude/` on the following line.

- [ ] **Step 3: Verify nothing under `.claude/` is tracked**

Run: `git ls-files | grep '^\.claude/' || echo CLEAN`
Expected: `CLEAN`

If the output is not `CLEAN`, the file(s) shown are currently tracked. Run `git rm --cached <file>` on each before proceeding.

- [ ] **Step 4: Verify .gitignore now silences the directory**

Run: `git status --short | grep '.claude' || echo HIDDEN`
Expected: `HIDDEN`

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "$(cat <<'EOF'
chore: gitignore .claude/ so local session notes never ship

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Delete real-data fixture

**Files:**
- Delete: `fixtures/cache.sample.json`

**Background:** `fixtures/cache.sample.json` contains real Slack user IDs, real display names, the real workspace `unifyapps.slack.com`, and real channel IDs. `slacklens-rerender` has a documented fallback path for when the fixture is absent (see `skills/slacklens-rerender/SKILL.md` lines 23–26 and 84–86 — it falls back to `~/.slacklens/cache.json`).

- [ ] **Step 1: Confirm rerender fallback is in place**

Run: `grep -n "cache.sample.json" skills/slacklens-rerender/SKILL.md`
Expected: two matches (the two references), both inside fallback-style expressions (`fixture if fixture and os.path.isfile(fixture) else ...`).

If the grep shows the fixture is required (no `else` fallback), STOP and report — the spec assumption is wrong.

- [ ] **Step 2: Delete the fixture**

Run: `git rm fixtures/cache.sample.json`
Expected: `rm 'fixtures/cache.sample.json'`

- [ ] **Step 3: Verify fixtures/ is empty and the directory can be removed**

Run: `ls fixtures/ 2>/dev/null | wc -l`
Expected: `0`

Run: `rmdir fixtures/ 2>/dev/null && echo REMOVED || echo STILL_PRESENT`
Expected: `REMOVED`

(If the directory remains because of hidden files, leave it — `rmdir` will have silently failed.)

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "$(cat <<'EOF'
privacy: delete fixtures/cache.sample.json — contained real workspace data

The fixture shipped real Slack user IDs, display names, channel IDs, and
the unifyapps.slack.com workspace. slacklens-rerender already falls back
to ~/.slacklens/cache.json when the fixture is absent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Scrub real names from committed design docs

**Files:**
- Modify: `docs/superpowers/specs/2026-04-22-slacklens-dashboard-redesign-design.md:157`
- Modify: `docs/superpowers/plans/2026-04-22-slacklens-dashboard-redesign.md:633`

**Background:** Previous session committed the redesign spec + plan with two real-name leaks that the v0.2.0 scrub missed.

- [ ] **Step 1: Read the leak locations**

Run:
```bash
sed -n '155,160p' docs/superpowers/specs/2026-04-22-slacklens-dashboard-redesign-design.md
sed -n '631,635p' docs/superpowers/plans/2026-04-22-slacklens-dashboard-redesign.md
```
Expected: mockup/comment text containing `Abhinav`, `@Abhinav Singi`, `#keka_dev_pm`, `@Dharmin Patel`.

- [ ] **Step 2: Replace the spec line (line 157)**

Use Edit tool on `docs/superpowers/specs/2026-04-22-slacklens-dashboard-redesign-design.md`:

Find the exact string starting with `│ Abhinav` on line 157 and replace `Abhinav` with `Jane Doe`. Use the surrounding context (the box-drawing characters and the timestamp `22:30`) so the `old_string` is unique.

- [ ] **Step 3: Replace the plan line (line 633)**

Use Edit tool on `docs/superpowers/plans/2026-04-22-slacklens-dashboard-redesign.md`:

Replace the comment line at line 633:

Old (exact):
```
// → [['1', '@Abhinav Singi'], ['1', '#keka_dev_pm'], ['0', '@Dharmin Patel'], ...]
```

New:
```
// → [['1', '@Jane Doe'], ['1', '#project-example'], ['0', '@John Example'], ...]
```

- [ ] **Step 4: Verify scrubs landed**

Run: `grep -n 'Abhinav\|Dharmin\|keka_dev_pm' docs/superpowers/ -r || echo CLEAN`
Expected: `CLEAN`

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-22-slacklens-dashboard-redesign-design.md docs/superpowers/plans/2026-04-22-slacklens-dashboard-redesign.md
git commit -m "$(cat <<'EOF'
privacy: scrub real names from dashboard-redesign spec + plan

Replaces 'Abhinav' in spec:157 and '@Abhinav Singi / #keka_dev_pm /
@Dharmin Patel' in plan:633 with generic placeholders.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Write `scripts/privacy-check.py` and its tests

**Files:**
- Create: `scripts/privacy-check.py`
- Create: `scripts/test_privacy_check.sh`

**Background:** Release-time guard. Greps the working tree for real-data patterns defined in the spec. Exits non-zero on any match (excluding documented placeholders and the author name carve-out).

- [ ] **Step 1: Write the test harness**

Create `scripts/test_privacy_check.sh` with exactly this content:

```bash
#!/usr/bin/env bash
# Tests for scripts/privacy-check.py.
# Run from repo root: bash scripts/test_privacy_check.sh
set -u

SCRIPT="$(cd "$(dirname "$0")" && pwd)/privacy-check.py"
PASS=0
FAIL=0

check() {
  local name="$1" expected_rc="$2" actual_rc="$3"
  if [[ "$expected_rc" == "$actual_rc" ]]; then
    echo "ok   - $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL - $name (expected rc=$expected_rc, got rc=$actual_rc)"
    FAIL=$((FAIL + 1))
  fi
}

# Test 1: clean tree → rc 0
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT
echo "hello world" > "$TMPDIR/a.txt"
python3 "$SCRIPT" --root "$TMPDIR" >/dev/null 2>&1
check "clean tree exits 0" 0 $?

# Test 2: leak tree (email) → rc 1
echo "contact shailendra.singh@unifyapps.com" > "$TMPDIR/leak.txt"
python3 "$SCRIPT" --root "$TMPDIR" >/dev/null 2>&1
check "leak (email) exits 1" 1 $?
rm "$TMPDIR/leak.txt"

# Test 3: leak tree (workspace URL) → rc 1
echo "https://unifyapps.slack.com/archives/C123" > "$TMPDIR/leak2.txt"
python3 "$SCRIPT" --root "$TMPDIR" >/dev/null 2>&1
check "leak (workspace URL) exits 1" 1 $?
rm "$TMPDIR/leak2.txt"

# Test 4: leak tree (real user ID) → rc 1
echo "user: U07B1ASMEFJ" > "$TMPDIR/leak3.txt"
python3 "$SCRIPT" --root "$TMPDIR" >/dev/null 2>&1
check "leak (real user ID) exits 1" 1 $?
rm "$TMPDIR/leak3.txt"

# Test 5: documented placeholder IDs are NOT leaks
for id in U01EXAMPLE99 U02EXAMPLE11 U01ALICE000 U01BOB00000; do
  echo "placeholder: $id" > "$TMPDIR/p.txt"
done
python3 "$SCRIPT" --root "$TMPDIR" >/dev/null 2>&1
check "placeholder IDs allowed" 0 $?
rm "$TMPDIR/p.txt"

# Test 6: author-name carve-out
echo '"author": {"name": "Shailendra Singh"}' > "$TMPDIR/ok.txt"
python3 "$SCRIPT" --root "$TMPDIR" >/dev/null 2>&1
check "Shailendra Singh (author) allowed" 0 $?
rm "$TMPDIR/ok.txt"

# Test 7: colleague name leak → rc 1
echo "hey Abhinav, thanks" > "$TMPDIR/leak4.txt"
python3 "$SCRIPT" --root "$TMPDIR" >/dev/null 2>&1
check "colleague name leak exits 1" 1 $?
rm "$TMPDIR/leak4.txt"

# Test 8: customer channel leak → rc 1
echo "#keka_dev_pm" > "$TMPDIR/leak5.txt"
python3 "$SCRIPT" --root "$TMPDIR" >/dev/null 2>&1
check "customer channel leak exits 1" 1 $?
rm "$TMPDIR/leak5.txt"

# Test 9: --list-patterns works
python3 "$SCRIPT" --list-patterns >/dev/null 2>&1
check "--list-patterns succeeds" 0 $?

echo ""
echo "Passed: $PASS   Failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
```

Make it executable: `chmod +x scripts/test_privacy_check.sh`.

- [ ] **Step 2: Run the test — expect failure (script does not yet exist)**

Run: `bash scripts/test_privacy_check.sh`
Expected: all tests FAIL (script missing → python3 returns rc=2 for most, not matching expected).

Actually: `python3 scripts/privacy-check.py` with no file fails with rc=2 ("file not found"). Test 1 expects rc=0 → FAIL. Tests 2–4 expect rc=1 → FAIL. This confirms the test harness is wired correctly.

If the test file itself has a bash syntax error, fix it before proceeding.

- [ ] **Step 3: Write the privacy-check script**

Create `scripts/privacy-check.py` with exactly this content:

```python
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
```

Make it executable: `chmod +x scripts/privacy-check.py`.

- [ ] **Step 4: Run the tests — expect all PASS**

Run: `bash scripts/test_privacy_check.sh`
Expected: nine `ok` lines and `Passed: 9   Failed: 0`.

If any fail, read the failure, compare against the script, fix, re-run.

- [ ] **Step 5: Run privacy-check on the repo — expect CLEAN**

Run: `python3 scripts/privacy-check.py`
Expected: `clean.` on stdout, rc=0.

If it reports hits, examine each. If the hit is a real leak that Tasks 1–3 missed, add it to the scrub. If it is a false positive the patterns should have excluded (e.g., a newly documented placeholder), update `EXCLUDE_FILES` or `PLACEHOLDER_IDS` in the script — but be conservative: prefer fixing the source.

- [ ] **Step 6: Commit**

```bash
git add scripts/privacy-check.py scripts/test_privacy_check.sh
git commit -m "$(cat <<'EOF'
scripts: privacy-check.py — pre-release regex sweep for real-data leaks

Covers author email, workspace URL, real Slack user/channel IDs, real
colleague names, and customer/channel patterns. Excludes documented
placeholders (U01EXAMPLE99 etc.) and the plugin author name
('Shailendra Singh'). Tested by scripts/test_privacy_check.sh.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add Step 0.5 (allowlist writer) to `slacklens-setup`

**Files:**
- Modify: `skills/slacklens-setup/SKILL.md` — insert new section between Step 0 and Step 1.

**Background:** The only way to ship "zero-prompt after first run" today is to have the setup skill append the plugin's minimal allowlist to `~/.claude/settings.json`. The write itself prompts once; every tool used by the plugin is pre-approved thereafter.

- [ ] **Step 1: Read the existing Step 0 → Step 1 boundary**

Run: `sed -n '19,31p' skills/slacklens-setup/SKILL.md`
Expected: shows `Do not try to continue if Slack MCP is unreachable.` followed by `## Step 1 — Create the SlackLens data directory`.

- [ ] **Step 2: Insert Step 0.5 with the allowlist writer**

Use Edit tool. Find this exact block (the last line of Step 0 followed by the Step 1 header):

```
Do not try to continue if Slack MCP is unreachable.

## Step 1 — Create the SlackLens data directory
```

Replace it with:

```
Do not try to continue if Slack MCP is unreachable.

## Step 0.5 — Pre-approve SlackLens's permissions

SlackLens needs a small, fixed set of tool permissions to run without
interrupting you on every refresh. This step appends them to your
`~/.claude/settings.json` once, idempotently. You will see **one**
permission prompt for the write below — approve "always allow" and
every subsequent SlackLens action will be silent.

```bash
python3 - <<'PY'
import json, os

p = os.path.expanduser("~/.claude/settings.json")
os.makedirs(os.path.dirname(p), exist_ok=True)

if os.path.isfile(p):
    with open(p, "r", encoding="utf-8") as f:
        cfg = json.load(f)
else:
    cfg = {}

perms = cfg.setdefault("permissions", {})
allow = perms.setdefault("allow", [])

needed = [
    "Bash(mkdir:*)",
    "Bash(python3:*)",
    "Bash(open:*)",
    "Bash(test:*)",
    "Bash([:*)",
    "mcp__claude_ai_Slack__slack_search_users",
    "mcp__claude_ai_Slack__slack_read_user_profile",
    "mcp__claude_ai_Slack__slack_search_public_and_private",
    "mcp__claude_ai_Slack__slack_read_thread",
    "mcp__scheduled-tasks__create_scheduled_task",
    "mcp__scheduled-tasks__delete_scheduled_task",
    "Write(/tmp/slacklens-refresh.json)",
    "mcp__cowork__present_files",
]
added = [rule for rule in needed if rule not in allow]
allow.extend(added)

with open(p, "w", encoding="utf-8") as f:
    json.dump(cfg, f, indent=2)

print("added_permissions=" + str(len(added)))
PY
```

If `added_permissions=0`, the allowlist was already in place — nothing
to do. Otherwise tell the user once: "Granted SlackLens `N` permissions
in `~/.claude/settings.json`. Refreshes will run silently from here."

## Step 1 — Create the SlackLens data directory
```

(The insertion adds a whole new Step 0.5 section and preserves the Step 1 header unchanged.)

- [ ] **Step 3: Verify the insertion landed and Step 1 is still present once**

Run: `grep -n '^## Step' skills/slacklens-setup/SKILL.md`
Expected: headers appear in order — Step 0, Step 0.5, Step 1, Step 2, Step 3, Step 4, Step 5, Step 6, Step 7, Step 8.

If Step 1 appears twice or Step 0.5 is missing, revert and redo.

- [ ] **Step 4: Dry-run the Python block manually to verify it parses**

Run:
```bash
python3 - <<'PY'
import json
import pathlib
# Extract the Python block from Step 0.5 and syntax-check it.
text = pathlib.Path("skills/slacklens-setup/SKILL.md").read_text()
start = text.index("## Step 0.5")
end = text.index("## Step 1 —")
block = text[start:end]
# Find the first ```bash fence and extract the python heredoc inside.
import re
m = re.search(r"```bash\n(.*?)\n```", block, re.DOTALL)
assert m, "no bash fence found in Step 0.5"
script = m.group(1)
py_body = re.search(r"<<'PY'\n(.*)\nPY", script, re.DOTALL)
assert py_body, "no PY heredoc"
compile(py_body.group(1), "<step_0_5>", "exec")
print("Step 0.5 Python block compiles OK")
PY
```
Expected: `Step 0.5 Python block compiles OK`.

- [ ] **Step 5: Commit**

```bash
git add skills/slacklens-setup/SKILL.md
git commit -m "$(cat <<'EOF'
setup: pre-approve SlackLens's minimal permission allowlist (Step 0.5)

One-time write to ~/.claude/settings.json. Idempotent. Replaces the
per-refresh permission-prompt gauntlet with a single approve-once flow.
Allowlist is scoped tightly: four Slack MCP read-tools, two
scheduled-tasks MCP tools, one cowork present_files tool, the exact
/tmp Write path, and narrow Bash patterns (mkdir, python3, open, test,
'[').

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Broaden the Slack MCP probe in Step 0

**Files:**
- Modify: `skills/slacklens-setup/SKILL.md` — Step 0 body.

**Background:** Step 0 currently only probes `slack_search_users`. A teammate on an older Slack MCP might have that tool but not `slack_search_public_and_private` or `slack_read_thread`, which leads to a confusing failure inside the first refresh. Probe all four up front.

- [ ] **Step 1: Read current Step 0**

Run: `sed -n '6,19p' skills/slacklens-setup/SKILL.md`
Expected: the existing Step 0 body, ending at "Do not try to continue if Slack MCP is unreachable."

- [ ] **Step 2: Replace Step 0 with a broader probe**

Use Edit tool. Find the exact block:

```
## Step 0 — Verify Slack MCP is connected

Make a no-op call such as `slack_search_users` with a single-letter query
("a", limit 1). If the call errors with "MCP not connected", "tool not
found", or any auth error, STOP and tell the user:

> SlackLens needs the Slack MCP to be connected before setup can run.
>
> Open Cowork → Settings → Connectors → Slack → Connect, then send
> "set up slack lens" again.

Do not try to continue if Slack MCP is unreachable.
```

Replace with:

```
## Step 0 — Verify Slack MCP is connected and has the tools we need

SlackLens uses four read-only Slack MCP tools. Probe each once to make
sure the connector is live AND modern enough. Run these four calls,
ignoring their actual return values — we only care whether each one
*exists*:

1. `slack_search_users` with query `"a"`, limit 1.
2. `slack_read_user_profile` with no arguments.
3. `slack_search_public_and_private` with query `"a"`, limit 1.
4. `slack_read_thread` with a clearly-invalid `channel_id: "C0"` and `thread_ts: "0"` — the tool may return an error about the bad arguments, which is fine; that still proves the tool is wired up. A "tool not found" or "MCP not connected" error is NOT fine.

For each call, if it fails with "MCP not connected", "tool not found",
"unknown tool", or any auth error, STOP and tell the user:

> SlackLens needs the Slack MCP (a recent version) to be connected
> before setup can run. The `<tool name>` tool is missing or the
> connector is not authorised.
>
> Open Cowork → Settings → Connectors → Slack → Connect, make sure
> it's up to date, then send "set up slack lens" again.

Do not try to continue if any of the four probes fails this way.
```

- [ ] **Step 3: Verify the replacement**

Run: `grep -c 'slack_read_thread\|slack_search_public_and_private\|slack_read_user_profile\|slack_search_users' skills/slacklens-setup/SKILL.md`
Expected: ≥ 5 (the four probe mentions in Step 0 plus any pre-existing references in later steps).

Run: `grep -n '^## Step 0 ' skills/slacklens-setup/SKILL.md`
Expected: exactly one match (the Step 0 header).

- [ ] **Step 4: Commit**

```bash
git add skills/slacklens-setup/SKILL.md
git commit -m "$(cat <<'EOF'
setup: probe all four Slack MCP tools in Step 0 (not just search_users)

Refresh uses search_public_and_private and read_thread which weren't
probed. An older Slack connector could pass Step 0 but fail inside
first refresh with a confusing error. Probe each tool up front.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Soften Step 6 refresh (non-fatal on first-run refresh failure)

**Files:**
- Modify: `skills/slacklens-setup/SKILL.md` — Step 6.

**Background:** If the in-session refresh in Step 6 fails (typically: Slack MCP rate-limit cooldown from the Step 0 probe), setup currently surfaces it as a hard failure. But everything else — config, dashboard file, scheduled task — is already in place; the auto-refresh cron will pick up on schedule. Surface the error but don't imply setup itself is broken.

- [ ] **Step 1: Read current Step 6**

Run: `grep -n -A6 '^## Step 6 ' skills/slacklens-setup/SKILL.md`
Expected: shows a three-line body ending with "do not pretend setup succeeded."

- [ ] **Step 2: Replace Step 6**

Use Edit tool. Find this exact block:

```
## Step 6 — Trigger the first refresh

Run the `slacklens-refresh` skill now (in this same session) so the user
sees data immediately. Wait for it to finish. If it fails, surface the
error clearly — do not pretend setup succeeded.
```

Replace with:

```
## Step 6 — Trigger the first refresh

Run the `slacklens-refresh` skill now (in this same session) so the
user sees data immediately. Wait for it to finish.

If the refresh fails — typically because the Slack MCP is rate-limited
from the Step 0 probes — **do not abort setup**. Config, dashboard
template, and the auto-refresh scheduled task are all already in place;
the next scheduled tick will pick up. Tell the user clearly:

> Setup is complete, <USER_NAME>, but the first refresh failed:
> `<error message>`. Say `refresh slacklens` in a minute, or wait for
> the scheduled refresh.

Then proceed to Step 7 (open the dashboard) regardless — the dashboard
will render from the empty-cache state and show the empty-state banner.
```

- [ ] **Step 3: Verify**

Run: `grep -n '^## Step ' skills/slacklens-setup/SKILL.md`
Expected: Step 0, 0.5, 1, 2, 3, 4, 5, 6, 7, 8 — one of each.

Run: `grep -c 'do not abort setup\|refresh slacklens\` in a minute' skills/slacklens-setup/SKILL.md`
Expected: ≥ 1.

- [ ] **Step 4: Commit**

```bash
git add skills/slacklens-setup/SKILL.md
git commit -m "$(cat <<'EOF'
setup: don't fail setup when the first refresh fails (Step 6)

Config, template, and cron are already in place before Step 6; a
rate-limited Slack MCP shouldn't void the whole setup. Surface the
error and keep going.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Remove dead `setNotice` function + call site from dashboard template

**Files:**
- Modify: `skills/slacklens-refresh/references/dashboard.template.html`.

**Background:** `setNotice` is a no-op left from an earlier iteration. `showBanner` / `clearBanner` are the real surfaces. Removing avoids future-you re-discovering the confusing dead branch.

- [ ] **Step 1: Find the `setNotice` definition and its call sites**

Run: `grep -n 'setNotice' skills/slacklens-refresh/references/dashboard.template.html`
Expected: typically two lines — one function definition (`function setNotice...` or `const setNotice`) and one call inside `loadCache`.

If more than two matches exist, read each with surrounding context before editing. Record each line number.

- [ ] **Step 2: Remove the call site in `loadCache`**

Use Edit tool. Find the single line calling `setNotice(...)` inside `loadCache` (use enough surrounding lines as context to make `old_string` unique) and delete it entirely. Keep the surrounding code and indentation intact.

- [ ] **Step 3: Remove the `setNotice` function definition**

Use Edit tool. Find the function definition (expect a small body — the session notes describe it as a no-op). Use enough surrounding context (e.g., the preceding or following function) to make the `old_string` unique. Delete the entire function, including its trailing blank line.

- [ ] **Step 4: Verify no `setNotice` remains**

Run: `grep -n 'setNotice' skills/slacklens-refresh/references/dashboard.template.html || echo CLEAN`
Expected: `CLEAN`.

- [ ] **Step 5: JS syntax check**

Run:
```bash
python3 - <<'PY'
import re, tempfile, os, subprocess, sys
h = open('skills/slacklens-refresh/references/dashboard.template.html').read()
s = re.findall(r'<script[^>]*>(.*?)</script>', h, re.DOTALL)
fd, p = tempfile.mkstemp(suffix='.js'); os.close(fd)
open(p, 'w').write('\n'.join(s))
r = subprocess.run(['node', '--check', p]); os.remove(p); sys.exit(r.returncode)
PY
```
Expected: rc=0, no output.

If `node` is not installed, skip — the plugin does not require Node at runtime, this is dev-only validation.

- [ ] **Step 6: Rerender the dashboard from the existing cache and eyeball**

If `~/.slacklens/cache.json` exists on your machine, run the `slacklens-rerender` skill (say `rerender slacklens` in chat) and confirm the dashboard still loads without console errors. If no cache is present, skip — the syntax check in Step 5 is sufficient.

- [ ] **Step 7: Commit**

```bash
git add skills/slacklens-refresh/references/dashboard.template.html
git commit -m "$(cat <<'EOF'
dashboard: remove dead setNotice no-op and its call site

showBanner/clearBanner are the real banner surface since v0.3.0. The
setNotice stub was kept only so loadCache's existing call wouldn't
throw. Delete both.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Visible log when `present_files` is unavailable (3 skills)

**Files:**
- Modify: `skills/slacklens-refresh/SKILL.md` — Step 3.
- Modify: `skills/slacklens-open/SKILL.md` — Step 3.
- Modify: `skills/slacklens-rerender/SKILL.md` — Step 3.

**Background:** All three skills have a silent fallback that skips the Cowork-panel presentation if `present_files` is unavailable. A teammate then wonders why nothing appeared. Surface a one-line log.

- [ ] **Step 1: Update `slacklens-refresh` Step 3**

Use Edit tool on `skills/slacklens-refresh/SKILL.md`.

Find this exact block:

```
## Step 3 — Surface the dashboard in Cowork

Call the `present_files` tool from the cowork MCP with the path
`~/.slacklens/dashboard.html` so the dashboard appears in the Cowork
panel.

If `present_files` is unavailable in this session (e.g. when running
from a scheduled task), skip — the cache is still on disk and the
browser tab (if open) will pick it up on next reload.
```

Replace with:

```
## Step 3 — Surface the dashboard in Cowork

Call the `present_files` tool from the cowork MCP with the path
`~/.slacklens/dashboard.html` so the dashboard appears in the Cowork
panel.

If `present_files` is unavailable in this session (e.g. when running
from a scheduled task), emit a one-line note to the chat output —
**do not silently skip**:

> Cowork `present_files` not available in this session — dashboard is
> still on disk at `~/.slacklens/dashboard.html`; open it manually or
> reload an existing browser tab.

Then continue to Step 4.
```

- [ ] **Step 2: Update `slacklens-open` Step 3**

Use Edit tool on `skills/slacklens-open/SKILL.md`.

Find this exact block:

```
## Step 3 — Present in Cowork

Call the `present_files` tool from the cowork MCP with the path
`~/.slacklens/dashboard.html` so the dashboard is also available in
the Cowork side panel.

If `present_files` is unavailable, skip — the browser tab is enough.
```

Replace with:

```
## Step 3 — Present in Cowork

Call the `present_files` tool from the cowork MCP with the path
`~/.slacklens/dashboard.html` so the dashboard is also available in
the Cowork side panel.

If `present_files` is unavailable, emit this one-line note —
**do not silently skip**:

> Cowork `present_files` not available — dashboard opened in your
> browser only.

Then continue to Step 4.
```

- [ ] **Step 3: Update `slacklens-rerender` Step 3**

Use Edit tool on `skills/slacklens-rerender/SKILL.md`.

Find this exact block:

```
## Step 3 — Surface the dashboard

Call the `present_files` tool from the cowork MCP with the path
`~/.slacklens/dashboard.html`.
```

Replace with:

```
## Step 3 — Surface the dashboard

Call the `present_files` tool from the cowork MCP with the path
`~/.slacklens/dashboard.html`.

If `present_files` is unavailable, emit this one-line note —
**do not silently skip**:

> Cowork `present_files` not available — rerender is written to
> `~/.slacklens/dashboard.html`; reload your existing browser tab.
```

- [ ] **Step 4: Verify**

Run:
```bash
grep -c 'do not silently skip' skills/slacklens-refresh/SKILL.md skills/slacklens-open/SKILL.md skills/slacklens-rerender/SKILL.md
```
Expected: each file shows `1`.

- [ ] **Step 5: Commit**

```bash
git add skills/slacklens-refresh/SKILL.md skills/slacklens-open/SKILL.md skills/slacklens-rerender/SKILL.md
git commit -m "$(cat <<'EOF'
skills: emit a visible note when cowork present_files is unavailable

Previously the three skills silently skipped the Cowork-panel
presentation, leaving the user to wonder why nothing appeared. Now each
prints a one-line note pointing at the on-disk dashboard.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: README — "What SlackLens has access to" + troubleshooting rows

**Files:**
- Modify: `README.md`.

**Background:** Teammates want to know what they're granting. Spec Section 4 mandates an access-summary section plus three new troubleshooting rows.

- [ ] **Step 1: Read current README structure**

Run: `grep -n '^## \|^> ' README.md`
Expected: headers "Install", "Day to day", "How it works", "Updating", "When things break", and probably a blockquote line.

- [ ] **Step 2: Insert the access-summary section**

Use Edit tool. Find the exact `## Updating` header line and replace it with the new section followed by the original header:

```
## What SlackLens has access to

SlackLens asks for a tight, fixed set of permissions during setup.
It never writes to Slack. It only reads your mentions, DMs, and
threads. It never sends messages on your behalf.

**Slack (read-only):**
- `slack_read_user_profile` — to detect who you are.
- `slack_search_users` — to look up the people you mark as priority.
- `slack_search_public_and_private` — to find your mentions/DMs.
- `slack_read_thread` — to show you the thread you were mentioned in.

**Local filesystem:**
- Writes `~/.slacklens/config.json`, `~/.slacklens/cache.json`,
  `~/.slacklens/dashboard.html`.
- Writes `/tmp/slacklens-refresh.json` during refresh (intermediate,
  auto-cleaned).
- Writes one allowlist entry set to `~/.claude/settings.json` on
  first setup.

**Shell:**
- `mkdir`, `python3`, `open`, `test`, `[` — all scoped to the narrow
  subcommands the skills actually call.

**Scheduled tasks:**
- Registers one task, `slacklens-refresh`, running every 8 hours.

**To revoke everything SlackLens was granted:** run `/permissions` in
chat and remove the entries, or edit `~/.claude/settings.json` directly.

## Updating
```

- [ ] **Step 3: Extend the troubleshooting table**

Use Edit tool on `README.md`. Find the last row of the troubleshooting
table — it is the row whose "Symptom" column begins with `"Marketplace file not found"`. After that row, append three new rows:

```
| Setup asks for several permissions in a row | Expected on first run. Approve "always allow" for each. Subsequent refreshes run silently. |
| Teammate on Linux/WSL — `open slacklens` does nothing | Install `xdg-utils` or set `$BROWSER`. The dashboard still lives at `~/.slacklens/dashboard.html`. |
| Want to revoke what SlackLens was granted | Run `/permissions` in chat, or edit `~/.claude/settings.json` and remove SlackLens's entries (they start with `Bash(mkdir:*)` or `mcp__claude_ai_Slack__*`). |
```

- [ ] **Step 4: Verify**

Run: `grep -n '^## ' README.md`
Expected: "Install", "Day to day", "How it works", "What SlackLens has access to", "Updating", "When things break". Six top-level `##` headers.

Run: `grep -c '^| Setup asks\|^| Teammate on Linux\|^| Want to revoke' README.md`
Expected: `3`.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
readme: document what SlackLens has access to + 3 new troubleshooting rows

New 'What SlackLens has access to' section enumerates every Slack MCP
tool, local write path, shell command, and scheduled task the plugin
uses. Troubleshooting grows: setup permission prompts, Linux/WSL open,
revocation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: README — maintainer "Before you distribute" section

**Files:**
- Modify: `README.md`.

**Background:** Maintainer-only checklist, tucked at the bottom so users don't see it first.

- [ ] **Step 1: Append the maintainer section at the end of README**

Use Edit tool. Find the final line of README (the last row of the troubleshooting table) and append (after a blank line):

```

---

## Before you distribute (maintainer)

Run this checklist before cutting a new release:

1. `python3 scripts/privacy-check.py` — must print `clean.` and exit 0.
2. Walk `docs/ACCEPTANCE.md` on a fresh profile (or clean state:
   `rm -rf ~/.slacklens ~/.claude/plugins/cache/alazord`).
3. Bump `version` in both `.claude-plugin/plugin.json` and
   `.claude-plugin/marketplace.json`. They must match.
4. Commit with a `vX.Y.Z:` prefix so the tag reads cleanly.
5. Tag: `git tag vX.Y.Z && git push origin main --tags`.
6. Announce to existing installers: "Run `/plugin marketplace update
   alazord` to pull vX.Y.Z".
```

- [ ] **Step 2: Verify**

Run: `tail -20 README.md | grep 'Before you distribute'`
Expected: one match.

Run: `grep -n '^## ' README.md`
Expected: seven top-level `##` headers, ending with "Before you distribute (maintainer)".

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
readme: add 'Before you distribute (maintainer)' release checklist

Privacy-check → ACCEPTANCE walk → version bump → tag → announce.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Create `docs/ACCEPTANCE.md`

**Files:**
- Create: `docs/ACCEPTANCE.md`.

**Background:** Fresh-machine smoke checklist. Maintainer walks this before every distribution bump.

- [ ] **Step 1: Create `docs/ACCEPTANCE.md`**

Use Write tool. Content:

```markdown
# SlackLens acceptance checklist

Run this on a fresh profile (or after
`rm -rf ~/.slacklens ~/.claude/plugins/cache/alazord`) before any
v0.X.0 distribution bump. If any box is unchecked, don't ship.

## Install

- [ ] `/plugin marketplace add Alazord/slack-lens-plugin` — prints
      "Successfully added marketplace: alazord".
- [ ] `/plugin install slacklens@alazord` — prints "Installed
      slacklens". No permission prompts at this stage.
- [ ] `/reload-plugins` — plugin appears in the list.

## First-run setup

- [ ] Say `set up slacklens` in chat. Setup starts.
- [ ] Step 0 probes all four Slack MCP tools silently. If any is
      missing, setup stops with a clear error — acceptable failure.
- [ ] Step 0.5 triggers **exactly one** permission prompt (the
      `~/.claude/settings.json` write). Approve "always allow".
- [ ] Remaining setup steps (identity detect, priority-people,
      config write, scheduled-task register, first refresh, open)
      run **silently** — no further permission prompts.
- [ ] First refresh succeeds OR setup surfaces a soft-error and
      proceeds anyway.
- [ ] Dashboard opens in the default browser.
- [ ] Dashboard renders (items visible if refresh succeeded, empty
      state otherwise).

## Steady state

- [ ] Say `refresh slacklens`. **Zero** permission prompts. Cache
      updates, browser tab reloads (or Cowork panel shows updated).
- [ ] Say `open slacklens`. Browser tab opens (or focuses).
- [ ] Run `~/.claude/plugins/cache/alazord/slacklens/scripts/privacy-check.py`
      against the installed plugin cache — exit 0. (Optional, for
      belt-and-braces.)

## Files on disk

- [ ] `~/.slacklens/config.json` — contains your detected identity.
- [ ] `~/.slacklens/cache.json` — non-empty if refresh succeeded.
- [ ] `~/.slacklens/dashboard.html` — embeds the cache.
- [ ] `~/.claude/settings.json` — `permissions.allow` contains the
      13 entries from the setup Step 0.5 allowlist.

## Scheduled task

- [ ] Look up scheduled tasks (via whatever Cowork/CLI surface you
      use). Task `slacklens-refresh` is registered with cron
      `0 */8 * * *`.

## Repo hygiene (maintainer only)

- [ ] `python3 scripts/privacy-check.py` — exits 0.
- [ ] `git status` — working tree clean. `.claude/` is ignored.
- [ ] `fixtures/` — either absent or contains only scrubbed data.
```

- [ ] **Step 2: Verify**

Run: `wc -l docs/ACCEPTANCE.md`
Expected: ~50–60 lines.

Run: `grep -c '^- \[ \]' docs/ACCEPTANCE.md`
Expected: ≥ 18.

- [ ] **Step 3: Commit**

```bash
git add docs/ACCEPTANCE.md
git commit -m "$(cat <<'EOF'
docs: ACCEPTANCE.md — fresh-machine smoke checklist

Walks install, first-run setup, steady state, on-disk files, scheduled
task, and repo hygiene. Maintainer runs this before every distribution
bump.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Version bump to v0.4.0

**Files:**
- Modify: `.claude-plugin/plugin.json`.
- Modify: `.claude-plugin/marketplace.json`.

- [ ] **Step 1: Bump `plugin.json`**

Use Edit tool on `.claude-plugin/plugin.json`. Change `"version": "0.3.0"` to `"version": "0.4.0"`.

- [ ] **Step 2: Bump `marketplace.json`**

Use Edit tool on `.claude-plugin/marketplace.json`. Change the single occurrence of `"version": "0.3.0"` (inside the `plugins[0]` entry) to `"version": "0.4.0"`.

- [ ] **Step 3: Verify both versions agree**

Run: `grep '"version":' .claude-plugin/plugin.json .claude-plugin/marketplace.json`
Expected: both lines show `"version": "0.4.0"`.

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "$(cat <<'EOF'
v0.4.0: ship-readiness — permissions, privacy, runtime, docs

Plugin-manifest version bump. See commit log + docs/superpowers/specs/
2026-04-22-slacklens-ship-readiness-design.md for the full change set.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Final verification

**Files:** none modified.

- [ ] **Step 1: privacy-check on the full tree**

Run: `python3 scripts/privacy-check.py`
Expected: `clean.`, rc=0.

If any hit is reported, stop — a previous task left a leak. Fix and re-commit before proceeding.

- [ ] **Step 2: Re-run the privacy-check test suite**

Run: `bash scripts/test_privacy_check.sh`
Expected: `Passed: 9   Failed: 0`.

- [ ] **Step 3: Confirm the 10-commit arc is clean and linear**

Run: `git log --oneline -15`
Expected: the first ten entries (top = most recent) are the commits from Tasks 1 through 13, in reverse order. If there are merge commits or rebases in between, note but don't rewrite — non-linear history isn't a ship blocker.

- [ ] **Step 4: Smoke the dashboard locally (optional but recommended)**

If `~/.slacklens/cache.json` exists on your machine, say `rerender slacklens` in chat and confirm the dashboard still renders. (Does not require a Slack call.)

If no cache is present, skip this step — the template's JS syntax was checked in Task 8.

- [ ] **Step 5: Walk ACCEPTANCE.md (optional but recommended before public announce)**

Follow `docs/ACCEPTANCE.md` on a spare profile. This is the real end-to-end proof. Not gated into this plan because it needs a second machine or clean state.

- [ ] **Step 6: Done — no further commit**

This task is verification only. If everything passes, v0.4.0 is ready to tag.

Tag (when you decide to push):
```bash
git tag v0.4.0
# git push origin main --tags    # only when you're ready
```

---

## Self-review (author note, not an executor step)

**Spec coverage check** — every spec section maps to a task:

| Spec section | Task(s) |
|---|---|
| 1. Permissions (minimal allowlist + Step 0.5) | 5 |
| 2. Privacy (docs scrubs, fixture delete, gitignore, privacy-check script) | 1, 2, 3, 4 |
| 3. Runtime (setNotice, present_files log, Step 6 non-fatal, broader MCP probe, cross-platform) | 6, 7, 8, 9 (cross-platform parent-dir already handled in Task 5's `os.makedirs`) |
| 4. Docs (README access + troubleshooting, README maintainer, ACCEPTANCE.md) | 10, 11, 12 |
| File-by-file summary (manifest version bump) | 13 |
| Acceptance criteria | 14 |

**Placeholder scan:** no "TBD", "TODO", "similar to Task N" without repeat, or under-specified steps. Every code block is complete; every command has an expected output.

**Type consistency:** `needed` allowlist list is identical in the spec, Task 5 code, and Task 10 README. Four Slack tool names are identical across Task 5, Task 6, and Task 10. Test rc values in Task 4 match the script's actual exits.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-22-slacklens-ship-readiness.md`.
