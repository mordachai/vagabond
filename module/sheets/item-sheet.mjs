import { prepareActiveEffectCategories } from '../helpers/effects.mjs';

const { api, sheets } = foundry.applications;
const DragDrop = foundry.applications.ux.DragDrop;

/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheetV2}
 */
export class VagabondItemSheet extends api.HandlebarsApplicationMixin(
  sheets.ItemSheetV2
) {
  constructor(options = {}) {
    super(options);
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['vagabond', 'item'],
    actions: {
      onEditImage: this._onEditImage,
      viewDoc: this._viewEffect,
      createDoc: this._createEffect,
      deleteDoc: this._deleteEffect,
      toggleEffect: this._toggleEffect,
      addTrait: this._onAddTrait,
      removeTrait: this._onRemoveTrait,
      addLevelFeature: this._onAddLevelFeature,
      removeLevelFeature: this._onRemoveLevelFeature,
      addStatPrerequisite: this._onAddStatPrerequisite,
      removeStatPrerequisite: this._onRemoveStatPrerequisite,
      addTrainedSkillPrerequisite: this._onAddTrainedSkillPrerequisite,
      removeTrainedSkillPrerequisite: this._onRemoveTrainedSkillPrerequisite,
      addSpellPrerequisite: this._onAddSpellPrerequisite,
      removeSpellPrerequisite: this._onRemoveSpellPrerequisite,
      addOtherPrerequisite: this._onAddOtherPrerequisite,
      removeOtherPrerequisite: this._onRemoveOtherPrerequisite,
      toggleWeaponProperty: this._onToggleWeaponProperty,
      removeWeaponProperty: this._onRemoveWeaponProperty,
      toggleImmunity: this._onToggleImmunity,
      removeImmunity: this._onRemoveImmunity,
      toggleLock: this._onToggleLock,
      removePackItem: this._onRemovePackItem,
      equipFromContainer: this._onEquipFromContainer,
      deleteFromContainer: this._onDeleteFromContainer,
    },
    form: {
      submitOnChange: true,
    },
    // Custom property that's merged into `this.options`
    dragDrop: [{ dragSelector: '.draggable', dropSelector: null }],
  };

  /** * V13 Standard: Define Event Listeners here.
   * This maps the "change" event on elements with data-action="update-grip" 
   * to the _onUpdateGrip function.
   */
  static EVENTS = {
    'change [data-action="update-grip"]': "_onUpdateGrip",
  }

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    header: {
      template: 'systems/vagabond/templates/item/header.hbs',
    },
    tabs: {
      // Foundry-provided generic template
      template: 'templates/generic/tab-navigation.hbs',
    },
    description: {
      template: 'systems/vagabond/templates/item/description.hbs',
    },
    equipmentDetails: {
      template: 'systems/vagabond/templates/item/details-parts/equipment-details.hbs',
    },
    spellDetails: {
      template: 'systems/vagabond/templates/item/details-parts/spell-details.hbs',
    },
    ancestryDetails: {
      template: 'systems/vagabond/templates/item//details-parts/ancestry-details.hbs',
    },
    classDetails: {
      template: 'systems/vagabond/templates/item/details-parts/class-details.hbs',
    },
    perkDetails: {
      template: 'systems/vagabond/templates/item/details-parts/perk-details.hbs',
    },
    starterPackDetails: {
      template: 'systems/vagabond/templates/item/details-parts/starter-pack-details.hbs',
    },
    containerDetails: {
      template: 'systems/vagabond/templates/item/details-parts/container-details.hbs',
    },
    effects: {
      template: 'systems/vagabond/templates/item/effects.hbs',
    },
  };

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.parts = ['header', 'tabs'];
    if (this.document.limited) return;
    switch (this.document.type) {
      case 'equipment':
        // Equipment template now handles both locked and unlocked states internally
        options.parts.push('equipmentDetails', 'effects');
        break;
      case 'spell':
        options.parts.push('spellDetails', 'effects');
        break;
      case 'ancestry':
        options.parts.push('ancestryDetails', 'effects');
        break;
      case 'class':
        options.parts.push('classDetails', 'effects');
        break;
      case 'perk':
        options.parts.push('perkDetails', 'effects');
        break;
      case 'starterPack':
        options.parts.push('starterPackDetails', 'effects');
        break;
      case 'container':
        options.parts.push('containerDetails', 'effects');
        break;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = {
      // Validates both permissions and compendium status
      editable: this.isEditable,
      owner: this.document.isOwner,
      limited: this.document.limited,
      // Add the item document.
      item: this.item,
      // Adding system and flags for easier access
      system: this.item.system,
      flags: this.item.flags,
      // Adding a pointer to CONFIG.VAGABOND
      config: CONFIG.VAGABOND,
      // You can factor out context construction to helper functions
      tabs: this._getTabs(options.parts),
      // Necessary for formInput and formFields helpers
      fields: this.document.schema.fields,
      systemFields: this.document.system.schema.fields,
    };

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context) {
    switch (partId) {
      case 'equipmentDetails':
        // Equipment gets enriched description like the details tab
        context.tab = context.tabs[partId];
        context.enriched = {
          description: await foundry.applications.ux.TextEditor.enrichHTML(
            this.item.system.description,
            {
              secrets: this.document.isOwner,
              rollData: this.item.getRollData(),
              relativeTo: this.item,
            }
          )
        };
        // Prepare list of consumable items from the actor (if item is owned)
        context.actorConsumableItems = [];
        if (this.item.actor) {
          context.actorConsumableItems = this.item.actor.items
            .filter(i => i.type === 'equipment' && i.system.isConsumable && i.id !== this.item.id)
            .map(i => ({
              id: i.id,
              name: i.name,
              system: { quantity: i.system.quantity }
            }));
        }
        break;

      case 'spellDetails':
        // Spell gets enriched description like the details tab
        context.tab = context.tabs[partId];
        context.enriched = {
          description: await foundry.applications.ux.TextEditor.enrichHTML(
            this.item.system.description,
            {
              secrets: this.document.isOwner,
              rollData: this.item.getRollData(),
              relativeTo: this.item,
            }
          )
        };
        break;

      case 'ancestryDetails':
        // Ancestry gets enriched description like the description tab
        context.tab = context.tabs[partId];
        context.enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(
          this.item.system.description,
          {
            secrets: this.document.isOwner,
            rollData: this.item.getRollData(),
            relativeTo: this.item,
          }
        );
        break;

      case 'classDetails':
        // Class gets enriched description like the description tab
        context.tab = context.tabs[partId];
        context.enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(
          this.item.system.description,
          {
            secrets: this.document.isOwner,
            rollData: this.item.getRollData(),
            relativeTo: this.item,
          }
        );
        // Prepare level groups (1-10) with their features
        context.levelGroups = [];
        for (let level = 1; level <= 10; level++) {
          const features = this.item.system.levelFeatures
            .map((f, index) => ({ ...f, index }))
            .filter(f => f.level === level);
          context.levelGroups.push({
            level,
            features
          });
        }
        break;

      case 'perkDetails':
        // Perk gets enriched description like the description tab
        context.tab = context.tabs[partId];
        context.enriched = {
          description: await foundry.applications.ux.TextEditor.enrichHTML(
            this.item.system.description,
            {
              secrets: this.document.isOwner,
              rollData: this.item.getRollData(),
              relativeTo: this.item,
            }
          )
        };
        break;

      case 'starterPackDetails':
        // Starter Pack gets enriched description and loaded items
        context.tab = context.tabs[partId];
        context.enriched = {
          description: await foundry.applications.ux.TextEditor.enrichHTML(
            this.item.system.description,
            {
              secrets: this.document.isOwner,
              rollData: this.item.getRollData(),
              relativeTo: this.item,
            }
          )
        };

        // Load items from UUIDs
        context.packItems = [];
        for (let i = 0; i < this.item.system.items.length; i++) {
          const packItem = this.item.system.items[i];
          try {
            const item = await fromUuid(packItem.uuid);
            if (item) {
              // Build stats string based on item type
              let stats = '';
              let description = '';

              if (item.type === 'equipment') {
                const sys = item.system;

                // Determine equipment subtype and build stats
                if (sys.equipmentType === 'weapon') {
                  // Weapon: damage, damage type, grip, cost, slots
                  const damageDisplay = sys.grip === 'V'
                    ? `${sys.damage1H || '—'} / ${sys.damage2H || '—'}`
                    : (sys.currentDamage || '—');
                  const damageType = sys.damageType && sys.damageType !== '-'
                    ? game.i18n.localize(CONFIG.VAGABOND.damageTypes[sys.damageType])
                    : '';
                  const grip = sys.grip ? (sys.grip === 'V' ? '1H/2H' : sys.grip) : '—';
                  const costDisplay = sys.costDisplay || '0g';
                  const slots = sys.slots || 1;

                  stats = `${damageDisplay} ${damageType} • ${grip} • ${costDisplay} • ${slots} slot${slots !== 1 ? 's' : ''}`;

                  // Get localized weapon skill name
                  let weaponSkillName = '';
                  if (sys.weaponSkill) {
                    const skillKey = CONFIG.VAGABOND.weaponSkills[sys.weaponSkill];
                    weaponSkillName = skillKey ? game.i18n.localize(skillKey) : '';
                  }
                  description = weaponSkillName ? `${weaponSkillName} Weapon` : 'Weapon';

                } else if (sys.equipmentType === 'armor') {
                  // Armor: armor rating, might requirement, cost
                  const rating = sys.rating || 0;
                  const might = sys.might || 0;
                  const costDisplay = sys.costDisplay || '0g';
                  stats = `Armor: ${rating} • Might: ${might} • ${costDisplay}`;
                  description = sys.armorType ? `${sys.armorType.titleCase()} Armor` : 'Armor';

                } else if (sys.equipmentType === 'alchemical') {
                  // Alchemical: damage, type, cost
                  const damage = sys.damageAmount || '—';
                  const damageType = sys.damageType && sys.damageType !== '-'
                    ? game.i18n.localize(CONFIG.VAGABOND.damageTypes[sys.damageType])
                    : '';
                  const costDisplay = sys.costDisplay || '0g';
                  stats = `${damage} ${damageType} • ${costDisplay}`;
                  description = sys.alchemicalType ? sys.alchemicalType.titleCase() : 'Alchemical';

                } else if (sys.equipmentType === 'relic') {
                  // Relic: cost, slots
                  const costDisplay = sys.costDisplay || '0g';
                  const slots = sys.baseSlots || 1;
                  stats = `${costDisplay} • Slots: ${slots}`;
                  description = 'Relic';

                } else {
                  // Gear: cost, slots
                  const costDisplay = sys.costDisplay || '0g';
                  const slots = sys.baseSlots || 1;
                  stats = `${costDisplay} • Slots: ${slots}`;
                  description = sys.gearType || 'Gear';
                }

              } else if (item.type === 'spell') {
                // Spell: mana cost, delivery
                const manaCost = item.system.delivery?.cost || 0;
                const deliveryType = item.system.delivery?.type || '';
                stats = `Mana: ${manaCost} • ${deliveryType}`;
                description = 'Spell';

              } else {
                // Other item types
                description = game.i18n.localize(`TYPES.Item.${item.type}`);
              }

              context.packItems.push({
                name: item.name,
                img: item.img,
                type: item.type,
                typeName: game.i18n.localize(`TYPES.Item.${item.type}`),
                quantity: packItem.quantity,
                uuid: packItem.uuid,
                stats: stats,
                description: description,
              });
            }
          } catch (error) {
            console.warn(`Failed to load item with UUID ${packItem.uuid}:`, error);
          }
        }

        // Add currency string
        context.currencyString = this.item.system.getCurrencyString();
        break;

      case 'containerDetails':
        // Container gets enriched description and loaded items
        context.tab = context.tabs[partId];
        context.enriched = {
          description: await foundry.applications.ux.TextEditor.enrichHTML(
            this.item.system.description,
            {
              secrets: this.document.isOwner,
              rollData: this.item.getRollData(),
              relativeTo: this.item,
            }
          )
        };

        // Load items from stored item data
        context.containerItems = [];
        console.log('Loading container items, count:', this.item.system.items.length);
        for (let i = 0; i < this.item.system.items.length; i++) {
          const itemData = this.item.system.items[i];
          console.log('Loading container item data:', itemData);
          try {
            // itemData is now the full item object, not just a reference
            let damageDisplay = '—';
            let metalDisplay = '—';
            let ratingDisplay = '—';
            let slotsDisplay = '—';
            let costDisplay = '—';
            let typeName = game.i18n.localize(`TYPES.Item.${itemData.type}`);

            if (itemData.type === 'equipment') {
              const sys = itemData.system;
              slotsDisplay = sys.baseSlots !== undefined ? sys.baseSlots : 0;
              costDisplay = sys.costDisplay || '—';
              metalDisplay = sys.metal ? sys.metal.titleCase() : '—';

              if (sys.equipmentType === 'weapon') {
                damageDisplay = sys.grip === 'V'
                  ? `${sys.damage1H || '—'} / ${sys.damage2H || '—'}`
                  : (sys.currentDamage || '—');
                typeName = 'Weapon';
              } else if (sys.equipmentType === 'armor') {
                ratingDisplay = sys.rating || 0;
                typeName = 'Armor';
              } else if (sys.equipmentType === 'alchemical') {
                damageDisplay = sys.damageAmount || '—';
                typeName = 'Alchemical';
              } else if (sys.equipmentType === 'relic') {
                typeName = 'Relic';
              } else {
                typeName = 'Gear';
              }
            } else {
              // For non-equipment items, check for baseSlots
              slotsDisplay = itemData.system?.baseSlots !== undefined ? itemData.system.baseSlots : 0;
            }

            const displayData = {
              name: itemData.name,
              img: itemData.img,
              type: itemData.type,
              typeName: typeName,
              damageDisplay: damageDisplay,
              metalDisplay: metalDisplay,
              ratingDisplay: ratingDisplay,
              slotsDisplay: slotsDisplay,
              costDisplay: costDisplay,
              index: i
            };
            console.log('Adding item to containerItems:', displayData);
            context.containerItems.push(displayData);
          } catch (error) {
            console.warn(`Failed to load item at index ${i}:`, error);
          }
        }
        console.log('Final containerItems array:', context.containerItems);
        break;

      case 'description':
        context.tab = context.tabs[partId];
        // Enrich description info for display
        context.enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(
          this.item.system.description,
          {
            secrets: this.document.isOwner,
            rollData: this.item.getRollData(),
            relativeTo: this.item,
          }
        );
        break;

      case 'effects':
        context.tab = context.tabs[partId];
        // Prepare active effects for easier access
        context.effects = prepareActiveEffectCategories(this.item.effects);
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
    // Default tab for spell, ancestry, class, perk, equipment, starterPack, and container is details, others default to description
    if (!this.tabGroups[tabGroup]) {
      this.tabGroups[tabGroup] = (this.document.type === 'spell' || this.document.type === 'ancestry' || this.document.type === 'class' || this.document.type === 'perk' || this.document.type === 'equipment' || this.document.type === 'starterPack' || this.document.type === 'container') ? 'details' : 'description';
    }
    return parts.reduce((tabs, partId) => {
      const tab = {
        cssClass: '',
        group: tabGroup,
        id: '',
        icon: '',
        label: 'VAGABOND.Item.Tabs.',
      };
      switch (partId) {
        case 'header':
        case 'tabs':
          return tabs;
        case 'description':
          tab.id = 'description';
          tab.label += 'Description';
          break;
        case 'attributesFeature':
          tab.id = 'attributes';
          tab.label += 'Attributes';
          break;
        case 'spellDetails':
        case 'ancestryDetails':
        case 'classDetails':
        case 'perkDetails':
        case 'equipmentDetails':
        case 'starterPackDetails':
        case 'containerDetails':
          tab.id = 'details';
          tab.label += 'Details';
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
   * Actions performed after any render of the Application.
   * Post-render steps are not awaited by the render process.
   * @param {ApplicationRenderContext} context      Prepared context data
   * @param {RenderOptions} options                 Provided render options
   * @protected
   */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Set up drag and drop for the entire sheet
    const dragDrop = new DragDrop.implementation({
      dragSelector: ".draggable",
      dropSelector: null, // Accept drops anywhere on the sheet
      permissions: {
        dragstart: this._canDragStart.bind(this),
        drop: this._canDragDrop.bind(this)
      },
      callbacks: {
        dragstart: this._onDragStart.bind(this),
        dragover: this._onDragOver.bind(this),
        drop: this._onDrop.bind(this)
      }
    });
    dragDrop.bind(this.element);

    // For containers, make the entire sheet a visible drop zone
    if (this.item.type === 'container') {
      const windowContent = this.element.querySelector('.window-content');
      if (windowContent) {
        windowContent.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.stopPropagation();
          windowContent.classList.add('drag-over');
        });
        windowContent.addEventListener('dragleave', (e) => {
          windowContent.classList.remove('drag-over');
        });
        windowContent.addEventListener('drop', (e) => {
          windowContent.classList.remove('drag-over');
        });
      }

      // Add click listeners to container item icons for mini-sheet
      const itemIcons = this.element.querySelectorAll('.container-items-table .item-icon');
      itemIcons.forEach(icon => {
        icon.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();

          const itemIndex = parseInt(icon.dataset.itemIndex);
          const itemData = this.item.system.items[itemIndex];

          if (itemData) {
            // Create a temporary item document for the sheet
            const tempItem = await Item.implementation.create(itemData, {
              temporary: true,
              parent: this.item.actor || null
            });

            if (tempItem) {
              tempItem.sheet.render(true);
            }
          }
        });
      });
    }

    // Add listener for delivery type changes to auto-populate cost and increase
    if (this.document.type === 'spell') {
      const deliverySelect = this.element.querySelector('select[name="system.delivery.type"]');
      if (deliverySelect) {
        deliverySelect.addEventListener('change', async (event) => {
          const deliveryType = event.target.value;
          const defaults = CONFIG.VAGABOND.deliveryDefaults[deliveryType];

          if (defaults) {
            await this.item.update({
              'system.delivery.cost': defaults.cost,
              'system.delivery.increase': defaults.increase
            });
            // Form will auto-render due to submitOnChange
          }
        });
      }
    }

    // Add listener for exploding dice checkbox to enable/disable the text field
    const explodeCheckboxes = this.element.querySelectorAll('input[name="system.canExplode"]');
    explodeCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (event) => {
        // Find the corresponding explode values text field
        const fieldContainer = event.target.closest('.form-group');
        const explodeValuesField = fieldContainer?.querySelector('input[name="system.explodeValues"]');

        if (explodeValuesField) {
          explodeValuesField.disabled = !event.target.checked;
        }
      });
    });

    // --- REMOVED THE OLD EQUIPMENT GRIP LISTENER BLOCK HERE ---
    // The previous listener code was manual and buggy.
    // We now use static EVENTS and _onUpdateGrip below.
  }

  /**************
   *
   * ACTIONS
   *
   **************/

  /**
   * Handle updating the grip.
   * We do this explicitly to ensure the update commits and the sheet re-renders
   * to update the "disabled" state of the 2H input.
   * * @param {Event} event 
   * @param {HTMLElement} target 
   */
  async _onUpdateGrip(event, target) {
    event.preventDefault();
    const newGrip = target.value;
    
    // Explicitly update the document
    await this.document.update({ "system.grip": newGrip });
    
    // This await ensures the data is saved before the UI refreshes
  }

  /**
   * Handle adding a new trait to an ancestry item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddTrait(event, target) {
    const traits = this.item.system.traits || [];
    const newTraits = [...traits, { name: 'New Trait', description: '' }];
    await this.item.update({ 'system.traits': newTraits });
  }

  /**
   * Handle removing a trait from an ancestry item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveTrait(event, target) {
    const index = parseInt(target.dataset.traitIndex);
    if (isNaN(index)) return;

    const traits = this.item.system.traits || [];
    const newTraits = traits.filter((_, i) => i !== index);
    await this.item.update({ 'system.traits': newTraits });
  }

  /**
   * Handle adding a new level feature to a class item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddLevelFeature(event, target) {
    const level = parseInt(target.dataset.level);
    if (isNaN(level)) return;

    const levelFeatures = this.item.system.levelFeatures || [];
    const newFeatures = [...levelFeatures, { level, name: 'New Feature', description: '' }];
    await this.item.update({ 'system.levelFeatures': newFeatures });
  }

  /**
   * Handle removing a level feature from a class item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveLevelFeature(event, target) {
    const index = parseInt(target.dataset.featureIndex);
    if (isNaN(index)) return;

    const levelFeatures = this.item.system.levelFeatures || [];
    const newFeatures = levelFeatures.filter((_, i) => i !== index);
    await this.item.update({ 'system.levelFeatures': newFeatures });
  }

  /**
   * Handle adding a new stat prerequisite to a perk item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddStatPrerequisite(event, target) {
    const stats = this.item.system.prerequisites?.stats || [];
    const newStats = [...stats, { stat: 'might', value: 1 }];
    await this.item.update({ 'system.prerequisites.stats': newStats });
  }

  /**
   * Handle removing a stat prerequisite from a perk item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveStatPrerequisite(event, target) {
    const index = parseInt(target.dataset.index);
    if (isNaN(index)) return;

    const stats = this.item.system.prerequisites?.stats || [];
    const newStats = stats.filter((_, i) => i !== index);
    await this.item.update({ 'system.prerequisites.stats': newStats });
  }

  /**
   * Handle adding a new trained skill prerequisite to a perk item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddTrainedSkillPrerequisite(event, target) {
    const skills = this.item.system.prerequisites?.trainedSkills || [];
    const newSkills = [...skills, 'arcana'];
    await this.item.update({ 'system.prerequisites.trainedSkills': newSkills });
  }

  /**
   * Handle removing a trained skill prerequisite from a perk item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveTrainedSkillPrerequisite(event, target) {
    const index = parseInt(target.dataset.index);
    if (isNaN(index)) return;

    const skills = this.item.system.prerequisites?.trainedSkills || [];
    const newSkills = skills.filter((_, i) => i !== index);
    await this.item.update({ 'system.prerequisites.trainedSkills': newSkills });
  }

  /**
   * Handle adding a new spell prerequisite to a perk item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddSpellPrerequisite(event, target) {
    const spells = this.item.system.prerequisites?.spells || [];
    const newSpells = [...spells, ''];
    await this.item.update({ 'system.prerequisites.spells': newSpells });
  }

  /**
   * Handle removing a spell prerequisite from a perk item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveSpellPrerequisite(event, target) {
    const index = parseInt(target.dataset.index);
    if (isNaN(index)) return;

    const spells = this.item.system.prerequisites?.spells || [];
    const newSpells = spells.filter((_, i) => i !== index);
    await this.item.update({ 'system.prerequisites.spells': newSpells });
  }

  /**
   * Handle adding a new other prerequisite to a perk item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddOtherPrerequisite(event, target) {
    const other = this.item.system.prerequisites?.other || [];
    const newOther = [...other, ''];
    await this.item.update({ 'system.prerequisites.other': newOther });
  }

  /**
   * Handle removing an other prerequisite from a perk item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveOtherPrerequisite(event, target) {
    const index = parseInt(target.dataset.index);
    if (isNaN(index)) return;

    const other = this.item.system.prerequisites?.other || [];
    const newOther = other.filter((_, i) => i !== index);
    await this.item.update({ 'system.prerequisites.other': newOther });
  }

  /**
   * Handle adding a new weapon property to a weapon item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onToggleWeaponProperty(event, target) {
    const property = target.dataset.property;
    const isChecked = target.checked;
    const properties = this.item.system.properties || [];

    let newProperties;
    if (isChecked) {
      // Add property if not already present
      if (!properties.includes(property)) {
        newProperties = [...properties, property];
      } else {
        return; // Already exists
      }
    } else {
      // Remove property
      newProperties = properties.filter(p => p !== property);
    }

    await this.item.update({ 'system.properties': newProperties });
  }

  /**
   * Handle removing a weapon property from a weapon item (via tag x button)
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveWeaponProperty(event, target) {
    const property = target.dataset.property;
    if (!property) return;

    const properties = this.item.system.properties || [];
    const newProperties = properties.filter(p => p !== property);
    await this.item.update({ 'system.properties': newProperties });

    // Uncheck the corresponding checkbox
    const checkbox = this.element.querySelector(`input[type="checkbox"][data-property="${property}"]`);
    if (checkbox) checkbox.checked = false;
  }

  /**
   * Handle adding/removing immunity from armor (via checkbox)
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onToggleImmunity(event, target) {
    const immunity = target.dataset.immunity;
    const isChecked = target.checked;
    const immunities = this.item.system.immunities || [];

    let newImmunities;
    if (isChecked) {
      // Add immunity if not already present
      if (!immunities.includes(immunity)) {
        newImmunities = [...immunities, immunity];
      } else {
        return; // Already exists
      }
    } else {
      // Remove immunity
      newImmunities = immunities.filter(i => i !== immunity);
    }

    await this.item.update({ 'system.immunities': newImmunities });
  }

  /**
   * Handle removing an immunity from armor (via tag x button)
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveImmunity(event, target) {
    const immunity = target.dataset.immunity;
    if (!immunity) return;

    const immunities = this.item.system.immunities || [];
    const newImmunities = immunities.filter(i => i !== immunity);
    await this.item.update({ 'system.immunities': newImmunities });

    // Uncheck the corresponding checkbox
    const checkbox = this.element.querySelector(`input[type="checkbox"][data-immunity="${immunity}"]`);
    if (checkbox) checkbox.checked = false;
  }

  /**
   * Handle toggling lock state for equipment items
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onToggleLock(event, target) {
    if (this.item.type !== 'equipment' && this.item.type !== 'container') return;
    const currentLocked = this.item.system.locked || false;
    await this.item.update({ 'system.locked': !currentLocked });
    // No need to close/reopen - template handles both states with conditionals
  }

  /**
   * Handle changing a Document's image.
   *
   * @this VagabondItemSheet
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
   * Renders an embedded document's sheet
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _viewEffect(event, target) {
    const effect = this._getEffect(target);
    effect.sheet.render(true);
  }

  /**
   * Handles item deletion
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _deleteEffect(event, target) {
    const effect = this._getEffect(target);
    await effect.delete();
  }

  /**
   * Handle creating a new Owned Item or ActiveEffect for the actor using initial data defined in the HTML dataset
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _createEffect(event, target) {
    // Retrieve the configured document class for ActiveEffect
    const aeCls = getDocumentClass('ActiveEffect');
    // Prepare the document creation data by initializing it a default name.
    const effectData = {
      name: aeCls.defaultName({
        type: target.dataset.type,
        parent: this.item,
      }),
    };
    // Loop through the dataset and add it to our effectData
    for (const [dataKey, value] of Object.entries(target.dataset)) {
      // These data attributes are reserved for the action handling
      if (['action', 'documentClass'].includes(dataKey)) continue;
      foundry.utils.setProperty(effectData, dataKey, value);
    }

    // Finally, create the embedded document!
    await aeCls.create(effectData, { parent: this.item });
  }

  /**
   * Determines effect parent to pass to helper
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _toggleEffect(event, target) {
    const effect = this._getEffect(target);
    await effect.update({ disabled: !effect.disabled });
  }

  /** Helper Functions */

  /**
   * Fetches the row with the data for the rendered embedded document
   *
   * @param {HTMLElement} target  The element with the action
   * @returns {HTMLLIElement} The document's row
   */
  _getEffect(target) {
    const li = target.closest('.effect');
    return this.item.effects.get(li?.dataset?.effectId);
  }

  /**
   * DragDrop methods
   */
  _canDragStart(selector) {
    return this.isEditable;
  }

  _canDragDrop(selector) {
    // Don't handle drops on prose-mirror editors - let them handle it themselves
    if (selector && selector.closest && selector.closest('prose-mirror')) {
      console.log('Cannot drop on prose-mirror');
      return false;
    }
    const canDrop = this.isEditable;
    console.log('Can drag drop on item sheet?', canDrop, 'item type:', this.item.type, 'selector:', selector);
    return canDrop;
  }

  _onDragStart(event) {
    const li = event.currentTarget;
    if ('link' in event.target.dataset) return;

    let dragData = null;

    // Active Effect
    if (li.dataset.effectId) {
      const effect = this.item.effects.get(li.dataset.effectId);
      dragData = effect.toDragData();
    }

    // Container item row
    if (li.dataset.itemIndex !== undefined && this.item.type === 'container') {
      const index = parseInt(li.dataset.itemIndex);
      const itemData = this.item.system.items[index];
      if (itemData) {
        dragData = {
          type: 'ContainerItem',
          containerUuid: this.item.uuid,
          itemIndex: index,
          itemData: itemData
        };
      }
    }

    if (!dragData) return;

    // Set data transfer
    event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
  }

  _onDragOver(event) {
    event.preventDefault();
    return false;
  }

  async _onDrop(event) {
    console.log('Drop event received on item sheet', 'target:', event.target);
    event.preventDefault();

    // CRITICAL: Check for ProseMirror BEFORE calling getDragEventData()
    // Only ignore if the drop target is the actual ProseMirror editor content area
    const isProseMirrorEditor = event.target.classList?.contains('ProseMirror') ||
                                event.target.closest('.ProseMirror');
    if (isProseMirrorEditor) {
      // Don't consume the event - let ProseMirror handle it
      console.log('Drop on ProseMirror editor content, ignoring');
      return;
    }

    // Try to get data from event.dataTransfer first
    let data;
    try {
      const textData = event.dataTransfer.getData('text/plain');
      console.log('Raw text data:', textData);
      if (textData) {
        data = JSON.parse(textData);
      } else {
        data = foundry.applications.ux.TextEditor.getDragEventData(event);
      }
    } catch (error) {
      console.error('Error parsing drop data:', error);
      data = foundry.applications.ux.TextEditor.getDragEventData(event);
    }

    console.log('Parsed drop data:', data);
    const item = this.item;
    const allowed = Hooks.call('dropItemSheetData', item, this, data);
    if (allowed === false) {
      console.log('Drop prevented by hook');
      return;
    }

    switch (data.type) {
      case 'ActiveEffect':
        return this._onDropActiveEffect(event, data);
      case 'Actor':
        return this._onDropActor(event, data);
      case 'Item':
        console.log('Calling _onDropItem');
        return this._onDropItem(event, data);
      case 'Folder':
        return this._onDropFolder(event, data);
    }
  }

  async _onDropActiveEffect(event, data) {
    const aeCls = getDocumentClass('ActiveEffect');
    const effect = await aeCls.fromDropData(data);
    if (!this.item.isOwner || !effect) return false;

    if (this.item.uuid === effect.parent?.uuid)
      return this._onEffectSort(event, effect);
    return aeCls.create(effect, { parent: this.item });
  }

  _onEffectSort(event, effect) {
    const effects = this.item.effects;
    const dropTarget = event.target.closest('[data-effect-id]');
    if (!dropTarget) return;
    const target = effects.get(dropTarget.dataset.effectId);

    if (effect.id === target.id) return;

    const siblings = [];
    for (let el of dropTarget.parentElement.children) {
      const siblingId = el.dataset.effectId;
      if (siblingId && siblingId !== effect.id)
        siblings.push(effects.get(el.dataset.effectId));
    }

    const sortUpdates = SortingHelpers.performIntegerSort(effect, {
      target,
      siblings,
    });
    const updateData = sortUpdates.map((u) => {
      const update = u.update;
      update._id = u.target._id;
      return update;
    });

    return this.item.updateEmbeddedDocuments('ActiveEffect', updateData);
  }

  async _onDropActor(event, data) {
    if (!this.item.isOwner) return false;
  }

  async _onDropItem(event, data) {
    if (!this.item.isOwner) return false;

    console.log('Item dropped on item sheet:', data);

    // Handle dropping items onto starter packs
    if (this.item.type === 'starterPack') {
      const droppedItem = await Item.implementation.fromDropData(data);
      if (!droppedItem) return false;

      // Check if item already exists in pack
      const existingIndex = this.item.system.items.findIndex(item => item.uuid === droppedItem.uuid);

      if (existingIndex >= 0) {
        // Update quantity
        const newItems = [...this.item.system.items];
        newItems[existingIndex].quantity += 1;
        await this.item.update({ 'system.items': newItems });
        ui.notifications.info(`Increased quantity of ${droppedItem.name} in ${this.item.name}`);
      } else {
        // Add new item
        const newItems = [...this.item.system.items, { uuid: droppedItem.uuid, quantity: 1 }];
        await this.item.update({ 'system.items': newItems });
        ui.notifications.info(`Added ${droppedItem.name} to ${this.item.name}`);
      }

      return true;
    }

    // Handle dropping items onto containers
    if (this.item.type === 'container') {
      console.log('Processing drop on container');
      const droppedItem = await Item.implementation.fromDropData(data);
      console.log('Dropped item:', droppedItem);
      if (!droppedItem) {
        console.warn('Failed to load dropped item');
        return false;
      }

      // Check if this is equipment type
      if (droppedItem.type !== 'equipment') {
        ui.notifications.warn('Containers can only hold equipment items (weapons, armor, gear, alchemicals, relics).');
        return false;
      }

      // Prevent nesting containers
      if (droppedItem.type === 'container') {
        ui.notifications.warn('Containers cannot be placed inside other containers.');
        return false;
      }

      // Check capacity based on slots (0-slot items don't count)
      const itemSlots = droppedItem.system?.baseSlots || 0;

      // Calculate current slots used (skip 0-slot items)
      const currentItems = this.item.system.items || [];
      const currentSlotsUsed = currentItems.reduce((total, item) => {
        const slots = item.system?.baseSlots || 0;
        return total + (slots > 0 ? slots : 0);
      }, 0);

      const capacity = this.item.system.capacity || 10;

      // If it's a 0-slot item, always allow
      if (itemSlots === 0) {
        // Will be added below
      } else {
        // Check if there's enough space for non-zero slot items
        if (currentSlotsUsed + itemSlots > capacity) {
          ui.notifications.warn(`Container doesn't have enough space! (${currentSlotsUsed}/${capacity} slots used, need ${itemSlots} more)`);
          return false;
        }
      }

      // Store the full item data in the container
      const itemData = droppedItem.toObject();

      // If item is from the same actor, delete it from actor inventory
      if (droppedItem.parent === this.item.actor) {
        console.log('Item is from same actor, deleting from inventory');
        await droppedItem.delete();
      }

      // Add to container with full item data
      const newItems = [...this.item.system.items, itemData];
      await this.item.update({ 'system.items': newItems });

      ui.notifications.info(`${droppedItem.name} added to ${this.item.name}.`);

      // Force re-render to show updated items list
      // Use force=true and parts to ensure containerDetails re-renders
      await this.render(true, { parts: ['containerDetails'] });

      return true;
    }

    return false;
  }

  async _onDropFolder(event, data) {
    if (!this.item.isOwner) return [];
  }

  /**
   * Handle removing an item from a starter pack
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemovePackItem(event, target) {
    const index = parseInt(target.dataset.index);
    if (isNaN(index)) return;

    const items = this.item.system.items || [];
    const newItems = items.filter((_, i) => i !== index);
    await this.item.update({ 'system.items': newItems });
  }

  /**
   * Handle equipping an item from container to character inventory
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onEquipFromContainer(event, target) {
    if (this.item.type !== 'container') return;
    if (!this.item.actor) {
      ui.notifications.warn('Container must be owned by a character to equip items.');
      return;
    }

    const index = parseInt(target.dataset.itemIndex);
    if (isNaN(index)) return;

    const itemData = this.item.system.items[index];
    if (!itemData) return;

    try {
      // Check if character has enough slots
      const itemSlots = itemData.system?.baseSlots || 0;
      const actor = this.item.actor;
      const availableSlots = actor.system.inventory.max - actor.system.inventory.used;

      if (availableSlots < itemSlots) {
        ui.notifications.warn(`Not enough inventory space. Need ${itemSlots} slots, have ${availableSlots} available.`);
        return;
      }

      // Set equipped state based on item type
      if (itemData.type === 'equipment') {
        if (itemData.system.equipmentType === 'weapon') {
          // Equip weapon based on grip
          if (itemData.system.grip === '1H' || itemData.system.grip === 'V') {
            itemData.system.equipmentState = 'oneHand';
          } else if (itemData.system.grip === '2H') {
            itemData.system.equipmentState = 'twoHands';
          }
        } else if (itemData.system.equipmentType === 'armor') {
          itemData.system.equipmentState = 'equipped';
        }
      }

      await actor.createEmbeddedDocuments('Item', [itemData]);

      // Remove from container
      const newItems = this.item.system.items.filter((_, i) => i !== index);
      await this.item.update({ 'system.items': newItems });

      ui.notifications.info(`${itemData.name} equipped to character inventory.`);

      // Force re-render to show updated items list
      this.render();
    } catch (error) {
      console.error('Error equipping item from container:', error);
      ui.notifications.error('Failed to equip item.');
    }
  }

  /**
   * Handle deleting an item from container
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onDeleteFromContainer(event, target) {
    if (this.item.type !== 'container') return;

    const index = parseInt(target.dataset.itemIndex);
    if (isNaN(index)) return;

    const itemData = this.item.system.items[index];
    if (!itemData) return;

    try {
      const itemName = itemData.name || 'Unknown Item';

      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: 'Delete Item' },
        content: `<p>Are you sure you want to delete <strong>${itemName}</strong> from this container?</p><p>This action cannot be undone.</p>`,
        rejectClose: false,
        modal: true
      });

      if (!confirmed) return;

      // Remove from container
      const newItems = this.item.system.items.filter((_, i) => i !== index);
      await this.item.update({ 'system.items': newItems });

      ui.notifications.info(`${itemName} deleted from container.`);

      // Force re-render to show updated items list
      this.render();
    } catch (error) {
      console.error('Error deleting item from container:', error);
      ui.notifications.error('Failed to delete item.');
    }
  }
}