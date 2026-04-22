# SlackLens v0.4.0 — Ship-Readiness Design

**Date:** 2026-04-22
**Author:** Shailendra Singh (with Claude)
**Status:** Draft, awaiting user review
**Target release:** v0.4.0

---

## Goal

Prepare SlackLens for public distribution to a team via its GitHub marketplace (`Alazord/slack-lens-plugin`). Fix installation friction, plug remaining privacy leaks, tighten known runtime edges, and document what the plugin does and what it has access to.

This spec covers one release, one plan. Layout/VIP-rename work is deferred to a separate spec.

## Context

- Plugin is installed today via `/plugin marketplace add Alazord/slack-lens-plugin` + `/plugin install slacklens@alazord`.
- Author tested end-to-end on one machine. Plugin works, but every skill invocation prompts for several tool permissions — noisy first-run UX.
- v0.2.0 did a privacy scrub on the skills and the dashboard template, but three leak surfaces were missed (see Section 3).
- No teammate has installed yet. This is a pre-distribution audit.

## Non-goals

- Layout redesign, VIP → "High Priority" rename (separate spec, deferred).
- CI pipeline, automated privacy-check git hook, release automation.
- Plugin-manifest permission declaration (not supported by Claude Code today — tracked upstream as [anthropics/claude-code#10093](https://github.com/anthropics/claude-code/issues/10093)).
- Multi-workspace support, telemetry, CHANGELOG.md.

---

## Section 1 — Permissions (minimal allowlist)

### Finding

Claude Code plugins cannot ship pre-approved permissions today. The only documented path is for the user (or a setup script) to write an allowlist into `~/.claude/settings.json`. `slacklens-setup` already runs on first install — it is the natural place to do this.

### Minimal allowlist

Compiled from an audit of every tool call across the four skills (`slacklens-setup`, `slacklens-refresh`, `slacklens-open`, `slacklens-rerender`):

```json
{
  "permissions": {
    "allow": [
      "Bash(mkdir:*)",
      "Bash(python3:*)",
      "Bash(open:*)",
      "Bash(test:*)",
      "Bash([:*)",
      "mcp__claude_ai_Slack__slack_search_users",
      "mcp__claude_ai_Slack__slack_read_user_profile",
      "mcp__claude_ai_Slack__slack_search_public_and_private",
      "mcp__claude_ai_Slack__slack_read_thread",
      "mcp__scheduled-tasks__create_scheduled_task",
      "mcp__scheduled-tasks__delete_scheduled_task",
      "Write(/tmp/slacklens-refresh.json)",
      "mcp__cowork__present_files"
    ]
  }
}
```

Scope notes:
- `Bash(python3:*)` is broad but necessary: every heredoc script runs through `python3`. Narrower (per-script-file) scoping would require extracting heredocs to standalone scripts — out of scope for this release.
- `mcp__cowork__present_files` — the exact MCP prefix must be verified at implementation time. Current skills reference it as just `present_files`; the installed MCP server name is what determines the allowlist string.
- `Write` is scoped to the one tmp path actually written by a skill.

### Mechanism — `slacklens-setup` new Step 0.5

Insert a new step between Step 0 (Slack MCP check) and Step 1 (mkdir):

```python
import json, os
p = os.path.expanduser("~/.claude/settings.json")
os.makedirs(os.path.dirname(p), exist_ok=True)
cfg = json.load(open(p)) if os.path.isfile(p) else {}
perms = cfg.setdefault("permissions", {})
allow = perms.setdefault("allow", [])
needed = [
    "Bash(mkdir:*)", "Bash(python3:*)", "Bash(open:*)",
    "Bash(test:*)", "Bash([:*)",
    "mcp__claude_ai_Slack__slack_search_users",
    "mcp__claude_ai_Slack__slack_read_user_profile",
    "mcp__claude_ai_Slack__slack_search_public_and_private",
    "mcp__claude_ai_Slack__slack_read_thread",
    "mcp__scheduled-tasks__create_scheduled_task",
    "mcp__scheduled-tasks__delete_scheduled_task",
    "Write(/tmp/slacklens-refresh.json)",
    "mcp__cowork__present_files",
]
added = [p for p in needed if p not in allow]
allow.extend(added)
with open(p, "w") as f:
    json.dump(cfg, f, indent=2)
print("added_permissions=" + str(len(added)))
```

Properties:
- Idempotent — does not duplicate on re-run.
- Preserves any existing user-added permissions.
- Runs via Bash, which itself triggers one permission prompt (the first time). After that prompt is "always allow"-ed, remaining setup and all subsequent refreshes are silent.

### Revocation

Teammates can revoke via the Claude Code `/permissions` command, or by editing `~/.claude/settings.json` directly and removing the entries. README will document this.

---

## Section 2 — Privacy scrub (remaining leaks)

v0.2.0 missed these surfaces. All must be cleared before public distribution.

### Leaks

1. **`docs/superpowers/specs/2026-04-22-slacklens-dashboard-redesign-design.md:157`** — contains "Abhinav" in a mockup snippet.
2. **`docs/superpowers/plans/2026-04-22-slacklens-dashboard-redesign.md:633`** — contains `@Abhinav Singi`, `#keka_dev_pm`, `@Dharmin Patel` in a sort-key example.
3. **`.claude/SESSION-NOTES.md`** — contains real colleague names, customer list, `shailendra.singh@unifyapps.com`, `unifyapps.slack.com`. Currently staged for commit (the repo had a `git add -A` before this audit ran). Must not ship.
4. **`fixtures/cache.sample.json`** — 55 KB fixture with real user IDs (`U07B1ASMEFJ`, `U0A83NXBH6W`, etc.), real display names (Dharmin Patel, and many more), real workspace `unifyapps.slack.com`, real channel IDs. Ships with the plugin today.

### Fixes

1. Replace "Abhinav" in the dashboard-redesign spec with "Jane Doe" (or similar generic placeholder matching the existing scrubbed examples).
2. Replace the three names + channel in the dashboard-redesign plan with generic placeholders (e.g., `@Jane Doe`, `#project-example`, `@John Example`).
3. Add `.claude/` to `.gitignore`. If `.claude/SESSION-NOTES.md` is already staged, run `git rm --cached .claude/SESSION-NOTES.md`.
4. `fixtures/cache.sample.json` — **delete entirely**. `slacklens-rerender` already falls back to `~/.slacklens/cache.json` when the fixture is absent (verified in `skills/slacklens-rerender/SKILL.md:23-26`). A scrubbed replacement fixture can be added later if needed for contributor dev-loop; not required for this release.

### Kept (intentional, re-confirmed)

- `Shailendra Singh` as author name in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
- `alazord` marketplace slug and GitHub handle references in README.
- `U01EXAMPLE99`, `Jane Doe`, `example.slack.com`, `#project-example` as documented placeholders in skill schemas.

### Release-time guard — `scripts/privacy-check.py`

New script. Greps the repo (excluding `.git/`, `.claude/`, `.superpowers/`, `node_modules/` if present) for the following patterns and exits non-zero on any match:

- `shailendra\.singh@unifyapps\.com`
- `unifyapps\.slack\.com`
- `\bU0[A-Z0-9]{8,10}\b` — real Slack user/channel ID pattern. Exclude the four documented placeholders that appear in skill schemas: `U01EXAMPLE99`, `U02EXAMPLE11`, `U01ALICE000`, `U01BOB00000`. Any other match is considered a leak.
- Colleague-name list (configurable at top of script): `Abhinav`, `Ankit`, `Abhishek`, `Dharmin`, `Divyam`, `Samarth`, `Darshan`, `Raksha`, `Ishu`, `Akhila`, `Nilesh`, `Rahul`, `Anuj`, `Dhruv`, `Mudit`, `Nirav`, `Thanusha`
- Customer/channel patterns: `keka(_|-)?(dev|pm|prod)`, `copilot[- ]automation`, `docebo`, `vodafone[- ]poc`, `boat[- ]?cdp`, `dda[- ]govgpt`, `psg[- ]poc`, `amn[- ]new`, `belcorp[- ]poc`

Script has a `--list-patterns` flag for visibility and an allowlist for the author-name carve-out (`Shailendra Singh`). Not wired into CI for v0.4.0 — just a tool README points contributors to.

---

## Section 3 — Runtime correctness

### Fixes

1. **Dead `setNotice` no-op.** Remove the function and its single call site in `loadCache` inside `dashboard.template.html`. `showBanner`/`clearBanner` (introduced in v0.3.0) are the real banner surface.
2. **Silent `present_files` fallback.** In `slacklens-refresh` Step 3, `slacklens-open` Step 3, and `slacklens-rerender` Step 3: when `present_files` is unavailable, emit a visible one-line log (`"present_files MCP not available; browser tab only"`) so the teammate understands why the Cowork panel did not update.
3. **Fresh-install race in setup Step 6.** If the in-session `slacklens-refresh` call fails (e.g., Slack rate-limit cooldown from the probe in Step 0), do not fail the entire setup. Instead, surface the error clearly and instruct the user: `"Setup is complete, but the first refresh failed (<error>). Say 'refresh slacklens' in a minute."` Scheduled task is still registered, so auto-refresh will pick up on schedule.
4. **Broaden Slack MCP probe in setup Step 0.** Currently only `slack_search_users` is probed. If an older Slack MCP is installed that lacks `slack_search_public_and_private` or `slack_read_thread`, refresh fails later with a confusing error. Extend the probe to verify all four Slack tools the plugin uses are present. If any is missing, instruct the user to update the Slack connector before continuing.
5. **Cross-platform `~/.claude/` parent dir.** Section 1's Step 0.5 creates the parent dir if missing — covers Linux/WSL teammates whose `~/.claude/settings.json` does not yet exist.

### Out of scope

- Dashboard template bugs fixed in v0.3.0 (`1d283dd`).
- VIP logic, layout redesign — deferred.
- Cache schema changes — none this release.

---

## Section 4 — Docs

### README additions

1. **New section: "What SlackLens has access to"**, placed between "How it works" and "Updating". Lists every permission from Section 1 in plain English, grouped by category (Slack read, shell, file write, scheduled-tasks). Explicit: "SlackLens never writes to Slack. It only reads your mentions, DMs, and threads. It never sends messages on your behalf."
2. **Troubleshooting matrix — three new rows:**
   | Symptom | Fix |
   |---|---|
   | Setup asks for several permissions in a row | Expected on first run. Approve each "always allow". Subsequent runs are silent. |
   | Teammate on Linux or WSL — `open slacklens` does nothing | Install `xdg-utils` or set `$BROWSER`. Dashboard still lives at `~/.slacklens/dashboard.html`. |
   | Want to revoke what SlackLens was granted | Run `/permissions` in chat, or edit `~/.claude/settings.json` and remove the `Bash(...)` / `mcp__...` entries starting with the ones SlackLens added. |
3. **New section: "Before you distribute" (maintainer-only, tucked at the bottom).** Documents `scripts/privacy-check.py`, version bump in both manifests, git tag, optional `/plugin marketplace update alazord` announcement to existing installers.

### New file — `docs/ACCEPTANCE.md`

Fresh-machine smoke test, to be run by the author before every distribution bump. Checklist:

```
[ ] Clean user (or fresh VM): /plugin marketplace add Alazord/slack-lens-plugin — succeeds
[ ] /plugin install slacklens@alazord — succeeds, no permission prompts yet
[ ] "set up slacklens" — exactly ONE "always allow" permission prompt (the allowlist write)
[ ] All subsequent setup steps run silently
[ ] Identity detection is correct (or the "detected you as X" confirmation appears)
[ ] Priority-people prompt handles multi-name + 'skip' paths
[ ] First refresh succeeds, dashboard opens in browser
[ ] "refresh slacklens" a second time — zero permission prompts
[ ] `/plugin` list / scheduled-tasks list shows the `slacklens-refresh` cron
[ ] ~/.slacklens/ contains config.json, cache.json, dashboard.html
[ ] scripts/privacy-check.py exits 0
```

### Release steps (documented in README maintainer section)

1. Run `scripts/privacy-check.py` — must exit 0.
2. Walk `docs/ACCEPTANCE.md` on a fresh profile (or `rm -rf ~/.slacklens ~/.claude/plugins/cache/alazord`).
3. Bump version in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
4. Commit with conventional message: `v0.4.0: ship-readiness — permissions, privacy, docs`.
5. Tag: `git tag v0.4.0 && git push origin main --tags`.
6. Optional announcement: "Run `/plugin marketplace update alazord` to pull v0.4.0".

---

## File-by-file change summary

| File | Change | Section |
|---|---|---|
| `skills/slacklens-setup/SKILL.md` | New Step 0.5 (allowlist); broaden Step 0 MCP probe; Step 6 non-fatal refresh | 1, 3 |
| `skills/slacklens-refresh/SKILL.md` | Visible log when `present_files` unavailable | 3 |
| `skills/slacklens-open/SKILL.md` | Visible log when `present_files` unavailable | 3 |
| `skills/slacklens-rerender/SKILL.md` | Visible log when `present_files` unavailable | 3 |
| `skills/slacklens-refresh/references/dashboard.template.html` | Remove `setNotice` dead code + call site | 3 |
| `docs/superpowers/specs/2026-04-22-slacklens-dashboard-redesign-design.md` | Replace "Abhinav" at line 157 | 2 |
| `docs/superpowers/plans/2026-04-22-slacklens-dashboard-redesign.md` | Replace names at line 633 | 2 |
| `.gitignore` | Add `.claude/` | 2 |
| `.claude/SESSION-NOTES.md` | `git rm --cached` | 2 |
| `fixtures/cache.sample.json` | Delete | 2 |
| `scripts/privacy-check.py` | New file | 2 |
| `README.md` | New "access" section, troubleshooting rows, maintainer release section | 4 |
| `docs/ACCEPTANCE.md` | New file | 4 |
| `.claude-plugin/plugin.json` | Version 0.3.0 → 0.4.0 | 4 |
| `.claude-plugin/marketplace.json` | Version 0.3.0 → 0.4.0 | 4 |

---

## Acceptance criteria

- [ ] Running `scripts/privacy-check.py` on the committed tree exits 0.
- [ ] Fresh-profile install, per `docs/ACCEPTANCE.md`, prompts exactly once during setup and zero times on subsequent refreshes.
- [ ] All four skills list every tool they actually call in the generated allowlist — no more, no less.
- [ ] No real colleague names, customer names, workspace URLs, user IDs, or channel IDs appear in any file that ships with the plugin (including `docs/`).
- [ ] `.claude/SESSION-NOTES.md` is not in the committed tree.
- [ ] `fixtures/` is either absent or contains only scrubbed data.
- [ ] README documents what the plugin has access to and how to revoke it.
- [ ] Running `slacklens-rerender` without the fixture present does not fail (falls back to `~/.slacklens/cache.json`).
- [ ] `slacklens-refresh`, `slacklens-open`, and `slacklens-rerender` all emit a visible log line when `present_files` is unavailable.
- [ ] Version bumped to v0.4.0 in both manifests.
