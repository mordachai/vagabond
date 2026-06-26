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

import { emitSocket, registerSocketAction } from './socket-helper.mjs';

const SETTING = 'fxResolvedCache';

export class VagabondFXResolver {
  /** path → string[] resolved files (in-memory cache, all clients) */
  static _mem = new Map();
  /** requestId → { resolve, timer } for pending GM resolution requests (players) */
  static _pending = new Map();
  static _reqSeq = 0;

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
   * Player: ask the GM to resolve a wildcard, await the broadcast reply.
   * Resolves to the file array, or null on timeout.
   * @param {string} p
   * @returns {Promise<string[]|null>}
   * @private
   */
  static _requestFromGM(p) {
    return new Promise(resolve => {
      const id = `${game.user.id}-${++this._reqSeq}-${Date.now()}`;
      const timer = setTimeout(() => {
        this._pending.delete(id);
        resolve(null);
      }, 4000);
      this._pending.set(id, { resolve, timer });
      emitSocket('fxResolveRequest', { requestId: id, path: p });
    });
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
   * GM, at ready / on FX-config change: pre-resolve every wildcard path referenced by
   * the saved spell FX config and by item FX on world + actor-owned items.
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
      for (const e of Object.values(cfg.castAnims ?? {})) if (this._isFsWildcard(e?.file)) paths.add(e.file);
      for (const school of Object.values(cfg.areaAnims ?? {}))
        for (const e of Object.values(school ?? {})) if (this._isFsWildcard(e?.file)) paths.add(e.file);
    } catch { /* setting not ready */ }

    // Item FX (pipe-separated hit/miss file fields).
    const collect = it => {
      const fx = it?.system?.itemFx;
      if (!fx) return;
      for (const f of [fx.hitFile, fx.missFile]) {
        for (const part of String(f ?? '').split('|').map(s => s.trim())) {
          if (this._isFsWildcard(part)) paths.add(part);
        }
      }
    };
    for (const it of game.items ?? []) collect(it);
    for (const a of game.actors ?? []) for (const it of a.items) collect(it);

    for (const p of paths) await this._gmResolve(p);
  }

  /**
   * Register socket request/reply handlers. Call once in the ready hook on all clients.
   */
  static registerSocket() {
    // GM resolves a requested wildcard and broadcasts the reply.
    registerSocketAction('fxResolveRequest', async ({ requestId, path }) => {
      const files = await this._gmResolve(path);
      emitSocket('fxResolveReply', { requestId, path, files });
    });
    // All clients receive the reply; settle the pending promise + warm the cache.
    registerSocketAction('fxResolveReply', ({ requestId, path, files }) => {
      if (Array.isArray(files) && files.length) this._mem.set(path, files);
      const pend = this._pending.get(requestId);
      if (pend) {
        clearTimeout(pend.timer);
        this._pending.delete(requestId);
        pend.resolve(files?.length ? files : null);
      }
    }, { gmOnly: false });
  }
}
