/**
 * Pack sync core — pure helpers shared by the history builder (`scripts/pack-history/build.mjs`, Node) and the
 * world sync (`helpers/pack-sync.mjs`, Foundry). No Foundry globals here.
 *
 * A document is compared field by field ("leaves"): plain objects are walked, arrays of objects (Ancestry traits,
 * Class features, NPC actions, effect changes…) are walked entry by entry (path segment = index), anything else
 * (strings, numbers, arrays of primitives) is one leaf. Leaves compare by `canon` (null / '' / undefined-free
 * stringly form, so "2" from pack JSON and 2 from a cleaned copy are the same value).
 */

/** History marker: the field did not exist in that pack version. */
export const ABSENT = '~';

/** Per-copy state: never synced, never reported (prefix match on the leaf path). */
export const IGNORE = {
  Item: [
    'system.quantity', 'system.equipmentState', 'system.equipped', 'system.gridPosition', 'system.containerId',
    'system.locked', 'system.favorite', 'system.bound', 'system.coating', 'system.imbuedSpell',
    'system.armorDamage', 'system.dieDamage', 'system.uses.value', 'system.relic.powers',
    'system.relic.requiresBond', 'system.relic.cursed', 'system.disguise', 'system.linkedConsumable',
    'system.currency', 'system.items', 'system.choiceConfig.selected',
  ],
  Actor: [
    'system.health.value', 'system.fatigue', 'system.locked', 'system.favorHinder', 'system.zone',
    'system.mana.current', 'system.currency', 'system.attributes.xp', 'system.inventory', 'system.focus',
    'system.currentLuck', 'system.studiedDice', 'system.craft', 'system.details', 'system.statusEffectData',
    'system.overhealExcess', 'system.manualCheckBonus',
  ],
  ActiveEffect: [],
};

/** The compared part of a document's source data. */
export function syncFields(kind, data) {
  if (kind === 'ActiveEffect') {
    return {
      name: data.name, img: data.img, description: data.description, statuses: data.statuses,
      system: data.system, flags: { vagabond: data.flags?.vagabond },
    };
  }
  return { name: data.name, img: data.img, system: data.system };
}

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Array walked entry by entry: non-empty, every entry a plain object. */
export function isEntryArray(v) {
  return Array.isArray(v) && v.length > 0 && v.every(isPlainObject);
}

export function joinPath(path, key) {
  return path ? `${path}.${key}` : String(key);
}

export function isIgnored(kind, path) {
  return (IGNORE[kind] ?? []).some(p => path === p || path.startsWith(`${p}.`));
}

/** Stable string form of a value (null and '' are the same; object keys sorted). */
export function canon(v) {
  if (v === undefined) return ABSENT;
  if (v === null || v === '') return 's:';
  if (Array.isArray(v)) return `[${v.map(canon).join('\u0001')}]`;
  if (typeof v === 'object') {
    return `{${Object.keys(v).sort().map(k => `${k}=${canon(v[k])}`).join('\u0001')}}`;
  }
  return `s:${String(v)}`;
}

/** cyrb53 — small, fast, sync 53-bit string hash (same result in Node and the browser). */
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** History hash of a leaf value (`ABSENT` stays as is). */
export function hashValue(v) {
  if (v === undefined) return ABSENT;
  return cyrb53(canon(v)).toString(36);
}

/**
 * Leaves of a value: `[path, value]` pairs. Empty objects are a leaf (`{}`), ignored paths are skipped.
 * @param {string} kind  'Item' | 'Actor' | 'ActiveEffect'
 */
export function leaves(kind, value, path = '', out = []) {
  if (path && isIgnored(kind, path)) return out;
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (!keys.length && path) out.push([path, value]);
    for (const k of keys) leaves(kind, value[k], joinPath(path, k), out);
  } else if (isEntryArray(value)) {
    value.forEach((entry, i) => leaves(kind, entry, joinPath(path, i), out));
  } else if (path) {
    out.push([path, value]);
  }
  return out;
}

/**
 * Pack-relative key of a document from its source `_key` (`!items.effects!I.E` → `Item.I.ActiveEffect.E`).
 * With the pack name it is the tail of the compendium uuid: `Compendium.vagabond.<pack>.<key>`.
 */
const COLLECTIONS = { actors: 'Actor', items: 'Item', effects: 'ActiveEffect', macros: 'Macro' };
export function keyFromSourceKey(sourceKey) {
  const m = /^!([a-z.]+)!(.+)$/.exec(sourceKey ?? '');
  if (!m) return null;
  const types = m[1].split('.').map(c => COLLECTIONS[c]);
  const ids = m[2].split('.');
  if (types.some(t => !t) || types.length !== ids.length) return null;
  return types.map((t, i) => `${t}.${ids[i]}`).join('.');
}

/** `Compendium.vagabond.<pack>.<Type>.<id>[...]` → history key `<pack>.<Type>.<id>[...]`, else null. */
export function keyFromUuid(uuid, systemId = 'vagabond') {
  const prefix = `Compendium.${systemId}.`;
  return typeof uuid === 'string' && uuid.startsWith(prefix) ? uuid.slice(prefix.length) : null;
}
