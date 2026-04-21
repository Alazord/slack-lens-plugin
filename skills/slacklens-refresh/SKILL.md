---
name: slacklens-refresh
description: Refreshes the SlackLens dashboard with the latest mentions, DMs, and active threads from Slack. Use when the user says "refresh slacklens", "refresh slack lens", "reload slacklens", "update my slack triage", or when triggered automatically by the scheduled task.
---

You are refreshing SlackLens for the connected Slack user.

## Step 0 — Load config

```bash
python3 - <<'PY'
import json, os
home = os.path.expanduser("~/.slacklens")
cfg_path = os.path.join(home, "config.json")
if not os.path.exists(cfg_path):
    raise SystemExit("ERROR: ~/.slacklens/config.json not found. "
                     "Run 'set up slack lens' first.")
cfg = json.load(open(cfg_path))
print("USER_ID=" + cfg["user"]["slack_id"])
print("USER_NAME=" + cfg["user"]["name"])
PY
```

Use the `USER_ID` and `USER_NAME` values for the next steps.

## Step 1 — Fetch Slack data (last 48 hours)

Call the Slack MCP:

- `slack_search_public_and_private` for `to:<@USER_ID>` (DMs received)
- `slack_search_public_and_private` for `<@USER_ID>` (channel mentions)

For each unique result, call `slack_read_thread` to fetch the full thread
context (messages, user IDs, timestamps, channel info).

Build a single dict in memory:

```python
data = {
  "refreshed_at": "<ISO timestamp>",
  "search_results": {
    "mentions": [...],
    "dms_received": [...],
  },
  "threads": {
    "<channel_id>:<thread_ts>": {
      "channel_id": "...",
      "channel_name": "...",
      "messages": [...]
    },
    ...
  }
}
```

Cap thread fetches at ~50 to avoid runaway runtime.

## Step 2 — Write the cache and rebuild the dashboard

Use the Bash tool with python3 (NOT a heredoc — heredocs corrupt `\!`):

```bash
DATA_JSON='<the JSON dict from Step 1>' \
python3 - <<'PY'
import json, os, re
from datetime import datetime

home = os.path.expanduser("~/.slacklens")
data = json.loads(os.environ["DATA_JSON"])
data["refreshed_at"] = datetime.now().isoformat()

# 1. Write the cache to disk
with open(os.path.join(home, "cache.json"), "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# 2. Re-inject the cache blob into dashboard.html
dash_path = os.path.join(home, "dashboard.html")
with open(dash_path, "r", encoding="utf-8") as f:
    html = f.read()

# Escape '</' so closing tags inside the JSON don't terminate the script tag
new_json = json.dumps(data, ensure_ascii=False,
                      separators=(",", ":")).replace("</", "<\\/")
new_assignment = "window.__SLACK_CACHE__ = " + new_json + ";"

updated = re.sub(
    r"window\.__SLACK_CACHE__\s*=\s*\{.*?\};",
    new_assignment,
    html,
    count=1,
    flags=re.DOTALL,
)

if updated == html:
    raise SystemExit("ERROR: dashboard cache marker not found.")

with open(dash_path, "w", encoding="utf-8") as f:
    f.write(updated)

print(f"refreshed_at={data['refreshed_at']}, "
      f"threads={len(data.get('threads', {}))}, "
      f"mentions={len(data.get('search_results', {}).get('mentions', []))}")
PY
```

## Step 3 — Surface the dashboard in Cowork

Call the `present_files` tool from the cowork MCP with the path
`~/.slacklens/dashboard.html` so the dashboard appears in the Cowork
panel.

If `present_files` is unavailable in this session (e.g. when running
from a scheduled task), skip — the cache is still on disk and the
browser tab (if open) will pick it up on next reload.

## Step 4 — Report

Tell the user (one sentence):

> SlackLens refreshed — <N> threads, last update <HH:MM>.
