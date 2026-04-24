---
name: slacklens-setup
description: One-time setup for the SlackLens dashboard. Detects the connected Slack identity, asks who to prioritise, registers the auto-refresh schedule, and triggers the first refresh. Use when the user says "set up slacklens", "set up slack lens", "configure slacklens", "initialize slacklens", or it is the first time they have used the plugin.
---

You are running the one-time setup for SlackLens for this user.

## Step 0 — Verify Slack MCP is connected and has the tools we need

SlackLens uses four read-only Slack MCP tools, but we only probe three
of them here — the fourth (`slack_read_thread`) gets exercised during
Step 6's first refresh, and probing it up front with an invalid thread
id counts against the same per-workspace rate limit that Step 6 relies
on. Run these three calls, ignoring their actual return values — we
only care whether each one *exists*:

1. `slack_search_users` with query `"a"`, limit 1.
2. `slack_read_user_profile` with no arguments.
3. `slack_search_public_and_private` with query `"a"`, limit 1.

For each call, if it fails with "MCP not connected", "tool not found",
"unknown tool", or any auth error, STOP and tell the user:

> SlackLens needs the Slack MCP (a recent version) to be connected
> before setup can run. The `<tool name>` tool is missing or the
> connector is not authorised.
>
> Connect Slack to your Claude Code runtime (Cowork: Settings →
> Connectors → Slack → Connect. CLI: `claude mcp add slack ...` per
> the Slack MCP docs). Make sure it's up to date, then send "set up
> slack lens" again.

Do not try to continue if any of the four probes fails this way.

## Step 0.5 — Pre-approve SlackLens's permissions

SlackLens needs a small, fixed set of tool permissions to run without
interrupting you on every refresh. This step appends them to your
`~/.claude/settings.json` once, idempotently. You will see **one**
permission prompt for the write below — approve "always allow" and
every subsequent SlackLens action will be silent.

```bash
python3 - <<'PY'
import json, os

p = os.path.expanduser("~/.claude/settings.json")
os.makedirs(os.path.dirname(p), exist_ok=True)

if os.path.isfile(p):
    with open(p, "r", encoding="utf-8") as f:
        cfg = json.load(f)
else:
    cfg = {}

perms = cfg.setdefault("permissions", {})
allow = perms.setdefault("allow", [])

needed = [
    # Shell commands the skills invoke directly. Every one of these has
    # to be here, otherwise the user sees a permission prompt on first
    # use of the calling skill. The goal is: one prompt at install, then
    # zero prompts across setup/refresh/open/doctor/vips/unschedule.
    "Bash(mkdir:*)",        # setup Step 1
    "Bash(python3:*)",      # every skill's inline python blocks
    "Bash(open:*)",         # macOS browser launcher (slacklens-open)
    "Bash(xdg-open:*)",     # Linux browser launcher (slacklens-open)
    "Bash(wslview:*)",      # WSL browser launcher (slacklens-open)
    "Bash(command:*)",      # `command -v` probe in slacklens-open
    "Bash(sleep:*)",        # setup Step 6 retry backoff
    "Bash(echo:*)",         # diagnostic prints in slacklens-open / setup
    "Bash(test:*)",         # `test -f` in slacklens-open
    "Bash([:*)",            # `[ -f ... ]` in slacklens-open
    # Slack MCP — four read-only tools, no write, no send.
    "mcp__claude_ai_Slack__slack_search_users",
    "mcp__claude_ai_Slack__slack_read_user_profile",
    "mcp__claude_ai_Slack__slack_search_public_and_private",
    "mcp__claude_ai_Slack__slack_read_thread",
    # Optional auto-refresh. The user is asked in Step 5 whether to
    # actually register it; these entries are here so that IF they opt
    # in later (or re-run setup), there's no second permission prompt.
    "mcp__scheduled-tasks__create_scheduled_task",
    "mcp__scheduled-tasks__delete_scheduled_task",
    # Refresh writes this intermediate file; tight path, not a wildcard.
    "Write(/tmp/slacklens-refresh.json)",
    # Optional Cowork side-panel mirror. Absent on most runtimes; no-op
    # if missing.
    "mcp__cowork__present_files",
]
added = [rule for rule in needed if rule not in allow]
allow.extend(added)

with open(p, "w", encoding="utf-8") as f:
    json.dump(cfg, f, indent=2)

print("added_permissions=" + str(len(added)))
PY
```

