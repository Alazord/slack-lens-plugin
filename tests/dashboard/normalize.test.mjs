import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDashboard, loadFixture } from './harness.mjs';

test('is_mention is true exactly when ME_ID is mentioned in the thread', () => {
  const t = loadDashboard({ cache: loadFixture() });
  const byChan = Object.fromEntries(t.items.map(it => [it.channel_id, it]));
  assert.equal(byChan['C_PROJ'].is_mention, true,  'C_PROJ tags me');
  assert.equal(byChan['C_OPS'].is_mention,  true,  'C_OPS Bob tagged me');
  assert.equal(byChan['C_REL'].is_mention,  false, 'C_REL does not tag me');
  assert.equal(byChan['C_RAW'].is_mention,  false, 'C_RAW does not tag me');
});
