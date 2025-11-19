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
      <div class="vagabond-damage-button-container">
        <button
          class="vagabond-damage-button"
          data-actor-id="${actorId}"
          data-item-id="${itemId || ''}"
          data-damage-formula="${damageFormula}"
          data-context="${contextJson}"
        >
          <i class="fas fa-dice-d20"></i> Roll Damage
        </button>
      </div>
    `;
  }

  /**
   * Roll damage from a chat message button
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

    // Roll based on context type
    let damageRoll;
    let flavorText;

    // Add stat bonus on critical hit
    let finalFormula = damageFormula;
    if (context.isCritical && context.statKey) {
      const statValue = actor.system.stats[context.statKey]?.value || 0;
      if (statValue > 0) {
        finalFormula += ` + ${statValue}`;
      }
    }

    switch (context.type) {
      case 'weapon':
        damageRoll = new Roll(finalFormula, actor.getRollData());
        await damageRoll.evaluate();
        flavorText = `<strong>${item?.name || 'Weapon'}</strong> Damage`;
        if (context.isCritical) {
          flavorText += ` <span style="color: gold;">(CRITICAL!)</span>`;
        }
        break;

      case 'spell':
        damageRoll = new Roll(finalFormula, actor.getRollData());
        await damageRoll.evaluate();
        const damageTypeName = game.i18n.localize(CONFIG.VAGABOND.damageTypes[context.damageType]);
        flavorText = `<strong>${item?.name || 'Spell'}</strong> Damage (${damageTypeName})`;
        if (context.isCritical) {
          flavorText += ` <span style="color: gold;">(CRITICAL!)</span>`;
        }
        break;

      default:
        damageRoll = new Roll(finalFormula, actor.getRollData());
        await damageRoll.evaluate();
        flavorText = 'Damage';
    }

    // Post damage roll to chat
    const VagabondChatHelper = (await import('./chat-helper.mjs')).VagabondChatHelper;
    await VagabondChatHelper.postRoll(actor, damageRoll, flavorText);

    // Disable the button to prevent duplicate rolls
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-check"></i> Damage Rolled';
    button.classList.add('rolled');
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
    if (spell.system.damageBase === '-') return null;

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
}
