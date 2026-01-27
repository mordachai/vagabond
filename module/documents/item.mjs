import { VagabondChatHelper } from '../helpers/chat-helper.mjs';
import { VagabondDamageHelper } from '../helpers/damage-helper.mjs';

/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class VagabondItem extends Item {
  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  prepareData() {
    // As with the actor class, items are documents that can have their data
    // preparation methods overridden (such as prepareBaseData()).
    super.prepareData();
  }

  /**
   * Prepare a data object which defines the data schema used by dice roll commands against this Item
   * @override
   */
  getRollData() {
    // Starts off by populating the roll data with a shallow copy of `this.system`
    const rollData = { ...this.system };

    // Quit early if there's no parent actor
    if (!this.actor) return rollData;

    // If present, add the actor's roll data
    rollData.actor = this.actor.getRollData();

    return rollData;
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @param {Array} targetsAtRollTime   Targets captured at use time (optional)
   * @private
   */
  async roll(event, targetsAtRollTime = []) {
    const item = this;
    const label = `[${item.type}] ${item.name}`;

    // Check consumable requirements before using
    if (item.type === 'equipment') {
      const canUse = await this.checkConsumableRequirements();
      if (!canUse) {
        return; // Notification already shown in checkConsumableRequirements
      }
    }

    // If there's no roll data, send a chat message.
    if (!this.system.formula) {
      // Use VagabondChatCard for equipment items (gear, alchemicals, relics) and spells
      if (item.type === 'equipment' || item.type === 'spell') {
        const { VagabondChatCard } = await import('../helpers/chat-card.mjs');
        await VagabondChatCard.itemUse(this.actor, item, targetsAtRollTime);
        // Handle consumption after successful use (equipment only)
        if (item.type === 'equipment') {
          await this.handleConsumption();
        }
      } else if (item.type === 'container') {
        // Post container info to chat
        const costs = [];
        if (this.system.baseCost.gold > 0) costs.push(`${this.system.baseCost.gold}g`);
        if (this.system.baseCost.silver > 0) costs.push(`${this.system.baseCost.silver}s`);
        if (this.system.baseCost.copper > 0) costs.push(`${this.system.baseCost.copper}c`);
        const costDisplay = costs.length > 0 ? costs.join(' ') : '—';

        const content = `
          <div class="vagabond-chat-card-v2">
            <div class="chat-card-header">
              <h3>${item.name}</h3>
            </div>
            <div class="chat-card-body">
              ${item.system.description ? `<div class="description">${item.system.description}</div>` : ''}
              <div class="container-stats">
                <p><strong>Slots:</strong> ${this.system.slots}</p>
                <p><strong>Capacity:</strong> ${this.system.currentCapacity} / ${this.system.capacity}</p>
                <p><strong>Cost:</strong> ${costDisplay}</p>
              </div>
            </div>
          </div>
        `;

        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: content,
        });
      } else {
        // For other item types (ancestry, class, perk, etc), just post description
        await VagabondChatHelper.postMessage(this.actor, item.system.description ?? '');
      }
    }
    // Otherwise, create a roll and send a chat message from it.
    else {
      // Retrieve roll data.
      const rollData = this.getRollData();

      // Invoke the roll and submit it to chat.
      const roll = new Roll(rollData.formula, rollData.actor);
      await roll.evaluate();

      // For equipment items with damage, use VagabondChatCard with targets
      if (item.type === 'equipment' && item.system.damageType && item.system.damageType !== '-') {
        const { VagabondChatCard } = await import('../helpers/chat-card.mjs');
        const damageTypeKey = item.system.damageType;
        const damageTypeLabel = CONFIG.VAGABOND.damageTypes[damageTypeKey] || damageTypeKey;

        await new VagabondChatCard()
          .setActor(this.actor)
          .setItem(item)
          .setTitle(item.name)
          .addDamage(roll, damageTypeLabel, false, damageTypeKey)
          .setTargets(targetsAtRollTime)
          .send();
      } else {
        // Fallback to old behavior for items without damage types
        await VagabondChatHelper.postRoll(this.actor, roll, label);
      }

      // Handle consumption after successful use
      if (item.type === 'equipment') {
        await this.handleConsumption();
      }
      return roll;
    }
  }

  /**
   * Check if this item can be used based on consumable requirements
   * @returns {Promise<boolean>} True if item can be used, false otherwise
   */
  async checkConsumableRequirements() {
    if (this.type !== 'equipment') return true;

    // If this item has a linked consumable, check if it's available
    if (this.system.linkedConsumable) {
      const linkedItem = this.actor?.items.get(this.system.linkedConsumable);
      if (!linkedItem || linkedItem.system.quantity <= 0) {
        ui.notifications.warn(`Cannot use ${this.name}: linked consumable ${linkedItem?.name || 'not found'} is exhausted.`);
        return false;
      }
    }
    // If this item is consumable and has no linked item, check its own quantity
    else if (this.system.isConsumable && this.system.quantity <= 0) {
      ui.notifications.warn(`Cannot use ${this.name}: no charges remaining.`);
      return false;
    }

    return true;
  }

  /**
   * Handle consumption of this item or its linked consumable
   * Reduces quantity by 1 and removes item if quantity reaches 0
   * @returns {Promise<void>}
   */
  async handleConsumption() {
    if (this.type !== 'equipment') return;

    // If this item has a linked consumable, consume from that instead
    if (this.system.linkedConsumable) {
      const linkedItem = this.actor?.items.get(this.system.linkedConsumable);
      if (linkedItem) {
        const newQuantity = linkedItem.system.quantity - 1;
        if (newQuantity <= 0) {
          // Remove the linked item
          await linkedItem.delete();
        } else {
          // Reduce quantity
          await linkedItem.update({ 'system.quantity': newQuantity });
        }
      }
    }
    // Otherwise, if this item is consumable, consume from itself
    else if (this.system.isConsumable) {
      const newQuantity = this.system.quantity - 1;
      if (newQuantity <= 0) {
        // Remove this item
        await this.delete();
      } else {
        // Reduce quantity
        await this.update({ 'system.quantity': newQuantity });
      }
    }
  }

  /**
   * Validate that this weapon can attack
   * @throws {Error} If weapon is not equipped or not a weapon
   */
  validateCanAttack() {
    // Check if this is a weapon (legacy weapon item OR equipment with equipmentType='weapon')
    const isWeapon = (this.type === 'weapon') ||
                    (this.type === 'equipment' && this.system.equipmentType === 'weapon');

    if (!isWeapon) {
      throw new Error('Not a weapon');
    }
    const equipmentState = this.system.equipmentState || 'unequipped';
    if (equipmentState === 'unequipped') {
      throw new Error(`${this.name} is not equipped. Equip it first to attack.`);
    }
  }

  /**
   * This function runs AUTOMATICALLY whenever an item is updated.
   */
  async _preUpdate(changed, options, user) {
    // 1. Run standard Foundry checks first
    await super._preUpdate(changed, options, user);

    // 2. Check: "Is the user changing the Grip?"
    if (foundry.utils.hasProperty(changed, "system.grip")) {
      const newGrip = foundry.utils.getProperty(changed, "system.grip");

      // 3. Logic: If Grip becomes "1H" or "Fist", FORCE state to "equipped" (1H)
      // This prevents the "2H" state from getting stuck on a 1H weapon.
      if (["1H", "F"].includes(newGrip)) {
        foundry.utils.setProperty(changed, "system.equipmentState", "oneHand");
      }

      // Optional: If Grip becomes "2H" (Strict Two-Handed), FORCE state to "twoHands"
      if (newGrip === "2H") {
        foundry.utils.setProperty(changed, "system.equipmentState", "twoHands");
      }
    }
  }

  /**
   * This function runs AUTOMATICALLY before an item is deleted.
   * For containers with items, show a confirmation dialog.
   */
  async _preDelete(options, user) {
    await super._preDelete(options, user);

    // Check if this is a container with items
    if (this.type === 'container' && this.system.items && this.system.items.length > 0) {
      // Only show dialog if not already confirmed
      if (!options.containerDeleteConfirmed) {
        const itemCount = this.system.items.length;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: 'Delete Container' },
          content: `<p>This container holds <strong>${itemCount}</strong> item${itemCount !== 1 ? 's' : ''}.</p><p>Are you sure you want to delete <strong>${this.name}</strong> and all items inside?</p><p>This action cannot be undone.</p>`,
          rejectClose: false,
          modal: true
        });

        if (!confirmed) {
          // Cancel the deletion
          return false;
        }

        // Delete all items from the container
        if (this.actor) {
          for (const containerItem of this.system.items) {
            if (containerItem.itemId) {
              const item = this.actor.items.get(containerItem.itemId);
              if (item) {
                await item.delete();
              }
            }
          }
        }
      }
    }
  }

  /**
   * Check if this weapon is equipped
   * @returns {boolean} True if weapon is equipped (one-hand or two-hands)
   */
  get isEquipped() {
    // Check if this is a weapon (legacy weapon item OR equipment with equipmentType='weapon')
    const isWeapon = (this.type === 'weapon') ||
                    (this.type === 'equipment' && this.system.equipmentType === 'weapon');
    if (!isWeapon) return false;

    const equipmentState = this.system.equipmentState || 'unequipped';
    return equipmentState !== 'unequipped';
  }

  /**
   * Roll an attack with this weapon
   * @param {VagabondActor} actor - The actor making the attack
   * @returns {Promise<Object>} Attack result with roll, difficulty, isHit, isCritical, weaponSkill
   */
  async rollAttack(actor, favorHinder = 'none') {
    this.validateCanAttack();

    // Get roll data WITH this item's "on-use" effects applied
    // This allows weapon properties like "Keen" to affect only this weapon's rolls
    const rollData = actor.getRollDataWithItemEffects(this);

    // Get the weapon skill and difficulty
    // The weaponSkill field can now be:
    // 1. A weapon skill (melee, brawl, finesse, ranged) - from actor.system.weaponSkills
    // 2. A regular skill (arcana, craft, etc.) - from actor.system.skills
    // 3. A save (reflex, endure, will) - from actor.system.saves
    const weaponSkillKey = this.system.weaponSkill;
    let weaponSkill = rollData.weaponSkills?.[weaponSkillKey] ||
                      rollData.skills?.[weaponSkillKey] ||
                      rollData.saves?.[weaponSkillKey];
    const difficulty = weaponSkill?.difficulty || 10;

    // Check target's incomingAttacksModifier (e.g., Vulnerable: incoming attacks Favored)
    // Also check for Invisible (attackersAreBlinded: attackers act as Blinded = Hindered)
    // Apply this BEFORE rolling to modify the favor/hinder state
    let effectiveFavorHinder = favorHinder;
    const targets = Array.from(game.user.targets);
    if (targets.length > 0) {
      const targetActor = targets[0].actor;
      if (targetActor) {
        // Check incoming attacks modifier
        const targetModifier = targetActor.system.incomingAttacksModifier || 'none';

        // Apply target's modifier using same cancellation logic as saves
        if (targetModifier === 'favor') {
          if (effectiveFavorHinder === 'hinder') {
            effectiveFavorHinder = 'none';
          } else if (effectiveFavorHinder === 'none') {
            effectiveFavorHinder = 'favor';
          }
        } else if (targetModifier === 'hinder') {
          if (effectiveFavorHinder === 'favor') {
            effectiveFavorHinder = 'none';
          } else if (effectiveFavorHinder === 'none') {
            effectiveFavorHinder = 'hinder';
          }
        }

        // Check if target is Invisible (attackers are treated as Blinded)
        const attackersAreBlinded = targetActor.system.defenderStatusModifiers?.attackersAreBlinded || false;
        if (attackersAreBlinded) {
          // Apply Blinded effect (Hinder)
          if (effectiveFavorHinder === 'favor') {
            effectiveFavorHinder = 'none';
          } else if (effectiveFavorHinder === 'none') {
            effectiveFavorHinder = 'hinder';
          }
          // If already hindered, stays hindered (no double-hinder)
        }
      }
    }

    // Use centralized roll builder with modified roll data and effective favor/hinder
    const { VagabondRollBuilder } = await import('../helpers/roll-builder.mjs');
    const roll = await VagabondRollBuilder.buildAndEvaluateD20WithRollData(rollData, effectiveFavorHinder);

    // Check if the attack succeeds
    const isHit = roll.total >= difficulty;

    // Check for auto-crit conditions (Unconscious: close attacks auto-crit)
    let forceCritical = false;
    if (targets.length > 0) {
      const targetActor = targets[0].actor;
      if (targetActor) {
        const closeAttacksAutoCrit = targetActor.system.defenderStatusModifiers?.closeAttacksAutoCrit || false;
        // Check if this is a close attack (weapon range = 'close')
        const isCloseAttack = this.system.range === 'close';
        if (closeAttacksAutoCrit && isCloseAttack) {
          forceCritical = true;
        }
      }
    }

    // Check critical - ONLY the d20 result, not including favor/hinder
    // ✅ CRITICAL: Use critNumber from rollData (which includes item effects)
    // This allows "Keen" weapons to crit on 19-20 instead of just 20
    const critNumber = rollData.critNumber || 20;
    const d20Term = roll.terms.find(term => term.constructor.name === 'Die' && term.faces === 20);
    const d20Result = d20Term?.results?.[0]?.result || 0;
    const isCritical = forceCritical || (d20Result >= critNumber);

    return {
      roll,
      difficulty,
      isHit,
      isCritical,
      weaponSkill,
      weaponSkillKey,
      favorHinder: effectiveFavorHinder, // Use modified favor/hinder (includes target's modifier)
    };
  }

  /**
   * Roll damage with this weapon
   * @param {VagabondActor} actor - The actor making the damage roll
   * @param {boolean} isCritical - Whether this was a critical hit
   * @param {string} statKey - The stat used for the attack (for crit bonus)
   * @returns {Promise<Roll>} The damage roll
   */
  async rollDamage(actor, isCritical = false, statKey = null) {
    // Check if this is a weapon (legacy weapon item OR equipment with equipmentType='weapon')
    const isWeapon = (this.type === 'weapon') ||
                    (this.type === 'equipment' && this.system.equipmentType === 'weapon');

    if (!isWeapon) {
      throw new Error('Not a weapon');
    }

    let damageFormula = this.system.currentDamage;

    // Add stat bonus on critical hit (positive or negative)
    if (isCritical && statKey) {
      const statValue = actor.system.stats[statKey]?.value || 0;
      if (statValue !== 0) {  // ✅ FIX: Include negative stats too (they reduce damage)
        damageFormula += ` + ${statValue}`;
      }
    }

    // Add weapon-specific universal damage bonuses
    const weaponFlatBonus = actor.system.universalWeaponDamageBonus || 0;
    const weaponDiceBonus = actor.system.universalWeaponDamageDice || '';

    if (weaponFlatBonus !== 0) {
      damageFormula += ` + ${weaponFlatBonus}`;
    }
    if (weaponDiceBonus.trim() !== '') {
      damageFormula += ` + ${weaponDiceBonus}`;
    }

    // Add legacy universal damage bonuses (backward compatibility)
    const universalFlatBonus = actor.system.universalDamageBonus || 0;
    const universalDiceBonus = actor.system.universalDamageDice || '';

    if (universalFlatBonus !== 0) {
      damageFormula += ` + ${universalFlatBonus}`;
    }
    if (universalDiceBonus.trim() !== '') {
      damageFormula += ` + ${universalDiceBonus}`;
    }

    // Roll damage (without explosion modifiers in formula)
    const roll = new Roll(damageFormula, actor.getRollData());
    await roll.evaluate();

    // Apply manual explosions if enabled
    const explodeValues = VagabondDamageHelper._getExplodeValues(this, actor);
    if (explodeValues) {
      await VagabondDamageHelper._manuallyExplodeDice(roll, explodeValues);
    }

    return roll;
  }
}
