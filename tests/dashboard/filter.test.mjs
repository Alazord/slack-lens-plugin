import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDashboard, loadFixture } from './harness.mjs';

function shownChannels(t, filter) {
  t.filter = Object.assign({ scope: 'all', status: [], query: '', showSnoozed: false }, filter);
  return new Set(t.applyFilter(t.items).map(it => it.channel_id));
}

test('Mentions scope shows only items that tag me', () => {
  const t = loadDashboard({ cache: loadFixture() });
  const shown = shownChannels(t, { scope: 'mentions' });
  assert.ok(shown.has('C_PROJ'), 'C_PROJ shown');
  assert.ok(!shown.has('C_REL'), 'C_REL hidden (no mention)');
  assert.ok(!shown.has('C_RAW'), 'C_RAW hidden (no mention)');
});

test('computeCounts.mentions counts mention items over the full set', () => {
  const t = loadDashboard({ cache: loadFixture() });
  const { counts } = t.computeCounts(t.items);
  assert.equal(counts.mentions, 2, 'C_PROJ + C_OPS tag me');
  assert.equal(counts.all, t.items.length, 'All = total item count');
});
