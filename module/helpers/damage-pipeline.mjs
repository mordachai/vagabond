import { VagabondDiceAppearance } from './dice-appearance.mjs';
import { consumeUsedEffects } from './use-effects.mjs';
import { DruidHelper } from './druid-helper.mjs';
import { HunterHelper } from './hunter-helper.mjs';

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
 *   4. always-on crit dice (`rollData.critBonusDice` from the weapon's on-use effects, e.g. Vicious)
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
   * @param {string|null} [d.skillKey=null] - Skill the attack was rolled with (weapon attacks); scopes
   *   the per-skill Crit rules (`critExtraDiceBySkill`, `critExplodeSkills`)
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
    const rollData = d.rollData
      ?? (item ? actor.getRollDataWithItemEffects(item, { targets: this.getTargetActorsFromStored(targets) }) : actor.getRollData());

    // 2. Die-size bump (first NdX term only)
    formula = this._applyDieSizeBump(formula, dieSizeBonus);

    // 2b. Skill-scoped die size (Pugilist Title Holder): that skill's weapon dice are at least this size
    if (sourceType === 'weapon' && d.skillKey) formula = this._raiseDiceTo(formula, actor.system?.weaponDieBySkill?.[d.skillKey]);

    // 3. Crit stat bonus (negatives included; 0 contributes nothing)
    if (isCritical && statKey) {
      const statValue = rollData.stats?.[statKey]?.value || 0;
      if (statValue !== 0) formula += ` + ${statValue}`;
    }

    // 4. Always-on crit properties (fire regardless of the Luck/benefit toggle)
    if (isCritical) {
      for (const bonus of this.collectCritAlwaysOnBonuses(rollData, formula)) {
        formula += ` + ${bonus.formula}`;
      }
      // Skill-scoped extra crit dice (Gunslinger Bad Medicine): N dice matching the first die
      const extraDice = this.critExtraDiceFor(actor, d.skillKey, formula);
      if (extraDice) formula += ` + ${extraDice}`;
    }

    // 5. + 6. Universal bonuses (type bucket, then legacy)
    let healingApplied = false;
    if (options.typeBonuses) {
      const buckets = [];
      if (BONUS_BUCKETS[sourceType]) buckets.push(BONUS_BUCKETS[sourceType]);
      if (sourceType === 'npc' && weaponLinked) buckets.push(BONUS_BUCKETS.weapon);
      for (const bucket of buckets) {
        formula = this._appendBonusFields(formula, actor.system[bucket.flat], actor.system[bucket.dice]);
      }
      formula = this._appendBonusFields(formula, actor.system.universalDamageBonus, actor.system.universalDamageDice);

      // A Druid's Beast form (Metamorph copy) adds the Druid's Savagery bonus to its attacks
      if (sourceType === 'npc') {
        const beastBonus = DruidHelper.beastDamageBonus(actor);
        if (beastBonus) formula += ` + ${beastBonus}`;
      }

      // Healing bonus dice (e.g. Virtuoso: Inspiration) — HP-restoring rolls only; they explode
      // while `bonusDiceExplode` is on (Bard Climax).
      let healingDice = actor.system.healingBonusDice;
      if (typeof healingDice === 'string' && healingDice.trim() !== '' && this._restoresHp(damageType)) {
        if (actor.system.bonusDiceExplode === true) healingDice = healingDice.replace(/(\d*d\d+)(?![\dx])/g, '$1x');
        formula += ` + ${healingDice}`;
        healingApplied = true;
      }
    }

    // 7. Weakness pre-roll: only when EVERY stored target is weak to the damage type
    let weaknessPreRolled = false;
    if (options.weaknessPreRoll && damageType && damageType !== '-' && targets.length > 0) {
      const targetActors = this.getTargetActorsFromStored(targets);
      if (targetActors.length > 0 && targetActors.every(a => this.isWeakTo(a, damageType, item, actor))) {
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
      let explodeValues = this.getExplodeValues(item, actor, sourceType);
      // Skill-scoped Explode on a Crit (Gunslinger Devastator): the highest face, on top of the item's own
      if (isCritical && d.skillKey && actor.system?.critExplodeSkills?.includes?.(d.skillKey)) {
        explodeValues = [...new Set([...(explodeValues ?? []), 'max'])];
      }
      // Skill-scoped low-face Explode (Pugilist Title Holder: 1 or 2)
      const lowFaces = sourceType === 'weapon' && d.skillKey ? Math.trunc(Number(actor.system?.weaponLowExplodeBySkill?.[d.skillKey])) || 0 : 0;
      if (lowFaces > 0) explodeValues = [...new Set([...(explodeValues ?? []), ...Array.from({ length: lowFaces }, (_, i) => i + 1)])];
      // Healing Spells explode on the extra faces from Assured Healer / Radiant Healer
      if (sourceType === 'spell' && this._restoresHp(damageType)) {
        const healingFaces = this.healingExplodeValues(actor);
        if (healingFaces.length) explodeValues = [...new Set([...(explodeValues ?? []), ...healingFaces])];
      }
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

    // Healing bonus dice are spent by the roll that used them (consumeOn: 'heal' effects)
    if (healingApplied) await consumeUsedEffects(actor, 'heal');

    // Informational hook: the evaluated roll and the descriptor that produced it
    Hooks.callAll('vagabond.postDamageRoll', { descriptor: d, roll });
    return roll;
  }

  /* ------------------------------------------------------------------------ */
  /* Formula assembly helpers                                                 */
  /* ------------------------------------------------------------------------ */

  /**
   * Does this damage type restore HP? (Mirrors VagabondDamageHelper.getRestorativeResource —
   * this module must not import damage-helper.)
   * @param {string|null} damageType
   * @returns {boolean}
   */
  static _restoresHp(damageType) {
    const type = damageType?.toLowerCase() || '';
    const configured = CONFIG.VAGABOND?.restorativeDamageTypes;
    return (configured ? configured[type] : { healing: 'hp' }[type]) === 'hp';
  }

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
   * Collect always-on crit dice from `rollData.critBonusDice` — fed by On Use Only
   * Active Effects on the weapon (Vicious = `system.critBonusDice` add `matchDie`).
   * Fire on every crit regardless of the Luck/benefit toggle. Entries are dice
   * formulas; the token `matchDie` means one die matching the first die of the
   * damage formula built so far.
   * @param {object} rollData - Roll data WITH the item's on-use effects applied
   * @param {string} currentFormula - Formula built so far (for `matchDie`)
   * @returns {Array<{formula: string}>}
   */
  static collectCritAlwaysOnBonuses(rollData, currentFormula) {
    const raw = rollData?.critBonusDice;
    const entries = Array.isArray(raw) ? raw : String(raw ?? '').split('+');
    const dieMatch = String(currentFormula).match(/d(\d+)/);
    const bonuses = [];
    for (let entry of entries) {
      entry = String(entry).trim();
      if (!entry || entry === '0') continue;
      if (entry === 'matchDie') entry = dieMatch ? `1d${dieMatch[1]}` : '';
      if (entry) bonuses.push({ formula: entry });
    }
    return bonuses;
  }

  /**
   * Extra crit dice for an attack rolled with `skillKey` — `actor.system.critExtraDiceBySkill`
   * (`{ ranged: 2 }`): that many dice matching the first die of the formula built so far.
   * @param {Actor} actor
   * @param {string|null} skillKey
   * @param {string} currentFormula
   * @returns {string} e.g. "2d8", or '' when none
   */
  static critExtraDiceFor(actor, skillKey, currentFormula) {
    const count = Math.trunc(Number(actor.system?.critExtraDiceBySkill?.[skillKey])) || 0;
    if (!skillKey || count <= 0) return '';
    const die = String(currentFormula).match(/d(\d+)/);
    return die ? `${count}d${die[1]}` : '';
  }

  /* ------------------------------------------------------------------------ */
  /* Dice mechanics                                                           */
  /* ------------------------------------------------------------------------ */

  /**
   * Manually explode dice on specific values (recursive).
   * Bypasses Foundry's x-syntax; 'max' sentinel resolves per-die to its max face,
   * 'max-N' to N faces below it (e.g. 'max-1' on a d6 = 5). A relative face that
   * would land on 1 is dropped so a small die can never explode on every face.
   * @param {Roll} roll - The evaluated roll to explode
   * @param {Array<number|'max'|string>} explodeValues
   * @param {number} maxExplosions - Safety limit
   * @returns {Promise<Roll>}
   */
  static async manuallyExplodeDice(roll, explodeValues, maxExplosions = 100) {
    if (!explodeValues || explodeValues.length === 0) return roll;

    const maxOffsets = [];
    const numericExplodeValues = [];
    for (const v of explodeValues) {
      const rel = typeof v === 'string' ? v.match(/^max(?:-(\d+))?$/) : null;
      if (rel) maxOffsets.push(parseInt(rel[1] ?? 0));
      else numericExplodeValues.push(parseInt(v));
    }
    let explosionCount = 0;

    for (let i = 0; i < roll.terms.length; i++) {
      const term = roll.terms[i];
      if (term.constructor.name !== 'Die') continue;

      const faces = term.faces;
      const explodeSet = new Set(numericExplodeValues);
      for (const off of maxOffsets) {
        if (off === 0 || faces - off > 1) explodeSet.add(faces - off);
      }
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
   * Explosion values for an item, honoring actor global explode bonuses and the
   * Alchemist's Potency feature (scoped to `sourceType === 'alchemical'` only —
   * unlike `bonuses.globalExplode`, which applies to every damage source).
   * Potency's `craft.alchemicalExplode` is a face COUNT (1 = highest @L4,
   * 2 = two highest @L8), added on top of whatever the item authored.
   * @param {Item|null} item
   * @param {Actor|null} actor
   * @param {string|null} [sourceType=null]
   * @returns {Array<number|'max'|string>|null}
   */
  static getExplodeValues(item, actor = null, sourceType = null) {
    let canExplode = item?.system?.canExplode;
    let explodeValuesStr = item?.system?.explodeValues;

    if (actor) {
      // Global values only apply while the global explode is ON — otherwise a
      // permanently-present Override effect (Murder Mode) would clobber the item's own.
      if (actor.system.bonuses?.globalExplode) {
        canExplode = true;
        const globalValues = actor.system.bonuses?.globalExplodeValues;
        if (globalValues) explodeValuesStr = globalValues;
      }

      // Potency (Alchemist, docs/crafting-plan.md §4.9): grants Explode on
      // Alchemical Items the actor uses, regardless of the item's own authoring.
      const potencyFaces = sourceType === 'alchemical' ? Number(actor.system.craft?.alchemicalExplode) || 0 : 0;
      if (potencyFaces > 0) {
        canExplode = true;
        const potency = Array.from({ length: potencyFaces }, (_, n) => n === 0 ? 'max' : `max-${n}`);
        explodeValuesStr = [explodeValuesStr, ...potency].filter(Boolean).join(',');
      }
    }

    if (!canExplode || !explodeValuesStr) return null;

    const explodeValues = [...new Set(String(explodeValuesStr)
      .split(',')
      .map(v => v.trim().toLowerCase())
      .filter(v => v && (/^max(-\d+)?$/.test(v) || !isNaN(v)))
      .map(v => v.startsWith('max') ? v : parseInt(v)))];

    return explodeValues.length > 0 ? explodeValues : null;
  }

  /**
   * Raise every NdX term of a formula to at least dY (never lowers a die). No-op for a missing / invalid size.
   * @param {string} formula
   * @param {number|undefined} size
   * @returns {string}
   */
  static _raiseDiceTo(formula, size) {
    const target = Math.trunc(Number(size));
    if (!target || target < 2) return formula;
    return formula.replace(/(\d*)d(\d+)/g, (match, count, faces) => (Number(faces) < target ? `${count}d${target}` : match));
  }

  /**
   * Faces the actor's HP-restoring Spell rolls also explode on (`system.healingExplode`):
   * numbers or 'max' / 'max-N', same vocabulary as an item's explodeValues.
   * @param {Actor|null} actor
   * @returns {Array<number|string>}
   */
  static healingExplodeValues(actor) {
    const raw = actor?.system?.healingExplode;
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw
      .map(v => String(v).trim().toLowerCase())
      .filter(v => /^max(-\d+)?$/.test(v) || (v !== '' && !isNaN(v)))
      .map(v => v.startsWith('max') ? v : parseInt(v)))];
  }

  /**
   * Can this item's damage dice explode for its owner, by ANY route (item
   * authoring, actor global-explode effects, Potency)? Same check the roll uses,
   * so display and behavior never disagree. Evaluated at call time — never cache
   * on prepared data (actor bonuses derive after the item).
   * @param {Item|null} item
   * @param {Actor|null} [actor] - Defaults to the item's owner
   * @returns {boolean}
   */
  static isExplodable(item, actor = item?.actor ?? null) {
    if (!item) return false;
    const sourceType = item.type === 'spell' ? 'spell'
      : item.system?.equipmentType === 'alchemical' ? 'alchemical' : 'weapon';
    if (this.getExplodeValues(item, actor, sourceType)) return true;
    if (sourceType === 'weapon' && Number(actor?.system?.weaponLowExplodeBySkill?.[item.system?.weaponSkill]) > 0) return true;
    return item.type === 'spell' && this._restoresHp(item.system?.damageType) && this.healingExplodeValues(actor).length > 0;
  }

  /**
   * Display notation for damage that can explode: "2d6" → "2d6!". "-", empty and
   * non-string values pass through. Display only — never feed the result to a Roll.
   * @param {string} formula
   * @param {Item|null} item
   * @param {Actor|null} [actor]
   * @returns {string}
   */
  static markExplode(formula, item, actor = item?.actor ?? null) {
    if (!formula || typeof formula !== 'string') return formula;
    const f = formula.trim();
    if (!f || f === '-' || f.endsWith('!')) return formula;
    return this.isExplodable(item, actor) ? `${f}!` : formula;
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
   * @param {Actor|null} [attacker] - Hunter Apex Predator: the Mark is Weak to its Hunter's attacks
   * @returns {boolean}
   */
  static isWeakTo(targetActor, damageType, attackingWeapon = null, attacker = null) {
    const normalizedType = damageType.toLowerCase();
    if (normalizedType === '-') return false;
    if (HunterHelper.isMarkWeak(attacker, targetActor)) return true;
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
