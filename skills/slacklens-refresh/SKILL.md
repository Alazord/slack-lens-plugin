---
name: slacklens-refresh
description: Refreshes the SlackLens dashboard with the latest mentions, DMs, and active threads from Slack. Picks DELTA mode automatically when the cache is fresh (under 48h old) to fetch only what is new since the last refresh — cheap enough to run every few minutes without hitting Slack rate limits. Falls back to a FULL 48-hour fetch when the cache is stale or missing. Use when the user says "refresh slacklens", "refresh slack lens", "reload slacklens", "update my slack triage", or the scheduled task fires. Use FULL mode (set $SLACKLENS_FORCE_FULL=1 before running) when the user says "force full refresh slacklens", "deep refresh slacklens", or the cache seems drifted.
---

You are refreshing SlackLens for the connected Slack user.

The dashboard reads a cache JSON in a **very specific shape**. Producing
the wrong shape silently empties the dashboard. Follow the schema in
Step 1 **exactly** — keys, nesting, and per-result fields.

## Overview — two modes

This skill picks one of two fetch modes each run:

- **FULL**: query the last 48 hours from scratch, ignore existing
  cache. Used when there is no cache yet, when the cache is >48h old,
  or when the user asks for a "force full / deep refresh". Safe
  baseline — expensive but always correct.
- **DELTA**: query only from `cache.refreshed_at` up to now, merge
  new results into the existing cache, purge items older than 48h.
  Used when the cache is fresh. Cheap — roughly one fifth the Slack
  API load of FULL for a 30-minute-old cache.

Mode is chosen in Step 0. The rest of the skill reads the chosen mode
from an env var and branches accordingly.

## Step 0 — Load config and decide mode

```bash
python3 - <<'PY'
import json, os
from datetime import datetime, timezone, timedelta

home = os.path.expanduser("~/.slacklens")
cfg_path = os.path.join(home, "config.json")
if not os.path.exists(cfg_path):
    raise SystemExit("ERROR: ~/.slacklens/config.json not found. "
                     "Run 'set up slack lens' first.")
cfg = json.load(open(cfg_path))

mode = "FULL"
since_epoch = 0.0   # float unix seconds; everything strictly before is dropped
after_date  = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")

force_full = bool(os.environ.get("SLACKLENS_FORCE_FULL"))

cache_path = os.path.join(home, "cache.json")
bak_path   = cache_path + ".bak"

# Try cache.json → cache.json.bak in order. Either succeeding is "fresh
# enough" to consider DELTA. Both failing → fall through to FULL.
restored = False
def _try_load(path):
    try:
        return json.load(open(path, encoding="utf-8"))
    except Exception:
        return None

old = None
if not force_full:
    for candidate in (cache_path, bak_path):
        if os.path.isfile(candidate):
            loaded = _try_load(candidate)
            if loaded is not None:
                old = loaded
                if candidate == bak_path:
                    restored = True
                break

if old is not None and not force_full:
    try:
        raw_ts = old.get("refreshed_at") or ""
        ts = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
        now = datetime.now(ts.tzinfo or timezone.utc)
        hrs = (now - ts).total_seconds() / 3600
        if hrs < 48:
            mode        = "DELTA"
            since_epoch = ts.timestamp()
            after_date  = ts.strftime("%Y-%m-%d")
    except Exception:
        mode = "FULL"

print("USER_ID=" + cfg["user"]["slack_id"])
print("USER_NAME=" + cfg["user"]["name"])
print("MODE=" + mode)
print("AFTER=" + after_date)
print("SINCE_EPOCH=" + repr(since_epoch))   # float, keep full precision
print("RESTORED_FROM_BACKUP=" + ("1" if restored else "0"))
if restored:
    print("NOTE: cache.json unreadable — using cache.json.bak as DELTA baseline")
if force_full and os.path.isfile(cache_path):
    print("NOTE: $SLACKLENS_FORCE_FULL set — forcing FULL mode")
PY
```

Read `MODE`, `AFTER`, `SINCE_EPOCH`, `USER_ID`, `USER_NAME` from the
output. Use them for Step 1.

