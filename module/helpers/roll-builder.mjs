/**
 * Centralized utility for building and evaluating rolls with favor/hinder mechanics
 */
export class VagabondRollBuilder {
  /**
   * Build d20 roll formula with favor/hinder and check bonus
   * @param {VagabondActor} actor - Actor rolling
   * @param {string} favorHinder - 'favor', 'hinder', or 'none'
   * @param {string} baseFormula - Base formula (default 'd20')
   * @returns {string} Complete roll formula
   */
  /**
   * Sum all saveVsStatusBonuses entries on an actor that match the given status + save type.
   *
   * Entry format: "statusId:saveKey:formula"
   *   - statusId  — e.g. "frightened", "poisoned"
   *   - saveKey   — e.g. "will", "reflex", or "any" (matches every save type)
   *   - formula   — a number or @-reference expression, e.g. "1" or "@attributes.level.value"
   *
   * @param {Actor}  actor
   * @param {string} statusId  The status being saved against
   * @param {string} saveKey   The save type being rolled
   * @returns {number}
   */
  static getSaveVsStatusBonus(actor, statusId, saveKey) {
    const entries = actor.system?.saveVsStatusBonuses;
    if (!entries || entries.length === 0) return 0;
    const rollData = actor.getRollData();
    let total = 0;
    for (const entry of entries) {
      const first = entry.indexOf(':');
      if (first === -1) continue;
      const second = entry.indexOf(':', first + 1);
      if (second === -1) continue;
      const entryStatus  = entry.slice(0, first);
      const entrySaveKey = entry.slice(first + 1, second);
      const formula      = entry.slice(second + 1).trim();
      if (entryStatus !== statusId) continue;
      if (entrySaveKey !== 'any' && entrySaveKey !== saveKey) continue;
      try {
        const subbed = formula.replace(/@([A-Za-z0-9._]+)/g,
          (_, path) => foundry.utils.getProperty(rollData, path) ?? 0);
        total += Roll.safeEval(subbed) || 0;
      } catch {
        total += Number(formula) || 0;
      }
    }
    return total;
  }

  /**
   * The Favor die term from the homebrew dice config, optionally exploding
   * (`1d6[favored]` → `1d6x[favored]`: modifiers precede the flavor).
   * @param {boolean} [explode=false] - e.g. `actor.system.bonusDiceExplode`
   * @returns {string}
   */
  static favorDieFormula(explode = false) {
    const die = CONFIG.VAGABOND?.homebrew?.dice?.favorBonus ?? '1d6[favored]';
    return explode === true ? die.replace(/(\d*d\d+)(?![\dx])/, '$1x') : die;
  }

  /**
   * Base die for a save when the actor rolls it twice and keeps the higher
   * (`system.saveRollsTwice` ADDs the save key, e.g. Dancer Footloose → reflex).
   * `1d20` becomes `2d20kh`; Favor/Hinder dice and flat modifiers still add on top.
   * @param {Actor} actor
   * @param {string} saveKey
   * @returns {string|null} The base die formula, or null when the save rolls normally
   */
  static saveBaseDie(actor, saveKey) {
    if (!saveKey || !actor?.system?.saveRollsTwice?.includes(saveKey)) return null;
    const base = CONFIG.VAGABOND?.homebrew?.dice?.baseCheck ?? '1d20';
    return base.replace(/^\d*d(\d+)/, '2d$1kh');
  }

  static buildD20Formula(actor, favorHinder, baseFormula = null) {
    const dice = CONFIG.VAGABOND?.homebrew?.dice;
    let formula = baseFormula ?? dice?.baseCheck ?? '1d20';

    // Add favor/hinder dice from homebrew config
    if (favorHinder === 'favor') {
      const favDice = this.favorDieFormula(actor?.system?.bonusDiceExplode);
      formula += ` + ${favDice}`;
    } else if (favorHinder === 'hinder') {
      const hindDice = dice?.hinderPenalty ?? '1d6[hindered]';
      formula += ` - ${hindDice}`;
    }

    // Add universal check bonus
    const checkBonus = actor.system.universalCheckBonus || 0;
    if (checkBonus !== 0) {
      formula += ` + ${checkBonus}`;
    }

    return formula;
  }

