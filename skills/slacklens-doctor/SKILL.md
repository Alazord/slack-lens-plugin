---
name: slacklens-doctor
description: Health-check SlackLens end-to-end. Probes every runtime dependency (Slack MCP, scheduled-tasks MCP, Cowork MCP), checks that the plugin's own files are present and the cache is fresh, and prints a check/cross report with a one-line fix for each failure. Use when the user says "check slacklens", "slacklens doctor", "slacklens health", "is slacklens working", "slacklens status", "debug slacklens", "slacklens troubleshoot".
---

You are running SlackLens's health check. Produce a concise report —
no prose, just a checklist — so the user can see what is working and
what is not without having to read the raw commands.

The report has four sections: **Runtime**, **Plugin state**,
**Dashboard cache**, **Scheduled refresh**. For each entry, print one
line in the form:

```
✓ <thing>
✗ <thing> — <one-line fix>
⚠ <thing> — <one-line note>
```

Do not skip entries; if a check cannot be run at all, mark it `⚠`.

## Step 0 — Runtime probes

Run these MCP probes and capture pass/fail. Do NOT stop the skill if
one fails — keep going so the user gets the whole picture.

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

## Step 1 — Plugin state

```bash
python3 - <<'PY'
import json, os, sys
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

# Settings allowlist
settings_path = os.path.expanduser("~/.claude/settings.json")
if os.path.isfile(settings_path):
    try:
        s = json.load(open(settings_path))
        allow = (s.get("permissions") or {}).get("allow") or []
        needed = [
            "mcp__claude_ai_Slack__slack_search_users",
            "mcp__claude_ai_Slack__slack_read_user_profile",
            "mcp__claude_ai_Slack__slack_search_public_and_private",
            "mcp__claude_ai_Slack__slack_read_thread",
        ]
        have = sum(1 for n in needed if n in allow)
        if have == len(needed):
            checks.append(("OK", f"~/.claude/settings.json — allowlist has all {have}/{len(needed)} required Slack tool entries"))
        else:
            checks.append(("WARN", f"~/.claude/settings.json — only {have}/{len(needed)} Slack tool entries; you may see a permission prompt per refresh. Re-run `set up slacklens` to repair."))
    except Exception as e:
        checks.append(("WARN", f"~/.claude/settings.json unreadable ({e})"))
else:
    checks.append(("WARN", "~/.claude/settings.json missing — each refresh will re-prompt for permissions"))

for status, msg in checks:
    glyph = {"OK":"✓", "FAIL":"✗", "WARN":"⚠"}[status]
    print(f"{glyph} {msg}")
PY
```

## Step 2 — Dashboard cache

```bash
python3 - <<'PY'
import json, os
from datetime import datetime, timezone

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

## Step 3 — Scheduled refresh

If the `mcp__scheduled-tasks__*` MCP is available in this session,
list the registered tasks and check whether `slacklens-refresh`
appears. If it does, mark ✓ with its cron expression. If it does not,
mark ⚠ with the note: "Auto-refresh not registered — you are on
manual-only. Say `set up slacklens` and answer 'yes' to scheduling,
or say `refresh slacklens` whenever you need fresh data."

If the MCP is not available, mark ⚠ with: "Scheduled-tasks MCP not
exposed by this runtime — auto-refresh is unavailable here, use
`refresh slacklens` on demand."

## Step 4 — Summary line

End with ONE line:

> Doctor report: `<N>` ✓, `<M>` ⚠, `<K>` ✗. <one-sentence next step>.

If there were any ✗ entries, the next step should name the specific
skill to run (`set up slacklens`, `refresh slacklens`) rather than a
vague "fix it". If everything is ✓, next step is "nothing to do —
SlackLens is healthy."
