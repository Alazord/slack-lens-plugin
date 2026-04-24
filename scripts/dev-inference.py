#!/usr/bin/env python3
"""Local dev runner for semantic task inference.

Usage:
  # Phase 1 — print the prompt payload Claude would receive for inference.
  #           Copy the payload into a Claude conversation, get back a JSON
  #           array, and paste it into /tmp/slacklens-inferences.json.
  scripts/dev-inference.py prompt > /tmp/slacklens-inference-prompt.txt

  # Phase 2 — validate the returned array and print one-per-thread report.
  scripts/dev-inference.py verify /tmp/slacklens-inferences.json

  # Either phase accepts --cache PATH (default: fixtures/cache.sample.json).
"""

import argparse
import json
import os
import sys

VALID_STATUSES = {"AWAITING_REPLY", "WAITING_ON_THEM", "DONE", "DISCUSSION", "FYI"}
MAX_MSGS_PER_THREAD = 20

SYSTEM_PROMPT = (
    "You are an inbox-triage assistant. The user has Slack threads where they\n"
    "may have been mentioned, direct-messaged, or are a participant. For each\n"
    "thread, decide what — if anything — the user needs to do.\n"
    "\n"
    "Output a JSON array with one object per thread in input order:\n"
    "  {\n"
    '    "actions": string[],           // 0-3 short imperatives for the user\n'
    '    "status":  "AWAITING_REPLY" | "WAITING_ON_THEM" | "DONE" | "DISCUSSION" | "FYI"\n'
    "  }\n"
    "\n"
    "Rules:\n"
    "- actions are phrased TO the user: \"Reply to X about Y\", \"Call Z\",\n"
    "  \"Review PR #123\", \"Confirm deployment time\", \"Nothing needed — already handled\".\n"
    "- Each action ≤80 characters. Maximum 3 per thread.\n"
    "- If the thread is resolved, actions can be empty OR [\"Nothing needed\"].\n"
    "- status reflects the latest state of the thread:\n"
    "  - AWAITING_REPLY: someone asked the user something unanswered.\n"
    "  - WAITING_ON_THEM: the user asked / is blocking on someone else.\n"
    "  - DONE: resolved, no further work.\n"
    "  - DISCUSSION: general discussion, not addressed at the user specifically.\n"
    "  - FYI: the user was CC'd or passively mentioned; no action implied.\n"
    "- Messages may mix English and Hinglish (Hindi in Latin script). Treat\n"
    "  both languages as equivalent when extracting intent.\n"
    "- Output ONLY valid JSON — no prose, no code fences."
)


def build_batch(cache, me_id, me_name, vips):
    """Return (prompt_text, ordered_thread_keys) for all threads in cache."""
    threads = cache.get("threads") or {}
    keys = list(threads.keys())
    batch = []
    for k in keys:
        t = threads[k]
        msgs = (t.get("messages") or [])[-MAX_MSGS_PER_THREAD:]
        batch.append({
            "thread_key": k,
            "channel": t.get("channel_name") or t.get("channel_id") or "?",
            "messages": [
                {"from": m.get("from") or "",
                 "ts": m.get("ts") or "",
                 "text": m.get("text") or ""}
                for m in msgs
            ],
        })
    vip_str = ", ".join(f"{v.get('name')} ({v.get('id')})" for v in vips) or "(none)"
    user_msg = (
        f"User identity: slack_id={me_id}, name={me_name}.\n"
        f"Priority contacts: {vip_str}.\n\n"
        f"Here are {len(batch)} threads. Produce an inference object per thread "
        f"in the same order. Output ONLY the JSON array.\n\n"
        + json.dumps(batch, ensure_ascii=False, indent=2)
    )
    prompt = "SYSTEM:\n" + SYSTEM_PROMPT + "\n\nUSER:\n" + user_msg
    return prompt, keys


def validate(arr, expected_keys):
    errors = []
    if not isinstance(arr, list):
        return ["not a list"]
    if len(arr) != len(expected_keys):
        errors.append(f"length mismatch: got {len(arr)}, expected {len(expected_keys)}")
    for i, elem in enumerate(arr):
        if not isinstance(elem, dict):
            errors.append(f"[{i}] not an object")
            continue
        actions = elem.get("actions")
        status = elem.get("status")
        if not isinstance(actions, list):
            errors.append(f"[{i}] actions not a list")
        else:
            if len(actions) > 3:
                errors.append(f"[{i}] actions length {len(actions)} > 3")
            for j, a in enumerate(actions):
                if not isinstance(a, str):
                    errors.append(f"[{i}].actions[{j}] not a string")
                elif len(a) > 80:
                    errors.append(f"[{i}].actions[{j}] > 80 chars ({len(a)})")
        if status not in VALID_STATUSES:
            errors.append(f"[{i}] status '{status}' not in {sorted(VALID_STATUSES)}")
    return errors


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["prompt", "verify"])
    ap.add_argument("payload", nargs="?", help="Path to inference JSON file (verify mode)")
    ap.add_argument("--cache", default="fixtures/cache.sample.json")
    ap.add_argument("--me-id", default="U0ME")
    ap.add_argument("--me-name", default="Test User")
    args = ap.parse_args()

    if not os.path.isfile(args.cache):
        sys.exit(f"ERROR: cache not found at {args.cache}")
    cache = json.load(open(args.cache, encoding="utf-8"))
    vips = [{"id": "U0VIP1", "name": "Alice VIP"}]

    prompt, keys = build_batch(cache, args.me_id, args.me_name, vips)

    if args.mode == "prompt":
        print(prompt)
        return

    if not args.payload:
        sys.exit("ERROR: verify mode needs a JSON payload path")
    if not os.path.isfile(args.payload):
        sys.exit(f"ERROR: payload not found at {args.payload}")
    try:
        arr = json.load(open(args.payload, encoding="utf-8"))
    except Exception as e:
        sys.exit(f"ERROR: payload JSON parse failed: {e}")

    errs = validate(arr, keys)
    if errs:
        print("VALIDATION ERRORS:")
        for e in errs:
            print(f"  - {e}")
        sys.exit(1)
    print(f"OK — {len(arr)} inferences validated against {len(keys)} threads.\n")
    for k, inf in zip(keys, arr):
        print(f"[{k}]")
        print(f"  status:  {inf['status']}")
        for a in inf["actions"]:
            print(f"  action:  {a}")
        print()


if __name__ == "__main__":
    main()
