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

      // Apply favor/hinder based on system state and keyboard modifiers
      const systemFavorHinder = this.actor.system.favorHinder || 'none';
      const favorHinder = VagabondRollBuilder.calculateEffectiveFavorHinder(
        systemFavorHinder,
        event.shiftKey,
        event.ctrlKey
      );

      const roll = await VagabondRollBuilder.buildAndEvaluateD20(
        this.actor,
        favorHinder,
        dataset.roll // Base formula (usually 'd20')
      );

      // Determine if this is a skill or save roll
      const rollKey = dataset.key; // e.g., 'awareness', 'might', 'reaction'
      const rollType = dataset.type; // 'skill' or 'save'

      // For skills and saves, use the formatted chat cards
      if (rollType === 'skill' && rollKey) {
        // Check both regular skills and weapon skills
        const skillData = this.actor.system.skills?.[rollKey] || this.actor.system.weaponSkills?.[rollKey];
        const difficulty = skillData?.difficulty || 10;
        const isSuccess = roll.total >= difficulty;
        return VagabondChatCard.skillRoll(this.actor, rollKey, roll, difficulty, isSuccess);
      } else if (rollType === 'save' && rollKey) {
        const saveData = this.actor.system.saves?.[rollKey];
        const difficulty = saveData?.difficulty || 10;
        const isSuccess = roll.total >= difficulty;
        return VagabondChatCard.saveRoll(this.actor, rollKey, roll, difficulty, isSuccess);
      }

      // Fallback for generic rolls (stats, etc.)
      const label = dataset.label ? `${dataset.label}` : '';
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
        rollMode: game.settings.get('core', 'rollMode'),
      });
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
    const targetsAtRollTime = Array.from(game.user.targets).map((token) => ({
      tokenId: token.id,
      sceneId: token.scene.id,
      actorId: token.actor?.id,
      actorName: token.name,
      actorImg: token.document.texture.src,
    }));

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

        // Otherwise, proceed with the Roll logic
        let damageFormula = item.system.damageAmount;
        const roll = new Roll(damageFormula);
        await roll.evaluate();

        const damageTypeKey = item.system.damageType || 'physical';
        const isRestorative = ['healing', 'recover', 'recharge'].includes(damageTypeKey);

        // Build description
        let description = '';
        if (item.system.description) {
          const { VagabondTextParser } = globalThis.vagabond.utils;
          const parsedDescription = VagabondTextParser.parseCountdownDice(
            item.system.description
          );
          description = await foundry.applications.ux.TextEditor.enrichHTML(parsedDescription, {
            async: true,
          });
        }

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
      const { VagabondDamageHelper } = await import('../../helpers/damage-helper.mjs');
      const { VagabondRollBuilder } = await import('../../helpers/roll-builder.mjs');

      const systemFavorHinder = this.actor.system.favorHinder || 'none';
      const favorHinder = VagabondRollBuilder.calculateEffectiveFavorHinder(
        systemFavorHinder,
        event.shiftKey,
        event.ctrlKey
      );

      const attackResult = await item.rollAttack(this.actor, favorHinder);
      if (!attackResult) return;

      // Reset check bonus to 0 after any attack roll
      if (this.actor.system.universalCheckBonus !== 0) {
        await this.actor.update({ 'system.universalCheckBonus': 0 });
      }

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
        targetsAtRollTime
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
    const targetsAtRollTime = Array.from(game.user.targets).map((token) => ({
      tokenId: token.id,
      sceneId: token.scene.id,
      actorId: token.actor?.id,
      actorName: token.name,
      actorImg: token.document.texture.src,
    }));

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
    const success = roll.total <= morale;

    const flavor = success
      ? `<strong>Morale Check: PASS</strong> (rolled ${roll.total} vs ${morale})`
      : `<strong>Morale Check: FAIL</strong> (rolled ${roll.total} vs ${morale})`;

    roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: flavor,
      rollMode: game.settings.get('core', 'rollMode'),
    });
  }
}
