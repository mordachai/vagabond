// Import document classes.
import { VagabondActor } from './documents/actor.mjs';
import { VagabondItem } from './documents/item.mjs';
import { VagabondCombat } from './documents/combat.mjs';
import { VagabondCombatant } from './documents/combatant.mjs';
import { VagabondActiveEffect } from './documents/active-effect.mjs';
import { ProgressClock } from './documents/progress-clock.mjs';
import { CountdownDice } from './documents/countdown-dice.mjs';
// Import sheet classes.
import {
  VagabondActorSheet,
  VagabondCharacterSheet,
  VagabondNPCSheet,
} from './sheets/_module.mjs';
import { VagabondItemSheet } from './sheets/item-sheet.mjs';
// Import helper/utility classes and constants.
import { VAGABOND } from './helpers/config.mjs';
import { VagabondChatCard } from './helpers/chat-card.mjs';
import { VagabondDiceAppearance } from './helpers/dice-appearance.mjs';
import { EquipmentHelper } from './helpers/equipment-helper.mjs';
import { ContextMenuHelper } from './helpers/context-menu-helper.mjs';
import { AccordionHelper } from './helpers/accordion-helper.mjs';
import { EnrichmentHelper } from './helpers/enrichment-helper.mjs';
// Import DataModel classes
import * as models from './data/_module.mjs';
// Import UI classes
import { ProgressClockOverlay } from './ui/progress-clock-overlay.mjs';
import { CountdownDiceOverlay } from './ui/countdown-dice-overlay.mjs';
// Import application classes
import { ProgressClockConfig } from './applications/progress-clock-config.mjs';
import { ProgressClockDeleteDialog } from './applications/progress-clock-delete-dialog.mjs';
import { CountdownDiceConfig } from './applications/countdown-dice-config.mjs';
import { DowntimeApp } from './applications/downtime-app.mjs';
import { VagabondMeasureTemplates } from './applications/measure-templates.mjs';
import { VagabondCharBuilder } from './applications/char-builder/index.mjs';
import { VagabondCombatTracker } from './ui/combat-tracker.mjs';
import { EncounterSettings } from './applications/encounter-settings.mjs';
import { CompendiumSettings } from './applications/compendium-settings.mjs';

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
  
  // Setting 6: Chat icons
  game.settings.register('vagabond', 'chatCardIconStyle', {
    name: 'VAGABOND.Settings.chatCardIconStyle.name', // "Chat Card Icon Style"
    hint: 'VAGABOND.Settings.chatCardIconStyle.hint', // "Choose what icon appears on the chat card."
    scope: 'client', // Client-side preference so each player can choose
    config: true,
    type: String,
    choices: {
      'item': 'VAGABOND.Settings.chatCardIconStyle.item', // "Always Item Icon (Default)"
      'smart': 'VAGABOND.Settings.chatCardIconStyle.smart' // "Actor Face for Attacks/Spells, Item Icon for Gear"
    },
    default: 'item',
    requiresReload: false
  });

  // Setting 7: Status Effects Mode
  game.settings.register('vagabond', 'statusEffectsMode', {
    name: 'VAGABOND.Settings.statusEffectsMode.name',
    hint: 'VAGABOND.Settings.statusEffectsMode.hint',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      'vagabond': 'VAGABOND.Settings.statusEffectsMode.vagabond',
      'foundry': 'VAGABOND.Settings.statusEffectsMode.foundry'
    },
    default: 'vagabond',
    requiresReload: true
  });

  // Setting 8: Hide Initiative Roll
  game.settings.register('vagabond', 'hideInitiativeRoll', {
    name: 'VAGABOND.Settings.hideInitiativeRoll.name',
    hint: 'VAGABOND.Settings.hideInitiativeRoll.hint',
    scope: 'world',
    config: false, // Not shown in standard config - use Encounter Settings dialog instead
    type: Boolean,
    default: true,
    requiresReload: false
  });

  // Setting 9: Use Activation Points
  game.settings.register('vagabond', 'useActivationPoints', {
    name: 'VAGABOND.Settings.useActivationPoints.name',
    hint: 'VAGABOND.Settings.useActivationPoints.hint',
    scope: 'world',
    config: false, // Not shown in standard config - use Encounter Settings dialog instead
    type: Boolean,
    default: false,
    requiresReload: false
  });

  // Setting 10: Custom Initiative Formula (PCs)
  game.settings.register('vagabond', 'initiativeFormula', {
    name: 'VAGABOND.Settings.initiativeFormula.name',
    hint: 'VAGABOND.Settings.initiativeFormula.hint',
    scope: 'world',
    config: false, // Not shown in standard config - use Encounter Settings dialog instead
    type: String,
    default: '1d20 + @dexterity.value + @awareness.value',
    requiresReload: false
  });

  // Setting 11: Custom Initiative Formula (NPCs)
  game.settings.register('vagabond', 'npcInitiativeFormula', {
    name: 'VAGABOND.Settings.npcInitiativeFormula.name',
    hint: 'VAGABOND.Settings.npcInitiativeFormula.hint',
    scope: 'world',
    config: false, // Not shown in standard config - use Encounter Settings dialog instead
    type: String,
    default: '1d20 + ceil(@speed / 10)',
    requiresReload: false
  });

  // Setting 12: Default Activation Points
  game.settings.register('vagabond', 'defaultActivationPoints', {
    name: 'VAGABOND.Settings.defaultActivationPoints.name',
    hint: 'VAGABOND.Settings.defaultActivationPoints.hint',
    scope: 'world',
    config: false, // Not shown in standard config - use Encounter Settings dialog instead
    type: Number,
    default: 2,
    requiresReload: false
  });

  // Setting 12b: Faction Titles
  game.settings.register('vagabond', 'factionFriendly', {
    name: 'VAGABOND.EncounterSettings.Factions.Friendly',
    scope: 'world',
    config: false,
    type: String,
    default: 'Heroes',
    requiresReload: false
  });

  game.settings.register('vagabond', 'factionNeutral', {
    name: 'VAGABOND.EncounterSettings.Factions.Neutral',
    scope: 'world',
    config: false,
    type: String,
    default: 'Neutrals',
    requiresReload: false
  });

  game.settings.register('vagabond', 'factionHostile', {
    name: 'VAGABOND.EncounterSettings.Factions.Hostile',
    scope: 'world',
    config: false,
    type: String,
    default: 'NPCs',
    requiresReload: false
  });

  game.settings.register('vagabond', 'factionSecret', {
    name: 'VAGABOND.EncounterSettings.Factions.Secret',
    scope: 'world',
    config: false,
    type: String,
    default: 'Secret',
    requiresReload: false
  });

  // Setting 13: Encounter Settings Button (Menu)
  game.settings.registerMenu('vagabond', 'encounterSettingsMenu', {
    name: 'VAGABOND.Settings.encounterSettings.name',
    label: 'VAGABOND.Settings.encounterSettings.label',
    hint: 'VAGABOND.Settings.encounterSettings.hint',
    icon: 'fas fa-swords',
    type: EncounterSettings,
    restricted: true
  });

  // Setting 14: Character Builder Compendiums (Data)
  game.settings.register('vagabond', 'characterBuilderCompendiums', {
    name: 'Character Builder Compendiums',
    scope: 'world',
    config: false,
    type: Object,
    default: {
      useAll: true,
      enabled: []
    },
    requiresReload: false
  });

  // Setting 15: Character Builder Compendiums (Menu)
  game.settings.registerMenu('vagabond', 'compendiumSettingsMenu', {
    name: 'VAGABOND.Settings.compendiumSettings.name',
    label: 'VAGABOND.Settings.compendiumSettings.label',
    hint: 'VAGABOND.Settings.compendiumSettings.hint',
    icon: 'fas fa-books',
    type: CompendiumSettings,
    restricted: true
  });
}

