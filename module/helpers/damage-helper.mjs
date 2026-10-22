import { VagabondDamagePipeline } from './damage-pipeline.mjs';
import { TargetHelper } from './target-helper.mjs';
import { SpellPlacement } from './spell-placement.mjs';
import { EquipmentHelper } from './equipment-helper.mjs';
import { DefenseHelper } from './defense-helper.mjs';
import { NpcRules } from './npc-rules.mjs';
import { FocusLink } from './focus-link.mjs';
import { FeatureRules } from './feature-rules.mjs';
import { VagabondSpellSequencer } from './spell-sequencer.mjs';
import { MacroAutoRun } from './macro-autorun.mjs';
import { GMRelay } from './gm-relay.mjs';

/**
 * Universal Damage Helper
 * Chat-card button builders, the Save list, spell Cast context and apply-time damage math.
 * Button click handlers + result cards live in VagabondDamageChatHandlers (damage-chat-handlers.mjs).
 * Roll-time primitives live in VagabondDamagePipeline (damage-pipeline.mjs).
 */
export class VagabondDamageHelper {

  /**
   * Get targets from button dataset with multi-tier fallback
   * @param {HTMLElement} button - The button element
   * @param {ChatMessage} message - The chat message (optional)
   * @returns {Array} Array of target data objects
   * @private
   */
  static _getTargetsFromButton(button, message = null) {
    // Tier 1: Button dataset (primary source)
    if (button.dataset.targets) {
      try {
        const stored = JSON.parse(button.dataset.targets.replace(/&quot;/g, '"'));
        if (stored && stored.length > 0) {
          return stored;
        }
      } catch (e) {
        console.warn('VagabondDamageHelper | Failed to parse button targets', e);
      }
    }

    // Tier 2: Message flags (fallback for old buttons)
    if (message?.flags?.vagabond?.targetsAtRollTime) {
      const flagTargets = message.flags.vagabond.targetsAtRollTime;
      if (flagTargets && flagTargets.length > 0) {
        return flagTargets;
      }
    }

    // Tier 3: Current game.user.targets (backward compatibility)
    const currentTargets = Array.from(game.user.targets).map(token => ({
      tokenId: token.id,
      sceneId: token.scene.id,
      actorId: token.actor?.id,
      actorName: token.name,
      actorImg: token.document.texture.src
    }));

    return currentTargets;
  }

  /**
   * Resolve stored target data to actual token references
   * @param {Array} storedTargets - Array of target objects
   * @returns {Array} Array of resolved Token documents
   * @private
   */
  static _resolveStoredTargets(storedTargets) {
    const resolved = [];

    for (const targetData of storedTargets) {
      // Cross-scene check
      if (targetData.sceneId !== canvas.scene?.id) {
        ui.notifications.warn(`${targetData.actorName} is on a different scene - skipping`);
        continue;
      }

      // Find token on current scene
      const token = canvas.tokens.get(targetData.tokenId);
      if (!token) {
        ui.notifications.warn(`Token for ${targetData.actorName} not found - may have been deleted`);
        continue;
      }

      resolved.push(token);
    }

    return resolved;
  }

  /**
   * Determine if damage should be rolled based on game settings
   * @param {boolean} isHit - Whether the attack/check was successful
   * @returns {boolean} - Whether to roll damage
   */
  static shouldRollDamage(isHit) {
    const rollWithCheck = game.settings.get('vagabond', 'rollDamageWithCheck');

    // If not rolling with check, never auto-roll (manual button only)
    if (!rollWithCheck) return false;

    const alwaysRoll = game.settings.get('vagabond', 'alwaysRollDamage');

    // If always roll is enabled, roll regardless of hit/miss
    if (alwaysRoll) return true;

    // Otherwise, only roll on hit
    return isHit;
  }

