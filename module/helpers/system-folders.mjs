import { isActiveGM } from './gm-relay.mjs';

/**
 * "Vagabond System" root folders: every folder the system makes for itself (Conjured, Undead Army,
 * Clocks & Dice) sits under ONE root per document type, so the GM's sidebar stays tidy. Party Notes stays
 * at the top level (players open it often).
 * Folders are found by flag, never by name (translated worlds). Metamorph's root is adopted too once it
 * carries `flags.metamorph.root` (Metamorph 1.5.3+ finds its root by that flag wherever it sits; an older
 * Metamorph looks for a top-level "Metamorph" folder, so its unflagged folder is left alone).
 */
export class SystemFolders {
  static #pending = new Map();

  /** Legacy clocks folder (pre-flag), recognised once and stamped. */
  static #CLOCKS_LEGACY_NAME = 'Vagabond Clocks & Dice';

  static find(type) {
    return game.folders.find(f => f.type === type && f.getFlag('vagabond', 'systemRoot')) ?? null;
  }

  /** The root for `type`, created when missing (one create in flight per type). */
  static async root(type) {
    const found = this.find(type);
    if (found) return found;
    if (!this.#pending.has(type)) {
      this.#pending.set(type, Folder.implementation.create({
        name: game.i18n.localize('VAGABOND.SystemFolders.Root'), type, color: '#3a2f1f', sorting: 'a',
        flags: { vagabond: { systemRoot: true } },
      }).finally(() => this.#pending.delete(type)));
    }
    return this.#pending.get(type);
  }

  /** Id of the root for `type` (for `folder:` in create data). */
  static async rootId(type) {
    return (await this.root(type))?.id ?? null;
  }

  /**
   * A system folder found by `flags.vagabond[flag]`, created under the root when missing.
   * @param {string} type    Folder document type
   * @param {string} flag    vagabond flag key identifying it
   * @param {object} data    Folder create data (name, color…)
   */
  static async child(type, flag, data) {
    const found = game.folders.find(f => f.type === type && f.getFlag('vagabond', flag));
    if (found) return found;
    return Folder.implementation.create({
      ...data, type, folder: await this.rootId(type),
      flags: foundry.utils.mergeObject(data.flags ?? {}, { vagabond: { [flag]: true } }),
    });
  }

  /** Clocks & Dice journal folder (shared by Progress Clocks and Countdown Dice). */
  static async clocks() {
    const legacy = game.folders.find(f => f.type === 'JournalEntry' && f.name === this.#CLOCKS_LEGACY_NAME
      && !f.getFlag('vagabond', 'clocksFolder'));
    if (legacy && game.user.isGM) await legacy.setFlag('vagabond', 'clocksFolder', true);
    return this.child('JournalEntry', 'clocksFolder', { name: this.#CLOCKS_LEGACY_NAME, color: '#8b0000', sorting: 'a' });
  }

  /** Top-level folders that belong under the root. Caster sub-folders already sit inside their own root. */
  static #belongs(f) {
    if (f.folder) return false;
    const v = f.flags?.vagabond ?? {};
    if (v.systemRoot) return false;
    return !!((v.conjureFolder && !v.conjureCaster) || (v.undeadArmy && !v.undeadArmyCaster)
      || v.clocksFolder || f.flags?.metamorph?.root);
  }

  static async #adopt(f) {
    try {
      await f.update({ folder: await this.rootId(f.type) });
    } catch (err) {
      console.warn(`vagabond | SystemFolders: could not move "${f.name}"`, err);
    }
  }

  /** Active GM: move stray system folders (made before the root existed, or by Metamorph) under the root. */
  static async sweep() {
    if (!isActiveGM()) return;
    const legacy = game.folders.find(f => f.type === 'JournalEntry' && f.name === this.#CLOCKS_LEGACY_NAME
      && !f.getFlag('vagabond', 'clocksFolder'));
    if (legacy) await legacy.setFlag('vagabond', 'clocksFolder', true);
    for (const f of game.folders.filter(f => this.#belongs(f))) await this.#adopt(f);
    // Party Notes stays at the top level
    for (const f of game.folders.filter(f => f.flags?.vagabond?.isPartyNotesFolder && f.folder)) {
      await f.update({ folder: null }).catch(() => {});
    }
  }

  static registerHooks() {
    Hooks.once('ready', () => { this.sweep(); });
    Hooks.on('createFolder', (folder) => {
      if (isActiveGM() && this.#belongs(folder)) this.#adopt(folder);
    });
    // Metamorph stamps its pre-flag root on first use
    Hooks.on('updateFolder', (folder, changes) => {
      if (changes.flags?.metamorph?.root && isActiveGM() && this.#belongs(folder)) this.#adopt(folder);
    });
  }
}
