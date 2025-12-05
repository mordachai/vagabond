// Import document classes.
import { VagabondActor } from './documents/actor.mjs';
import { VagabondItem } from './documents/item.mjs';
import { VagabondActiveEffect } from './documents/active-effect.mjs';
import { ProgressClock } from './documents/progress-clock.mjs';
import { CountdownDice } from './documents/countdown-dice.mjs';
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
import { CountdownDiceOverlay } from './ui/countdown-dice-overlay.mjs';
// Import application classes
import { ProgressClockConfig } from './applications/progress-clock-config.mjs';
import { ProgressClockDeleteDialog } from './applications/progress-clock-delete-dialog.mjs';
import { CountdownDiceConfig } from './applications/countdown-dice-config.mjs';

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

  // Setting 4: Level Pacing
  game.settings.register('vagabond', 'levelPacing', {
    name: 'VAGABOND.Settings.levelPacing.name',
    hint: 'VAGABOND.Settings.levelPacing.hint',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      'quick': 'VAGABOND.Settings.levelPacing.quick',
      'normal': 'VAGABOND.Settings.levelPacing.normal',
      'epic': 'VAGABOND.Settings.levelPacing.epic',
      'saga': 'VAGABOND.Settings.levelPacing.saga'
    },
    default: 'normal',
    requiresReload: true,
    onChange: () => {
      // Trigger re-render of all character sheets
      for (let actor of game.actors) {
        if (actor.type === 'character') {
          actor.sheet?.render(false);
        }
      }
    }
  });
}

/* -------------------------------------------- */
/*  Template Preloading                         */
/* -------------------------------------------- */

/**
 * Preload Handlebars templates for partials
 */
async function preloadHandlebarsTemplates() {
  const templatePaths = [
    // Shared partials
    'systems/vagabond/templates/shared/damage-type-select.hbs',
    'systems/vagabond/templates/shared/size-select.hbs',
    'systems/vagabond/templates/shared/being-type-select.hbs',
    // Actor partials
    'systems/vagabond/templates/actor/parts/inventory-card.hbs',
  ];

  return foundry.applications.handlebars.loadTemplates(templatePaths);
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
    VagabondActiveEffect,
    ProgressClock,
    CountdownDice,
  },
  applications: {
    VagabondActorSheet,
    VagabondItemSheet,
    ProgressClockConfig,
    ProgressClockDeleteDialog,
    CountdownDiceConfig,
  },
  ui: {
    ProgressClockOverlay,
    CountdownDiceOverlay,
  },
  utils: {
    rollItemMacro,
    VagabondChatCard,
  },
  models,
};

