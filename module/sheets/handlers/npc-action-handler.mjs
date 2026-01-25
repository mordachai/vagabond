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

    const actions = this.actor.system.actions || [];
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
    const actions = this.actor.system.actions || [];

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

    const abilities = this.actor.system.abilities || [];
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
    const abilities = this.actor.system.abilities || [];

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
   * Create countdown dice from recharge action
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async createCountdownFromRecharge(event, target) {
    event.preventDefault();

    const actionIndex = parseInt(target.dataset.actionIndex);
    const actions = this.actor.system.actions || [];
    const action = actions[actionIndex];

    if (!action || !action.recharge) {
      ui.notifications.warn('No recharge value set for this action!');
      return;
    }

    // Import countdown dice
    const { CountdownDice } = globalThis.vagabond.documents;

    // Create countdown dice journal entry
    await CountdownDice.create({
      name: action.name,
      actorId: this.actor.id,
      dieSize: action.recharge,
      actionIndex: actionIndex,
    });

    ui.notifications.info(`Created countdown dice for ${action.name}`);
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
