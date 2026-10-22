/**
 * VagabondFXResolver
 *
 * Sequencer browses the host filesystem (FilePicker.browse) whenever it is handed a
 * raw wildcard path like `modules/foo/anims/spell_*.webm`. Non-GM players lack the
 * FILES_BROWSE permission, so that throws:
 *   "Sequencer | getFiles | Error: You do not have permission to browse the host file system!"
 *
 * This resolver pre-expands wildcard file paths into explicit file arrays so Sequencer
 * never needs to browse on a player client:
 *   - The GM (who has FILES_BROWSE) resolves wildcards via FilePicker.browse and persists
 *     the result in the hidden world setting `fxResolvedCache`, which syncs to all clients.
 *   - At ready, the GM pre-resolves every wildcard referenced by spell FX config and item FX.
 *   - A player that hits an unresolved wildcard requests resolution from the GM over the
 *     socket and awaits the broadcast reply (best-effort, with a timeout fallback).
 *
 * Sequencer **database** paths (dotted, e.g. `jb2a.fireball.explosion.orange`, including
 * wildcard variants like `jb2a.melee_attack.*`) resolve from Sequencer's in-memory database
 * and never browse — those are intentionally left untouched.
 */

import { GMRelay } from './gm-relay.mjs';

const SETTING = 'fxResolvedCache';
const RESOLVE_QUERY = 'vagabond.fx.resolve';

export class VagabondFXResolver {
  /** path → string[] resolved files (in-memory cache, all clients) */
  static _mem = new Map();

  /**
   * True only for raw filesystem wildcard paths that would trigger FilePicker.browse.
   * Sequencer DB paths (dotted, no slash) are excluded — they resolve from the DB.
   * @param {*} p
   * @returns {boolean}
   * @private
   */
  static _isFsWildcard(p) {
    if (typeof p !== 'string' || !p.includes('*')) return false;
    return /[/\\]/.test(p) || /\.\w{2,5}$/.test(p.trim());
  }

  /**
   * Read a resolved file list from memory, then the world-setting cache.
   * @param {string} p
   * @returns {string[]|null}
   * @private
   */
  static _cacheGet(p) {
    if (this._mem.has(p)) return this._mem.get(p);
    try {
      const store = game.settings.get('vagabond', SETTING) ?? {};
      if (Array.isArray(store[p])) { this._mem.set(p, store[p]); return store[p]; }
    } catch { /* setting not ready */ }
    return null;
  }

  /**
   * Persist a resolved list to memory (all clients) and the world setting (GM only).
   * @param {string} p
   * @param {string[]} files
   * @private
   */
  static async _persist(p, files) {
    this._mem.set(p, files);
    if (!game.user.isGM) return;
    try {
      const store = foundry.utils.deepClone(game.settings.get('vagabond', SETTING) ?? {});
      store[p] = files;
      await game.settings.set('vagabond', SETTING, store);
    } catch (e) {
      console.warn('Vagabond | FXResolver persist failed:', e);
    }
  }

  /**
   * GM-side wildcard expansion via FilePicker (uses .implementation for hosted setups).
   * @param {string} p
   * @returns {Promise<string[]>}
   * @private
   */
  static async _browse(p) {
    const FP = foundry.applications.apps.FilePicker.implementation ?? foundry.applications.apps.FilePicker;
    try {
      const res = await FP.browse('data', p, { wildcard: true });
      return res?.files ?? [];
    } catch (e) {
      console.warn('Vagabond | FXResolver browse failed for', p, e);
      return [];
    }
  }

  /**
   * GM: resolve a wildcard (cache-first), persisting any newly browsed result.
   * @param {string} p
   * @returns {Promise<string[]>}
   * @private
   */
  static async _gmResolve(p) {
    const cached = this._cacheGet(p);
    if (cached) return cached;
    const files = await this._browse(p);
    if (files.length) await this._persist(p, files);
    return files;
  }

  /**
   * Player: ask the GM (relay query) to resolve a wildcard.
   * Resolves to the file array, or null (no GM, timeout, nothing found).
   * @param {string} p
   * @returns {Promise<string[]|null>}
   * @private
   */
  static async _requestFromGM(p) {
    const files = await GMRelay.run(RESOLVE_QUERY, { path: p }, { timeout: 4000 }).catch(() => null);
    if (!Array.isArray(files) || !files.length) return null;
    this._mem.set(p, files);
    return files;
  }

