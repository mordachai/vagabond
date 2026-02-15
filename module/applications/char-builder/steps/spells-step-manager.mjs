/**
 * Spells Step Manager - Handles spell selection logic
 */
import { BaseStepManager } from './base-step-manager.mjs';

export class SpellsStepManager extends BaseStepManager {
  constructor(stateManager, dataService, configSystem) {
    super(stateManager, dataService, configSystem);
    
    // Define action handlers for spells step
    this.actionHandlers = {
      'selectOption': this._onSelectOption.bind(this),
      'addToTray': this._onAddToTray.bind(this),
      'removeFromTray': this._onRemoveFromTray.bind(this),
      'clearTray': this._onClearTray.bind(this),
      'randomize': this._onRandomize.bind(this)
    };
    
    // Required data for spells step
    this.requiredData = ['spells'];
  }

  /**
   * Step name identifier
   */
  get stepName() {
    return 'spells';
  }

  /**
   * Get state paths managed by this step
   * @protected
   */
  _getStatePaths() {
    return ['spells', 'previewUuid'];
  }

  /**
   * Prepare spells-specific context data
   * @protected
   */
  async _prepareStepSpecificContext(state) {
    // Collect required spells from ancestry, class, and perks
    const requiredSpellUuids = await this._collectRequiredSpells(state);

    // Auto-add required spells to state if not already there
    const currentSpells = state.spells || [];
    const updatedSpells = [...new Set([...currentSpells, ...requiredSpellUuids])];

    if (updatedSpells.length !== currentSpells.length) {
      this.updateState('spells', updatedSpells);
    }

    const availableSpells = await this._loadSpellOptions(requiredSpellUuids);
    const selectedSpells = updatedSpells;
    const previewUuid = state.previewUuid;
    const spellLimit = await this._getSpellLimit(state);

    // Mark items as previewing for template
    const markedSpells = availableSpells.map(spell => ({
      ...spell,
      previewing: spell.uuid === previewUuid
    }));

    // Get preview item details
    let previewItem = null;
    if (previewUuid) {
      try {
        const item = await fromUuid(previewUuid);
        if (item) {
          // Enrich the description for display
          const enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(item.system.description || '', {
            async: true,
            secrets: false,
            relativeTo: item
          });

          previewItem = {
            ...item.toObject(),
            uuid: previewUuid,
            enrichedDescription: enrichedDescription,
            displayStats: this._prepareSpellDisplayStats(item),
            damageTypeIcon: CONFIG.VAGABOND.damageTypeIcons?.[item.system.damageType] || null,
            damageTypeLabel: item.system.damageType !== '-' ? item.system.damageType : null
          };
        }
      } catch (error) {
        console.warn('Failed to load preview spell:', error);
      }
    }

    // Prepare tray data
    const trayData = await this._prepareTrayData(selectedSpells, requiredSpellUuids);

    // Prepare mana stats from preview actor
    const manaStats = await this._prepareManaStats(state);

    // Prepare ancestry data for reference column
    const ancestryData = await this._prepareAncestryData(state);

    // Prepare class preview data for reference column
    const classPreviewData = await this._prepareClassPreviewData(state);

    return {
      availableOptions: markedSpells,
      selectedSpells: selectedSpells,
      selectedItem: previewItem,
      previewItem: previewItem,
      spellLimit: spellLimit,
      currentSpellCount: selectedSpells.length,
      hasSelection: selectedSpells.length > 0,
      showRandomButton: true,
      showTray: true,
      trayData: trayData,
      useTripleColumn: true,
      requiredSpellCount: requiredSpellUuids.length,
      requiredSpells: requiredSpellUuids,
      instruction: (selectedSpells.length === 0 && !previewUuid) ?
        game.i18n.localize('VAGABOND.CharBuilder.Instructions.Spells') : null,
      manaStats: manaStats,
      ancestryData: ancestryData,
      classPreviewData: classPreviewData
    };
  }