Hooks.once('init', async function () {
  // Add custom constants for configuration.
  CONFIG.VAGABOND = VAGABOND;

  // Preload Handlebars templates
  await preloadHandlebarsTemplates();

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

  // Register custom ActiveEffect document class
  CONFIG.ActiveEffect.documentClass = VagabondActiveEffect;

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

/* -------------------------------------------- */
/*  UI Hooks - Countdown Dice Overlay           */
/* -------------------------------------------- */

// Global overlay instance
let diceOverlay = null;

/**
 * Initialize the countdown dice HTML overlay when ready
 */
Hooks.once('ready', () => {
  diceOverlay = new CountdownDiceOverlay();
  diceOverlay.initialize();

  // Store in global for easy access
  globalThis.vagabond.ui.countdownDiceOverlay = diceOverlay;
});

/**
 * Draw countdown dice when canvas is ready
 */
Hooks.on('canvasReady', async () => {
  // Ensure overlay is initialized
  if (!diceOverlay) {
    diceOverlay = new CountdownDiceOverlay();
    diceOverlay.initialize();
    globalThis.vagabond.ui.countdownDiceOverlay = diceOverlay;
  }

  if (diceOverlay) {
    await diceOverlay.draw();
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
    icon: 'fas fa-circle-v',
    tools: {}
  };

  // Add create clock button
  controls['vagabond'].tools['createClock'] ??= {
    name: 'createClock',
    title: game.i18n.localize('VAGABOND.ProgressClock.SceneControls.Create'),
    icon: 'fas fa-chart-pie',
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

  // Add create countdown dice button
  controls['vagabond'].tools['createCountdownDice'] ??= {
    name: 'createCountdownDice',
    title: game.i18n.localize('VAGABOND.CountdownDice.SceneControls.Create'),
    icon: 'fas fa-dice-six',
    button: true,
    visible: true,
    onChange: async () => {
      try {
        const { CountdownDiceConfig } = globalThis.vagabond.applications;
        const dialog = new CountdownDiceConfig(null);
        await dialog.render(true);
      } catch (error) {
        ui.notifications.error("Failed to open countdown dice config: " + error.message);
      }
    }
  };
});

/**
 * Refresh clock when journals are updated
 */
Hooks.on('updateJournalEntry', async (journal, changes, options, userId) => {
  // Handle progress clocks
  if (journal.flags?.vagabond?.progressClock?.type === 'progressClock') {
    if (clockOverlay) {
      const clockChanges = changes.flags?.vagabond?.progressClock;

      // If only positions changed (dragging), don't do anything - element already moved in DOM
      if (clockChanges?.positions !== undefined && Object.keys(clockChanges).length === 1 && !clockChanges.size && !clockChanges.segments && !clockChanges.defaultPosition && !clockChanges.faded) {
        // Position was already updated by drag handler, no need to redraw
        return;
      }
      // For any other changes (filled, name, size, segments, ownership, fade, etc.), redraw the clock
      else if (clockChanges || changes.name || changes.ownership) {
        await clockOverlay.draw();
      }
    }
  }

  // Handle countdown dice
  if (journal.flags?.vagabond?.countdownDice?.type === 'countdownDice') {
    if (diceOverlay) {
      const diceChanges = changes.flags?.vagabond?.countdownDice;

      // If only positions changed (dragging), don't do anything - element already moved in DOM
      if (diceChanges?.positions !== undefined && Object.keys(diceChanges).length === 1 && !diceChanges.diceType && !diceChanges.name && !diceChanges.size && !diceChanges.faded) {
        // Position was already updated by drag handler, no need to redraw
        return;
      }
      // For other changes (name, diceType, size, ownership, fade, etc.), refresh only this dice
      else if (diceChanges || changes.name || changes.ownership) {
        await diceOverlay.refreshDice(journal.id, journal);
      }
    }
  }
});

/**
 * Remove clock/dice when journal is deleted
 */
Hooks.on('deleteJournalEntry', async (journal, options, userId) => {
  // Handle progress clocks
  if (journal.flags?.vagabond?.progressClock?.type === 'progressClock') {
    if (clockOverlay) {
      await clockOverlay.removeClock(journal.id);
    }
  }

  // Handle countdown dice
  if (journal.flags?.vagabond?.countdownDice?.type === 'countdownDice') {
    if (diceOverlay) {
      await diceOverlay.removeDice(journal.id);
    }
  }
});

/**
 * Redraw clocks when a journal is created
 */
Hooks.on('createJournalEntry', async (journal, options, userId) => {
  // Handle progress clocks
  if (journal.flags?.vagabond?.progressClock?.type === 'progressClock') {
    if (clockOverlay) {
      await clockOverlay.draw();
    }
  }

  // Handle countdown dice
  if (journal.flags?.vagabond?.countdownDice?.type === 'countdownDice') {
    if (diceOverlay) {
      await diceOverlay.draw();
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
  try {
    // html is an HTMLElement in V13
    if (!html || !html.querySelectorAll) return;

    const element = html;

    // Add click handler for damage roll buttons
    const damageButtons = element.querySelectorAll('.vagabond-damage-button');
    if (damageButtons && damageButtons.length > 0) {
      damageButtons.forEach(button => {
        if (!button || !button.classList) return;
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
    if (applyButtons && applyButtons.length > 0) {
      applyButtons.forEach(button => {
        if (!button || !button.classList) return;
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
    if (npcDamageButtons && npcDamageButtons.length > 0) {
      npcDamageButtons.forEach(button => {
        if (!button || !button.classList) return;
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
    if (propertyHeaders && propertyHeaders.length > 0) {
      propertyHeaders.forEach(header => {
        if (!header || !header.classList) return;
        header.addEventListener('click', (event) => {
          event.preventDefault();
          const expandable = header.closest('.metadata-item-expandable');
          if (!expandable || !expandable.classList) return;

          // Toggle expanded state
          expandable.classList.toggle('expanded');
        });
      });
    }
  } catch (error) {
    // Silently catch errors to prevent breaking other modules
    console.warn('Vagabond | Error in renderChatMessageHTML hook:', error);
  }
});

/* -------------------------------------------- */
/*  Active Effect Configuration Hook            */
/* -------------------------------------------- */

/**
 * Inject attribute choices into the ActiveEffect configuration form.
 * This provides autocomplete for the "Attribute Key" field.
 */
Hooks.on('renderActiveEffectConfig', (app, html, data) => {
  // Get attribute choices from the VagabondActiveEffect class
  const choices = VagabondActiveEffect.getAttributeChoices();

  // Create a unique datalist ID for this form
  const datalistId = `ae-attribute-choices-${app.document.id}`;

  // Convert html to HTMLElement if it's not already (handle both v11 and v13)
  const element = html instanceof HTMLElement ? html : html[0];
  if (!element) return;

  // Find all attribute key input fields (there can be multiple effect changes)
  const keyInputs = element.querySelectorAll('input[name*=".key"]');

  keyInputs.forEach(keyInput => {
    // Add datalist reference to the input
    keyInput.setAttribute('list', datalistId);
    keyInput.setAttribute('autocomplete', 'off');

    // Add a helpful title/placeholder
    if (!keyInput.getAttribute('placeholder')) {
      keyInput.setAttribute('placeholder', 'Start typing to see suggestions...');
    }
  });

  // Check if datalist already exists (to avoid duplicates)
  if (element.querySelector(`#${datalistId}`)) return;

  // Create the datalist element
  const datalist = document.createElement('datalist');
  datalist.id = datalistId;

  // Add all choices as options
  for (const [key, label] of Object.entries(choices)) {
    const option = document.createElement('option');
    option.value = key;
    option.label = label;
    option.textContent = label;
    datalist.appendChild(option);
  }

  // Append the datalist to the form
  const form = element.querySelector('form');
  if (form) {
    form.appendChild(datalist);
  } else {
    element.appendChild(datalist);
  }

  // Update the first attribute key hint to indicate autocomplete is available
  const firstKeyInput = element.querySelector('input[name="changes.0.key"]');
  if (firstKeyInput) {
    const formGroup = firstKeyInput.closest('.form-group');
    if (formGroup) {
      const hint = formGroup.querySelector('.hint, .notes');
      if (hint && !hint.dataset.updated) {
        hint.textContent = 'Start typing to see autocomplete suggestions for available system variables.';
        hint.dataset.updated = 'true';
      }
    }
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