If the user invoked this skill with "force full refresh", "deep
refresh", or similar wording, set the env var **before** the block
above runs: `SLACKLENS_FORCE_FULL=1`.

## Step 1 — Fetch Slack data

Run **three** Slack searches via `slack_search_public_and_private`:

| Bucket     | Query                                                                            | What it captures |
|------------|----------------------------------------------------------------------------------|------------------|
| `mentions` | `to:<@USER_ID> after:AFTER`                                                      | Messages addressed directly to the user |
| `dms`      | `from:<@USER_ID> after:AFTER channel_types:im,mpim`                              | The user's outgoing DMs |
| `channels` | `<@USER_ID> after:AFTER channel_types:public_channel,private_channel`            | @-mentions in channels |

### Mode-specific post-processing

- **FULL mode**: keep every result the search returned.
- **DELTA mode**: Slack's `after:` is date-granular, so the three
  searches will return everything from the start of `AFTER`'s date,
  not just since `SINCE_EPOCH`. Drop any result whose
  `float(message_ts) < SINCE_EPOCH`. This is a client-side filter —
  each result object carries `message_ts` as a string already.

### Threads

For every distinct `(channel_id, thread_ts)` pair across all three
(filtered) buckets, call `slack_read_thread` to fetch the full thread.
**Cap thread fetches at 50** in code (Step 2 enforces this defensively).

In DELTA mode this still re-fetches the full thread (not just new
replies) because:
- Slack's thread API is cheap relative to search.
- It's the simplest correct way to pick up edits and deletions inside
  an otherwise-cached thread.

### Required cache shape (the dashboard reads this exactly)

```json
{
  "refreshed_at": "<ISO timestamp>",
  "search_results": {
    "mentions": [
      {
        "query":   "to:<@U01EXAMPLE99> after:2026-04-19",
        "results": [
          {
            "channel_id":   "C01EXAMPLE00",
            "channel_name": "Group DM (Alice Example, Jane Doe, Bob Example)",
            "from_user":    "Alice Example (U01ALICE000)",
            "message_ts":   "1776757696.480349",
            "time":         "2026-04-21 13:18:16 IST",
            "permalink":    "https://example.slack.com/archives/C.../p...",
            "text":         "Hey, can you review this?"
          }
        ]
      }
    ],
    "dms":      [ { "query": "...", "results": [ ... ] } ],
    "channels": [ { "query": "...", "results": [ ... ] } ]
  },
  "threads": {
    "<channel_id>:<thread_ts>": {
      "channel_id":   "C01EXAMPLE00",
      "channel_name": "Group DM (...)",
      "thread_ts":    "1776757696.480349",
      "messages": [
        { "from": "Alice Example (U01ALICE000)",
          "ts":   "1776757696.480349",
          "time": "2026-04-21 13:18:16 IST",
          "text": "Hey, can you review this?",
          "permalink": "https://..." }
      ]
    }
  }
}
```

**Hard rules:**

- The three bucket keys are **`mentions`, `dms`, `channels`**. Not
  `dms_received`, not `outgoing_dms`. Wrong keys = empty dashboard.
- Each bucket value is an **array** of `{query, results, [note]}`
  objects. The dashboard sums `results.length` across the array.
- Per-result field names are **lowercase snake_case** as shown.
- Top-level keys are exactly `refreshed_at`, `search_results`, `threads`.

## Step 2 — Build the final cache (merge if DELTA, replace if FULL)

Write the in-memory dict you just built (the Step-1 payload — three
buckets + threads) to `/tmp/slacklens-refresh.json` using the **Write
tool** (not a bash heredoc — heredocs corrupt backslashes and can hit
`ARG_MAX` on busy workspaces).

Include the chosen MODE and the `RESTORED_FROM_BACKUP` flag from Step 0
in the dict's top-level metadata so the Step-2 Python block knows which
branch to take and can log correctly. Shape:

```json
{
  "_mode": "DELTA",
  "_restored_from_backup": false,
  "search_results": { "mentions": [...], "dms": [...], "channels": [...] },
  "threads": { ... }
}
```

