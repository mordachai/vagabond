import { AccordionHelper } from '../../helpers/accordion-helper.mjs';

/**
 * Handler for NPC actions and abilities management.
 * Manages adding/removing actions, abilities, and their accordion states.
 */
export class NPCActionHandler {
  /**
   * @param {VagabondActorSheet} sheet - The parent actor sheet
   */
  constructor(sheet) {
    this.sheet = sheet;
    this.actor = sheet.actor;
    this._openActionAccordions = [];
    this._openAbilityAccordions = [];
  }

  /**
   * Add a new action
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async addAction(event, target) {
    event.preventDefault();

    const actions = foundry.utils.deepClone(this.actor.system.actions || []);
    actions.push({
      name: '',
      note: '',
      recharge: '',
      flatDamage: '',
      rollDamage: '',
      damageType: this.validateDamageType('-'), // Ensure valid default
      attackType: 'melee',
      extraInfo: '',
    });

    await this.actor.update({ 'system.actions': actions });
  }

  /**
   * Remove an action
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async removeAction(event, target) {
    event.preventDefault();

    const index = parseInt(target.dataset.actionIndex);
    const actions = foundry.utils.deepClone(this.actor.system.actions || []);

    actions.splice(index, 1);

    await this.actor.update({ 'system.actions': actions });
  }

  /**
   * Toggle action accordion
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async toggleActionAccordion(event, target) {
    event.preventDefault();
    
    // Find the accordion container using the target element (Foundry V2 pattern)
    const accordionContainer = target.closest('.npc-action-edit');
    
    if (!accordionContainer) {
      console.error('NPCActionHandler: Could not find accordion container for action accordion');
      return;
    }

    AccordionHelper.toggle(accordionContainer);
  }

  /**
   * Add a new ability
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async addAbility(event, target) {
    event.preventDefault();

    const abilities = foundry.utils.deepClone(this.actor.system.abilities || []);
    abilities.push({
      name: '',
      description: '',
    });

    await this.actor.update({ 'system.abilities': abilities });
  }

  /**
   * Remove an ability
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async removeAbility(event, target) {
    event.preventDefault();

    const index = parseInt(target.dataset.abilityIndex);
    const abilities = foundry.utils.deepClone(this.actor.system.abilities || []);

    abilities.splice(index, 1);

    await this.actor.update({ 'system.abilities': abilities });
  }

  /**
   * Toggle ability accordion
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async toggleAbilityAccordion(event, target) {
    event.preventDefault();
    
    // Find the accordion container using the target element (Foundry V2 pattern)
    const accordionContainer = target.closest('.npc-ability-edit');
    
    if (!accordionContainer) {
      console.error('NPCActionHandler: Could not find accordion container for ability accordion');
      return;
    }

    AccordionHelper.toggle(accordionContainer);
  }

  /**
   * Add a blank causedStatuses entry to an NPC action
   * @param {Event} event
   * @param {HTMLElement} target
   */
  async addNpcActionStatus(event, target) {
    event.preventDefault();
    const actionIndex = parseInt(target.dataset.actionIndex);
    const actions = foundry.utils.deepClone(this.actor.system.actions || []);
    if (!actions[actionIndex]) return;
    if (!Array.isArray(actions[actionIndex].causedStatuses)) {
      actions[actionIndex].causedStatuses = [];
    }
    actions[actionIndex].causedStatuses.push({
      statusId: '',
      requiresDamage: true,
      saveType: 'any',
      duration: '',
      tickDamageEnabled: false,
      damageOnTick: '',
      damageType: '-',
      // TODO: fatigueOnTick: 0, — restore when re-enabling the fatigueOnTick feature
    });
    await this.actor.update({ 'system.actions': actions });
  }

  /**
   * Remove a causedStatuses entry from an NPC action
   * @param {Event} event
   * @param {HTMLElement} target
   */
  async removeNpcActionStatus(event, target) {
    event.preventDefault();
    const actionIndex = parseInt(target.closest('.npc-caused-statuses')?.dataset.actionIndex);
    const statusIndex = parseInt(target.dataset.statusIndex);
    if (isNaN(actionIndex) || isNaN(statusIndex)) return;
    this.sheet._isDirty = false;
    const actions = foundry.utils.deepClone(this.actor.system.actions || []);
    if (!actions[actionIndex]?.causedStatuses) return;
    actions[actionIndex].causedStatuses.splice(statusIndex, 1);
    await this.actor.update({ 'system.actions': actions });
  }

