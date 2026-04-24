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

Run **three** Slack searches via `slack_search_public_and_private`.
**Pin `limit: 50` on every call.** Without an explicit limit, the MCP
picks its own default (typically 10-20), which silently drops results
on busy days. 50 is a conservative upper bound — covers ~2x the volume
a heavy user sees in 48 hours without risking rate-limit pressure on
Slack Enterprise plans.

Also pin `response_format: "concise"` and `include_context: false` on
each call — these strip the verbose per-result HTML/attachment blobs
Slack returns by default, keeping the payload inside token budget
without losing the fields we actually cache (channel_id, channel_name,
from_user, message_ts, text, time, permalink).

| Bucket     | Query                                                                            | What it captures |
|------------|----------------------------------------------------------------------------------|------------------|
| `mentions` | `to:<@USER_ID> after:AFTER`                                                      | Messages addressed directly to the user |
| `dms`      | `from:<@USER_ID> after:AFTER channel_types:im,mpim`                              | The user's outgoing DMs |
| `channels` | `<@USER_ID> after:AFTER channel_types:public_channel,private_channel`            | @-mentions in channels |

Each call: `query: <as above>, limit: 50, response_format: "concise", include_context: false`.

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

### Required cache shape (the dashboard reads this exactly — v2)

```json
{
  "version": 2,
  "refreshed_at": "<ISO timestamp>",
  "search_results": {
    "mentions": [
      {
        "query":   "to:<@U01EXAMPLE99> after:2026-04-19",
        "results": [
          {
            "channel_id":    "C01EXAMPLE00",
            "channel_name":  "Group DM (Alice Example, Jane Doe, Bob Example)",
            "from_user":     "Alice Example (U01ALICE000)",
            "from_user_id":  "U01ALICE000",
            "message_ts":    "1776757696.480349",
            "mentioned_ids": ["U01EXAMPLE99"],
            "time":          "2026-04-21 13:18:16 IST",
            "permalink":     "https://example.slack.com/archives/C.../p...",
            "text":          "Hey <@U01EXAMPLE99>, can you review this?"
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
      "reply_count":  3,
      "messages": [
        { "from":          "Alice Example (U01ALICE000)",
          "from_user_id":  "U01ALICE000",
          "ts":            "1776757696.480349",
          "mentioned_ids": ["U01EXAMPLE99"],
          "time":          "2026-04-21 13:18:16 IST",
          "text":          "Hey <@U01EXAMPLE99>, can you review this?",
          "permalink":     "https://..." }
      ]
    }
  }
}
```

Fields added in v2 (all populated by Step 2's enrichment block, not by
Step 1 — so Step 1 still builds the Slack payload the same as before):

- `from_user_id` — ID parsed out of `"Name (U0123)"` suffix. Empty
  string if Slack didn't return the ID-in-name format.
- `mentioned_ids` — list of IDs found in `<@U0123>` tokens inside `text`.
- `reply_count` — on each thread: number of replies beneath the parent.

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

# Token-cost instrumentation — the /tmp payload is everything the Slack
# MCP returned that the model had to consume into context. Size in bytes
# divided by 4 is a rough lower-bound token estimate (BPE averages
# ~3.5-4 chars/token for English). Feeds refresh.log so doctor can
# answer "how expensive is SlackLens per day". Rough but consistent,
# which is what we need for trend-spotting.
try:
    payload_bytes = os.path.getsize(tmp)
except OSError:
    payload_bytes = 0
tokens_est = payload_bytes // 4

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

# --- Schema v2 enrichment ---
# Derive structured fields from the string shapes Slack returns, so the
# dashboard doesn't have to regex-parse them on every render. Zero new
# API calls — pure re-shaping of what we already fetched.
#
#   from_user_id   — ID parsed out of "Alice Example (U01ALICE000)". Empty
#                    string if absent. Needed for tier scoring (isMe/isVIP)
#                    without relying on display-name common-name matches.
#   mentioned_ids  — list of IDs found in <@U0123> tokens inside text.
#                    Needed to detect "VIP tagged me" (P0) vs "VIP is
#                    just present" (P1).
#   reply_count    — derived per-thread as len(messages) - 1. Needed to
#                    distinguish "busy thread, 30 replies" from "dead
#                    message, no replies" on the render side.
USER_ID_RE = re.compile(r"\(([UC][A-Z0-9]+)\)\s*$")
MENTION_RE = re.compile(r"<@([UC][A-Z0-9]+)>")

