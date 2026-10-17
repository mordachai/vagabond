/**
 * Named Relics (relics pack) → their real base weapon / armor, Powers as the item's OWN effects (no Relic slots).
 *
 * Each named Relic keeps its pack `_id`, name, book description, lore and book price; it takes the base
 * item's stats (copied from the weapons / armor pack by id), "Is Relic" on, Fabled / Bound / Cursed from its
 * lore, and one effect per automatable book Power (changes copied from the pack Power, named after the book
 * Power; on a weapon `system.universalWeapon*` is On Use Only). Powers with nothing to automate stay in the
 * description only. Embedded copies in the stores pack (matched by compendium source id) follow.
 *
 * Also fixes two Power items the named Relics use: Senses - Nightvision grants Darksight, Cursed -
 * Vulnerability -N also removes the Armor's own Rating (book: "Does not grant its Armor").
 *
 * Re-runnable: ids are seeded, the book price is recovered from an already converted item.
 * Usage: node scripts/relics/convert-named.mjs [--report]   then   npm run pack
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../packs/_source');
const REPORT = process.argv.includes('--report');

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function makeId(seed) {
  const h = createHash('sha1').update(seed).digest();
  let out = '';
  for (let i = 0; i < 16; i++) out += BASE62[h[i] % 62];
  return out;
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const RATES = { gold: 10000, silver: 100, copper: 1 }; // CurrencyHelper.RATES
const toCopper = (c) => (c?.gold ?? 0) * RATES.gold + (c?.silver ?? 0) * RATES.silver + (c?.copper ?? 0);
const fromCopper = (cu) => {
  const gold = Math.floor(cu / RATES.gold); cu -= gold * RATES.gold;
  const silver = Math.floor(cu / RATES.silver); cu -= silver * RATES.silver;
  return { gold, silver, copper: cu };
};
const METAL_MULTIPLIER = { none: 1, mythral: 50 }; // CONFIG.VAGABOND.metalData (only the ones used here)

function loadDir(dir) {
  const out = new Map();
  for (const file of readdirSync(resolve(SRC, dir))) {
    if (!file.endsWith('.json')) continue;
    const doc = JSON.parse(readFileSync(resolve(SRC, dir, file), 'utf8'));
    out.set(doc._id, { file: resolve(SRC, dir, file), doc });
  }
  return out;
}
const save = (entry) => { if (!REPORT) writeFileSync(entry.file, `${JSON.stringify(entry.doc, null, 2)}\n`); };

const relics = loadDir('relics');
const weapons = loadDir('weapons');
const armor = loadDir('armor');

// ------------------------------------------------------------------ power items used by the named Relics
const POWER = {
  bonusWeapon1: 'JivDe6orVe9P4y2h', bonusWeapon2: 'xUvkAKEOXp5NLtUy', bonusWeapon3: 'Eesky4MCf67OcvJH',
  bonusArmor1: 'c0Gb2WNZYwNMQa0z',
  blasting: 'ari6BEnGYernpfKJ', soulEater: 'UBPWfQvoLBUZHw71', vorpal: 'vRgOVCvvvgUKK5UQ', visceral: '9m2h6Ug0vp8beBci',
  moonlit2: 'GYSDdxQaPF4s0lW8', lifesteal1: '5N4bspgxNaFYC4Fq', burning1: 'HQTy6PouG4r6MZ44',
  senseLife: 'f80xbiQ8WrHJRLEk', senseValuables: 'jCwW8qiT1VQwBOZt', nightvision: 'EjqAM5XwdbHsHEM8',
  loyalty: 'lrW92Z9PZDWOWi32', blinking: 'C63aM82IUjKQeEsa', aquaLung: 'Jizg8x5ynRWaLwUn',
  ambassador: 'WguP3eHn2ARYgpvf', warning: 'SykeEctUO5LqK9sr', darkness2: 'b91qxtfecFAs3vHL',
  infinite: 'PsGJnF085lEYhZDy', storeSpell: 'zsWVvbEk7ES3ICbm', baneGeneral: 'EosKwEZMsRaSAzJt',
  baneSpecific: 'ThoIBZf8TQydbTgR', bravery: '8dCrNesunpcg6jWo',
  vulnerability1: 'w1QVBTfd6rVQ3fYO', vulnerability2: 'FGjs5e35APaRZk26', vulnerability3: 'Bmc8f4BDLTCXYHIV',
};
const AD_HOC_IMG = 'icons/magic/control/buff-flight-wings-runes-blue-white.webp';

/** Book Power name (as printed in the Relic's description) → pack Power + extra changes. */
const POWER_MAP = {
  '(+1) Weapon': { power: 'bonusWeapon1' },
  '(+2) Weapon': { power: 'bonusWeapon2' },
  '(+3) Weapon': { power: 'bonusWeapon3' },
  '(+3) Bonus': { power: 'bonusWeapon3' },
  '(+1) Armor': { power: 'bonusArmor1' },
  '(+1) Shield': { power: 'bonusArmor1' },
  "Evil's Bane": { power: 'baneGeneral' },
  'Giants Bane': { power: 'baneSpecific' },
  'Silvering': { extra: [{ name: 'Silvering', applicationMode: 'self', changes: [{ key: 'system.countsAs', value: 'silver', priority: null, type: 'add' }] }] },
  'Smite I': { power: 'burning1' },
  'Blasting': { power: 'blasting' },
  'Moonlit': { power: 'moonlit2' },
  'Lifesteal': { power: 'lifesteal1' },
  'Resolve': { power: 'bravery', extra: [{ name: 'Resolve', applicationMode: 'when-equipped', changes: [
    { key: 'system.statusImmunities', value: 'charmed', priority: null, type: 'add' },
    { key: 'system.statusImmunities', value: 'frightened', priority: null, type: 'add' },
  ] }], noPowerChanges: true },
  'Sense Life': { power: 'senseLife' },
  'Soul Eater': { power: 'soulEater' },
  'Vorpal': { power: 'vorpal' },
  'Blinking': { power: 'blinking' },
  'Loyalty': { power: 'loyalty' },
  'Sense Valuables': { power: 'senseValuables' },
  'Aqua Lung': { power: 'aquaLung' },
  'Marine Ambassador': { power: 'ambassador' },
  'Visceral': { power: 'visceral' },
  'Warning': { power: 'warning' },
  'Shocktongue': { extra: [{ name: 'Shocktongue', applicationMode: 'self', changes: [
    { key: 'system.damageTypeOneHand', value: 'shock', priority: null, type: 'override' },
    { key: 'system.damageTypeTwoHands', value: 'shock', priority: null, type: 'override' },
  ] }] },
  'Nightvision': { power: 'nightvision' },
  'Darkness II': { power: 'darkness2' },
  'Infinite ((+1) Dagger)': { power: 'infinite' },
};

