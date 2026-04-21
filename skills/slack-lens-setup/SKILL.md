---
name: slack-lens-setup
description: One-time setup for the SlackLens dashboard. Detects the connected Slack identity, asks who to prioritise, registers the auto-refresh schedule, and triggers the first refresh. Use when the user says "set up slack lens", "configure slacklens", "initialize slack lens", or it is the first time they have used the plugin.
---

You are running the one-time setup for SlackLens for this user.

## Step 0 — Verify Slack MCP is connected

Make a no-op call such as `slack_search_users` with a single-letter query
("a", limit 1). If the call errors with "MCP not connected", "tool not
found", or any auth error, STOP and tell the user:

> SlackLens needs the Slack MCP to be connected before setup can run.
>
> Open Cowork → Settings → Connectors → Slack → Connect, then send
> "set up slack lens" again.

Do not try to continue if Slack MCP is unreachable.

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

Ask: "Who do you want to prioritise at the top of your dashboard?
Typically your manager, CEO, or key stakeholders. Mention them by name,
or say 'skip'."

For each name, call `slack_search_users` and collect the user IDs. Read
the matches back briefly: "Found Example Manager, Example CEO —
using these."

If they skip, use an empty list.

## Step 4 — Write config and dashboard

Use the Bash tool with python3 (NOT a shell heredoc — heredocs escape `\!`
to `\\!` and corrupt files):

```bash
USER_ID='U01EXAMPLE99' \
USER_NAME='Jane Doe' \
USER_EMAIL='jane@example.com' \
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
    },
    "priority_people": priority,
    "auto_refresh_hours": 2,
}
with open(os.path.join(home_dir, "config.json"), "w") as f:
    json.dump(config, f, indent=2)

# Copy the bundled dashboard template into the user's data dir
plugin_root = os.environ["PLUGIN_ROOT"]
src = os.path.join(plugin_root, "skills", "slack-lens-refresh",
                   "references", "dashboard.template.html")
dst = os.path.join(home_dir, "dashboard.html")
shutil.copy(src, dst)

# Inject identity constants into the dashboard
with open(dst, "r", encoding="utf-8") as f:
    html = f.read()
html = re.sub(r"const ME_ID\s*=\s*'[^']*'",
              f"const ME_ID = '{os.environ['USER_ID']}'", html)
html = re.sub(r"const ME_NAME\s*=\s*'[^']*'",
              f"const ME_NAME = '{os.environ['USER_NAME']}'", html)
html = re.sub(r"const VIP_IDS\s*=\s*\[[^\]]*\]",
              f"const VIP_IDS = {json.dumps([p['id']   for p in priority])}", html)
html = re.sub(r"const VIP_NAMES\s*=\s*\[[^\]]*\]",
              f"const VIP_NAMES = {json.dumps([p['name'] for p in priority])}", html)
with open(dst, "w", encoding="utf-8") as f:
    f.write(html)

print("config and dashboard ready at:", home_dir)
PY
```

Replace the `USER_ID`, `USER_NAME`, `USER_EMAIL`, and `PRIORITY_JSON`
values with what you collected in Steps 2 and 3.

## Step 5 — Register the auto-refresh schedule

Call `create_scheduled_task` from the scheduled-tasks MCP with:

- `taskName`: `slack-lens-refresh`
- `cronExpression`: `0 */2 * * *`   (every 2 hours, on the hour)
- `prompt`: `Run the slack-lens-refresh skill from the slack-lens plugin to refresh the SlackLens dashboard cache.`

If a task with that name already exists, skip — don't error.

## Step 6 — Trigger the first refresh

Run the `slack-lens-refresh` skill now (in this same session) so the user
sees data immediately. Wait for it to finish. If it fails, surface the
error clearly — do not pretend setup succeeded.

## Step 7 — Open the dashboard

Run the `slack-lens-open` skill so the dashboard opens in the user's
browser AND is presented in Cowork.

## Step 8 — Confirm

Tell the user (in your own words, briefly):

> SlackLens is set up, <USER_NAME>. Dashboard is open. It'll refresh
> every 2 hours on its own — or say "refresh slack lens" any time.
