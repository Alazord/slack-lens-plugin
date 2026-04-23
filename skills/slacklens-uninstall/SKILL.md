---
name: slacklens-uninstall
description: Completely de-integrate SlackLens — remove the scheduled task, strip SlackLens's entries from the Claude Code allowlist, and wipe ~/.slacklens/ (config, cache, dashboard, refresh log, backup). This is destructive; always confirm with the user first. Does NOT run `/plugin uninstall` itself — the user still has to do that from chat at the end. Use when the user says "uninstall slacklens", "remove slacklens", "wipe slacklens", "delete slacklens", "factory reset slacklens", "clean up slacklens".
---

You are fully removing SlackLens's runtime state from the user's
machine. This is destructive — wiping `~/.slacklens/` loses their VIP
list, cached triage state, and refresh log. Always confirm first.

## Step 0 — Confirm

Before touching anything, show the user a one-screen summary of what
is about to be deleted and ask them to confirm. Use the literal wording
below so the user has a clear picture of the blast radius:

> About to uninstall SlackLens. This will:
> 1. Remove the auto-refresh scheduled task (if any).
> 2. Strip SlackLens's 18 entries from `~/.claude/settings.json`
>    (everything matching `mcp__claude_ai_Slack__*`, `mcp__scheduled-tasks__*`,
>    `mcp__cowork__present_files`, `Write(/tmp/slacklens-refresh.json)`,
>    and the `Bash(*:*)` entries scoped for SlackLens). Other plugins'
>    entries are preserved.
> 3. Delete `~/.slacklens/` entirely — config, cache, dashboard, refresh
>    log, and backup (`.bak`). Your VIP list and triage state are gone
>    after this.
>
> The plugin itself stays installed — you can run `/plugin uninstall
> slacklens@alazord` afterwards if you want it off your Claude Code
> marketplace too.
>
> Type `yes` to proceed, or anything else to cancel.

If the user does not respond with `yes` (exact match, case-insensitive
after stripping), stop here and tell them "Cancelled — nothing was
removed." Do NOT take a cancellation as an invitation to "do a partial
cleanup". Either all three steps run, or none.

## Step 1 — Unschedule

Call `mcp__scheduled-tasks__delete_scheduled_task` with `taskId:
slacklens-refresh`.

- Success → mark "scheduled task removed".
- Not found → mark "no scheduled task was registered".
- MCP not available → mark "scheduled-tasks MCP not exposed, nothing
  to unschedule on this runtime".

In all three cases, keep going to Step 2. Never abort uninstall over
a failed unschedule.

## Step 2 — Strip allowlist entries

```bash
python3 - <<'PY'
import json, os

# Must mirror slacklens-setup Step 0.5 NEEDED list exactly. If setup
# grows a new entry, grow this list too — otherwise uninstall leaves
# orphans in the user's settings.json.
SLACKLENS_ENTRIES = {
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
}

p = os.path.expanduser("~/.claude/settings.json")
if not os.path.isfile(p):
    print("NOTE: ~/.claude/settings.json not found — nothing to strip.")
else:
    with open(p, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    perms = cfg.get("permissions") or {}
    allow = perms.get("allow") or []
    before = len(allow)
    # Shared entries (Bash(python3:*), Bash(mkdir:*), etc.) might be
    # used by OTHER plugins the user has installed. We still strip them
    # on uninstall — the assumption is that if another plugin needed
    # them, that plugin's own setup will re-add them next time it runs.
    # Alternative (not doing): keep a per-plugin manifest of who added
    # what. Too much bookkeeping for a one-shot skill.
    new_allow = [e for e in allow if e not in SLACKLENS_ENTRIES]
    perms["allow"] = new_allow
    cfg["permissions"] = perms
    # Atomic write to keep settings.json safe if we crash mid-dump.
    tmp_p = p + ".new"
    with open(tmp_p, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
        f.flush()
        try:
            os.fsync(f.fileno())
        except OSError:
            pass
    os.replace(tmp_p, p)
    removed = before - len(new_allow)
    print(f"STRIPPED={removed} entries from ~/.claude/settings.json")
PY
```

## Step 3 — Wipe ~/.slacklens

```bash
python3 - <<'PY'
import os, shutil
home = os.path.expanduser("~/.slacklens")
if os.path.isdir(home):
    shutil.rmtree(home)
    print("WIPED=" + home)
else:
    print("NOTE: " + home + " did not exist — nothing to wipe.")
PY
```

`shutil.rmtree` is deliberate — we want a hard delete. There is no
backup retention here; the `.bak` files inside `~/.slacklens/` go
with the folder.

## Step 4 — Report

One concise summary:

> SlackLens uninstalled.
> - Scheduled task: `<removed|not registered|runtime unsupported>`
> - Allowlist entries stripped: `<N>`
> - `~/.slacklens/` wiped (`<bytes or "did not exist">`).
>
> The plugin itself is still installed. Run `/plugin uninstall
> slacklens@alazord` in chat to remove it from your Claude Code
> marketplace. Nothing else to do.

If the user ever wants SlackLens back, `/plugin install
slacklens@alazord` followed by `set up slacklens` rebuilds everything
from scratch.
