/**
 * Universal Damage Helper
 * Handles damage rolling for weapons, spells, and any other damage sources
 */
export class VagabondDamageHelper {
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
  static createDamageButton(actorId, itemId, damageFormula, context = {}) {
    const contextJson = JSON.stringify(context).replace(/"/g, '&quot;');

    return `
      <div class="vagabond-damage-button-container" data-vagabond-button="true">
        <button
          class="vagabond-damage-button"
          data-vagabond-button="true"
          data-actor-id="${actorId}"
          data-item-id="${itemId || ''}"
          data-damage-formula="${damageFormula}"
          data-context="${contextJson}"
        >
          <i class="fas fa-dice"></i> Roll Damage
        </button>
      </div>
    `;
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

    const actor = game.actors.get(actorId);
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

    // Add stat bonus on critical hit
    let finalFormula = damageFormula;
    if (context.isCritical && context.statKey) {
      const statValue = actor.system.stats[context.statKey]?.value || 0;
      if (statValue > 0) {
        finalFormula += ` + ${statValue}`;
      }
    }

    // Roll damage
    const damageRoll = new Roll(finalFormula, actor.getRollData());
    await damageRoll.evaluate();

    // Determine damage type
    let damageTypeLabel = 'Physical';

    // For weapons, get damage type from context first, then item
    if (context.type === 'weapon') {
      // Check context first (from button creation)
      let damageTypeKey = context.damageType;
      
      // Fallback to item damage type if context doesn't have it
      if ((!damageTypeKey || damageTypeKey === '-') && item && item.system.damageType) {
        damageTypeKey = item.system.damageType;
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

    // Get the damage type key for icon lookup (from context, which stores the key)
    const finalDamageTypeKey = context.damageType || null;

    // Update the chat message in-place
    // Note: The "Roll Damage" button will be removed from the content during update
    await this.updateChatCardDamage(messageId, damageRoll, damageTypeLabel, context.isCritical, actor, item, finalDamageTypeKey);
  }

/**
   * Update a chat card with damage information
   * @param {string} messageId - The chat message ID
   * @param {Roll} damageRoll - The damage roll
   * @param {string} damageType - Type of damage (localized label)
   * @param {boolean} isCritical - Whether this is critical damage
   * @param {Actor} actor - The actor dealing damage
   * @param {Item} item - The item used (optional)
   * @param {string} damageTypeKey - The damage type key for icon lookup (optional)
   */
  static async updateChatCardDamage(messageId, damageRoll, damageType, isCritical, actor, item, damageTypeKey = null) {
    const message = game.messages.get(messageId);
    if (!message) {
      console.error('VagabondDamageHelper: Message not found:', messageId);
      return;
    }

    // Get the current message content
    let content = message.content;

    // Build damage HTML using the template partial
    const damageHTML = await this._renderDamagePartial(damageRoll, damageType, isCritical, damageTypeKey);

    // Build apply damage button HTML
    const applyButton = this.createApplyDamageButton(
      damageRoll.total,
      damageType,
      actor.id,
      item?.id
    );

    // 1. Inject Damage Display
    // Replace the empty damage section placeholder with the actual damage HTML
    content = content.replace(
      /(<div class=['"]card-damage-section['"] data-damage-section>)([\s\S]*?)(<\/div>)/,
      `$1${damageHTML}$3`
    );

    // 2. Replace Footer Actions
    // Instead of complex regex to find/remove specific buttons, we locate the .footer-actions container
    // and completely replace its inner HTML with just the new Apply button (and any other persistent actions if we had them).
    // This ensures a clean state and prevents weird text-node nesting issues.
    
    if (content.includes('footer-actions')) {
      content = content.replace(
        /(<div class=['"]footer-actions['"]>)([\s\S]*?)(<\/div>)/,
        `$1${applyButton}$3`
      );
    } else {
      // Fallback: If no footer actions existed (unlikely if Roll Damage was there), inject it before footer tags or end of footer
      // This is a safety catch.
      const footerOpen = `<footer class='card-footer'>`;
      if (content.includes(footerOpen)) {
         content = content.replace(
           footerOpen,
           `${footerOpen}<div class='footer-actions'>${applyButton}</div>`
         );
      }
    }

    // Update the message's rolls array to include the damage roll
    const rolls = [...(message.rolls || []), damageRoll];

    // Update the message with new content and rolls
    await message.update({ content, rolls });
  }

  /**
   * Roll spell damage
   * @param {Actor} actor - The actor casting the spell
   * @param {Item} spell - The spell item
   * @param {Object} spellState - Spell state (damageDice, deliveryType, etc.)
   * @param {boolean} isCritical - Whether this was a critical hit
   * @param {string} statKey - The stat used for the cast (for crit bonus)
   * @returns {Roll} The damage roll
   */
  static async rollSpellDamage(actor, spell, spellState, isCritical = false, statKey = null) {
    if (spell.system.damageType === '-') return null;

    let damageFormula = `${spellState.damageDice}d6`;

    // Add stat bonus on critical hit
    if (isCritical && statKey) {
      const statValue = actor.system.stats[statKey]?.value || 0;
      if (statValue > 0) {
        damageFormula += ` + ${statValue}`;
      }
    }

    const roll = new Roll(damageFormula, actor.getRollData());
    await roll.evaluate();

    return roll;
  }

  /**
   * Roll weapon damage
   * @param {Actor} actor - The actor attacking
   * @param {Item} weapon - The weapon item
   * @returns {Roll} The damage roll
   */
  static async rollWeaponDamage(actor, weapon) {
    return await weapon.rollDamage(actor);
  }

  /**
   * Create a GM-only NPC damage button (flat or roll)
   * @param {string} actorId - NPC actor ID
   * @param {number} actionIndex - Index of the action in the actions array
   * @param {string} damageValue - Flat damage value or roll formula
   * @param {string} damageMode - 'flat' or 'roll'
   * @param {string} damageType - Type of damage
   * @param {string} damageTypeLabel - Localized damage type label
   * @returns {string} HTML button string
   */
  static createNPCDamageButton(actorId, actionIndex, damageValue, damageMode, damageType, damageTypeLabel) {
    const isFlat = damageMode === 'flat';
    const icon = isFlat ? 'fa-hashtag' : 'fa-dice-d20';
    const label = isFlat ? `Apply ${damageValue} Damage` : `Roll ${damageValue} Damage`;

    return `
      <button
        class="vagabond-npc-damage-button gm-only"
        data-actor-id="${actorId}"
        data-action-index="${actionIndex}"
        data-damage-value="${damageValue}"
        data-damage-mode="${damageMode}"
        data-damage-type="${damageType}"
        data-damage-type-label="${damageTypeLabel}"
      >
        <i class="fas ${icon}"></i> ${label}
      </button>
    `;
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

    const actor = game.actors.get(actorId);
    if (!actor) {
      ui.notifications.error('NPC not found!');
      return;
    }

    const action = actor.system.actions[actionIndex];
    if (!action) {
      ui.notifications.error('Action not found!');
      return;
    }

    let damageRoll;
    let finalDamage;

    if (damageMode === 'flat') {
      // Flat damage - just use the value directly
      finalDamage = parseInt(damageValue);
      damageRoll = null;
    } else {
      // Roll damage
      damageRoll = new Roll(damageValue, actor.getRollData());
      await damageRoll.evaluate();
      finalDamage = damageRoll.total;
    }

    // Post a new damage message instead of updating the original
    await this.postNPCActionDamage(
      damageRoll,
      finalDamage,
      damageTypeLabel,
      actor,
      action,
      damageType
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
   */
  static async postNPCActionDamage(damageRoll, finalDamage, damageTypeLabel, actor, action, damageTypeKey = null) {
    // Build damage HTML using the template partial
    const damageHTML = await this._renderDamagePartial(damageRoll, damageTypeLabel, false, damageTypeKey, finalDamage);

    // Build apply damage button HTML
    const applyButton = this.createApplyDamageButton(
      finalDamage,
      damageTypeLabel,
      actor.id,
      null
    );

    // Create message content
    const content = `
      <div class="vagabond-chat-card npc-damage-result">
        <header class="card-header">
          <h3 class="card-title">${action.name} Damage</h3>
          <div class="card-subtitle">${actor.name}</div>
        </header>
        <div class="card-content">
          ${damageHTML}
        </div>
        <footer class="card-footer">
          <div class="footer-actions">
            ${applyButton}
          </div>
        </footer>
      </div>
    `;

    // Create the chat message data
    const messageData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content: content,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER
    };

    // Add the roll if it exists
    if (damageRoll) {
      messageData.rolls = [damageRoll];
    }

    // Create the message
    return await ChatMessage.create(messageData);
  }

  /**
   * Render damage HTML using the template partial
   * @param {Roll} damageRoll - The damage roll (or null for flat damage)
   * @param {string} damageType - Type of damage (localized label)
   * @param {boolean} isCritical - Whether this is critical damage
   * @param {string} damageTypeKey - The damage type key for icon lookup (optional)
   * @param {number} flatDamage - Flat damage amount (for NPC actions, when damageRoll is null)
   * @returns {Promise<string>} Rendered HTML
   * @private
   */
  static async _renderDamagePartial(damageRoll, damageType, isCritical = false, damageTypeKey = null, flatDamage = null) {
    // Import VagabondChatCard for dice formatting
    const { VagabondChatCard } = await import('./chat-card.mjs');

    // Prepare damage data for template
    const damageData = {
      damage: {
        total: damageRoll ? damageRoll.total : flatDamage,
        type: damageType,
        typeKey: damageTypeKey,
        iconClass: null,
        isCritical: isCritical,
        diceDisplay: null,
        formula: damageRoll ? damageRoll.formula : null
      }
    };

    // Look up the damage type icon
    if (damageTypeKey && CONFIG.VAGABOND?.damageTypeIcons?.[damageTypeKey]) {
      damageData.damage.iconClass = CONFIG.VAGABOND.damageTypeIcons[damageTypeKey];
    }

    // Format dice display if rolling
    if (damageRoll) {
      damageData.damage.diceDisplay = VagabondChatCard.formatRollWithDice(damageRoll);
    }

    // Render the damage partial template
    const templatePath = 'systems/vagabond/templates/chat/damage-display.hbs';
    return await foundry.applications.handlebars.renderTemplate(templatePath, damageData);
  }

  /**
   * Create an "Apply Damage" button
   * @param {number} damageAmount - The amount of damage
   * @param {string} damageType - Type of damage
   * @param {string} actorId - Source actor ID
   * @param {string} itemId - Item ID (optional)
   * @returns {string} HTML button string
   */
  static createApplyDamageButton(damageAmount, damageType, actorId, itemId = null) {
    // Check if this is healing
    const isHealing = damageType.toLowerCase() === 'healing';
    const icon = isHealing ? 'fa-heart-pulse' : 'fa-heart-crack';
    const text = isHealing ? `Apply ${damageAmount} Healing` : `Apply ${damageAmount} Damage`;
    const buttonClass = isHealing ? 'vagabond-apply-healing-button' : 'vagabond-apply-damage-button';

    return `
      <button
        class="${buttonClass}"
        data-damage-amount="${damageAmount}"
        data-damage-type="${damageType}"
        data-actor-id="${actorId}"
        data-item-id="${itemId || ''}"
      >
        <i class="fas ${icon}"></i> ${text}
      </button>
    `;
  }

  /**
   * Apply damage or healing to selected or targeted tokens
   * @param {HTMLElement} button - The clicked button element
   */
  static async applyDamageToTargets(button) {
    const amount = parseInt(button.dataset.damageAmount);
    const damageType = button.dataset.damageType;
    const isHealing = damageType.toLowerCase() === 'healing';

    // Get weapon data from chat message flags (if available)
    const messageId = button.closest('.chat-message')?.dataset?.messageId;
    const message = game.messages.get(messageId);
    const weaponId = message?.flags?.vagabond?.weaponId;
    const actorId = message?.flags?.vagabond?.actorId;

    let attackingWeapon = null;
    if (weaponId && actorId) {
      const actor = game.actors.get(actorId);
      attackingWeapon = actor?.items.get(weaponId);
    }

    // Get user's selected/targeted tokens
    const targets = Array.from(game.user.targets);

    if (targets.length === 0) {
      ui.notifications.warn('No targets selected. Please target a token first.');
      return;
    }

    // Apply damage or healing to each target
    for (const target of targets) {
      const targetActor = target.actor;
      if (!targetActor) continue;

      // Check permissions
      if (!targetActor.isOwner && !game.user.isGM) {
        ui.notifications.warn(`You don't have permission to modify ${targetActor.name}.`);
        continue;
      }

      const currentHP = targetActor.system.health?.value || 0;
      const maxHP = targetActor.system.health?.max || currentHP;
      let newHP;
      let finalAmount;

      if (isHealing) {
        // Healing: Add HP (capped at max)
        newHP = Math.min(maxHP, currentHP + amount);
        finalAmount = newHP - currentHP; // Actual healing applied
      } else {
        // Damage: Calculate with resistances/vulnerabilities and subtract
        finalAmount = this.calculateFinalDamage(targetActor, amount, damageType, attackingWeapon);
        newHP = Math.max(0, currentHP - finalAmount);
      }

      await targetActor.update({ 'system.health.value': newHP });

      // Show notification
      if (isHealing) {
        const healText = finalAmount !== amount
          ? `${finalAmount} (capped at max HP)`
          : finalAmount;
      } else {
        const damageText = finalAmount !== amount
          ? `${finalAmount} (modified from ${amount})`
          : finalAmount;
      }
    }

    // Disable button after applying (check if button still exists)
    if (button && button.classList) {
      button.disabled = true;
      const successText = isHealing ? 'Healing Applied' : 'Damage Applied';
      button.innerHTML = `<i class="fas fa-check"></i> ${successText}`;
      button.classList.add('applied');
    }
  }

  /**
   * Calculate final damage per RAW rules: Armor/Immune/Weak
   *
   * RAW Rules:
   * - Armor: Subtracted from Attack damage (physical types only)
   * - Immune: Unharmed by the damage type (take 0 damage)
   * - Weak: Ignores Armor and Immune, deals extra damage die (extra die handled at roll time)
   *
   * @param {Actor} actor - The target actor
   * @param {number} damage - Base damage amount
   * @param {string} damageType - Type of damage
   * @param {Item} attackingWeapon - The weapon used (optional, for material weakness checks)
   * @returns {number} Final damage amount
   */
  static calculateFinalDamage(actor, damage, damageType, attackingWeapon = null) {
    // Normalize damage type for lookup
    const normalizedType = damageType.toLowerCase();

    // Get immunities and weaknesses arrays (for NPCs and from equipped armor)
    let immunities = actor.system.immunities || [];
    const weaknesses = actor.system.weaknesses || [];

    // For PCs, also check equipped armor for immunities
    if (actor.type === 'character') {
      const equippedArmor = actor.items.find(item => {
        const isArmor = (item.type === 'armor') ||
                       (item.type === 'equipment' && item.system.equipmentType === 'armor');
        return isArmor && item.system.equipped;
      });

      if (equippedArmor && equippedArmor.system.immunities) {
        // Combine actor immunities with armor immunities
        immunities = [...immunities, ...equippedArmor.system.immunities];
      }
    }

    // Start with base damage
    let finalDamage = damage;

    // Check for material-based weakness (Cold Iron, Silver)
    if (attackingWeapon && attackingWeapon.system?.metal) {
      const weaponMetal = attackingWeapon.system.metal;

      // Check if NPC is weak to this metal type
      if (weaknesses.includes(weaponMetal)) {
        // Material weakness: Ignore armor and immunities, damage goes through
        return finalDamage;
      }
    }

    // RAW: Weak - Ignores Armor and Immune, and deals an extra damage die
    // Note: Extra damage die should be handled at roll time, not here
    // Here we just ensure armor/immunity are bypassed
    if (weaknesses.includes(normalizedType)) {
      // Weakness: Ignore armor and immunities, damage goes through as-is
      // (Extra die is handled during damage roll, not here)
      return finalDamage;
    }

    // RAW: Immune - Unharmed by the damage type
    if (immunities.includes(normalizedType)) {
      return 0;
    }

    // RAW: Armor - Subtracted from Attack damage (only for physical damage types)
    const physicalDamageTypes = ['blunt', 'physical', 'piercing', 'slashing'];
    if (physicalDamageTypes.includes(normalizedType)) {
      const armorRating = actor.system.armor || 0;
      finalDamage = Math.max(0, finalDamage - armorRating);
    }

    return finalDamage;
  }
}
