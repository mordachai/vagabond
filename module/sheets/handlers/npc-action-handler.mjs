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
      name: 'New Action',
      description: '',
      damageRoll: '',
      recharge: '',
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

    // Import accordion helper
    const { AccordionHelper } = globalThis.vagabond.utils;

    const actionEdit = target.closest('.npc-action-edit');
    if (actionEdit) {
      AccordionHelper.toggle(actionEdit);
    }
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
      name: 'New Ability',
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

    // Import accordion helper
    const { AccordionHelper } = globalThis.vagabond.utils;

    const abilityEdit = target.closest('.npc-ability-edit');
    if (abilityEdit) {
      AccordionHelper.toggle(abilityEdit);
    }
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
   * Capture accordion state before re-render
   */
  captureAccordionState() {
    // Import accordion helper
    const { AccordionHelper } = globalThis.vagabond.utils;

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
    // Import accordion helper
    const { AccordionHelper } = globalThis.vagabond.utils;

    AccordionHelper.restoreState(this.sheet.element, this._openActionAccordions, '.npc-action-edit');
    AccordionHelper.restoreState(
      this.sheet.element,
      this._openAbilityAccordions,
      '.npc-ability-edit'
    );
  }
}