def _extract_user_id(from_str):
    m = USER_ID_RE.search(from_str or "")
    return m.group(1) if m else ""

def _extract_mentions(text):
    return MENTION_RE.findall(text or "")

for key in ("mentions", "dms", "channels"):
    for q in sr[key]:
        for r in q.get("results") or []:
            r["from_user_id"]  = _extract_user_id(r.get("from_user"))
            r["mentioned_ids"] = _extract_mentions(r.get("text"))

for _k, t in threads_new.items():
    msgs = t.get("messages") or []
    for msg in msgs:
        msg["from_user_id"]  = _extract_user_id(msg.get("from"))
        msg["mentioned_ids"] = _extract_mentions(msg.get("text"))
    # Reply count = total messages - 1 (the parent). Floor at 0 in case
    # of an empty thread (shouldn't happen but be defensive).
    t["reply_count"] = max(0, len(msgs) - 1)

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

# --- DM / Group-DM conversation synthesis (v0.12.1) ---
# Slack DMs and group DMs are continuous conversations, not reply-threads.
# Each message carries its own `thread_ts == message_ts`, so naive cache
# shapes end up with N standalone items for one back-and-forth session.
# Fold all messages from the same DM channel into ONE synthetic thread
# keyed `<channel_id>:convo` so inference sees the whole context and the
# dashboard renders one card per DM conversation.
#
# Scope: 1:1 DMs (channel_id starts with "D") and group DMs (channel_name
# starts with "Group DM" / "DM (" / "DM with") regardless of ID prefix —
# some workspaces return C-prefixed IDs for MPIMs. Public/private channels
# keep per-thread behavior untouched.
def _is_dm_channel(channel_id, channel_name):
    if (channel_id or "").startswith("D"):
        return True
    n = (channel_name or "").lower()
    return (n.startswith("group dm")
            or n.startswith("dm (")
            or n.startswith("dm with"))

# Walk buckets, collect DM messages keyed by channel_id; also collect an
# ordered list of bucket-query indexes so we can delete the consumed
# results afterwards (we don't want them re-rendering as standalone cards).
dm_messages_by_channel = {}   # channel_id → {"channel_name": str, "msgs": [msg], "seen_links": set}
bucket_consumed = {"mentions": [], "dms": [], "channels": []}  # list of (qi, ri) to drop

for bucket_key in ("mentions", "dms", "channels"):
    for qi, q in enumerate(sr.get(bucket_key) or []):
        for ri, r in enumerate(q.get("results") or []):
            cid  = r.get("channel_id") or ""
            cname = r.get("channel_name") or ""
            if not _is_dm_channel(cid, cname):
                continue
            entry = dm_messages_by_channel.setdefault(cid, {
                "channel_name": cname,
                "msgs":         [],
                "seen_links":   set(),
            })
            # Dedupe across buckets by permalink (falls back to ts)
            link = r.get("permalink") or (cid + ":" + (r.get("message_ts") or ""))
            if link in entry["seen_links"]:
                bucket_consumed[bucket_key].append((qi, ri))
                continue
            entry["seen_links"].add(link)
            entry["msgs"].append({
                "from":          r.get("from_user") or "",
                "from_user_id":  r.get("from_user_id") or "",
                "ts":            r.get("message_ts") or "0",
                "mentioned_ids": r.get("mentioned_ids") or [],
                "time":          r.get("time") or "",
                "text":          r.get("text") or "",
                "permalink":     r.get("permalink") or "",
            })
            bucket_consumed[bucket_key].append((qi, ri))

