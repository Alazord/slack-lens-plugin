# SlackLens

A personal Slack triage dashboard for Claude Code. Pulls your mentions, DMs, and active threads into a single browser view, ranked by **who's asking** — not just when.

## What this is

- **Claude Code** is Anthropic's CLI for Claude — it runs in your terminal, in a desktop app, or as a VS Code / JetBrains extension. If you already use the Claude app or the Anthropic CLI, you have it.
- **Plugins** extend Claude Code with new commands. You install them through a **marketplace** (a catalog the CLI downloads on demand).
- **SlackLens** is one such plugin. It connects to whatever Slack integration (Slack MCP) you've already wired up, reads the last 48 hours of activity that touches you, scores each thread, and writes a self-contained dashboard file you open in your browser.

It's read-only against Slack. Nothing gets sent, posted, or reacted to. All state sits under `~/.slacklens/` on your machine.

## Who this is for

Anyone who drowns in Slack notifications and wants a single place to see "what actually needs me today". Works best if you have at least one or two **priority contacts** — people whose messages should rise to the top (manager, CEO, a key collaborator, whoever). Also works fine without any — you'll just get a recency-sorted "things mentioning you" list.

## Install

Open any Claude Code chat and run three commands in order:

```
/plugin marketplace add Alazord/slack-lens-plugin
```
Downloads the SlackLens catalog entry. One-time per machine.

```
/plugin install slacklens@alazord
```
Installs the plugin. One-time per machine.

```
set up slacklens
```
First-time setup — takes ~90 seconds. Detects who you are in Slack, asks who your priority contacts are, and asks if you want an auto-refresh every 8 hours (default: no). At the end, your browser opens to the dashboard.

Both `slacklens` and `slack lens` (with a space) work as triggers throughout.

**Prerequisite:** you need a Slack integration connected to Claude Code. In the Claude desktop app: Settings → Connectors → Slack → Connect. For the CLI, see the [Claude Code MCP docs](https://docs.claude.com/claude-code/mcp). If setup complains "Slack MCP not connected", that connection is missing.

**How do I know it worked?** The setup skill opens the dashboard automatically. If that didn't happen, run `check slacklens` — it prints a ✓/⚠/✗ report for every piece of state and a one-line fix per failure.

## Daily use

Type any of these in a Claude Code chat. For the full list with one-line descriptions: say `slacklens help`.

| Intent | Say |
|---|---|
| Open the dashboard | `open slacklens` |
| Fresh data (incremental) | `refresh slacklens` |
| Force a full 48h re-fetch | `deep refresh slacklens` |
| Change your priority contacts | `change slacklens vips` |
| Health check | `check slacklens` |
| Repair after a plugin upgrade | `fix slacklens` |
| Turn auto-refresh off | `unschedule slacklens` |
| Remove SlackLens completely | `uninstall slacklens` (asks for `yes` first) |
| Command reference | `slacklens help` |

The dashboard is a self-contained HTML file at `~/.slacklens/dashboard.html`. It opens in your default browser. Runtimes with a side panel (e.g. Cowork) mirror it there automatically.

## Semantic task inference (v0.12.0+)

Each card shows a one-line **"what to do"** statement derived from the thread (e.g. _"Reply to Alice about the ingest-bug ETA"_, _"Confirm 3pm call with Eve on release plan"_) instead of the raw last Slack message. Status (`Needs reply` / `Waiting` / `Done` / `Discussion` / `FYI`) is decided by Claude with access to the whole thread, not a regex on the last line.

Messages mixing English and Hinglish (Hindi in Latin script) are handled natively — `"bhai kal wala PR review kar diya kya?"` reads the same as _"did you review yesterday's PR?"_.

Inferences are cached per-thread and only re-run when a new message arrives, so the incremental cost of a typical refresh is a few thousand tokens. The side panel's "What to do" block shows the full list of inferred actions (the card only renders the first).

## How items are ranked

Items are scored by **tier + recency + your overrides**. Tier always dominates recency — a priority contact's 5-hour-old DM sits above a teammate's 30-second-old channel ping. Items you mark DONE / FYI or snooze sink below everything.

Full tier table and edge-case rules: [docs/PRIORITY.md](docs/PRIORITY.md).

You don't have to configure any priority contacts. SlackLens works as a plain "mentions + DMs in one view" tool out of the box. Priority contacts are opt-in depth, not a requirement.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Slack MCP not connected" during setup | Connect Slack to your Claude Code runtime, then retry `set up slacklens`. |
| Dashboard is blank or stale | `refresh slacklens`. If still blank: `rm -rf ~/.slacklens/` and re-run setup. |
| Freshness pill in the header turned red | Cache is >24h old. `refresh slacklens`. |
| Something feels off after an upgrade | `fix slacklens` — non-destructive, never touches your data. |
| You're unsure what's broken | `check slacklens` — prints a full health report with a concrete next step. |

On Linux, `open slacklens` needs `xdg-utils` installed; on WSL, `wslu`. The dashboard file always exists regardless of whether the opener works.

## Privacy

SlackLens only reads Slack. It uses four read-only Slack tools (user profile, user search, message search, thread read) and never exposes any send/post/react tool to the model. No data leaves your machine except the Slack calls themselves. There's no telemetry, no remote server, no background daemon.

One-command full removal:

```
uninstall slacklens
```

Removes the scheduled job, strips SlackLens's entries from `~/.claude/settings.json`, and wipes `~/.slacklens/`. Confirms before acting.

Full permission inventory, filesystem paths, and revocation details: [docs/PERMISSIONS.md](docs/PERMISSIONS.md).

## Updating

Either restart your Claude Code runtime (marketplaces re-sync on launch), or run:

```
/plugin marketplace update alazord
```

The first `refresh slacklens` after an update picks up new UI automatically — the dashboard template is re-copied from the installed plugin on every refresh.

## For maintainers

- Release checklist: [docs/MAINTAINER.md](docs/MAINTAINER.md)
- Smoke-test script: [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)
- Permissions inventory: [docs/PERMISSIONS.md](docs/PERMISSIONS.md)

Eight skills under `skills/`: `slacklens-setup`, `slacklens-refresh`, `slacklens-open`, `slacklens-vips`, `slacklens-unschedule`, `slacklens-doctor`, `slacklens-uninstall`, `slacklens-help`. Each is a self-contained `SKILL.md` — everything runs in-process, no external server.
