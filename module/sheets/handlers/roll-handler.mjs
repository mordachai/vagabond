import { TargetHelper } from '../../helpers/target-helper.mjs';
import { VagabondTextParser } from '../../helpers/text-parser.mjs';
import { VagabondItemSequencer } from '../../helpers/item-sequencer.mjs';
import { VagabondDiceAppearance } from '../../helpers/dice-appearance.mjs';

/**
 * Handler for roll-related functionality.
 * Manages generic rolls, weapon rolls, and item usage.
 */
export class RollHandler {
  /**
   * @param {VagabondActorSheet} sheet - The parent actor sheet
   * @param {Object} options - Configuration options
   * @param {boolean} [options.npcMode=false] - Whether this is for NPC sheets
   */
  constructor(sheet, options = {}) {
    this.sheet = sheet;
    this.actor = sheet.actor;
    this.npcMode = options.npcMode || false;
  }

  /**
   * Handle generic d20 rolls (stats, skills, saves)
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async roll(event, target) {
    event.preventDefault();
    const dataset = target.dataset;

    // Handle item rolls
    switch (dataset.rollType) {
      case 'item':
        const item = this.sheet._getEmbeddedDocument(target);
        if (item) return item.roll();
    }

    // Handle rolls that supply the formula directly
    if (dataset.roll) {
      // Import helpers
      const { VagabondRollBuilder } = await import('../../helpers/roll-builder.mjs');
      const { VagabondChatCard } = await import('../../helpers/chat-card.mjs');

      // Determine if this is a skill or save roll FIRST (for auto-fail check)
      const rollKey = dataset.key; // e.g., 'awareness', 'might', 'reaction'
      const rollType = dataset.type; // 'skill' or 'save' or 'stat'

      // Check for auto-fail conditions
      const autoFailAllRolls = this.actor.system.autoFailAllRolls || false;
      const autoFailStats = this.actor.system.autoFailStats || [];

      // Auto-fail if Dead (autoFailAllRolls) or if specific stat is in autoFailStats array
      if (autoFailAllRolls || autoFailStats.includes(rollKey)) {
        // Import chat card helper
        const { VagabondChatCard } = await import('../../helpers/chat-card.mjs');

        // Post auto-fail message to chat
        await VagabondChatCard.autoFailRoll(this.actor, rollType || 'stat', rollKey);

        // Show notification
        const label = dataset.label || game.i18n.localize(CONFIG.VAGABOND.stats[rollKey]) || rollKey;
        ui.notifications.warn(`${this.actor.name} automatically fails ${label} checks due to status conditions.`);

        // Create and return a dummy roll for consistency
        const autoFailRoll = new Roll('0');
        await autoFailRoll.evaluate();
        return autoFailRoll;
      }

      // Apply favor/hinder based on system state and keyboard modifiers
      const systemFavorHinder = this.actor.system.favorHinder || 'none';
      const favorHinder = VagabondRollBuilder.calculateEffectiveFavorHinder(
        systemFavorHinder,
        event.shiftKey,
        event.ctrlKey
      );

      // Compute difficulty upfront so pre-hook can see (and modify) it
      let _rollDifficulty;
      if (rollType === 'skill' && rollKey) _rollDifficulty = this.actor.system.skills?.[rollKey]?.difficulty ?? 10;
      else if (rollType === 'save' && rollKey) _rollDifficulty = this.actor.system.saves?.[rollKey]?.difficulty ?? 10;

      // Pre-roll hook — cancellable; modules may mutate ctx.difficulty / ctx.favorHinder
      const _preCtx = { actor: this.actor, item: null, rollKey, rollType, difficulty: _rollDifficulty, favorHinder, rollData: this.actor.getRollData() };
      if (Hooks.call('vagabond.preD20Roll', _preCtx) === false) return;
      _rollDifficulty = _preCtx.difficulty;
      const _effectiveFavorHinder = _preCtx.favorHinder ?? favorHinder;

      // For saves: apply per-status bonuses for every status currently active on the actor
      let saveVsStatusBonus = 0;
      if (rollType === 'save' && rollKey) {
        for (const statusId of (this.actor.statuses ?? [])) {
          saveVsStatusBonus += VagabondRollBuilder.getSaveVsStatusBonus(this.actor, statusId, rollKey);
        }
      }
      const _extraFormula = saveVsStatusBonus !== 0 ? ` + ${saveVsStatusBonus}` : '';
      const _baseFormula = saveVsStatusBonus !== 0
        ? (CONFIG.VAGABOND?.homebrew?.dice?.baseCheck ?? '1d20') + _extraFormula
        : null;

      const roll = await VagabondRollBuilder.buildAndEvaluateD20(
        this.actor,
        _effectiveFavorHinder,
        _baseFormula ?? undefined
      );

      // Compute crit for post-hook (mirrors _checkRoll logic)
      const _critType = (rollType === 'save') ? rollKey
        : (rollType === 'skill' && ['melee', 'ranged', 'brawl', 'finesse'].includes(rollKey)) ? rollKey
        : null;
      const _critNumber = VagabondRollBuilder.calculateCritThreshold(this.actor.getRollData(), _critType);
      const _isCritical = VagabondChatCard.isRollCritical(roll, _critNumber);

      // For skills and saves, use the formatted chat cards
      if (rollType === 'skill' && rollKey) {
        const difficulty = _rollDifficulty ?? this.actor.system.skills?.[rollKey]?.difficulty ?? 10;
        const isSuccess = roll.total >= difficulty;
        const _postCtx = { actor: this.actor, item: null, rollKey, rollType, roll, difficulty, isSuccess, isCritical: _isCritical, extraMetadata: [], extraTags: [] };
        Hooks.callAll('vagabond.postD20Roll', _postCtx);
        await VagabondChatCard.skillRoll(this.actor, rollKey, roll, difficulty, isSuccess, _postCtx.extraMetadata, _postCtx.extraTags);

        // Reset check bonus to 0 after any roll
        if (this.actor.system.manualCheckBonus !== 0 || this.actor.system.manualDifficultyBonus !== 0) {
          await this.actor.update({ 'system.manualCheckBonus': 0, 'system.manualDifficultyBonus': 0 });
        }
        return roll;
      } else if (rollType === 'save' && rollKey) {
        const difficulty = _rollDifficulty ?? this.actor.system.saves?.[rollKey]?.difficulty ?? 10;
        const isSuccess = roll.total >= difficulty;
        const _postCtx = { actor: this.actor, item: null, rollKey, rollType, roll, difficulty, isSuccess, isCritical: _isCritical, extraMetadata: [], extraTags: [] };
        Hooks.callAll('vagabond.postD20Roll', _postCtx);
        await VagabondChatCard.saveRoll(this.actor, rollKey, roll, difficulty, isSuccess, _postCtx.extraMetadata, _postCtx.extraTags);

        // Reset check bonus to 0 after any roll
        if (this.actor.system.manualCheckBonus !== 0 || this.actor.system.manualDifficultyBonus !== 0) {
          await this.actor.update({ 'system.manualCheckBonus': 0, 'system.manualDifficultyBonus': 0 });
        }
        return roll;
      }

      // Fallback for generic rolls (stats, etc.)
      const label = dataset.label ? `${dataset.label}` : '';
      Hooks.callAll('vagabond.postD20Roll', { actor: this.actor, item: null, rollKey, rollType, roll, difficulty: null, isSuccess: null, isCritical: _isCritical, extraMetadata: [], extraTags: [] });
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
        rollMode: game.settings.get('core', 'rollMode'),
      });

      // Reset check bonus to 0 after any roll
      if (this.actor.system.manualCheckBonus !== 0) {
        await this.actor.update({ 'system.manualCheckBonus': 0 });
      }
      return roll;
    }
  }

  /**
   * Handle weapon attack rolls
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async rollWeapon(event, target = null) {
    event.preventDefault();

    // 1. Target Safety
    const element = target || event.currentTarget;
    const itemId = element.dataset.itemId || element.closest('[data-item-id]')?.dataset.itemId;
    const item = this.actor.items.get(itemId);

    if (!item) {
      ui.notifications.error('Item not found!');
      return;
    }

    // Import helpers
    const { EquipmentHelper } = globalThis.vagabond.utils;
    const { VagabondChatCard } = globalThis.vagabond.utils;

    // 2. Define Item Types
    const isWeapon = EquipmentHelper.isWeapon(item);
    const isAlchemical = EquipmentHelper.isAlchemical(item);

    if (!isWeapon && !isAlchemical) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.UI.Errors.ItemNotRollable'));
      return;
    }

    // 3. Check consumable requirements
    if (item.type === 'equipment') {
      const canUse = await item.checkConsumableRequirements();
      if (!canUse) {
        return; // Notification already shown
      }
    }

    // Capture targeted tokens at roll time
    const targetsAtRollTime = TargetHelper.captureCurrentTargets();

    try {
      /* PATH A: ALCHEMICAL */
      if (isAlchemical) {
        // SMART CHECK: If no damage type or no formula, treat as generic "Use Item"
        const hasDamage =
          item.system.damageType &&
          item.system.damageType !== '-' &&
          item.system.damageAmount;

        if (!hasDamage) {
          // Redirect to the simple Gear Use card
          await VagabondChatCard.gearUse(this.actor, item, targetsAtRollTime);
          // Handle consumption after successful use
          await item.handleConsumption();
          return;
        }

        // Otherwise, proceed with the Roll logic — apply universal alchemical bonuses
        // matching what rollDamageFromButton does for the same item type.
        const { VagabondDamageHelper } = await import('../../helpers/damage-helper.mjs');

        let damageFormula = item.system.damageAmount;
        const alcFlat = this.actor.system.universalAlchemicalDamageBonus || 0;
        let alcDice = this.actor.system.universalAlchemicalDamageDice || '';
        if (Array.isArray(alcDice)) alcDice = alcDice.filter(d => !!d).join(' + ');
        const univFlat = this.actor.system.universalDamageBonus || 0;
        let univDice = this.actor.system.universalDamageDice || '';
        if (Array.isArray(univDice)) univDice = univDice.filter(d => !!d).join(' + ');
        if (alcFlat !== 0) damageFormula += ` + ${alcFlat}`;
        if (typeof alcDice === 'string' && alcDice.trim()) damageFormula += ` + ${alcDice}`;
        if (univFlat !== 0) damageFormula += ` + ${univFlat}`;
        if (typeof univDice === 'string' && univDice.trim()) damageFormula += ` + ${univDice}`;

        const roll = new Roll(damageFormula, this.actor.getRollData());
        VagabondDiceAppearance.applyDamageColorset(roll, item.system.damageType);
        await roll.evaluate();

        // Apply dice explosion if the item or actor has it enabled
        const explodeValues = VagabondDamageHelper._getExplodeValues(item, this.actor);
        if (explodeValues) await VagabondDamageHelper._manuallyExplodeDice(roll, explodeValues);

        const damageTypeKey = item.system.damageType || 'physical';
        const isRestorative = ['healing', 'recover', 'recharge'].includes(damageTypeKey);

        // Build description
        let description = '';
        if (item.system.description) {
          const parsedDescription = VagabondTextParser.parseCountdownDice(
            item.system.description
          );
          description = await foundry.applications.ux.TextEditor.enrichHTML(parsedDescription, {
            async: true,
          });
        }

        // Play item FX animation (alchemicals always "hit" — no attack roll)
        const alcCasterToken = this.actor.token?.object ?? this.actor.getActiveTokens(true)[0];
        const alcTargets = TargetHelper.resolveTargets(targetsAtRollTime);
        VagabondItemSequencer.play(item, alcCasterToken, alcTargets, true);

        // Use createActionCard for consistency with other items
        await VagabondChatCard.createActionCard({
          actor: this.actor,
          item: item,
          title: item.name,
          subtitle: this.actor.name,
          damageRoll: roll,
          damageType: damageTypeKey,
          description: description,
          attackType: isRestorative ? 'none' : 'melee',
          hasDefenses: !isRestorative,
          targetsAtRollTime: targetsAtRollTime,
        });

        // Handle consumption after successful use
        await item.handleConsumption();
        return roll;
      }

