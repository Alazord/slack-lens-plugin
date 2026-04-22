---
name: slacklens-open
description: Opens the SlackLens dashboard in the user's default browser. If the Claude Code runtime exposes a side panel (e.g. Cowork, via the cowork MCP's present_files tool), also presents it there. Use when the user says "open slacklens", "open slack lens", "show slacklens", "open my slack triage", or "show my slack dashboard".
---

You are opening the SlackLens dashboard.

## Step 1 — Verify the dashboard exists

```bash
DASH="$HOME/.slacklens/dashboard.html"
if [ ! -f "$DASH" ]; then
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

## Step 3 — Also present in a side panel (optional)

If the Cowork MCP is connected, call the `present_files` tool with the
path `~/.slacklens/dashboard.html` so the dashboard also shows up in
the side panel. This is purely a UX polish — the browser open in
Step 2 is the primary surface.

If `present_files` is unavailable (most Claude Code runtimes — CLI,
IDE extensions, etc.), emit this one-line note and continue — do NOT
treat it as an error:

> Side-panel present_files not available in this runtime — dashboard
> opened in your browser only.

Then continue to Step 4.

## Step 4 — Confirm

One sentence:

> Opened SlackLens. Last refresh: <time from the cache's `refreshed_at` field>.
