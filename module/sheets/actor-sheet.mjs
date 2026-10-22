import { prepareEffectsView } from '../helpers/effects.mjs';
import { VagabondCharBuilder } from '../applications/char-builder/index.mjs';
import { WorkbenchApp } from '../applications/workbench-app.mjs';
import { VagabondTextParser } from '../helpers/text-parser.mjs';
import { AccordionHelper } from '../helpers/accordion-helper.mjs';
import { FeatureAction } from '../helpers/feature-action.mjs';
import { EnrichmentHelper } from '../helpers/enrichment-helper.mjs';
import { EquipmentHelper } from '../helpers/equipment-helper.mjs';
import { activateHandItem } from '../helpers/hand-item-activation.mjs';
import * as ItemSections from '../helpers/item-sections.mjs';
import { NpcRules } from '../helpers/npc-rules.mjs';
import { AlchemyLab } from '../helpers/alchemy-lab.mjs';
import { FeatureOrder } from '../helpers/feature-order.mjs';
import { ItemDisguiseApp } from '../applications/item-disguise-app.mjs';
import { LevelUpDialog } from '../applications/level-up-dialog.mjs';
import { DowntimeApp } from '../applications/downtime-app.mjs';
import { ActorActions } from './actor-actions.mjs';
import { ActorDrop } from './actor-drop.mjs';
import { VagabondCharacterHud } from '../applications/character-hud.mjs';
import { VagabondNPCHud } from '../applications/npc-hud.mjs';
import { PartyCompactView } from '../applications/party-compact-view.mjs';
import { ActorSheetEffects } from './actor-sheet-effects.mjs';
import { ActorSheetListeners } from './actor-sheet-listeners.mjs';

const { api, sheets } = foundry.applications;

/**
 * Base actor sheet — render, tabs, context, drop dispatch and the `actions` map, extended by the Character,
 * NPC, Construct and Party sheets (most handlers live in `sheets/handlers/`, set up by each subclass).
 * Actions shared with the HUDs are `ActorActions`, drops `ActorDrop`, effects `ActorSheetEffects`, DOM listeners
 * `ActorSheetListeners`; the HUDs import those, never this file (rules/actor-sheet.md).
 *
 * @extends {ActorSheetV2}
 */
