// Import document classes.
import { VagabondActor } from './documents/actor.mjs';
import { VagabondItem } from './documents/item.mjs';
import { VagabondCombat } from './documents/combat.mjs';
import { VagabondCombatant } from './documents/combatant.mjs';
import { VagabondActiveEffect } from './documents/active-effect.mjs';
import VagabondActiveEffectData from './data/active-effect-data.mjs';
import { ProgressClock } from './documents/progress-clock.mjs';
import { CountdownDice } from './documents/countdown-dice.mjs';
// Import sheet classes.
import {
  VagabondActorSheet,
  VagabondCharacterSheet,
  VagabondNPCSheet,
  VagabondPartySheet,
  VagabondConstructSheet,
  VagabondShopSheet,
} from './sheets/_module.mjs';
import { VagabondItemSheet } from './sheets/item-sheet.mjs';
// Import helper/utility classes and constants.
import { VAGABOND } from './helpers/config.mjs';
import { loadHomebrewConfig, applyRuntimeHomebrewOverrides, applyTermOverrides } from './helpers/homebrew-config.mjs';
import { loadJB2ADefaults } from './helpers/sequencer-config.mjs';
import { VagabondChatCard } from './helpers/chat-card.mjs';
import { VagabondDiceAppearance } from './helpers/dice-appearance.mjs';
import { EquipmentHelper } from './helpers/equipment-helper.mjs';
import { NpcSenses } from './helpers/npc-senses.mjs';
import { NpcFlying } from './helpers/npc-flying.mjs';
import { ContextMenuHelper } from './helpers/context-menu-helper.mjs';
import { AccordionHelper } from './helpers/accordion-helper.mjs';
import { EnrichmentHelper } from './helpers/enrichment-helper.mjs';
import { TargetHelper } from './helpers/target-helper.mjs';
// Import DataModel classes
import * as models from './data/_module.mjs';
// Import UI classes
import { ProgressClockOverlay } from './ui/progress-clock-overlay.mjs';
import { CountdownDiceOverlay } from './ui/countdown-dice-overlay.mjs';
import { TokenStatusPanel } from './ui/token-status-panel.mjs';
// Import application classes
import { ProgressClockConfig } from './applications/progress-clock-config.mjs';
import { ProgressClockDeleteDialog } from './applications/progress-clock-delete-dialog.mjs';
import { CountdownDiceConfig } from './applications/countdown-dice-config.mjs';
import { DowntimeApp } from './applications/downtime-app.mjs';
import { HomebrewSettingsApp } from './applications/homebrew-settings-app.mjs';
import { VagabondMeasureTemplates } from './applications/measure-templates.mjs';
import { RegionTextureOverlay } from './ui/region-texture-overlay.mjs';
import { GlyphOverlay } from './ui/glyph-overlay.mjs';
import { VagabondCharBuilder } from './applications/char-builder/index.mjs';
import { VagabondCombatTracker } from './ui/combat-tracker.mjs';
import { CombatCarousel } from './applications/combat-carousel.mjs';
import { VagabondSettingsHub, hubMenu } from './applications/settings-hub.mjs';
import { registerGameSettings } from './settings/register-settings.mjs';
import { LevelUpDialog } from './applications/level-up-dialog.mjs';
import { PartyCompactView } from './applications/party-compact-view.mjs';
import { OngoingPanel } from './applications/ongoing-panel.mjs';
import { VagabondCharacterHud } from './applications/character-hud.mjs';
import { VagabondNPCHud } from './applications/npc-hud.mjs';
import { isItemPile } from './helpers/hud-display.mjs';
import VagabondActiveEffectConfig from './applications/active-effect-config.mjs';
import { VagabondSpellSequencer } from './helpers/spell-sequencer.mjs';
import { ConeFx } from './helpers/cone-fx.mjs';
import { VagabondFXResolver } from './helpers/fx-file-resolver.mjs';
import { registerSocket, emitSocket, registerSocketAction } from './helpers/socket-helper.mjs';
import { runMacroFromButton, executeItemMacro, registerMacroHandler, registerCastGate, registerMacroQueries, macroDescriptorFromButton } from './helpers/item-macro.mjs';
import { MacroAutoRun } from './helpers/macro-autorun.mjs';
import { AnimationBridge } from './helpers/animation-bridge.mjs';
import { AAMenuLoader } from './helpers/aa-menu-loader.mjs';
import { SpellFxPresets } from './helpers/spell-fx-presets.mjs';
import { FocusLink } from './helpers/focus-link.mjs';
import { FeatureAction } from './helpers/feature-action.mjs';
import { RollExpiry } from './helpers/roll-expiry.mjs';
import { LightSource } from './helpers/light-source.mjs';
import { registerCanvasLootChat } from './helpers/canvas-loot-chat.mjs';
import { VagabondDamageHelper } from './helpers/damage-helper.mjs';
import { VagabondDamagePipeline } from './helpers/damage-pipeline.mjs';
import { StatusHelper } from './helpers/status-helper.mjs';
import { RageHelper } from './helpers/rage-helper.mjs';
import { NpcRules } from './helpers/npc-rules.mjs';
import { AlchemyHelper } from './helpers/crafting/alchemy-helper.mjs';
import { BardHelper } from './helpers/bard-helper.mjs';
import { DancerHelper } from './helpers/dancer-helper.mjs';
import { FighterHelper } from './helpers/fighter-helper.mjs';
import { GunslingerHelper } from './helpers/gunslinger-helper.mjs';
import { HunterHelper } from './helpers/hunter-helper.mjs';
import { SpellTrackerHelper } from './helpers/spell-tracker-helper.mjs';
import { RaiseHelper } from './helpers/raise-helper.mjs';
import { ConjureHelper } from './helpers/conjure-helper.mjs';
import { SystemFolders } from './helpers/system-folders.mjs';
import { PartyNotes } from './helpers/party-notes.mjs';
import { SpellSurface } from './helpers/spell-surface.mjs';
import { PugilistHelper } from './helpers/pugilist-helper.mjs';
import { DefenseHelper } from './helpers/defense-helper.mjs';
import { FocusUpkeep } from './helpers/focus-upkeep.mjs';
import { RevelatorHelper } from './helpers/revelator-helper.mjs';
import { RogueHelper } from './helpers/rogue-helper.mjs';
import { SorcererHelper } from './helpers/sorcerer-helper.mjs';
import { WitchHelper } from './helpers/witch-helper.mjs';
import { WizardHelper } from './helpers/wizard-helper.mjs';
import { DruidHelper } from './helpers/druid-helper.mjs';
import { migrateFighterClass, migrateDruidClass, migrateGunslingerClass, migrateHunterClass, migrateLuminaryClass, migrateMagusClass, migrateMerchantClass, migratePugilistClass, migrateRevelatorClass, migrateRogueClass, migrateSorcererClass, migrateVanguardClass, migrateWitchClass, migrateWizardClass, migrateAncestries } from './helpers/class-migrations.mjs';
import { migrateAlpha3Statuses, migrateAlpha3Backpacks, migrateAlpha3Rations, migrateAlpha3DefensePerks, migrateAlpha3ClassPerks, migrateAlpha3Perks, migrateAlpha3Classes, migrateAlpha3Ancestries, migrateClassFeatureScaleKeys, migrateClassFeatureActions, migrateClassFeatureEffects, migrateLifeNoFreeDie, migrateVehementMagic } from './helpers/alpha3-migrations.mjs';
import { consumeUsedEffects } from './helpers/use-effects.mjs';
import { VagabondRollBuilder } from './helpers/roll-builder.mjs';
import { CurrencyHelper } from './helpers/currency-helper.mjs';
import { ShopPricing } from './helpers/shop-pricing.mjs';
import { ShopTransactions } from './helpers/shop-transactions.mjs';
import { TradeHelper } from './helpers/trade-helper.mjs';
import { MaterialsHelper } from './helpers/materials-helper.mjs';
import { ItemNameTokens } from './helpers/item-name-tokens.mjs';
import { TokenPortrait } from './helpers/token-portrait.mjs';
import { CoinTransferDialog } from './applications/coin-transfer-dialog.mjs';
import { ShopApp } from './applications/shop-app.mjs';
import { CraftingHelper } from './helpers/crafting-helper.mjs';
import { RelicHelper } from './helpers/relic-helper.mjs';
import { ItemDisguise } from './helpers/item-disguise.mjs';
import { ItemDisguiseApp } from './applications/item-disguise-app.mjs';
import { CrystalHelper } from './helpers/crystal-helper.mjs';
import { WorkbenchApp } from './applications/workbench-app.mjs';
import { AlchemyLab } from './helpers/alchemy-lab.mjs';
import { VagabondTokenRingShader, installStatusRingEffects, STATUS_RING_EFFECTS } from './ui/effects/index.mjs';
import { registerChatMessageHooks } from './hooks/chat-message-hooks.mjs';
import { registerPartyTokenHudHooks } from './hooks/party-token-hud.mjs';
import { registerTokenRingHooks } from './hooks/token-ring-hooks.mjs';
import { registerContentUnlock } from './hooks/content-unlock.mjs';
import { registerActiveEffectConfigHooks } from './hooks/active-effect-config-hooks.mjs';
import { registerVehicleCrewHooks } from './hooks/vehicle-crew-hooks.mjs';
import { registerChatContextMenu } from './hooks/chat-context-menu.mjs';
import { registerFlankingHooks } from './hooks/flanking-hooks.mjs';
import { registerShopTokenHooks } from './hooks/shop-token-hooks.mjs';
import { registerFocusStatusHooks } from './hooks/focus-status-hooks.mjs';
import { registerDeadTokenMarker } from './hooks/dead-token-marker.mjs';
import { registerOverlayHooks } from './hooks/overlay-hooks.mjs';
import { registerUiPanelHooks } from './hooks/ui-panel-hooks.mjs';
import { registerSceneControls } from './hooks/scene-controls.mjs';
import { registerSocketActions } from './hooks/socket-actions.mjs';
import { registerReadyStartup } from './hooks/ready-startup.mjs';
import { isActiveGM } from './helpers/gm-relay.mjs';