      /* PATH B: WEAPONS */
      // Enforce target limits based on Cleave property
      {
        const hasCleave = item.system.properties?.includes('Cleave');
        if (hasCleave) {
          const max = this.actor.system.cleaveMaxTargets ?? 2;
          if (targetsAtRollTime.length > max) targetsAtRollTime.splice(max);
        } else if (targetsAtRollTime.length > 1) {
          targetsAtRollTime.splice(1);
        }
      }

      // Check for auto-fail conditions before rolling weapon attack
      const autoFailAllRolls = this.actor.system.autoFailAllRolls || false;
      if (autoFailAllRolls) {
        // Import chat card helper
        const { VagabondChatCard } = await import('../../helpers/chat-card.mjs');

        // Post auto-fail message to chat
        await VagabondChatCard.autoFailRoll(this.actor, 'weapon', item.name);

        // Show notification
        ui.notifications.warn(`${this.actor.name} cannot attack due to status conditions.`);
        return;
      }

      const { VagabondDamageHelper } = await import('../../helpers/damage-helper.mjs');
      const { VagabondRollBuilder } = await import('../../helpers/roll-builder.mjs');

      const systemFavorHinder = this.actor.system.favorHinder || 'none';
      const favorHinder = VagabondRollBuilder.calculateEffectiveFavorHinder(
        systemFavorHinder,
        event.shiftKey,
        event.ctrlKey
      );

