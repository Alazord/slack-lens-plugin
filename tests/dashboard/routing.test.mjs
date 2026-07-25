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

// The default (unfiltered) view curates: DISCUSSION/FYI are dropped, WAITING/
// DONE collapse into their own lanes. But an EXPLICIT filter is a query — it
// must surface exactly what matches, even statuses the default view hides.
test('laneLayout: unfiltered view keeps the curated routing', () => {
  const t = loadDashboard({ cache: loadFixture('cache.routing.json') });
  const lanes = t.laneLayout(t.items, false);
  const visible = new Set(
    [...lanes.band, ...lanes.board].map(it => it.status));
  assert.ok(!visible.has('DISCUSSION'), 'unfiltered: DISCUSSION stays dropped');
  assert.ok(!visible.has('FYI'),        'unfiltered: FYI stays dropped');
  // WAITING/DONE curated into their collapsed lanes, not the board.
  assert.ok(lanes.waiting.some(it => it.status === 'WAITING'), 'WAITING in its lane');
  assert.ok(lanes.done.some(it => it.status === 'DONE'),       'DONE in its lane');
});

test('laneLayout: an active filter surfaces every matched item, none dropped', () => {
  const t = loadDashboard({ cache: loadFixture('cache.routing.json') });
  const rendered = lanes =>
    [...lanes.band, ...lanes.board, ...lanes.waiting, ...lanes.unknown, ...lanes.done];
  for (const status of ['DISCUSSION', 'FYI', 'WAITING', 'DONE', 'BACKLOG', 'IN PROGRESS']) {
    t.filter = { scope: 'all', status: [status], query: '' };
    const shown = t.applyFilter(t.items);
    const lanes = t.laneLayout(shown, true);
    assert.equal(shown.length, 1, `${status}: fixture has exactly one match`);
    assert.equal(rendered(lanes).length, shown.length,
      `${status}: every matched item is rendered (was dropped before the fix)`);
    // Nothing hides in a collapsed lane under an explicit filter.
    assert.equal(lanes.waiting.length, 0, `${status}: no collapsed waiting lane`);
    assert.equal(lanes.done.length, 0,    `${status}: no collapsed done section`);
  }
});

test('computeCounts tallies the FYI pill (was stuck at 0)', () => {
  const t = loadDashboard({ cache: loadFixture('cache.routing.json') });
  const { statusCounts } = t.computeCounts(t.items);
  assert.equal(statusCounts.FYI, 1, 'FYI status is counted for its pill');
});

test('isVipPriority: any VIP item is band-worthy except DONE', () => {
  const t = loadDashboard({ cache: loadFixture('cache.routing.json') });
  const vip = status => ({ channel_is_vip: true, status });
  assert.equal(t.isVipPriority(vip('AWAITING_REPLY')), true);
  assert.equal(t.isVipPriority(vip('FYI')),            true,  'VIP FYI rescued');
  assert.equal(t.isVipPriority(vip('DISCUSSION')),     true,  'VIP DISCUSSION rescued');
  assert.equal(t.isVipPriority(vip('WAITING_ON_THEM')),true);
  assert.equal(t.isVipPriority({ channel_is_vip: true }), true, 'VIP no-status (UNKNOWN)');
  assert.equal(t.isVipPriority(vip('DONE')),           false, 'VIP DONE stays in Done');
  assert.equal(t.isVipPriority({ channel_is_vip: false, status: 'AWAITING_REPLY' }),
    false, 'non-VIP never band-promoted by this rule');
});

test('routeLanes: VIP override promotes non-DONE VIP items into the band', () => {
  // Alice sent the AWAITING thread, Eve the FYI thread; make both VIPs.
  const t = loadDashboard({
    cache: loadFixture('cache.routing.json'),
    vips: [{ id: 'U_ALICE', name: 'Alice' }, { id: 'U_EVE', name: 'Eve' }],
  });
  const lanes = t.routeLanes(t.items);
  const ids = arr => new Set(arr.map(it => it.channel_id));

  // A VIP whose status would drop it (FYI) is rescued into the band.
  assert.ok(ids(lanes.band).has('C_FYI'), 'VIP FYI reaches the band');
  // A VIP board item is promoted to the band AND removed from the board lane
  // (no double-render).
  assert.ok(ids(lanes.band).has('C_AWAIT'),   'VIP board item promoted to band');
  assert.ok(!ids(lanes.board).has('C_AWAIT'), 'promoted VIP item left the board lane');
  // Non-VIP items are untouched: board keeps its non-VIP tasks, and a non-VIP
  // DISCUSSION stays dropped (never in the band).
  assert.ok(ids(lanes.board).has('C_BACK'),  'non-VIP board item stays on board');
  assert.ok(!ids(lanes.band).has('C_DISC'),  'non-VIP DISCUSSION not band-promoted');
});