// ------------------------------------------------------------------ the named Relics
const W = (id) => ({ pack: weapons, id });
const A = (id) => ({ pack: armor, id });
const ICON = {
  sword1: 'icons/weapons/swords/sword-runed-glowing.webp',
  sword2: 'icons/skills/melee/sword-engraved-glow-purple.webp',
  sword3: 'icons/weapons/swords/sword-flanged-lightning.webp',
};
const NAMED = [
  { id: 'MgosRX6hC1yuPgk2', base: W('Nxohe9qqbv8Pc2rf'), img: ICON.sword1 }, // Dyrnwyn — Longsword
  { id: 'qhUZvjK6L4600nPC', base: W('s7T80rfKt90tymAD'), img: ICON.sword2 }, // Moonlit Blade — Greatsword
  { id: 'GIAEgPK6cZ78NpGj', base: W('s7T80rfKt90tymAD'), img: ICON.sword3 }, // Voidedge — Greatsword
  { id: 'RHXLOdGw4z6eFutu', base: W('HwX2SFNKg7DPXSma'), img: 'icons/skills/melee/strike-sword-dagger-runes-yellow.webp' }, // Vorpal Blade
  { id: 'Q0SdZ5xpW08UvYbO', base: W('HwX2SFNKg7DPXSma'), img: 'icons/weapons/daggers/dagger-magical-glowing-blue.webp' }, // Blink Dagger
  { id: 'Vr4uoSadN44XJtDC', base: W('QoM4vz7fklFjWpTo'), img: 'icons/weapons/hammers/hammer-double-engraved-ruby.webp' }, // Sunder — Warhammer
  { id: 'BExW3FHlifV9DyKs', base: W('zP25XADuyEP3KSez'), img: 'icons/weapons/polearms/trident-silver-blue.webp' }, // Undertow — Spear stats (user ruling)
  { id: '2AYiSZpv9zgjnxOy', base: W('uAlZg4ml2yQ0EwB7'), img: 'icons/skills/melee/strike-chain-whip-blue.webp' }, // Skyhowel — Chain Whip
  { id: 'PX3TNLD71AFsPMvd', base: W('ShVLwDMGm2m0D4eS'), img: 'icons/weapons/guns/pistol-revolver-steel.webp' }, // Peacemaker — Handgun (user ruling)
  { id: 'v2Xt9X5XHIRTT6EU', base: W('ZPaSkHYlIBVwUQdO'), img: 'icons/weapons/crossbows/handcrossbow-green.webp' }, // Black Wing — Light Crossbow
  { id: 'TYdCmq7MqhgtObbH', base: W('zP25XADuyEP3KSez'), img: 'icons/sundries/flags/banner-standard-moon.webp' }, // Standard of the Herald — Spear
  { id: 'SZ8vnzEgZjDKJPFO', base: W('kRZpyvFZXQyDgpZn'), img: 'icons/equipment/shield/kite-wooden-sigil-purple.webp' }, // Loyalty Shield
  ...[ // Magistaff Common / Rare / Legendary
    ['YyyuCEq9Jh38PPne', 'icons/weapons/staves/staff-simple-spiral-brown.webp'],
    ['yE1P5c3HDzmCBmKH', 'icons/weapons/staves/staff-ornate-jeweled-blue.webp'],
    ['2r0PVv2JDxvmFA0f', 'icons/weapons/staves/staff-ornate-banded-purple.webp'],
  ].map(([id, img]) => ({
    id, base: W('ufjKBfCKT1kTA5Kq'), img, powers: [], // Spell Storage: description only
  })),
  { id: 'BVY2dIGUFzOSEC7z', base: A('T5aaqoo4V8KZIVCZ'), img: 'icons/commodities/metal/mail-chain-steel.webp', metal: 'mythral' }, // Elven Chain
  { id: 'veE33OqrWbIToKU2', base: A('K6gCgMFAMIPLJO0L'), img: 'icons/commodities/leather/fur-white.webp' }, // Harpy's Cloak
  // Armor of Vulnerability: one per Armor tier (user ruling) — (-1) Light, (-2) Medium, (-3) Heavy
  { id: 'FAOtcfKozVYLxXVo', base: A('K6gCgMFAMIPLJO0L'), img: 'icons/equipment/chest/breastplate-banded-simple-leather-brown.webp', powers: [{ name: 'Vulnerability (Armor)', power: 'vulnerability1', curse: true, keepNames: true, text: 'Does not grant its Armor and instead increases Attack damage taken by 1.' }], disguise: { base: 'Light Armor', plus: 1 } },
  { id: 'Q7Ym1DivfmQPID03', base: A('T5aaqoo4V8KZIVCZ'), img: 'icons/equipment/chest/breastplate-metal-scaled-grey.webp', powers: [{ name: 'Vulnerability (Armor)', power: 'vulnerability2', curse: true, keepNames: true, text: 'Does not grant its Armor and instead increases Attack damage taken by 2.' }], disguise: { base: 'Medium Armor', plus: 2 } },
  { id: 'Y8ogD7RYQqqvt7Iy', base: A('yvHynLJxGSilvLwM'), img: 'icons/equipment/chest/breastplate-layered-grey.webp', powers: [{ name: 'Vulnerability (Armor)', power: 'vulnerability3', curse: true, keepNames: true, text: 'Does not grant its Armor and instead increases Attack damage taken by 3.' }], disguise: { base: 'Heavy Armor', plus: 3 } },
];