  /**
   * Add a blank critCausedStatuses entry to an NPC action
   * @param {Event} event
   * @param {HTMLElement} target
   */
  async addNpcActionCritStatus(event, target) {
    event.preventDefault();
    const actionIndex = parseInt(target.dataset.actionIndex);
    const actions = foundry.utils.deepClone(this.actor.system.actions || []);
    if (!actions[actionIndex]) return;
    if (!Array.isArray(actions[actionIndex].critCausedStatuses)) {
      actions[actionIndex].critCausedStatuses = [];
    }
    actions[actionIndex].critCausedStatuses.push({
      statusId: '',
      requiresDamage: true,
      saveType: 'any',
      duration: '',
      tickDamageEnabled: false,
      damageOnTick: '',
      damageType: '-',
      // TODO: fatigueOnTick: 0, — restore when re-enabling the fatigueOnTick feature
    });
    await this.actor.update({ 'system.actions': actions });
  }

  /**
   * Remove a critCausedStatuses entry from an NPC action
   * @param {Event} event
   * @param {HTMLElement} target
   */
  async removeNpcActionCritStatus(event, target) {
    event.preventDefault();
    const actionIndex = parseInt(target.closest('.npc-caused-statuses')?.dataset.actionIndex);
    const statusIndex = parseInt(target.dataset.statusIndex);
    if (isNaN(actionIndex) || isNaN(statusIndex)) return;
    this.sheet._isDirty = false;
    const actions = foundry.utils.deepClone(this.actor.system.actions || []);
    if (!actions[actionIndex]?.critCausedStatuses) return;
    actions[actionIndex].critCausedStatuses.splice(statusIndex, 1);
    await this.actor.update({ 'system.actions': actions });
  }

