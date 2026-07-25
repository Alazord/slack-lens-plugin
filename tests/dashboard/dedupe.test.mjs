import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDashboard, loadFixture } from './harness.mjs';

const load = () => loadDashboard({ cache: loadFixture('cache.routing.json'), me: { slack_id: 'U_ME', name: 'Shailendra Singh' } });
const dm = (o) => ({ kind: 'dm', ...o });

test('dmParticipantKey keys a 1:1 DM by its members, order-independent', () => {
  const t = load();
  const a = t.dmParticipantKey(dm({ channel_name: 'DM with Abhinav Singi, Shailendra Singh' }));
  const b = t.dmParticipantKey(dm({ channel_name: 'DM with Shailendra Singh, Abhinav Singi' }));
  assert.equal(a, b, 'same members → same key regardless of order');
  assert.ok(a.includes('abhinav singi'));
});

test('dmParticipantKey returns null for non-DMs and for a nameless Group DM', () => {
  const t = load();
  assert.equal(t.dmParticipantKey({ kind: 'channel', channel_name: '#eng' }), null);
  assert.equal(t.dmParticipantKey(dm({ channel_name: 'Group DM' })), null, 'no members to key on');
});

test('dedupeDmConversations collapses one DM split across two channel_ids, keeping newest', () => {
  const t = load();
  const older = dm({ channel_id: 'D_STALE', channel_name: 'DM with Abhinav Singi, Shailendra Singh',
                     last_ts: 1000, last_text: 'merged' });
  const newer = dm({ channel_id: 'D_LIVE',  channel_name: 'DM with Abhinav Singi, Shailendra Singh',
                     last_ts: 2000, last_text: 'orbit gaps' });
  const out = t.dedupeDmConversations([older, newer]);
  assert.equal(out.length, 1, 'two ids for one DM collapse to one card');
  assert.equal(out[0].channel_id, 'D_LIVE', 'the most recently active card survives');
});

test('dedupeDmConversations preserves order and leaves distinct convos + channels alone', () => {
  const t = load();
  const abhinav = dm({ channel_id: 'D1', channel_name: 'DM with Abhinav Singi, Shailendra Singh', last_ts: 5 });
  const hatim   = dm({ channel_id: 'D2', channel_name: 'DM with Hatim, Shailendra Singh',         last_ts: 4 });
  const chan    = { kind: 'channel', channel_id: 'C1', channel_name: '#eng', last_ts: 3 };
  const out = t.dedupeDmConversations([abhinav, hatim, chan]);
  assert.equal(out.map(i => i.channel_id).join(','), 'D1,D2,C1', 'distinct convos untouched, order kept');
});

test('dedupeDmConversations collapses group DMs (MPIM) split across ids by member set', () => {
  const t = load();
  const g1 = dm({ channel_id: 'C_MPIM', channel_name: 'Group DM with Abhinav Singi, Harshit Davda, Shailendra Singh', last_ts: 9 });
  const g2 = dm({ channel_id: 'D_MPIM', channel_name: 'Group DM with Harshit Davda, Abhinav Singi, Shailendra Singh', last_ts: 8 });
  const out = t.dedupeDmConversations([g1, g2]);
  assert.equal(out.length, 1);
  assert.equal(out[0].channel_id, 'C_MPIM');
});
