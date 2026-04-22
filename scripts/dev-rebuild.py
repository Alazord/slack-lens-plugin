#!/usr/bin/env python3
"""Dev helper: rebuild the user's dashboard from the CURRENT template in this repo
plus the user's live cache and config, without hitting Slack.

Uses the same json.dumps + lambda-replacement pattern as slacklens-refresh
Step 2, so the output matches what the shipped skill would produce.
"""
import json, os, re, shutil, subprocess, sys
from datetime import datetime

HOME = os.path.expanduser("~/.slacklens")
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMPL = os.path.join(REPO, "skills", "slacklens-refresh",
                    "references", "dashboard.template.html")
DASH = os.path.join(HOME, "dashboard.html")

def die(msg):
    sys.stderr.write(f"ERROR: {msg}\n"); sys.exit(1)

for p in (TMPL, os.path.join(HOME, "config.json"), os.path.join(HOME, "cache.json")):
    if not os.path.isfile(p):
        die(f"missing {p}")

shutil.copy(TMPL, DASH)

cfg = json.load(open(os.path.join(HOME, "config.json")))
user = cfg["user"]
priority = cfg.get("priority_people", [])
vip_ids   = [p["id"]   for p in priority]
vip_names = [p["name"] for p in priority]

html = open(DASH, encoding="utf-8").read()
html = re.sub(r"const ME_ID\s*=\s*'[^']*'",
              lambda _m: "const ME_ID = "   + json.dumps(user["slack_id"]), html)
html = re.sub(r"const ME_NAME\s*=\s*'[^']*'",
              lambda _m: "const ME_NAME = " + json.dumps(user["name"]),     html)
html = re.sub(r"const VIP_IDS\s*=\s*\[[^\]]*\]",
              lambda _m: "const VIP_IDS = "   + json.dumps(vip_ids),   html)
html = re.sub(r"const VIP_NAMES\s*=\s*\[[^\]]*\]",
              lambda _m: "const VIP_NAMES = " + json.dumps(vip_names), html)

cache = json.load(open(os.path.join(HOME, "cache.json"), encoding="utf-8"))
cache["refreshed_at"] = datetime.now().isoformat()
new_json = json.dumps(cache, ensure_ascii=False,
                      separators=(",", ":")).replace("</", "<\\/")
new_assignment = "window.__SLACK_CACHE__ = " + new_json + ";"
html = re.sub(r"window\.__SLACK_CACHE__\s*=\s*\{.*?\};",
              lambda _m: new_assignment, html, count=1, flags=re.DOTALL)

open(DASH, "w", encoding="utf-8").write(html)

m = re.search(r"window\.__SLACK_CACHE__\s*=\s*(\{.*?\});", html, flags=re.DOTALL)
try:
    parsed = json.loads(m.group(1))
except Exception as e:
    die(f"rebuilt blob fails to parse: {e}")

print(f"dashboard rebuilt: {DASH}")
print(f"  identity: {user['name']} ({user['slack_id']})")
print(f"  vips: {vip_names}")
print(f"  threads: {len(parsed.get('threads', {}))}")
if "--open" in sys.argv:
    subprocess.run(["open", DASH])
