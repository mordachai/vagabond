import { VagabondDamagePipeline } from './damage-pipeline.mjs';
import { TargetHelper } from './target-helper.mjs';
import { EquipmentHelper } from './equipment-helper.mjs';
import { DruidHelper } from './druid-helper.mjs';
import { HunterHelper } from './hunter-helper.mjs';
import { WitchHelper } from './witch-helper.mjs';
import { DefenseHelper } from './defense-helper.mjs';
import { NpcRules } from './npc-rules.mjs';

/**
 * Universal Damage Helper
 * Apply-time damage logic, save handling, and chat-card buttons.
 * Roll-time primitives live in VagabondDamagePipeline (damage-pipeline.mjs);
 * the private statics below delegate there for backward compatibility.
 */
export class VagabondDamageHelper {
  /** @see VagabondDamagePipeline.manuallyExplodeDice */
  static async _manuallyExplodeDice(roll, explodeValues, maxExplosions = 100) {
    return VagabondDamagePipeline.manuallyExplodeDice(roll, explodeValues, maxExplosions);
  }

  /** @see VagabondDamagePipeline.markWeaknessDie */
  static _markWeaknessDie(roll) {
    return VagabondDamagePipeline.markWeaknessDie(roll);
  }

  /** @see VagabondDamagePipeline.getTargetActorsFromStored */
  static _getTargetActorsFromStored(storedTargets) {
    return VagabondDamagePipeline.getTargetActorsFromStored(storedTargets);
  }

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
   * Manual damage mode: when the attack/cast card carries a Roll Damage button, hold
   * the item/spell FX until that button is clicked (the animation lands with the
   * damage, not the check). Stores the FX payload on the message and returns true;
   * returns false when there is no button (miss, no damage, auto-rolled) so the
   * caller plays the FX immediately.
   * @param {ChatMessage|null} message
   * @param {{kind: 'item'|'spell', thrown?: boolean, deliveryType?: string, deliveryIncrease?: number}} payload
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
    if (!fx) return;
    // A consumed item (thrown alchemical, last dagger) is gone by click time — the
    // card's snapshot still carries its FX config.
    item ??= message.flags.vagabond.itemSnapshot ?? null;
    this._playFx(fx, actor, item, storedTargets, true);
  }

  /**
   * Play item/spell FX now. Fire-and-forget.
   * @param {{kind: 'item'|'spell', thrown?: boolean, deliveryType?: string, deliveryIncrease?: number}} fx
   * @param {Actor} actor
   * @param {Item|object|null} item
   * @param {Array} storedTargets - Target data captured at roll time
   * @param {boolean} isHit
   */
  static _playFx(fx, actor, item, storedTargets, isHit) {
    if (!fx || !item) return;
    const casterToken = actor.token?.object ?? actor.getActiveTokens(true)[0];
    const targets = TargetHelper.resolveTargets(storedTargets);
    if (fx.kind === 'spell') {
      import('./spell-sequencer.mjs').then(({ VagabondSpellSequencer }) => {
        VagabondSpellSequencer.play(item, fx.deliveryType, fx.deliveryIncrease ?? 0, casterToken, targets, { deliveryEnabled: isHit });
      });
    } else {
      import('./item-sequencer.mjs').then(({ VagabondItemSequencer }) => {
        VagabondItemSequencer.play(item, casterToken, targets, isHit, { thrown: !!fx.thrown });
      });
    }
  }

  /**
   * Replayed cards (Luck reroll, Force Crit): defer the FX to the card's Roll Damage
   * button on a hit, otherwise play it right away.
   */
  static async playFxOrDefer(message, fx, actor, item, storedTargets, isHit) {
    if (isHit && await this.deferFxToDamageButton(message, fx)) return;
    this._playFx(fx, actor, item, storedTargets, isHit);
  }

  /**
   * Roll damage from a chat message button and update the card in-place
   * @param {HTMLElement} button - The clicked button element
   * @param {string} messageId - The chat message ID
   */
  static async rollDamageFromButton(button, messageId) {
    const actorId = button.dataset.actorId;
    const itemId = button.dataset.itemId;
    const damageFormula = button.dataset.damageFormula;
    const context = JSON.parse(button.dataset.context.replace(/&quot;/g, '"'));

    const actor = TargetHelper.resolveActorRef(actorId);
    if (!actor) {
      ui.notifications.error('Actor not found!');
      return;
    }

    // Security check: only owner or GM can roll
    if (!actor.isOwner && !game.user.isGM) {
      ui.notifications.warn("You don't have permission to roll damage for this actor.");
      return;
    }

    let item = null;
    if (itemId) {
      item = actor.items.get(itemId);
    }

    // Get roll data WITH item effects applied (important for on-use effects)
    const rollData = item ? actor.getRollDataWithItemEffects(item) : actor.getRollData();

    // Determine the pipeline source type from the item (fallback: button context)
    let equipmentType = null;
    if (item) {
      if (item.system.equipmentType) equipmentType = item.system.equipmentType;
      else if (item.type === 'spell') equipmentType = 'spell';
    } else if (context.type) {
      equipmentType = context.type;
    }
    const sourceType = ['weapon', 'spell', 'alchemical'].includes(equipmentType) ? equipmentType : 'generic';

    const storedTargetsForWeak = this._getTargetsFromButton(button);
    const finalDamageTypeKey = context.damageType || null;

    // Attack card's "(Crit)" toggle: benefit on → crit stat bonus rolls; Luck kept → it
    // doesn't (always-on crit dice like Vicious still apply). Rolling locks the toggle so
    // Luck and damage can't disagree afterwards.
    const critCard = button.closest('.attack-crit-toggle');
    const hasCritToggle = !!critCard && button.closest('.content-body') !== null;
    const critBenefitOn = !hasCritToggle || critCard.dataset.critActive !== 'false';
    if (hasCritToggle) critCard.dataset.critLocked = 'true';
    if (!critBenefitOn) {
      context.statKey = null;
      context.critStatBonus = 0;
    }

    // Item/spell FX held back from the check land together with the damage roll
    this._playPendingFx(game.messages.get(messageId), actor, item, storedTargetsForWeak);

    // Unified damage pipeline (die-size bump is pre-baked into damageFormula upstream)
    const { VagabondDamagePipeline } = await import('./damage-pipeline.mjs');
    const damageRoll = await VagabondDamagePipeline.rollDamage({
      actor,
      item,
      baseFormula: damageFormula,
      sourceType,
      damageType: finalDamageTypeKey,
      isCritical: context.isCritical ?? false,
      statKey: context.statKey ?? null,
      rollData,
      targets: storedTargetsForWeak,
      options: { explode: !!item },
    });
    if (!damageRoll) return;

    // Determine damage type
    let damageTypeLabel = 'Physical';

    // For weapons, get damage type from context first, then item
    if (context.type === 'weapon') {
      // Check context first (from button creation)
      let damageTypeKey = context.damageType;

      // Fallback to item damage type if context doesn't have it
      if ((!damageTypeKey || damageTypeKey === '-') && item) {
        // For weapons, use currentDamageType (based on current grip)
        damageTypeKey = item.system.currentDamageType || item.system.damageType;
      }

      if (damageTypeKey && damageTypeKey !== '-') {
        damageTypeLabel = game.i18n.localize(CONFIG.VAGABOND.damageTypes[damageTypeKey]) || damageTypeKey;
      }
    }
    // For spells, get damage type from context
    else if (context.type === 'spell' && context.damageType) {
      const damageTypeKey = context.damageType;
      if (damageTypeKey && damageTypeKey !== '-') {
        damageTypeLabel = game.i18n.localize(CONFIG.VAGABOND.damageTypes[damageTypeKey]) || damageTypeKey;
      }
    }

    // Get attack type from context (defaults to 'melee' if not provided)
    const attackType = context.attackType || 'melee';

    // Recover critStatBonus: prefer stored value, fall back to reading stat from rollData
    const critStatBonus = context.critStatBonus
      || (context.isCritical && context.statKey ? rollData.stats?.[context.statKey]?.value || 0 : 0);

    // Post a SEPARATE damage message instead of updating the attack card
    // This prevents double-rolling issues and matches the save result flow
    await this.postDamageResult(damageRoll, damageTypeLabel, context.isCritical, actor, item, finalDamageTypeKey, attackType, critStatBonus, damageRoll._weaknessPreRolled ?? false, storedTargetsForWeak, hasCritToggle, !critBenefitOn);
  }

  /**
   * Post a separate damage result message with save buttons
   * Uses existing createActionCard() to avoid code duplication
   */
  static async postDamageResult(damageRoll, damageType, isCritical, actor, item, damageTypeKey = null, attackType = 'melee', critStatBonus = 0, weaknessPreRolled = false, targetsAtRollTime = [], critLocked = false, critBenefitOff = false) {
    const { VagabondChatCard } = await import('./chat-card.mjs');

    return await VagabondChatCard.createActionCard({
      actor,
      item,
      title: `${game.i18n.localize('VAGABOND.Roll.DamageRoll')}: ${item?.name || 'Attack'}`,
      damageRoll,
      damageType: damageTypeKey || damageType,
      hasDefenses: !this.isRestorativeDamageType(damageTypeKey || damageType),
      attackType,
      rollData: isCritical ? { isCritical: true, critStatBonus, critLocked, critBenefitOff } : null,
      weaknessPreRolled,
      targetsAtRollTime,
    });
  }

  /** @see VagabondDamagePipeline.getExplodeValues */
  static _getExplodeValues(item, actor = null) {
    return VagabondDamagePipeline.getExplodeValues(item, actor);
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
   * Create a GM-only NPC damage button (flat or roll)
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
        class="vagabond-npc-damage-button gm-only"
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
    const restorativeResource = this.getRestorativeResource(damageType);

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
   * Handle item damage button click
   * @param {HTMLElement} button - The clicked button element
   * @param {string} messageId - The chat message ID
   */
  static async handleItemDamageButton(button, messageId) {
    const actorId = button.dataset.actorId;
    const itemId = button.dataset.itemId;
    const damageAmount = button.dataset.damageAmount;
    const damageType = button.dataset.damageType;
    const damageTypeLabel = button.dataset.damageTypeLabel || damageType;
    const attackType = button.dataset.attackType || 'melee';

    const actor = TargetHelper.resolveActorRef(actorId);
    if (!actor) {
      ui.notifications.error('Actor not found!');
      return;
    }

    const item = actor.items.get(itemId);
    if (!item) {
      ui.notifications.error('Item not found!');
      return;
    }

    // Get targets from button (captured at item use time)
    const targetsAtRollTime = this._getTargetsFromButton(button);

    // Check if it's a formula or flat value
    const isFormula = /d\d+/i.test(damageAmount);
    let damageRoll;
    let finalDamage;

    if (isFormula) {
      // Rolled item damage goes through the unified pipeline
      const itemSourceType = ['weapon', 'spell', 'alchemical'].includes(item.system?.equipmentType)
        ? item.system.equipmentType
        : (item.type === 'spell' ? 'spell' : 'generic');
      damageRoll = await VagabondDamagePipeline.rollDamage({
        actor,
        item,
        baseFormula: damageAmount,
        sourceType: itemSourceType,
        damageType,
        targets: targetsAtRollTime,
      });
      if (!damageRoll) return;
      finalDamage = damageRoll.total;
    } else {
      // Flat damage/healing - authored value stays pure
      finalDamage = parseInt(damageAmount);
      damageRoll = null;
    }

    // Check if it's restorative or harmful
    const isRestorative = this.isRestorativeDamageType(damageType);

    if (isRestorative) {
      // Post restorative effect message
      await this.postItemRestorativeEffect(
        damageRoll,
        finalDamage,
        damageTypeLabel,
        actor,
        item,
        damageType,
        targetsAtRollTime
      );
    } else {
      // Post damage message with save buttons
      await this.postItemDamage(
        damageRoll,
        finalDamage,
        damageTypeLabel,
        actor,
        item,
        damageType,
        attackType,
        targetsAtRollTime
      );
    }
  }

  /**
   * Post a new chat message with item damage
   * @param {Roll} damageRoll - The damage roll (or null for flat damage)
   * @param {number} finalDamage - The final damage amount
   * @param {string} damageTypeLabel - Localized damage type label
   * @param {Actor} actor - The actor using the item
   * @param {Item} item - The item being used
   * @param {string} damageTypeKey - The damage type key for icon lookup
   * @param {string} attackType - The attack type ('melee', 'ranged', 'none')
   * @param {Array} targetsAtRollTime - Targets captured at use time
   */
  static async postItemDamage(damageRoll, finalDamage, damageTypeLabel, actor, item, damageTypeKey = 'physical', attackType = 'melee', targetsAtRollTime = []) {
    // Dynamic Import to avoid circular dependency issues
    const { VagabondChatCard } = await import('./chat-card.mjs');

    // Handle Flat Damage - create dummy Roll object
    let rollObj = damageRoll;
    if (!rollObj) {
      rollObj = new Roll(`${finalDamage}`);
      await rollObj.evaluate();
    }

    // Create damage card with save buttons
    await VagabondChatCard.createActionCard({
      actor: actor,
      item: item,
      title: `${game.i18n.localize('VAGABOND.Roll.DamageRoll')}: ${item.name}`,
      subtitle: actor.name,
      damageRoll: rollObj,
      damageType: damageTypeKey,
      attackType: attackType,
      hasDefenses: true,
      targetsAtRollTime
    });
  }

  /**
   * Post a new chat message with item restorative effect (healing/recover/recharge)
   * @param {Roll} damageRoll - The healing/recovery roll (or null for flat amount)
   * @param {number} finalAmount - The final healing/recovery amount
   * @param {string} damageTypeLabel - Localized effect type label
   * @param {Actor} actor - The actor using the item
   * @param {Item} item - The item being used
   * @param {string} damageTypeKey - The effect type key ('healing', 'recover', 'recharge')
   * @param {Array} targetsAtRollTime - Targets captured at use time
   */
  static async postItemRestorativeEffect(damageRoll, finalAmount, damageTypeLabel, actor, item, damageTypeKey = 'healing', targetsAtRollTime = []) {
    // Dynamic Import to avoid circular dependency issues
    const { VagabondChatCard } = await import('./chat-card.mjs');

    // Handle Flat amount - create dummy Roll object
    let rollObj = damageRoll;
    if (!rollObj) {
      rollObj = new Roll(`${finalAmount}`);
      await rollObj.evaluate();
    }

    // Create restorative effect card with apply button
    await VagabondChatCard.createActionCard({
      actor: actor,
      item: item,
      title: item.name,
      subtitle: actor.name,
      damageRoll: rollObj,
      damageType: damageTypeKey,
      attackType: 'none',
      hasDefenses: false,
      targetsAtRollTime
    });
  }

  /**
   * Handle NPC damage button click (GM reveals damage to players)
   * @param {HTMLElement} button - The clicked button element
   * @param {string} messageId - The chat message ID
   */
  static async handleNPCDamageButton(button, messageId) {
    const actorId = button.dataset.actorId;
    const actionIndex = parseInt(button.dataset.actionIndex);
    const damageValue = button.dataset.damageValue;
    const damageMode = button.dataset.damageMode;
    const damageType = button.dataset.damageType;
    const damageTypeLabel = button.dataset.damageTypeLabel || damageType;
    const attackType = button.dataset.attackType || 'melee';

    const actor = TargetHelper.resolveActorRef(actorId);
    if (!actor) {
      ui.notifications.error('NPC not found!');
      return;
    }

    const action = actor.system.actions[actionIndex] ?? actor.system.abilities?.[actionIndex];
    if (!action) {
      ui.notifications.error('Action not found!');
      return;
    }

    // Get targets from button (captured at action roll time)
    const targetsAtRollTime = this._getTargetsFromButton(button);

    let damageRoll;
    let finalDamage;

    if (damageMode === 'flat') {
      // Flat damage - authored value stays pure, no bonus fields apply (only a Druid's Beast form
      // adds its Savagery bonus, which belongs to the Druid, not the statblock; Frightened still
      // costs its per-die penalty, counted from the action's dice)
      finalDamage = VagabondDamagePipeline.flatDamageAfterDiePenalty(actor,
        parseInt(damageValue) + DruidHelper.beastDamageBonus(actor), action.rollDamage);
      damageRoll = null;
    } else {
      // Rolled damage goes through the unified pipeline: legacy universals +
      // bonusPerDamageDie apply; weapon-linked actions also get the weapon bucket.
      damageRoll = await VagabondDamagePipeline.rollDamage({
        actor,
        actionIndex,
        baseFormula: damageValue,
        sourceType: 'npc',
        damageType,
        targets: targetsAtRollTime,
        weaponLinked: !!action.weaponId,
      });
      if (!damageRoll) return;
      finalDamage = damageRoll.total;
    }

    // Post a new damage message instead of updating the original
    await this.postNPCActionDamage(
      damageRoll,
      finalDamage,
      damageTypeLabel,
      actor,
      action,
      damageType,
      attackType,
      targetsAtRollTime,
      actionIndex
    );
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

    static async postNPCActionDamage(damageRoll, finalDamage, damageTypeLabel, actor, action, damageTypeKey = null, attackType = 'melee', targetsAtRollTime = [], actionIndex = null) {
      // 1. Dynamic Import to avoid circular dependency issues
      const { VagabondChatCard } = await import('./chat-card.mjs');

      // 2. Handle Flat Damage
      // The builder expects a Roll object to extract the total and formula.
      // If this is flat damage (damageRoll is null), we create a dummy Roll object.
      let rollObj = damageRoll;
      if (!rollObj) {
          // Create a roll that is just the number (e.g., "10")
          rollObj = new Roll(`${finalDamage}`);
          await rollObj.evaluate();
      }

      // 3. Delegate to the Master Builder
      // This ensures NPC damage cards use the exact same template (.vagabond-chat-card-v2) as Players.
      await VagabondChatCard.createActionCard({
          actor: actor,
          title: `${game.i18n.localize('VAGABOND.Roll.DamageRoll')}: ${action.name}`,
          subtitle: actor.name,
          damageRoll: rollObj,
          damageType: damageTypeKey || 'physical',
          attackType: attackType,
          hasDefenses: !this.isRestorativeDamageType(damageTypeKey || 'physical'),
          targetsAtRollTime,
          actionIndex,
      });
    }

  /**
   * Check if a damage type is restorative (restores a resource instead of dealing damage).
   * Config-driven via CONFIG.VAGABOND.restorativeDamageTypes (homebrew `restorative` flag);
   * the classic healing/recover/recharge triple is the pre-init fallback.
   * @param {string} damageType - The damage type to check
   * @returns {boolean}
   */
  static isRestorativeDamageType(damageType) {
    return this.getRestorativeResource(damageType) !== null;
  }

  /**
   * Which resource a restorative damage type restores: 'hp' | 'fatigue' | 'mana' | null.
   * @param {string} damageType
   * @returns {string|null}
   */
  static getRestorativeResource(damageType) {
    const normalizedType = damageType?.toLowerCase() || '';
    const configured = CONFIG.VAGABOND?.restorativeDamageTypes;
    if (configured) return configured[normalizedType] ?? null;
    // Pre-init fallback: the classic triple
    return { healing: 'hp', recover: 'fatigue', recharge: 'mana' }[normalizedType] ?? null;
  }

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
    const resource = this.getRestorativeResource(damageType);
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
    // { sourceActorId, sourceItemId, sourceActionIndex, saveType, saveSuccess, saveDifficulty, saveTotal, attackWasCrit }
    const sc = statusContext;
    const statusAttrs = sc ? `
          data-source-actor-id="${sc.sourceActorId || ''}"
          data-source-item-id="${sc.sourceItemId || ''}"
          data-source-action-index="${sc.sourceActionIndex ?? ''}"
          data-save-type="${sc.saveType}"
          data-save-success="${sc.saveSuccess}"
          data-save-difficulty="${sc.saveDifficulty}"
          data-save-total="${sc.saveTotal}"
          data-attack-was-crit="${sc.attackWasCrit}"` : '';
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

  /** @see VagabondDamagePipeline.getActorBeingType */
  static _getActorBeingType(actor) {
    return VagabondDamagePipeline.getActorBeingType(actor);
  }

  /** @see VagabondDamagePipeline.shouldDoublePerDieBonus */
  static _shouldDoublePerDieBonus(attackingActor, storedTargets) {
    return VagabondDamagePipeline.shouldDoublePerDieBonus(attackingActor, storedTargets);
  }

  /** @see VagabondDamagePipeline.countRolledDice */
  static _countRolledDice(roll) {
    return VagabondDamagePipeline.countRolledDice(roll);
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
   * → immunity(0) → armor → berserk reduction.
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
   * @returns {{final: number, armorReduction: number, berserkReduction: number,
   *   path: 'typeless'|'material'|'weak'|'immune'|'normal'}}
   */
  static calculateFinalDamageDetailed(actor, damage, damageType, attackingWeapon = null, opts = {}) {
    const result = this._computeFinalDamage(actor, damage, damageType, attackingWeapon, opts);
    if (damage > 0 && !opts.skipHexBonus) {
      result.widdershinsBonus = WitchHelper.widdershinsBonus(opts.attackerActor ?? attackingWeapon?.actor ?? null, actor, attackingWeapon);
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
      widdershinsBonus = WitchHelper.widdershinsBonus(opts.attackerActor ?? attackingWeapon?.actor ?? null, actor, attackingWeapon);
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
    let immunities = actor.system.immunities || [];
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
    if (weaknesses.includes(normalizedType) || HunterHelper.isMarkWeak(opts.attackerActor, actor) || WitchHelper.isHexWeak(opts.attackerActor, actor)) {
      return { final: finalDamage, armorReduction: 0, berserkReduction: 0, flankedBonus, path: 'weak' };
    }

    // RAW: Immune - Unharmed by the damage type (Beast Mode attacks ignore non-Relic Immune)
    if (immunities.includes(normalizedType) && !DruidHelper.ignoresNonRelicImmune(opts.attackerActor, normalizedType)
      && !NpcRules.relicBypassesImmunity(actor, normalizedType, attackingWeapon)) {
      return { final: 0, armorReduction: 0, berserkReduction: 0, flankedBonus: 0, path: 'immune' };
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

    return { final: finalDamage, armorReduction, berserkReduction, flankedBonus, path: 'normal' };
  }

  /** @see VagabondDamagePipeline.extractDieSize */
  static _extractDieSize(formula) {
    return VagabondDamagePipeline.extractDieSize(formula);
  }

  /** @see VagabondDamagePipeline.getDamageSourceDieSize */
  static _getDamageSourceDieSize(sourceItem, actionIdx, sourceActor) {
    return VagabondDamagePipeline.getDamageSourceDieSize(sourceItem, actionIdx, sourceActor);
  }

  /** @see VagabondDamagePipeline.isWeakTo */
  static _isWeakTo(targetActor, damageType, attackingWeapon = null, attacker = null) {
    return VagabondDamagePipeline.isWeakTo(targetActor, damageType, attackingWeapon, attacker);
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
   * @returns {{entries: Array, coatingEntries: Array}} entries = merged + coating + passive;
   *   coatingEntries returned separately so callers can clear coating charges after application
   */
  static resolveIncomingStatusEntries({ sourceActor, sourceItem = null, actionIdx = null, attackWasCrit = false, includeCoating = true }) {
    const action = (actionIdx !== null && !isNaN(actionIdx)) ? sourceActor?.system?.actions?.[actionIdx] : null;
    const normalEntries = sourceItem?.system?.causedStatuses?.length
      ? sourceItem.system.causedStatuses
      : (action?.causedStatuses?.length ? action.causedStatuses : []);
    const critEntries = attackWasCrit
      ? (sourceItem?.system?.critCausedStatuses?.length
          ? sourceItem.system.critCausedStatuses
          : (action?.critCausedStatuses?.length ? action.critCausedStatuses : []))
      : [];
    const mergedEntries = attackWasCrit
      ? [...critEntries, ...normalEntries.filter(e => !critEntries.some(c => c.statusId === e.statusId))]
      : normalEntries;
    const coatingEntries = (includeCoating && sourceItem?.system?.coating?.charges > 0)
      ? (sourceItem.system.coating.causedStatuses ?? [])
      : [];
    const passiveEntries = sourceActor
      ? sourceActor.items.filter(i => i.system?.equipped && i.system?.passiveCausedStatuses?.length).flatMap(i => i.system.passiveCausedStatuses)
      : [];
    return { entries: [...mergedEntries, ...coatingEntries, ...passiveEntries], coatingEntries };
  }

  /**
   * Whether any incoming status entry gated by this save type is resisted by the target,
   * granting an independent Favor vote on the save. Must run BEFORE the dice roll.
   * @returns {Promise<boolean>}
   */
  static async _hasStatusResistanceForSave(targetActor, saveType, { sourceActor, sourceItem, actionIdx, attackWasCrit = false }) {
    const { StatusHelper } = await import('./status-helper.mjs');
    const { entries } = this.resolveIncomingStatusEntries({ sourceActor, sourceItem, actionIdx, attackWasCrit });
    return entries.some(e =>
      (e.saveType === saveType || e.saveType === 'any') && StatusHelper.isStatusResisted(targetActor, e.statusId)
    );
  }

  /**
   * Resolve which actors a clicked save button rolls for (shared by both save handlers).
   * GM: stored targets. Player: owned stored targets, falling back to their single character.
   * @param {HTMLElement} button
   * @returns {Actor[]|null} Actors to roll for, or null when a warning was shown and rolling must abort
   */
  static _resolveSaveActors(button) {
    const storedTargets = this._getTargetsFromButton(button);

    if (!game.user.isGM) {
      // PLAYER: Use stored targets if available, otherwise smart single-char detection
      if (storedTargets.length > 0) {
        const targetTokens = this._resolveStoredTargets(storedTargets);
        const actorsToRoll = targetTokens.map(t => t.actor).filter(a => a && a.isOwner);
        if (actorsToRoll.length === 0) {
          ui.notifications.warn('None of the targeted tokens belong to you.');
          return null;
        }
        return actorsToRoll;
      }
      // Fallback: single-character detection
      const ownedCharacters = game.actors.filter(a => a.type === 'character' && a.isOwner);
      if (ownedCharacters.length === 1) return [ownedCharacters[0]];
      if (ownedCharacters.length > 1) {
        ui.notifications.warn('You have multiple characters. Please target the token you want to roll for.');
        return null;
      }
      ui.notifications.warn('You do not own any characters to roll saves for.');
      return null;
    }

    // GM: Use stored targets
    if (storedTargets.length === 0) {
      ui.notifications.warn('No tokens targeted. Please target at least one token.');
      return null;
    }
    const targetTokens = this._resolveStoredTargets(storedTargets);
    return targetTokens.map(t => t.actor).filter(a => a);
  }

  /**
   * Compute one actor's full save outcome: conditional hinder, attacker modifier,
   * status-resistance favor vote, the roll itself, and success/crit evaluation.
   * Shared by handleSaveRoll and handleSaveReminderRoll.
   *
   * @param {Actor} targetActor
   * @param {string} saveType
   * @param {string} attackType
   * @param {Actor|null} sourceActor
   * @param {{sourceItem?: Item|null, actionIdx?: number|null, attackWasCrit?: boolean}} sourceCtx
   * @param {Event|null} event - Click event (keyboard favor/hinder modifiers)
   * @returns {Promise<{saveRoll: Roll, difficulty: number, isSuccess: boolean, isCritical: boolean, isHindered: boolean}>}
   */
  static async _computeSaveOutcome(targetActor, saveType, attackType, sourceActor, sourceCtx = {}, event = null) {
    // Defender-side rules (CONFIG.VAGABOND.defenseRules: Prone, Invisible, ...)
    const defenseVote = this._evaluateDefenseRules(saveType, attackType, targetActor, { sourceActor });
    const isHindered = defenseVote === 'hinder';

    // Attacker-side vote (Confused, Vulnerable, Prone, Invisible attacker)
    const attackerModifier = await this._attackerSaveVote(sourceActor, attackType);

    // Status resistance grants an independent Favor vote — checked BEFORE the dice roll
    const resistanceFavor = await this._hasStatusResistanceForSave(targetActor, saveType, {
      sourceActor, ...sourceCtx,
    });

    const shiftKey = event?.shiftKey || false;
    const ctrlKey = event?.ctrlKey || false;
    const saveRoll = await this._rollSave(targetActor, saveType, defenseVote, shiftKey, ctrlKey, attackerModifier, resistanceFavor);

    const difficulty = targetActor.system.saves?.[saveType]?.difficulty || 10;
    const { VagabondChatCard } = await import('./chat-card.mjs');
    const { VagabondRollBuilder } = await import('./roll-builder.mjs');
    // Statuses that fail this Save outright (Incapacitated → Reflex, Dead → all)
    const autoFail = VagabondRollBuilder.autoFails(targetActor, saveType);
    const isSuccess = !autoFail && saveRoll.total >= difficulty;
    const critNumber = VagabondRollBuilder.calculateCritThreshold(targetActor.getRollData(), saveType);
    const isCritical = !autoFail && VagabondChatCard.isRollCritical(saveRoll, critNumber);

    // Fighter Momentum: passing a Save against an attack (inert unless system.momentumTrigger)
    if (isSuccess) {
      const { FighterHelper } = await import('./fighter-helper.mjs');
      FighterHelper.onDefended(targetActor);
    }

    return { saveRoll, difficulty, isSuccess, isCritical, isHindered };
  }

  static async handleSaveRoll(button, event = null) {
    const saveType = button.dataset.saveType; // 'reflex', 'endure', 'will'
    const damageAmount = parseInt(button.dataset.damageAmount);
    const damageType = button.dataset.damageType;
    const rollTermsData = JSON.parse(button.dataset.rollTerms.replace(/&quot;/g, '"'));
    const attackType = button.dataset.attackType; // 'melee' or 'ranged' or 'cast'
    const actorId = button.dataset.actorId;
    const itemId = button.dataset.itemId;
    const attackWasCrit = button.dataset.attackWasCrit === 'true';
    const actionIndexRaw = button.dataset.actionIndex;
    const actionIdx = (actionIndexRaw !== '' && actionIndexRaw != null) ? parseInt(actionIndexRaw) : null;

    // Resolve which actors roll (shared GM/player logic)
    const actorsToRoll = this._resolveSaveActors(button);
    if (!actorsToRoll) return;

    // Roll save for each actor
    for (let _saveIdx = 0; _saveIdx < actorsToRoll.length; _saveIdx++) {
      const targetActor = actorsToRoll[_saveIdx];
      if (!targetActor) continue;

      // Check permissions
      if (!targetActor.isOwner && !game.user.isGM) {
        ui.notifications.warn(`You don't have permission to roll saves for ${targetActor.name}.`);
        continue;
      }

      // NPCs don't roll saves - they only have armor, immunities, and weaknesses
      if (targetActor.type === 'npc') {
        ui.notifications.warn(game.i18n.localize('VAGABOND.Saves.NPCNoSaves'));
        continue;
      }

      // Cleave no longer splits damage — every Target takes the full rolled amount
      // (the die itself was already stepped down at roll time, see roll-handler.mjs).
      const effectiveDamageAmount = damageAmount;

      // Full save outcome (hinder, attacker modifier, resistance vote, roll, crit)
      const sourceActor = TargetHelper.resolveActorRef(actorId);
      const { saveRoll, difficulty, isSuccess, isCritical, isHindered } = await this._computeSaveOutcome(
        targetActor, saveType, attackType, sourceActor,
        { sourceItem: this._resolveSourceItem(sourceActor, itemId), actionIdx, attackWasCrit },
        event
      );
      const { VagabondChatCard } = await import('./chat-card.mjs');

      // Calculate damage breakdown for display
      let damageAfterSave = effectiveDamageAmount;
      let saveReduction = 0;
      if (isSuccess) {
        damageAfterSave = this._removeHighestDie(rollTermsData);
        saveReduction = effectiveDamageAmount - damageAfterSave;
      }

      // Apply armor/immune/weak modifiers and track armor reduction.
      // The actual rolled dice count (from the serialized roll terms) feeds the
      // berserk per-die reduction so grip/bonus/explosion dice are counted correctly.
      const sourceItem = this._resolveSourceItem(sourceActor, itemId);
      const rolledDiceCount = rollTermsData.terms.reduce((n, t) =>
        n + (t.type === 'Die' ? (t.results ?? []).filter(r => r.active !== false).length : 0), 0);
      const damageBreakdown = this.calculateFinalDamageDetailed(
        targetActor, damageAfterSave, damageType, sourceItem, { rolledDiceCount, attackerActor: sourceActor, isCrit: attackWasCrit }
      );
      const baseAfterFinal = damageBreakdown.final;
      const armorReduction = damageBreakdown.armorReduction;
      const flankedBonus = damageBreakdown.flankedBonus;
      // RAW: Weak — bypass Armor/Immune + deal an extra damage die
      let finalDamage = baseAfterFinal;
      const weaknessPreRolledSave = button.dataset.weaknessPreRolled === 'true';
      if (!weaknessPreRolledSave && this._isWeakTo(targetActor, damageType, sourceItem, sourceActor)) {
        const dieSize = this._getDamageSourceDieSize(sourceItem, actionIdx, sourceActor);
        const weakRoll = new Roll(`1d${dieSize}`);
        await weakRoll.evaluate();
        finalDamage += weakRoll.total;
      }

      // Auto-apply damage if setting enabled.
      // Crit saves always skip auto-apply so the player can choose the Luck/benefit toggle first.
      const autoApply = game.settings.get('vagabond', 'autoApplySaveDamage') && !isCritical;
      if (autoApply) {
        const _autoPreCtx = { actor: targetActor, amount: finalDamage, damageType, sourceItem };
        if (Hooks.call('vagabond.preDamageApply', _autoPreCtx) !== false) {
          const _autoFinal = Math.max(0, _autoPreCtx.amount);
          const currentHP = targetActor.system.health?.value || 0;
          const newHP = Math.max(0, currentHP - _autoFinal);
          await targetActor.update({ 'system.health.value': newHP });
          Hooks.callAll('vagabond.postDamageApply', { actor: targetActor, amount: _autoFinal, incoming: damageAfterSave, rolledDiceCount, damageType, sourceItem, attackerActor: sourceActor, oldHp: currentHP, newHp: newHP });
        }
      }

      // Collect on-hit status entries (single source of truth: item/action fallback + crit merge + coating + passives)
      const { StatusHelper } = await import('./status-helper.mjs');
      const { entries: allStatusEntries, coatingEntries } = this.resolveIncomingStatusEntries({
        sourceActor, sourceItem, actionIdx, attackWasCrit,
      });

      // statusContext is embedded in the Apply button so handleApplySaveDamage can process
      // statuses at apply-time when autoApply is OFF.
      const statusContext = allStatusEntries.length > 0 ? {
        sourceActorId:    actorId,
        sourceItemId:     itemId,
        sourceActionIndex: actionIdx,
        saveType,
        saveSuccess:      isSuccess,
        saveDifficulty:   difficulty,
        saveTotal:        saveRoll.total,
        attackWasCrit,
      } : null;

      // Post save result to chat
      const saveMessage = await this._postSaveResult(
        targetActor,
        saveType,
        saveRoll,
        difficulty,
        isSuccess,
        isCritical,
        isHindered,
        effectiveDamageAmount,
        saveReduction,
        armorReduction,
        finalDamage,
        damageType,
        autoApply,
        autoApply ? null : statusContext,  // embed context only for manual-apply cards
        damageBreakdown.path,
        flankedBonus,
        // Protector perk: a failed Reflex Save lets a Close ally use their Defense property
        (saveType === 'reflex' && !isSuccess)
          ? this.createProtectButtons(targetActor, {
              incoming: damageAfterSave, damageType, actorId, itemId, actionIdx, attackWasCrit,
              priorFinal: finalDamage, weakExtra: finalDamage - baseAfterFinal, autoApplied: autoApply,
            })
          : ''
      );
      // Luck is managed by the save-crit-toggle — do not auto-grant here

      // autoApply ON → damage was already applied; process statuses now.
      // autoApply OFF → defer status processing to handleApplySaveDamage (apply button click).
      if (autoApply && allStatusEntries.length > 0) {
        const damageWasBlocked = finalDamage === 0;
        const preRolledSave = {
          saveType,
          roll:       saveRoll,
          total:      saveRoll.total,
          success:    isSuccess,
          difficulty,
        };
        const sourceActorTokenName1 = canvas.tokens?.placeables?.find(t => t.actor?.id === sourceActor?.id)?.document.name || sourceActor?.name || '';
        const statusResults = await StatusHelper.processCausedStatuses(
          targetActor, allStatusEntries, damageWasBlocked, sourceItem?.name ?? '', { preRolledSave, sourceActorName: sourceActorTokenName1 }
        );
        if (coatingEntries.length > 0 && sourceActor.items.has(sourceItem.id)) {
          await sourceItem.update({
            'system.coating.charges': 0,
            'system.coating.sourceName': '',
            'system.coating.causedStatuses': [],
          });
        }
        await VagabondChatCard.statusResults(statusResults, targetActor, sourceItem?.name ?? '', sourceItem?.img ?? null);
      }
    }

    // Button remains active so multiple players can roll saves
    // Each click generates new save result cards for currently targeted tokens
  }

  /**
   * Handle save reminder button click - roll saves without damage
   * @param {HTMLElement} button - The clicked save reminder button
   * @param {Event} event - The click event (for keyboard modifiers)
   */
  static async handleSaveReminderRoll(button, event = null) {
    const saveType = button.dataset.saveType; // 'reflex', 'endure', 'will'
    const attackType = button.dataset.attackType; // 'melee', 'ranged', or 'cast'
    const actorId = button.dataset.actorId;
    const itemId = button.dataset.itemId;
    const actionIndexRaw = button.dataset.actionIndex;
    const actionIdx = (actionIndexRaw !== '' && actionIndexRaw != null) ? parseInt(actionIndexRaw) : null;

    // Resolve which actors roll (shared GM/player logic)
    const actorsToRoll = this._resolveSaveActors(button);
    if (!actorsToRoll) return;

    // Roll save for each actor
    for (const targetActor of actorsToRoll) {
      if (!targetActor) continue;

      // Check permissions
      if (!targetActor.isOwner && !game.user.isGM) {
        ui.notifications.warn(`You don't have permission to roll saves for ${targetActor.name}.`);
        continue;
      }

      // NPCs don't roll saves - they only have armor, immunities, and weaknesses
      if (targetActor.type === 'npc') {
        ui.notifications.warn(game.i18n.localize('VAGABOND.Saves.NPCNoSaves'));
        continue;
      }

      // Full save outcome (hinder, attacker modifier, resistance vote, roll, crit)
      const sourceActor = TargetHelper.resolveActorRef(actorId);
      const { saveRoll, difficulty, isSuccess, isCritical, isHindered } = await this._computeSaveOutcome(
        targetActor, saveType, attackType, sourceActor,
        { sourceItem: this._resolveSourceItem(sourceActor, itemId), actionIdx },
        event
      );
      const { VagabondChatCard } = await import('./chat-card.mjs');

      // Post simplified save result to chat (no damage calculations)
      const saveMessage = await this._postSaveReminderResult(
        targetActor,
        saveType,
        saveRoll,
        difficulty,
        isSuccess,
        isCritical,
        isHindered
      );
      // Luck is managed by the save-crit-toggle — do not auto-grant here

      // Process on-hit status effects using the save roll already made above
      // sourceActor is already declared above for outgoingSavesModifier
      // (reminder path never merges crit entries — attackWasCrit stays false)
      const sourceItem = this._resolveSourceItem(sourceActor, itemId);
      const { entries: allStatusEntries, coatingEntries } = this.resolveIncomingStatusEntries({
        sourceActor, sourceItem, actionIdx,
      });
      if (allStatusEntries.length > 0) {
        const { StatusHelper } = await import('./status-helper.mjs');
        const preRolledSave = {
          saveType,
          roll:       saveRoll,
          total:      saveRoll.total,
          success:    isSuccess,
          difficulty,
        };
        const sourceName = sourceItem?.name ?? (actionIdx !== null ? sourceActor?.system?.actions?.[actionIdx]?.name : '') ?? '';
        const sourceActorTokenName2 = canvas.tokens?.placeables?.find(t => t.actor?.id === sourceActor?.id)?.document.name || sourceActor?.name || '';
        const statusResults = await StatusHelper.processCausedStatuses(
          targetActor, allStatusEntries, false, sourceName, { preRolledSave, sourceActorName: sourceActorTokenName2 }
        );
        if (coatingEntries.length > 0 && sourceActor.items.has(sourceItem.id)) {
          await sourceItem.update({
            'system.coating.charges': 0,
            'system.coating.sourceName': '',
            'system.coating.causedStatuses': [],
          });
        }
        await VagabondChatCard.statusResults(statusResults, targetActor, sourceName, sourceItem?.img ?? null);
      }
    }

    // Button remains active so multiple players can roll saves
  }

  /**
   * Handle a Defense button — Defense weapon property (Alpha 3): the defender makes an
   * Attack Check with the clicked weapon INSTEAD of the Reflex Save. Pass → the damage is
   * reduced by a roll of every Defense weapon's dice (DefenseHelper.reductionWeapons); fail →
   * full damage. Then Armor / Immune / Weak as usual; applied per `autoApplySaveDamage`.
   * On-hit statuses read the Check as the Reflex Save. A failed Check is a failed Reflex Save,
   * so Close Protectors get a Protect button. Who rolls = `_resolveSaveActors` (like Saves).
   * @param {HTMLElement} button - The clicked Defense button (`data-defense-slot` = 1-based)
   * @param {Event|null} event - Click event (Shift = Favor, Ctrl = Hinder)
   */
  static async handleDefenseWeapons(button, event = null) {
    const damageAmount = parseInt(button.dataset.damageAmount);
    const damageType = button.dataset.damageType;
    const actorId = button.dataset.actorId;
    const itemId = button.dataset.itemId;
    const actionIndexRaw = button.dataset.actionIndex;
    const actionIdx = (actionIndexRaw !== '' && actionIndexRaw != null) ? parseInt(actionIndexRaw) : null;
    const attackWasCrit = button.dataset.attackWasCrit === 'true';
    const weaknessPreRolled = button.dataset.weaknessPreRolled === 'true';

    const actorsToRoll = this._resolveSaveActors(button);
    if (!actorsToRoll) return;
    const sourceActor = TargetHelper.resolveActorRef(actorId);
    const sourceItem = this._resolveSourceItem(sourceActor, itemId);
    const slot = Math.max(1, parseInt(button.dataset.defenseSlot) || 1);

    const { VagabondChatCard } = await import('./chat-card.mjs');
    const { StatusHelper } = await import('./status-helper.mjs');

    for (const targetActor of actorsToRoll) {
      if (!targetActor || targetActor.type === 'npc') continue;
      if (!targetActor.isOwner && !game.user.isGM) continue;
      const weapons = DefenseHelper.defenseWeapons(targetActor);
      const weapon = weapons[slot - 1] ?? weapons[0];
      if (!weapon) continue; // Only defenders holding a Defense weapon can use it

      // The Check replaces the Reflex Save: Save-side votes apply (attacker modifier, status resistance)
      const resistanceFavor = await this._hasStatusResistanceForSave(targetActor, 'reflex', {
        sourceActor, sourceItem, actionIdx, attackWasCrit,
      });
      const attackType = button.dataset.attackType || 'melee';
      const check = await DefenseHelper.rollCheck(targetActor, weapon, {
        attackerModifier: await this._attackerSaveVote(sourceActor, attackType), resistanceFavor, event,
        // The defender's Reflex-Save rules (CONFIG.VAGABOND.defenseRules, e.g. Prone) apply to the Check
        defenseVote: this._evaluateDefenseRules('reflex', attackType, targetActor, { sourceActor }),
      });
      // The Check stands in for the Reflex Save: a status that fails Reflex (Incapacitated) fails it
      const { VagabondRollBuilder } = await import('./roll-builder.mjs');
      if (VagabondRollBuilder.autoFails(targetActor, 'reflex')) {
        check.isSuccess = false;
        check.isCritical = false;
      }

      let shieldRoll = null;
      let shieldWeapons = [];
      if (check.isSuccess) {
        shieldWeapons = DefenseHelper.reductionWeapons(targetActor, weapon);
        shieldRoll = await VagabondDamagePipeline.rollDefenseDice(targetActor, shieldWeapons);
        await DefenseHelper.spendPatience(targetActor, shieldWeapons);
        const { FighterHelper } = await import('./fighter-helper.mjs');
        FighterHelper.onDefended(targetActor);
      }
      const shieldReduction = shieldRoll?.total ?? 0;

      const breakdown = this.calculateFinalDamageDetailed(
        targetActor, Math.max(0, damageAmount - shieldReduction), damageType, sourceItem, { attackerActor: sourceActor, isCrit: attackWasCrit }
      );
      let finalDamage = breakdown.final;
      if (!weaknessPreRolled && this._isWeakTo(targetActor, damageType, sourceItem, sourceActor)) {
        const weakRoll = new Roll(`1d${this._getDamageSourceDieSize(sourceItem, actionIdx, sourceActor)}`);
        await weakRoll.evaluate();
        finalDamage += weakRoll.total;
      }
      const weakExtra = finalDamage - breakdown.final;

      const autoApply = game.settings.get('vagabond', 'autoApplySaveDamage');
      if (autoApply) await this._applyDamageToActor(targetActor, finalDamage, damageType, sourceItem, sourceActor);

      const { entries: allStatusEntries, coatingEntries } = this.resolveIncomingStatusEntries({
        sourceActor, sourceItem, actionIdx, attackWasCrit,
      });
      const statusContext = allStatusEntries.length > 0 ? {
        sourceActorId: actorId, sourceItemId: itemId, sourceActionIndex: actionIdx,
        saveType: 'reflex', saveSuccess: check.isSuccess, saveDifficulty: check.difficulty,
        saveTotal: check.roll.total, attackWasCrit,
      } : null;

      // A failed Check is a failed Reflex Save → Close Protectors may step in
      const protectHtml = check.isSuccess ? '' : this.createProtectButtons(targetActor, {
        incoming: damageAmount, damageType, actorId, itemId, actionIdx, attackWasCrit,
        priorFinal: finalDamage, weakExtra, autoApplied: autoApply,
      });

      const message = await this._postDefenseResult(targetActor, {
        title: `${game.i18n.localize('VAGABOND.Chat.DefenseCheck')}: ${weapon.name}`,
        check, shieldRoll, shieldWeapons, incoming: damageAmount, shieldReduction,
        armorReduction: breakdown.armorReduction, finalDamage, damageType, path: breakdown.path,
        flankedBonus: breakdown.flankedBonus, autoApplied: autoApply,
        applyButton: !autoApply && finalDamage > 0
          ? this.createApplySaveDamageButton(targetActor.uuid, targetActor.name, finalDamage, damageType, statusContext)
          : '',
        extraHtml: protectHtml,
      });
      if (check.isCritical) await VagabondChatCard._grantLuckOnCrit(targetActor, message, 'Critical');

      if (autoApply && allStatusEntries.length > 0) {
        const sourceName = sourceItem?.name ?? (actionIdx !== null ? sourceActor?.system?.actions?.[actionIdx]?.name : '') ?? '';
        const sourceActorTokenName = canvas.tokens?.placeables?.find(t => t.actor?.id === sourceActor?.id)?.document.name || sourceActor?.name || '';
        const preRolledSave = { saveType: 'reflex', roll: check.roll, total: check.roll.total, success: check.isSuccess, difficulty: check.difficulty };
        const statusResults = await StatusHelper.processCausedStatuses(
          targetActor, allStatusEntries, finalDamage === 0, sourceName, { preRolledSave, sourceActorName: sourceActorTokenName }
        );
        if (coatingEntries.length > 0 && sourceActor?.items.has(sourceItem?.id)) {
          await sourceItem.update({ 'system.coating.charges': 0, 'system.coating.causedStatuses': [] });
        }
        await VagabondChatCard.statusResults(statusResults, targetActor, sourceName, sourceItem?.img ?? null);
      }
    }
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
      const { emitSocket } = await import('./socket-helper.mjs');
      emitSocket('applyDamage', { actorUuid: actor.uuid, newHp: newHP });
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
   * Handle a Protect button (Protector perk): the protector makes the Defense Attack Check
   * with their first Defense weapon; on a pass the ally's incoming damage is reduced by the
   * protector's Defense dice and the ally's Armor is applied again. If the damage was already
   * applied, the difference is restored to the ally's HP; otherwise the card carries a new
   * Apply button that replaces the Reflex card's. The ally's failed Save (statuses) stands.
   * @param {HTMLElement} button
   * @param {Event|null} event
   */
  static async handleProtect(button, event = null) {
    const protector = TargetHelper.resolveActorRef(button.dataset.protectorUuid);
    const defender = TargetHelper.resolveActorRef(button.dataset.defenderUuid);
    if (!protector || !defender) return;
    if (!protector.isOwner && !game.user.isGM) {
      ui.notifications.warn(game.i18n.format('VAGABOND.Defense.NotYours', { name: protector.name }));
      return;
    }
    const weapon = DefenseHelper.defenseWeapons(protector)[0];
    if (!weapon) {
      ui.notifications.warn(game.i18n.format('VAGABOND.Defense.NoWeapon', { name: protector.name }));
      return;
    }
    button.disabled = true;

    const incoming = parseInt(button.dataset.incoming) || 0;
    const damageType = button.dataset.damageType;
    const priorFinal = parseInt(button.dataset.priorFinal) || 0;
    const weakExtra = parseInt(button.dataset.weakExtra) || 0;
    const autoApplied = button.dataset.autoApplied === 'true';
    const sourceActor = TargetHelper.resolveActorRef(button.dataset.sourceActorId);
    const sourceItem = this._resolveSourceItem(sourceActor, button.dataset.sourceItemId);

    const check = await DefenseHelper.rollCheck(protector, weapon, { event });
    let shieldRoll = null;
    let shieldWeapons = [];
    if (check.isSuccess) {
      shieldWeapons = DefenseHelper.reductionWeapons(protector, weapon);
      shieldRoll = await VagabondDamagePipeline.rollDefenseDice(protector, shieldWeapons);
      await DefenseHelper.spendPatience(protector, shieldWeapons);
    }
    const shieldReduction = shieldRoll?.total ?? 0;
    const breakdown = this.calculateFinalDamageDetailed(
      defender, Math.max(0, incoming - shieldReduction), damageType, sourceItem, { attackerActor: sourceActor }
    );
    const finalDamage = check.isSuccess ? breakdown.final + weakExtra : priorFinal;
    const saved = Math.max(0, priorFinal - finalDamage);

    // Already applied → give back what the Defense saved
    if (autoApplied && saved > 0) {
      const hp = defender.system.health?.value || 0;
      const newHp = Math.min(defender.system.health?.max ?? hp + saved, hp + saved);
      if (defender.isOwner || game.user.isGM) {
        await defender.update({ 'system.health.value': newHp });
      } else {
        const { emitSocket } = await import('./socket-helper.mjs');
        emitSocket('applyDamage', { actorUuid: defender.uuid, newHp });
      }
    }

    const note = !check.isSuccess
      ? game.i18n.localize('VAGABOND.Defense.ProtectFailed')
      : autoApplied
        ? game.i18n.format('VAGABOND.Defense.ProtectRestored', { target: defender.name, amount: saved })
        : game.i18n.localize('VAGABOND.Defense.ProtectReplacesApply');
    const message = await this._postDefenseResult(protector, {
      title: game.i18n.format('VAGABOND.Defense.ProtectTitle', { name: protector.name, target: defender.name }),
      check, shieldRoll, shieldWeapons, incoming, shieldReduction,
      armorReduction: check.isSuccess ? breakdown.armorReduction : 0,
      finalDamage, damageType, path: breakdown.path, flankedBonus: breakdown.flankedBonus,
      autoApplied: false, damageActor: defender,
      applyButton: check.isSuccess && !autoApplied && finalDamage > 0
        ? this.createApplySaveDamageButton(defender.uuid, defender.name, finalDamage, damageType, null)
        : '',
      extraHtml: `<p class="defense-note">${note}</p>`,
    });
    if (check.isCritical) {
      const { VagabondChatCard } = await import('./chat-card.mjs');
      await VagabondChatCard._grantLuckOnCrit(protector, message, 'Critical');
    }
  }

  /**
   * Post a Defense (or Protect) result card: the Attack Check, then the damage line with
   * the Defense dice as their own component.
   * @param {Actor} actor - Who made the Check (card speaker)
   * @param {Object} o
   * @returns {Promise<ChatMessage>}
   * @private
   */
  static async _postDefenseResult(actor, o) {
    const { VagabondChatCard } = await import('./chat-card.mjs');
    const damageActor = o.damageActor ?? actor;
    const card = new VagabondChatCard()
      .setType('save-roll')
      .setActor(actor)
      .setTitle(o.title)
      .setSubtitle(actor.name)
      .addRoll(o.check.roll, o.check.difficulty)
      .setOutcome(o.check.isSuccess ? 'PASS' : 'FAIL', o.check.isCritical);

    const names = o.shieldWeapons.map(w => w.name).join(' + ');
    const shieldTitle = o.shieldRoll
      ? `${names}: ${o.shieldRoll.formula}${o.shieldRoll._perDieBonusTotal ? ` + ${o.shieldRoll._perDieBonusTotal}` : ''} = ${o.shieldReduction}`
      : '';
    const calc = this._buildDamageCalculation(
      o.incoming, 0, o.armorReduction, o.finalDamage, o.damageType, 'reflex', damageActor,
      o.autoApplied, false, o.path, o.flankedBonus,
      { title: game.i18n.localize('VAGABOND.Chat.Defense'), shieldReduction: o.shieldReduction, shieldTitle }
    );
    card.setDescription((card.data.description || '') + calc + (o.applyButton || '') + (o.extraHtml || ''));
    return await card.send();
  }

  /**
   * Evaluate the tri-state defense vote for a save from the CONFIG.VAGABOND.defenseRules
   * registry. Each matching rule contributes its `effect` vote; votes fold net-count.
   * @param {string} saveType
   * @param {string} attackType
   * @param {Actor} actor - The defender
   * @param {{sourceActor?: Actor|null}} [ctx] - sourceActor: the attacker / caster
   * @returns {'favor'|'hinder'|'none'}
   */
  static _evaluateDefenseRules(saveType, attackType, actor, ctx = {}) {
    const rules = CONFIG.VAGABOND.defenseRules ?? [];
    const votes = [];
    for (const rule of rules) {
      if (rule.save !== '*' && rule.save !== saveType) continue;
      if (rule.vsAttackTypes !== '*' && !rule.vsAttackTypes.includes(attackType)) continue;
      if (rule.condition && !rule.condition(actor, attackType, ctx)) continue;
      if (rule.negatedBy && rule.negatedBy(actor, attackType, ctx)) continue;
      votes.push(rule.effect);
    }
    let net = 0;
    for (const vote of votes) {
      if (vote === 'favor') net++;
      else if (vote === 'hinder') net--;
    }
    return net > 0 ? 'favor' : net < 0 ? 'hinder' : 'none';
  }

  /**
   * The attacker-side vote on a Save against its attack or Cast (the book's lowercase "attack"
   * covers Casts), merged net-count:
   * - `outgoingSavesModifier` (Confused: Saves against its Actions have Favor);
   * - Vulnerable: Saves against its attacks have Favor;
   * - Prone (`meleeReflexVulnerable`): Saves against its Melee attacks (Touch Casts too) have Favor;
   * - Invisible attacker (`attackersAreBlinded`): the defender can't see it and acts as Blinded
   *   (Vulnerable), so its Saves against the attack have Hinder.
   * @param {Actor|null} sourceActor
   * @param {string} attackType
   * @returns {Promise<'favor'|'hinder'|'none'>}
   */
  static async _attackerSaveVote(sourceActor, attackType) {
    const { VagabondRollBuilder } = await import('./roll-builder.mjs');
    const sys = sourceActor?.system;
    return VagabondRollBuilder.mergeFavorHinder(
      sys?.outgoingSavesModifier || 'none',
      sys?.vulnerable ? 'favor' : 'none',
      (sys?.meleeReflexVulnerable && attackType === 'melee') ? 'favor' : 'none',
      sys?.defenderStatusModifiers?.attackersAreBlinded ? 'hinder' : 'none'
    );
  }

  /**
   * Roll a save for an actor
   * @param {Actor} actor - The actor rolling the save
   * @param {string} saveType - 'reflex', 'endure', 'will'
   * @param {'favor'|'hinder'|'none'} defenseVote - Defender-side rules vote (CONFIG.VAGABOND.defenseRules)
   * @param {boolean} shiftKey - Whether Shift key was pressed (Favor modifier)
   * @param {boolean} ctrlKey - Whether Ctrl key was pressed (Hinder modifier)
   * @param {string} attackerModifier - Attacker's outgoingSavesModifier ('none', 'favor', 'hinder')
   * @param {boolean} resistanceFavor - Status resistance grants an independent Favor vote
   * @returns {Promise<Roll>} The save roll
   * @private
   */
  static async _rollSave(actor, saveType, defenseVote = 'none', shiftKey = false, ctrlKey = false, attackerModifier = 'none', resistanceFavor = false) {
    // Use centralized roll builder for all favor/hinder logic
    const { VagabondRollBuilder } = await import('./roll-builder.mjs');

    // System state + keyboard collapse into one vote, then attacker modifier and
    // status resistance enter as independent votes (net-count merge).
    const systemState = actor.system.favorHinder || 'none';
    const effectiveFavorHinder = VagabondRollBuilder.mergeFavorHinder(
      VagabondRollBuilder.calculateEffectiveFavorHinder(systemState, shiftKey, ctrlKey),
      attackerModifier,
      resistanceFavor ? 'favor' : 'none',
      VagabondRollBuilder.checkFavorVote(actor, 'save'),
      defenseVote
    );

    // Worn Armor's Reflex penalty lives in the Reflex Difficulty (Alpha 3 p. 26,
    // actor-character.mjs) — never subtracted from the roll.
    // A save rolled twice (Dancer Footloose) swaps the base die for `2d20kh`.
    const baseFormula = VagabondRollBuilder.saveBaseDie(actor, saveType);

    // Every vote (defenseRules included) is already merged into effectiveFavorHinder
    const roll = await VagabondRollBuilder.buildAndEvaluateD20WithConditionalHinder(
      actor,
      effectiveFavorHinder,
      false,
      baseFormula
    );

    // Bard Overtuned: a Virtuoso Favor die that lifts the d20 past the threshold grants the Bard Luck
    const { BardHelper } = await import('./bard-helper.mjs');
    await BardHelper.onCheckRolled(actor, roll, 'save');
    const { consumeUsedEffects } = await import('./use-effects.mjs');
    await consumeUsedEffects(actor, 'save');

    return roll;
  }

  /**
   * Remove the highest rolled damage die from the damage roll
   * @param {Object} rollTermsData - Encoded roll terms data
   * @returns {number} New damage total with highest die removed
   * @private
   */
  static _removeHighestDie(rollTermsData) {
    let total = rollTermsData.total;
    let highestDieValue = 0;
    let totalDiceCount = 0;

    // Find all dice terms and their results.
    // Only ACTIVE dice count (inactive results from explosions are not part of the
    // total), and the pre-rolled weakness die is exempt — weakness damage bypasses
    // the save reduction, matching the apply-time path where the weak die lands
    // after the save math.
    for (const term of rollTermsData.terms) {
      if (term.type === 'Die' && term.results) {
        for (const result of term.results) {
          if (result.active === false || result.weakness) continue;
          totalDiceCount++;
          if (result.result > highestDieValue) {
            highestDieValue = result.result;
          }
        }
      }
    }

    // If only one (non-weakness) die was rolled, the save fully negates the base
    // damage — only a pre-rolled weakness die survives (weakness bypasses the
    // save reduction, matching the apply-time weakness path).
    if (totalDiceCount === 1) {
      return this.#sumWeaknessDice(rollTermsData);
    }

    // Subtract highest die
    return Math.max(0, total - highestDieValue);
  }

  /** Sum of active weakness-tagged die results in serialized roll terms. */
  static #sumWeaknessDice(rollTermsData) {
    let sum = 0;
    for (const term of rollTermsData.terms) {
      if (term.type === 'Die' && term.results) {
        for (const result of term.results) {
          if (result.active === false) continue;
          if (result.weakness) sum += result.result;
        }
      }
    }
    return sum;
  }

  /**
   * Post save result to chat
   * @param {Actor} actor - The defending actor
   * @param {string} saveType - 'reflex', 'endure', 'will'
   * @param {Roll} roll - The save roll
   * @param {number} difficulty - Save difficulty
   * @param {boolean} isSuccess - Whether the save succeeded
   * @param {boolean} isCritical - Whether the save was a critical (natural 20)
   * @param {boolean} isHindered - Whether the save was Hindered
   * @param {number} originalDamage - Original damage amount
   * @param {number} saveReduction - Damage prevented by save
   * @param {number} armorReduction - Damage prevented by armor
   * @param {number} finalDamage - Final damage after save/armor
   * @param {string} damageType - Damage type
   * @param {boolean} autoApplied - Whether damage was auto-applied
   * @returns {Promise<ChatMessage>}
   * @private
   */
  static async _postSaveResult(actor, saveType, roll, difficulty, isSuccess, isCritical, isHindered, originalDamage, saveReduction, armorReduction, finalDamage, damageType, autoApplied, statusContext = null, defensePath = null, flankedBonus = 0, extraHtml = '') {
    const saveLabel = this.getConfiguredSaves().find(s => s.key === saveType)?.label
      || game.i18n.localize(`VAGABOND.Saves.${saveType.charAt(0).toUpperCase() + saveType.slice(1)}.name`);

    // Import VagabondChatCard
    const { VagabondChatCard } = await import('./chat-card.mjs');

    const card = new VagabondChatCard()
      .setType('save-roll')
      .setActor(actor)
      .setTitle(`${game.i18n.localize('VAGABOND.Roll.SaveRoll')}: ${saveLabel}`)
      .setSubtitle(actor.name)
      .addRoll(roll, difficulty)
      .setOutcome(isSuccess ? 'PASS' : 'FAIL', isCritical);

    let cardDescription = card.data.description || '';

    if (isCritical) {
      // Pre-render both damage states for the toggle:
      // Crit state: benefit claimed → 0 damage (not affected)
      // Normal state: Luck kept → save-reduced damage
      const critCalcHTML = this._buildDamageCalculation(
        originalDamage, originalDamage, 0, 0,
        damageType, saveType, actor, false, isHindered
      );
      const normalCalcHTML = this._buildDamageCalculation(
        originalDamage, saveReduction, armorReduction, finalDamage,
        damageType, saveType, actor, false, isHindered, defensePath, flankedBonus
      );

      cardDescription += `
        <div class="save-crit-toggle" data-crit-active="true" data-actor-id="${actor.uuid}">
          <div class="crit-state-on">${critCalcHTML}</div>
          <div class="crit-state-off">${normalCalcHTML}</div>
          <div class="save-crit-rule" data-action="toggleCritBenefit" title="${game.i18n.localize('VAGABOND.DefendMechanics.CritToggleHint')}">
            <i class="fa-solid fa-star-of-life"></i>
            <span>
              <strong>${game.i18n.localize('VAGABOND.DefendMechanics.CritTitle')}:</strong>
              ${game.i18n.localize('VAGABOND.DefendMechanics.CritDescription')}
            </span>
          </div>
          ${this.createApplySaveDamageButton(actor.uuid, actor.name, finalDamage, damageType, statusContext, finalDamage)}
        </div>
      `;
    } else {
      // Normal (non-crit) path
      const damageCalculationHTML = this._buildDamageCalculation(
        originalDamage, saveReduction, armorReduction, finalDamage,
        damageType, saveType, actor, autoApplied, isHindered, defensePath, flankedBonus
      );
      cardDescription += damageCalculationHTML;
      if (!autoApplied && finalDamage > 0) {
        cardDescription += this.createApplySaveDamageButton(actor.uuid, actor.name, finalDamage, damageType, statusContext);
      }
    }
    cardDescription += extraHtml;

    card.setDescription(cardDescription);

    return await card.send();
  }

  /**
   * Post simplified save reminder result to chat (no damage)
   * @param {Actor} actor - The defending actor
   * @param {string} saveType - 'reflex', 'endure', 'will'
   * @param {Roll} roll - The save roll
   * @param {number} difficulty - Save difficulty
   * @param {boolean} isSuccess - Whether the save succeeded
   * @param {boolean} isCritical - Whether the save was a critical (natural 20)
   * @param {boolean} isHindered - Whether the save was Hindered
   * @returns {Promise<ChatMessage>}
   * @private
   */
  static async _postSaveReminderResult(actor, saveType, roll, difficulty, isSuccess, isCritical, isHindered) {
    const saveLabel = this.getConfiguredSaves().find(s => s.key === saveType)?.label
      || game.i18n.localize(`VAGABOND.Saves.${saveType.charAt(0).toUpperCase() + saveType.slice(1)}.name`);

    // Import VagabondChatCard
    const { VagabondChatCard } = await import('./chat-card.mjs');

    const card = new VagabondChatCard()
      .setType('save-roll')
      .setActor(actor)
      .setTitle(`${saveLabel} ${game.i18n.localize('VAGABOND.Roll.SaveRoll')}`)
      .setSubtitle(actor.name)
      .addRoll(roll, difficulty)
      .setOutcome(isSuccess ? 'PASS' : 'FAIL', isCritical);

    // Add description explaining what happened
    let descriptionHTML = `<div class="save-reminder-result">`;

    if (isSuccess) {
      descriptionHTML += `<p><strong>Success!</strong> ${actor.name} successfully made their ${saveLabel} save.`;
      if (isCritical) {
        descriptionHTML += ` <strong>(Critical!)</strong>`;
      }
      descriptionHTML += `</p>`;
    } else {
      descriptionHTML += `<p><strong>Failed!</strong> ${actor.name} failed their ${saveLabel} save.`;
      descriptionHTML += `</p>`;
    }

    if (isHindered) {
      descriptionHTML += `<p class="save-hindered-note"><em>This save was Hindered.</em></p>`;
    }

    descriptionHTML += `</div>`;

    // Add crit rule text if critical save
    if (isCritical) {
      descriptionHTML += `
        <div class="save-crit-rule">
          <p>
            <strong>${game.i18n.localize('VAGABOND.DefendMechanics.CritTitle')}:</strong>
            ${game.i18n.localize('VAGABOND.DefendMechanics.CritDescription')}
          </p>
        </div>
      `;
    }

    card.setDescription(descriptionHTML);

    return await card.send();
  }

  /**
   * Build visual damage calculation HTML
   * @param {number} originalDamage - Starting damage
   * @param {number} saveReduction - Damage prevented by save
   * @param {number} armorReduction - Damage prevented by armor
   * @param {number} finalDamage - Final damage
   * @param {string} damageType - Damage type key
   * @param {string} saveType - Save type (reflex/endure/will)
   * @param {Actor} actor - The defending actor
   * @param {boolean} autoApplied - Whether damage was auto-applied
   * @param {boolean} isHindered - Whether the save was hindered
   * @returns {string} HTML string
   * @private
   */
  static _buildDamageCalculation(originalDamage, saveReduction, armorReduction, finalDamage, damageType, saveType, actor, autoApplied, isHindered, defensePath = null, flankedBonus = 0, extra = {}) {
    // Get save icon and label from the configured homebrew saves
    const configuredSave = this.getConfiguredSaves().find(s => s.key === saveType);
    const saveIcon = configuredSave?.icon || 'fa-solid fa-shield';

    // Get damage type icon and label (handle typeless "-" damage)
    let damageTypeIcon = null;
    let damageTypeLabel = '';
    if (damageType && damageType !== '-') {
      damageTypeIcon = CONFIG.VAGABOND?.damageTypeIcons?.[damageType] || 'fa-solid fa-burst';
      damageTypeLabel = game.i18n.localize(CONFIG.VAGABOND.damageTypes[damageType]) || damageType;
    }

    // Build save tooltip with favor/hinder state
    const saveLabel = configuredSave?.label
      || game.i18n.localize(`VAGABOND.Saves.${saveType.charAt(0).toUpperCase() + saveType.slice(1)}.name`);
    const favorHinder = actor.system.favorHinder || 'none';
    const hasActorFavor = (favorHinder === 'favor');
    const hasActorHinder = (favorHinder === 'hinder');

    let saveTooltip = saveLabel;
    if (hasActorFavor && isHindered) {
      // Cancelled out - no modifier
      saveTooltip = `${saveLabel} ${game.i18n.localize('VAGABOND.Roll.SaveRoll')}`;
    } else if (hasActorFavor) {
      saveTooltip = `${saveLabel} ${game.i18n.localize('VAGABOND.Roll.Favored')}`;
    } else if (hasActorHinder || isHindered) {
      saveTooltip = `${saveLabel} ${game.i18n.localize('VAGABOND.Roll.Hindered')}`;
    }

    // Get equipped armor names for tooltip
    let armorTooltip = game.i18n.localize('VAGABOND.Armor.Label');
    const equippedArmor = EquipmentHelper.getWornArmor(actor);
    if (equippedArmor) {
      armorTooltip = `${game.i18n.localize('VAGABOND.Armor.Label')}: ${equippedArmor.name}`;
    }

    // Build calculation line with title separator
    let calculationHTML = `<div class="save-damage-calculation">
      <div class="damage-title">${extra.title ?? game.i18n.localize('VAGABOND.Roll.SaveRoll')}</div>
      <div class="damage-formula-line">
        <span class="damage-component" title="${game.i18n.localize('VAGABOND.Damage.Total')}">
          <i class="fa-solid fa-dice"></i> ${originalDamage}
        </span>`;

    // Add Flanked bonus if any
    if (flankedBonus > 0) {
      calculationHTML += `
        <span class="damage-operator">+</span>
        <span class="damage-component" title="${game.i18n.localize('VAGABOND.StatusConditions.Flanked')}">
          <i class="fas fa-people-arrows"></i> ${flankedBonus}
        </span>`;
    }

    // Add save reduction if any
    if (saveReduction > 0) {
      const saveIconClass = isHindered ? 'save-icon-hindered' : '';
      calculationHTML += `
        <span class="damage-operator">-</span>
        <span class="damage-component" title="${saveTooltip}">
          <i class="${saveIcon} ${saveIconClass}"></i> ${saveReduction}
        </span>`;
    }

    // Defense property: the Defense Weapons' dice
    if (extra.shieldReduction > 0) {
      calculationHTML += `
        <span class="damage-operator">-</span>
        <span class="damage-component" title="${foundry.utils.escapeHTML?.(extra.shieldTitle ?? '') ?? ''}">
          <i class="fa-solid fa-shield-halved"></i> ${extra.shieldReduction}
        </span>`;
    }

    // Add armor reduction if any
    if (armorReduction > 0) {
      calculationHTML += `
        <span class="damage-operator">-</span>
        <span class="damage-component" title="${armorTooltip}">
          <i class="fa-sharp fa-regular fa-shield"></i> ${armorReduction}
        </span>`;
    }

    // Immunity zeroes the damage without armor — show it as its own component
    if (defensePath === 'immune') {
      calculationHTML += `
        <span class="damage-operator">×</span>
        <span class="damage-component" title="${game.i18n.localize('VAGABOND.Damage.Immune') !== 'VAGABOND.Damage.Immune' ? game.i18n.localize('VAGABOND.Damage.Immune') : 'Immune'}">
          <i class="fa-solid fa-ban"></i> 0
        </span>`;
    }

    // Add final damage
    const finalDamageTooltip = damageTypeLabel
      ? `${game.i18n.localize('VAGABOND.Damage.Final')} ${damageTypeLabel}`
      : game.i18n.localize('VAGABOND.Damage.Final');
    const damageTypeIconHTML = damageTypeIcon ? `<i class="${damageTypeIcon} damage-type-icon-large"></i>` : '';
    calculationHTML += `
        <span class="damage-operator">=</span>
        <span class="damage-final" title="${finalDamageTooltip}">
          ${finalDamage} ${damageTypeIconHTML}
        </span>
      </div>`;

    // Add application note if damage was applied
    if (autoApplied) {
      calculationHTML += `
      <div class="damage-application-note">
        damage applied to ${actor.name}'s HP
      </div>`;
    }

    calculationHTML += `</div>`;

    return calculationHTML;
  }

  /**
   * Handle applying restorative effects (healing, recover, recharge)
   * @param {HTMLElement} button - The clicked button
   */
  static async handleApplyRestorative(button) {
    const amount = parseInt(button.dataset.damageAmount);
    const damageType = button.dataset.damageType.toLowerCase();

    // Get targets with fallback system
    const storedTargets = this._getTargetsFromButton(button);

    if (storedTargets.length === 0) {
      ui.notifications.warn('No tokens targeted. Please target at least one token.');
      return;
    }

    // Resolve to actual tokens
    const targetedTokens = this._resolveStoredTargets(storedTargets);

    if (targetedTokens.length === 0) {
      ui.notifications.warn('None of the targeted tokens could be found on this scene.');
      return;
    }

    // Apply restorative effect to each resolved target
    for (const target of targetedTokens) {
      const targetActor = target.actor;
      if (!targetActor) continue;

      // Route through the GM socket relay when the clicking user doesn't own
      // the target (e.g. healing an ally's character) — direct update() would
      // be silently dropped by the server for lack of permission.
      const applyActorField = async (field, value) => {
        if (targetActor.isOwner || game.user.isGM) {
          await targetActor.update({ [field]: value });
        } else {
          const { emitSocket } = await import('./socket-helper.mjs');
          emitSocket('updateActorField', { actorUuid: targetActor.uuid, field, value });
        }
      };

      // Cancellable hook, mirroring the damage-apply path: mutate ctx.amount or
      // return false to skip this target's restorative entirely.
      const _restoreCtx = { actor: targetActor, amount, damageType, sourceItem: null };
      if (Hooks.call('vagabond.preDamageApply', _restoreCtx) === false) continue;
      const amountForTarget = Math.max(0, _restoreCtx.amount);

      // Apply the appropriate restorative effect (resource comes from the
      // homebrew restorative flag — custom restorative types map to hp/fatigue/mana)
      const restoredResource = this.getRestorativeResource(damageType);
      if (restoredResource === 'hp') {
        // Healing: Increase HP (up to max)
        // Sickened (Alpha 3 p. 11): -N to each healing die received, each die floored at 0;
        // plus any flat incoming healing modifier.
        const dieValues = (button.dataset.dieValues || '').split(',').filter(v => v !== '').map(Number);
        const diePenalty = VagabondDamagePipeline.diePenaltyReduction(dieValues, Number(targetActor.system.healingDiePenalty) || 0);
        const healingModifier = targetActor.system.incomingHealingModifier || 0;
        const modifiedAmount = Math.max(0, amountForTarget - diePenalty + healingModifier);

        const currentHP = targetActor.system.health?.value || 0;
        const maxHP = targetActor.system.health?.max || 0;
        const newHP = Math.min(maxHP, currentHP + modifiedAmount);
        const actualHealing = newHP - currentHP;
        await applyActorField('system.health.value', newHP);

        // Luminary Overheal: the part of the healing that did not fit (rolled amount beyond Max HP)
        const healer = TargetHelper.resolveActorRef(button.dataset.actorId);
        const overhealExcess = healer?.system?.overhealExcess === true ? Math.max(0, modifiedAmount - actualHealing) : 0;


        const { VagabondChatCard: VCCHeal } = await import('./chat-card.mjs');
        await VCCHeal.applyResult(targetActor, {
          type: 'heal',
          rawAmount: amount,
          healPenalty: {
            total: diePenalty,
            perDie: Number(targetActor.system.healingDiePenalty) || 0,
            dice: dieValues,
          },
          finalAmount: actualHealing,
          previousValue: currentHP,
          newValue: newHP,
          overhealExcess,
        });
      } else if (restoredResource === 'fatigue') {
        // Recover: Decrease Fatigue (down to 0)
        const currentFatigue = targetActor.system.fatigue || 0;
        const newFatigue = Math.max(0, currentFatigue - amountForTarget);
        const actualRecovery = currentFatigue - newFatigue;
        await applyActorField('system.fatigue', newFatigue);

        const { VagabondChatCard: VCCRecover } = await import('./chat-card.mjs');
        await VCCRecover.applyResult(targetActor, {
          type: 'recover',
          finalAmount: actualRecovery,
          previousValue: currentFatigue,
          newValue: newFatigue,
        });
      } else if (restoredResource === 'mana') {
        // Recharge: Increase Mana (up to max)
        const currentMana = targetActor.system.mana?.value || 0;
        const maxMana = targetActor.system.mana?.max || 0;
        const newMana = Math.min(maxMana, currentMana + amountForTarget);
        const actualRecharge = newMana - currentMana;
        await applyActorField('system.mana.value', newMana);

        const { VagabondChatCard: VCCRecharge } = await import('./chat-card.mjs');
        await VCCRecharge.applyResult(targetActor, {
          type: 'recharge',
          finalAmount: actualRecharge,
          previousValue: currentMana,
          newValue: newMana,
        });
      }
    }

    // Button remains active so effects can be applied to different tokens
  }

  /**
   * Handle "Apply Direct" button - bypass saves
   * @param {HTMLElement} button - The clicked button
   */
  static async handleApplyDirect(button) {
    const damageAmount = parseInt(button.dataset.damageAmount);
    const damageType = button.dataset.damageType;
    const actorId = button.dataset.actorId;
    const itemId = button.dataset.itemId;

    // Get weapon data for material weakness checks
    const sourceActor = TargetHelper.resolveActorRef(actorId);
    const sourceItem = this._resolveSourceItem(sourceActor, itemId);

    // Build source label: weapon → "[Name] Attack", spell/alchemical/NPC action → "[Name]"
    const isWeaponDirect = sourceItem?.type === 'equipment' && sourceItem?.system?.equipmentType === 'weapon';
    const directActionIdxStr = button.dataset.actionIndex;
    const directActionIdx = (directActionIdxStr !== '' && directActionIdxStr != null) ? parseInt(directActionIdxStr) : null;
    const directSourceLabel = sourceItem
      ? (isWeaponDirect ? `${sourceItem.name} Attack` : sourceItem.name)
      : (directActionIdx !== null && !isNaN(directActionIdx) && sourceActor?.system?.actions?.[directActionIdx]?.name)
        ? sourceActor.system.actions[directActionIdx].name
        : '';
    const directSourceIcon = sourceItem?.img ?? sourceActor?.img ?? null;

    // Get targets with fallback system
    const storedTargets = this._getTargetsFromButton(button);

    if (storedTargets.length === 0) {
      ui.notifications.warn('No tokens targeted. Please target at least one token.');
      return;
    }

    // Resolve to actual tokens
    const targetedTokens = this._resolveStoredTargets(storedTargets);

    if (targetedTokens.length === 0) {
      ui.notifications.warn('None of the targeted tokens could be found on this scene.');
      return;
    }

    // Apply damage to each resolved target. Cleave no longer splits damage — every
    // Target takes the full rolled amount (the die was already stepped down at roll
    // time, see roll-handler.mjs).
    for (let i = 0; i < targetedTokens.length; i++) {
      const target = targetedTokens[i];
      const targetActor = target.actor;
      if (!targetActor) continue;

      const effectiveDamage = damageAmount;

      // Calculate final damage (armor/immune/weak)
      const directBreakdown = this.calculateFinalDamageDetailed(targetActor, effectiveDamage, damageType, sourceItem, { attackerActor: sourceActor, isCrit: button.dataset.attackWasCrit === 'true' });
      const baseAfterFinalDirect = directBreakdown.final;
      // RAW: Weak — bypass Armor/Immune + deal an extra damage die
      let finalDamage = baseAfterFinalDirect;
      const weaknessPreRolledDirect = button.dataset.weaknessPreRolled === 'true';
      if (!weaknessPreRolledDirect && this._isWeakTo(targetActor, damageType, sourceItem, sourceActor)) {
        const dieSize = this._getDamageSourceDieSize(sourceItem, directActionIdx, sourceActor);
        const weakRoll = new Roll(`1d${dieSize}`);
        await weakRoll.evaluate();
        finalDamage += weakRoll.total;
      }

      const _directPreCtx = { actor: targetActor, amount: finalDamage, damageType, sourceItem };
      if (Hooks.call('vagabond.preDamageApply', _directPreCtx) === false) continue;
      const _directFinal = Math.max(0, _directPreCtx.amount);
      const currentHP = targetActor.system.health?.value || 0;
      const newHP = Math.max(0, currentHP - _directFinal);
      if (targetActor.isOwner || game.user.isGM) {
        await targetActor.update({ 'system.health.value': newHP });
      } else {
        const { emitSocket } = await import('./socket-helper.mjs');
        emitSocket('applyDamage', { actorUuid: targetActor.uuid, newHp: newHP });
      }
      Hooks.callAll('vagabond.postDamageApply', { actor: targetActor, amount: _directFinal, incoming: effectiveDamage, damageType, sourceItem, attackerActor: sourceActor, oldHp: currentHP, newHp: newHP });

      // Post damage result to chat
      const { VagabondChatCard: VCCDirect } = await import('./chat-card.mjs');
      await VCCDirect.applyResult(targetActor, {
        type: 'damage',
        rawAmount: effectiveDamage,
        flankedBonus: directBreakdown.flankedBonus,
        armorReduction: directBreakdown.armorReduction,
        finalAmount: _directFinal,
        damageType,
        previousValue: currentHP,
        newValue: newHP,
        sourceName: directSourceLabel,
        sourceIcon: directSourceIcon,
      });

      // Process on-hit status effects (single source of truth; crit entries replace same-statusId normals)
      const { StatusHelper } = await import('./status-helper.mjs');
      const actionIndexRaw = button.dataset.actionIndex;
      const actionIdx = (actionIndexRaw !== '' && actionIndexRaw != null) ? parseInt(actionIndexRaw) : null;
      const isCritical = button.dataset.isCritical === 'true';
      const { entries: allStatusEntries, coatingEntries } = this.resolveIncomingStatusEntries({
        sourceActor, sourceItem, actionIdx, attackWasCrit: isCritical,
      });
      if (allStatusEntries.length > 0) {
        const sourceName = sourceItem?.name ?? (actionIdx !== null ? sourceActor?.system?.actions?.[actionIdx]?.name : '') ?? '';
        const damageWasBlocked = finalDamage === 0;
        const sourceActorTokenName3 = canvas.tokens?.placeables?.find(t => t.actor?.id === sourceActor?.id)?.document.name || sourceActor?.name || '';
        // Apply Direct bypasses all saves — statuses are applied unconditionally
        const statusResults = await StatusHelper.processCausedStatuses(
          targetActor, allStatusEntries, damageWasBlocked, sourceName, { skipSaveRoll: true, sourceActorName: sourceActorTokenName3 }
        );
        if (coatingEntries.length > 0 && sourceActor.items.has(sourceItem.id)) {
          await sourceItem.update({
            'system.coating.charges': 0,
            'system.coating.sourceName': '',
            'system.coating.causedStatuses': [],
          });
        }
        const { VagabondChatCard } = await import('./chat-card.mjs');
        await VagabondChatCard.statusResults(statusResults, targetActor, sourceName, sourceItem?.img ?? null);
      }
    }

    // Button remains active so damage can be applied to different tokens
  }

  /**
   * Handle "Apply to Target" button from save result cards
   * Applies pre-calculated damage (after save/armor/immunities) to the specific character who rolled the save
   * @param {HTMLElement} button - The clicked button
   */
  static async handleApplySaveDamage(button) {
    const actorId = button.dataset.actorId;
    const actorName = button.dataset.actorName;
    const finalDamage = parseInt(button.dataset.damageAmount);
    const damageType = button.dataset.damageType;

    // Get the actor who rolled the save
    const actor = TargetHelper.resolveActorRef(actorId);
    if (!actor) {
      ui.notifications.error('Character not found!');
      return;
    }

    // Apply the pre-calculated damage to this specific character
    const _savePreCtx = { actor, amount: finalDamage, damageType, sourceItem: null };
    if (Hooks.call('vagabond.preDamageApply', _savePreCtx) === false) return;
    const _saveFinal = Math.max(0, _savePreCtx.amount);
    const currentHP = actor.system.health?.value || 0;
    const newHP = Math.max(0, currentHP - _saveFinal);
    if (actor.isOwner || game.user.isGM) {
      await actor.update({ 'system.health.value': newHP });
    } else {
      const { emitSocket } = await import('./socket-helper.mjs');
      emitSocket('applyDamage', { actorUuid: actor.uuid, newHp: newHP });
    }
    Hooks.callAll('vagabond.postDamageApply', { actor, amount: _saveFinal, damageType, sourceItem: null, oldHp: currentHP, newHp: newHP });

    // Update button text and disable
    const icon = button.querySelector('i');
    button.textContent = `Applied to ${actorName}`;
    if (icon) button.prepend(icon); // Keep the icon
    button.disabled = true;


    // Build source label from stored source attrs (set when statusContext was provided)
    const saveSourceActor = TargetHelper.resolveActorRef(button.dataset.sourceActorId);
    const saveSourceItem = saveSourceActor?.items.get(button.dataset.sourceItemId);
    const isSaveWeapon = saveSourceItem?.type === 'equipment' && saveSourceItem?.system?.equipmentType === 'weapon';
    const saveSourceLabel = saveSourceItem
      ? (isSaveWeapon ? `${saveSourceItem.name} Attack` : saveSourceItem.name)
      : '';
    const saveSourceIcon = saveSourceItem?.img ?? saveSourceActor?.img ?? null;

    // Post damage result to chat
    const { VagabondChatCard: VCCSave } = await import('./chat-card.mjs');
    await VCCSave.applyResult(actor, {
      type: 'damage',
      rawAmount: finalDamage,
      finalAmount: finalDamage,
      damageType,
      previousValue: currentHP,
      newValue: newHP,
      sourceName: saveSourceLabel,
      sourceIcon: saveSourceIcon,
    });

    // Process on-hit statuses deferred from handleSaveRoll (autoApply was OFF)
    const sourceActorId = button.dataset.sourceActorId;
    if (sourceActorId) {
      const saveType       = button.dataset.saveType;
      const saveSuccess    = button.dataset.saveSuccess === 'true';
      const saveDifficulty = parseInt(button.dataset.saveDifficulty);
      const saveTotal      = parseInt(button.dataset.saveTotal);
      const sourceItemId   = button.dataset.sourceItemId;
      const sourceActionIndexRaw = button.dataset.sourceActionIndex;
      const sourceActionIdx = (sourceActionIndexRaw !== '' && sourceActionIndexRaw != null) ? parseInt(sourceActionIndexRaw) : null;
      const attackWasCrit  = button.dataset.attackWasCrit === 'true';

      const sourceActor = TargetHelper.resolveActorRef(sourceActorId);
      const sourceItem  = this._resolveSourceItem(sourceActor, sourceItemId);

      const { entries: allStatusEntries, coatingEntries } = this.resolveIncomingStatusEntries({
        sourceActor, sourceItem, actionIdx: sourceActionIdx, attackWasCrit,
      });

      if (allStatusEntries.length > 0) {
        const { StatusHelper } = await import('./status-helper.mjs');
        const { VagabondChatCard } = await import('./chat-card.mjs');
        const damageWasBlocked = finalDamage === 0;
        const preRolledSave = { saveType, success: saveSuccess, total: saveTotal, difficulty: saveDifficulty, roll: null };
        const sourceName = sourceItem?.name ?? (sourceActionIdx !== null ? sourceActor?.system?.actions?.[sourceActionIdx]?.name : '') ?? '';
        const sourceActorTokenName4 = canvas.tokens?.placeables?.find(t => t.actor?.id === sourceActor?.id)?.document.name || sourceActor?.name || '';
        const statusResults = await StatusHelper.processCausedStatuses(
          actor, allStatusEntries, damageWasBlocked, sourceName, { preRolledSave, sourceActorName: sourceActorTokenName4 }
        );
        if (coatingEntries.length > 0 && sourceActor.items.has(sourceItem.id)) {
          await sourceItem.update({
            'system.coating.charges': 0,
            'system.coating.sourceName': '',
            'system.coating.causedStatuses': [],
          });
        }
        await VagabondChatCard.statusResults(statusResults, actor, sourceName, sourceItem?.img ?? null);
      }
    }
  }

  /**
   * Handle "Grapple" button — apply Restrained to targets and Grappling (with speed penalty) to source.
   * @param {HTMLElement} button
   */
  static async handleGrapple(button) {
    const actorId = button.dataset.actorId;
    const sourceActor = TargetHelper.resolveActorRef(actorId);
    if (!sourceActor) return;

    if (!sourceActor.isOwner && !game.user.isGM) {
      ui.notifications.warn("You don't have permission to use this action.");
      return;
    }

    const storedTargets = this._getTargetsFromButton(button);
    const targetedTokens = this._resolveStoredTargets(storedTargets);

    if (!targetedTokens.length) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Grapple.NoTargets'));
      return;
    }

    const SIZE_ORDER = { small: 0, medium: 1, large: 2, huge: 3, giant: 4, colossal: 5 };
    const getSize = a => SIZE_ORDER[a.type === 'npc' ? (a.system.size || 'medium') : (a.system.attributes?.size || 'medium')] ?? 1;
    const sourceSize = getSize(sourceActor);

    // Find the status definitions to clone their name/icon/changes
    const restrainedDef = CONFIG.statusEffects.find(e => e.id === 'restrained');
    const grapplingDef = CONFIG.statusEffects.find(e => e.id === 'grappling');

    const targetUuids = [];
    for (const token of targetedTokens) {
      const targetActor = token.actor;
      if (!targetActor) continue;

      if (!targetActor.isOwner && !game.user.isGM) {
        ui.notifications.warn(`You don't have permission to modify ${targetActor.name}.`);
        continue;
      }

      if (targetActor.statuses?.has('restrained')) {
        continue;
      }

      // Apply Restrained to target with grapple-link flags (bypasses the normal toggleStatusEffect
      // so we can attach metadata needed for bidirectional cleanup)
      await targetActor.createEmbeddedDocuments('ActiveEffect', [{
        name: game.i18n.localize(restrainedDef?.name ?? 'VAGABOND.StatusConditions.Restrained'),
        img: restrainedDef?.img ?? 'icons/magic/control/debuff-chains-shackles-movement-blue.webp',
        statuses: ['restrained'],
        // v14 tokens only draw non-temporary effects set to ALWAYS
        // (toggleStatusEffect sets this; a manual create must too)
        showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
        system: { changes: restrainedDef?.changes ?? [] },
        flags: { vagabond: { fromGrapple: true, grappleSourceUuid: sourceActor.uuid } }
      }]);

      targetUuids.push(targetActor.uuid);
    }

    if (!targetUuids.length) return;

    // Determine speed penalty — halved unless the first target is smaller than the source
    const firstTargetActor = targetedTokens[0]?.actor;
    const targetSize = firstTargetActor ? getSize(firstTargetActor) : 1;
    const applySpeedPenalty = targetSize >= sourceSize;

    // Compute the speed penalty as a static AE change (based on current speed at grapple time)
    const speedChanges = [];
    if (applySpeedPenalty) {
      if (sourceActor.type === 'character') {
        const currentSpeed = sourceActor.system.speed?.base || 25;
        speedChanges.push({
          key: 'system.speed.bonus',
          type: "add",
          value: String(-Math.floor(currentSpeed / 2))
        });
      } else {
        const currentSpeed = sourceActor.system.speed || 0;
        speedChanges.push({
          key: 'system.speed',
          type: "add",
          value: String(-Math.floor(currentSpeed / 2))
        });
      }
    }

    // Apply Grappling to source — stores target UUIDs for cleanup
    await sourceActor.createEmbeddedDocuments('ActiveEffect', [{
      name: game.i18n.localize(grapplingDef?.name ?? 'VAGABOND.StatusConditions.Grappling'),
      img: grapplingDef?.img ?? 'icons/skills/melee/hand-grip-staff-blue.webp',
      statuses: ['grappling'],
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
      system: { changes: speedChanges },
      flags: { vagabond: { grappling: { targetUuids } } }
    }]);

    button.disabled = true;
  }
}