// ------------------------------------------------------------------ power item fixes
const FX_STATS = { coreVersion: '14.361', systemId: 'vagabond', systemVersion: '6.7.0' };
function effectDoc(parentKeyPath, id, { name, img = 'icons/svg/aura.svg', changes, applicationMode, relicBoost = null, relicSource = null, description = '' }) {
  return {
    name, img, _id: id, type: 'base',
    system: { changes },
    disabled: false,
    duration: { value: null, units: 'seconds', expiry: null, expired: false },
    description, tint: '#ffffff',
    transfer: applicationMode !== 'self',
    statuses: [], sort: 0,
    flags: { vagabond: { applicationMode, ...(relicBoost ? { relicBoost } : {}), ...(relicSource ? { relicSource } : {}) } },
    _stats: clone(FX_STATS),
    start: null, showIcon: 1, folder: null,
    _key: `${parentKeyPath}.${id}`,
  };
}

{ // Senses - Nightvision: "Grants Darksight"
  const entry = relics.get(POWER.nightvision);
  if (!entry.doc.effects.some(e => e.system?.changes?.some(c => c.key === 'system.senses'))) {
    entry.doc.effects.push(effectDoc(`!items.effects!${entry.doc._id}`, makeId(`${entry.doc._id}|darksight`),
      { name: 'Darksight', changes: [{ key: 'system.senses', value: 'darksight', priority: null, type: 'add' }], applicationMode: 'when-equipped' }));
    save(entry);
  }
}
for (const [n, key] of [[1, 'vulnerability1'], [2, 'vulnerability2'], [3, 'vulnerability3']]) { // book Vulnerability (Armor)
  const entry = relics.get(POWER[key]);
  const doc = entry.doc;
  doc.system.description = `<p>Does not grant its Armor and instead increases Attack damage taken by ${n}.</p>`;
  const penalty = doc.effects.find(e => e.system?.changes?.some(c => c.key === 'system.armorBonus'));
  if (penalty) penalty.name = `Vulnerability: +${n} damage taken`;
  if (!doc.effects.some(e => e.flags?.vagabond?.applicationMode === 'self')) {
    doc.effects.push(effectDoc(`!items.effects!${doc._id}`, makeId(`${doc._id}|noArmor`), {
      name: 'Vulnerability: no Armor',
      changes: [{ key: 'system.armorRating', value: 0, priority: null, type: 'override' }],
      applicationMode: 'self',
    }));
  }
  save(entry);
}

