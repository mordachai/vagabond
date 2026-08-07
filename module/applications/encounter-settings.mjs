const { api } = foundry.applications;

/**
 * Encounter Settings Dialog (ApplicationV2)
 */
export class EncounterSettings extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'encounter-settings',
    tag: 'form',
    classes: ['encounter-settings-form'],
    window: {
      title: 'VAGABOND.EncounterSettings.Title',
      icon: 'fas fa-swords',
      resizable: true
    },
    position: {
      width: 500,
      height: 600
    },
    actions: {
      close: function() { this.close(); }
    },
    form: {
      handler: EncounterSettings.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    }
  };

  static PARTS = {
    form: {
      template: 'systems/vagabond/templates/apps/encounter-settings.hbs',
      scrollable: ['.scrollable']
    }
  };

  /** @override */
  async _prepareContext(_options) {
    return {
      hideInitiativeRoll: game.settings.get('vagabond', 'hideInitiativeRoll'),
      useActivationPoints: game.settings.get('vagabond', 'useActivationPoints'),
      defaultActivationPoints: game.settings.get('vagabond', 'defaultActivationPoints'),
      initiativeFormula: game.settings.get('vagabond', 'initiativeFormula'),
      npcInitiativeFormula: game.settings.get('vagabond', 'npcInitiativeFormula'),
      factionFriendly: game.settings.get('vagabond', 'factionFriendly'),
      factionFriendlyColor: game.settings.get('vagabond', 'factionFriendlyColor'),
      factionNeutral: game.settings.get('vagabond', 'factionNeutral'),
      factionNeutralColor: game.settings.get('vagabond', 'factionNeutralColor'),
      factionHostile: game.settings.get('vagabond', 'factionHostile'),
      factionHostileColor: game.settings.get('vagabond', 'factionHostileColor'),
      factionSecret: game.settings.get('vagabond', 'factionSecret'),
      factionSecretColor: game.settings.get('vagabond', 'factionSecretColor'),
      combatCarouselEnabled: game.settings.get('vagabond', 'combatCarouselEnabled'),
      combatCarouselPortraitSize: game.settings.get('vagabond', 'combatCarouselPortraitSize'),
      combatCarouselRevealOtherFactionStats: game.settings.get('vagabond', 'combatCarouselRevealOtherFactionStats'),
      combatCarouselCardSelectBehavior: game.settings.get('vagabond', 'combatCarouselCardSelectBehavior'),
      combatCarouselTargetOnAltClick: game.settings.get('vagabond', 'combatCarouselTargetOnAltClick'),
      combatCarouselAutoHideDefault: game.settings.get('vagabond', 'combatCarouselAutoHideDefault'),
      combatCarouselDimIdleDefault: game.settings.get('vagabond', 'combatCarouselDimIdleDefault'),
    };
  }

  /**
   * Handle form submission
   */
  static async #onSubmit(event, form, formData) {
    event.preventDefault();
    const data = formData.object;

    // Update settings
    await game.settings.set('vagabond', 'hideInitiativeRoll', !!data.hideInitiativeRoll);
    await game.settings.set('vagabond', 'useActivationPoints', !!data.useActivationPoints);
    await game.settings.set('vagabond', 'defaultActivationPoints', parseInt(data.defaultActivationPoints) || 2);
    await game.settings.set('vagabond', 'initiativeFormula', data.initiativeFormula?.trim() || '3d6 + @dexterity.value + @awareness.value');
    await game.settings.set('vagabond', 'npcInitiativeFormula', data.npcInitiativeFormula?.trim() || '3d6 + ceil(@speed / 10)');
    
    // Faction Names
    await game.settings.set('vagabond', 'factionFriendly', data.factionFriendly?.trim() || 'Heroes');
    await game.settings.set('vagabond', 'factionNeutral', data.factionNeutral?.trim() || 'Neutrals');
    await game.settings.set('vagabond', 'factionHostile', data.factionHostile?.trim() || 'NPCs');
    await game.settings.set('vagabond', 'factionSecret', data.factionSecret?.trim() || 'Secret');

    // Faction Colors
    await game.settings.set('vagabond', 'factionFriendlyColor', data.factionFriendlyColor || '#7fbf7f');
    await game.settings.set('vagabond', 'factionNeutralColor', data.factionNeutralColor || '#dfdf7f');
    await game.settings.set('vagabond', 'factionHostileColor', data.factionHostileColor || '#df7f7f');
    await game.settings.set('vagabond', 'factionSecretColor', data.factionSecretColor || '#bf7fdf');

    // Combat Carousel
    await game.settings.set('vagabond', 'combatCarouselEnabled', !!data.combatCarouselEnabled);
    const validSizes = ['small', 'medium', 'large'];
    await game.settings.set('vagabond', 'combatCarouselPortraitSize',
      validSizes.includes(data.combatCarouselPortraitSize) ? data.combatCarouselPortraitSize : 'medium');
    await game.settings.set('vagabond', 'combatCarouselRevealOtherFactionStats', !!data.combatCarouselRevealOtherFactionStats);
    const validSelectBehaviors = ['none', 'pan', 'select', 'selectPan', 'ping'];
    await game.settings.set('vagabond', 'combatCarouselCardSelectBehavior',
      validSelectBehaviors.includes(data.combatCarouselCardSelectBehavior) ? data.combatCarouselCardSelectBehavior : 'none');
    await game.settings.set('vagabond', 'combatCarouselTargetOnAltClick', !!data.combatCarouselTargetOnAltClick);
    await game.settings.set('vagabond', 'combatCarouselAutoHideDefault', !!data.combatCarouselAutoHideDefault);
    await game.settings.set('vagabond', 'combatCarouselDimIdleDefault', !!data.combatCarouselDimIdleDefault);

    // Update existing combatants in active combats with new activation point settings
    if (game.combats && game.combats.size > 0) {
      const newMax = !!data.useActivationPoints ? (parseInt(data.defaultActivationPoints) || 2) : 1;

      for (const combat of game.combats) {
        const updates = combat.combatants.map(c => ({
          _id: c.id,
          'flags.vagabond.activations': {
            max: newMax,
            value: newMax
          }
        }));

        if (updates.length > 0) {
          await combat.updateEmbeddedDocuments('Combatant', updates);
        }
      }
    }

    ui.notifications.info(game.i18n.localize('VAGABOND.EncounterSettings.SaveSuccess'));

    // Re-render combat tracker if it exists
    if (ui.combat) {
      ui.combat.render();
    }

    // Re-render the carousel overlay if it's open (picks up faction/size changes live)
    globalThis.vagabond.applications.CombatCarousel.refresh();
  }
}