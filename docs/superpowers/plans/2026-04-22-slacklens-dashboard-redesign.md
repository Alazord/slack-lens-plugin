# SlackLens Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved redesign from `docs/superpowers/specs/2026-04-22-slacklens-dashboard-redesign-design.md` — channel-grouped layout, VIP float, Editorial-calm aesthetic with light + warm-night-dark palettes, density toggle, side-panel redesign, and a fix for the pre-existing side-panel wiring bug.

**Architecture:** Single-file HTML template (`skills/slacklens-refresh/references/dashboard.template.html`) with embedded `<style>` and `<script>`. The plan restructures the template in place without splitting into external files — the refresh skill's cache-injection contract requires the template to stay self-contained and load under `file://`. CSS tokens drive both theme and density via `[data-theme]` / `[data-density]` attributes on `<html>`. All render logic stays in vanilla JS; no build step.

**Tech Stack:** HTML5, CSS custom properties (`:root` variables), vanilla ES2020 JavaScript. System fonts only. Python 3 (for the dev rebuild helper). Node.js (for `node --check` on extracted JS).

---

## Before you start

1. **The v0.2.0 bug-fix commits are still uncommitted in your working tree** (`marketplace.json`, `plugin.json`, `README.md`, `.gitignore`, `setup/SKILL.md`, `refresh/SKILL.md`, template). Commit those as their own commit before starting this redesign so the redesign's history is clean. Suggested:
   ```bash
   git add .claude-plugin/ README.md .gitignore \
           skills/slacklens-refresh/SKILL.md \
           skills/slacklens-refresh/references/dashboard.template.html \
           skills/slacklens-setup/SKILL.md
   git commit -m "v0.2.0: fix re.sub bug, 2h→8h refresh, privacy scrub"
   ```

2. **The spec is the contract.** Every task references a spec section. If a task contradicts the spec, the spec wins — pause and ask.

3. **Testing approach.** This is a visual refactor of a single-file template with no pre-existing test framework. Each task uses a **change → verify → commit** loop:
   - Write the change
   - `node --check` on the extracted `<script>` block when JS was modified (see helper below)
   - Rebuild the user's live dashboard via the provided Python helper so you can eyeball the result
   - Open `~/.slacklens/dashboard.html` in the browser; verify specific observable behavior listed in the task
   - Commit with a focused message
   This trades automated TDD ceremony for fast visual iteration on a personal-scale tool.

4. **Dev helpers.** Add these to your shell for the session (or run inline):

   ```bash
   # JS syntax check on the template
   alias sl-check='python3 -c "import re,sys; h=open(\"skills/slacklens-refresh/references/dashboard.template.html\").read(); import tempfile,os,subprocess; fd,p=tempfile.mkstemp(suffix=\".js\"); os.close(fd); open(p,\"w\").write(\"\n\".join(re.findall(r\"<script[^>]*>(.*?)</script>\", h, re.DOTALL))); r=subprocess.run([\"node\",\"--check\",p]); os.remove(p); sys.exit(r.returncode)"'

   # Rebuild the live dashboard from current template + live cache + live config
   # (same logic as refresh SKILL.md Step 2, but uses the template from the repo)
   alias sl-rebuild='python3 scripts/dev-rebuild.py'
   ```

   Task 0 creates `scripts/dev-rebuild.py`. The `sl-rebuild` alias uses it.

5. **Branch.** All work on `main` in the main checkout (single-maintainer repo, no worktree needed).

---

## File structure

Files touched by this plan:

| File | Action | Lines (current) | Responsibility |
|---|---|---|---|
| `skills/slacklens-refresh/references/dashboard.template.html` | Modify in place | 1091 | All visual + interaction logic |
| `scripts/dev-rebuild.py` | **Create** | — | Dev helper: rebuild live dashboard from current template |
| `.claude-plugin/plugin.json` | Modify | 16 | Version bump 0.2.0 → 0.3.0 at end |
| `.claude-plugin/marketplace.json` | Modify | 16 | Version bump to match |

**Why no external CSS/JS files**: the refresh skill's Step-2 Python block does a regex replace to inject the cache blob into the template. Splitting into multiple files breaks that contract and requires deeper surgery on the refresh/setup skills. Single-file stays consistent with the plugin's zero-dependency `file://` design.

**Inside the template, the JS section will be reorganized into clearly-labeled sub-sections** (tokens, state, normalization, render, interactions, boot) via block comments. No code movement in Task 1; reorganization happens incrementally across tasks 3–13.

---

## Task 0: Dev rebuild helper

**Files:**
- Create: `scripts/dev-rebuild.py`

**Context:** Running the full `slacklens-refresh` skill during iteration would re-hit Slack's API each time. This helper reuses the latest on-disk cache, re-copies the template, re-injects identity + cache, and opens the dashboard. Runs in < 1s.

- [ ] **Step 1: Create the dev rebuild helper**

```python
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
```

- [ ] **Step 2: Make it executable and run a baseline rebuild**

```bash
chmod +x scripts/dev-rebuild.py
python3 scripts/dev-rebuild.py --open
```

Expected output: `dashboard rebuilt: /Users/.../dashboard.html` with identity, VIPs, and thread count printed, then the dashboard opens in the browser. This is your current-state baseline — the *pre-redesign* dashboard, correctly rendering with v0.2.0 fixes.

- [ ] **Step 3: Commit**

```bash
git add scripts/dev-rebuild.py
git commit -m "dev: add dev-rebuild helper for iteration on dashboard template"
```

---

## Task 1: CSS token system (light + dark palettes, three densities)

**Files:**
- Modify: `skills/slacklens-refresh/references/dashboard.template.html:7-390` (replace `<style>` section top)

**Context:** Add the full design token system as CSS custom properties before changing any components. Tokens exist but nothing binds to them yet — the existing dashboard keeps rendering unchanged. This de-risks the rest of the plan by locking the token vocabulary up front.

Spec references: Section 1 (typography), Section 2 (spacing tokens + density deltas), Section 3 color palette table.

- [ ] **Step 1: Prepend the token block at the top of `<style>`**

Insert immediately after line 7 (`<style>`), before any existing rules:

```css
/* ========================================================================
   Design tokens — applied via :root (light default) + data-theme="dark"
   Densities via data-density="compact|balanced|spacious" (default balanced)
   See docs/superpowers/specs/2026-04-22-slacklens-dashboard-redesign-design.md
   ======================================================================== */
:root {
  /* Typography families */
  --font-serif: "Iowan Old Style", "Palatino", "Hoefler Text", Georgia, serif;
  --font-sans:  -apple-system, BlinkMacSystemFont, "Inter", "SF Pro Text", "Segoe UI", Roboto, sans-serif;
  --font-mono:  "SF Mono", "IBM Plex Mono", "JetBrains Mono", Menlo, Consolas, monospace;

  /* Font sizes — Balanced defaults; overridden per density below */
  --fs-xs: 11px;
  --fs-sm: 12px;
  --fs-base: 13px;
  --fs-md: 14px;
  --fs-lg: 16px;

  /* Spacing tokens — Balanced defaults; overridden per density below */
  --item-py: 6px;
  --item-gap: 4px;
  --channel-mb: 16px;
  --col-gap: 20px;
  --frame-pad: 24px;
  --chanhead-py: 6px;

  /* Colors — light theme (default) */
  --surface: #faf9f4;
  --surface-2: #fefdf8;
  --border: #e8e5d9;
  --border-faint: #eeeadd;
  --ink: #2a2822;
  --ink-muted: #5a5648;
  --ink-faint: #908b78;
  --vip-red: #b64535;
  --status-red: #b64535;
  --status-amber: #b8821f;
  --status-gray: #d6d0bd;
  --status-green: #5a7f5a;

  /* Misc */
  --stale-cache-hours: 12;  /* freshness meta turns amber past this */
  --transition-theme: 150ms ease;
}

:root[data-density="compact"] {
  --fs-xs: 10px;  --fs-sm: 11px;  --fs-base: 12px;  --fs-md: 13px;  --fs-lg: 15px;
  --item-py: 4px;  --item-gap: 2px;  --channel-mb: 12px;
  --col-gap: 16px;  --frame-pad: 20px;  --chanhead-py: 4px;
}
:root[data-density="spacious"] {
  --fs-xs: 12px;  --fs-sm: 13px;  --fs-base: 14px;  --fs-md: 15px;  --fs-lg: 17px;
  --item-py: 10px;  --item-gap: 6px;  --channel-mb: 24px;
  --col-gap: 24px;  --frame-pad: 32px;  --chanhead-py: 8px;
}

:root[data-theme="dark"] {
  --surface: #1a1814;
  --surface-2: #22201b;
  --border: #2e2b24;
  --border-faint: #262420;
  --ink: #ede8d6;
  --ink-muted: #b0a991;
  --ink-faint: #8a8270;
  --vip-red: #e87b68;
  --status-red: #e87b68;
  --status-amber: #d4a33a;
  --status-gray: #4a4539;
  --status-green: #7ea97e;
}

/* Follow OS default when no explicit theme is set */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --surface: #1a1814; --surface-2: #22201b; --border: #2e2b24; --border-faint: #262420;
    --ink: #ede8d6; --ink-muted: #b0a991; --ink-faint: #8a8270;
    --vip-red: #e87b68; --status-red: #e87b68; --status-amber: #d4a33a;
    --status-gray: #4a4539; --status-green: #7ea97e;
  }
}
```

