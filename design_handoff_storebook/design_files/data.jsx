/* data.jsx — data model, zone templates, fridge seed data, helpers */

const ZONE_COLORS = ['blue', 'green', 'amber', 'pink', 'gray'];

// space type catalogue (onboarding screen 1)
const SPACE_TYPES = [
  { id: 'fridge',  icon: 'fridge',  title: 'Fridge',   desc: 'Shelves top to bottom, plus a door.', noun: 'Shelf' },
  { id: 'freezer', icon: 'snow',    title: 'Freezer',  desc: 'Stacked drawers or baskets.',        noun: 'Drawer' },
  { id: 'cellar',  icon: 'wine',    title: 'Cellar',   desc: 'Racks and bins for bottles & jars.', noun: 'Rack' },
  { id: 'cabinet', icon: 'cabinet', title: 'Cabinet',  desc: 'Shelves with front/back depth.',     noun: 'Shelf' },
  { id: 'list',    icon: 'dots',    title: 'Just a list', desc: 'No layout — one simple list.',     noun: 'Group' },
  { id: 'other',   icon: 'spark2',  title: 'Something else', desc: 'Start blank, shape it later.',  noun: 'Zone' },
];

// auto-generated zone templates per type. label === null -> shows "{noun} {position}"
const ZONE_TEMPLATES = {
  fridge:  [{}, {}, {}, { label: 'Door' }, { label: 'Vegetable drawer' }],
  freezer: [{}, {}, {}],
  cellar:  [{}, {}, {}, { label: 'Bottom bin' }],
  cabinet: [{ hasDepth: true }, { hasDepth: true }, { label: 'Floor', floor: true }],
  list:    [{ label: 'All items' }],
  other:   [{}, {}],
};

let _id = 0;
const uid = (p = 'id') => `${p}_${(++_id).toString(36)}${Date.now().toString(36).slice(-3)}`;

function buildZones(type) {
  const tmpl = ZONE_TEMPLATES[type] || ZONE_TEMPLATES.other;
  return tmpl.map((z, i) => ({
    id: uid('zone'),
    position: i + 1,
    label: z.label ?? null,
    color: ZONE_COLORS[i % ZONE_COLORS.length],
    gridCols: z.floor ? 0 : 4,
    gridRows: 1,
    hasDepth: !!z.hasDepth,
    floor: !!z.floor,
    kind: z.floor ? 'floor' : 'shelf',
    facing: 'front',      // front | left | right | back  (wall this shelf faces)
    levels: 1,            // vertical tiers (shelves) inside this unit; level 1 = top
    column: 0,
    rect: null,            // {x,y,w,h} on the free canvas
  }));
}

const FACINGS = [['front', 'Front'], ['left', 'Left'], ['right', 'Right'], ['back', 'Back']];
// spatial reading order for the Shelves view: left · front · right · back
const WALL_ORDER = ['left', 'front', 'right', 'back'];

// ---- layout geometry ----
const GRID_UNIT = 24;
const snapGrid = v => Math.round(v / GRID_UNIT) * GRID_UNIT;

function zoneFootprint(z) {
  if (z.floor) return { w: 312, h: 120 };
  const h = 52 + Math.max(1, z.gridRows || 1) * 64 + (z.hasDepth ? 30 : 0);
  return { w: 312, h: snapGrid(h) };
}

// flow zones into two columns on the free canvas (shortest-column packing)
function flowFreeform(zones) {
  const x = [24, 360];
  const colY = [24, 24];
  zones.forEach(z => {
    const c = colY[0] <= colY[1] ? 0 : 1;
    const fp = zoneFootprint(z);
    z.rect = { x: x[c], y: colY[c], w: fp.w, h: fp.h };
    z.column = c;
    colY[c] += fp.h + 24;
  });
  return zones;
}

// split zones into n contiguous columns
function assignColumns(zones, n) {
  const per = Math.ceil(zones.length / n);
  zones.forEach((z, i) => { z.column = Math.min(n - 1, Math.floor(i / per)); });
  return zones;
}

