# Maintainer notes

Notes for releasing a new version of SlackLens. End users shouldn't need any of this.

## Release checklist

1. `python3 scripts/privacy-check.py` — must print `clean.` and exit 0.
2. Walk [ACCEPTANCE.md](ACCEPTANCE.md) on a fresh profile, or a clean state:
   ```
   rm -rf ~/.slacklens ~/.claude/plugins/cache/alazord
   ```
3. Bump `version` in both `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`. They must match.
4. Commit with a `vX.Y.Z:` prefix so the tag reads cleanly.
5. Tag and push:
   ```
   git tag vX.Y.Z && git push origin main --tags
   ```
6. Announce to existing installers: *"Run `/plugin marketplace update alazord` to pull vX.Y.Z."*

## File layout

```
.claude-plugin/        plugin + marketplace manifests
skills/                seven skills (setup, refresh, open, vips, unschedule, doctor, uninstall)
scripts/               privacy-check script
docs/                  this file + ACCEPTANCE.md + PERMISSIONS.md
README.md              user-facing, stays short
```

## State the plugin writes

All under `~/.slacklens/`. See [PERMISSIONS.md](PERMISSIONS.md) for the user-facing explanation.

- `config.json` — identity + VIP list; source of truth for scoring
- `cache.json` + `.bak` — Slack data, written atomically with one-level backup
- `dashboard.html` + `.bak` — self-contained renderable artifact
- `refresh.log` — JSON-lines, last 20 entries, feeds `check slacklens`
- `/tmp/slacklens-refresh.json` — intermediate payload, auto-cleaned

## Cache schema versions

- **v1** (v0.6.0–v0.8.0) — baseline: mentions/dms/channels buckets + threads dict, string `from_user`.
- **v2** (v0.9.1+) — adds `from_user_id`, `mentioned_ids` on every result and thread message, plus `reply_count` per thread. Enables the tier-scoring in v0.10.0. Backward-compatible: dashboard derives v2 fields from v1 data on the fly until the user runs `refresh slacklens`.

Bump cache version when bucket keys or per-result field names change. Leave it alone when adding optional fields dashboard can derive.