If `added_permissions=0`, the allowlist was already in place — nothing
to do. Otherwise tell the user once: "Granted SlackLens `N` permissions
in `~/.claude/settings.json`. Refreshes will run silently from here."

## Step 1 — Create the SlackLens data directory

Use the Bash tool:

```bash
mkdir -p "$HOME/.slacklens"
```

All plugin state (config, cache, dashboard) lives in `~/.slacklens/`.

## Step 2 — Detect user identity

Call `slack_read_user_profile` with no user ID (the Slack MCP returns the
connected user's profile). You need three values:

- `USER_NAME`  — display_name or real_name
- `USER_ID`    — Slack user ID (looks like `U01EXAMPLE99`)
- `USER_EMAIL` — email

If the connected-user lookup returns nothing, ask: "What's your Slack
display name?" then call `slack_search_users` to find the matching ID.

Confirm once: "I detected you as <USER_NAME> (<USER_ID>) — is this right?"

## Step 3 — Ask who to prioritise

Ask, verbatim:

> Who should float to the top of your dashboard as "high priority"?
> Typically your manager, CEO, or a couple of key stakeholders — DMs
> and mentions from them will sit in a band above everything else.
> Mention them by name (e.g. "Jane Doe, Alex Kim"), or type
> **skip** to set this up later.

For each name the user gives, call `slack_search_users` and collect
the user IDs. Read the matches back briefly:

> Found Example Manager, Example CEO — using these.

If the user says "skip", "none", or "later", use an empty list and
move on. They can re-run `set up slacklens` any time to add or change
priority contacts — all other state is preserved.

## Step 3.5 — Ask role

Ask, verbatim:

> What's your engineering role? (e.g. Frontend Engineer, Backend
> Engineer, Full-stack, DevOps, QA, EM, PM). This helps SlackLens
> filter out tasks that aren't yours — for example, a Frontend
> Engineer shouldn't see "deployment pending" as an actionable item,
> but "cherry-pick pending" or "build pending" still count. Type
> **skip** to leave it generic.

Capture the answer as `USER_ROLE`. If the user types "skip"/"none",
use the string `"Software Engineer"` — the inference prompt falls
back to generic scoping in that case.

## Step 4 — Write config and dashboard

Use the Bash tool with python3 (NOT a shell heredoc — heredocs escape `\!`
to `\\!` and corrupt files):