- [ ] **Step 2: Verify the existing dashboard still renders unchanged**

```bash
python3 scripts/dev-rebuild.py --open
```

Expected: dashboard looks **identical** to baseline — existing styles are still in force; tokens are declared but unused. Open DevTools and run:

```js
getComputedStyle(document.documentElement).getPropertyValue('--fs-base')
// → " 13px"

document.documentElement.setAttribute('data-theme', 'dark');
getComputedStyle(document.documentElement).getPropertyValue('--surface')
// → " #1a1814"

document.documentElement.setAttribute('data-density', 'compact');
getComputedStyle(document.documentElement).getPropertyValue('--fs-base')
// → " 12px"

document.documentElement.removeAttribute('data-theme');
document.documentElement.removeAttribute('data-density');
```

All four property reads must return the expected values. This proves the token system is wired.

- [ ] **Step 3: Verify no JS regression**

```bash
sl-check  # or the one-liner from the "Before you start" section
```

Expected: exits 0. No console errors in the browser.

- [ ] **Step 4: Commit**

```bash
git add skills/slacklens-refresh/references/dashboard.template.html
git commit -m "dashboard: add design token system (light/dark × compact/balanced/spacious)"
```

---

## Task 2: Markup restructure + side-panel wiring bug fix

**Files:**
- Modify: `skills/slacklens-refresh/references/dashboard.template.html:393-468` (body markup), `:1030-1060` (side-panel wiring)

**Context:** Replace the current header/two-column/panel markup with the new skeleton. **Fix the pre-existing wiring bug** by moving the `<div id="sidePanel">` markup above the `<script>` block so listeners attach to real DOM nodes at parse time (spec Section 5 — Side panel).

The existing CSS is still in force, so the page will look wrong — that's expected. Task 5 and onwards apply the new styles.

- [ ] **Step 1: Replace the body region (lines 393–468) with the new skeleton**

Find the current `<body>` through the footer. Replace with:

```html
<body>
  <!-- Topbar: wordmark · freshness · theme toggle · reload -->
  <header class="sl-topbar">
    <div class="sl-brand">SlackLens</div>
    <div class="sl-topbar-right">
      <div id="freshness" class="sl-fresh">0 · loading…</div>
      <button id="themeToggle" class="sl-iconbtn" type="button" aria-label="Toggle theme">☾</button>
      <button id="reloadBtn" class="sl-reload" type="button">↻ Reload</button>
    </div>
  </header>

  <!-- Toolbar: category filters · status filters · search · density · snoozed -->
  <nav class="sl-toolbar" aria-label="Filters and controls">
    <div class="sl-pills" id="categoryPills" role="radiogroup" aria-label="Category filter">
      <button class="sl-pill active" data-scope="all"         type="button">All <span class="count">0</span></button>
      <button class="sl-pill"        data-scope="needs_reply" type="button">Needs reply <span class="count">0</span></button>
      <button class="sl-pill"        data-scope="mentions"    type="button">Mentions <span class="count">0</span></button>
      <button class="sl-pill"        data-scope="dms"         type="button">DMs <span class="count">0</span></button>
      <button class="sl-pill"        data-scope="channels"    type="button">Channels <span class="count">0</span></button>
    </div>
    <div class="sl-divider"></div>
    <div class="sl-pills" id="statusPills" aria-label="Status filter">
      <button class="sl-pill" data-status="BACKLOG"     type="button">Backlog</button>
      <button class="sl-pill" data-status="IN PROGRESS" type="button">In progress</button>
      <button class="sl-pill" data-status="WAITING"     type="button">Waiting</button>
      <button class="sl-pill" data-status="DONE"        type="button">Done</button>
    </div>
    <div class="sl-divider"></div>
    <label class="sl-search">
      <span class="icon" aria-hidden="true">⌕</span>
      <input id="searchInput" type="text" placeholder="Search channel, person, text…" />
    </label>
    <div class="sl-density" role="radiogroup" aria-label="Density">
      <button class="sl-density-btn" data-density="compact"  type="button">Compact</button>
      <button class="sl-density-btn active" data-density="balanced" type="button">Balanced</button>
      <button class="sl-density-btn" data-density="spacious" type="button">Spacious</button>
    </div>
    <label class="sl-switch" id="showSnoozedLabel">
      <input id="showSnoozed" type="checkbox" />
      <span class="track"></span>
      <span class="label">Show snoozed</span>
    </label>
  </nav>

  <!-- Banner: stale cache / schema mismatch / fetch-failed -->
  <div id="banner" class="sl-banner" hidden></div>

  <!-- Channel flow: all channel groups render here, VIPs floated first -->
  <main id="channelFlow" class="sl-flow" aria-label="Channels"></main>

  <!-- Empty state container (shown when nothing renders) -->
  <div id="emptyState" class="sl-empty" hidden></div>

  <footer class="sl-footer">
    <span>Cowork live artifact · data: <code>~/.slacklens/cache.json</code></span>
  </footer>

  <!-- Side panel (BELOW all interactive content, ABOVE the <script>) -->
  <aside id="sidePanel" class="sl-panel" hidden aria-label="Thread detail">
    <div class="sl-panel-head">
      <div class="sl-panel-title">
        <span id="panelChannel"></span>
        <span id="panelVip" class="sl-vip" hidden>VIP</span>
      </div>
      <button id="panelClose" class="sl-iconbtn" type="button" aria-label="Close panel">✕</button>
    </div>
    <div class="sl-panel-meta">
      <div><span class="k">Channel</span><span id="panelChannelType"></span></div>
      <div><span class="k">Status</span><span id="panelStatus"></span></div>
    </div>
    <div class="sl-panel-actions">
      <button id="actStatus"  class="sl-btn" type="button">◐ Status ▾</button>
      <button id="actSnooze"  class="sl-btn" type="button">☾ Snooze ▾</button>
      <button id="actDone"    class="sl-btn" type="button">✓ Mark done</button>
      <button id="actOpen"    class="sl-btn primary" type="button">↗ Open in Slack</button>
      <button id="actCopy"    class="sl-btn" type="button">⎘ Copy permalink</button>
    </div>
    <div id="panelThread" class="sl-panel-thread"></div>
    <div class="sl-panel-note">
      <div class="sl-note-label">Note</div>
      <textarea id="panelNote" placeholder="Add a private note about this thread (saved locally)"></textarea>
    </div>
  </aside>
  <div id="panelBackdrop" class="sl-panel-backdrop" hidden></div>
```

- [ ] **Step 2: In the `<script>` block (starting at line 469), delete any `document.getElementById('sidePanel…')` wiring that used the OLD side panel ids and expect us to rewrite it in Task 10.**

Search for references to the old ids (`sidePanelClose`, `sidePanelBackdrop`, `addonStatus`, `addonSnooze`, `addonReset`) in the JS block and delete them. They'd throw `null.addEventListener` otherwise.

Leave all the other JS (cache loading, normalize, render for the old markup) in place — those call `document.getElementById('replyList')` etc., which no longer exist, so you'll get runtime errors when the page loads. That's expected; Task 3 replaces that render logic.

- [ ] **Step 3: Temporarily stub the render path so the page loads without throwing**

Find `function render()` in the JS block and replace its body with:

```javascript
function render() {
  // Stubbed during redesign — Task 3 replaces this.
  const flow = document.getElementById('channelFlow');
  if (flow) flow.textContent = 'Render pending — Task 3 wiring';
  const f = document.getElementById('freshness');
  if (f && raw && raw.refreshed_at) f.textContent = raw.refreshed_at;
}
```

This keeps the page from console-erroring while we wire up the rest.

- [ ] **Step 4: Verify JS parses + page loads without thrown errors**

```bash
sl-check      # must exit 0
python3 scripts/dev-rebuild.py --open
```

Expected: unstyled but non-crashing page. DevTools console clean (no red). Text "Render pending — Task 3 wiring" visible inside `#channelFlow`.

- [ ] **Step 5: Commit**

```bash
git add skills/slacklens-refresh/references/dashboard.template.html
git commit -m "dashboard: restructure markup skeleton; fix side-panel wiring bug (markup above script)"
```

---

## Task 3: Channel grouping + VIP float in normalize/render

**Files:**
- Modify: `skills/slacklens-refresh/references/dashboard.template.html` (JS block, `normalize()` and `render()` functions)

**Context:** Implement the channel-grouped layout. Items partitioned by `channel_id`, sorted newest-first within each channel; channels partitioned into `vipChannels` and `otherChannels`; VIPs rendered first. Still no final styles — the structure just needs to be correct.

Spec references: Section 2 (VIP float), Section 3 (channel header anatomy).

- [ ] **Step 1: Replace the body of `normalize()` to produce a flat `items` list keyed by channel**

The existing `normalize()` already produces `items[]` with `channel_id`, `channel_name`, `last_from`, `last_is_me`, `last_text`, `last_time`, etc. Keep all that — it's still correct. Just make sure it also attaches `channel_key`:

```javascript
// Inside normalize(), after items.push({...}) call sites, before the final sort:
items.forEach(it => {
  it.channel_key = it.channel_id;  // use ID as stable group key
  it.channel_is_vip = threadHasVIP(it);
});

// Replace the final sort with: sort by time desc (channel ordering happens in render)
items.sort((a, b) => (b.last_time || '').localeCompare(a.last_time || ''));
```

- [ ] **Step 2: Add a `partitionByChannel()` helper**

Before `render()`, add:

```javascript
// Group items by channel_id. Returns an array of channel objects ordered:
//   1. VIP channels (any item is_vip) — latest-activity first among VIPs
//   2. Non-VIP channels — latest-activity first
// Each channel: { key, name, display, is_vip, last_time, items: [...] }
function partitionByChannel(flatItems) {
  const byKey = new Map();
  for (const it of flatItems) {
    if (!byKey.has(it.channel_key)) {
      byKey.set(it.channel_key, {
        key: it.channel_key,
        name: it.channel_name || it.channel_id,
        display: it.channel_display || it.channel_name || it.channel_id,
        is_vip: false,
        last_time: '',
        items: [],
      });
    }
    const ch = byKey.get(it.channel_key);
    ch.items.push(it);
    if (it.channel_is_vip) ch.is_vip = true;
    if ((it.last_time || '') > ch.last_time) ch.last_time = it.last_time;
  }
  const all = Array.from(byKey.values());
  // items already sorted newest-first in normalize(); preserve that inside each channel.
  const vip   = all.filter(c =>  c.is_vip).sort((a, b) => b.last_time.localeCompare(a.last_time));
  const other = all.filter(c => !c.is_vip).sort((a, b) => b.last_time.localeCompare(a.last_time));
  return vip.concat(other);
}
```

- [ ] **Step 3: Rewrite `render()` to use the partitioned channels**

Replace the stubbed `render()` with:

```javascript
function render() {
  const flow = document.getElementById('channelFlow');
  const empty = document.getElementById('emptyState');
  if (!flow) return;
  flow.innerHTML = '';

  const shown = applyFilter(items);  // applyFilter defined in Task 9; for now assume identity
  const channels = partitionByChannel(shown);

  if (channels.length === 0) {
    empty.hidden = false;
    empty.innerHTML = '<h4>Nothing in the last 48 hours</h4><p>Catch your breath.</p>';
    return;
  }
  empty.hidden = true;

  for (const ch of channels) {
    flow.appendChild(renderChannel(ch));
  }

  updateCounts(shown);
  updateFreshness();
}

function renderChannel(ch) {
  const wrap = document.createElement('section');
  wrap.className = 'sl-channel';
  wrap.dataset.vip = ch.is_vip ? '1' : '0';

  const head = document.createElement('header');
  head.className = 'sl-channel-head';
  const name = document.createElement('div');
  name.className = 'sl-channel-name';
  name.textContent = ch.display;
  if (ch.is_vip) {
    const vip = document.createElement('span');
    vip.className = 'sl-vip';
    vip.textContent = 'VIP';
    name.appendChild(vip);
  }
  head.appendChild(name);

  const meta = document.createElement('div');
  meta.className = 'sl-channel-meta';
  const shortTime = (ch.last_time || '').slice(11, 16);  // "HH:MM" from "YYYY-MM-DD HH:MM:SS ..."
  meta.textContent = ch.items.length > 1
    ? `${shortTime} · ${ch.items.length}`
    : shortTime;
  head.appendChild(meta);

  wrap.appendChild(head);
  for (const it of ch.items) wrap.appendChild(renderItem(it));
  return wrap;
}
```

- [ ] **Step 4: Stub `renderItem`, `applyFilter`, `updateCounts`, `updateFreshness`**

They'll be completed in later tasks. For now, stub so the render path runs:

```javascript
function renderItem(it) {
  const row = document.createElement('article');
  row.className = 'sl-item';
  row.dataset.key = it.key;
  row.dataset.status = (effectiveItem(it).status || 'AWAITING YOUR REPLY').toUpperCase();

  const bar = document.createElement('div');
  bar.className = 'sl-item-bar';
  row.appendChild(bar);

  const body = document.createElement('div');
  body.className = 'sl-item-body';
  const head = document.createElement('div');
  head.className = 'sl-item-head';
  const from = document.createElement('span');
  from.className = 'sl-item-from';
  from.textContent = cleanName(it.last_from || '');
  const time = document.createElement('span');
  time.className = 'sl-item-time';
  time.textContent = (it.last_time || '').slice(11, 16);
  head.appendChild(from); head.appendChild(time);
  body.appendChild(head);

  const msg = document.createElement('div');
  msg.className = 'sl-item-msg';
  msg.textContent = it.last_text || '';
  body.appendChild(msg);

  if (it.msg_count > 1 && it.participants && it.participants.length > 1) {
    const others = it.participants.filter(p => !isMe(p));
    if (others.length) {
      const thread = document.createElement('div');
      thread.className = 'sl-item-thread';
      const preview = others.slice(0, 2).join(', ');
      const extra = others.length > 2 ? ` +${others.length - 2}` : '';
      thread.textContent = `${it.msg_count} msgs · ${preview}${extra}`;
      body.appendChild(thread);
    }
  }
  row.appendChild(body);
  return row;
}

function applyFilter(xs) { return xs; }  // Task 9 implements
function updateCounts() {}                // Task 9
function updateFreshness() {              // Task 12 completes
  const f = document.getElementById('freshness');
  if (!f || !raw) return;
  const n = items.length;
  f.textContent = `${n} · ${raw.refreshed_at || 'unknown'}`;
}
```

- [ ] **Step 5: Verify render produces channels in correct order**

```bash
sl-check
python3 scripts/dev-rebuild.py --open
```

In DevTools console:

```js
document.querySelectorAll('#channelFlow .sl-channel').length
// → N (number of unique channels in your cache)

Array.from(document.querySelectorAll('#channelFlow .sl-channel'))
  .map(c => [c.dataset.vip, c.querySelector('.sl-channel-name').firstChild.textContent])
// → [['1', '@Jane Doe'], ['1', '#project-example'], ['0', '@John Example'], ...]
// VIPs (vip="1") appear first, then non-VIPs, each in time-desc order.
```

- [ ] **Step 6: Commit**

```bash
git add skills/slacklens-refresh/references/dashboard.template.html
git commit -m "dashboard: partition items by channel with VIP float in render"
```

---

## Task 4: Two-column CSS `columns` layout + global chrome

**Files:**
- Modify: `skills/slacklens-refresh/references/dashboard.template.html` (`<style>` section)

**Context:** Now that the structure renders, apply page-level chrome: body padding/typography, `.sl-flow` two-column layout with responsive collapse, max-width cap. Still no component-level styling in this task — that's Task 5.

Spec references: Section 2 (grid).

- [ ] **Step 1: Remove every existing style rule**

Inside `<style>`, keep ONLY the token block from Task 1. Delete every other rule (old `.grid`, `.card`, `.col`, etc.). The page will now be almost completely unstyled.

- [ ] **Step 2: Add global + layout rules after the tokens**

```css
/* ========================================================================
   Global + layout
   ======================================================================== */
html { background: var(--surface); color: var(--ink); transition: background-color var(--transition-theme), color var(--transition-theme); }
body {
  font-family: var(--font-sans);
  font-size: var(--fs-base);
  line-height: 1.4;
  margin: 0;
  padding: var(--frame-pad);
  max-width: 1800px;
  margin-inline: auto;
  color: var(--ink);
  background: var(--surface);
  -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; }

.sl-flow {
  margin-top: 20px;
}
@media (min-width: 1024px) {
  .sl-flow {
    columns: 2;
    column-gap: var(--col-gap);
  }
  .sl-channel { break-inside: avoid; display: block; }
}

.sl-footer {
  margin-top: 32px;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--ink-faint);
  text-align: right;
}
.sl-footer code { background: var(--surface-2); padding: 1px 5px; border-radius: 3px; }
```

- [ ] **Step 3: Verify the two-column layout kicks in**

```bash
python3 scripts/dev-rebuild.py --open
```

- At viewport ≥ 1024px: two columns, channels flow top-to-bottom in col 1 then col 2.
- At viewport < 1024px (resize the window or use DevTools device mode): single column.
- VIPs appear in the top-left of column 1 (inherits from Task 3 render order).

In DevTools console (at width ≥1024):
```js
getComputedStyle(document.querySelector('.sl-flow')).columnCount // → "2"
```

- [ ] **Step 4: Commit**

```bash
git add skills/slacklens-refresh/references/dashboard.template.html
git commit -m "dashboard: apply page-level chrome + two-column CSS columns layout"
```

---

## Task 5: Component styling (channel header, item row, status bars, VIP tag, banner)

**Files:**
- Modify: `skills/slacklens-refresh/references/dashboard.template.html` (`<style>` section)

**Context:** Apply the component styles from spec Section 3. This is the biggest visual diff — the page goes from "unstyled structure" to "recognizably the mockups."

- [ ] **Step 1: Append component styles after the layout rules**

