/**
 * Spell FX presets — whole Spell FX configs (the `sequencerFxConfig` world setting) kept as JSON files the GM
 * picks from inside Foundry.
 *
 * - System: every Spell FX config in `systems/vagabond/assets/config/` (shipped, replaced on update).
 * - External: files the GM keeps anywhere under Data, listed in world setting `spellFxPresetFiles`. Import =
 *   Foundry's file picker (browse / upload where you like, pick the file); Save as preset asks for a folder. The
 *   row's trash removes it from the list only: Foundry can't delete files from the browser. System updates never
 *   touch these files.
 *
 * A preset file is the config itself (`castAnims`, `areaAnims`) plus an optional `_meta` block shown when listed:
 *   "_meta": { "name": "…", "description": "plain text, line breaks kept" }
 *
 * ONE file is ALWAYS active: the stored setting's `_meta = {name, source, video, sound, modified}`. The setting is
 * that file's copy (playback reads it); the file is the truth: saves write into it (`writeActive`), and
 * `ensureActive` (GM ready + config window) re-reads it, or falls back to the System default when it is gone. System
 * files are read-only (replaced on update): saving while one is active makes a copy of your own first. `video` /
 * `sound` (booleans) switch that part of the active file on or off without touching the stored config;
 * `withParts(config)` blanks the off part (video = each entry's `file` / `loop`, sound = its `sound`) for playback.
 */
export class SpellFxPresets {

  static SYSTEM_DIR = 'systems/vagabond/assets/config';
  static DEFAULT_FILE = 'vagabond-default-spell-fx-config.json';
  static DEFAULT_USER_DIR = 'assets/vagabond/spell-fx';
  /** Listed when the system folder can't be browsed (e.g. a host that hides it). */
  static #SYSTEM_FALLBACK = [SpellFxPresets.DEFAULT_FILE];
  /** Other configs living in the same folder (Automated Animations menus) — big, never Spell FX. */
  static #SKIP = /^AutomatedAnimations-/i;
  /** path → preset, for this session. */
  static #cache = new Map();