  /**
   * Create and evaluate a roll with custom dice appearance
   * @param {string} formula - Roll formula
   * @param {VagabondActor} actor - Actor rolling
   * @param {string} favorHinder - 'favor', 'hinder', or 'none'
   * @returns {Promise<Roll>} Evaluated roll
   */
  static async evaluateRoll(formula, actor, favorHinder) {
    const { VagabondDiceAppearance } = await import('./dice-appearance.mjs');
    const roll = new Roll(formula, actor.getRollData());
    await VagabondDiceAppearance.evaluateWithCustomColors(roll, favorHinder);
    return roll;
  }

  /**
   * Build and evaluate d20 roll in one step
   * @param {VagabondActor} actor - Actor rolling
   * @param {string} favorHinder - 'favor', 'hinder', or 'none'
   * @param {string} baseFormula - Base formula (default 'd20')
   * @returns {Promise<Roll>} Evaluated roll
   */
  static async buildAndEvaluateD20(actor, favorHinder, baseFormula = null) {
    const formula = this.buildD20Formula(actor, favorHinder, baseFormula);
    return this.evaluateRoll(formula, actor, favorHinder);
  }

  /**
   * Build and evaluate d20 roll using pre-computed roll data
   * Used when item effects have already been applied to roll data
   * @param {Object} rollData - Pre-computed roll data (may include item effects)
   * @param {string} favorHinder - 'favor', 'hinder', or 'none'
   * @param {string} baseFormula - Base formula (default 'd20')
   * @returns {Promise<Roll>} Evaluated roll
   */
  static async buildAndEvaluateD20WithRollData(rollData, favorHinder, baseFormula = null) {
    const dice = CONFIG.VAGABOND?.homebrew?.dice;
    let formula = baseFormula ?? dice?.baseCheck ?? '1d20';

    // Add favor/hinder dice
    if (favorHinder === 'favor') {
      formula += ` + ${this.favorDieFormula(rollData?.bonusDiceExplode)}`;
    } else if (favorHinder === 'hinder') {
      formula += ` - ${dice?.hinderPenalty ?? '1d6[hindered]'}`;
    }

    // Add universal check bonus from rollData
    const checkBonus = rollData.universalCheckBonus || 0;
    if (checkBonus !== 0) {
      formula += ` + ${checkBonus}`;
    }

    // Evaluate with custom dice appearance
    const { VagabondDiceAppearance } = await import('./dice-appearance.mjs');
    const roll = new Roll(formula, rollData);
    await VagabondDiceAppearance.evaluateWithCustomColors(roll, favorHinder);
    return roll;
  }

  /**
   * Fold any number of favor/hinder votes into one tri-state.
   * NET-COUNT semantics: the result is the sign of (favor votes − hinder votes).
   * Only the direction is decided here — the roll still gets at most one
   * favor/hinder die, never stacked dice. Order-independent by construction.
   * Booleans are NOT accepted; callers convert explicitly
   * (e.g. `isHindered ? 'hinder' : 'none'`) to keep the vocabulary canonical.
   * @param {...('favor'|'hinder'|'none'|null|undefined)} votes
   * @returns {'favor'|'hinder'|'none'}
   */
  static mergeFavorHinder(...votes) {
    let net = 0;
    for (const vote of votes) {
      if (vote === 'favor') net++;
      else if (vote === 'hinder') net--;
    }
    return net > 0 ? 'favor' : net < 0 ? 'hinder' : 'none';
  }

  /** Stats a skill / save key is built on (a Skill has one, a Save has stat1 + stat2). */
  static _statsOf(actor, key) {
    const skill = actor?.system?.skills?.[key] ?? CONFIG.VAGABOND?.homebrew?.skills?.find(s => s.key === key);
    if (skill?.stat) return [skill.stat];
    const save = CONFIG.VAGABOND?.homebrew?.saves?.find(s => s.key === key);
    return save ? [save.stat1, save.stat2] : [];
  }

