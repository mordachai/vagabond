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

    // Add universal damage bonuses
    const flatBonus = actor.system.universalDamageBonus || 0;
    const diceBonus = actor.system.universalDamageDice || '';

    if (flatBonus !== 0) {
      finalFormula += ` + ${flatBonus}`;
    }
    if (diceBonus.trim() !== '') {
      finalFormula += ` + ${diceBonus}`;
    }

    // Apply exploding dice syntax if item supports it
    if (item) {
      finalFormula = this._applyExplodingDice(item, finalFormula);
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

    // Get attack type from context (defaults to 'melee' if not provided)
    const attackType = context.attackType || 'melee';

    // Update the chat message in-place
    // Note: The "Roll Damage" button will be removed from the content during update
    await this.updateChatCardDamage(messageId, damageRoll, damageTypeLabel, context.isCritical, actor, item, finalDamageTypeKey, attackType);
  }

/**
   * Update a chat card with damage information and save buttons
   * @param {string} messageId - The chat message ID
   * @param {Roll} damageRoll - The damage roll
   * @param {string} damageType - Type of damage (localized label)
   * @param {boolean} isCritical - Whether this is critical damage
   * @param {Actor} actor - The actor dealing damage
   * @param {Item} item - The item used (optional)
   * @param {string} damageTypeKey - The damage type key for icon lookup (optional)
   * @param {string} attackType - 'melee' or 'ranged' or 'cast' (for Hinder logic)
   */
  static async updateChatCardDamage(messageId, damageRoll, damageType, isCritical, actor, item, damageTypeKey = null, attackType = 'melee') {
    const message = game.messages.get(messageId);
    if (!message) {
      console.error('VagabondDamageHelper: Message not found:', messageId);
      return;
    }

    // Get the current message content
    let content = message.content;

    // Build Block/Dodge info section HTML
    const defendInfoHTML = this._renderDefendInfoSection(attackType);

    // Build damage HTML using the template partial
    const damageHTML = await this._renderDamagePartial(damageRoll, damageType, isCritical, damageTypeKey);

    // Build save buttons HTML (unless it's healing)
    const isHealing = damageType.toLowerCase() === 'healing';
    let buttonsHTML;
    if (isHealing) {
      // Keep old apply healing button for healing damage
      buttonsHTML = this.createApplyDamageButton(
        damageRoll.total,
        damageType,
        actor.id,
        item?.id
      );
    } else {
      // Use new save buttons for all other damage
      buttonsHTML = this.createSaveButtons(
        damageRoll.total,
        damageTypeKey || 'physical',
        damageRoll,
        actor.id,
        item?.id,
        attackType
      );
    }

    // 1. Inject Block/Dodge Info Section (BEFORE damage section)
    // Insert before the damage section
    content = content.replace(
      /(<div class=['"]card-damage-section['"])/,
      `${defendInfoHTML}$1`
    );

    // 2. Inject Damage Display
    // Replace the empty damage section placeholder with the actual damage HTML
    content = content.replace(
      /(<div class=['"]card-damage-section['"] data-damage-section>)([\s\S]*?)(<\/div>)/,
      `$1${damageHTML}$3`
    );

    // 3. Replace Footer Actions with Save Buttons
    if (content.includes('footer-actions')) {
      content = content.replace(
        /(<div class=['"]footer-actions['"]>)([\s\S]*?)(<\/div>)/,
        `$1${buttonsHTML}$3`
      );
    } else {
      // Fallback: If no footer actions existed, inject it before footer tags
      const footerOpen = `<footer class='card-footer'>`;
      if (content.includes(footerOpen)) {
         content = content.replace(
           footerOpen,
           `${footerOpen}<div class='footer-actions'>${buttonsHTML}</div>`
         );
      }
    }

    // Update the message's rolls array to include the damage roll
    const rolls = [...(message.rolls || []), damageRoll];

    // Update the message with new content and rolls
    await message.update({ content, rolls });
  }

  /**
   * Render the Block/Dodge info section as an accordion
   * @param {string} attackType - 'melee' or 'ranged' or 'cast'
   * @returns {string} HTML string
   * @private
   */
  static _renderDefendInfoSection(attackType) {
    const isRanged = (attackType === 'ranged' || attackType === 'cast');
    const hinderedTag = isRanged ? '<span class="hindered-tag"><i class="fas fa-exclamation-triangle"></i> Hindered</span>' : '';

    return `
      <div class='card-defend-info'>
        <div class='defend-info-header' data-action='toggleDefendInfo'>
          <i class='fas fa-shield-alt'></i>
          <strong>Defending Options</strong>
          <i class='fas fa-chevron-right expand-icon'></i>
        </div>
        <div class='defend-info-details'>
          <div class='defend-info-row'>
            <div class='defend-option defend-dodge'>
              <div class='defend-title'>
                <i class='fas fa-running'></i>
                <strong>Dodge (Reflex):</strong>
                <span class='armor-hinder-note'>(Hindered if Heavy Armor)</span>
              </div>
              <p>Roll Reflex save. Success ignores one highest damage die.</p>
            </div>
            <div class='defend-option defend-block'>
              <div class='defend-title'>
                <i class='fas fa-shield-alt'></i>
                <strong>Block (Endure):</strong>
                ${hinderedTag}
              </div>
              <p>Roll Endure save. Success ignores one highest damage die.</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Apply exploding dice syntax to a damage formula if enabled
   * @param {Item} item - The item (spell or equipment) with canExplode and explodeValues
   * @param {string} formula - The base damage formula (e.g., "2d6", "1d8+2")
   * @returns {string} Modified formula with exploding dice (e.g., "2d6x=1x=4" or "1d8x=1x=4+2")
   * @private
   */
  static _applyExplodingDice(item, formula) {
    if (!item?.system?.canExplode || !item?.system?.explodeValues) {
      return formula;
    }

    // Parse explode values (comma-separated)
    const explodeValues = item.system.explodeValues
      .split(',')
      .map(v => v.trim())
      .filter(v => v && !isNaN(v));

    if (explodeValues.length === 0) {
      return formula;
    }

    // Build the exploding dice suffix (e.g., "x=1x=4")
    // Using x=N for exact values, not x>=N
    const explodeSuffix = explodeValues.map(v => `x=${v}`).join('');

    // Apply exploding dice to all dice terms in the formula
    // Match patterns like "2d6", "d8", "1d10" but not numbers like "10" or "+2"
    return formula.replace(/(\d*)d(\d+)/gi, (match, count, faces) => {
      return `${count || '1'}d${faces}${explodeSuffix}`;
    });
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

    // Add universal damage bonuses
    const flatBonus = actor.system.universalDamageBonus || 0;
    const diceBonus = actor.system.universalDamageDice || '';

    if (flatBonus !== 0) {
      damageFormula += ` + ${flatBonus}`;
    }
    if (diceBonus.trim() !== '') {
      damageFormula += ` + ${diceBonus}`;
    }

    // Apply exploding dice syntax if enabled
    damageFormula = this._applyExplodingDice(spell, damageFormula);

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
   * @param {string} attackType - Attack type ('melee', 'ranged', 'cast')
   * @returns {string} HTML button string
   */
  static createNPCDamageButton(actorId, actionIndex, damageValue, damageMode, damageType, damageTypeLabel, attackType = 'melee') {
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
        data-attack-type="${attackType}"
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
    const attackType = button.dataset.attackType || 'melee';

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
      damageType,
      attackType
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
  static async postNPCActionDamage(damageRoll, finalDamage, damageTypeLabel, actor, action, damageTypeKey = null, attackType = 'melee') {
    // If damageRoll is null (flat damage), create a simple Roll object with just the total
    let rollForButtons = damageRoll;
    if (!damageRoll) {
      rollForButtons = new Roll(String(finalDamage));
      await rollForButtons.evaluate();
    }

    // Check if this is healing damage
    const isHealing = damageTypeKey?.toLowerCase() === 'healing';

    // Build defend info section (if not healing) - players can roll saves against NPC attacks
    const defendInfoHTML = isHealing ? '' : this._renderDefendInfoSection(attackType);

    // Build damage HTML using the template partial
    const damageHTML = await this._renderDamagePartial(damageRoll, damageTypeLabel, false, damageTypeKey, finalDamage);

    // Build buttons HTML - use save buttons for damage, old button for healing
    let buttonsHTML;
    if (isHealing) {
      buttonsHTML = this.createApplyDamageButton(
        finalDamage,
        damageTypeLabel,
        actor.id,
        null
      );
    } else {
      buttonsHTML = this.createSaveButtons(
        finalDamage,
        damageTypeKey || 'physical',
        rollForButtons,
        actor.id,
        null,
        attackType
      );
    }

    // Create message content
    const content = `
      <div class="vagabond-chat-card npc-damage-result">
        <header class="card-header">
          <h3 class="card-title">${action.name} Damage</h3>
          <div class="card-subtitle">${actor.name}</div>
        </header>
        <div class="card-content">
          ${defendInfoHTML}
          ${damageHTML}
        </div>
        <footer class="card-footer">
          <div class="footer-actions">
            ${buttonsHTML}
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

    // RAW: Armor - Subtracted from ALL incoming damage
    // Armor always reduces damage unless target is immune or weak
    const armorRating = actor.system.armor || 0;
    finalDamage = Math.max(0, finalDamage - armorRating);

    return finalDamage;
  }

  /**
   * Create save buttons (Reflex, Endure, Will, Apply Direct)
   * @param {number} damageAmount - Base damage amount
   * @param {string} damageType - Damage type key
   * @param {Roll} damageRoll - The damage Roll object (for die manipulation)
   * @param {string} actorId - Source actor ID
   * @param {string} itemId - Item ID (weapon/spell)
   * @param {string} attackType - 'melee' or 'ranged' or 'cast' (for Hinder logic)
   * @returns {string} HTML string with 4 buttons
   */
  static createSaveButtons(damageAmount, damageType, damageRoll, actorId, itemId, attackType) {
    // Encode the damage roll terms into a JSON string
    const rollTermsData = JSON.stringify({
      terms: damageRoll.terms.map(t => {
        if (t.constructor.name === 'Die') {
          return {
            type: t.constructor.name,
            faces: t.faces,
            results: t.results || []
          };
        } else if (t.constructor.name === 'NumericTerm') {
          return {
            type: t.constructor.name,
            number: t.number
          };
        } else {
          return { type: t.constructor.name };
        }
      }),
      total: damageRoll.total
    }).replace(/"/g, '&quot;');

    // Get localized save names
    const reflexLabel = game.i18n.localize('VAGABOND.Saves.Reflex.name');
    const endureLabel = game.i18n.localize('VAGABOND.Saves.Endure.name');
    const willLabel = game.i18n.localize('VAGABOND.Saves.Will.name');

    return `
      <div class="vagabond-save-buttons-container">
        <button class="vagabond-save-button save-reflex"
          data-save-type="reflex"
          data-damage-amount="${damageAmount}"
          data-damage-type="${damageType}"
          data-roll-terms="${rollTermsData}"
          data-actor-id="${actorId}"
          data-item-id="${itemId || ''}"
          data-attack-type="${attackType}">
          <i class="fas fa-running"></i> ${reflexLabel}
        </button>
        <button class="vagabond-save-button save-endure"
          data-save-type="endure"
          data-damage-amount="${damageAmount}"
          data-damage-type="${damageType}"
          data-roll-terms="${rollTermsData}"
          data-actor-id="${actorId}"
          data-item-id="${itemId || ''}"
          data-attack-type="${attackType}">
          <i class="fas fa-shield-alt"></i> ${endureLabel}
        </button>
        <button class="vagabond-save-button save-will"
          data-save-type="will"
          data-damage-amount="${damageAmount}"
          data-damage-type="${damageType}"
          data-roll-terms="${rollTermsData}"
          data-actor-id="${actorId}"
          data-item-id="${itemId || ''}"
          data-attack-type="${attackType}">
          <i class="fas fa-brain"></i> ${willLabel}
        </button>
        <button class="vagabond-apply-direct-button"
          data-damage-amount="${damageAmount}"
          data-damage-type="${damageType}"
          data-actor-id="${actorId}"
          data-item-id="${itemId || ''}">
          <i class="fas fa-bolt"></i> Apply Direct
        </button>
      </div>
    `;
  }

  /**
   * Handle save button click - roll saves for each selected token
   * @param {HTMLElement} button - The clicked save button
   */
  static async handleSaveRoll(button) {
    const saveType = button.dataset.saveType; // 'reflex', 'endure', 'will'
    const damageAmount = parseInt(button.dataset.damageAmount);
    const damageType = button.dataset.damageType;
    const rollTermsData = JSON.parse(button.dataset.rollTerms.replace(/&quot;/g, '"'));
    const attackType = button.dataset.attackType; // 'melee' or 'ranged' or 'cast'
    const actorId = button.dataset.actorId;
    const itemId = button.dataset.itemId;

    // Get selected tokens
    const selectedTokens = canvas.tokens.controlled;
    if (selectedTokens.length === 0) {
      ui.notifications.warn('No tokens selected. Please select at least one token.');
      return;
    }

    // Roll save for each selected token individually
    for (const target of selectedTokens) {
      const targetActor = target.actor;
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

      // Determine if save is Hindered
      const isHindered = this._isSaveHindered(saveType, attackType, targetActor);

      // Roll the save
      const saveRoll = await this._rollSave(targetActor, saveType, isHindered);

      // Determine success
      const difficulty = targetActor.system.saves?.[saveType]?.difficulty || 10;
      const isSuccess = saveRoll.total >= difficulty;

      // Calculate damage breakdown for display
      let damageAfterSave = damageAmount;
      let saveReduction = 0;
      if (isSuccess) {
        // Remove highest damage die from original roll
        damageAfterSave = this._removeHighestDie(rollTermsData);
        saveReduction = damageAmount - damageAfterSave;
      }

      // Apply armor/immune/weak modifiers and track armor reduction
      const sourceActor = game.actors.get(actorId);
      const sourceItem = sourceActor?.items.get(itemId);
      const finalDamage = this.calculateFinalDamage(targetActor, damageAfterSave, damageType, sourceItem);
      const armorReduction = damageAfterSave - finalDamage;

      // Auto-apply damage if setting enabled
      const autoApply = game.settings.get('vagabond', 'autoApplySaveDamage');
      if (autoApply) {
        const currentHP = targetActor.system.health?.value || 0;
        const newHP = Math.max(0, currentHP - finalDamage);
        await targetActor.update({ 'system.health.value': newHP });
      }

      // Post save result to chat
      await this._postSaveResult(
        targetActor,
        saveType,
        saveRoll,
        difficulty,
        isSuccess,
        isHindered,
        damageAmount,
        saveReduction,
        armorReduction,
        finalDamage,
        damageType,
        autoApply
      );
    }

    // Button remains active so multiple players can roll saves
    // Each click generates new save result cards for currently selected tokens
  }

  /**
   * Determine if a save should be Hindered
   * @param {string} saveType - 'reflex', 'endure', 'will'
   * @param {string} attackType - 'melee' or 'ranged' or 'cast'
   * @param {Actor} actor - The defending actor
   * @returns {boolean} True if save is Hindered
   * @private
   */
  static _isSaveHindered(saveType, attackType, actor) {
    // Block (Endure): Hindered if Ranged or Cast attack
    if (saveType === 'endure' && (attackType === 'ranged' || attackType === 'cast')) {
      return true;
    }

    // Dodge (Reflex): Hindered if Heavy Armor
    if (saveType === 'reflex') {
      const equippedArmor = actor.items.find(item => {
        const isArmor = (item.type === 'armor') ||
                       (item.type === 'equipment' && item.system.equipmentType === 'armor');
        return isArmor && item.system.equipped;
      });
      if (equippedArmor && equippedArmor.system.armorType === 'heavy') {
        return true;
      }
    }

    return false;
  }

  /**
   * Roll a save for an actor
   * @param {Actor} actor - The actor rolling the save
   * @param {string} saveType - 'reflex', 'endure', 'will'
   * @param {boolean} isHindered - Whether the save is Hindered by conditions
   * @returns {Promise<Roll>} The save roll
   * @private
   */
  static async _rollSave(actor, saveType, isHindered) {
    const favorHinder = actor.system.favorHinder || 'none';

    // Build roll formula
    let rollFormula = 'd20';

    // Check if actor already has Favor or Hinder state
    const hasActorFavor = (favorHinder === 'favor');
    const hasActorHinder = (favorHinder === 'hinder');

    // Apply Favor/Hinder logic
    // IMPORTANT: Favor and Hinder cancel each other out
    // If actor has Favor AND save is Hindered by conditions: they cancel, roll straight d20
    if (hasActorFavor && isHindered) {
      rollFormula = 'd20'; // Cancel out - no modifier
    }
    // If actor has Favor AND save is NOT Hindered: apply Favor
    else if (hasActorFavor && !isHindered) {
      rollFormula = 'd20 + 1d6';
    }
    // If actor has Hinder OR save is Hindered by conditions: apply Hinder
    // Multiple Hinder sources do NOT stack - only apply -1d6 once
    else if (hasActorHinder || isHindered) {
      rollFormula = 'd20 - 1d6';
    }

    const roll = new Roll(rollFormula, actor.getRollData());
    await roll.evaluate();
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

    // Find all dice terms and their results
    for (const term of rollTermsData.terms) {
      if (term.type === 'Die' && term.results) {
        for (const result of term.results) {
          totalDiceCount++;
          if (result.result > highestDieValue) {
            highestDieValue = result.result;
          }
        }
      }
    }

    // If only one die was rolled, save completely negates damage
    if (totalDiceCount === 1) {
      return 0;
    }

    // Subtract highest die
    return Math.max(0, total - highestDieValue);
  }

  /**
   * Post save result to chat
   * @param {Actor} actor - The defending actor
   * @param {string} saveType - 'reflex', 'endure', 'will'
   * @param {Roll} roll - The save roll
   * @param {number} difficulty - Save difficulty
   * @param {boolean} isSuccess - Whether the save succeeded
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
  static async _postSaveResult(actor, saveType, roll, difficulty, isSuccess, isHindered, originalDamage, saveReduction, armorReduction, finalDamage, damageType, autoApplied) {
    const saveLabel = game.i18n.localize(`VAGABOND.Saves.${saveType.charAt(0).toUpperCase() + saveType.slice(1)}.name`);

    // Import VagabondChatCard
    const { VagabondChatCard } = await import('./chat-card.mjs');

    const card = new VagabondChatCard()
      .setType('save-roll')
      .setActor(actor)
      .setTitle(`${saveLabel} Save`)
      .setSubtitle(actor.name)
      .addRoll(roll, difficulty)
      .setOutcome(isSuccess ? 'SUCCESS' : 'FAIL', false);

    // Build visual damage calculation display
    const damageCalculationHTML = this._buildDamageCalculation(
      originalDamage,
      saveReduction,
      armorReduction,
      finalDamage,
      damageType,
      saveType,
      actor,
      autoApplied,
      isHindered
    );

    card.setDescription((card.data.description || '') + damageCalculationHTML);

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
  static _buildDamageCalculation(originalDamage, saveReduction, armorReduction, finalDamage, damageType, saveType, actor, autoApplied, isHindered) {
    // Get save icon
    const saveIcons = {
      'reflex': 'fa-solid fa-running',
      'endure': 'fa-solid fa-shield-alt',
      'will': 'fa-solid fa-brain'
    };
    const saveIcon = saveIcons[saveType] || 'fa-solid fa-shield';

    // Get damage type icon and label
    const damageTypeIcon = CONFIG.VAGABOND?.damageTypeIcons?.[damageType] || 'fa-solid fa-burst';
    const damageTypeLabel = game.i18n.localize(CONFIG.VAGABOND.damageTypes[damageType]) || damageType;

    // Build save tooltip with favor/hinder state
    const saveLabel = game.i18n.localize(`VAGABOND.Saves.${saveType.charAt(0).toUpperCase() + saveType.slice(1)}.name`);
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
    const equippedArmor = actor.items.find(item => {
      const isArmor = (item.type === 'armor') ||
                     (item.type === 'equipment' && item.system.equipmentType === 'armor');
      return isArmor && item.system.equipped;
    });
    if (equippedArmor) {
      armorTooltip = `${game.i18n.localize('VAGABOND.Armor.Label')}: ${equippedArmor.name}`;
    }

    // Build calculation line with title separator
    let calculationHTML = `<div class="save-damage-calculation">
      <div class="damage-title">${game.i18n.localize('VAGABOND.Roll.SaveRoll')}</div>
      <div class="damage-formula-line">
        <span class="damage-component" title="${game.i18n.localize('VAGABOND.Damage.Total')}">
          <i class="fa-solid fa-dice"></i> ${originalDamage}
        </span>`;

    // Add save reduction if any
    if (saveReduction > 0) {
      const saveIconClass = isHindered ? 'save-icon-hindered' : '';
      calculationHTML += `
        <span class="damage-operator">-</span>
        <span class="damage-component" title="${saveTooltip}">
          <i class="${saveIcon} ${saveIconClass}"></i> ${saveReduction}
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

    // Add final damage
    const finalDamageTooltip = `${game.i18n.localize('VAGABOND.Damage.Final')} ${damageTypeLabel}`;
    calculationHTML += `
        <span class="damage-operator">=</span>
        <span class="damage-final" title="${finalDamageTooltip}">
          ${finalDamage} <i class="${damageTypeIcon} damage-type-icon-large"></i>
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
   * Handle "Apply Direct" button - bypass saves
   * @param {HTMLElement} button - The clicked button
   */
  static async handleApplyDirect(button) {
    const damageAmount = parseInt(button.dataset.damageAmount);
    const damageType = button.dataset.damageType;
    const actorId = button.dataset.actorId;
    const itemId = button.dataset.itemId;

    // Get weapon data for material weakness checks
    const sourceActor = game.actors.get(actorId);
    const sourceItem = sourceActor?.items.get(itemId);

    // Get selected tokens
    const selectedTokens = canvas.tokens.controlled;
    if (selectedTokens.length === 0) {
      ui.notifications.warn('No tokens selected. Please select at least one token.');
      return;
    }

    // Apply damage to each selected token
    for (const target of selectedTokens) {
      const targetActor = target.actor;
      if (!targetActor) continue;

      // Check permissions
      if (!targetActor.isOwner && !game.user.isGM) {
        ui.notifications.warn(`You don't have permission to modify ${targetActor.name}.`);
        continue;
      }

      // Calculate final damage (armor/immune/weak)
      const finalDamage = this.calculateFinalDamage(targetActor, damageAmount, damageType, sourceItem);

      const currentHP = targetActor.system.health?.value || 0;
      const newHP = Math.max(0, currentHP - finalDamage);
      await targetActor.update({ 'system.health.value': newHP });

      ui.notifications.info(`Applied ${finalDamage} damage to ${targetActor.name}`);
    }

    // Button remains active so damage can be applied to different tokens
  }
}
