---
name: slacklens-vips
description: Update SlackLens's high-priority people (VIPs) — the folks whose DMs, mentions, and channels float to the top of the dashboard. Add, remove, or fully replace the list without re-running setup, without touching identity or the scheduled refresh. Use when the user says "change slacklens vips", "add slacklens priority", "update slacklens priorities", "remove slacklens vip", "edit high priority slacklens", "add a vip to slacklens", "stop prioritising <name> in slacklens".
---

You are updating the VIP / high-priority list for SlackLens. The
rest of the plugin state (identity, scheduled task, cache) is not
touched.

## Step 0 — Load current state

```bash
python3 - <<'PY'
import json, os, sys
home = os.path.expanduser("~/.slacklens")
cfg_path = os.path.join(home, "config.json")
if not os.path.isfile(cfg_path):
    raise SystemExit("ERROR: ~/.slacklens/config.json not found. "
                     "Run `set up slacklens` first — this skill only "
                     "updates an existing setup.")
cfg = json.load(open(cfg_path))
priority = cfg.get("priority_people", [])
print("CURRENT_COUNT=" + str(len(priority)))
for i, p in enumerate(priority, 1):
    print("CURRENT_" + str(i) + "=" + p["name"] + " (" + p["id"] + ")")
PY
```

If the config is missing, stop and tell the user to run `set up
slacklens` first.

## Step 1 — Show current VIPs + ask the user what to change

Read the `CURRENT_*` values from Step 0 and tell the user:

> Your current VIPs:
> 1. <name> (<id>)
> 2. <name> (<id>)
>
> What would you like to do? Options:
>  - **Add** (e.g. "add Jane Doe")
>  - **Remove** (e.g. "remove Bob")
>  - **Replace** (e.g. "replace with Alice, Charlie" — wipes the
>    list and uses just those)
>  - **Clear** (remove everyone)
>  - **Cancel** (leave as-is)

If the user's intent is already clear from their original message —
e.g. they said "add Alice as a VIP" — skip asking and go straight to
Step 2 with that instruction.

## Step 2 — Resolve names to Slack IDs

For each name the user wants to ADD or REPLACE with, call
`slack_search_users` to find the matching user ID. If a search
returns zero matches or multiple candidates, ask the user to pick.
Accumulate the resolved `{id, name}` pairs.

For each name the user wants to REMOVE, match against the current
list by name (case-insensitive contains is fine — warn if the match
is ambiguous).

## Step 3 — Compute the new list

Build the updated `priority_people` array in memory. Read the Step-0
`CURRENT_*` values back in, then apply the operation:

- **add**: append new entries (dedupe by id).
- **remove**: filter out matching entries.
- **replace**: discard all, use only the newly-resolved entries.
- **clear**: empty list.

Print a one-line preview:

> New VIP list: <name1>, <name2>, … (was: <old1>, <old2>, …).

Ask: "Confirm? (yes / no)". If the user says no / cancel, stop and
leave config untouched.

## Step 4 — Write config + re-inject dashboard

Pass the new list in via an env var and run this Python block. It
rewrites `~/.slacklens/config.json` and re-injects `VIP_IDS` /
`VIP_NAMES` into `~/.slacklens/dashboard.html`. It does NOT touch
the cache, the identity constants, or anything else.

```bash
NEW_VIPS_JSON='[{"id":"U01EXAMPLE99","name":"Alice"}]' \
python3 - <<'PY'
import json, os, re

home = os.path.expanduser("~/.slacklens")
cfg_path = os.path.join(home, "config.json")
dash_path = os.path.join(home, "dashboard.html")

new_vips = json.loads(os.environ["NEW_VIPS_JSON"])

cfg = json.load(open(cfg_path))
cfg["priority_people"] = new_vips
with open(cfg_path, "w", encoding="utf-8") as f:
    json.dump(cfg, f, indent=2)

if os.path.isfile(dash_path):
    html = open(dash_path, "r", encoding="utf-8").read()
    vip_ids   = [p["id"]   for p in new_vips]
    vip_names = [p["name"] for p in new_vips]

    def sub_checked(pattern, repl, text, label):
        new_text, count = re.subn(pattern, repl, text, count=1)
        if count == 0:
            raise SystemExit("ERROR: " + label + " placeholder not found in "
                             "dashboard.html — template may be out of date. "
                             "Try `refresh slacklens` to rebuild it.")
        return new_text

    html = sub_checked(r"const VIP_IDS\s*=\s*\[[^\]]*\]",
                       lambda _m: "const VIP_IDS = "   + json.dumps(vip_ids),   html, "VIP_IDS")
    html = sub_checked(r"const VIP_NAMES\s*=\s*\[[^\]]*\]",
                       lambda _m: "const VIP_NAMES = " + json.dumps(vip_names), html, "VIP_NAMES")

    with open(dash_path, "w", encoding="utf-8") as f:
        f.write(html)

print("UPDATED=" + str(len(new_vips)))
PY
```

Replace the `NEW_VIPS_JSON` value with the actual list you built in
Step 3.

## Step 5 — Confirm

One sentence:

> Updated. SlackLens will now float `<N>` VIP(s) to the top of the
> dashboard: `<name1>, <name2>, …`. Reload your browser tab (or say
> `refresh slacklens`) to see the change.