      // Pre-roll hook for weapon attack
      const _wpnRollKey = item.system.weaponSkill;
      const _wpnRollData = this.actor.getRollData();
      const _wpnSkillData = _wpnRollData.skills?.[_wpnRollKey] || _wpnRollData.saves?.[_wpnRollKey];
      const _wpnBaseDifficulty = _wpnSkillData?.difficulty ?? 10;
      const _wpnPreCtx = { actor: this.actor, item, rollKey: _wpnRollKey, rollType: 'weapon', difficulty: _wpnBaseDifficulty, favorHinder, rollData: _wpnRollData };
      if (Hooks.call('vagabond.preD20Roll', _wpnPreCtx) === false) return;
      const _wpnEffectiveFavorHinder = _wpnPreCtx.favorHinder ?? favorHinder;
      const _wpnDifficultyOverride = _wpnPreCtx.difficulty !== _wpnBaseDifficulty ? _wpnPreCtx.difficulty : null;

      const attackResult = await item.rollAttack(this.actor, _wpnEffectiveFavorHinder, _wpnDifficultyOverride);
      if (!attackResult) return;

      // Post-roll hook for weapon attack
      const _wpnPostCtx = { actor: this.actor, item, rollKey: attackResult.weaponSkillKey, rollType: 'weapon', roll: attackResult.roll, difficulty: attackResult.difficulty, isSuccess: attackResult.isHit, isCritical: attackResult.isCritical, extraMetadata: [], extraTags: [] };
      Hooks.callAll('vagabond.postD20Roll', _wpnPostCtx);