  /**
   * Load available spell options
   * @private
   */
  async _loadSpellOptions(requiredSpellUuids = []) {
    await this.dataService.ensureDataLoaded(['spells']);

    const spells = this.dataService.getFilteredItems('spells', {});
    const state = this.getCurrentState();
    const selectedSpells = state.spells || [];

    // Sort spells alphabetically and mark selected ones
    const sortedSpells = spells.sort((a, b) => a.name.localeCompare(b.name));

    return sortedSpells.map(spell => ({
      ...spell,
      uuid: spell.uuid,
      name: spell.name,
      img: spell.img,
      type: 'spell',
      selected: selectedSpells.includes(spell.uuid),
      isRequired: requiredSpellUuids.includes(spell.uuid),
      damageTypeIcon: CONFIG.VAGABOND.damageTypeIcons?.[spell.damageType] || null,
      damageTypeLabel: spell.damageType !== '-' ? spell.damageType : null
    }));
  }

  /**
   * Get spell limit from selected class
   * @private
   */
  async _getSpellLimit(state) {
    if (!state.selectedClass) return 0;

    try {
      const classItem = await fromUuid(state.selectedClass);
      if (!classItem) return 0;

      // Check if class is a spellcaster
      if (!classItem.system.isSpellcaster) return 0;

      // Get level 1 spells from levelSpells array
      const levelSpells = classItem.system.levelSpells || [];
      const level1Data = levelSpells.find(ls => ls.level === 1);

      return level1Data?.spells || 0;
    } catch (error) {
      console.error('Failed to get spell limit:', error);
      return 0;
    }
  }

  /**
   * Prepare tray data for selected spells
   * @private
   */
  async _prepareTrayData(selectedSpells, requiredSpellUuids = []) {
    const trayItems = [];

    for (const uuid of selectedSpells) {
      try {
        const item = await fromUuid(uuid);
        if (item) {
          trayItems.push({
            uuid: uuid,
            name: item.name,
            img: item.img,
            type: 'spell',
            isRequired: requiredSpellUuids.includes(uuid),
            damageTypeIcon: CONFIG.VAGABOND.damageTypeIcons?.[item.system.damageType] || null,
            damageTypeLabel: item.system.damageType !== '-' ? item.system.damageType : null
          });
        }
      } catch (error) {
        console.warn(`Failed to load spell ${uuid}:`, error);
      }
    }

    // Calculate empty slots
    const state = this.getCurrentState();
    const spellLimit = state.spellLimit || 0;
    const emptySlotCount = Math.max(0, spellLimit - trayItems.length);
    const emptySlots = Array(emptySlotCount).fill({});

    return {
      spells: trayItems,
      emptySlots: emptySlots,
      isEmpty: trayItems.length === 0
    };
  }

  /**
   * Prepare spell display stats for preview
   * @private
   */
  _prepareSpellDisplayStats(spell) {
    const sys = spell.system || {};

    const displayStats = {
      baseDamage: sys.baseDamage || null,
      damageType: sys.damageType || '-',
      damageTypeIcon: CONFIG.VAGABOND.damageTypeIcons?.[sys.damageType] || null,
      damageTypeLabel: sys.damageType !== '-' ? sys.damageType : null,
      crit: sys.crit || null,
      delivery: sys.delivery || null,
      deliveryLabel: sys.delivery ? game.i18n.localize(`VAGABOND.Spell.Delivery.${sys.delivery}`) : null,
      manaCost: sys.manaCost || 0,
      range: sys.range || null,
      duration: sys.duration || null,
      condition: sys.condition || null,
      areaOfEffect: sys.areaOfEffect || null
    };

    return displayStats;
  }

  /**
   * Prepare mana stats from preview actor
   * @private
   */
  async _prepareManaStats(state) {
    // Check if all stats are assigned
    const assignedStats = state.assignedStats || {};
    const allAssigned = Object.values(assignedStats).every(v => v !== null && v !== undefined);

    if (!allAssigned) {
      return null;
    }

    try {
      // Create preview actor to get calculated mana values
      const previewActor = await this._createPreviewActor(state);
      if (!previewActor) {
        return null;
      }

      return {
        manaMax: previewActor.system.mana.max,
        manaCast: previewActor.system.mana.castingMax
      };
    } catch (error) {
      console.error('Failed to prepare mana stats:', error);
      return null;
    }
  }

  /**
   * Prepare ancestry data for reference column
   * @private
   */
  async _prepareAncestryData(state) {
    if (!state.selectedAncestry) {
      return null;
    }

    try {
      const ancestry = await fromUuid(state.selectedAncestry);
      if (!ancestry) {
        return null;
      }

      return {
        name: ancestry.name,
        traits: ancestry.system.traits || []
      };
    } catch (error) {
      console.error('Failed to prepare ancestry data:', error);
      return null;
    }
  }