// ------------------------------------------------------------------ build
const stripTags = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
/** `[{name, text}]` from the description's `<li>Name: text</li>` bullets. */
function bullets(html) {
  return [...String(html).matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => {
    const text = stripTags(m[1]);
    const at = text.indexOf(':');
    return { name: text.slice(0, at).trim(), text: text.slice(at + 1).trim() };
  });
}

/**
 * Effects of one book Power on the item itself: the pack Power's effects (changes copied) + `extra`, named after the
 * book Power (`keepNames`: the pack effects' names). Weapon: `system.universalWeapon*` when-equipped → On Use Only
 * (only that weapon's attacks, like `RelicHelper.syncHostEffects`). `curse` effects are flagged for `RelicDisguise`.
 */
function powerEffects(host, index, keyPath, isWeapon, { name, text, power, extra = [], noPowerChanges = false, curse = false, keepNames = false }) {
  const src = power ? relics.get(POWER[power])?.doc : null;
  if (power && !src) throw new Error(`Missing power ${power}`);
  const groups = [
    ...(noPowerChanges ? [] : (src?.effects ?? []).filter(e => e.system?.changes?.some(c => c.key)).map(e => ({
      name: keepNames ? e.name : name,
      applicationMode: e.flags?.vagabond?.applicationMode ?? 'permanent',
      relicBoost: e.flags?.vagabond?.relicBoost ?? null,
      changes: clone(e.system.changes.filter(c => c.key)),
    }))),
    ...extra.map(e => ({ relicBoost: null, ...clone(e), name: e.name ?? name })),
  ];
  const out = [];
  groups.forEach((g, gi) => {
    const scoped = isWeapon && g.applicationMode === 'when-equipped'
      ? g.changes.filter(c => /^system\.universalWeapon/.test(c.key ?? '')) : [];
    const rest = g.changes.filter(c => !scoped.includes(c));
    const make = (changes, applicationMode, tag) => {
      const fx = effectDoc(keyPath, makeId(`${host._id}|own|${index}|${gi}|${tag}`), {
        name: g.name, img: src?.img ?? AD_HOC_IMG, changes: clone(changes), applicationMode,
        relicBoost: g.relicBoost, description: text ? `<p>${text}</p>` : '',
      });
      if (curse) fx.flags.vagabond.curse = true;
      out.push(fx);
    };
    if (scoped.length) make(scoped, 'on-use', 'scoped');
    if (rest.length || !scoped.length) make(rest, g.applicationMode, 'rest');
  });
  return out;
}

