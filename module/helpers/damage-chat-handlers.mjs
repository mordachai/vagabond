import { VagabondDamageHelper } from './damage-helper.mjs';
import { TargetHelper } from './target-helper.mjs';
import { VagabondDamagePipeline } from './damage-pipeline.mjs';
import { AnimationBridge } from './animation-bridge.mjs';
import { FeatureRules } from './feature-rules.mjs';
import { StatusHelper } from './status-helper.mjs';
import { VagabondRollBuilder } from './roll-builder.mjs';
import { DefenseHelper } from './defense-helper.mjs';
import { GMRelay } from './gm-relay.mjs';
import { consumeUsedEffects } from './use-effects.mjs';
import { EquipmentHelper } from './equipment-helper.mjs';
import { VagabondChatCard } from './chat-card.mjs';

/**
 * Damage chat-card button handlers: Roll Damage, Saves, Defense / Protect, Apply buttons,
 * and the result cards they post. Button builders and damage math stay in
 * VagabondDamageHelper; this layer sits above VagabondChatCard.
 */
export class VagabondDamageChatHandlers {
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

    const storedTargetsForWeak = VagabondDamageHelper._getTargetsFromButton(button);
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
    VagabondDamageHelper._playPendingFx(game.messages.get(messageId), actor, item, storedTargetsForWeak);

    // Unified damage pipeline (die-size bump is pre-baked into damageFormula upstream)
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

    // Attack card animated by the system (AnimationBridge): its Automated Animations play now,
    // with the damage — and AA's own detection must skip the damage card too
    const aaManaged = !!game.messages.get(messageId)?.flags?.vagabond?.aaManaged && item?.type !== 'spell';