  /**
   * Prepare class preview data for reference column (all levels)
   * @private
   */
  async _prepareClassPreviewData(state) {
    if (!state.selectedClass) {
      return null;
    }

    try {
      const classItem = await fromUuid(state.selectedClass);
      if (!classItem) {
        return null;
      }

      // Get all level features
      const levelFeatures = classItem.system.levelFeatures || [];

      // Group features by level
      const levelGroups = {};
      for (const feature of levelFeatures) {
        const level = feature.level || 1;
        if (!levelGroups[level]) {
          levelGroups[level] = [];
        }

        // Enrich feature description
        const enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(
          feature.description || '',
          {
            async: true,
            secrets: false,
            relativeTo: classItem
          }
        );

        levelGroups[level].push({
          name: feature.name,
          description: feature.description,
          enrichedDescription: enrichedDescription
        });
      }

      // Convert to array format
      const levels = Object.keys(levelGroups).map(level => ({
        level: parseInt(level),
        features: levelGroups[level]
      })).sort((a, b) => a.level - b.level);

      return {
        name: classItem.name,
        levels: levels
      };
    } catch (error) {
      console.error('Failed to prepare class preview data:', error);
      return null;
    }
  }

  /**
   * Create a preview actor with current builder state
   * @private
   */
  async _createPreviewActor(state) {
    try {
      // Apply bonuses to stats
      const finalStats = { ...state.assignedStats };
      const appliedBonuses = state.appliedBonuses || {};

      for (const [bonusId, application] of Object.entries(appliedBonuses)) {
        if (finalStats[application.target] !== null && finalStats[application.target] !== undefined) {
          finalStats[application.target] += application.amount;
        }
      }

      // Get trained skills from builder state
      const trainedSkills = state.skills || [];

      // Build skills object with trained status
      const skillsDefinition = {
        arcana: { stat: 'reason' },
        craft: { stat: 'reason' },
        medicine: { stat: 'reason' },
        brawl: { stat: 'might' },
        finesse: { stat: 'dexterity' },
        sneak: { stat: 'dexterity' },
        detect: { stat: 'awareness' },
        mysticism: { stat: 'awareness' },
        survival: { stat: 'awareness' },
        influence: { stat: 'presence' },
        leadership: { stat: 'presence' },
        performance: { stat: 'presence' }
      };

      const skills = {};
      for (const [key, def] of Object.entries(skillsDefinition)) {
        skills[key] = {
          trained: trainedSkills.includes(key),
          stat: def.stat,
          bonus: 0
        };
      }

      // Build weapon skills object with trained status
      const weaponSkillsDefinition = {
        melee: { stat: 'might' },
        brawl: { stat: 'might' },
        finesse: { stat: 'dexterity' },
        ranged: { stat: 'awareness' }
      };

      const weaponSkills = {};
      for (const [key, def] of Object.entries(weaponSkillsDefinition)) {
        weaponSkills[key] = {
          trained: trainedSkills.includes(key),
          stat: def.stat,
          bonus: 0
        };
      }

      // Build actor data
      const actorData = {
        name: "Preview Character",
        type: "character",
        system: {
          stats: {
            might: { value: finalStats.might || 0 },
            dexterity: { value: finalStats.dexterity || 0 },
            awareness: { value: finalStats.awareness || 0 },
            reason: { value: finalStats.reason || 0 },
            presence: { value: finalStats.presence || 0 },
            luck: { value: finalStats.luck || 0 }
          },
          skills: skills,
          weaponSkills: weaponSkills
        },
        items: []
      };

      // Apply builder selections (ancestry, class, perks)
      const itemUuids = [
        state.selectedAncestry,
        state.selectedClass,
        ...(state.perks || []),
        ...(state.classPerks || [])
      ].filter(uuid => uuid);

      // Load all items
      if (itemUuids.length > 0) {
        const items = await Promise.all(itemUuids.map(uuid => fromUuid(uuid)));
        actorData.items = items.filter(i => i).map(i => i.toObject());
      }

      // Create and prepare the preview actor
      const previewActor = new Actor.implementation(actorData);
      previewActor.prepareData();

      return previewActor;
    } catch (error) {
      console.error('Failed to create preview actor:', error);
      return null;
    }
  }

  /**
   * Handle spell selection (preview)
   * @private
   */
  async _onSelectOption(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    // Set preview
    this.updateState('previewUuid', uuid);
  }

