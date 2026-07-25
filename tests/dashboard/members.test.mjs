import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDashboard, loadFixture } from './harness.mjs';

// A bare "Group DM" heading is uninformative — surface the members, derived
// from the folded messages' senders, dropping me.
test('groupMembersLabel lists members, drops me, caps at 3 + overflow', () => {
  const t = loadDashboard({ cache: loadFixture('cache.routing.json'), me: { slack_id: 'U_ME', name: 'Me' } });
  const items = [
    { participants: ['Hatim', 'Me'] },
    { participants: ['Abhinav Singi', 'Hatim'] },
    { participants: ['Abhay Sharma'] },
    { participants: ['Dana'] },
  ];
  assert.equal(t.groupMembersLabel(items), 'Hatim, Abhinav Singi, Abhay Sharma +1');
});

test('groupMembersLabel is empty when only I am present', () => {
  const t = loadDashboard({ cache: loadFixture('cache.routing.json'), me: { slack_id: 'U_ME', name: 'Me' } });
  assert.equal(t.groupMembersLabel([{ participants: ['Me'] }]), '');
  assert.equal(t.groupMembersLabel([]), '');
});

test('groupMembersLabel dedupes repeated senders across messages', () => {
  const t = loadDashboard({ cache: loadFixture('cache.routing.json'), me: { slack_id: 'U_ME', name: 'Me' } });
  const items = [{ participants: ['Hatim'] }, { participants: ['Hatim'] }, { participants: ['Abhay'] }];
  assert.equal(t.groupMembersLabel(items), 'Hatim, Abhay');
});
