/**
 * Vagabond Combat Tracker enhancements
 * Uses wrapper pattern to modify the base CombatTracker rather than subclassing
 */
export class VagabondCombatTracker {

  /**
   * Wrapped _prepareTrackerContext method
   * @param {Function} wrapped - Original _prepareTrackerContext method
   * @param {Object} context - Context object being prepared
   * @param {Object} options - Render options
   * @returns {Promise<Object>} Modified context object with faction data
   */
  static async prepareTrackerContext(wrapped, context, options) {
    // Call original method to populate base context
    await wrapped.call(this, context, options);

    // Add encounter settings to context
    context.hideInitiativeRoll = game.settings.get('vagabond', 'hideInitiativeRoll');
    context.useActivationPoints = game.settings.get('vagabond', 'useActivationPoints');

    // Initialize Factions structure
    context.factions = {
      friendly: { label: "VAGABOND.Combat.Factions.Friendly", turns: [], css: "friendly" },
      neutral: { label: "VAGABOND.Combat.Factions.Neutral", turns: [], css: "neutral" },
      hostile: { label: "VAGABOND.Combat.Factions.Hostile", turns: [], css: "hostile" },
      secret: { label: "VAGABOND.Combat.Factions.Secret", turns: [], css: "secret" }
    };

    // If turns haven't been prepared, we can't do faction grouping
    if (!context.turns || !Array.isArray(context.turns)) {
      return;
    }

    // Process each turn and assign to factions
    for (let turn of context.turns) {
      const combatant = this.viewed.combatants.get(turn.id);
      if (!combatant) continue;

      const actor = combatant.actor;
      if (actor) {
        turn.hp = {
          value: actor.system.health?.value || 0,
          max: actor.system.health?.max || 0
        };
        turn.fatigue = actor.system.fatigue || 0;
        if (actor.system.mana) {
          turn.mana = { current: actor.system.mana.current || 0 };
        }

        // Gather temporary active effects only
        turn.effects = actor.effects
          .filter(e => !e.disabled && !e.isSuppressed && e.isTemporary)
          .map(e => ({
            id: e.id,
            name: e.name,
            icon: e.icon || 'icons/svg/aura.svg'
          }));
      }

      // Populate activation data
      const activations = combatant.getFlag('vagabond', 'activations') || { value: 0, max: 1 };
      turn.activations = activations;
      turn.isSpent = activations.value <= 0;

      // Assign faction class based on disposition
      const disposition = combatant.token?.disposition;
      let factionKey = 'neutral';
      if (disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) factionKey = 'friendly';
      else if (disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) factionKey = 'hostile';
      else if (disposition === CONST.TOKEN_DISPOSITIONS.SECRET) factionKey = 'secret';

      turn.factionClass = factionKey;
      context.factions[factionKey].turns.push(turn);
    }

    // No need to return anything - we modified context in place
  }

  /**
   * Action handler for activate button
   */
  static async onActivate(event, target) {
    const combatantId = target.closest(".combatant").dataset.combatantId;
    if (!this.viewed) return;
    return this.viewed.activateCombatant(combatantId);
  }

  /**
   * Action handler for deactivate button
   */
  static async onDeactivate(event, target) {
    const combatantId = target.closest(".combatant").dataset.combatantId;
    if (!this.viewed) return;
    return this.viewed.deactivateCombatant(combatantId);
  }

  /**
   * Wrapped _getEntryContextOptions method
   * @param {Function} wrapped - Original _getEntryContextOptions method
   * @returns {Array} Context menu options
   */
  static getEntryContextOptions(wrapped) {
    const options = wrapped.call(this);
    options.push(
      {
        name: "VAGABOND.Combat.Context.AddActivation",
        icon: '<i class="fas fa-plus"></i>',
        condition: game.user.isGM,
        callback: li => {
          const element = li instanceof jQuery ? li[0] : li;
          const combatantId = element.dataset.combatantId;
          if (!this.viewed || !combatantId) return;
          return this.viewed.addMaxActivation(combatantId, 1);
        }
      },
      {
        name: "VAGABOND.Combat.Context.RemoveActivation",
        icon: '<i class="fas fa-minus"></i>',
        condition: game.user.isGM,
        callback: li => {
          const element = li instanceof jQuery ? li[0] : li;
          const combatantId = element.dataset.combatantId;
          if (!this.viewed || !combatantId) return;
          return this.viewed.addMaxActivation(combatantId, -1);
        }
      },
      {
        name: "VAGABOND.Combat.Context.UndoUse",
        icon: '<i class="fas fa-undo"></i>',
        condition: game.user.isGM,
        callback: li => {
          const element = li instanceof jQuery ? li[0] : li;
          const combatantId = element.dataset.combatantId;
          if (!this.viewed || !combatantId) return;
          return this.viewed.addCurrentActivation(combatantId, 1);
        }
      }
    );
    return options;
  }
}
