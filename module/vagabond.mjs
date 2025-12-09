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

  // Setting 3: Auto-apply save damage
  game.settings.register('vagabond', 'autoApplySaveDamage', {
    name: 'VAGABOND.Settings.autoApplySaveDamage.name',
    hint: 'VAGABOND.Settings.autoApplySaveDamage.hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
    requiresReload: false,
  });

  // Setting 4: Default clock position
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

  // Setting 5: Level Pacing
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
    //Chat cards
    'systems/vagabond/templates/chat/damage-display.hbs',
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
  
  // Loads placeholder images for character sheets
  CONFIG.Actor.typeImages = VAGABOND.actorTypeImages;

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
/* Chat Message Hooks                           */
/* -------------------------------------------- */

/**
 * V13 Standard: 'renderChatMessageHTML' replaces 'renderChatMessage'.
 * The 'html' argument is now a standard HTMLElement, not a jQuery object.
 */
Hooks.on('renderChatMessageHTML', (message, html, data) => {
  // Safety check: ensure html is a valid element
  if (!html || typeof html.querySelectorAll !== 'function') {
    console.warn('VagabondSystem | renderChatMessageHTML: Invalid html element', html);
    return;
  }

  // 1. Accordion Toggle Handler (Properties)
  // We use querySelectorAll to find elements within the chat message HTML
  const toggles = html.querySelectorAll('.metadata-header[data-action="toggleProperties"]');

  toggles.forEach(toggle => {
    if (!toggle) return; // Safety check
    toggle.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      const header = ev.currentTarget;
      // .closest() is the standard JS replacement for jQuery's .closest()
      const container = header.closest('.metadata-item-expandable');

      if (container && container.classList) {
        // .classList.toggle() is the standard JS replacement for jQuery's .toggleClass()
        container.classList.toggle('expanded');
      }
    });
  });

  // 2. Accordion Toggle Handler (Defend Info)
  const defendToggles = html.querySelectorAll('.defend-info-header[data-action="toggleDefendInfo"]');

  defendToggles.forEach(toggle => {
    if (!toggle) return; // Safety check
    toggle.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      const header = ev.currentTarget;
      const container = header.closest('.card-defend-info');

      if (container && container.classList) {
        container.classList.toggle('expanded');
      }
    });
  });

  // 3. Damage Roll Button Handler
  const damageButtons = html.querySelectorAll('.vagabond-damage-button');

  damageButtons.forEach(button => {
    if (!button) return; // Safety check
    button.addEventListener('click', (ev) => {
      ev.preventDefault();

      // Disable button immediately to prevent double-clicks
      button.disabled = true;

      import('./helpers/damage-helper.mjs').then(({ VagabondDamageHelper }) => {
        VagabondDamageHelper.rollDamageFromButton(button, message.id);
      });
    });
  });

  // 4. Save Button Handler (Roll to Save system)
  const saveButtons = html.querySelectorAll('.vagabond-save-button');

  saveButtons.forEach(button => {
    if (!button) return; // Safety check
    button.addEventListener('click', (ev) => {
      ev.preventDefault();

      // Disable button to prevent double-clicks
      button.disabled = true;

      import('./helpers/damage-helper.mjs').then(({ VagabondDamageHelper }) => {
        VagabondDamageHelper.handleSaveRoll(button);
      });
    });
  });

  // 5. Apply Direct Damage Button Handler (bypasses saves)
  const applyDirectButtons = html.querySelectorAll('.vagabond-apply-direct-button');

  applyDirectButtons.forEach(button => {
    if (!button) return; // Safety check
    button.addEventListener('click', (ev) => {
      ev.preventDefault();

      // Disable button to prevent double-clicks
      button.disabled = true;

      import('./helpers/damage-helper.mjs').then(({ VagabondDamageHelper }) => {
        VagabondDamageHelper.handleApplyDirect(button);
      });
    });
  });

  // 6. Apply Healing Button Handler (healing still uses old system)
  const healingButtons = html.querySelectorAll('.vagabond-apply-healing-button');

  healingButtons.forEach(button => {
    if (!button) return; // Safety check
    button.addEventListener('click', (ev) => {
      ev.preventDefault();

      import('./helpers/damage-helper.mjs').then(({ VagabondDamageHelper }) => {
        VagabondDamageHelper.applyDamageToTargets(button);
      });
    });
  });

  // 7. NPC Damage Button Handler (GM Only)
  const npcButtons = html.querySelectorAll('.vagabond-npc-damage-button');

  npcButtons.forEach(button => {
    if (!button) return; // Safety check
    button.addEventListener('click', (ev) => {
      ev.preventDefault();

      import('./helpers/damage-helper.mjs').then(({ VagabondDamageHelper }) => {
        VagabondDamageHelper.handleNPCDamageButton(button, message.id);
      });
    });
  });
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