export class VagabondActorSheet extends api.HandlebarsApplicationMixin(
  sheets.ActorSheetV2
) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['vagabond', 'actor'],
    position: {
      width: 430,
    },
    actions: {
      onEditImage: this._onEditImage,
      viewDoc: this._viewDoc,
      createDoc: this._createDoc,
      deleteDoc: this._deleteDoc,
      // Effects list (Active / Inactive switch rows)
      toggleEffect: ActorSheetEffects._onToggleEffect,
      toggleItemDisguise: this._onToggleItemDisguise,
      toggleEffectDetails: ActorSheetEffects._onToggleEffectDetails,
      createEffect: ActorSheetEffects._onCreateEffect,
      editEffect: ActorSheetEffects._onEditEffect,
      deleteEffect: ActorSheetEffects._onDeleteEffect,
      effectToChat: ActorSheetEffects._onEffectToChat,
      effectMenu: ActorSheetEffects._onEffectMenu,
      // Roll actions - delegated to rollHandler
      roll: this._onRoll,
      rollWeapon: this._onRollWeapon,
      useItem: this._onUseItem,
      throwWeapon: this._onThrowWeapon,
      adjustQuantity: { handler: this._onAdjustQuantity, buttons: [0, 2] },
      rollMorale: ActorActions._onRollMorale,
      rollAppearing: ActorActions._onRollAppearing,
      // Equipment actions - delegated to equipmentHandler
      toggleWeaponEquipment: this._onToggleWeaponEquipment,
      toggleWeaponGrip: this._onToggleWeaponGrip,
      toggleArmorEquipment: this._onToggleArmorEquipment,
      equipItem: this._onEquipItem,
      editItem: this._onEditItem,
      deleteItem: this._onDeleteItem,
      usePip: this._onUsePip,
      // Spell actions - delegated to spellHandler
      castSpell: this._onCastSpell,
      toggleFx: this._onToggleFx,
      toggleSpellFavorite: this._onToggleSpellFavorite,
      toggleSpellFocus: this._onToggleSpellFocus,
      toggleSpellPreview: this._onToggleSpellPreview,
      toggleSpellAccordion: this._onToggleSpellAccordion,
      // Character-specific UI actions (handled in base class)
      viewAncestry: this._viewAncestry,
      viewClass: this._viewClass,
      levelUp: this._onLevelUp,
      consolidateWealth: ActorActions._onConsolidateWealth,
      toggleFeature: this._onToggleFeature,
      featureAction: { handler: ActorActions._onFeatureAction, buttons: [0, 2] },
      toggleTrait: this._onToggleTrait,
      togglePerk: this._onTogglePerk,
      togglePanel: this._onTogglePanel,
      toggleFavorHinder: ActorActions._onToggleFavorHinder,
      statusClick: ActorActions._onStatusClick,
      spendLuck: ActorActions._onSpendLuck,
      spendStudiedDie: ActorActions._onSpendStudiedDie,
      modifyCheckBonus: { handler: ActorActions._onModifyCheckBonus, buttons: [0, 2] },
      modifyMana: ActorActions._onModifyMana,
      openDowntime: this._onOpenDowntime,
      openWorkbench: this._onOpenWorkbench,
      becomeHud: this._onBecomeHud,
      openCharBuilder: this._onOpenCharBuilder,
      dismissCharBuilder: this._onDismissCharBuilder,
      // NPC-specific UI actions (handled in base class)
      toggleEffectsAccordion: this._onToggleEffectsAccordion,
      toggleLock: this._onToggleLock,
      // NPC immunity actions - delegated to immunityHandler
      toggleSpeedType: this._onToggleSpeedType,
      removeSpeedType: this._onRemoveSpeedType,
      toggleImmunity: this._onToggleImmunity,
      removeImmunity: this._onRemoveImmunity,
      toggleWeakness: this._onToggleWeakness,
      removeWeakness: this._onRemoveWeakness,
      toggleStatusImmunity: this._onToggleStatusImmunity,
      removeStatusImmunity: this._onRemoveStatusImmunity,
      removeSense: this._onRemoveSense,
      selectZone: this._onSelectZone,
      clearZone: this._onClearZone,
      // NPC action/ability actions - delegated to actionHandler
      addAction: this._onAddAction,
      removeAction: this._onRemoveAction,
      toggleActionAccordion: this._onToggleActionAccordion,
      addAbility: this._onAddAbility,
      removeAbility: this._onRemoveAbility,
      moveAction: this._onMoveAction,
      moveAbility: this._onMoveAbility,
      clickAbilityName: ActorActions._onClickAbilityName,
      toggleAbilityAccordion: this._onToggleAbilityAccordion,
      clickActionName: ActorActions._onClickActionName,
      clickActionDamageRoll: ActorActions._onClickActionDamageRoll,
      createCountdownFromRecharge: ActorActions._onCreateCountdownFromRecharge,
      rollRechargeCountdown: ActorActions._onRollRechargeCountdown,
      toggleDescription: this._onToggleDescription,
      addNpcActionStatus: this._onAddNpcActionStatus,
      removeNpcActionStatus: this._onRemoveNpcActionStatus,
      addNpcActionCritStatus: this._onAddNpcActionCritStatus,
      removeNpcActionCritStatus: this._onRemoveNpcActionCritStatus,
    },
    dragDrop: [{ dragSelector: '.draggable', dropSelector: null }],
    form: {
      submitOnChange: true,
      submitDelay: 500,
    },
  };

  /** @override */
  static PARTS = {
    tabs: {
      template: 'templates/generic/tab-navigation.hbs',
    },
    features: {
      template: 'systems/vagabond/templates/actor/features.hbs',
      scrollable: [""],
    },
    spells: {
      template: 'systems/vagabond/templates/actor/spells.hbs',
      scrollable: [""],
    },
    alchemy: {
      template: 'systems/vagabond/templates/actor/alchemy.hbs',
      scrollable: [""],
    },
    effects: {
      template: 'systems/vagabond/templates/actor/effects.hbs',
      scrollable: [""],
    },
    slidingPanel: {
      template: 'systems/vagabond/templates/actor/sliding-panel.hbs',
      scrollable: [".panel-content"],
    },
    npcHeader: {
      template: 'systems/vagabond/templates/actor/npc-header.hbs',
    },
    npcContent: {
      template: 'systems/vagabond/templates/actor/npc-content.hbs',
      scrollable: [""],
    },
  };

  /** @override */
  constructor(object, options) {
    super(object, options);

    // Accordion state management
    this._accordionStateManager = null;
    this._savedAccordionState = null;

    // Note: Handlers are initialized in child classes (VagabondCharacterSheet, VagabondNPCSheet)
    // this.spellHandler, this.rollHandler, etc.
  }

  /** @override */
  async render(options = {}, _options = {}) {
    // Skip render when suppressed (e.g. during panel toggle flag save)
    if (this._suppressRender) return;

    // Wait for templates to be ready before rendering
    if (typeof globalThis.vagabond?.templatesReady !== 'undefined' && !globalThis.vagabond.templatesReady) {
      console.log("Vagabond | Waiting for templates to load before rendering sheet...");
      // Wait up to 5 seconds for templates to load
      const timeout = Date.now() + 5000;
      while (!globalThis.vagabond.templatesReady && Date.now() < timeout) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!globalThis.vagabond.templatesReady) {
        console.warn("Vagabond | Templates not ready after timeout, rendering anyway");
      }
    }
    return super.render(options, _options);
  }

  /**
   * @override
   * Capture accordion state before the DOM is replaced.
   */
  async _preRender(context, options) {
    await super._preRender(context, options);

    // Guard: element doesn't exist on first render
    if (!this.element) return;

    // Capture accordion state from the CURRENT element before it gets replaced
    if (this._accordionStateManager) {
      this._savedAccordionState = this._accordionStateManager.capture();
    }
  }

  /** @override */
  async close(options) {
    // Clean up event listeners
    if (this._accordionClickOutsideHandler) {
      document.removeEventListener('click', this._accordionClickOutsideHandler);
    }

    // Clear measurement template previews (if spell handler exists)
    if (this.spellHandler) {
      await this.spellHandler._clearAllPreviews();
    }

    return super.close(options);
  }

  /**
   * Configure rendering options for the actor sheet
   * @param {Object} options - Render options
   * @override
   */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);

    // Determine which parts to render based on actor type
    const isCharacter = this.document.type === 'character';
    const isNPC = this.document.type === 'npc';

    if (isCharacter) {
      options.parts = this._characterParts();
    } else if (isNPC) {
      options.parts = ['npcHeader', 'npcContent'];
    }

    // Handle limited view permissions
    if (this.document.limited) {
      options.parts = isCharacter ? ['slidingPanel'] : ['npcHeader'];
    }
  }

  /**
   * Character parts in tab order: Features / Magic / Alchemy / Effects (Effects always last). Magic only while the
   * character owns a Spell; Alchemy only with class formula grants (the Alchemist's lab).
   * @returns {string[]}
   * @protected
   */
  _characterParts() {
    const hasSpells = this.actor.items.some((i) => i.type === 'spell');
    return [
      'tabs', 'features',
      ...(hasSpells ? ['spells'] : []),
      ...(AlchemyLab.hasLab(this.actor) ? ['alchemy'] : []),
      'effects', 'slidingPanel',
    ];
  }

  /**
   * Tab parts come and go (Magic / Alchemy): drop the ones no longer rendered — Foundry keeps a part's old element
   * when it isn't re-rendered — and put a newly shown one in tab order (Foundry appends new parts at the end).
   * @override
   */
  _replaceHTML(result, content, options) {
    const fullCharacter = this.document.type === 'character' && options.parts?.includes('tabs');
    if (fullCharacter) {
      for (const id of ['spells', 'alchemy']) {
        if (!options.parts.includes(id)) content.querySelector(`[data-application-part="${id}"]`)?.remove();
      }
    }
    super._replaceHTML(result, content, options);
    if (!fullCharacter) return;
    let prev = null;
    for (const id of options.parts) {
      const el = content.querySelector(`[data-application-part="${id}"]`);
      if (!el) continue;
      if (prev && !(prev.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) prev.after(el);
      prev = el;
    }
  }

  /**
   * Prepare context for rendering
   * @param {Object} options - Render options
   * @returns {Promise<Object>} Render context
   * @override
   */
  async _prepareContext(options) {
    const context = {
      actor: this.actor,
      system: this.actor.system,
      flags: this.actor.flags,
      config: CONFIG.VAGABOND,
      editable: this.isEditable,
      owner: this.actor.isOwner,
      limited: this.actor.limited,
      isCharacter: this.actor.type === 'character',
      isNPC: this.actor.type === 'npc',
      // Necessary for formInput and formFields helpers
      fields: this.document.schema.fields,
      systemFields: this.document.system.schema.fields,
    };

    // Enrich biography with error handling
    try {
      context.enrichedBiography = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        this.actor.system.biography,
        {
          async: true,
          secrets: this.actor.isOwner,
          relativeTo: this.actor,
        }
      );
    } catch (error) {
      console.error("Vagabond | Error enriching biography:", error);
      context.enrichedBiography = this.actor.system.biography || '';
    }

    // Prepare tabs
    context.tabs = this._getTabs(options.parts);

    // Prepare items with error handling
    try {
      await this._prepareItems(context);
    } catch (error) {
      console.error("Vagabond | Error preparing items:", error);
      // Set empty arrays as fallback
      context.gear = [];
      context.weapons = [];
      context.armor = [];
      context.containers = [];
      context.spells = [];
      context.perks = [];
      context.features = [];
      context.traits = [];
    }

    // NPC statblock rules (relic-immune, HP floor, Sunlight, regen) for the locked view
    if (context.isNPC) {
      context.npcRulesView = NpcRules.describe(this.actor);
      context.npcRelicBadge = NpcRules.relicBadge(this.actor);
      context.npcImmunitiesShown = NpcRules.shownImmunities(this.actor);
    }

    // Add character-specific data
    if (context.isCharacter) {
      const ancestry = this.actor.items.find((i) => i.type === 'ancestry');
      context.hasAncestry = !!ancestry;
      context.ancestryName = ancestry?.name || 'Unknown';

      const classItem = this.actor.items.find((i) => i.type === 'class');
      context.hasClass = !!classItem;
      context.className = classItem?.name || 'Unknown';

      // Localized ancestry data for display
      if (this.actor.system.ancestryData) {
        context.system.ancestryDisplay = {
          name: this.actor.system.ancestryData.name,
          sizeLabel: game.i18n.localize(`VAGABOND.Sizes.${this.actor.system.ancestryData.size}`),
          beingTypeLabel: game.i18n.localize(`VAGABOND.BeingTypes.${this.actor.system.ancestryData.beingType}`)
        };
      }

      // Split skills into regular and weapon-attack groups for the sliding panel.
      // Skills with showInSkillsList:true (brawl, finesse) appear in BOTH columns
      // because they're used for non-attack actions too (grapples, thievery, etc.).
      if (this.actor.system.skills) {
        const allSkills = Object.entries(this.actor.system.skills);
        context.regularSkills = Object.fromEntries(allSkills.filter(([, s]) => !s.isWeaponSkill || s.showInSkillsList));
        context.attackSkills  = Object.fromEntries(allSkills.filter(([, s]) =>  s.isWeaponSkill));
      }

      // Panel state
      context.isPanelOpen = this.actor.getFlag('vagabond', 'isPanelOpen') ?? true;

      // Check for equipped items and favorited spells for Sliding Panel
      context.hasEquippedItems =
        (context.weapons && context.weapons.some(i => i.system.equipped)) ||
        (context.gear && context.gear.some(i => i.system.equipped)) ||
        (context.armor && context.armor.some(i => i.system.equipped));

      // Equipped panel is soft-divided: Hands (oneHand/twoHands) and Belt ('worn')
      const panelEquipped = [...(context.weapons ?? []), ...(context.gear ?? [])]
        .filter(i => i.system.equipped && !EquipmentHelper.isBeltExcluded(i));
      const wornPanelItems = panelEquipped.filter(i => i.system.equipmentState === 'worn');
      context.hasBeltItems = wornPanelItems.length > 0;
      context.hasHandItems = panelEquipped.some(i => i.system.equipmentState !== 'worn');

      // Feature / trait / perk actions pinned to the Belt (same list the HUD Belt shows)
      context.beltActions = FeatureAction.beltEntries(this.actor);
      context.hasBeltZone = context.hasBeltItems || context.beltActions.length > 0;
      if (context.beltActions.length) context.hasEquippedItems = true;

      // Belt is a single freely-reorderable list (drag-drop, same
      // `flags.vagabond.beltOrder` the HUD Belt row reads/writes) — unlike
      // Hands (still the fixed weapon → relic → alchemical → gear category
      // blocks below), so it's flattened here into one sorted array tagged
      // with a render `kind` instead of 4 separate template loops.
      context.beltItems = EquipmentHelper.sortByBeltOrder(wornPanelItems).map((item) => ({
        item,
        kind: item.system.equipmentType === 'weapon' ? 'weapon'
          : item.system.equipmentType === 'relic' ? 'relic'
          : item.system.equipmentType === 'alchemical'
            ? (item.system.damageType !== '-' ? 'alchemicalDamage' : 'alchemicalPlain')
            : 'gear',
      }));

      context.hasFavoritedSpells = context.spells && context.spells.some(i => i.system.favorite);
      context.useSpellDialog = game.settings.get('vagabond', 'useSpellCastDialog');

      // Focus pips for the Spells section header in the sliding panel
      const focusedSpellIds = this.actor.system.focus?.spellIds || [];
      context.focusedSpellIds = focusedSpellIds;
      const focusMax = this.actor.system.focus?.max ?? 5;
      context.focusPips = Array.from({ length: focusMax }, (_, i) => ({
        filled: i < focusedSpellIds.length
      }));

      // Worn armor name for header display
      const equippedArmor = EquipmentHelper.getWornArmor(this.actor);
      context.equippedArmorName = equippedArmor ? equippedArmor.name : '';

      // Stats layout class for the stats-grid element
      context.statsGridClass = (CONFIG.VAGABOND.homebrew?.derivations?.statsLayout ?? 'progression') === 'centered'
        ? 'stats-grid--centered'
        : 'stats-grid--progression';

      // Prepare fatigue boxes (dynamic max from setting + bonus)
      const fatigue = this.actor.system.fatigue || 0;
      const fatigueMax = this.actor.system.fatigueMax || 5;
      context.fatigueBoxes = Array.from({ length: fatigueMax }, (_, i) => ({
        checked: i < fatigue,
        level: i + 1
      }));

      // Prepare status effects for display
      context.statusEffects = ActorActions._prepareStatusEffects(this);
    }

    // Prepare the Active / Inactive effects lists (actor effects + item-granted effects)
    context.effects = await prepareEffectsView(this.actor, { editable: this.isEditable, open: this._fxOpen });

    return context;
  }

  /**
   * Prepare context for individual parts
   * @param {string} partId - Part identifier
   * @param {Object} context - Base context
   * @returns {Promise<Object>} Part context
   * @override
   */
  async _preparePartContext(partId, context) {
    const partContext = { ...context };

    switch (partId) {
      case 'features':
        partContext.tab = context.tabs[partId];
        try {
          await EnrichmentHelper.enrichFeatures(partContext, this.actor);
          await EnrichmentHelper.enrichTraits(partContext, this.actor);
          await EnrichmentHelper.enrichPerks(partContext, this.actor);
        } catch (error) {
          console.error("Vagabond | Error enriching features/traits/perks:", error);
        }
        break;

      case 'spells':
        partContext.tab = context.tabs[partId];
        // Spell enrichment is handled by spellHandler
        if (this.spellHandler) {
          try {
            await this.spellHandler.enrichSpellsContext(partContext);
          } catch (error) {
            console.error("Vagabond | Error enriching spells:", error);
          }
        }
        break;

      case 'alchemy':
        partContext.tab = context.tabs[partId];
        try {
          partContext.lab = await AlchemyLab.prepare(this.actor, AlchemyLab.stateOf(this));
        } catch (error) {
          console.error("Vagabond | Error preparing the Alchemy lab:", error);
        }
        break;

      case 'effects':
        partContext.tab = context.tabs[partId];
        break;

      case 'slidingPanel':
        // Panel already has all necessary data in base context
        break;

      case 'npcHeader':
        // Prepare fatigue boxes for NPC (dynamic max from setting + bonus)
        const fatigue = this.actor.system.fatigue || 0;
        const fatigueMax = this.actor.system.fatigueMax || 5;
        partContext.fatigueBoxes = Array.from({ length: fatigueMax }, (_, i) => ({
          checked: i < fatigue,
          level: i + 1
        }));

        // Prepare status effects for portrait display
        partContext.statusEffects = this._prepareNPCStatusEffects();

        // Format appearing field for display in locked mode
        if (this.actor.system.locked && this.actor.system.appearing) {
          try {
            const parsedText = VagabondTextParser.parseAll(this.actor.system.appearing);
            partContext.enrichedAppearing = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
              parsedText,
              {
                async: true,
                secrets: this.actor.isOwner,
                rollData: this.actor.getRollData(),
                relativeTo: this.actor,
              }
            );
          } catch (error) {
            console.error("Vagabond | Error enriching appearing field:", error);
            partContext.enrichedAppearing = this.actor.system.appearing || '';
          }
        } else {
          partContext.enrichedAppearing = this.actor.system.appearing || '';
        }
        break;

      case 'npcContent':
        // Add actions and abilities from actor system
        partContext.actions = this.actor.system.actions || [];
        partContext.abilities = this.actor.system.abilities || [];

        // Enrich NPC actions and abilities
        try {
          await EnrichmentHelper.enrichActions(partContext, this.actor);
          await EnrichmentHelper.enrichAbilities(partContext, this.actor);
        } catch (error) {
          console.error("Vagabond | Error enriching NPC actions/abilities:", error);
        }

        // Load available weapons from compendiums for the weapon selector
        const availableWeapons = await this._loadAvailableWeapons();
        partContext.availableWeapons = availableWeapons;
        partContext.weaponDisplayNames = Object.fromEntries(availableWeapons.map(w => [w.uuid, w.name]));

        // World macros for the NPC action macro selector
        partContext.availableMacros = (game.macros?.contents ?? [])
          .map(m => ({ uuid: m.uuid, name: m.name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return partContext;
  }

  /**
   * Load all weapon items from compendiums for the NPC action weapon selector.
   * @returns {Promise<Array<{uuid: string, name: string}>>}
   * @private
   */
  async _loadAvailableWeapons() {
    const weapons = [];
    for (const pack of game.packs) {
      if (pack.documentName !== 'Item') continue;
      try {
        const index = await pack.getIndex({ fields: ['name', 'type', 'system.equipmentType'] });
        for (const entry of index) {
          if (entry.type === 'equipment' && entry.system?.equipmentType === 'weapon') {
            weapons.push({ uuid: entry.uuid, name: entry.name });
          }
        }
      } catch (e) {
        console.warn('Vagabond | Failed to index pack for weapons:', pack.collection, e);
      }
    }
    weapons.sort((a, b) => a.name.localeCompare(b.name));
    return weapons;
  }

  /**
   * Get tabs configuration
   * @param {Array} parts - Rendered parts
   * @returns {Object} Tab configurations keyed by partId
   * @private
   */
  _getTabs(parts) {
    const tabGroup = 'primary';

    // Default tab for first time it's rendered this session; also when the active tab is no longer shown
    // (Magic / Alchemy come and go with Spells / formula grants)
    if (!this.tabGroups[tabGroup]) this.tabGroups[tabGroup] = 'features';
    const tabIds = { features: 'features', spells: 'spells', alchemy: 'alchemy', effects: 'effects' };
    if (parts.includes('features') && !parts.some((p) => tabIds[p] === this.tabGroups[tabGroup])) {
      this.tabGroups[tabGroup] = 'features';
    }

    return parts.reduce((tabs, partId) => {
      const tab = {
        cssClass: '',
        group: tabGroup,
        id: '',
        icon: '',
        label: 'VAGABOND.Actor.Tabs.',
      };

      switch (partId) {
        case 'tabs':
        case 'slidingPanel':
        case 'npcHeader':
        case 'npcContent':
          return tabs;
        case 'features':
          tab.id = 'features';
          tab.label += 'Features';
          //tab.icon = 'fa-solid fa-shield-halved';
          break;
        case 'spells':
          tab.id = 'spells';
          tab.label += 'Magic';
          //tab.icon = 'fa-solid fa-wand-sparkles';
          break;
        case 'alchemy':
          tab.id = 'alchemy';
          tab.label += 'Alchemy';
          break;
        case 'effects':
          tab.id = 'effects';
          tab.label += 'Effects';
          //tab.icon = 'fa-solid fa-flask';
          break;
      }

      if (this.tabGroups[tabGroup] === tab.id) tab.cssClass = 'active';
      tabs[partId] = tab;
      return tabs;
    }, {});
  }

  /**
   * Prepare status effects for NPC portrait display
   * Shows all non-disabled effects on the actor
   * @returns {Array} Array of effect data for display
   * @private
   */
  _prepareNPCStatusEffects() {
    const effects = [];
    for (const effect of this.actor.effects) {
      if (effect.disabled) continue;
      effects.push({
        id: effect.id,
        uuid: effect.uuid,
        name: effect.name || effect.label || 'Unknown',
        icon: effect.img || 'icons/svg/aura.svg',
        statuses: Array.from(effect.statuses || [])
      });
    }
    return effects;
  }

  async _prepareItems(context) {
    const gear = [];
    const weapons = [];
    const armor = [];
    const containers = [];
    const spells = [];
    const perks = [];

    context.features = [];
    context.traits = [];

    // Get current level for filtering class features
    const currentLevel = this.actor.system.attributes?.level?.value || this.actor.system.level || 1;

    for (const item of this.actor.items) {
      switch (item.type) {
        case 'equipment':
          // Transient render-only field for the sliding-panel equipped list (mirrors the
          // inventory-card / mini-sheet / HUD pips — see item-sections.mjs usesPipsArray).
          item.usesPips = ItemSections.usesPipsArray(item);
          if (item.system.equipmentType === 'weapon') weapons.push(item);
          else if (item.system.equipmentType === 'armor') armor.push(item);
          else gear.push(item);
          break;
        case 'container':
          containers.push(item);
          break;
        case 'spell':
          // Calculate effective damage die size
          const override = item.system.damageDieSize;
          const defaultSize = this.actor.system.spellDamageDieSize || 6;
          item.effectiveDamageDieSize = override || defaultSize;
          spells.push(item);
          break;
        case 'perk':
          perks.push(item);
          break;
        case 'class':
          // Features up to the current level, scaling copies collapsed to the newest one.
          // `index` = position in levelFeatures (the context menu reads levelFeatures[index]).
          context.features.push(...EnrichmentHelper.classFeatureRows(item, currentLevel).map(row => ({
            ...row,
            index: row.srcIndex,
            _id: `${item.id}-feature-${row.firstIndex}`,
            sourceItem: item
          })));
          break;
        case 'ancestry':
          // Get all ancestry traits
          if (item.system.traits) {
            const ancestryTraits = item.system.traits.map((t, index) => ({
              ...t,
              index: index,
              _id: `${item.id}-trait-${index}`,
              sourceItem: item
            }));
            context.traits.push(...ancestryTraits);
          }
          break;
      }
    }

    // Store categorized items
    context.gear = gear;
    context.weapons = weapons;
    context.armor = armor;
    context.containers = containers;
    context.spells = spells;
    context.perks = perks;

    // Player-chosen order (drag-reorder on the Features tab / HUD)
    context.features = FeatureOrder.sort(this.actor, 'features', context.features);
    context.traits = FeatureOrder.sort(this.actor, 'traits', context.traits);
    context.perks = FeatureOrder.sort(this.actor, 'perks', context.perks);

    // Prepare inventory grid (delegates to inventoryHandler if available)
    if (this.inventoryHandler) {
      this.inventoryHandler.prepareInventoryGrid(context, gear, weapons, armor, containers);
    }
  }

  /**
   * Post-render setup
   * @param {Object} context - Render context
   * @param {Object} options - Render options
   * @override
   */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Initialize or re-initialize accordion state manager for the NEW element
    // Broad selector to catch all types of accordions used in the system
    this._accordionStateManager = AccordionHelper.createStateManager(this.element);

    // Restore state if we have it
    if (this._savedAccordionState) {
      this._accordionStateManager.setState(this._savedAccordionState);
      // forceClose: false ensures that new items (expanded by default) are not closed
      this._accordionStateManager.restore({ forceClose: false });
    }

    // Disable overridden inputs
    this.#disableOverrides();

    // Setup accordion click-outside handlers
    ActorSheetListeners._setupAccordionClickOutside(this);

    // Setup HP and Fatigue click handlers
    ActorSheetListeners._setupHealthFatigueListeners(this);

    // Setup ancestry/class right-click delete handlers
    ActorSheetListeners._setupAncestryClassHandlers(this);

    // Setup mana right-click handlers
    ActorSheetListeners._setupManaHandlers(this);

    // Setup inventory grid listeners (if inventory handler exists)
    if (this.inventoryHandler) {
      this.inventoryHandler.setupListeners();
    }

    // Setup spell listeners (if spell handler exists)
    if (this.spellHandler) {
      this.spellHandler.setupListeners();
    }

    // Setup feature/trait/perk context menu listeners (if inventory handler exists)
    if (this.inventoryHandler) {
      ActorSheetListeners._setupFeatureContextMenuListeners(this);
    }

    // Setup panel favorites context menu listeners
    ActorSheetListeners._setupPanelContextMenuListeners(this);

    // Belt drag-to-reorder (sliding panel's Equipped > Belt list)
    ActorSheetListeners._setupBeltReorderListeners(this);

    // Feature / trait / perk action buttons: drag onto the sliding panel's Equipped section to pin to the Belt
    FeatureAction.bindDrag(this.element, this.actor);
    FeatureAction.bindBeltDrop(this.element.querySelector('.right-column-scrollable'), this.actor);

    // Inventory items / spells: drag onto the Equipped section to equip / favorite them
    ActorSheetListeners._setupEquipDrop(this);

    // Setup status icon listeners
    ActorActions._setupStatusIconListeners(this);

    // Show sliding panel tooltip (first time only)
    this._showSlidingPanelTooltip();

    // Toggle margin on right-column-scrollable when content overflows
    const scrollable = this.element.querySelector('.right-column-scrollable');
    if (scrollable) {
      const updateScrollClass = () => scrollable.classList.toggle('has-scroll', scrollable.scrollHeight > scrollable.clientHeight);
      requestAnimationFrame(updateScrollClass);
      this._scrollObserver?.disconnect();
      this._scrollObserver = new ResizeObserver(() => {
        requestAnimationFrame(updateScrollClass);
      });
      this._scrollObserver.observe(scrollable);
    }

    // Fix inline roll dice icons to match actual die type
    EnrichmentHelper.fixInlineRollIcons(this.element);
  }

  // ===========================
  // DELEGATION ACTION HANDLERS
  // ===========================
  // These methods delegate to handlers initialized in child classes

  // --- ROLL HANDLERS ---
  static async _onRoll(event, target) {
    return this.rollHandler?.roll(event, target);
  }

  static async _onRollWeapon(event, target) {
    return this._activateItemAction(event, target);
  }

  static async _onUseItem(event, target) {
    return this._activateItemAction(event, target);
  }

  /** Throw a Thrown weapon without equipping it; spends one from the stack. */
  static async _onThrowWeapon(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    return activateHandItem({ actor: this.actor, item, event, rollHandler: this.rollHandler, mode: 'throw' });
  }

  /** Quantity badge: left-click +1 (retrieve), right-click −1. Floors at 0. */
  static async _onAdjustQuantity(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const item = this.actor.items.get(target.dataset.itemId);
    const delta = event.type === 'contextmenu' || event.button === 2 ? -1 : 1;
    return EquipmentHelper.adjustQuantity(item, delta);
  }

  /**
   * Shared `rollWeapon`/`useItem` action target: resolves the item, then
   * equips it first if it occupies hands and isn't already equipped
   * (weapons, torches, etc.), then performs its action (attack / ignite
   * toggle / use) — same unified behavior as the HUD. All current bindings
   * (sliding-panel Equipped rows, spell send-to-chat) target already-equipped
   * items or non-equipment items, so the equip step is a safe no-op there.
   */
  async _activateItemAction(event, target) {
    const element = target || event.currentTarget;
    const itemId = element?.dataset?.itemId || element?.closest?.('[data-item-id]')?.dataset.itemId;
    const item = itemId && this.actor.items.get(itemId);
    if (!item) {
      ui.notifications.error('Item not found!');
      return;
    }
    return activateHandItem({ actor: this.actor, item, event, rollHandler: this.rollHandler });
  }

  // --- EQUIPMENT HANDLERS ---
  static async _onToggleWeaponEquipment(event, target) {
    return this.equipmentHandler?.toggleWeaponEquipment(event, target);
  }

  static async _onToggleWeaponGrip(event, target) {
    return this.equipmentHandler?.toggleWeaponGrip(event, target);
  }

  static async _onToggleArmorEquipment(event, target) {
    return this.equipmentHandler?.toggleArmorEquipment(event, target);
  }

  static async _onEquipItem(event, target) {
    return this.equipmentHandler?.equipItem(event, target);
  }

  static async _onEditItem(event, target) {
    const itemId = target.closest('[data-item-id]')?.dataset.itemId;
    if (!itemId) return;
    const item = this.actor.items.get(itemId);
    if (item) item.sheet.render(true);
  }

  static async _onDeleteItem(event, target) {
    const itemId = target.closest('[data-item-id]')?.dataset.itemId;
    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    if (!item) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('VAGABOND.Dialog.DeleteItem') },
      content: `<p>${game.i18n.format('VAGABOND.Dialog.DeleteItemContent', { name: item.name })}</p>`,
    });

    if (confirmed) {
      await item.delete();
      ui.notifications.info(`Deleted ${item.name}`);
    }
  }

  /** Spend/restore a multi-use item's charge pip (inventory grid card, mini-sheet detail, HUD accordion). */
  static async _onUsePip(event, target) {
    const item = this.actor.items.get(target.closest('[data-item-id]')?.dataset.itemId);
    await ItemSections.onUsePipClick(target, item ?? null);
  }

  // --- SPELL HANDLERS ---
  static async _onCastSpell(event, target) {
    return this.spellHandler?.castSpell(event, target);
  }

  static async _onToggleFx(event, target) {
    return this.spellHandler?.toggleFx(event, target);
  }

  static async _onToggleSpellFavorite(event, target) {
    return this.spellHandler?.toggleSpellFavorite(event, target);
  }

  static async _onToggleSpellPreview(event, target) {
    return this.spellHandler?.toggleSpellPreview(event, target);
  }

  static async _onToggleSpellAccordion(event, target) {
    return this.spellHandler?.toggleSpellAccordion(event, target);
  }

  static async _onToggleSpellFocus(event, target) {
    return this.spellHandler?.toggleSpellFocus(event, target);
  }

  // --- NPC IMMUNITY HANDLERS ---
  static async _onToggleSpeedType(event, target) {
    return this.immunityHandler?.toggleSpeedType(event, target);
  }

  static async _onRemoveSpeedType(event, target) {
    return this.immunityHandler?.removeSpeedType(event, target);
  }

  static async _onToggleImmunity(event, target) {
    return this.immunityHandler?.toggleImmunity(event, target);
  }

  static async _onRemoveImmunity(event, target) {
    return this.immunityHandler?.removeImmunity(event, target);
  }

  static async _onToggleWeakness(event, target) {
    return this.immunityHandler?.toggleWeakness(event, target);
  }

  static async _onRemoveWeakness(event, target) {
    return this.immunityHandler?.removeWeakness(event, target);
  }

  static async _onToggleStatusImmunity(event, target) {
    return this.immunityHandler?.toggleStatusImmunity(event, target);
  }

  static async _onRemoveStatusImmunity(event, target) {
    return this.immunityHandler?.removeStatusImmunity(event, target);
  }

  static async _onRemoveSense(event, target) {
    return this.immunityHandler?.removeSense(event, target);
  }

  static async _onSelectZone(event, target) {
    return this.immunityHandler?.selectZone(event, target);
  }

  static async _onClearZone(event, target) {
    return this.immunityHandler?.clearZone(event, target);
  }

  // --- NPC ACTION HANDLERS ---
  static async _onAddAction(event, target) {
    return this.actionHandler?.addAction(event, target);
  }

  static async _onRemoveAction(event, target) {
    return this.actionHandler?.removeAction(event, target);
  }

  static async _onToggleActionAccordion(event, target) {
    return this.actionHandler?.toggleActionAccordion(event, target);
  }

  static async _onAddAbility(event, target) {
    return this.actionHandler?.addAbility(event, target);
  }

  static async _onRemoveAbility(event, target) {
    return this.actionHandler?.removeAbility(event, target);
  }

  static async _onMoveAction(event, target) {
    return this.actionHandler?.moveEntry('actions', event, target);
  }

  static async _onMoveAbility(event, target) {
    return this.actionHandler?.moveEntry('abilities', event, target);
  }

  static async _onToggleAbilityAccordion(event, target) {
    return this.actionHandler?.toggleAbilityAccordion(event, target);
  }

  static async _onAddNpcActionStatus(event, target) {
    return this.actionHandler?.addNpcActionStatus(event, target);
  }

  static async _onRemoveNpcActionStatus(event, target) {
    return this.actionHandler?.removeNpcActionStatus(event, target);
  }

  static async _onAddNpcActionCritStatus(event, target) {
    return this.actionHandler?.addNpcActionCritStatus(event, target);
  }

  static async _onRemoveNpcActionCritStatus(event, target) {
    return this.actionHandler?.removeNpcActionCritStatus(event, target);
  }

  // ===========================
  // SHARED UI ACTION HANDLERS
  // ===========================
  // These methods are NOT delegated - they're truly shared UI logic

  /**
   * Handle changing a Document's image
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @returns {Promise}
   * @protected
   */
  static async _onEditImage(event, target) {
    const attr = target.dataset.edit;
    const current = foundry.utils.getProperty(this.document, attr);
    const { img } =
      this.document.constructor.getDefaultArtwork?.(this.document.toObject()) ??
      {};
    const FilePickerClass = foundry.applications.apps.FilePicker.implementation ?? foundry.applications.apps.FilePicker;
    const fp = new FilePickerClass({
      current,
      type: 'image',
      redirectToRoot: img ? [img] : [],
      callback: (path) => {
        this.document.update({ [attr]: path });
      },
      top: this.position.top + 40,
      left: this.position.left + 10,
    });
    return fp.browse();
  }

  /**
   * Handle viewing the character's ancestry item
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _viewAncestry(event, target) {
    const ancestry = this.actor.items.find(item => item.type === 'ancestry');
    if (ancestry) {
      ancestry.sheet.render(true);
    }
  }

  /**
   * Handle viewing the character's class item
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _viewClass(event, target) {
    const classItem = this.actor.items.find(item => item.type === 'class');
    if (classItem) {
      classItem.sheet.render(true);
    }
  }

  static async _onLevelUp(event, target) {
    new LevelUpDialog(this.actor).render(true);
  }

  /**
   * Toggle feature accordion
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onToggleFeature(event, target) {
    const accordion = target.closest('.feature.accordion-item');
    AccordionHelper.toggle(accordion);
  }

  /**
   * Toggle trait accordion
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onToggleTrait(event, target) {
    const accordion = target.closest('.trait.accordion-item');
    AccordionHelper.toggle(accordion);
  }

  /**
   * Toggle perk accordion
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onTogglePerk(event, target) {
    const accordion = target.closest('.perk-card.accordion-item');
    AccordionHelper.toggle(accordion);
  }

  /**
   * Toggle sliding panel
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onTogglePanel(event, target) {
    const panel = this.element.querySelector('.sliding-panel');
    if (!panel) return;

    const isOpen = panel.classList.contains('panel-open');

    // Force a reflow to ensure the browser recognizes the current state
    // before applying the transition
    void panel.offsetHeight;

    // Use requestAnimationFrame to ensure smooth transition
    requestAnimationFrame(() => {
      // Toggle classes for smooth CSS transition
      if (isOpen) {
        panel.classList.remove('panel-open');
        panel.classList.add('panel-closed');
      } else {
        panel.classList.remove('panel-closed');
        panel.classList.add('panel-open');
      }
    });

    // Save state to flag — suppress re-render so the CSS transition plays out
    this._suppressRender = true;
    await this.actor.setFlag('vagabond', 'isPanelOpen', !isOpen);
    this._suppressRender = false;

    // Hide the tooltip after first use
    this._hideSlidingPanelTooltip();
  }

  /**
   * Show sliding panel tooltip (first time only)
   * @private
   */
  _showSlidingPanelTooltip() {
    // Only show for character sheets
    if (this.actor.type !== 'character') return;

    // Check if user has already seen the tooltip
    const hasSeenTooltip = game.user.getFlag('vagabond', 'hasSeenPanelTooltip');
    if (hasSeenTooltip) return;

    const clickZone = this.element.querySelector('.panel-click-zone');
    if (!clickZone) return;

    // Add highlight class to click zone
    clickZone.classList.add('tooltip-active');

    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'sliding-panel-tooltip';
    tooltip.innerHTML = `
      <div class="tooltip-arrow"></div>
      <div class="tooltip-content">
        Click anywhere on this area to open/close
      </div>
    `;

    // Add tooltip to click zone (absolute positioning relative to click zone)
    clickZone.appendChild(tooltip);

    // Add visible class after a short delay for animation
    setTimeout(() => tooltip.classList.add('visible'), 100);
  }

  /**
   * Hide sliding panel tooltip and mark as seen
   * @private
   */
  _hideSlidingPanelTooltip() {
    const tooltip = this.element.querySelector('.sliding-panel-tooltip');
    const clickZone = this.element.querySelector('.panel-click-zone');
    
    if (!tooltip) return;

    // Remove highlight class from click zone
    if (clickZone) {
      clickZone.classList.remove('tooltip-active');
    }

    // Fade out
    tooltip.classList.remove('visible');

    // Remove after animation
    setTimeout(() => {
      if (tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    }, 300);

    // Mark as seen permanently
    game.user.setFlag('vagabond', 'hasSeenPanelTooltip', true);
  }

  /**
   * Toggle NPC effects accordion
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onToggleEffectsAccordion(event, target) {
    const accordion = target.closest('.npc-effects.accordion-item');
    AccordionHelper.toggle(accordion);
  }

  /**
   * Toggle NPC lock state
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onToggleLock(event, target) {
    const currentState = this.actor.system.locked ?? false;
    await this.actor.update({ 'system.locked': !currentState });
  }

  /**
   * Toggle NPC description visibility (locked mode)
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static _onToggleDescription(event, target) {
    const descRow = this.element.querySelector('.npc-description-collapsible');
    if (descRow) {
      descRow.classList.toggle('collapsed');
      descRow.classList.toggle('open');
    }
  }

  /**
   * Open downtime activities application
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onOpenDowntime(event, target) {
    DowntimeApp.open(this.actor);
  }

  /**
   * Open the Crafting Workbench for this actor.
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onOpenWorkbench(event, target) {
    WorkbenchApp.open(this.actor);
  }

  /**
   * Whether this sheet offers a Compact view (header button `becomeHud`).
   * Character → Character HUD, NPC → NPC HUD, party → Party compact view.
   * Each compact view has a top-left corner tab that swaps back to the sheet.
   * @returns {boolean}
   * @protected
   */
  _hasCompactView() { return false; }

  /**
   * @override
   * Compact view: a visible header button (left of the controls kebab) that
   * swaps this sheet for its compact view (`becomeHud`).
   */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    const header = frame.querySelector('.window-header');
    if (this._hasCompactView() && header && !header.querySelector('[data-action="becomeHud"]')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'header-control icon fa-solid fa-down-left-and-up-right-to-center';
      btn.dataset.action = 'becomeHud';
      btn.dataset.tooltip = game.i18n.localize('VAGABOND.Hud.BecomeTooltip');
      btn.setAttribute('aria-label', game.i18n.localize('VAGABOND.Hud.Become'));
      const anchor = header.querySelector('[data-action="toggleControls"]')
        ?? header.querySelector('[data-action="close"]');
      header.insertBefore(btn, anchor);
    }
    return frame;
  }

  /**
   * Close this sheet and open the compact view for the same actor (Character
   * HUD / NPC HUD / Party compact view).
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   * @protected
   */
  static async _onBecomeHud(event, target) {
    const actor = this.actor;
    const view = { character: VagabondCharacterHud, npc: VagabondNPCHud, party: PartyCompactView }[actor.type];
    if (!view) return;
    await this.close();
    view.open(actor);
  }

  /**
   * Open character builder application
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onOpenCharBuilder(event, target) {
    const builder = new VagabondCharBuilder(this.actor);
    builder.render(true);
  }

  /**
   * Dismiss character builder permanently
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onDismissCharBuilder(event, target) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'Dismiss Character Builder' },
      content: '<p>Are you sure you want to dismiss the character builder? This will hide the prompt permanently.</p>',
    });

    if (confirmed) {
      await this.actor.setFlag('vagabond', 'dismissedCharBuilder', true);
      this.render();
    }
  }

  // ===========================
  // GENERIC DOCUMENT ACTIONS
  // ===========================

  /**
   * View an embedded document
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _viewDoc(event, target) {
    const doc = this._getEmbeddedDocument(target, this.actor);
    if (doc) doc.sheet.render(true);
  }

  /**
   * Delete an embedded document
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _deleteDoc(event, target) {
    const doc = this._getEmbeddedDocument(target, this.actor);
    if (!doc) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Delete ${doc.name}?` },
      content: `<p>Are you sure you want to delete ${doc.name}?</p>`,
    });

    if (confirmed) {
      await doc.delete();
    }
  }

  /**
   * Create a new embedded document
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _createDoc(event, target) {
    const { documentClass, type } = target.dataset;

    let docData;

    if (documentClass === 'ActiveEffect') {
      // Use the working approach from item-sheet.mjs
      const aeCls = getDocumentClass('ActiveEffect');
      
      docData = {
        name: aeCls.defaultName({
          type: target.dataset.type,
          parent: this.actor,
        }),
      };

      // Process all data attributes like the working _createEffect method
      for (const [dataKey, value] of Object.entries(target.dataset)) {
        // Skip reserved attributes
        if (['action', 'documentClass'].includes(dataKey)) continue;
        foundry.utils.setProperty(docData, dataKey, value);
      }
      
      // Use createEmbeddedDocuments for proper embedding
      return await this.actor.createEmbeddedDocuments('ActiveEffect', [docData]);
    } else {
      // Existing Item creation logic
      docData = {
        name: type ? `New ${type}` : 'New Document',
      };

      if (type) {
        docData.type = type;
      }
      
      return await this.actor.createEmbeddedDocuments('Item', [docData]);
    }
  }

  // ===========================
  // Effects list (Active / Inactive switch rows)
  // ===========================

  /**
   * Flip an effect on/off from its row switch.
   * Status conditions turn OFF by being removed (with their linked countdown dice) — they
   * cannot sit in the Inactive list; every other effect toggles its `disabled` flag.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   * @protected
   */
  /** GM eye on an inventory card (ItemDisguiseApp.toggle; Shift = reveal without a chat card). */
  static _onToggleItemDisguise(event, target) {
    event.stopPropagation();
    const item = this.actor.items.get(target.dataset.itemId);
    if (item) ItemDisguiseApp.toggle(item, { announce: !event.shiftKey });
  }

  /**
   * Right-click anywhere on an effect row opens the same menu as the kebab button.
   * Bound once on the window root (survives partial part re-renders).
   * @override
   */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.element.addEventListener('contextmenu', (event) => {
      const row = event.target.closest?.('.fx-row');
      if (!row || event.target.closest('input, textarea, select, a[href]')) return;
      event.preventDefault();
      event.stopPropagation();
      ActorSheetEffects._openEffectMenu(this, row, { x: event.clientX, y: event.clientY });
    });
  }

  /**
   * Instance-side alias of the static resolver. AppV2 actions run with `this` = the sheet
   * instance, so `this._getEmbeddedDocument(...)` in static action handlers needs this.
   * @param {HTMLElement} target
   * @param {Actor} [actor]
   * @returns {Document|null}
   * @protected
   */
  _getEmbeddedDocument(target, actor = this.actor) {
    return this.constructor._getEmbeddedDocument(target, actor);
  }

  /**
   * Get embedded document from target element
   * @param {HTMLElement} target - The target element
   * @param {Actor} actor - The actor instance
   * @returns {Document|null} The embedded document
   * @private
   */
  static _getEmbeddedDocument(target, actor) {
    const li = target.closest('[data-effect-id], [data-item-id], [data-document-id]');
    if (!li) return null;

    const { effectId, itemId, parentId, documentId, documentClass } = li.dataset;

    // Determine the document ID and class
    let docId, docClass;
    if (effectId) {
      docId = effectId;
      docClass = 'ActiveEffect';
    } else if (itemId) {
      docId = itemId;
      docClass = 'Item';
    } else if (documentId) {
      docId = documentId;
      docClass = documentClass;
    } else {
      return null;
    }

    // ActiveEffects may live on the actor OR on an embedded item
    if (docClass === 'ActiveEffect') {
      // 1. Check the actor's own effects first
      const actorEffect = actor.effects.get(docId);
      if (actorEffect) return actorEffect;

      // 2. If the template told us which item owns it, check there first
      if (parentId && parentId !== actor.id) {
        const parentItem = actor.items.get(parentId);
        const itemEffect = parentItem?.effects.get(docId);
        if (itemEffect) return itemEffect;
      }

      // 3. Fallback: search every item's effect collection
      for (const item of actor.items) {
        const effect = item.effects.get(docId);
        if (effect) return effect;
      }

      return null;
    }

    // Map document class names to collection names
    const collectionMap = {
      'Item': 'items',
    };

    const collectionName = collectionMap[docClass] || docClass;
    const collection = actor[collectionName];
    return collection?.get(docId);
  }

  // ===========================
  // FORM SUBMISSION
  // ===========================

  /**
   * Submit a document update based on the processed form data
   * @param {SubmitEvent} event - The originating form submission event
   * @param {HTMLFormElement} form - The form element that was submitted
   * @param {object} submitData - Processed and validated form data
   * @returns {Promise<void>}
   * @protected
   * @override
   */
  async _processSubmitData(event, form, submitData) {
    const overrides = foundry.utils.flattenObject(this.actor.overrides);
    for (let k of Object.keys(overrides)) delete submitData[k];
    await this.document.update(submitData);
  }

  /**
   * Disable inputs subject to active effects
   * @private
   */
  #disableOverrides() {
    const flatOverrides = foundry.utils.flattenObject(this.actor.overrides);
    for (const override of Object.keys(flatOverrides)) {
      const input = this.element.querySelector(`[name="${override}"]`);
      if (input) {
        input.disabled = true;
      }
    }
  }

  // ===========================
  // DRAG & DROP
  // ===========================

  /**
   * Handle drop events
   * @param {DragEvent} event - The originating drop event
   * @override
   */
  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.getDragEventData(event);

    if (data.type === 'Item') {
      return this._onDropItem(event, data);
    } else if (data.type === 'ContainerItem') {
      return this._onDropContainerItem(event, data);
    } else if (data.type === 'ActiveEffect') {
      return this._onDropActiveEffect(event, data);
    } else if (data.type === 'Actor') {
      return this._onDropActor(event, data);
    } else if (data.type === 'Folder') {
      return this._onDropFolder(event, data);
    }

    return super._onDrop(event);
  }

  /** Item drops: see ActorDrop.item (shared with the Character HUD). */
  async _onDropItem(event, data) {
    return ActorDrop.item(this, event, data);
  }

  /** Container entry drops: see ActorDrop.containerItem. */
  async _onDropContainerItem(event, data) {
    return ActorDrop.containerItem(this, event, data);
  }




  /**
   * Handle dropping an active effect
   * @param {DragEvent} event - The originating drop event
   * @param {Object} data - The drop data
   * @private
   */
  async _onDropActiveEffect(event, data) {
    const effect = await ActiveEffect.implementation.fromDropData(data);
    if (!this.actor.isOwner || !effect) return false;

    if (this.actor.uuid === effect.parent?.uuid) {
      return this._onSortActiveEffect(event, effect);
    }

    return ActiveEffect.create(effect.toObject(), { parent: this.actor });
  }

  /**
   * Handle sorting an active effect
   * @param {DragEvent} event - The originating drop event
   * @param {ActiveEffect} effect - The active effect
   * @private
   */
  async _onSortActiveEffect(event, effect) {
    const effects = this.actor.effects.contents;

    const sortUpdates = foundry.utils.performIntegerSort(effect, {
      target: event.target,
      siblings: effects,
    });

    const updateData = sortUpdates.map(u => {
      const update = u.update;
      update._id = u.target._id;
      return update;
    });

    return this.actor.updateEmbeddedDocuments('ActiveEffect', updateData);
  }

  /**
   * Handle dropping an actor
   * @param {DragEvent} event - The originating drop event
   * @param {Object} data - The drop data
   * @private
   */
  async _onDropActor(event, data) {
    // Currently does nothing
    return false;
  }

  /** Folder drops: see ActorDrop.folder. */
  async _onDropFolder(event, data) {
    return ActorDrop.folder(this, event, data);
  }
}
