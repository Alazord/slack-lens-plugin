# SlackLens acceptance checklist

Run this on a fresh profile (or after
`rm -rf ~/.slacklens ~/.claude/plugins/cache/alazord`) before any
v0.X.0 distribution bump. If any box is unchecked, don't ship.

## Install

- [ ] `/plugin marketplace add Alazord/slack-lens-plugin` — prints
      "Successfully added marketplace: alazord".
- [ ] `/plugin install slacklens@alazord` — prints "Installed
      slacklens". No permission prompts at this stage.
- [ ] `/reload-plugins` — plugin appears in the list.

## First-run setup

- [ ] Say `set up slacklens` in chat. Setup starts.
- [ ] Step 0 probes all four Slack MCP tools silently. If any is
      missing, setup stops with a clear error — acceptable failure.
- [ ] Step 0.5 triggers **exactly one** permission prompt (the
      `~/.claude/settings.json` write). Approve "always allow".
- [ ] Remaining setup steps (identity detect, priority-people,
      config write, scheduled-task register, first refresh, open)
      run **silently** — no further permission prompts.
- [ ] First refresh succeeds OR setup surfaces a soft-error and
      proceeds anyway.
- [ ] Dashboard opens in the default browser.
- [ ] Dashboard renders (items visible if refresh succeeded, empty
      state otherwise).

## Steady state

- [ ] Say `refresh slacklens`. **Zero** permission prompts. Cache
      updates, browser tab reloads (or Cowork panel shows updated).
- [ ] Say `open slacklens`. Browser tab opens (or focuses).
- [ ] Run `~/.claude/plugins/cache/alazord/slacklens/scripts/privacy-check.py`
      against the installed plugin cache — exit 0. (Optional, for
      belt-and-braces.)

## Files on disk

- [ ] `~/.slacklens/config.json` — contains your detected identity.
- [ ] `~/.slacklens/cache.json` — non-empty if refresh succeeded.
- [ ] `~/.slacklens/dashboard.html` — embeds the cache.
- [ ] `~/.claude/settings.json` — `permissions.allow` contains the
      13 entries from the setup Step 0.5 allowlist.

## Scheduled task

- [ ] Look up scheduled tasks (via whatever Cowork/CLI surface you
      use). Task `slacklens-refresh` is registered with cron
      `0 */8 * * *`.

## Repo hygiene (maintainer only)

- [ ] `python3 scripts/privacy-check.py` — exits 0.
- [ ] `git status` — working tree clean. `.claude/` is ignored.
- [ ] `fixtures/` — either absent or contains only scrubbed data.