/* -------------------------------------------- */
/*  Vagabond System - Secure Content Manager    */
/* -------------------------------------------- */

const SYSTEM_ID = "vagabond";
const SETTING_KEY = "contentUnlocked";

/* 
 * CHALLENGE DATABASE 
 */
const CHALLENGES = [
  {
    "id": "epay88",
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGNhdXNlcyB5b3UgdG8gbG9zZSBhbGwgbGFuZCwgcG9zc2Vzc2lvbnMsIGFuZCB3ZWFsdGg/",
    "h": [
      "4a38d08340cba469053d9f4f6f22322ea2b0225580ec5abb433a0b4e4ddddeaf",
      "4a38d08340cba469053d9f4f6f22322ea2b0225580ec5abb433a0b4e4ddddeaf"
    ]
  },
  {
    "id": "zn9jq",
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGdyYW50cyB0aHJlZSB3aXNoZXMgdGhhdCBtdXN0IGJlIG1hZGUgd2l0aGluIDEwIG1pbnV0ZXM/",
    "h": [
      "9e78b43ea00edcac8299e0cc8df7f6f913078171335f733a21d5d911b6999132",
      "9e78b43ea00edcac8299e0cc8df7f6f913078171335f733a21d5d911b6999132"
    ]
  },
  {
    "id": "09pvo8",
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIG1ha2VzIHlvdSBsb3NlIDEgTGV2ZWwgYW5kIGRyYXcgYW5vdGhlciBjYXJkPw==",
    "h": [
      "18679f10e50678804a44f8cddbc0ed937b3ed234e95fe28357f2703a259c47d4",
      "18679f10e50678804a44f8cddbc0ed937b3ed234e95fe28357f2703a259c47d4"
    ]
  },
  {
    "id": "u58fnb",
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGNyZWF0ZXMgYSBwb3dlcmZ1bCBIZWxsc3Bhd24gZW5lbXk/",
    "h": [
      "f3b4cd4944a5f266843434e5aacfa2bb79f466424c19dc172e8953fb8a83bc97",
      "f3b4cd4944a5f266843434e5aacfa2bb79f466424c19dc172e8953fb8a83bc97"
    ]
  },
  {
    "id": "2cylf",
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGdyYW50cyB5b3UgMSBMZXZlbCBvciBsZXRzIHlvdSBkcmF3IHR3byBjYXJkcz8=",
    "h": [
      "78a7edfb3adb263c381f942170ee5813160d4017f13c615a6c067473ecca439a",
      "78a7edfb3adb263c381f942170ee5813160d4017f13c615a6c067473ecca439a"
    ]
  },
  {
    "id": "f4ck4",
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGNhdXNlcyBhIGZyaWVuZCB0byBwZXJtYW5lbnRseSBoYXRlIHlvdT8=",
    "h": [
      "d20bcf177b60169a92529f6b5b71c8647583a0ed940f93ae5af62c127856cb1d"
    ]
  },
  {
    "id": "sepo5",
    "q": "SW4gdGhlIHJlbGljIEJsYWNrIFdpbmcgd2hhdCB2aXNpb24gYWJpbGl0eSBkb2VzIGl0IGdyYW50IHdoaWxlIGVxdWlwcGVkPw==",
    "h": [
      "ffb724a6305ff76950df81eb3994cd50ac76745b64671f6598fe9dd1599c7927",
      "ffb724a6305ff76950df81eb3994cd50ac76745b64671f6598fe9dd1599c7927"
    ]
  },
  {
    "id": "sip0qb",
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIHJlcXVpcmVzIHlvdSB0byBkZWZlYXQgdGhlIG5leHQgRW5lbXkgYWxvbmUgdG8gZ2FpbiBhIExldmVsPw==",
    "h": [
      "d51f791051c2e5f9112c57109acd4d7b9b5788df79db36fa24c09c3c9ee8a569",
      "d51f791051c2e5f9112c57109acd4d7b9b5788df79db36fa24c09c3c9ee8a569"
    ]
  },
  {
    "id": "7es3u",
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGFsbG93cyB5b3UgdG8gYXZvaWQgb25lIHNpdHVhdGlvbiBvciBvdXRjb21lIGluIHRoZSBmdXR1cmU/",
    "h": [
      "aef88bb4f3cfbfdf997d9d835204984d4e9c89131ee1b2887d38483b660ceb8c",
      "aef88bb4f3cfbfdf997d9d835204984d4e9c89131ee1b2887d38483b660ceb8c"
    ]
  },

];