/**
 * Book (Armor of Vulnerability): identifying it "only reveals it to be a Relic Armor with the opposite 'plus.'"
 * Same shape and English text as `RelicDisguise.disguise` / `generate` (helpers/relic-disguise.mjs).
 */
const BONUS_ART = 'icons/magic/control/buff-flight-wings-runes-purple.webp';
function disguise(doc, { base, plus }) {
  const sys = doc.system;
  const shown = {
    name: `${base} (+${plus})`,
    img: doc.img,
    description: `<p>Relic ${base} with the following Power:</p><ul><li><strong>(+${plus}) Armor:</strong> Grants a +${plus} bonus to Armor.</li></ul>`,
    lore: `Relic ${base}`,
  };
  const fxShown = { name: `(+${plus}) Armor`, img: BONUS_ART, description: `<p>Grants a +${plus} bonus to Armor.</p>` };
  const curseFx = doc.effects.filter(e => e.flags?.vagabond?.curse);
  sys.relic.trueIdentity = {
    name: doc.name, img: doc.img, description: sys.description, lore: sys.lore,
    effects: Object.fromEntries(curseFx.map(e => [e._id, { name: e.name, img: e.img, description: e.description }])),
  };
  sys.relic.disguised = true;
  sys.relic.disguise = { ...shown, effects: Object.fromEntries(curseFx.map(e => [e._id, fxShown])) }; // also what a reveal would store
  for (const e of curseFx) Object.assign(e, fxShown);
  sys.description = shown.description;
  sys.lore = shown.lore;
}

