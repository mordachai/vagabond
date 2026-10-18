/**
 * AAMenuLoader — loads the system's Automated Animations Global Automatic Recognition menu
 * (`assets/config/AutomatedAnimations-<lang>-vagabond.json`) into AA by itself, in the
 * language of the active GM (pt-BR → `ptBR`, anything else → `en`; menu entries match item
 * names, which Babele translates).
 *
 * Runs on the active GM at `ready` when AA and JB2A (free or Patreon) are both active and the
 * world setting `aaMenuAutoLoad` is not `off`. It loads again only when the language or the
 * file content changed since the last load (hash in the hidden setting `aaMenuLoaded`), so GM
 * edits made in AA's menu survive reloads. `ask` (default) asks the GM first (existing worlds
 * keep their menu until they say so); `overwrite` saves AA's previous menus in the hidden
 * setting `aaMenuBackup` first ({@link restoreBackup}); `merge` only adds entries whose label
 * AA's menu lacks (AA's own merge rule).
 */

const NS = 'vagabond';
const MENUS = ['melee', 'range', 'ontoken', 'templatefx', 'aura', 'preset', 'aefx'];

export class AAMenuLoader {
  /** AA's manager API, or null when AA / JB2A is missing. */
  static get manager() {
    if (!game.modules.get('autoanimations')?.active) return null;
    if (!(game.modules.get('JB2A_DnD5e')?.active || game.modules.get('jb2a_patreon')?.active)) return null;
    return globalThis.AutomatedAnimations?.AutorecManager ?? null;
  }

  /** File language key for a Foundry language code. */
  static langKey(lang = game.i18n.lang) {
    return lang === 'pt-BR' ? 'ptBR' : 'en';
  }

  static fileFor(lang) {
    return `systems/${game.system.id}/assets/config/AutomatedAnimations-${AAMenuLoader.langKey(lang)}-vagabond.json`;
  }

  /** Called from `ready` (fire-and-forget). */
  static onReady() {
    if (game.user !== game.users.activeGM) return;
    if (game.settings.get(NS, 'aaMenuAutoLoad') === 'off') return;
    AAMenuLoader.sync().catch(err => console.error('Vagabond | AA menu auto-load failed', err));
  }

  /**
   * Load the menu file into AA when it changed since the last load (or always with `force`).
   * @param {object} [options]
   * @param {boolean} [options.force]  Load even if this file was already loaded.
   * @param {'ask'|'overwrite'|'merge'} [options.mode]  Defaults to the world setting.
   * @returns {Promise<boolean>} true when AA's menus were written.
   */
  static async sync({ force = false, mode } = {}) {
    const manager = AAMenuLoader.manager;
    if (!manager || !game.user.isGM) return false;
    mode ??= game.settings.get(NS, 'aaMenuAutoLoad');
    if (mode === 'off') mode = 'ask';

    const lang = AAMenuLoader.langKey();
    const response = await fetch(AAMenuLoader.fileFor());
    if (!response.ok) throw new Error(`${response.status} ${response.url}`);
    const text = await response.text();
    const hash = AAMenuLoader.#hash(text);

    const last = game.settings.get(NS, 'aaMenuLoaded') ?? {};
    if (!force && last.lang === lang && last.hash === hash) return false;

    if (mode === 'ask') {
      mode = await AAMenuLoader.#ask(lang);
      if (mode === 'never') await game.settings.set(NS, 'aaMenuAutoLoad', 'off');
      if (mode !== 'overwrite' && mode !== 'merge') return false;
    }

    if (mode === 'merge') {
      await manager.mergeMenus(JSON.parse(text), { submitAll: true });
    } else {
      await game.settings.set(NS, 'aaMenuBackup', manager.getAutorecEntries());
      await manager.overwriteMenus(text, { submitAll: true });
    }
    await game.settings.set(NS, 'aaMenuLoaded', { lang, hash, mode });
    ui.notifications.info(game.i18n.format('VAGABOND.Settings.aaMenuAutoLoad.loaded', {
      lang: AAMenuLoader.#langName(lang),
    }));
    return true;
  }

  /** Put back AA's menus as they were before the last overwrite. */
  static async restoreBackup() {
    const manager = AAMenuLoader.manager;
    const backup = game.settings.get(NS, 'aaMenuBackup');
    if (!manager || !game.user.isGM) return false;
    if (!backup || !MENUS.some(k => Array.isArray(backup[k]))) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Settings.aaMenuAutoLoad.noBackup'));
      return false;
    }
    await manager.overwriteMenus(JSON.stringify(backup), { submitAll: true });
    // The GM wants their own menu back: stop loading ours on the next file change
    await game.settings.set(NS, 'aaMenuLoaded', {});
    await game.settings.set(NS, 'aaMenuAutoLoad', 'off');
    ui.notifications.info(game.i18n.localize('VAGABOND.Settings.aaMenuAutoLoad.restored'));
    return true;
  }

  /** GM choice: 'overwrite' | 'merge' | 'later' | 'never' (closed = 'later'). */
  static async #ask(lang) {
    const L = key => game.i18n.localize(`VAGABOND.Settings.aaMenuAutoLoad.${key}`);
    const content = `<p>${game.i18n.format('VAGABOND.Settings.aaMenuAutoLoad.askContent', {
      lang: AAMenuLoader.#langName(lang),
    })}</p>`;
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: L('askTitle'), icon: 'fas fa-film' },
      classes: ['aa-menu-dialog'],
      position: { width: 380 },
      content,
      rejectClose: false,
      buttons: [
        { action: 'overwrite', label: L('askReplace'), icon: 'fas fa-file-import', default: true },
        { action: 'merge', label: L('askMerge'), icon: 'fas fa-code-merge' },
        { action: 'later', label: L('later'), icon: 'fas fa-clock' },
        { action: 'never', label: L('never'), icon: 'fas fa-ban' },
      ],
    });
    return choice ?? 'later';
  }

  static #langName(lang) {
    return lang === 'ptBR' ? 'Português (Brasil)' : 'English';
  }

  static #hash(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return `${text.length}:${(h >>> 0).toString(36)}`;
  }
}