```css
/* ========================================================================
   Channel header
   ======================================================================== */
.sl-channel { margin-bottom: var(--channel-mb); }
.sl-channel-head {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: var(--chanhead-py) 0;
  border-bottom: 1px solid var(--border-faint);
  margin-bottom: var(--item-gap);
}
.sl-channel-name {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: var(--fs-md);
  letter-spacing: -0.01em;
  color: var(--ink);
  max-width: calc(100% - 100px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sl-channel-meta {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.sl-vip {
  display: inline-block;
  margin-left: 6px;
  font-family: var(--font-sans);
  font-weight: 700;
  font-size: var(--fs-xs);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--vip-red);
}

/* ========================================================================
   Item row
   ======================================================================== */
.sl-item {
  position: relative;
  display: grid;
  grid-template-columns: 2px 1fr;
  gap: 10px;
  padding: var(--item-py) 6px var(--item-py) 0;
  border-bottom: 1px solid var(--border-faint);
  cursor: pointer;
  border-radius: 4px;
}
.sl-item:last-child { border-bottom: 0; }
.sl-item:hover { background: var(--surface-2); }
.sl-item[data-active="1"] .sl-item-bar { box-shadow: 0 0 0 3px rgba(182, 69, 53, 0.18); }

.sl-item-bar {
  border-radius: 2px;
  background: var(--status-red);  /* default; overridden per data-status below */
}
.sl-item[data-status="AWAITING YOUR REPLY"] .sl-item-bar { background: var(--status-red); }
.sl-item[data-status="IN PROGRESS"]         .sl-item-bar { background: var(--status-amber); }
.sl-item[data-status="DISCUSSION"]          .sl-item-bar { background: var(--status-amber); }
.sl-item[data-status="WAITING"]             .sl-item-bar { background: var(--status-gray); }
.sl-item[data-status="BACKLOG"]             .sl-item-bar { background: var(--status-gray); }
.sl-item[data-status="DONE"]                .sl-item-bar { background: var(--status-green); }

.sl-item-head {
  display: flex; justify-content: space-between; align-items: baseline;
}
.sl-item-from {
  font-family: var(--font-sans);
  font-weight: 500;
  font-size: var(--fs-sm);
  color: var(--ink);
}
.sl-item-time {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
}
.sl-item-msg {
  font-family: var(--font-serif);
  font-size: var(--fs-base);
  color: var(--ink-muted);
  line-height: 1.4;
  margin-top: 2px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.sl-item-thread {
  font-family: var(--font-sans);
  font-size: var(--fs-xs);
  color: var(--ink-faint);
  margin-top: 3px;
}

/* ========================================================================
   Banner (stale cache, schema mismatch, fetch failed)
   ======================================================================== */
.sl-banner {
  padding: 10px 14px;
  border-radius: 6px;
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--ink-muted);
  margin-bottom: 12px;
}
.sl-banner[data-severity="warn"] {
  border-color: var(--status-amber);
  color: var(--status-amber);
}

/* ========================================================================
   Empty states
   ======================================================================== */
.sl-empty {
  padding: 32px 20px;
  background: var(--surface-2);
  border: 1px dashed var(--border);
  border-radius: 8px;
  text-align: center;
  font-family: var(--font-sans);
  margin-top: 20px;
}
.sl-empty h4 {
  font-family: var(--font-serif);
  font-size: var(--fs-md);
  margin: 0 0 4px;
  color: var(--ink);
  font-weight: 500;
}
.sl-empty p { font-size: var(--fs-sm); color: var(--ink-muted); margin: 0; }
.sl-empty button {
  margin-top: 12px;
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
  padding: 6px 14px;
  background: var(--ink);
  color: var(--surface);
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}
```

- [ ] **Step 2: Rebuild and eyeball against the Section 3 component mockup**

```bash
python3 scripts/dev-rebuild.py --open
```

Check:
- Channel headers have name left (sans 600), mono meta right, thin bottom rule.
- VIP tag appears inline after VIP channel names, red, uppercase, letter-spaced.
- Item rows: 2px colored bar, sans sender name + mono timestamp, **serif message body** below.
- Status bars: red for "AWAITING YOUR REPLY", gray for waiting/backlog, amber for in-progress, green for done. Verify by inspecting a few items with different statuses.
- Hover on any row tints the background.

Switch theme via DevTools: `document.documentElement.setAttribute('data-theme','dark')`. Everything should flip to the warm-night palette with no broken contrasts.

- [ ] **Step 3: Commit**

```bash
git add skills/slacklens-refresh/references/dashboard.template.html
git commit -m "dashboard: style components (channel header, item row, status bars, VIP, empty states)"
```

---

## Task 6: Topbar + toolbar styling

**Files:**
- Modify: `skills/slacklens-refresh/references/dashboard.template.html` (`<style>` section)

**Context:** Style the topbar and toolbar from Task 2's markup. Spec Section 4.

- [ ] **Step 1: Append topbar + toolbar styles**

```css
/* ========================================================================
   Topbar
   ======================================================================== */
.sl-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0 12px;
  border-bottom: 1px solid var(--border-faint);
  margin-bottom: 12px;
}
.sl-brand {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: var(--fs-lg);
  letter-spacing: -0.01em;
  color: var(--ink);
}
.sl-topbar-right { display: flex; gap: 14px; align-items: center; }
.sl-fresh {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
}
.sl-fresh[data-stale="1"] { color: var(--status-amber); }

.sl-iconbtn {
  width: 28px; height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface-2);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 14px;
  color: var(--ink-muted);
  cursor: pointer;
  font-family: inherit;
}
.sl-iconbtn:hover { color: var(--ink); }

.sl-reload {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--fs-sm);
  font-weight: 500;
  cursor: pointer;
}

/* ========================================================================
   Toolbar
   ======================================================================== */
.sl-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 4px;
  flex-wrap: wrap;
}
.sl-pills { display: inline-flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.sl-divider { width: 1px; height: 20px; background: var(--border); }
.sl-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
  background: var(--surface-2);
  border: 1px solid var(--border-faint);
  color: var(--ink-muted);
  cursor: pointer;
}
.sl-pill .count {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
}
.sl-pill.active {
  background: var(--ink);
  color: var(--surface);
  border-color: var(--ink);
}
.sl-pill.active .count { color: var(--surface); opacity: 0.7; }

.sl-search {
  flex: 1 1 220px; min-width: 180px; max-width: 320px;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border-faint);
}
.sl-search .icon { color: var(--ink-faint); font-size: 13px; }
.sl-search input {
  flex: 1; border: 0; background: transparent; outline: 0;
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
  color: var(--ink);
}
.sl-search input::placeholder { color: var(--ink-faint); }

.sl-density {
  display: inline-flex;
  background: var(--surface-2);
  border: 1px solid var(--border-faint);
  border-radius: 6px;
  overflow: hidden;
}
.sl-density-btn {
  border: 0;
  background: transparent;
  padding: 4px 10px;
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
  color: var(--ink-muted);
  cursor: pointer;
}
.sl-density-btn.active { background: var(--ink); color: var(--surface); }

.sl-switch {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
  color: var(--ink-muted);
  cursor: pointer;
  user-select: none;
}
.sl-switch input { display: none; }
.sl-switch .track {
  width: 26px; height: 14px;
  background: var(--border);
  border-radius: 999px;
  position: relative;
}
.sl-switch .track::after {
  content: "";
  position: absolute; top: 2px; left: 2px;
  width: 10px; height: 10px;
  background: var(--surface);
  border-radius: 50%;
  transition: transform 120ms;
}
.sl-switch input:checked + .track { background: var(--ink); }
.sl-switch input:checked + .track::after { transform: translateX(12px); }

/* Focus rings (accessibility) */
button:focus-visible, input:focus-visible, textarea:focus-visible, [tabindex]:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}
```

- [ ] **Step 2: Rebuild and verify**

```bash
python3 scripts/dev-rebuild.py --open
```

Check topbar layout, toolbar layout, pills with inline counts (counts are still "0" until Task 9 wires them), density segments, search box, snoozed switch. Switch theme via DevTools to verify dark.

- [ ] **Step 3: Commit**

```bash
git add skills/slacklens-refresh/references/dashboard.template.html
git commit -m "dashboard: style topbar + toolbar (pills, search, density, snoozed switch)"
```

---

## Task 7: Density toggle wiring (localStorage + data-density)

**Files:**
- Modify: `skills/slacklens-refresh/references/dashboard.template.html` (JS block)

**Context:** Make the `[Compact | Balanced | Spacious]` buttons work. Persists to `slacklens.density`, applies via `data-density` attribute on `<html>` (which the tokens already bind to from Task 1).

- [ ] **Step 1: Add the density-wiring block to the JS**

Near the boot section (end of `<script>`, before the existing `loadCache()` call), add:

```javascript
// ========================================================================
// Density toggle (slacklens.density: 'compact' | 'balanced' | 'spacious')
// ========================================================================
const DENSITY_KEY = 'slacklens.density';
const DENSITY_VALUES = ['compact', 'balanced', 'spacious'];

function applyDensity(d) {
  if (!DENSITY_VALUES.includes(d)) d = 'balanced';
  document.documentElement.setAttribute('data-density', d);
  document.querySelectorAll('.sl-density-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.density === d);
  });
  try { localStorage.setItem(DENSITY_KEY, d); } catch (_) {}
}

function bootDensity() {
  let d;
  try { d = localStorage.getItem(DENSITY_KEY); } catch (_) { d = null; }
  applyDensity(d || 'balanced');
  document.querySelectorAll('.sl-density-btn').forEach(btn => {
    btn.addEventListener('click', () => applyDensity(btn.dataset.density));
  });
}
```

