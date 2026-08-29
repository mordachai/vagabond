import { VagabondDiceAppearance } from './dice-appearance.mjs';

/**
 * Unified Damage Pipeline
 *
 * Single assembly line for ALL damage rolls in the system — weapon attacks,
 * spell casts, alchemical uses, NPC actions, and raw item damage buttons.
 * Every site builds a descriptor and calls `VagabondDamagePipeline.rollDamage(d)`;
 * the canonical ingredient order lives here and nowhere else.
 *
 * Canonical step order:
 *   1. baseFormula (blank → null return, e.g. a no-damage weapon like the Net)
 *   2. die-size bump (regex on the first NdX term)
 *   3. crit stat bonus (negatives included)
 *   4. always-on crit properties (CONFIG.VAGABOND.critAlwaysOnProperties, e.g. Brutal)
 *   5. type-bucket universal flat + dice bonuses
 *   6. legacy universal flat + dice bonuses
 *   7. weakness pre-roll (+1 source die when EVERY target is weak to the type)
 *   8. Roll construction → colorset → evaluate → weakness-die marking
 *   9. manual dice explosion
 *  10. per-die flat bonus (counted post-explosion, doubled vs listed beingTypes)
 *  11. metadata stash (_weaknessPreRolled, _perDieBonus*)
 *
 * This module must never import damage-helper.mjs or chat-card.mjs (no cycles).
 */

/** Per-sourceType bonus field buckets (internal for now; may move to CONFIG later). */
const BONUS_BUCKETS = {
  weapon: {
    flat: 'universalWeaponDamageBonus',
    dice: 'universalWeaponDamageDice',
    perDie: 'weaponBonusPerDamageDie',
  },
  spell: {
    flat: 'universalSpellDamageBonus',
    dice: 'universalSpellDamageDice',
    perDie: 'spellBonusPerDamageDie',
  },
  alchemical: {
    flat: 'universalAlchemicalDamageBonus',
    dice: 'universalAlchemicalDamageDice',
    perDie: 'alchemicalBonusPerDamageDie',
  },
  // npc/generic: legacy universals + bonusPerDamageDie only (no type bucket)
};

export class VagabondDamagePipeline {

