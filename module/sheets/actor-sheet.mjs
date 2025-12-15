import { prepareActiveEffectCategories } from '../helpers/effects.mjs';
import { VagabondChatHelper } from '../helpers/chat-helper.mjs';
import { VagabondChatCard } from '../helpers/chat-card.mjs';

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
      useItem: this._onUseItem,  // Use item (gear/relic/alchemical) to post chat card
      toggleWeaponEquipment: this._onToggleWeaponEquipment,
      toggleWeaponGrip: this._onToggleWeaponGrip,
      toggleArmorEquipment: this._onToggleArmorEquipment,
      castSpell: this._onCastSpell,  // NEW: Cast spell action
      modifyDamage: this._onModifyDamage,  // NEW: Increase/decrease damage
      modifyDelivery: this._onModifyDelivery,  // NEW: Increase/decrease delivery
      toggleFx: this._onToggleFx,  // NEW: Toggle Fx checkbox
      toggleSpellFavorite: this._onToggleSpellFavorite,
      viewAncestry: this._viewAncestry,  // YOUR CUSTOM ACTION
      viewClass: this._viewClass,  // YOUR CUSTOM ACTION
      levelUp: this._onLevelUp,  // Level up action
      toggleFeature: this._onToggleFeature,  // Feature accordion toggle
      toggleTrait: this._onToggleTrait,  // Trait accordion toggle
      togglePerk: this._onTogglePerk,  // Perk accordion toggle
      togglePanel: this._onTogglePanel,  // Sliding panel toggle
      toggleEffectsAccordion: this._onToggleEffectsAccordion,  // NPC effects accordion toggle
      toggleLock: this._onToggleLock,  // NPC lock/unlock toggle
      toggleSpeedType: this._onToggleSpeedType, // NPC speed type toggle
      removeSpeedType: this._onRemoveSpeedType, // NPC speed type remove
      toggleImmunity: this._onToggleImmunity,  // NPC damage immunity toggle
      removeImmunity: this._onRemoveImmunity,  // NPC damage immunity remove
      toggleWeakness: this._onToggleWeakness,  // NPC damage weakness toggle
      removeWeakness: this._onRemoveWeakness,  // NPC damage weakness remove
      toggleStatusImmunity: this._onToggleStatusImmunity,  // NPC status immunity toggle
      removeStatusImmunity: this._onRemoveStatusImmunity,  // NPC status immunity remove
      selectZone: this._onSelectZone,  // NPC zone selection
      clearZone: this._onClearZone,  // NPC zone clear
      toggleFavorHinder: this._onToggleFavorHinder,  // Favor/Hinder toggle
      rollMorale: this._onRollMorale,  // NPC morale check
      addAction: this._onAddAction,  // NPC add action
      removeAction: this._onRemoveAction,  // NPC remove action
      clickActionName: this._onClickActionName,  // NPC click action name
      clickActionDamageRoll: this._onClickActionDamageRoll,  // NPC click action damage roll
      toggleActionAccordion: this._onToggleActionAccordion,  // NPC toggle action accordion
      addAbility: this._onAddAbility,  // NPC add ability
      removeAbility: this._onRemoveAbility,  // NPC remove ability
      clickAbilityName: this._onClickAbilityName,  // NPC click ability name
      toggleAbilityAccordion: this._onToggleAbilityAccordion,  // NPC toggle ability accordion
      createCountdownFromRecharge: this._onCreateCountdownFromRecharge,  // Create countdown dice from NPC recharge
      autoArrangeInventory: this._onAutoArrangeInventory,  // Auto-arrange inventory grid
      equipItem: this._onEquipItem,  // Equip item from context menu
      editItem: this._onEditItem,  // Edit item from context menu
      deleteItem: this._onDeleteItem,  // Delete item from context menu
      spendLuck: this._onSpendLuck,  // Spend or recharge luck
      spendStudiedDie: this._onSpendStudiedDie,  // Spend or add studied die
      openDowntime: this._onOpenDowntime,  // Open downtime activities
    },
    // FIXED: Enabled drag & drop (was commented in boilerplate)
    dragDrop: [{ dragSelector: '.draggable', dropSelector: null }],
    form: {
      submitOnChange: true,
      submitDelay: 500,  // Debounce form submission to prevent accordion flicker
    },
  };

  /** @override */
  static PARTS = {
    tabs: {
      // Foundry-provided generic template
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

    // Form submission debounce (fallback if submitDelay not supported)
    this._formSubmitDebounce = null;
  }

  /**
   * Override close to clean up dropdown state
   */
  async close(options = {}) {
    // Clear dropdown state when sheet closes
    this._openDropdowns = [];

    // Clear debounce timer
    if (this._formSubmitDebounce) {
      clearTimeout(this._formSubmitDebounce);
      this._formSubmitDebounce = null;
    }

    return super.close(options);
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
      const spell = this.actor.items.get(spellId);
      const defaultUseFx = spell?.system?.damageType === '-';

      this.spellStates[spellId] = {
        damageDice: 1,
        deliveryType: null,
        deliveryIncrease: 0,
        useFx: defaultUseFx  // Default true for effect-only spells
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
    const hasDamage = spell.system.damageType !== '-' && state.damageDice >= 1;
    const damageCost = hasDamage && state.damageDice > 1
      ? state.damageDice - 1
      : 0;

    // Fx cost: +1 mana ONLY when using both damage AND effects
    const fxCost = (state.useFx && hasDamage) ? 1 : 0;

    // Delivery base cost
    const deliveryBaseCost = state.deliveryType
      ? CONFIG.VAGABOND.deliveryDefaults[state.deliveryType].cost
      : 0;

    // Delivery increase cost
    const increasePerStep = state.deliveryType
      ? CONFIG.VAGABOND.deliveryIncreaseCost[state.deliveryType]
      : 0;
    const deliveryIncreaseCost = state.deliveryIncrease * increasePerStep;

    const totalCost = damageCost + fxCost + deliveryBaseCost + deliveryIncreaseCost;

    return { damageCost, fxCost, deliveryBaseCost, deliveryIncreaseCost, totalCost };
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
   * Get total delivery area/range for metadata display (e.g., "20'" for cone)
   * @param {string} deliveryType - The delivery type
   * @param {number} increaseCount - Number of increases
   * @returns {string} Total area text (e.g., "20'", "15' radius", "2 targets")
   * @private
   */
  _getDeliveryTotalArea(deliveryType, increaseCount) {
    if (!deliveryType) return '';

    const baseRange = CONFIG.VAGABOND.deliveryBaseRanges[deliveryType];
    const increment = CONFIG.VAGABOND.deliveryIncrement[deliveryType];

    if (!baseRange.value) return '';

    const totalValue = baseRange.value + (increment * increaseCount);

    if (baseRange.type === 'count') {
      // For imbue/remote: "2 targets"
      return `${totalValue} ${baseRange.unit}${totalValue > 1 ? 's' : ''}`;
    } else if (baseRange.type === 'radius') {
      // For aura/sphere: "15' radius"
      return `${totalValue}' ${baseRange.type}`;
    } else if (baseRange.type === 'length') {
      // For cone/line: "20'"
      return `${totalValue}'`;
    } else if (baseRange.type === 'cube') {
      // For cube: "10' cube"
      return `${totalValue}' ${baseRange.type}`;
    } else if (baseRange.type === 'square') {
      // For glyph: "5' square"
      return `${totalValue}' ${baseRange.type}`;
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
    if (spell.system.damageType !== '-') {
      const damageElement = container.querySelector('.spell-damage-dice');
      if (damageElement) {
        damageElement.textContent = `${state.damageDice}`;
      }
    }

    // Update Fx icon visual state
    const fxIcon = container.querySelector('.spell-fx-icon');
    if (fxIcon) {
      if (state.useFx) {
        fxIcon.classList.add('fx-active');
        fxIcon.classList.remove('fx-inactive');
      } else {
        fxIcon.classList.add('fx-inactive');
        fxIcon.classList.remove('fx-active');
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

    // Update range display
    const rangeSpan = container.querySelector('.spell-range');
    if (rangeSpan) {
      if (state.deliveryType) {
        const baseRange = CONFIG.VAGABOND.deliveryBaseRanges[state.deliveryType];
        const increment = CONFIG.VAGABOND.deliveryIncrement[state.deliveryType];

        if (baseRange.value) {
          const totalValue = baseRange.value + (increment * state.deliveryIncrease);

          if (baseRange.type === 'count') {
            // For targets: just the number
            rangeSpan.textContent = `${totalValue}`;
          } else {
            // For all distance types: just number and '
            rangeSpan.textContent = `${totalValue}'`;
          }
        } else {
          rangeSpan.textContent = '—';
        }
      } else {
        rangeSpan.textContent = '—';
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
      options.position.width = 300;
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
      options.parts.push('spells');
      return;
    }
    // Control which parts show based on document subtype
    switch (this.document.type) {
      case 'character':
        // Order: Features | Spells | Effects + Sliding Panel (right)
        options.parts.push('features', 'spells', 'effects');
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

    // Check for equipped items and favorited spells for Sliding Panel ---
    // This allows us to show/hide the placeholder text in the sliding panel
    context.hasEquippedItems = 
      (context.weapons && context.weapons.some(i => i.system.equipped)) || 
      (context.gear && context.gear.some(i => i.system.equipped)) || 
      (context.armor && context.armor.some(i => i.system.worn));

    context.hasFavoritedSpells = context.spells && context.spells.some(i => i.system.favorite);
    // --------------------------------------------------------------------------

    // Prepare equipped armor type for header display
    const equippedArmor = this.actor.items.find(item => {
      const isArmor = (item.type === 'armor') ||
                     (item.type === 'equipment' && item.system.equipmentType === 'armor');
      return isArmor && item.system.equipped;
    });
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
        // Enrich class feature descriptions for display
        if (context.features) {
          context.enrichedFeatures = await Promise.all(
            context.features.map(async (feature) => {
              const enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(
                feature.description || '',
                {
                  secrets: this.document.isOwner,
                  rollData: this.document.getRollData(),
                  relativeTo: this.document,
                }
              );
              return {
                _id: feature._id,
                name: feature.name,
                enrichedDescription,
                level: feature.level,
                index: feature.index,  // IMPORTANT: Include index for context menu
              };
            })
          );
        }
        // Enrich trait descriptions for display
        if (context.traits) {
          context.enrichedTraits = await Promise.all(
            context.traits.map(async (trait) => {
              const enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(
                trait.description || '',
                {
                  secrets: this.document.isOwner,
                  rollData: this.document.getRollData(),
                  relativeTo: this.document,
                }
              );
              return {
                _id: trait._id,
                name: trait.name,
                enrichedDescription,
                index: trait.index,
              };
            })
          );
        }
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
      case 'spells':
        context.tab = context.tabs[partId];
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

        // Prepare fatigue boxes for NPC (5 skulls, same as character)
        const fatigue = this.actor.system.fatigue || 0;
        context.fatigueBoxes = Array.from({ length: 5 }, (_, i) => ({
          checked: i < fatigue,
          level: i + 1
        }));
        break;
      case 'npcContent':
        // Prepare active effects for NPC
        context.effects = prepareActiveEffectCategories(
          this.actor.allApplicableEffects()
        );

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

        // Enrich action fields for display in locked mode
        if (this.actor.system.locked && this.actor.system.actions) {
          context.enrichedActions = await Promise.all(
            this.actor.system.actions.map(async (action) => {
              // Enrich recharge if present
              const enrichedRecharge = action.rechargeFormatted
                ? await foundry.applications.ux.TextEditor.enrichHTML(
                    action.rechargeFormatted,
                    {
                      secrets: this.document.isOwner,
                      rollData: this.actor.getRollData(),
                      relativeTo: this.actor,
                    }
                  )
                : '';

              // Enrich roll damage if present
              // If rollDamageFormatted doesn't exist, format it now
              let rollDamageToEnrich = action.rollDamageFormatted;
              if (!rollDamageToEnrich && action.rollDamage) {
                // Format on the fly if not already formatted
                const dicePattern = /\d*d\d+/i;
                if (dicePattern.test(action.rollDamage.trim())) {
                  rollDamageToEnrich = `[[/r ${action.rollDamage.trim()}]]`;
                } else {
                  rollDamageToEnrich = action.rollDamage;
                }
              }

              const enrichedRollDamage = rollDamageToEnrich
                ? await foundry.applications.ux.TextEditor.enrichHTML(
                    rollDamageToEnrich,
                    {
                      secrets: this.document.isOwner,
                      rollData: this.actor.getRollData(),
                      relativeTo: this.actor,
                    }
                  )
                : '';

              // Enrich extra info if present (use pre-formatted from data model)
              const enrichedExtraInfo = action.extraInfoFormatted
                ? await foundry.applications.ux.TextEditor.enrichHTML(
                    action.extraInfoFormatted,
                    {
                      secrets: this.document.isOwner,
                      rollData: this.actor.getRollData(),
                      relativeTo: this.actor,
                    }
                  )
                : '';

              return {
                rechargeFormatted: enrichedRecharge,
                rollDamageFormatted: enrichedRollDamage,
                extraInfoFormatted: enrichedExtraInfo,
              };
            })
          );
        } else {
          context.enrichedActions = [];
        }

        // Enrich ability descriptions for display in locked mode
        if (this.actor.system.locked && this.actor.system.abilities) {
          context.enrichedAbilities = await Promise.all(
            this.actor.system.abilities.map(async (ability) => {
              // Enrich description if present
              // If descriptionFormatted doesn't exist, format it now
              let descriptionToEnrich = ability.descriptionFormatted;
              if (!descriptionToEnrich && ability.description) {
                // Format on the fly: convert dice notation to roll links
                const dicePattern = /(\d*)d(\d+)/gi;
                descriptionToEnrich = ability.description.replace(dicePattern, (match) => {
                  return `[[/r ${match}]]`;
                });
              }

              const enrichedDescription = descriptionToEnrich
                ? await foundry.applications.ux.TextEditor.enrichHTML(
                    descriptionToEnrich,
                    {
                      secrets: this.document.isOwner,
                      rollData: this.actor.getRollData(),
                      relativeTo: this.actor,
                    }
                  )
                : '';

              return {
                descriptionFormatted: enrichedDescription,
              };
            })
          );
        } else {
          context.enrichedAbilities = [];
        }
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
        case 'spells':
          tab.id = 'spells';
          tab.label += 'Spells';
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
    const traits = [];

    // Build traits list from ancestry
    const ancestryItem = this.document.items.find(item => item.type === 'ancestry');
    if (ancestryItem && ancestryItem.system.traits) {
      ancestryItem.system.traits.forEach((trait, index) => {
        traits.push({
          _id: `trait-${index}`,
          name: trait.name,
          description: trait.description,
          index: index
        });
      });
    }

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
            level: feature.level,
            index: index
          });
        }
      }

      // Sort by level
      features.sort((a, b) => a.level - b.level);
    }

    // Iterate through items, allocating to containers
    for (let i of this.document.items) {
      // Handle equipment items by their equipmentType
      if (i.type === 'equipment') {
        if (i.system.equipmentType === 'weapon') {
          weapons.push(i);
        } else if (i.system.equipmentType === 'armor') {
          armor.push(i);
        } else {
          // Gear, alchemicals, and relics all go in the gear array
          gear.push(i);
        }
      }
      // Legacy: Keep supporting old item types for backward compatibility
      else if (i.type === 'gear') {
        gear.push(i);
      }
      else if (i.type === 'weapon') {
        weapons.push(i);
      }
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
    context.traits = traits; // Traits don't need sorting, they're already in ancestry order

    // Prepare inventory grid data
    this._prepareInventoryGrid(context, gear, weapons, armor);
  }

  /**
   * Prepare inventory grid data for visual display
   * @param {Object} context - The template context
   * @param {Array} gear - Gear items
   * @param {Array} weapons - Weapon items
   * @param {Array} armor - Armor items
   * @private
   */
  _prepareInventoryGrid(context, gear, weapons, armor) {
    // Combine all inventory items
    const allInventoryItems = [...weapons, ...armor, ...gear];

    // Prepare item data for inventory cards
    context.inventoryItems = allInventoryItems.map((item, index) => {
      const itemData = {
        item: item,
        gridPosition: item.system.gridPosition || index,
        equipped: this._isItemEquipped(item),
        metalColor: this._getMetalColor(item),
        weaponSkillIcon: this._getWeaponSkillIcon(item),
        damageTypeIcon: this._getDamageTypeIcon(item),
      };

      // Add range abbreviation for weapons
      if (item.system.range) {
        itemData.item.system.rangeAbbr = CONFIG.VAGABOND.rangeAbbreviations[item.system.range] || item.system.range;
      }

      return itemData;
    });

    // Sort by grid position
    context.inventoryItems.sort((a, b) => a.gridPosition - b.gridPosition);

    // Calculate empty slots to fill the grid (max 20 total)
    const maxSlots = this.document.system.inventory?.maxSlots || 20;
    const occupiedSlotCount = context.inventoryItems.reduce((sum, item) => sum + (item.item.system.slots || 1), 0);

    // Create empty slots to fill up to 20 total (5 rows × 4 columns)
    const emptySlotCount = Math.max(0, 20 - occupiedSlotCount);
    context.emptySlots = Array.from({ length: emptySlotCount }, (_, i) => {
      const slotIndex = occupiedSlotCount + i;
      return {
        index: slotIndex,
        displayNumber: slotIndex + 1,
        unavailable: slotIndex >= maxSlots
      };
    });
  }

  /**
   * Check if an item is equipped
   * @param {Item} item - The item to check
   * @returns {boolean} Whether the item is equipped
   * @private
   */
  _isItemEquipped(item) {
    if (item.system.equipped !== undefined) {
      return item.system.equipped;
    }
    if (item.system.equipmentState) {
      return item.system.equipmentState !== 'unequipped';
    }
    return false;
  }

  /**
   * Get metal color for weapon skill icon
   * @param {Item} item - The item
   * @returns {string} Hex color code
   * @private
   */
  _getMetalColor(item) {
    if (!item.system.metal) return CONFIG.VAGABOND.metalColors?.common || '#8b7355';
    return CONFIG.VAGABOND.metalColors?.[item.system.metal] || CONFIG.VAGABOND.metalColors?.common || '#8b7355';
  }

  /**
   * Get weapon skill icon class
   * @param {Item} item - The item
   * @returns {string} Font Awesome icon class
   * @private
   */
  _getWeaponSkillIcon(item) {
    if (!item.system.weaponSkill) return null;
    return CONFIG.VAGABOND.weaponSkillIcons?.[item.system.weaponSkill] || null;
  }

  /**
   * Get damage type icon class
   * @param {Item} item - The item
   * @returns {string} Font Awesome icon class
   * @private
   */
  _getDamageTypeIcon(item) {
    if (!item.system.damageType) return null;
    return CONFIG.VAGABOND.damageTypeIcons?.[item.system.damageType] || null;
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

    // Restore open state of action accordions after re-render
    if (this._openActionAccordions) {
      this._openActionAccordions.forEach(index => {
        const actionEdit = this.element.querySelector(`.npc-action-edit[data-action-index="${index}"]`);
        if (actionEdit) {
          const content = actionEdit.querySelector('.action-edit-content');
          const icon = actionEdit.querySelector('.accordion-icon');
          if (content && icon) {
            content.classList.remove('collapsed');
            icon.classList.remove('fa-chevron-right');
            icon.classList.add('fa-chevron-down');
          }
        }
      });
    }

    // Restore open state of ability accordions after re-render
    if (this._openAbilityAccordions) {
      this._openAbilityAccordions.forEach(index => {
        const abilityEdit = this.element.querySelector(`.npc-ability-edit[data-ability-index="${index}"]`);
        if (abilityEdit) {
          const content = abilityEdit.querySelector('.ability-edit-content');
          const icon = abilityEdit.querySelector('.accordion-icon');
          if (content && icon) {
            content.classList.remove('collapsed');
            icon.classList.remove('fa-chevron-right');
            icon.classList.add('fa-chevron-down');
          }
        }
      });
    }

    // Add click outside handler to close accordions
    this._setupAccordionClickOutside();

    // Add fatigue skull click handlers
    const fatigueSkulls = this.element.querySelectorAll('.fatigue-skull');

    fatigueSkulls.forEach((skull, index) => {
      skull.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentFatigue = this.actor.system.fatigue || 0;

        // If clicking on an active skull, reduce fatigue to that index
        // If clicking on an inactive skull, increase fatigue to index + 1
        const newFatigue = (index + 1 === currentFatigue) ? index : index + 1;

        await this.actor.update({ 'system.fatigue': newFatigue });
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

    // Add mana modifier click handlers (both spells tab and sliding panel)
    const manaModifiers = this.element.querySelectorAll('.mana-modifier[data-mana-action="modify"]');
    manaModifiers.forEach(manaElement => {
      // Left-click: spend mana (subtract)
      manaElement.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentMana = this.actor.system.mana.current || 0;
        const newMana = Math.max(currentMana - 1, 0);

        await this.actor.update({ 'system.mana.current': newMana });
      });

      // Right-click: restore mana (add)
      manaElement.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentMana = this.actor.system.mana.current || 0;
        const maxMana = this.actor.system.mana.max || 0;
        const newMana = Math.min(currentMana + 1, maxMana);

        await this.actor.update({ 'system.mana.current': newMana });
      });

      // Make the element visually clickable
      manaElement.style.cursor = 'pointer';
    });

    // Add right-click context menu handlers for ancestry and class
    const ancestryName = this.element.querySelector('.ancestry-name');
    if (ancestryName) {
      ancestryName.addEventListener('contextmenu', this._onRemoveAncestry.bind(this));
    }

    const className = this.element.querySelector('.class-name');
    if (className) {
      className.addEventListener('contextmenu', this._onRemoveClass.bind(this));
    }

    // Add context menu handlers for perks
    const perkCards = this.element.querySelectorAll('.perk-card[data-item-id]');
    perkCards.forEach(perkCard => {
      perkCard.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        const itemId = perkCard.dataset.itemId;
        this._showFeatureContextMenu(event, itemId, 'perk');
      });
    });

    // Add context menu handlers for traits
    const traitCards = this.element.querySelectorAll('.trait[data-source-type="ancestry"]');
    traitCards.forEach(traitCard => {
      traitCard.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const traitIndex = parseInt(traitCard.dataset.traitIndex);
        this._showFeatureContextMenu(event, { type: 'trait', index: traitIndex });
      });
    });

    // Add context menu handlers for features (ancestry and class)
    const featureCards = this.element.querySelectorAll('.feature[data-source-type="class"]');
    featureCards.forEach(featureCard => {
      featureCard.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const featureIndex = parseInt(featureCard.dataset.featureIndex);
        this._showFeatureContextMenu(event, { type: 'feature', index: featureIndex });
      });
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
          state.damageDice = Math.max(0, state.damageDice - 1);

          // Auto-enable Fx when damage is set to 0 (effect-only mode)
          if (state.damageDice === 0) {
            state.useFx = true;
          }

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

    // Inventory Grid Event Listeners
    this._attachInventoryGridListeners();

    // You may want to add other special handling here
    // Foundry comes with a large number of utility classes, e.g. SearchFilter
    // That you may want to implement yourself.
  }

  /**
   * Attach event listeners for inventory grid interactions
   * @private
   */
  _attachInventoryGridListeners() {
    const inventoryCards = this.element.querySelectorAll('.inventory-card');

    console.log(`Attaching listeners to ${inventoryCards.length} inventory cards`);

    inventoryCards.forEach(card => {
      const itemId = card.dataset.itemId;

      // Single-click: Show mini-sheet (FOR TESTING)
      card.addEventListener('click', (event) => {
        event.preventDefault();
        console.log('Click detected on item:', itemId);
        this._showInventoryMiniSheet(event, itemId);
      });

      // Double-click: Open item sheet
      card.addEventListener('dblclick', (event) => {
        event.preventDefault();
        console.log('Double-click detected on item:', itemId);
        const item = this.actor.items.get(itemId);
        if (item) item.sheet.render(true);
      });

      // Right-click: Show context menu
      card.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        console.log('Right-click detected on item:', itemId);
        this._showInventoryContextMenu(event, itemId, card);
      });

      // Drag start
      card.addEventListener('dragstart', (event) => {
        console.log('Drag start:', itemId);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', itemId);
        card.classList.add('dragging');
      });

      // Drag end
      card.addEventListener('dragend', (event) => {
        console.log('Drag end:', itemId);
        card.classList.remove('dragging');
      });

      // Allow dropping on other cards (to swap positions)
      card.addEventListener('dragover', (event) => {
        event.preventDefault();
        card.classList.add('drag-over');
      });

      card.addEventListener('dragleave', (event) => {
        card.classList.remove('drag-over');
      });

      card.addEventListener('drop', async (event) => {
        event.preventDefault();
        card.classList.remove('drag-over');

        const draggedItemId = event.dataTransfer.getData('text/plain');
        const targetItemId = card.dataset.itemId;

        if (draggedItemId !== targetItemId) {
          console.log(`Swapping items: ${draggedItemId} <-> ${targetItemId}`);

          const draggedItem = this.actor.items.get(draggedItemId);
          const targetItem = this.actor.items.get(targetItemId);

          if (draggedItem && targetItem) {
            const draggedPos = draggedItem.system.gridPosition || 0;
            const targetPos = targetItem.system.gridPosition || 0;

            await draggedItem.update({ 'system.gridPosition': targetPos });
            await targetItem.update({ 'system.gridPosition': draggedPos });
          }
        }
      });
    });

    // Handle drops on empty slots
    const emptySlots = this.element.querySelectorAll('.inventory-slot.empty-slot');
    console.log(`Attaching listeners to ${emptySlots.length} empty slots`);

    emptySlots.forEach(slot => {
      slot.addEventListener('dragover', (event) => {
        event.preventDefault();
        slot.classList.add('drag-over');
      });

      slot.addEventListener('dragleave', (event) => {
        slot.classList.remove('drag-over');
      });

      slot.addEventListener('drop', async (event) => {
        event.preventDefault();
        slot.classList.remove('drag-over');

        const itemId = event.dataTransfer.getData('text/plain');
        const slotIndex = parseInt(slot.dataset.slotIndex);

        console.log(`Dropping item ${itemId} on slot ${slotIndex}`);

        const item = this.actor.items.get(itemId);
        if (item) {
          await item.update({ 'system.gridPosition': slotIndex });
        }
      });
    });
  }

  /**
   * Show context menu for inventory item
   * @param {Event} event - The context menu event
   * @param {string} itemId - The item ID
   * @param {HTMLElement} card - The inventory card element
   * @private
   */
  _showInventoryContextMenu(event, itemId, card) {
    // Remove any existing context menu
    this._hideInventoryContextMenu();

    const item = this.actor.items.get(itemId);
    if (!item) {
      console.log('Item not found for context menu:', itemId);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const menu = document.createElement('div');
    menu.className = 'inventory-context-menu';
    menu.style.position = 'fixed'; // Use fixed instead of absolute for better positioning
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.style.zIndex = '10000'; // Very high z-index to ensure visibility

    const isEquipped = this._isItemEquipped(item);
    const isWeapon = (item.type === 'weapon') ||
                     (item.type === 'equipment' && item.system.equipmentType === 'weapon');

    menu.innerHTML = `
      ${!isWeapon ? `
        <div class="context-menu-item" data-action="sendToChat">
          <i class="fas fa-comment"></i>
          <span>Send to Chat</span>
        </div>
      ` : ''}
      <div class="context-menu-item" data-action="equip">
        <i class="fas fa-${isEquipped ? 'times' : 'check'}"></i>
        <span>${isEquipped ? 'Unequip' : 'Equip'}</span>
      </div>
      <div class="context-menu-item" data-action="edit">
        <i class="fas fa-edit"></i>
        <span>Edit</span>
      </div>
      <div class="context-menu-item danger" data-action="delete">
        <i class="fas fa-trash"></i>
        <span>Delete</span>
      </div>
    `;

    this.element.appendChild(menu);
    this._currentContextMenu = menu;

    // Add click handlers
    // Send to Chat handler (for non-weapons)
    if (!isWeapon) {
      menu.querySelector('[data-action="sendToChat"]')?.addEventListener('click', async () => {
        await VagabondChatCard.gearUse(this.actor, item);
        this._hideInventoryContextMenu();
      });
    }

    menu.querySelector('[data-action="equip"]').addEventListener('click', async () => {
      if (isWeapon && item.system.equipmentState !== undefined) {
        const newState = isEquipped ? 'unequipped' : 'oneHand';
        await item.update({ 'system.equipmentState': newState });
      }
      // For armor, update worn state
      else if (item.type === 'armor') {
        await item.update({ 'system.worn': !isEquipped });
      }
      // For other items (gear, etc), update equipped
      else if (item.system.equipped !== undefined) {
        await item.update({ 'system.equipped': !isEquipped });
      }
      this._hideInventoryContextMenu();
    });

    menu.querySelector('[data-action="edit"]').addEventListener('click', () => {
      item.sheet.render(true);
      this._hideInventoryContextMenu();
    });

    menu.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: `Delete ${item.name}?` },
        content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`,
        rejectClose: false,
        modal: true
      });
      if (confirmed) {
        await item.delete();
      }
      this._hideInventoryContextMenu();
    });

    // Close menu when clicking elsewhere
    setTimeout(() => {
      document.addEventListener('click', this._hideInventoryContextMenu.bind(this), { once: true });
    }, 10);
  }

  /**
   * Hide context menu
   * @private
   */
  _hideInventoryContextMenu() {
    if (this._currentContextMenu) {
      this._currentContextMenu.remove();
      this._currentContextMenu = null;
    }
  }

  /**
   * Show context menu for features, traits, and perks
   * @param {Event} event - The contextmenu event
   * @param {string|object} itemIdOrData - For perks: item ID string. For traits/features: object with {type, index}
   * @param {string} [itemType] - 'perk' (only used when itemIdOrData is a string)
   * @private
   */
  _showFeatureContextMenu(event, itemIdOrData, itemType) {
    this._hideInventoryContextMenu();

    let item = null;
    let sourceItem = null;
    let featureData = null;
    let canDelete = false;
    let editLabel = 'Edit';

    // Handle perks (real items)
    if (typeof itemIdOrData === 'string') {
      item = this.actor.items.get(itemIdOrData);
      if (!item) {
        console.log('Perk not found:', itemIdOrData);
        return;
      }
      canDelete = true;
    }
    // Handle traits (from ancestry)
    else if (itemIdOrData.type === 'trait') {
      sourceItem = this.actor.items.find(i => i.type === 'ancestry');
      if (!sourceItem || !sourceItem.system.traits) {
        console.log('Ancestry or traits not found');
        return;
      }
      featureData = sourceItem.system.traits[itemIdOrData.index];
      if (!featureData) {
        console.log('Trait not found at index:', itemIdOrData.index);
        return;
      }
      editLabel = 'Edit Ancestry';
    }
    // Handle features (from class)
    else if (itemIdOrData.type === 'feature') {
      sourceItem = this.actor.items.find(i => i.type === 'class');
      if (!sourceItem || !sourceItem.system.levelFeatures) {
        console.log('Class or features not found');
        return;
      }
      featureData = sourceItem.system.levelFeatures[itemIdOrData.index];
      if (!featureData) {
        console.log('Feature not found at index:', itemIdOrData.index);
        return;
      }
      editLabel = 'Edit Class';
    }

    event.preventDefault();
    event.stopPropagation();

    const menu = document.createElement('div');
    menu.className = 'inventory-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.style.zIndex = '10000';

    menu.innerHTML = `
      <div class="context-menu-item" data-action="sendToChat">
        <i class="fas fa-comment"></i>
        <span>Send to Chat</span>
      </div>
      <div class="context-menu-item" data-action="edit">
        <i class="fas fa-edit"></i>
        <span>${editLabel}</span>
      </div>
      ${canDelete ? `
        <div class="context-menu-item danger" data-action="delete">
          <i class="fas fa-trash"></i>
          <span>Delete</span>
        </div>
      ` : ''}
    `;

    this.element.appendChild(menu);
    this._currentContextMenu = menu;

    // Add click handlers
    menu.querySelector('[data-action="sendToChat"]').addEventListener('click', async () => {
      if (item) {
        // Perk
        await VagabondChatCard.featureUse(this.actor, item);
      } else if (featureData) {
        // Trait or Feature
        await VagabondChatCard.featureDataUse(this.actor, featureData, sourceItem, itemIdOrData.type);
      }
      this._hideInventoryContextMenu();
    });

    menu.querySelector('[data-action="edit"]').addEventListener('click', () => {
      if (item) {
        item.sheet.render(true);
      } else if (sourceItem) {
        sourceItem.sheet.render(true);
      }
      this._hideInventoryContextMenu();
    });

    if (canDelete) {
      menu.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: `Delete ${item.name}?` },
          content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`,
          rejectClose: false,
          modal: true
        });
        if (confirmed) {
          await item.delete();
        }
        this._hideInventoryContextMenu();
      });
    }

    // Close menu when clicking elsewhere
    setTimeout(() => {
      document.addEventListener('click', this._hideInventoryContextMenu.bind(this), { once: true });
    }, 10);
  }

  /**
   * Show mini-sheet popup for inventory item
   * @param {Event} event - The click event
   * @param {string} itemId - The item ID
   * @private
   */
  _showInventoryMiniSheet(event, itemId) {
    const item = this.actor.items.get(itemId);
    if (!item) return;

    // Remove any existing mini-sheet
    this._hideInventoryMiniSheet();

    const miniSheet = document.createElement('div');
    miniSheet.className = 'inventory-mini-sheet';
    miniSheet.style.position = 'fixed';
    miniSheet.style.zIndex = '10000';

    // Position near the click
    const x = Math.min(event.clientX + 10, window.innerWidth - 360);
    const y = Math.min(event.clientY + 10, window.innerHeight - 400);
    miniSheet.style.left = `${x}px`;
    miniSheet.style.top = `${y}px`;

    // Build content based on item type
    const content = this._buildMiniSheetContent(item);
    miniSheet.innerHTML = content;

    document.body.appendChild(miniSheet);
    this._currentMiniSheet = miniSheet;

    // Add close button handler
    const closeButton = miniSheet.querySelector('.mini-sheet-close');
    if (closeButton) {
      closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this._hideInventoryMiniSheet();
      });
    }

    // Close on click outside
    setTimeout(() => {
      document.addEventListener('click', this._hideInventoryMiniSheet.bind(this), { once: true });
    }, 10);

    // Prevent the click from immediately closing it
    event.stopPropagation();
  }

  /**
   * Build HTML content for mini-sheet based on item type
   * @param {VagabondItem} item - The item
   * @returns {string} HTML content
   * @private
   */
  _buildMiniSheetContent(item) {
    const isWeapon = (item.type === 'weapon') || (item.type === 'equipment' && item.system.equipmentType === 'weapon');
    const isArmor = (item.type === 'armor') || (item.type === 'equipment' && item.system.equipmentType === 'armor');
    const isRelic = (item.type === 'equipment' && item.system.equipmentType === 'relic');
    const isGear = (item.type === 'equipment' && ['gear', 'alchemical'].includes(item.system.equipmentType));

    // Header: Image (100x100) + Type above Name + Lore (if relic) + Close button
    let html = `
      <div class="mini-sheet-header">
        <img src="${item.img}" alt="${item.name}" class="mini-sheet-image" />
        <div class="mini-sheet-title">
          <span class="mini-sheet-type">${this._formatItemType(item)}</span>
          <h3>${item.name}</h3>
          ${isRelic && item.system.lore ? `<div class="mini-sheet-lore">${item.system.lore}</div>` : ''}
        </div>
        <button class="mini-sheet-close" type="button" aria-label="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;

    // Description (full width, no label)
    if (item.system.description) {
      html += `<div class="mini-sheet-description">${item.system.description}</div>`;
    }

    // Stats (two columns)
    if (isWeapon) {
      html += this._buildWeaponStats(item);
    } else if (isArmor) {
      html += this._buildArmorStats(item);
    } else if (isGear || isRelic) {
      html += this._buildGearStats(item);
    }

    // Properties with descriptions (full width at bottom)
    if (isWeapon && item.system.properties && item.system.properties.length > 0) {
      html += this._buildWeaponProperties(item);
    }

    return html;
  }

  /**
   * Format item type for display
   * @param {VagabondItem} item - The item
   * @returns {string} Formatted type
   * @private
   */
  _formatItemType(item) {
    if (item.type === 'equipment') {
      return item.system.equipmentType.charAt(0).toUpperCase() + item.system.equipmentType.slice(1);
    }
    return item.type.charAt(0).toUpperCase() + item.type.slice(1);
  }

  /**
   * Build weapon stats HTML (two-column grid)
   * @param {VagabondItem} item - The weapon item
   * @returns {string} HTML
   * @private
   */
  _buildWeaponStats(item) {
    return `
      <div class="mini-sheet-stats">
        <div class="stat-row">
          <span class="stat-name">Damage</span>
          <span class="stat-value">${item.system.currentDamage || item.system.damage || '—'} ${item.system.damageType || ''}</span>
        </div>
        <div class="stat-row">
          <span class="stat-name">Range</span>
          <span class="stat-value">${item.system.rangeDisplay || item.system.range || '—'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-name">Grip</span>
          <span class="stat-value">${item.system.gripDisplay || item.system.grip || '—'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-name">Weapon Skill</span>
          <span class="stat-value">${item.system.weaponSkill || '—'}</span>
        </div>
        ${item.system.metal && item.system.metal !== 'common' ? `
        <div class="stat-row">
          <span class="stat-name">Metal</span>
          <span class="stat-value">${item.system.metal}</span>
        </div>
        ` : ''}
        <div class="stat-row">
          <span class="stat-name">Cost</span>
          <span class="stat-value">${item.system.costDisplay || item.system.cost || '0'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-name">Slots</span>
          <span class="stat-value">${item.system.slots || 1}</span>
        </div>
      </div>
    `;
  }

  /**
   * Build armor stats HTML (two-column grid)
   * @param {VagabondItem} item - The armor item
   * @returns {string} HTML
   * @private
   */
  _buildArmorStats(item) {
    return `
      <div class="mini-sheet-stats">
        <div class="stat-row">
          <span class="stat-name">Armor Rating</span>
          <span class="stat-value">${item.system.finalRating || item.system.rating || '—'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-name">Type</span>
          <span class="stat-value">${item.system.armorType || '—'}</span>
        </div>
        ${item.system.metal && item.system.metal !== 'common' ? `
        <div class="stat-row">
          <span class="stat-name">Metal</span>
          <span class="stat-value">${item.system.metal}</span>
        </div>
        ` : ''}
        <div class="stat-row">
          <span class="stat-name">Cost</span>
          <span class="stat-value">${item.system.costDisplay || item.system.cost || '0'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-name">Slots</span>
          <span class="stat-value">${item.system.slots || 1}</span>
        </div>
      </div>
    `;
  }

  /**
   * Build gear stats HTML (two-column grid)
   * @param {VagabondItem} item - The gear item
   * @returns {string} HTML
   * @private
   */
  _buildGearStats(item) {
    return `
      <div class="mini-sheet-stats">
        ${item.system.quantity ? `
        <div class="stat-row">
          <span class="stat-name">Quantity</span>
          <span class="stat-value">${item.system.quantity}</span>
        </div>
        ` : ''}
        <div class="stat-row">
          <span class="stat-name">Cost</span>
          <span class="stat-value">${item.system.costDisplay || item.system.cost || '0'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-name">Slots</span>
          <span class="stat-value">${item.system.slots || 1}</span>
        </div>
      </div>
    `;
  }

  /**
   * Build weapon properties with descriptions
   * @param {VagabondItem} item - The weapon item
   * @returns {string} HTML
   * @private
   */
  _buildWeaponProperties(item) {
    const config = CONFIG.VAGABOND;

    return `
      <div class="mini-sheet-properties">
        <div class="mini-sheet-label">Properties</div>
        <div class="property-list">
          ${item.system.properties.map(prop => {
            const descriptionKey = config.weaponPropertyHints?.[prop] || '';
            const description = descriptionKey ? game.i18n.localize(descriptionKey) : '';
            return `
              <div class="property-row">
                <span class="property-name">${prop}:</span>
                <span class="property-description">${description}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Hide mini-sheet
   * @private
   */
  _hideInventoryMiniSheet() {
    if (this._currentMiniSheet) {
      this._currentMiniSheet.remove();
      this._currentMiniSheet = null;
    }
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

    // Level up and reset XP to 0
    await this.actor.update({
      'system.attributes.level.value': newLevel,
      'system.attributes.xp': 0
    });

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
    const accordionItem = target.closest('.feature.accordion-item');
    if (accordionItem) {
      accordionItem.classList.toggle('collapsed');
    }
  }

  /**
   * Handle toggling trait accordion (click on trait header)
   *
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The clicked element
   * @protected
   */
  static async _onToggleTrait(event, target) {
    event.preventDefault();
    const traitId = target.dataset.traitId;
    const accordionItem = target.closest('.trait.accordion-item');
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

    // Clear dropdown state when toggling lock mode
    this._openDropdowns = [];

    await this.actor.update({ 'system.locked': !currentLocked });
  }

  /**
   * Handle toggling NPC speed types
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onToggleSpeedType(event, target) {
    const type = target.dataset.type;
    const isChecked = target.checked;
    const currentTypes = this.actor.system.speedTypes || [];

    let newTypes;
    if (isChecked) {
      if (!currentTypes.includes(type)) {
        newTypes = [...currentTypes, type];
      } else {
        return;
      }
    } else {
      newTypes = currentTypes.filter(t => t !== type);
    }

    this._captureDropdownState(); // Uses your existing state capture
    await this.actor.update({ 'system.speedTypes': newTypes });
  }

  /**
   * Handle removing NPC speed type tag
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onRemoveSpeedType(event, target) {
    const type = target.dataset.type;
    if (!type) return;

    const currentTypes = this.actor.system.speedTypes || [];
    const newTypes = currentTypes.filter(t => t !== type);
    await this.actor.update({ 'system.speedTypes': newTypes });

    // Uncheck the corresponding checkbox
    const checkbox = this.element.querySelector(`input[type="checkbox"][data-type="${type}"]`);
    if (checkbox) checkbox.checked = false;
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
   * Handle adding a new NPC action
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onAddAction(event, target) {
    event.preventDefault();
    const actions = this.actor.system.actions || [];

    // Add a new empty action
    const newAction = {
      name: '',
      description: '',
      type: null,
      range: null,
      note: '',
      recharge: '',
      flatDamage: '',
      rollDamage: '',
      extraInfo: ''
    };

    await this.actor.update({ 'system.actions': [...actions, newAction] });
  }

  /**
   * Handle removing an NPC action
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onRemoveAction(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.index);
    const actions = this.actor.system.actions || [];

    // Remove the action at the specified index
    const newActions = actions.filter((_, i) => i !== index);
    await this.actor.update({ 'system.actions': newActions });
  }

  /**
     * Handle toggling action accordion in edit mode
     * Saves data only when closing the accordion.
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async _onToggleActionAccordion(event, target) {
      event.preventDefault();
      const index = parseInt(target.dataset.index);
      const actionEdit = this.element.querySelector(`.npc-action-edit[data-action-index="${index}"]`);

      if (actionEdit) {
        const content = actionEdit.querySelector('.action-edit-content');
        const icon = actionEdit.querySelector('.accordion-icon');

        if (content && icon) {
          const isCollapsed = content.classList.contains('collapsed');

          // UX LOGIC:
          // If we are currently OPEN (not collapsed) and about to CLOSE -> SAVE DATA
          if (!isCollapsed) {
            await this._saveNPCAction(index);
          }

          // Toggle visual state
          content.classList.toggle('collapsed');
          icon.classList.toggle('fa-chevron-right');
          icon.classList.toggle('fa-chevron-down');

          // Track state for re-renders
          if (!this._openActionAccordions) {
            this._openActionAccordions = new Set();
          }

          if (isCollapsed) {
            // It was collapsed, now it is open -> Add to set
            this._openActionAccordions.add(index);
          } else {
            // It was open, now it is collapsed -> Remove from set
            this._openActionAccordions.delete(index);
          }
        }
      }
    }

  /**
     * Handle toggling ability accordion in edit mode
     * Saves data only when closing the accordion.
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async _onToggleAbilityAccordion(event, target) {
      event.preventDefault();
      const index = parseInt(target.dataset.index);
      const abilityEdit = this.element.querySelector(`.npc-ability-edit[data-ability-index="${index}"]`);

      if (abilityEdit) {
        const content = abilityEdit.querySelector('.ability-edit-content');
        const icon = abilityEdit.querySelector('.accordion-icon');

        if (content && icon) {
          const isCollapsed = content.classList.contains('collapsed');

          // UX LOGIC:
          // If we are currently OPEN (not collapsed) and about to CLOSE -> SAVE DATA
          if (!isCollapsed) {
            await this._saveNPCAbility(index);
          }

          // Toggle visual state
          content.classList.toggle('collapsed');
          icon.classList.toggle('fa-chevron-right');
          icon.classList.toggle('fa-chevron-down');

          // Track state for re-renders
          if (!this._openAbilityAccordions) {
            this._openAbilityAccordions = new Set();
          }

          if (isCollapsed) {
            // It was collapsed, now it is open -> Add to set
            this._openAbilityAccordions.add(index);
          } else {
            // It was open, now it is collapsed -> Remove from set
            this._openAbilityAccordions.delete(index);
          }
        }
      }
    }

  /**
   * Handle morale check roll for NPCs
   * Roll 2d6 vs Morale. If total >= Morale, the NPC fails and retreats.
   * Blind GM roll - players don't see the result
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onRollMorale(event, target) {
    event.preventDefault();

    const morale = this.actor.system.morale;

    // Don't roll if morale is not set
    if (!morale || morale === null) {
      ui.notifications.warn(game.i18n.localize("VAGABOND.Actor.NPC.MoraleCheck.NoMorale"));
      return;
    }

    // Roll 2d6
    const roll = new Roll('2d6', this.actor.getRollData());
    await roll.evaluate();

    // Check if morale failed (roll >= morale means failure)
    const isPassed = roll.total < morale;

    // Create chat card using VagabondChatCard system
    const { VagabondChatCard } = await import('../helpers/chat-card.mjs');
    const card = new VagabondChatCard()
      .setType('morale-check')
      .setActor(this.actor)
      .setTitle(game.i18n.localize("VAGABOND.Actor.NPC.MoraleCheck.Title"))
      .setSubtitle(this.actor.name)
      .addRoll(roll, morale)
      .setOutcome(isPassed ? 'PASS' : 'FAIL');

    // Add metadata
    card.addMetadata(
      game.i18n.localize("VAGABOND.Actor.NPC.MoraleCheck.Target"),
      morale
    );

    // Send as blind GM roll
    await card.send({
      whisper: ChatMessage.getWhisperRecipients("GM"),
      blind: true
    });
  }

  /**
   * Handle clicking on action name (send to chat)
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onClickActionName(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.index);
    const action = this.actor.system.actions[index];

    if (!action || !action.name) return;

    // Use the unified chat card system
    const { VagabondChatCard } = await import('../helpers/chat-card.mjs');
    await VagabondChatCard.npcAction(this.actor, action, index);
  }

  /**
   * Handle clicking on action damage roll (roll the dice)
   * @param {Event} event
   * @param {HTMLElement} target
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
   * Handle adding a new NPC ability
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onAddAbility(event, target) {
    event.preventDefault();
    const abilities = this.actor.system.abilities || [];

    // Add a new empty ability
    const newAbility = {
      name: '',
      description: ''
    };

    await this.actor.update({ 'system.abilities': [...abilities, newAbility] });
  }

  /**
   * Handle removing an NPC ability
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onRemoveAbility(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.index);
    const abilities = this.actor.system.abilities || [];

    // Remove the ability at the specified index
    const newAbilities = abilities.filter((_, i) => i !== index);
    await this.actor.update({ 'system.abilities': newAbilities });
  }


  /**
   * Handle clicking on ability name (send to chat)
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onClickAbilityName(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.index);
    const ability = this.actor.system.abilities[index];

    if (!ability || !ability.name) return;

    // Use the unified chat card system
    const { VagabondChatCard } = await import('../helpers/chat-card.mjs');
    await VagabondChatCard.npcAbility(this.actor, ability);
  }

  /**
   * Create countdown dice from NPC action/ability recharge
   * Triggered when clicking on CdX recharge text in locked NPC sheet
   * @param {Event} event - Click event
   * @param {HTMLElement} target - The clicked element
   */
  static async _onCreateCountdownFromRecharge(event, target) {
    event.preventDefault();
    event.stopPropagation();

    // Extract dice type from data attribute
    // Can be data-dice-type (from recharge) or data-dice-size (from descriptions)
    let diceType = target.dataset.diceType || target.dataset.diceSize;

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

    // Find the parent action/ability container
    const actionView = target.closest('[data-action-index], [data-ability-index]');
    if (!actionView) {
      console.warn('Could not find action/ability container');
      return;
    }

    // Determine if it's an action or ability
    const actionIndex = actionView.dataset.actionIndex;
    const abilityIndex = actionView.dataset.abilityIndex;

    let name;
    if (actionIndex !== undefined) {
      const action = this.actor.system.actions[parseInt(actionIndex)];
      name = `${this.actor.name}: ${action.name}`;
    } else if (abilityIndex !== undefined) {
      const ability = this.actor.system.abilities[parseInt(abilityIndex)];
      name = `${this.actor.name}: ${ability.name}`;
    } else {
      console.warn('Could not determine action or ability');
      return;
    }

    // Create countdown dice
    const { CountdownDice } = globalThis.vagabond.documents;
    await CountdownDice.create({
      name: name,
      diceType: diceType,
      size: 'S', // Small size as requested
    });
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

    // FIX: Call the static method, forcing 'this' to be the current sheet instance
    await VagabondActorSheet._onRollWeapon.call(this, event, { dataset: { itemId } });
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
   * STATIC: DEFAULT_OPTIONS can find it.
   */

  static async _onRollWeapon(event, target = null) {
    event.preventDefault();

    // 1. Target Safety
    const element = target || event.currentTarget;
    const itemId = element.dataset.itemId || element.closest('[data-item-id]')?.dataset.itemId;
    const item = this.actor.items.get(itemId);

    if (!item) {
      ui.notifications.error('Item not found!');
      return;
    }

    // 2. Define Item Types
    const isWeapon = (item.type === 'weapon') ||
                     (item.type === 'equipment' && item.system.equipmentType === 'weapon');
    
    // FIX: Remove the "damageType !== '-'" check here so we catch ALL alchemicals
    const isAlchemical = item.type === 'equipment' &&
                         item.system.equipmentType === 'alchemical';

    if (!isWeapon && !isAlchemical) {
      ui.notifications.warn(game.i18n.localize("VAGABOND.UI.Errors.ItemNotRollable"));
      return;
    }

    try {
      /* PATH A: ALCHEMICAL */
      if (isAlchemical) {
        // SMART CHECK: If no damage type or no formula, treat as generic "Use Item"
        const hasDamage = item.system.damageType && 
                          item.system.damageType !== '-' && 
                          item.system.damageAmount;

        if (!hasDamage) {
            // Redirect to the simple Gear Use card
            return VagabondChatCard.gearUse(this.actor, item);
        }

        // Otherwise, proceed with the Roll logic
        let damageFormula = item.system.damageAmount;
        const roll = new Roll(damageFormula);
        await roll.evaluate();

        const damageTypeKey = item.system.damageType || 'physical';
        const damageTypeLabel = game.i18n.localize(CONFIG.VAGABOND.damageTypes[damageTypeKey] || damageTypeKey);

        const card = new VagabondChatCard()
          .setType('item-use')
          .setItem(item)
          .setActor(this.actor)
          .setTitle(item.name)
          .setSubtitle(this.actor.name)
          .addDamage(roll, damageTypeLabel, false, damageTypeKey);
        
        if (item.system.description) {
          const enriched = await foundry.applications.ux.TextEditor.enrichHTML(item.system.description, { async: true });
          card.setDescription(enriched);
        }
        await card.send();
        return roll;
      }

      /* PATH B: WEAPONS */
      const { VagabondDamageHelper } = await import('../helpers/damage-helper.mjs');

      const systemFavorHinder = this.actor.system.favorHinder || 'none';
      const favorHinder = VagabondActorSheet._calculateEffectiveFavorHinder(
        systemFavorHinder,
        event.shiftKey,
        event.ctrlKey
      );

      const attackResult = await item.rollAttack(this.actor, favorHinder);
      if (!attackResult) return;

      let damageRoll = null;
      if (VagabondDamageHelper.shouldRollDamage(attackResult.isHit)) {
        const statKey = attackResult.weaponSkill?.stat || null;
        damageRoll = await item.rollDamage(this.actor, attackResult.isCritical, statKey);
      }

      await VagabondChatCard.weaponAttack(this.actor, item, attackResult, damageRoll);
      return attackResult.roll;

    } catch (error) {
      console.error(error);
      ui.notifications.warn(error.message);
      return;
    }
  }

  /**
   * Handle using an item (gear, relic, or alchemical) to post to chat.
   * Creates a chat card displaying the item's details.
   *
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */

  static async _onUseItem(event, target) {
    event.preventDefault();
    
    // 1. Target Safety
    const element = target || event.currentTarget;
    const itemId = element.dataset.itemId || element.closest('[data-item-id]')?.dataset.itemId;
    const item = this.actor.items.get(itemId);

    if (!item) {
      ui.notifications.error('Item not found!');
      return;
    }

    // 2. Create Card
    await VagabondChatCard.gearUse(this.actor, item);
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

    // Check if this is a weapon (legacy weapon item OR equipment with equipmentType='weapon')
    const isWeapon = weapon && ((weapon.type === 'weapon') ||
                                (weapon.type === 'equipment' && weapon.system.equipmentType === 'weapon'));

    if (!isWeapon) {
      ui.notifications.error('Weapon not found!');
      return;
    }

    // Get the weapon's grip type
    const grip = weapon.system.grip;
    const currentState = weapon.system.equipmentState || 'unequipped';
    let nextState;

    // Cycle through equipment states based on grip type
    if (grip === '2H') {
      // Two-handed only weapons: unequipped <-> twoHands
      nextState = currentState === 'unequipped' ? 'twoHands' : 'unequipped';
    } else if (grip === '1H' || grip === 'F') {
      // One-handed only or fist weapons: unequipped <-> oneHand
      nextState = currentState === 'unequipped' ? 'oneHand' : 'unequipped';
    } else if (grip === 'V') {
      // Versatile weapons: full cycle unequipped -> oneHand -> twoHands -> unequipped
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
    } else {
      // Unknown grip type - default to one-handed behavior
      nextState = currentState === 'unequipped' ? 'oneHand' : 'unequipped';
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

    // Check if this is a weapon (legacy weapon item OR equipment with equipmentType='weapon')
    const isWeapon = weapon && ((weapon.type === 'weapon') ||
                                (weapon.type === 'equipment' && weapon.system.equipmentType === 'weapon'));

    if (!isWeapon) {
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

    // Check if this is armor (legacy armor item OR equipment with equipmentType='armor')
    const isArmor = armor && ((armor.type === 'armor') ||
                             (armor.type === 'equipment' && armor.system.equipmentType === 'armor'));

    if (!isArmor) {
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

    // Apply favor/hinder with keyboard modifiers
    const systemFavorHinder = this.actor.system.favorHinder || 'none';
    const favorHinder = VagabondActorSheet._calculateEffectiveFavorHinder(
      systemFavorHinder,
      event.shiftKey,
      event.ctrlKey
    );
    let rollFormula = 'd20';

    if (favorHinder === 'favor') {
      rollFormula = 'd20 + 1d6';
    } else if (favorHinder === 'hinder') {
      rollFormula = 'd20 - 1d6';
    }

    // Apply universal check bonus
    const checkBonus = this.actor.system.universalCheckBonus || 0;
    if (checkBonus !== 0) {
      rollFormula += ` + ${checkBonus}`;
    }

    const roll = new Roll(rollFormula, this.actor.getRollData());
    await roll.evaluate();

    const isSuccess = roll.total >= difficulty;

    // Check critical - ONLY the d20 result, not including favor/hinder
    const critNumber = this.actor.system.critNumber || 20;
    const d20Term = roll.terms.find(term => term.constructor.name === 'Die' && term.faces === 20);
    const d20Result = d20Term?.results?.[0]?.result || 0;
    const isCritical = d20Result >= critNumber;

    // If successful, deduct mana
    if (isSuccess) {
      const newMana = this.actor.system.mana.current - costs.totalCost;
      await this.actor.update({ 'system.mana.current': newMana });
    }
    // Failed - no mana cost (chat card will show failure)

    // Create chat message
    await this._createSpellChatCard(spell, state, costs, roll, difficulty, isSuccess, isCritical);

    // Reset spell state (keep deliveryType, reset useFx to default)
    const defaultUseFx = spell?.system?.damageType === '-';
    this.spellStates[spellId] = {
      damageDice: 1,
      deliveryType: state.deliveryType, // Keep last selected delivery
      deliveryIncrease: 0,
      useFx: defaultUseFx  // Reset to default based on spell type
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
   * @param {boolean} isCritical - Whether the roll was a critical hit
   * @private
   */
  async _createSpellChatCard(spell, state, costs, roll, difficulty, isSuccess, isCritical) {
    // Import damage helper
    const { VagabondDamageHelper } = await import('../helpers/damage-helper.mjs');

    // Build delivery text with total area (e.g., "Cone 20'")
    const deliveryName = game.i18n.localize(CONFIG.VAGABOND.deliveryTypes[state.deliveryType]);
    const totalArea = this._getDeliveryTotalArea(state.deliveryType, state.deliveryIncrease);
    const deliveryText = totalArea ? `${deliveryName} ${totalArea}` : deliveryName;

    // Get the mana skill's stat for crit bonus damage
    const manaSkillKey = this.actor.system.classData?.manaSkill;
    const manaSkill = manaSkillKey ? this.actor.system.skills[manaSkillKey] : null;
    const manaSkillStat = manaSkill?.stat || 'reason'; // Fallback to reason if not found

    // Determine if we should auto-roll damage
    let damageRoll = null;
    if (spell.system.damageType !== '-') {
      if (VagabondDamageHelper.shouldRollDamage(isSuccess)) {
        damageRoll = await VagabondDamageHelper.rollSpellDamage(this.actor, spell, state, isCritical, manaSkillStat);
      }
    }

    // Build spell cast result object
    const spellCastResult = {
      roll,
      difficulty,
      isSuccess,
      isCritical,
      manaSkill,
      manaSkillKey,
      spellState: state,
      costs,
      deliveryText
    };

    // Use universal chat card
    await VagabondChatCard.spellCast(this.actor, spell, spellCastResult, damageRoll);
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
   * Toggle Fx (Effect) checkbox for a spell
   * @this VagabondActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _onToggleFx(event, target) {
    event.preventDefault();
    const spellId = target.dataset.spellId;
    const state = this._getSpellState(spellId);

    // Toggle Fx state
    state.useFx = !state.useFx;

    this._saveSpellStates();
    this._updateSpellDisplay(spellId);
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
   * Calculate effective favor/hinder state based on system state and keyboard modifiers.
   * Shift = Favor, Ctrl = Hinder. If they conflict with system state, they cancel out.
   * @param {string} systemState - The actor's current favorHinder state ('favor', 'hinder', or 'none')
   * @param {boolean} shiftKey - Whether Shift key was pressed
   * @param {boolean} ctrlKey - Whether Ctrl key was pressed
   * @returns {string} The effective favorHinder state ('favor', 'hinder', or 'none')
   * @private
   */
  static _calculateEffectiveFavorHinder(systemState, shiftKey, ctrlKey) {
    // Determine modifier intent
    let modifierIntent = 'none';
    if (shiftKey && !ctrlKey) {
      modifierIntent = 'favor';
    } else if (ctrlKey && !shiftKey) {
      modifierIntent = 'hinder';
    } else if (shiftKey && ctrlKey) {
      // Both pressed - cancel out
      modifierIntent = 'none';
    }

    // If no modifier, return system state
    if (modifierIntent === 'none') {
      return systemState || 'none';
    }

    // If modifier matches system state, keep it
    if (modifierIntent === systemState) {
      return modifierIntent;
    }

    // If modifier conflicts with system state, they cancel out
    if (systemState === 'favor' && modifierIntent === 'hinder') {
      return 'none';
    }
    if (systemState === 'hinder' && modifierIntent === 'favor') {
      return 'none';
    }

    // If system state is 'none', apply modifier
    return modifierIntent;
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
      // Apply favor/hinder based on system state and keyboard modifiers
      const systemFavorHinder = this.actor.system.favorHinder || 'none';
      const favorHinder = VagabondActorSheet._calculateEffectiveFavorHinder(
        systemFavorHinder,
        event.shiftKey,
        event.ctrlKey
      );
      let rollFormula = dataset.roll;

      if (favorHinder === 'favor') {
        rollFormula = `${dataset.roll} + 1d6`;
      } else if (favorHinder === 'hinder') {
        rollFormula = `${dataset.roll} - 1d6`;
      }

      // Apply universal check bonus
      const checkBonus = this.actor.system.universalCheckBonus || 0;
      if (checkBonus !== 0) {
        rollFormula += ` + ${checkBonus}`;
      }

      // Import dice appearance helper
      const { VagabondDiceAppearance } = await import('../helpers/dice-appearance.mjs');

      let roll = new Roll(rollFormula, this.actor.getRollData());
      await VagabondDiceAppearance.evaluateWithCustomColors(roll, favorHinder);

      // Determine roll type and use VagabondChatCard for stats, saves, and skills
      const rollType = dataset.rollType;

      if (rollType === 'stat') {
        // Stat roll
        const statKey = dataset.statKey;
        const difficulty = dataset.difficulty ? parseInt(dataset.difficulty) : null;
        const isSuccess = difficulty ? roll.total >= difficulty : null;

        await VagabondChatCard.statRoll(
          this.actor,
          statKey,
          roll,
          difficulty,
          isSuccess
        );
        return roll;
      } else if (rollType === 'save') {
        // Save roll
        const saveKey = dataset.saveKey;
        const difficulty = dataset.difficulty ? parseInt(dataset.difficulty) : null;
        const isSuccess = difficulty ? roll.total >= difficulty : null;

        await VagabondChatCard.saveRoll(
          this.actor,
          saveKey,
          roll,
          difficulty,
          isSuccess
        );
        return roll;
      } else if (rollType === 'skill' || rollType === 'weapon-skill') {
        // Skill roll (including weapon skills)
        const skillKey = dataset.skillKey;
        const difficulty = dataset.difficulty ? parseInt(dataset.difficulty) : null;
        const isSuccess = difficulty ? roll.total >= difficulty : null;

        await VagabondChatCard.skillRoll(
          this.actor,
          skillKey,
          roll,
          difficulty,
          isSuccess
        );
        return roll;
      } else {
        // Fallback to old behavior for other rolls
        let label = dataset.label ? `[ability] ${dataset.label}` : '';
        if (favorHinder === 'favor') {
          label += ' [Favor +1d6]';
        } else if (favorHinder === 'hinder') {
          label += ' [Hinder -1d6]';
        }
        await VagabondChatHelper.postRoll(this.actor, roll, label);
        return roll;
      }
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
   * Handle dropping of items onto the actor sheet
   * @param {DragEvent} event     The concluding DragEvent which contains drop data
   * @returns {Promise}
   * @protected
   */
  async _onDrop(event) {
    // CRITICAL: Check for ProseMirror BEFORE calling getDragEventData()
    // The dataTransfer can only be read once, so we must not consume it
    const proseMirror = event.target.closest('prose-mirror');
    if (proseMirror) {
      // Don't consume the event - let ProseMirror handle it
      return;
    }

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
        // Delete the existing ancestry - this should also remove its effects
        await existingAncestry.delete();
      }

      // Only keep the FIRST ancestry if multiple are dropped
      const selectedAncestry = ancestryItems[0];

      // Filter out ALL ancestry items from original data, then add back only the selected one
      const nonAncestryItems = itemData.filter(data => data.type !== 'ancestry');
      itemData = [...nonAncestryItems, selectedAncestry];
    }

    // YOUR CUSTOM: Handle class replacement logic BEFORE creating any items
    const classItems = itemData.filter(data => data.type === 'class');

    if (classItems.length > 0) {
      // Find existing class and remove it FIRST, including its effects
      const existingClass = this.actor.items.find(item => item.type === 'class');
      if (existingClass) {
        // Delete the existing class - this should also remove its effects
        await existingClass.delete();
      }

      // Only keep the FIRST class if multiple are dropped
      const selectedClass = classItems[0];

      // Filter out ALL class items from original data, then add back only the selected one
      const nonClassItems = itemData.filter(data => data.type !== 'class');
      itemData = [...nonClassItems, selectedClass];
    }

    // YOUR CUSTOM: Handle starter pack unpacking BEFORE creating any items
    const starterPackItems = itemData.filter(data => data.type === 'starterPack');

    if (starterPackItems.length > 0) {
      // Process each starter pack
      for (const packData of starterPackItems) {
        // Load the pack items from UUIDs
        const itemsToCreate = [];

        for (const packItem of packData.system.items) {
          try {
            const item = await fromUuid(packItem.uuid);
            if (item) {
              // Clone the item data and set quantity
              const itemClone = item.toObject();

              // If the item has a quantity field, multiply it by the pack quantity
              if (itemClone.system.quantity !== undefined) {
                itemClone.system.quantity = (itemClone.system.quantity || 1) * packItem.quantity;
              }

              itemsToCreate.push(itemClone);

              // If we need multiple copies (for items without quantity), add them separately
              if (packItem.quantity > 1 && itemClone.system.quantity === undefined) {
                for (let i = 1; i < packItem.quantity; i++) {
                  itemsToCreate.push(item.toObject());
                }
              }
            }
          } catch (error) {
            console.warn(`Failed to load item with UUID ${packItem.uuid}:`, error);
          }
        }

        // Set the character's currency
        if (this.actor.type === 'character') {
          await this.actor.update({
            'system.currency.gold': packData.system.currency.gold,
            'system.currency.silver': packData.system.currency.silver,
            'system.currency.copper': packData.system.currency.copper,
          });
        }

        // Create all items from the pack
        if (itemsToCreate.length > 0) {
          await this.actor.createEmbeddedDocuments('Item', itemsToCreate);
        }

        // Show notification
        ui.notifications.info(`Unpacked "${packData.name}" - added ${itemsToCreate.length} items and set currency to ${packData.system.currency.gold}g ${packData.system.currency.silver}s ${packData.system.currency.copper}c`);
      }

      // Remove starter packs from itemData (we don't want to add the pack itself)
      itemData = itemData.filter(data => data.type !== 'starterPack');
    }

    return this.actor.createEmbeddedDocuments('Item', itemData);
  }

  /********************
   *
   * Inventory Grid Interactions
   *
   ********************/

  /**
   * Auto-arrange inventory items in the grid
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked element
   * @private
   */
  static async _onAutoArrangeInventory(event, target) {
    const sheet = target.closest('.vagabond.actor');
    if (!sheet) return;

    const actor = game.actors.get(sheet.dataset.actorId);
    if (!actor) return;

    // Sort items by slots (largest first) for optimal packing
    const items = actor.items.filter(i =>
      i.type === 'equipment' || i.type === 'weapon' || i.type === 'armor' || i.type === 'gear'
    ).sort((a, b) => (b.system.slots || 1) - (a.system.slots || 1));

    // Assign grid positions sequentially
    const updates = items.map((item, index) => ({
      _id: item.id,
      'system.gridPosition': index
    }));

    await actor.updateEmbeddedDocuments('Item', updates);
    // ui.notifications.info('Inventory auto-arranged');
  }

  /**
   * Equip an item from context menu
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked element
   * @private
   */
  static async _onEquipItem(event, target) {
    const itemId = target.closest('[data-item-id]')?.dataset.itemId;
    if (!itemId) return;

    const sheet = target.closest('.vagabond.actor');
    if (!sheet) return;

    const actor = game.actors.get(sheet.dataset.actorId);
    if (!actor) return;

    const item = actor.items.get(itemId);
    if (!item) return;

    // Toggle equipped state
    const isEquipped = item.system.equipped !== undefined
      ? item.system.equipped
      : item.system.equipmentState !== 'unequipped';

    if (item.system.equipped !== undefined) {
      await item.update({ 'system.equipped': !isEquipped });
    } else if (item.system.equipmentState) {
      const newState = isEquipped ? 'unequipped' : 'oneHand';
      await item.update({ 'system.equipmentState': newState });
    }
  }

  /**
   * Edit an item from context menu
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked element
   * @private
   */
  static async _onEditItem(event, target) {
    const itemId = target.closest('[data-item-id]')?.dataset.itemId;
    if (!itemId) return;

    const sheet = target.closest('.vagabond.actor');
    if (!sheet) return;

    const actor = game.actors.get(sheet.dataset.actorId);
    if (!actor) return;

    const item = actor.items.get(itemId);
    if (!item) return;

    item.sheet.render(true);
  }

  /**
   * Delete an item from context menu
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked element
   * @private
   */
  static async _onDeleteItem(event, target) {
    const itemId = target.closest('[data-item-id]')?.dataset.itemId;
    if (!itemId) return;

    const sheet = target.closest('.vagabond.actor');
    if (!sheet) return;

    const actor = game.actors.get(sheet.dataset.actorId);
    if (!actor) return;

    const item = actor.items.get(itemId);
    if (!item) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Delete ${item.name}?` },
      content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`,
      rejectClose: false,
      modal: true
    });

    if (confirmed) {
      await item.delete();
      // ui.notifications.info(`Deleted ${item.name}`);
    }
  }

  /**
   * Handle spending or recharging luck
   * Left-click: Spend 1 luck and post chat card
   * Shift+Left-click: Recharge 1 luck (no chat message)
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The clicked element
   * @private
   */
  static async _onSpendLuck(event, target) {
    event.preventDefault();

    const currentLuck = this.actor.system.currentLuck || 0;
    const maxLuck = this.actor.system.maxLuck || 8;

    // Shift+Click: Recharge luck
    if (event.shiftKey) {
      if (currentLuck >= maxLuck) {
        ui.notifications.warn(game.i18n.localize('VAGABOND.Notifications.LuckAlreadyMax'));
        return;
      }
      await this.actor.update({ 'system.currentLuck': Math.min(currentLuck + 1, maxLuck) });
      return;
    }

    // Normal click: Spend luck
    if (currentLuck <= 0) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Notifications.NoLuckRemaining'));
      return;
    }

    // Decrease luck and get the new value
    const newLuck = currentLuck - 1;
    await this.actor.update({ 'system.currentLuck': newLuck });

    // Create chat message using VagabondChatCard
    const { VagabondChatCard } = await import('../helpers/chat-card.mjs');
    await VagabondChatCard.luckSpend(this.actor, newLuck, maxLuck);
  }

  /**
   * Handle spending or adding studied dice
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  static async _onSpendStudiedDie(event, target) {
    event.preventDefault();

    const currentDice = this.actor.system.studiedDice || 0;

    // Shift+Click: Add a studied die
    if (event.shiftKey) {
      await this.actor.update({ 'system.studiedDice': currentDice + 1 });
      ui.notifications.info(`Added a Studied Die (${currentDice} → ${currentDice + 1})`);
      return;
    }

    // Normal click: Spend a studied die
    if (currentDice <= 0) {
      ui.notifications.warn('No Studied Dice available to spend!');
      return;
    }

    const newDice = currentDice - 1;
    await this.actor.update({ 'system.studiedDice': newDice });

    // Create chat message
    const { VagabondChatCard } = await import('../helpers/chat-card.mjs');
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(this.actor)
      .setTitle('Studied Die Spent')
      .setSubtitle(this.actor.name)
      .setDescription(`
        <p><i class="fas fa-book-open"></i> <strong>${this.actor.name}</strong> spends a Studied Die.</p>
        <p><em>Remaining: ${newDice}</em></p>
        <p style="font-size: 0.8em; color: #666;">Use this to gain Favor on your next d20 roll.</p>
      `);

    await card.send();
  }

  /**
   * Open the downtime activities dialog
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  static async _onOpenDowntime(event, target) {
    event.preventDefault();

    // Import and instantiate the DowntimeApp
    const { DowntimeApp } = await import('../applications/downtime-app.mjs');
    const app = new DowntimeApp(this.actor);
    app.render({ force: true });
  }

  /**
     * Saves the state of a dropdown container to the actor.
     * Handles both Checkboxes (Arrays) and Radio Buttons (Single Strings).
     * @param {HTMLElement} detailsElement - The <details> element
     */
    async _saveDropdown(detailsElement) {
      const targetField = detailsElement.dataset.saveTarget;
      if (!targetField) return;

      // Detect input type by checking the first input found
      const firstInput = detailsElement.querySelector('input');
      if (!firstInput) return;
      
      // --- CASE A: Radio Buttons (Single Value) ---
      if (firstInput.type === 'radio') {
        const checked = detailsElement.querySelector('input:checked');
        const newValue = checked ? checked.value : null;
        const currentValue = foundry.utils.getProperty(this.actor, targetField);

        if (newValue !== currentValue) {
          await this.actor.update({ [targetField]: newValue });
        }
      } 
      
      // --- CASE B: Checkboxes (Array of Values) ---
      else {
        const checkboxes = detailsElement.querySelectorAll('input[type="checkbox"]');
        const newValues = Array.from(checkboxes)
          .filter(cb => cb.checked)
          .map(cb => cb.value);

        const currentValues = foundry.utils.getProperty(this.actor, targetField) || [];
        
        const isSame = newValues.length === currentValues.length && 
                      newValues.every(v => currentValues.includes(v));

        if (!isSame) {
          await this.actor.update({ [targetField]: newValues });
        }
      }
    }

  /**
   * Manually saves the data from an NPC action accordion to the actor.
   * Used to prevent constant re-renders while typing.
   * @param {number} index - The index of the action in the system.actions array
   * @private
   */
  async _saveNPCAction(index) {
    const actionEl = this.element.querySelector(`.npc-action-edit[data-action-index="${index}"]`);
    if (!actionEl) return;

    // 1. Get the current array from the actor to avoid overwriting other data
    const actions = foundry.utils.deepClone(this.actor.system.actions || []);
    if (!actions[index]) return;

    // 2. Read values directly from the DOM inputs
    // We look for inputs with 'data-field' attributes (defined in your template)
    const inputs = actionEl.querySelectorAll('[data-field]');
    let hasChanges = false;

    inputs.forEach(input => {
      const field = input.dataset.field; // e.g., "name", "description", "rollDamage"
      const value = input.value;
      
      // Only update if changed
      if (actions[index][field] !== value) {
        actions[index][field] = value;
        hasChanges = true;
      }
    });

    // 3. Update the actor only if something actually changed
    if (hasChanges) {
      await this.actor.update({ 'system.actions': actions });
    }
  }

  // Duplicate logic for Abilities if needed
  async _saveNPCAbility(index) {
    const abilityEl = this.element.querySelector(`.npc-ability-edit[data-ability-index="${index}"]`);
    if (!abilityEl) return;

    const abilities = foundry.utils.deepClone(this.actor.system.abilities || []);
    if (!abilities[index]) return;

    const inputs = abilityEl.querySelectorAll('[data-field]');
    let hasChanges = false;

    inputs.forEach(input => {
      const field = input.dataset.field;
      const value = input.value;
      
      if (abilities[index][field] !== value) {
        abilities[index][field] = value;
        hasChanges = true;
      }
    });

    if (hasChanges) {
      await this.actor.update({ 'system.abilities': abilities });
    }
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
    // Clear any pending debounce
    if (this._formSubmitDebounce) {
      clearTimeout(this._formSubmitDebounce);
    }

    // Debounce the actual update by 500ms (fallback if submitDelay not supported)
    this._formSubmitDebounce = setTimeout(async () => {
      // Store which immunity dropdowns are open before update
      this._captureDropdownState();

      const overrides = foundry.utils.flattenObject(this.actor.overrides);
      for (let k of Object.keys(overrides)) delete submitData[k];
      await this.document.update(submitData);
    }, 500);
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
   * Setup click outside handler for accordions
   * @private
   */
/**
   * Sets up global click listener to close Accordions and Dropdowns when clicking outside.
   * Also triggers "Buffered Save" logic.
   * @private
   */
  _setupAccordionClickOutside() {
    if (this._accordionClickOutsideHandler) {
      document.removeEventListener('click', this._accordionClickOutsideHandler);
    }

    this._accordionClickOutsideHandler = async (event) => {
      
      // --- 1. Handle NPC Actions (Accordion) ---
      const openActionAccordions = this.element.querySelectorAll('.npc-action-edit .action-edit-content:not(.collapsed)');
      for (const content of openActionAccordions) {
        const accordion = content.closest('.npc-action-edit');
        if (accordion && !accordion.contains(event.target)) {
          const index = parseInt(accordion.dataset.actionIndex);
          const icon = accordion.querySelector('.accordion-icon');

          await this._saveNPCAction(index); // Save

          content.classList.add('collapsed');
          if (icon) {
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-right');
          }
          if (this._openActionAccordions) this._openActionAccordions.delete(index);
        }
      }

      // --- 2. Handle NPC Abilities (Accordion) ---
      const openAbilityAccordions = this.element.querySelectorAll('.npc-ability-edit .ability-edit-content:not(.collapsed)');
      for (const content of openAbilityAccordions) {
        const accordion = content.closest('.npc-ability-edit');
        if (accordion && !accordion.contains(event.target)) {
          const index = parseInt(accordion.dataset.abilityIndex);
          const icon = accordion.querySelector('.accordion-icon');

          await this._saveNPCAbility(index); // Save

          content.classList.add('collapsed');
          if (icon) {
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-right');
          }
          if (this._openAbilityAccordions) this._openAbilityAccordions.delete(index);
        }
      }

      // --- 3. Handle NPC Dropdowns (Immunities, Weaknesses, etc) ---
      // Select any open <details> element that has a save target
      const openDropdowns = this.element.querySelectorAll('details.npc-immunity-dropdown[open][data-save-target]');
      
      for (const details of openDropdowns) {
        // If the click happened OUTSIDE this details element
        if (!details.contains(event.target)) {
          
          await this._saveDropdown(details); // Save selections
          
          details.removeAttribute('open');   // Close the dropdown
        }
      }
    };

    document.addEventListener('click', this._accordionClickOutsideHandler);
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

  /**
   * Clean up event listeners when sheet closes
   * @override
   */
  async close(options = {}) {
    // Clear any pending form submission
    if (this._formSubmitDebounce) {
      clearTimeout(this._formSubmitDebounce);
      this._formSubmitDebounce = null;
    }

    // Remove click outside handler
    if (this._accordionClickOutsideHandler) {
      document.removeEventListener('click', this._accordionClickOutsideHandler);
      this._accordionClickOutsideHandler = null;
    }
    return super.close(options);
  }
}
