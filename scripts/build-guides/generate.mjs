/**
 * Generate the "Build Guides" Actor compendium source (packs/_source/build-guides)
 * from scripts/build-guides/build-guides.json (extracted from Appendix C of the Alpha 3 book).
 *
 *   node scripts/build-guides/generate.mjs            # write packs/_source/build-guides/*.json
 *   node scripts/build-guides/generate.mjs --report   # dry run, print resolution report only
 *
 * Then `npm run pack` (Foundry closed). Safe to re-run: actor / item ids are derived from the
 * guide name, so regenerating updates the same documents in place. Images come from images.json.
 *
 * Each Actor is a finished LEVEL-1 character (mirrors what the Character Builder produces, minus
 * Ancestry): Class, Stats, Training, Starting Pack items (+ currency left over), the guide's
 * Weapon / Armor, level-1 Perks, Spells. The level-10 Stats, Perks by level and later Spells go
 * in `system.biography`.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { stackZeroSlotItems, wearFirstBackpack } from '../../module/helpers/stack-helper.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const SRC = resolve(root, 'packs', '_source');
const OUT = resolve(SRC, 'build-guides');
const REPORT_ONLY = process.argv.includes('--report');

const RATES = { gold: 10000, silver: 100, copper: 1 }; // CurrencyHelper.RATES
const STAT_ABBR = { might: 'MIT', dexterity: 'DEX', awareness: 'AWR', reason: 'RSN', presence: 'PRS', luck: 'LUK' };
const SKILL_ALIAS = { stealth: 'sneak' };
const NAME_ALIAS = {
  'greatshield': 'Shield, great',
  'caestus': 'Caestus / Gauntlet',
  'tarot cards': 'Cards - deck, tarot'
};
const GEAR_PACKS = ['weapons', 'armor', 'gear', 'alchemical-items', 'relics'];
const MAX_HANDS = 2;

// ---------------------------------------------------------------- loading
const norm = s => String(s).replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

function loadPack(name) {
  const dir = resolve(SRC, name);
  const docs = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const d = JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
    if (!d.system || String(d._key ?? '').startsWith('!folders')) continue;
    d.__pack = name;
    docs.push(d);
  }
  return docs;
}

const packs = {};
for (const n of ['classes', 'perks', 'spells', 'starting-packs', ...GEAR_PACKS]) packs[n] = loadPack(n);
const byId = new Map();
for (const [n, docs] of Object.entries(packs)) for (const d of docs) byId.set(`${n}.${d._id}`, d);
const byName = (pack, name) => packs[pack].filter(d => norm(d.name) === norm(name));

const guides = JSON.parse(readFileSync(resolve(here, 'build-guides.json'), 'utf8'));
const imagesPath = resolve(here, 'images.json');
const images = existsSync(imagesPath) ? JSON.parse(readFileSync(imagesPath, 'utf8')) : {};

// ---------------------------------------------------------------- helpers
const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function makeId(seed) {
  const h = createHash('sha1').update(seed).digest();
  let out = '';
  for (let i = 0; i < 16; i++) out += BASE62[h[i] % 62];
  return out;
}
const ordinal = n => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 >= 11 && n % 100 <= 13) ? 0 : (n % 10 < 4 ? n % 10 : 0)]}`;
const costCopper = c => (c?.gold ?? 0) * RATES.gold + (c?.silver ?? 0) * RATES.silver + (c?.copper ?? 0) * RATES.copper;
const fmtCost = cu => {
  const g = Math.floor(cu / RATES.gold); cu -= g * RATES.gold;
  const s = Math.floor(cu / RATES.silver); cu -= s * RATES.silver;
  return [g && `${g}g`, s && `${s}s`, cu && `${cu}c`].filter(Boolean).join(' ') || '0';
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fileSafe = s => s.replace(/\s+-\s+/g, '_').replace(/[^A-Za-z0-9]+/g, '_');

function handsOf(state) { return state === 'oneHand' ? 1 : state === 'twoHands' ? 2 : 0; }
function defaultEquipState(doc) {
  const s = doc.system;
  if (s.equipmentType === 'weapon') return s.grip === '2H' ? 'twoHands' : s.grip === '0' ? 'worn' : 'oneHand';
  if (s.equipmentType === 'armor') return 'worn';
  const h = s.handsRequired ?? 0;
  return h >= 2 ? 'twoHands' : h === 1 ? 'oneHand' : 'worn';
}

/** Strip pack-only keys and re-key a source doc for embedding on a given actor. */
function embedItem(actorId, doc, seed) {
  const item = JSON.parse(JSON.stringify(doc));
  delete item.__pack; delete item._stats; delete item.folder; delete item.ownership; delete item.sort;
  item._id = makeId(seed);
  item._key = `!actors.items!${actorId}.${item._id}`;
  item.effects = (item.effects ?? []).map(e => {
    const eff = { ...e };
    delete eff._stats;
    eff._key = `!actors.items.effects!${actorId}.${item._id}.${eff._id}`;
    return eff;
  });
  return item;
}