/* -------------------------------------------- */
/*  Template Preloading                         */
/* -------------------------------------------- */

// Track template loading state
let templatesReady = false;

/**
 * Preload Handlebars templates for partials
 */
async function preloadHandlebarsTemplates() {
  const templatePaths = [
    // Shared partials
    'systems/vagabond/templates/shared/damage-type-select.hbs',
    'systems/vagabond/templates/shared/size-select.hbs',
    'systems/vagabond/templates/shared/being-type-select.hbs',
    'systems/vagabond/templates/shared/weapon-skill-select.hbs',
    'systems/vagabond/templates/shared/bonus-stats-selector.hbs',
    // Actor partials
    'systems/vagabond/templates/actor/parts/inventory-card.hbs',
    //Chat cards
    'systems/vagabond/templates/chat/damage-display.hbs',
  ];

  // Load standard partials
  await foundry.applications.handlebars.loadTemplates(templatePaths);

  // Manually register character builder partials with simple names
  const builderParts = {
    'navigation': 'systems/vagabond/templates/apps/char-builder-parts/navigation.hbs',
    'sidebar': 'systems/vagabond/templates/apps/char-builder-parts/sidebar.hbs',
    'decision': 'systems/vagabond/templates/apps/char-builder-parts/decision.hbs',
    'tray': 'systems/vagabond/templates/apps/char-builder-parts/tray.hbs',
    'preview': 'systems/vagabond/templates/apps/char-builder-parts/preview.hbs',
    'reference': 'systems/vagabond/templates/apps/char-builder-parts/reference.hbs',
    'footer': 'systems/vagabond/templates/apps/char-builder-parts/footer.hbs'
  };

  // Register each builder part as a Handlebars partial (parallel instead of sequential)
  await Promise.all(
    Object.entries(builderParts).map(async ([name, path]) => {
      const template = await foundry.applications.handlebars.getTemplate(path);
      Handlebars.registerPartial(name, template);
    })
  );

  // Mark templates as ready (set both local and global flags)
  templatesReady = true;
  globalThis.vagabond.templatesReady = true;
}

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

