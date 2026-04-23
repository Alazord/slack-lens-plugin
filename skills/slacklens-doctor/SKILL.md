---
name: slacklens-doctor
description: Health-check SlackLens end-to-end. Probes every runtime dependency (Slack MCP, scheduled-tasks MCP, Cowork MCP), checks that the plugin's own files are present and the cache is fresh, reads the refresh log for recent failures, and prints a check/cross report with a one-line fix for each failure. Supports a `--fix` mode that re-runs idempotent repairs (allowlist injection, dashboard template re-copy, identity+VIP re-injection) and a `--json` mode that emits a single structured JSON object instead of the pretty report. Use when the user says "check slacklens", "slacklens doctor", "slacklens health", "is slacklens working", "slacklens status", "debug slacklens", "slacklens troubleshoot", "fix slacklens", or asks for "slacklens json" / "slacklens --json".
---

You are running SlackLens's health check. Produce a concise report —
no prose, just a checklist — so the user can see what is working and
what is not without having to read the raw commands.

## Step 0 — Pick a mode

Inspect the user's request to decide which mode to run:

| User says...                                                  | Mode   |
|---------------------------------------------------------------|--------|
| `check slacklens`, `slacklens doctor`, `is slacklens working` | report |
| `check slacklens --json`, `slacklens json`, `doctor --json`   | json   |
| `fix slacklens`, `check slacklens --fix`, `repair slacklens`  | fix    |

Default is **report**. In **json** mode, suppress all prose, emit a single
JSON object at the very end. In **fix** mode, first run the repairs in
Step 6, then run the normal report so the user sees what was fixed.

The four report sections are: **Runtime**, **Plugin state**,
**Dashboard cache**, **Scheduled refresh**, plus a **Recent refreshes**
summary. For each entry, print one line in the form:

```
✓ <thing>
✗ <thing> — <one-line fix>
⚠ <thing> — <one-line note>
```

## Step 1 — Runtime probes

Run these MCP probes and capture pass/fail. Do NOT stop if one fails —
keep going so the user gets the whole picture.

1. `slack_search_users` with query `"a"`, limit 1.
2. `slack_read_user_profile` with no arguments.
3. `slack_search_public_and_private` with query `"a"`, limit 1.
4. `mcp__scheduled-tasks__create_scheduled_task` — **do not actually
   create**; if the tool appears in your tool list at all, mark ✓.
   If your runtime doesn't expose it, mark ⚠ and note that auto-refresh
   cannot run on this runtime (user must say `refresh slacklens`
   manually).
5. `mcp__cowork__present_files` — same pattern. If absent, mark ⚠
   and note that the dashboard opens in the browser only (no
   side-panel mirroring). This is not an error on most runtimes.

## Step 2 — Plugin state + allowlist drift

