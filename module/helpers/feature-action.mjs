import { runMacroFromButton, faIconClasses } from './item-macro.mjs';

/**
 * Feature Actions — an optional action button defined on a class feature, ancestry trait or perk.
 *
 * The author turns it on in the item sheet (`action`: enabled / label / icon / macro uuid or inline
 * script / runAsGM). It shows as a button on the actor sheet's Features / Traits / Perks lists and
 * can be pinned to the HUD Belt. Running it is the item-macro machinery: the script gets
 * `{ actor, item, token, targets, speaker }` in scope, `item` being the class / ancestry / perk.
 *
 * An action is addressed by a **key** `"<itemId>|<path>"`, where `path` is relative to the item's
 * `system` (`levelFeatures.3.action`, `traits.0.action`, `action`).
 */
export class FeatureAction {

  /** Per-actor ordered list of action keys pinned to the HUD Belt. */
  static BELT_FLAG = 'beltActions';

  static key(item, path) { return `${item.id}|${path}`; }

  /** Resolve a key on an actor → `{ item, path, cfg }`, or null when gone / disabled. */
  static resolve(actor, key) {
    const [itemId, path] = String(key ?? '').split('|');
    const item = actor?.items?.get(itemId);
    const cfg = item && path ? foundry.utils.getProperty(item.system, path) : null;
    if (!cfg?.enabled || (!cfg.uuid && !cfg.command)) return null;
    return { item, path, cfg };
  }

  /**
   * Row model for a sheet/HUD button: `{ key, label, icon, onBelt }`, or null when the action
   * is off or empty.
   * @param {Actor} actor
   * @param {Item} item
   * @param {string} path
   * @param {string} fallbackLabel
   */
  static row(actor, item, path, fallbackLabel = '') {
    const cfg = item && foundry.utils.getProperty(item.system, path);
    if (!cfg?.enabled || (!cfg.uuid && !cfg.command)) return null;
    const key = this.key(item, path);
    return {
      key,
      label: cfg.label || fallbackLabel,
      icon: this.icon(cfg),
      onBelt: this.beltKeys(actor).includes(key),
    };
  }

  /** Font Awesome classes for the button icon (`music`, `fa-music` and `fa-solid fa-music` all work). */
  static icon(cfg) {
    return faIconClasses(cfg?.icon, 'fa-solid fa-bolt');
  }

  /** Run the action (macro / inline script) for the actor. */
  static async run(actor, key) {
    const r = this.resolve(actor, key);
    if (!r) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.FeatureAction.Missing'));
      return;
    }
    return runMacroFromButton({
      itemUuid: r.item.uuid,
      itemName: r.item.name,
      actorUuid: actor.uuid,
      slot: r.path,
      runAsGM: !!r.cfg.runAsGM,
    });
  }

  /* -------------------------------------------- */
  /*  HUD Belt                                    */
  /* -------------------------------------------- */

  /** Pinned keys that still resolve (deleted / disabled actions drop out silently). */
  static beltKeys(actor) {
    const keys = actor?.getFlag?.('vagabond', this.BELT_FLAG);
    return Array.isArray(keys) ? keys : [];
  }

  /** Belt slot models for the HUD, in pin order. */
  static beltEntries(actor) {
    return this.beltKeys(actor).flatMap((key) => {
      const r = this.resolve(actor, key);
      if (!r) return [];
      return [{
        key,
        name: r.cfg.label || r.item.name,
        icon: this.icon(r.cfg),
        source: r.item.name,
      }];
    });
  }

  static async toggleBelt(actor, key) {
    const keys = this.beltKeys(actor);
    const next = keys.includes(key) ? keys.filter(k => k !== key) : [...keys, key];
    await actor.setFlag('vagabond', this.BELT_FLAG, next);
  }

  /** Right-click menu for an action button: run + pin / unpin. */
  static menuItems(actor, key) {
    const onBelt = this.beltKeys(actor).includes(key);
    const L = (k) => game.i18n.localize(`VAGABOND.FeatureAction.${k}`);
    return [
      { label: L('Run'), icon: 'fas fa-play', action: () => this.run(actor, key) },
      {
        label: onBelt ? L('RemoveFromBelt') : L('AddToBelt'),
        icon: onBelt ? 'fas fa-circle-minus' : 'fas fa-circle-plus',
        action: () => this.toggleBelt(actor, key),
      },
    ];
  }
}