```bash
USER_ID='U01EXAMPLE99' \
USER_NAME='Jane Doe' \
USER_EMAIL='jane@example.com' \
USER_ROLE='Frontend Engineer' \
PRIORITY_JSON='[{"id":"U02EXAMPLE11","name":"Example Manager"}]' \
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT}" \
python3 - <<'PY'
import json, os, shutil, re

home_dir = os.path.expanduser("~/.slacklens")
os.makedirs(home_dir, exist_ok=True)

priority = json.loads(os.environ["PRIORITY_JSON"])
config = {
    "_readme": "Personal SlackLens config. Re-run 'set up slack lens' to regenerate.",
    "user": {
        "name": os.environ["USER_NAME"],
        "email": os.environ["USER_EMAIL"],
        "slack_id": os.environ["USER_ID"],
        "role": os.environ.get("USER_ROLE", "Software Engineer"),
    },
    "priority_people": priority,
    "auto_refresh_hours": 8,
}
with open(os.path.join(home_dir, "config.json"), "w") as f:
    json.dump(config, f, indent=2)

# Copy the bundled dashboard template into the user's data dir.
# Sanity-check that CLAUDE_PLUGIN_ROOT is populated and the template exists
# before we copy — if the runtime didn't set the env var, shutil.copy would
# fail with a confusing error that hides the real cause.
plugin_root = os.environ.get("PLUGIN_ROOT", "").strip()
if not plugin_root:
    raise SystemExit(
        "ERROR: $CLAUDE_PLUGIN_ROOT is not set. "
        "The plugin runtime should populate this — make sure slacklens is "
        "installed via `/plugin install`, not cloned and run manually."
    )
src = os.path.join(plugin_root, "skills", "slacklens-refresh",
                   "references", "dashboard.template.html")
if not os.path.isfile(src):
    raise SystemExit(
        f"ERROR: dashboard template not found at {src}. "
        "The plugin install may be incomplete — try reinstalling slacklens."
    )
dst = os.path.join(home_dir, "dashboard.html")
shutil.copy(src, dst)

# Inject identity constants into the dashboard.
#
# Two footguns to avoid when substituting user-provided strings into JS:
# 1. Raw interpolation into single-quoted JS strings breaks on apostrophes
#    (e.g. a display name like "O'Malley" yields `const ME_NAME = 'O'Malley'`).
# 2. re.sub with a plain string replacement reinterprets backslash escapes —
#    a name containing '\1' raises re.error: invalid group reference.
# json.dumps produces a properly-quoted-and-escaped JSON string literal, which
# is also valid JS. The lambda form bypasses re.sub's replacement-string escape
# processing.
with open(dst, "r", encoding="utf-8") as f:
    html = f.read()
user_id   = os.environ["USER_ID"]
user_name = os.environ["USER_NAME"]
vip_ids   = [p["id"]   for p in priority]
vip_names = [p["name"] for p in priority]

# Substitute + verify each marker actually matched. A one-character
# template change (e.g. switching the placeholder quote style) would
# otherwise make re.sub silently no-op and ship a dashboard with empty
# identity constants — the UI would render but VIP/me detection would
# be broken with no obvious symptom.
def sub_checked(pattern, replacement, text, label):
    new_text, count = re.subn(pattern, replacement, text, count=1)
    if count == 0:
        raise SystemExit(
            "ERROR: identity substitution failed for " + label + ". "
            "The dashboard template probably changed its placeholder "
            "shape — update this skill's regex."
        )
    return new_text

html = sub_checked(r"const ME_ID\s*=\s*'[^']*'",
                   lambda _m: "const ME_ID = "   + json.dumps(user_id),   html, "ME_ID")
html = sub_checked(r"const ME_NAME\s*=\s*'[^']*'",
                   lambda _m: "const ME_NAME = " + json.dumps(user_name), html, "ME_NAME")
html = sub_checked(r"const VIP_IDS\s*=\s*\[[^\]]*\]",
                   lambda _m: "const VIP_IDS = "   + json.dumps(vip_ids),   html, "VIP_IDS")
html = sub_checked(r"const VIP_NAMES\s*=\s*\[[^\]]*\]",
                   lambda _m: "const VIP_NAMES = " + json.dumps(vip_names), html, "VIP_NAMES")
with open(dst, "w", encoding="utf-8") as f:
    f.write(html)

