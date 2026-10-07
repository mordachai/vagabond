import { EquipmentHelper } from './equipment-helper.mjs';
import { FlankingHelper } from './flanking-helper.mjs';
import { VagabondRollBuilder } from './roll-builder.mjs';

/**
 * Defense weapon property (Core Rulebook Alpha 3, p. 80):
 * "When you make a Reflex Save, you can make an Attack Check instead. If you pass, you reduce
 *  the damage by each equipped Defense Weapons' damage dice."
 *
 * Ruling (user, 2026-10-07): a pass ONLY reduces the damage by the Defense dice — no highest-die
 * removal; a fail takes the full damage. A Crit on the Check is an Attack Check Crit (+1 Luck).
 *
 * - Which weapons count: `defenseWeapons(actor)` — held weapons with the Defense property, plus
 *   Patience weapons (below). Reduction = every one of them (world setting
 *   `defenseWithBothWeapons` off → only the weapon that made the Check).
 * - The Check: that weapon's attack skill vs its Difficulty, with the weapon's on-use effects
 *   (Keen crit). It replaces the Reflex Save, so the Save-side votes (actor favor/hinder state,
 *   the attacker's outgoingSavesModifier, status resistance) apply; the Armor Reflex penalty
 *   does not (it is not a Reflex roll).
 * - Dice: `VagabondDamagePipeline.rollDefenseDice` (Vanguard Wall / Indestructible apply).
 *
 * Protector perk (`system.protectorDefense`, set by the perk's effect): "When a Close Ally would
 * be dealt damage due to a failed Reflex Save while you have a Defense Weapon Equipped, you can
 * use the Defense property for them." → a Protect button on the failed Reflex result card.
 *
 * Patience perk (`system.patienceDefense`): "If you end your Turn with a Brawl, Finesse, or Melee
 * Weapon Equipped that you did not attack or Cast with, it has the Defense property until your
 * next Turn or until you roll its damage die." In a started Combat the weapon flag
 * `flags.vagabond.patience` tracks it ('spent' = attacked this Turn, 'armed' = has Defense);
 * outside Combat nothing counts Turns, so every qualifying held weapon is offered (manual-first).
 */
export class DefenseHelper {

  static PATIENCE_SKILLS = ['brawl', 'finesse', 'melee'];

