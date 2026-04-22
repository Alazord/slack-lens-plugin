---
name: slacklens-refresh
description: Refreshes the SlackLens dashboard with the latest mentions, DMs, and active threads from Slack. Use when the user says "refresh slacklens", "refresh slack lens", "reload slacklens", "update my slack triage", or when triggered automatically by the scheduled task.
---

You are refreshing SlackLens for the connected Slack user.

The dashboard reads a cache JSON in a **very specific shape**. Producing the
wrong shape silently empties the dashboard. Follow the schema in Step 1
**exactly** — keys, nesting, and per-result fields.

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

Compute `AFTER` as YYYY-MM-DD for two days ago. Then run **three** Slack
searches via `slack_search_public_and_private`:

| Bucket     | Query                                                                            | What it captures |
|------------|----------------------------------------------------------------------------------|------------------|
| `mentions` | `to:<@USER_ID> after:AFTER`                                                      | Messages addressed directly to the user (DMs received + @-mentions in DMs) |
| `dms`      | `from:<@USER_ID> after:AFTER channel_types:im,mpim`                              | The user's outgoing DMs (so the dashboard can see what they last said) |
| `channels` | `<@USER_ID> after:AFTER channel_types:public_channel,private_channel`            | @-mentions of the user in public/private channels |

For every distinct `(channel_id, thread_ts)` pair across all three bucket
results, call `slack_read_thread` to fetch the full thread. **Cap thread
fetches at 50 in code** (Step 2 enforces this defensively).

### Required cache shape (the dashboard reads this exactly)

```json
{
  "refreshed_at": "<ISO timestamp>",
  "search_results": {
    "mentions": [
      {
        "query":   "to:<@U01EXAMPLE99> after:2026-04-19",
        "results": [
          {
            "channel_id":   "C01EXAMPLE00",
            "channel_name": "Group DM (Alice Example, Jane Doe, Bob Example)",
            "from_user":    "Alice Example (U01ALICE000)",
            "message_ts":   "1776757696.480349",
            "time":         "2026-04-21 13:18:16 IST",
            "permalink":    "https://example.slack.com/archives/C.../p...",
            "text":         "Hey, can you review this?"
          }
        ]
      }
    ],
    "dms": [
      {
        "query":   "from:<@U01EXAMPLE99> after:2026-04-19 channel_types:im,mpim",
        "note":    "User's outgoing DM messages from last 48h",
        "results": [
          {
            "channel_id": "C01EXAMPLE00",
            "from_user":  "Jane Doe (U01EXAMPLE99)",
            "message_ts": "1776757683.434379",
            "time":       "2026-04-21 13:18:03 IST",
            "text":       "Yep, taking a look now."
          }
        ]
      }
    ],
    "channels": [
      {
        "query":   "<@U01EXAMPLE99> after:2026-04-19 channel_types:public_channel,private_channel",
        "results": [
          {
            "channel_id":   "C02EXAMPLE11",
            "channel_name": "#project-example",
            "from_user":    "Bob Example (U01BOB00000)",
            "message_ts":   "1776755048.906429",
            "text":         "add Jane Doe (to huddle)"
          }
        ]
      }
    ]
  },
  "threads": {
    "<channel_id>:<thread_ts>": {
      "channel_id":   "C01EXAMPLE00",
      "channel_name": "Group DM (...)",
      "thread_ts":    "1776757696.480349",
      "messages": [
        {
          "from":      "Alice Example (U01ALICE000)",
          "ts":        "1776757696.480349",
          "time":      "2026-04-21 13:18:16 IST",
          "text":      "Hey, can you review this?",
          "permalink": "https://example.slack.com/archives/C.../p..."
        }
      ]
    }
  }
}
```

**Hard rules:**

- The three bucket keys are **`mentions`, `dms`, `channels`**. Not `dms_received`,
  not `outgoing_dms`. Wrong keys = empty dashboard.
- Each bucket value is an **array** of `{query, results, [note]}` objects, even
  if you only ran one query. The dashboard sums `results.length` across the array.
- Per-result field names are **lowercase snake_case** as shown.
- Top-level keys are exactly `refreshed_at`, `search_results`, `threads`.

## Step 2 — Write the cache and rebuild the dashboard

Write the in-memory dict to `/tmp/slacklens-refresh.json` using the
**Write tool** (not a bash heredoc — heredocs corrupt backslashes and can
hit `ARG_MAX` on busy workspaces). Then run the Python block below to
validate the shape, write `~/.slacklens/cache.json`, and re-inject the
cache into `~/.slacklens/dashboard.html`.

```bash
python3 - <<'PY'
import json, os, re
from datetime import datetime

home = os.path.expanduser("~/.slacklens")
tmp  = "/tmp/slacklens-refresh.json"

with open(tmp, "r", encoding="utf-8") as f:
    data = json.load(f)

# --- Validation: bail loudly if shape is wrong ---
if not isinstance(data, dict):
    raise SystemExit("ERROR: data is not a dict")
sr = data.get("search_results")
if not isinstance(sr, dict):
    raise SystemExit("ERROR: data['search_results'] missing or not a dict")
for key in ("mentions", "dms", "channels"):
    if key not in sr:
        raise SystemExit("ERROR: search_results['" + key + "'] missing — "
                         "dashboard will render empty for this bucket")
    if not isinstance(sr[key], list):
        raise SystemExit("ERROR: search_results['" + key + "'] must be an "
                         "array of {query, results} objects")
threads = data.get("threads", {})
if not isinstance(threads, dict):
    raise SystemExit("ERROR: data['threads'] must be an object keyed by "
                     "'<channel_id>:<thread_ts>'")

# --- Hard cap on threads: defensive, not just prose ---
if len(threads) > 50:
    keys_sorted = sorted(threads, key=lambda k: max(
        (m.get("ts", "0") for m in threads[k].get("messages", [])),
        default="0"
    ), reverse=True)
    threads = {k: threads[k] for k in keys_sorted[:50]}
    data["threads"] = threads
    print("NOTE: capped threads at 50")

data["refreshed_at"] = datetime.now().isoformat()

# 1. Write cache.json
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

# Use a lambda replacement — passing new_assignment directly as a string
# makes re.sub reinterpret escape sequences like '\n' in the JSON payload
# as actual newlines, which corrupts the blob and breaks JS parsing.
updated = re.sub(
    r"window\.__SLACK_CACHE__\s*=\s*\{.*?\};",
    lambda _m: new_assignment,
    html,
    count=1,
    flags=re.DOTALL,
)

if updated == html:
    raise SystemExit("ERROR: dashboard cache marker not found in dashboard.html")

with open(dash_path, "w", encoding="utf-8") as f:
    f.write(updated)

m = sum(len(q.get("results", [])) for q in sr["mentions"])
d = sum(len(q.get("results", [])) for q in sr["dms"])
c = sum(len(q.get("results", [])) for q in sr["channels"])
print("refreshed_at=" + data["refreshed_at"]
      + ", threads=" + str(len(threads))
      + ", mentions=" + str(m)
      + ", dms=" + str(d)
      + ", channels=" + str(c))

# 3. Clean up tmp
try:
    os.remove(tmp)
except OSError:
    pass
PY
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

## Step 4 — Report

Tell the user (one sentence):

> SlackLens refreshed — `<N>` threads, `<M>` mentions, `<D>` DMs, `<C>` channel mentions. Last update `<HH:MM>`.
