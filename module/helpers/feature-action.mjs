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

  /**
   * Live state of a built-in (`system:<name>`) action: lets its button glow while the effect it
   * made is on, and lets the player END it from the sheet / HUD without hunting the effects list.
   * @type {Map<string, {isActive: (actor: Actor) => boolean, count?: (actor: Actor) => number,
   *   end: (actor: Actor) => Promise<*>, toggle?: boolean}>}
   */
  static #states = new Map();

  /**
   * @param {string} name  the handler name, e.g. 'gunslinger.deadeye'
   * @param {object} def
   * @param {(actor: Actor) => boolean} def.isActive  is its effect on right now?
   * @param {(actor: Actor) => number} [def.count]    a number shown on the button (stacks)
   * @param {(actor: Actor) => Promise<*>} def.end    end / spend / drop it
   * @param {boolean} [def.toggle]  true = left click on an active button ENDS it (pure on/off);
   *   false = left click still does the action (Deadeye +1, Mark a new Target); right-click ends
   */
  static registerState(name, def) { this.#states.set(name, def); }

  /** The registered state definition of an action config, or null (plain / script actions). */
  static stateDef(cfg) {
    const cmd = (!cfg?.uuid && typeof cfg?.command === 'string') ? cfg.command.trim() : '';
    return cmd.startsWith('system:') ? (this.#states.get(cmd.slice('system:'.length).trim()) ?? null) : null;
  }

  /** `{ active, count, tip }` for a button, or null when the action has no live state. */
  static stateView(actor, cfg) {
    const def = this.stateDef(cfg);
    if (!def) return null;
    let active = false;
    try { active = !!def.isActive(actor); } catch { /* actor not ready */ }
    const count = active && def.count ? def.count(actor) : 0;
    const L = (k) => game.i18n.localize(`VAGABOND.FeatureAction.${k}`);
    return { active, count, toggle: !!def.toggle, tip: active ? L(def.toggle ? 'TipActiveToggle' : 'TipActive') : '' };
  }

  /** End the effect behind an action (right-click on a glowing button). No-op when not active. */
  static async end(actor, key) {
    const r = this.resolve(actor, key);
    const def = r && this.stateDef(r.cfg);
    if (!def || !def.isActive(actor)) return false;
    await def.end(actor);
    return true;
  }

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
    const state = this.stateView(actor, cfg);
    return {
      key,
      label: cfg.label || fallbackLabel,
      icon: this.icon(cfg),
      onBelt: this.beltKeys(actor).includes(key),
      active: !!state?.active,
      count: state?.count || 0,
      tip: state?.active ? `${cfg.label || fallbackLabel} — ${state.tip}` : (cfg.label || fallbackLabel),
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
    // A pure on/off feature (Momentum): clicking it while it is on ends it
    const def = this.stateDef(r.cfg);
    if (def?.toggle && def.isActive(actor)) return def.end(actor);
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
      const state = this.stateView(actor, r.cfg);
      const name = r.cfg.label || r.item.name;
      return [{
        key,
        name,
        tip: state?.active ? `${name} — ${state.tip}` : name,
        icon: this.icon(r.cfg),
        source: r.item.name,
        active: !!state?.active,
        count: state?.count || 0,
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
