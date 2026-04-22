# SlackLens (Cowork plugin)

Personal Slack triage dashboard. Mentions, DMs, and active threads in one view, with VIPs floated to the top. Auto-refreshes every 8 hours.

## Install (60 seconds)

**1. Make sure you have:**
- Cowork (the Claude desktop app), or Claude Code CLI
- Slack connected: Cowork → Settings → Connectors → Slack

**2. Add the marketplace**, then install the plugin — run these two commands in a Cowork/Claude Code chat, one after the other:

```
/plugin marketplace add Alazord/slack-lens-plugin
/plugin install slacklens@alazord
```

**3. Run setup:** in the same chat, send `set up slacklens`.

The setup skill detects you, asks who to prioritise (your manager, CEO — or skip), registers the 8-hour auto-refresh, and opens the dashboard. Takes about 90 seconds end-to-end.

## Day to day

- **Open the dashboard** → say `open slacklens` in chat
- **Force a refresh** → say `refresh slacklens` in chat
- **Auto-refresh** → runs every 8 hours on its own (registered as a scheduled task)
- **Change priority people** → re-run `set up slacklens`

The dashboard lives at `~/.slacklens/dashboard.html` and is also presented in the Cowork side panel after every refresh.

> Both `slacklens` and `slack lens` (with a space) are recognised triggers — either works.

## How it works

Everything is a Cowork skill — there's no local server, no port, no launchd job. The plugin ships three skills:

- `slacklens-setup` — one-time identity + VIP setup
- `slacklens-refresh` — pulls the last 48h of mentions/DMs from Slack via the Slack MCP, writes the cache, rebuilds the dashboard HTML
- `slacklens-open` — opens the dashboard in your browser and presents it in Cowork

State lives in `~/.slacklens/`: `config.json`, `cache.json`, `dashboard.html`. Wipe that folder to factory-reset.

## What SlackLens has access to

SlackLens asks for a tight, fixed set of permissions during setup.
It never writes to Slack. It only reads your mentions, DMs, and
threads. It never sends messages on your behalf.

**Slack (read-only):**
- `slack_read_user_profile` — to detect who you are.
- `slack_search_users` — to look up the people you mark as priority.
- `slack_search_public_and_private` — to find your mentions/DMs.
- `slack_read_thread` — to show you the thread you were mentioned in.

**Local filesystem:**
- Writes `~/.slacklens/config.json`, `~/.slacklens/cache.json`,
  `~/.slacklens/dashboard.html`.
- Writes `/tmp/slacklens-refresh.json` during refresh (intermediate,
  auto-cleaned).
- Writes one allowlist entry set to `~/.claude/settings.json` on
  first setup.

**Shell:**
- `mkdir`, `python3`, `open`, `test`, `[` — all scoped to the narrow
  subcommands the skills actually call.

**Scheduled tasks:**
- Registers one task, `slacklens-refresh`, running every 8 hours.

**To revoke everything SlackLens was granted:** run `/permissions` in
chat and remove the entries, or edit `~/.claude/settings.json` directly.

## Updating

To pick up new versions, either:

- Restart Cowork (marketplaces re-sync on launch), **or**
- Run `/plugin marketplace update alazord` then `/plugin install slacklens@alazord` again.

The `version` field in `.claude-plugin/plugin.json` bumps on every release.

## When things break

| Symptom | Fix |
|---|---|
| Setup says "Slack MCP not connected" | Cowork → Settings → Connectors → Slack → Connect |
| `set up slacklens` doesn't trigger any skill | Check the plugin is enabled: `/plugin list` (CLI) or Settings → Plugins (Cowork) |
| Dashboard shows old data | Say `refresh slacklens` |
| Dashboard is blank or "No cache loaded" | Say `refresh slacklens`. If still blank, `rm -rf ~/.slacklens/` and re-run setup |
| "Marketplace file not found" when adding marketplace | Your clone is stale — `rm -rf ~/.claude/plugins/marketplaces/Alazord-slack-lens-plugin/` and retry |
| Setup asks for several permissions in a row | Expected on first run. Approve "always allow" for each. Subsequent refreshes run silently. |
| Teammate on Linux/WSL — `open slacklens` does nothing | Install `xdg-utils` or set `$BROWSER`. The dashboard still lives at `~/.slacklens/dashboard.html`. |
| Want to revoke what SlackLens was granted | Run `/permissions` in chat, or edit `~/.claude/settings.json` and remove SlackLens's entries (they start with `Bash(mkdir:*)` or `mcp__claude_ai_Slack__*`). |