print("config and dashboard ready at:", home_dir)
PY
```

Replace the `USER_ID`, `USER_NAME`, `USER_EMAIL`, and `PRIORITY_JSON`
values with what you collected in Steps 2 and 3.

## Step 5 — Ask about auto-refresh (opt-in, NOT default on)

Auto-refresh is strictly a convenience — `refresh slacklens` works on
demand regardless. Do NOT register a scheduled task without the user's
explicit consent. Some teammates:
  - Prefer manual control over what their Claude runtime does in the
    background,
  - Are on a runtime that doesn't expose a scheduled-tasks MCP at all,
  - Share the machine and don't want unexpected background jobs.

First, **probe availability** — check whether
`mcp__scheduled-tasks__create_scheduled_task` exists in your tool
list. If it doesn't, skip this step entirely and tell the user:

> Your runtime doesn't expose a scheduled-tasks MCP, so there's no
> auto-refresh option. Just say `refresh slacklens` whenever you
> want fresh data — takes ~10 seconds.

If the MCP IS available, ask the user VERBATIM:

> Want me to register an auto-refresh that runs every 8 hours in the
> background? You can always turn it off later with `unschedule
> slacklens`. (yes / no — default **no**; you can always run
> `refresh slacklens` manually whenever you want the latest data.)

If they answer **yes** (or "sure", "ok", "please do"):

1. Call `mcp__scheduled-tasks__delete_scheduled_task` with `taskId:
   slacklens-refresh` to clear any stale registration from a prior
   install. If the delete returns "not found", ignore — expected
   on first install.
2. Call `mcp__scheduled-tasks__create_scheduled_task` with:
   - `taskId`: `slacklens-refresh`
   - `description`: `Refresh the SlackLens dashboard cache every 8 hours.`
   - `cronExpression`: `0 */8 * * *`   (every 8h on the hour, local time)
   - `prompt`: `Run the slacklens-refresh skill from the slacklens plugin and force a full 48h refresh (set $SLACKLENS_FORCE_FULL=1 before invoking) so any edits or deletions in the last 8 hours are picked up and the cache stays drift-free.`

   If this errors with "already exists" (e.g. delete tool was absent),
   catch it and continue.
3. Tell the user: "Scheduled. SlackLens will refresh every 8 hours.
   Say `unschedule slacklens` to turn it off."

If they answer **no** (or "skip", "not now", silence → default no):

Tell the user: "Skipped. Say `refresh slacklens` whenever you want
the latest data. You can enable auto-refresh later by running `set
up slacklens` again."

Either way, proceed to Step 6.

## Step 6 — Trigger the first refresh (with one retry)

Run the `slacklens-refresh` skill now (in this same session) so the
user sees data immediately. Wait for it to finish.

If it fails — typically because the Slack MCP is rate-limited from
the Step 0 probes — **do not abort setup**. Wait ~30 seconds, then
try one more time:

```bash
sleep 30
```

Then re-invoke `slacklens-refresh`. If it still fails, leave the
dashboard empty and tell the user clearly:

> Setup is complete, <USER_NAME>, but the first refresh failed twice:
> `<error message>`. The Slack MCP is probably rate-limiting you
> briefly. Say `refresh slacklens` in a minute or two — it almost
> always works on the next try.

Either way, proceed to Step 7 (open the dashboard) — the dashboard
will render from the empty-cache state and show the empty-state
banner if the refresh never succeeded.

## Step 7 — Open the dashboard

Run the `slacklens-open` skill so the dashboard opens in the user's
browser (and in any runtime side panel that supports `present_files`).

## Step 8 — Confirm

Tell the user, in your own words and briefly. Tailor the message to
the two axes that actually vary — whether the first refresh
succeeded, and whether auto-refresh was scheduled.

**Refresh succeeded + auto-refresh scheduled:**

> SlackLens is set up, <USER_NAME>. Dashboard is open and populated.
> It'll refresh every 8 hours — say `unschedule slacklens` to turn
> that off, or `refresh slacklens` to force an update now. Say
> `check slacklens` to verify everything's healthy.

**Refresh succeeded + auto-refresh NOT scheduled:**

> SlackLens is set up, <USER_NAME>. Dashboard is open and populated.
> You're on manual-refresh mode — say `refresh slacklens` whenever
> you want fresh data. Run `set up slacklens` again later if you
> decide you want auto-refresh.

**Refresh failed + auto-refresh scheduled:**

> SlackLens is set up, <USER_NAME>, but the first refresh failed
> (`<error summary>`). Wait ~2 minutes for Slack rate limits to
> clear, then say `refresh slacklens`. The 8-hour auto-refresh is
> registered and will also top it up on its own. Say `check
> slacklens` if things still look off.

**Refresh failed + auto-refresh NOT scheduled:**

> SlackLens is set up, <USER_NAME>, but the first refresh failed
> (`<error summary>`). Wait ~2 minutes for Slack rate limits to
> clear, then say `refresh slacklens`. Say `check slacklens` if
> things still look off.