# Fold any existing thread entries for these DM channels into the convo
# (both the thread parent and any replies fetched via slack_read_thread).
# After folding, drop the individual thread-keyed entry.
folded_thread_keys = []
for tkey, t in list(threads_new.items()):
    cid = t.get("channel_id") or ""
    cname = t.get("channel_name") or ""
    if not _is_dm_channel(cid, cname):
        continue
    entry = dm_messages_by_channel.setdefault(cid, {
        "channel_name": cname,
        "msgs":         [],
        "seen_links":   set(),
    })
    for m in t.get("messages") or []:
        link = m.get("permalink") or (cid + ":" + (m.get("ts") or ""))
        if link in entry["seen_links"]:
            continue
        entry["seen_links"].add(link)
        entry["msgs"].append(m)
    folded_thread_keys.append(tkey)

for tk in folded_thread_keys:
    threads_new.pop(tk, None)

# Synthesize one thread per DM channel
synthesized = 0
for cid, entry in dm_messages_by_channel.items():
    if not entry["msgs"]:
        continue
    # Sort chronologically so inference reads the back-and-forth in order.
    entry["msgs"].sort(key=lambda m: float(m.get("ts") or 0))
    synth_key = cid + ":convo"
    threads_new[synth_key] = {
        "channel_id":   cid,
        "channel_name": entry["channel_name"],
        "thread_ts":    "convo",   # sentinel — NOT a real Slack thread_ts
        "reply_count":  max(0, len(entry["msgs"]) - 1),
        "messages":     entry["msgs"],
    }
    synthesized += 1

# Drop consumed bucket results so the dashboard's search-bucket iteration
# doesn't re-render them as standalone cards alongside the convo thread.
# Delete in reverse index order within each query so ri stays valid.
for bucket_key, pairs in bucket_consumed.items():
    # Group by qi, then sort ri desc, then del
    by_q = {}
    for (qi, ri) in pairs:
        by_q.setdefault(qi, []).append(ri)
    for qi, ris in by_q.items():
        q = (sr.get(bucket_key) or [])[qi]
        for ri in sorted(set(ris), reverse=True):
            if 0 <= ri < len(q.get("results") or []):
                del q["results"][ri]

if synthesized:
    print("synthesized " + str(synthesized) + " DM/Group-DM conversation thread(s) "
          "from " + str(sum(len(p) for p in bucket_consumed.values()))
          + " search results + " + str(len(folded_thread_keys)) + " folded thread(s)")

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
            "payload_bytes":  payload_bytes,
            "tokens_est":     tokens_est,
        })
        try:
            os.remove(tmp)
        except OSError:
            pass
        # Exit BEFORE assembling/writing anything. Old cache stays as-is.
        raise SystemExit(0)

# --- Step 2.5a — Select threads needing semantic inference (v3) ---
# A thread needs re-inference iff it has no prior `inference` field OR
# its newest message.ts exceeds `inference.inferred_for_ts`. Threads
# whose latest message hasn't advanced reuse the prior inference — that
# cache hit is the whole reason inference cost stays flat run-to-run.
MAX_MSGS_PER_THREAD = 20
BATCH_SIZE          = 10

def _newest_ts(t):
    try:
        return max((float(m.get("ts") or 0) for m in (t.get("messages") or [])),
                   default=0.0)
    except Exception:
        return 0.0

to_infer = []   # list of (thread_key, compact_rep)
for k, t in threads_new.items():
    msgs = t.get("messages") or []
    if not msgs:
        continue
    newest = _newest_ts(t)
    prev = t.get("inference") or {}
    try:
        prev_for = float(prev.get("inferred_for_ts") or 0)
    except (TypeError, ValueError):
        prev_for = 0.0
    if prev and newest <= prev_for:
        continue   # cache hit — reuse existing inference
    trimmed = msgs[-MAX_MSGS_PER_THREAD:]
    to_infer.append((k, {
        "thread_key": k,
        "channel":    t.get("channel_name") or t.get("channel_id") or "?",
        "messages": [{"from": m.get("from") or "",
                      "ts":   m.get("ts") or "",
                      "text": m.get("text") or ""} for m in trimmed],
    }))