/* -------------------------------------------- */
/*  Initialization & Settings                   */
/* -------------------------------------------- */

Hooks.once('init', () => {
  game.settings.register(SYSTEM_ID, SETTING_KEY, {
    name: 'Content Unlocked',
    scope: 'client',
    config: false,
    type: Boolean,
    default: false
  });
});

/* -------------------------------------------- */
/*  UI Interaction (Compendium Directory)       */
/* -------------------------------------------- */

Hooks.on('renderCompendiumDirectory', (app, html, data) => {
  const isUnlocked = game.settings.get(SYSTEM_ID, SETTING_KEY);
  const directoryElement = html instanceof HTMLElement ? html : html[0];
  
  // -- SCENARIO A: CONTENT IS UNLOCKED --
  if (isUnlocked) {
    const existingBtn = directoryElement.querySelector('#vagabond-unlock-btn');
    if (existingBtn) existingBtn.remove();
    return; 
  }

  // -- SCENARIO B: CONTENT IS LOCKED --
  
  // 1. Hide System Packs
  game.packs.forEach(pack => {
    if (pack.metadata.packageName === SYSTEM_ID) {
      const packElement = directoryElement.querySelector(`[data-pack="${pack.collection}"]`);
      if (packElement) packElement.remove();
    }
  });

  // 2. Cleanup empty folders
  directoryElement.querySelectorAll('.directory-group').forEach(dir => {
    const list = dir.querySelector('ol');
    if (list && list.children.length === 0) dir.style.display = 'none';
  });

  // 3. Inject the Unlock Button
  if (!directoryElement.querySelector('#vagabond-unlock-btn')) {
    const unlockBtn = document.createElement("button");
    unlockBtn.id = "vagabond-unlock-btn";
    unlockBtn.innerHTML = `<i class="fas fa-key"></i> Unlock System Content`;
    unlockBtn.style.cssText = `
      width: 96%; margin: 10px 2%; padding: 8px;
      background: #222; color: #fff; border: 1px solid #444;
      cursor: pointer; font-family: monospace; text-transform: uppercase;
    `;
    
    // We bind the click listener
    unlockBtn.onclick = (e) => { 
      e.preventDefault(); 
      promptRandomChallenge(); 
    };

    const header = directoryElement.querySelector('.directory-header');
    if (header) header.after(unlockBtn);
    else directoryElement.prepend(unlockBtn);
  }
});

/* -------------------------------------------- */
/*  Cryptographic Logic & Dialogs (V2)          */
/* -------------------------------------------- */

/**
 * Selects a random challenge and displays the Input Dialog using ApplicationV2
 */
async function promptRandomChallenge() {
  if (CHALLENGES.length === 0) {
    ui.notifications.warn("No challenges configured.");
    return;
  }

  const challenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
  const questionText = decodeURIComponent(escape(window.atob(challenge.q)));
  
  // Use the new DialogV2 API to avoid deprecation warnings
  const { DialogV2 } = foundry.applications.api;

  // .wait() returns a Promise that resolves when a button is clicked
  const userResponse = await DialogV2.wait({
    window: { 
        title: "Security Check",
        icon: "fas fa-user-secret"
    },
    content: `
      <div style="text-align: center; padding: 10px;">
        <h5 style="font-weight: bold; margin-bottom: 10px;">${questionText}</h5>
        <p style="margin-bottom: 10px;">Prove your knowledge.</p>
        <div class="form-group">
            <input type="password" id="secret-attempt" placeholder="Answer..." style="text-align: center; width: 100%;" autofocus>
        </div>
      </div>
    `,
    buttons: [{
      action: "submit",
      label: "Verify",
      icon: "fas fa-check",
      // Callback returns the value of the input field
      callback: (event, button, dialog) => {
        return dialog.element.querySelector('#secret-attempt').value;
      }
    }],
    // Handle "Enter" key submission in the form
    submit: (result) => {
        // Just return the value if enter is pressed, handled by the button callback logic usually, 
        // but explicit submission handling can vary. 
        // DialogV2 generally handles button clicks. 
        return "submit"; 
    },
    close: () => { return null; }
  });

  // If userResponse is null (window closed) or empty
  if (!userResponse) return;

  const valid = await verifySignature(userResponse.trim().toLowerCase(), challenge.h);

  if (valid) {
    ui.notifications.info("Access Granted.");
    await game.settings.set(SYSTEM_ID, SETTING_KEY, true);
    ui.sidebar.render(); // Force refresh to remove button
  } else {
    ui.notifications.error("Access Denied.");
  }
}

/**
 * Hashes the user input and compares it against valid hashes
 */
async function verifySignature(input, validHashes) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const inputHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return validHashes.includes(inputHash);
}
