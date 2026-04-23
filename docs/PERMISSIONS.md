# Permissions

SlackLens asks for a tight, fixed set of permissions during setup. It is **read-only against Slack** — never sends messages, writes to Slack, or reaches a server other than your connected Slack MCP. This document is the full inventory; if you see a permission prompt that isn't on this list, something else is asking.

## Slack (read-only)

| Tool | Purpose |
|---|---|
| `slack_read_user_profile` | Detect who you are at setup time. |
| `slack_search_users` | Resolve VIP names to Slack IDs. |
| `slack_search_public_and_private` | Find your mentions, DMs, and channel pings over the last 48 hours. |
| `slack_read_thread` | Load the full thread of any conversation you appear in. |

No `send_message`, no `create_*`, no `update_*`. You can verify the exact tool set in `skills/slacklens-setup/SKILL.md` Step 0.5.

## Local filesystem

- Writes to `~/.slacklens/`:
  - `config.json` — your identity + VIP list
  - `cache.json` + `cache.json.bak` — fetched Slack data
  - `dashboard.html` + `dashboard.html.bak` — rendered dashboard
  - `refresh.log` — last 20 refresh events (mode, counts, token estimate)
- Writes `/tmp/slacklens-refresh.json` during refresh (intermediate, auto-cleaned).
- Writes one entry block to `~/.claude/settings.json` on first setup so subsequent refreshes run silently (see [Shell](#shell) below).

## Shell

Small, scoped subcommands. None accept arbitrary input.

- `mkdir`, `python3`, `test`, `[`, `echo`, `sleep`, `command` — utility
- `open` (macOS) / `xdg-open` (Linux) / `wslview` (WSL) — browser launcher, whichever your system has

## Scheduled tasks (opt-in)

Optionally registers one task, `slacklens-refresh`, running every 8 hours. You are asked for explicit consent at setup; default is **no**. Say `unschedule slacklens` any time to remove it.

## Revoking access

- **One command**: `uninstall slacklens` — removes the scheduled task, strips SlackLens's entries from `~/.claude/settings.json`, wipes `~/.slacklens/`. Asks for `yes` before proceeding.
- **Manual**: `/permissions` in chat, or edit `~/.claude/settings.json` and remove entries starting with `Bash(mkdir:*)`, `Bash(python3:*)`, `mcp__claude_ai_Slack__*`, `mcp__scheduled-tasks__*`, `mcp__cowork__present_files`, or `Write(/tmp/slacklens-refresh.json)`.