  /**
   * Whether a status forces this roll to fail (Dead: `autoFailAllRolls`; Incapacitated:
   * `autoFailStats` holds Might and Dexterity). Stats are never rolled in Vagabond, so a
   * "Might Check" is any Skill or Save built on Might: it fails when its Stat (a Skill's
   * `stat`, a Save's `stat1` / `stat2`) is listed, or when its own key is. `key` is a stat,
   * skill or save key. The ONE check every roll path uses (sheet, attacks, casts, chat-card
   * Saves, Defense Check, status Saves).
   * @param {Actor} actor
   * @param {string} key
   * @returns {boolean}
   */
  static autoFails(actor, key) {
    if (actor?.system?.autoFailAllRolls) return true;
    const failing = actor?.system?.autoFailStats ?? [];
    if (!failing.length) return false;
    if (failing.includes(key)) return true;
    const stats = this._statsOf(actor, key);
    return stats.some(stat => stat && failing.includes(stat));
  }

  /**
   * One Favor vote from `system.favorChecks` — unconditional Favor on a whole category of
   * checks (an Active Effect ADDs 'attack' / 'cast' / 'save'). Independent of every other vote.
   * @param {Actor} actor
   * @param {'attack'|'cast'|'save'} kind
   * @returns {'favor'|'none'}
   */
  static checkFavorVote(actor, kind) {
    return actor?.system?.favorChecks?.includes(kind) ? 'favor' : 'none';
  }

  /**
   * Status votes on an attack or Cast Check against a target (the book's lowercase "attack"
   * covers Casts). The actor's own blanket Vulnerable Hinder rides `system.favorHinder`, not here.
   * - Vulnerable target (`vulnerable`) / generic `incomingAttacksModifier`: Favor;
   * - Invisible target (`attackersAreBlinded`): the attacker can't see it, acts as Blinded → Hinder;
   * - Invisible attacker: the target can't see it, acts as Blinded (Vulnerable) → Favor;
   * - Prone (`meleeReflexVulnerable`), Melee only: Prone target → Favor, Prone attacker → Hinder.
   * @param {Actor} attacker
   * @param {Actor|null} targetActor - first target (multi-target rolls consult only the first)
   * @param {{melee?: boolean}} [opts] - melee: a Melee attack or a Close (Touch) Cast
   * @returns {Array<'favor'|'hinder'|'none'>}
   */
  static targetingVotes(attacker, targetActor, { melee = false } = {}) {
    const votes = [];
    if (melee && attacker?.system?.meleeReflexVulnerable) votes.push('hinder');
    if (!targetActor) return votes;
    const t = targetActor.system ?? {};
    votes.push(t.incomingAttacksModifier || 'none');
    if (t.vulnerable) votes.push('favor');
    if (t.defenderStatusModifiers?.attackersAreBlinded) votes.push('hinder');
    if (attacker?.system?.defenderStatusModifiers?.attackersAreBlinded) votes.push('favor');
    if (melee && t.meleeReflexVulnerable) votes.push('favor');
    return votes;
  }

  /**
   * One attacker-side Favor vote from `CONFIG.VAGABOND.attackFavorRules`.
   * 'favor' when the actor carries at least one rule key in `system.attackFavorVs`
   * (granted by an Active Effect) whose test passes for the given targets; else 'none'.
   * @param {Actor} actor - The attacker
   * @param {Actor[]} targetActors
   * @returns {'favor'|'none'}
   */
  static attackFavorVote(actor, targetActors) {
    const keys = actor?.system?.attackFavorVs;
    if (!keys?.length || !targetActors?.length) return 'none';
    const rules = CONFIG.VAGABOND.attackFavorRules ?? {};
    return keys.some(k => rules[k]?.test(actor, targetActors)) ? 'favor' : 'none';
  }

  /**
   * Calculate effective favor/hinder state from system state and keyboard modifiers
   * This is the standard cancellation logic used throughout the system
   * @param {string} systemState - Actor's system.favorHinder ('favor', 'hinder', 'none')
   * @param {boolean} shiftKey - Shift key pressed (temporary favor)
   * @param {boolean} ctrlKey - Ctrl key pressed (temporary hinder)
   * @returns {string} Effective favor/hinder state ('favor', 'hinder', 'none')
   */
  static calculateEffectiveFavorHinder(systemState, shiftKey = false, ctrlKey = false) {
    // Keyboard intent is pre-resolved (both keys cancel) before entering as one vote
    let modifierIntent = 'none';
    if (shiftKey && !ctrlKey) modifierIntent = 'favor';
    else if (ctrlKey && !shiftKey) modifierIntent = 'hinder';

    return this.mergeFavorHinder(systemState, modifierIntent);
  }

