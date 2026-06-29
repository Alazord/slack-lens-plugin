import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDashboard, loadFixture } from './harness.mjs';

test('groupItems splits board / waiting / done / dropped / unknown', () => {
  const t = loadDashboard({ cache: loadFixture() });
  const g = t.groupItems(t.items);
  const ids = grp => new Set(g[grp].map(it => it.channel_id));
  assert.ok(ids('board').has('C_PROJ'),  'AWAITING -> board');
  assert.ok(ids('waiting').has('C_REL'), 'WAITING_ON_THEM -> waiting');
  assert.ok(ids('done').has('C_OPS'),    'DONE -> done');
  assert.ok(ids('unknown').has('C_RAW'), 'no inference -> unknown');
});

test('thread without inference gets status UNKNOWN, not a fake needs-reply', () => {
  const t = loadDashboard({ cache: loadFixture() });
  const raw = t.items.find(it => it.channel_id === 'C_RAW');
  assert.equal(raw.status, 'UNKNOWN');
  assert.equal(raw.needs_reply, false);
});
