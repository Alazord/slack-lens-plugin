# SlackLens (Claude Code plugin)

Personal Slack triage dashboard. Mentions, DMs, and active threads in one view, with VIPs floated to the top. Refreshes on demand; auto-refresh every 8 hours is opt-in.

## Install (60 seconds)

**1. Make sure you have:**
- Claude Code (CLI, desktop/Cowork, or IDE extension — any runtime that supports plugins and MCP)
- The Slack MCP connected to that runtime — see [Connecting the Slack MCP](#connecting-the-slack-mcp) below
- `/plugin install` available in chat. Do **not** `git clone` this repo and try to run the skills manually — the plugin's install flow sets `$CLAUDE_PLUGIN_ROOT`, which the skills rely on

**2. Add the marketplace**, then install the plugin — run these two commands in a Claude Code chat, one after the other:

```
/plugin marketplace add Alazord/slack-lens-plugin
/plugin install slacklens@alazord
```

**3. Run setup:** in the same chat, send `set up slacklens`.

The setup skill detects you, asks who to prioritise (your manager, CEO — or skip), asks whether you want auto-refresh (default **no**), and opens the dashboard. Takes about 90 seconds end-to-end.

**4. (Optional) Verify the install:** say `check slacklens` to get a ✓/⚠/✗ health report of every dependency and piece of state.

## Connecting the Slack MCP

SlackLens never ships a Slack MCP of its own — it uses whichever one your Claude Code runtime already provides:

- **Cowork (desktop app)**: Settings → Connectors → Slack → Connect. Sign in to your workspace. The four tools SlackLens uses (`slack_search_users`, `slack_read_user_profile`, `slack_search_public_and_private`, `slack_read_thread`) are enabled automatically.
- **Claude Code CLI**: use `claude mcp add` per the [Anthropic docs](https://docs.claude.com/claude-code/mcp) to point at the Slack MCP server your team uses. Exact arguments depend on which Slack MCP implementation you pick; SlackLens is agnostic about that.
- **Other runtimes**: any runtime that exposes the four `mcp__claude_ai_Slack__*` tools will work.

If setup's Step 0 fails with "MCP not connected", the Slack MCP isn't reachable from this session — fix that first, then re-run `set up slacklens`.

## Day to day

- **Open the dashboard** → say `open slacklens` in chat
- **Force a refresh** → say `refresh slacklens` in chat
- **Force a full 48h refresh** → say `deep refresh slacklens` (use when data looks stale or edits/deletes are missing)
- **Health check** → say `check slacklens` (runs the doctor skill)
- **Repair install after upgrade** → say `fix slacklens` (doctor re-injects the allowlist + re-copies the dashboard template; non-destructive)
- **Structured doctor output** → say `check slacklens --json` (for scripting)
- **Change priority people** → say `change slacklens vips` (or re-run `set up slacklens`)
- **Turn auto-refresh on / off** → say `set up slacklens` again to turn it on, or `unschedule slacklens` to turn it off

The dashboard lives at `~/.slacklens/dashboard.html` and opens in your default browser. On Linux install `xdg-utils`; on WSL install `wslu`. If your Claude Code runtime exposes a side panel (Cowork does, via the `present_files` MCP tool), the dashboard is additionally presented there after every refresh.

> Both `slacklens` and `slack lens` (with a space) are recognised triggers — either works.

## How it works

Everything is a Claude Code skill — there's no local server, no port, no launchd job. The plugin ships six skills:

- `slacklens-setup` — one-time identity + VIP setup, and the opt-in prompt for auto-refresh
- `slacklens-refresh` — pulls the last 48h of mentions/DMs from Slack via the Slack MCP, writes the cache, rebuilds the dashboard HTML (also re-copies the bundled template, so plugin updates propagate automatically)
- `slacklens-open` — opens the dashboard in your browser (and in the side panel if the runtime supports it)
- `slacklens-vips` — add / remove / replace your priority people without re-running full setup
- `slacklens-unschedule` — removes the auto-refresh scheduled task
- `slacklens-doctor` — health-checks every dependency and piece of state, prints ✓/⚠/✗ with a fix for each failure

State lives in `~/.slacklens/`: `config.json`, `cache.json`, `dashboard.html`, and `refresh.log` (last 20 refreshes, append-only — helps the doctor spot failures). Wipe that folder to factory-reset.

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
- `mkdir`, `python3`, `test`, `[`, `echo`, `sleep`, `command` — small
  scoped set used by the skills.
- `open` (macOS) / `xdg-open` (Linux) / `wslview` (WSL) — whichever
  one your system has, for launching the dashboard in the browser.

**Scheduled tasks (opt-in):**
- Optionally registers one task, `slacklens-refresh`, running every 8
  hours. You are asked for consent during setup (default **no**); say
  `unschedule slacklens` any time to remove it.

**To revoke everything SlackLens was granted:** run `/permissions` in
chat and remove the entries, or edit `~/.claude/settings.json` directly.

## Uninstalling

1. Unschedule auto-refresh (if it was registered): say `unschedule slacklens`.
2. Remove the plugin: `/plugin uninstall slacklens@alazord`.
3. Wipe local state: `rm -rf ~/.slacklens/`.
4. Remove the allowlist entries: `/permissions` and delete any entry starting with
   `mcp__claude_ai_Slack__`, `mcp__scheduled-tasks__`, `mcp__cowork__present_files`,
   or `Write(/tmp/slacklens-refresh.json)`. (Or edit `~/.claude/settings.json` directly.)

## Updating

To pick up new versions, either:

- Restart your Claude Code runtime (marketplaces re-sync on launch), **or**
- Run `/plugin marketplace update alazord` then `/plugin install slacklens@alazord` again.

After the plugin update is pulled, **the first `refresh slacklens` picks up new UI automatically** — `slacklens-refresh` re-copies the bundled dashboard template from the installed plugin every time it runs, so CSS/JS/layout updates land on the very next refresh without needing to re-run `set up slacklens`.

The `version` field in `.claude-plugin/plugin.json` bumps on every release.

## When things break

| Symptom | Fix |
|---|---|
| Setup says "Slack MCP not connected" | Connect Slack to your runtime — Cowork: Settings → Connectors → Slack → Connect. CLI: `claude mcp add slack ...` per the Slack MCP docs. |
| `set up slacklens` doesn't trigger any skill | Check the plugin is enabled: `/plugin list` (CLI), or your runtime's plugin settings panel. |
| Dashboard shows old data | Say `refresh slacklens` |
| Dashboard is blank or "No cache loaded" | Say `refresh slacklens`. If still blank, `rm -rf ~/.slacklens/` and re-run setup |
| "Marketplace file not found" when adding marketplace | Your clone is stale — `rm -rf ~/.claude/plugins/marketplaces/Alazord-slack-lens-plugin/` and retry |
| Setup asks for several permissions in a row | Expected on first run. Approve "always allow" for each. Subsequent refreshes run silently. |
| You denied the Step 0.5 permission prompt and setup aborted | Re-run `set up slacklens` and approve the write to `~/.claude/settings.json`. Without it, every refresh will re-prompt for the underlying tools. |
| Teammate on Linux/WSL — `open slacklens` does nothing | The skill now tries `open` → `xdg-open` → `wslview` → `$BROWSER`. If none are found, install `xdg-utils` (Linux) or `wslu` (WSL). The dashboard still lives at `~/.slacklens/dashboard.html`. |
| Auto-refresh isn't running every 8h | By design — auto-refresh is opt-in. Say `set up slacklens` again and answer **yes** when asked, or just `refresh slacklens` on demand. Run `check slacklens` to see the current schedule status. |
| Something feels off and I don't know what | Run `check slacklens`. The doctor prints a ✓/⚠/✗ report of every dependency and a one-line fix for each failure. |
| Just upgraded and things feel broken | Run `fix slacklens`. The doctor re-injects the allowlist + re-copies the dashboard template, then re-runs the report. Non-destructive — never touches your cache or VIPs. |
| Dashboard freshness pill turned red | Cache is >24h old. Run `refresh slacklens` or set up auto-refresh via `set up slacklens`. |
| Want to revoke what SlackLens was granted | Run `/permissions` in chat, or edit `~/.claude/settings.json` and remove SlackLens's entries (they start with `Bash(mkdir:*)` or `mcp__claude_ai_Slack__*`). |

---

## Before you distribute (maintainer)

Run this checklist before cutting a new release:

1. `python3 scripts/privacy-check.py` — must print `clean.` and exit 0.
2. Walk `docs/ACCEPTANCE.md` on a fresh profile (or clean state:
   `rm -rf ~/.slacklens ~/.claude/plugins/cache/alazord`).
3. Bump `version` in both `.claude-plugin/plugin.json` and
   `.claude-plugin/marketplace.json`. They must match.
4. Commit with a `vX.Y.Z:` prefix so the tag reads cleanly.
5. Tag: `git tag vX.Y.Z && git push origin main --tags`.
6. Announce to existing installers: "Run `/plugin marketplace update
   alazord` to pull vX.Y.Z".