  /**
   * Apply conditional hinder to favor/hinder state
   * Used for saves where armor or attack type can force a hindered state
   * @param {string} effectiveFavorHinder - Effective state from calculateEffectiveFavorHinder
   * @param {boolean} isConditionallyHindered - Whether external conditions force hinder
   * @returns {string} Final favor/hinder state after applying conditional hinder
   */
  static applyConditionalHinder(effectiveFavorHinder, isConditionallyHindered) {
    return this.mergeFavorHinder(effectiveFavorHinder, isConditionallyHindered ? 'hinder' : 'none');
  }

  /**
   * Build and evaluate d20 roll with conditional hinder support
   * Used for save rolls where armor or attack type can force hindered state
   * @param {VagabondActor} actor - Actor rolling
   * @param {string} effectiveFavorHinder - Effective favor/hinder state
   * @param {boolean} isConditionallyHindered - Whether external conditions force hinder
   * @param {string} baseFormula - Base formula (default 'd20')
   * @returns {Promise<Roll>} Evaluated roll
   */
  static async buildAndEvaluateD20WithConditionalHinder(
    actor,
    effectiveFavorHinder,
    isConditionallyHindered,
    baseFormula = null
  ) {
    // Apply conditional hinder to determine final state
    const finalFavorHinder = this.applyConditionalHinder(effectiveFavorHinder, isConditionallyHindered);

    // Build and evaluate with final state
    const formula = this.buildD20Formula(actor, finalFavorHinder, baseFormula);
    return this.evaluateRoll(formula, actor, finalFavorHinder);
  }

  /**
   * Whether a crit-type key is a weapon skill (config-driven, homebrew-aware).
   * Weapon skills are the ones flagged `isWeaponSkill` in the homebrew skills config
   * (defaults: melee, ranged, brawl, finesse). Used to decide both whether a roll
   * can crit at all and whether the universal `attackCritBonus` applies.
   * @param {string} key - The skill/roll key
   * @returns {boolean}
   */
  static isWeaponSkillKey(key) {
    if (!key) return false;
    return !!(CONFIG.VAGABOND?.homebrew?.skills ?? []).find(s => s.key === key && s.isWeaponSkill);
  }

  /**
   * Calculate the final critical hit threshold based on base value and applicable bonuses.
   *
   * The `type` is fully dynamic / homebrew-aware:
   * - `'spell'` → adds `castCritBonus`.
   * - a weapon skill (any key flagged `isWeaponSkill`) → adds `<type>CritBonus` plus the
   *   universal `attackCritBonus`.
   * - any other key (a save: reflex/endure/will or homebrew-configured) → adds `<type>CritBonus`.
   *
   * @param {Object} rollData - The roll data containing critNumber and per-type bonuses
   * @param {string|null} type - The type of roll ('spell', a weapon skill key, or a save key)
   * Pass `rollData` from `Actor#getRollDataWithItemEffects(item)` when rolling a weapon so its
   * On Use Only effects (Keen = `attackCritBonus` −1) are included.
   * @returns {number} The final critical hit threshold (e.g., 19 for crit on 19-20)
   */
  static calculateCritThreshold(rollData, type = null) {
    let critThreshold = rollData.critNumber || 20;
    if (type) {
      if (type === 'spell') {
        critThreshold += (rollData.castCritBonus || 0);
      } else {
        // Per-type crit bonus — works for any weapon skill OR save key
        critThreshold += (rollData[`${type}CritBonus`] || 0);
        // Universal weapon-attack crit bonus applies to every weapon skill
        if (this.isWeaponSkillKey(type)) {
          critThreshold += (rollData.attackCritBonus || 0);
        }
      }
    }

    // Ensure it doesn't go below 1 or above 20
    return Math.clamp(critThreshold, 1, 20);
  }
}