- [ ] **Step 2: Call `bootDensity()` on load**

Add `bootDensity();` in the boot section before `loadCache()`.

- [ ] **Step 3: Verify**

```bash
sl-check
python3 scripts/dev-rebuild.py --open
```

Click each density button. Item padding, font sizes, and column gap should change. Check localStorage:

```js
localStorage.getItem('slacklens.density')  // → "compact" or "balanced" or "spacious"
document.documentElement.getAttribute('data-density')  // → same
```

Reload — the last choice should persist.

- [ ] **Step 4: Commit**

```bash
git add skills/slacklens-refresh/references/dashboard.template.html
git commit -m "dashboard: wire density toggle (localStorage + data-density)"
```

---

## Task 8: Theme toggle wiring (localStorage + media query + icon swap)

**Files:**
- Modify: `skills/slacklens-refresh/references/dashboard.template.html` (JS block)

**Context:** Wire ☾/☼ toggle. Cycles `auto → light → dark → auto`. Default `auto` follows `prefers-color-scheme`.

- [ ] **Step 1: Add the theme-wiring block**

```javascript
// ========================================================================
// Theme toggle (slacklens.theme: 'auto' | 'light' | 'dark'; default 'auto')
// ========================================================================
const THEME_KEY = 'slacklens.theme';
const THEME_CYCLE = ['auto', 'light', 'dark'];

function currentSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(t) {
  if (!THEME_CYCLE.includes(t)) t = 'auto';
  const effective = (t === 'auto') ? currentSystemTheme() : t;
  if (effective === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else                       document.documentElement.removeAttribute('data-theme');
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.textContent = (effective === 'dark') ? '☼' : '☾';
    btn.title = 'Theme: ' + t + ' (click to cycle)';
  }
  try { localStorage.setItem(THEME_KEY, t); } catch (_) {}
}

function bootTheme() {
  let t;
  try { t = localStorage.getItem(THEME_KEY); } catch (_) { t = null; }
  applyTheme(t || 'auto');
  const btn = document.getElementById('themeToggle');
  if (btn) btn.addEventListener('click', () => {
    const current = localStorage.getItem(THEME_KEY) || 'auto';
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
    applyTheme(next);
  });
  // Respond to system changes while on auto
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const current = localStorage.getItem(THEME_KEY) || 'auto';
    if (current === 'auto') applyTheme('auto');
  });
}
```

- [ ] **Step 2: Call `bootTheme()` on load**

Add `bootTheme();` in the boot section alongside `bootDensity()`.

- [ ] **Step 3: Verify**

Click ☾/☼ three times. Expected cycle:
- `auto` (icon reflects system)
- `light` (sun icon)
- `dark` (moon icon)
- back to `auto`

Check `localStorage.getItem('slacklens.theme')` matches.

Toggle macOS appearance (System Settings → Appearance → Auto/Light/Dark). In `auto` mode, the page should follow.

- [ ] **Step 4: Commit**

```bash
git add skills/slacklens-refresh/references/dashboard.template.html
git commit -m "dashboard: wire theme toggle (auto/light/dark with prefers-color-scheme fallback)"
```

---

## Task 9: Filter pills + search + show-snoozed wiring + counts

**Files:**
- Modify: `skills/slacklens-refresh/references/dashboard.template.html` (JS block)

**Context:** Replace the stubbed `applyFilter`, implement `updateCounts`, wire all toolbar controls.

- [ ] **Step 1: Implement `applyFilter` based on current state**

Replace the stub with:

```javascript
// filter state (already declared near top of script): { scope, status[], query, showSnoozed }
// Migration: existing dashboards had filter.status as a single string; normalize to array.
filter.status = Array.isArray(filter.status) ? filter.status : (filter.status ? [filter.status] : []);

function applyFilter(xs) {
  const q = (filter.query || '').toLowerCase().trim();
  const now = Date.now();

  return xs.filter(it => {
    const eff = effectiveItem(it);

    // Snoozed filter (unless showing snoozed)
    const snoozedUntil = eff.snooze_until ? Date.parse(eff.snooze_until) : 0;
    const isSnoozed = snoozedUntil && snoozedUntil > now;
    if (isSnoozed && !filter.showSnoozed) return false;

    // Scope
    if (filter.scope === 'needs_reply'  && !eff.needs_reply)      return false;
    if (filter.scope === 'mentions'     && it.source !== 'mention') return false;
    if (filter.scope === 'dms'          && it.kind !== 'dm')      return false;
    if (filter.scope === 'channels'     && it.kind !== 'channel') return false;

    // Status (multi-select)
    if (filter.status.length && !filter.status.includes((eff.status || '').toUpperCase())) return false;

    // Search (channel/person/text/participants)
    if (q) {
      const hay = (it.channel_display + ' ' + (it.last_from || '') + ' ' +
                   (it.last_text || '') + ' ' + (it.participants || []).join(' ')).toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}
```

- [ ] **Step 2: Implement `updateCounts`**

```javascript
function updateCounts(shownItems) {
  const counts = { all: shownItems.length, needs_reply: 0, mentions: 0, dms: 0, channels: 0 };
  for (const it of shownItems) {
    const eff = effectiveItem(it);
    if (eff.needs_reply)            counts.needs_reply++;
    if (it.source === 'mention')    counts.mentions++;
    if (it.kind === 'dm')           counts.dms++;
    if (it.kind === 'channel')      counts.channels++;
  }
  document.querySelectorAll('#categoryPills .sl-pill').forEach(btn => {
    const k = btn.dataset.scope;
    const c = btn.querySelector('.count');
    if (c && counts[k] !== undefined) c.textContent = counts[k];
  });
}
```

**Note:** `updateCounts` receives the *filter-applied* set so counts reflect "how many items would match if you switched to this scope." Simpler behavior that most users intuit — alternative is to count from `items` (unfiltered); change later if desired.

- [ ] **Step 3: Wire pill + search + snoozed click handlers**

```javascript
function bootFilters() {
  // Category pills (single-select)
  document.querySelectorAll('#categoryPills .sl-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      filter.scope = btn.dataset.scope;
      document.querySelectorAll('#categoryPills .sl-pill').forEach(b =>
        b.classList.toggle('active', b === btn));
      render();
    });
  });
  // Status pills (multi-select)
  document.querySelectorAll('#statusPills .sl-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.status;
      const i = filter.status.indexOf(s);
      if (i >= 0) { filter.status.splice(i, 1); btn.classList.remove('active'); }
      else        { filter.status.push(s);      btn.classList.add('active'); }
      render();
    });
  });
  // Search (debounced 150ms, focused by "/")
  const input = document.getElementById('searchInput');
  let tmr = null;
  input.addEventListener('input', () => {
    clearTimeout(tmr);
    tmr = setTimeout(() => { filter.query = input.value; render(); }, 150);
  });
  // Show snoozed
  const snz = document.getElementById('showSnoozed');
  snz.addEventListener('change', () => { filter.showSnoozed = snz.checked; render(); });
}
```

Call `bootFilters()` in the boot section after `bootTheme()`.

- [ ] **Step 4: Verify**

Click each category pill — render narrows correctly, active pill swaps, counts update.
Click multiple status pills — filter AND's them, all toggle correctly.
Type in search — results narrow with ~150ms lag.
Toggle `Show snoozed` — if you have any snoozed items, they appear/hide.

- [ ] **Step 5: Commit**

```bash
git add skills/slacklens-refresh/references/dashboard.template.html
git commit -m "dashboard: wire filter pills, search, show-snoozed, live counts"
```

---

## Task 10: Side panel (content + open/close/ESC/outside-click + focus)

**Files:**
- Modify: `skills/slacklens-refresh/references/dashboard.template.html` (`<style>` section + JS block)

**Context:** Wire the side panel per spec Section 5 mockup. Row click opens, X/ESC/outside-click closes.

- [ ] **Step 1: Add side-panel styles**

```css
/* ========================================================================
   Side panel
   ======================================================================== */
.sl-panel-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.15);
  z-index: 40;
}
.sl-panel {
  position: fixed;
  top: 0; right: 0; bottom: 0;
  width: 420px; max-width: 100vw;
  background: var(--surface-2);
  border-left: 1px solid var(--border);
  z-index: 50;
  display: flex; flex-direction: column;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.08);
}
@media (max-width: 899px) { .sl-panel { width: 100vw; } }

.sl-panel-head {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border-faint);
}
.sl-panel-title {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: var(--fs-lg);
  letter-spacing: -0.01em;
  color: var(--ink);
}
.sl-panel-meta {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-faint);
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
  color: var(--ink-muted);
  display: flex; justify-content: space-between; gap: 12px;
}
.sl-panel-meta .k { color: var(--ink-faint); margin-right: 6px; }

.sl-panel-actions {
  display: flex; gap: 6px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-faint);
  flex-wrap: wrap;
}
.sl-btn {
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.sl-btn.primary { background: var(--ink); color: var(--surface); border-color: var(--ink); }

.sl-panel-thread { flex: 1; padding: 14px 16px; overflow-y: auto; }
.sl-panel-thread .msg { margin-bottom: 14px; }
.sl-panel-thread .msg-head {
  display: flex; justify-content: space-between; align-items: baseline;
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
}
.sl-panel-thread .msg-from { font-weight: 600; color: var(--ink); }
.sl-panel-thread .msg-time { font-family: var(--font-mono); color: var(--ink-faint); }
.sl-panel-thread .msg-body {
  font-family: var(--font-serif);
  font-size: var(--fs-base);
  color: var(--ink-muted);
  line-height: 1.5;
  margin-top: 3px;
  white-space: pre-wrap;
}
.sl-panel-thread .msg.me .msg-from { color: var(--ink-faint); }

.sl-panel-note {
  padding: 12px 16px;
  border-top: 1px solid var(--border-faint);
  background: var(--surface);
}
.sl-note-label {
  font-family: var(--font-sans);
  font-size: var(--fs-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin-bottom: 6px;
}
.sl-panel-note textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 42px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  border-radius: 6px;
  padding: 7px 10px;
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
  color: var(--ink);
  resize: vertical;
  outline: 0;
}
.sl-panel-note textarea:focus { border-color: var(--ink-muted); }
```

