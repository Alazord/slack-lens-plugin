# SlackLens

A personal Slack triage dashboard for Claude Code. Surfaces your mentions, DMs, and active threads in one view, ranked by **who's asking** — not just when.

## Why

Scrolling Slack to find what actually needs you is exhausting. SlackLens pulls the last 48 hours of messages that touch you, scores each one by a four-tier priority model, and renders a single on-demand dashboard. Your boss's direct DM sits at the top; a channel ping from a stranger sits lower; items you've marked DONE sink regardless of freshness.

It's read-only against Slack. State lives entirely on your machine.

## Install

Requires Claude Code with a [Slack MCP](https://docs.claude.com/claude-code/mcp) connected to your runtime.

In any Claude Code chat:

```
/plugin marketplace add Alazord/slack-lens-plugin
/plugin install slacklens@alazord
set up slacklens
```

Setup takes ~90 seconds: it identifies you in Slack, asks who your VIPs are (manager, CEO, anyone whose message is more urgent than average), and asks whether to auto-refresh every 8 hours (default: **no**).

Both `slacklens` and `slack lens` work as triggers throughout.

## Daily use

| Intent | Say |
|---|---|
| Open the dashboard | `open slacklens` |
| Fresh data (incremental) | `refresh slacklens` |
| Force a full 48h re-fetch | `deep refresh slacklens` |
| Health check | `check slacklens` |
| Repair after upgrade | `fix slacklens` |
| Change VIPs | `change slacklens vips` |
| Toggle auto-refresh off | `unschedule slacklens` |
| Uninstall (confirms first) | `uninstall slacklens` |

The dashboard is a self-contained HTML file at `~/.slacklens/dashboard.html` — opens in your default browser. Runtimes with a side panel (e.g. Cowork) mirror it there automatically.

## Priority model

Items are scored by tier, recency, and user overrides. Tier always dominates recency.

| Tier | Rule | Example |
|---|---|---|
| **P0** | A VIP directly addresses you | Boss DMs you, or tags you in a channel |
| **P1** | A VIP is in the conversation but didn't tag you | VIP was CC'd or posted earlier |
| **P2** | You're mentioned somewhere, no VIP involved | Teammate pings you in a channel |
| **P3** | You're in a 1:1 DM with a non-VIP | Casual check-in |

Items marked DONE or snoozed drop below every tier. Channels with at least one urgent item bubble above quieter channels.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Setup says "Slack MCP not connected" | Connect Slack to your runtime, then retry `set up slacklens`. |
| Dashboard blank or stale | `refresh slacklens`. If still blank: `rm -rf ~/.slacklens/` and re-run setup. |
| Freshness pill turned red | Cache is >24h old. Run `refresh slacklens`. |
| Something feels off after an upgrade | `fix slacklens` — re-injects the allowlist and re-copies the dashboard template. Non-destructive. |
| You're unsure what's wrong | `check slacklens` — prints a full ✓/⚠/✗ report with a one-line fix per failure. |
| Auto-refresh isn't running | By design — it's opt-in. Re-run `set up slacklens` and say **yes** when asked. |

On Linux, `open slacklens` needs `xdg-utils`; on WSL, `wslu`. The dashboard file still lives at `~/.slacklens/dashboard.html` regardless.

## Privacy and permissions

SlackLens is read-only against Slack and never contacts any server other than your connected Slack MCP. Full permission inventory, state paths, and revocation steps are in [docs/PERMISSIONS.md](docs/PERMISSIONS.md).

One-command revocation:

```
uninstall slacklens
```

Removes the scheduled task, strips SlackLens's entries from `~/.claude/settings.json`, and wipes `~/.slacklens/`. Asks for `yes` first.

## Updating

Restart your Claude Code runtime, or run:

```
/plugin marketplace update alazord
```

The first `refresh slacklens` after an update picks up new UI automatically.

## For contributors and maintainers

- Release checklist: [docs/MAINTAINER.md](docs/MAINTAINER.md)
- Smoke-test script: [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)
- Permissions inventory: [docs/PERMISSIONS.md](docs/PERMISSIONS.md)

Seven skills under `skills/`: `slacklens-setup`, `slacklens-refresh`, `slacklens-open`, `slacklens-vips`, `slacklens-unschedule`, `slacklens-doctor`, `slacklens-uninstall`. Each is a self-contained `SKILL.md` — everything runs in-process, no external server.
