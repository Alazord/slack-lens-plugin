---
name: slacklens-help
description: Show the list of every SlackLens command with a one-line description of what it does. Use when the user says "slacklens help", "help slacklens", "slacklens commands", "what can slacklens do", "list slacklens", "slacklens --help", "how do I use slacklens", or asks for a command reference. Cheap — no Slack calls, no filesystem writes, just prints a reference block.
---

You are printing SlackLens's command reference. No data fetching, no
state changes. Just output the block below exactly as shown, wrapped
in a fenced code block so it renders as a clean reference card in
chat.

After the block, add ONE closing sentence pointing the user at the
next most-useful command for their situation:

- If `~/.slacklens/config.json` is absent, suggest: "Start with
  `set up slacklens`."
- If it exists and the user's request sounded like a help request
  (not a setup request), suggest: "For what's under the hood, open
  `docs/PRIORITY.md` in the plugin repo."

## Output — print exactly this

````
SlackLens — commands you can type in chat

  set up slacklens         First-time setup — identity, priority
                           contacts, and opt-in auto-refresh.
  refresh slacklens        Pull fresh data from Slack (incremental,
                           cheap to run often).
  deep refresh slacklens   Full 48-hour re-fetch from scratch — use
                           if data looks drifted or stale.
  open slacklens           Open the dashboard in your browser.

  check slacklens          Health report — ✓/⚠/✗ for every dependency
                           plus a one-line fix per failure.
  check slacklens --json   Same health report, machine-readable.
  fix slacklens            Non-destructive repair — re-injects the
                           allowlist and re-copies the dashboard
                           template. Use after a plugin upgrade.

  change slacklens vips    Add, remove, or replace your priority
                           contacts (no re-setup needed).
  unschedule slacklens     Turn off the auto-refresh background job.
                           Manual `refresh slacklens` still works.

  uninstall slacklens      Remove SlackLens completely — unschedules,
                           strips allowlist entries, wipes ~/.slacklens.
                           Asks for `yes` before proceeding.

  slacklens help           You're looking at it.

Both "slacklens" and "slack lens" (with a space) work as triggers.
State lives under ~/.slacklens/. Full permission inventory:
docs/PERMISSIONS.md. How priority scoring works: docs/PRIORITY.md.
````

## Step — decide the closing line

```bash
python3 - <<'PY'
import os
if os.path.isfile(os.path.expanduser("~/.slacklens/config.json")):
    print("SETUP=done")
else:
    print("SETUP=missing")
PY
```

If `SETUP=missing`: end your response with exactly one line:

> New here? Start with `set up slacklens` — takes about 90 seconds.

If `SETUP=done`: end your response with exactly one line:

> How ranking works: `docs/PRIORITY.md` in the plugin repo.

Do not add any other prose after the reference block.
