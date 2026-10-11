/**
 * Generate the "Mounts & Vehicles" Actor compendium source (packs/_source/mounts-vehicles)
 * from the gear pack's "Transportation & Cargo" folder (book p.17 Riding Animals, p.21 Water Travel).
 *
 *   node scripts/mounts-vehicles/generate.mjs
 *
 * Then `npm run pack` (Foundry closed). Safe to re-run: actor / item / folder ids are derived from
 * the source gear item id, so regenerating updates the same documents in place.
 *
 * Each transport gear item becomes a Construct actor (type `construct`, UI label
 * "Mount / Vehicle / Structure") with the item's name, art, Speed / Crawl / Travel, a `kind`
 * (mount / vehicle / vessel) and a "Hold" container sized to the item's Capacity.
 * The gear item gets `flags.vagabond.constructId` (and the actor `flags.vagabond.sourceItemId`)
 * so code links the two by id, never by name (translated worlds rename both).
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const SRC = resolve(root, 'packs', '_source');
const GEAR = resolve(SRC, 'gear');
const OUT = resolve(SRC, 'mounts-vehicles');

const TRANSPORT_FOLDER = 'woQZcU1qvzuwqO8l'; // gear "Transportation & Cargo"
const SKIP = new Set(['HQjoO4qRcanj2S4K']); // Saddle & tack: item only (goes in a Mount's Hold)
const VEHICLES = new Set(['5NHRhQ1HcHYlo9zi', 'XJTjKKpbc7b5E0J2']); // Cart, Wagon: pulled, no Speed
// Token size (grid squares) by gear id; default 2
const TOKEN_SIZE = {
  stgWfRdfru434zsR: 3, // Elephant
  YeZJvX4tML38RMAH: 1, // Horse, pony
  LlAPtwpe0srRqd9b: 1, // Mule
  X6zGgajivakWKX4U: 1, // Canoe
  lDxbTpIQCT3Wcfpu: 1, // Rowboat
  '5NHRhQ1HcHYlo9zi': 1, // Cart
  S7AWNc6MKMEYLoDy: 4, // Caravel
  CGwh9VjHJmS8TFPU: 4, // Galley
  oUPpAQVWJZHuAx5a: 4, // Longship
  hAbGrVjtKx7DbamA: 4, // Warship
};
const RATES = { gold: 10000, silver: 100, copper: 1 }; // CurrencyHelper.RATES

const FOLDERS = {
  mount: { name: 'Mounts', sort: 100000 },
  vehicle: { name: 'Vehicles', sort: 200000 },
  vessel: { name: 'Vessels', sort: 300000 },
};
const HOLD_IMG = {
  mount: 'icons/containers/bags/pack-leather-white-tan.webp',
  vehicle: 'icons/containers/chest/chest-reinforced-steel-brown.webp',
  vessel: 'icons/containers/chest/chest-reinforced-steel-brown.webp',
};

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function makeId(seed) {
  const h = createHash('sha1').update(seed).digest();
  let out = '';
  for (let i = 0; i < 16; i++) out += BASE62[h[i] % 62];
  return out;
}
const fileSafe = s => s.replace(/[^A-Za-z0-9]/g, '_');
const fmtCost = c => {
  let cu = (c?.gold ?? 0) * RATES.gold + (c?.silver ?? 0) * RATES.silver + (c?.copper ?? 0) * RATES.copper;
  const g = Math.floor(cu / RATES.gold); cu -= g * RATES.gold;
  const s = Math.floor(cu / RATES.silver); cu -= s * RATES.silver;
  return [g && `${g}g`, s && `${s}s`, cu && `${cu}c`].filter(Boolean).join(' ') || '0';
};

// ---------------------------------------------------------------- source items
const gearFiles = readdirSync(GEAR).filter(f => f.endsWith('.json'));
const sources = [];
for (const f of gearFiles) {
  const d = JSON.parse(readFileSync(resolve(GEAR, f), 'utf8'));
  if (d.folder !== TRANSPORT_FOLDER || d.type !== 'container' || SKIP.has(d._id)) continue;
  sources.push({ file: f, doc: d });
}
sources.sort((a, b) => (a.doc.sort ?? 0) - (b.doc.sort ?? 0) || a.doc.name.localeCompare(b.doc.name));

// ---------------------------------------------------------------- build
const results = [];
for (const [kind, f] of Object.entries(FOLDERS)) {
  const id = makeId(`mounts-vehicles|folder|${kind}`);
  f.id = id;
  results.push({
    file: `${f.name}_${id}.json`,
    doc: {
      type: 'Actor', folder: null, name: f.name, color: null, sorting: 'a', description: '',
      sort: f.sort, flags: {}, _id: id, _key: `!folders!${id}`,
    },
  });
}

for (const { file, doc: item } of sources) {
  const s = item.system;
  const kind = VEHICLES.has(item._id) ? 'vehicle' : (s.speed > 0 ? 'mount' : 'vessel');
  const actorId = makeId(`mounts-vehicles|actor|${item._id}`);
  const holdId = makeId(`mounts-vehicles|hold|${item._id}`);
  const size = TOKEN_SIZE[item._id] ?? 2;

  const hold = {
    name: 'Hold',
    type: 'container',
    img: HOLD_IMG[kind],
    system: {
      description: `<p>${item.name}: carries ${s.capacity} Slots of Items.</p>`,
      slots: 0,
      capacity: s.capacity ?? 0,
      gridPosition: 0,
      items: [],
      baseCost: { gold: 0, silver: 0, copper: 0 },
      locked: true,
    },
    effects: [],
    flags: {},
    sort: 0,
    _id: holdId,
    _key: `!actors.items!${actorId}.${holdId}`,
  };

  const actor = {
    name: item.name,
    type: 'construct',
    img: item.img,
    system: {
      kind,
      type: '',
      speed: s.speed ?? 0,
      crawl: s.crawl ?? 0,
      travel: s.travel ?? 0,
      biography: `${s.description ?? ''}<p>Value: ${fmtCost(s.baseCost)}.</p>`,
    },
    prototypeToken: {
      name: item.name,
      actorLink: false,
      disposition: 0,
      width: size,
      height: size,
      texture: { src: item.img, fit: 'contain' },
      bar1: { attribute: null },
    },
    items: [hold],
    effects: [],
    folder: FOLDERS[kind].id,
    flags: { vagabond: { sourceItemId: item._id } },
    sort: item.sort ?? 0,
    _id: actorId,
    _key: `!actors!${actorId}`,
  };
  results.push({ file: `${fileSafe(item.name)}_${actorId}.json`, doc: actor });

  // Link the gear item → its Construct (by id)
  if (item.flags?.vagabond?.constructId !== actorId) {
    item.flags = { ...(item.flags ?? {}), vagabond: { ...(item.flags?.vagabond ?? {}), constructId: actorId } };
    writeFileSync(resolve(GEAR, file), JSON.stringify(item, null, 2) + '\n');
  }
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });
for (const { file, doc } of results) writeFileSync(resolve(OUT, file), JSON.stringify(doc, null, 2) + '\n');
console.log(`Wrote ${results.length - Object.keys(FOLDERS).length} constructs + ${Object.keys(FOLDERS).length} folders -> ${OUT}`);