const report = [];
const converted = new Map(); // relic id → converted doc
for (const spec of NAMED) {
  const entry = relics.get(spec.id);
  const doc = entry.doc;
  const base = spec.base.pack.get(spec.base.id)?.doc;
  if (!base) throw new Error(`Missing base ${spec.base.id} for ${doc.name}`);
  const old = doc.system;
  if (old.relic?.disguised) { // re-run on a disguised item: start from its true identity
    const truth = old.relic.trueIdentity;
    doc.name = truth.name;
    old.description = truth.description;
    old.lore = truth.lore;
  }
  const wasRelic = old.equipmentType === 'relic';
  const metal = spec.metal ?? base.system.metal ?? 'none';
  const multiplier = METAL_MULTIPLIER[metal] ?? 1;
  // Book price: the Relic's own price before conversion; afterwards recovered through the material multiplier
  const bookCopper = wasRelic ? toCopper(old.baseCost) : toCopper(old.baseCost) * (METAL_MULTIPLIER[old.metal] ?? 1);
  const lore = old.lore ?? '';
  const isWeaponHost = base.system.equipmentType === 'weapon';

  const system = clone(base.system);
  delete system.itemFx;
  Object.assign(system, {
    description: old.description,
    lore,
    baseCost: fromCopper(Math.round(bookCopper / multiplier)),
    metal,
    quantity: 1,
    equipped: false,
    equipmentState: 'unequipped',
    locked: true,
  });

  const keyPath = `!items.effects!${doc._id}`;
  const powerSpecs = spec.powers ?? bullets(old.description).map(b => ({ name: b.name, text: b.text, ...(POWER_MAP[b.name] ?? {}) }));
  const automated = [], manual = [];
  const powerFx = powerSpecs.flatMap((p, i) => {
    const fx = (p.power || p.extra) ? powerEffects(doc, i, keyPath, isWeaponHost, p) : [];
    (fx.length ? automated : manual).push(p.name);
    return fx;
  });
  const cursed = !!old.relic?.cursed || powerSpecs.some(p => p.curse);
  system.relic = {
    ...(base.system.relic ?? {}),
    powers: [],
    fabled: /\bFabled\b/.test(lore),
    requiresBond: /\(Bound\)/.test(lore) || cursed,
    boundTo: '',
    cursed,
    consumable: false,
    sockets: [],
    isRelic: true,
    slots: 0,
    disguised: false,
    disguise: {},
    trueIdentity: {},
  };
  doc.system = system;
  doc.img = spec.img;

  // Base item's own effects (Keen / Vicious On Use Only…) + the Powers' effects
  const own = (base.effects ?? []).filter(e => e.system?.changes?.some(c => c.key)).map(e => ({
    ...clone(e), origin: `Compendium.vagabond.relics.Item.${doc._id}`, _key: `${keyPath}.${e._id}`,
  }));
  doc.effects = [...own, ...powerFx];
  if (spec.disguise) {
    disguise(doc, spec.disguise);
    doc.name = doc.system.relic.disguise.name;
  }
  doc._stats = { ...doc._stats, ...FX_STATS };
  save(entry);
  converted.set(doc._id, doc);
  report.push(`${doc.name} ← ${base.name}${metal !== 'none' ? ` (${metal})` : ''}: ${automated.join(', ') || '-'}`
    + `${manual.length ? ` | text only: ${manual.join(', ')}` : ''}`
    + `${system.relic.fabled ? ' [Fabled]' : ''}${system.relic.requiresBond ? ' [Bond]' : ''}${cursed ? ' [Cursed]' : ''}`
    + ` · ${fromCopper(bookCopper).gold}g · ${doc.effects.length} effects`);
}

// ------------------------------------------------------------------ stores pack: embedded copies
const stores = loadDir('stores');
for (const entry of stores.values()) {
  let changed = false;
  for (const item of entry.doc.items ?? []) {
    const sourceId = String(item._stats?.compendiumSource ?? item.flags?.core?.sourceId ?? '').split('.').pop();
    const doc = converted.get(sourceId);
    if (!doc) continue;
    const keyPath = `!actors.items.effects!${entry.doc._id}.${item._id}`;
    item.name = doc.name;
    item.img = doc.img;
    item.system = { ...clone(doc.system), gridPosition: item.system?.gridPosition, containerId: item.system?.containerId ?? null };
    if (item.system.gridPosition === undefined) delete item.system.gridPosition;
    item.effects = doc.effects.map(e => ({ ...clone(e), _key: `${keyPath}.${e._id}` }));
    changed = true;
    report.push(`  store ${entry.doc.name}: ${item.name}`);
  }
  if (changed) save(entry);
}

console.log(report.join('\n'));
if (REPORT) console.log('\n(--report: nothing written)');