const collections = foundry.documents.collections;
const sheets = foundry.applications.sheets;


/* -------------------------------------------- */
/*  Keybindings                                 */
/* -------------------------------------------- */

/**
 * Register combat-navigation keybindings. Rebindable via Foundry's
 * Configure Controls menu (Vagabond category). Default handlers call
 * document methods directly — same navigation the Combat Carousel /
 * sidebar tracker buttons use — so permission checks are Foundry's own.
 */
function registerKeybindings() {
  game.keybindings.register('vagabond', 'combatPreviousTurn', {
    name: 'VAGABOND.Keybindings.combatPreviousTurn.name',
    hint: 'VAGABOND.Keybindings.combatPreviousTurn.hint',
    editable: [{ key: 'ArrowLeft', modifiers: ['Control'] }],
    onDown: () => { game.combat?.previousTurn(); return true; },
    restricted: true,
  });

  game.keybindings.register('vagabond', 'combatNextTurn', {
    name: 'VAGABOND.Keybindings.combatNextTurn.name',
    hint: 'VAGABOND.Keybindings.combatNextTurn.hint',
    editable: [{ key: 'ArrowRight', modifiers: ['Control'] }],
    onDown: () => { game.combat?.nextTurn(); return true; },
    restricted: true,
  });

  game.keybindings.register('vagabond', 'combatPreviousRound', {
    name: 'VAGABOND.Keybindings.combatPreviousRound.name',
    hint: 'VAGABOND.Keybindings.combatPreviousRound.hint',
    editable: [{ key: 'ArrowLeft', modifiers: ['Control', 'Alt'] }],
    onDown: () => { game.combat?.previousRound(); return true; },
    restricted: true,
  });

  game.keybindings.register('vagabond', 'combatNextRound', {
    name: 'VAGABOND.Keybindings.combatNextRound.name',
    hint: 'VAGABOND.Keybindings.combatNextRound.hint',
    editable: [{ key: 'ArrowRight', modifiers: ['Control', 'Alt'] }],
    onDown: () => { game.combat?.nextRound(); return true; },
    restricted: true,
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
    // Char builder partials
    'systems/vagabond/templates/apps/char-builder-parts/training-panel.hbs',
    'systems/vagabond/templates/apps/char-builder-parts/item-choices.hbs',
    'systems/vagabond/templates/apps/char-builder-parts/training-skills.hbs',
    // Item partials
    'systems/vagabond/templates/item/parts/grants-config.hbs',
    'systems/vagabond/templates/item/parts/macro-config.hbs',
    'systems/vagabond/templates/item/parts/relic-slots.hbs',
    'systems/vagabond/templates/item/parts/locked-fx-entry.hbs',
    'systems/vagabond/templates/item/parts/container-treasure.hbs',
    'systems/vagabond/templates/actor/parts/npc-macro-config.hbs',
    // Actor partials
    'systems/vagabond/templates/actor/parts/inventory-card.hbs',
    'systems/vagabond/templates/actor/parts/effects-list.hbs',
    'systems/vagabond/templates/actor/parts/alchemy-lab.hbs',
    'systems/vagabond/templates/actor/parts/alchemy-picker.hbs',
    // Party sheet partials
    'systems/vagabond/templates/party/party-member-card.hbs',
    'systems/vagabond/templates/party/party-npc-card.hbs',
    'systems/vagabond/templates/party/vehicle-part-card.hbs',
    'systems/vagabond/templates/party/party-compact-view.hbs',
    'systems/vagabond/templates/party/notes-tab.hbs',
    'systems/vagabond/templates/party/notes-right.hbs',
    'systems/vagabond/templates/shop/shop-tabs.hbs',
    // Construct sheet partials
    'systems/vagabond/templates/construct/construct-tab.hbs',
    'systems/vagabond/templates/construct/construct-part-card.hbs',
    //Chat cards
    'systems/vagabond/templates/chat/damage-display.hbs',
    // Ongoing panel
    'systems/vagabond/templates/apps/ongoing-panel.hbs',
    // Character HUD
    'systems/vagabond/templates/apps/character-hud.hbs',
    // NPC HUD
    'systems/vagabond/templates/apps/npc-hud.hbs',
    // Combat Carousel
    'systems/vagabond/templates/apps/combat-carousel.hbs',
    // Spell cast dialog
    'systems/vagabond/templates/apps/spell-cast-dialog.hbs',
    // Shared partials
    'systems/vagabond/templates/shared/permission-matrix.hbs',
  ];

  // Load standard partials
  await foundry.applications.handlebars.loadTemplates(templatePaths);

  // Manually register character builder partials with simple names
  const builderParts = {
    'navigation': 'systems/vagabond/templates/apps/char-builder-parts/navigation.hbs',
    'sidebar': 'systems/vagabond/templates/apps/char-builder-parts/sidebar.hbs',
    'tray': 'systems/vagabond/templates/apps/char-builder-parts/tray.hbs',
    'preview': 'systems/vagabond/templates/apps/char-builder-parts/preview.hbs',
    'reference': 'systems/vagabond/templates/apps/char-builder-parts/reference.hbs',
    'footer': 'systems/vagabond/templates/apps/char-builder-parts/footer.hbs',
    'guide-stage': 'systems/vagabond/templates/apps/char-builder-parts/guide-stage.hbs'
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
    VagabondSettingsHub,
    // Back-compat: `new EncounterSettings().render(true)` opens the hub on Combat & Encounters.
    EncounterSettings: hubMenu('combat'),
    HomebrewSettingsApp,
    LevelUpDialog,
    PartyCompactView,
    OngoingPanel,
    VagabondCharacterHud,
    VagabondNPCHud,
    CombatCarousel,
    ShopApp,
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

Hooks.once('init', function () {
  // Register game settings first to avoid preparation errors
  registerGameSettings({
    refreshClockDependents: () => _refreshClockDependents(),
    applyTokenEffectVisibility: () => _applyTokenEffectVisibility(),
  });

  // Register combat-navigation keybindings (Configure Controls > Vagabond)
  registerKeybindings();

  // Add custom constants for configuration.
  CONFIG.VAGABOND = VAGABOND;

  // Wire the custom status-driven dynamic-ring effects (Focusing, Burning, Sickened, Charmed),
  // unless the GM disabled them to leave rings free for other animation modules.
  if ( game.settings.get('vagabond', 'statusRingEffects') ) installStatusRingEffects();

  // Sync stored spell-region settings into CONFIG.VAGABOND so the texture overlay
  // (CONFIG-driven) reflects them. Must run after CONFIG.VAGABOND is assigned.
  for (const key of ['regionTextureHideFill', 'regionTextureBlendMode',
    'regionTextureAnimate', 'regionTextureSpinSpeed', 'regionTextureScrollSpeed']) {
    CONFIG.VAGABOND[key] = game.settings.get('vagabond', key);
  }
  // Border + alpha are GM-default-with-player-override: resolve the effective values.
  RegionTextureOverlay.applyPreferences();

  // Load homebrew config and store at CONFIG.VAGABOND.homebrew.
  // Must run before DataModel registration so schemas can read homebrew values.
  loadHomebrewConfig();

  // Apply custom status effects based on game setting
  const statusEffectsMode = game.settings.get('vagabond', 'statusEffectsMode');
  if (statusEffectsMode === 'vagabond' || statusEffectsMode === 'vagabondBook') {
    // Shrunk: weapon damage dice one size smaller for every homebrew weapon skill
    const shrunk = VAGABOND.statusEffectDefinitions.find(s => s.id === 'shrunk');
    for (const skill of (CONFIG.VAGABOND.homebrew?.skills ?? []).filter(s => s.isWeaponSkill)) {
      const key = `system.${skill.key}DamageDieSizeBonus`;
      if (shrunk && !shrunk.changes.some(c => c.key === key)) shrunk.changes.push({ key, type: 'add', value: '-2' });
    }

    // Book Statuses first, then Trackers, each alphabetical by localized name (the token HUD
    // shows them under two headings). 'vagabondBook' keeps the Trackers registered for automation
    // but hides them from the HUD (`hud: false`).
    const isTracker = (s) => !VAGABOND.bookStatusIds.has(s.id);
    const sortedEffects = VAGABOND.statusEffectDefinitions
      .map(s => (statusEffectsMode === 'vagabondBook' && isTracker(s) ? { ...s, hud: false } : s))
      .sort((a, b) => (isTracker(a) - isTracker(b))
        || game.i18n.localize(a.name).localeCompare(game.i18n.localize(b.name)));
    CONFIG.statusEffects = sortedEffects;

    // Point Foundry's special statuses at ours (core defaults are 'blind' / 'fly').
    // Blinded cuts the token's sight-type vision; Flying hides it from Feel Tremor.
    CONFIG.specialStatusEffects.BLIND = 'blinded';
    CONFIG.specialStatusEffects.FLY = 'flying';
  }
  // If 'foundry', do nothing - Foundry's defaults will remain active

  // Custom detection modes for NPC senses. Same detection as Sense All, but they respect
  // walls (a Blindsight NPC can't see through a wall) and are not sight-type, so they keep
  // working while the token is Blinded.
  const { DetectionModeAll, DetectionMode } = foundry.canvas.perception;
  for (const [id, label] of [['blindsight', 'VAGABOND.Senses.Blindsight'], ['echolocation', 'VAGABOND.Senses.Echolocation']]) {
    CONFIG.Canvas.detectionModes[id] = new DetectionModeAll({
      id,
      label,
      walls: true,
      angle: false,
      type: DetectionMode.DETECTION_TYPES.OTHER,
    });
  }

  // Loads placeholder images for character sheets
  CONFIG.Actor.typeImages = VAGABOND.actorTypeImages;

  // Preload Handlebars templates in the background — sheets don't render until
  // after the ready hook, so templates will be available in time.
  preloadHandlebarsTemplates();

  /**
   * Set default initiative formula for the system
   * Note: PCs and NPCs use separate custom formulas from settings (see VagabondCombatant.getInitiativeRoll)
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    formula: game.settings.get('vagabond', 'initiativeFormula') || '3d6 + @dexterity.value + @awareness.value',
    decimals: 2,
  };

  // Define custom Document and DataModel classes
  CONFIG.Actor.documentClass = VagabondActor;

  // Define custom Combat classes
  CONFIG.Combat.documentClass = VagabondCombat;
  CONFIG.Combatant.documentClass = VagabondCombatant;

  // Modify CombatTracker in place (Lancer Initiative pattern)
  const CombatTracker = foundry.applications.sidebar.tabs.CombatTracker;

  // Store original methods we'll wrap
  const originalPrepareTrackerContext = CombatTracker.prototype._prepareTrackerContext;
  const originalGetEntryContextOptions = CombatTracker.prototype._getEntryContextOptions;
  const originalCombatTrackerOnRender = CombatTracker.prototype._onRender;

  // Replace template
  CombatTracker.PARTS.tracker.template = "systems/vagabond/templates/sidebar/combat-tracker.hbs";

  // Add custom actions
  Object.assign(CombatTracker.DEFAULT_OPTIONS.actions, {
    activate: VagabondCombatTracker.onActivate,
    deactivate: VagabondCombatTracker.onDeactivate,
    rollDetect: VagabondCombatTracker.onRollDetect
  });

  // Wrap _prepareTrackerContext (NOT _prepareContext!)
  CombatTracker.prototype._prepareTrackerContext = async function(context, options) {
    return VagabondCombatTracker.prepareTrackerContext.call(this, originalPrepareTrackerContext, context, options);
  };

  // Wrap _getEntryContextOptions
  CombatTracker.prototype._getEntryContextOptions = function() {
    return VagabondCombatTracker.getEntryContextOptions.call(this, originalGetEntryContextOptions);
  };

  // Wrap _onRender (NOT the legacy activateListeners(html) hook — CombatTracker
  // is pure ApplicationV2 in v14 and never calls it).
  CombatTracker.prototype._onRender = async function(context, options) {
    await originalCombatTrackerOnRender.call(this, context, options);
    VagabondCombatTracker.onRender.call(this, options);
  };

  // Note that you don't need to declare a DataModel
  // for the base actor/item classes - they are included
  // with the Character/NPC as part of super.defineSchema()
  CONFIG.Actor.dataModels = {
    character: models.VagabondCharacter,
    npc: models.VagabondNPC,
    party: models.VagabondParty,
    construct: models.VagabondConstruct,
    shop: models.VagabondShop,
  };
  CONFIG.Item.documentClass = VagabondItem;

  // Shop transactions run on the active GM via User#query (buy / sell / party transfer)
  ShopTransactions.registerQueries();
  // Free trade (items + coins between inventories): GM-relayed moves with guard rails
  TradeHelper.registerQueries();
  // Crafting: GM-relayed execute query + mode registry (craft, scrap)
  CraftingHelper.registerQueries();
  // Circle token art: players without upload permission relay the crop upload to the GM
  TokenPortrait.registerQueries();
  // runAsGM macro / hit-macro buttons: players relay to the active GM and get its warnings back
  registerMacroQueries();
  // Automated Animations: attack / NPC action animations play with the damage roll (not the check)
  AnimationBridge.registerHooks();
  // Conjure (Beast / Forge): the caster's client picks + places, the active GM creates / removes
  ConjureHelper.registerQueries();
  CraftingHelper.registerModes();
  CONFIG.Item.dataModels = {
    equipment: models.VagabondEquipment,
    spell: models.VagabondSpell,
    ancestry: models.VagabondAncestry,
    class: models.VagabondClass,
    perk: models.VagabondPerk,
    starterPack: models.VagabondStarterPack,
    container: models.VagabondContainerData,
    vehiclePart: models.VagabondVehiclePart,
  };

  globalThis.vagabond.managers = {
    templates: new VagabondMeasureTemplates()
  };
  VagabondMeasureTemplates.installMeasureLabels();

  // Register custom ActiveEffect document class
  CONFIG.ActiveEffect.documentClass = VagabondActiveEffect;

  // v14: ActiveEffect type data model — supplies isSuppressed (when-equipped / on-use)
  CONFIG.ActiveEffect.dataModels.base = VagabondActiveEffectData;

  // Register custom ActiveEffectConfig sheet
  foundry.applications.apps.DocumentSheetConfig.registerSheet(ActiveEffect, 'vagabond', VagabondActiveEffectConfig, {
    makeDefault: true,
    label: 'VAGABOND.Effect.ConfigSheet'
  });

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

  // Register Party sheet
  collections.Actors.registerSheet('vagabond', VagabondPartySheet, {
    types: ['party'],
    makeDefault: true,
    label: 'VAGABOND.SheetLabels.Party',
  });

  // Register Construct sheet
  collections.Actors.registerSheet('vagabond', VagabondConstructSheet, {
    types: ['construct'],
    makeDefault: true,
    label: 'VAGABOND.SheetLabels.Construct',
  });
  // Register Shop sheet (GM configuration)
  collections.Actors.registerSheet('vagabond', VagabondShopSheet, {
    types: ['shop'],
    makeDefault: true,
    label: 'VAGABOND.SheetLabels.Shop',
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

// Tooltip that keeps list layout. Native tooltips collapse newlines, so a localized
// string with "• " bullet lines is turned into <p>/<ul><li> markup. Use with
// data-tooltip-html + data-tooltip-class="vagabond-list-tooltip" (HUD:
// data-hud-tip-html + data-hud-tip-class): {{listTip (localize "KEY")}}
Handlebars.registerHelper('listTip', (text) => {
  if (!text || typeof text !== 'string') return '';
  const esc = Handlebars.escapeExpression;
  let html = '';
  let inList = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^[•\-*]\s*/.exec(line);
    if (bullet) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${esc(line.slice(bullet[0].length))}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p>${esc(line)}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html;
});

// Read a progress clock value in any template: {{clockValue "doom"}} or
// {{clockValue "doom" "pct"}} (prop: value|filled|max|segments|pct|name|handle|kind)
Handlebars.registerHelper('clockValue', (ref, prop) => {
  const data = ProgressClock.read(ref);
  if (!data) return 0;
  return data[typeof prop === 'string' ? prop : 'value'];
});

// Save icon FA classes from the homebrew saves config: {{saveIcon "reflex"}}
Handlebars.registerHelper('saveIcon', (key) =>
  CONFIG.VAGABOND?.saveIcons?.[key] || 'fa-solid fa-shield'
);

// Damage display with explode notation: {{explodeMark system.currentDamage item}} → "2d6!"
// when the item's dice can explode for its owner (item, global effects, Potency).
Handlebars.registerHelper('explodeMark', (formula, item) =>
  VagabondDamagePipeline.markExplode(formula, item)
);
Handlebars.registerHelper('isExplodable', (item) => VagabondDamagePipeline.isExplodable(item));

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
/*  i18nInit Hook                               */
/* -------------------------------------------- */

// Re-apply homebrew overrides now that translations are loaded (init ran before i18nInit,
// so any label/hint/description that fell back to hardcoded English gets localized here),
// then apply custom term overrides on top.
Hooks.once('i18nInit', function () {
  applyRuntimeHomebrewOverrides(CONFIG.VAGABOND.homebrew);
  applyTermOverrides(CONFIG.VAGABOND.homebrew);
});

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once('ready', function () {
  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on('hotbarDrop', (bar, data, slot) => createDocMacro(data, slot));
  // Automated Animations menu in the GM's language (active GM, only when the file changed)
  AAMenuLoader.onReady();
  // Spell FX: one file is always active, and the world config follows it (active GM)
  if (isActiveGM()) {
    SpellFxPresets.ensureActive({ fresh: true }).catch(err => console.error('Vagabond | Spell FX active file check failed', err));
  }
});

// Socket relay: GM-side socket actions (registered on ready)
registerSocketActions();

// Ready-time startup: JB2A defaults, FX resolver, light-source driver, world migrations
registerReadyStartup();

// Recompute realtime light timers on scene load (catches elapsed time during reloads).
Hooks.on('canvasReady', () => LightSource.tickRealtime());

// Register Dice So Nice colorsets when Dice So Nice is ready
Hooks.once('diceSoNiceReady', (dice3d) => {
  VagabondDiceAppearance.registerColorsets();
  VagabondDiceAppearance.registerDamageColorsets();
});

/* -------------------------------------------- */
/*  Progress Clock → Actor Reactivity           */
/* -------------------------------------------- */

// When a clock's value/segments/handle change, re-prepare actors so @clocks.*
// formula bonuses recompute, then refresh any open actor sheets. Debounced to
// coalesce bursts (e.g. a tick that fires multiple updates in one frame).
const _refreshClockDependents = foundry.utils.debounce(() => {
  for (const actor of game.actors) {
    try {
      actor.reset();
      for (const app of Object.values(actor.apps ?? {})) app.render(false);
    } catch (e) {
      console.warn('VagabondSystem | Clock-dependent actor refresh failed', e);
    }
  }
}, 150);

/* -------------------------------------------- */
/*  Combat → Actor Reactivity (@combat.round)    */
/* -------------------------------------------- */

// Effects may read `@combat.round` (e.g. Barbarian Aggressor's first-Round Speed). Optional:
// formulas resolve to "no bonus" outside a started combat. When the combat state changes,
// re-prepare the combatants' actors LOCALLY (no writes) and refresh their open sheets.
const _pendingCombatActors = new Set();
const _refreshCombatDependents = foundry.utils.debounce(() => {
  const actors = [..._pendingCombatActors];
  _pendingCombatActors.clear();
  for (const actor of actors) {
    try {
      actor.reset();
      for (const app of Object.values(actor.apps ?? {})) app.render(false);
    } catch (e) {
      console.warn('VagabondSystem | Combat-dependent actor refresh failed', e);
    }
  }
}, 150);
const _queueCombatRefresh = (combat) => {
  for (const c of combat?.combatants ?? []) if (c.actor?.type === 'character') _pendingCombatActors.add(c.actor);
  _refreshCombatDependents();
};
for (const hook of ['combatStart', 'combatRound', 'deleteCombat']) Hooks.on(hook, (combat) => _queueCombatRefresh(combat));
Hooks.on('createCombatant', (combatant) => _queueCombatRefresh(combatant.parent));
Hooks.on('deleteCombatant', (combatant) => _queueCombatRefresh(combatant.parent));
// Page reload mid-combat: actors were prepared before combats existed, so re-prepare once.
Hooks.once('ready', () => _queueCombatRefresh(game.combats?.active));

// Barbarian Rage auto-Berserk (inert unless an actor has system.rageTrigger)
RageHelper.registerHooks();

// Fighter Momentum (inert unless an actor has system.momentumTrigger)
FighterHelper.registerHooks();

// Gunslinger Deadeye / High Noon (inert unless an actor has system.deadeyeTrigger / highNoonTrigger)
// Roll expiry: effects that end on a miss / a different roll (rules registered by each helper below)
RollExpiry.registerHooks();
GunslingerHelper.registerHooks();

// Hunter's Mark: Lethal Precision damage (inert unless an actor has a Mark and system.markDamageBonus)
HunterHelper.registerHooks();
SpellTrackerHelper.registerHooks();
DruidHelper.registerHooks();
// Raise: raised Undead die for good when "Raise: Undead" ends or they are Dead again
RaiseHelper.registerHooks();
// Conjure: conjured Beings / Items end with the Focus, or at the caster's next Turn without one
ConjureHelper.registerHooks();
// System folders: Conjured / Undead Army / Clocks & Dice (+ Metamorph's) under one root
SystemFolders.registerHooks();
// Party Notes: one journal per Character / per party GM notes; duplicates merged on GM load
PartyNotes.registerHooks();
// Spell Surfaces: loop visuals, end with the Focus / at the caster's next Turn, statuses end with the Region
SpellSurface.registerHooks();
PugilistHelper.registerHooks();
// Defense property: Patience tracking (inert unless an actor has system.patienceDefense)
DefenseHelper.registerHooks();
// Focus Mana (Ward / Polymorph / Beast): Pay / Drop Focus card at the start of the caster's Turn in Combat
FocusUpkeep.registerHooks();
RogueHelper.registerHooks();
// Sorcerer Twinned Spell (inert unless an actor has system.twinnedSpellTrigger)
SorcererHelper.registerHooks();
// Witch Soul Link (inert unless an actor has a Hex and system.hexRules 'soulLink')
WitchHelper.registerHooks();
// Wizard Archwizard: the temporary Spell removes itself once its Cast is resolved
WizardHelper.registerHooks();

Hooks.on('updateJournalEntry', (journal, changes) => {
  const pc = foundry.utils.getProperty(changes, 'flags.vagabond.progressClock');
  if (!pc) return;
  // Only refresh when a value that formulas can read actually changed
  if (!('filled' in pc) && !('segments' in pc) && !('handle' in pc)) return;
  _refreshClockDependents();
});

/* -------------------------------------------- */
/*  UI Hooks - Progress Clocks Overlay          */
/* -------------------------------------------- */
registerOverlayHooks();

/* -------------------------------------------- */
/*  Token Status Display                        */
/* -------------------------------------------- */

/**
 * Hide/show native PIXI status icons on every token based on `tokenStatusDisplay`.
 * Only `tokens` mode keeps the native badges; `none`/`left`/`right` hide them.
 */
function _applyTokenEffectVisibility() {
  const show = game.settings.get('vagabond', 'tokenStatusDisplay') === 'tokens';
  for (const t of canvas?.tokens?.placeables ?? []) {
    if (t.effects) t.effects.renderable = show;
  }
}

// Re-apply on every token (re)draw — Foundry recreates the effects container.
Hooks.on('drawToken', (token) => {
  if (token.effects) {
    token.effects.renderable = game.settings.get('vagabond', 'tokenStatusDisplay') === 'tokens';
  }
});
Hooks.on('refreshToken', (token) => {
  if (token.effects) {
    token.effects.renderable = game.settings.get('vagabond', 'tokenStatusDisplay') === 'tokens';
  }
});
Hooks.on('canvasReady', () => _applyTokenEffectVisibility());

registerSceneControls();

registerUiPanelHooks();


registerFocusStatusHooks();

/* -------------------------------------------- */
/*  Dead Token Overlay                          */
/* -------------------------------------------- */

registerDeadTokenMarker();

// Statblock rules (module/helpers/npc-rules.mjs): HP floor (Zombie / Grace), Sunlight harm (Nightwalker), turn-start regen / burn.
Hooks.on('vagabond.calculateFinalDamage', (ctx) => NpcRules.applyHpFloor(ctx));
for (const hookName of ['createActiveEffect', 'deleteActiveEffect']) {
  Hooks.on(hookName, (effect) => {
    if (effect.statuses?.has('sunlit')) NpcRules.queueSunlightSync(effect.parent);
  });
}
Hooks.on('updateActor', (actor, changes) => {
  if (foundry.utils.hasProperty(changes, 'system.sunlightHarm')) NpcRules.queueSunlightSync(actor);
});
Hooks.on('updateCombat', (combat, changed) => {
  if (!isActiveGM()) return;
  if (changed.turn === undefined && changed.round === undefined) return;
  const actor = combat.combatant?.actor;
  if (actor) NpcRules.onTurnStart(actor).catch((err) => console.warn('Vagabond | NPC turn-start rules failed:', err));
});


/* -------------------------------------------- */
/*  Actor Creation Hooks                        */
/* -------------------------------------------- */
registerShopTokenHooks();

/* -------------------------------------------- */
/*  Actor Update Hooks                          */
/* -------------------------------------------- */

// Auto-toggle the Dead status effect when HP reaches 0 or recovers above 0,
// and the Fatigued status effect when fatigue rises above 0 or returns to 0.
// Only the GM runs this to avoid duplicate calls from all connected clients.
// Centralizing here means every fatigue/HP writer (sheets, HUDs, party views,
// ongoing panel, downtime, on-hit damage) gets the status toggle for free.
Hooks.on('updateActor', async (actor, changes, _options, _userId) => {
  if (!game.user.isGM) return;

  if (foundry.utils.hasProperty(changes, 'system.health.value')) {
    const isZero = actor.system.health.value === 0;
    const hasDead = actor.statuses?.has('dead') ?? actor.effects.some(e => e.statuses?.has('dead'));
    if (isZero && !hasDead) {
      await actor.toggleStatusEffect('dead', { active: true });
    } else if (!isZero && hasDead) {
      await actor.toggleStatusEffect('dead', { active: false });
    }
  }

  if (foundry.utils.hasProperty(changes, 'system.fatigue')) {
    const fatigued = (actor.system.fatigue ?? 0) > 0;
    const hasFatigued = actor.statuses?.has('fatigued') ?? actor.effects.some(e => e.statuses?.has('fatigued'));
    if (fatigued && !hasFatigued) {
      await actor.toggleStatusEffect('fatigued', { active: true });
    } else if (!fatigued && hasFatigued) {
      await actor.toggleStatusEffect('fatigued', { active: false });
    }
  }
});

// Armor Might requirement → Restrained (RAW). Anything that can move Might total
// or change the worn Armor re-queues the sync; it's debounced, active-GM-only and
// a no-op when already consistent (EquipmentHelper.syncArmorRestrained).
const _armorSyncActor = (doc) => {
  const actor = doc instanceof Actor ? doc : (doc?.parent instanceof Actor ? doc.parent : doc?.parent?.parent);
  if (actor instanceof Actor) EquipmentHelper.queueArmorRestrainedSync(actor);
};
Hooks.on('updateActor', (actor) => _armorSyncActor(actor));

// Character senses (Darksight from an ancestry, etc.) → token vision. Same triggers as the armor
// sync; debounced, active-GM-only, no-op when the tokens already match (NpcSenses.syncCharacterTokens).
const _sensesSyncActor = (doc) => {
  const actor = doc instanceof Actor ? doc : (doc?.parent instanceof Actor ? doc.parent : doc?.parent?.parent);
  if (actor instanceof Actor) NpcSenses.queueCharacterSync(actor);
};
Hooks.on('updateActor', (actor) => _sensesSyncActor(actor));
for (const hook of ['createItem', 'deleteItem', 'createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect']) {
  Hooks.on(hook, (doc) => _sensesSyncActor(doc));
}
Hooks.once('ready', () => {
  for (const actor of game.actors) NpcSenses.queueCharacterSync(actor);
});
for (const hook of ['createItem', 'updateItem', 'deleteItem',
  'createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect']) {
  Hooks.on(hook, (doc) => _armorSyncActor(doc));
}
Hooks.once('ready', () => {
  for (const actor of game.actors) EquipmentHelper.queueArmorRestrainedSync(actor);
});

// Canvas Loot (optional module): drop / throw / pickup messages as Vagabond cards
registerCanvasLootChat();

/* -------------------------------------------- */
/*  Token Movement Hooks                        */
/* -------------------------------------------- */
registerFlankingHooks();

/* -------------------------------------------- */
/*  Item Creation Hooks                         */
/* -------------------------------------------- */

// Ensure new inventory items get proper gridPosition
Hooks.on('preCreateItem', (item, data, options, userId) => {
  // Only handle inventory items
  if (!EquipmentHelper.GRID_ITEM_TYPES.includes(item.type)) return;

  // If gridPosition not set, assign next available position
  if (item.system.gridPosition === undefined || item.system.gridPosition === null) {
    const actor = item.parent;
    if (actor) item.updateSource({ 'system.gridPosition': EquipmentHelper.nextGridPosition(actor) });
  }
});

registerChatContextMenu();

/* -------------------------------------------- */
/*  Vehicle Crew — Auto Permission Sync          */
/* -------------------------------------------- */
registerVehicleCrewHooks();

// Generic "you did something" signal for crafting rules that care about an actor's
// next action (e.g. Mix going inert). Saves are excluded (they can be forced any
// time); spell casts fire their own 'cast' actorActed from spell-handler.mjs after
// the isSuccess check, so 'spell' rollType is excluded here to avoid double-firing.
// See docs/crafting-plan.md §4.6.
Hooks.on('vagabond.postD20Roll', (ctx) => {
  if (!ctx?.actor || ctx.rollType === 'save' || ctx.rollType === 'spell') return;
  const source = (ctx.rollType === 'weapon' || ctx.rollType === 'weaponSkill') ? 'attack' : 'skill';
  Hooks.callAll('vagabond.actorActed', ctx.actor, { source, itemId: ctx.item?.id ?? null });
});

// Overtuned (Bard, L2/6/10): a Virtuoso Favor die that lifts a d20 past the threshold grants the
// Bard 1 Luck. Chat-button saves call BardHelper.onCheckRolled from `_rollSave` directly.
Hooks.on('vagabond.postD20Roll', (ctx) => {
  const kind = { weapon: 'attack', spell: 'cast', save: 'save' }[ctx?.rollType];
  // Overtuned reads the benefit first, then the benefit is spent (consumeOn effects)
  if (kind && ctx.actor) BardHelper.onCheckRolled(ctx.actor, ctx.roll, kind).then(() => consumeUsedEffects(ctx.actor, kind));
});

// Eureka (Alchemist, L2/6/10, decision D2): passing a Craft skill check by margin
// or more (roll total - difficulty >= eurekaMargin) grants a Studied Die. Fires only
// on the roller's own client (postD20Roll isn't socket-relayed), so no extra guard
// is needed beyond the actor owning the click that produced this roll.
// An attack rolled with Craft (e.g. a thrown Alchemical Item) is a Craft Check too.
// See docs/crafting-plan.md §4.9.
Hooks.on('vagabond.postD20Roll', (ctx) => {
  if (!['skill', 'weapon'].includes(ctx?.rollType) || ctx.rollKey !== 'craft' || !ctx.isSuccess) return;
  const actor = ctx.actor;
  const margin = actor?.system?.craft?.eurekaMargin || 0;
  if (margin <= 0) return;
  if ((ctx.roll?.total ?? 0) - (ctx.difficulty ?? 0) < margin) return;
  const newCount = (actor.system.studiedDice || 0) + 1;
  actor.update({ 'system.studiedDice': newCount }).then(() => {
    import('./helpers/chat-card.mjs').then(({ VagabondChatCard }) => VagabondChatCard.studiedDieGain(actor, newCount));
  });
});

// Mix lifecycle (docs/crafting-plan.md §4.10). In-combat: fires on EVERY client
// when the active combatant changes, so it's GM-gated (only the active GM writes
// the expiry); out-of-combat: fires on whichever client performed the action,
// almost always the actor's own owner, so no extra guard is needed there (same
// reasoning as the Eureka listener above).
Hooks.on('updateCombat', (combat, changed) => {
  if (!isActiveGM()) return;
  if (changed.turn === undefined && changed.round === undefined) return;
  const actor = combat.combatant?.actor;
  if (!actor) return;
  import('./helpers/crafting/mix-helper.mjs').then(({ MixHelper }) => MixHelper.expireForTurnStart(actor, combat));
});
Hooks.on('vagabond.actorActed', (actor, { itemId }) => {
  if (!actor) return;
  import('./helpers/crafting/mix-helper.mjs').then(({ MixHelper }) => MixHelper.expireOnNextAction(actor, itemId));
});

// Chat card buttons (renderChatMessageHTML)
registerChatMessageHooks();

// Active Effect config sheet: attribute-key autocomplete
registerActiveEffectConfigHooks();

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

// Token HUD: party Gather / Release
registerPartyTokenHudHooks();


/* -------------------------------------------- */
/* Dynamic Token Rings                          */
/* -------------------------------------------- */

registerTokenRingHooks();

// Locked compendium content (unlock challenge)
registerContentUnlock();
