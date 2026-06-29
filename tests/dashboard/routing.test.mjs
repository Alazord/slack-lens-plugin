import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDashboard, loadFixture } from './harness.mjs';

test('statusGroup routes each status to the right lane', () => {
  const t = loadDashboard({ cache: loadFixture('cache.routing.json') });
  const g = t.groupItems(t.items);
  const ids = grp => new Set(g[grp].map(it => it.channel_id));
  assert.ok(ids('board').has('C_AWAIT'),  'AWAITING_REPLY -> board');
  assert.ok(ids('board').has('C_BACK'),   'BACKLOG -> board');
  assert.ok(ids('board').has('C_PROG'),   'IN_PROGRESS -> board');
  assert.ok(ids('waiting').has('C_WAIT'), 'WAITING_ON_THEM -> waiting');
  assert.ok(ids('done').has('C_DONE'),    'DONE -> done');
  assert.ok(ids('dropped').has('C_DISC'), 'DISCUSSION -> dropped');
  assert.ok(ids('dropped').has('C_FYI'),  'FYI -> dropped');
  assert.ok(ids('unknown').has('C_RAW'),  'no inference -> unknown');
});

test('DISCUSSION and FYI never reach a visible lane', () => {
  const t = loadDashboard({ cache: loadFixture('cache.routing.json') });
  const g = t.groupItems(t.items);
  for (const grp of ['board', 'waiting', 'done']) {
    const statuses = new Set(g[grp].map(it => it.status));
    assert.ok(!statuses.has('DISCUSSION'), `${grp} excludes DISCUSSION`);
    assert.ok(!statuses.has('FYI'), `${grp} excludes FYI`);
  }
});
