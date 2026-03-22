/**
 * Universal Damage Helper
 * Handles damage rolling for weapons, spells, and any other damage sources
 */
export class VagabondDamageHelper {
  /**
   * Manually explode dice on specific values (recursive)
   * This bypasses Foundry's potentially buggy x=1x=4 syntax
   *
   * ✅ CANONICAL VERSION: This is the main implementation.
   * ⚠️ DUPLICATE EXISTS in module/documents/item.mjs - should be consolidated to use this version.
   *
   * @param {Roll} roll - The evaluated roll to explode
   * @param {Array<number>} explodeValues - Values that should trigger explosions (e.g., [1, 4])
   * @param {number} maxExplosions - Safety limit to prevent infinite loops (default 100)
   * @returns {Promise<Roll>} The modified roll with explosions applied
   * @private
   */
  static async _manuallyExplodeDice(roll, explodeValues, maxExplosions = 100) {
    if (!explodeValues || explodeValues.length === 0) {
      return roll;
    }

    // Convert explode values to numbers
    const explodeSet = new Set(explodeValues.map(v => parseInt(v)));
    let explosionCount = 0;

    // Find all Die terms in the roll
    for (let i = 0; i < roll.terms.length; i++) {
      const term = roll.terms[i];

      // Skip non-die terms (operators, numbers, etc.)
      if (term.constructor.name !== 'Die') continue;

      const faces = term.faces;
      const results = term.results || [];

      // Process each result in this die term
      // We need to track the original length because we'll be adding results
      const originalLength = results.length;

      for (let j = 0; j < originalLength; j++) {
        const result = results[j];

        // Check if this result should explode
        if (explodeSet.has(result.result)) {
          // Mark this die as exploded (it's causing an explosion)
          result.exploded = true;

          // Roll new dice recursively
          let previousResult = result;
          let newRoll = result.result;

          while (explodeSet.has(newRoll) && explosionCount < maxExplosions) {
            explosionCount++;

            // Roll another die of the same size
            const explosionRoll = Math.floor(Math.random() * faces) + 1;

            // Check if this new roll will also explode
            const willExplode = explodeSet.has(explosionRoll);

            // Add the explosion as a new result
            const newResult = {
              result: explosionRoll,
              active: true,
              exploded: willExplode  // Only mark as exploded if it will cause another explosion
            };
            results.push(newResult);

            // Update for next iteration
            previousResult = newResult;
            newRoll = explosionRoll;
          }
        }
      }

      // Recalculate the term's total
      term._total = results.reduce((sum, r) => sum + (r.active ? r.result : 0), 0);
    }

    // Recalculate the roll's total
    roll._total = roll._evaluateTotal();

    return roll;
  }

  /**
   * Mark the last DiceTerm in a roll as the weakness bonus die.
   * Called after rolling when the weakness die was appended to the formula.
   * @param {Roll} roll
   * @private
   */
  static _markWeaknessDie(roll) {
    for (let i = roll.terms.length - 1; i >= 0; i--) {
      const term = roll.terms[i];
      if (term.constructor.name === 'Die') {
        for (const result of term.results) {
          result.weakness = true;
        }
        break;
      }
    }
  }

  /**
   * Resolve stored target objects to Actor instances.
   * @param {Array} storedTargets - Array of {tokenId, sceneId} objects
   * @returns {Actor[]}
   * @private
   */
  static _getTargetActorsFromStored(storedTargets) {
    if (!storedTargets || storedTargets.length === 0) return [];
    return storedTargets.map(t => {
      const scene = game.scenes.get(t.sceneId);
      const token = scene?.tokens?.get(t.tokenId);
      return token?.actor;
    }).filter(Boolean);
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

    // Get roll data WITH item effects applied (important for on-use effects)
    const rollData = item ? actor.getRollDataWithItemEffects(item) : actor.getRollData();

    // Add stat bonus on critical hit (positive or negative)
    let finalFormula = damageFormula;
    if (context.isCritical && context.statKey) {
      // Use roll data (includes item effects) instead of actor.system directly
      const statValue = rollData.stats?.[context.statKey]?.value || 0;
      if (statValue !== 0) {  // ✅ FIX: Include negative stats too (they reduce damage)
        finalFormula += ` + ${statValue}`;
      }
    }

    // Always-on crit bonuses (e.g. Brutal) — fire regardless of Luck/benefit toggle
    if (context.isCritical) {
      const alwaysOnBonuses = this._collectCritAlwaysOnBonuses(item, actor, finalFormula);
      for (const bonus of alwaysOnBonuses) finalFormula += ` + ${bonus.formula}`;
    }

    // Determine item type and apply appropriate separated bonuses
    let equipmentType = null;
    if (item) {
      // For equipment items, check equipmentType field
      if (item.system.equipmentType) {
        equipmentType = item.system.equipmentType;
      }
      // For spell items
      else if (item.type === 'spell') {
        equipmentType = 'spell';
      }
    } else if (context.type) {
      // Fallback to context type if item not available
      equipmentType = context.type;
    }

    // Apply type-specific universal damage bonuses
    let typeFlatBonus = 0;
    let typeDiceBonus = '';

    if (equipmentType === 'weapon') {
      typeFlatBonus = actor.system.universalWeaponDamageBonus || 0;
      typeDiceBonus = actor.system.universalWeaponDamageDice || '';
    } else if (equipmentType === 'spell') {
      typeFlatBonus = actor.system.universalSpellDamageBonus || 0;
      typeDiceBonus = actor.system.universalSpellDamageDice || '';
    } else if (equipmentType === 'alchemical') {
      typeFlatBonus = actor.system.universalAlchemicalDamageBonus || 0;
      typeDiceBonus = actor.system.universalAlchemicalDamageDice || '';
    }

    // Safety check: ensure it's a string
    if (Array.isArray(typeDiceBonus)) {
      typeDiceBonus = typeDiceBonus.filter(d => !!d).join(' + ');
    }

    if (typeFlatBonus !== 0) {
      finalFormula += ` + ${typeFlatBonus}`;
    }
    if (typeof typeDiceBonus === 'string' && typeDiceBonus.trim() !== '') {
      finalFormula += ` + ${typeDiceBonus}`;
    }

    // Add legacy universal damage bonuses (backward compatibility)
    const universalFlatBonus = actor.system.universalDamageBonus || 0;
    let universalDiceBonus = actor.system.universalDamageDice || '';

    // Safety check: ensure it's a string
    if (Array.isArray(universalDiceBonus)) {
      universalDiceBonus = universalDiceBonus.filter(d => !!d).join(' + ');
    }

    if (universalFlatBonus !== 0) {
      finalFormula += ` + ${universalFlatBonus}`;
    }
    if (typeof universalDiceBonus === 'string' && universalDiceBonus.trim() !== '') {
      finalFormula += ` + ${universalDiceBonus}`;
    }

    // Check if all stored targets are weak — if so, include weakness die in formula
    const storedTargetsForWeak = this._getTargetsFromButton(button);
    const finalDamageTypeKey = context.damageType || null;
    let weaknessPreRolled = false;
    if (finalDamageTypeKey && finalDamageTypeKey !== '-' && storedTargetsForWeak.length > 0) {
      const targetActors = this._getTargetActorsFromStored(storedTargetsForWeak);
      if (targetActors.length > 0 && targetActors.every(a => this._isWeakTo(a, finalDamageTypeKey, item))) {
        // Die size matches what the apply-time code would use
        const weakDieSize = item ? this._getDamageSourceDieSize(item, null, actor) : 6;
        finalFormula += ` + 1d${weakDieSize}`;
        weaknessPreRolled = true;
      }
    }

    // Roll damage (without explosion modifiers in formula)
    const damageRoll = new Roll(finalFormula, actor.getRollData());
    await damageRoll.evaluate();

    // Mark the weakness die in the roll so it shows the type icon overlay
    if (weaknessPreRolled) this._markWeaknessDie(damageRoll);

    // Apply manual explosions if item supports it
    if (item) {
      const explodeValues = this._getExplodeValues(item, actor);
      if (explodeValues) {
        await this._manuallyExplodeDice(damageRoll, explodeValues);
      }
    }

    damageRoll._weaknessPreRolled = weaknessPreRolled;

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
    await this.postDamageResult(damageRoll, damageTypeLabel, context.isCritical, actor, item, finalDamageTypeKey, attackType, critStatBonus, damageRoll._weaknessPreRolled ?? false);
  }