  /**
   * Handle adding spell to tray
   * @private
   */
  async _onAddToTray(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    const state = this.getCurrentState();
    const currentSpells = state.spells || [];
    const spellLimit = await this._getSpellLimit(state);

    // Check if already selected
    if (currentSpells.includes(uuid)) {
      ui.notifications.warn('Spell already selected');
      return;
    }

    // Check spell limit
    if (spellLimit > 0 && currentSpells.length >= spellLimit) {
      ui.notifications.warn(`You can only select ${spellLimit} spells`);
      return;
    }

    try {
      // Validate the spell exists
      const item = await fromUuid(uuid);
      if (!item || item.type !== 'spell') {
        ui.notifications.error('Invalid spell selection');
        return;
      }

      // Add to selected spells
      const newSpells = [...currentSpells, uuid];
      this.updateState('spells', newSpells);
      this.updateState('previewUuid', uuid);
      
      
    } catch (error) {
      console.error('Failed to add spell:', error);
      ui.notifications.error('Failed to add spell');
    }
  }

  /**
   * Handle removing spell from tray
   * @private
   */
  async _onRemoveFromTray(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    const state = this.getCurrentState();
    const currentSpells = state.spells || [];

    if (!currentSpells.includes(uuid)) {
      ui.notifications.warn('Spell not in selection');
      return;
    }

    // Check if spell is required
    const requiredSpells = await this._collectRequiredSpells(state);
    if (requiredSpells.includes(uuid)) {
      ui.notifications.warn('Cannot remove required spell');
      return;
    }

    try {
      const item = await fromUuid(uuid);
      const newSpells = currentSpells.filter(spellUuid => spellUuid !== uuid);

      this.updateState('spells', newSpells);

      // Clear preview if removing the previewed item
      if (state.previewUuid === uuid) {
        this.updateState('previewUuid', null);
      }


    } catch (error) {
      console.error('Failed to remove spell:', error);
      ui.notifications.error('Failed to remove spell');
    }
  }

  /**
   * Handle clearing all spells from tray
   * @private
   */
  async _onClearTray(event, target) {
    const state = this.getCurrentState();
    const currentSpells = state.spells || [];

    if (currentSpells.length === 0) {
      return;
    }

    // Keep required spells, remove all others
    const requiredSpells = await this._collectRequiredSpells(state);
    this.updateState('spells', requiredSpells);
    this.updateState('previewUuid', null);

  }

  /**
   * Handle spell randomization
   * @private
   */
  async _onRandomize(event, target) {
    await this.randomize();
  }

  /**
   * Randomize spell selection
   */
  async randomize() {
    const state = this.getCurrentState();
    const spellLimit = await this._getSpellLimit(state);

    if (spellLimit === 0) {
      ui.notifications.warn('Your class does not grant spells at level 1');
      return;
    }

    // Get required spells
    const requiredSpells = await this._collectRequiredSpells(state);
    const availableSlots = spellLimit - requiredSpells.length;

    if (availableSlots <= 0) {
      ui.notifications.info('All spell slots are filled with required spells');
      return;
    }

    const options = await this._loadSpellOptions();
    // Filter out already required spells
    const nonRequiredOptions = options.filter(opt => !requiredSpells.includes(opt.uuid));

    if (nonRequiredOptions.length === 0) {
      ui.notifications.warn('No additional spells available for randomization');
      return;
    }

    // Randomly select spells
    const shuffled = nonRequiredOptions.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, availableSlots);
    const selectedUuids = [...requiredSpells, ...selected.map(s => s.uuid)];

    this.updateState('spells', selectedUuids);

    if (selectedUuids.length > 0) {
      this.updateState('previewUuid', selectedUuids[0]);
    }

  }

  /**
   * Check if step is complete (optional step)
   */
  isComplete() {
    // Spells step is always considered complete (optional)
    return true;
  }

  /**
   * Reset spells step
   * @protected
   */
  async _onReset() {
    const state = this.getCurrentState();
    // Keep required spells when resetting
    const requiredSpells = await this._collectRequiredSpells(state);
    this.updateState('spells', requiredSpells, { skipValidation: true });
  }

    /**

     * Step-specific activation logic

     * @protected

     */

    async _onActivate() {

      // Ensure spell data is loaded and ready

      await this.dataService.ensureDataLoaded(['spells']);

    }

  }

  