```bash
python3 - <<'PY'
import json, os
from datetime import datetime, timezone

home = os.path.expanduser("~/.slacklens")
checks = []

# Config
cfg_path = os.path.join(home, "config.json")
if os.path.isfile(cfg_path):
    try:
        cfg = json.load(open(cfg_path))
        user = cfg.get("user", {})
        vips = cfg.get("priority_people", [])
        if user.get("slack_id") and user.get("name"):
            checks.append(("OK", f"config.json — {user['name']} ({user['slack_id']}), {len(vips)} VIP(s)"))
        else:
            checks.append(("FAIL", "config.json present but user identity missing — re-run `set up slacklens`"))
    except Exception as e:
        checks.append(("FAIL", f"config.json unreadable ({e}) — re-run `set up slacklens`"))
else:
    checks.append(("FAIL", "config.json missing — run `set up slacklens`"))

# Dashboard
dash_path = os.path.join(home, "dashboard.html")
if os.path.isfile(dash_path):
    size = os.path.getsize(dash_path)
    checks.append(("OK", f"dashboard.html — {size//1024} KB"))
else:
    checks.append(("FAIL", "dashboard.html missing — run `set up slacklens` or `refresh slacklens`"))

# Allowlist drift — this list MUST mirror slacklens-setup Step 0.5 `needed`.
# If you add a permission there, add it here too; doctor is the only
# thing that catches upgrade drift for existing installs.
NEEDED = [
    "Bash(mkdir:*)",
    "Bash(python3:*)",
    "Bash(open:*)",
    "Bash(xdg-open:*)",
    "Bash(wslview:*)",
    "Bash(command:*)",
    "Bash(sleep:*)",
    "Bash(echo:*)",
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

settings_path = os.path.expanduser("~/.claude/settings.json")
if os.path.isfile(settings_path):
    try:
        s = json.load(open(settings_path))
        allow = (s.get("permissions") or {}).get("allow") or []
        missing = [n for n in NEEDED if n not in allow]
        if not missing:
            checks.append(("OK", f"~/.claude/settings.json — allowlist has all {len(NEEDED)}/{len(NEEDED)} required entries"))
        else:
            # Drift usually means you upgraded SlackLens across a version
            # that added new entries. `fix slacklens` re-injects them.
            short = ", ".join(missing[:3]) + (f" (+{len(missing)-3} more)" if len(missing) > 3 else "")
            checks.append(("WARN", f"~/.claude/settings.json — {len(missing)}/{len(NEEDED)} entries missing: {short}. Run `fix slacklens` to repair."))
    except Exception as e:
        checks.append(("WARN", f"~/.claude/settings.json unreadable ({e})"))
else:
    checks.append(("WARN", "~/.claude/settings.json missing — each refresh will re-prompt for permissions. Run `set up slacklens`."))

for status, msg in checks:
    glyph = {"OK":"✓", "FAIL":"✗", "WARN":"⚠"}[status]
    print(f"{glyph} {msg}")
PY
```

## Step 3 — Dashboard cache + schema version

```bash
python3 - <<'PY'
import json, os
from datetime import datetime, timezone

SUPPORTED_CACHE_VERSION = 1

home = os.path.expanduser("~/.slacklens")
cache_path = os.path.join(home, "cache.json")
if not os.path.isfile(cache_path):
    print("✗ cache.json missing — run `refresh slacklens`")
else:
    try:
        data = json.load(open(cache_path))
        sr = data.get("search_results") or {}
        m = sum(len(q.get("results", [])) for q in (sr.get("mentions") or []))
        d = sum(len(q.get("results", [])) for q in (sr.get("dms") or []))
        c = sum(len(q.get("results", [])) for q in (sr.get("channels") or []))
        t = len(data.get("threads") or {})
        total = m + d + c + t

        # Schema version — v0.5+ caches carry a version field. Missing
        # field = pre-v0.5 cache; treat as v0 and warn soft.
        ver = data.get("version")
        if ver is None:
            print(f"⚠ cache schema — no version field (pre-v0.6). Safe but run `refresh slacklens` to upgrade.")
        elif ver > SUPPORTED_CACHE_VERSION:
            print(f"✗ cache schema — v{ver} newer than dashboard supports (v{SUPPORTED_CACHE_VERSION}). Update the plugin.")
        elif ver < SUPPORTED_CACHE_VERSION:
            print(f"⚠ cache schema — v{ver} older than current v{SUPPORTED_CACHE_VERSION}. Run `refresh slacklens`.")
        else:
            print(f"✓ cache schema — v{ver}")

        # Freshness
        raw_ts = data.get("refreshed_at") or ""
        age_note = ""
        try:
            ts = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
            hrs = (datetime.now(ts.tzinfo or timezone.utc) - ts).total_seconds() / 3600
            if hrs > 24:
                age_note = f", STALE ({hrs:.0f}h old — say `refresh slacklens`)"
            else:
                age_note = f", {hrs:.1f}h old"
        except Exception:
            age_note = ", timestamp unparseable"
        marker = "✓" if total > 0 else "⚠"
        extra = "" if total > 0 else " — `refresh slacklens` to populate"
        print(f"{marker} cache.json — {m} mentions / {d} DMs / {c} channel pings / {t} threads{age_note}{extra}")
    except Exception as e:
        print(f"✗ cache.json unreadable ({e}) — run `refresh slacklens`")
PY
```

