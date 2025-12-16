import { VagabondChatHelper } from '../helpers/chat-helper.mjs';

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
   * @private
   */
  async roll(event) {
    const item = this;
    const label = `[${item.type}] ${item.name}`;

    // If there's no roll data, send a chat message.
    if (!this.system.formula) {
      // Use VagabondChatCard for equipment items (gear, alchemicals, relics)
      if (item.type === 'equipment') {
        const { VagabondChatCard } = await import('../helpers/chat-card.mjs');
        await VagabondChatCard.gearUse(this.actor, item);
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
      await VagabondChatHelper.postRoll(this.actor, roll, label);
      return roll;
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

    // Get the weapon skill and difficulty
    const weaponSkillKey = this.system.weaponSkill;
    const weaponSkill = actor.system.weaponSkills[weaponSkillKey];
    const difficulty = weaponSkill?.difficulty || 10;

    // Build roll formula with favor/hinder
    let rollFormula = 'd20';
    if (favorHinder === 'favor') {
      rollFormula = 'd20 + 1d6';
    } else if (favorHinder === 'hinder') {
      rollFormula = 'd20 - 1d6';
    }

    // Apply universal check bonus
    const checkBonus = actor.system.universalCheckBonus || 0;
    if (checkBonus !== 0) {
      rollFormula += ` + ${checkBonus}`;
    }

    // Import dice appearance helper
    const { VagabondDiceAppearance } = await import('../helpers/dice-appearance.mjs');

    // Roll the attack
    const roll = new Roll(rollFormula, actor.getRollData());
    await VagabondDiceAppearance.evaluateWithCustomColors(roll, favorHinder);

    // Check if the attack succeeds
    const isHit = roll.total >= difficulty;

    // Check critical - ONLY the d20 result, not including favor/hinder
    const critNumber = actor.system.critNumber || 20;
    const d20Term = roll.terms.find(term => term.constructor.name === 'Die' && term.faces === 20);
    const d20Result = d20Term?.results?.[0]?.result || 0;
    const isCritical = d20Result >= critNumber;

    return {
      roll,
      difficulty,
      isHit,
      isCritical,
      weaponSkill,
      weaponSkillKey,
      favorHinder,
    };
  }

  /**
   * Roll damage with this weapon
   * @param {VagabondActor} actor - The actor making the damage roll
   * @param {boolean} isCritical - Whether this was a critical hit
   * @param {string} statKey - The stat used for the attack (for crit bonus)
   * @returns {Promise<Roll>} The damage roll
   */
  /**
   * Apply exploding dice syntax to a damage formula if enabled
   * @param {string} formula - The base damage formula (e.g., "2d6", "1d8+2")
   * @returns {string} Modified formula with exploding dice
   * @private
   */
  _applyExplodingDice(formula) {
    // 1. Get Local Item Settings
    let canExplode = this.system.canExplode;
    let explodeValuesStr = this.system.explodeValues;

    // 2. Check Global Actor Bonuses (from Perks/Traits Active Effects)
    if (this.actor) {
      // If a global effect says "Explode All", treat canExplode as true
      if (this.actor.system.bonuses?.globalExplode) {
        canExplode = true;
      }

      // If a global effect provides specific values (e.g. "1,2"), use those
      // You can decide if this overrides or appends. Here we override if present.
      const globalValues = this.actor.system.bonuses?.globalExplodeValues;
      if (globalValues) {
        explodeValuesStr = globalValues;
      }
    }

    // 3. Validation
    if (!canExplode || !explodeValuesStr) {
      return formula;
    }

    // Parse explode values (comma-separated)
    const explodeValues = explodeValuesStr
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

  async rollDamage(actor, isCritical = false, statKey = null) {
    // Check if this is a weapon (legacy weapon item OR equipment with equipmentType='weapon')
    const isWeapon = (this.type === 'weapon') ||
                    (this.type === 'equipment' && this.system.equipmentType === 'weapon');

    if (!isWeapon) {
      throw new Error('Not a weapon');
    }

    let damageFormula = this.system.currentDamage;

    // Add stat bonus on critical hit
    if (isCritical && statKey) {
      const statValue = actor.system.stats[statKey]?.value || 0;
      if (statValue > 0) {
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

    // Apply exploding dice syntax if enabled
    damageFormula = this._applyExplodingDice(damageFormula);

    const roll = new Roll(damageFormula, actor.getRollData());
    await roll.evaluate();
    return roll;
  }

  /**
   * Build the flavor text for an attack roll
   * @param {Object} attackResult - The result from rollAttack()
   * @param {Roll} damageRoll - Optional damage roll if attack hit
   * @returns {string} HTML flavor text
   */
  buildAttackFlavor(attackResult, damageRoll = null) {
    const { difficulty, isHit, isCritical, weaponSkill, weaponSkillKey, favorHinder } = attackResult;

    let flavorText = `<strong>${this.name}</strong> Attack`;

    // Add favor/hinder indicator if applicable
    if (favorHinder === 'favor') {
      flavorText += ` [Favor +1d6]`;
    } else if (favorHinder === 'hinder') {
      flavorText += ` [Hinder -1d6]`;
    }
    flavorText += '<br/>';

    flavorText += `<strong>Weapon Skill:</strong> ${weaponSkill?.label || weaponSkillKey} (Difficulty ${difficulty})<br/>`;
    flavorText += `<strong>Attack Roll:</strong> ${attackResult.roll.total}`;

    if (isHit) {
      flavorText += ` - <span style="color: green;">SUCCESS!</span><br/>`;

      if (damageRoll) {
        flavorText += `<strong>Damage:</strong> ${damageRoll.total}`;

        if (isCritical) {
          flavorText += ` <span style="color: gold;">(CRITICAL!)</span>`;
        }
      }
    } else {
      flavorText += ` - <span style="color: red;">MISS!</span>`;
    }

    // Add weapon properties to flavor if any
    if (this.system.properties && this.system.properties.length > 0) {
      flavorText += `<br/><strong>Properties:</strong> ${this.system.propertiesDisplay}`;
    }

    return flavorText;
  }
}
