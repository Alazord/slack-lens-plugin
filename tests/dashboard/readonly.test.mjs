import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDashboard, loadFixture } from './harness.mjs';

const TEMPLATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../../skills/slacklens-refresh/references/dashboard.template.html');

test('status reads straight from the item (no overrides indirection)', () => {
  const t = loadDashboard({ cache: loadFixture() });
  const proj = t.items.find(it => it.channel_id === 'C_PROJ');
  assert.equal(proj.status, 'AWAITING YOUR REPLY');
});

test('template no longer ships mutation/persistence code', () => {
  const html = fs.readFileSync(TEMPLATE, 'utf8');
  for (const dead of ['saveOverrides', 'openSnoozeMenu', 'LS_KEY', "dataset.action = 'snooze'", 'panelNote']) {
    assert.ok(!html.includes(dead), `expected "${dead}" to be removed`);
  }
});