  /**
   * Post a separate damage result message with save buttons
   * Uses existing createActionCard() to avoid code duplication
   */
  static async postDamageResult(damageRoll, damageType, isCritical, actor, item, damageTypeKey = null, attackType = 'melee', critStatBonus = 0, weaknessPreRolled = false) {
    const { VagabondChatCard } = await import('./chat-card.mjs');

    return await VagabondChatCard.createActionCard({
      actor,
      item,
      title: `${item?.name || 'Attack'} Damage`,
      damageRoll,
      damageType: damageTypeKey || damageType,
      hasDefenses: !this.isRestorativeDamageType(damageTypeKey || damageType),
      attackType,
      rollData: isCritical ? { isCritical: true, critStatBonus } : null,
      weaknessPreRolled,
    });
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
   * Get explosion values from an item if enabled
   * Checks both item properties AND actor global explode bonuses
   *
   * @param {Item} item - The item (spell or equipment) with canExplode and explodeValues
   * @param {Actor} actor - Optional actor for global explode bonuses
   * @returns {Array<number>|null} Array of values to explode on, or null if not enabled
   * @private
   */
  static _getExplodeValues(item, actor = null) {
    // 1. Get Local Item Settings
    let canExplode = item?.system?.canExplode;
    let explodeValuesStr = item?.system?.explodeValues;

    // 2. Check Global Actor Bonuses (from Perks/Traits Active Effects)
    if (actor) {
      // If a global effect says "Explode All", treat canExplode as true
      if (actor.system.bonuses?.globalExplode) {
        canExplode = true;
      }

      // If a global effect provides specific values (e.g. "1,2"), use those
      // You can decide if this overrides or appends. Here we override if present.
      const globalValues = actor.system.bonuses?.globalExplodeValues;
      if (globalValues) {
        explodeValuesStr = globalValues;
      }
    }

    // 3. Validation
    if (!canExplode || !explodeValuesStr) {
      return null;
    }

    // Parse explode values (comma-separated)
    const explodeValues = explodeValuesStr
      .split(',')
      .map(v => v.trim())
      .filter(v => v && !isNaN(v))
      .map(v => parseInt(v));

    return explodeValues.length > 0 ? explodeValues : null;
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

    // Determine die size: base (spell override or default 6) + actor bonus
    const baseDieSize = spell.system.damageDieSize || 6;
    const dieSize = baseDieSize + (actor.system.spellDamageDieSizeBonus || 0);
    let damageFormula = `${spellState.damageDice}d${dieSize}`;

    // Add stat bonus on critical hit (positive or negative)
    if (isCritical && statKey) {
      const statValue = actor.system.stats[statKey]?.value || 0;
      if (statValue !== 0) {  // ✅ FIX: Include negative stats too (they reduce damage)
        damageFormula += ` + ${statValue}`;
      }
    }

    // Add spell-specific universal damage bonuses (new separated system)
    const spellFlatBonus = actor.system.universalSpellDamageBonus || 0;
    let spellDiceBonus = actor.system.universalSpellDamageDice || '';
    
    // Safety check: ensure it's a string (may be array if derived data failed to join)
    if (Array.isArray(spellDiceBonus)) {
      spellDiceBonus = spellDiceBonus.filter(d => !!d).join(' + ');
    }

    if (spellFlatBonus !== 0) {
      damageFormula += ` + ${spellFlatBonus}`;
    }
    if (typeof spellDiceBonus === 'string' && spellDiceBonus.trim() !== '') {
      damageFormula += ` + ${spellDiceBonus}`;
    }

    // Add legacy universal damage bonuses (backward compatibility)
    const universalFlatBonus = actor.system.universalDamageBonus || 0;
    let universalDiceBonus = actor.system.universalDamageDice || '';

    // Safety check: ensure it's a string
    if (Array.isArray(universalDiceBonus)) {
      universalDiceBonus = universalDiceBonus.filter(d => !!d).join(' + ');
    }

    if (universalFlatBonus !== 0) {
      damageFormula += ` + ${universalFlatBonus}`;
    }
    if (typeof universalDiceBonus === 'string' && universalDiceBonus.trim() !== '') {
      damageFormula += ` + ${universalDiceBonus}`;
    }

    // Check if all targets are weak — if so, include the weakness die in the formula
    const damageType = spell.system.damageType;
    let weaknessPreRolled = false;
    if (damageType && damageType !== '-' && targetsAtRollTime.length > 0) {
      const targetActors = this._getTargetActorsFromStored(targetsAtRollTime);
      if (targetActors.length > 0 && targetActors.every(a => this._isWeakTo(a, damageType, null))) {
        damageFormula += ` + 1d${dieSize}`;
        weaknessPreRolled = true;
      }
    }

    // Roll damage (without explosion modifiers in formula)
    const roll = new Roll(damageFormula, actor.getRollData());
    await roll.evaluate();

    // Mark the weakness die in the roll so it displays with the type icon overlay
    if (weaknessPreRolled) this._markWeaknessDie(roll);

    // Apply manual explosions if enabled
    const explodeValues = this._getExplodeValues(spell, actor);
    if (explodeValues) {
      await this._manuallyExplodeDice(roll, explodeValues);
    }

    roll._weaknessPreRolled = weaknessPreRolled;
    return roll;
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
    const isRestorative = ['healing', 'recover', 'recharge'].includes(damageType);

    // Determine icon and label
    let icon, label;
    if (isRestorative) {
      if (damageType === 'healing') {
        icon = 'fa-heart';
        label = `Apply ${damageAmount} Healing`;
      } else if (damageType === 'recover') {
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

    const actor = game.actors.get(actorId);
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
      // Roll damage
      damageRoll = new Roll(damageAmount, actor.getRollData());
      await damageRoll.evaluate();
      finalDamage = damageRoll.total;
    } else {
      // Flat damage/healing
      finalDamage = parseInt(damageAmount);
      damageRoll = null;
    }

    // Check if it's restorative or harmful
    const isRestorative = ['healing', 'recover', 'recharge'].includes(damageType);

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
      title: `${item.name} Damage`,
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

    const actor = game.actors.get(actorId);
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
          title: `${action.name} Damage`,
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

    // Look up the damage type icon (skip for typeless "-" damage)
    if (damageTypeKey && damageTypeKey !== '-' && CONFIG.VAGABOND?.damageTypeIcons?.[damageTypeKey]) {
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
   * Check if a damage type is restorative (healing, recover, recharge)
   * @param {string} damageType - The damage type to check
   * @returns {boolean}
   */
  static isRestorativeDamageType(damageType) {
    const normalizedType = damageType?.toLowerCase() || '';
    return normalizedType === 'healing' || normalizedType === 'recover' || normalizedType === 'recharge';
  }

  /**
   * Create an "Apply Damage" button
   * @param {number} damageAmount - The amount of damage
   * @param {string} damageType - Type of damage (or healing/recover/recharge)
   * @param {string} actorId - Source actor ID
   * @param {string} itemId - Item ID (optional)
   * @returns {string} HTML button string
   */
  static createApplyDamageButton(damageAmount, damageType, actorId, itemId = null, targetsAtRollTime = [], actionIndex = null) {
    // Check damage type and set appropriate button style
    const normalizedType = damageType.toLowerCase();
    let icon, text, buttonClass;

    if (normalizedType === 'healing') {
      icon = 'fa-heart-pulse';
      text = `Apply ${damageAmount} Healing`;
      buttonClass = 'vagabond-apply-healing-button';
    } else if (normalizedType === 'recover') {
      icon = 'fa-arrows-rotate';
      text = `Recover ${damageAmount} Fatigue`;
      buttonClass = 'vagabond-apply-recover-button';
    } else if (normalizedType === 'recharge') {
      icon = 'fa-bolt';
      text = `Restore ${damageAmount} Mana`;
      buttonClass = 'vagabond-apply-recharge-button';
    } else {
      icon = 'fa-heart-crack';
      text = `Apply ${damageAmount} Damage`;
      buttonClass = 'vagabond-apply-damage-button';
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
   * Returns true if the actor has no equipped armor or only light armor.
   * Used for the Berserk damage-reduction condition.
   * @param {Actor} actor
   * @returns {boolean}
   */
  static _isLightOrNoArmor(actor) {
    const equipped = actor.items?.find(i => {
      const isArmor = i.type === 'armor' || (i.type === 'equipment' && i.system.equipmentType === 'armor');
      return isArmor && i.system.equipped;
    });
    if (!equipped) return true;
    return equipped.system.armorType === 'light';
  }

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

  static calculateFinalDamage(actor, damage, damageType, attackingWeapon = null) {
    // Normalize damage type for lookup
    const normalizedType = damageType.toLowerCase();

    // Handle typeless damage ("-") - just apply armor, skip immunities/weaknesses
    if (normalizedType === '-') {
      const armorRating = actor.system.armor || 0;
      return Math.max(0, damage - armorRating);
    }

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

    // Berserk — reduce by 1 per die while berserk with light or no armor
    const reductionPerDie = actor.system.incomingDamageReductionPerDie || 0;
    if (reductionPerDie > 0 && actor.statuses?.has('berserk') && VagabondDamageHelper._isLightOrNoArmor(actor)) {
      const numDice = VagabondDamageHelper._countDiceInFormula(attackingWeapon?.system?.damageAmount ?? '');
      if (numDice > 0) finalDamage = Math.max(0, finalDamage - reductionPerDie * numDice);
    }

    return finalDamage;
  }

  /**
   * Extract the die size from a damage formula string (e.g. "2d8+1" → 8, "3d6" → 6).
   * @param {string} formula
   * @returns {number}
   */
  static _extractDieSize(formula) {
    const match = /\d*d(\d+)/i.exec(String(formula || ''));
    return match ? parseInt(match[1]) : 6;
  }

  /**
   * Determine the base damage die size used by the attacker (for the weakness extra die roll).
   * @param {Item|null} sourceItem
   * @param {number|null} actionIdx  NPC action index (used when sourceItem is null)
   * @param {Actor|null} sourceActor
   * @returns {number}
   */
  static _getDamageSourceDieSize(sourceItem, actionIdx, sourceActor) {
    if (sourceItem) {
      if (sourceItem.type === 'spell') {
        const base = sourceItem.system.damageDieSize || 6;
        const bonus = sourceActor?.system?.spellDamageDieSizeBonus || 0;
        return base + bonus;
      }
      const formula = sourceItem.system.currentDamage || sourceItem.system.damageAmount || '';
      return this._extractDieSize(formula);
    }
    if (actionIdx !== null && actionIdx !== undefined && !isNaN(actionIdx) && sourceActor) {
      const action = sourceActor.system.actions?.[actionIdx];
      if (action?.rollDamage) return this._extractDieSize(action.rollDamage);
    }
    return 6;
  }

  /**
   * Check whether a target actor is weak to a given damage type (including material weakness).
   * @param {Actor} targetActor
   * @param {string} damageType
   * @param {Item|null} attackingWeapon
   * @returns {boolean}
   */
  static _isWeakTo(targetActor, damageType, attackingWeapon = null) {
    const normalizedType = damageType.toLowerCase();
    if (normalizedType === '-') return false;
    const weaknesses = targetActor.system.weaknesses || [];
    if (attackingWeapon?.system?.metal && weaknesses.includes(attackingWeapon.system.metal)) return true;
    return weaknesses.includes(normalizedType);
  }


  /**
   * Create defend options accordion HTML
   * @returns {string} HTML string
   */
  static createDefendOptions() {
    return `
      <div class="defend-info-box">
        <div class="defend-header">
          <i class="fas fa-shield-alt"></i>
          <span>${game.i18n.localize('VAGABOND.DefendMechanics.DefendingTitle')}</span>
          <i class="fas fa-chevron-down expand-icon"></i>
        </div>
        <div class="defend-content">
          <p>
            <strong>${game.i18n.localize('VAGABOND.DefendMechanics.DodgeTitle')}:</strong>
            ${game.i18n.localize('VAGABOND.DefendMechanics.DodgeDescription')}
          </p>
          <p>
            <strong>${game.i18n.localize('VAGABOND.DefendMechanics.BlockTitle')}:</strong>
            ${game.i18n.localize('VAGABOND.DefendMechanics.BlockDescription')}
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
   * Create save reminder buttons (no damage, just roll saves)
   * @param {string} attackType - Attack type for hinder calculation ('melee', 'ranged', 'cast')
   * @param {Array} targetsAtRollTime - Targets captured at roll time
   * @returns {string} HTML string
   */
  static createSaveReminderButtons(attackType = 'melee', targetsAtRollTime = [], actorId = '', itemId = '', actionIndex = null, statusSaveTypes = new Set()) {
    // Localize Labels
    const reflexLabel = game.i18n.localize('VAGABOND.Saves.Reflex.name');
    const endureLabel = game.i18n.localize('VAGABOND.Saves.Endure.name');
    const willLabel = game.i18n.localize('VAGABOND.Saves.Will.name');

    const targetsJson = JSON.stringify(targetsAtRollTime).replace(/"/g, '&quot;');

    // Red tint classes for buttons required to resist an on-hit status
    const reflexClass = statusSaveTypes.has('reflex') ? ' save-has-status' : '';
    const endureClass = statusSaveTypes.has('endure') ? ' save-has-status' : '';
    const willClass   = statusSaveTypes.has('will')   ? ' save-has-status' : '';

    return `
      <div class="vagabond-save-buttons-container">
        <div class="save-buttons-row">
            <button class="vagabond-save-reminder-button save-reflex${reflexClass}"
              data-save-type="reflex"
              data-attack-type="${attackType}"
              data-actor-id="${actorId}"
              data-item-id="${itemId || ''}"
              data-action-index="${actionIndex ?? ''}"
              data-targets="${targetsJson}">
              <i class="fas fa-running"></i> ${reflexLabel}
            </button>
            <button class="vagabond-save-reminder-button save-endure${endureClass}"
              data-save-type="endure"
              data-attack-type="${attackType}"
              data-actor-id="${actorId}"
              data-item-id="${itemId || ''}"
              data-action-index="${actionIndex ?? ''}"
              data-targets="${targetsJson}">
              <i class="fas fa-shield-alt"></i> ${endureLabel}
            </button>
            <button class="vagabond-save-reminder-button save-will${willClass}"
              data-save-type="will"
              data-attack-type="${attackType}"
              data-actor-id="${actorId}"
              data-item-id="${itemId || ''}"
              data-action-index="${actionIndex ?? ''}"
              data-targets="${targetsJson}">
              <i class="fas fa-brain"></i> ${willLabel}
            </button>
        </div>
      </div>
    `;
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

    // Localize Labels
    const reflexLabel = game.i18n.localize('VAGABOND.Saves.Reflex.name');
    const endureLabel = game.i18n.localize('VAGABOND.Saves.Endure.name');
    const willLabel = game.i18n.localize('VAGABOND.Saves.Will.name');

    // FIX: Ensure Apply Direct key exists or fallback to English
    const applyKey = 'VAGABOND.Chat.ApplyDirect';
    let applyDirectLabel = game.i18n.localize(applyKey);
    if (applyDirectLabel === applyKey) applyDirectLabel = "Apply Direct";

    // Red tint classes for buttons that are required to resist an on-hit status
    const reflexClass = statusSaveTypes.has('reflex') ? ' save-has-status' : '';
    const endureClass = statusSaveTypes.has('endure') ? ' save-has-status' : '';
    const willClass   = statusSaveTypes.has('will')   ? ' save-has-status' : '';

    // Crit toggle attrs: when a crit stat bonus is included in damageAmount, store both values
    // so the attack-crit-toggle JS handler can swap data-damage-amount when toggled
    const critAttrs = (critStatBonus > 0 && attackWasCrit)
      ? ` data-damage-crit="${damageAmount}" data-damage-normal="${damageAmount - critStatBonus}"`
      : '';

    // LAYOUT FIX: Two rows. Top: Apply Direct. Bottom: Saves.
    return `
      <div class="vagabond-save-buttons-container">
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

        <div class="save-buttons-row">
            <button class="vagabond-save-button save-reflex${reflexClass}"
              data-save-type="reflex"
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
              <i class="fas fa-running"></i> ${reflexLabel}
            </button>
            <button class="vagabond-save-button save-endure${endureClass}"
              data-save-type="endure"
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
              <i class="fas fa-shield-alt"></i> ${endureLabel}
            </button>
            <button class="vagabond-save-button save-will${willClass}"
              data-save-type="will"
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
              <i class="fas fa-brain"></i> ${willLabel}
            </button>
        </div>
      </div>
    `;
  }

  /**
   * Handle save button click - roll saves for each targeted token
   * @param {HTMLElement} button - The clicked save button
   * @param {Event} event - The click event (for keyboard modifiers)
   */
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

    // Get targets with fallback
    const storedTargets = this._getTargetsFromButton(button);

    let actorsToRoll = [];

    if (!game.user.isGM) {
      // PLAYER: Use stored targets if available, otherwise smart single-char detection
      if (storedTargets.length > 0) {
        const targetTokens = this._resolveStoredTargets(storedTargets);
        actorsToRoll = targetTokens.map(t => t.actor).filter(a => a && a.isOwner);

        if (actorsToRoll.length === 0) {
          ui.notifications.warn('None of the targeted tokens belong to you.');
          return;
        }
      } else {
        // Fallback: single-character detection
        const ownedCharacters = game.actors.filter(a => a.type === 'character' && a.isOwner);
        if (ownedCharacters.length === 1) {
          actorsToRoll = [ownedCharacters[0]];
        } else if (ownedCharacters.length > 1) {
          ui.notifications.warn('You have multiple characters. Please target the token you want to roll for.');
          return;
        } else {
          ui.notifications.warn('You do not own any characters to roll saves for.');
          return;
        }
      }
    } else {
      // GM: Use stored targets
      if (storedTargets.length === 0) {
        ui.notifications.warn('No tokens targeted. Please target at least one token.');
        return;
      }

      const targetTokens = this._resolveStoredTargets(storedTargets);
      actorsToRoll = targetTokens.map(t => t.actor).filter(a => a);
    }

    // Determine Cleave split before iterating
    const _saveSourceActor = actorId ? game.actors.get(actorId) : null;
    const _saveSourceItem = _saveSourceActor?.items.get(itemId);
    const _hasCleave = _saveSourceItem?.system?.properties?.includes('Cleave') ?? false;
    const _saveTargetCount = actorsToRoll.length;

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

      // Cleave splits the incoming damage across all targets
      let effectiveDamageAmount = damageAmount;
      if (_hasCleave && _saveTargetCount > 1) {
        const base = Math.floor(damageAmount / _saveTargetCount);
        effectiveDamageAmount = base + (_saveIdx < (damageAmount % _saveTargetCount) ? 1 : 0);
      }

      // Determine if save is Hindered by conditions (heavy armor, ranged attack, etc.)
      const isHindered = this._isSaveHindered(saveType, attackType, targetActor);

      // Check if attacker has outgoingSavesModifier (e.g., Confused: saves vs its attacks have Favor)
      const sourceActor = actorId ? game.actors.get(actorId) : null;
      let effectiveAttackerModifier = sourceActor?.system?.outgoingSavesModifier || 'none';

      // Check if target has status resistance granting Favor on this save type
      {
        const { StatusHelper } = await import('./status-helper.mjs');
        const sourceItem = sourceActor?.items.get(itemId);
        const itemEntries = sourceItem?.system?.causedStatuses ?? [];
        const actionEntries = (!sourceItem && actionIdx !== null && !isNaN(actionIdx))
          ? (sourceActor?.system?.actions?.[actionIdx]?.causedStatuses ?? [])
          : [];
        const passiveEntries = sourceActor
          ? sourceActor.items.filter(i => i.system?.equipped && i.system?.passiveCausedStatuses?.length).flatMap(i => i.system.passiveCausedStatuses)
          : [];
        const allIncomingEntries = [...itemEntries, ...actionEntries, ...passiveEntries];
        const hasResistance = allIncomingEntries.some(e =>
          (e.saveType === saveType || e.saveType === 'any') && StatusHelper.isStatusResisted(targetActor, e.statusId)
        );
        if (hasResistance) {
          if (effectiveAttackerModifier === 'hinder') effectiveAttackerModifier = 'none';
          else if (effectiveAttackerModifier === 'none') effectiveAttackerModifier = 'favor';
        }
      }

      // Extract keyboard modifiers from event
      const shiftKey = event?.shiftKey || false;
      const ctrlKey = event?.ctrlKey || false;

      // Roll the save with keyboard modifiers and attacker's outgoing modifier
      const saveRoll = await this._rollSave(targetActor, saveType, isHindered, shiftKey, ctrlKey, effectiveAttackerModifier);

      // Dice So Nice animation is handled automatically by roll.evaluate() in Foundry v13
      // No need to manually call showForRoll here

      // Determine success and critical
      const difficulty = targetActor.system.saves?.[saveType]?.difficulty || 10;
      const isSuccess = saveRoll.total >= difficulty;
      const { VagabondChatCard } = await import('./chat-card.mjs');
      const { VagabondRollBuilder } = await import('./roll-builder.mjs');
      const critNumber = VagabondRollBuilder.calculateCritThreshold(targetActor.getRollData(), saveType);
      const isCritical = VagabondChatCard.isRollCritical(saveRoll, critNumber);

      // Calculate damage breakdown for display
      let damageAfterSave = effectiveDamageAmount;
      let saveReduction = 0;
      if (isSuccess) {
        if (_hasCleave && _saveTargetCount > 1 && damageAmount > 0) {
          // Proportionally scale the save reduction to match the Cleave split
          const fullAfterSave = this._removeHighestDie(rollTermsData);
          damageAfterSave = Math.floor(effectiveDamageAmount * (fullAfterSave / damageAmount));
        } else {
          damageAfterSave = this._removeHighestDie(rollTermsData);
        }
        saveReduction = effectiveDamageAmount - damageAfterSave;
      }

      // Apply armor/immune/weak modifiers and track armor reduction
      // sourceActor already declared above for outgoingSavesModifier check
      const sourceItem = sourceActor?.items.get(itemId);
      const baseAfterFinal = this.calculateFinalDamage(targetActor, damageAfterSave, damageType, sourceItem);
      const armorReduction = damageAfterSave - baseAfterFinal;
      // RAW: Weak — bypass Armor/Immune + deal an extra damage die
      let finalDamage = baseAfterFinal;
      const weaknessPreRolledSave = button.dataset.weaknessPreRolled === 'true';
      if (!weaknessPreRolledSave && this._isWeakTo(targetActor, damageType, sourceItem)) {
        const dieSize = this._getDamageSourceDieSize(sourceItem, actionIdx, sourceActor);
        const weakRoll = new Roll(`1d${dieSize}`);
        await weakRoll.evaluate();
        finalDamage += weakRoll.total;
      }

      // Auto-apply damage if setting enabled.
      // Crit saves always skip auto-apply so the player can choose the Luck/benefit toggle first.
      const autoApply = game.settings.get('vagabond', 'autoApplySaveDamage') && !isCritical;
      if (autoApply) {
        const currentHP = targetActor.system.health?.value || 0;
        const newHP = Math.max(0, currentHP - finalDamage);
        await targetActor.update({ 'system.health.value': newHP });
      }

      // Collect on-hit status entries (item.causedStatuses with fallback to actor action)
      const { StatusHelper } = await import('./status-helper.mjs');
      const coatingEntries = (sourceItem?.system?.coating?.charges > 0)
        ? (sourceItem.system.coating.causedStatuses ?? [])
        : [];
      const normalEntries = sourceItem?.system?.causedStatuses?.length
        ? sourceItem.system.causedStatuses
        : (actionIdx !== null && !isNaN(actionIdx) && sourceActor?.system?.actions?.[actionIdx]?.causedStatuses?.length)
          ? sourceActor.system.actions[actionIdx].causedStatuses
          : [];
      const critEntries = attackWasCrit
        ? (sourceItem?.system?.critCausedStatuses?.length
            ? sourceItem.system.critCausedStatuses
            : (actionIdx !== null && !isNaN(actionIdx) && sourceActor?.system?.actions?.[actionIdx]?.critCausedStatuses?.length)
              ? sourceActor.system.actions[actionIdx].critCausedStatuses
              : [])
        : [];
      const mergedEntries = attackWasCrit
        ? [...critEntries, ...normalEntries.filter(e => !critEntries.some(c => c.statusId === e.statusId))]
        : normalEntries;
      const passiveEntries = sourceActor
        ? sourceActor.items.filter(i => i.system?.equipped && i.system?.passiveCausedStatuses?.length).flatMap(i => i.system.passiveCausedStatuses)
        : [];
      const allStatusEntries = [...mergedEntries, ...coatingEntries, ...passiveEntries];

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
        autoApply ? null : statusContext  // embed context only for manual-apply cards
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
        if (coatingEntries.length > 0) {
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

    // Get targets with fallback
    const storedTargets = this._getTargetsFromButton(button);

    let actorsToRoll = [];

    if (!game.user.isGM) {
      // PLAYER: Use stored targets if available, otherwise smart single-char detection
      if (storedTargets.length > 0) {
        const targetTokens = this._resolveStoredTargets(storedTargets);
        actorsToRoll = targetTokens.map(t => t.actor).filter(a => a && a.isOwner);

        if (actorsToRoll.length === 0) {
          ui.notifications.warn('None of the targeted tokens belong to you.');
          return;
        }
      } else {
        // Fallback: single-character detection
        const ownedCharacters = game.actors.filter(a => a.type === 'character' && a.isOwner);
        if (ownedCharacters.length === 1) {
          actorsToRoll = [ownedCharacters[0]];
        } else if (ownedCharacters.length > 1) {
          ui.notifications.warn('You have multiple characters. Please target the token you want to roll for.');
          return;
        } else {
          ui.notifications.warn('You do not own any characters to roll saves for.');
          return;
        }
      }
    } else {
      // GM: Use stored targets
      if (storedTargets.length === 0) {
        ui.notifications.warn('No tokens targeted. Please target at least one token.');
        return;
      }

      const targetTokens = this._resolveStoredTargets(storedTargets);
      actorsToRoll = targetTokens.map(t => t.actor).filter(a => a);
    }

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

      // Determine if save is Hindered by conditions (heavy armor, ranged attack, etc.)
      const isHindered = this._isSaveHindered(saveType, attackType, targetActor);

      // Check if attacker has outgoingSavesModifier (e.g., Confused: saves vs its attacks have Favor)
      const sourceActor = actorId ? game.actors.get(actorId) : null;
      let effectiveAttackerModifier2 = sourceActor?.system?.outgoingSavesModifier || 'none';

      // Check if target has status resistance granting Favor on this save type
      {
        const { StatusHelper } = await import('./status-helper.mjs');
        const sourceItem = sourceActor?.items.get(itemId);
        const itemEntries = sourceItem?.system?.causedStatuses ?? [];
        const actionEntries = (!sourceItem && actionIdx !== null && !isNaN(actionIdx))
          ? (sourceActor?.system?.actions?.[actionIdx]?.causedStatuses ?? [])
          : [];
        const passiveEntries = sourceActor
          ? sourceActor.items.filter(i => i.system?.equipped && i.system?.passiveCausedStatuses?.length).flatMap(i => i.system.passiveCausedStatuses)
          : [];
        const allIncomingEntries = [...itemEntries, ...actionEntries, ...passiveEntries];
        const hasResistance = allIncomingEntries.some(e =>
          (e.saveType === saveType || e.saveType === 'any') && StatusHelper.isStatusResisted(targetActor, e.statusId)
        );
        if (hasResistance) {
          if (effectiveAttackerModifier2 === 'hinder') effectiveAttackerModifier2 = 'none';
          else if (effectiveAttackerModifier2 === 'none') effectiveAttackerModifier2 = 'favor';
        }
      }

      // Extract keyboard modifiers from event
      const shiftKey = event?.shiftKey || false;
      const ctrlKey = event?.ctrlKey || false;

      // Roll the save with keyboard modifiers and attacker's outgoing modifier
      const saveRoll = await this._rollSave(targetActor, saveType, isHindered, shiftKey, ctrlKey, effectiveAttackerModifier2);

      // Dice So Nice animation is handled automatically by roll.evaluate() in Foundry v13
      // No need to manually call showForRoll here

      // Determine success and critical
      const difficulty = targetActor.system.saves?.[saveType]?.difficulty || 10;
      const isSuccess = saveRoll.total >= difficulty;
      const { VagabondChatCard } = await import('./chat-card.mjs');
      const { VagabondRollBuilder } = await import('./roll-builder.mjs');
      const critNumber = VagabondRollBuilder.calculateCritThreshold(targetActor.getRollData(), saveType);
      const isCritical = VagabondChatCard.isRollCritical(saveRoll, critNumber);

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
      const sourceItem = sourceActor?.items.get(itemId);
      const coatingEntries = (sourceItem?.system?.coating?.charges > 0)
        ? (sourceItem.system.coating.causedStatuses ?? [])
        : [];
      const itemNormalEntries = sourceItem?.system?.causedStatuses ?? [];
      const actionCausedStatuses = (!sourceItem && actionIdx !== null && !isNaN(actionIdx))
        ? (sourceActor?.system?.actions?.[actionIdx]?.causedStatuses ?? [])
        : [];
      const passiveEntries2 = sourceActor
        ? sourceActor.items.filter(i => i.system?.equipped && i.system?.passiveCausedStatuses?.length).flatMap(i => i.system.passiveCausedStatuses)
        : [];
      const allStatusEntries = [...itemNormalEntries, ...coatingEntries, ...actionCausedStatuses, ...passiveEntries2];
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
        if (coatingEntries.length > 0) {
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
   * Check if actor has equipped shield with Shield property
   * @param {Actor} actor - The defending actor
   * @returns {boolean} True if shield equipped with Shield property
   * @private
   */
  static _hasEquippedShield(actor) {
    // Find equipped weapon with Shield property
    const equippedShield = actor.items.find(item => {
      const isWeapon = (item.type === 'weapon') ||
                      (item.type === 'equipment' && item.system.equipmentType === 'weapon');
      const isEquipped = item.system.equipped === true ||
                        item.system.equipmentState === 'oneHand' ||
                        item.system.equipmentState === 'twoHands';
      const hasShieldProperty = item.system.properties?.includes('Shield');

      return isWeapon && isEquipped && hasShieldProperty;
    });

    return !!equippedShield;
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
    // EXCEPTION: Shield property negates ranged hinder (but not cast)
    if (saveType === 'endure' && (attackType === 'ranged' || attackType === 'cast')) {
      // Shield protects against ranged attacks, but not magical (cast) attacks
      if (attackType === 'ranged' && this._hasEquippedShield(actor)) {
        return false; // Shield negates the hinder
      }
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
   * @param {boolean} shiftKey - Whether Shift key was pressed (Favor modifier)
   * @param {boolean} ctrlKey - Whether Ctrl key was pressed (Hinder modifier)
   * @param {string} attackerModifier - Attacker's outgoingSavesModifier ('none', 'favor', 'hinder')
   * @returns {Promise<Roll>} The save roll
   * @private
   */
  static async _rollSave(actor, saveType, isHindered, shiftKey = false, ctrlKey = false, attackerModifier = 'none') {
    // Use centralized roll builder for all favor/hinder logic
    const { VagabondRollBuilder } = await import('./roll-builder.mjs');

    // Calculate effective favor/hinder from system state and keyboard modifiers
    const systemState = actor.system.favorHinder || 'none';

    let effectiveFavorHinder = VagabondRollBuilder.calculateEffectiveFavorHinder(
      systemState,
      shiftKey,
      ctrlKey
    );

    // Apply attacker's outgoingSavesModifier (e.g., Confused: saves vs its attacks have Favor)
    // This simulates the attacker's status affecting the defender's save
    if (attackerModifier === 'favor') {
      // If already favored/hindered, they cancel out
      if (effectiveFavorHinder === 'hinder') {
        effectiveFavorHinder = 'none';
      } else if (effectiveFavorHinder === 'none') {
        effectiveFavorHinder = 'favor';
      }
      // If already favored, stays favored (no double-favor)
    } else if (attackerModifier === 'hinder') {
      // If already favored/hindered, they cancel out
      if (effectiveFavorHinder === 'favor') {
        effectiveFavorHinder = 'none';
      } else if (effectiveFavorHinder === 'none') {
        effectiveFavorHinder = 'hinder';
      }
      // If already hindered, stays hindered (no double-hinder)
    }

    // Build and evaluate roll with conditional hinder support
    // (isHindered = true when heavy armor for Dodge, or ranged/cast attack for Block)
    const roll = await VagabondRollBuilder.buildAndEvaluateD20WithConditionalHinder(
      actor,
      effectiveFavorHinder,
      isHindered
    );

    return roll;
  }

  /**
   * Collect all always-on crit bonuses for an item from the registry.
   * These bonuses fire on every crit regardless of the Luck/benefit toggle.
   *
   * @param {VagabondItem} item - The item being used
   * @param {VagabondActor} actor - The attacking actor
   * @param {string} currentFormula - The damage formula built so far (needed for die-size inspection)
   * @returns {Array<{formula: string, label: string}>}
   */
  static _collectCritAlwaysOnBonuses(item, actor, currentFormula) {
    const bonuses = [];
    const registry = CONFIG.VAGABOND.critAlwaysOnProperties ?? {};
    for (const [propKey, handler] of Object.entries(registry)) {
      if (item?.system?.properties?.includes(propKey)) {
        const bonus = handler.apply(item, actor, currentFormula);
        if (bonus) bonuses.push(bonus);
      }
    }
    return bonuses;
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
  static async _postSaveResult(actor, saveType, roll, difficulty, isSuccess, isCritical, isHindered, originalDamage, saveReduction, armorReduction, finalDamage, damageType, autoApplied, statusContext = null) {
    const saveLabel = game.i18n.localize(`VAGABOND.Saves.${saveType.charAt(0).toUpperCase() + saveType.slice(1)}.name`);

    // Import VagabondChatCard
    const { VagabondChatCard } = await import('./chat-card.mjs');

    const card = new VagabondChatCard()
      .setType('save-roll')
      .setActor(actor)
      .setTitle(`${saveLabel} Save`)
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
        damageType, saveType, actor, false, isHindered
      );

      cardDescription += `
        <div class="save-crit-toggle" data-crit-active="true" data-actor-id="${actor.id}">
          <div class="crit-state-on">${critCalcHTML}</div>
          <div class="crit-state-off">${normalCalcHTML}</div>
          <div class="save-crit-rule" data-action="toggleCritBenefit" title="${game.i18n.localize('VAGABOND.DefendMechanics.CritToggleHint')}">
            <i class="fa-solid fa-star-of-life"></i>
            <span>
              <strong>${game.i18n.localize('VAGABOND.DefendMechanics.CritTitle')}:</strong>
              ${game.i18n.localize('VAGABOND.DefendMechanics.CritDescription')}
            </span>
          </div>
          ${this.createApplySaveDamageButton(actor.id, actor.name, finalDamage, damageType, statusContext, finalDamage)}
        </div>
      `;
    } else {
      // Normal (non-crit) path
      const damageCalculationHTML = this._buildDamageCalculation(
        originalDamage, saveReduction, armorReduction, finalDamage,
        damageType, saveType, actor, autoApplied, isHindered
      );
      cardDescription += damageCalculationHTML;
      if (!autoApplied && finalDamage > 0) {
        cardDescription += this.createApplySaveDamageButton(actor.id, actor.name, finalDamage, damageType, statusContext);
      }
    }

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
    const saveLabel = game.i18n.localize(`VAGABOND.Saves.${saveType.charAt(0).toUpperCase() + saveType.slice(1)}.name`);

    // Import VagabondChatCard
    const { VagabondChatCard } = await import('./chat-card.mjs');

    const card = new VagabondChatCard()
      .setType('save-roll')
      .setActor(actor)
      .setTitle(`${saveLabel} Save`)
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
  static _buildDamageCalculation(originalDamage, saveReduction, armorReduction, finalDamage, damageType, saveType, actor, autoApplied, isHindered) {
    // Get save icon
    const saveIcons = {
      'reflex': 'fa-solid fa-running',
      'endure': 'fa-solid fa-shield-alt',
      'will': 'fa-solid fa-brain'
    };
    const saveIcon = saveIcons[saveType] || 'fa-solid fa-shield';

    // Get damage type icon and label (handle typeless "-" damage)
    let damageTypeIcon = null;
    let damageTypeLabel = '';
    if (damageType && damageType !== '-') {
      damageTypeIcon = CONFIG.VAGABOND?.damageTypeIcons?.[damageType] || 'fa-solid fa-burst';
      damageTypeLabel = game.i18n.localize(CONFIG.VAGABOND.damageTypes[damageType]) || damageType;
    }

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

      // Check permissions
      if (!targetActor.isOwner && !game.user.isGM) {
        ui.notifications.warn(`You don't have permission to modify ${targetActor.name}.`);
        continue;
      }

      // Apply the appropriate restorative effect
      if (damageType === 'healing') {
        // Healing: Increase HP (up to max)
        // Apply incoming healing modifier (e.g., Sickened: -2)
        const healingModifier = targetActor.system.incomingHealingModifier || 0;
        const modifiedAmount = Math.max(0, amount + healingModifier);

        const currentHP = targetActor.system.health?.value || 0;
        const maxHP = targetActor.system.health?.max || 0;
        const newHP = Math.min(maxHP, currentHP + modifiedAmount);
        const actualHealing = newHP - currentHP;
        await targetActor.update({ 'system.health.value': newHP });


        const { VagabondChatCard: VCCHeal } = await import('./chat-card.mjs');
        await VCCHeal.applyResult(targetActor, {
          type: 'heal',
          rawAmount: amount,
          finalAmount: actualHealing,
          previousValue: currentHP,
          newValue: newHP,
        });
      } else if (damageType === 'recover') {
        // Recover: Decrease Fatigue (down to 0)
        const currentFatigue = targetActor.system.fatigue || 0;
        const newFatigue = Math.max(0, currentFatigue - amount);
        const actualRecovery = currentFatigue - newFatigue;
        await targetActor.update({ 'system.fatigue': newFatigue });

        const { VagabondChatCard: VCCRecover } = await import('./chat-card.mjs');
        await VCCRecover.applyResult(targetActor, {
          type: 'recover',
          finalAmount: actualRecovery,
          previousValue: currentFatigue,
          newValue: newFatigue,
        });
      } else if (damageType === 'recharge') {
        // Recharge: Increase Mana (up to max)
        const currentMana = targetActor.system.mana?.value || 0;
        const maxMana = targetActor.system.mana?.max || 0;
        const newMana = Math.min(maxMana, currentMana + amount);
        const actualRecharge = newMana - currentMana;
        await targetActor.update({ 'system.mana.value': newMana });

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
    const sourceActor = game.actors.get(actorId);
    const sourceItem = sourceActor?.items.get(itemId);

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

    // Cleave splits damage across targets (ceil/floor, first targets get the remainder)
    const hasCleave = sourceItem?.system?.properties?.includes('Cleave');
    const targetCount = targetedTokens.length;

    // Apply damage to each resolved target
    for (let i = 0; i < targetedTokens.length; i++) {
      const target = targetedTokens[i];
      const targetActor = target.actor;
      if (!targetActor) continue;

      // Check permissions
      if (!targetActor.isOwner && !game.user.isGM) {
        ui.notifications.warn(`You don't have permission to modify ${targetActor.name}.`);
        continue;
      }

      // Split damage for Cleave: floor(total/count), first targets absorb remainder
      let effectiveDamage = damageAmount;
      if (hasCleave && targetCount > 1) {
        const base = Math.floor(damageAmount / targetCount);
        effectiveDamage = base + (i < (damageAmount % targetCount) ? 1 : 0);
      }

      // Calculate final damage (armor/immune/weak)
      const baseAfterFinalDirect = this.calculateFinalDamage(targetActor, effectiveDamage, damageType, sourceItem);
      // RAW: Weak — bypass Armor/Immune + deal an extra damage die
      let finalDamage = baseAfterFinalDirect;
      const weaknessPreRolledDirect = button.dataset.weaknessPreRolled === 'true';
      if (!weaknessPreRolledDirect && this._isWeakTo(targetActor, damageType, sourceItem)) {
        const dieSize = this._getDamageSourceDieSize(sourceItem, directActionIdx, sourceActor);
        const weakRoll = new Roll(`1d${dieSize}`);
        await weakRoll.evaluate();
        finalDamage += weakRoll.total;
      }

      const currentHP = targetActor.system.health?.value || 0;
      const newHP = Math.max(0, currentHP - finalDamage);
      await targetActor.update({ 'system.health.value': newHP });


      // Post damage result to chat
      const { VagabondChatCard: VCCDirect } = await import('./chat-card.mjs');
      await VCCDirect.applyResult(targetActor, {
        type: 'damage',
        rawAmount: effectiveDamage,
        armorReduction: effectiveDamage - baseAfterFinalDirect,
        finalAmount: finalDamage,
        damageType,
        previousValue: currentHP,
        newValue: newHP,
        sourceName: directSourceLabel,
        sourceIcon: directSourceIcon,
      });

      // Process on-hit status effects
      const { StatusHelper } = await import('./status-helper.mjs');
      const actionIndexRaw = button.dataset.actionIndex;
      const actionIdx = (actionIndexRaw !== '' && actionIndexRaw != null) ? parseInt(actionIndexRaw) : null;
      const isCritical = button.dataset.isCritical === 'true';
      // NPC actions store causedStatuses on the action, not on an item
      const actionCausedStatuses = (!sourceItem && actionIdx !== null && !isNaN(actionIdx))
        ? (sourceActor?.system?.actions?.[actionIdx]?.causedStatuses ?? [])
        : [];
      const actionCritStatuses = (isCritical && !sourceItem && actionIdx !== null && !isNaN(actionIdx))
        ? (sourceActor?.system?.actions?.[actionIdx]?.critCausedStatuses ?? [])
        : [];
      const coatingEntries = (sourceItem?.system?.coating?.charges > 0)
        ? (sourceItem.system.coating.causedStatuses ?? [])
        : [];
      const itemNormalEntries = sourceItem?.system?.causedStatuses ?? [];
      const itemCritEntries = isCritical ? (sourceItem?.system?.critCausedStatuses ?? []) : [];
      // On a crit: crit entries replace same-statusId normal entries; unique normals still apply
      const mergedItemEntries = isCritical
        ? [...itemCritEntries, ...itemNormalEntries.filter(e => !itemCritEntries.some(c => c.statusId === e.statusId))]
        : itemNormalEntries;
      const passiveEntries3 = sourceActor
        ? sourceActor.items.filter(i => i.system?.equipped && i.system?.passiveCausedStatuses?.length).flatMap(i => i.system.passiveCausedStatuses)
        : [];
      const allStatusEntries = [
        ...mergedItemEntries,
        ...coatingEntries,
        ...actionCausedStatuses,
        ...actionCritStatuses,
        ...passiveEntries3,
      ];
      if (allStatusEntries.length > 0) {
        const sourceName = sourceItem?.name ?? (actionIdx !== null ? sourceActor?.system?.actions?.[actionIdx]?.name : '') ?? '';
        const damageWasBlocked = finalDamage === 0;
        const sourceActorTokenName3 = canvas.tokens?.placeables?.find(t => t.actor?.id === sourceActor?.id)?.document.name || sourceActor?.name || '';
        // Apply Direct bypasses all saves — statuses are applied unconditionally
        const statusResults = await StatusHelper.processCausedStatuses(
          targetActor, allStatusEntries, damageWasBlocked, sourceName, { skipSaveRoll: true, sourceActorName: sourceActorTokenName3 }
        );
        if (coatingEntries.length > 0) {
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
    const actor = game.actors.get(actorId);
    if (!actor) {
      ui.notifications.error('Character not found!');
      return;
    }

    // Check permissions - must own the character or be GM
    if (!actor.isOwner && !game.user.isGM) {
      ui.notifications.warn(`You don't have permission to modify ${actor.name}.`);
      return;
    }

    // Apply the pre-calculated damage to this specific character
    const currentHP = actor.system.health?.value || 0;
    const newHP = Math.max(0, currentHP - finalDamage);
    await actor.update({ 'system.health.value': newHP });

    // Update button text and disable
    const icon = button.querySelector('i');
    button.textContent = `Applied to ${actorName}`;
    if (icon) button.prepend(icon); // Keep the icon
    button.disabled = true;


    // Build source label from stored source attrs (set when statusContext was provided)
    const saveSourceActor = game.actors.get(button.dataset.sourceActorId);
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

      const sourceActor = game.actors.get(sourceActorId);
      const sourceItem  = sourceActor?.items.get(sourceItemId);

      const coatingEntries = (sourceItem?.system?.coating?.charges > 0)
        ? (sourceItem.system.coating.causedStatuses ?? [])
        : [];
      const normalEntries = sourceItem?.system?.causedStatuses?.length
        ? sourceItem.system.causedStatuses
        : (sourceActionIdx !== null && !isNaN(sourceActionIdx) && sourceActor?.system?.actions?.[sourceActionIdx]?.causedStatuses?.length)
          ? sourceActor.system.actions[sourceActionIdx].causedStatuses
          : [];
      const critEntries = attackWasCrit
        ? (sourceItem?.system?.critCausedStatuses?.length
            ? sourceItem.system.critCausedStatuses
            : (sourceActionIdx !== null && !isNaN(sourceActionIdx) && sourceActor?.system?.actions?.[sourceActionIdx]?.critCausedStatuses?.length)
              ? sourceActor.system.actions[sourceActionIdx].critCausedStatuses
              : [])
        : [];
      const mergedEntries = attackWasCrit
        ? [...critEntries, ...normalEntries.filter(e => !critEntries.some(c => c.statusId === e.statusId))]
        : normalEntries;
      const passiveEntries4 = sourceActor
        ? sourceActor.items.filter(i => i.system?.equipped && i.system?.passiveCausedStatuses?.length).flatMap(i => i.system.passiveCausedStatuses)
        : [];
      const allStatusEntries = [...mergedEntries, ...coatingEntries, ...passiveEntries4];

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
        if (coatingEntries.length > 0) {
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
    const sourceActor = game.actors.get(actorId);
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

    // Find the Restrained status definition to clone its changes
    const restrainedDef = CONFIG.statusEffects.find(e => e.id === 'restrained');

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
        img: restrainedDef?.img ?? 'icons/svg/teleport.svg',
        statuses: ['restrained'],
        changes: restrainedDef?.changes ?? [],
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
          mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          value: String(-Math.floor(currentSpeed / 2))
        });
      } else {
        const currentSpeed = sourceActor.system.speed || 0;
        speedChanges.push({
          key: 'system.speed',
          mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          value: String(-Math.floor(currentSpeed / 2))
        });
      }
    }

    // Apply Grappling to source — stores target UUIDs for cleanup
    await sourceActor.createEmbeddedDocuments('ActiveEffect', [{
      name: game.i18n.localize('VAGABOND.StatusConditions.Grappling'),
      img: 'icons/svg/net.svg',
      statuses: ['grappling'],
      changes: speedChanges,
      flags: { vagabond: { grappling: { targetUuids } } }
    }]);

    button.disabled = true;
  }
}
