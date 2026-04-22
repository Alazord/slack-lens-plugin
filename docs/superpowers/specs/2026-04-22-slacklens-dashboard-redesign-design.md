# SlackLens dashboard redesign — design

**Date:** 2026-04-22
**Status:** approved for planning
**Author:** Shailendra Singh (with Claude)
**Scope:** `skills/slacklens-refresh/references/dashboard.template.html` + any supporting hook points in `slacklens-setup/SKILL.md` and `slacklens-refresh/SKILL.md`

## Why

Today's dashboard works but each item card is too dense to scan during a 5–10 minute triage session. Status badges shout on every card (every item reads as "AWAITING YOUR REPLY"), names repeat 2–3× inside a single card, and the two-column split (Leadership & Groups | DMs) hides the most useful organizing axis: the channel the message belongs to.

The user works in 5–10 minute triage bursts on a MacBook Pro / large external monitor. Readability and per-item controls matter more than quick-glance speed. The redesign reorganizes around channels, adds a density toggle, dials back chromatic noise, and introduces a warm-night dark mode — without breaking the user's existing per-item overrides or changing the cache schema.

## What changes (TL;DR)

1. **Primary grouping = channel.** VIP channels float to the top; everything else flows chronologically by last activity. Drops the three-bucket left column (Leadership / DM / Other) and the separate DM right column.
2. **Density is a user toggle** — Compact / Balanced / Spacious — not a fixed decision. Persists to `localStorage`.
3. **Two-column layout via CSS `columns`** when viewport ≥ 1024px; collapses to single column below. Max-width 1800px.
4. **"Editorial calm" aesthetic**: warm cream surface, soft-black ink, serif for message bodies, sans for UI, mono for timestamps and numbers. Light + warm-night dark.
5. **Status bars collapse from six to four colors** (Needs reply / Active / Waiting / Done). Underlying data model keeps all six statuses.
6. **Whole row is clickable** → opens side panel with full thread and actions. Per-row `...` menu reveals on hover.
7. **Fixes a pre-existing side-panel wiring bug** (listeners attaching to elements that haven't been parsed yet).

No change to: the Slack fetch flow, the cache schema, the refresh skill contract, the setup skill contract, the scheduled-task registration, or `fixtures/cache.sample.json`. This is a presentation-layer redesign.

## Decisions log

| # | Question | Decision |
|---|---|---|
| 1 | Use context? | 5–10 min triage sessions. Readability + per-item controls > glance speed. |
| 2 | Biggest friction? | Too much information inside a single item card. |
| 3 | Density philosophy? | Ship three levels as a user-switchable toggle (A/B/C). |
| 4 | Primary grouping? | Channels, items sorted newest-first inside each channel. |
| 5 | VIP treatment? | Float VIP channels to top; text-only "VIP" tag on the channel header (no pill). |
| 6 | Column count? | Two columns on desktop (≥1024px), single below. |
| 7 | Aesthetic? | Editorial calm — warm cream, serif message bodies. |
| 8 | Dark mode? | Yes, as a warm-night sibling (brown-black, warm ink). |
| 9 | Size scale? | +1 across the board from initial proposal (Balanced body = 13px). |
| 10 | Status bar colors? | Collapse from 6 statuses to 4 bar colors. |
| 11 | Row click target? | Whole row → side panel. Actions on hover. |
| 12 | Chronological-only view? | Deferred to a future iteration. Structure supports adding as a 4th mode. |

---

## Section 1 — Typography

### Families (system-only, no network fonts)

| Role | Stack | When it appears |
|---|---|---|
| Serif | `"Iowan Old Style", "Palatino", "Hoefler Text", Georgia, serif` | Message bodies, page title "SlackLens". |
| Sans | `-apple-system, BlinkMacSystemFont, "Inter", "SF Pro Text", "Segoe UI", Roboto, sans-serif` | Channel names, sender names, all UI controls. |
| Mono | `"SF Mono", "IBM Plex Mono", "JetBrains Mono", Menlo, Consolas, monospace` | Timestamps, counts, freshness meta, any numeric metadata. |

### Size scale (px) — density-dependent

| Token | Compact | Balanced | Spacious | Used for |
|---|---|---|---|---|
| `--fs-xs` | 10 | 11 | 12 | VIP tag, thread-participant line |
| `--fs-sm` | 11 | 12 | 13 | Timestamps, channel meta, sender names |
| `--fs-base` | 12 | 13 | 14 | Message body text (serif) |
| `--fs-md` | 13 | 14 | 15 | Channel header name |
| `--fs-lg` | 15 | 16 | 17 | Topbar title, section labels |

### Weights

Only three used:

- **400** — serif message body.
- **500** — sender names (item row), density-toggle inactive segments.
- **600** — channel names, topbar title, active pills, primary buttons.

VIP tag uses 700 because it's uppercase letter-spaced at 10–12px — it needs the extra weight to register.

### Line height

- `1.4` for message body.
- `1.2` for single-line labels, names, and topbar elements.

### Opinionated choice — serif message body

The serif on message bodies is the distinguishing choice. Every other dashboard uses sans. If message text ever reads "slow to scan" in practice, flip `--fs-base` to the sans stack; identity degrades, scan speed recovers. Document this as an escape hatch; do not design for it by default.

### Color palette — full token enumeration

| Token | Light theme | Dark theme | Role |
|---|---|---|---|
| `--surface` | `#faf9f4` | `#1a1814` | Page background |
| `--surface-2` | `#fefdf8` | `#22201b` | Card / panel / input background, subtle elevation |
| `--border` | `#e8e5d9` | `#2e2b24` | Panel borders, buttons, inputs |
| `--border-faint` | `#eeeadd` | `#262420` | Dividers within panels (channel header, item row) |
| `--ink` | `#2a2822` | `#ede8d6` | Primary text — channel names, titles, sender names |
| `--ink-muted` | `#5a5648` | `#b0a991` | Secondary text — message body, secondary UI |
| `--ink-faint` | `#908b78` | `#8a8270` | Tertiary text — meta, timestamps, inactive controls |
| `--vip-red` | `#b64535` | `#e87b68` | VIP tag text color |
| `--status-red` | `#b64535` | `#e87b68` | Status bar — Needs reply (aliased to `--vip-red`) |
| `--status-amber` | `#b8821f` | `#d4a33a` | Status bar — Active / In progress / Discussion |
| `--status-gray` | `#d6d0bd` | `#4a4539` | Status bar — Waiting / Backlog |
| `--status-green` | `#5a7f5a` | `#7ea97e` | Status bar — Done |

All tokens declared on `:root` (light defaults) and overridden on `:root[data-theme="dark"]`.

---

## Section 2 — Layout grid + spacing rhythm + density deltas

### Grid

- **≥1024px viewport**: two columns via CSS `columns: 2` + `break-inside: avoid` on each channel group. Auto-balances without hand-assigning channels to sides.
- **<1024px**: single column.
- **Max-width**: `1800px`, centered when wider. Prevents overlong lines on external monitors.

### VIP float mechanism

In the normalize step, partition channels into `vipChannels` and `otherChannels`. Render `vipChannels` first into the column flow, then `otherChannels`. Both lists use the same per-channel component; the only signal is the `VIP` tag on the channel header. No "EVERYTHING ELSE" divider.

### Spacing tokens (4px base unit)

| Token | Compact | Balanced | Spacious | Controls |
|---|---|---|---|---|
| `--item-py` | 4 | 6 | 10 | Vertical padding inside each item row |
| `--item-gap` | 2 | 4 | 6 | Space between items within a channel |
| `--channel-mb` | 12 | 16 | 24 | Gap between channel groups |
| `--col-gap` | 16 | 20 | 24 | Gutter between the two columns |
| `--frame-pad` | 20 | 24 | 32 | Outer page padding |
| `--chanhead-py` | 4 | 6 | 8 | Channel header vertical padding |

### Fixed across densities

- **Status bar width**: 2px. Signal, not decoration; should not grow.
- **Border thicknesses**: 1px everywhere.
- **Side panel width**: 420px (≥900px viewport), full viewport below.

### Column fill semantics

`columns: 2` creates an unbalanced-left-heavier flow by browser default. Acceptable: reading order stays top-left → bottom-left → top-right → bottom-right; VIPs land in the user's first scan regardless.

---

## Section 3 — Components

### Channel header

```
[channel name] [VIP?]                               [latest time · count]
─────────────────────────────────────────────────────────────────────────
```

- **Name** (left): sans, `--fs-md`, weight 600, `letter-spacing: -0.01em`, color `--ink`.
- **VIP tag** (inline after name, conditional): sans, `--fs-xs`, weight 700, uppercase, `letter-spacing: 0.05em`, color `--vip-red`, `margin-left: 6px`. Text only; not a pill.
- **Meta** (right): mono, `--fs-sm`, color `--ink-faint`, `font-variant-numeric: tabular-nums`. Format: `HH:MM · N` where `N` is the item count in this channel (omit ` · N` when N=1).
- **Bottom border**: `1px solid var(--border-faint)`.

### Item row

```
│ Jane Doe                                             22:30
│ ye a gaya office mei?
│ 16 msgs · Darshan, Raksha +3       (row 3, conditional)
```

- **Grid**: 2px status bar + content column.
- **Row 1**: sender name left (sans, `--fs-sm`, weight 500), timestamp right (mono, `--fs-sm`, `--ink-faint`).
- **Row 2**: message body (**serif**, `--fs-base`, `--ink-muted`, `line-height: 1.4`, single line with `text-overflow: ellipsis`).
- **Row 3** (conditional): thread meta — sans, `--fs-xs`, `--ink-faint`. Format: `N msgs · <first 2 other participants>[ +<remaining>]`. Renders only when `msg_count > 1` AND at least one other participant exists.
- **Between items**: `1px solid var(--border-faint)` bottom border (suppressed on last).
- **Hover**: subtle background tint (`--surface-2`) + reveal-on-hover `...` action cluster at the right edge.
- **Active (side panel open on this item)**: status bar gets a soft glow — `box-shadow: 0 0 0 3px rgba(status-color, 0.15)`.

### Status bar — four colors total

| Meaning | Token | Light | Dark | Maps from data-model statuses |
|---|---|---|---|---|
| Needs your reply | `--status-red` | `#b64535` | `#e87b68` | `AWAITING YOUR REPLY` |
| Active conversation | `--status-amber` | `#b8821f` | `#d4a33a` | `IN PROGRESS`, `DISCUSSION` |
| Waiting / parked | `--status-gray` | `#d6d0bd` | `#4a4539` | `WAITING`, `BACKLOG` |
| Done | `--status-green` | `#5a7f5a` | `#7ea97e` | `DONE` |

Data model tracks all six statuses unchanged. Only visual bar color collapses. Per-item status reclassification remains available from the side panel status dropdown and the row's `...` menu — writes to the existing `slackTriageOverrides.v1` key.

### VIP tag

Defined under Channel header above. Inline only; never wraps.

### Empty states

Three variants, rendered in a centered card:

| State | Title | Body | Action |
|---|---|---|---|
| No cache | "No cache loaded yet" | "Run a refresh to populate the dashboard." | `[Reload]` button |
| Filter matches zero | "Nothing matches" | "Your filter didn't match any threads." | `[Clear filter]` |
| Genuinely empty | "Nothing in the last 48 hours" | "Catch your breath." | (none) |

The third state is calm, not apologetic — an empty inbox is success, not failure.

---

## Section 4 — Controls

Two horizontal strips at the top of the page.

### Row 1 — Chrome

```
SlackLens                            21 · just now   ☾   ↻ Reload
```

- **Wordmark** "SlackLens" left, sans 600, `--fs-lg`, color `--ink`.
- **Freshness meta** mono, `--fs-sm`, `--ink-faint`. Format: `{total} · {relative time}`. Absolute time available in tooltip. Color shifts to `--status-amber` when `last_refresh` age exceeds `STALE_CACHE_HOURS` (constant, default `12` — should be `auto_refresh_hours × 1.5` as a rule of thumb; update together if cadence changes).
- **Theme toggle**: 28px circular icon button. ☾ when light, ☼ when dark. Click cycles `auto → light → dark → auto`. Title attribute indicates next action.
- **Reload button**: pill, sans 500, `--fs-sm`. Icon `↻` + text "Reload". Tooltip: last-refresh ISO time.

### Row 2 — Toolbar

Three logical groups, thin vertical dividers between:

**Group A — Category filters (counts inline):**
`All 21` · `Needs reply 17` · `Mentions 8` · `DMs 9` · `Channels 12`

Pills sans `--fs-sm`. Counts inside each pill in mono `--fs-xs`. Active pill: `--ink` background, `--surface` text, count opacity 0.7. Clicking another pill in the group swaps active (single-select).

**Group B — Status filters** (multi-select, AND'd with category):
`Backlog` · `In progress` · `Waiting` · `Done`

**Group C — Search + density + snoozed**:
- **Search** input with magnifier icon, `Search channel, person, text…` placeholder. Focus via `/`. Debounced 150ms.
- **Density segmented** `[Compact | Balanced | Spacious]`. Active segment: `--ink` background, `--surface` text.
- **Show snoozed** switch. 26×14px track, 10px knob. Off by default.

### Row behavior on item click/hover

- **Click row → opens side panel** with full thread + actions. Shift from today, where the row itself isn't clickable and users must click "Open in Slack."
- **Hover row → reveals `...` action menu** at the right edge. Icon buttons + `aria-label`:
  - `◐` — Change status (opens a small inline menu with the six status options)
  - `☾` — Snooze (opens snooze submenu: 1h · until 9am tomorrow · custom)
  - `✓` — Mark done (one-click; writes `status: DONE` to overrides)
  - `↗` — Open in Slack (uses permalink or derived `WORKSPACE_ORIGIN`)
  - `⎘` — Copy permalink to clipboard
- **Right-click → same menu** as `...` for keyboard-averse users.

---

## Section 5 — Interactions

### Theme switching

- **Default**: `prefers-color-scheme: dark` media query sets initial theme.
- **User override**: `slacklens.theme` localStorage key (`light` | `dark` | `auto`, default `auto`). Override beats media query.
- **Mechanism**: CSS custom properties under `:root` (light) and `:root[data-theme="dark"]`. JS reads `localStorage`, checks `matchMedia`, sets `data-theme` on `<html>`.
- **Transition**: `transition: color 150ms, background-color 150ms` on root elements. No transforms (avoids scroll jank).

### Density switching

- **Persist**: `slacklens.density` (`compact` | `balanced` | `spacious`, default `balanced`).
- **Mechanism**: flip `data-density` attribute on `<html>`. All density tokens cascade from that. Pure CSS; no re-render.

### Side panel

- **Open**: click item row. Panel slides in from right, 420px wide (desktop), full viewport below 900px.
- **Contents**: full thread, participant list, status dropdown, snooze menu, "Open in Slack" button, "Copy permalink" button, private note textarea.
- **Close**: X button, outside click, or `ESC`. One panel at a time.
- **Focus management**: on open, move focus into panel; on close, return to the triggering row.
- **Pre-existing wiring bug fix**: today's template attaches listeners to panel DOM elements before the DOM has parsed them, so the panel never responds. Fix: move `<div id="sidePanel">` markup above the `<script>` tag. (Alternative: wrap listener setup in `DOMContentLoaded`. Choose markup-first for simplicity.)

### Override persistence — all keys

| Key | Value | Default | Purpose |
|---|---|---|---|
| `slackTriageOverrides.v1` | `{itemKey: {status, snooze_until, note}}` | `{}` | **Unchanged.** Preserves existing user data. |
| `slacklens.theme` | `light` \| `dark` \| `auto` | `auto` | Theme preference. |
| `slacklens.density` | `compact` \| `balanced` \| `spacious` | `balanced` | Density preference. |
| `slacklens.lastFilter` | `{scope, status[], query, showSnoozed}` | defaults | Restore last filter on reload. |

### Snooze

- Snooze options from row `...` menu or side panel: **1 hour**, **until tomorrow 9am**, **custom picker**.
- Writes `snooze_until` (ISO timestamp) into `slackTriageOverrides.v1`.
- When `Show snoozed` is off: snoozed items omitted from render.
- When on: snoozed items render at `opacity: 0.5` with a small ☾ glyph on the status bar.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `/` | Focus search input |
| `R` | Reload cache |
| `T` | Cycle theme (auto → light → dark → auto) |
| `D` | Cycle density (compact → balanced → spacious → compact) |
| `ESC` | Close side panel, or clear focus from a focused input |
| `J` / `K` | Next / previous item (nice-to-have; cut if timeline threatens) |

All shortcuts ignored when a text input is focused, except `ESC`.

### Accessibility

- Visible focus rings on all interactive elements (`:focus-visible` outline).
- Tab order: topbar → toolbar → content column 1 → content column 2 → side panel (when open).
- Semantic HTML: `<button>` for buttons, `<input>` for search, etc. No click-handlers on `<div>`.
- ARIA: `aria-label` on icon-only controls (theme toggle, close-panel, hover action buttons). `aria-expanded` on collapsible regions if any appear.
- Color-only status signaling fails for color-blind users — mitigated by the status also being readable as text inside the side panel and the `...` menu labels.

---

## Section 6 — Edge cases, migration, out of scope

### Content edge cases

| Case | Behavior |
|---|---|
| Channel with 1 item | Render same way — header + 1 row. No collapse. |
| Very long channel names | Max-width + `text-overflow: ellipsis`; full name in `title` attribute. |
| Very long messages | Single-line ellipsis in the row; full text shown in side panel thread. |
| Group DM channel names | Keep today's prettifier — `Group DM (A, B, C)` → `Group · A, B +1`. |
| Many VIPs (10+) | Render all. User configured them intentionally. |
| No permalinks anywhere | `WORKSPACE_ORIGIN` falls back to `https://slack.com` (shipped in v0.2.0 bug-fix pass). |
| Channel name with only `#` | Render as `#` — don't break on edge input. |

### Data-state edge cases

- **Empty cache (first install)**: "No cache loaded yet" empty state; reload button.
- **Stale cache (>12h old)**: freshness meta color shifts to `--status-amber` automatically.
- **Old-schema cache** (pre-v0.2.0 keys `dms_received` / `outgoing_dms` present instead of `mentions` / `dms` / `channels`): on load, detect missing keys and render a dismissable banner: "Your cache predates v0.2.0 — run `refresh slacklens` to rebuild." Don't attempt to auto-migrate the cache (the refresh skill does that correctly).
- **Live-fetch fails during reload**: existing fallback to embedded cache fires; banner: "Showing embedded cache — live refresh failed (<error>)."

### Migration from today's dashboard

- **Per-item overrides** (`slackTriageOverrides.v1`): untouched. Users keep snoozes, status changes, and notes.
- **New preference keys**: absent on first load → safe defaults. No user-visible step required.
- **Cron 2h → 8h**: existing users still on 2h until they re-run `set up slacklens`. The v0.2.0 bug-fix added delete-before-create so re-running setup migrates cleanly.
- **Template on disk**: `set up slacklens` re-copies the template; `refresh slacklens` re-injects the cache blob. Either path produces the new visual — no manual migration step.
- **Filter semantics**: the five categories (All / Needs reply / Mentions / DMs / Channels) and six statuses are unchanged. Only the visual treatment of status bars collapses to four colors.

### Pre-existing bugs fixed in this pass

- **Side-panel wiring** (template lines ~1033–1060): listeners attach to DOM nodes that haven't been parsed. Fix by moving the side-panel markup above the `<script>` tag. Confirms listeners attach to real nodes at parse time.

### Intentionally out of scope

- **Chronological-only mode** (drop channel groups, sort all items by timestamp). Deferred. Structure accommodates it as a future 4th view mode.
- **Desktop notifications / toasts** when VIP messages land.
- **Customizable color palette** beyond the two provided themes.
- **Multi-workspace support**: plugin remains single-workspace.
- **Keyboard item selection (J/K)**: ship if trivial, cut if it threatens timeline.
- **Custom font loading**: no webfont pipeline; system-only.

---

## Acceptance criteria

The redesign is shippable when:

1. **Structure**: channels are the primary grouping; VIP channels render first; items inside a channel are newest-first.
2. **Density toggle**: Compact / Balanced / Spacious all present and functional; the active mode persists across reloads via `slacklens.density`.
3. **Theme toggle**: ☾/☼ control in the topbar cycles `auto → light → dark → auto`; persists via `slacklens.theme`; `prefers-color-scheme` drives the `auto` default.
4. **Layout**: 2-column on ≥1024px viewports (using `columns: 2` + `break-inside: avoid`); single column below; max-width 1800px.
5. **Typography**: system stacks only; three font families as specified; size scale applies per density.
6. **Status bars**: four colors render correctly in both themes; per-item overrides still round-trip via `slackTriageOverrides.v1`.
7. **Item interactions**: whole row is clickable → side panel opens; hover reveals action menu; right-click shows same menu.
8. **Side panel**: opens, renders full thread, supports status / snooze / done / open-in-Slack / copy-permalink / private note; closes via X / outside-click / ESC.
9. **Empty states**: all three variants render with correct copy.
10. **Existing data preserved**: `slackTriageOverrides.v1` contents survive across the template swap.
11. **Pre-existing side-panel wiring bug**: fixed; listeners attach successfully on load.
12. **Accessibility**: visible focus rings, tab order through topbar → toolbar → content → side panel, icon-only buttons have `aria-label`.
13. **No regressions** in the cache-injection path (validated by the v0.2.0 lambda fix, unchanged here).
14. **Document review**: the generated `dashboard.html` for a real user (post `set up slacklens` + `refresh slacklens`) renders without console errors.

## Open questions (non-blocking)

None. All Section-level decisions are ratified.
