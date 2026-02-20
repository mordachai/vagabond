import { prepareActiveEffectCategories } from '../helpers/effects.mjs';
import { VagabondChatHelper } from '../helpers/chat-helper.mjs';
import { VagabondChatCard } from '../helpers/chat-card.mjs';
import { VagabondCharBuilder } from '../applications/char-builder/index.mjs';
import { VagabondTextParser } from '../helpers/text-parser.mjs';
import { AccordionHelper } from '../helpers/accordion-helper.mjs';
import { ContextMenuHelper } from '../helpers/context-menu-helper.mjs';
import { EnrichmentHelper } from '../helpers/enrichment-helper.mjs';
import { EquipmentHelper } from '../helpers/equipment-helper.mjs';

const { api, sheets } = foundry.applications;

/**
 * Base ActorSheet for Vagabond system
 * Extended by VagabondCharacterSheet and VagabondNPCSheet
 *
 * REFACTORED: Phase 4 - Most action handlers now delegate to specialized handlers
 * initialized in child classes (spellHandler, rollHandler, equipmentHandler, etc.)
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
      toggleEffect: this._toggleEffect,
      // Roll actions - delegated to rollHandler
      roll: this._onRoll,
      rollWeapon: this._onRollWeapon,
      useItem: this._onUseItem,
      rollMorale: this._onRollMorale,
      // Equipment actions - delegated to equipmentHandler
      toggleWeaponEquipment: this._onToggleWeaponEquipment,
      toggleWeaponGrip: this._onToggleWeaponGrip,
      toggleArmorEquipment: this._onToggleArmorEquipment,
      equipItem: this._onEquipItem,
      editItem: this._onEditItem,
      deleteItem: this._onDeleteItem,
      // Spell actions - delegated to spellHandler
      castSpell: this._onCastSpell,
      toggleFx: this._onToggleFx,
      toggleSpellFavorite: this._onToggleSpellFavorite,
      toggleSpellPreview: this._onToggleSpellPreview,
      toggleSpellAccordion: this._onToggleSpellAccordion,
      // Character-specific UI actions (handled in base class)
      viewAncestry: this._viewAncestry,
      viewClass: this._viewClass,
      levelUp: this._onLevelUp,
      toggleFeature: this._onToggleFeature,
      toggleTrait: this._onToggleTrait,
      togglePerk: this._onTogglePerk,
      togglePanel: this._onTogglePanel,
      toggleFavorHinder: this._onToggleFavorHinder,
      statusClick: this._onStatusClick,
      spendLuck: this._onSpendLuck,
      spendStudiedDie: this._onSpendStudiedDie,
      modifyCheckBonus: { handler: this._onModifyCheckBonus, buttons: [0, 2] },
      modifyMana: this._onModifyMana,
      openDowntime: this._onOpenDowntime,
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
      selectZone: this._onSelectZone,
      clearZone: this._onClearZone,
      // NPC action/ability actions - delegated to actionHandler
      addAction: this._onAddAction,
      removeAction: this._onRemoveAction,
      toggleActionAccordion: this._onToggleActionAccordion,
      addAbility: this._onAddAbility,
      removeAbility: this._onRemoveAbility,
      clickAbilityName: this._onClickAbilityName,
      toggleAbilityAccordion: this._onToggleAbilityAccordion,
      clickActionName: this._onClickActionName,
      clickActionDamageRoll: this._onClickActionDamageRoll,
      createCountdownFromRecharge: this._onCreateCountdownFromRecharge,
      toggleDescription: this._onToggleDescription,
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
      options.parts = ['tabs', 'features', 'spells', 'effects', 'slidingPanel'];
    } else if (isNPC) {
      options.parts = ['npcHeader', 'npcContent'];
    }

    // Handle limited view permissions
    if (this.document.limited) {
      options.parts = isCharacter ? ['slidingPanel'] : ['npcHeader'];
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

      // Panel state
      context.isPanelOpen = this.actor.getFlag('vagabond', 'isPanelOpen') ?? true;

      // Check for equipped items and favorited spells for Sliding Panel
      context.hasEquippedItems =
        (context.weapons && context.weapons.some(i => i.system.equipped)) ||
        (context.gear && context.gear.some(i => i.system.equipped)) ||
        (context.armor && context.armor.some(i => i.system.worn));

      context.hasFavoritedSpells = context.spells && context.spells.some(i => i.system.favorite);

      // Prepare equipped armor type for header display
      const equippedArmor = this.actor.items.find(item => {
        const isArmor = (item.type === 'armor') ||
                       (item.type === 'equipment' && item.system.equipmentType === 'armor');
        return isArmor && item.system.equipped;
      });
      context.equippedArmorType = equippedArmor ? equippedArmor.system.armorTypeDisplay : '-';

      // Prepare fatigue boxes (dynamic max from setting + bonus)
      const fatigue = this.actor.system.fatigue || 0;
      const fatigueMax = this.actor.system.fatigueMax || 5;
      context.fatigueBoxes = Array.from({ length: fatigueMax }, (_, i) => ({
        checked: i < fatigue,
        level: i + 1
      }));

      // Prepare status effects for display
      context.statusEffects = this._prepareStatusEffects();
    }

    // Prepare active effects (include effects from all sources, including class items)
    const allEffects = this.actor.allApplicableEffects();
    context.effects = prepareActiveEffectCategories(allEffects);

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
        break;
    }

    return partContext;
  }

  /**
   * Get tabs configuration
   * @param {Array} parts - Rendered parts
   * @returns {Object} Tab configurations keyed by partId
   * @private
   */
  _getTabs(parts) {
    const tabGroup = 'primary';

    // Default tab for first time it's rendered this session
    if (!this.tabGroups[tabGroup]) this.tabGroups[tabGroup] = 'features';

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
   * Prepare items for rendering
   * @param {Object} context - Render context
   * @private
   */
  /**
   * Prepare status effects for display
   * Only includes status conditions from CONFIG.statusEffects (not item effects)
   * @returns {Array} Array of status effect data
   * @private
   */
  _prepareStatusEffects() {
    const effects = [];

    // Get valid status IDs from CONFIG.statusEffects
    const validStatusIds = new Set(
      CONFIG.statusEffects?.map(s => s.id) || []
    );

    // Get all active effects
    for (const effect of this.actor.effects) {
      if (effect.disabled) continue; // Skip disabled effects

      // Only include effects that have a status matching our defined status conditions
      const hasValidStatus = Array.from(effect.statuses || []).some(statusId =>
        validStatusIds.has(statusId)
      );

      if (!hasValidStatus) continue; // Skip non-status effects (item effects, etc.)

      effects.push({
        id: effect.id,
        uuid: effect.uuid,
        name: effect.name || effect.label || 'Unknown',
        icon: effect.img || 'icons/svg/aura.svg',
        description: effect.description || '',
        statuses: Array.from(effect.statuses || [])
      });
    }

    return effects;
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
          // Get features for current level and below
          if (item.system.levelFeatures) {
            const classFeatures = item.system.levelFeatures
              .filter(f => f.level <= currentLevel)
              .map((f, index) => ({
                ...f,
                index: index,
                _id: `${item.id}-feature-${index}`,
                sourceItem: item
              }));
            context.features.push(...classFeatures);
          }
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
    this._setupAccordionClickOutside();

    // Setup HP and Fatigue click handlers
    this._setupHealthFatigueListeners();

    // Setup ancestry/class right-click delete handlers
    this._setupAncestryClassHandlers();

    // Setup mana right-click handlers
    this._setupManaHandlers();

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
      this._setupFeatureContextMenuListeners();
    }

    // Setup panel favorites context menu listeners
    this._setupPanelContextMenuListeners();

    // Setup status icon listeners
    this._setupStatusIconListeners();

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
    return this.rollHandler?.rollWeapon(event, target);
  }

  static async _onUseItem(event, target) {
    return this.rollHandler?.useItem(event, target);
  }

  static async _onRollMorale(event, target) {
    return this.rollHandler?.rollMorale(event, target);
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

  static async _onToggleAbilityAccordion(event, target) {
    return this.actionHandler?.toggleAbilityAccordion(event, target);
  }

  static async _onCreateCountdownFromRecharge(event, target) {
    return this.actionHandler?.createCountdownFromRecharge(event, target);
  }

  /**
   * Handle clicking NPC action name (posts to chat)
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onClickActionName(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.index);
    const action = this.actor.system.actions[index];

    if (!action || !action.name) return;

    // Capture targeted tokens for NPC action
    const targetsAtRollTime = Array.from(game.user.targets).map(token => ({
      tokenId: token.id,
      sceneId: token.scene.id,
      actorId: token.actor?.id,
      actorName: token.name,
      actorImg: token.document.texture.src
    }));

    // Use the unified chat card system
    await VagabondChatCard.npcAction(this.actor, action, index, targetsAtRollTime);
  }

  /**
   * Handle clicking NPC action damage roll (rolls damage dice)
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onClickActionDamageRoll(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.index);
    const action = this.actor.system.actions[index];

    if (!action || !action.rollDamage) return;

    // Roll the damage dice
    const roll = new Roll(action.rollDamage, this.actor.getRollData());
    await roll.evaluate();
    await VagabondChatHelper.postRoll(
      this.actor,
      roll,
      `<strong>${action.name}</strong> Damage`
    );
  }

  /**
   * Handle clicking NPC ability name (posts to chat)
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onClickAbilityName(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.index);
    const ability = this.actor.system.abilities[index];

    if (!ability || !ability.name) return;

    // Use the unified chat card system (handles text-only abilities)
    await VagabondChatCard.npcAction(this.actor, ability, index);
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
    const fp = new FilePicker({
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

  /**
   * Handle leveling up the character
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onLevelUp(event, target) {
    const { LevelUpDialog } = globalThis.vagabond.applications;
    new LevelUpDialog(this.actor).render(true);
  }

  /**
   * Legacy level up logic (kept for reference, replaced by LevelUpDialog)
   * @deprecated Use LevelUpDialog instead
   */
  static async _onLevelUpLegacy(event, target) {
    const currentLevel = this.actor.system.attributes.level.value;
    const newLevel = currentLevel + 1;

    // Store previous values for comparison
    const previousMaxHP = this.actor.system.health.max;
    const previousMaxMana = this.actor.system.mana.max;
    const previousCastingMax = this.actor.system.mana.castingMax;

    // Get class item for spell amount calculation
    const classItem = this.actor.items.find(item => item.type === 'class');
    let previousSpellAmount = 0;
    if (classItem && classItem.system.levelSpells) {
      const currentLevelSpells = classItem.system.levelSpells.find(ls => ls.level === currentLevel);
      if (currentLevelSpells) {
        previousSpellAmount = currentLevelSpells.spells;
      }
    }

    try {
      // Update level and reset XP to 0
      await this.actor.update({ 
        'system.attributes.level.value': newLevel,
        'system.attributes.xp': 0
      });

      // Calculate changes after level up
      const newMaxHP = this.actor.system.health.max;
      const hpChange = newMaxHP - previousMaxHP;
      
      const newMaxMana = this.actor.system.mana.max;
      const manaChange = newMaxMana - previousMaxMana;
      
      const newCastingMax = this.actor.system.mana.castingMax;
      const castingMaxChange = newCastingMax - previousCastingMax;

      // Calculate new spell amount
      let newSpellAmount = 0;
      if (classItem && classItem.system.levelSpells) {
        const newLevelSpells = classItem.system.levelSpells.find(ls => ls.level === newLevel);
        if (newLevelSpells) {
          newSpellAmount = newLevelSpells.spells;
        }
      }
      const spellAmountChange = newSpellAmount - previousSpellAmount;

      // Get features gained at the new level
      const newFeatures = [];
      if (classItem && classItem.system.levelFeatures) {
        const featuresAtNewLevel = classItem.system.levelFeatures.filter(f => f.level === newLevel);
        newFeatures.push(...featuresAtNewLevel);
      }

      // Check if character is a spellcaster
      const isSpellcaster = this.actor.system.attributes.isSpellcaster;

      // Build metadata tags for the level up card
      const tags = [];
      tags.push({ label: game.i18n.format('VAGABOND.LevelUp.NewLevel', { level: newLevel }), cssClass: 'tag-level', icon: 'fas fa-arrow-up' });

      // Build description content
      let description = ``;
      
      // Max HP
      description += `<p><strong>${game.i18n.localize('VAGABOND.LevelUp.MaxHP')}</strong> ${previousMaxHP} → ${newMaxHP}`;
      if (hpChange !== 0) {
        description += ` (${hpChange >= 0 ? '+' : ''}${hpChange})`;
      }
      description += `</p>`;

      // Mana information (only for spellcasters)
      if (isSpellcaster) {
        description += `<p><strong>${game.i18n.localize('VAGABOND.LevelUp.MaxMana')}</strong> ${previousMaxMana} → ${newMaxMana}`;
        if (manaChange !== 0) {
          description += ` (${manaChange >= 0 ? '+' : ''}${manaChange})`;
        }
        description += `</p>`;

        description += `<p><strong>${game.i18n.localize('VAGABOND.LevelUp.ManaPerCast')}</strong> ${previousCastingMax} → ${newCastingMax}`;
        if (castingMaxChange !== 0) {
          description += ` (${castingMaxChange >= 0 ? '+' : ''}${castingMaxChange})`;
        }
        description += `</p>`;
      }

      // Spell Amount
      description += `<p><strong>${game.i18n.localize('VAGABOND.LevelUp.SpellAmount')}</strong> ${previousSpellAmount} → ${newSpellAmount}`;
      if (spellAmountChange !== 0) {
        description += ` (${spellAmountChange >= 0 ? '+' : ''}${spellAmountChange})`;
      }
      description += `</p>`;

      // New Features
      if (newFeatures.length > 0) {
        description += `
          <div class="features-section">
            <div class="features-header-container">
              <div class="features-header-arrow">
                <span>${game.i18n.localize('VAGABOND.LevelUp.NewFeatures')}</span>
              </div>
            </div>
            <div class="features-content">
              ${newFeatures.map(feature => `
                <div class="feature-item">
                  <h4>${feature.name}</h4>
                  ${feature.description ? `<p>${feature.description}</p>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      // Create level up chat card using VagabondChatCard
      const card = new VagabondChatCard()
        .setType('level-up')
        .setActor(this.actor)
        .setTitle(game.i18n.localize('VAGABOND.LevelUp.Title'))
        .setSubtitle(this.actor.name)
        .setDescription(description);

      // Set metadata tags
      card.data.standardTags = tags;

      // Send the card
      await card.send();

      // Update notification message to include mana if applicable
      let notificationMessage = game.i18n.format('VAGABOND.LevelUp.NotificationLevelUp', { 
        name: this.actor.name, 
        level: newLevel, 
        hpChange: hpChange 
      });
      
      if (isSpellcaster) {
        notificationMessage += game.i18n.format('VAGABOND.LevelUp.NotificationMana', { manaChange: manaChange });
      }
      
      if (spellAmountChange > 0) {
        notificationMessage += game.i18n.format('VAGABOND.LevelUp.NotificationSpells', { 
          spellCount: spellAmountChange,
          plural: spellAmountChange > 1 ? 's' : ''
        });
      }
      
      if (newFeatures.length > 0) {
        notificationMessage += game.i18n.format('VAGABOND.LevelUp.NotificationFeatures', { 
          featureCount: newFeatures.length,
          plural: newFeatures.length > 1 ? 's' : ''
        });
      }
      
      ui.notifications.info(notificationMessage);

    } catch (error) {
      console.error(game.i18n.localize('VAGABOND.LevelUp.ErrorConsoleMessage'), error);
      ui.notifications.error(game.i18n.format('VAGABOND.LevelUp.ErrorLevelUpFailed', { error: error.message }));
    }
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
   * Handle status icon click - send to chat
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onStatusClick(event, target) {
    const effectId = target.dataset.effectId;
    if (!effectId) return;

    const effect = this.actor.effects.get(effectId);
    if (!effect) return;

    const { VagabondChatCard } = globalThis.vagabond.utils;
    await VagabondChatCard.statusEffect(this.actor, effect);
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
   * Toggle favor/hinder state
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onToggleFavorHinder(event, target) {
    const currentState = this.actor.system.favorHinder || 'none';
    const states = Object.keys(CONFIG.VAGABOND.favorHinderStates);
    const currentIndex = states.indexOf(currentState);
    const nextIndex = (currentIndex + 1) % states.length;
    const newState = states[nextIndex];

    await this.actor.update({ 'system.favorHinder': newState });
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
   * Spend or recharge luck
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onSpendLuck(event, target) {
    event.preventDefault();
    const currentLuck = this.actor.system.currentLuck || 0;
    // Use maxLuck which equals luck stat total (includes bonuses)
    const maxLuck = this.actor.system.maxLuck || 0;

    if (event.shiftKey) {
      // Shift+Click: Recharge to max
      await this.actor.update({ 'system.currentLuck': maxLuck });
      await VagabondChatCard.luckRecharge(this.actor, maxLuck);
    } else {
      // Regular Click: Spend (decrement)
      if (currentLuck > 0) {
        const newLuck = currentLuck - 1;
        await this.actor.update({ 'system.currentLuck': newLuck });
        await VagabondChatCard.luckSpend(this.actor, newLuck, maxLuck);
      }
    }
  }

  /**
   * Spend or add studied die
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onSpendStudiedDie(event, target) {
    event.preventDefault();
    const currentDice = this.actor.system.studiedDice || 0;

    if (event.shiftKey) {
      // Shift+Click: Add a studied die
      const newCount = currentDice + 1;
      await this.actor.update({ 'system.studiedDice': newCount });
      await VagabondChatCard.studiedDieGain(this.actor, newCount);
    } else {
      // Regular Click: Spend (roll d6 and decrement)
      if (currentDice > 0) {
        // Roll the d6
        const roll = new Roll('1d6');
        await roll.evaluate();

        const remainingDice = currentDice - 1;
        await this.actor.update({ 'system.studiedDice': remainingDice });
        await VagabondChatCard.studiedDieSpend(this.actor, roll, remainingDice);
      }
    }
  }

  /**
   * Modify universal check bonus
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onModifyCheckBonus(event, target) {
    event.preventDefault();
    const currentBonus = this.actor.system.manualCheckBonus || 0;

    // Left click: +1, Right click: -1
    if (event.button === 2 || event.type === 'contextmenu') {
      // Right click: decrement
      const newBonus = currentBonus - 1;
      await this.actor.update({ 'system.manualCheckBonus': newBonus });
    } else {
      // Left click: increment
      const newBonus = currentBonus + 1;
      await this.actor.update({ 'system.manualCheckBonus': newBonus });
    }
  }

  /**
   * Modify mana (spend or restore)
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onModifyMana(event, target) {
    event.preventDefault();
    const currentMana = this.actor.system.mana.current || 0;
    const maxMana = this.actor.system.mana.max || 0;

    // Left click: spend mana (decrement), Right click: restore mana (increment)
    if (event.button === 2 || event.type === 'contextmenu') {
      // Right click: restore (increment)
      const newMana = Math.min(currentMana + 1, maxMana);
      await this.actor.update({ 'system.mana.current': newMana });
    } else {
      // Left click: spend (decrement)
      const newMana = Math.max(currentMana - 1, 0);
      await this.actor.update({ 'system.mana.current': newMana });
    }
  }

  /**
   * Open downtime activities application
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onOpenDowntime(event, target) {
    new globalThis.vagabond.applications.DowntimeApp(this.actor).render(true);
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

  /**
   * Toggle active effect enabled state
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _toggleEffect(event, target) {
    const effect = this._getEmbeddedDocument(target, this.actor);
    if (effect) {
      await effect.update({ disabled: !effect.disabled });
    }
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

    const { effectId, itemId, documentId, documentClass } = li.dataset;
    
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

    // Map document class names to collection names
    const collectionMap = {
      'Item': 'items',
      'ActiveEffect': 'effects',
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
   * Setup HP and Fatigue click handlers
   * @private
   */
  _setupHealthFatigueListeners() {
    // Add fatigue skull click handlers
    const fatigueSkulls = this.element.querySelectorAll('.fatigue-skull');
    fatigueSkulls.forEach((skull, index) => {
      skull.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentFatigue = this.actor.system.fatigue || 0;
        const fatigueMax = this.actor.system.fatigueMax || 5;

        // If clicking on an active skull, reduce fatigue to that index
        // If clicking on an inactive skull, increase fatigue to index + 1
        const newFatigue = Math.min((index + 1 === currentFatigue) ? index : index + 1, fatigueMax);

        await this.actor.update({ 'system.fatigue': newFatigue });

        // Auto-apply/remove Fatigued status effect based on fatigue value
        const hasFatiguedStatus = this.actor.effects.some(e => e.statuses.has('fatigued'));

        if (newFatigue > 0 && !hasFatiguedStatus) {
          // Apply Fatigued status when fatigue > 0
          await this.actor.toggleStatusEffect('fatigued', { active: true });
        } else if (newFatigue === 0 && hasFatiguedStatus) {
          // Remove Fatigued status when fatigue = 0
          await this.actor.toggleStatusEffect('fatigued', { active: false });
        }
      });
    });

    // Add HP heart icon click handlers for PC and NPC
    const hpIcons = this.element.querySelectorAll('.hp-icon, .npc-hp-heart-icon');
    hpIcons.forEach(hpIcon => {
      // Left-click: decrement HP
      hpIcon.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentHP = this.actor.system.health.value || 0;
        const newHP = Math.max(currentHP - 1, 0);

        // Trigger heartbeat animation
        hpIcon.classList.add('heartbeat');
        setTimeout(() => hpIcon.classList.remove('heartbeat'), 300);

        await this.actor.update({ 'system.health.value': newHP });
      });

      // Right-click: increment HP
      hpIcon.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentHP = this.actor.system.health.value || 0;
        const maxHP = this.actor.system.health.max || 10;
        const newHP = Math.min(currentHP + 1, maxHP);

        // Trigger heartbeat animation
        hpIcon.classList.add('heartbeat');
        setTimeout(() => hpIcon.classList.remove('heartbeat'), 300);

        await this.actor.update({ 'system.health.value': newHP });
      });
    });
  }

  /**
   * Setup ancestry and class right-click delete handlers
   * @private
   */
  _setupAncestryClassHandlers() {
    // Ancestry right-click to delete
    const ancestryElement = this.element.querySelector('.ancestry-name');
    if (ancestryElement) {
      ancestryElement.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const itemId = ancestryElement.dataset.itemId;
        if (!itemId) return;

        const item = this.actor.items.get(itemId);
        if (!item) return;

        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: game.i18n.localize('VAGABOND.Dialog.DeleteItem') },
          content: `<p>Are you sure you want to remove ${item.name}?</p>`,
        });

        if (confirmed) {
          await item.delete();
          ui.notifications.info(`Removed ${item.name}`);
        }
      });
    }

    // Class right-click to delete
    const classElement = this.element.querySelector('.class-name');
    if (classElement) {
      classElement.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const itemId = classElement.dataset.itemId;
        if (!itemId) return;

        const item = this.actor.items.get(itemId);
        if (!item) return;

        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: game.i18n.localize('VAGABOND.Dialog.DeleteItem') },
          content: `<p>Are you sure you want to remove ${item.name}?</p>`,
        });

        if (confirmed) {
          await item.delete();
          ui.notifications.info(`Removed ${item.name}`);
        }
      });
    }
  }

  /**
   * Setup right-click handlers for mana
   * @private
   */
  _setupManaHandlers() {
    const manaElement = this.element.querySelector('[data-action="modifyMana"]');
    if (manaElement) {
      manaElement.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        // Call the static _onModifyMana method with the contextmenu event
        await this.constructor._onModifyMana.call(this, event, manaElement);
      });
    }
  }

  /**
   * Setup context menu listeners for features, traits, and perks
   * @private
   */
  _setupFeatureContextMenuListeners() {
    // Feature headers (from class)
    const featureHeaders = this.element.querySelectorAll('.feature-header');
    featureHeaders.forEach(header => {
      header.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const featureItem = header.closest('[data-feature-index]');
        if (!featureItem) return;

        const featureIndex = parseInt(featureItem.dataset.featureIndex);
        if (isNaN(featureIndex)) return;

        await this.inventoryHandler.showFeatureContextMenu(event, {
          type: 'feature',
          index: featureIndex
        });
      });
    });

    // Trait headers (from ancestry)
    const traitHeaders = this.element.querySelectorAll('.trait-header');
    traitHeaders.forEach(header => {
      header.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const traitItem = header.closest('[data-trait-index]');
        if (!traitItem) return;

        const traitIndex = parseInt(traitItem.dataset.traitIndex);
        if (isNaN(traitIndex)) return;

        await this.inventoryHandler.showFeatureContextMenu(event, {
          type: 'trait',
          index: traitIndex
        });
      });
    });

    // Perk headers (real items)
    const perkHeaders = this.element.querySelectorAll('.perk-header');
    perkHeaders.forEach(header => {
      header.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const perkItem = header.closest('[data-item-id]');
        if (!perkItem) return;

        const itemId = perkItem.dataset.itemId;
        if (!itemId) return;

        await this.inventoryHandler.showFeatureContextMenu(event, itemId, 'perk');
      });
    });
  }

  /**
   * Setup context menu listeners for equipped items and favorited spells in the sliding panel.
   * Options: Send to Chat, Use (if applicable), Unequip, Unbind (relics only).
   * @private
   */
  _setupPanelContextMenuListeners() {
    // Equipped items (weapons, relics, alchemicals, gear)
    const equippedItems = this.element.querySelectorAll('.equipped-item .eq-name');
    equippedItems.forEach(label => {
      label.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const itemId = label.closest('[data-item-id]')?.dataset.itemId;
        if (!itemId) return;

        const item = this.actor.items.get(itemId);
        if (!item) return;

        const isWeapon = EquipmentHelper.isWeapon(item);
        const isAlchemical = EquipmentHelper.isAlchemical(item);
        const hasAlchemicalDamage = isAlchemical && item.system.damageType && item.system.damageType !== '-';
        const isArmor = EquipmentHelper.isArmor(item);
        const isGear = EquipmentHelper.isGear(item);

        // Determine if "Use" option should be shown
        let showUseOption = false;
        if (isWeapon || hasAlchemicalDamage) {
          showUseOption = true;
        } else if (isArmor) {
          showUseOption = false;
        } else if (isGear) {
          showUseOption = item.system.isConsumable === true;
        } else {
          showUseOption = true;
        }

        const menuItems = [];

        // Use
        if (showUseOption) {
          menuItems.push({
            label: 'Use',
            icon: 'fas fa-hand-sparkles',
            enabled: true,
            action: async () => {
              if (isWeapon || hasAlchemicalDamage) {
                await VagabondActorSheet._onRollWeapon.call(this, event, {
                  dataset: { itemId },
                });
              } else {
                await VagabondActorSheet._onUseItem.call(this, event, {
                  dataset: { itemId },
                });
              }
            },
          });
        }

        // Send to Chat
        menuItems.push({
          label: 'Send to Chat',
          icon: 'fas fa-comment',
          enabled: true,
          action: async () => {
            await VagabondChatCard.gearUse(this.actor, item);
          },
        });

        // Unequip
        menuItems.push({
          label: 'Unequip',
          icon: 'fas fa-times',
          enabled: true,
          action: async () => {
            if (isWeapon && item.system.equipmentState !== undefined) {
              await item.update({ 'system.equipmentState': 'unequipped' });
            } else if (isArmor) {
              await item.update({ 'system.worn': false });
            } else if (item.system.equipped !== undefined) {
              await item.update({ 'system.equipped': false });
            }
          },
        });

        // Unbind (relics only)
        if (item.system.requiresBound) {
          const isBound = item.system.bound === true;
          if (isBound) {
            menuItems.push({
              label: 'Unbind',
              icon: 'fa-solid fa-diamond',
              enabled: true,
              action: async () => {
                await item.update({ 'system.bound': false });
              },
            });
          }
        }

        ContextMenuHelper.create({
          position: { x: event.clientX, y: event.clientY },
          items: menuItems,
          className: 'inventory-context-menu',
        });
      });
    });

    // Favorited spells
    const spellNames = this.element.querySelectorAll('.favorited-spell .spell-name-container');
    spellNames.forEach(container => {
      container.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const spellId = container.closest('[data-spell-id]')?.dataset.spellId;
        if (!spellId) return;

        const spell = this.actor.items.get(spellId);
        if (!spell) return;

        const menuItems = [
          {
            label: 'Send to Chat',
            icon: 'fas fa-comment',
            enabled: true,
            action: async () => {
              await VagabondChatCard.itemUse(this.actor, spell);
            },
          },
          {
            label: 'Unfavorite',
            icon: 'fas fa-star',
            enabled: true,
            action: async () => {
              await spell.update({ 'system.favorite': false });
            },
          },
        ];

        ContextMenuHelper.create({
          position: { x: event.clientX, y: event.clientY },
          items: menuItems,
          className: 'inventory-context-menu',
        });
      });
    });
  }

  /**
   * Setup status icon context menu listeners
   * @private
   */
  _setupStatusIconListeners() {
    const statusIcons = this.element.querySelectorAll('.status-icon');

    statusIcons.forEach(icon => {
      // Right-click: Show context menu
      icon.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const effectId = icon.dataset.effectId;
        if (!effectId) return;

        const effect = this.actor.effects.get(effectId);
        if (!effect) return;

        const { ContextMenuHelper } = globalThis.vagabond.utils;
        const { VagabondChatCard } = globalThis.vagabond.utils;

        const menuItems = [
          {
            label: 'Send to Chat',
            icon: 'fas fa-comment',
            enabled: true,
            action: async () => {
              await VagabondChatCard.statusEffect(this.actor, effect);
            }
          },
          {
            label: 'Remove Status',
            icon: 'fas fa-times',
            enabled: true,
            action: async () => {
              await effect.delete();
            }
          }
        ];

        ContextMenuHelper.create({
          position: { x: event.clientX, y: event.clientY },
          items: menuItems,
          onClose: () => {},
          className: 'status-context-menu'
        });
      });
    });
  }

  /**
   * Setup click outside handler for accordions
   * @private
   */
  _setupAccordionClickOutside() {
    if (this._accordionClickOutsideHandler) {
      document.removeEventListener('click', this._accordionClickOutsideHandler);
    }

    this._accordionClickOutsideHandler = async (event) => {
      // Handle clicks outside accordions
      const accordions = this.element.querySelectorAll('.accordion-item.expanded');

      for (const accordion of accordions) {
        if (!accordion.contains(event.target)) {
          AccordionHelper.close(accordion);
        }
      }
    };

    document.addEventListener('click', this._accordionClickOutsideHandler);
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
    } else if (data.type === 'ActiveEffect') {
      return this._onDropActiveEffect(event, data);
    } else if (data.type === 'Actor') {
      return this._onDropActor(event, data);
    } else if (data.type === 'Folder') {
      return this._onDropFolder(event, data);
    }

    return super._onDrop(event);
  }

  /**
   * Handle dropping an item
   * @param {DragEvent} event - The originating drop event
   * @param {Object} data - The drop data
   * @private
   */
  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;

    const item = await Item.implementation.fromDropData(data);
    const itemData = item.toObject();

    // Handle item from same actor (sorting)
    if (this.actor.uuid === item.parent?.uuid) {
      return this._onSortItem(event, itemData);
    }

    const created = await this._onDropItemCreate(itemData, event);

    // Transfer (not copy): delete from source actor if it's actor-owned equipment
    if (created?.length && item.parent?.documentName === 'Actor' && item.type === 'equipment' && item.parent.isOwner) {
      await item.delete();
    }

    return created;
  }

  /**
   * Handle sorting an item
   * @param {DragEvent} event - The originating drop event
   * @param {Object} itemData - The item data
   * @private
   */
  async _onSortItem(event, itemData) {
    // Get all items of the same type
    const items = this.actor.items.filter(i => i.type === itemData.type);

    // Perform standard sorting
    const sortUpdates = foundry.utils.performIntegerSort(itemData, {
      target: event.target,
      siblings: items,
    });

    const updateData = sortUpdates.map(u => {
      const update = u.update;
      update._id = u.target._id;
      return update;
    });

    return this.actor.updateEmbeddedDocuments('Item', updateData);
  }

  /**
   * Handle creating an item from drop
   * @param {Object} itemData - The item data
   * @param {DragEvent} event - The originating drop event
   * @private
   */
  async _onDropItemCreate(itemData, event) {
    // Handle ancestry replacement
    if (itemData.type === 'ancestry') {
      const existingAncestry = this.actor.items.find(i => i.type === 'ancestry');
      if (existingAncestry) {
        await existingAncestry.delete();
      }
    }

    // Handle class replacement
    if (itemData.type === 'class') {
      const existingClass = this.actor.items.find(i => i.type === 'class');
      if (existingClass) {
        await existingClass.delete();
      }
    }

    // Assign gridPosition for equipment items if not set
    if (itemData.type === 'equipment' && itemData.system && !itemData.system.gridPosition) {
      // Find highest gridPosition in current inventory
      const maxPosition = this.actor.items
        .filter(i => i.type === 'equipment' && i.system.gridPosition != null)
        .reduce((max, item) => Math.max(max, item.system.gridPosition || 0), -1);

      itemData.system.gridPosition = maxPosition + 1;
    }

    // Create the item
    return this.actor.createEmbeddedDocuments('Item', [itemData]);
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

    const sortUpdates = SortingHelpers.performIntegerSort(effect, {
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

  /**
   * Handle dropping a folder
   * @param {DragEvent} event - The originating drop event
   * @param {Object} data - The drop data
   * @private
   */
  async _onDropFolder(event, data) {
    if (!this.actor.isOwner) return false;

    const folder = await Folder.implementation.fromDropData(data);
    if (!folder) return false;

    // Get all items in folder
    const items = folder.contents.map(item => item.toObject());

    // Create all items
    return this.actor.createEmbeddedDocuments('Item', items);
  }
}