  /**
   * Roll damage for any source through the canonical pipeline.
   *
   * @param {object} d - Damage descriptor
   * @param {Actor}  d.actor - Attacking actor (required)
   * @param {Item|null} [d.item=null] - Source item (weapon/spell/alchemical); null for NPC actions
   * @param {number|null} [d.actionIndex=null] - NPC action index when item is null
   * @param {string} d.baseFormula - Starting formula (grip-resolved / dice-count-resolved; a flat number is fine)
   * @param {'weapon'|'spell'|'alchemical'|'npc'|'generic'} [d.sourceType='generic']
   * @param {string|null} [d.damageType=null] - Damage type key, or '-' for typeless
   * @param {boolean} [d.isCritical=false]
   * @param {string|null} [d.statKey=null] - Stat key for the crit damage bonus
   * @param {object|null} [d.rollData=null] - Defaults to item-effects roll data when item given
   * @param {Array} [d.targets=[]] - targetsAtRollTime ({tokenId, sceneId} objects); gates weakness
   *   pre-roll and per-die doubling
   * @param {number} [d.dieSizeBonus=0] - Bump applied to the first die term (weapon skill die-size bonus)
   * @param {boolean} [d.weaponLinked=false] - NPC action linked to a weapon → weapon bucket also applies
   * @param {object} [d.options={}] - Step toggles: weaknessPreRoll/explode/perDieBonus/typeBonuses (all default true)
   * @returns {Promise<Roll|null>} Evaluated Roll with _weaknessPreRolled + _perDieBonus* stashed, or null
   */
  static async rollDamage(d) {
    // Extension point: mutate the descriptor (baseFormula, isCritical, targets,
    // options, ...) or return false to cancel the roll entirely.
    if (Hooks.call('vagabond.preDamageRoll', d) === false) return null;

    const {
      actor,
      item = null,
      actionIndex = null,
      baseFormula,
      sourceType = 'generic',
      damageType = null,
      isCritical = false,
      statKey = null,
      targets = [],
      dieSizeBonus = 0,
      weaponLinked = false,
    } = d;
    const options = {
      weaknessPreRoll: true, explode: true, perDieBonus: true, typeBonuses: true,
      ...(d.options ?? {}),
    };

    // 1. Base formula
    if (!baseFormula || String(baseFormula).trim() === '') return null;
    let formula = String(baseFormula).trim();

    // Roll data: on-use item effects (Keen etc.) apply to the whole formula
    const rollData = d.rollData ?? (item ? actor.getRollDataWithItemEffects(item) : actor.getRollData());

    // 2. Die-size bump (first NdX term only)
    formula = this._applyDieSizeBump(formula, dieSizeBonus);

    // 3. Crit stat bonus (negatives included; 0 contributes nothing)
    if (isCritical && statKey) {
      const statValue = rollData.stats?.[statKey]?.value || 0;
      if (statValue !== 0) formula += ` + ${statValue}`;
    }

    // 4. Always-on crit properties (fire regardless of the Luck/benefit toggle)
    if (isCritical) {
      for (const bonus of this.collectCritAlwaysOnBonuses(item, actor, formula)) {
        formula += ` + ${bonus.formula}`;
      }
    }

    // 5. + 6. Universal bonuses (type bucket, then legacy)
    if (options.typeBonuses) {
      const buckets = [];
      if (BONUS_BUCKETS[sourceType]) buckets.push(BONUS_BUCKETS[sourceType]);
      if (sourceType === 'npc' && weaponLinked) buckets.push(BONUS_BUCKETS.weapon);
      for (const bucket of buckets) {
        formula = this._appendBonusFields(formula, actor.system[bucket.flat], actor.system[bucket.dice]);
      }
      formula = this._appendBonusFields(formula, actor.system.universalDamageBonus, actor.system.universalDamageDice);
    }

    // 7. Weakness pre-roll: only when EVERY stored target is weak to the damage type
    let weaknessPreRolled = false;
    if (options.weaknessPreRoll && damageType && damageType !== '-' && targets.length > 0) {
      const targetActors = this.getTargetActorsFromStored(targets);
      if (targetActors.length > 0 && targetActors.every(a => this.isWeakTo(a, damageType, item))) {
        const weakDieSize = this.getDamageSourceDieSize(item, actionIndex, actor);
        formula += ` + 1d${weakDieSize}`;
        weaknessPreRolled = true;
      }
    }

    // 8. Roll → colorset → evaluate → mark weakness die
    const roll = new Roll(formula, rollData);
    VagabondDiceAppearance.applyDamageColorset(roll, damageType);
    await roll.evaluate();
    if (weaknessPreRolled) this.markWeaknessDie(roll);

    // 9. Manual dice explosion
    if (options.explode) {
      const explodeValues = this.getExplodeValues(item, actor);
      if (explodeValues) await this.manuallyExplodeDice(roll, explodeValues);
    }

    // 10. Per-die flat bonus (post-explosion count; doubled vs listed beingTypes)
    if (options.perDieBonus) {
      const bucketPerDie = (BONUS_BUCKETS[sourceType] && actor.system[BONUS_BUCKETS[sourceType].perDie])
        || (sourceType === 'npc' && weaponLinked ? actor.system[BONUS_BUCKETS.weapon.perDie] : 0)
        || 0;
      const universalPerDie = actor.system.bonusPerDamageDie || 0;
      let totalPerDie = bucketPerDie + universalPerDie;
      if (totalPerDie !== 0 && this.shouldDoublePerDieBonus(actor, targets)) totalPerDie *= 2;
      if (totalPerDie !== 0) {
        const diceCount = this.countRolledDice(roll);
        roll._perDieBonusPerDie = totalPerDie;
        roll._perDieBonusDiceCount = diceCount;
        roll._perDieBonusTotal = totalPerDie * diceCount;
        roll._total += roll._perDieBonusTotal;
      }
    }

    // 11. Metadata stash
    roll._weaknessPreRolled = weaknessPreRolled;

    // Informational hook: the evaluated roll and the descriptor that produced it
    Hooks.callAll('vagabond.postDamageRoll', { descriptor: d, roll });
    return roll;
  }

  /* ------------------------------------------------------------------------ */
  /* Formula assembly helpers                                                 */
  /* ------------------------------------------------------------------------ */

  /**
   * Bump the size of the FIRST die term in a formula (e.g. bonus 2: "2d6+1" → "2d8+1").
   * @param {string} formula
   * @param {number} dieSizeBonus
   * @returns {string}
   */
  static _applyDieSizeBump(formula, dieSizeBonus) {
    if (!dieSizeBonus) return formula;
    return formula.replace(/(\d*)d(\d+)/, (match, count, size) => {
      const newSize = Math.max(2, parseInt(size) + dieSizeBonus);
      return `${count}d${newSize}`;
    });
  }