      // Stash the crit stat bonus so the damage card can render the two-state toggle
      if (attackResult.isCritical && attackResult.weaponSkill?.stat) {
        attackResult.critStatBonus = this.actor.getRollData().stats?.[attackResult.weaponSkill.stat]?.value || 0;
      }

      // Reset check bonus to 0 after any attack roll
      if (this.actor.system.manualCheckBonus !== 0) {
        await this.actor.update({ 'system.manualCheckBonus': 0 });
      }

      // Play item FX animation immediately after attack result (before damage roll)
      // Placed here so it always fires regardless of whether damage rolling succeeds.
      const casterToken = this.actor.token?.object ?? this.actor.getActiveTokens(true)[0];
      const resolvedTargets = TargetHelper.resolveTargets(targetsAtRollTime);
      VagabondItemSequencer.play(item, casterToken, resolvedTargets, attackResult.isHit);

      let damageRoll = null;
      if (VagabondDamageHelper.shouldRollDamage(attackResult.isHit)) {
        const statKey = attackResult.weaponSkill?.stat || null;
        damageRoll = await item.rollDamage(this.actor, attackResult.isCritical, statKey);
      }

      await VagabondChatCard.weaponAttack(
        this.actor,
        item,
        attackResult,
        damageRoll,
        targetsAtRollTime,
        _wpnPostCtx.extraMetadata,
        _wpnPostCtx.extraTags
      );
      // Handle consumption after successful attack (regardless of hit/miss)
      await item.handleConsumption();
      return attackResult.roll;
    } catch (error) {
      console.error(error);
      ui.notifications.warn(error.message);
      return;
    }
  }

  /**
   * Handle using an item (gear, relic, or alchemical) to post to chat
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async useItem(event, target) {
    event.preventDefault();

    // 1. Target Safety
    const element = target || event.currentTarget;
    const itemId = element.dataset.itemId || element.closest('[data-item-id]')?.dataset.itemId;
    const item = this.actor.items.get(itemId);

    if (!item) {
      ui.notifications.error('Item not found!');
      return;
    }

    // 2. Capture targets at use time
    const targetsAtRollTime = TargetHelper.captureCurrentTargets();

    // 3. Delegate to item.roll() which handles consumables, chat cards, and all logic
    if (typeof item.roll === 'function') {
      await item.roll(event, targetsAtRollTime);
    }
  }

  /**
   * NPC morale roll (NPC mode only)
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async rollMorale(event, target) {
    if (!this.npcMode) return;

    event.preventDefault();

    const roll = new Roll('2d6');
    await roll.evaluate();

    const morale = this.actor.system.morale || 7;
    const success = roll.total <= morale; // morale check is roll-under

    const { VagabondChatCard } = await import('../../helpers/chat-card.mjs');
    await VagabondChatCard.createActionCard({
      actor: this.actor,
      title: 'Morale Check',
      rollData: { roll, difficulty: morale, isSuccess: success },
      tags: [
        { label: 'Morale', cssClass: 'tag-skill' },
        { label: `${morale}`, icon: 'fas fa-hashtag' },
      ],
    });
  }
}
