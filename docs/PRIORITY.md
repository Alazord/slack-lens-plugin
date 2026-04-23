# How SlackLens ranks your threads

Every item on the dashboard carries a **score**. Score drives the order. The score is a sum of three things:

```
score = tier_base + recency_boost + user_override_penalty
```

## Tier base

The tier is the biggest signal. A higher tier always outranks a lower-tier item regardless of how fresh it is — a 5-hour-old **P0** still sits above a 30-second-old **P3**.

| Tier | Base | Rule | Example |
|---|---:|---|---|
| **P0** | 1000 | A priority contact directly addresses you | Manager DMs you; someone you marked priority tags you in a channel |
| **P1** |  500 | A priority contact is in the conversation but didn't tag you | Priority contact was CC'd or posted earlier in the thread |
| **P2** |  250 | You're mentioned somewhere, no priority contact involved | Teammate pings you in a channel |
| **P3** |  100 | A 1:1 DM, no priority contact involved | A casual check-in from a coworker |

"Priority contact" = anyone you marked during `set up slacklens`, or later via `change slacklens vips`. You can add, remove, or replace them at any time without rerunning setup.

## Recency boost

Within a tier, newer items sit higher. The boost is a 0–99 points scale that decays linearly over 48 hours: a new message gets ~99 points, a 24-hour-old one gets ~51, a 48-hour-old one gets ~3. Older than ~50 hours: the boost is 0 and the 48-hour window purge will drop the item on the next refresh anyway.

## User overrides

You can mark any item **DONE** or **snooze** it from the dashboard. Either action subtracts 2000 points — enough to push even a fresh P0 below a snoozed P0, which is the point. DONE/snoozed items don't vanish; they sink to the bottom.

## Channel ordering

The same idea applies at the channel level. A channel's position on the dashboard is driven by its highest-scoring item. A channel with one P0 ask floats above a channel full of P3 DMs, even if the DMs are fresher.

## Edge cases worth knowing

- **Multiple priority contacts in one thread** → the highest applicable tier wins (P0 beats P1).
- **A priority contact DMs you but doesn't @-mention you** → still P0 on 1:1 DMs (we know you're the only other person there).
- **Group DM where a priority contact tags you** → P0.
- **You sent a short reply (<15 chars) to an ask from someone else** → the ask still counts as open; we look back one message to score the real question, not your "ok" ack.
- **You were tagged but 2+ people posted after without you replying** → item flips to `WAITING` and drops out of your active list. The conversation moved on; you don't owe a reply.

## You don't have to set any priorities

SlackLens works without priority contacts configured. Everything just lands in P2 or P3, sorted by recency. You get a plain "things mentioning you in the last 48 hours" list. Adding priority contacts is how you get the tier distinction — it's opt-in depth, not a requirement.
