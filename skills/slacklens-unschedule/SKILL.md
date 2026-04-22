---
name: slacklens-unschedule
description: Removes the auto-refresh scheduled task so SlackLens only refreshes when you say `refresh slacklens`. Use when the user says "unschedule slacklens", "stop slacklens auto refresh", "disable slacklens scheduled refresh", "remove slacklens schedule", "stop auto refresh slacklens".
---

You are removing the SlackLens auto-refresh scheduled task.

The `refresh slacklens` command still works on demand after this —
only the every-8-hours background tick is removed. Nothing else about
the plugin changes.

## Step 1 — Delete the scheduled task

Call `mcp__scheduled-tasks__delete_scheduled_task` with `taskId:
slacklens-refresh`.

Three outcomes to handle:

1. Tool returns success → task was registered, now it's gone. Report
   success (Step 3).
2. Tool returns "not found" (or similar) → task was never registered
   in the first place. Still a success from the user's perspective:
   there is no auto-refresh to remove. Report accordingly (Step 3).
3. Tool is not available in this runtime → report that auto-refresh
   was not running on this runtime to begin with, so there is
   nothing to unschedule. Suggest `slacklens-doctor` if the user
   wants confirmation.

## Step 2 — (skipped — no more state to clean)

Config, cache, dashboard, and allowlist entries all stay in place.
The user's identity and VIP list are preserved. If the user wants to
wipe everything, point them at the Uninstall section of the README.

## Step 3 — Confirm

One sentence, picking the right form:

**If task was deleted:**

> Auto-refresh off. SlackLens will only refresh when you say `refresh
> slacklens`. You can re-enable the schedule any time by running
> `set up slacklens` again.

**If task was already absent:**

> No scheduled refresh was registered — you were already on
> manual-only. Say `refresh slacklens` whenever you need fresh data.

**If the scheduled-tasks MCP is not exposed by this runtime:**

> This runtime doesn't ship a scheduled-tasks MCP, so there was no
> auto-refresh to unschedule. Say `refresh slacklens` on demand.