  static #isWeapon(i) {
    return i.type === 'weapon' || (i.type === 'equipment' && i.system.equipmentType === 'weapon');
  }

  static #isHeld(i) {
    return i.system.equipmentState === 'oneHand' || i.system.equipmentState === 'twoHands';
  }

  /** Is the actor in a started Combat (so Turns are counted)? */
  static inCombat(actor) {
    return !!game.combat?.started && !!game.combat.combatants.find(c => c.actor?.id === actor?.id);
  }

  /** Patience: may this held weapon gain Defense (Brawl / Finesse / Melee weapon)? */
  static #patienceQualifies(weapon) {
    return EquipmentHelper.attackSkillOptions(weapon).some(k => this.PATIENCE_SKILLS.includes(k));
  }

  /** Does this weapon currently have Defense through Patience? */
  static hasPatienceDefense(actor, weapon) {
    if (!actor?.system?.patienceDefense || weapon.system.properties?.includes('Defense')) return false;
    if (!this.#patienceQualifies(weapon)) return false;
    return this.inCombat(actor) ? weapon.getFlag('vagabond', 'patience') === 'armed' : true;
  }

  /**
   * Held weapons that have the Defense property right now (own property or Patience),
   * oldest-equipped first.
   * @returns {Item[]}
   */
  static defenseWeapons(actor) {
    return (actor?.items?.filter(i => this.#isWeapon(i) && this.#isHeld(i)
      && (i.system.properties?.includes('Defense') || this.hasPatienceDefense(actor, i))) ?? [])
      .sort((a, b) => (a.getFlag('vagabond', 'equippedAt') ?? 0) - (b.getFlag('vagabond', 'equippedAt') ?? 0));
  }

  /** The weapons whose dice reduce the damage when `weapon` made the Check. */
  static reductionWeapons(actor, weapon) {
    return game.settings.get('vagabond', 'defenseWithBothWeapons') ? this.defenseWeapons(actor) : [weapon];
  }

  /**
   * Roll the Defense Attack Check (replaces the Reflex Save).
   * @param {Actor} actor - Defender
   * @param {Item} weapon - Defense weapon making the Check
   * @param {{attackerModifier?: string, resistanceFavor?: boolean, defenseVote?: string, event?: Event}} opts
   *   defenseVote: the defender's Reflex-Save rules vote (`_evaluateDefenseRules`, e.g. Prone → 'hinder')
   * @returns {Promise<{roll: Roll, difficulty: number, isSuccess: boolean, isCritical: boolean, skillKey: string, favorHinder: string}>}
   */
  static async rollCheck(actor, weapon, { attackerModifier = 'none', resistanceFavor = false, defenseVote = 'none', event = null } = {}) {
    const skillKey = EquipmentHelper.attackSkillFor(weapon);
    const rollData = actor.getRollDataWithItemEffects(weapon);
    const difficulty = rollData.skills?.[skillKey]?.difficulty ?? rollData.saves?.[skillKey]?.difficulty ?? 10;
    const favorHinder = VagabondRollBuilder.mergeFavorHinder(
      VagabondRollBuilder.calculateEffectiveFavorHinder(actor.system.favorHinder || 'none', !!event?.shiftKey, !!event?.ctrlKey),
      VagabondRollBuilder.checkFavorVote(actor, 'attack'),
      attackerModifier,
      resistanceFavor ? 'favor' : 'none',
      defenseVote
    );
    const roll = await VagabondRollBuilder.buildAndEvaluateD20WithRollData(rollData, favorHinder);
    const critNumber = VagabondRollBuilder.calculateCritThreshold(rollData, skillKey);
    const d20 = roll.terms.find(t => t.constructor.name === 'Die' && t.faces === 20);
    const isCritical = (d20?.results?.find(r => r.active !== false)?.result ?? 0) >= critNumber;
    return { roll, difficulty, isSuccess: roll.total >= difficulty, isCritical, skillKey, favorHinder };
  }

  /** A token placeable for an actor (its synthetic token first). */
  static tokenOf(actor) {
    return actor?.token?.object ?? actor?.getActiveTokens?.(true)?.[0] ?? null;
  }

  /**
   * Protector: actors that can use their Defense property for `defender` right now —
   * `system.protectorDefense`, a Defense weapon held, Close to the defender, not the defender.
   * @returns {Actor[]}
   */
  static protectorsFor(defender) {
    const defToken = this.tokenOf(defender);
    if (!defToken || !canvas.tokens) return [];
    const seen = new Set();
    const out = [];
    for (const token of canvas.tokens.placeables) {
      const a = token.actor;
      if (!a || a.id === defender.id || seen.has(a.id)) continue;
      if (!a.system?.protectorDefense || !this.defenseWeapons(a).length) continue;
      if (FlankingHelper.rangeBand(token, defToken) !== 'close') continue;
      seen.add(a.id);
      out.push(a);
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Patience tracking (started Combat only)                             */
  /* ------------------------------------------------------------------ */

  /** `vagabond.postD20Roll`: attacking with a weapon spends its Patience for this Turn. */
  static async onWeaponRoll(ctx) {
    if (ctx?.rollType !== 'weapon' || !ctx.item || !ctx.actor?.system?.patienceDefense) return;
    if (!ctx.actor.isOwner || !this.inCombat(ctx.actor)) return;
    if (ctx.item.getFlag('vagabond', 'patience') !== 'spent') await ctx.item.setFlag('vagabond', 'patience', 'spent');
  }

  /** Rolling a Patience weapon's damage die ends its Defense ("until you roll its damage die"). */
  static async spendPatience(actor, weapons) {
    if (!actor?.isOwner) return;
    for (const w of weapons) {
      if (w.getFlag('vagabond', 'patience') === 'armed') await w.unsetFlag('vagabond', 'patience');
    }
  }

  /** `vagabond.postDamageRoll`: a Patience weapon rolled its damage die. */
  static async onDamageRoll({ descriptor } = {}) {
    const item = descriptor?.item;
    if (!item || descriptor.sourceType !== 'weapon' || !descriptor.actor?.system?.patienceDefense) return;
    await this.spendPatience(descriptor.actor, [item]);
  }

  /** `combatTurnChange`: the Turn that ended arms unspent weapons; the Turn that starts clears its own. */
  static async onTurnChange(combat, prior, current) {
    if (!game.user.isActiveGM) return;
    const ended = combat.combatants.get(prior?.combatantId)?.actor;
    if (ended?.system?.patienceDefense) {
      for (const w of ended.items.filter(i => this.#isWeapon(i))) {
        const arm = this.#isHeld(w) && this.#patienceQualifies(w) && w.getFlag('vagabond', 'patience') !== 'spent';
        if (arm) await w.setFlag('vagabond', 'patience', 'armed');
        else if (w.getFlag('vagabond', 'patience')) await w.unsetFlag('vagabond', 'patience');
      }
    }
    const started = combat.combatants.get(current?.combatantId)?.actor;
    if (started && started.id !== ended?.id) {
      for (const w of started.items.filter(i => i.getFlag?.('vagabond', 'patience'))) await w.unsetFlag('vagabond', 'patience');
    }
  }

  static registerHooks() {
    Hooks.on('vagabond.postD20Roll', (ctx) => { this.onWeaponRoll(ctx); });
    Hooks.on('vagabond.postDamageRoll', (ctx) => { this.onDamageRoll(ctx); });
    Hooks.on('combatTurnChange', (combat, prior, current) => { this.onTurnChange(combat, prior, current); });
  }
}
