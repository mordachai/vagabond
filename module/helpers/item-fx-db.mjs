/**
 * VagabondFXDb
 *
 * Read-only view of the Sequencer database (JB2A free / Patreon) for item FX:
 *  - a cached path tree (`children`, `exists`, `files`) that powers the FX picker window,
 *  - `autoSpec(item)` — auto-recognition: item → best-matching database path,
 *  - `expandSpec` — resolves `*` wildcards in database paths (Sequencer itself does not).
 *
 * Database paths used here are dotted prefixes (`jb2a.rapier.melee`, `jb2a.rapier.melee.01.white`).
 * Handing Sequencer a prefix makes it pick randomly among everything under it, so
 * "any variant" / "any color" never needs a literal `*` in the stored string.
 */

import { EquipmentHelper } from './equipment-helper.mjs';

/** Weapon-name fragments → JB2A weapon key. Matched longest-first against the squashed name. */
const MELEE_ALIASES = {
  // swords
  longsword: 'sword', broadsword: 'sword', bastardsword: 'sword', arming: 'sword', sword: 'sword',
  shortsword: 'shortsword', gladius: 'shortsword',
  greatsword: 'greatsword', claymore: 'greatsword', zweihander: 'greatsword',
  scimitar: 'scimitar', sabre: 'scimitar', saber: 'scimitar', cutlass: 'scimitar', katana: 'scimitar',
  falchion: 'falchion',
  rapier: 'rapier', foil: 'rapier', estoc: 'rapier',
  dagger: 'dagger', knife: 'dagger', dirk: 'dagger', stiletto: 'dagger', shiv: 'dagger',
  // axes
  greataxe: 'greataxe', battleaxe: 'greataxe', poleaxe: 'halberd',
  handaxe: 'handaxe', hatchet: 'handaxe', tomahawk: 'handaxe', axe: 'handaxe',
  // blunt
  club: 'club', cudgel: 'club', bludgeon: 'club', truncheon: 'club',
  greatclub: 'greatclub',
  mace: 'mace', morningstar: 'mace',
  warhammer: 'warhammer', hammer: 'hammer',
  maul: 'maul', sledgehammer: 'maul',
  quarterstaff: 'quarterstaff', staff: 'quarterstaff',
  wrench: 'wrench',
  // polearms
  spear: 'spear', pike: 'spear', lance: 'spear', trident: 'spear', javelin: 'spear',
  halberd: 'halberd', glaive: 'glaive', naginata: 'glaive',
};
const ALIAS_ORDER = Object.keys(MELEE_ALIASES).sort((a, b) => b.length - a.length);

/** Ranged-weapon name patterns → database path, first match wins (crossbow before bow). */
const RANGED_FAMILIES = [
  [/crossbow|arbalest/, 'jb2a.bolt.physical'],
  [/bow/, 'jb2a.arrow.physical'],
  [/sling|pistol|musket|rifle|firearm|blunderbuss|handcannon|gun|slingshot/, 'jb2a.bullet'],
];

export class VagabondFXDb {
  /** @type {{size: number, root: Map}|null} */
  static #tree = null;

  static get db() {
    return globalThis.Sequencer?.Database ?? null;
  }

  /** True once Sequencer has registered at least one database entry. */
  static available() {
    return !!this.db?.flattenedEntries?.length;
  }

  /* -------------------------------------------- */
  /*  Path tree                                    */
  /* -------------------------------------------- */

  /**
   * Nested Map tree of every public database path. Distance-range entries (`.30ft`) and
   * array indices are folded away so a "leaf" is the lowest meaningful choice.
   */
  static #getTree() {
    const db = this.db;
    if (!db) return null;
    const entries = db.flattenedEntries;
    if (this.#tree?.size === entries.length) return this.#tree.root;

    const priv = new Set(db.privateModules ?? []);
    const root = new Map();
    for (const raw of entries) {
      const clean = raw.replace(/\.\d+ft(\..*)?$/, '').replace(/\.\d+$/, '');
      const segs = clean.split('.');
      if (priv.has(segs[0])) continue;
      let node = root;
      for (const seg of segs) {
        if (!node.has(seg)) node.set(seg, new Map());
        node = node.get(seg);
      }
    }
    this.#tree = { size: entries.length, root };
    return root;
  }

