/**
 * Vagabond Combat Tracker enhancements
 * Uses wrapper pattern to modify the base CombatTracker rather than subclassing
 */
import { VagabondRollBuilder } from '../helpers/roll-builder.mjs';
import { VagabondChatCard } from '../helpers/chat-card.mjs';

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
      friendly: { 
        label: game.settings.get('vagabond', 'factionFriendly') || "VAGABOND.Combat.Factions.Friendly", 
        color: game.settings.get('vagabond', 'factionFriendlyColor') || "#7fbf7f",
        turns: [], 
        css: "friendly" 
      },
      neutral: { 
        label: game.settings.get('vagabond', 'factionNeutral') || "VAGABOND.Combat.Factions.Neutral", 
        color: game.settings.get('vagabond', 'factionNeutralColor') || "#dfdf7f",
        turns: [], 
        css: "neutral" 
      },
      hostile: { 
        label: game.settings.get('vagabond', 'factionHostile') || "VAGABOND.Combat.Factions.Hostile", 
        color: game.settings.get('vagabond', 'factionHostileColor') || "#df7f7f",
        turns: [], 
        css: "hostile" 
      },
      secret: { 
        label: game.settings.get('vagabond', 'factionSecret') || "VAGABOND.Combat.Factions.Secret", 
        color: game.settings.get('vagabond', 'factionSecretColor') || "#bf7fdf",
        turns: [], 
        css: "secret" 
      }
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
        // Calculate HP percentage for health bar
        turn.hpPercent = turn.hp.max > 0 ? Math.round((turn.hp.value / turn.hp.max) * 100) : 0;
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
            icon: e.img || 'icons/svg/aura.svg' // Use 'img' instead of deprecated 'icon'
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
      const faction = context.factions[factionKey];
      turn.factionColor = faction.color;
      faction.turns.push(turn);
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
   * Action handler for detect roll button
   */
  static async onRollDetect(event, target) {
    const combatantId = target.closest(".combatant").dataset.combatantId;
    if (!this.viewed) return;
    
    const combatant = this.viewed.combatants.get(combatantId);
    if (!combatant || !combatant.actor) return;
    
    const actor = combatant.actor;
    const rollKey = 'detect';
    
    // Check if actor has the skill
    if (!actor.system.skills || !actor.system.skills.detect) {
        ui.notifications.warn("Actor does not have the Detect skill.");
        return;
    }

    // Determine favor/hinder
    const systemFavorHinder = actor.system.favorHinder || 'none';
    const favorHinder = VagabondRollBuilder.calculateEffectiveFavorHinder(
      systemFavorHinder,
      event.shiftKey,
      event.ctrlKey
    );

    const roll = await VagabondRollBuilder.buildAndEvaluateD20(
        actor,
        favorHinder,
        '1d20'
    );
    
    const skillData = actor.system.skills.detect;
    const difficulty = skillData.difficulty || 10;
    const isSuccess = roll.total >= difficulty;
    
    await VagabondChatCard.skillRoll(actor, rollKey, roll, difficulty, isSuccess);
  }

  /**
   * Wrapped _getEntryContextOptions method
   * @param {Function} wrapped - Original _getEntryContextOptions method
   * @returns {Array} Context menu options
   */
  static getEntryContextOptions(wrapped) {
    const options = wrapped.call(this);
    
    // Filter out standard "Reroll Initiative" if rolls are hidden
    if (game.settings.get('vagabond', 'hideInitiativeRoll')) {
      const rerollIndex = options.findIndex(o => o.name === "COMBAT.Reroll");
      if (rerollIndex > -1) {
        options.splice(rerollIndex, 1);
      }
    }

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

  /**
   * Wrapped activateListeners method
   * @param {Function} wrapped - Original activateListeners method
   * @param {jQuery} html - The rendered HTML
   */
  static activateListeners(wrapped, html) {
    wrapped.call(this, html);

    // Manual Initiative Input Handler
    html.on('change', '.initiative-input', async (event) => {
      event.preventDefault();
      const input = event.currentTarget;
      const combatantId = input.dataset.combatantId;
      const value = Number(input.value);

      if (this.viewed && combatantId && !isNaN(value)) {
        await this.viewed.updateEmbeddedDocuments("Combatant", [{
          _id: combatantId,
          initiative: value
        }]);
      }
    });
  }
}
