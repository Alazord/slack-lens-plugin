import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDashboard, loadFixture } from './harness.mjs';

// DMs carry no real thread_ts — the cache stores the sentinel "convo" as the
// thread key/ts, and DM messages often arrive with an empty permalink. The
// derived link must NEVER splice the sentinel into a /p<ts> path (the old bug
// produced ".../archives/<cid>/pconvo", a dead link).
test('deriveThreadPermalink never builds /pconvo from the "convo" sentinel', () => {
  const t = loadDashboard({ cache: loadFixture('cache.routing.json') });
  const link = t.deriveThreadPermalink(
    { channel_id: 'D123', thread_ts: 'convo' },
    { ts: '1784915043.0', permalink: '' });
  assert.ok(!/pconvo/.test(link), `no pconvo in ${link}`);
  assert.match(link, /\/archives\/D123\/p1784915043/, 'built from the real message ts');
});

test('deriveThreadPermalink prefers a present message permalink verbatim', () => {
  const t = loadDashboard({ cache: loadFixture('cache.routing.json') });
  const link = t.deriveThreadPermalink(
    { channel_id: 'C1', thread_ts: '1700000010.000100' },
    { ts: '1700000010.0', permalink: 'https://x.slack.com/archives/C1/p1700000010000100' });
  assert.equal(link, 'https://x.slack.com/archives/C1/p1700000010000100');
});

test('deriveThreadPermalink ignores non-timestamp sentinels (convo/top_level)', () => {
  const t = loadDashboard({ cache: loadFixture('cache.routing.json') });
  for (const sentinel of ['convo', 'top_level', 'top']) {
    const link = t.deriveThreadPermalink(
      { channel_id: 'D9', thread_ts: sentinel },
      { ts: '1799999999.0', permalink: '' });
    assert.ok(!link.includes(sentinel), `${sentinel} must not appear in ${link}`);
    assert.match(link, /\/archives\/D9\/p1799999999/);
  }
});

test('deriveThreadPermalink falls back to the bare channel URL when no ts is usable', () => {
  const t = loadDashboard({ cache: loadFixture('cache.routing.json') });
  const link = t.deriveThreadPermalink(
    { channel_id: 'D0', thread_ts: 'convo' },
    { ts: '', permalink: '' });
  assert.match(link, /\/archives\/D0$/, 'bare channel link, no trailing /p');
});
