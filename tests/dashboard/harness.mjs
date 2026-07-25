import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const TEMPLATE = path.join(REPO, 'skills/slacklens-refresh/references/dashboard.template.html');

function domStubContext() {
  const noop = () => {};
  const el = () => ({ classList: { add: noop, remove: noop, toggle: noop },
    setAttribute: noop, removeAttribute: noop, appendChild: noop, addEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [], style: {}, dataset: {},
    getBoundingClientRect: () => ({}), focus: noop, remove: noop });
  const ctx = {
    console,
    JSON, Math, Date, RegExp, Array, Object, String, Number, Boolean, URL, Set, Map,
    setTimeout: noop, clearTimeout: noop,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    navigator: { clipboard: { writeText: noop } },
    CSS: { escape: (s) => s },
    document: { getElementById: () => null, querySelector: () => null,
      querySelectorAll: () => [], addEventListener: noop, createElement: el,
      body: el(), documentElement: { setAttribute: noop, removeAttribute: noop } },
    window: { matchMedia: () => ({ matches: false, addEventListener: noop }),
      open: noop, addEventListener: noop, scrollY: 0 },
  };
  ctx.window = Object.assign(ctx.window, ctx);
  ctx.globalThis = ctx;
  return ctx;
}

export function loadDashboard({ cache, me = { slack_id: 'U_ME', name: 'Me' }, vips = [] }) {
  const html = fs.readFileSync(TEMPLATE, 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no <script> in template');
  let src = m[1]
    .replace(/const ME_ID\s*=\s*'[^']*'/, `const ME_ID = ${JSON.stringify(me.slack_id)}`)
    .replace(/const ME_NAME\s*=\s*'[^']*'/, `const ME_NAME = ${JSON.stringify(me.name)}`)
    .replace(/const VIP_IDS\s*=\s*\[[^\]]*\]/, `const VIP_IDS = ${JSON.stringify(vips.map(v => v.id))}`)
    .replace(/const VIP_NAMES\s*=\s*\[[^\]]*\]/, `const VIP_NAMES = ${JSON.stringify(vips.map(v => v.name))}`);
  // Prevent the DOM wire-up block from auto-running.
  src = src.replace(/\/\/ ---------- Wire up ----------[\s\S]*?loadCache\(\);/, '/* wire-up stripped */');
  // Expose internals (let/const aren't context globals in vm; closures are).
  src += `
;this.__t = {
  set raw(v){ raw = v }, get raw(){ return raw },
  get items(){ return items }, get filter(){ return filter }, set filter(v){ filter = v },
  normalize: (typeof normalize==='function'?normalize:undefined),
  applyFilter: (typeof applyFilter==='function'?applyFilter:undefined),
  computeCounts: (typeof computeCounts==='function'?computeCounts:undefined),
  groupItems: (typeof groupItems==='function'?groupItems:undefined),
  statusGroup: (typeof statusGroup==='function'?statusGroup:undefined),
  routeLanes: (typeof routeLanes==='function'?routeLanes:undefined),
  isVipPriority: (typeof isVipPriority==='function'?isVipPriority:undefined),
  partitionByChannel: (typeof partitionByChannel==='function'?partitionByChannel:undefined),
};`;
  const ctx = domStubContext();
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const t = ctx.__t;
  t.raw = cache;
  t.normalize();
  return t;
}

export function loadFixture(name = 'cache.v3.json') {
  return JSON.parse(fs.readFileSync(path.join(REPO, 'tests/fixtures', name), 'utf8'));
}
