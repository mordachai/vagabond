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
   * Wrapped _onRender method. `CombatTracker` (foundry.applications.sidebar.tabs.CombatTracker)
   * is pure ApplicationV2 in v14 — it has no `activateListeners(html)` hook
   * (that's a v1 Application concept), so post-render wiring must happen here.
   * Core's own `_attachFrameListeners` (bound once, delegated on the persistent
   * `this.element`) already handles `.initiative-input` changes and the
   * `data-action` buttons registered in `DEFAULT_OPTIONS.actions` — only the
   * drag-reorder wiring below is Vagabond-specific.
   * @param {Object} options - Render options
   */
  static onRender(options) {
    VagabondCombatTracker.attachDragHandlers(this);
  }

  /**
   * Drag-to-reorder: combatant rows within their faction group, and
   * faction-header rows to reorder the groups themselves. Mirrors the Combat
   * Carousel's card/pennant drag interaction (module/applications/combat-carousel.mjs)
   * but for a vertical list — insert-before/after is decided by the cursor's
   * Y position instead of X. Both write through the shared
   * {@link CombatTrackerHelper.reorderWithinFaction}/{@link CombatTrackerHelper.reorderFactionGroups}.
   *
   * Delegated on the `#combat-tracker` list root (all HTML5 DnD events bubble)
   * rather than per-row, so it needs no cleanup — `app.element` is the
   * persistent outer frame, but the "tracker" part (this whole list, per the
   * single-root-element rule) is a fresh subtree every render, so `list` is
   * never stale.
   * @param {CombatTracker} app
   */
  static attachDragHandlers(app) {
    const list = app.element.querySelector('#combat-tracker');
    if (!list) return;

    let dragId = null;
    let dragFaction = null;

    const clearRowMarkers = () => {
      list.querySelectorAll('.combatant.insert-before, .combatant.insert-after')
        .forEach(el => el.classList.remove('insert-before', 'insert-after'));
    };
    const clearHeaderMarkers = () => {
      list.querySelectorAll('.faction-header.is-drop-target')
        .forEach(el => el.classList.remove('is-drop-target'));
    };

    for (const row of list.querySelectorAll('.combatant')) {
      row.draggable = game.user.isGM || row.dataset.faction === 'friendly';
    }
    for (const header of list.querySelectorAll('.faction-header')) {
      header.draggable = game.user.isGM;
    }

    const sideFor = (event, el) => {
      const rect = el.getBoundingClientRect();
      return (event.clientY - rect.top) > rect.height / 2 ? 'after' : 'before';
    };

    list.addEventListener('dragstart', (event) => {
      const row = event.target.closest('.combatant');
      const header = event.target.closest('.faction-header');
      if (row?.draggable) {
        dragId = row.dataset.combatantId;
        row.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', dragId);
      } else if (header?.draggable) {
        dragFaction = header.dataset.faction;
        header.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', dragFaction);
      }
    });

    list.addEventListener('dragend', () => {
      dragId = null;
      dragFaction = null;
      list.querySelectorAll('.combatant.is-dragging, .faction-header.is-dragging')
        .forEach(el => el.classList.remove('is-dragging'));
      clearRowMarkers();
      clearHeaderMarkers();
    });

    list.addEventListener('dragenter', (event) => {
      const row = event.target.closest('.combatant');
      const header = event.target.closest('.faction-header');
      if (dragId && row && row.dataset.combatantId !== dragId) {
        const dragRow = list.querySelector(`.combatant[data-combatant-id="${dragId}"]`);
        if (dragRow?.dataset.faction !== row.dataset.faction) return;
        event.preventDefault();
        clearRowMarkers();
        row.classList.add(sideFor(event, row) === 'after' ? 'insert-after' : 'insert-before');
      } else if (dragFaction && header && header.dataset.faction !== dragFaction) {
        event.preventDefault();
        clearHeaderMarkers();
        header.classList.add('is-drop-target');
      }
    });

    list.addEventListener('dragover', (event) => {
      const row = event.target.closest('.combatant');
      const header = event.target.closest('.faction-header');
      if (dragId && row && row.dataset.combatantId !== dragId) {
        const dragRow = list.querySelector(`.combatant[data-combatant-id="${dragId}"]`);
        if (dragRow?.dataset.faction !== row.dataset.faction) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        clearRowMarkers();
        row.classList.add(sideFor(event, row) === 'after' ? 'insert-after' : 'insert-before');
      } else if (dragFaction && header && header.dataset.faction !== dragFaction) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }
    });

    list.addEventListener('dragleave', (event) => {
      const row = event.target.closest('.combatant');
      const header = event.target.closest('.faction-header');
      row?.classList.remove('insert-before', 'insert-after');
      header?.classList.remove('is-drop-target');
    });

    list.addEventListener('drop', async (event) => {
      const row = event.target.closest('.combatant');
      const header = event.target.closest('.faction-header');

      if (dragId && row) {
        event.preventDefault();
        const side = sideFor(event, row);
        clearRowMarkers();
        const draggedId = dragId;
        dragId = null;
        if (!app.viewed || draggedId === row.dataset.combatantId) return;
        const dragRow = list.querySelector(`.combatant[data-combatant-id="${draggedId}"]`);
        const factionKey = row.dataset.faction;
        if (dragRow?.dataset.faction !== factionKey) return;
        await CombatTrackerHelper.reorderWithinFaction(
          app.viewed, factionKey, draggedId, row.dataset.combatantId, side === 'after'
        );
      } else if (dragFaction && header) {
        event.preventDefault();
        clearHeaderMarkers();
        const draggedKey = dragFaction;
        dragFaction = null;
        const targetKey = header.dataset.faction;
        if (!app.viewed || draggedKey === targetKey) return;
        await CombatTrackerHelper.reorderFactionGroups(app.viewed, draggedKey, targetKey);
      }
    });
  }
}
