# SlackLens (Cowork plugin)

Personal Slack triage dashboard. Mentions, DMs, and active threads in one view, with VIPs floated to the top. Auto-refreshes every 2 hours.

## Setup (30 seconds)

**1. Make sure you have:**
- Cowork (Claude desktop app)
- Slack connected: Cowork → Settings → Connectors → Slack

**2. Install the plugin** by accepting the `.plugin` file (your team channel will have a link, or DM @Shailendra).

**3. In Cowork, send:** `set up slack lens`

The setup skill will detect you, ask who to prioritise (your manager, CEO — or skip), schedule the auto-refresh, and open the dashboard. Takes about 90 seconds.

## Day to day

- **Open the dashboard** → say `open slack lens` in Cowork
- **Force a refresh** → say `refresh slack lens` in Cowork
- **Auto-refresh** → runs every 2 hours on its own (registered as a Cowork scheduled task)
- **Change priority people** → re-run `set up slack lens`

The dashboard lives at `~/.slacklens/dashboard.html` and is also presented in the Cowork side panel after every refresh.

## How it works

Everything is a Cowork skill — there's no local server, no port, no launchd job. The plugin ships three skills:

- `slack-lens-setup` — one-time identity + VIP setup
- `slack-lens-refresh` — pulls the last 48h of mentions/DMs from Slack via the Slack MCP, writes the cache, rebuilds the dashboard HTML
- `slack-lens-open` — opens the dashboard in your browser and presents it in Cowork

State lives in `~/.slacklens/`: `config.json`, `cache.json`, `dashboard.html`. Wipe that folder to factory-reset.

## When things break

| Symptom | Fix |
|---|---|
| Setup says "Slack MCP not connected" | Cowork → Settings → Connectors → Slack → Connect |
| `set up slack lens` doesn't trigger any skill | Make sure the plugin is installed and enabled in Cowork → Settings → Plugins |
| Dashboard shows old data | Say `refresh slack lens` in Cowork |
| Dashboard is blank or "No cache loaded" | Say `refresh slack lens`. If still blank, wipe `~/.slacklens/` and re-run setup |