- [ ] **Step 2: Add side-panel JS**

```javascript
// ========================================================================
// Side panel
// ========================================================================
let panelItemKey = null;  // key of currently-open item (null = closed)
let panelTriggerEl = null;  // element that opened it, for focus restoration

function findItem(key) { return items.find(it => it.key === key); }

function threadMessagesFor(it) {
  // Try to find a full thread; fall back to a synthetic single-message array.
  const tkey = it.channel_id + ':' + (it.permalink ? it.permalink.split('/p')[1] || '' : '');
  const t = raw && raw.threads ? raw.threads[Object.keys(raw.threads).find(k => k.startsWith(it.channel_id + ':')) || ''] : null;
  if (t && t.messages) return t.messages;
  return [{ from: it.last_from, ts: '0', time: it.last_time, text: it.last_text, permalink: it.permalink }];
}

function openPanel(itemKey, triggerEl) {
  const it = findItem(itemKey);
  if (!it) return;
  panelItemKey = itemKey;
  panelTriggerEl = triggerEl || null;

  const eff = effectiveItem(it);
  document.getElementById('panelChannel').textContent = it.channel_display || it.channel_name || it.channel_id;
  const vip = document.getElementById('panelVip');
  vip.hidden = !it.channel_is_vip;
  document.getElementById('panelChannelType').textContent =
    it.kind === 'dm' ? 'Direct message' : (it.kind === 'channel' ? 'Channel' : 'Thread');
  document.getElementById('panelStatus').textContent = eff.status || 'AWAITING YOUR REPLY';
  document.getElementById('panelNote').value = eff.note || '';
  document.getElementById('actOpen').onclick = () => { if (it.permalink) window.open(it.permalink, '_blank'); };
  document.getElementById('actCopy').onclick = () => { if (it.permalink) navigator.clipboard.writeText(it.permalink); };
  document.getElementById('actDone').onclick = () => {
    overrideFor(itemKey).status = 'DONE';
    saveOverrides(); render(); closePanel();
  };
  // Status and Snooze dropdowns wired in Task 11.

  // Thread
  const threadEl = document.getElementById('panelThread');
  threadEl.innerHTML = '';
  for (const m of threadMessagesFor(it)) {
    const wrap = document.createElement('div');
    wrap.className = 'msg' + (isMe(m.from) ? ' me' : '');
    const head = document.createElement('div');
    head.className = 'msg-head';
    const fromEl = document.createElement('span');
    fromEl.className = 'msg-from';
    fromEl.textContent = cleanName(m.from || '');
    const timeEl = document.createElement('span');
    timeEl.className = 'msg-time';
    timeEl.textContent = (m.time || '').slice(11, 16) || m.ts;
    head.appendChild(fromEl); head.appendChild(timeEl);
    const body = document.createElement('div');
    body.className = 'msg-body';
    body.textContent = m.text || '';
    wrap.appendChild(head); wrap.appendChild(body);
    threadEl.appendChild(wrap);
  }

  // Highlight the row in background, show panel+backdrop
  document.querySelectorAll('.sl-item[data-active="1"]').forEach(el => el.removeAttribute('data-active'));
  const row = document.querySelector(`.sl-item[data-key="${CSS.escape(itemKey)}"]`);
  if (row) row.setAttribute('data-active', '1');

  document.getElementById('sidePanel').hidden = false;
  document.getElementById('panelBackdrop').hidden = false;
  document.getElementById('panelClose').focus();

  // Persist note on blur
  document.getElementById('panelNote').onblur = () => {
    overrideFor(itemKey).note = document.getElementById('panelNote').value;
    saveOverrides();
  };
}

function closePanel() {
  panelItemKey = null;
  document.getElementById('sidePanel').hidden = true;
  document.getElementById('panelBackdrop').hidden = true;
  document.querySelectorAll('.sl-item[data-active="1"]').forEach(el => el.removeAttribute('data-active'));
  if (panelTriggerEl && typeof panelTriggerEl.focus === 'function') panelTriggerEl.focus();
  panelTriggerEl = null;
}

function bootSidePanel() {
  document.getElementById('panelClose').addEventListener('click', closePanel);
  document.getElementById('panelBackdrop').addEventListener('click', closePanel);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('sidePanel').hidden) closePanel();
  });

  // Click delegation on the flow
  document.getElementById('channelFlow').addEventListener('click', e => {
    const row = e.target.closest('.sl-item');
    if (!row) return;
    // Ignore clicks on hover actions (Task 11)
    if (e.target.closest('.sl-item-actions')) return;
    openPanel(row.dataset.key, row);
  });
}
```

Call `bootSidePanel()` in boot after `bootFilters()`.

- [ ] **Step 3: Verify**

Click any row → panel slides in, shows channel name + VIP tag (if applicable), status, thread messages, empty note textarea. Focus is on X button.

Close via:
- X button
- Click backdrop (outside)
- Press ESC

Focus returns to the row that opened it. Type a note, blur, reopen — note persists.

- [ ] **Step 4: Commit**

```bash
git add skills/slacklens-refresh/references/dashboard.template.html
git commit -m "dashboard: side panel — open/close/ESC, thread detail, private note persistence"
```

---

## Task 11: Hover actions on item rows + status/snooze dropdowns

**Files:**
- Modify: `skills/slacklens-refresh/references/dashboard.template.html` (`<style>` section + JS block)

**Context:** Reveal-on-hover `...` cluster with five actions. Plus the status and snooze submenus wired in the side panel.

- [ ] **Step 1: Style the hover actions**

Append to `<style>`:

```css
.sl-item-actions {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  display: inline-flex; gap: 2px;
  opacity: 0; pointer-events: none;
  transition: opacity 120ms;
  background: var(--surface);
  padding: 3px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  z-index: 10;
}
.sl-item:hover .sl-item-actions { opacity: 1; pointer-events: auto; }
.sl-item-actions button {
  border: 0; background: transparent;
  font-size: 13px;
  color: var(--ink-muted);
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
}
.sl-item-actions button:hover { background: var(--surface-2); color: var(--ink); }

/* Simple inline menu used by Status ▾ and Snooze ▾ */
.sl-menu {
  position: absolute;
  z-index: 60;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  padding: 4px;
  min-width: 180px;
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
}
.sl-menu button {
  display: block; width: 100%;
  text-align: left;
  padding: 5px 10px;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-family: inherit; font-size: inherit;
  border-radius: 4px;
  cursor: pointer;
}
.sl-menu button:hover { background: var(--surface-2); }

/* Snoozed visual treatment */
.sl-item[data-snoozed="1"] { opacity: 0.5; }
.sl-item[data-snoozed="1"] .sl-item-bar { position: relative; }
.sl-item[data-snoozed="1"] .sl-item-bar::after {
  content: "☾"; position: absolute; left: 3px; top: -10px;
  font-size: 9px; color: var(--ink-faint);
}
```

- [ ] **Step 2: Extend `renderItem` to add the hover actions + snoozed flag**

In `renderItem()`, before the `return row;`, add:

```javascript
// Snoozed state
const eff = effectiveItem(it);
const snoozedUntil = eff.snooze_until ? Date.parse(eff.snooze_until) : 0;
if (snoozedUntil && snoozedUntil > Date.now()) row.dataset.snoozed = '1';

// Hover action cluster
const actions = document.createElement('div');
actions.className = 'sl-item-actions';
actions.innerHTML = [
  '<button data-action="status"  title="Change status"  aria-label="Change status">◐</button>',
  '<button data-action="snooze"  title="Snooze"         aria-label="Snooze">☾</button>',
  '<button data-action="done"    title="Mark done"      aria-label="Mark done">✓</button>',
  '<button data-action="open"    title="Open in Slack"  aria-label="Open in Slack">↗</button>',
  '<button data-action="copy"    title="Copy permalink" aria-label="Copy permalink">⎘</button>',
].join('');
row.appendChild(actions);
```

- [ ] **Step 3: Handle action clicks in the click delegation**

In `bootSidePanel()`'s channelFlow click handler, intercept action clicks BEFORE opening the panel:

```javascript
document.getElementById('channelFlow').addEventListener('click', e => {
  const actBtn = e.target.closest('.sl-item-actions button');
  if (actBtn) {
    const row = actBtn.closest('.sl-item');
    const it = findItem(row.dataset.key);
    const action = actBtn.dataset.action;
    handleRowAction(action, it, actBtn);
    e.stopPropagation();
    return;
  }
  const row = e.target.closest('.sl-item');
  if (row) openPanel(row.dataset.key, row);
});
```

And add the handler:

```javascript
function handleRowAction(action, it, anchorEl) {
  if (!it) return;
  if (action === 'open')  { if (it.permalink) window.open(it.permalink, '_blank'); return; }
  if (action === 'copy')  { if (it.permalink) navigator.clipboard.writeText(it.permalink); return; }
  if (action === 'done')  { overrideFor(it.key).status = 'DONE'; saveOverrides(); render(); return; }
  if (action === 'status') return openStatusMenu(it, anchorEl);
  if (action === 'snooze') return openSnoozeMenu(it, anchorEl);
}

function openMenu(anchorEl, items) {
  // items: [{ label, onClick }]
  closeOpenMenu();
  const menu = document.createElement('div');
  menu.className = 'sl-menu';
  menu.id = 'activeMenu';
  for (const mi of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = mi.label;
    b.addEventListener('click', () => { mi.onClick(); closeOpenMenu(); });
    menu.appendChild(b);
  }
  const rect = anchorEl.getBoundingClientRect();
  menu.style.left = (rect.right - 180) + 'px';
  menu.style.top = (rect.bottom + 4 + window.scrollY) + 'px';
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', menuOutsideClick, { once: true }), 0);
}
function closeOpenMenu() {
  const m = document.getElementById('activeMenu');
  if (m) m.remove();
}
function menuOutsideClick(e) {
  if (!e.target.closest('#activeMenu')) closeOpenMenu();
}
function openStatusMenu(it, anchorEl) {
  openMenu(anchorEl, STATUSES.map(s => ({
    label: s,
    onClick: () => { overrideFor(it.key).status = s; saveOverrides(); render(); },
  })));
}
function openSnoozeMenu(it, anchorEl) {
  const now = Date.now();
  openMenu(anchorEl, [
    { label: '1 hour',            onClick: () => snooze(it, now + 60 * 60 * 1000) },
    { label: 'Until 9am tomorrow', onClick: () => {
        const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
        snooze(it, d.getTime());
    }},
    { label: 'Custom…', onClick: () => {
        const s = prompt('Snooze until (YYYY-MM-DD HH:MM):');
        if (!s) return;
        const t = Date.parse(s.replace(' ', 'T'));
        if (!isNaN(t)) snooze(it, t);
    }},
    { label: 'Clear snooze', onClick: () => { overrideFor(it.key).snooze_until = null; saveOverrides(); render(); }},
  ]);
}
function snooze(it, millis) {
  overrideFor(it.key).snooze_until = new Date(millis).toISOString();
  saveOverrides(); render();
}
```

- [ ] **Step 4: Wire side-panel Status/Snooze buttons through the same menus**

In `openPanel()`, add:

```javascript
document.getElementById('actStatus').onclick = (e) => openStatusMenu(it, e.currentTarget);
document.getElementById('actSnooze').onclick = (e) => openSnoozeMenu(it, e.currentTarget);
```

- [ ] **Step 5: Right-click shows the same menu as `...`**

In `bootSidePanel()`:

```javascript
document.getElementById('channelFlow').addEventListener('contextmenu', e => {
  const row = e.target.closest('.sl-item');
  if (!row) return;
  e.preventDefault();
  const it = findItem(row.dataset.key);
  if (!it) return;
  // Show a combined menu
  openMenu(row, [
    { label: 'Open in Slack',   onClick: () => { if (it.permalink) window.open(it.permalink, '_blank'); } },
    { label: 'Copy permalink',  onClick: () => { if (it.permalink) navigator.clipboard.writeText(it.permalink); } },
    { label: 'Mark done',       onClick: () => { overrideFor(it.key).status = 'DONE'; saveOverrides(); render(); } },
    { label: 'Change status…',  onClick: () => openStatusMenu(it, row) },
    { label: 'Snooze…',         onClick: () => openSnoozeMenu(it, row) },
  ]);
});
```

- [ ] **Step 6: Verify**

Hover any row → `...` cluster fades in on the right.
Click `◐` → status menu with 6 statuses. Pick one — row's bar color updates.
Click `☾` → snooze menu. Pick "1 hour" — row opacity 0.5, ☾ badge visible.
Click `✓` → row's status flips to DONE (green bar).
Click `↗` → opens Slack permalink in a new tab.
Click `⎘` → permalink copied to clipboard (paste somewhere to verify).
Right-click a row → combined menu with all actions.
In side panel, `◐ Status ▾` and `☾ Snooze ▾` open the same menus.

- [ ] **Step 7: Commit**

```bash
git add skills/slacklens-refresh/references/dashboard.template.html
git commit -m "dashboard: hover actions on rows + status/snooze menus (anchored to row or panel)"
```

---

## Task 12: Empty states + stale-cache freshness + banner

**Files:**
- Modify: `skills/slacklens-refresh/references/dashboard.template.html` (JS block)

**Context:** Three empty states (no cache / filter-empty / quiet 48h). Freshness meta turns amber when cache is older than `STALE_CACHE_HOURS`. Banner shown when cache has pre-v0.2.0 schema or live fetch fails.

- [ ] **Step 1: Complete `updateFreshness`**

Replace the stub with:

```javascript
const STALE_CACHE_HOURS = 12;

function updateFreshness() {
  const f = document.getElementById('freshness');
  if (!f) return;
  const total = items.length;
  if (!raw || !raw.refreshed_at) {
    f.textContent = `${total} · no data`;
    f.removeAttribute('data-stale');
    return;
  }
  const t = Date.parse(raw.refreshed_at);
  const ageHours = (Date.now() - t) / 3600000;
  f.textContent = `${total} · ${humanAge(ageHours)}`;
  f.title = raw.refreshed_at;
  f.dataset.stale = (ageHours > STALE_CACHE_HOURS) ? '1' : '0';
}

function humanAge(h) {
  if (h < 0.05) return 'just now';
  if (h < 1)    return `${Math.round(h * 60)}m ago`;
  if (h < 24)   return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
```

- [ ] **Step 2: Improve empty-state logic in `render()`**

Replace the single generic empty-state block with three paths:

```javascript
  if (!raw || (!raw.search_results && !raw.threads)) {
    empty.hidden = false;
    empty.innerHTML =
      '<h4>No cache loaded yet</h4>' +
      '<p>Run a refresh to populate the dashboard.</p>' +
      '<button id="emptyReload">Reload</button>';
    document.getElementById('emptyReload').onclick = () => loadCache();
    return;
  }

  const hasFilter = filter.scope !== 'all' || filter.status.length || filter.query || !filter.showSnoozed ? false : false;
  // (Simpler): detect "user actively filtered"
  const activelyFiltered =
    filter.scope !== 'all' || filter.status.length > 0 || (filter.query || '').trim() !== '';

  if (channels.length === 0 && activelyFiltered) {
    empty.hidden = false;
    empty.innerHTML =
      '<h4>Nothing matches</h4>' +
      '<p>Your filter did not match any threads.</p>' +
      '<button id="emptyClear">Clear filter</button>';
    document.getElementById('emptyClear').onclick = () => {
      filter.scope = 'all';
      filter.status = [];
      filter.query = '';
      document.getElementById('searchInput').value = '';
      document.querySelectorAll('#categoryPills .sl-pill').forEach(b =>
        b.classList.toggle('active', b.dataset.scope === 'all'));
      document.querySelectorAll('#statusPills .sl-pill').forEach(b => b.classList.remove('active'));
      render();
    };
    return;
  }

  if (channels.length === 0) {
    empty.hidden = false;
    empty.innerHTML =
      '<h4>Nothing in the last 48 hours</h4>' +
      '<p>Catch your breath.</p>';
    return;
  }
```

Place this block where `if (channels.length === 0)` was in Task 3.

- [ ] **Step 3: Schema-mismatch banner**

In the JS, before the first `render()`, add:

```javascript
function checkSchemaBanner() {
  const banner = document.getElementById('banner');
  if (!banner) return;
  if (!raw || !raw.search_results) return;
  const sr = raw.search_results;
  const hasOldKeys = ('dms_received' in sr) || ('outgoing_dms' in sr);
  const hasNewKeys = ('mentions' in sr) && ('dms' in sr) && ('channels' in sr);
  if (hasOldKeys && !hasNewKeys) {
    banner.hidden = false;
    banner.dataset.severity = 'warn';
    banner.textContent = 'Your cache predates v0.2.0 — run "refresh slacklens" to rebuild.';
  }
}
```

Call `checkSchemaBanner()` after `raw = …` assignment in `loadCache()`.

- [ ] **Step 4: Fetch-failed banner**

In `loadCache()`'s `catch` branch where the embedded cache kicks in, additionally:

```javascript
const banner = document.getElementById('banner');
if (banner) {
  banner.hidden = false;
  banner.dataset.severity = 'warn';
  banner.textContent = 'Showing embedded cache — live refresh failed (' + e.message + ').';
}
```