// ---------------------------------------------------------------- gear label parsing
/** "Dagger (2), Shortbow" -> [{label, qty}] */
function parseGearList(text) {
  if (!text || text.trim() === '-') return [];
  return text.split(',').map(p => p.trim()).filter(Boolean).map(p => {
    const m = p.match(/^(.*?)\s*\((\d+)\)$/);
    return m ? { label: m[1].trim(), qty: Number(m[2]) } : { label: p, qty: 1 };
  });
}

function resolveGear(label, packDocs, warnings) {
  const wanted = NAME_ALIAS[norm(label)] ?? label;
  const inPack = packDocs.find(d => norm(d.name) === norm(wanted));
  if (inPack) return { doc: inPack, fromPack: true };
  for (const p of GEAR_PACKS) {
    const hits = byName(p, wanted);
    if (hits.length) {
      if (hits.length > 1) warnings.push(`"${label}" matches ${hits.length} docs in ${p}; used first (${hits[0]._id})`);
      return { doc: hits[0], fromPack: false };
    }
  }
  return null;
}

// ---------------------------------------------------------------- per-guide build
const report = [];
const results = [];

for (const g of guides) {
  const warnings = [];
  const [className] = g.title.split(' - ');
  const actorId = makeId(`build-guide|${g.title}`);
  const cls = byName('classes', className)[0];
  if (!cls) { warnings.push(`NO CLASS "${className}"`); report.push({ title: g.title, warnings }); continue; }

  // --- starting pack
  const packName = g.startingPack.replace(/\(.*\)/, '').trim();
  const buyNote = (g.startingPack.match(/\((.*)\)/) ?? [])[1] ?? '';
  const spDoc = packName ? byName('starting-packs', `${packName} Pack`)[0] : null;
  if (packName && !spDoc) warnings.push(`NO STARTING PACK "${packName} Pack"`);
  const packDocs = [];            // resolved source docs, one entry per copy (builder creates `quantity` copies)
  if (spDoc) {
    for (const entry of spDoc.system.items ?? []) {
      const m = entry.uuid.match(/^Compendium\.vagabond\.([^.]+)\.Item\.(\w+)$/);
      const doc = m && byId.get(`${m[1]}.${m[2]}`);
      if (!doc) { warnings.push(`starting pack item not found: ${entry.uuid}`); continue; }
      for (let i = 0; i < (entry.quantity ?? 1); i++) packDocs.push(doc);
    }
  }
  const distinctPackDocs = [...new Map(packDocs.map(d => [d._id, d])).values()];
  let copper = costCopper(spDoc?.system?.currency);

  // --- guide gear: weapon / armor / trinket rows
  const wanted = [
    ...parseGearList(g.weapon),
    ...(g.armor && g.armor.trim() !== '-' ? [{ label: g.armor.trim(), qty: 1 }] : [])
  ];
  const entries = packDocs.map(d => ({ doc: d, fromPack: true, listed: false }));
  const bought = [];
  const tradedIn = [];
  const listedEntries = [];
  for (const w of wanted) {
    const r = resolveGear(w.label, distinctPackDocs, warnings);
    if (!r) { warnings.push(`UNRESOLVED gear "${w.label}"`); continue; }
    const isArmor = r.doc.system.equipmentType === 'armor';
    // A different armor than the pack's replaces it (one worn set; the old one is traded in at cost).
    if (isArmor && !r.fromPack) {
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].fromPack && entries[i].doc.system.equipmentType === 'armor') {
          copper += costCopper(entries[i].doc.system.baseCost);
          tradedIn.push(entries[i].doc.name);
          entries.splice(i, 1);
        }
      }
    }
    const have = entries.filter(e => e.doc._id === r.doc._id && !e.listed);
    for (let i = 0; i < w.qty; i++) {
      let e = have[i];
      if (!e) {
        e = { doc: r.doc, fromPack: false, listed: true };
        entries.push(e);
        const c = costCopper(r.doc.system.baseCost);
        copper -= c;
        bought.push(`${r.doc.name} (${fmtCost(c)})`);
      }
      e.listed = true;
      listedEntries.push(e);
    }
  }
  let shortBy = 0;
  if (copper < 0) { shortBy = -copper; warnings.push(`NOT ENOUGH MONEY: short by ${fmtCost(shortBy)} after buying ${bought.join(', ')}`); copper = 0; }

  // --- equip state: only the guide's listed gear, in the book's order, within the 2-hand pool (armor is free)
  const stateOf = new Map();
  let handsUsed = 0;
  for (const e of listedEntries) {
    const type = e.doc.system.equipmentType;
    if (!['weapon', 'armor', 'gear'].includes(type)) continue;
    const state = defaultEquipState(e.doc);
    const h = handsOf(state);
    if (handsUsed + h <= MAX_HANDS) { handsUsed += h; stateOf.set(e, state); }
    else warnings.push(`hand pool full: "${e.doc.name}" left unequipped`);
  }
  const items = [];
  for (const [i, e] of entries.entries()) {
    const item = embedItem(actorId, e.doc, `${actorId}|${e.doc.__pack}.${e.doc._id}|${i}`);
    if (e.doc.type === 'equipment') {
      item.system.equipmentState = stateOf.get(e) ?? 'unequipped';
      item.system.equipped = item.system.equipmentState !== 'unequipped';
    }
    items.push(item);
  }
  // 0-Slot copies (rations, incense…) merge into stacks of 10 = 1 Slot, like the builder.
  wearFirstBackpack(items); // Backpack worn: +3 Slots, no Slot of its own
  items.splice(0, items.length, ...stackZeroSlotItems(items));

  // --- class item
  items.push(embedItem(actorId, cls, `${actorId}|class`));

  // --- level-1 perks
  const lvl1 = g.perks.find(p => p.level === 1)?.perks ?? [];
  let toughCount = 0;
  for (const name of lvl1) {
    const hits = byName('perks', name);
    if (!hits.length) { warnings.push(`UNRESOLVED perk "${name}"`); continue; }
    const perk = embedItem(actorId, hits[0], `${actorId}|perk|${name}`);
    const cc = hits[0].system.choiceConfig;
    if (cc && cc.type && cc.type !== 'none') warnings.push(`perk "${name}" has a choice (${cc.type}) — set manually`);
    foundry_setFlag(perk, { type: 'level', level: 1 });
    if (norm(name) === 'tough') toughCount++;
    items.push(perk);
  }

  // --- spells (the part before ';' is the starting list)
  const spellNames = g.spells.trim() === '-' ? [] :
    g.spells.split(';')[0].split(',').map(s => s.replace(/\band\b/i, '').trim()).filter(Boolean);
  for (const name of spellNames) {
    let hits = byName('spells', name);
    // Some book Spells ship as two docs ("Tempo +" / "Tempo -"): learn both.
    if (!hits.length) hits = packs.spells.filter(d => norm(d.name).replace(/\s*[+-]$/, '') === norm(name));
    if (!hits.length) { warnings.push(`UNRESOLVED spell "${name}"`); continue; }
    if (hits.length > 1) warnings.push(`spell "${name}" -> ${hits.map(h => h.name).join(' + ')}`);
    for (const h of hits) {
      const sp = embedItem(actorId, h, `${actorId}|spell|${h.name}`);
      sp.system.favorite = true;
      items.push(sp);
    }
  }

  // --- training
  const skills = {};
  const trained = new Set(g.training.map(t => SKILL_ALIAS[norm(t)] ?? norm(t)));
  for (const s of cls.system.skillGrant?.guaranteed ?? []) trained.add(s);
  for (const s of trained) skills[s] = { trained: true };
  if (!g.training.length) warnings.push('book lists no Training for this build (class-guaranteed Skills only)');

  // --- stats / vitals
  const lv1 = g.stats['1'];
  const stats = Object.fromEntries(Object.entries(lv1).map(([k, v]) => [k, { value: v }]));
  const hp = Math.max(1, lv1.might + toughCount);
  const isCaster = !!cls.system.isSpellcaster;

  // --- currency (leftover of the pack after buying)
  const gold0 = spDoc?.system?.currency?.gold ?? 0;
  const currency = { gold: gold0, silver: 0, copper: 0 };
  let rest = copper - gold0 * RATES.gold;
  if (rest < 0) { currency.gold = Math.floor(copper / RATES.gold); rest = copper - currency.gold * RATES.gold; }
  currency.silver = Math.floor(rest / RATES.silver);
  currency.copper = rest - currency.silver * RATES.silver;

  // --- biography note
  const note = [];
  note.push(`<h2>${esc(g.title)} — Build Guide</h2>`);
  note.push('<p><em>Core Rulebook v3 Alpha 3, Appendix C. This Hero is built at Level 1 with no Ancestry — pick one, rename the Hero, and adjust anything you like.</em></p>');
  if (buyNote) note.push(`<p><strong>Starting Pack note:</strong> ${esc(g.startingPack)}</p>`);
  if (tradedIn.length) note.push(`<p><strong>Traded in:</strong> the Starting Pack's ${esc(tradedIn.join(', '))} (refunded at cost) for the Armor below.</p>`);
  if (bought.length) note.push(`<p><strong>Bought with the Starting Pack's silver:</strong> ${esc(bought.join(', '))}.</p>`);
  if (shortBy) note.push(`<p><em>The build's gear costs ${esc(fmtCost(shortBy))} more than the Starting Pack's money; it starts with no coins left.</em></p>`);
  const l10 = g.stats['10'];
  if (l10) {
    note.push('<h3>Stats at Level 10</h3>');
    note.push('<p>' + Object.keys(STAT_ABBR).map(k => `<strong>${STAT_ABBR[k]}</strong> ${l10[k]}`).join(' · ') + '</p>');
  }
  note.push('<h3>Perks by Level</h3><ul>');
  for (const p of g.perks) {
    note.push(`<li><strong>${ordinal(p.level)}:</strong> ${p.perks.length ? esc(p.perks.join(', ')) : '<em>(blank in the book)</em>'}${p.level === 1 ? ' <em>(already on this sheet)</em>' : ''}</li>`);
  }
  note.push('</ul>');
  if (g.spells.trim() !== '-') note.push(`<h3>Spells</h3><p>${esc(g.spells)}</p>`);
  if (g.perks.some(p => !p.perks.length)) warnings.push('a Perk level is blank in the book');
  const twins = guides.filter(o => o !== g && o.title.split(' - ')[0] === className &&
    JSON.stringify(o.perks) === JSON.stringify(g.perks));
  const gaps = [];
  if (!g.training.length || !g.startingPack || !g.weapon) gaps.push('the book leaves Training / Starting Pack / Weapon blank for this build');
  if (twins.length) gaps.push(`its Perk list is identical to ${twins.map(t => t.title).join(', ')} in the book`);
  if (g.perks.some(p => !p.perks.length)) gaps.push('one Perk level is blank in the book');
  if (gaps.length) note.push(`<p><em>Book note: ${esc(gaps.join('; '))}.</em></p>`);

  // --- images
  const img = images.guides?.[g.title]?.img ?? images.classes?.[className]?.img ?? images.default?.img ?? cls.img ?? 'icons/svg/mystery-man.svg';
  const token = images.guides?.[g.title]?.token ?? images.classes?.[className]?.token ?? images.default?.token ?? img;

  const actor = {
    name: g.title,
    type: 'character',
    img,
    system: {
      attributes: { level: { value: 1 } },
      stats,
      skills,
      health: { value: hp },
      currentLuck: lv1.luck,
      currency,
      biography: note.join('\n'),
      details: { constructed: true, builderDismissed: false },
      ...(isCaster ? { mana: { current: (cls.system.manaMultiplier ?? 0) * 1 } } : {})
    },
    prototypeToken: {
      name: g.title,
      actorLink: true,
      disposition: 1,
      texture: { src: token },
      bar1: { attribute: 'health' }
    },
    items,
    effects: [],
    folder: null,
    flags: { vagabond: { buildGuide: buildGuidePlan(g, className) } },
    ownership: { default: 2 }, // compendium doc ownership is irrelevant to import; pack ownership lives in system.json
    sort: 0,
    _id: actorId,
    _key: `!actors!${actorId}`
  };
  delete actor.ownership; // let Foundry default it
  results.push({ file: `${fileSafe(g.title)}_${actorId}.json`, actor });
  report.push({
    title: g.title, cls: className, pack: packName || '(none)', hp, items: items.map(i => i.name).join('; '),
    money: fmtCost(copper), warnings
  });
}

