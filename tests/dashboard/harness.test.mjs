import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDashboard, loadFixture } from './harness.mjs';

test('harness loads template and normalizes the fixture', () => {
  const t = loadDashboard({ cache: loadFixture() });
  assert.ok(Array.isArray(t.items), 'items is an array');
  assert.ok(t.items.length >= 4, `expected >=4 items, got ${t.items.length}`);
});
