import { combatRollData } from './rule-rolldata.mjs';

/**
 * World-level "class automation" mode — the one switch a GM uses to keep every player on the
 * same footing, instead of each player hunting for the right helper effects.
 *
 *   auto    (default) the "Auto" helper effects work as their own switches say, combat or not
 *           (except the COMBAT_ONLY_FIELDS below, which count Turns and so need a Combat).
 *   combat  Auto only while the actor is in a started Combat; outside one everything is manual.
 *   manual  every Auto helper is inert; feature buttons and the plain status toggles do it all.
 *
 * It does not touch the effects themselves. It gates the AE-set trigger fields at one choke
 * point (`AutomationMode.apply`, start of `VagabondCharacterData#prepareDerivedData`), so every
 * hook helper (`isAuto`, High Noon, Hunter's Mark…) and every formula that reads the
 * `system.aggressorAuto` marker follows the mode without per-feature code. A new Auto helper
 * only has to add its trigger field to `TRIGGER_FIELDS`.
 */

/** AE-set automation fields (boolean triggers, or the numeric Aggressor marker) the mode gates. */
const TRIGGER_FIELDS = {
  rageTrigger: false,
  momentumTrigger: false,
  deadeyeTrigger: false,
  highNoonTrigger: false,
  huntersMarkTrigger: false,
  haymakerMargin: 0,
  sneakAttackTrigger: false,
  twinnedSpellTrigger: false,
  aggressorAuto: 0,
};

/**
 * Auto triggers that can only work by counting Turns. Outside a started Combat they would build
 * up and never end, so they stay manual there even in 'auto' mode. Twinned Spell ("twice on a turn")
 * is the only one; Deadeye / Rage / Momentum also end through roll-expiry.mjs, which needs no Combat.
 */
const COMBAT_ONLY_FIELDS = ['twinnedSpellTrigger'];

export class AutomationMode {

  /** @returns {'auto'|'combat'|'manual'} */
  static get mode() {
    try {
      return game.settings.get('vagabond', 'automationMode') ?? 'auto';
    } catch {
      return 'auto'; // settings not registered yet (very early data prep)
    }
  }

  /** May the Auto helper effects drive `actor` right now? */
  static isOn(actor) {
    switch (this.mode) {
      case 'manual': return false;
      case 'combat': return combatRollData(actor).active === 1;
      default: return true;
    }
  }

  /**
   * Reset the automation fields when the mode says "manual" for this actor.
   * Call before any formula is evaluated.
   * @param {object} system - the character's system data
   * @param {Actor} actor
   */
  static apply(system, actor) {
    if (!this.isOn(actor)) {
      for (const [key, off] of Object.entries(TRIGGER_FIELDS)) system[key] = off;
      return;
    }
    // Automatic, but no Combat to count Turns in: the Turn-counting autos stay manual
    if (combatRollData(actor).active !== 1) {
      for (const key of COMBAT_ONLY_FIELDS) system[key] = TRIGGER_FIELDS[key];
    }
  }
}