(`_restored_from_backup` is `true` only when Step 0 had to fall back to
`cache.json.bak` because `cache.json` was unreadable. Defaults to `false`.)

Then run:

```bash
python3 - <<'PY'
import json, os, re
from datetime import datetime, timezone, timedelta

home = os.path.expanduser("~/.slacklens")
tmp  = "/tmp/slacklens-refresh.json"

with open(tmp, "r", encoding="utf-8") as f:
    delta = json.load(f)

mode = delta.pop("_mode", "FULL")
restored_from_backup = bool(delta.pop("_restored_from_backup", False))

# --- Validation on what we just fetched ---
if not isinstance(delta, dict):
    raise SystemExit("ERROR: data is not a dict")
sr = delta.get("search_results")
if not isinstance(sr, dict):
    raise SystemExit("ERROR: data['search_results'] missing or not a dict")
for key in ("mentions", "dms", "channels"):
    if key not in sr:
        raise SystemExit("ERROR: search_results['" + key + "'] missing")
    if not isinstance(sr[key], list):
        raise SystemExit("ERROR: search_results['" + key + "'] must be an "
                         "array of {query, results} objects")
threads_new = delta.get("threads", {})
if not isinstance(threads_new, dict):
    raise SystemExit("ERROR: data['threads'] must be an object")

# --- Tolerant per-result parsing ---
# If the Slack MCP returns a result dict missing a field (transient
# glitch, schema change), fill defaults instead of crashing the refresh.
# We count repairs into the refresh.log entry so doctor can surface
# "something upstream is flaky".
RESULT_DEFAULTS = {
    "channel_id":   "",
    "channel_name": "Unknown channel",
    "from_user":    "",
    "message_ts":   "0",
    "text":         "",
    "time":         "",
    "permalink":    "",
}
results_repaired = 0
for key in ("mentions", "dms", "channels"):
    for q in sr[key]:
        cleaned = []
        for r in (q.get("results") or []):
            if not isinstance(r, dict):
                results_repaired += 1
                continue   # drop non-dict garbage entirely
            for k, v in RESULT_DEFAULTS.items():
                if k not in r or r[k] is None:
                    r[k] = v
                    results_repaired += 1
            cleaned.append(r)
        q["results"] = cleaned

# --- Decide final shape: merge-with-old (DELTA) or use-as-is (FULL) ---
# Also: ALWAYS load prior cache metadata (even in FULL mode) so we can
# run suspicious-refresh detection below. That protects against the
# "flaky Slack returns 0, we wipe a good cache" failure mode.
cache_path = os.path.join(home, "cache.json")
bak_path   = cache_path + ".bak"

def _load_any(*paths):
    """First readable JSON from the list, or None."""
    for p in paths:
        if os.path.isfile(p):
            try:
                d = json.load(open(p, encoding="utf-8"))
                if isinstance(d, dict):
                    return d, p
            except Exception:
                continue
    return None, None

prior, prior_source = _load_any(cache_path, bak_path)

if mode == "DELTA" and prior is not None:
    old = prior
else:
    old = None

def merge_bucket(old_bucket, new_bucket):
    """Return a single-entry array whose results are dedup(old ∪ new) by permalink,
    preserving newest-first order."""
    seen = set()
    merged = []
    # Start with new results (they're freshest), then fill in old
    new_results = []
    for q in (new_bucket or []):
        for r in (q.get("results") or []):
            new_results.append(r)
    old_results = []
    for q in (old_bucket or []):
        for r in (q.get("results") or []):
            old_results.append(r)
    for r in new_results + old_results:
        key = r.get("permalink") or (r.get("channel_id", "") + ":" + r.get("message_ts", ""))
        if key in seen:
            continue
        seen.add(key)
        merged.append(r)
    # sort newest-first
    merged.sort(key=lambda r: float(r.get("message_ts") or 0), reverse=True)
    # Keep the query string from the new fetch if present
    query = ""
    if new_bucket and len(new_bucket) > 0:
        query = (new_bucket[0] or {}).get("query") or ""
    return [{"query": query, "results": merged}]

if old is not None:
    old_sr = old.get("search_results") or {}
    for key in ("mentions", "dms", "channels"):
        sr[key] = merge_bucket(old_sr.get(key), sr.get(key))
    # Threads: old ∪ new. Touched threads in `threads_new` replace
    # old entries wholesale (we just re-fetched them).
    merged_threads = {}
    for k, v in (old.get("threads") or {}).items():
        merged_threads[k] = v
    for k, v in threads_new.items():
        merged_threads[k] = v
    threads_new = merged_threads
    print("merged with old cache (DELTA mode)")

# --- Purge items older than 48h (sliding window) ---
now = datetime.now(timezone.utc)
cutoff = (now - timedelta(hours=48)).timestamp()

def within_window(r):
    try:
        return float(r.get("message_ts") or 0) >= cutoff
    except Exception:
        return False

before = sum(len(q.get("results", [])) for key in ("mentions", "dms", "channels") for q in sr[key])
for key in ("mentions", "dms", "channels"):
    for q in sr[key]:
        q["results"] = [r for r in (q.get("results") or []) if within_window(r)]
after_count = sum(len(q.get("results", [])) for key in ("mentions", "dms", "channels") for q in sr[key])
if before != after_count:
    print("purged " + str(before - after_count) + " search results older than 48h")

# Threads: keep only those whose newest message is within window.
def thread_newest_ts(t):
    try:
        msgs = t.get("messages") or []
        return max((float(m.get("ts") or 0) for m in msgs), default=0.0)
    except Exception:
        return 0.0

keep_threads = {k: v for k, v in threads_new.items() if thread_newest_ts(v) >= cutoff}
if len(keep_threads) != len(threads_new):
    print("purged " + str(len(threads_new) - len(keep_threads)) + " threads older than 48h")
threads_new = keep_threads

# --- Hard cap on threads: defensive ---
if len(threads_new) > 50:
    keys_sorted = sorted(threads_new, key=thread_newest_ts, reverse=True)
    threads_new = {k: threads_new[k] for k in keys_sorted[:50]}
    print("NOTE: capped threads at 50")

# --- Suspicious-refresh detection ---
# Flaky Slack / MCP can return 0 results when the user actually has data.
# A FULL refresh in that case would wipe yesterday's good triage state.
# Guard: if FULL returned nothing AND prior cache had items AND prior was
# fresh (<6h), keep the old cache, log outcome=suspicious, bail cleanly.
# DELTA is naturally safe (merge preserves old items) so we only check
# FULL here.
def _log_entry(entry):
    log_path = os.path.join(home, "refresh.log")
    try:
        existing = []
        if os.path.isfile(log_path):
            with open(log_path, "r", encoding="utf-8") as f:
                existing = [ln for ln in f.read().splitlines() if ln.strip()]
        existing.append(json.dumps(entry, ensure_ascii=False))
        existing = existing[-20:]
        with open(log_path, "w", encoding="utf-8") as f:
            f.write("\n".join(existing) + "\n")
    except OSError:
        pass

new_total = sum(len(q.get("results", [])) for key in ("mentions", "dms", "channels") for q in sr[key]) + len(threads_new)

if mode == "FULL" and new_total == 0 and prior is not None:
    prior_items = 0
    prior_sr = prior.get("search_results") or {}
    for key in ("mentions", "dms", "channels"):
        for q in prior_sr.get(key) or []:
            prior_items += len(q.get("results") or [])
    prior_items += len(prior.get("threads") or {})
    try:
        prior_ts = datetime.fromisoformat((prior.get("refreshed_at") or "").replace("Z", "+00:00"))
        prior_age_h = (datetime.now(prior_ts.tzinfo or timezone.utc) - prior_ts).total_seconds() / 3600
    except Exception:
        prior_age_h = 999.0
    if prior_items > 0 and prior_age_h < 6:
        print("SUSPICIOUS: FULL refresh returned 0 items but prior cache had "
              + str(prior_items) + " items only " + f"{prior_age_h:.1f}"
              + "h ago — keeping old cache untouched.")
        _log_entry({
            "at":            datetime.now().astimezone().isoformat(),
            "mode":          mode,
            "outcome":       "suspicious",
            "kept_old_cache": True,
            "new_total":      0,
            "prior_items":    prior_items,
            "prior_age_h":    round(prior_age_h, 2),
        })
        try:
            os.remove(tmp)
        except OSError:
            pass
        # Exit BEFORE assembling/writing anything. Old cache stays as-is.
        raise SystemExit(0)

# --- Assemble final data dict ---
# version = cache schema version. Dashboard + doctor read this to detect
# drift. Bump whenever we change bucket keys or per-result field names.
data = {
    "version": 1,
    "refreshed_at": datetime.now().astimezone().isoformat(),
    "mode": mode,
    "search_results": sr,
    "threads": threads_new,
}

# --- Dashboard template re-copy from plugin root (picks up UI updates) ---
# Do substitutions in memory and let the atomic-write stage below write
# the final text. Never clobber dashboard.html directly — a crash between
# template-copy and substitution would leave the user with an unsubstituted
# template (no identity, no VIPs).
dash_path = os.path.join(home, "dashboard.html")
plugin_root = os.environ.get("CLAUDE_PLUGIN_ROOT", "").strip()
if plugin_root:
    tmpl = os.path.join(plugin_root, "skills", "slacklens-refresh",
                        "references", "dashboard.template.html")
    if os.path.isfile(tmpl):
        h = open(tmpl, "r", encoding="utf-8").read()
        cfg = json.load(open(os.path.join(home, "config.json")))
        user = cfg["user"]
        priority = cfg.get("priority_people", [])
        vip_ids   = [p["id"]   for p in priority]
        vip_names = [p["name"] for p in priority]
        def _sub_checked(pattern, repl, text, label):
            new_text, count = re.subn(pattern, repl, text, count=1)
            if count == 0:
                raise SystemExit("ERROR: identity substitution failed for " + label)
            return new_text
        h = _sub_checked(r"const ME_ID\s*=\s*'[^']*'",
                         lambda _m: "const ME_ID = "   + json.dumps(user["slack_id"]), h, "ME_ID")
        h = _sub_checked(r"const ME_NAME\s*=\s*'[^']*'",
                         lambda _m: "const ME_NAME = " + json.dumps(user["name"]),     h, "ME_NAME")
        h = _sub_checked(r"const VIP_IDS\s*=\s*\[[^\]]*\]",
                         lambda _m: "const VIP_IDS = "   + json.dumps(vip_ids),   h, "VIP_IDS")
        h = _sub_checked(r"const VIP_NAMES\s*=\s*\[[^\]]*\]",
                         lambda _m: "const VIP_NAMES = " + json.dumps(vip_names), h, "VIP_NAMES")
        # `h` now holds a fully-substituted template in memory. Do NOT
        # write it to disk yet — the final atomic_write below handles that.
        html = h
    else:
        html = None
else:
    html = None

# If the template step didn't run (no $CLAUDE_PLUGIN_ROOT, or template
# missing), fall back to whatever's currently on disk. The cache-blob
# injection below still needs a dashboard.html to read from.
if html is None:
    if not os.path.isfile(dash_path):
        raise SystemExit("ERROR: dashboard.html missing and no template to re-copy from — run `set up slacklens`")
    with open(dash_path, "r", encoding="utf-8") as f:
        html = f.read()

# --- Cache-blob injection (operates on the in-memory `html` string) ---

new_json = json.dumps(data, ensure_ascii=False,
                      separators=(",", ":")).replace("</", "<\\/")
new_assignment = "window.__SLACK_CACHE__ = " + new_json + ";"

SENTINEL = "// __SLACK_CACHE_END__"
PATTERN = r"^window\.__SLACK_CACHE__\s*=\s*\{.*?\};(\s*\n\s*)" + re.escape(SENTINEL)
updated = re.sub(PATTERN,
    lambda _m: new_assignment + _m.group(1) + SENTINEL,
    html, count=1, flags=re.DOTALL | re.MULTILINE,
)
if updated == html:
    raise SystemExit("ERROR: cache marker + sentinel not found in dashboard.html")

m = re.search(r"^window\.__SLACK_CACHE__\s*=\s*(\{.*?\});(\s*\n\s*)" + re.escape(SENTINEL),
              updated, flags=re.DOTALL | re.MULTILINE)
if not m:
    raise SystemExit("ERROR: post-inject readback failed")
try:
    json.loads(m.group(1))
except Exception as e:
    raise SystemExit("ERROR: injected blob is not valid JSON: " + str(e))

# Atomic writes: write .new → fsync → os.replace. Before overwriting,
# move the current file to .bak so we keep one generation of history.
# POSIX os.replace is atomic — a crash mid-write leaves the OLD file
# untouched, and the next refresh's Step 0 falls back through the
# .bak chain if .json somehow ends up corrupted anyway.
def _atomic_write_text(path, text):
    new_path = path + ".new"
    with open(new_path, "w", encoding="utf-8") as f:
        f.write(text)
        f.flush()
        try:
            os.fsync(f.fileno())
        except OSError:
            pass
    if os.path.isfile(path):
        try:
            os.replace(path, path + ".bak")
        except OSError:
            pass
    os.replace(new_path, path)

_atomic_write_text(dash_path, updated)
_atomic_write_text(cache_path, json.dumps(data, ensure_ascii=False, indent=2))

m_count = sum(len(q.get("results", [])) for q in sr["mentions"])
d_count = sum(len(q.get("results", [])) for q in sr["dms"])
c_count = sum(len(q.get("results", [])) for q in sr["channels"])
print("mode=" + mode
      + ", refreshed_at=" + data["refreshed_at"]
      + ", threads=" + str(len(threads_new))
      + ", mentions=" + str(m_count)
      + ", dms=" + str(d_count)
      + ", channels=" + str(c_count))

# --- Refresh log (append-only, last 20 entries) ---
# Extended fields:
#   results_repaired    — count of per-result defaults we filled in due to
#                         malformed MCP payloads (0 on a clean refresh).
#   restored_from_backup — true if Step 0 had to fall back to cache.json.bak
#                          because cache.json was unreadable. Signals either
#                          a crashed prior refresh or external tampering.
_log_entry({
    "at":                   data["refreshed_at"],
    "mode":                 mode,
    "outcome":              "ok",
    "mentions":             m_count,
    "dms":                  d_count,
    "channels":             c_count,
    "threads":              len(threads_new),
    "results_repaired":     results_repaired,
    "restored_from_backup": restored_from_backup,
})

try:
    os.remove(tmp)
except OSError:
    pass
PY
```

## Step 3 — Also present in a side panel (optional)

If the Cowork MCP is connected, call its `present_files` tool with
the path `~/.slacklens/dashboard.html` so the dashboard also shows up
in the side panel. This is purely a UX polish — the primary surface
is the on-disk HTML file, which any browser (or panel-enabled runtime)
can render independently.

If `present_files` is unavailable in this session (most Claude Code
runtimes don't ship it, and scheduled-task invocations don't have a
panel at all), emit a one-line note and continue — do NOT treat it as
an error:

> Side-panel present_files not available in this session — dashboard
> is still on disk at `~/.slacklens/dashboard.html`; open it manually
> or reload an existing browser tab.

Then continue to Step 4.

## Step 4 — Report

Tell the user (one sentence). Tailor wording to mode:

**DELTA mode:**

> SlackLens refreshed (delta, since `<HH:MM>`) — `<N>` threads,
> `<M>` mentions, `<D>` DMs, `<C>` channel mentions. Say "deep
> refresh slacklens" if you suspect the cache has drifted.

**FULL mode:**

> SlackLens refreshed (full 48h) — `<N>` threads, `<M>` mentions,
> `<D>` DMs, `<C>` channel mentions. Last update `<HH:MM>`.