// apply the onboarding complexity choice to a space
function applyComplexity(space, complexity) {
  if (complexity === 'twodoors') {
    space.canvasMode = 'columns';
    space.layoutColumns = 2;
    space.columnLabels = ['Left', 'Right'];
    assignColumns(space.zones, 2);
  } else if (complexity === 'draw') {
    space.canvasMode = 'freeform';
    space.layoutColumns = 1;
    space.columnLabels = null;
    flowFreeform(space.zones);
  } else {
    space.canvasMode = 'columns';
    space.layoutColumns = 1;
    space.columnLabels = null;
    space.zones.forEach(z => { z.column = 0; });
  }
  return space;
}

const SPACE_NOUN = Object.fromEntries(SPACE_TYPES.map(s => [s.id, s.noun]));
function zoneName(zone, type = 'fridge') {
  if (zone.label) return zone.label;
  const noun = zone.kind === 'drawer' ? 'Drawer'
    : zone.kind === 'floor' ? 'Floor'
    : (SPACE_NOUN[type] || 'Shelf');
  return `${noun} ${zone.position}`;
}

// ---- dates ----
const DAY = 86400000;
const now = () => Date.now();
const inDays = (n) => new Date(now() + n * DAY).toISOString();
function daysUntil(iso) {
  if (!iso) return null;
  return Math.round((new Date(iso) - now()) / DAY);
}
function expiryStatus(iso) {
  const d = daysUntil(iso);
  if (d === null) return null;
  if (d < 0) return 'gone';
  if (d === 0) return 'today';
  if (d <= 3) return 'soon';
  return 'ok';
}
function expiryLabel(iso) {
  const d = daysUntil(iso);
  if (d === null) return null;
  if (d < 0) return `${Math.abs(d)}d ago`;
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d <= 14) return `${d} days`;
  const dt = new Date(iso);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---- fridge seed ----
function seedFridge() {
  const zones = buildZones('fridge');
  const [s1, s2, s3, door, veg] = zones;
  const mk = (name, zoneId, quantity, expDays, tags = []) => ({
    id: uid('item'), name, zoneId, quantity,
    tags, dateAdded: inDays(-Math.floor(Math.random() * 8) - 1),
    expiry: expDays == null ? null : inDays(expDays),
    photo: null, slotIndex: null, depth: 'front', level: 1,
  });
  const items = [
    mk('Milk', s1.id, 1, 3, ['dairy', 'open']),
    mk('Leftover pasta', s1.id, 1, 1, ['leftovers']),
    mk('Orange juice', door.id, 1, 2, ['drinks']),
    mk('Eggs', s2.id, 12, 16, ['dairy']),
    mk('Greek yogurt', s2.id, 4, 9, ['dairy']),
    mk('Leftover curry', s3.id, 1, 0, ['leftovers', 'spicy']),
    mk('Cheddar', s3.id, 1, 24, ['dairy']),
    mk('Butter', door.id, 1, 30, ['dairy']),
    mk('Ketchup', door.id, 1, 120, ['condiment']),
    mk('Carrots', veg.id, 1, 12, ['veg']),
  ];
  // assign slot indices in order per zone
  const counter = {};
  items.forEach(it => {
    counter[it.zoneId] = (counter[it.zoneId] ?? -1) + 1;
    it.slotIndex = counter[it.zoneId];
  });
  return {
    id: uid('space'), name: 'My fridge', type: 'fridge',
    viewMode: 'list', canvasMode: 'columns', layoutColumns: 1, columnLabels: null,
    zones, items,
  };
}

// parse "milk, top shelf x2"  ->  { name, zoneHint, quantity }
function parseAdd(raw) {
  let s = raw.trim();
  let quantity = 1;
  const qm = s.match(/\s*[x×]\s*(\d{1,3})\s*$/i) || s.match(/\s+(\d{1,3})\s*$/);
  if (qm) { quantity = parseInt(qm[1], 10); s = s.slice(0, qm.index).trim(); }
  let zoneHint = null;
  const parts = s.split(',');
  if (parts.length > 1) { zoneHint = parts.slice(1).join(',').trim(); s = parts[0].trim(); }
  const name = s.charAt(0).toUpperCase() + s.slice(1);
  return { name, zoneHint, quantity };
}