inference_run_count = len(to_infer)
inference_hit_count = len(threads_new) - inference_run_count

# --- Step 2.5b — Write batch files the model will read in Step 2.5 ---
# /tmp/slacklens-inference-batch-<n>.json contains:
#   { me_id, me_name, vips, threads: [...up to BATCH_SIZE...] }
# The model opens each, produces /tmp/slacklens-inference-result-<n>.json
# as a JSON array with one {actions, status} per thread in the same order.
cfg = json.load(open(os.path.join(home, "config.json")))
priority = cfg.get("priority_people", [])

batches = []   # [(batch_path, [thread_key, ...]), ...]
for i in range(0, len(to_infer), BATCH_SIZE):
    chunk = to_infer[i:i+BATCH_SIZE]
    batch_path = "/tmp/slacklens-inference-batch-" + str(i // BATCH_SIZE) + ".json"
    with open(batch_path, "w", encoding="utf-8") as f:
        json.dump({
            "me_id":   cfg["user"]["slack_id"],
            "me_name": cfg["user"]["name"],
            "vips":    [{"id": p["id"], "name": p["name"]} for p in priority],
            "threads": [rep for _, rep in chunk],
        }, f, ensure_ascii=False, indent=2)
    batches.append((batch_path, [k for k, _ in chunk]))

# --- Step 2.5c — Stage everything else Step 2.6 needs ---
# Step 2.6 runs in a separate Python block AFTER the model produces
# inference results. Persist enough state to pick up from here.
staged_path = "/tmp/slacklens-staged.json"
with open(staged_path, "w", encoding="utf-8") as f:
    json.dump({
        "mode":                 mode,
        "search_results":       sr,
        "threads":              threads_new,
        "batches":              batches,
        "payload_bytes":        payload_bytes,
        "tokens_est":           tokens_est,
        "results_repaired":     results_repaired,
        "restored_from_backup": restored_from_backup,
        "inference_run_count":  inference_run_count,
        "inference_hit_count":  inference_hit_count,
    }, f, ensure_ascii=False)

try:
    os.remove(tmp)
except OSError:
    pass

print("INFERENCE_BATCHES=" + str(len(batches)))
print("inference_run=" + str(inference_run_count)
      + ", inference_hits=" + str(inference_hit_count))
PY
```

## Step 2.5 — Semantic inference pass (v3, new)

The Step 2 Python block wrote one or more batch files to
`/tmp/slacklens-inference-batch-<n>.json`. **You (the model executing
this skill) now produce one `/tmp/slacklens-inference-result-<n>.json`
per batch**, following the rules below. No Slack API, no tools — this
is pure inference done in-session.

### For each batch file

1. Read `/tmp/slacklens-inference-batch-<n>.json`. It contains `me_id`,
   `me_name`, `vips` (priority contacts), and `threads` (array of
   `{thread_key, channel, messages}`).
2. For each element in `threads` (in order), produce one object:

   ```json
   {
     "actions": ["..."],
     "status":  "AWAITING_REPLY"
   }
   ```

3. Use the Write tool to save the **array** (same length as `threads`,
   same order) to `/tmp/slacklens-inference-result-<n>.json`. Output
   JSON only — no prose, no code fences.

### Inference rules

- **`actions`** — 0–3 short imperatives (each ≤80 chars) phrased TO the
  user. Good: `"Reply to Alice about the ingest-bug ETA"`,
  `"Confirm 3pm call with Eve on release plan"`, `"Review PR #412"`,
  `"Nothing needed — already handled"`. Bad: narration
  (`"User was asked a question"`), Slack-copy (`"<@U0ME> please review"`),
  or >3 items. Empty list OR `["Nothing needed"]` when the thread is
  fully resolved.
- **`status`** — exactly one of `"AWAITING_REPLY"`, `"WAITING_ON_THEM"`,
  `"DONE"`, `"DISCUSSION"`, `"FYI"`.
  - `AWAITING_REPLY` — someone asked the user something and the user
    hasn't substantively answered. A one-word ack like "ok" or "noted"
    does NOT count as answering a real ask — flag as AWAITING_REPLY.
  - `WAITING_ON_THEM` — the user asked, is blocked on someone else.
  - `DONE` — resolved.
  - `DISCUSSION` — general chat, user not specifically addressed.
  - `FYI` — user passively mentioned / CC'd, no action implied.
- Messages may mix English and Hinglish (Hindi in Latin script). Treat
  both as equivalent when extracting intent. Example: `"bhai kal wala
  PR review kar diya kya?"` = "did you review yesterday's PR?".
- Flag priority contacts in `actions` wording when relevant ("Reply to
  Alice VIP...") — helps the user scan the dashboard.
- Output an array whose length EXACTLY equals `len(threads)` in input
  order. If you can't infer a thread, still emit a placeholder:
  `{"actions": [], "status": "DISCUSSION"}` — the Python merge in Step
  2.6 validates and drops bad entries.

### If a batch looks malformed when read back

Re-read your own output. If it's not valid JSON or the array length is
wrong, regenerate it. If you hit a hard failure on a single thread,
emit `{"actions": [], "status": "DISCUSSION"}` for that slot and keep
going. Step 2.6 tolerates and logs per-element failures.

After every batch has a corresponding result file on disk, proceed to
Step 2.6.

## Step 2.6 — Merge inference + assemble + write cache (v3)

```bash
python3 - <<'PY'
import json, os, re
from datetime import datetime, timezone

home = os.path.expanduser("~/.slacklens")
staged_path = "/tmp/slacklens-staged.json"
if not os.path.isfile(staged_path):
    # Step 2 either crashed or early-exited (suspicious-refresh path).
    # Old cache.json stays untouched. Nothing for Step 2.6 to do.
    print("Step 2.6 skipped: no staged payload "
          "(Step 2 likely early-exited via suspicious-refresh guard — "
          "old cache is preserved)")
    raise SystemExit(0)

with open(staged_path, "r", encoding="utf-8") as f:
    staged = json.load(f)

mode                 = staged["mode"]
sr                   = staged["search_results"]
threads_new          = staged["threads"]
batches              = staged["batches"]
payload_bytes        = int(staged.get("payload_bytes") or 0)
tokens_est           = int(staged.get("tokens_est") or 0)
results_repaired     = int(staged.get("results_repaired") or 0)
restored_from_backup = bool(staged.get("restored_from_backup") or False)
inference_run_count  = int(staged.get("inference_run_count") or 0)
inference_hit_count  = int(staged.get("inference_hit_count") or 0)

VALID_STATUSES = {"AWAITING_REPLY", "WAITING_ON_THEM", "DONE", "DISCUSSION", "FYI"}

def _valid_elem(elem):
    if not isinstance(elem, dict):
        return False
    acts = elem.get("actions")
    if not isinstance(acts, list) or len(acts) > 3:
        return False
    if not all(isinstance(a, str) and len(a) <= 80 for a in acts):
        return False
    if elem.get("status") not in VALID_STATUSES:
        return False
    return True

now_iso = datetime.now(timezone.utc).astimezone().isoformat()
inference_failures = 0
inference_tokens_est = 0

# --- Merge inference results back onto threads_new ---
for idx, (batch_path, keys) in enumerate(batches):
    try:
        inference_tokens_est += os.path.getsize(batch_path) // 4
    except OSError:
        pass
    result_path = "/tmp/slacklens-inference-result-" + str(idx) + ".json"
    arr = None
    try:
        arr = json.load(open(result_path, encoding="utf-8"))
    except Exception:
        pass
    if not isinstance(arr, list) or len(arr) != len(keys):
        inference_failures += len(keys)
        print("INFERENCE BATCH " + str(idx) + " FAILED: expected "
              + str(len(keys)) + " elements, got "
              + str(type(arr).__name__) + "/"
              + (str(len(arr)) if isinstance(arr, list) else "?"))
        continue
    for k, elem in zip(keys, arr):
        if not _valid_elem(elem):
            inference_failures += 1
            continue
        t = threads_new.get(k)
        if not t:
            continue
        newest = 0.0
        try:
            newest = max((float(m.get("ts") or 0) for m in (t.get("messages") or [])),
                         default=0.0)
        except Exception:
            newest = 0.0
        actions = list(elem["actions"])
        status  = elem["status"]
        # needs_action: has actions AND not a resolved state AND not a
        # "Nothing needed" soft-ack.
        soft_noop = (len(actions) == 1
                     and actions[0].strip().lower().startswith("nothing"))
        needs_action = (len(actions) > 0
                        and status not in ("DONE", "FYI")
                        and not soft_noop)
        t["inference"] = {
            "actions":         actions,
            "status":          status,
            "needs_action":    needs_action,
            "inferred_at":     now_iso,
            "inferred_for_ts": repr(newest),
        }

# Cleanup /tmp payloads (batch + result files + staged)
for idx, (batch_path, _) in enumerate(batches):
    for p in (batch_path, "/tmp/slacklens-inference-result-" + str(idx) + ".json"):
        try:
            os.remove(p)
        except OSError:
            pass
try:
    os.remove(staged_path)
except OSError:
    pass

# --- Assemble final data dict (v3) ---
# version = cache schema version. Dashboard + doctor read this to detect
# drift. Bump whenever we change bucket keys or per-result field names.
#
#   v1: mentions/dms/channels buckets + threads dict; string from_user.
#   v2: adds from_user_id, mentioned_ids per result + per thread message,
#       and reply_count per thread.
#   v3: adds per-thread `inference` {actions, status, needs_action,
#       inferred_at, inferred_for_ts}. Dashboard renders inference.actions[0]
#       as the card conclusion; falls back to regex inferStatus + last_text
#       preview when absent (pre-v3 caches).
data = {
    "version": 3,
    "refreshed_at": datetime.now().astimezone().isoformat(),
    "mode": mode,
    "search_results": sr,
    "threads": threads_new,
}

cache_path = os.path.join(home, "cache.json")
dash_path  = os.path.join(home, "dashboard.html")

# --- Dashboard template re-copy from plugin root (picks up UI updates) ---
cfg = json.load(open(os.path.join(home, "config.json")))
plugin_root = os.environ.get("CLAUDE_PLUGIN_ROOT", "").strip()
html = None
if plugin_root:
    tmpl = os.path.join(plugin_root, "skills", "slacklens-refresh",
                        "references", "dashboard.template.html")
    if os.path.isfile(tmpl):
        h = open(tmpl, "r", encoding="utf-8").read()
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
        html = h
if html is None:
    if not os.path.isfile(dash_path):
        raise SystemExit("ERROR: dashboard.html missing and no template to re-copy from — run `set up slacklens`")
    with open(dash_path, "r", encoding="utf-8") as f:
        html = f.read()

# --- Cache-blob injection ---
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

# --- Atomic writes ---
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
      + ", channels=" + str(c_count)
      + ", inference_run=" + str(inference_run_count)
      + ", inference_hits=" + str(inference_hit_count)
      + ", inference_failures=" + str(inference_failures))

# --- Refresh log (append-only, last 20 entries) ---
# New v3 fields:
#   inference_run        — number of threads we sent to Claude this run.
#   inference_hits       — threads reused from cache (no re-inference).
#   inference_failures   — per-element failures (bad JSON / bad schema).
#   inference_tokens_est — payload bytes / 4, same heuristic as tokens_est.
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

_log_entry({
    "at":                    data["refreshed_at"],
    "mode":                  mode,
    "outcome":               "ok",
    "mentions":              m_count,
    "dms":                   d_count,
    "channels":              c_count,
    "threads":               len(threads_new),
    "results_repaired":      results_repaired,
    "restored_from_backup":  restored_from_backup,
    "payload_bytes":         payload_bytes,
    "tokens_est":            tokens_est,
    "inference_run":         inference_run_count,
    "inference_hits":        inference_hit_count,
    "inference_failures":    inference_failures,
    "inference_tokens_est":  inference_tokens_est,
})
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
