import { prepareActiveEffectCategories, effectSeedFromItem } from '../helpers/effects.mjs';
import { GrantsHandlers } from './item-sheet-grants.mjs';
import { EnrichmentHelper } from '../helpers/enrichment-helper.mjs';
import * as ItemSections from '../helpers/item-sections.mjs';
import { VideoPreviewDialog } from '../applications/video-preview-dialog.mjs';
import { VagabondSpellSequencer } from '../helpers/spell-sequencer.mjs';
import { EquipmentHelper } from '../helpers/equipment-helper.mjs';
import { TradeHelper } from '../helpers/trade-helper.mjs';
import { RelicSlots } from '../helpers/relic-slots.mjs';
import { ItemDisguise } from '../helpers/item-disguise.mjs';
import { ItemDisguiseApp } from '../applications/item-disguise-app.mjs';
import { CountdownDice } from '../documents/countdown-dice.mjs';
import { ItemSheetPrerequisites } from './item-sheet-prerequisites.mjs';
import { ItemSheetContainer } from './item-sheet-container.mjs';
import { ItemSheetContext } from './item-sheet-context.mjs';
import { ItemSheetClassEditor } from './item-sheet-class.mjs';
import { ItemSheetEquipment } from './item-sheet-equipment.mjs';

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
    this._savedOpenDetails = new Set();
    this._savedOpenAccordions = new Set();
    this._updateQueue = Promise.resolve();
    // Container list: closed type sections (all open by default) and open item details
    this._containerClosedGroups = new Set();
    this._containerOpenItems = new Set();
  }

  /**
   * Clean up sheet when closed
   * @override
   */
  async close(options = {}) {
    if (this.element && this.isEditable) {
      try { await this.submit(); } catch(e) {}
    }
    this._listenerController?.abort();
    return super.close(options);
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['vagabond', 'item'],
    actions: {
      onEditImage: this._onEditImage,
      deployConstruct: this._onDeployConstruct,
      shareContainerCoins: ItemSheetContainer._onShareContainerCoins,
      previewSpellFx: this._onPreviewSpellFx,
      viewDoc: this._viewEffect,
      createDoc: this._createEffect,
      deleteDoc: this._deleteEffect,
      toggleEffect: this._toggleEffect,
      addTrait: ItemSheetClassEditor._onAddTrait,
      removeTrait: ItemSheetClassEditor._onRemoveTrait,
      addLevelFeature: ItemSheetClassEditor._onAddLevelFeature,
      removeLevelFeature: ItemSheetClassEditor._onRemoveLevelFeature,
      addPrerequisiteType: ItemSheetPrerequisites._onAddPrerequisiteType,
      addStatPrerequisite: ItemSheetPrerequisites._onAddStatPrerequisite,
      removeStatPrerequisite: ItemSheetPrerequisites._onRemoveStatPrerequisite,
      clearAllStats: ItemSheetPrerequisites._onClearAllStats,
      addStatOrGroup: ItemSheetPrerequisites._onAddStatOrGroup,
      removeStatOrGroup: ItemSheetPrerequisites._onRemoveStatOrGroup,
      addStatToOrGroup: ItemSheetPrerequisites._onAddStatToOrGroup,
      removeStatFromOrGroup: ItemSheetPrerequisites._onRemoveStatFromOrGroup,
      clearAllStatOrGroups: ItemSheetPrerequisites._onClearAllStatOrGroups,
      addTrainedSkillPrerequisite: ItemSheetPrerequisites._onAddTrainedSkillPrerequisite,
      removeTrainedSkillPrerequisite: ItemSheetPrerequisites._onRemoveTrainedSkillPrerequisite,
      clearAllTrainedSkills: ItemSheetPrerequisites._onClearAllTrainedSkills,
      addTrainedSkillOrGroup: ItemSheetPrerequisites._onAddTrainedSkillOrGroup,
      removeTrainedSkillOrGroup: ItemSheetPrerequisites._onRemoveTrainedSkillOrGroup,
      addSkillToOrGroup: ItemSheetPrerequisites._onAddSkillToOrGroup,
      removeSkillFromOrGroup: ItemSheetPrerequisites._onRemoveSkillFromOrGroup,
      clearAllTrainedSkillOrGroups: ItemSheetPrerequisites._onClearAllTrainedSkillOrGroups,
      addSpellPrerequisite: ItemSheetPrerequisites._onAddSpellPrerequisite,
      removeSpellPrerequisite: ItemSheetPrerequisites._onRemoveSpellPrerequisite,
      toggleHasAnySpell: ItemSheetPrerequisites._onToggleHasAnySpell,
      clearAllSpells: ItemSheetPrerequisites._onClearAllSpells,
      addSpellOrGroup: ItemSheetPrerequisites._onAddSpellOrGroup,
      removeSpellOrGroup: ItemSheetPrerequisites._onRemoveSpellOrGroup,
      addSpellToOrGroup: ItemSheetPrerequisites._onAddSpellToOrGroup,
      removeSpellFromOrGroup: ItemSheetPrerequisites._onRemoveSpellFromOrGroup,
      clearAllSpellOrGroups: ItemSheetPrerequisites._onClearAllSpellOrGroups,
      addResourcePrerequisite: ItemSheetPrerequisites._onAddResourcePrerequisite,
      removeResourcePrerequisite: ItemSheetPrerequisites._onRemoveResourcePrerequisite,
      clearAllResources: ItemSheetPrerequisites._onClearAllResources,
      addResourceOrGroup: ItemSheetPrerequisites._onAddResourceOrGroup,
      removeResourceOrGroup: ItemSheetPrerequisites._onRemoveResourceOrGroup,
      addResourceToOrGroup: ItemSheetPrerequisites._onAddResourceToOrGroup,
      removeResourceFromOrGroup: ItemSheetPrerequisites._onRemoveResourceFromOrGroup,
      clearAllResourceOrGroups: ItemSheetPrerequisites._onClearAllResourceOrGroups,
      toggleWeaponProperty: ItemSheetEquipment._onToggleWeaponProperty,
      removeWeaponProperty: ItemSheetEquipment._onRemoveWeaponProperty,
      toggleWeaponAltSkill: ItemSheetEquipment._onToggleWeaponAltSkill,
      removeWeaponAltSkill: ItemSheetEquipment._onRemoveWeaponAltSkill,
      toggleImmunity: ItemSheetEquipment._onToggleImmunity,
      removeImmunity: ItemSheetEquipment._onRemoveImmunity,
      toggleLock: this._onToggleLock,
      removePackItem: this._onRemovePackItem,
      equipFromContainer: ItemSheetContainer._onEquipFromContainer,
      deleteFromContainer: ItemSheetContainer._onDeleteFromContainer,
      toggleContainerGroup: ItemSheetContainer._onToggleContainerGroup,
      toggleContainerItem: ItemSheetContainer._onToggleContainerItem,
      openContainerItem: ItemSheetContainer._onOpenContainerItem,
      containerItemMenu: ItemSheetContainer._onContainerItemMenu,
      addGuaranteedSkill: ItemSheetClassEditor._onAddGuaranteedSkill,
      removeGuaranteedSkill: ItemSheetClassEditor._onRemoveGuaranteedSkill,
      removeSuggestedStartingPack: ItemSheetClassEditor._onRemoveSuggestedStartingPack,
      addKeyStat: ItemSheetClassEditor._onAddKeyStat,
      removeKeyStat: ItemSheetClassEditor._onRemoveKeyStat,
      addSkillChoiceGroup: ItemSheetClassEditor._onAddSkillChoiceGroup,
      removeSkillChoiceGroup: ItemSheetClassEditor._onRemoveSkillChoiceGroup,
      addPoolSkill: ItemSheetClassEditor._onAddPoolSkill,
      removePoolSkill: ItemSheetClassEditor._onRemovePoolSkill,
      createCountdownFromRecharge: this._onCreateCountdownFromRecharge,  // Create countdown dice from spell description
      addGrantSpell: GrantsHandlers.addGrantSpell,
      removeGrantSpell: GrantsHandlers.removeGrantSpell,
      addGrantPerk: GrantsHandlers.addGrantPerk,
      removeGrantPerk: GrantsHandlers.removeGrantPerk,
      removeGrantItem: GrantsHandlers.removeGrantItem,
      addGrantItemChoiceGroup: GrantsHandlers.addGrantItemChoiceGroup,
      removeGrantItemChoiceGroup: GrantsHandlers.removeGrantItemChoiceGroup,
      addGrantEffectChoiceGroup: GrantsHandlers.addGrantEffectChoiceGroup,
      removeGrantEffectChoiceGroup: GrantsHandlers.removeGrantEffectChoiceGroup,
      chooseTraitEffects: GrantsHandlers.chooseTraitEffects,
      addGrantSkillChoiceGroup: ItemSheetClassEditor._onAddGrantSkillChoiceGroup,
      removeGrantSkillChoiceGroup: ItemSheetClassEditor._onRemoveGrantSkillChoiceGroup,
      toggleBound: ItemSheetEquipment._onToggleBound,
      toggleAccordion: this._onToggleAccordion,
      addCausedStatus: ItemSheetEquipment._onAddCausedStatus,
      removeCausedStatus: ItemSheetEquipment._onRemoveCausedStatus,
      addPassiveCausedStatus: ItemSheetEquipment._onAddPassiveCausedStatus,
      removePassiveCausedStatus: ItemSheetEquipment._onRemovePassiveCausedStatus,
      addCritCausedStatus: ItemSheetEquipment._onAddCritCausedStatus,
      removeCritCausedStatus: ItemSheetEquipment._onRemoveCritCausedStatus,
      toggleBlockedStatus: ItemSheetEquipment._onToggleBlockedStatus,
      toggleResistedStatus: ItemSheetEquipment._onToggleResistedStatus,
      applyCoating: ItemSheetEquipment._onApplyCoating,
      usePip: this._onUsePip,
      relicSlot: this._onRelicSlot,
      openDisguise: this._onOpenDisguise,
      toggleDisguise: this._onToggleDisguise,
      clearImbue: ItemSheetEquipment._onClearImbue,
      clearItemMacro: this._onClearItemMacro,
    },
    form: {
      submitOnChange: false,
    },
    // Custom property that's merged into `this.options`
    dragDrop: [{ dragSelector: '.draggable', dropSelector: null }],
  };

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
      scrollable: [''],
    },
    equipmentDetails: {
      template: 'systems/vagabond/templates/item/details-parts/equipment-details.hbs',
      scrollable: [''],
    },
    spellDetails: {
      template: 'systems/vagabond/templates/item/details-parts/spell-details.hbs',
      scrollable: [''],
    },
    ancestryDetails: {
      template: 'systems/vagabond/templates/item//details-parts/ancestry-details.hbs',
      scrollable: [''],
    },
    classDetails: {
      template: 'systems/vagabond/templates/item/details-parts/class-details.hbs',
      scrollable: [''],
    },
    perkDetails: {
      template: 'systems/vagabond/templates/item/details-parts/perk-details.hbs',
      scrollable: [''],
    },
    starterPackDetails: {
      template: 'systems/vagabond/templates/item/details-parts/starter-pack-details.hbs',
      scrollable: [''],
    },
    containerDetails: {
      template: 'systems/vagabond/templates/item/details-parts/container-details.hbs',
      scrollable: [''],
    },
    vehiclePartDetails: {
      template: 'systems/vagabond/templates/item/details-parts/vehicle-part-details.hbs',
      scrollable: [''],
    },
    effects: {
      template: 'systems/vagabond/templates/item/effects.hbs',
      scrollable: [''],
    },
  };

  /**
   * Limited viewers see only the header — except for a shop's stock: wares are public,
   * so anyone who can open the store reads the full (locked) item sheet.
   */
  get #limitedView() {
    return this.document.limited && this.document.parent?.type !== 'shop';
  }

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.parts = ['header', 'tabs'];
    if (this.#limitedView) return;
    switch (this.document.type) {
      case 'equipment':
        // Equipment template now handles both locked and unlocked states internally
        options.parts.push('equipmentDetails');
        break;
      case 'spell':
        options.parts.push('spellDetails');
        break;
      case 'ancestry':
        options.parts.push('ancestryDetails');
        break;
      case 'class':
        options.parts.push('classDetails');
        break;
      case 'perk':
        options.parts.push('perkDetails');
        break;
      case 'starterPack':
        options.parts.push('starterPackDetails');
        break;
      case 'container':
        options.parts.push('containerDetails');
        break;
      case 'vehiclePart':
        options.parts.push('vehiclePartDetails');
        break;
    }
    options.parts.push('effects');
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = {
      // Validates both permissions and compendium status
      editable: this.isEditable,
      owner: this.document.isOwner,
      limited: this.#limitedView,
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
      // Materials the item counts as ("This item" effects, e.g. Bless: Silvered) for the badge
      countsAsLabel: (this.item.system.countsAs ?? []).filter(Boolean)
        .map(m => CONFIG.VAGABOND.materialWeaknesses?.[m] ? game.i18n.localize(CONFIG.VAGABOND.materialWeaknesses[m]) : m)
        .join(', '),
      relicSlots: RelicSlots.view(this.item),
      relicCurse: RelicSlots.curseInfo(this.item),
      itemDisguise: ItemDisguise.view(this.item),
      // Players never unlock a disguised item (edit mode shows Cursed, effects, relic config)
      disguiseLocked: ItemDisguise.hidesFromUser(this.item),
      isGM: game.user.isGM,
    };

    // Weapons: the skill attacks roll with (preferred, else default) and every
    // allowed skill as a comma-separated list — shown on the locked sheet.
    if (EquipmentHelper.isWeapon(this.item)) {
      const skillLabel = (k) => game.i18n.localize(CONFIG.VAGABOND.weaponSkills?.[k] ?? k);
      const current = EquipmentHelper.attackSkillFor(this.item);
      const options = EquipmentHelper.attackSkillOptions(this.item);
      context.attackSkill = {
        label: skillLabel(current),
        // Multi-skill weapons: the owner picks the skill attacks roll with
        // (flags.vagabond.preferredSkill) from a dropdown in the locked view
        choices: options.length > 1 && this.item.isOwner
          ? options.map((k) => ({ key: k, label: skillLabel(k), selected: k === current }))
          : null,
      };
      // Thrown weapons: the skill throws roll with (flags.vagabond.throwSkill);
      // empty = the same skill as its attacks
      if (EquipmentHelper.isThrowable(this.item)) {
        const throwPick = this.item.getFlag('vagabond', 'throwSkill') ?? '';
        const throwCurrent = EquipmentHelper.attackSkillFor(this.item, { thrown: true });
        context.throwSkill = {
          label: skillLabel(throwCurrent),
          choices: this.item.isOwner
            ? [
              { key: '', label: game.i18n.format('VAGABOND.UI.Labels.ThrowSkillDefault', { skill: skillLabel(current) }), selected: !throwPick },
              ...EquipmentHelper.throwSkillOptions(this.item)
                .map((k) => ({ key: k, label: skillLabel(k), selected: k === throwPick })),
            ]
            : null,
        };
      }
    }

    // Locked header line under the name: "Armor · Chain, scale", "Alchemical · Acid",
    // "Gear · Outdoors" (equipment type, Alchemical type, then the Category field)
    if (this.item.type === 'equipment') {
      const sys = this.item.system;
      const typeKey = { weapon: 'Weapon', armor: 'Armor', gear: 'Gear', alchemical: 'Alchemical', relic: 'Relic' }[sys.equipmentType];
      const alchemical = sys.equipmentType === 'alchemical' && CONFIG.VAGABOND.alchemicalTypes?.[sys.alchemicalType];
      context.itemSubtitle = [
        typeKey && game.i18n.localize(`VAGABOND.UI.Labels.${typeKey}`),
        alchemical && game.i18n.localize(alchemical),
        sys.gearCategory?.trim(),
      ].filter(Boolean).join(' · ');
      // Locked Weapon / Armor / Gear: description sits in the header under that line
      // (Alchemicals and Relics keep it in the body)
      context.descInHeader = ['weapon', 'armor', 'gear'].includes(sys.equipmentType);
    } else if (this.item.type === 'spell') {
      // "Spell · Fire" (the damage type the locked body no longer repeats)
      const dmg = this.item.system.damageType;
      const dmgLabel = dmg && dmg !== '-' && CONFIG.VAGABOND.damageTypes?.[dmg];
      context.itemSubtitle = [game.i18n.localize('VAGABOND.UI.Labels.Spell'), dmgLabel && game.i18n.localize(dmgLabel)]
        .filter(Boolean).join(' · ');
    } else if (this.item.type === 'ancestry') {
      // "Ancestry · Medium · Cryptid"
      const { size, ancestryType } = this.item.system;
      const sizeLabel = CONFIG.VAGABOND.sizes?.[size];
      const typeLabel = CONFIG.VAGABOND.beingTypes?.[ancestryType];
      context.itemSubtitle = [
        game.i18n.localize('TYPES.Item.ancestry'),
        sizeLabel && game.i18n.localize(sizeLabel),
        typeLabel ? game.i18n.localize(typeLabel) : ancestryType,
      ].filter(Boolean).join(' · ');
    }

    // Thrown Alchemical Items: owned → the skill a throw rolls with right now
    // (best of Melee / Finesse / Craft); unowned → the three choices.
    if (EquipmentHelper.isThrownAlchemical(this.item)) {
      const skillLabel = (k) => game.i18n.localize(CONFIG.VAGABOND.weaponSkills?.[k] ?? k);
      const options = EquipmentHelper.THROWN_ALCHEMICAL_SKILLS.map(skillLabel).join(' / ');
      context.alchemicalThrow = {
        label: this.item.actor ? skillLabel(EquipmentHelper.attackSkillFor(this.item)) : options,
        options,
      };
    }

    // View-only viewers (e.g. players reading a shop's stock item) always get the
    // locked view — the templates switch on `system.locked`, so shadow it.
    if ((!this.isEditable || context.disguiseLocked) && this.item.system.locked === false) {
      context.system = Object.create(this.item.system, { locked: { value: true } });
    }

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context) {
    const enrich = (text) => ItemSheetContext.enrich(this, text);
    switch (partId) {
      case 'header':
        // Container coins sit in the header while locked
        if (this.item.type === 'container') {
          context.containerCoins = ItemSheetContainer._containerCoins(this);
          context.containerCanShare = ItemSheetContainer._containerCanShare(this);
        }
        // Enrich description for perks, spells and locked Weapon / Armor / Gear in header
        if (this.item.type === 'perk' || this.item.type === 'spell' || context.descInHeader) {
          context.enriched = { description: await enrich(this.item.system.description) };
        }
        break;

      case 'equipmentDetails':
        context.tab = context.tabs[partId];
        context.enriched = { description: await enrich(this.item.system.description) };
        // Prepare list of consumable items from the actor (if item is owned)
        context.actorConsumableItems = [];
        if (this.item.actor) {
          context.actorConsumableItems = this.item.actor.items
            .filter(i => i.type === 'equipment' && i.system.isConsumable && i.id !== this.item.id)
            .map(i => ({
              id: i.id,
              name: i.name,
              system: { remaining: this.item.constructor._chargesRemaining(i) }
            }));
        }
        // Multi-use pips for the Consumable Configuration section
        context.usesPips = ItemSections.usesPipsArray(this.item);
        context.macroNames = VagabondItemSheet._resolveMacroNames(this.item);
        break;

      case 'spellDetails':
        context.tab = context.tabs[partId];
        context.enriched = { description: await enrich(this.item.system.description) };
        context.macroNames = VagabondItemSheet._resolveMacroNames(this.item);
        // Locked-view Anim row: school label + whether the school has any configured anim
        if (this.item.system.locked && VagabondSpellSequencer.isAvailable()) {
          const { schoolLabel, groups } = VagabondItemSheet._spellFxGroups(this.item);
          if (groups.length) context.spellFx = { schoolLabel };
        }
        break;

      case 'ancestryDetails':
        context.tab = context.tabs[partId];
        await ItemSheetContext.ancestry(this, context);
        break;

      case 'classDetails':
        context.tab = context.tabs[partId];
        await ItemSheetContext.classDetails(this, context);
        break;

      case 'perkDetails':
        context.tab = context.tabs[partId];
        await ItemSheetContext.perk(this, context);
        break;

      case 'starterPackDetails':
        context.tab = context.tabs[partId];
        await ItemSheetContext.starterPack(this, context);
        break;

      case 'containerDetails':
        context.tab = context.tabs[partId];
        // Transport gear: button that creates its Mount / Vehicle / Structure actor
        context.canDeployConstruct = !!this.item.flags?.vagabond?.constructId
          && Actor.implementation.canUserCreate(game.user);
        context.enriched = { description: await enrich(this.item.system.description) };
        // Stored items, grouped like the party Inventory (accordion sections, all open by default)
        context.containerGroups = ItemSheetContainer._containerGroups(this);
        context.containerCount = this.item.system.items.length;
        context.containerCoins = ItemSheetContainer._containerCoins(this);
        context.containerCanShare = ItemSheetContainer._containerCanShare(this);
        break;

      case 'description': {
        context.tab = context.tabs[partId];
        // Format description for countdown dice (spells and equipment)
        let descriptionToEnrich = this.item.system.description;
        if (this.item.system.formatDescription) {
          descriptionToEnrich = this.item.system.formatDescription(descriptionToEnrich);
        }
        context.enrichedDescription = await enrich(descriptionToEnrich);
        break;
      }

      case 'vehiclePartDetails':
        context.tab = context.tabs[partId];
        context.enriched = { description: await enrich(this.item.system.description) };
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
      this.tabGroups[tabGroup] = (this.document.type === 'spell' || this.document.type === 'ancestry' || this.document.type === 'class' || this.document.type === 'perk' || this.document.type === 'equipment' || this.document.type === 'starterPack' || this.document.type === 'container' || this.document.type === 'vehiclePart') ? 'details' : 'description';
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
        case 'vehiclePartDetails':
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
   * Capture UI state before re-render so it can be restored after.
   * Saves scroll position and which <details> elements are open.
   * @param {ApplicationRenderContext} context
   * @param {RenderOptions} options
   * @protected
   */
  async _preRender(context, options) {
    await super._preRender(context, options);
    if (!this.element) return;

    // Scroll position: restored by core via `scrollable` on each PART (see PARTS).

    // Save open <details> elements by their stable ID or fallback to index
    this._savedOpenDetails.clear();
    const allDetails = this.element.querySelectorAll('details');
    allDetails.forEach((el, i) => {
      if (el.open) {
        const id = el.dataset.detailsId || `details-${i}`;
        this._savedOpenDetails.add(id);
      }
    });

    // Save open accordion items by their stable ID
    this._savedOpenAccordions.clear();
    const allAccordions = this.element.querySelectorAll('.accordion-item');
    allAccordions.forEach((el) => {
      if (el.classList.contains('expanded')) {
        const id = el.dataset.accordionId;
        if (id) {
          this._savedOpenAccordions.add(id);
        }
      }
    });
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

    // Listeners below bind to the whole element (incl. parts a partial render did not
    // replace), so drop the previous render's listeners first or each render stacks
    // another copy and every change fires N duplicate writes.
    this._listenerController?.abort();
    this._listenerController = new AbortController();
    const { signal } = this._listenerController;

    // Weapon-property dropdown: close on a click anywhere outside it
    document.addEventListener('pointerdown', ev => {
      this.element?.querySelectorAll('details.property-dropdown[open]').forEach(dd => {
        if (!dd.contains(ev.target)) dd.open = false;
      });
    }, { signal, capture: true });

    // Restore <details> open state
    if (this._savedOpenDetails.size > 0) {
      const allDetails = this.element.querySelectorAll('details');
      allDetails.forEach((el, i) => {
        const id = el.dataset.detailsId || `details-${i}`;
        if (this._savedOpenDetails.has(id)) {
          el.open = true;
        }
      });
    }

    // Restore accordion open state
    if (this._savedOpenAccordions.size > 0) {
      const allAccordions = this.element.querySelectorAll('.accordion-item');
      allAccordions.forEach((el) => {
        const id = el.dataset.accordionId;
        if (id && this._savedOpenAccordions.has(id)) {
          el.classList.remove('collapsed');
          el.classList.add('expanded');
          const content = el.querySelector('.accordion-content');
          if (content) {
            content.classList.add('open');
          }
        }
      });
    }

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
        }, { signal });
        // dragleave also fires when crossing into a child row: only clear on a real exit.
        windowContent.addEventListener('dragleave', (e) => {
          if (!windowContent.contains(e.relatedTarget)) windowContent.classList.remove('drag-over');
        }, { signal });
        windowContent.addEventListener('drop', (e) => {
          windowContent.classList.remove('drag-over');
        }, { signal });
      }

      // --- SEARCH FILTER LOGIC --- (type sections with no match are hidden too)
      const searchInput = this.element.querySelector('.container-search');
      const visibleDisplay = this.element.querySelector('#visible-count');

      if (searchInput) {
        searchInput.addEventListener('input', (event) => {
          const query = event.target.value.toLowerCase();
          let visibleCount = 0;

          this.element.querySelectorAll('.ci-group').forEach((group) => {
            let groupCount = 0;
            group.querySelectorAll('.ci-item').forEach((row) => {
              const itemName = row.querySelector('.ci-name-text')?.textContent.toLowerCase() || '';
              const match = itemName.includes(query);
              row.style.display = match ? '' : 'none';
              if (match) groupCount++;
            });
            group.style.display = groupCount ? '' : 'none';
            visibleCount += groupCount;
          });

          // Update the "y" value in "y/X"
          if (visibleDisplay) visibleDisplay.textContent = visibleCount;
        }, { signal });
      }

      // Coins: whole, non-negative (runs before the auto-save listener below)
      this.element.querySelectorAll('.container-coin input').forEach((input) => {
        input.addEventListener('change', () => {
          input.value = Math.max(0, Math.floor(Number(input.value) || 0));
        }, { signal });
      });

      // Open item details stay open across re-renders; right-click a row = its kebab menu
      this.element.querySelectorAll('.ci-item.open').forEach((row) => ItemSheetContainer._fillContainerDetail(this, row));
      this.element.querySelectorAll('.ci-item .ci-row').forEach((row) => {
        row.addEventListener('contextmenu', (event) => {
          ItemSheetContainer._onContainerItemMenu.call(this, event, row);
        }, { signal });
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
            }, { render: false });
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

    // Populate spell/perk dropdowns for grants system
    if (this.item.type === 'ancestry' || this.item.type === 'class') {
      GrantsHandlers.populateGrantsDropdowns(this);
    }

    // Fix inline roll dice icons to match actual die type
    EnrichmentHelper.fixInlineRollIcons(this.element);

    // Keep mana-related fields in sync with the isSpellcaster checkbox without
    // a full re-render (auto-save uses render:false so the DOM isn't updated).
    if (this.item.type === 'class') {
      const spellcasterCheckbox = this.element.querySelector('input[name="system.isSpellcaster"]');
      if (spellcasterCheckbox) {
        const spellcasterFields = this.element.querySelectorAll(
          'input[name="system.manaMultiplier"], select[name="system.manaSkill"], select[name="system.castingStat"]'
        );
        spellcasterCheckbox.addEventListener('change', (e) => {
          spellcasterFields.forEach(f => { f.disabled = !e.target.checked; });
        });
      }
    }

    // Auto-save all named form fields immediately on change.
    // IMPORTANT: For array element fields (system.traits.N.* or system.levelFeatures.N.*),
    // saving just one dot-notation path replaces the entire element in Foundry's DataModel.
    // We must collect the complete element from the DOM and save it as a unit.
    // Pool checkboxes are now included — _collectArrayFromDOM handles them correctly.
    const autoSaveFields = this.element.querySelectorAll(
      'select[name], input[type="number"][name], input[type="checkbox"][name], input[type="text"][name], textarea[name], prose-mirror[name]'
    );
    autoSaveFields.forEach(field => {
      field.addEventListener('change', async (e) => {
        const name = e.target.name;
        if (!name) return;

        // A closed (toggled) prose-mirror shows server-enriched HTML that only a render
        // refreshes — a render:false save leaves the old/empty text on screen.
        const isEditor = e.target.tagName === 'PROSE-MIRROR';

        // Check if this field belongs to an array element
        const arrayMatch = name.match(/^(system\.(traits|levelFeatures|causedStatuses|critCausedStatuses))\.(\d+)\./);
        if (arrayMatch) {
          const arrayPath = arrayMatch[1];
          const arrayProp = arrayMatch[2];
          const idx = parseInt(arrayMatch[3]);

          // causedStatuses / critCausedStatuses: save directly from document state (no DOM reading).
          // tickDamageEnabled triggers a re-render so the conditional damage fields appear/disappear.
          if (arrayProp === 'causedStatuses' || arrayProp === 'critCausedStatuses') {
            const fieldName = name.slice(`${arrayPath}.${idx}.`.length);
            const value = e.target.type === 'checkbox' ? e.target.checked
                        : e.target.type === 'number'   ? (Number(e.target.value) || 0)
                        : e.target.value;
            const current = foundry.utils.deepClone(this.document.system[arrayProp] ?? []);
            if (!current[idx]) return;
            current[idx][fieldName] = value;
            const renderOptions = fieldName === 'tickDamageEnabled' ? {} : { render: false };
            await this._safeUpdate({ [`system.${arrayProp}`]: current }, renderOptions);
            return;
          }

          await this._saveArrayElement(arrayPath, arrayProp, idx, isEditor ? {} : { render: false });
          return;
        }

        // Normal auto-save for non-array-element fields
        let value;
        if (e.target.type === 'checkbox') value = e.target.checked;
        else if (e.target.type === 'number') value = Number(e.target.value) || 0;
        else value = e.target.value;
        try {
          // Allow a render for fields whose changes affect calculated display values.
          const needsRender = isEditor || name === 'name' || name === 'system.metal' || name === 'system.usesDiceScaling'
            || name === 'system.weaponSkill' // Other Skills list excludes the default
            || name === 'system.grip' // Damage rows depend on the grip (0/1H/2H/V)
            || name === 'flags.vagabond.preferredSkill' // Throw dropdown's "Same as attack (X)"
            // Armor "Final" read-outs derive from these
            || name === 'system.armorRating' || name === 'system.reflexPenalty' || name === 'system.baseSlots';
          const options = needsRender ? {} : { render: false };
          await this.document.update({ [name]: value }, options);
        } catch (err) {
          console.error(`Vagabond | Auto-save of "${name}" failed:`, err);
        }
      }, { signal });
    });

    // <code-mirror> (embedded macro scripts) does not bubble a normal change event:
    // its #onBlur dispatches `change` on the FORM with target=the element. So we
    // handle it at the form level, filtered to code-mirror, and save by name.
    this.element.addEventListener('change', (e) => {
      const t = e.target;
      if (!t || t.tagName !== 'CODE-MIRROR' || !t.name) return;
      this.document.update({ [t.name]: t.value }, { render: false }).catch(() => {});
    }, { signal });

  }

  /**************
   *
   * ACTIONS
   *
   **************/

  /* -------------------------------------------- */
  /* Skill Grant Handlers                         */
  /* -------------------------------------------- */

  /**
   * Refined data processing for skill pools.
   * Handles both checkbox-based pools (Traits/Features) via DOM scraping
   * and action-based pools (Class Grants) by preserving existing data.
   * @override
   */
  // NOT async: Foundry's base _prepareSubmitData calls this synchronously and does
  // NOT await it. Returning a Promise makes validate() receive a Promise instead of
  // a plain object → "must be constructed with a DataModel or Object". Keep sync.
  _processFormData(event, form, formData) {
    // 1. Capture prose-mirror values for top-level fields (description, etc.)
    // Array fields are handled by _collectArrayFromDOM below.
    form.querySelectorAll('prose-mirror[name]').forEach(pm => {
      const name = pm.getAttribute('name');
      if (!name || name.includes('.traits.') || name.includes('.levelFeatures.')) return;
      const val = pm.value ?? '';
      if (val || !formData.object[name]) formData.object[name] = val;
    });

    const data = foundry.utils.expandObject(formData.object);

    // 2. Class Top-Level Skill Grants (Action-based, no inputs for pool)
    // We must merge the form's count/label with the existing pool from the item.
    if (this.item.type === 'class' && data.system?.skillGrant?.choices) {
      const originalChoices = this.item.system.skillGrant.choices || [];
      const formChoices = data.system.skillGrant.choices; 
      
      data.system.skillGrant.choices = originalChoices.map((orig, i) => {
        const f = (Array.isArray(formChoices) ? formChoices[i] : formChoices[String(i)]) ?? {};
        return {
          count: Number(f.count ?? orig.count ?? 0),
          label: f.label ?? orig.label ?? '',
          pool: orig.pool ?? [] // PRESERVE EXISTING POOL
        };
      });
    }

    // 3. Ancestry Traits (Checkbox-based pools + ProseMirror)
    // Use _collectArrayFromDOM to reliably scrape current DOM state, including checked boxes.
    if (this.item.type === 'ancestry') {
      data.system.traits = this._collectArrayFromDOM('system.traits', 'traits');
    }

    // 4. Class Level Features (Checkbox-based pools + ProseMirror)
    // Use _collectArrayFromDOM to reliably scrape current DOM state.
    if (this.item.type === 'class') {
      data.system.levelFeatures = this._collectArrayFromDOM('system.levelFeatures', 'levelFeatures');
    }

    // Return the plain data object — _processSubmitData handles the actual update.
    return data;
  }

  /**
   * Perform the document update with the validated submit data.
   * Uses the sequential _safeUpdate queue to prevent concurrent write races.
   * @override
   */
  async _processSubmitData(event, form, submitData, options={}) {
    return this._safeUpdate(submitData, options);
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
    if (!['equipment', 'container', 'spell', 'ancestry'].includes(this.item.type)) return;
    if (!this.isEditable || ItemDisguise.hidesFromUser(this.item)) return;

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
   * Transport gear (Container item linked by `flags.vagabond.constructId`): create its
   * Mount / Vehicle / Structure actor in the world from the "Mounts & Vehicles" pack and open it.
   * @this VagabondItemSheet
   * @protected
   */
  static async _onDeployConstruct(event) {
    event.preventDefault();
    const id = this.item.flags?.vagabond?.constructId;
    const pack = game.packs.get('vagabond.mounts-vehicles');
    if (!id || !pack || !Actor.implementation.canUserCreate(game.user)) return;
    const actor = await game.actors.importFromCompendium(pack, id);
    actor?.sheet.render(true);
  }

  /**
   * Preview groups for a spell's FX school: the cast anim, then one group per
   * delivery type that has an area anim configured.
   * @param {Item} item  spell
   * @returns {{schoolLabel: string, groups: {label: string, spec: string}[]}}
   */
  static _spellFxGroups(item) {
    const school = VagabondSpellSequencer._resolveSchool(item);
    const cfg = VagabondSpellSequencer._getConfig();
    const schoolLabel = game.i18n.localize(CONFIG.VAGABOND.fxSchools?.[school] ?? school);
    const groups = [];
    const cast = cfg.castAnims?.[school];
    if (cast?.file) {
      groups.push({ label: game.i18n.localize('VAGABOND.SpellFx.Cast'), spec: cast.file, sound: cast.sound, volume: cast.volume ?? 0.45 });
    }
    for (const [delivery, entry] of Object.entries(cfg.areaAnims?.[school] ?? {})) {
      if (!entry?.file) continue;
      groups.push({
        label: game.i18n.localize(CONFIG.VAGABOND.deliveryTypes?.[delivery] ?? delivery),
        spec: entry.file, sound: entry.sound, volume: entry.volume ?? 0.6,
      });
    }
    return { schoolLabel, groups };
  }

  /**
   * Locked-view film icon on spells: preview the school's cast + area animations.
   * @this VagabondItemSheet
   * @protected
   */
  static _onPreviewSpellFx(event, target) {
    const { schoolLabel, groups } = VagabondItemSheet._spellFxGroups(this.item);
    if (!groups.length) return;
    VideoPreviewDialog.open(groups, { title: `${this.item.name} (${schoolLabel})` });
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
    // Disguised item (ItemDisguise): players read the effect's disguise (name / art / description), never its
    // config sheet — the real change values would give it away
    if (ItemDisguise.hidesFromUser(this.item)) return ItemDisguise.showEffect(effect);
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
    // Bound cursed item: players can't strip its effects (same rule as unequip / delete)
    if (EquipmentHelper.isCurseLocked(this.item)) return EquipmentHelper.warnCurseLocked(this.item);
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
      // Pre-fill icon + description from this item; the first effect also takes the item's name
      ...effectSeedFromItem(this.item, { name: this.item.effects.size === 0 }),
    };
    // Loop through the dataset and add it to our effectData
    for (const [dataKey, value] of Object.entries(target.dataset)) {
      // Reserved for action handling; `img` is seeded from the item above
      if (['action', 'documentClass', 'img'].includes(dataKey)) continue;
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
          entryId: itemData._id ?? null,
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
      case 'ContainerItem':
        return this._onDropContainerEntry(event, data);
      case 'Folder':
        return this._onDropFolder(event, data);
      case 'Macro':
        return this._onDropMacro(event, data);
    }
  }

  /**
   * Link a dropped Macro to one of the item's macro slots.
   * Slot is read from the drop zone's data-macro-slot ('macro' | 'hitMacro');
   * defaults to 'macro'. Also enables the slot and defaults its button label
   * to the macro name when blank.
   */
  async _onDropMacro(event, data) {
    if (!this.item.isOwner) return false;
    if (!['equipment', 'spell'].includes(this.item.type)) return false;

    const macro = await fromUuid(data.uuid);
    if (!macro) return ui.notifications.warn('Could not resolve dropped macro.');

    const dropZone = event.target.closest('[data-macro-slot]');
    const slot = dropZone?.dataset.macroSlot === 'hitMacro' ? 'hitMacro' : 'macro';

    const update = {
      [`system.${slot}.uuid`]: macro.uuid,
      [`system.${slot}.enabled`]: true,
    };
    if (!this.item.system[slot]?.label) update[`system.${slot}.label`] = macro.name;

    await this.item.update(update);
  }

  /**
   * Clear a linked macro UUID from a slot (button next to the drop zone).
   */
  static async _onClearItemMacro(event, target) {
    const slot = target.dataset.macroSlot === 'hitMacro' ? 'hitMacro' : 'macro';
    await this.item.update({ [`system.${slot}.uuid`]: '' });
  }

  /**
   * Resolve linked Macro UUIDs to display names for the item sheet template.
   * @param {Item} item
   * @returns {{macro: string, hitMacro: string}}
   */
  static _resolveMacroNames(item) {
    const nameFor = (uuid) => uuid ? (fromUuidSync(uuid)?.name ?? uuid) : '';
    return {
      macro: nameFor(item.system.macro?.uuid),
      hitMacro: nameFor(item.system.hitMacro?.uuid),
    };
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

    const sortUpdates = foundry.utils.performIntegerSort(effect, {
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

    // 0. A Relic onto a Relic slot (or anywhere in the Relic section → first free slot)
    const relicZone = event.target.closest('.relic-slots-section');
    if (relicZone) {
      const slot = event.target.closest('[data-relic-slot]');
      return RelicSlots.drop(this.item, data, slot ? Number(slot.dataset.relicSlot) : null);
    }

    // 0a. Granted items (weapons, natural attacks…) onto a trait/feature "Items" grant zone
    const itemGrantZone = event.target.closest('.item-grant-drop-zone');
    if (itemGrantZone) return GrantsHandlers.dropGrantItem(this, itemGrantZone, data);

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

        const traits = this._collectArrayFromDOM('system.traits', 'traits');
        if (!traits[traitIndex]) return false;

        if (isSpellZone) {
          const currentSpells = traits[traitIndex].requiredSpells || [];
          if (!currentSpells.includes(droppedItem.uuid)) {
            traits[traitIndex].requiredSpells = [...currentSpells, droppedItem.uuid];
            await this.item.update({ 'system.traits': traits });
            ui.notifications.info(`Added ${droppedItem.name} to trait`);
          } else {
            ui.notifications.warn('Spell already added to this trait');
          }
        } else if (isPerkZone) {
          const currentPerks = traits[traitIndex].allowedPerks || [];
          if (!currentPerks.includes(droppedItem.uuid)) {
            traits[traitIndex].allowedPerks = [...currentPerks, droppedItem.uuid];
            await this.item.update({ 'system.traits': traits });
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

        const levelFeatures = this._collectArrayFromDOM('system.levelFeatures', 'levelFeatures');
        if (!levelFeatures[featureIndex]) return false;

        if (isSpellZone) {
          const currentSpells = levelFeatures[featureIndex].requiredSpells || [];
          if (!currentSpells.includes(droppedItem.uuid)) {
            levelFeatures[featureIndex].requiredSpells = [...currentSpells, droppedItem.uuid];
            await this.item.update({ 'system.levelFeatures': levelFeatures });
            ui.notifications.info(`Added ${droppedItem.name} to feature`);
          } else {
            ui.notifications.warn('Spell already added to this feature');
          }
        } else if (isPerkZone) {
          const currentPerks = levelFeatures[featureIndex].allowedPerks || [];
          if (!currentPerks.includes(droppedItem.uuid)) {
            levelFeatures[featureIndex].allowedPerks = [...currentPerks, droppedItem.uuid];
            await this.item.update({ 'system.levelFeatures': levelFeatures });
            ui.notifications.info(`Added ${droppedItem.name} to feature`);
          } else {
            ui.notifications.warn('Perk already added to this feature');
          }
        }
        return true;
      }
    }

    // 1a. Handle dropping starter packs onto class items (suggested packs)
    if (this.item.type === 'class') {
      const droppedItem = await Item.implementation.fromDropData(data);
      if (droppedItem?.type === 'starterPack') {
        const current = this.item.system.suggestedStartingPacks || [];
        if (!current.includes(droppedItem.uuid)) {
          await this.item.update({ 'system.suggestedStartingPacks': [...current, droppedItem.uuid] });
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

      // From an actor's inventory: free trade moves it in (guard rails, GM relay, never copied)
      if (droppedItem.parent?.documentName === 'Actor') {
        const qty = await TradeHelper.pickQuantity(droppedItem, event);
        if (!qty) return false;
        const result = await TradeHelper.moveItem({ source: { itemUuid: droppedItem.uuid }, dest: { containerUuid: this.item.uuid }, qty });
        return !!result?.ok;
      }

      // Prepare item data snapshot for storage (sidebar / compendium copy)
      const itemData = droppedItem.toObject();
      
      // Set the containerId to track which container this item belongs to
      itemData.system.containerId = this.item.id;

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
   * An entry dragged out of another container (a Hold, a chest) onto this container's sheet:
   * moved across through free trade.
   */
  async _onDropContainerEntry(event, data) {
    if (this.item.type !== 'container' || !data?.containerUuid) return false;
    if (data.containerUuid === this.item.uuid) return false;
    const qty = await TradeHelper.pickQuantity(data.itemData, event);
    if (!qty) return false;
    const result = await TradeHelper.moveItem({
      source: { containerUuid: data.containerUuid, entryId: data.entryId ?? data.itemData?._id ?? null, index: data.itemIndex },
      dest: { containerUuid: this.item.uuid },
      qty,
    });
    return !!result?.ok;
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
    await CountdownDice.create({
      name: name,
      diceType: diceType,
      size: 'S', // Small size
    });
  }


  /**
   * Toggle accordion item open/closed state.
   * Always syncs both 'expanded'/'collapsed' classes so any parent CSS that
   * matches .collapsed (e.g. actor-sheet .features-list rules) stays correct.
   * Within a .grants-accordions container, opening one closes all siblings.
   */
  static _onToggleAccordion(event, target) {
    const accordionItem = target.closest('.accordion-item');
    if (!accordionItem) return;

    const isExpanded = accordionItem.classList.contains('expanded');
    const grantsContainer = accordionItem.closest('.grants-accordions');

    // Close all siblings in the same grants block when opening one
    if (grantsContainer && !isExpanded) {
      grantsContainer.querySelectorAll('.accordion-item.expanded').forEach(other => {
        if (other === accordionItem) return;
        other.classList.remove('expanded');
        other.classList.add('collapsed');
        other.querySelector('.accordion-content')?.classList.remove('open');
      });
    }

    // Toggle this item — keep collapsed/expanded in sync
    accordionItem.classList.toggle('expanded', !isExpanded);
    accordionItem.classList.toggle('collapsed', isExpanded);
    accordionItem.querySelector('.accordion-content')?.classList.toggle('open', !isExpanded);
  }

  /**
   * Build the current state of a system array by starting from the database copy
   * and overlaying all current DOM input values on top.
   *
   * @param {string} arrayPath - full path, e.g. "system.traits"
   * @param {string} arrayProp - property key on system, e.g. "traits"
   * @returns {Array} deep-cloned array with DOM overrides applied
   */
  _collectArrayFromDOM(arrayPath, arrayProp) {
    const items = foundry.utils.deepClone(this.item.system[arrayProp] || []);
    for (let idx = 0; idx < items.length; idx++) {
      const prefix = `${arrayPath}.${idx}.`;
      const handledPools = new Set();

      // Find all inputs, selects, textareas, and prose-mirrors within this array element
      this.element?.querySelectorAll(`[name^="${prefix}"]`).forEach(el => {
        const name = el.getAttribute('name');
        const subPath = name.slice(prefix.length);

        if (subPath.endsWith('.pool')) {
          // Pool checkboxes: group by full name, collect all checked values as array.
          if (handledPools.has(name)) return;
          handledPools.add(name);
          const checked = Array.from(
            this.element.querySelectorAll(`input[name="${name}"]:checked`)
          ).map(cb => cb.value);
          foundry.utils.setProperty(items[idx], subPath, checked);
        } else {
          let value;
          if (el.type === 'checkbox') value = el.checked;
          else if (el.type === 'number') value = Number(el.value) || 0;
          else value = el.value;
          foundry.utils.setProperty(items[idx], subPath, value);
        }
      });
    }
    return items;
  }

  /**
   * Collect all DOM values for a single array element N and save the whole array.
   * Used by the auto-save change handler so that updating one field doesn't
   * overwrite sibling fields in the same array element.
   *
   * @param {string} arrayPath - e.g. "system.traits"
   * @param {string} arrayProp - e.g. "traits"
   * @param {number} idx       - element index
   */
  async _saveArrayElement(arrayPath, arrayProp, idx, options = { render: false }) {
    const items = this._collectArrayFromDOM(arrayPath, arrayProp);
    if (!items[idx]) return;
    return this._safeUpdate({ [arrayPath]: items }, options);
  }

  /**
   * Sequential update queue wrapper to prevent race conditions when multiple
   * async updates (auto-saves and actions) are triggered in rapid succession.
   * Especially critical for array fields where each update sends the whole array.
   * 
   * @param {object} data - The update data
   * @param {object} options - Update options
   * @returns {Promise} The resulting document update
   */
  async _safeUpdate(data, options = {}) {
    this._updateQueue = this._updateQueue.then(async () => {
      try {
        await this.document.update(data, options);
      } catch (err) {
        console.error("Vagabond | Sequential update failed:", err);
      }
    });
    return this._updateQueue;
  }

  // ---------------------------------------------------------------------------
  // On-Hit Status Effects handlers
  // ---------------------------------------------------------------------------

  /**
   * Spend/restore a use pip on this item (or on the multi-use item targeted
   * by `data-item-uuid`, when this pip row is rendered somewhere other than
   * the item's own sheet — see item-sections.mjs buildUsesPipsRow).
   */
  static async _onUsePip(event, target) {
    await ItemSections.onUsePipClick(target, this.document);
  }

  /** Relic slot click: the slots popup with that slot's details (RelicSlots). */
  static _onRelicSlot(event, target) {
    RelicSlots.openPopup(event, this.document, Number(target.dataset.relicSlot));
  }

  /** GM: the disguise editor (ItemDisguiseApp). */
  static _onOpenDisguise() {
    ItemDisguiseApp.open(this.document);
  }

  /** GM eye: disguised → reveal (chat card, Shift = silent); revealed → disguise again with the last disguise. */
  static _onToggleDisguise(event) {
    ItemDisguiseApp.toggle(this.document, { announce: !event.shiftKey });
  }


}