  /**
   * Create a damage roll button for chat cards
   * @param {string} actorId - Actor UUID
   * @param {string} itemId - Item UUID (if applicable)
   * @param {string} damageFormula - Damage formula to roll
   * @param {Object} context - Additional context for the damage roll
   * @returns {string} HTML button string
   */
  static createDamageButton(actorId, itemId, damageFormula, context = {}, targetsAtRollTime = []) {
    const contextJson = JSON.stringify(context).replace(/"/g, '&quot;');
    const targetsJson = JSON.stringify(targetsAtRollTime).replace(/"/g, '&quot;');

    return `
      <button
        class="vagabond-damage-button"
        data-vagabond-button="true"
        data-actor-id="${actorId}"
        data-item-id="${itemId || ''}"
        data-damage-formula="${damageFormula}"
        data-context="${contextJson}"
        data-targets="${targetsJson}"
      >
        <i class="fas fa-dice"></i> Roll Damage
      </button>
    `;
  }

  /**
   * Manual damage mode: when the Cast card carries a Roll Damage button, hold the
   * spell FX until that button is clicked (the animation lands with the damage, not
   * the check). Stores the FX payload on the message and returns true; returns false
   * when there is no button (miss, no damage, auto-rolled) so the caller plays the FX
   * immediately. Weapon / item animations are left to Automated Animations.
   * @param {ChatMessage|null} message
   * @param {{kind: 'spell', deliveryType?: string, deliveryIncrease?: number}} payload
   * @returns {Promise<boolean>}
   */
  static async deferFxToDamageButton(message, payload) {
    if (!message?.content?.includes('vagabond-damage-button')) return false;
    try {
      await message.setFlag('vagabond', 'pendingFx', payload);
      return true;
    } catch (err) {
      console.warn('Vagabond | Could not defer FX to damage button:', err);
      return false;
    }
  }

  /**
   * Play the FX held by {@link deferFxToDamageButton}. Fire-and-forget.
   * @param {ChatMessage|null} message
   * @param {Actor} actor
   * @param {Item|null} item
   * @param {Array} storedTargets - Target data captured at roll time
   */
  static _playPendingFx(message, actor, item, storedTargets) {
    const fx = message?.flags?.vagabond?.pendingFx;
    // Cards from before item FX were removed may still hold a `kind: 'item'` payload
    if (fx?.kind !== 'spell') return;
    this._playFx(fx, actor, item, storedTargets, true, message);
  }

  /**
   * Play spell FX now. Fire-and-forget. With the Cast card, its hit macro auto-runs when the
   * FX lands (MacroAutoRun).
   * @param {{kind: 'spell', deliveryType?: string, deliveryIncrease?: number}} fx
   * @param {Actor} actor
   * @param {Item|null} item  the spell
   * @param {Array} storedTargets - Target data captured at roll time
   * @param {boolean} isHit
   * @param {ChatMessage|null} [message]  the Cast card
   */
  static _playFx(fx, actor, item, storedTargets, isHit, message = null) {
    if (fx?.kind !== 'spell' || !item) return;
    const casterToken = actor.token?.object ?? actor.getActiveTokens(true)[0];
    // Remote spaces + a hand-placed area's center (SpellPlacement) ride the payload
    const targets = [...TargetHelper.resolveTargets(storedTargets), ...SpellPlacement.pseudoTargets(fx.spaces)];
    const played = VagabondSpellSequencer.play(item, fx.deliveryType, fx.deliveryIncrease ?? 0, casterToken, targets, { deliveryEnabled: isHit, areaCenter: fx.areaCenter ?? null, castArea: fx.castArea ?? null });
    if (message && isHit) MacroAutoRun.afterFx(message, played);
  }

  /**
   * Replayed cards (Luck reroll, Force Crit): defer the FX to the card's Roll Damage
   * button on a hit, otherwise play it right away.
   */
  static async playFxOrDefer(message, fx, actor, item, storedTargets, isHit) {
    if (isHit && await this.deferFxToDamageButton(message, fx)) return;
    this._playFx(fx, actor, item, storedTargets, isHit, message);
  }

  /**
   * Spell damage die size — single source for the auto-roll, the manual Roll Damage
   * button formula and the card's damage tag. A per-spell override still gets the
   * actor's Spell Damage Die Size Bonus; otherwise the actor's derived die size
   * (homebrew base + bonus) applies.
   * @param {Actor} actor
   * @param {Item} spell
   * @returns {number}
   */
  static spellDieSize(actor, spell) {
    const bonus = actor.system.spellDamageDieSizeBonus || 0;
    if (spell.system.damageDieSize) return spell.system.damageDieSize + bonus;
    return actor.system.spellDamageDieSize || (6 + bonus);
  }

  /**
   * Roll spell damage
   * @param {Actor} actor - The actor casting the spell
   * @param {Item} spell - The spell item
   * @param {Object} spellState - Spell state (damageDice, deliveryType, etc.)
   * @param {boolean} isCritical - Whether this was a critical hit
   * @param {string} statKey - The stat used for the cast (for crit bonus)
   * @returns {Roll} The damage roll (or null if no damage dice)
   */
  static async rollSpellDamage(actor, spell, spellState, isCritical = false, statKey = null, targetsAtRollTime = []) {
    // Allow typeless damage ("-") - only skip if there are no damage dice at all
    if (!spellState.damageDice || spellState.damageDice <= 0) return null;

    return VagabondDamagePipeline.rollDamage({
      actor,
      item: spell,
      baseFormula: `${spellState.damageDice}d${this.spellDieSize(actor, spell)}`,
      sourceType: 'spell',
      damageType: spell.system.damageType,
      isCritical,
      statKey,
      targets: targetsAtRollTime,
    });
  }

  /**
   * Create an NPC damage button (flat or roll). `.owner-only`: the chat render hook keeps it
   * for the GM and for players who own the NPC (e.g. Undead raised by the Raise Spell).
   * @param {string} actorId - NPC actor ID
   * @param {number} actionIndex - Index of the action in the actions array
   * @param {string} damageValue - Flat damage value or roll formula
   * @param {string} damageMode - 'flat' or 'roll'
   * @param {string} damageType - Type of damage
   * @param {string} damageTypeLabel - Localized damage type label
   * @param {string} attackType - Attack type ('melee', 'ranged', 'cast')
   * @returns {string} HTML button string
   */
  static createNPCDamageButton(actorId, actionIndex, damageValue, damageMode, damageType, damageTypeLabel, attackType = 'melee', targetsAtRollTime = []) {
    const isFlat = damageMode === 'flat';
    const icon = isFlat ? 'fa-hashtag' : 'fa-dice-d20';
    const label = isFlat ? `Apply ${damageValue} Damage` : `Roll ${damageValue} Damage`;
    const targetsJson = JSON.stringify(targetsAtRollTime).replace(/"/g, '&quot;');

    return `
      <button
        class="vagabond-npc-damage-button owner-only"
        data-actor-id="${actorId}"
        data-action-index="${actionIndex}"
        data-damage-value="${damageValue}"
        data-damage-mode="${damageMode}"
        data-damage-type="${damageType}"
        data-damage-type-label="${damageTypeLabel}"
        data-attack-type="${attackType}"
        data-targets="${targetsJson}"
      >
        <i class="fas ${icon}"></i> ${label}
      </button>
    `;
  }

  /**
   * Create a damage button for item usage (healing potions, bombs, etc)
   * @param {string} actorId - Actor ID using the item
   * @param {string} itemId - Item ID being used
   * @param {string} damageAmount - Damage formula or flat amount
   * @param {string} damageType - Damage type key
   * @param {string} damageTypeLabel - Localized damage type label
   * @param {string} attackType - Attack type ('melee', 'ranged', 'none')
   * @param {Array} targetsAtRollTime - Targets captured at use time
   * @returns {string} HTML button string
   */
  static createItemDamageButton(actorId, itemId, damageAmount, damageType, damageTypeLabel, attackType = 'melee', targetsAtRollTime = []) {
    const targetsJson = JSON.stringify(targetsAtRollTime).replace(/"/g, '&quot;');

    // Check if it's a restorative effect
    const restorativeResource = VagabondDamagePipeline.getRestorativeResource(damageType);

    // Determine icon and label
    let icon, label;
    if (restorativeResource) {
      if (restorativeResource === 'hp') {
        icon = 'fa-heart';
        label = `Apply ${damageAmount} Healing`;
      } else if (restorativeResource === 'fatigue') {
        icon = 'fa-spa';
        label = `Recover ${damageAmount} Fatigue`;
      } else {
        icon = 'fa-bolt';
        label = `Recharge ${damageAmount} Mana`;
      }
    } else {
      // Check if it's a formula or flat damage
      const isFormula = /d\d+/i.test(damageAmount);
      icon = isFormula ? 'fa-dice-d20' : 'fa-hashtag';
      label = isFormula ? `Roll ${damageAmount} Damage` : `Apply ${damageAmount} Damage`;
    }

    return `
      <button
        class="vagabond-item-damage-button"
        data-actor-id="${actorId}"
        data-item-id="${itemId}"
        data-damage-amount="${damageAmount}"
        data-damage-type="${damageType}"
        data-damage-type-label="${damageTypeLabel}"
        data-attack-type="${attackType}"
        data-targets="${targetsJson}"
      >
        <i class="fas ${icon}"></i> ${label}
      </button>
    `;
  }

  /**
   * Post a new chat message with NPC action damage
   * @param {Roll} damageRoll - The damage roll (or null for flat damage)
   * @param {number} finalDamage - The final damage amount
   * @param {string} damageTypeLabel - Localized damage type label
   * @param {Actor} actor - The NPC actor
   * @param {Object} action - The action object
   * @param {string} damageTypeKey - The damage type key for icon lookup (optional)
   * @param {string} attackType - The attack type ('melee', 'ranged', 'cast')
   */

  /**
   * Create an apply button for a RESTORATIVE result (healing/recover/recharge).
   * Only called for restorative damage types — harmful damage goes through
   * save buttons / Apply Direct instead.
   * @param {number} damageAmount - The amount to restore
   * @param {string} damageType - Restorative damage type KEY (not the localized label)
   * @param {string} actorId - Source actor ID
   * @param {string} itemId - Item ID (optional)
   * @param {number[]} [dieValues=[]] - Rolled die values (Sickened: -N per healing die received)
   * @returns {string} HTML button string
   */
  static createApplyDamageButton(damageAmount, damageType, actorId, itemId = null, targetsAtRollTime = [], actionIndex = null, dieValues = []) {
    const resource = VagabondDamagePipeline.getRestorativeResource(damageType);
    let icon, text, buttonClass;

    if (resource === 'fatigue') {
      icon = 'fa-arrows-rotate';
      text = `Recover ${damageAmount} Fatigue`;
      buttonClass = 'vagabond-apply-recover-button';
    } else if (resource === 'mana') {
      icon = 'fa-bolt';
      text = `Restore ${damageAmount} Mana`;
      buttonClass = 'vagabond-apply-recharge-button';
    } else {
      // 'hp' and any unrecognized restorative default to the healing button
      icon = 'fa-heart-pulse';
      text = `Apply ${damageAmount} Healing`;
      buttonClass = 'vagabond-apply-healing-button';
    }

    const targetsJson = JSON.stringify(targetsAtRollTime).replace(/"/g, '&quot;');

    return `
      <button
        class="${buttonClass}"
        data-damage-amount="${damageAmount}"
        data-damage-type="${damageType}"
        data-actor-id="${actorId}"
        data-item-id="${itemId || ''}"
        data-action-index="${actionIndex ?? ''}"
        data-die-values="${(dieValues ?? []).join(',')}"
        data-targets="${targetsJson}"
      >
        <i class="fas ${icon}"></i> ${text}
      </button>
    `;
  }

  /**
   * Create "Apply to Target" button for save result cards
   * @param {string} actorId - The actor who rolled the save (damage applies to them)
   * @param {string} actorName - The actor's name for display
   * @param {number} finalDamage - Final damage amount (after save/armor/immunities)
   * @param {string} damageType - Type of damage
   * @returns {string} HTML button string
   */
  static createApplySaveDamageButton(actorId, actorName, finalDamage, damageType, statusContext = null, critNormalDamage = null) {
    // statusContext carries everything needed to process on-hit statuses at apply-time
    // { sourceActorId, sourceItemId, sourceActionIndex, saveType, saveSuccess, saveDifficulty, saveTotal, attackWasCrit, spellCast }
    const sc = statusContext;
    const statusAttrs = sc ? `
          data-source-actor-id="${sc.sourceActorId || ''}"
          data-source-item-id="${sc.sourceItemId || ''}"
          data-source-action-index="${sc.sourceActionIndex ?? ''}"
          data-save-type="${sc.saveType}"
          data-save-success="${sc.saveSuccess}"
          data-save-difficulty="${sc.saveDifficulty}"
          data-save-total="${sc.saveTotal}"
          data-attack-was-crit="${sc.attackWasCrit}"${this.spellCastAttrs(sc.spellCast)}` : '';
    // critNormalDamage: when set, this is a crit save apply button.
    // data-damage-crit = 0 (benefit claimed), data-damage-normal = save-reduced value (Luck kept)
    const critAttrs = critNormalDamage !== null
      ? ` data-damage-crit="0" data-damage-normal="${critNormalDamage}"`
      : '';
    return `
      <div class="save-apply-button-container${critNormalDamage !== null ? ' crit-save-apply-wrapper' : ''}">
        <button
          class="vagabond-apply-save-damage-button"
          data-actor-id="${actorId}"
          data-actor-name="${actorName}"
          data-damage-amount="${finalDamage}"
          data-damage-type="${damageType}"${statusAttrs}${critAttrs}
        >
          <i class="fas fa-burst"></i> Apply ${finalDamage} to ${actorName}
        </button>
      </div>
    `;
  }

  /**
   * Calculate final damage per RAW rules: Armor/Immune/Weak
   *
   * RAW Rules:
   * - Armor: Subtracted from Attack damage (physical types only)
   * - Immune: Unharmed by the damage type (take 0 damage)
   * - Weak: Ignores Armor and Immune, deals extra damage die (extra die handled at roll time)
   * - Typeless ("-"): Treated as generic damage, applies armor but no special immunities/weaknesses
   *
   * @param {Actor} actor - The target actor
   * @param {number} damage - Base damage amount
   * @param {string} damageType - Type of damage (or "-" for typeless)
   * @param {Item} attackingWeapon - The weapon used (optional, for material weakness checks)
   * @returns {number} Final damage amount
   */
  /**
   * Count the total number of dice in a formula string (e.g. "2d8 + 1d4" → 3).
   * @param {string} formula
   * @returns {number}
   */
  static _countDiceInFormula(formula) {
    let total = 0;
    const regex = /(\d*)d\d+/gi;
    let match;
    while ((match = regex.exec(String(formula || ''))) !== null) {
      total += match[1] ? parseInt(match[1]) : 1;
    }
    return total;
  }

  /**
   * Apply the target's defenses to an incoming damage amount, returning only the number.
   * Back-compat wrapper around calculateFinalDamageDetailed.
   */
  static calculateFinalDamage(actor, damage, damageType, attackingWeapon = null, opts = {}) {
    return this.calculateFinalDamageDetailed(actor, damage, damageType, attackingWeapon, opts).final;
  }

  /**
   * Apply the target's defenses to an incoming damage amount, with a full breakdown.
   * Order: typeless(armor only) → material weakness(bypass all) → weakness(bypass all)
   * → immunity(0) → resistance(half, round down) → armor → berserk reduction.
   *
   * The mutable-context hook `vagabond.calculateFinalDamage` fires after the math with
   * `{ actor, damage, damageType, attackingWeapon, result }` — mutate `result.final`
   * to adjust the outcome.
   *
   * @param {Actor} actor - The defending actor
   * @param {number} damage - Incoming damage after save reduction
   * @param {string} damageType - Damage type key ('-' for typeless)
   * @param {Item|null} attackingWeapon - For material weakness + berserk die count
   * @param {object} [opts]
   * @param {Actor|null} [opts.attackerActor=null] - The attacker (Beast Mode: ignore non-Relic Immune)
   * @param {number|null} [opts.rolledDiceCount=null] - Actual dice count of the damage
   *   roll (explosions included) for the berserk reduction; falls back to counting the
   *   weapon's authored damageAmount formula when absent
   * @returns {{final: number, armorReduction: number, berserkReduction: number, resistReduction?: number,
   *   path: 'typeless'|'material'|'weak'|'immune'|'normal'}}
   */
  static calculateFinalDamageDetailed(actor, damage, damageType, attackingWeapon = null, opts = {}) {
    const result = this._computeFinalDamage(actor, damage, damageType, attackingWeapon, opts);
    if (damage > 0 && !opts.skipHexBonus) {
      result.widdershinsBonus = FeatureRules.sum('damageBonusVs', opts.attackerActor ?? attackingWeapon?.actor ?? null, actor, attackingWeapon);
    }
    Hooks.callAll('vagabond.calculateFinalDamage', { actor, damage, damageType, attackingWeapon, attackerActor: opts.attackerActor ?? null, isCrit: !!opts.isCrit, result });
    result.final = Math.max(0, result.final);
    return result;
  }

  static _computeFinalDamage(actor, damage, damageType, attackingWeapon = null, opts = {}) {
    // Flanked: flat damage bonus applied before Armor/Immune/Weak math (RAW: "takes
    // an extra 2 damage from attacks" — Casts included). Single choke point — every
    // damage-application path (save, Apply Direct, NPC damage, Shield reduction) routes here.
    let flankedBonus = 0;
    if (damage > 0 && actor.statuses?.has('flanked')) {
      flankedBonus = CONFIG.VAGABOND?.homebrew?.derivations?.flankedDamageBonus ?? 2;
      damage += flankedBonus;
    }

    // Witch Widdershins: the witch's Spell damage against her hexed Target is increased (before Armor/Immune/Weak).
    // Soul Link's pass-on damage is not a new Spell effect, so it skips the bonus.
    let widdershinsBonus = 0;
    if (damage > 0 && !opts.skipHexBonus) {
      widdershinsBonus = FeatureRules.sum('damageBonusVs', opts.attackerActor ?? attackingWeapon?.actor ?? null, actor, attackingWeapon);
      damage += widdershinsBonus;
    }

    // Normalize damage type for lookup
    const normalizedType = damageType.toLowerCase();

    // Handle typeless damage ("-") - just apply armor, skip immunities/weaknesses
    if (normalizedType === '-') {
      const armorRating = actor.system.armor || 0;
      const final = Math.max(0, damage - armorRating);
      return { final, armorReduction: damage - final, berserkReduction: 0, flankedBonus, path: 'typeless' };
    }

    // Get immunities and weaknesses arrays (for NPCs and from equipped armor)
    let immunities = NpcRules.immunitiesOf(actor);
    const weaknesses = actor.system.weaknesses || [];

    // For PCs, also check equipped armor for immunities
    if (actor.type === 'character') {
      const equippedArmor = EquipmentHelper.getWornArmor(actor);

      if (equippedArmor && equippedArmor.system.immunities) {
        // Combine actor immunities with armor immunities
        immunities = [...immunities, ...equippedArmor.system.immunities];
      }
    }

    // Start with base damage
    let finalDamage = damage;

    // Weapon-based weakness (Cold Iron, Silver, Adamant, axes)
    if (VagabondDamagePipeline.weaponTriggersWeakness(attackingWeapon, weaknesses)) {
      // Material weakness: Ignore armor and immunities, damage goes through
      return { final: finalDamage, armorReduction: 0, berserkReduction: 0, flankedBonus, path: 'material' };
    }

    // RAW: Weak - Ignores Armor and Immune, and deals an extra damage die
    // (Extra die is handled at roll/apply time, not here — armor/immunity just bypassed.
    //  Weak targets also skip the berserk reduction: weakness bypasses all reductions.)
    if (VagabondDamagePipeline.typeListCovers(weaknesses, normalizedType) || FeatureRules.any('weakTo', opts.attackerActor, actor)) {
      return { final: finalDamage, armorReduction: 0, berserkReduction: 0, flankedBonus, path: 'weak' };
    }

    // RAW: Immune - Unharmed by the damage type (Beast Mode attacks ignore non-Relic Immune)
    if (VagabondDamagePipeline.typeListCovers(immunities, normalizedType) && !FeatureRules.any('ignoresImmune', opts.attackerActor, normalizedType)
      && !NpcRules.relicBypassesImmunity(actor, normalizedType, attackingWeapon)) {
      return { final: 0, armorReduction: 0, berserkReduction: 0, flankedBonus: 0, path: 'immune' };
    }

    // Resistant (`system.damageResistances`, e.g. Draken Draconic Resilience): half damage, round down, before Armor
    let resistReduction = 0;
    if (VagabondDamagePipeline.typeListCovers(actor.system.damageResistances ?? [], normalizedType)) {
      resistReduction = finalDamage - Math.floor(finalDamage / 2);
      finalDamage -= resistReduction;
    }

    // RAW: Armor - Subtracted from ALL incoming damage
    // Armor always reduces damage unless target is immune or weak
    const armorRating = actor.system.armor || 0;
    const afterArmor = Math.max(0, finalDamage - armorRating);
    const armorReduction = finalDamage - afterArmor;
    finalDamage = afterArmor;

    // Per-die reduction (Barbarian Rage / Rip and Tear). Conditions (Berserk, armor
    // weight…) live in the AE formulas that feed `incomingDamageReductionPerDie`
    // (e.g. `@statuses.berserk`, `@armorWorn.slots <= 1`) — not here — so the rule is
    // reusable and a table can disable it by switching the effect off.
    // Dice count prefers the ACTUAL rolled dice count (threaded from the damage roll,
    // explosions included) over counting the weapon's authored formula.
    let berserkReduction = 0;
    // Typed reduction (Druid Tempest Within) stacks on the untyped one for matching damage types.
    const reductionPerDie = (actor.system.incomingDamageReductionPerDie || 0)
      + (actor.system.incomingDamageReductionPerDieByType?.[normalizedType] || 0);
    if (reductionPerDie > 0) {
      const numDice = opts.rolledDiceCount
        ?? VagabondDamageHelper._countDiceInFormula(attackingWeapon?.system?.damageAmount ?? '');
      if (numDice > 0) {
        const afterBerserk = Math.max(0, finalDamage - reductionPerDie * numDice);
        berserkReduction = finalDamage - afterBerserk;
        finalDamage = afterBerserk;
      }
    }

    return { final: finalDamage, armorReduction, berserkReduction, resistReduction, flankedBonus, path: 'normal' };
  }


  /**
   * Create defend options accordion HTML
   * @returns {string} HTML string
   */
  static createDefendOptions() {
    return `
      <div class="defend-info-box">
        <div class="defend-header">
          <i class="fas fa-circle-info"></i>
          <span>${game.i18n.localize('VAGABOND.DefendMechanics.DefendingTitle')}</span>
          <i class="fas fa-chevron-down expand-icon"></i>
        </div>
        <div class="defend-content">
          <p>
            <strong>${game.i18n.localize('VAGABOND.DefendMechanics.ReflexTitle')}:</strong>
            ${game.i18n.localize('VAGABOND.DefendMechanics.ReflexDescription')}
          </p>
          <p>
            <strong>${game.i18n.localize('VAGABOND.DefendMechanics.DefenseTitle')}:</strong>
            ${game.i18n.localize('VAGABOND.DefendMechanics.DefenseDescription')}
          </p>
          <p>
            <strong>${game.i18n.localize('VAGABOND.DefendMechanics.CritTitle')}:</strong>
            ${game.i18n.localize('VAGABOND.DefendMechanics.CritDescription')}
          </p>
        </div>
      </div>
    `;
  }

  /**
   * The configured saves in display order: [{key, label, icon}].
   * Reads the homebrew saves array so renamed, re-iconed, added, or removed
   * saves propagate to every chat button; falls back to the classic triple pre-init.
   * @returns {Array<{key: string, label: string, icon: string}>}
   */
  static getConfiguredSaves() {
    const homebrewSaves = CONFIG.VAGABOND?.homebrew?.saves;
    if (homebrewSaves?.length) {
      return homebrewSaves.map(s => ({
        key: s.key,
        label: CONFIG.VAGABOND.saves?.[s.key] || s.label || s.key,
        icon: CONFIG.VAGABOND.saveIcons?.[s.key] || s.icon || 'fa-solid fa-shield',
      }));
    }
    // Pre-init fallback: classic triple
    return [
      { key: 'reflex', label: game.i18n?.localize('VAGABOND.Saves.Reflex.name') ?? 'Reflex', icon: 'fas fa-running' },
      { key: 'endure', label: game.i18n?.localize('VAGABOND.Saves.Endure.name') ?? 'Endure', icon: 'fas fa-hand-fist' },
      { key: 'will',   label: game.i18n?.localize('VAGABOND.Saves.Will.name') ?? 'Will',     icon: 'fas fa-brain' },
    ];
  }

  /**
   * Create save reminder buttons (no damage, just roll saves)
   * Buttons are built from the configured homebrew saves — one per save, in config order.
   * @param {string} attackType - Attack type for hinder calculation ('melee', 'ranged', 'cast')
   * @param {Array} targetsAtRollTime - Targets captured at roll time
   * @returns {string} HTML string
   */
  static createSaveReminderButtons(attackType = 'melee', targetsAtRollTime = [], actorId = '', itemId = '', actionIndex = null, statusSaveTypes = new Set()) {
    if (this.targetsAreAllNpc(targetsAtRollTime)) return '';

    const targetsJson = JSON.stringify(targetsAtRollTime).replace(/"/g, '&quot;');

    const buttons = this.getConfiguredSaves().map(save => {
      // Red tint when this save is required to resist an on-hit status
      const statusClass = statusSaveTypes.has(save.key) ? ' save-has-status' : '';
      return `
            <button class="vagabond-save-reminder-button save-${save.key}${statusClass}"
              data-save-type="${save.key}"
              data-attack-type="${attackType}"
              data-actor-id="${actorId}"
              data-item-id="${itemId || ''}"
              data-action-index="${actionIndex ?? ''}"
              data-targets="${targetsJson}">
              <i class="${save.icon}"></i> ${save.label}
            </button>`;
    }).join('');

    return `
      <div class="vagabond-save-buttons-container" style="--save-cols:${this._saveColumns()}">
        <div class="save-buttons-row">${buttons}
        </div>
      </div>
    `;
  }

  /**
   * True when every stored target resolves to an NPC actor. Saves and Defense are a
   * player-side choice, so cards aimed only at NPCs offer Apply Direct alone.
   * Unresolvable targets or an empty list return false (keep the full button set).
   * Resolves quietly — no "token not found" warnings, unlike _resolveStoredTargets.
   * @param {Array<Object>} storedTargets - Stored target data (TargetHelper shape)
   * @returns {boolean}
   */
  static targetsAreAllNpc(storedTargets) {
    if (!storedTargets?.length) return false;
    return storedTargets.every(t => {
      const actor = canvas.tokens?.get(t.tokenId)?.actor ?? game.actors.get(t.actorId);
      return actor?.type === 'npc';
    });
  }

  /**
   * Column count for the one-row save grid: one column per configured save,
   * capped at 3 so homebrew setups with many saves wrap instead of crushing labels.
   * @returns {number}
   * @private
   */
  static _saveColumns() {
    const n = this.getConfiguredSaves().length;
    return Math.max(1, n > 4 ? 3 : n);
  }

  /**
   * Create save buttons (Reflex, Endure, Will, Apply Direct)
   */
  static createSaveButtons(damageAmount, damageType, damageRoll, actorId, itemId, attackType, targetsAtRollTime = [], actionIndex = null, attackWasCrit = false, statusSaveTypes = new Set(), critStatBonus = 0, weaknessPreRolled = false) {
    // Encode the damage roll terms
    const rollTermsData = JSON.stringify({
      terms: damageRoll.terms.map(t => {
        if (t.constructor.name === 'Die') {
          return { type: t.constructor.name, faces: t.faces, results: t.results || [] };
        } else if (t.constructor.name === 'NumericTerm') {
          return { type: t.constructor.name, number: t.number };
        } else {
          return { type: t.constructor.name };
        }
      }),
      total: damageRoll.total
    }).replace(/"/g, '&quot;');

    // Encode targets
    const targetsJson = JSON.stringify(targetsAtRollTime).replace(/"/g, '&quot;');

    // FIX: Ensure Apply Direct key exists or fallback to English
    const applyKey = 'VAGABOND.Chat.ApplyDirect';
    let applyDirectLabel = game.i18n.localize(applyKey);
    if (applyDirectLabel === applyKey) applyDirectLabel = "Apply Direct";

    // Crit toggle attrs: when a crit stat bonus is included in damageAmount, store both values
    // so the attack-crit-toggle JS handler can swap data-damage-amount when toggled
    const critAttrs = (critStatBonus > 0 && attackWasCrit)
      ? ` data-damage-crit="${damageAmount}" data-damage-normal="${damageAmount - critStatBonus}"`
      : '';

    // One button per configured homebrew save, in config order
    const saveButtons = this.getConfiguredSaves().map(save => {
      // Red tint when this save is required to resist an on-hit status
      const statusClass = statusSaveTypes.has(save.key) ? ' save-has-status' : '';
      return `
            <button class="vagabond-save-button save-${save.key}${statusClass}"
              data-save-type="${save.key}"
              data-damage-amount="${damageAmount}"
              data-damage-type="${damageType}"
              data-roll-terms="${rollTermsData}"
              data-actor-id="${actorId}"
              data-item-id="${itemId || ''}"
              data-action-index="${actionIndex ?? ''}"
              data-attack-type="${attackType}"
              data-attack-was-crit="${attackWasCrit}"
              data-weakness-pre-rolled="${weaknessPreRolled}"
              data-targets="${targetsJson}"${critAttrs}>
              <i class="${save.icon}"></i> ${save.label}
            </button>`;
    }).join('');

    // Defense shields live in the damage section (see createDefenseShields), not here.
    // Cards aimed only at NPCs offer Apply Direct alone — saves are a player-side choice.
    const npcOnly = this.targetsAreAllNpc(targetsAtRollTime);

    return `
      <div class="vagabond-save-buttons-container" style="--save-cols:${this._saveColumns()}">
        <div class="save-buttons-top">
            <button class="vagabond-apply-direct-button"
              data-damage-amount="${damageAmount}"
              data-damage-type="${damageType}"
              data-actor-id="${actorId}"
              data-item-id="${itemId || ''}"
              data-action-index="${actionIndex ?? ''}"
              data-is-critical="${attackWasCrit}"
              data-weakness-pre-rolled="${weaknessPreRolled}"
              data-targets="${targetsJson}"${critAttrs}>
              <i class="fas fa-burst"></i> ${applyDirectLabel}
            </button>
        </div>
${npcOnly ? '' : `
        <div class="save-buttons-row">${saveButtons}
        </div>`}
      </div>
    `;
  }

  /**
   * Defense shields for a damage card: one shield token per way a target can block
   * (weapon art inside a shield frame). Rendered inside the damage section so the
   * answer to the damage sits beside the number. Empty string when no target holds a
   * Defense weapon or every target is an NPC.
   * Buttons carry the same data-* payload as Apply Direct, so handleDefenseWeapons
   * and the crit toggle (data-damage-crit/normal) treat them like any damage button.
   * @returns {string} HTML ('' when nothing to show)
   */
  static createDefenseShields(damageAmount, damageType, actorId, itemId, targetsAtRollTime, actionIndex = null, attackWasCrit = false, critStatBonus = 0, weaknessPreRolled = false, attackType = 'melee') {
    if (!targetsAtRollTime?.length || this.targetsAreAllNpc(targetsAtRollTime)) return '';
    const targetsJson = JSON.stringify(targetsAtRollTime).replace(/"/g, '&quot;');
    const critAttrs = (critStatBonus > 0 && attackWasCrit)
      ? ` data-damage-crit="${damageAmount}" data-damage-normal="${damageAmount - critStatBonus}"`
      : '';
    return this._buildDefenseRow(targetsAtRollTime, `
              data-damage-amount="${damageAmount}"
              data-damage-type="${damageType}"
              data-actor-id="${actorId}"
              data-item-id="${itemId || ''}"
              data-action-index="${actionIndex ?? ''}"
              data-attack-was-crit="${attackWasCrit}"
              data-weakness-pre-rolled="${weaknessPreRolled}"
              data-attack-type="${attackType}"
              data-targets="${targetsJson}"${critAttrs}`);
  }

  /**
   * Build the Defense button row. Empty string when no target has a Defense weapon
   * (own property or Patience — `DefenseHelper.defenseWeapons`) or Reflex is not a
   * configured Save. One button per weapon: the clicked weapon makes the Attack Check;
   * the reduction uses every Defense weapon (see DefenseHelper.reductionWeapons).
   * Buttons carry `data-defense-slot` (1-based index), never item ids, so every target
   * resolves its OWN weapons at click time. Art comes from the target holding the most.
   * @param {Array<Object>} targetsAtRollTime - Stored target data (TargetHelper shape)
   * @param {string} sharedAttrs - data-* attribute string shared by every button
   * @returns {string}
   * @private
   */
  static _buildDefenseRow(targetsAtRollTime, sharedAttrs) {
    if (!targetsAtRollTime?.length) return '';
    if (!this.getConfiguredSaves().some(s => s.key === 'reflex')) return '';
    const tokens = this._resolveStoredTargets(targetsAtRollTime);

    let best = null; // Defense weapons of the target with the most
    for (const t of tokens) {
      if (!t.actor) continue;
      const weapons = DefenseHelper.defenseWeapons(t.actor);
      if (weapons.length && (!best || weapons.length > best.length)) best = weapons;
    }
    if (!best) return '';

    const esc = (s) => foundry.utils.escapeHTML?.(s) ?? s;
    // Weapon art inside a shield-shaped mask (CSS). `title` carries the weapon name.
    const imgSrc = (weapon) => esc(encodeURI(weapon.img || 'icons/svg/sword.svg').replace(/'/g, '%27'));
    const defenseLabel = game.i18n.localize('VAGABOND.Chat.DefenseCheck');
    const buttons = best.map((w, i) => `
            <button class="vagabond-defense-button" data-defense-slot="${i + 1}" title="${esc(`${defenseLabel}: ${w.name}`)}"${sharedAttrs}><span class="defense-shield"><img src="${imgSrc(w)}" alt="${esc(w.name)}" draggable="false"></span></button>`).join('');

    return `
          <div class="defense-buttons-row">${buttons}
          </div>`;
  }

  /**
   * Handle save button click - roll saves for each targeted token
   * @param {HTMLElement} button - The clicked save button
   * @param {Event} event - The click event (for keyboard modifiers)
   */
  /**
   * The Item a chat-card button's `itemId` refers to. Live lookup first; if the
   * item was consumed on use (last charge, a Mix), rebuild it — unsaved, same id
   * and parent — from the `itemSnapshot` its card stored (VagabondChatCard#send),
   * so its on-hit statuses and damage modifiers still apply. Read-only: never
   * `update()` the returned item unless `sourceItem.actor?.items.has(id)`.
   * @param {Actor|null} sourceActor
   * @param {string} itemId
   * @returns {Item|null}
   */
  static _resolveSourceItem(sourceActor, itemId) {
    if (!sourceActor || !itemId) return null;
    const live = sourceActor.items.get(itemId);
    if (live) return live;
    const message = game.messages.contents.findLast(m => m.flags?.vagabond?.itemSnapshot?._id === itemId);
    const data = message?.flags.vagabond.itemSnapshot;
    return data ? new CONFIG.Item.documentClass(data, { parent: sourceActor }) : null;
  }

  // ---------------------------------------------------------------------------
  // Spell Damage / Effect split
  // ---------------------------------------------------------------------------
  //
  // Book: a Spell is Cast to deal damage, for its Effect, or both (both = +1 Mana; the Cast
  // dialog's Fx toggle = `useFx` in SpellHandler state). A Spell's on-hit statuses
  // (`causedStatuses` / `critCausedStatuses`) ARE its Effect, so (user ruling 2026-10-11):
  //   - Damage-only Cast  → the Spell's own statuses never apply (Burn cast for damage ≠ Burning).
  //   - Effect in the Cast → they apply whether or not Armor soaks the damage — the Effect is not
  //     damage. So `requiresDamage: true` on a SPELL entry no longer means "damage got through":
  //     it means "only if the Cast ALSO included damage" (Goop: "If also Cast to deal damage,
  //     those in the area are Burning"). The flag is cleared on the returned copies, so
  //     StatusHelper.applyStatus never skips a Spell entry for blocked damage.
  //   - Effect-only Cast  → no damage card exists, so the cast card itself carries Apply Effect +
  //     Save buttons (`createSpellEffectButtons`), as do effect-only Glyph / Imbue deliveries.
  //
  // `spellCast` = { effect, damage } = what ONE Cast included (`spellCastContext`). It rides the
  // cast card and every damage card made from it as `flags.vagabond.spellCast` (createActionCard
  // param), and the deferred Apply button of a Save card as `data-spell-effect/-damage`
  // (statusContext). Handlers read it with `spellCastFromButton`.
  // `spellCast === null` (cards posted before this rule, macro-made cards) = legacy behavior:
  // entries apply as authored, `requiresDamage` = damage got through.
  //
  // NOT touched: weapon coatings and equipped-item passives (not the Spell's Effect); NPC
  // actions and weapons (`requiresDamage` keeps its "If Hit" meaning there).
  // Rulings to revisit if the table disagrees:
  //   - Crit entries count as part of the Effect (crit text modifies it — Burn "Cd4 instead
  //     starts at a Cd6"), so a damage-only Crit applies none of them (Light's crit Blinded too).
  //   - Spells whose hit macro applies the status (Color, Confuse, Zap, Hold…) get no Apply
  //     Effect button — the macro button already is the Effect.

  /**
   * What a Spell Cast included, from the Cast state.
   * @param {Item} spell
   * @param {{damageDice?: number, useFx?: boolean}} state - SpellHandler / glyph / imbue cast state
   * @returns {{effect: boolean, damage: boolean}|null} null when not a Spell
   */
  static spellCastContext(spell, state) {
    if (spell?.type !== 'spell' || !state) return null;
    return {
      effect: !!state.useFx,
      // Dice-scaling dice (Hold's extra Levels) and typeless Spells are not damage
      damage: spell.system.damageType !== '-' && !spell.system.usesDiceScaling && (state.damageDice ?? 0) > 0,
      // The Cast is held by the Focus: its Effect statuses end with it (FocusLink)
      held: !!state.focusHeld,
    };
  }

  /**
   * Mark a Spell's own Effect entries of a Focus-held Cast with `focusLink` (the stamp StatusHelper.applyStatus
   * puts on the status effect, so it ends with the Focus). Coatings / passives are never passed here.
   * @param {Array} entries - gated Spell entries
   * @param {Actor|null} caster
   * @param {Item} spell
   * @param {{held?: boolean}|null} spellCast
   */
  static focusLinkEntries(entries, caster, spell, spellCast) {
    if (!spellCast?.held || !caster || spell?.type !== 'spell' || !entries?.length) return entries ?? [];
    const focusLink = FocusLink.stamp(caster, spell, true);
    return entries.map(e => ({ ...e, focusLink }));
  }

  /**
   * Read the Cast context for a clicked chat button: its own data attrs (deferred Apply button
   * of a Save card), else the flags of the message it sits in (cast card / damage card).
   * @param {HTMLElement} button
   * @returns {{effect: boolean, damage: boolean}|null}
   */
  static spellCastFromButton(button) {
    const ds = button?.dataset ?? {};
    if (ds.spellEffect !== undefined && ds.spellEffect !== '') {
      return { effect: ds.spellEffect === 'true', damage: ds.spellDamage === 'true', held: ds.spellHeld === 'true' };
    }
    const msgId = button?.closest?.('[data-message-id]')?.dataset.messageId;
    return game.messages.get(msgId)?.flags?.vagabond?.spellCast ?? null;
  }

  /**
   * Data attributes carrying a Cast context across cards (Save card → its Apply button).
   * @param {{effect: boolean, damage: boolean}|null} spellCast
   * @returns {string}
   */
  static spellCastAttrs(spellCast) {
    return spellCast ? ` data-spell-effect="${!!spellCast.effect}" data-spell-damage="${!!spellCast.damage}" data-spell-held="${!!spellCast.held}"` : '';
  }

  /**
   * Gate a Spell's own status entries by what the Cast included (rules above).
   * @param {Array} entries - the Spell's causedStatuses or critCausedStatuses
   * @param {{effect: boolean, damage: boolean}|null} spellCast
   * @returns {Array} entries that apply (copies, `requiresDamage` cleared), or the input when unknown
   */
  static gateSpellEffectEntries(entries, spellCast) {
    if (!spellCast || !entries?.length) return entries ?? [];
    if (!spellCast.effect) return [];
    return entries
      .filter(e => !e.requiresDamage || spellCast.damage)
      .map(e => ({ ...e, requiresDamage: false }));
  }

  /**
   * The Spell's own Effect statuses for one Cast: gated entries, crit entries replacing
   * same-statusId normal ones. No coating / passives — those ride hits, not the Effect.
   * @returns {Array}
   */
  static _spellEffectEntries(spell, spellCast, isCritical = false, caster = null) {
    const own = this.gateSpellEffectEntries(spell?.system?.causedStatuses ?? [], spellCast);
    const crit = isCritical ? this.gateSpellEffectEntries(spell?.system?.critCausedStatuses ?? [], spellCast) : [];
    const entries = [...crit, ...own.filter(e => !crit.some(c => c.statusId === e.statusId))].filter(e => e.statusId);
    return this.focusLinkEntries(entries, caster, spell, spellCast);
  }

  /**
   * Effect-only Cast (no damage card to carry the statuses): an Apply Effect button (every
   * Effect status, no Saves — the table's call, like Apply Direct) plus the Save row for PC
   * Targets when an entry allows a Save (handled by handleSaveReminderRoll, which reads the
   * card's spellCast flag). Also used by effect-only Glyph triggers and Imbue deliveries.
   * Returns '' when the Cast includes damage (the damage card carries the statuses), has no
   * Effect, has no Effect statuses, or the Spell's hit macro already applies its Effect
   * (Color, Confuse, Fade, Zap, Hold… — the macro button IS the Effect there).
   * @param {Actor} actor - caster
   * @param {Item} spell
   * @param {{effect: boolean, damage: boolean}|null} spellCast
   * @param {{isCritical?: boolean, targetsAtRollTime?: Array, attackType?: string}} [opts]
   * @returns {string} HTML
   */
  static createSpellEffectButtons(actor, spell, spellCast, { isCritical = false, targetsAtRollTime = [], attackType = 'cast' } = {}) {
    if (spell?.type !== 'spell' || !spellCast?.effect || spellCast.damage) return '';
    const hit = spell.system.hitMacro;
    if (hit?.enabled && (String(hit.command ?? '').trim() || hit.uuid)) return '';
    const entries = this._spellEffectEntries(spell, spellCast, isCritical);
    if (!entries.length) return '';

    const esc = (s) => foundry.utils.escapeHTML?.(s) ?? s;
    const names = [...new Set(entries.map(e =>
      game.i18n.localize(CONFIG.VAGABOND?.statusConditions?.[e.statusId] ?? e.statusId)))].join(', ');
    const targetsJson = JSON.stringify(targetsAtRollTime).replace(/"/g, '&quot;');
    const applyBtn = `
      <div class="vagabond-save-buttons-container" style="--save-cols:1">
        <div class="save-buttons-top">
          <button class="vagabond-apply-spell-effect-button"
            title="${esc(game.i18n.format('VAGABOND.Status.ApplyEffectHint', { statuses: names }))}"
            data-actor-id="${actor.uuid}"
            data-item-id="${spell.id}"
            data-is-critical="${!!isCritical}"
            data-targets="${targetsJson}">
            <i class="fas fa-wand-sparkles"></i> ${esc(game.i18n.localize('VAGABOND.Status.ApplyEffect'))}
          </button>
        </div>
      </div>`;

    const saveTypes = new Set(entries.filter(e => e.saveType && e.saveType !== 'none').map(e => e.saveType));
    if (!saveTypes.size) return applyBtn;
    if (saveTypes.has('any')) for (const save of this.getConfiguredSaves()) saveTypes.add(save.key);
    return applyBtn + this.createSaveReminderButtons(attackType, targetsAtRollTime, actor.uuid, spell.id, null, saveTypes);
  }

  /**
   * Collect every on-hit status entry threatening a target from one attack source.
   * Single source of truth for the item/NPC-action fallback, crit-replaces-normal
   * merge, weapon coating, and equipped-item passive gathering.
   *
   * @param {object} opts
   * @param {Actor|null} opts.sourceActor
   * @param {Item|null} [opts.sourceItem=null]
   * @param {number|null} [opts.actionIdx=null] - NPC action index fallback
   * @param {boolean} [opts.attackWasCrit=false] - crit entries REPLACE same-statusId normal entries
   * @param {boolean} [opts.includeCoating=true]
   * @param {{effect: boolean, damage: boolean}|null} [opts.spellCast=null] - what a Spell Cast
   *   included (see "Spell Damage / Effect split" below); null = unknown → entries as authored
   * @returns {{entries: Array, coatingEntries: Array}} entries = merged + coating + passive;
   *   coatingEntries returned separately so callers can clear coating charges after application
   */
  static resolveIncomingStatusEntries({ sourceActor, sourceItem = null, actionIdx = null, attackWasCrit = false, includeCoating = true, spellCast = null }) {
    const action = (actionIdx !== null && !isNaN(actionIdx)) ? sourceActor?.system?.actions?.[actionIdx] : null;
    let normalEntries = sourceItem?.system?.causedStatuses?.length
      ? sourceItem.system.causedStatuses
      : (action?.causedStatuses?.length ? action.causedStatuses : []);
    let critEntries = attackWasCrit
      ? (sourceItem?.system?.critCausedStatuses?.length
          ? sourceItem.system.critCausedStatuses
          : (action?.critCausedStatuses?.length ? action.critCausedStatuses : []))
      : [];
    // A Spell's own statuses are its Effect — gated by what this Cast included
    if (sourceItem?.type === 'spell') {
      normalEntries = this.gateSpellEffectEntries(normalEntries, spellCast);
      critEntries = this.gateSpellEffectEntries(critEntries, spellCast);
    }
    let mergedEntries = attackWasCrit
      ? [...critEntries, ...normalEntries.filter(e => !critEntries.some(c => c.statusId === e.statusId))]
      : normalEntries;
    if (sourceItem?.type === 'spell') mergedEntries = this.focusLinkEntries(mergedEntries, sourceActor, sourceItem, spellCast);
    const coatingEntries = (includeCoating && sourceItem?.system?.coating?.charges > 0)
      ? (sourceItem.system.coating.causedStatuses ?? [])
      : [];
    const passiveEntries = sourceActor
      ? sourceActor.items.filter(i => i.system?.equipped && i.system?.passiveCausedStatuses?.length).flatMap(i => i.system.passiveCausedStatuses)
      : [];
    return { entries: [...mergedEntries, ...coatingEntries, ...passiveEntries], coatingEntries };
  }

  /**
   * Apply damage to an actor (preDamageApply / postDamageApply hooks; socket when not owner).
   * @returns {Promise<number>} the damage actually applied
   */
  static async _applyDamageToActor(actor, amount, damageType, sourceItem = null, attackerActor = null) {
    const ctx = { actor, amount, damageType, sourceItem };
    if (Hooks.call('vagabond.preDamageApply', ctx) === false) return 0;
    const final = Math.max(0, ctx.amount);
    const currentHP = actor.system.health?.value || 0;
    const newHP = Math.max(0, currentHP - final);
    if (actor.isOwner || game.user.isGM) {
      await actor.update({ 'system.health.value': newHP });
    } else {
      GMRelay.send('vagabond.applyDamage', { actorUuid: actor.uuid, newHp: newHP });
    }
    Hooks.callAll('vagabond.postDamageApply', { actor, amount: final, damageType, sourceItem, attackerActor, oldHp: currentHP, newHp: newHP });
    return final;
  }

  /**
   * Protector perk: one button per Close ally who can use their Defense property for
   * `defender` (DefenseHelper.protectorsFor). '' when nobody can.
   * @param {Actor} defender - The Being that failed its Reflex Save
   * @param {{incoming: number, damageType: string, actorId: string, itemId: string, actionIdx: number|null,
   *   attackWasCrit: boolean, priorFinal: number, weakExtra: number, autoApplied: boolean}} ctx
   * @returns {string}
   */
  static createProtectButtons(defender, ctx) {
    const protectors = DefenseHelper.protectorsFor(defender);
    if (!protectors.length) return '';
    const esc = (s) => foundry.utils.escapeHTML?.(s) ?? s;
    const label = game.i18n.localize('VAGABOND.Defense.Protect');
    const buttons = protectors.map(p => `
        <button class="vagabond-protect-button" title="${esc(game.i18n.format('VAGABOND.Defense.ProtectHint', { name: p.name, target: defender.name }))}"
          data-protector-uuid="${p.uuid}" data-defender-uuid="${defender.uuid}"
          data-incoming="${ctx.incoming}" data-damage-type="${ctx.damageType}"
          data-source-actor-id="${ctx.actorId || ''}" data-source-item-id="${ctx.itemId || ''}"
          data-action-index="${ctx.actionIdx ?? ''}" data-attack-was-crit="${!!ctx.attackWasCrit}"
          data-prior-final="${ctx.priorFinal}" data-weak-extra="${ctx.weakExtra || 0}" data-auto-applied="${!!ctx.autoApplied}">
          <i class="fa-solid fa-shield-heart"></i> ${esc(label)}: ${esc(p.name)}
        </button>`).join('');
    return `<div class="protect-buttons-row">${buttons}</div>`;
  }

  /**
   * Feature buttons under a damage card's Save buttons (FeatureRules `damageCardRows`: Ward upcast) —
   * never for restorative damage.
   * @returns {string}
   */
  static createFeatureRows(targetsAtRollTime, damageAmount, damageType) {
    if (VagabondDamagePipeline.isRestorativeDamageType(damageType)) return '';
    return FeatureRules.list('damageCardRows', targetsAtRollTime, damageAmount, damageType).join('');
  }

  /** Id of the chat message holding `button` (null outside a message). */
  static messageIdOf(button) {
    return button?.closest?.('[data-message-id]')?.dataset.messageId ?? null;
  }

  /**
   * Damage taken off before Armor for one Target of a damage card, rolled after that card
   * (FeatureRules `damageReduction`: Ward upcast): `{amount, title}`, amount 0 = none.
   * @param {HTMLElement} button - a button of the damage card
   * @param {string} defenderUuid
   */
  static preArmorReduction(button, defenderUuid) {
    const parts = FeatureRules.list('damageReduction', this.messageIdOf(button), defenderUuid).filter(r => r.amount > 0);
    return { amount: parts.reduce((n, r) => n + r.amount, 0), title: parts.map(r => r.title).join(' + ') };
  }

}
