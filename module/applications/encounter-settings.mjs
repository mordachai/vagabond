/**
 * Encounter Settings Dialog
 * Uses FormApplication (v1) for compatibility with game.settings.registerMenu
 */
export class EncounterSettings extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'encounter-settings',
      title: game.i18n.localize('VAGABOND.EncounterSettings.Title'),
      template: 'systems/vagabond/templates/apps/encounter-settings.hbs',
      width: 500,
      height: 'auto',
      closeOnSubmit: true,
      submitOnChange: false,
    });
  }

  /**
   * Get data for rendering
   */
  getData() {
    return {
      hideInitiativeRoll: game.settings.get('vagabond', 'hideInitiativeRoll'),
      useActivationPoints: game.settings.get('vagabond', 'useActivationPoints'),
      initiativeFormula: game.settings.get('vagabond', 'initiativeFormula'),
      npcInitiativeFormula: game.settings.get('vagabond', 'npcInitiativeFormula'),
    };
  }

  /**
   * Handle form submission
   */
  async _updateObject(event, formData) {
    // Convert checkbox values to proper booleans
    const hideInitiativeRoll = !!formData.hideInitiativeRoll;
    const useActivationPoints = !!formData.useActivationPoints;
    const initiativeFormula = formData.initiativeFormula?.trim() || '1d20 + @dexterity.value + @awareness.value';
    const npcInitiativeFormula = formData.npcInitiativeFormula?.trim() || '1d20 + ceil(@speed / 10)';

    // Update settings
    await game.settings.set('vagabond', 'hideInitiativeRoll', hideInitiativeRoll);
    await game.settings.set('vagabond', 'useActivationPoints', useActivationPoints);
    await game.settings.set('vagabond', 'initiativeFormula', initiativeFormula);
    await game.settings.set('vagabond', 'npcInitiativeFormula', npcInitiativeFormula);

    ui.notifications.info(game.i18n.localize('VAGABOND.EncounterSettings.SaveSuccess'));

    // Re-render combat tracker if it exists
    if (ui.combat) {
      ui.combat.render();
    }
  }
}
