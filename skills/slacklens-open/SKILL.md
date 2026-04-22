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

Pick the right opener for the user's OS. Try them in order and stop
on first success:

```bash
DASH="$HOME/.slacklens/dashboard.html"
if command -v open >/dev/null 2>&1; then
  # macOS
  open "$DASH"
elif command -v xdg-open >/dev/null 2>&1; then
  # Linux (requires xdg-utils)
  xdg-open "$DASH"
elif command -v wslview >/dev/null 2>&1; then
  # WSL
  wslview "$DASH"
elif [ -n "$BROWSER" ]; then
  "$BROWSER" "$DASH"
else
  echo "NO_OPENER"
fi
```

If the script prints `NO_OPENER`, tell the user the tool did its
job but their shell has no registered browser launcher — and
print the file path so they can open it manually:

> No browser opener found on this system (`open` /  `xdg-open` /
> `wslview` / `$BROWSER`). Open this file manually:
> `~/.slacklens/dashboard.html`

On Linux, installing `xdg-utils` usually fixes it. On WSL,
`sudo apt install wslu` ships `wslview`.

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
