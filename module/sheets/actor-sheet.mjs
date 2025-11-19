import { prepareActiveEffectCategories } from '../helpers/effects.mjs';
import { VagabondChatHelper } from '../helpers/chat-helper.mjs';

const { api, sheets } = foundry.applications;

/**
 * Extend the basic ActorSheet with some very simple modifications
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
      roll: this._onRoll,
      rollWeapon: this._onRollWeapon,
      toggleWeaponEquipment: this._onToggleWeaponEquipment,
      toggleWeaponGrip: this._onToggleWeaponGrip,
      toggleArmorEquipment: this._onToggleArmorEquipment,
      castSpell: this._onCastSpell,  // NEW: Cast spell action
      modifyDamage: this._onModifyDamage,  // NEW: Increase/decrease damage
      modifyDelivery: this._onModifyDelivery,  // NEW: Increase/decrease delivery
      toggleSpellFavorite: this._onToggleSpellFavorite,
      viewAncestry: this._viewAncestry,  // YOUR CUSTOM ACTION
      viewClass: this._viewClass,  // YOUR CUSTOM ACTION
      levelUp: this._onLevelUp,  // Level up action
      toggleFeature: this._onToggleFeature,  // Feature accordion toggle
      togglePerk: this._onTogglePerk,  // Perk accordion toggle
      togglePanel: this._onTogglePanel,  // Sliding panel toggle
      toggleEffectsAccordion: this._onToggleEffectsAccordion,  // NPC effects accordion toggle
      toggleLock: this._onToggleLock,  // NPC lock/unlock toggle
      toggleImmunity: this._onToggleImmunity,  // NPC damage immunity toggle
      removeImmunity: this._onRemoveImmunity,  // NPC damage immunity remove
      toggleWeakness: this._onToggleWeakness,  // NPC damage weakness toggle
      removeWeakness: this._onRemoveWeakness,  // NPC damage weakness remove
      toggleStatusImmunity: this._onToggleStatusImmunity,  // NPC status immunity toggle
      removeStatusImmunity: this._onRemoveStatusImmunity,  // NPC status immunity remove
      selectZone: this._onSelectZone,  // NPC zone selection
      clearZone: this._onClearZone,  // NPC zone clear
      toggleFavorHinder: this._onToggleFavorHinder,  // Favor/Hinder toggle
    },
    // FIXED: Enabled drag & drop (was commented in boilerplate)
    dragDrop: [{ dragSelector: '.draggable', dropSelector: null }],
    form: {
      submitOnChange: true,
    },
  };

  /** @override */
  static PARTS = {
    header: {
      template: 'systems/vagabond/templates/actor/header.hbs',
    },
    tabs: {
      // Foundry-provided generic template
      template: 'templates/generic/tab-navigation.hbs',
    },
    features: {
      template: 'systems/vagabond/templates/actor/features.hbs',
      scrollable: [""],
    },
    biography: {
      template: 'systems/vagabond/templates/actor/biography.hbs',
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
    // NPC-specific parts
    npcHeader: {
      template: 'systems/vagabond/templates/actor/npc-header.hbs',
    },
    npcContent: {
      template: 'systems/vagabond/templates/actor/npc-content.hbs',
      scrollable: [""],
    },
  };

  /**
   * Constructor - Initialize spell states from localStorage
   * @param {object} object - The actor document
   * @param {object} options - Application options
   */
  constructor(object, options) {
    super(object, options);

    // Load spell states from localStorage (per character, per spell)
    this.spellStates = this._loadSpellStates();
  }

  /**
   * Load spell states from localStorage for this character
   * @returns {Object} Spell states keyed by spell ID
   * @private
   */
  _loadSpellStates() {
    const key = `vagabond.spell-states.${this.actor.id}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : {};
  }

  /**
   * Save spell states to localStorage for this character
   * @private
   */
  _saveSpellStates() {
    const key = `vagabond.spell-states.${this.actor.id}`;
    localStorage.setItem(key, JSON.stringify(this.spellStates));
  }

  /**
   * Get spell state for a specific spell, creating default if needed
   * @param {string} spellId - The spell ID
   * @returns {Object} Spell state with damageDice, deliveryType, deliveryIncrease
   * @private
   */
  _getSpellState(spellId) {
    if (!this.spellStates[spellId]) {
      this.spellStates[spellId] = {
        damageDice: 1,
        deliveryType: null,
        deliveryIncrease: 0
      };
    }
    return this.spellStates[spellId];
  }

  /**
   * Calculate total mana cost for casting a spell
   * @param {string} spellId - The spell ID
   * @returns {Object} Cost breakdown: damageCost, deliveryBaseCost, deliveryIncreaseCost, totalCost
   * @private
   */
  _calculateSpellCost(spellId) {
    const state = this._getSpellState(spellId);
    const spell = this.actor.items.get(spellId);

    // Damage cost: 0 for 1d6, +1 per extra die
    const damageCost = spell.system.damageBase !== '-' && state.damageDice > 1
      ? state.damageDice - 1
      : 0;

    // Delivery base cost
    const deliveryBaseCost = state.deliveryType
      ? CONFIG.VAGABOND.deliveryDefaults[state.deliveryType].cost
      : 0;

    // Delivery increase cost
    const increasePerStep = state.deliveryType
      ? CONFIG.VAGABOND.deliveryIncreaseCost[state.deliveryType]
      : 0;
    const deliveryIncreaseCost = state.deliveryIncrease * increasePerStep;

    const totalCost = damageCost + deliveryBaseCost + deliveryIncreaseCost;

    return { damageCost, deliveryBaseCost, deliveryIncreaseCost, totalCost };
  }

  /**
   * Get delivery size/range hint text (e.g., "(25 foot)" for increased cone)
   * NOTE: Distances stored in feet for future grid conversion (5 feet = 1 grid)
   * @param {string} deliveryType - The delivery type
   * @param {number} increaseCount - Number of increases
   * @returns {string} Size hint text
   * @private
   */
  _getDeliverySizeHint(deliveryType, increaseCount) {
    if (!deliveryType || increaseCount === 0) return '';

    const baseRange = CONFIG.VAGABOND.deliveryBaseRanges[deliveryType];
    const increment = CONFIG.VAGABOND.deliveryIncrement[deliveryType];

    if (!baseRange.value || increment === 0) return '';

    const newValue = baseRange.value + (increment * increaseCount);

    if (baseRange.type === 'count') {
      // For imbue/remote: "2 targets"
      return `(${newValue} ${baseRange.unit}${newValue > 1 ? 's' : ''})`;
    } else if (baseRange.type === 'radius') {
      // For aura/sphere: "(15-foot radius)"
      return `(${newValue}-${baseRange.unit} ${baseRange.type})`;
    } else if (baseRange.type === 'length') {
      // For cone/line: "(20 foot)"
      return `(${newValue}-${baseRange.unit})`;
    } else if (baseRange.type === 'cube') {
      // For cube: "(10-foot cube)"
      return `(${newValue}-${baseRange.unit} ${baseRange.type})`;
    } else if (baseRange.type === 'square') {
      // For glyph: "(5-foot square)"
      return `(${newValue}-${baseRange.unit} ${baseRange.type})`;
    }

    return '';
  }

  /**
   * Update spell display in the UI with current state and costs
   * @param {string} spellId - The spell ID
   * @private
   */
  _updateSpellDisplay(spellId) {
    const state = this._getSpellState(spellId);
    const costs = this._calculateSpellCost(spellId);
    const spell = this.actor.items.get(spellId);

    const container = this.element.querySelector(`[data-spell-id="${spellId}"]`);
    if (!container) return;

    // Update damage dice display
    if (spell.system.damageBase !== '-') {
      const damageElement = container.querySelector('.spell-damage-dice');
      if (damageElement) {
        damageElement.textContent = `${state.damageDice}`;
      }
    }

    // Update delivery dropdown
    const deliverySelect = container.querySelector('.spell-delivery-select');
    if (deliverySelect) {
      deliverySelect.value = state.deliveryType || '';
    }

    // Update delivery cost display and hint
    const costSpan = container.querySelector('.spell-delivery-cost');
    if (costSpan) {
      if (state.deliveryType) {
        const deliveryCost = costs.deliveryBaseCost + costs.deliveryIncreaseCost;
        costSpan.textContent = deliveryCost;

        // Build hint with increase info
        const increaseHint = game.i18n.localize(CONFIG.VAGABOND.deliveryTypeHints[state.deliveryType]);
        if (state.deliveryIncrease > 0) {
          const sizeHint = this._getDeliverySizeHint(state.deliveryType, state.deliveryIncrease);
          costSpan.setAttribute('title', `${increaseHint} ${sizeHint}`);
        } else {
          costSpan.setAttribute('title', increaseHint);
        }

        // Disable increase if delivery doesn't support it
        if (CONFIG.VAGABOND.deliveryIncreaseCost[state.deliveryType] === 0) {
          costSpan.classList.remove('clickable');
          costSpan.classList.add('disabled');
        } else {
          costSpan.classList.add('clickable');
          costSpan.classList.remove('disabled');
        }
      } else {
        costSpan.textContent = '—';
        costSpan.setAttribute('title', 'Select a delivery type first');
        costSpan.classList.remove('clickable');
        costSpan.classList.add('disabled');
      }
    }

    // Update total mana cost
    const totalSpan = container.querySelector('.spell-mana-total');
    if (totalSpan) {
      totalSpan.textContent = costs.totalCost;
    }
  }

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);

    // Set width based on actor type
    if (this.document.type === 'npc') {
      options.position = options.position || {};
      options.position.width = 380;
    }

    // Not all parts always render
    if (this.document.type === 'npc') {
      // NPC uses a completely different layout - no tabs, no sliding panel
      options.parts = ['npcHeader', 'npcContent'];
      return;
    }

    // Character sheet layout
    // Header is now inside the sliding panel, so only tabs and slidingPanel at top level
    options.parts = ['tabs', 'slidingPanel'];
    // Don't show the other tabs if only limited view
    if (this.document.limited) {
      options.parts.push('biography');
      return;
    }
    // Control which parts show based on document subtype
    switch (this.document.type) {
      case 'character':
        // Order: Features | Biography | Effects + Sliding Panel (right)
        options.parts.push('features', 'biography', 'effects');
        break;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    // Output initialization
    const context = {
      // Validates both permissions and compendium status
      editable: this.isEditable,
      owner: this.document.isOwner,
      limited: this.document.limited,
      // Add the actor document.
      actor: this.actor,
      // Add the actor's data to context.data for easier access, as well as flags.
      system: this.actor.system,
      flags: this.actor.flags,
      // Adding a pointer to CONFIG.VAGABOND
      config: CONFIG.VAGABOND,
      tabs: this._getTabs(options.parts),
      // Necessary for formInput and formFields helpers
      fields: this.document.schema.fields,
      systemFields: this.document.system.schema.fields,
      // Sliding panel state
      isPanelOpen: this.isPanelOpen ?? false,
    };

    // YOUR CUSTOM: Add localized ancestry data for template
    if (this.actor.system.ancestryData) {
      context.system.ancestryDisplay = {
        name: this.actor.system.ancestryData.name,
        sizeLabel: game.i18n.localize(`VAGABOND.Sizes.${this.actor.system.ancestryData.size}`),
        beingTypeLabel: game.i18n.localize(`VAGABOND.BeingTypes.${this.actor.system.ancestryData.beingType}`)
      };
    }

    // Offloading context prep to a helper function
    this._prepareItems(context);

    // Prepare equipped armor type for header display
    const equippedArmor = this.actor.items.find(item => item.type === 'armor' && item.system.equipped);
    context.equippedArmorType = equippedArmor ? equippedArmor.system.armorTypeDisplay : '-';

    // Prepare fatigue boxes (5 skulls)
    const fatigue = this.actor.system.fatigue || 0;
    context.fatigueBoxes = Array.from({ length: 5 }, (_, i) => ({
      checked: i < fatigue,
      level: i + 1
    }));

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context) {
    switch (partId) {
      case 'features':
        context.tab = context.tabs[partId];
        // Enrich perk descriptions and prerequisites for display
        if (context.perks) {
          context.enrichedPerks = await Promise.all(
            context.perks.map(async (perk) => {
              const enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(
                perk.system.description,
                {
                  secrets: this.document.isOwner,
                  rollData: perk.getRollData(),
                  relativeTo: perk,
                }
              );
              return {
                _id: perk.id,
                id: perk.id,
                name: perk.name,
                img: perk.img,
                enrichedDescription,
                prerequisites: perk.system.getPrerequisiteString(),
              };
            })
          );
        }
        break;
      case 'biography':
        context.tab = context.tabs[partId];
        // Enrich biography info for display
        // Enrichment turns text like `[[/r 1d20]]` into buttons
        context.enrichedBiography = await foundry.applications.ux.TextEditor.enrichHTML(
          this.actor.system.biography,
          {
            // Whether to show secret blocks in the finished html
            secrets: this.document.isOwner,
            // Data to fill in for inline rolls
            rollData: this.actor.getRollData(),
            // Relative UUID resolution
            relativeTo: this.actor,
          }
        );
        break;
      case 'effects':
        context.tab = context.tabs[partId];
        // Prepare active effects
        context.effects = prepareActiveEffectCategories(
          // A generator that returns all effects stored on the actor
          // as well as any items
          this.actor.allApplicableEffects()
        );
        break;
      case 'slidingPanel':
        // Enrich perk descriptions for the sliding panel
        if (context.perks) {
          context.enrichedPerks = await Promise.all(
            context.perks.map(async (perk) => {
              const enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(
                perk.system.description,
                {
                  secrets: this.document.isOwner,
                  rollData: perk.getRollData(),
                  relativeTo: perk,
                }
              );
              return {
                _id: perk.id,
                id: perk.id,
                name: perk.name,
                img: perk.img,
                enrichedDescription,
                prerequisites: perk.system.getPrerequisiteString(),
              };
            })
          );
        }
        break;
      case 'npcHeader':
        // Enrich the appearing field for roll links
        if (this.actor.system.locked && this.actor.system.appearingFormatted) {
          context.enrichedAppearing = await foundry.applications.ux.TextEditor.enrichHTML(
            this.actor.system.appearingFormatted,
            {
              secrets: this.document.isOwner,
              rollData: this.actor.getRollData(),
              relativeTo: this.actor,
            }
          );
        } else {
          context.enrichedAppearing = this.actor.system.appearingFormatted;
        }
        break;
      case 'npcContent':
        // Prepare active effects for NPC
        context.effects = prepareActiveEffectCategories(
          this.actor.allApplicableEffects()
        );
        break;
    }
    return context;
  }

  /**
   * Generates the data for the generic tab navigation template
   * @param {string[]} parts An array of named template parts to render
   * @returns {Record<string, Partial<ApplicationTab>>}
   * @protected
   */
  _getTabs(parts) {
    // If you have sub-tabs this is necessary to change
    const tabGroup = 'primary';
    // Default tab for first time it's rendered this session
    if (!this.tabGroups[tabGroup]) this.tabGroups[tabGroup] = 'features';
    return parts.reduce((tabs, partId) => {
      const tab = {
        cssClass: '',
        group: tabGroup,
        // Matches tab property to
        id: '',
        // FontAwesome Icon, if you so choose
        icon: '',
        // Run through localization
        label: 'VAGABOND.Actor.Tabs.',
      };
      switch (partId) {
        case 'header':
        case 'tabs':
        case 'slidingPanel':
          return tabs;
        case 'biography':
          tab.id = 'biography';
          tab.label += 'Biography';
          break;
        case 'features':
          tab.id = 'features';
          tab.label += 'Features';
          break;
        case 'effects':
          tab.id = 'effects';
          tab.label += 'Effects';
          break;
      }
      if (this.tabGroups[tabGroup] === tab.id) tab.cssClass = 'active';
      tabs[partId] = tab;
      return tabs;
    }, {});
  }

  /**
   * Organize and classify Items for Actor sheets.
   *
   * @param {object} context The context object to mutate
   */
  _prepareItems(context) {
    // Initialize containers.
    const gear = [];
    const weapons = [];
    const armor = [];
    const features = [];
    const perks = [];
    const spells = [];

    // Build features list from class levelFeatures up to current level
    const classItem = this.document.items.find(item => item.type === 'class');
    if (classItem) {
      const currentLevel = this.document.system.attributes.level.value;
      const allLevelFeatures = classItem.system.levelFeatures || [];

      // Get features for levels 1 through current level
      for (let index = 0; index < allLevelFeatures.length; index++) {
        const feature = allLevelFeatures[index];
        if (feature.level <= currentLevel) {
          features.push({
            _id: `feature-${feature.level}-${index}`,
            name: `${feature.name} (Level ${feature.level})`,
            description: feature.description,
            level: feature.level
          });
        }
      }

      // Sort by level
      features.sort((a, b) => a.level - b.level);
    }

    // Iterate through items, allocating to containers
    for (let i of this.document.items) {
      // Append to gear.
      if (i.type === 'gear') {
        gear.push(i);
      }
      // Append to weapons.
      else if (i.type === 'weapon') {
        weapons.push(i);
      }
      // Append to armor.
      else if (i.type === 'armor') {
        armor.push(i);
      }
      // Append to spells.
      else if (i.type === 'spell') {
        spells.push(i);
      }
      // Append to perks.
      else if (i.type === 'perk') {
        perks.push(i);
      }
    }

    // Sort then assign
    context.gear = gear.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.weapons = weapons.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.armor = armor.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.features = features.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.perks = perks.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.spells = spells.sort((a, b) => (a.sort || 0) - (b.sort || 0));
  }

  /**
   * Actions performed after any render of the Application.
   * Post-render steps are not awaited by the render process.
   * @param {ApplicationRenderContext} context      Prepared context data
   * @param {RenderOptions} options                 Provided render options
   * @protected
   * @override
   */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#disableOverrides();

    // Restore open state of immunity dropdowns after re-render
    if (this._openDropdowns) {
      this._openDropdowns.forEach(index => {
        const dropdowns = this.element.querySelectorAll('.npc-immunity-dropdown');
        if (dropdowns[index]) {
          dropdowns[index].setAttribute('open', '');
        }
      });
    }

    // Add fatigue skull click handlers
    const fatigueSkulls = this.element.querySelectorAll('.fatigue-skull');
    console.log(`[Fatigue] Found ${fatigueSkulls.length} fatigue skulls`);

    fatigueSkulls.forEach((skull, index) => {
      skull.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentFatigue = this.actor.system.fatigue || 0;
        console.log(`[Fatigue] Clicked skull ${index}, current fatigue: ${currentFatigue}`);

        // If clicking on an active skull, reduce fatigue to that index
        // If clicking on an inactive skull, increase fatigue to index + 1
        const newFatigue = (index + 1 === currentFatigue) ? index : index + 1;

        console.log(`[Fatigue] Setting fatigue from ${currentFatigue} to ${newFatigue}`);
        await this.actor.update({ 'system.fatigue': newFatigue });
        console.log(`[Fatigue] Update complete, new value: ${this.actor.system.fatigue}`);
      });
    });

    // Add HP heart icon click handlers for PC
    const pcHpIcon = this.element.querySelector('.hp-icon');
    if (pcHpIcon) {
      // Left-click: increment HP
      pcHpIcon.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentHP = this.actor.system.health.value || 0;
        const maxHP = this.actor.system.health.max || 10;
        const newHP = Math.min(currentHP + 1, maxHP);

        // Trigger heartbeat animation
        pcHpIcon.classList.add('heartbeat');
        setTimeout(() => pcHpIcon.classList.remove('heartbeat'), 300);

        await this.actor.update({ 'system.health.value': newHP });
      });

      // Right-click: decrement HP
      pcHpIcon.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentHP = this.actor.system.health.value || 0;
        const newHP = Math.max(currentHP - 1, 0);

        // Trigger heartbeat animation
        pcHpIcon.classList.add('heartbeat');
        setTimeout(() => pcHpIcon.classList.remove('heartbeat'), 300);

        await this.actor.update({ 'system.health.value': newHP });
      });

      // Make the heart icon clickable
      pcHpIcon.style.cursor = 'pointer';
    }

    // Add HP heart icon click handlers for NPC
    const npcHpIcon = this.element.querySelector('.npc-hp-heart-icon');
    if (npcHpIcon) {
      // Left-click: increment HP
      npcHpIcon.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentHP = this.actor.system.health.value || 0;
        const maxHP = this.actor.system.health.max || 10;
        const newHP = Math.min(currentHP + 1, maxHP);

        // Trigger heartbeat animation
        npcHpIcon.classList.add('heartbeat');
        setTimeout(() => npcHpIcon.classList.remove('heartbeat'), 300);

        await this.actor.update({ 'system.health.value': newHP });
      });

      // Right-click: decrement HP
      npcHpIcon.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentHP = this.actor.system.health.value || 0;
        const newHP = Math.max(currentHP - 1, 0);

        // Trigger heartbeat animation
        npcHpIcon.classList.add('heartbeat');
        setTimeout(() => npcHpIcon.classList.remove('heartbeat'), 300);

        await this.actor.update({ 'system.health.value': newHP });
      });
    }

    // Add right-click context menu handlers for ancestry and class
    const ancestryName = this.element.querySelector('.ancestry-name');
    if (ancestryName) {
      ancestryName.addEventListener('contextmenu', this._onRemoveAncestry.bind(this));
    }

    const className = this.element.querySelector('.class-name');
    if (className) {
      className.addEventListener('contextmenu', this._onRemoveClass.bind(this));
    }

    // Add right-click handler for perk cards
    const perkCards = this.element.querySelectorAll('.perk-card[data-item-id]');
    perkCards.forEach(perkCard => {
      // Right-click to delete
      perkCard.addEventListener('contextmenu', this._onRemovePerk.bind(this));
    });

    // Add click handlers for gear items
    const gearItems = this.element.querySelectorAll('.gear-item-row[data-item-id]');
    gearItems.forEach(gearItem => {
      // Left-click on image: open item sheet
      const gearImage = gearItem.querySelector('.gear-item-image');
      if (gearImage) {
        gearImage.addEventListener('click', this._onGearImageClick.bind(this));
      }

      // Left-click on name: use item (if usable)
      const gearName = gearItem.querySelector('.gear-item-name');
      if (gearName) {
        gearName.addEventListener('click', this._onGearNameClick.bind(this));
      }

      // Click on equipped icon: toggle equipped status
      const equippedIcon = gearItem.querySelector('.gear-equipped-icon');
      if (equippedIcon) {
        equippedIcon.addEventListener('click', this._onToggleEquipped.bind(this));
      }

      // Right-click on row: delete item
      gearItem.addEventListener('contextmenu', this._onGearContextMenu.bind(this));
    });

    // Add click and context menu handlers for weapon items
    const weaponItems = this.element.querySelectorAll('.weapon-item-row[data-item-id]');
    weaponItems.forEach(weaponItem => {
      // Left-click on image: open item sheet
      const weaponImage = weaponItem.querySelector('.weapon-item-image');
      if (weaponImage) {
        weaponImage.addEventListener('click', this._onWeaponImageClick.bind(this));
      }

      // Left-click on name: use weapon (attack roll)
      const weaponName = weaponItem.querySelector('.weapon-item-name');
      if (weaponName) {
        weaponName.addEventListener('click', this._onWeaponNameClick.bind(this));
      }

      // Right-click on row: delete weapon
      weaponItem.addEventListener('contextmenu', this._onWeaponContextMenu.bind(this));
    });

    // Add click and context menu handlers for armor items
    const armorItems = this.element.querySelectorAll('.armor-item-row[data-item-id]');
    armorItems.forEach(armorItem => {
      // Left-click on image: open item sheet
      const armorImage = armorItem.querySelector('.armor-item-image');
      if (armorImage) {
        armorImage.addEventListener('click', this._onArmorImageClick.bind(this));
      }

      // Left-click on name: open item sheet (armor doesn't have a roll action like weapons)
      const armorName = armorItem.querySelector('.armor-item-name');
      if (armorName) {
        armorName.addEventListener('click', this._onArmorImageClick.bind(this));
      }

      // Right-click on row: delete armor
      armorItem.addEventListener('contextmenu', this._onArmorContextMenu.bind(this));
    });

    // Add click and context menu handlers for spell items
    const spellItems = this.element.querySelectorAll('.spell-item-row[data-item-id]');
    spellItems.forEach(spellItem => {
      // Right-click on row: delete spell
      spellItem.addEventListener('contextmenu', this._onSpellContextMenu.bind(this));
    });

    // NEW: Add spell casting event handlers
    const spellRows = this.element.querySelectorAll('[data-spell-id]');
    spellRows.forEach(spellRow => {
      const spellId = spellRow.dataset.spellId;
      if (!spellId) return;

      // Initialize spell display with saved state
      this._updateSpellDisplay(spellId);

      // Delivery dropdown change
      const deliverySelect = spellRow.querySelector('.spell-delivery-select');
      if (deliverySelect) {
        deliverySelect.addEventListener('change', async (event) => {
          const state = this._getSpellState(spellId);
          state.deliveryType = event.target.value || null;
          state.deliveryIncrease = 0; // Reset increases when changing delivery
          this._saveSpellStates();
          this._updateSpellDisplay(spellId);
        });
      }

      // Damage dice: left-click increase, right-click decrease
      const damageElement = spellRow.querySelector('.spell-damage-dice');
      if (damageElement) {
        damageElement.addEventListener('click', async (event) => {
          event.preventDefault();
          const state = this._getSpellState(spellId);
          state.damageDice++;
          this._saveSpellStates();
          this._updateSpellDisplay(spellId);
        });

        damageElement.addEventListener('contextmenu', async (event) => {
          event.preventDefault();
          const state = this._getSpellState(spellId);
          state.damageDice = Math.max(1, state.damageDice - 1);
          this._saveSpellStates();
          this._updateSpellDisplay(spellId);
        });
      }

      // Delivery cost: left-click increase, right-click decrease
      const deliveryCostElement = spellRow.querySelector('.spell-delivery-cost');
      if (deliveryCostElement) {
        deliveryCostElement.addEventListener('click', async (event) => {
          event.preventDefault();
          const state = this._getSpellState(spellId);

          if (!state.deliveryType) {
            ui.notifications.warn("Select a delivery type first!");
            return;
          }

          // Check if this delivery can be increased
          if (CONFIG.VAGABOND.deliveryIncreaseCost[state.deliveryType] === 0) {
            ui.notifications.warn("This delivery cannot be increased!");
            return;
          }

          state.deliveryIncrease++;
          this._saveSpellStates();
          this._updateSpellDisplay(spellId);
        });

        deliveryCostElement.addEventListener('contextmenu', async (event) => {
          event.preventDefault();
          const state = this._getSpellState(spellId);
          state.deliveryIncrease = Math.max(0, state.deliveryIncrease - 1);
          this._saveSpellStates();
          this._updateSpellDisplay(spellId);
        });
      }
    });

    // You may want to add other special handling here
    // Foundry comes with a large number of utility classes, e.g. SearchFilter
    // That you may want to implement yourself.
  }

  /**************
   *
   *   ACTIONS
   *
   **************/

  /**
   * Handle changing a Document's image.
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
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
   * YOUR CUSTOM: Handle viewing the character's ancestry item
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _viewAncestry(event, target) {
    const ancestry = this.actor.items.find(item => item.type === 'ancestry');
    if (ancestry) {
      ancestry.sheet.render(true);
    }
  }

  /**
   * YOUR CUSTOM: Handle viewing the character's class item
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
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
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _onLevelUp(event, target) {
    const currentLevel = this.actor.system.attributes.level.value;
    const newLevel = currentLevel + 1;

    if (newLevel > 10) {
      ui.notifications.warn("Maximum level (10) already reached!");
      return;
    }

    // Get the class item to see what features will be granted
    const classItem = this.actor.items.find(item => item.type === 'class');
    if (!classItem) {
      ui.notifications.warn("Character must have a class before leveling up!");
      return;
    }

    // Get features for the new level
    const newFeatures = classItem.system.levelFeatures.filter(f => f.level === newLevel);

    // Build the dialog content
    let content = `<p>Level up from <strong>${currentLevel}</strong> to <strong>${newLevel}</strong>?</p>`;

    if (newFeatures.length > 0) {
      content += `<p><strong>You will gain these features:</strong></p><ul>`;
      for (const feature of newFeatures) {
        content += `<li><strong>${feature.name}</strong>`;
        if (feature.description) {
          content += `: ${feature.description}`;
        }
        content += `</li>`;
      }
      content += `</ul>`;
    } else {
      content += `<p><em>No new features at this level.</em></p>`;
    }

    // Confirm the level up
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Level Up to ${newLevel}` },
      content: content,
    });

    if (!confirmed) return;

    // Level up!
    await this.actor.update({ 'system.attributes.level.value': newLevel });

    ui.notifications.info(`Leveled up to ${newLevel}!`);
  }

  /**
   * YOUR CUSTOM: Handle removing the character's ancestry item (right-click)
   *
   * @param {PointerEvent} event   The originating contextmenu event
   * @protected
   */
  async _onRemoveAncestry(event) {
    event.preventDefault();
    const ancestry = this.actor.items.find(item => item.type === 'ancestry');
    if (ancestry) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: 'Remove Ancestry' },
        content: `<p>Are you sure you want to remove <strong>${ancestry.name}</strong>?</p>`,
      });
      if (confirmed) {
        await ancestry.delete();
      }
    }
  }

  /**
   * YOUR CUSTOM: Handle removing the character's class item (right-click)
   *
   * @param {PointerEvent} event   The originating contextmenu event
   * @protected
   */
  async _onRemoveClass(event) {
    event.preventDefault();
    const classItem = this.actor.items.find(item => item.type === 'class');
    if (classItem) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: 'Remove Class' },
        content: `<p>Are you sure you want to remove <strong>${classItem.name}</strong>?</p>`,
      });
      if (confirmed) {
        await classItem.delete();
      }
    }
  }

  /**
   * Handle toggling feature accordion (click on feature header)
   *
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The clicked element
   * @protected
   */
  static async _onToggleFeature(event, target) {
    event.preventDefault();
    const featureId = target.dataset.featureId;
    const accordionItem = this.element.querySelector(`.feature.accordion-item[data-item-id="${featureId}"]`);
    if (accordionItem) {
      accordionItem.classList.toggle('collapsed');
    }
  }

  /**
   * Handle toggling perk accordion (click on perk header)
   *
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The clicked element
   * @protected
   */
  static async _onTogglePerk(event, target) {
    event.preventDefault();
    const perkId = target.dataset.perkId;
    const accordionItem = this.element.querySelector(`.perk-card.accordion-item[data-item-id="${perkId}"]`);
    if (accordionItem) {
      accordionItem.classList.toggle('collapsed');
    }
  }

  /**
   * Handle toggling the sliding panel (open/close)
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The clicked element
   * @protected
   */
  static async _onTogglePanel(event, target) {
    event.preventDefault();
    // Toggle the panel state
    this.isPanelOpen = !this.isPanelOpen;

    // Update the panel classes directly on the DOM element to preserve CSS transitions
    const panel = this.element.querySelector('.sliding-panel');
    if (panel) {
      if (this.isPanelOpen) {
        panel.classList.remove('panel-closed');
        panel.classList.add('panel-open');
      } else {
        panel.classList.remove('panel-open');
        panel.classList.add('panel-closed');
      }
    }
  }

  /**
   * Handle toggling the favor/hinder state (none -> favor -> hinder -> none)
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The clicked element
   * @protected
   */
  static async _onToggleFavorHinder(event, target) {
    event.preventDefault();
    const currentState = this.actor.system.favorHinder || 'none';

    // Cycle through states: none -> favor -> hinder -> none
    let nextState;
    if (currentState === 'none') {
      nextState = 'favor';
    } else if (currentState === 'favor') {
      nextState = 'hinder';
    } else {
      nextState = 'none';
    }

    await this.actor.update({ 'system.favorHinder': nextState });
  }

  /**
   * Handle toggling the NPC effects accordion (open/close)
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The clicked element
   * @protected
   */
  static async _onToggleEffectsAccordion(event, target) {
    event.preventDefault();
    const accordionContent = this.element.querySelector('.npc-effects .accordion-content');
    const accordionIcon = this.element.querySelector('.npc-effects .accordion-icon');

    if (accordionContent) {
      accordionContent.classList.toggle('collapsed');
    }

    if (accordionIcon) {
      accordionIcon.classList.toggle('fa-chevron-right');
      accordionIcon.classList.toggle('fa-chevron-down');
    }
  }

  /**
   * Handle toggling the NPC lock/unlock state
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The clicked element
   * @protected
   */
  static async _onToggleLock(event, target) {
    event.preventDefault();
    const currentLocked = this.actor.system.locked;
    await this.actor.update({ 'system.locked': !currentLocked });
  }

  /**
   * Handle toggling NPC damage immunity
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onToggleImmunity(event, target) {
    const immunity = target.dataset.immunity;
    const isChecked = target.checked;
    const immunities = this.actor.system.immunities || [];

    let newImmunities;
    if (isChecked) {
      if (!immunities.includes(immunity)) {
        newImmunities = [...immunities, immunity];
      } else {
        return;
      }
    } else {
      newImmunities = immunities.filter(i => i !== immunity);
    }

    this._captureDropdownState();
    await this.actor.update({ 'system.immunities': newImmunities });
  }

  /**
   * Handle removing NPC damage immunity
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onRemoveImmunity(event, target) {
    const immunity = target.dataset.immunity;
    if (!immunity) return;

    const immunities = this.actor.system.immunities || [];
    const newImmunities = immunities.filter(i => i !== immunity);
    await this.actor.update({ 'system.immunities': newImmunities });

    // Uncheck the corresponding checkbox
    const checkbox = this.element.querySelector(`input[type="checkbox"][data-immunity="${immunity}"]`);
    if (checkbox) checkbox.checked = false;
  }

  /**
   * Handle toggling NPC damage weakness
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onToggleWeakness(event, target) {
    const weakness = target.dataset.weakness;
    const isChecked = target.checked;
    const weaknesses = this.actor.system.weaknesses || [];

    let newWeaknesses;
    if (isChecked) {
      if (!weaknesses.includes(weakness)) {
        newWeaknesses = [...weaknesses, weakness];
      } else {
        return;
      }
    } else {
      newWeaknesses = weaknesses.filter(w => w !== weakness);
    }

    this._captureDropdownState();
    await this.actor.update({ 'system.weaknesses': newWeaknesses });
  }

  /**
   * Handle removing NPC damage weakness
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onRemoveWeakness(event, target) {
    const weakness = target.dataset.weakness;
    if (!weakness) return;

    const weaknesses = this.actor.system.weaknesses || [];
    const newWeaknesses = weaknesses.filter(w => w !== weakness);
    await this.actor.update({ 'system.weaknesses': newWeaknesses });

    // Uncheck the corresponding checkbox
    const checkbox = this.element.querySelector(`input[type="checkbox"][data-weakness="${weakness}"]`);
    if (checkbox) checkbox.checked = false;
  }

  /**
   * Handle toggling NPC status immunity
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onToggleStatusImmunity(event, target) {
    const status = target.dataset.status;
    const isChecked = target.checked;
    const statusImmunities = this.actor.system.statusImmunities || [];

    let newStatusImmunities;
    if (isChecked) {
      if (!statusImmunities.includes(status)) {
        newStatusImmunities = [...statusImmunities, status];
      } else {
        return;
      }
    } else {
      newStatusImmunities = statusImmunities.filter(s => s !== status);
    }

    this._captureDropdownState();
    await this.actor.update({ 'system.statusImmunities': newStatusImmunities });
  }

  /**
   * Handle removing NPC status immunity
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onRemoveStatusImmunity(event, target) {
    const status = target.dataset.status;
    if (!status) return;

    const statusImmunities = this.actor.system.statusImmunities || [];
    const newStatusImmunities = statusImmunities.filter(s => s !== status);
    await this.actor.update({ 'system.statusImmunities': newStatusImmunities });

    // Uncheck the corresponding checkbox
    const checkbox = this.element.querySelector(`input[type="checkbox"][data-status="${status}"]`);
    if (checkbox) checkbox.checked = false;
  }

  /**
   * Handle selecting NPC combat zone
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onSelectZone(event, target) {
    const zone = target.dataset.zone;
    if (!zone) return;

    this._captureDropdownState();
    await this.actor.update({ 'system.zone': zone });
  }

  /**
   * Handle clearing NPC combat zone
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onClearZone(event, target) {
    await this.actor.update({ 'system.zone': null });

    // Uncheck all radio buttons
    const radios = this.element.querySelectorAll('input[type="radio"][name="zone-selector"]');
    radios.forEach(radio => radio.checked = false);
  }

  /**
   * Handle viewing a perk item (left-click)
   *
   * @param {PointerEvent} event   The originating click event
   * @protected
   */
  async _onViewPerk(event) {
    event.preventDefault();
    event.stopPropagation();
    const perkCard = event.currentTarget;
    const perkId = perkCard.dataset.itemId;
    const perk = this.actor.items.get(perkId);
    if (perk) {
      perk.sheet.render(true);
    }
  }

  /**
   * Handle removing a perk item (right-click)
   *
   * @param {PointerEvent} event   The originating contextmenu event
   * @protected
   */
  async _onRemovePerk(event) {
    event.preventDefault();
    event.stopPropagation();
    const perkCard = event.currentTarget;
    const perkId = perkCard.dataset.itemId;
    const perk = this.actor.items.get(perkId);
    if (perk) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: 'Remove Perk' },
        content: `<p>Are you sure you want to remove <strong>${perk.name}</strong>?</p>`,
      });
      if (confirmed) {
        await perk.delete();
      }
    }
  }

  /**
   * Handle left-click on gear item image - opens item sheet
   *
   * @param {PointerEvent} event   The originating click event
   * @protected
   */
  async _onGearImageClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const gearRow = event.currentTarget.closest('.gear-item-row');
    const itemId = gearRow?.dataset?.itemId;

    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    if (item) {
      item.sheet.render(true);
    }
  }

  /**
   * Handle left-click on gear item name - uses/rolls item if applicable
   *
   * @param {PointerEvent} event   The originating click event
   * @protected
   */
  async _onGearNameClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const gearRow = event.currentTarget.closest('.gear-item-row');
    const itemId = gearRow?.dataset?.itemId;

    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    if (item && typeof item.roll === 'function') {
      await item.roll();
    }
  }

  /**
   * Handle click on equipped icon - toggles equipped status
   *
   * @param {PointerEvent} event   The originating click event
   * @protected
   */
  async _onToggleEquipped(event) {
    event.preventDefault();
    event.stopPropagation();

    const gearRow = event.currentTarget.closest('.gear-item-row');
    const itemId = gearRow?.dataset?.itemId;

    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    if (!item) return;

    const newEquippedStatus = !item.system.equipped;

    // Toggle equipped status
    await item.update({ 'system.equipped': newEquippedStatus });

    // Toggle all effects on this item: disabled when unequipped, enabled when equipped
    const updates = item.effects.map(effect => ({
      _id: effect.id,
      disabled: !newEquippedStatus
    }));

    if (updates.length > 0) {
      await item.updateEmbeddedDocuments('ActiveEffect', updates);
    }
  }

  /**
   * Handle right-click on gear item - deletes item with confirmation
   *
   * @param {PointerEvent} event   The originating contextmenu event
   * @protected
   */
  async _onGearContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();

    const gearRow = event.currentTarget;
    const itemId = gearRow?.dataset?.itemId;

    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    if (!item) return;

    // Show delete confirmation dialog
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'Delete Item' },
      content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`,
    });

    if (confirmed) {
      await item.delete();
    }
  }

  /**
   * Handle left-click on weapon item image - opens item sheet
   */
  async _onWeaponImageClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const weaponRow = event.currentTarget.closest('.weapon-item-row');
    const itemId = weaponRow?.dataset?.itemId;

    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    if (item) {
      item.sheet.render(true);
    }
  }

  /**
   * Handle left-click on weapon item name - makes attack roll
   */
  async _onWeaponNameClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const weaponRow = event.currentTarget.closest('.weapon-item-row');
    const itemId = weaponRow?.dataset?.itemId;

    if (!itemId) return;

    const weapon = this.actor.items.get(itemId);
    if (weapon && weapon.type === 'weapon') {
      // Call the existing weapon roll action
      await VagabondActorSheet._onRollWeapon.call(this, event, { dataset: { itemId } });
    }
  }

  /**
   * Handle right-click on weapon item - deletes weapon with confirmation
   */
  async _onWeaponContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();

    const weaponRow = event.currentTarget;
    const itemId = weaponRow?.dataset?.itemId;

    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    if (!item) return;

    // Show delete confirmation dialog
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'Delete Weapon' },
      content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`,
    });

    if (confirmed) {
      await item.delete();
    }
  }

  /**
   * Handle left-click on armor item image - opens item sheet
   */
  async _onArmorImageClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const armorRow = event.currentTarget.closest('.armor-item-row');
    const itemId = armorRow?.dataset?.itemId;

    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    if (item) {
      item.sheet.render(true);
    }
  }

  /**
   * Handle right-click on armor item - deletes armor with confirmation
   */
  async _onArmorContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();

    const armorRow = event.currentTarget;
    const itemId = armorRow?.dataset?.itemId;

    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    if (!item) return;

    // Show delete confirmation dialog
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'Delete Armor' },
      content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`,
    });

    if (confirmed) {
      await item.delete();
    }
  }

  /**
   * Handle right-click on spell item - deletes spell with confirmation
   */
  async _onSpellContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();

    const spellRow = event.currentTarget;
    const itemId = spellRow?.dataset?.itemId;

    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    if (!item) return;

    // Show delete confirmation dialog
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'Delete Spell' },
      content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`,
    });

    if (confirmed) {
      await item.delete();
    }
  }

  /**
   * Renders an embedded document's sheet
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _viewDoc(event, target) {
    const doc = this._getEmbeddedDocument(target);
    doc.sheet.render(true);
  }

  /**
   * Handles item deletion
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _deleteDoc(event, target) {
    const doc = this._getEmbeddedDocument(target);
    await doc.delete();
  }

  /**
   * Handle creating a new Owned Item or ActiveEffect for the actor using initial data defined in the HTML dataset
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _createDoc(event, target) {
    // Retrieve the configured document class for Item or ActiveEffect
    const docCls = getDocumentClass(target.dataset.documentClass);
    // Prepare the document creation data by initializing it a default name.
    const docData = {
      name: docCls.defaultName({
        // defaultName handles an undefined type gracefully
        type: target.dataset.type,
        parent: this.actor,
      }),
    };
    // Loop through the dataset and add it to our docData
    for (const [dataKey, value] of Object.entries(target.dataset)) {
      // These data attributes are reserved for the action handling
      if (['action', 'documentClass'].includes(dataKey)) continue;
      // Nested properties require dot notation in the HTML, e.g. anything with `system`
      // Data attributes like `data-system.property` turn into the dataKey 'system.property'
      foundry.utils.setProperty(docData, dataKey, value);
    }

    // Finally, create the embedded document!
    await docCls.create(docData, { parent: this.actor });
  }

  /**
   * Determines effect parent to pass to helper
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _toggleEffect(event, target) {
    const effect = this._getEmbeddedDocument(target);
    await effect.update({ disabled: !effect.disabled });
  }

  /**
   * Handle weapon attack rolls.
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _onRollWeapon(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId;
    const weapon = this.actor.items.get(itemId);

    if (!weapon || weapon.type !== 'weapon') {
      ui.notifications.error('Weapon not found!');
      return;
    }

    try {
      // Import damage helper
      const { VagabondDamageHelper } = await import('../helpers/damage-helper.mjs');

      // Get favor/hinder state
      const favorHinder = this.actor.system.favorHinder || 'none';

      // Roll attack using weapon's method
      const attackResult = await weapon.rollAttack(this.actor, favorHinder);

      // Determine if damage should be auto-rolled
      let damageRoll = null;
      if (VagabondDamageHelper.shouldRollDamage(attackResult.isHit)) {
        damageRoll = await weapon.rollDamage(this.actor);
      }

      // Build flavor text and post attack roll to chat
      let flavorText = weapon.buildAttackFlavor(attackResult, damageRoll);

      // Add damage button if damage wasn't auto-rolled
      if (!damageRoll) {
        const damageFormula = weapon.system.currentDamage;
        const damageButton = VagabondDamageHelper.createDamageButton(
          this.actor.id,
          weapon.id,
          damageFormula,
          { type: 'weapon' }
        );
        flavorText += damageButton;
      }

      await VagabondChatHelper.postRoll(this.actor, attackResult.roll, flavorText);

      // If there was a damage roll, also send it to chat
      if (damageRoll) {
        await VagabondChatHelper.postRoll(
          this.actor,
          damageRoll,
          `<strong>${weapon.name}</strong> Damage`
        );
      }

      return attackResult.roll;
    } catch (error) {
      ui.notifications.warn(error.message);
      return;
    }
  }

  /**
   * Handle toggling weapon equipment state.
   * Cycles through: unequipped -> oneHand -> twoHands -> unequipped
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _onToggleWeaponEquipment(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId;
    const weapon = this.actor.items.get(itemId);

    if (!weapon || weapon.type !== 'weapon') {
      ui.notifications.error('Weapon not found!');
      return;
    }

    // Cycle through equipment states
    const currentState = weapon.system.equipmentState || 'unequipped';
    let nextState;

    switch (currentState) {
      case 'unequipped':
        nextState = 'oneHand';
        break;
      case 'oneHand':
        nextState = 'twoHands';
        break;
      case 'twoHands':
        nextState = 'unequipped';
        break;
      default:
        nextState = 'unequipped';
    }

    // Update the weapon's equipment state
    await weapon.update({ 'system.equipmentState': nextState });
  }

  /**
   * Handle toggling weapon grip (for versatile weapons in features panel).
   * Toggles between: oneHand <-> twoHands
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _onToggleWeaponGrip(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId;
    const weapon = this.actor.items.get(itemId);

    if (!weapon || weapon.type !== 'weapon') {
      ui.notifications.error('Weapon not found!');
      return;
    }

    // Only allow toggling for versatile weapons
    if (weapon.system.grip !== 'V') {
      ui.notifications.warn('Only versatile weapons can switch grip!');
      return;
    }

    // Toggle between oneHand and twoHands
    const currentState = weapon.system.equipmentState;
    const nextState = currentState === 'oneHand' ? 'twoHands' : 'oneHand';

    // Update the weapon's equipment state
    await weapon.update({ 'system.equipmentState': nextState });
  }

  /**
   * Handle toggling armor equipment state.
   * Toggles between: equipped <-> unequipped
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _onToggleArmorEquipment(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId;
    const armor = this.actor.items.get(itemId);

    if (!armor || armor.type !== 'armor') {
      ui.notifications.error('Armor not found!');
      return;
    }

    // Toggle equipped state
    const newState = !armor.system.equipped;

    // Update the armor's equipment state
    await armor.update({ 'system.equipped': newState });
  }

  /**
   * NEW: Handle casting a spell with the inline controls
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _onCastSpell(event, target) {
    event.preventDefault();
    const spellId = target.dataset.spellId;
    const spell = this.actor.items.get(spellId);
    const state = this._getSpellState(spellId);
    const costs = this._calculateSpellCost(spellId);

    if (!spell || spell.type !== 'spell') {
      ui.notifications.error('Spell not found!');
      return;
    }

    // Validation: Must select delivery
    if (!state.deliveryType) {
      ui.notifications.warn("Select a delivery type first!");
      return;
    }

    // Validation: Enough mana
    if (costs.totalCost > this.actor.system.mana.current) {
      ui.notifications.error(`Not enough mana! Need ${costs.totalCost}, have ${this.actor.system.mana.current}.`);
      return;
    }

    // Validation: Within casting max
    if (costs.totalCost > this.actor.system.mana.castingMax) {
      ui.notifications.error(`Cost exceeds casting max! Max: ${this.actor.system.mana.castingMax}, Cost: ${costs.totalCost}.`);
      return;
    }

    // Get mana skill
    const manaSkill = this.actor.system.classData?.manaSkill;
    if (!manaSkill) {
      ui.notifications.error("No mana skill configured for this class!");
      return;
    }

    // Check if spellcaster
    if (!this.actor.system.classData?.isSpellcaster) {
      ui.notifications.warn("Your class cannot cast spells!");
      return;
    }

    // Perform roll using the mana skill
    const skill = this.actor.system.skills[manaSkill];
    const difficulty = skill.difficulty;
    const label = `${spell.name} (${skill.label})`;

    // Apply favor/hinder
    const favorHinder = this.actor.system.favorHinder || 'none';
    let rollFormula = 'd20';

    if (favorHinder === 'favor') {
      rollFormula = 'd20 + 1d6';
    } else if (favorHinder === 'hinder') {
      rollFormula = 'd20 - 1d6';
    }

    const roll = new Roll(rollFormula, this.actor.getRollData());
    await roll.evaluate();

    const isSuccess = roll.total >= difficulty;

    // If successful, deduct mana
    if (isSuccess) {
      const newMana = this.actor.system.mana.current - costs.totalCost;
      await this.actor.update({ 'system.mana.current': newMana });
      ui.notifications.info(`${spell.name} cast successfully! ${costs.totalCost} mana spent.`);
    }
    // Failed - no mana cost (chat card will show failure)

    // Create chat message
    await this._createSpellChatCard(spell, state, costs, roll, difficulty, isSuccess);

    // Reset spell state (keep deliveryType)
    this.spellStates[spellId] = {
      damageDice: 1,
      deliveryType: state.deliveryType, // Keep last selected delivery
      deliveryIncrease: 0
    };
    this._saveSpellStates();
    this._updateSpellDisplay(spellId);
  }

  /**
   * NEW: Create chat card for spell cast
   * @param {Item} spell - The spell item
   * @param {Object} state - Spell state
   * @param {Object} costs - Cost breakdown
   * @param {Roll} roll - The roll result
   * @param {number} difficulty - Target difficulty
   * @param {boolean} isSuccess - Whether the cast succeeded
   * @private
   */
  async _createSpellChatCard(spell, state, costs, roll, difficulty, isSuccess) {
    // Import damage helper
    const { VagabondDamageHelper } = await import('../helpers/damage-helper.mjs');

    // Build delivery text with size hint
    const deliveryName = game.i18n.localize(CONFIG.VAGABOND.deliveryTypes[state.deliveryType]);
    const sizeHint = this._getDeliverySizeHint(state.deliveryType, state.deliveryIncrease);
    const deliveryText = `${deliveryName} ${sizeHint}`.trim();

    // Determine if we should auto-roll damage
    let damageRoll = null;
    if (spell.system.damageBase !== '-') {
      if (VagabondDamageHelper.shouldRollDamage(isSuccess)) {
        damageRoll = await VagabondDamageHelper.rollSpellDamage(this.actor, spell, state);
      }
    }

    // Build damage text
    const damageTypeName = spell.system.damageBase !== '-'
      ? game.i18n.localize(CONFIG.VAGABOND.damageTypes[spell.system.damageBase])
      : null;
    const damageText = spell.system.damageBase !== '-'
      ? `${state.damageDice}d6 ${damageTypeName}`
      : null;

    // Build flavor text
    let flavor = `<div class="vagabond-spell-cast">`;
    flavor += `<h3>${spell.name}</h3>`;

    // Add spell description if present
    if (spell.system.description) {
      flavor += `<p><em>${spell.system.description}</em></p>`;
    }

    if (damageText) {
      flavor += `<p><strong>Damage:</strong> ${damageText}</p>`;
    }
    flavor += `<p><strong>Delivery:</strong> ${deliveryText}</p>`;
    flavor += `<p><strong>Mana Cost:</strong> ${costs.totalCost}</p>`;
    flavor += `<p><strong>Roll:</strong> ${roll.total} vs DC ${difficulty}</p>`;
    flavor += `<p><strong>Result:</strong> ${isSuccess ? '<span style="color: green;">SUCCESS</span>' : '<span style="color: red;">FAILED</span>'}</p>`;

    // Add damage button if spell has damage and wasn't auto-rolled
    if (spell.system.damageBase !== '-' && !damageRoll) {
      const damageButton = VagabondDamageHelper.createDamageButton(
        this.actor.id,
        spell.id,
        `${state.damageDice}d6`,
        {
          type: 'spell',
          damageType: spell.system.damageBase,
          damageDice: state.damageDice
        }
      );
      flavor += damageButton;
    }

    flavor += `</div>`;

    await VagabondChatHelper.postRoll(this.actor, roll, flavor);

    // If damage was auto-rolled, post it separately
    if (damageRoll) {
      await VagabondChatHelper.postRoll(
        this.actor,
        damageRoll,
        `<strong>${spell.name}</strong> Damage (${damageTypeName})`
      );
    }
  }

  /**
   * NEW: Handle modifying spell damage (left-click increase, right-click decrease)
   * Note: The actual click handling is in _onRender, this is here for action registry
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _onModifyDamage(event, target) {
    // This is handled inline in _onRender for left/right click differentiation
  }

  /**
   * NEW: Handle modifying spell delivery increase (left-click increase, right-click decrease)
   * Note: The actual click handling is in _onRender, this is here for action registry
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _onModifyDelivery(event, target) {
    // This is handled inline in _onRender for left/right click differentiation
  }

  /**
   * Handle toggling spell favorite state.
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _onToggleSpellFavorite(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId;
    const spell = this.actor.items.get(itemId);

    if (!spell || spell.type !== 'spell') {
      ui.notifications.error('Spell not found!');
      return;
    }

    // Toggle favorite state
    const newState = !spell.system.favorite;
    await spell.update({ 'system.favorite': newState });
  }

  /**
   * Handle clickable rolls.
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _onRoll(event, target) {
    event.preventDefault();
    const dataset = target.dataset;

    // Handle item rolls.
    switch (dataset.rollType) {
      case 'item':
        const item = this._getEmbeddedDocument(target);
        if (item) return item.roll();
    }

    // Handle rolls that supply the formula directly.
    if (dataset.roll) {
      let label = dataset.label ? `[ability] ${dataset.label}` : '';

      // Apply favor/hinder if applicable
      const favorHinder = this.actor.system.favorHinder || 'none';
      let rollFormula = dataset.roll;

      if (favorHinder === 'favor') {
        rollFormula = `${dataset.roll} + 1d6`;
        label += ' [Favor +1d6]';
      } else if (favorHinder === 'hinder') {
        rollFormula = `${dataset.roll} - 1d6`;
        label += ' [Hinder -1d6]';
      }

      let roll = new Roll(rollFormula, this.actor.getRollData());
      await roll.evaluate();
      await VagabondChatHelper.postRoll(this.actor, roll, label);
      return roll;
    }
  }

  /** Helper Functions */

  /**
   * Fetches the embedded document representing the containing HTML element
   *
   * @param {HTMLElement} target    The element subject to search
   * @returns {Item | ActiveEffect} The embedded Item or ActiveEffect
   */
  _getEmbeddedDocument(target) {
    const docRow = target.closest('li[data-document-class]');
    if (docRow.dataset.documentClass === 'Item') {
      return this.actor.items.get(docRow.dataset.itemId);
    } else if (docRow.dataset.documentClass === 'ActiveEffect') {
      const parent =
        docRow.dataset.parentId === this.actor.id
          ? this.actor
          : this.actor.items.get(docRow?.dataset.parentId);
      return parent.effects.get(docRow?.dataset.effectId);
    } else return console.warn('Could not find document class');
  }

  /***************
   *
   * Drag and Drop
   *
   ***************/

  /**
   * MISSING FROM YOUR VERSION: Main drop handler that routes to specific drop methods
   * Handle dropping of items onto the actor sheet
   * @param {DragEvent} event     The concluding DragEvent which contains drop data
   * @returns {Promise}
   * @protected
   */
  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.getDragEventData(event);
    const actor = this.actor;
    const allowed = Hooks.call('dropActorSheetData', actor, this, data);
    if (allowed === false) return;

    // Handle different data types
    switch (data.type) {
      case 'ActiveEffect':
        return this._onDropActiveEffect(event, data);
      case 'Actor':
        return this._onDropActor(event, data);
      case 'Item':
        return this._onDropItem(event, data);
      case 'Folder':
        return this._onDropFolder(event, data);
    }
  }

  /**
   * MISSING FROM YOUR VERSION: Item drop handler that routes to item creation
   * Handle dropping an item onto the actor sheet
   * @param {DragEvent} event     The concluding DragEvent which contains drop data
   * @param {object} data         The data transfer extracted from the event
   * @returns {Promise<Item[]>}
   * @protected
   */
  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;

    const item = await Item.implementation.fromDropData(data);
    const itemData = item.toObject();

    // Handle item sorting within this Actor
    if (this.actor.uuid === item.parent?.uuid)
      return this._onSortItem(event, item);

    // Create the owned item (this will call your custom ancestry logic)
    return this._onDropItemCreate(itemData, event);
  }

  /**
   * MISSING FROM YOUR VERSION: Item sorting handler
   * Handle item sorting within the same actor
   * @param {DragEvent} event
   * @param {Item} item
   */
  async _onSortItem(event, item) {
    // Get the drop target
    const dropTarget = event.target.closest('[data-item-id]');
    if (!dropTarget) return;

    // Get the target item
    const target = this.actor.items.get(dropTarget.dataset.itemId);
    if (!target) return;

    // Don't sort on yourself
    if (item.id === target.id) return;

    // Identify sibling items based on adjacent HTML elements
    const siblings = [];
    for (const el of dropTarget.parentElement.children) {
      const siblingId = el.dataset.itemId;
      if (siblingId && siblingId !== item.id) {
        siblings.push(this.actor.items.get(siblingId));
      }
    }

    // Perform the sort
    const sortUpdates = SortingHelpers.performIntegerSort(item, {
      target,
      siblings,
    });

    const updateData = sortUpdates.map((u) => {
      const update = u.update;
      update._id = u.target._id;
      return update;
    });

    // Perform the update
    return this.actor.updateEmbeddedDocuments('Item', updateData);
  }

  /**
   * Handle the dropping of ActiveEffect data onto an Actor Sheet
   * @param {DragEvent} event                  The concluding DragEvent which contains drop data
   * @param {object} data                      The data transfer extracted from the event
   * @returns {Promise<ActiveEffect|boolean>}  The created ActiveEffect object or false if it couldn't be created.
   * @protected
   */
  async _onDropActiveEffect(event, data) {
    const aeCls = getDocumentClass('ActiveEffect');
    const effect = await aeCls.fromDropData(data);
    if (!this.actor.isOwner || !effect) return false;
    if (effect.target === this.actor)
      return this._onSortActiveEffect(event, effect);
    return aeCls.create(effect, { parent: this.actor });
  }

  /**
   * Handle a drop event for an existing embedded Active Effect to sort that Active Effect relative to its siblings
   *
   * @param {DragEvent} event
   * @param {ActiveEffect} effect
   */
  async _onSortActiveEffect(event, effect) {
    /** @type {HTMLElement} */
    const dropTarget = event.target.closest('[data-effect-id]');
    if (!dropTarget) return;
    const target = this._getEmbeddedDocument(dropTarget);

    // Don't sort on yourself
    if (effect.uuid === target.uuid) return;

    // Identify sibling items based on adjacent HTML elements
    const siblings = [];
    for (const el of dropTarget.parentElement.children) {
      const siblingId = el.dataset.effectId;
      const parentId = el.dataset.parentId;
      if (
        siblingId &&
        parentId &&
        (siblingId !== effect.id || parentId !== effect.parent.id)
      )
        siblings.push(this._getEmbeddedDocument(el));
    }

    // Perform the sort
    const sortUpdates = SortingHelpers.performIntegerSort(effect, {
      target,
      siblings,
    });

    // Split the updates up by parent document
    const directUpdates = [];

    const grandchildUpdateData = sortUpdates.reduce((items, u) => {
      const parentId = u.target.parent.id;
      const update = { _id: u.target.id, ...u.update };
      if (parentId === this.actor.id) {
        directUpdates.push(update);
        return items;
      }
      if (items[parentId]) items[parentId].push(update);
      else items[parentId] = [update];
      return items;
    }, {});

    // Effects-on-items updates
    for (const [itemId, updates] of Object.entries(grandchildUpdateData)) {
      await this.actor.items
        .get(itemId)
        .updateEmbeddedDocuments('ActiveEffect', updates);
    }

    // Update on the main actor
    return this.actor.updateEmbeddedDocuments('ActiveEffect', directUpdates);
  }

  /**
   * Handle dropping of an Actor data onto another Actor sheet
   * @param {DragEvent} event            The concluding DragEvent which contains drop data
   * @param {object} data                The data transfer extracted from the event
   * @returns {Promise<object|boolean>}  A data object which describes the result of the drop, or false if the drop was
   *                                     not permitted.
   * @protected
   */
  async _onDropActor(event, data) {
    if (!this.actor.isOwner) return false;
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping of a Folder on an Actor Sheet.
   * The core sheet currently supports dropping a Folder of Items to create all items as owned items.
   * @param {DragEvent} event     The concluding DragEvent which contains drop data
   * @param {object} data         The data transfer extracted from the event
   * @returns {Promise<Item[]>}
   * @protected
   */
  async _onDropFolder(event, data) {
    if (!this.actor.isOwner) return [];
    const folder = await Folder.implementation.fromDropData(data);
    if (folder.type !== 'Item') return [];
    const droppedItemData = await Promise.all(
      folder.contents.map(async (item) => {
        if (!(document instanceof Item)) item = await fromUuid(item.uuid);
        return item;
      })
    );
    return this._onDropItemCreate(droppedItemData, event);
  }

  /**
   * YOUR CUSTOM LOGIC: Handle the final creation of dropped Item data on the Actor.
   * This method is factored out to allow downstream classes the opportunity to override item creation behavior.
   * @param {object[]|object} itemData      The item data requested for creation
   * @param {DragEvent} event               The concluding DragEvent which provided the drop data
   * @returns {Promise<Item[]>}
   * @private
   */
  async _onDropItemCreate(itemData, event) {
    itemData = itemData instanceof Array ? itemData : [itemData];

    // YOUR CUSTOM: Handle ancestry replacement logic BEFORE creating any items
    const ancestryItems = itemData.filter(data => data.type === 'ancestry');

    if (ancestryItems.length > 0) {
      // Find existing ancestry and remove it FIRST, including its effects
      const existingAncestry = this.actor.items.find(item => item.type === 'ancestry');
      if (existingAncestry) {
        console.log(`Replacing existing ancestry: ${existingAncestry.name}`);

        // Delete the existing ancestry - this should also remove its effects
        await existingAncestry.delete();
      }

      // Only keep the FIRST ancestry if multiple are dropped
      const selectedAncestry = ancestryItems[0];

      // Filter out ALL ancestry items from original data, then add back only the selected one
      const nonAncestryItems = itemData.filter(data => data.type !== 'ancestry');
      itemData = [...nonAncestryItems, selectedAncestry];

      console.log(`Adding new ancestry: ${selectedAncestry.name}`);
    }

    // YOUR CUSTOM: Handle class replacement logic BEFORE creating any items
    const classItems = itemData.filter(data => data.type === 'class');

    if (classItems.length > 0) {
      // Find existing class and remove it FIRST, including its effects
      const existingClass = this.actor.items.find(item => item.type === 'class');
      if (existingClass) {
        console.log(`Replacing existing class: ${existingClass.name}`);

        // Delete the existing class - this should also remove its effects
        await existingClass.delete();
      }

      // Only keep the FIRST class if multiple are dropped
      const selectedClass = classItems[0];

      // Filter out ALL class items from original data, then add back only the selected one
      const nonClassItems = itemData.filter(data => data.type !== 'class');
      itemData = [...nonClassItems, selectedClass];

      console.log(`Adding new class: ${selectedClass.name}`);
    }

    return this.actor.createEmbeddedDocuments('Item', itemData);
  }

  /********************
   *
   * Actor Override Handling
   *
   ********************/

  /**
   * Submit a document update based on the processed form data.
   * @param {SubmitEvent} event                   The originating form submission event
   * @param {HTMLFormElement} form                The form element that was submitted
   * @param {object} submitData                   Processed and validated form data to be used for a document update
   * @returns {Promise<void>}
   * @protected
   * @override
   */
  async _processSubmitData(event, form, submitData) {
    // Store which immunity dropdowns are open before update
    this._captureDropdownState();

    const overrides = foundry.utils.flattenObject(this.actor.overrides);
    for (let k of Object.keys(overrides)) delete submitData[k];
    await this.document.update(submitData);
  }

  /**
   * Capture the open state of immunity dropdowns
   * @private
   */
  _captureDropdownState() {
    this._openDropdowns = [];
    const dropdowns = this.element.querySelectorAll('.npc-immunity-dropdown');
    dropdowns.forEach((dropdown, index) => {
      if (dropdown.hasAttribute('open')) {
        this._openDropdowns.push(index);
      }
    });
  }

  /**
   * Disables inputs subject to active effects
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
}