// ---------------------------------------------------------------- output
/**
 * The guide's progression, stored on the actor so the Level Up dialog can preselect picks.
 * `stats` holds the book's Level 1 and Level 10 rows; `perks` the book's Perk-by-Level list;
 * `spells` splits "A, B; get C and D later" into the starting list and the later list.
 */
function buildGuidePlan(g, className) {
  const cut = g.spells.trim() === '-' ? '' : g.spells;
  const [start = '', rest = ''] = cut.split(';');
  const names = t => t.replace(/^\s*get\s/i, '').replace(/\slater\.?\s*$/i, '').split(',')
    .map(x => x.replace(/^\s*and\s/i, '').trim()).filter(Boolean);
  return {
    title: g.title,
    className,
    stats: g.stats,
    perks: g.perks.map(p => ({ level: p.level, perks: [...p.perks] })),
    spells: { start: names(start), later: names(rest) }
  };
}
function foundry_setFlag(item, origin) {
  item.flags = item.flags ?? {};
  item.flags.vagabond = { ...(item.flags.vagabond ?? {}), perkOrigin: origin };
}

for (const r of report) {
  console.log(`\n## ${r.title}${r.pack ? ` [${r.pack}]` : ''}  HP~${r.hp}  left: ${r.money}`);
  if (r.items) console.log('   items:', r.items);
  for (const w of r.warnings ?? []) console.log('   !!', w);
}

if (REPORT_ONLY) {
  console.log(`\n(report only) ${results.length}/${guides.length} guides resolved.`);
} else {
  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  for (const { file, actor } of results) writeFileSync(resolve(OUT, file), JSON.stringify(actor, null, 2) + '\n');
  console.log(`\nWrote ${results.length} actors -> ${OUT}`);
}