  /**
   * Append a flat bonus and a dice bonus (both possibly ArrayField-derived) to a formula.
   * Derived prep normally collapses these (flat → number, dice → joined string), but the
   * Array.isArray guards keep raw source data safe too.
   * @returns {string}
   */
  static _appendBonusFields(formula, flatBonus, diceBonus) {
    const flat = Array.isArray(flatBonus) ? 0 : (flatBonus || 0);
    let dice = diceBonus || '';
    if (Array.isArray(dice)) dice = dice.filter(dd => !!dd).join(' + ');
    if (flat !== 0) formula += ` + ${flat}`;
    if (typeof dice === 'string' && dice.trim() !== '') formula += ` + ${dice}`;
    return formula;
  }

  /**
   * Collect always-on crit bonuses from the CONFIG.VAGABOND.critAlwaysOnProperties
   * registry (e.g. Brutal). Fire on every crit regardless of the Luck/benefit toggle.
   * @param {Item|null} item
   * @param {Actor} actor
   * @param {string} currentFormula - Formula built so far (for die-size introspection)
   * @returns {Array<{formula: string, label: string}>}
   */
  static collectCritAlwaysOnBonuses(item, actor, currentFormula) {
    const bonuses = [];
    const registry = CONFIG.VAGABOND.critAlwaysOnProperties ?? {};
    for (const [propKey, handler] of Object.entries(registry)) {
      if (item?.system?.properties?.includes(propKey)) {
        const bonus = handler.apply(item, actor, currentFormula);
        if (bonus) bonuses.push(bonus);
      }
    }
    return bonuses;
  }

  /* ------------------------------------------------------------------------ */
  /* Dice mechanics                                                           */
  /* ------------------------------------------------------------------------ */

  /**
   * Manually explode dice on specific values (recursive).
   * Bypasses Foundry's x-syntax; 'max' sentinel resolves per-die to its max face.
   * @param {Roll} roll - The evaluated roll to explode
   * @param {Array<number|'max'>} explodeValues
   * @param {number} maxExplosions - Safety limit
   * @returns {Promise<Roll>}
   */
  static async manuallyExplodeDice(roll, explodeValues, maxExplosions = 100) {
    if (!explodeValues || explodeValues.length === 0) return roll;

    const hasMax = explodeValues.includes('max');
    const numericExplodeValues = explodeValues.filter(v => v !== 'max').map(v => parseInt(v));
    let explosionCount = 0;

    for (let i = 0; i < roll.terms.length; i++) {
      const term = roll.terms[i];
      if (term.constructor.name !== 'Die') continue;

      const faces = term.faces;
      const explodeSet = new Set(numericExplodeValues);
      if (hasMax) explodeSet.add(faces);
      const results = term.results || [];
      const originalLength = results.length;

      for (let j = 0; j < originalLength; j++) {
        const result = results[j];
        if (explodeSet.has(result.result)) {
          result.exploded = true;
          let newRoll = result.result;
          while (explodeSet.has(newRoll) && explosionCount < maxExplosions) {
            explosionCount++;
            const explosionRoll = Math.floor(Math.random() * faces) + 1;
            results.push({
              result: explosionRoll,
              active: true,
              exploded: explodeSet.has(explosionRoll)
            });
            newRoll = explosionRoll;
          }
        }
      }

      term._total = results.reduce((sum, r) => sum + (r.active ? r.result : 0), 0);
    }

    roll._total = roll._evaluateTotal();
    return roll;
  }

  /**
   * Mark the last DiceTerm in a roll as the weakness bonus die (drives the type-icon overlay).
   * The weakness die is always appended LAST to the formula, so the last Die term is it.
   * @param {Roll} roll
   */
  static markWeaknessDie(roll) {
    for (let i = roll.terms.length - 1; i >= 0; i--) {
      const term = roll.terms[i];
      if (term.constructor.name === 'Die') {
        for (const result of term.results) {
          result.weakness = true;
        }
        break;
      }
    }
  }