    // Post a SEPARATE damage message instead of updating the attack card
    // This prevents double-rolling issues and matches the save result flow
    // The Cast card's Damage / Effect context carries over to the damage card it spawns
    await this.postDamageResult(damageRoll, damageTypeLabel, context.isCritical, actor, item, finalDamageTypeKey, attackType, critStatBonus, damageRoll._weaknessPreRolled ?? false, storedTargetsForWeak, hasCritToggle, !critBenefitOn, VagabondDamageHelper.spellCastFromButton(button), aaManaged ? AnimationBridge.FLAGS : null);
    // A thrown last Alchemical is gone by now — its card snapshot still names the animation
    if (aaManaged) AnimationBridge.play({ actor, item: item ?? VagabondDamageHelper._resolveSourceItem(actor, itemId), targets: storedTargetsForWeak, hit: true });
  }


  /**
   * Post a separate damage result message with save buttons
   * Uses existing createActionCard() to avoid code duplication
   */
  static async postDamageResult(damageRoll, damageType, isCritical, actor, item, damageTypeKey = null, attackType = 'melee', critStatBonus = 0, weaknessPreRolled = false, targetsAtRollTime = [], critLocked = false, critBenefitOff = false, spellCast = null, extraFlags = null) {

    return await VagabondChatCard.createActionCard({
      extraFlags,
      actor,
      item,
      title: `${game.i18n.localize('VAGABOND.Roll.DamageRoll')}: ${item?.name || 'Attack'}`,
      damageRoll,
      damageType: damageTypeKey || damageType,
      hasDefenses: !VagabondDamagePipeline.isRestorativeDamageType(damageTypeKey || damageType),
      attackType,
      rollData: isCritical ? { isCritical: true, critStatBonus, critLocked, critBenefitOff } : null,
      weaknessPreRolled,
      targetsAtRollTime,
      spellCast,
    });
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
    const targetsAtRollTime = VagabondDamageHelper._getTargetsFromButton(button);

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
    const isRestorative = VagabondDamagePipeline.isRestorativeDamageType(damageType);

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
    if (!actor.isOwner && !game.user.isGM) {
      ui.notifications.warn("You don't have permission to roll damage for this actor.");
      return;
    }

    const action = actor.system.actions[actionIndex] ?? actor.system.abilities?.[actionIndex];
    if (!action) {
      ui.notifications.error('Action not found!');
      return;
    }

    // Get targets from button (captured at action roll time)
    const targetsAtRollTime = VagabondDamageHelper._getTargetsFromButton(button);

    let damageRoll;
    let finalDamage;

    if (damageMode === 'flat') {
      // Flat damage - authored value stays pure, no bonus fields apply (only a Druid's Beast form
      // adds its Savagery bonus, which belongs to the Druid, not the statblock; Frightened still
      // costs its per-die penalty, counted from the action's dice)
      finalDamage = VagabondDamagePipeline.flatDamageAfterDiePenalty(actor,
        parseInt(damageValue) + FeatureRules.sum('npcDamageBonus', actor), action.rollDamage);
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


    static async postNPCActionDamage(damageRoll, finalDamage, damageTypeLabel, actor, action, damageTypeKey = null, attackType = 'melee', targetsAtRollTime = [], actionIndex = null) {
      // 1. Dynamic Import to avoid circular dependency issues

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
          hasDefenses: !VagabondDamagePipeline.isRestorativeDamageType(damageTypeKey || 'physical'),
          targetsAtRollTime,
          actionIndex,
          extraFlags: AnimationBridge.FLAGS,
      });
      // NPCs auto-hit: the action's Automated Animation plays with its damage
      AnimationBridge.play({ actor, item: AnimationBridge.npcActionItem(actor, action), targets: targetsAtRollTime, hit: true });
    }


  /**
   * Apply Effect button (effect-only Spell Cast): every Effect status of the Spell onto the
   * card's Targets, no Saves (skipSaveRoll — same authority as Apply Direct). Stacking
   * statuses (Burning) are keyed to this caster + Spell.
   * @param {HTMLElement} button
   */
  static async handleApplySpellEffect(button) {
    const sourceActor = TargetHelper.resolveActorRef(button.dataset.actorId);
    const spell = VagabondDamageHelper._resolveSourceItem(sourceActor, button.dataset.itemId);
    if (!sourceActor || !spell) return;
    const entries = VagabondDamageHelper._spellEffectEntries(spell, VagabondDamageHelper.spellCastFromButton(button) ?? { effect: true, damage: false },
      button.dataset.isCritical === 'true', sourceActor);
    if (!entries.length) return;

    const storedTargets = VagabondDamageHelper._getTargetsFromButton(button);
    if (!storedTargets.length) {
      ui.notifications.warn('No tokens targeted. Please target at least one token.');
      return;
    }
    const sourceActorName = canvas.tokens?.placeables?.find(t => t.actor?.id === sourceActor.id)?.document.name || sourceActor.name;
    const sourceKey = StatusHelper.sourceKeyFor(sourceActor, spell);
    for (const token of VagabondDamageHelper._resolveStoredTargets(storedTargets)) {
      const targetActor = token.actor;
      if (!targetActor) continue;
      const results = await StatusHelper.processCausedStatuses(
        targetActor, entries, false, spell.name, { skipSaveRoll: true, sourceActorName, sourceKey }
      );
      await VagabondChatCard.statusResults(results, targetActor, spell.name, spell.img ?? null);
    }
  }


  /**
   * Whether any incoming status entry gated by this save type is resisted by the target,
   * granting an independent Favor vote on the save. Must run BEFORE the dice roll.
   * @returns {Promise<boolean>}
   */
  static async _hasStatusResistanceForSave(targetActor, saveType, { sourceActor, sourceItem, actionIdx, attackWasCrit = false, spellCast = null }) {
    const { entries } = VagabondDamageHelper.resolveIncomingStatusEntries({ sourceActor, sourceItem, actionIdx, attackWasCrit, spellCast });
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
    const storedTargets = VagabondDamageHelper._getTargetsFromButton(button);

    if (!game.user.isGM) {
      // PLAYER: Use stored targets if available, otherwise smart single-char detection
      if (storedTargets.length > 0) {
        const targetTokens = VagabondDamageHelper._resolveStoredTargets(storedTargets);
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
    const targetTokens = VagabondDamageHelper._resolveStoredTargets(storedTargets);
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
   * @param {{sourceItem?: Item|null, actionIdx?: number|null, attackWasCrit?: boolean, spellCast?: object|null}} sourceCtx
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
    // Statuses that fail this Save outright (Incapacitated → Reflex, Dead → all)
    const autoFail = VagabondRollBuilder.autoFails(targetActor, saveType);
    const isSuccess = !autoFail && saveRoll.total >= difficulty;
    const critNumber = VagabondRollBuilder.calculateCritThreshold(targetActor.getRollData(), saveType);
    const isCritical = !autoFail && VagabondChatCard.isRollCritical(saveRoll, critNumber);

    // Passing a Save against an attack (Fighter Momentum)
    if (isSuccess) FeatureRules.run('defended', targetActor);

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
    // Spell Damage / Effect split: what the Cast behind this card included
    const spellCast = VagabondDamageHelper.spellCastFromButton(button);

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
        { sourceItem: VagabondDamageHelper._resolveSourceItem(sourceActor, itemId), actionIdx, attackWasCrit, spellCast },
        event
      );

      // Calculate damage breakdown for display
      let damageAfterSave = effectiveDamageAmount;
      let saveReduction = 0;
      if (isSuccess) {
        damageAfterSave = this._removeHighestDie(rollTermsData);
        saveReduction = effectiveDamageAmount - damageAfterSave;
      }
      // Ward upcast rolled against this damage for this Target (before Armor)
      const ward = VagabondDamageHelper.preArmorReduction(button, targetActor.uuid);
      const wardCut = Math.min(ward.amount, damageAfterSave);
      const damageAfterWard = damageAfterSave - wardCut;

      // Apply armor/immune/weak modifiers and track armor reduction.
      // The actual rolled dice count (from the serialized roll terms) feeds the
      // berserk per-die reduction so grip/bonus/explosion dice are counted correctly.
      const sourceItem = VagabondDamageHelper._resolveSourceItem(sourceActor, itemId);
      const rolledDiceCount = rollTermsData.terms.reduce((n, t) =>
        n + (t.type === 'Die' ? (t.results ?? []).filter(r => r.active !== false).length : 0), 0);
      const damageBreakdown = VagabondDamageHelper.calculateFinalDamageDetailed(
        targetActor, damageAfterWard, damageType, sourceItem, { rolledDiceCount, attackerActor: sourceActor, isCrit: attackWasCrit }
      );
      const baseAfterFinal = damageBreakdown.final;
      const armorReduction = damageBreakdown.armorReduction;
      const flankedBonus = damageBreakdown.flankedBonus;
      // RAW: Weak — bypass Armor/Immune + deal an extra damage die
      let finalDamage = baseAfterFinal;
      const weaknessPreRolledSave = button.dataset.weaknessPreRolled === 'true';
      if (!weaknessPreRolledSave && VagabondDamageHelper._isWeakTo(targetActor, damageType, sourceItem, sourceActor)) {
        const dieSize = VagabondDamageHelper._getDamageSourceDieSize(sourceItem, actionIdx, sourceActor);
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
          Hooks.callAll('vagabond.postDamageApply', { actor: targetActor, amount: _autoFinal, incoming: damageAfterWard, rolledDiceCount, damageType, sourceItem, attackerActor: sourceActor, oldHp: currentHP, newHp: newHP });
        }
      }

      // Collect on-hit status entries (single source of truth: item/action fallback + crit merge + coating + passives)
      const { entries: allStatusEntries, coatingEntries } = VagabondDamageHelper.resolveIncomingStatusEntries({
        sourceActor, sourceItem, actionIdx, attackWasCrit, spellCast,
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
        spellCast,
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
          ? VagabondDamageHelper.createProtectButtons(targetActor, {
              incoming: damageAfterWard, damageType, actorId, itemId, actionIdx, attackWasCrit,
              priorFinal: finalDamage, weakExtra: finalDamage - baseAfterFinal, autoApplied: autoApply,
            })
          : '',
        {
          ward: { amount: wardCut, title: ward.title },
          // A Ward rolled after this card recomputes from here (WardHelper.wardOff)
          resultFlags: { damageResult: {
            damageMessageId: VagabondDamageHelper.messageIdOf(button), defenderUuid: targetActor.uuid,
            incoming: damageAfterSave, wardAmount: wardCut, priorFinal: finalDamage,
            weakExtra: finalDamage - baseAfterFinal, autoApplied: autoApply, damageType,
            sourceActorId: actorId, sourceItemId: itemId, attackWasCrit,
          } },
        }
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
          targetActor, allStatusEntries, damageWasBlocked, sourceItem?.name ?? '', { preRolledSave, sourceActorName: sourceActorTokenName1, sourceKey: StatusHelper.sourceKeyFor(sourceActor, sourceItem, actionIdx) }
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
    // Spell Damage / Effect split: what the Cast behind this card included
    const spellCast = VagabondDamageHelper.spellCastFromButton(button);

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
        { sourceItem: VagabondDamageHelper._resolveSourceItem(sourceActor, itemId), actionIdx, spellCast },
        event
      );

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
      const sourceItem = VagabondDamageHelper._resolveSourceItem(sourceActor, itemId);
      const { entries: allStatusEntries, coatingEntries } = VagabondDamageHelper.resolveIncomingStatusEntries({
        sourceActor, sourceItem, actionIdx, spellCast,
      });
      if (allStatusEntries.length > 0) {
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
          targetActor, allStatusEntries, false, sourceName, { preRolledSave, sourceActorName: sourceActorTokenName2, sourceKey: StatusHelper.sourceKeyFor(sourceActor, sourceItem, actionIdx) }
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
    const sourceItem = VagabondDamageHelper._resolveSourceItem(sourceActor, itemId);
    const slot = Math.max(1, parseInt(button.dataset.defenseSlot) || 1);
    // Spell Damage / Effect split: what the Cast behind this card included
    const spellCast = VagabondDamageHelper.spellCastFromButton(button);


    for (const targetActor of actorsToRoll) {
      if (!targetActor || targetActor.type === 'npc') continue;
      if (!targetActor.isOwner && !game.user.isGM) continue;
      const weapons = DefenseHelper.defenseWeapons(targetActor);
      const weapon = weapons[slot - 1] ?? weapons[0];
      if (!weapon) continue; // Only defenders holding a Defense weapon can use it

      // The Check replaces the Reflex Save: Save-side votes apply (attacker modifier, status resistance)
      const resistanceFavor = await this._hasStatusResistanceForSave(targetActor, 'reflex', {
        sourceActor, sourceItem, actionIdx, attackWasCrit, spellCast,
      });
      const attackType = button.dataset.attackType || 'melee';
      const check = await DefenseHelper.rollCheck(targetActor, weapon, {
        attackerModifier: await this._attackerSaveVote(sourceActor, attackType), resistanceFavor, event,
        // The defender's Reflex-Save rules (CONFIG.VAGABOND.defenseRules, e.g. Prone) apply to the Check
        defenseVote: this._evaluateDefenseRules('reflex', attackType, targetActor, { sourceActor }),
      });
      // The Check stands in for the Reflex Save: a status that fails Reflex (Incapacitated) fails it
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
        FeatureRules.run('defended', targetActor);
      }
      const shieldReduction = shieldRoll?.total ?? 0;
      // Ward upcast rolled against this damage for this Target (before Armor, after the Defense dice)
      const ward = VagabondDamageHelper.preArmorReduction(button, targetActor.uuid);
      const afterShield = Math.max(0, damageAmount - shieldReduction);
      const wardCut = Math.min(ward.amount, afterShield);

      const breakdown = VagabondDamageHelper.calculateFinalDamageDetailed(
        targetActor, afterShield - wardCut, damageType, sourceItem, { attackerActor: sourceActor, isCrit: attackWasCrit }
      );
      let finalDamage = breakdown.final;
      if (!weaknessPreRolled && VagabondDamageHelper._isWeakTo(targetActor, damageType, sourceItem, sourceActor)) {
        const weakRoll = new Roll(`1d${VagabondDamageHelper._getDamageSourceDieSize(sourceItem, actionIdx, sourceActor)}`);
        await weakRoll.evaluate();
        finalDamage += weakRoll.total;
      }
      const weakExtra = finalDamage - breakdown.final;

      const autoApply = game.settings.get('vagabond', 'autoApplySaveDamage');
      if (autoApply) await VagabondDamageHelper._applyDamageToActor(targetActor, finalDamage, damageType, sourceItem, sourceActor);

      const { entries: allStatusEntries, coatingEntries } = VagabondDamageHelper.resolveIncomingStatusEntries({
        sourceActor, sourceItem, actionIdx, attackWasCrit, spellCast,
      });
      const statusContext = allStatusEntries.length > 0 ? {
        sourceActorId: actorId, sourceItemId: itemId, sourceActionIndex: actionIdx,
        saveType: 'reflex', saveSuccess: check.isSuccess, saveDifficulty: check.difficulty,
        saveTotal: check.roll.total, attackWasCrit, spellCast,
      } : null;

      // A failed Check is a failed Reflex Save → Close Protectors may step in
      const protectHtml = check.isSuccess ? '' : VagabondDamageHelper.createProtectButtons(targetActor, {
        incoming: Math.max(0, damageAmount - wardCut), damageType, actorId, itemId, actionIdx, attackWasCrit,
        priorFinal: finalDamage, weakExtra, autoApplied: autoApply,
      });

      const message = await this._postDefenseResult(targetActor, {
        title: `${game.i18n.localize('VAGABOND.Chat.DefenseCheck')}: ${weapon.name}`,
        check, shieldRoll, shieldWeapons, incoming: damageAmount, shieldReduction,
        armorReduction: breakdown.armorReduction, finalDamage, damageType, path: breakdown.path,
        flankedBonus: breakdown.flankedBonus, autoApplied: autoApply,
        applyButton: !autoApply && finalDamage > 0
          ? VagabondDamageHelper.createApplySaveDamageButton(targetActor.uuid, targetActor.name, finalDamage, damageType, statusContext)
          : '',
        extraHtml: protectHtml,
        ward: { amount: wardCut, title: ward.title },
        resultFlags: { damageResult: {
          damageMessageId: VagabondDamageHelper.messageIdOf(button), defenderUuid: targetActor.uuid,
          incoming: afterShield, wardAmount: wardCut, priorFinal: finalDamage, weakExtra, autoApplied: autoApply,
          damageType, sourceActorId: actorId, sourceItemId: itemId, attackWasCrit,
        } },
      });
      if (check.isCritical) await VagabondChatCard._grantLuckOnCrit(targetActor, message, 'Critical');

      if (autoApply && allStatusEntries.length > 0) {
        const sourceName = sourceItem?.name ?? (actionIdx !== null ? sourceActor?.system?.actions?.[actionIdx]?.name : '') ?? '';
        const sourceActorTokenName = canvas.tokens?.placeables?.find(t => t.actor?.id === sourceActor?.id)?.document.name || sourceActor?.name || '';
        const preRolledSave = { saveType: 'reflex', roll: check.roll, total: check.roll.total, success: check.isSuccess, difficulty: check.difficulty };
        const statusResults = await StatusHelper.processCausedStatuses(
          targetActor, allStatusEntries, finalDamage === 0, sourceName, { preRolledSave, sourceActorName: sourceActorTokenName, sourceKey: StatusHelper.sourceKeyFor(sourceActor, sourceItem, actionIdx) }
        );
        if (coatingEntries.length > 0 && sourceActor?.items.has(sourceItem?.id)) {
          await sourceItem.update({ 'system.coating.charges': 0, 'system.coating.causedStatuses': [] });
        }
        await VagabondChatCard.statusResults(statusResults, targetActor, sourceName, sourceItem?.img ?? null);
      }
    }
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
    const sourceItem = VagabondDamageHelper._resolveSourceItem(sourceActor, button.dataset.sourceItemId);

    const check = await DefenseHelper.rollCheck(protector, weapon, { event });
    let shieldRoll = null;
    let shieldWeapons = [];
    if (check.isSuccess) {
      shieldWeapons = DefenseHelper.reductionWeapons(protector, weapon);
      shieldRoll = await VagabondDamagePipeline.rollDefenseDice(protector, shieldWeapons);
      await DefenseHelper.spendPatience(protector, shieldWeapons);
    }
    const shieldReduction = shieldRoll?.total ?? 0;
    const breakdown = VagabondDamageHelper.calculateFinalDamageDetailed(
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
        GMRelay.send('vagabond.applyDamage', { actorUuid: defender.uuid, newHp });
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
        ? VagabondDamageHelper.createApplySaveDamageButton(defender.uuid, defender.name, finalDamage, damageType, null)
        : '',
      extraHtml: `<p class="defense-note">${note}</p>`,
    });
    if (check.isCritical) {
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
    const damageActor = o.damageActor ?? actor;
    const card = new VagabondChatCard()
      .setType('save-roll')
      .setActor(actor)
      .setTitle(o.title)
      .setSubtitle(actor.name)
      .addRoll(o.check.roll, o.check.difficulty)
      .setOutcome(o.check.isSuccess ? 'PASS' : 'FAIL', o.check.isCritical);

    const names = o.shieldName ?? o.shieldWeapons.map(w => w.name).join(' + ');
    const shieldTitle = o.shieldRoll
      ? `${names}: ${o.shieldRoll.formula}${o.shieldRoll._perDieBonusTotal ? ` + ${o.shieldRoll._perDieBonusTotal}` : ''} = ${o.shieldReduction}`
      : '';
    const calc = this._buildDamageCalculation(
      o.incoming, 0, o.armorReduction, o.finalDamage, o.damageType, 'reflex', damageActor,
      o.autoApplied, false, o.path, o.flankedBonus,
      { title: o.calcTitle ?? game.i18n.localize('VAGABOND.Chat.Defense'), shieldReduction: o.shieldReduction, shieldTitle,
        ...(o.ward?.amount > 0 ? { wardReduction: o.ward.amount, wardTitle: o.ward.title } : {}) }
    );
    card.setDescription((card.data.description || '') + calc + (o.applyButton || '') + (o.extraHtml || ''));
    if (o.resultFlags) card.data.extraFlags = o.resultFlags;
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
    await FeatureRules.run('checkRolled', actor, roll, 'save');
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
  static async _postSaveResult(actor, saveType, roll, difficulty, isSuccess, isCritical, isHindered, originalDamage, saveReduction, armorReduction, finalDamage, damageType, autoApplied, statusContext = null, defensePath = null, flankedBonus = 0, extraHtml = '', opts = {}) {
    // opts.ward = {amount, title}: Ward upcast taken off before Armor; opts.resultFlags: extra flags.vagabond
    const wardExtra = opts.ward?.amount > 0 ? { wardReduction: opts.ward.amount, wardTitle: opts.ward.title } : {};
    const saveLabel = VagabondDamageHelper.getConfiguredSaves().find(s => s.key === saveType)?.label
      || game.i18n.localize(`VAGABOND.Saves.${saveType.charAt(0).toUpperCase() + saveType.slice(1)}.name`);

    // Import VagabondChatCard

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
        damageType, saveType, actor, false, isHindered, defensePath, flankedBonus, wardExtra
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
          ${VagabondDamageHelper.createApplySaveDamageButton(actor.uuid, actor.name, finalDamage, damageType, statusContext, finalDamage)}
        </div>
      `;
    } else {
      // Normal (non-crit) path
      const damageCalculationHTML = this._buildDamageCalculation(
        originalDamage, saveReduction, armorReduction, finalDamage,
        damageType, saveType, actor, autoApplied, isHindered, defensePath, flankedBonus, wardExtra
      );
      cardDescription += damageCalculationHTML;
      if (!autoApplied && finalDamage > 0) {
        cardDescription += VagabondDamageHelper.createApplySaveDamageButton(actor.uuid, actor.name, finalDamage, damageType, statusContext);
      }
    }
    cardDescription += extraHtml;

    card.setDescription(cardDescription);
    if (opts.resultFlags) card.data.extraFlags = opts.resultFlags;

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
    const saveLabel = VagabondDamageHelper.getConfiguredSaves().find(s => s.key === saveType)?.label
      || game.i18n.localize(`VAGABOND.Saves.${saveType.charAt(0).toUpperCase() + saveType.slice(1)}.name`);

    // Import VagabondChatCard

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
    const configuredSave = VagabondDamageHelper.getConfiguredSaves().find(s => s.key === saveType);
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

    // Ward upcast (WardHelper): taken off before Armor
    if (extra.wardReduction > 0) {
      calculationHTML += `
        <span class="damage-operator">-</span>
        <span class="damage-component ward-component" title="${foundry.utils.escapeHTML?.(extra.wardTitle ?? '') ?? ''}">
          <i class="fas fa-star-christmas"></i> ${extra.wardReduction}
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
    const storedTargets = VagabondDamageHelper._getTargetsFromButton(button);

    if (storedTargets.length === 0) {
      ui.notifications.warn('No tokens targeted. Please target at least one token.');
      return;
    }

    // Resolve to actual tokens
    const targetedTokens = VagabondDamageHelper._resolveStoredTargets(storedTargets);

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
          GMRelay.send('vagabond.updateActorField', { actorUuid: targetActor.uuid, field, value });
        }
      };

      // Cancellable hook, mirroring the damage-apply path: mutate ctx.amount or
      // return false to skip this target's restorative entirely.
      const _restoreCtx = { actor: targetActor, amount, damageType, sourceItem: null };
      if (Hooks.call('vagabond.preDamageApply', _restoreCtx) === false) continue;
      const amountForTarget = Math.max(0, _restoreCtx.amount);

      // Apply the appropriate restorative effect (resource comes from the
      // homebrew restorative flag — custom restorative types map to hp/fatigue/mana)
      const restoredResource = VagabondDamagePipeline.getRestorativeResource(damageType);
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


        await VagabondChatCard.applyResult(targetActor, {
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

        await VagabondChatCard.applyResult(targetActor, {
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

        await VagabondChatCard.applyResult(targetActor, {
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
    const sourceItem = VagabondDamageHelper._resolveSourceItem(sourceActor, itemId);

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
    const storedTargets = VagabondDamageHelper._getTargetsFromButton(button);

    if (storedTargets.length === 0) {
      ui.notifications.warn('No tokens targeted. Please target at least one token.');
      return;
    }

    // Resolve to actual tokens
    const targetedTokens = VagabondDamageHelper._resolveStoredTargets(storedTargets);

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
      // Ward upcast rolled against this damage for this Target (before Armor)
      const ward = VagabondDamageHelper.preArmorReduction(button, targetActor.uuid);
      const wardCut = Math.min(ward.amount, effectiveDamage);

      // Calculate final damage (armor/immune/weak)
      const directBreakdown = VagabondDamageHelper.calculateFinalDamageDetailed(targetActor, effectiveDamage - wardCut, damageType, sourceItem, { attackerActor: sourceActor, isCrit: button.dataset.attackWasCrit === 'true' });
      const baseAfterFinalDirect = directBreakdown.final;
      // RAW: Weak — bypass Armor/Immune + deal an extra damage die
      let finalDamage = baseAfterFinalDirect;
      const weaknessPreRolledDirect = button.dataset.weaknessPreRolled === 'true';
      if (!weaknessPreRolledDirect && VagabondDamageHelper._isWeakTo(targetActor, damageType, sourceItem, sourceActor)) {
        const dieSize = VagabondDamageHelper._getDamageSourceDieSize(sourceItem, directActionIdx, sourceActor);
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
        GMRelay.send('vagabond.applyDamage', { actorUuid: targetActor.uuid, newHp: newHP });
      }
      Hooks.callAll('vagabond.postDamageApply', { actor: targetActor, amount: _directFinal, incoming: effectiveDamage - wardCut, damageType, sourceItem, attackerActor: sourceActor, oldHp: currentHP, newHp: newHP });

      // Post damage result to chat
      await VagabondChatCard.applyResult(targetActor, {
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
        wardReduction: wardCut,
        wardTitle: ward.title,
        // A Ward rolled after this card recomputes from here (WardHelper.wardOff)
        extraFlags: { damageResult: {
          damageMessageId: VagabondDamageHelper.messageIdOf(button), defenderUuid: targetActor.uuid,
          incoming: effectiveDamage, wardAmount: wardCut, priorFinal: _directFinal,
          weakExtra: finalDamage - baseAfterFinalDirect, autoApplied: true, damageType,
          sourceActorId: button.dataset.actorId, sourceItemId: button.dataset.itemId,
          attackWasCrit: button.dataset.attackWasCrit === 'true',
        } },
      });

      // Process on-hit status effects (single source of truth; crit entries replace same-statusId normals)
      const actionIndexRaw = button.dataset.actionIndex;
      const actionIdx = (actionIndexRaw !== '' && actionIndexRaw != null) ? parseInt(actionIndexRaw) : null;
      const isCritical = button.dataset.isCritical === 'true';
      const { entries: allStatusEntries, coatingEntries } = VagabondDamageHelper.resolveIncomingStatusEntries({
        sourceActor, sourceItem, actionIdx, attackWasCrit: isCritical,
        spellCast: VagabondDamageHelper.spellCastFromButton(button),  // Spell Damage / Effect split
      });
      if (allStatusEntries.length > 0) {
        const sourceName = sourceItem?.name ?? (actionIdx !== null ? sourceActor?.system?.actions?.[actionIdx]?.name : '') ?? '';
        const damageWasBlocked = finalDamage === 0;
        const sourceActorTokenName3 = canvas.tokens?.placeables?.find(t => t.actor?.id === sourceActor?.id)?.document.name || sourceActor?.name || '';
        // Apply Direct bypasses all saves — statuses are applied unconditionally
        const statusResults = await StatusHelper.processCausedStatuses(
          targetActor, allStatusEntries, damageWasBlocked, sourceName, { skipSaveRoll: true, sourceActorName: sourceActorTokenName3, sourceKey: StatusHelper.sourceKeyFor(sourceActor, sourceItem, actionIdx) }
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
      GMRelay.send('vagabond.applyDamage', { actorUuid: actor.uuid, newHp: newHP });
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
    await VagabondChatCard.applyResult(actor, {
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
      const sourceItem  = VagabondDamageHelper._resolveSourceItem(sourceActor, sourceItemId);

      const { entries: allStatusEntries, coatingEntries } = VagabondDamageHelper.resolveIncomingStatusEntries({
        sourceActor, sourceItem, actionIdx: sourceActionIdx, attackWasCrit,
        spellCast: VagabondDamageHelper.spellCastFromButton(button),  // data-spell-effect/-damage from statusContext
      });

      if (allStatusEntries.length > 0) {
        const damageWasBlocked = finalDamage === 0;
        const preRolledSave = { saveType, success: saveSuccess, total: saveTotal, difficulty: saveDifficulty, roll: null };
        const sourceName = sourceItem?.name ?? (sourceActionIdx !== null ? sourceActor?.system?.actions?.[sourceActionIdx]?.name : '') ?? '';
        const sourceActorTokenName4 = canvas.tokens?.placeables?.find(t => t.actor?.id === sourceActor?.id)?.document.name || sourceActor?.name || '';
        const statusResults = await StatusHelper.processCausedStatuses(
          actor, allStatusEntries, damageWasBlocked, sourceName, { preRolledSave, sourceActorName: sourceActorTokenName4, sourceKey: StatusHelper.sourceKeyFor(sourceActor, sourceItem, sourceActionIdx) }
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

    const storedTargets = VagabondDamageHelper._getTargetsFromButton(button);
    const targetedTokens = VagabondDamageHelper._resolveStoredTargets(storedTargets);

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
