# SlackLens (Cowork plugin)

Personal Slack triage dashboard. Mentions, DMs, and active threads in one view, with VIPs floated to the top. Auto-refreshes every 2 hours.

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

The setup skill detects you, asks who to prioritise (your manager, CEO — or skip), registers the 2-hour auto-refresh, and opens the dashboard. Takes about 90 seconds end-to-end.

## Day to day

- **Open the dashboard** → say `open slacklens` in chat
- **Force a refresh** → say `refresh slacklens` in chat
- **Auto-refresh** → runs every 2 hours on its own (registered as a scheduled task)
- **Change priority people** → re-run `set up slacklens`

The dashboard lives at `~/.slacklens/dashboard.html` and is also presented in the Cowork side panel after every refresh.

> Both `slacklens` and `slack lens` (with a space) are recognised triggers — either works.

## How it works

Everything is a Cowork skill — there's no local server, no port, no launchd job. The plugin ships three skills:

- `slacklens-setup` — one-time identity + VIP setup
- `slacklens-refresh` — pulls the last 48h of mentions/DMs from Slack via the Slack MCP, writes the cache, rebuilds the dashboard HTML
- `slacklens-open` — opens the dashboard in your browser and presents it in Cowork

State lives in `~/.slacklens/`: `config.json`, `cache.json`, `dashboard.html`. Wipe that folder to factory-reset.

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