## Step 4 — Recent refreshes (refresh.log)

```bash
python3 - <<'PY'
import json, os
home = os.path.expanduser("~/.slacklens")
log_path = os.path.join(home, "refresh.log")
if not os.path.isfile(log_path):
    print("⚠ refresh.log — no refreshes recorded yet. Run `refresh slacklens` once.")
else:
    lines = [ln for ln in open(log_path, encoding="utf-8").read().splitlines() if ln.strip()]
    if not lines:
        print("⚠ refresh.log — empty. Run `refresh slacklens` once.")
    else:
        ok = sum(1 for ln in lines if '"outcome":"ok"' in ln or '"outcome": "ok"' in ln)
        fail = len(lines) - ok
        last = lines[-1]
        try:
            entry = json.loads(last)
            summary = entry.get("at", "?") + " (" + entry.get("mode", "?") + ", " + entry.get("outcome", "?") + ")"
        except Exception:
            summary = last[:80]
        marker = "✓" if fail == 0 else "⚠"
        tail = f" — {fail} failure(s) in last {len(lines)}" if fail else ""
        print(f"{marker} refresh.log — last: {summary}{tail}")
PY
```

## Step 5 — Scheduled refresh

If the `mcp__scheduled-tasks__*` MCP is available in this session,
list the registered tasks and check whether `slacklens-refresh`
appears. If it does, mark ✓ with its cron expression. If it does not,
mark ⚠ with the note: "Auto-refresh not registered — you are on
manual-only. Say `set up slacklens` and answer 'yes' to scheduling,
or say `refresh slacklens` whenever you need fresh data."

If the MCP is not available, mark ⚠ with: "Scheduled-tasks MCP not
exposed by this runtime — auto-refresh is unavailable here, use
`refresh slacklens` on demand."

## Step 6 — Fix mode (only if user asked for fix)

Only run this if the user's request matched **fix** in Step 0. Skip
otherwise.