  static #FP() {
    return foundry.applications.apps.FilePicker.implementation ?? foundry.applications.apps.FilePicker;
  }

  static #clean(path) {
    return String(path ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  }

  /** Last folder (under Data) a preset was saved to or picked from: where the pickers open. */
  static userDir() {
    let dir = '';
    try { dir = game.settings.get('vagabond', 'spellFxPresetDir'); } catch { /* not registered yet */ }
    return this.#clean(dir) || this.DEFAULT_USER_DIR;
  }

  static async setUserDir(dir) {
    const d = this.#clean(dir);
    if (d && d !== this.userDir()) await game.settings.set('vagabond', 'spellFxPresetDir', d);
  }

  /** Paths of the GM's own preset files (External). */
  static userFiles() {
    try { return [...new Set((game.settings.get('vagabond', 'spellFxPresetFiles') ?? []).map(p => this.#clean(p)).filter(Boolean))]; }
    catch { return []; }
  }

  static async addUserFile(path) {
    const p = this.#clean(path);
    const files = this.userFiles();
    this.#cache.delete(p);
    if (!files.includes(p)) await game.settings.set('vagabond', 'spellFxPresetFiles', [...files, p]);
    await this.setUserDir(p.split('/').slice(0, -1).join('/'));
  }

  /** Is `path` one of the GM's own files (writable), not a System one? */
  static isUserFile(path) {
    return this.userFiles().includes(this.#clean(path));
  }

  /** Take a file off the External list (the file stays where it is). The active file can't be taken off. */
  static async removeUserFile(path) {
    const p = this.#clean(path);
    if (p === this.#clean(this.loadedMeta()?.source)) return;
    this.#cache.delete(p);
    await game.settings.set('vagabond', 'spellFxPresetFiles', this.userFiles().filter(f => f !== p));
  }

  /** Once: the files of the old fixed folder join the External list. */
  static async #seed() {
    if (!game.user.isGM) return;
    let done = true;
    try { done = game.settings.get('vagabond', 'spellFxPresetFilesSeeded'); } catch { return; }
    if (done) return;
    let files = [];
    try { files = (await this.#FP().browse('data', this.DEFAULT_USER_DIR, { extensions: ['.json'] }))?.files ?? []; } catch { /* no folder */ }
    const list = [...new Set([...this.userFiles(), ...files.map(f => this.#clean(decodeURI(f)))])];
    await game.settings.set('vagabond', 'spellFxPresetFiles', list);
    await game.settings.set('vagabond', 'spellFxPresetFilesSeeded', true);
  }

  static isPreset(data) {
    return !!data && typeof data === 'object' && !!data.castAnims && !!data.areaAnims;
  }

  /** Clean `_meta` of a preset file. */
  static metaOf(data) {
    const m = data?._meta ?? {};
    return {
      name: String(m.name ?? '').trim(),
      description: String(m.description ?? '').trim(),
    };
  }

  static fileName(path) {
    const last = String(path).split('/').pop();
    try { return decodeURIComponent(last); } catch { return last; }
  }

  /** @returns {Promise<{system: object[], user: object[]}>} */
  static async list({ fresh = false } = {}) {
    if (fresh) this.#cache.clear();
    await this.#seed();
    const [system, user] = await Promise.all([
      this.#listDir(this.SYSTEM_DIR, 'system'),
      Promise.all(this.userFiles().map(f => this.read(f, 'user'))),
    ]);
    return { system, user: user.sort((a, b) => a.label.localeCompare(b.label)) };
  }

  static async #listDir(dir, kind) {
    let files;
    try {
      files = (await this.#FP().browse('data', dir, { extensions: ['.json'] }))?.files ?? [];
    } catch {
      files = kind === 'system' ? this.#SYSTEM_FALLBACK.map(f => `${dir}/${f}`) : [];
    }
    files = files.filter(f => !this.#SKIP.test(this.fileName(f)));
    const presets = await Promise.all(files.map(f => this.read(f, kind)));
    return presets.sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Read one file. Always returns an entry; `invalid` names why it can't be used
   * ('unreadable' | 'json' | 'notSpellFx'), else null.
   */
  static async read(path, kind = 'user') {
    if (this.#cache.has(path)) return this.#cache.get(path);
    const file = this.fileName(path);
    let data = null, invalid = null;
    try {
      const resp = await fetch(path, { cache: 'no-store' });
      if (!resp.ok) invalid = 'unreadable';
      else {
        try { data = JSON.parse(await resp.text()); } catch { invalid = 'json'; }
        if (!invalid && !this.isPreset(data)) invalid = 'notSpellFx';
      }
    } catch (err) {
      console.warn(`Vagabond | Spell FX preset ${path} could not be read`, err);
      invalid = 'unreadable';
    }
    const meta = invalid ? this.metaOf(null) : this.metaOf(data);
    const preset = { path, file, kind, data: invalid ? null : data, meta, invalid, label: meta.name || file.replace(/\.json$/i, '') };
    this.#cache.set(path, preset);
    return preset;
  }

  /** Make `preset` the active file: the world's Spell FX config becomes the file's, with the given parts on. */
  static async apply(preset, { video = true, sound = true } = {}) {
    if (!preset?.data) return;
    const next = foundry.utils.deepClone(preset.data);
    next._meta = { name: preset.label, source: preset.path, video, sound, modified: false };
    await game.settings.set('vagabond', 'sequencerFxConfig', next);
  }

  /** Config without `_meta`, expanded. */
  static #body(config) {
    const body = foundry.utils.expandObject(foundry.utils.deepClone(config ?? {}));
    delete body._meta;
    return body;
  }

  static #same(a, b) {
    const d = foundry.utils.diffObject;
    return foundry.utils.isEmpty(d(a, b)) && foundry.utils.isEmpty(d(b, a));
  }

  /**
   * There is always one active file. Its file is re-read (changes made on disk are picked up); a missing or broken
   * active file — or none at all — gives way to the System default. GM only.
   */
  static async ensureActive({ fresh = false } = {}) {
    if (!game.user.isGM) return;
    const m = this.loadedMeta();
    const { system, user } = await this.list({ fresh });
    const all = [...user, ...system];
    const current = m && all.find(p => !p.invalid && p.path === m.source);
    if (current) {
      const stored = this.#body(game.settings.get('vagabond', 'sequencerFxConfig'));
      if (!this.#same(stored, this.#body(current.data))) await this.apply(current, { video: m.video, sound: m.sound });
      return;
    }
    const fallback = system.find(p => !p.invalid && p.file === this.DEFAULT_FILE) ?? all.find(p => !p.invalid);
    if (!fallback) return;
    await this.apply(fallback, { video: m?.video ?? true, sound: m?.sound ?? true });
    if (m?.source) {
      ui.notifications.warn(game.i18n.format('VAGABOND.SequencerFX.Presets.ActiveMissing', {
        file: this.fileName(m.source), name: fallback.label,
      }));
    }
  }

  /** Write `config` into the active file (a file of your own) and the world setting. */
  static async writeActive(config) {
    const m = this.loadedMeta();
    if (!m || !this.isUserFile(m.source)) throw new Error('the active file is not one of your own');
    const body = this.#body(config);
    const { meta } = await this.read(m.source, 'user');
    const dir = m.source.split('/').slice(0, -1).join('/');
    await this.writeUserFile(dir, this.fileName(m.source), {
      _meta: { name: meta.name || m.name, description: meta.description }, ...body,
    });
    await game.settings.set('vagabond', 'sequencerFxConfig', { ...body, _meta: { ...m, modified: false } });
  }

  /** Turn the video or the sound of the active file on / off (the stored config itself is untouched). */
  static async setPart(part, on) {
    if (!['video', 'sound'].includes(part)) return;
    const m = this.loadedMeta();
    if (!m) return;
    const stored = foundry.utils.expandObject(game.settings.get('vagabond', 'sequencerFxConfig') ?? {});
    stored._meta = { ...m, [part]: !!on };
    await game.settings.set('vagabond', 'sequencerFxConfig', stored);
  }

  /** The active file: `{name, source, video, sound, modified}` or null. Older stored shapes read as both parts on. */
  static loadedMeta() {
    const m = foundry.utils.expandObject(game.settings.get('vagabond', 'sequencerFxConfig') ?? {})._meta;
    if (!m || typeof m !== 'object') return null;
    // Interim shape {video: {source, name}, sound: {source, name}}
    if ((m.video && typeof m.video === 'object') || (m.sound && typeof m.sound === 'object')) {
      const part = m.video ?? m.sound;
      return { name: part.name ?? '', source: part.source ?? '', video: !!m.video, sound: !!m.sound, modified: !!m.modified };
    }
    if (!m.source) return null;
    return { name: m.name ?? '', source: m.source, video: m.video !== false, sound: m.sound !== false, modified: !!m.modified };
  }

  /** Config as played: the part switched off on the active file is blanked. */
  static withParts(config) {
    const m = config?._meta;
    if (!m || typeof m !== 'object' || (m.video !== false && m.sound !== false)) return config;
    const out = foundry.utils.deepClone(config);
    const strip = (e) => {
      if (!e || typeof e !== 'object') return;
      if (m.video === false) { e.file = ''; e.loop = ''; }
      if (m.sound === false) e.sound = '';
    };
    for (const e of Object.values(out.castAnims ?? {})) strip(e);
    for (const school of Object.values(out.areaAnims ?? {})) for (const e of Object.values(school ?? {})) strip(e);
    return out;
  }

  /** `name.json` slug for a preset name. */
  static slug(name) {
    const s = String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `${s || 'spell-fx'}.json`;
  }

  /** Is there a `fileName` in folder `dir` (under Data)? */
  static async fileExists(dir, fileName) {
    try {
      const files = (await this.#FP().browse('data', this.#clean(dir), { extensions: ['.json'] }))?.files ?? [];
      return files.some(f => this.fileName(f) === fileName);
    } catch { return false; }
  }

  /**
   * Write a preset file into folder `dir` under Data (overwrites a same-named file; creates the folder) and list it.
   * @returns {Promise<string>} its path
   */
  static async writeUserFile(dir, fileName, data) {
    const FP = this.#FP();
    dir = this.#clean(dir) || this.DEFAULT_USER_DIR;
    const parts = dir.split('/');
    for (let i = 1; i <= parts.length; i++) {
      await FP.createDirectory('data', parts.slice(0, i).join('/')).catch(() => {});
    }
    const file = new File([JSON.stringify(data, null, 2)], fileName, { type: 'application/json' });
    const result = await FP.upload('data', dir, file, {}, { notify: false });
    if (result && result.status === 'error') throw new Error(result.message ?? 'upload failed');
    const path = `${dir}/${fileName}`;
    await this.addUserFile(path);
    return path;
  }

  /**
   * Save `config` (the effective Spell FX config) as a file in folder `dir`; it becomes the active file (its
   * Video / Sound switches kept).
   * @returns {Promise<string>} its path
   */
  static async saveCurrent(config, { name, description }, dir, fileName = this.slug(name)) {
    const body = foundry.utils.deepClone(config);
    delete body._meta;
    const path = await this.writeUserFile(dir, fileName, { _meta: { name, description }, ...body });
    const was = this.loadedMeta();
    await game.settings.set('vagabond', 'sequencerFxConfig', {
      ...body, _meta: { name, source: path, video: was?.video ?? true, sound: was?.sound ?? true, modified: false },
    });
    return path;
  }
}