- [ ] **Step 5: Verify**

- Empty cache: temporarily set `window.__SLACK_CACHE__ = {}` in DevTools and reload → "No cache loaded yet" card with reload button.
- Filter to a garbage search → "Nothing matches" with Clear filter.
- Cache with stale timestamp: in DevTools, `raw.refreshed_at = '2020-01-01T00:00:00'; render();` — freshness turns amber with `data-stale="1"`.
- Inject old schema temporarily: `raw.search_results.dms_received = []; delete raw.search_results.dms; render();` — banner warns about v0.2.0.

- [ ] **Step 6: Commit**

```bash
git add skills/slacklens-refresh/references/dashboard.template.html
git commit -m "dashboard: empty states, stale-cache amber freshness, schema-mismatch banner"
```

---

## Task 13: Keyboard shortcuts

**Files:**
- Modify: `skills/slacklens-refresh/references/dashboard.template.html` (JS block)

**Context:** Global shortcuts for common actions. J/K included but trivial (focus-ring move) since they're low risk here.

- [ ] **Step 1: Implement shortcuts**

Add near the boot section:

```javascript
// ========================================================================
// Keyboard shortcuts
//   /  focus search     R  reload      T  cycle theme      D  cycle density
//   ESC close panel / clear focus      J/K  next/prev item
// ========================================================================
function bootKeyboard() {
  document.addEventListener('keydown', e => {
    const inInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement && document.activeElement.tagName);

    if (e.key === 'Escape') {
      // ESC handled by side panel already; if focus is in an input, blur it.
      if (inInput) document.activeElement.blur();
      return;
    }
    if (inInput) return;

    if (e.key === '/') { e.preventDefault(); document.getElementById('searchInput').focus(); return; }
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); loadCache(); return; }
    if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      const current = localStorage.getItem(THEME_KEY) || 'auto';
      const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
      applyTheme(next);
      return;
    }
    if (e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      const current = localStorage.getItem(DENSITY_KEY) || 'balanced';
      const next = DENSITY_VALUES[(DENSITY_VALUES.indexOf(current) + 1) % DENSITY_VALUES.length];
      applyDensity(next);
      return;
    }
    if (e.key === 'j' || e.key === 'k') {
      e.preventDefault();
      const rows = Array.from(document.querySelectorAll('.sl-item'));
      if (!rows.length) return;
      const focused = document.querySelector('.sl-item[data-kb-focus="1"]');
      let idx = focused ? rows.indexOf(focused) : -1;
      rows.forEach(r => r.removeAttribute('data-kb-focus'));
      idx = (e.key === 'j') ? Math.min(idx + 1, rows.length - 1) : Math.max(idx - 1, 0);
      const next = rows[Math.max(0, idx)];
      next.setAttribute('data-kb-focus', '1');
      next.scrollIntoView({ block: 'nearest' });
    }
  });
}
```

- [ ] **Step 2: Style kb focus**

Append:

```css
.sl-item[data-kb-focus="1"] { background: var(--surface-2); outline: 2px solid var(--ink); outline-offset: -2px; }
```

- [ ] **Step 3: Call `bootKeyboard()` in the boot sequence**

After `bootSidePanel()`.

- [ ] **Step 4: Verify each shortcut**

- `/` → search input focuses.
- `R` → freshness meta updates ("just now").
- `T` → theme cycles, icon swaps.
- `D` → density cycles, sizes change.
- `J`/`K` → row-by-row keyboard navigation; scroll follows.
- `ESC` in search → search blurs.
- `ESC` with panel open → panel closes.

- [ ] **Step 5: Commit**

```bash
git add skills/slacklens-refresh/references/dashboard.template.html
git commit -m "dashboard: keyboard shortcuts (/, R, T, D, J/K, ESC)"
```

---

## Task 14: Smoke test against real data + version bump + final commit

**Files:**
- Modify: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`

**Context:** End-to-end verification against the live Slack cache, then bump to v0.3.0.

- [ ] **Step 1: Full rebuild against real data**

```bash
python3 scripts/dev-rebuild.py --open
```

DevTools console should be free of any red errors. Check each acceptance criterion from the spec:

1. [ ] Channels are the primary grouping; VIP channels render first; newest-first within each channel.
2. [ ] Density toggle `[Compact | Balanced | Spacious]` works; persists across reloads.
3. [ ] Theme toggle ☾/☼ cycles `auto → light → dark → auto`; `prefers-color-scheme` drives default.
4. [ ] ≥1024px width: two-column layout via `columns: 2`. <1024px: single column. Max-width capped at 1800px.
5. [ ] Typography: system stacks only; three families; size scale applies per density.
6. [ ] Four status bar colors correct; per-item overrides round-trip via `slackTriageOverrides.v1`.
7. [ ] Whole row clickable → side panel opens. Hover reveals action menu. Right-click shows combined menu.
8. [ ] Side panel: opens, renders full thread, five actions, closes via X / outside / ESC.
9. [ ] Empty states render for all three cases.
10. [ ] Existing `slackTriageOverrides.v1` entries still take effect after the template swap.
11. [ ] Pre-existing side-panel wiring bug no longer occurs (listeners attach successfully on load — console has no `Cannot read properties of null` errors).
12. [ ] Accessibility: focus rings visible; tab order covers topbar → toolbar → content → side panel; icon-only buttons have `aria-label`.
13. [ ] Cache-injection path still clean (refresh skill unchanged — verify by running the shipped refresh skill separately).
14. [ ] Rendered `dashboard.html` has no console errors.

- [ ] **Step 2: Run the actual shipped `slacklens-refresh` skill end-to-end**

In a fresh Cowork chat: say `refresh slacklens`. Wait for completion. `open ~/.slacklens/dashboard.html`. Verify again.

- [ ] **Step 3: Version bump**

Edit `.claude-plugin/plugin.json`:
```diff
-  "version": "0.2.0",
+  "version": "0.3.0",
-  "description": "Personal Slack triage dashboard. Mentions, DMs, and active threads in one view, with VIPs floated to the top. Auto-refreshes every 8 hours.",
+  "description": "Personal Slack triage dashboard with channel-grouped view, VIP float, density + theme toggles, and auto-refresh every 8 hours.",
```

Same changes in `.claude-plugin/marketplace.json`.

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "v0.3.0: dashboard redesign — channel-grouped, density + theme toggles, redesigned side panel"
```

- [ ] **Step 5: Review and clean up**

Run `git log --oneline main -20` — the commit history should tell a clean story, task-by-task.
If any task's commit needs a message tweak, use `git rebase -i` (only if you want to; it's optional polish, not required).

---

## Notes and escape hatches

- **If the serif message body reads slow during actual use**, flip `.sl-item-msg` font to `var(--font-sans)`. Documented in the spec.
- **If the two-column layout breaks channel grouping unexpectedly on your viewport**, check `break-inside: avoid` inspection; some older browsers need `page-break-inside: avoid`. Add as a fallback.
- **If J/K keyboard navigation adds more complexity than value**, delete Task 13 Step 1's J/K block. The plan explicitly marks it as trivially removable.
- **If you find a regression in an earlier task while executing a later task**, fix inline and note it in the commit for the later task — don't leave the tree broken.

## Self-review (author's fresh-eyes pass)

Ran through the plan once the full thing was written:

- **Spec coverage**: all 14 acceptance criteria have an implementing task. Typography (Task 1 + 5 + 6), layout (Task 1 + 4), VIP float (Task 3), density toggle (Task 1 + 7), theme toggle (Task 1 + 8), status bar colors (Task 1 + 5), whole-row click (Task 10), side panel (Task 10), hover actions (Task 11), empty states (Task 12), stale cache (Task 12), pre-existing bug fix (Task 2), keyboard (Task 13), smoke test (Task 14). Existing `slackTriageOverrides.v1` is preserved because we never touch the `LS_KEY`, `overrideFor`, `effectiveItem`, `loadOverrides`, `saveOverrides` functions.
- **Placeholder scan**: no "TBD" / "TODO" / "similar to task N" references. Every code step has complete code.
- **Type consistency**: localStorage keys are spelled consistently (`slacklens.theme`, `slacklens.density`, `slacklens.lastFilter` — though `lastFilter` isn't actually implemented in this plan; the spec calls it a nice-to-have that can be added later). Function names are stable: `applyDensity`, `applyTheme`, `applyFilter`, `updateCounts`, `updateFreshness`, `bootDensity`, `bootTheme`, `bootFilters`, `bootSidePanel`, `bootKeyboard`, `openPanel`, `closePanel`, `renderChannel`, `renderItem`, `partitionByChannel`, `handleRowAction`, `openMenu`, `closeOpenMenu`, `openStatusMenu`, `openSnoozeMenu`, `snooze`, `humanAge`, `threadMessagesFor`, `findItem`, `checkSchemaBanner`. All referenced in multiple tasks with matching signatures.
- **Scope check**: 14 tasks, each 2-6 small steps. Total implementable in a few focused hours by someone who can hold the template in context.

One gap noticed: **`slacklens.lastFilter` persistence** is in the spec's override table but not implemented in this plan. Call-out in "Out of scope for this plan": treat as future enhancement. The spec permits this because it also lists it in the same table as defaults kicking in when absent.
