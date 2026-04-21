---
name: slack-lens-open
description: Opens the SlackLens dashboard in the user's default browser and presents it in the Cowork panel. Use when the user says "open slack lens", "show slacklens", "open my slack triage", or "show my slack dashboard".
---

You are opening the SlackLens dashboard.

## Step 1 — Verify the dashboard exists

```bash
DASH="$HOME/.slacklens/dashboard.html"
if [ \! -f "$DASH" ]; then
  echo "MISSING"
fi
```

If the file is missing, tell the user:

> SlackLens isn't set up yet. Say "set up slack lens" first.

…and stop.

## Step 2 — Open in browser

```bash
open "$HOME/.slacklens/dashboard.html"
```

## Step 3 — Present in Cowork

Call the `present_files` tool from the cowork MCP with the path
`~/.slacklens/dashboard.html` so the dashboard is also available in
the Cowork side panel.

If `present_files` is unavailable, skip — the browser tab is enough.

## Step 4 — Confirm

One sentence:

> Opened SlackLens. Last refresh: <time from the cache's `refreshed_at` field>.
