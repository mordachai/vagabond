/**
 * Vagabond Combat Tracker enhancements
 * Uses wrapper pattern to modify the base CombatTracker rather than subclassing
 */
import { VagabondRollBuilder } from '../helpers/roll-builder.mjs';
import { VagabondChatCard } from '../helpers/chat-card.mjs';
import { CombatTrackerHelper } from '../helpers/combat-tracker-helper.mjs';

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

    // If turns haven't been prepared, we can't do faction grouping
    if (!context.turns || !Array.isArray(context.turns)) {
      context.factions = CombatTrackerHelper.bucketByFaction(CombatTrackerHelper.getFactionOrder(this.viewed), []);
      return;
    }

    // Faction bucketing + per-turn resource/effect/activation data, shared with
    // the Combat Carousel overlay (module/helpers/combat-tracker-helper.mjs).
    // Core already excludes turns the current user can't see (Combatant#visible)
    // before this runs, so hidden NPCs never reach either UI for non-owners.
    context.factions = CombatTrackerHelper.buildFactionTurns(this.viewed, { baseTurns: context.turns });
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
        visible: game.user.isGM,
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
        visible: game.user.isGM,
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
        visible: game.user.isGM,
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