  /**
   * Explosion values for an item, honoring actor global explode bonuses.
   * @param {Item|null} item
   * @param {Actor|null} actor
   * @returns {Array<number|'max'>|null}
   */
  static getExplodeValues(item, actor = null) {
    let canExplode = item?.system?.canExplode;
    let explodeValuesStr = item?.system?.explodeValues;

    if (actor) {
      if (actor.system.bonuses?.globalExplode) canExplode = true;
      const globalValues = actor.system.bonuses?.globalExplodeValues;
      if (globalValues) explodeValuesStr = globalValues;
    }

    if (!canExplode || !explodeValuesStr) return null;

    const explodeValues = explodeValuesStr
      .split(',')
      .map(v => v.trim().toLowerCase())
      .filter(v => v && (v === 'max' || !isNaN(v)))
      .map(v => v === 'max' ? 'max' : parseInt(v));

    return explodeValues.length > 0 ? explodeValues : null;
  }

  /**
   * Count active die results in an evaluated roll (explosion dice included).
   * @param {Roll} roll
   * @returns {number}
   */
  static countRolledDice(roll) {
    let count = 0;
    for (const term of roll.terms) {
      if (term.constructor.name !== 'Die') continue;
      for (const result of (term.results ?? [])) {
        if (result.active !== false) count++;
      }
    }
    return count;
  }

  /* ------------------------------------------------------------------------ */
  /* Target / weakness helpers                                                */
  /* ------------------------------------------------------------------------ */

  /**
   * Resolve stored target objects ({tokenId, sceneId}) to Actor instances.
   * @param {Array} storedTargets
   * @returns {Actor[]}
   */
  static getTargetActorsFromStored(storedTargets) {
    if (!storedTargets || storedTargets.length === 0) return [];
    return storedTargets.map(t => {
      const scene = game.scenes.get(t.sceneId);
      const token = scene?.tokens?.get(t.tokenId);
      return token?.actor;
    }).filter(Boolean);
  }

  /**
   * Whether a target actor is weak to a damage type (material weakness included).
   * @param {Actor} targetActor
   * @param {string} damageType
   * @param {Item|null} attackingWeapon
   * @returns {boolean}
   */
  static isWeakTo(targetActor, damageType, attackingWeapon = null) {
    const normalizedType = damageType.toLowerCase();
    if (normalizedType === '-') return false;
    const weaknesses = targetActor.system.weaknesses || [];
    if (attackingWeapon?.system?.metal && weaknesses.includes(attackingWeapon.system.metal)) return true;
    return weaknesses.includes(normalizedType);
  }

  /**
   * Extract the die size from a damage formula string ("2d8+1" → 8).
   * @param {string} formula
   * @returns {number}
   */
  static extractDieSize(formula) {
    const match = /\d*d(\d+)/i.exec(String(formula || ''));
    return match ? parseInt(match[1]) : 6;
  }

  /**
   * Base damage die size of the attack source (used for the weakness extra die).
   * @param {Item|null} sourceItem
   * @param {number|null} actionIdx - NPC action index (when sourceItem is null)
   * @param {Actor|null} sourceActor
   * @returns {number}
   */
  static getDamageSourceDieSize(sourceItem, actionIdx, sourceActor) {
    if (sourceItem) {
      if (sourceItem.type === 'spell') {
        const base = sourceItem.system.damageDieSize || 6;
        const bonus = sourceActor?.system?.spellDamageDieSizeBonus || 0;
        return base + bonus;
      }
      const formula = sourceItem.system.currentDamage || sourceItem.system.damageAmount || '';
      return this.extractDieSize(formula);
    }
    if (actionIdx !== null && actionIdx !== undefined && !isNaN(actionIdx) && sourceActor) {
      const action = sourceActor.system.actions?.[actionIdx];
      if (action?.rollDamage) return this.extractDieSize(action.rollDamage);
    }
    return 6;
  }

  /**
   * beingType for an actor, normalizing character vs NPC schema paths.
   * @param {Actor} actor
   * @returns {string|null}
   */
  static getActorBeingType(actor) {
    if (!actor) return null;
    if (actor.type === 'character') return actor.system.attributes?.beingType ?? null;
    return actor.system.beingType ?? null;
  }

  /**
   * Whether the per-die bonus doubles for this roll (any target's beingType listed
   * in the attacker's bonusPerDamageDieDoubleVsBeingTypes).
   * @param {Actor} attackingActor
   * @param {Array} storedTargets
   * @returns {boolean}
   */
  static shouldDoublePerDieBonus(attackingActor, storedTargets) {
    const doubleVsTypes = attackingActor.system.bonusPerDamageDieDoubleVsBeingTypes;
    if (!doubleVsTypes || doubleVsTypes.length === 0) return false;
    const targetActors = this.getTargetActorsFromStored(storedTargets);
    return targetActors.some(a => doubleVsTypes.includes(this.getActorBeingType(a)));
  }
}