// match a free-text zone hint to an existing zone
function matchZone(hint, zones, type) {
  if (!hint) return null;
  const h = hint.toLowerCase();
  // direct label / name match
  for (const z of zones) {
    if (zoneName(z, type).toLowerCase() === h) return z;
  }
  for (const z of zones) {
    const nm = zoneName(z, type).toLowerCase();
    if (nm.includes(h) || h.includes(nm)) return z;
  }
  // positional words
  if (/top|first|upper/.test(h)) return zones[0];
  if (/bottom|last|lower/.test(h)) return zones[zones.length - 1];
  if (/middle|mid/.test(h)) return zones[Math.floor(zones.length / 2)];
  if (/door/.test(h)) return zones.find(z => /door/i.test(z.label || ''));
  if (/veg|crisper|drawer/.test(h)) return zones.find(z => /veg|drawer/i.test(z.label || ''));
  return null;
}

// ============================================================
//  Plans, limits & account
// ============================================================
const PLANS = {
  free: {
    id: 'free', name: 'Free', tagline: 'For a shelf or two.',
    priceM: 0, priceY: 0,
    spaces: 2, zones: 6, items: 50,
    photos: false, sync: false, history: false,
  },
  pro: {
    id: 'pro', name: 'Pro', tagline: 'For the whole kitchen.',
    priceM: 5, priceY: 48,            // $48/yr ≈ $4/mo — save 20%
    spaces: Infinity, zones: Infinity, items: Infinity,
    photos: true, sync: true, history: true,
  },
};
const planOf = u => PLANS[(u && u.plan) || 'free'];
const isInf = n => !isFinite(n);

// feature rows shown on pricing + account comparison
const PLAN_FEATURES = [
  { key: 'spaces',  label: 'Spaces',              fmt: v => isInf(v) ? 'Unlimited' : `${v} spaces` },
  { key: 'zones',   label: 'Cabinets & shelves',  fmt: v => isInf(v) ? 'Unlimited' : `${v} per space` },
  { key: 'items',   label: 'Items',               fmt: v => isInf(v) ? 'Unlimited' : `${v} per space` },
  { key: 'photos',  label: 'Item photos',         fmt: v => v ? 'Yes' : '—' },
  { key: 'sync',    label: 'Sync across devices',  fmt: v => v ? 'Yes' : 'This device only' },
  { key: 'history', label: 'Change history',      fmt: v => v ? 'Yes' : '—' },
];

// reason copy for the paywall (limit-reached moments)
const PAYWALL = {
  spaces:  { icon: 'grid',    title: 'Space limit reached',
             body: n => `Free plan includes ${n} spaces. Upgrade to Pro for unlimited fridges, freezers, cabinets and cellars.` },
  zones:   { icon: 'columns', title: 'Cabinet limit reached',
             body: n => `Free plan allows ${n} cabinets or shelves per space. Pro lets you draw as many as you like.` },
  items:   { icon: 'box',     title: 'Item limit reached',
             body: n => `This space is full — Free plan holds ${n} items per space. Pro removes the cap entirely.` },
  photos:  { icon: 'lock',    title: 'Photos are a Pro feature',
             body: () => `Add a photo to every item so you recognise it at a glance. Available on Pro.` },
  sync:    { icon: 'restart', title: 'Sync is a Pro feature',
             body: () => `Keep every space in step across your phone, tablet and laptop. Free plan stays on this device.` },
};

const cardCountsOf = s => ({ items: s ? s.items.length : 0, zones: s ? s.zones.length : 0 });

Object.assign(window, {
  ZONE_COLORS, SPACE_TYPES, ZONE_TEMPLATES, buildZones, zoneName, seedFridge,
  daysUntil, expiryStatus, expiryLabel, parseAdd, matchZone, uid, SPACE_NOUN,
  GRID_UNIT, snapGrid, zoneFootprint, flowFreeform, assignColumns, applyComplexity, FACINGS, WALL_ORDER,
  PLANS, planOf, isInf, PLAN_FEATURES, PAYWALL, cardCountsOf,
});