  /**
   * Create countdown dice from recharge action
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async createCountdownFromRecharge(event, target) {
    event.preventDefault();

    // The clicked element may be a countdown-dice-trigger span with data-dice-size,
    // or it may be inside an action row with data-action-index
    const trigger = target.closest('.countdown-dice-trigger') || target;
    const diceSize = trigger.dataset.diceSize;

    // If the trigger has a dice size directly (from text parser), use it
    if (diceSize) {
      const { CountdownDice } = globalThis.vagabond.documents;
      const diceType = `d${diceSize}`;

      // Try to get a name from the parent action/ability context
      const actionRow = trigger.closest('[data-action-index]');
      const abilityRow = trigger.closest('[data-ability-index]');
      let name = 'Countdown';

      if (actionRow) {
        const idx = parseInt(actionRow.dataset.actionIndex);
        const action = (this.actor.system.actions || [])[idx];
        if (action?.name) name = action.name;
      } else if (abilityRow) {
        const idx = parseInt(abilityRow.dataset.abilityIndex);
        const ability = (this.actor.system.abilities || [])[idx];
        if (ability?.name) name = ability.name;
      }

      await CountdownDice.create({
        name: name,
        diceType: diceType,
      });
      ui.notifications.info(`Created ${diceType} countdown dice for ${name}`);
      return;
    }

    // Fallback: action-based lookup (legacy path)
    const actionIndex = parseInt(target.dataset.actionIndex);
    const actions = this.actor.system.actions || [];
    const action = actions[actionIndex];

    if (!action || !action.recharge) {
      ui.notifications.warn('No recharge value set for this action!');
      return;
    }

    const { CountdownDice } = globalThis.vagabond.documents;

    await CountdownDice.create({
      name: action.name,
      actorId: this.actor.id,
      diceType: action.recharge,
      actionIndex: actionIndex,
    });

    ui.notifications.info(`Created countdown dice for ${action.name}`);
  }

  /**
   * Apply weapon data to an NPC action when a weapon is selected from the dropdown.
   * Sets the action name, rollDamage, flatDamage, and damageType from the weapon item.
   * @param {number} actionIndex - Index of the action to update
   * @param {string} weaponUuid - UUID of the selected weapon, or '' to deselect
   */
  async applyWeaponToAction(actionIndex, weaponUuid) {
    const actions = foundry.utils.deepClone(this.actor.system.actions || []);
    const action = actions[actionIndex];
    if (!action) return;

    if (!weaponUuid) {
      // Weapon deselected — restore pre-weapon values and clear stored data
      const baseName = (action.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      action.name          = action.weaponPrevName ?? baseName;
      action.flatDamage    = action.weaponPrevFlatDamage ?? action.flatDamage;
      action.rollDamage    = action.weaponPrevRollDamage ?? action.rollDamage;
      action.weaponId              = '';
      action.weaponPrevName        = '';
      action.weaponPrevFlatDamage  = '';
      action.weaponPrevRollDamage  = '';
      await this.actor.update({ 'system.actions': actions });
      return;
    }

    // Load full weapon document from UUID
    let weapon;
    try {
      weapon = await fromUuid(weaponUuid);
    } catch (e) {
      console.error('NPCActionHandler: Failed to load weapon from UUID:', weaponUuid, e);
      return;
    }
    if (!weapon) {
      console.warn('NPCActionHandler: Weapon not found for UUID:', weaponUuid);
      return;
    }

    // Choose damage fields based on grip ('2H' uses two-hand values; everything else uses one-hand)
    const grip = weapon.system.grip || '1H';
    let damageFormula, damageType;
    if (grip === '2H') {
      damageFormula = weapon.system.damageTwoHands || weapon.system.damageOneHand || '';
      damageType    = weapon.system.damageTypeTwoHands || weapon.system.damageTypeOneHand || '-';
    } else {
      damageFormula = weapon.system.damageOneHand || '';
      damageType    = weapon.system.damageTypeOneHand || '-';
    }
    // Fallback to generic damageAmount
    if (!damageFormula) damageFormula = weapon.system.damageAmount || '';
    if (!damageType || damageType === '-') damageType = weapon.system.damageType || '-';

    // Strip any previously appended weapon "(…)" to get the base name
    const baseName = (action.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

    // Only save pre-weapon values if no weapon was previously set (first application)
    if (!action.weaponId) {
      action.weaponPrevName        = baseName;
      action.weaponPrevFlatDamage  = action.flatDamage;
      action.weaponPrevRollDamage  = action.rollDamage;
    }

    action.name        = baseName ? `${baseName} (${weapon.name})` : weapon.name;
    action.weaponId    = weaponUuid;
    action.rollDamage  = damageFormula;
    action.damageType  = this.validateDamageType(damageType);
    action.flatDamage  = NPCActionHandler._computeHalfMax(damageFormula);

    await this.actor.update({ 'system.actions': actions });
  }

  /**
   * Compute half of the maximum possible result for a dice formula string.
   * e.g. "2d6" → max 12 → "6"; "d8+2" → max 10 → "5"; "2d6+1d4" → max 16 → "8"
   * @param {string} formula
   * @returns {string} Floor of (max / 2), or '' for empty input
   */
  static _computeHalfMax(formula) {
    if (!formula) return '';
    let maxTotal = 0;
    // Replace every dice group (e.g. "2d6", "d8") with 0, accumulating the max value
    const cleaned = formula.replace(/(\d*)d(\d+)/gi, (match, count, sides) => {
      const n = parseInt(count || '1') || 1;
      const s = parseInt(sides);
      maxTotal += n * s;
      return '0';
    });
    // Evaluate any remaining flat modifiers (e.g. "+2", "-1")
    if (cleaned.replace(/\s/g, '') !== '0' && cleaned.replace(/\s/g, '') !== '') {
      try {
        const flat = Roll.safeEval(cleaned);
        if (Number.isFinite(flat)) maxTotal += flat;
      } catch (e) { /* ignore unparseable modifier */ }
    }
    return String(Math.floor(maxTotal / 2));
  }

  /**
   * Update accordion state for persistence and accessibility
   * @param {HTMLElement} header - The accordion header element
   * @param {HTMLElement} content - The accordion content element
   * @private
   */
  _updateAccordionState(header, content) {
    // Track accordion state for persistence
    const isExpanded = content.classList.contains('open');
    header.setAttribute('aria-expanded', isExpanded.toString());
  }

  /**
   * Capture accordion state before re-render
   */
  captureAccordionState() {
    this._openActionAccordions = AccordionHelper.getOpenIds(
      this.sheet.element,
      '.npc-action-edit'
    );
    this._openAbilityAccordions = AccordionHelper.getOpenIds(
      this.sheet.element,
      '.npc-ability-edit'
    );
  }

  /**
   * Restore accordion state after re-render
   */
  restoreAccordionState() {
    AccordionHelper.restoreState(this.sheet.element, this._openActionAccordions, '.npc-action-edit');
    AccordionHelper.restoreState(
      this.sheet.element,
      this._openAbilityAccordions,
      '.npc-ability-edit'
    );
  }

  /**
   * Validate and sanitize damage type values
   * @param {string} damageType - The damage type value to validate
   * @returns {string} - The validated damage type or "-" as fallback
   */
  validateDamageType(damageType) {
    // Get valid damage types from CONFIG
    const validTypes = Object.keys(CONFIG.VAGABOND.damageTypes);
    
    // If no damage type provided or empty, default to "-"
    if (!damageType || damageType === '') {
      return '-';
    }
    
    // If damage type is valid, return it
    if (validTypes.includes(damageType)) {
      return damageType;
    }
    
    // If invalid damage type, log warning and return default
    console.warn(`NPCActionHandler: Invalid damage type "${damageType}" provided, defaulting to "-". Valid types are: ${validTypes.join(', ')}`);
    return '-';
  }

  /**
   * Setup event listeners for buffered action and ability editing
   * NOTE: Input change handling is now managed by the main NPC sheet
   * to prevent accordion closing issues. This method is kept for compatibility.
   */
  setupListeners() {
    // Action and ability input handling is now managed by the main NPC sheet
    // via debounced input listeners to prevent accordion closing on every keystroke.
    // This method is kept for any future non-input event handling.
  }
}