  static #node(path) {
    let node = this.#getTree();
    if (!node) return null;
    if (!path) return node;
    for (const seg of path.split('.')) {
      node = node.get(seg);
      if (!node) return null;
    }
    return node;
  }

  /** Whether a database path (or prefix) exists. */
  static exists(path) {
    return !!this.#node(path);
  }

  /**
   * Next-level names under a path ('' = top-level modules).
   * @param {string} path
   * @returns {string[]}
   */
  static children(path = '') {
    const node = this.#node(path);
    return node ? [...node.keys()].sort((a, b) => a.localeCompare(b)) : [];
  }

  /**
   * Playable files under a database path, ft-range duplicates removed (one per variation).
   * @param {string} path
   * @param {number} [cap=24]
   * @returns {string[]}
   */
  static files(path, cap = 24) {
    const db = this.db;
    if (!db || !this.exists(path)) return [];
    let found;
    try { found = db.getAllFileEntries(path); } catch { return []; }
    if (!Array.isArray(found)) return [];
    const seen = new Set();
    const out = [];
    for (const f of found) {
      if (typeof f !== 'string' || !/\.(webm|mp4)$/i.test(f)) continue;
      // Ranged anims ship one file per distance — keep a single representative.
      const key = f.replace(/_\d+ft_\d+x\d+(?=\.\w+$)/i, '');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(f);
      if (out.length >= cap) break;
    }
    return out;
  }

  /**
   * Distance-ranged clips (`..._15ft_1000x400.webm`, `_30ft_`, `_60ft_`…) are ONE database
   * entry with a file per range: Sequencer picks the file matching the caster → target
   * distance, but only when handed the database path. Pinning a single range file would
   * lock the clip to one distance, so map a file back to its range-less database path.
   * @param {string} file
   * @returns {string|null} database path, or null when `file` isn't a ranged clip
   */
  static rangedPathOf(file) {
    if (!/_\d+ft_/i.test(file)) return null;
    let dbPath;
    try { dbPath = this.db?.filePathDatabasePaths?.[file]; } catch { return null; }
    if (!dbPath) return null;
    const path = dbPath.replace(/\.\d+ft(\..*)?$/, '');
    return path !== dbPath && this.exists(path) ? path : null;
  }

  /** Sequencer DB paths are dotted with no slash and no file extension. */
  static isDbPath(p) {
    return typeof p === 'string'
      && !/[/\\]/.test(p)
      && !/\.(webm|mp4|webp|png|jpe?g|gif|ogg|mp3|wav)$/i.test(p)
      && p.includes('.');
  }

  /* -------------------------------------------- */
  /*  Wildcards                                    */
  /* -------------------------------------------- */

  /**
   * Replace `*` segments in database paths with real paths Sequencer understands.
   * Trailing `*` simply means "everything under this prefix"; a middle `*`
   * (`jb2a.rapier.melee.*.white`) expands to every matching exact path.
   * File paths and plain database paths pass through untouched.
   * @param {string|string[]} spec
   * @returns {string|string[]}
   */
  static expandSpec(spec) {
    if (!spec) return spec;
    const parts = Array.isArray(spec) ? spec : [spec];
    const out = [];
    for (const part of parts) {
      if (!this.isDbPath(part) || !part.includes('*')) { out.push(part); continue; }
      const segs = part.split('.');
      while (segs.length && /^\*+$/.test(segs[segs.length - 1])) segs.pop();
      if (!segs.some(s => s.includes('*'))) {
        if (segs.length && this.exists(segs.join('.'))) out.push(segs.join('.'));
        continue;
      }
      this.#walk(this.#getTree(), segs, 0, [], out);
    }
    if (!out.length) return '';
    return out.length === 1 ? out[0] : out;
  }

  static #walk(node, segs, i, acc, out) {
    if (!node) return;
    if (i === segs.length) { out.push(acc.join('.')); return; }
    const rx = segs[i].includes('*')
      ? new RegExp(`^${segs[i].replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*+/g, '.*')}$`)
      : null;
    for (const [name, child] of node) {
      if (rx ? !rx.test(name) : name !== segs[i]) continue;
      this.#walk(child, segs, i + 1, [...acc, name], out);
    }
  }

  /* -------------------------------------------- */
  /*  Auto-recognition                             */
  /* -------------------------------------------- */

  /**
   * Best database path for an item, from its name and weapon data.
   * Weapons map to their JB2A family; thrown Alchemical Items to a thrown flask / bomb.
   * Anything unrecognised gets a generic attack so a weapon always animates.
   * @param {Item} item
   * @returns {{path: string, animType: 'melee'|'ranged'}|null}
   */
  static autoSpec(item) {
    if (!this.available() || !this.exists('jb2a')) return null;
    const sys = item?.system ?? {};
    const compact = String(item?.name ?? '').toLowerCase().replace(/[^a-z]/g, '');

    if (sys.equipmentType === 'weapon') return this.#autoWeapon(sys, compact);
    if (sys.equipmentType === 'alchemical' && EquipmentHelper.isThrownAlchemical(item)) {
      const path = /bomb|grenade|powder|explosive|petard|dynamite/.test(compact)
        ? 'jb2a.throwable.throw.bomb'
        : 'jb2a.throwable.throw.flask';
      return this.exists(path) ? { path, animType: 'ranged' } : null;
    }
    return null;
  }

  /**
   * Auto-recognised animation for a THROW: always a projectile that travels
   * caster → target. Thrown Alchemical Items reuse their flask / bomb pick; Thrown
   * weapons look for their family's throw clip (`jb2a.<weapon>.throw`), then fall
   * back to the generic thrown blade so a throw never plays a melee slash.
   * @param {Item} item
   * @returns {{path: string, animType: 'ranged'}|null}
   */
  static autoThrownSpec(item) {
    if (!this.available() || !this.exists('jb2a')) return null;
    const sys = item?.system ?? {};
    if (sys.equipmentType === 'alchemical') {
      const auto = this.autoSpec(item);
      return auto ? { path: auto.path, animType: 'ranged' } : null;
    }
    if (sys.equipmentType !== 'weapon') return null;

    const compact = String(item?.name ?? '').toLowerCase().replace(/[^a-z]/g, '');
    const alias = ALIAS_ORDER.find(a => compact.includes(a));
    const key = alias ? MELEE_ALIASES[alias] : null;
    const candidates = [
      key && `jb2a.${key}.throw`,
      key && `jb2a.${key}.ranged`,
      'jb2a.dagger.throw',
    ].filter(Boolean);
    const path = candidates.find(p => this.exists(p));
    return path ? { path, animType: 'ranged' } : null;
  }

  static #autoWeapon(sys, compact) {
    const ranged = sys.weaponSkill === 'ranged';
    if (ranged) {
      for (const [rx, path] of RANGED_FAMILIES) {
        if (rx.test(compact) && this.exists(path)) return { path, animType: 'ranged' };
      }
    }

    const alias = ALIAS_ORDER.find(a => compact.includes(a));
    if (alias && !ranged) {
      const key = MELEE_ALIASES[alias];
      for (const sub of ['melee', 'standard']) {
        const path = `jb2a.${key}.${sub}`;
        if (this.exists(path)) return { path, animType: 'melee' };
      }
    }

    if (ranged) {
      return this.exists('jb2a.arrow.physical') ? { path: 'jb2a.arrow.physical', animType: 'ranged' } : null;
    }
    if (sys.weaponSkill === 'brawl' || /fist|unarmed|gauntlet|knuckle|claw/.test(compact)) {
      if (this.exists('jb2a.unarmed_strike.physical')) return { path: 'jb2a.unarmed_strike.physical', animType: 'melee' };
    }
    return this.exists('jb2a.melee_generic.slash') ? { path: 'jb2a.melee_generic.slash', animType: 'melee' } : null;
  }
}