// Add key classes to the global scope so they can be more easily used
// by downstream developers
globalThis.vagabond = {
  templatesReady: false, // Track template loading state
  documents: {
    VagabondActor,
    VagabondItem,
    VagabondActiveEffect,
    ProgressClock,
    CountdownDice,
  },
  applications: {
    VagabondActorSheet,
    VagabondCharacterSheet,
    VagabondNPCSheet,
    VagabondItemSheet,
    ProgressClockConfig,
    ProgressClockDeleteDialog,
    CountdownDiceConfig,
    DowntimeApp,
    VagabondMeasureTemplates,
    VagabondCharBuilder,
    EncounterSettings,
  },
  ui: {
    ProgressClockOverlay,
    CountdownDiceOverlay,
  },
  utils: {
    rollItemMacro,
    VagabondChatCard,
    VagabondDiceAppearance,
    EquipmentHelper,
    ContextMenuHelper,
    AccordionHelper,
    EnrichmentHelper,
  },
  models,
};

Hooks.once('init', async function () {
  console.log("Vagabond | Initializing System...");
  // Register game settings first to avoid preparation errors
  registerGameSettings();

  // Add custom constants for configuration.
  CONFIG.VAGABOND = VAGABOND;

  // Apply custom status effects based on game setting
  const statusEffectsMode = game.settings.get('vagabond', 'statusEffectsMode');
  if (statusEffectsMode === 'vagabond') {
    // Sort status effects alphabetically by localized name
    const sortedEffects = [...VAGABOND.statusEffectDefinitions].sort((a, b) => {
      const nameA = game.i18n.localize(a.name);
      const nameB = game.i18n.localize(b.name);
      return nameA.localeCompare(nameB);
    });
    CONFIG.statusEffects = sortedEffects;
    console.log('Vagabond | Using custom Vagabond status conditions (sorted alphabetically)');
  }
  // If 'foundry', do nothing - Foundry's defaults will remain active

  // Loads placeholder images for character sheets
  CONFIG.Actor.typeImages = VAGABOND.actorTypeImages;

  // Preload Handlebars templates (MUST complete before sheet registration)
  console.log("Vagabond | Preloading templates...");
  await preloadHandlebarsTemplates();
  console.log("Vagabond | Templates loaded successfully");

  /**
   * Set default initiative formula for the system
   * Note: PCs and NPCs use separate custom formulas from settings (see VagabondCombatant.getInitiativeRoll)
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    formula: game.settings.get('vagabond', 'initiativeFormula') || '1d20 + @dexterity.value + @awareness.value',
    decimals: 2,
  };

  // Define custom Document and DataModel classes
  CONFIG.Actor.documentClass = VagabondActor;

  // Define custom Combat classes
  console.log("Vagabond | Registering Combat classes...");
  CONFIG.Combat.documentClass = VagabondCombat;
  CONFIG.Combatant.documentClass = VagabondCombatant;

  // Modify CombatTracker in place (Lancer Initiative pattern)
  console.log("Vagabond | Modifying CombatTracker in place...");
  const CombatTracker = foundry.applications.sidebar.tabs.CombatTracker;

  // Store original methods we'll wrap
  const originalPrepareTrackerContext = CombatTracker.prototype._prepareTrackerContext;
  const originalGetEntryContextOptions = CombatTracker.prototype._getEntryContextOptions;
  const originalActivateListeners = CombatTracker.prototype.activateListeners;

  // Replace template
  console.log("Vagabond | Setting custom combat tracker template");
  CombatTracker.PARTS.tracker.template = "systems/vagabond/templates/sidebar/combat-tracker.hbs";

  // Add custom actions
  console.log("Vagabond | Adding custom combat tracker actions");
  Object.assign(CombatTracker.DEFAULT_OPTIONS.actions, {
    activate: VagabondCombatTracker.onActivate,
    deactivate: VagabondCombatTracker.onDeactivate,
    rollDetect: VagabondCombatTracker.onRollDetect
  });

  // Wrap _prepareTrackerContext (NOT _prepareContext!)
  console.log("Vagabond | Wrapping _prepareTrackerContext method");
  CombatTracker.prototype._prepareTrackerContext = async function(context, options) {
    return VagabondCombatTracker.prepareTrackerContext.call(this, originalPrepareTrackerContext, context, options);
  };

  // Wrap _getEntryContextOptions
  console.log("Vagabond | Wrapping _getEntryContextOptions method");
  CombatTracker.prototype._getEntryContextOptions = function() {
    return VagabondCombatTracker.getEntryContextOptions.call(this, originalGetEntryContextOptions);
  };

  // Wrap activateListeners
  console.log("Vagabond | Wrapping activateListeners method");
  CombatTracker.prototype.activateListeners = function(html) {
    return VagabondCombatTracker.activateListeners.call(this, originalActivateListeners, html);
  };

  console.log("Vagabond | Combat document class:", CONFIG.Combat.documentClass.name);
  console.log("Vagabond | Combatant document class:", CONFIG.Combatant.documentClass.name);
  console.log("Vagabond | Combat Tracker template:", CombatTracker.PARTS.tracker.template);
  console.log("Vagabond | Combat Tracker actions:", Object.keys(CombatTracker.DEFAULT_OPTIONS.actions));

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
    starterPack: models.VagabondStarterPack,
    container: models.VagabondContainerData,
  };

  globalThis.vagabond.managers = {
    templates: new VagabondMeasureTemplates()
  };

  // Register custom ActiveEffect document class
  CONFIG.ActiveEffect.documentClass = VagabondActiveEffect;

  // Register custom ActiveEffectConfig sheet
  const VagabondActiveEffectConfig = (await import('./applications/active-effect-config.mjs')).default;
  foundry.applications.apps.DocumentSheetConfig.registerSheet(ActiveEffect, 'vagabond', VagabondActiveEffectConfig, {
    makeDefault: true,
    label: 'VAGABOND.Effect.ConfigSheet'
  });

  // Active Effects are never copied to the Actor,
  // but will still apply to the Actor from within the Item
  // if the transfer property on the Active Effect is true.
  CONFIG.ActiveEffect.legacyTransferral = false;

  // Register sheet application classes
  collections.Actors.unregisterSheet('core', sheets.ActorSheet);

  // Register character sheet
  collections.Actors.registerSheet('vagabond', VagabondCharacterSheet, {
    types: ['character'],
    makeDefault: true,
    label: 'VAGABOND.SheetLabels.Character',
  });

  // Register NPC sheet
  collections.Actors.registerSheet('vagabond', VagabondNPCSheet, {
    types: ['npc'],
    makeDefault: true,
    label: 'VAGABOND.SheetLabels.NPC',
  });
  collections.Items.unregisterSheet('core', sheets.ItemSheet);
  collections.Items.registerSheet('vagabond', VagabondItemSheet, {
    makeDefault: true,
    label: 'VAGABOND.SheetLabels.Item',
  });
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

Handlebars.registerHelper('add', (a, b) => a + b);

Handlebars.registerHelper('gte', (a, b) => a >= b);

Handlebars.registerHelper('and', function () {
  const args = Array.prototype.slice.call(arguments, 0, -1);
  return args.every(Boolean);
});

Handlebars.registerHelper('or', function () {
  const args = Array.prototype.slice.call(arguments, 0, -1);
  return args.some(Boolean);
});

Handlebars.registerHelper('not', (a) => !a);

// Stringify object to JSON for textarea display
Handlebars.registerHelper('json', function(context) {
  if (context === undefined || context === null) return '';
  if (typeof context === 'string') return context;
  try {
    return JSON.stringify(context, null, 2);
  } catch (e) {
    console.warn('Failed to stringify JSON:', e);
    return '';
  }
});
/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once('ready', function () {
  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on('hotbarDrop', (bar, data, slot) => createDocMacro(data, slot));
});

// Register Dice So Nice colorsets when Dice So Nice is ready
Hooks.once('diceSoNiceReady', (dice3d) => {
  VagabondDiceAppearance.registerColorsets();
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

  // Verify Combat system registration
  console.log("Vagabond | System Ready - Verifying Combat registration:");
  console.log("  - CONFIG.Combat.documentClass:", CONFIG.Combat.documentClass?.name);
  console.log("  - CONFIG.Combatant.documentClass:", CONFIG.Combatant.documentClass?.name);
  console.log("  - ui.combat instance:", ui.combat?.constructor?.name);
  console.log("  - CombatTracker template:", foundry.applications.sidebar.tabs.CombatTracker.PARTS.tracker.template);

  // Check if methods are wrapped
  const hasCustomActions = 'activate' in foundry.applications.sidebar.tabs.CombatTracker.DEFAULT_OPTIONS.actions;
  console.log("  - Custom actions registered:", hasCustomActions);

  if (CONFIG.Combat.documentClass?.name === "VagabondCombat" &&
      CONFIG.Combatant.documentClass?.name === "VagabondCombatant" &&
      hasCustomActions) {
    console.log("Vagabond | Combat system successfully registered!");
  } else {
    console.warn("Vagabond | WARNING: Combat system not fully registered!");
  }
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
  // Add Vagabond control group (v13 uses object structure)
  controls.vagabond = {
    name: 'vagabond',
    title: 'Vagabond Tools',
    icon: 'fas fa-circle-v',
    layer: 'tokens',
    activeTool: 'select',
    tools: {
      select: {
        name: 'select',
        title: 'Select/Interact',
        icon: 'fas fa-expand',
        onChange: () => {} // Empty handler for default tool
      },
      createClock: {
        name: 'createClock',
        title: game.i18n.localize('VAGABOND.ProgressClock.SceneControls.Create'),
        icon: 'fas fa-chart-pie',
        button: true,
        onClick: async () => {
          try {
            const { ProgressClockConfig } = globalThis.vagabond.applications;
            const dialog = new ProgressClockConfig(null);
            await dialog.render(true);
          } catch (error) {
            ui.notifications.error("Failed to open clock config: " + error.message);
          }
        }
      },
      createCountdownDice: {
        name: 'createCountdownDice',
        title: game.i18n.localize('VAGABOND.CountdownDice.SceneControls.Create'),
        icon: 'fas fa-dice-six',
        button: true,
        onClick: async () => {
          try {
            const { CountdownDiceConfig } = globalThis.vagabond.applications;
            const dialog = new CountdownDiceConfig(null);
            await dialog.render(true);
          } catch (error) {
            ui.notifications.error("Failed to open countdown dice config: " + error.message);
          }
        }
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

/* -------------------------------------------- */
/*  Item Creation Hooks                         */
/* -------------------------------------------- */

// Ensure new inventory items get proper gridPosition
Hooks.on('preCreateItem', (item, data, options, userId) => {
  // Only handle inventory items
  const isInventoryItem = ['equipment', 'weapon', 'armor', 'gear', 'container'].includes(item.type);
  if (!isInventoryItem) return;

  // If gridPosition not set, assign next available position
  if (item.system.gridPosition === undefined || item.system.gridPosition === null) {
    const actor = item.parent;
    if (actor) {
      // Find max gridPosition of existing items
      const existingItems = actor.items.filter(i =>
        ['equipment', 'weapon', 'armor', 'gear', 'container'].includes(i.type)
      );

      const maxPosition = existingItems.reduce((max, i) => {
        const pos = i.system.gridPosition ?? 0;
        return Math.max(max, pos);
      }, -1);

      // Assign next position
      item.updateSource({ 'system.gridPosition': maxPosition + 1 });
    }
  }
});

/**
 * V13 Standard: 'renderChatMessageHTML' hook.
 * The 'html' argument is a standard HTMLElement.
 */
Hooks.on('renderChatMessageHTML', (message, html) => {
  // Safety check: ensure html is a valid element
  if (!html || typeof html.querySelectorAll !== 'function') {
    return;
  }

  // ---------------------------------------------------------
  // 1. Accordion Toggle Handler (Properties)
  // ---------------------------------------------------------
  // 1. Accordion Toggle Handler (Properties)
  // Handles triggers whether they are inside or outside the container
  const propertyToggles = html.querySelectorAll('[data-action="toggleProperties"]');

  propertyToggles.forEach(toggle => {
    toggle.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      const trigger = ev.currentTarget;
      let container = null;

      // Strategy A: Is the trigger directly inside the box? (Old style)
      if (trigger.closest('.metadata-item-expandable')) {
          container = trigger.closest('.metadata-item-expandable');
      } 
      // Strategy B: Trigger is in Header -> Find the box inside the main card
      else {
          const card = trigger.closest('.vagabond-chat-card-v2');
          if (card) {
              container = card.querySelector('.metadata-item-expandable');
          }
      }

      if (container) {
        container.classList.toggle('expanded');
      }
    });
  });

  // ---------------------------------------------------------
  // 2. Accordion Toggle Handler (Defend Info) - FIXED
  // Replaced jQuery .find() with native .querySelectorAll()
  // ---------------------------------------------------------
  const defendToggles = html.querySelectorAll('.defend-header');

  defendToggles.forEach(toggle => {
    toggle.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      const header = ev.currentTarget;
      const box = header.closest('.defend-info-box');

      if (box) {
        box.classList.toggle('expanded');
      }
    });
  });

  // ---------------------------------------------------------
  // 3. Damage Roll Button Handler
  // ---------------------------------------------------------
  const damageButtons = html.querySelectorAll('.vagabond-damage-button');

  damageButtons.forEach(button => {
    button.addEventListener('click', (ev) => {
      ev.preventDefault();
      // Disable immediately to prevent double-clicks
      button.disabled = true;

      import('./helpers/damage-helper.mjs').then(({ VagabondDamageHelper }) => {
        VagabondDamageHelper.rollDamageFromButton(button, message.id);
      });
    });
  });

  // ---------------------------------------------------------
  // 4. Save Button Handler (Roll to Save)
  // ---------------------------------------------------------
  const saveButtons = html.querySelectorAll('.vagabond-save-button');

  saveButtons.forEach(button => {
    button.addEventListener('click', (ev) => {
      ev.preventDefault();
      import('./helpers/damage-helper.mjs').then(({ VagabondDamageHelper }) => {
        VagabondDamageHelper.handleSaveRoll(button, ev);
      });
    });
  });

  // ---------------------------------------------------------
  // 4b. Save Reminder Button Handler (Roll Save Without Damage)
  // ---------------------------------------------------------
  const saveReminderButtons = html.querySelectorAll('.vagabond-save-reminder-button');

  saveReminderButtons.forEach(button => {
    button.addEventListener('click', (ev) => {
      ev.preventDefault();
      import('./helpers/damage-helper.mjs').then(({ VagabondDamageHelper }) => {
        VagabondDamageHelper.handleSaveReminderRoll(button, ev);
      });
    });
  });

  // ---------------------------------------------------------
  // 5. Apply Direct Damage Button Handler
  // ---------------------------------------------------------
  const applyDirectButtons = html.querySelectorAll('.vagabond-apply-direct-button');

  applyDirectButtons.forEach(button => {
    button.addEventListener('click', (ev) => {
      ev.preventDefault();
      import('./helpers/damage-helper.mjs').then(({ VagabondDamageHelper }) => {
        VagabondDamageHelper.handleApplyDirect(button);
      });
    });
  });

  // ---------------------------------------------------------
  // 6. Apply Restorative Effects Button Handlers
  // ---------------------------------------------------------
  const healingButtons = html.querySelectorAll('.vagabond-apply-healing-button');
  const recoverButtons = html.querySelectorAll('.vagabond-apply-recover-button');
  const rechargeButtons = html.querySelectorAll('.vagabond-apply-recharge-button');

  healingButtons.forEach(button => {
    button.addEventListener('click', (ev) => {
      ev.preventDefault();
      import('./helpers/damage-helper.mjs').then(({ VagabondDamageHelper }) => {
        VagabondDamageHelper.handleApplyRestorative(button);
      });
    });
  });

  recoverButtons.forEach(button => {
    button.addEventListener('click', (ev) => {
      ev.preventDefault();
      import('./helpers/damage-helper.mjs').then(({ VagabondDamageHelper }) => {
        VagabondDamageHelper.handleApplyRestorative(button);
      });
    });
  });

  rechargeButtons.forEach(button => {
    button.addEventListener('click', (ev) => {
      ev.preventDefault();
      import('./helpers/damage-helper.mjs').then(({ VagabondDamageHelper }) => {
        VagabondDamageHelper.handleApplyRestorative(button);
      });
    });
  });

  // ---------------------------------------------------------
  // 7. Countdown Dice Trigger Handler (Chat Card Descriptions)
  // ---------------------------------------------------------
  const countdownTriggers = html.querySelectorAll('.countdown-dice-trigger');

  countdownTriggers.forEach(trigger => {
    trigger.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      // Extract dice type from data attribute
      let diceType = trigger.dataset.diceType || trigger.dataset.diceSize;

      // If we got just a number (from data-dice-size), add the "d" prefix
      if (diceType && !diceType.startsWith('d')) {
        diceType = 'd' + diceType;
      }

      if (!diceType) return;

      // Validate dice type
      const validDiceTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
      if (!validDiceTypes.includes(diceType)) {
        console.warn(`Invalid dice type for countdown: ${diceType}`);
        return;
      }

      // Get spell/item name from message flags or use a default
      const itemId = message.flags?.vagabond?.itemId;
      let name = 'Countdown';

      if (itemId) {
        const actorId = message.flags?.vagabond?.actorId;
        const actor = game.actors.get(actorId);
        if (actor) {
          const item = actor.items.get(itemId);
          if (item) {
            name = item.name;
          }
        }
      }

      // Create countdown dice
      const { CountdownDice } = globalThis.vagabond.documents;
      await CountdownDice.create({
        name: name,
        diceType: diceType,
        size: 'S', // Small size
      });
    });
  });

  // ---------------------------------------------------------
  // 8. [REMOVED] Favor/Hinder Dice Styling
  // This logic is now handled server-side in chat-card.mjs
  // (formatRollWithDice) and styled via CSS classes.
  // ---------------------------------------------------------

  // ---------------------------------------------------------
  // 9. NPC Damage Button Handler (GM Only)
  // ---------------------------------------------------------
  const npcButtons = html.querySelectorAll('.vagabond-npc-damage-button');

  npcButtons.forEach(button => {
    button.addEventListener('click', (ev) => {
      ev.preventDefault();
      import('./helpers/damage-helper.mjs').then(({ VagabondDamageHelper }) => {
        VagabondDamageHelper.handleNPCDamageButton(button, message.id);
      });
    });
  });

  // ---------------------------------------------------------
  // 9.5 Item Damage Button Handler (for healing potions, bombs, etc)
  // ---------------------------------------------------------
  const itemButtons = html.querySelectorAll('.vagabond-item-damage-button');

  itemButtons.forEach(button => {
    button.addEventListener('click', (ev) => {
      ev.preventDefault();
      import('./helpers/damage-helper.mjs').then(({ VagabondDamageHelper }) => {
        VagabondDamageHelper.handleItemDamageButton(button, message.id);
      });
    });
  });

  // ---------------------------------------------------------
  // 10. Apply Save Damage Button Handler
  // ---------------------------------------------------------
  const applySaveButtons = html.querySelectorAll('.vagabond-apply-save-damage-button');

  applySaveButtons.forEach(button => {
    button.addEventListener('click', (ev) => {
      ev.preventDefault();
      import('./helpers/damage-helper.mjs').then(({ VagabondDamageHelper }) => {
        VagabondDamageHelper.handleApplySaveDamage(button);
      });
    });
  });

  // ---------------------------------------------------------
  // 10. Template Trigger Handler
  // ---------------------------------------------------------
  const templateTriggers = html.querySelectorAll('.template-trigger');

  templateTriggers.forEach(trigger => {
    trigger.addEventListener('click', async (ev) => {
      ev.preventDefault();

      const deliveryType = trigger.dataset.deliveryType;
      const deliveryText = trigger.dataset.deliveryText;

      if (!deliveryType) return;

      // Call the template manager to create the template from chat
      if (globalThis.vagabond?.managers?.templates) {
        await globalThis.vagabond.managers.templates.fromChat(deliveryType, deliveryText, message);
      } else {
        console.warn("VagabondSystem | Template manager not found.");
      }
    });
  });

  // ---------------------------------------------------------
  // 11. Target Token Click Handler (Ping & Pan)
  // ---------------------------------------------------------
  const targetTokens = html.querySelectorAll('.target-token');

  targetTokens.forEach(targetElement => {
    targetElement.addEventListener('click', async (ev) => {
      ev.preventDefault();

      const tokenId = targetElement.dataset.tokenId;
      const sceneId = targetElement.dataset.sceneId;

      if (!tokenId || !sceneId) return;

      // Check if target is on a different scene
      if (sceneId !== canvas.scene?.id) {
        ui.notifications.warn('Target is on a different scene. Switching scenes...');
        const scene = game.scenes.get(sceneId);
        if (scene) {
          await scene.view();
          // Wait a moment for scene to load
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          ui.notifications.error('Target scene not found.');
          return;
        }
      }

      // Get the token on the current scene
      const token = canvas.tokens.get(tokenId);
      if (!token) {
        ui.notifications.warn('Target token not found on scene.');
        return;
      }

      // Pan to token
      await canvas.animatePan({
        x: token.center.x,
        y: token.center.y,
        duration: 250
      });

      // Ping the token location
      canvas.ping(token.center, {
        style: canvas.grid.type === 0 ? 'pulse' : 'alert',
        color: game.user.color
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
/* Vagabond System - Secure Content Manager     */
/* -------------------------------------------- */

const SYSTEM_ID = "vagabond";
const SETTING_KEY = "contentUnlocked";

/* -------------------------------------------- */
/* CHALLENGE DATABASE (Base64 Method)           */
/* -------------------------------------------- */
const CHALLENGES = [
  {
    "id": "x7k9p", // Answer: ruin
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGNhdXNlcyB5b3UgdG8gbG9zZSBhbGwgbGFuZCwgcG9zc2Vzc2lvbnMsIGFuZCB3ZWFsdGg/",
    "h": ["cnVpbg=="] 
  },
  {
    "id": "m2j4q", // Answer: fool
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIG1ha2VzIHlvdSBsb3NlIDEgTGV2ZWwgYW5kIGRyYXcgYW5vdGhlciBjYXJkPw==",
    "h": ["Zm9vbA=="]
  },
  {
    "id": "b5v8n", // Answer: rogue
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGNhdXNlcyBhIGZyaWVuZCB0byBwZXJtYW5lbnRseSBoYXRlIHlvdT8=",
    "h": ["cm9ndWU="]
  },
  {
    "id": "w9c1r", // Answer: flames
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGNyZWF0ZXMgYSBwb3dlcmZ1bCBIZWxsc3Bhd24gZW5lbXk/",
    "h": ["ZmxhbWVz"]
  },
  {
    "id": "q3z6l", // Answer: key
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGdyYW50cyB5b3UgYSBGYWJsZWQgUmVsaWMgb2YgeW91ciBjaG9pY2U/",
    "h": ["a2V5"]
  },
  {
    "id": "p0o5t", // Answer: knight
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGdyYW50cyB0aGUgc2VydmljZSBvZiBhbiBBbGx5IGNoYW1waW9uIGNvbXBhbmlvbj8=",
    "h": ["a25pZ2h0"]
  },
  {
    "id": "y2x4u", // Answer: idiot
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGRlY3JlYXNlcyB5b3VyIFJlYXNvbiBieSBkNj8=",
    "h": ["aWRpb3Q="]
  },
  {
    "id": "r8n1s", // Answer: comet
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIHJlcXVpcmVzIHlvdSB0byBkZWZlYXQgdGhlIG5leHQgRW5lbXkgYWxvbmUgdG8gZ2FpbiBhIExldmVsPw==",
    "h": ["Y29tZXQ="]
  },
  {
    "id": "k6m3d", // Answer: jester
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGdyYW50cyB5b3UgMSBMZXZlbCBvciBsZXRzIHlvdSBkcmF3IHR3byBjYXJkcz8=",
    "h": ["amVzdGVy"]
  },
  {
    "id": "g4h7j", // Answer: omlarcat
    "q": "SW4gdGhlIHJlbGljIENsb2FrIG9mIERpc3BsYWNlbWVudCB3aGF0IGNyZWF0dXJlJ3MgZnVyIGlzIHRoZSBjb2F0IG1hZGUgZnJvbT8=",
    "h": ["b21sYXJjYXQ="]
  },
  {
    "id": "l9k2p", // Answer: darksight
    "q": "SW4gdGhlIHJlbGljIEJsYWNrIFdpbmcgd2hhdCB2aXNpb24gYWJpbGl0eSBkb2VzIGl0IGdyYW50IHdoaWxlIGVxdWlwcGVkPw==",
    "h": ["ZGFya3NpZ2h0"]
  },
  {
    "id": "v1f5c", // Answer: balance
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGluY3JlYXNlcyB0aGUgYm9udXMgb2YgdGhyZWUgUmVsaWNzIGJ5IDE/",
    "h": ["YmFsYW5jZQ=="]
  },
  {
    "id": "d3s9a", // Answer: moon
    "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGdyYW50cyB0aHJlZSB3aXNoZXMgdGhhdCBtdXN0IGJlIG1hZGUgd2l0aGluIDEwIG1pbnV0ZXM/",
    "h": ["bW9vbg=="]
  }
];

/* -------------------------------------------- */
/* Initialization & Settings                   */
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
/* UI Interaction (Compendium Directory)       */
/* -------------------------------------------- */

Hooks.on('renderCompendiumDirectory', (app, html, data) => {
  const isUnlocked = game.settings.get(SYSTEM_ID, SETTING_KEY);
  const directoryElement = html instanceof HTMLElement ? html : html[0];
  
  if (isUnlocked) {
    const existingBtn = directoryElement.querySelector('#vagabond-unlock-btn');
    if (existingBtn) existingBtn.remove();
    return; 
  }

  // Hide Packs
  game.packs.forEach(pack => {
    if (pack.metadata.packageName === SYSTEM_ID) {
      const packElement = directoryElement.querySelector(`[data-pack="${pack.collection}"]`);
      if (packElement) packElement.remove();
    }
  });

  // Cleanup folders
  directoryElement.querySelectorAll('.directory-group').forEach(dir => {
    const list = dir.querySelector('ol');
    if (list && list.children.length === 0) dir.style.display = 'none';
  });

  // Inject Button
  if (!directoryElement.querySelector('#vagabond-unlock-btn')) {
    const unlockBtn = document.createElement("button");
    unlockBtn.id = "vagabond-unlock-btn";
    unlockBtn.innerHTML = `<i class="fas fa-key"></i> Unlock System Content`;
    unlockBtn.style.cssText = `
      width: 96%; margin: 10px 2%; padding: 8px;
      background: #222; color: #fff; border: 1px solid #444;
      cursor: pointer; font-family: monospace; text-transform: uppercase;
    `;
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
/* Logic & Dialogs (BASE64 METHOD)             */
/* -------------------------------------------- */

async function promptRandomChallenge() {
  if (CHALLENGES.length === 0) {
    ui.notifications.warn("No challenges configured.");
    return;
  }

  const challenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
  const questionText = decodeURIComponent(escape(window.atob(challenge.q)));
  
  const { DialogV2 } = foundry.applications.api;

  const userResponse = await DialogV2.wait({
    window: { 
        title: "Security Check",
        icon: "fas fa-user-secret"
    },
    content: `
      <div style="text-align: center; padding: 10px;">
        <h5 style="font-weight: bold; margin-bottom: 10px;">${questionText}</h5>
        <p style="margin-bottom: 10px;">One word answer:</p>
        <div class="form-group">
            <input type="password" name="unlock-attempt" id="secret-attempt" placeholder="Answer..." style="text-align: center; width: 100%;" autofocus>
        </div>
      </div>
    `,
    buttons: [{
      action: "submit",
      label: "Verify",
      icon: "fas fa-check",
      callback: (event, button, dialog) => {
        return dialog.element.querySelector('#secret-attempt').value;
      }
    }],
    submit: (result) => {
        return result["unlock-attempt"]; 
    },
    close: () => { return null; }
  });

  if (!userResponse) return;

  const cleanInput = userResponse.trim().toLowerCase();

  // -- MASTER OVERRIDE --
  if (cleanInput === "vagabond_override") {
      ui.notifications.info("Master Key Accepted.");
      await game.settings.set(SYSTEM_ID, SETTING_KEY, true);
      ui.sidebar.render();
      return;
  }
  
  // -- BASE64 CONVERSION --
  // This uses standard browser encoding. It is consistent everywhere.
  const encodedAttempt = window.btoa(cleanInput);

  if (challenge.h.includes(encodedAttempt)) {
    ui.notifications.info("Access Granted.");
    await game.settings.set(SYSTEM_ID, SETTING_KEY, true);
    ui.sidebar.render(); 
  } else {
    ui.notifications.error("Access Denied.");
  }
}