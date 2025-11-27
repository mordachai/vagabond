// Import document classes.
import { VagabondActor } from './documents/actor.mjs';
import { VagabondItem } from './documents/item.mjs';
import { ProgressClock } from './documents/progress-clock.mjs';
// Import sheet classes.
import { VagabondActorSheet } from './sheets/actor-sheet.mjs';
import { VagabondItemSheet } from './sheets/item-sheet.mjs';
// Import helper/utility classes and constants.
import { VAGABOND } from './helpers/config.mjs';
import { VagabondChatCard } from './helpers/chat-card.mjs';
// Import DataModel classes
import * as models from './data/_module.mjs';
// Import UI classes
import { ProgressClockOverlay } from './ui/progress-clock-overlay.mjs';
// Import application classes
import { ProgressClockConfig } from './applications/progress-clock-config.mjs';
import { ProgressClockDeleteDialog } from './applications/progress-clock-delete-dialog.mjs';

const collections = foundry.documents.collections;
const sheets = foundry.appv1.sheets;

/* -------------------------------------------- */
/*  Game Settings                               */
/* -------------------------------------------- */

/**
 * Register game settings for the Vagabond system
 */
function registerGameSettings() {
  // Setting 1: Roll damage with check
  game.settings.register('vagabond', 'rollDamageWithCheck', {
    name: 'VAGABOND.Settings.rollDamageWithCheck.name',
    hint: 'VAGABOND.Settings.rollDamageWithCheck.hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

  // Setting 2: Always roll damage (even on miss)
  game.settings.register('vagabond', 'alwaysRollDamage', {
    name: 'VAGABOND.Settings.alwaysRollDamage.name',
    hint: 'VAGABOND.Settings.alwaysRollDamage.hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
    requiresReload: false,
  });

  // Setting 3: Default clock position
  game.settings.register('vagabond', 'defaultClockPosition', {
    name: 'VAGABOND.Settings.defaultClockPosition.name',
    hint: 'VAGABOND.Settings.defaultClockPosition.hint',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      'top-right': 'VAGABOND.ProgressClock.Position.TopRight',
      'top-left': 'VAGABOND.ProgressClock.Position.TopLeft',
      'bottom-right': 'VAGABOND.ProgressClock.Position.BottomRight',
      'bottom-left': 'VAGABOND.ProgressClock.Position.BottomLeft'
    },
    default: 'top-right',
  });
}

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

// Add key classes to the global scope so they can be more easily used
// by downstream developers
globalThis.vagabond = {
  documents: {
    VagabondActor,
    VagabondItem,
    ProgressClock,
  },
  applications: {
    VagabondActorSheet,
    VagabondItemSheet,
    ProgressClockConfig,
    ProgressClockDeleteDialog,
  },
  ui: {
    ProgressClockOverlay,
  },
  utils: {
    rollItemMacro,
    VagabondChatCard,
  },
  models,
};

Hooks.once('init', function () {
  // Add custom constants for configuration.
  CONFIG.VAGABOND = VAGABOND;

  /**
   * Set an initiative formula for the system
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    formula: '1d20 + @dexterity.value',
    decimals: 2,
  };

  // Define custom Document and DataModel classes
  CONFIG.Actor.documentClass = VagabondActor;

  // Note that you don't need to declare a DataModel
  // for the base actor/item classes - they are included
  // with the Character/NPC as part of super.defineSchema()
  CONFIG.Actor.dataModels = {
    character: models.VagabondCharacter,
    npc: models.VagabondNPC,
  };
  CONFIG.Item.documentClass = VagabondItem;
  CONFIG.Item.dataModels = {
    equipment: models.VagabondEquipment,
    spell: models.VagabondSpell,
    ancestry: models.VagabondAncestry,
    class: models.VagabondClass,
    perk: models.VagabondPerk,
  };

  // Active Effects are never copied to the Actor,
  // but will still apply to the Actor from within the Item
  // if the transfer property on the Active Effect is true.
  CONFIG.ActiveEffect.legacyTransferral = false;

  // Register sheet application classes
  collections.Actors.unregisterSheet('core', sheets.ActorSheet);
  collections.Actors.registerSheet('vagabond', VagabondActorSheet, {
    makeDefault: true,
    label: 'VAGABOND.SheetLabels.Actor',
  });
  collections.Items.unregisterSheet('core', sheets.ItemSheet);
  collections.Items.registerSheet('vagabond', VagabondItemSheet, {
    makeDefault: true,
    label: 'VAGABOND.SheetLabels.Item',
  });

  // Register game settings
  registerGameSettings();
});

/* -------------------------------------------- */
/*  Handlebars Helpers                          */
/* -------------------------------------------- */

// If you need to add Handlebars helpers, here is a useful example:
Handlebars.registerHelper('toLowerCase', function (str) {
  return str.toLowerCase();
});

// Capitalize first letter of a string
Handlebars.registerHelper('capitalize', function (str) {
  if (!str || typeof str !== 'string') return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
});

// Check if an array contains a value
Handlebars.registerHelper('contains', function (array, value) {
  if (!array || !Array.isArray(array)) return false;
  return array.includes(value);
});

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once('ready', function () {
  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on('hotbarDrop', (bar, data, slot) => createDocMacro(data, slot));
});

/* -------------------------------------------- */
/*  UI Hooks - Progress Clocks Overlay          */
/* -------------------------------------------- */

// Global overlay instance
let clockOverlay = null;

/**
 * Initialize the progress clocks HTML overlay when ready
 */
Hooks.once('ready', () => {
  clockOverlay = new ProgressClockOverlay();
  clockOverlay.initialize();

  // Store in global for easy access
  globalThis.vagabond.ui.clockOverlay = clockOverlay;
});

/**
 * Draw progress clocks when canvas is ready
 */
Hooks.on('canvasReady', async () => {
  // Ensure overlay is initialized
  if (!clockOverlay) {
    clockOverlay = new ProgressClockOverlay();
    clockOverlay.initialize();
    globalThis.vagabond.ui.clockOverlay = clockOverlay;
  }

  if (clockOverlay) {
    await clockOverlay.draw();
  }
});

/**
 * Add scene controls for Vagabond tools
 */
Hooks.on('getSceneControlButtons', (controls) => {
  // Ensure our base group exists
  controls['vagabond'] ??= {
    name: 'vagabond',
    title: 'Vagabond Tools',
    icon: 'fas fa-toolbox',
    tools: {}
  };

  // Add create clock button
  controls['vagabond'].tools['createClock'] ??= {
    name: 'createClock',
    title: game.i18n.localize('VAGABOND.ProgressClock.SceneControls.Create'),
    icon: 'fas fa-clock',
    button: true,
    visible: true,
    onChange: async () => {
      try {
        const { ProgressClockConfig } = globalThis.vagabond.applications;
        const dialog = new ProgressClockConfig(null);
        await dialog.render(true);
      } catch (error) {
        ui.notifications.error("Failed to open clock config: " + error.message);
      }
    }
  };
});

/**
 * Refresh clock when journals are updated
 */
Hooks.on('updateJournalEntry', async (journal, changes, options, userId) => {
  if (journal.flags?.vagabond?.progressClock?.type === 'progressClock') {
    if (clockOverlay) {
      const clockChanges = changes.flags?.vagabond?.progressClock;

      // If only progress (filled) changed, just refresh the image
      if (clockChanges?.filled !== undefined && Object.keys(clockChanges).length === 1) {
        clockOverlay.refreshClock(journal.id);
      }
      // If only positions changed (dragging), don't do anything - element already moved in DOM
      else if (clockChanges?.positions !== undefined && Object.keys(clockChanges).length === 1 && !clockChanges.size && !clockChanges.segments && !clockChanges.defaultPosition && !clockChanges.faded) {
        // Position was already updated by drag handler, no need to redraw
        return;
      }
      // For other changes (name, size, segments, ownership, fade, etc.), redraw all clocks
      else if (clockChanges || changes.name || changes.ownership) {
        await clockOverlay.draw();
      }
    }
  }
});

/**
 * Remove clock when journal is deleted
 */
Hooks.on('deleteJournalEntry', (journal, options, userId) => {
  if (journal.flags?.vagabond?.progressClock?.type === 'progressClock') {
    if (clockOverlay) {
      clockOverlay.removeClock(journal.id);
    }
  }
});

/**
 * Redraw clocks when a journal is created
 */
Hooks.on('createJournalEntry', async (journal, options, userId) => {
  if (journal.flags?.vagabond?.progressClock?.type === 'progressClock') {
    if (clockOverlay) {
      await clockOverlay.draw();
    }
  }
});

/* -------------------------------------------- */
/*  Chat Message Hooks                          */
/* -------------------------------------------- */

/**
 * Handle rendering chat messages - adds event listeners for damage buttons
 */
Hooks.on('renderChatMessageHTML', async (message, html) => {
  // html is an HTMLElement in V13
  if (!html || !html.querySelectorAll) return;

  const element = html;

  // Add click handler for damage roll buttons
  const damageButtons = element.querySelectorAll('.vagabond-damage-button');
  if (damageButtons) {
    damageButtons.forEach(button => {
      if (!button) return;
      button.addEventListener('click', async (event) => {
        event.preventDefault();

        // Import damage helper dynamically
        const { VagabondDamageHelper } = await import('./helpers/damage-helper.mjs');

        // Roll damage from button
        await VagabondDamageHelper.rollDamageFromButton(button, message.id);
      });
    });
  }

  // Add click handler for apply damage and healing buttons
  const applyButtons = element.querySelectorAll('.vagabond-apply-damage-button, .vagabond-apply-healing-button');
  if (applyButtons) {
    applyButtons.forEach(button => {
      if (!button) return;
      button.addEventListener('click', async (event) => {
        event.preventDefault();

        // Import damage helper dynamically
        const { VagabondDamageHelper } = await import('./helpers/damage-helper.mjs');

        // Apply damage or healing to targets
        await VagabondDamageHelper.applyDamageToTargets(button);
      });
    });
  }

  // Add click handler for NPC damage buttons (GM-only)
  const npcDamageButtons = element.querySelectorAll('.vagabond-npc-damage-button');
  if (npcDamageButtons) {
    npcDamageButtons.forEach(button => {
      if (!button) return;
      // Only show to GM
      if (!game.user.isGM) {
        button.style.display = 'none';
        return;
      }

      button.addEventListener('click', async (event) => {
        event.preventDefault();

        // Import damage helper dynamically
        const { VagabondDamageHelper } = await import('./helpers/damage-helper.mjs');

        // Handle NPC damage button click (reveals damage to players)
        await VagabondDamageHelper.handleNPCDamageButton(button, message.id);
      });
    });
  }

  // Add click handler for property accordion toggle
  const propertyHeaders = element.querySelectorAll('[data-action="toggleProperties"]');
  if (propertyHeaders) {
    propertyHeaders.forEach(header => {
      if (!header) return;
      header.addEventListener('click', (event) => {
        event.preventDefault();
        const expandable = header.closest('.metadata-item-expandable');
        if (!expandable) return;

        // Toggle expanded state
        expandable.classList.toggle('expanded');
      });
    });
  }
});

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createDocMacro(data, slot) {
  // First, determine if this is a valid owned item.
  if (data.type !== 'Item') return;
  if (!data.uuid.includes('Actor.') && !data.uuid.includes('Token.')) {
    return ui.notifications.warn(
      'You can only create macro buttons for owned Items'
    );
  }
  // If it is, retrieve it based on the uuid.
  const item = await Item.fromDropData(data);

  // Create the macro command using the uuid.
  const command = `game.vagabond.rollItemMacro("${data.uuid}");`;
  let macro = game.macros.find(
    (m) => m.name === item.name && m.command === command
  );
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: 'script',
      img: item.img,
      command: command,
      flags: { 'vagabond.itemMacro': true },
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
}

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {string} itemUuid
 */
function rollItemMacro(itemUuid) {
  // Reconstruct the drop data so that we can load the item.
  const dropData = {
    type: 'Item',
    uuid: itemUuid,
  };
  // Load the item from the uuid.
  Item.fromDropData(dropData).then((item) => {
    // Determine if the item loaded and if it's an owned item.
    if (!item || !item.parent) {
      const itemName = item?.name ?? itemUuid;
      return ui.notifications.warn(
        `Could not find item ${itemName}. You may need to delete and recreate this macro.`
      );
    }

    // Trigger the item roll
    item.roll();
  });
}
