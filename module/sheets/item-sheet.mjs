import { prepareActiveEffectCategories } from '../helpers/effects.mjs';
import { GrantsHandlers } from './item-sheet-grants.mjs';

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

  /**
   * Clean up sheet when closed
   * @override
   */
  async close(options = {}) {
    // Submit the form BEFORE calling super.close() which removes it from DOM
    if (this.element && this.element.tagName === 'FORM') {
      try {
        await this.submit();
      } catch (err) {
        console.error('Vagabond | Error submitting item sheet:', err);
      }
    }

    // Now proceed with normal close process
    return super.close(options);
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
      addPrerequisiteType: this._onAddPrerequisiteType,
      addStatPrerequisite: this._onAddStatPrerequisite,
      removeStatPrerequisite: this._onRemoveStatPrerequisite,
      clearAllStats: this._onClearAllStats,
      addStatOrGroup: this._onAddStatOrGroup,
      removeStatOrGroup: this._onRemoveStatOrGroup,
      addStatToOrGroup: this._onAddStatToOrGroup,
      removeStatFromOrGroup: this._onRemoveStatFromOrGroup,
      clearAllStatOrGroups: this._onClearAllStatOrGroups,
      addTrainedSkillPrerequisite: this._onAddTrainedSkillPrerequisite,
      removeTrainedSkillPrerequisite: this._onRemoveTrainedSkillPrerequisite,
      clearAllTrainedSkills: this._onClearAllTrainedSkills,
      addTrainedSkillOrGroup: this._onAddTrainedSkillOrGroup,
      removeTrainedSkillOrGroup: this._onRemoveTrainedSkillOrGroup,
      addSkillToOrGroup: this._onAddSkillToOrGroup,
      removeSkillFromOrGroup: this._onRemoveSkillFromOrGroup,
      clearAllTrainedSkillOrGroups: this._onClearAllTrainedSkillOrGroups,
      addSpellPrerequisite: this._onAddSpellPrerequisite,
      removeSpellPrerequisite: this._onRemoveSpellPrerequisite,
      toggleHasAnySpell: this._onToggleHasAnySpell,
      clearAllSpells: this._onClearAllSpells,
      addSpellOrGroup: this._onAddSpellOrGroup,
      removeSpellOrGroup: this._onRemoveSpellOrGroup,
      addSpellToOrGroup: this._onAddSpellToOrGroup,
      removeSpellFromOrGroup: this._onRemoveSpellFromOrGroup,
      clearAllSpellOrGroups: this._onClearAllSpellOrGroups,
      addResourcePrerequisite: this._onAddResourcePrerequisite,
      removeResourcePrerequisite: this._onRemoveResourcePrerequisite,
      clearAllResources: this._onClearAllResources,
      addResourceOrGroup: this._onAddResourceOrGroup,
      removeResourceOrGroup: this._onRemoveResourceOrGroup,
      addResourceToOrGroup: this._onAddResourceToOrGroup,
      removeResourceFromOrGroup: this._onRemoveResourceFromOrGroup,
      clearAllResourceOrGroups: this._onClearAllResourceOrGroups,
      toggleWeaponProperty: this._onToggleWeaponProperty,
      removeWeaponProperty: this._onRemoveWeaponProperty,
      toggleImmunity: this._onToggleImmunity,
      removeImmunity: this._onRemoveImmunity,
      toggleLock: this._onToggleLock,
      removePackItem: this._onRemovePackItem,
      equipFromContainer: this._onEquipFromContainer,
      deleteFromContainer: this._onDeleteFromContainer,
      addGuaranteedSkill: this._onAddGuaranteedSkill,
      removeGuaranteedSkill: this._onRemoveGuaranteedSkill,
      addKeyStat: this._onAddKeyStat,
      removeKeyStat: this._onRemoveKeyStat,
      addSkillChoiceGroup: this._onAddSkillChoiceGroup,
      removeSkillChoiceGroup: this._onRemoveSkillChoiceGroup,
      updateChoicePool: this._onUpdatePool,
      updateChoiceCount: this._onUpdateCount,
      saveChoices: this._onSaveChoices,
      createCountdownFromRecharge: this._onCreateCountdownFromRecharge,  // Create countdown dice from spell description
      addTraitSpell: this._onAddTraitSpell,
      addTraitPerk: this._onAddTraitPerk,
      addFeatureSpell: this._onAddFeatureSpell,
      addFeaturePerk: this._onAddFeaturePerk,
      removeTraitSpell: this._onRemoveTraitSpell,
      removeTraitPerk: this._onRemoveTraitPerk,
      removeFeatureSpell: this._onRemoveFeatureSpell,
      removeFeaturePerk: this._onRemoveFeaturePerk,
    },
    form: {
      submitOnChange: true,   // Enabled to ensure edits are saved immediately
      submitOnClose: true,
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
    'change select[name^="system.prerequisites.spells"]': "_onSpellPrerequisiteChange",
    'change select[name^="system.prerequisites.resources"]': "_onResourcePrerequisiteChange",
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

        // Enrich traits with resolved spell and perk names
        context.enrichedTraits = [];
        for (const trait of this.item.system.traits || []) {
          const enrichedTrait = { ...trait };

          // Resolve spell UUIDs to names
          enrichedTrait.enrichedSpells = [];
          for (const uuid of trait.requiredSpells || []) {
            if (uuid) {
              try {
                const spell = await fromUuid(uuid);
                enrichedTrait.enrichedSpells.push({
                  uuid: uuid,
                  name: spell?.name || uuid,
                  img: spell?.img || 'icons/svg/item-bag.svg'
                });
              } catch (e) {
                enrichedTrait.enrichedSpells.push({ uuid: uuid, name: uuid, img: 'icons/svg/item-bag.svg' });
              }
            }
          }

          // Resolve perk UUIDs to names
          enrichedTrait.enrichedPerks = [];
          for (const uuid of trait.allowedPerks || []) {
            if (uuid) {
              try {
                const perk = await fromUuid(uuid);
                enrichedTrait.enrichedPerks.push({
                  uuid: uuid,
                  name: perk?.name || uuid,
                  img: perk?.img || 'icons/svg/item-bag.svg'
                });
              } catch (e) {
                enrichedTrait.enrichedPerks.push({ uuid: uuid, name: uuid, img: 'icons/svg/item-bag.svg' });
              }
            }
          }

          context.enrichedTraits.push(enrichedTrait);
        }
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
        const manaMultiplier = this.item.system.manaMultiplier || 2;
        // Create a working copy with all 10 levels initialized
        const levelSpellsMap = new Map();
        (this.item.system.levelSpells || []).forEach(ls => {
          levelSpellsMap.set(ls.level, ls.spells || 0);
        });

        const workingLevelSpells = [];
        for (let lvl = 1; lvl <= 10; lvl++) {
          workingLevelSpells.push({
            level: lvl,
            spells: levelSpellsMap.get(lvl) || 0
          });
        }

        for (let level = 1; level <= 10; level++) {
          const features = this.item.system.levelFeatures
            .map((f, index) => ({ ...f, index }))
            .filter(f => f.level === level);

          // Enrich each feature's description for proper display
          for (let feature of features) {
            feature.enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(
              feature.description || '',
              {
                secrets: this.document.isOwner,
                rollData: this.item.getRollData(),
                relativeTo: this.item,
              }
            );

            // Resolve spell UUIDs to names
            feature.enrichedSpells = [];
            for (const uuid of feature.requiredSpells || []) {
              if (uuid) {
                try {
                  const spell = await fromUuid(uuid);
                  feature.enrichedSpells.push({
                    uuid: uuid,
                    name: spell?.name || uuid,
                    img: spell?.img || 'icons/svg/item-bag.svg'
                  });
                } catch (e) {
                  feature.enrichedSpells.push({ uuid: uuid, name: uuid, img: 'icons/svg/item-bag.svg' });
                }
              }
            }

            // Resolve perk UUIDs to names
            feature.enrichedPerks = [];
            for (const uuid of feature.allowedPerks || []) {
              if (uuid) {
                try {
                  const perk = await fromUuid(uuid);
                  feature.enrichedPerks.push({
                    uuid: uuid,
                    name: perk?.name || uuid,
                    img: perk?.img || 'icons/svg/item-bag.svg'
                  });
                } catch (e) {
                  feature.enrichedPerks.push({ uuid: uuid, name: uuid, img: 'icons/svg/item-bag.svg' });
                }
              }
            }
          }

          // Get spells for this level (level - 1 because array is 0-indexed but levels start at 1)
          const spellsIndex = level - 1;
          const spells = workingLevelSpells[spellsIndex].spells;

          // Calculate maxMana for this level
          const maxMana = manaMultiplier * level;

          context.levelGroups.push({
            level,
            features,
            spells,
            spellsIndex,
            maxMana
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

        // Load all spells from compendiums for spell prerequisite dropdown
        context.availableSpells = [];
        for (const pack of game.packs) {
          // Only include Item compendiums
          if (pack.metadata.type !== 'Item') continue;

          // Check if this compendium contains spell items
          const index = await pack.getIndex({ fields: ["type"] });
          const spells = index.filter(i => i.type === 'spell');

          if (spells.length > 0) {
            // Add spells from this compendium
            for (const spell of spells) {
              context.availableSpells.push({
                uuid: spell.uuid,
                name: spell.name,
                packLabel: pack.metadata.label
              });
            }
          }
        }

        // Sort spells alphabetically by name
        context.availableSpells.sort((a, b) => a.name.localeCompare(b.name));

        // Preprocess spell prerequisites to include spell details for easier template rendering
        const storedSpellUuids = this.item.system.prerequisites?.spells || [];
        context.spellPrerequisites = [];
        for (let i = 0; i < storedSpellUuids.length; i++) {
          const storedUuid = storedSpellUuids[i];
          context.spellPrerequisites.push({
            index: i,
            selectedUuid: storedUuid,
            availableSpells: context.availableSpells.map(spell => ({
              ...spell,
              isSelected: spell.uuid === storedUuid
            }))
          });
        }

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
        for (let i = 0; i < this.item.system.items.length; i++) {
          const itemData = this.item.system.items[i];
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
              const cost = sys.baseCost || {};
              const costs = [];
              if (cost.gold > 0) costs.push(`${cost.gold}g`);
              if (cost.silver > 0) costs.push(`${cost.silver}s`);
              if (cost.copper > 0) costs.push(`${cost.copper}c`);
              costDisplay = costs.length > 0 ? costs.join(' ') : '0c';
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
            context.containerItems.push(displayData);
          } catch (error) {
            console.warn(`Failed to load item at index ${i}:`, error);
          }
        }
        break;

      case 'description':
        context.tab = context.tabs[partId];
        // Format description for countdown dice (spells and equipment)
        let descriptionToEnrich = this.item.system.description;
        if (this.item.system.formatDescription) {
          descriptionToEnrich = this.item.system.formatDescription(descriptionToEnrich);
        }
        // Enrich description info for display
        context.enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(
          descriptionToEnrich,
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

      // --- SEARCH FILTER LOGIC ---
      const searchInput = this.element.querySelector('.container-search');
      const visibleDisplay = this.element.querySelector('#visible-count');

      if (searchInput) {
        searchInput.addEventListener('input', (event) => {
          const query = event.target.value.toLowerCase();
          const rows = this.element.querySelectorAll('.container-item-row');
          let visibleCount = 0;
          
          rows.forEach(row => {
            const itemName = row.querySelector('.item-name-text')?.textContent.toLowerCase() || "";
            const itemType = row.querySelector('.item-type-text')?.textContent.toLowerCase() || "";
            
            if (itemName.includes(query) || itemType.includes(query)) {
              row.style.display = "";
              visibleCount++;
            } else {
              row.style.display = "none";
            }
          });

          // Update the "y" value in "y/X"
          if (visibleDisplay) visibleDisplay.textContent = visibleCount;
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

  /* -------------------------------------------- */
  /* Skill Grant Handlers                         */
  /* -------------------------------------------- */

  /**
   * Add a skill to the guaranteed list.
   */
  static async _onAddGuaranteedSkill(event, target) {
    const select = this.element.querySelector('#guaranteed-skill-select');
    if (!select) {
      console.error("VAGABOND | Selector #guaranteed-skill-select not found");
      return;
    }
    
    const skill = select.value.toLowerCase().trim();
    const current = this.item.system.skillGrant.guaranteed || [];
    
    if (current.includes(skill)) {
      console.warn(`VAGABOND | Skill ${skill} is already in the list.`);
      return;
    }

    const updateData = { "system.skillGrant.guaranteed": [...current, skill] };
    await this.item.update(updateData);
  }

  static async _onRemoveGuaranteedSkill(event, target) {
    const index = parseInt(target.dataset.index);

    const current = this.item.system.skillGrant.guaranteed || [];
    const newGuaranteed = current.filter((_, i) => i !== index);

    await this.item.update({ "system.skillGrant.guaranteed": newGuaranteed });
  }

  /**
   * Add a stat to the key stats list.
   */
  static async _onAddKeyStat(event, target) {
    const select = this.element.querySelector('#key-stat-select');
    if (!select) {
      console.error("VAGABOND | Selector #key-stat-select not found");
      return;
    }

    const stat = select.value.toLowerCase().trim();
    if (!stat) {
      console.warn("VAGABOND | No stat selected");
      return;
    }

    const current = this.item.system.keyStats || [];

    if (current.includes(stat)) {
      console.warn(`VAGABOND | Stat ${stat} is already in the key stats list.`);
      return;
    }

    const updateData = { "system.keyStats": [...current, stat] };
    await this.item.update(updateData);
  }

  static async _onRemoveKeyStat(event, target) {
    const index = parseInt(target.dataset.index);

    const current = this.item.system.keyStats || [];
    const newKeyStats = current.filter((_, i) => i !== index);

    await this.item.update({ "system.keyStats": newKeyStats });
  }

  static async _onAddSkillChoiceGroup(event, target) {
    const choices = [...(this.item.system.skillGrant.choices || []), { count: 1, pool: [], label: "" }];
    
    await this.item.update({ "system.skillGrant.choices": choices });
  }

  static async _onRemoveSkillChoiceGroup(event, target) {
    const index = parseInt(target.dataset.index);
    
    const choices = (this.item.system.skillGrant.choices || []).filter((_, i) => i !== index);
    await this.item.update({ "system.skillGrant.choices": choices });
  }

  static async _onUpdatePool(event, target) {
    const index = parseInt(target.dataset.index);
    const rawValue = target.value;
    
    const poolArray = rawValue.split(',')
      .map(s => s.trim().toLowerCase())
      .filter(s => s !== ""); 

    // IMPORTANT: Deep clone the entire array for Compendium persistence
    const choices = foundry.utils.deepClone(this.item.system.skillGrant.choices);
    if (!choices[index]) return;

    choices[index].pool = poolArray;

    await this.item.update({ "system.skillGrant.choices": choices });
  }

  /**
   * Action: Manual update for skill choices.
   * This simply triggers the built-in submit logic of ApplicationV2.
   */
  static async _onSaveChoices(event, target) {
    // Calling submit() collects all 'name' attributes from the form and updates the document.
    await this.submit();
    ui.notifications.info("Skill choices updated successfully.");
  }

  /**
   * Refined data processing for skill pools.
   * Since the pool is a comma-separated string in the UI but an Array in the DataModel,
   * we handle the conversion here.
   * Also ensures grant arrays (requiredSpells, allowedPerks) are preserved during form submission.
   * @override
   */
  async _processFormData(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);

    // Logic to convert comma-separated strings back to arrays for the DataModel
    if (data.system?.skillGrant?.choices) {
        for (let key in data.system.skillGrant.choices) {
            let choice = data.system.skillGrant.choices[key];
            if (typeof choice.pool === "string") {
                choice.pool = choice.pool.split(',')
                    .map(s => s.trim().toLowerCase())
                    .filter(s => s !== "");
            }
        }
    }

    // Preserve grants for Ancestry traits
    if (this.item.type === 'ancestry' && data.system?.traits) {
      // Handle both object-based (sparse) and array-based updates
      const entries = Array.isArray(data.system.traits) 
        ? data.system.traits.map((v, i) => [i, v]) 
        : Object.entries(data.system.traits);

      for (const [key, traitData] of entries) {
        const index = parseInt(key);
        if (isNaN(index)) continue;
        
        const originalTrait = this.item.system.traits[index];
        if (originalTrait) {
          // If requiredSpells is missing in update but exists in original, preserve it
          if (!traitData.requiredSpells && originalTrait.requiredSpells?.length) {
            traitData.requiredSpells = originalTrait.requiredSpells;
          }
          // If allowedPerks is missing in update but exists in original, preserve it
          if (!traitData.allowedPerks && originalTrait.allowedPerks?.length) {
            traitData.allowedPerks = originalTrait.allowedPerks;
          }
          // Ensure perkAmount is handled (if it's undefined in update, keep original)
          if (traitData.perkAmount === undefined && originalTrait.perkAmount !== undefined) {
            traitData.perkAmount = originalTrait.perkAmount;
          }
        }
      }
    }

    // Preserve grants for Class level features
    if (this.item.type === 'class' && data.system?.levelFeatures) {
       // Handle both object-based (sparse) and array-based updates
       const entries = Array.isArray(data.system.levelFeatures) 
         ? data.system.levelFeatures.map((v, i) => [i, v]) 
         : Object.entries(data.system.levelFeatures);

       for (const [key, featureData] of entries) {
         const index = parseInt(key);
         if (isNaN(index)) continue;
         
         const originalFeature = this.item.system.levelFeatures[index];
         if (originalFeature) {
           // If requiredSpells is missing in update but exists in original, preserve it
           if (!featureData.requiredSpells && originalFeature.requiredSpells?.length) {
             featureData.requiredSpells = originalFeature.requiredSpells;
           }
           // If allowedPerks is missing in update but exists in original, preserve it
           if (!featureData.allowedPerks && originalFeature.allowedPerks?.length) {
             featureData.allowedPerks = originalFeature.allowedPerks;
           }
           // Ensure perkAmount is handled
           if (featureData.perkAmount === undefined && originalFeature.perkAmount !== undefined) {
             featureData.perkAmount = originalFeature.perkAmount;
           }
         }
       }
    }

    return this.document.update(data);
  }

    /**
     * Manual update for the Skill Choice Count using Actions.
     */
    static async _onUpdateCount(event, target) {
      const index = parseInt(target.dataset.index);
      const value = parseInt(target.value) || 0;

      const choices = foundry.utils.deepClone(this.item.system.skillGrant.choices);
      if (!choices[index]) return;

      choices[index].count = value;

      await this.item.update({ "system.skillGrant.choices": choices });
    }

  /**
   * Handle adding a prerequisite type from the dropdown
   *
   * @this VagabondItemSheet
   * @param {Event} event   The change event
   * @param {HTMLElement} target   The select element
   * @private
   */
  static async _onAddPrerequisiteType(event, target) {
    const type = target.value;
    if (!type) return; // No selection

    // Reset the dropdown
    target.value = '';

    // Add the first prerequisite of the selected type
    switch (type) {
      case 'stat': {
        const stats = this.item.system.prerequisites?.stats || [];
        await this.item.update({ 'system.prerequisites.stats': [...stats, { stat: 'might', value: 1 }] });
        break;
      }
      case 'statOrGroup': {
        const orGroups = this.item.system.prerequisites?.statOrGroups || [];
        await this.item.update({ 'system.prerequisites.statOrGroups': [...orGroups, [{ stat: 'might', value: 1 }]] });
        break;
      }
      case 'trainedSkill': {
        const skills = this.item.system.prerequisites?.trainedSkills || [];
        await this.item.update({ 'system.prerequisites.trainedSkills': [...skills, 'arcana'] });
        break;
      }
      case 'trainedSkillOrGroup': {
        const orGroups = this.item.system.prerequisites?.trainedSkillOrGroups || [];
        await this.item.update({ 'system.prerequisites.trainedSkillOrGroups': [...orGroups, ['arcana']] });
        break;
      }
      case 'spell': {
        const spells = this.item.system.prerequisites?.spells || [];
        await this.item.update({ 'system.prerequisites.spells': [...spells, ''] });
        break;
      }
      case 'spellOrGroup': {
        const orGroups = this.item.system.prerequisites?.spellOrGroups || [];
        await this.item.update({ 'system.prerequisites.spellOrGroups': [...orGroups, ['']] });
        break;
      }
      case 'resource': {
        const resources = this.item.system.prerequisites?.resources || [];
        await this.item.update({ 'system.prerequisites.resources': [...resources, { resourceType: 'maxMana', minimum: 1 }] });
        break;
      }
      case 'resourceOrGroup': {
        const orGroups = this.item.system.prerequisites?.resourceOrGroups || [];
        await this.item.update({ 'system.prerequisites.resourceOrGroups': [...orGroups, [{ resourceType: 'maxMana', minimum: 1 }]] });
        break;
      }
    }
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
   * Handle adding a new stat OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddStatOrGroup(event, target) {
    const orGroups = this.item.system.prerequisites?.statOrGroups || [];
    const newGroups = [...orGroups, [{ stat: 'might', value: 1 }]]; // Start with one stat as placeholder
    await this.item.update({ 'system.prerequisites.statOrGroups': newGroups });
  }

  /**
   * Handle removing an entire stat OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveStatOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.index);
    if (isNaN(groupIndex)) return;

    const orGroups = this.item.system.prerequisites?.statOrGroups || [];
    const newGroups = orGroups.filter((_, i) => i !== groupIndex);
    await this.item.update({ 'system.prerequisites.statOrGroups': newGroups });
  }

  /**
   * Handle adding a stat to an existing OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddStatToOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.index);
    if (isNaN(groupIndex)) return;

    const orGroups = this.item.system.prerequisites?.statOrGroups || [];
    const newGroups = foundry.utils.deepClone(orGroups);
    newGroups[groupIndex] = [...newGroups[groupIndex], { stat: 'might', value: 1 }]; // Add placeholder

    await this.item.update({ 'system.prerequisites.statOrGroups': newGroups });
  }

  /**
   * Handle removing a stat from an OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveStatFromOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.group);
    const statIndex = parseInt(target.dataset.stat);
    if (isNaN(groupIndex) || isNaN(statIndex)) return;

    const orGroups = this.item.system.prerequisites?.statOrGroups || [];
    const newGroups = foundry.utils.deepClone(orGroups);
    newGroups[groupIndex] = newGroups[groupIndex].filter((_, i) => i !== statIndex);

    // Remove empty groups
    const filteredGroups = newGroups.filter(group => group.length > 0);

    await this.item.update({ 'system.prerequisites.statOrGroups': filteredGroups });
  }

  /**
   * Handle adding a new trained skill OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddTrainedSkillOrGroup(event, target) {
    const orGroups = this.item.system.prerequisites?.trainedSkillOrGroups || [];
    const newGroups = [...orGroups, ['arcana']]; // Start with one skill as placeholder
    await this.item.update({ 'system.prerequisites.trainedSkillOrGroups': newGroups });
  }

  /**
   * Handle removing an entire trained skill OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveTrainedSkillOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.index);
    if (isNaN(groupIndex)) return;

    const orGroups = this.item.system.prerequisites?.trainedSkillOrGroups || [];
    const newGroups = orGroups.filter((_, i) => i !== groupIndex);
    await this.item.update({ 'system.prerequisites.trainedSkillOrGroups': newGroups });
  }

  /**
   * Handle adding a skill to an existing OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddSkillToOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.index);
    if (isNaN(groupIndex)) return;

    const orGroups = this.item.system.prerequisites?.trainedSkillOrGroups || [];
    const newGroups = foundry.utils.deepClone(orGroups);
    newGroups[groupIndex] = [...newGroups[groupIndex], 'arcana']; // Add placeholder

    await this.item.update({ 'system.prerequisites.trainedSkillOrGroups': newGroups });
  }

  /**
   * Handle removing a skill from an OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveSkillFromOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.group);
    const skillIndex = parseInt(target.dataset.skill);
    if (isNaN(groupIndex) || isNaN(skillIndex)) return;

    const orGroups = this.item.system.prerequisites?.trainedSkillOrGroups || [];
    const newGroups = foundry.utils.deepClone(orGroups);
    newGroups[groupIndex] = newGroups[groupIndex].filter((_, i) => i !== skillIndex);

    // Remove empty groups
    const filteredGroups = newGroups.filter(group => group.length > 0);

    await this.item.update({ 'system.prerequisites.trainedSkillOrGroups': filteredGroups });
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
   * Handle toggling the "Has Any Spell" checkbox and hide/show specific spell selectors
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onToggleHasAnySpell(event, target) {
    const checkbox = target;
    const isChecked = checkbox.checked;

    // Find the specific spell prerequisites container and toggle visibility
    const prereqList = checkbox.closest('.prereq-list');
    if (prereqList) {
      const specificSpellsContainer = prereqList.querySelector('.specific-spell-prerequisites');
      if (specificSpellsContainer) {
        specificSpellsContainer.style.display = isChecked ? 'none' : '';
      }
    }
  }

  /**
   * Handle change event on spell prerequisite dropdown
   * @this VagabondItemSheet
   * @param {Event} event - The change event
   * @private
   */
  static async _onSpellPrerequisiteChange(event) {
    const select = event.currentTarget;
    const name = select.name;
    const value = select.value;

    // Extract index from name like "system.prerequisites.spells.0"
    const match = name.match(/system\.prerequisites\.spells\.(\d+)/);
    if (!match) return;

    const index = parseInt(match[1]);
    const spells = [...(this.item.system.prerequisites?.spells || [])];
    spells[index] = value;

    await this.item.update({ 'system.prerequisites.spells': spells });
  }

  /**
   * Handle adding a new spell OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddSpellOrGroup(event, target) {
    const orGroups = this.item.system.prerequisites?.spellOrGroups || [];
    const newGroups = [...orGroups, ['']]; // Start with one empty spell as placeholder
    await this.item.update({ 'system.prerequisites.spellOrGroups': newGroups });
  }

  /**
   * Handle removing an entire spell OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveSpellOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.index);
    if (isNaN(groupIndex)) return;

    const orGroups = this.item.system.prerequisites?.spellOrGroups || [];
    const newGroups = orGroups.filter((_, i) => i !== groupIndex);
    await this.item.update({ 'system.prerequisites.spellOrGroups': newGroups });
  }

  /**
   * Handle adding a spell to an existing OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddSpellToOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.index);
    if (isNaN(groupIndex)) return;

    const orGroups = this.item.system.prerequisites?.spellOrGroups || [];
    const newGroups = foundry.utils.deepClone(orGroups);
    newGroups[groupIndex] = [...newGroups[groupIndex], '']; // Add empty placeholder

    await this.item.update({ 'system.prerequisites.spellOrGroups': newGroups });
  }

  /**
   * Handle removing a spell from an OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveSpellFromOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.group);
    const spellIndex = parseInt(target.dataset.spell);
    if (isNaN(groupIndex) || isNaN(spellIndex)) return;

    const orGroups = this.item.system.prerequisites?.spellOrGroups || [];
    const newGroups = foundry.utils.deepClone(orGroups);
    newGroups[groupIndex] = newGroups[groupIndex].filter((_, i) => i !== spellIndex);

    // Remove empty groups
    const filteredGroups = newGroups.filter(group => group.length > 0);

    await this.item.update({ 'system.prerequisites.spellOrGroups': filteredGroups });
  }

  /**
   * Handle change event on resource prerequisite dropdown
   * @this VagabondItemSheet
   * @param {Event} event - The change event
   * @private
   */
  static async _onResourcePrerequisiteChange(event) {
    const select = event.currentTarget;
    const name = select.name;
    const value = select.value;

    // Extract index and field from name like "system.prerequisites.resources.0.resourceType"
    const match = name.match(/system\.prerequisites\.resources\.(\d+)\.(\w+)/);
    if (!match) return;

    const index = parseInt(match[1]);
    const field = match[2];
    const resources = foundry.utils.deepClone(this.item.system.prerequisites?.resources || []);

    if (resources[index]) {
      resources[index][field] = value;
      await this.item.update({ 'system.prerequisites.resources': resources });
    }
  }

  /**
   * Handle adding a new resource prerequisite to a perk item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddResourcePrerequisite(event, target) {
    const resources = this.item.system.prerequisites?.resources || [];
    const newResources = [...resources, { resourceType: 'maxMana', minimum: 1 }];
    await this.item.update({ 'system.prerequisites.resources': newResources });
  }

  /**
   * Handle removing a resource prerequisite from a perk item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveResourcePrerequisite(event, target) {
    const index = parseInt(target.dataset.index);
    if (isNaN(index)) return;

    const resources = this.item.system.prerequisites?.resources || [];
    const newResources = resources.filter((_, i) => i !== index);
    await this.item.update({ 'system.prerequisites.resources': newResources });
  }

  /**
   * Handle adding a new resource OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddResourceOrGroup(event, target) {
    const orGroups = this.item.system.prerequisites?.resourceOrGroups || [];
    const newGroups = [...orGroups, [{ resourceType: 'maxMana', minimum: 1 }]]; // Start with one resource as placeholder
    await this.item.update({ 'system.prerequisites.resourceOrGroups': newGroups });
  }

  /**
   * Handle removing an entire resource OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveResourceOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.index);
    if (isNaN(groupIndex)) return;

    const orGroups = this.item.system.prerequisites?.resourceOrGroups || [];
    const newGroups = orGroups.filter((_, i) => i !== groupIndex);
    await this.item.update({ 'system.prerequisites.resourceOrGroups': newGroups });
  }

  /**
   * Handle adding a resource to an existing OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddResourceToOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.index);
    if (isNaN(groupIndex)) return;

    const orGroups = this.item.system.prerequisites?.resourceOrGroups || [];
    const newGroups = foundry.utils.deepClone(orGroups);
    newGroups[groupIndex] = [...newGroups[groupIndex], { resourceType: 'maxMana', minimum: 1 }]; // Add placeholder

    await this.item.update({ 'system.prerequisites.resourceOrGroups': newGroups });
  }

  /**
   * Handle removing a resource from an OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveResourceFromOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.group);
    const resourceIndex = parseInt(target.dataset.resource);
    if (isNaN(groupIndex) || isNaN(resourceIndex)) return;

    const orGroups = this.item.system.prerequisites?.resourceOrGroups || [];
    const newGroups = foundry.utils.deepClone(orGroups);
    newGroups[groupIndex] = newGroups[groupIndex].filter((_, i) => i !== resourceIndex);

    // Remove empty groups
    const filteredGroups = newGroups.filter(group => group.length > 0);

    await this.item.update({ 'system.prerequisites.resourceOrGroups': filteredGroups });
  }

  /**
   * Handle clearing all stat prerequisites
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onClearAllStats(event, target) {
    await this.item.update({ 'system.prerequisites.stats': [] });
  }

  /**
   * Handle clearing all stat OR groups
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onClearAllStatOrGroups(event, target) {
    await this.item.update({ 'system.prerequisites.statOrGroups': [] });
  }

  /**
   * Handle clearing all trained skill prerequisites
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onClearAllTrainedSkills(event, target) {
    await this.item.update({ 'system.prerequisites.trainedSkills': [] });
  }

  /**
   * Handle clearing all trained skill OR groups
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onClearAllTrainedSkillOrGroups(event, target) {
    await this.item.update({ 'system.prerequisites.trainedSkillOrGroups': [] });
  }

  /**
   * Handle clearing all spell prerequisites
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onClearAllSpells(event, target) {
    await this.item.update({ 'system.prerequisites.spells': [] });
  }

  /**
   * Handle clearing all spell OR groups
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onClearAllSpellOrGroups(event, target) {
    await this.item.update({ 'system.prerequisites.spellOrGroups': [] });
  }

  /**
   * Handle clearing all resource prerequisites
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onClearAllResources(event, target) {
    await this.item.update({ 'system.prerequisites.resources': [] });
  }

  /**
   * Handle clearing all resource OR groups
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onClearAllResourceOrGroups(event, target) {
    await this.item.update({ 'system.prerequisites.resourceOrGroups': [] });
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

    // Submit the form BEFORE toggling to save any pending changes
    if (this.element && this.element.tagName === 'FORM') {
      try {
        await this.submit();
      } catch (err) {
        console.error('Vagabond | Error submitting form before lock toggle:', err);
      }
    }

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
      return false;
    }
    return this.isEditable;
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
    event.preventDefault();

    // CRITICAL: Check for ProseMirror BEFORE calling getDragEventData()
    // Only ignore if the drop target is the actual ProseMirror editor content area
    const isProseMirrorEditor = event.target.classList?.contains('ProseMirror') ||
                                event.target.closest('.ProseMirror');
    if (isProseMirrorEditor) {
      // Don't consume the event - let ProseMirror handle it
      return;
    }

    // Try to get data from event.dataTransfer first
    let data;
    try {
      const textData = event.dataTransfer.getData('text/plain');
      if (textData) {
        data = JSON.parse(textData);
      } else {
        data = foundry.applications.ux.TextEditor.getDragEventData(event);
      }
    } catch (error) {
      console.error('Error parsing drop data:', error);
      data = foundry.applications.ux.TextEditor.getDragEventData(event);
    }

    const item = this.item;
    const allowed = Hooks.call('dropItemSheetData', item, this, data);
    if (allowed === false) {
      return;
    }

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

  /**
   * Handle dropping an item onto the sheet.
   * Logic for Starter Packs and Containers with Compendium/Sidebar support.
   * @override
   */
  async _onDropItem(event, data) {
    if (!this.item.isOwner) return false;

    // 0. Handle dropping spells/perks onto trait/feature grant zones
    const dropZone = event.target.closest('.spell-drop-zone, .perk-drop-zone');
    if (dropZone) {
      const droppedItem = await Item.implementation.fromDropData(data);
      if (!droppedItem) return false;

      const isSpellZone = dropZone.classList.contains('spell-drop-zone');
      const isPerkZone = dropZone.classList.contains('perk-drop-zone');

      // Validate item type
      if (isSpellZone && droppedItem.type !== 'spell') {
        ui.notifications.warn('Only spells can be dropped here');
        return false;
      }
      if (isPerkZone && droppedItem.type !== 'perk') {
        ui.notifications.warn('Only perks can be dropped here');
        return false;
      }

      // Handle ancestry trait drop zones
      if (this.item.type === 'ancestry') {
        const traitIndex = parseInt(dropZone.dataset.traitIndex);
        if (isNaN(traitIndex)) return false;

        // Clone entire array (same approach as remove functions)
        const traits = foundry.utils.deepClone(this.item.system.traits);
        if (!traits[traitIndex]) return false;

        if (isSpellZone) {
          // Add spell UUID to requiredSpells array
          const currentSpells = traits[traitIndex].requiredSpells || [];
          console.log('Current spells before add:', currentSpells);
          console.log('Dropped spell UUID:', droppedItem.uuid);

          if (!currentSpells.includes(droppedItem.uuid)) {
            // Modify the cloned array
            traits[traitIndex].requiredSpells = [...currentSpells, droppedItem.uuid];

            console.log('Updating entire traits array');
            console.log('Modified trait:', traits[traitIndex]);

            // Update the entire traits array (matches remove function approach)
            // render: false prevents automatic re-render and scroll jump
            const result = await this.item.update({ 'system.traits': traits }, { render: false });
            console.log('Update result:', result);

            // Verify the update persisted
            const updatedTrait = this.item.system.traits[traitIndex];
            console.log('Spells after update:', updatedTrait.requiredSpells);

            ui.notifications.info(`Added ${droppedItem.name} to trait`);
          } else {
            ui.notifications.warn('Spell already added to this trait');
          }
        } else if (isPerkZone) {
          // Add perk UUID to allowedPerks array
          const currentPerks = traits[traitIndex].allowedPerks || [];
          if (!currentPerks.includes(droppedItem.uuid)) {
            traits[traitIndex].allowedPerks = [...currentPerks, droppedItem.uuid];
            await this.item.update({ 'system.traits': traits }, { render: false });
            ui.notifications.info(`Added ${droppedItem.name} to trait`);
          } else {
            ui.notifications.warn('Perk already added to this trait');
          }
        }
        return true;
      }

      // Handle class level feature drop zones
      if (this.item.type === 'class') {
        const featureIndex = parseInt(dropZone.dataset.featureIndex);
        if (isNaN(featureIndex)) return false;

        // Clone entire array (same approach as remove functions)
        const levelFeatures = foundry.utils.deepClone(this.item.system.levelFeatures);
        if (!levelFeatures[featureIndex]) return false;

        if (isSpellZone) {
          // Add spell UUID to requiredSpells array
          const currentSpells = levelFeatures[featureIndex].requiredSpells || [];
          console.log('Current spells before add:', currentSpells);
          console.log('Dropped spell UUID:', droppedItem.uuid);

          if (!currentSpells.includes(droppedItem.uuid)) {
            // Modify the cloned array
            levelFeatures[featureIndex].requiredSpells = [...currentSpells, droppedItem.uuid];

            console.log('Updating entire levelFeatures array');
            console.log('Modified feature:', levelFeatures[featureIndex]);

            // Update the entire levelFeatures array (matches remove function approach)
            // render: false prevents automatic re-render and scroll jump
            const result = await this.item.update({ 'system.levelFeatures': levelFeatures }, { render: false });
            console.log('Update result:', result);

            // Verify the update persisted
            const updatedFeature = this.item.system.levelFeatures[featureIndex];
            console.log('Spells after update:', updatedFeature.requiredSpells);

            ui.notifications.info(`Added ${droppedItem.name} to feature`);
          } else {
            ui.notifications.warn('Spell already added to this feature');
          }
        } else if (isPerkZone) {
          // Add perk UUID to allowedPerks array
          const currentPerks = levelFeatures[featureIndex].allowedPerks || [];
          if (!currentPerks.includes(droppedItem.uuid)) {
            levelFeatures[featureIndex].allowedPerks = [...currentPerks, droppedItem.uuid];
            await this.item.update({ 'system.levelFeatures': levelFeatures }, { render: false });
            ui.notifications.info(`Added ${droppedItem.name} to feature`);
          } else {
            ui.notifications.warn('Perk already added to this feature');
          }
        }
        return true;
      }
    }

    // 1. Handle dropping items onto starter packs
    if (this.item.type === 'starterPack') {
      const droppedItem = await Item.implementation.fromDropData(data);
      if (!droppedItem) return false;

      const existingIndex = this.item.system.items.findIndex(item => item.uuid === droppedItem.uuid);

      if (existingIndex >= 0) {
        const newItems = [...this.item.system.items];
        newItems[existingIndex].quantity += 1;
        await this.item.update({ 'system.items': newItems });
        ui.notifications.info(`Increased quantity of ${droppedItem.name} in ${this.item.name}`);
      } else {
        const newItems = [...this.item.system.items, { uuid: droppedItem.uuid, quantity: 1 }];
        await this.item.update({ 'system.items': newItems });
        ui.notifications.info(`Added ${droppedItem.name} to ${this.item.name}`);
      }

      return true;
    }

    // 2. Handle dropping items onto containers
    if (this.item.type === 'container') {
      const droppedItem = await Item.implementation.fromDropData(data);
      if (!droppedItem) return false;

      // Only equipment items can be placed in containers
      if (droppedItem.type !== 'equipment') {
        ui.notifications.warn('Containers can only hold equipment items.');
        return false;
      }

      // Prevent nesting containers within containers
      if (droppedItem.system.equipmentType === 'container' || droppedItem.type === 'container') {
        ui.notifications.warn('Containers cannot be placed inside other containers.');
        return false;
      }

      // Capacity Logic: Calculate current slots used (skipping 0-slot items)
      const newItemSlots = Number(droppedItem.system?.baseSlots) || 0;
      const currentItems = this.item.system.items || [];
      const currentSlotsUsed = currentItems.reduce((total, item) => {
        const slots = Number(item.system?.baseSlots) || 0;
        return total + (slots > 0 ? slots : 0);
      }, 0);

      const capacity = this.item.system.capacity || 10;

      // Block the drop if it exceeds capacity
      if (newItemSlots > 0 && (currentSlotsUsed + newItemSlots > capacity)) {
        ui.notifications.warn(`Container full! (${currentSlotsUsed}/${capacity} slots used, item needs ${newItemSlots})`);
        return false; 
      }

      // Prepare item data snapshot for storage
      const itemData = droppedItem.toObject();
      
      // Set the containerId to track which container this item belongs to
      itemData.system.containerId = this.item.id;

      // MOVE vs COPY logic: 
      // Only delete the original if it belongs to the same actor owning this container.
      // Items from Sidebar, Compendiums, or other Actors are copied.
      if (droppedItem.parent && this.item.actor && droppedItem.parent.id === this.item.actor.id) {
        await droppedItem.delete();
      }

      // Add to container items array
      const newItems = [...this.item.system.items, itemData];
      await this.item.update({ 'system.items': newItems });

      ui.notifications.info(`${droppedItem.name} added to ${this.item.name}.`);

      // Use ApplicationV2 render options to update only the relevant part
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
          itemData.system.worn = true; // Use 'worn' field for armor, not 'equipmentState'
        }
      }

      // Clear containerId when moving item back to inventory
      itemData.system.containerId = null;

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

  /**
   * Handle creating a countdown dice from a spell description
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The clicked element
   */
  static async _onCreateCountdownFromRecharge(event, target) {
    event.preventDefault();
    event.stopPropagation();

    // Extract dice type from data attribute
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

    // For spells, use the item name as the countdown name
    const name = this.item.name;

    // Create countdown dice
    const { CountdownDice } = globalThis.vagabond.documents;
    await CountdownDice.create({
      name: name,
      diceType: diceType,
      size: 'S', // Small size
    });
  }

  /**
   * Handle removing a spell from an ancestry trait
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The clicked element
   * @private
   */
  static async _onRemoveTraitSpell(event, target) {
    return GrantsHandlers.removeTraitSpell(this, event, target);
  }

  /**
   * Handle removing a perk from an ancestry trait
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The clicked element
   * @private
   */
  static async _onRemoveTraitPerk(event, target) {
    return GrantsHandlers.removeTraitPerk(this, event, target);
  }

  /**
   * Handle removing a spell from a class level feature
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The clicked element
   * @private
   */
  static async _onRemoveFeatureSpell(event, target) {
    return GrantsHandlers.removeFeatureSpell(this, event, target);
  }

  /**
   * Handle removing a perk from a class level feature
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The clicked element
   * @private
   */
  static async _onRemoveFeaturePerk(event, target) {
    return GrantsHandlers.removeFeaturePerk(this, event, target);
  }

  /**
   * Add handlers delegate to GrantsHandlers
   */
  static async _onAddTraitSpell(event, target) {
    return GrantsHandlers.addTraitSpell(this, event, target);
  }

  static async _onAddTraitPerk(event, target) {
    return GrantsHandlers.addTraitPerk(this, event, target);
  }

  static async _onAddFeatureSpell(event, target) {
    return GrantsHandlers.addFeatureSpell(this, event, target);
  }

  static async _onAddFeaturePerk(event, target) {
    return GrantsHandlers.addFeaturePerk(this, event, target);
  }

  /**
   * Populate grants dropdowns after render
   * @override
   */
  _onRender(context, options) {
    super._onRender?.(context, options);

    // Populate spell/perk dropdowns for grants system
    if (this.item.type === 'ancestry' || this.item.type === 'class') {
      GrantsHandlers.populateGrantsDropdowns(this);
    }
  }
}