  /**
   * Resolve a file spec into a browse-free value. Non-wildcard specs pass through
   * unchanged; wildcards expand to explicit files (Sequencer picks one at random from
   * an array). Unresolvable wildcard parts are dropped to avoid handing them to
   * Sequencer (which would browse and throw on player clients).
   * @param {string|string[]} spec  single path or pre-split array of paths
   * @returns {Promise<string|string[]>}
   */
  static async resolve(spec) {
    if (!spec) return spec;
    const parts = Array.isArray(spec) ? spec : [spec];
    const out = [];
    for (const part of parts) {
      if (!this._isFsWildcard(part)) { out.push(part); continue; }
      let files = this._cacheGet(part);
      if (!files) {
        files = game.user.isGM ? await this._gmResolve(part) : await this._requestFromGM(part);
      }
      if (files?.length) out.push(...files);
      // else: drop the part — better no animation than a browse-permission crash.
    }
    if (!out.length) return '';
    return out.length === 1 ? out[0] : out;
  }

  /**
   * Resolve several file specs at once into a Map keyed by the original spec value,
   * so callers can swap `cfg.file` → resolved without restructuring their cfg objects.
   * @param {Array<string|undefined>} specs
   * @returns {Promise<Map<string, string|string[]>>}
   */
  static async resolveMap(specs) {
    const map = new Map();
    const uniq = [...new Set(specs.filter(s => typeof s === 'string' && s))];
    await Promise.all(uniq.map(async s => { map.set(s, await this.resolve(s)); }));
    return map;
  }

  /**
   * Resolve a sound spec to ONE playable file for `AudioHelper.play` / `<audio src>`
   * (they take a plain path). Accepts a file path, a filesystem wildcard (resolved as
   * above) or a Sequencer DB key (`psfx.weapon-attacks.sword.v1`, a parent key picks
   * among every file under it). Several matches → one at random.
   * Returns '' when nothing can play here: the DB key is not registered (its module,
   * e.g. PSFX, is not active) or the path points into an inactive module.
   * @param {string} spec
   * @returns {Promise<string>}
   */
  static async soundFile(spec) {
    if (typeof spec !== 'string' || !spec.trim()) return '';
    spec = spec.trim();
    let files;
    // No folder = Sequencer DB key (keys may end in `.001` / `.v1`, so no extension test)
    if (!/[/\\]/.test(spec)) {
      const db = globalThis.Sequencer?.Database;
      if (!db?.entryExists(spec)) return '';
      files = [];
      const collect = v => {
        if (!v) return;
        if (typeof v === 'string') files.push(v);
        else if (Array.isArray(v)) v.forEach(collect);
        else if ('file' in v) collect(v.file);
        else if (typeof v === 'object') Object.values(v).forEach(collect);
      };
      collect(db.getEntry(spec, { softFail: true }));
    } else {
      const moduleId = spec.match(/^modules\/([^/]+)\//)?.[1];
      if (moduleId && !game.modules.get(moduleId)?.active) return '';
      const resolved = await this.resolve(spec);
      files = Array.isArray(resolved) ? resolved : [resolved];
    }
    files = files.filter(f => typeof f === 'string' && f);
    return files.length ? files[Math.floor(Math.random() * files.length)] : '';
  }

  /**
   * GM, at ready / on FX-config change: pre-resolve every wildcard path referenced by
   * the saved spell FX config.
   * Reads the raw `sequencerFxConfig` setting directly to avoid importing the sequencer
   * (and the JB2A fallback, whose paths are DB paths that never browse).
   */
  static async resolveAllConfigured() {
    if (!game.user.isGM) return;
    const paths = new Set();

    // Spell FX config (saved world setting only).
    try {
      const stored = game.settings.get('vagabond', 'sequencerFxConfig') ?? {};
      const cfg = foundry.utils.expandObject(stored);
      const add = e => { for (const p of [e?.file, e?.sound]) if (this._isFsWildcard(p)) paths.add(p); };
      for (const e of Object.values(cfg.castAnims ?? {})) add(e);
      for (const school of Object.values(cfg.areaAnims ?? {}))
        for (const e of Object.values(school ?? {})) add(e);
    } catch { /* setting not ready */ }

    for (const p of paths) await this._gmResolve(p);
  }

  /**
   * Register the GM relay handler (the GM resolves a player's wildcard). Call once in the ready hook on all clients.
   */
  static registerRelay() {
    GMRelay.register(RESOLVE_QUERY, ({ path }) => this._gmResolve(path));
  }
}