```bash
python3 - <<'PY'
import json, os, re, shutil

home = os.path.expanduser("~/.slacklens")
cfg_path = os.path.join(home, "config.json")

fixed = []

# 1. Allowlist re-injection (same logic as setup Step 0.5, idempotent)
NEEDED = [
    "Bash(mkdir:*)", "Bash(python3:*)", "Bash(open:*)", "Bash(xdg-open:*)",
    "Bash(wslview:*)", "Bash(command:*)", "Bash(sleep:*)", "Bash(echo:*)",
    "Bash(test:*)", "Bash([:*)",
    "mcp__claude_ai_Slack__slack_search_users",
    "mcp__claude_ai_Slack__slack_read_user_profile",
    "mcp__claude_ai_Slack__slack_search_public_and_private",
    "mcp__claude_ai_Slack__slack_read_thread",
    "mcp__scheduled-tasks__create_scheduled_task",
    "mcp__scheduled-tasks__delete_scheduled_task",
    "Write(/tmp/slacklens-refresh.json)",
    "mcp__cowork__present_files",
]
settings_path = os.path.expanduser("~/.claude/settings.json")
os.makedirs(os.path.dirname(settings_path), exist_ok=True)
if os.path.isfile(settings_path):
    with open(settings_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
else:
    cfg = {}
perms = cfg.setdefault("permissions", {})
allow = perms.setdefault("allow", [])
before = set(allow)
for n in NEEDED:
    if n not in allow:
        allow.append(n)
added = [n for n in allow if n not in before]
if added:
    with open(settings_path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    fixed.append(f"allowlist: added {len(added)} missing entries")
else:
    fixed.append("allowlist: already complete")

# 2. Re-copy dashboard template + re-inject identity + VIPs
plugin_root = os.environ.get("CLAUDE_PLUGIN_ROOT", "").strip()
if not plugin_root:
    fixed.append("template: skipped — $CLAUDE_PLUGIN_ROOT not set")
elif not os.path.isfile(cfg_path):
    fixed.append("template: skipped — no config.json, run `set up slacklens` first")
else:
    tmpl = os.path.join(plugin_root, "skills", "slacklens-refresh",
                        "references", "dashboard.template.html")
    dst = os.path.join(home, "dashboard.html")
    if not os.path.isfile(tmpl):
        fixed.append(f"template: skipped — not found at {tmpl}")
    else:
        shutil.copy(tmpl, dst)
        cfg_data = json.load(open(cfg_path))
        user = cfg_data["user"]
        priority = cfg_data.get("priority_people", [])
        vip_ids   = [p["id"]   for p in priority]
        vip_names = [p["name"] for p in priority]
        h = open(dst, "r", encoding="utf-8").read()
        def sub(pattern, repl, text, label):
            new_text, count = re.subn(pattern, repl, text, count=1)
            if count == 0:
                raise SystemExit("ERROR: identity substitution failed for " + label)
            return new_text
        h = sub(r"const ME_ID\s*=\s*'[^']*'",
                lambda _m: "const ME_ID = "   + json.dumps(user["slack_id"]), h, "ME_ID")
        h = sub(r"const ME_NAME\s*=\s*'[^']*'",
                lambda _m: "const ME_NAME = " + json.dumps(user["name"]),     h, "ME_NAME")
        h = sub(r"const VIP_IDS\s*=\s*\[[^\]]*\]",
                lambda _m: "const VIP_IDS = "   + json.dumps(vip_ids),   h, "VIP_IDS")
        h = sub(r"const VIP_NAMES\s*=\s*\[[^\]]*\]",
                lambda _m: "const VIP_NAMES = " + json.dumps(vip_names), h, "VIP_NAMES")
        open(dst, "w", encoding="utf-8").write(h)
        fixed.append(f"template: re-copied + re-injected identity + {len(vip_ids)} VIP(s)")

# The next `refresh slacklens` will re-inject the cache blob, so we
# don't need to touch cache.json here. Fix mode is intentionally
# additive-only — never deletes user data.

print("FIX RESULT:")
for f in fixed:
    print(f"  - {f}")
print()
print("Running the normal report now — watch for any ✗ that remain.")
PY
```

## Step 7 — Output

### Report mode (default)

Print all the ✓/⚠/✗ lines gathered above, grouped under headings:

```
Runtime
  ✓ ...
Plugin state
  ✓ ...
Dashboard cache
  ✓ ...
Recent refreshes
  ✓ ...
Scheduled refresh
  ✓ ...
```

End with ONE summary line:

> Doctor report: `<N>` ✓, `<M>` ⚠, `<K>` ✗. <one-sentence next step>.

If there were any ✗ entries, the next step should name the specific
skill to run (`set up slacklens`, `refresh slacklens`, `fix slacklens`)
rather than a vague "fix it". If everything is ✓, next step is
"nothing to do — SlackLens is healthy."

### JSON mode

Suppress all prose and ✓/⚠/✗ lines. Emit one JSON object on stdout:

```json
{
  "ok":        true,
  "counts":    {"ok": 12, "warn": 1, "fail": 0},
  "runtime":   {"slack_mcp": "ok", "scheduled_tasks": "ok", "cowork": "missing"},
  "plugin":    {"config": "ok", "dashboard": "ok", "allowlist_missing": 0},
  "cache":     {"version": 1, "age_hours": 2.3, "mentions": 4, "dms": 1, "channels": 0, "threads": 3},
  "refresh_log": {"entries": 12, "failures": 0, "last_outcome": "ok"},
  "scheduled": {"registered": false, "cron": null},
  "next_step": "nothing to do — SlackLens is healthy."
}
```

Field semantics: each string value is `"ok"`, `"warn"`, `"fail"`, or
`"missing"` (for optional runtime probes). Counts reflect the report
totals. `ok` at the top is `true` iff `counts.fail == 0`.

### Fix mode

Already ran Step 6. Now fall through and print the normal report so
the user can see which ⚠/✗ entries were cleared and which persist.
