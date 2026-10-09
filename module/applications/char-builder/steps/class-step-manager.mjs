/**
 * Class Step Manager - Handles class selection logic
 */
import { BaseStepManager } from './base-step-manager.mjs';
import { levelTableCap } from '../../../helpers/homebrew-config.mjs';
import { AlchemyHelper } from '../../../helpers/crafting/alchemy-helper.mjs';

export class ClassStepManager extends BaseStepManager {
  constructor(stateManager, dataService, configSystem) {
    super(stateManager, dataService, configSystem);
    
    // Define action handlers for class step
    this.actionHandlers = {
      'selectOption': this._onSelectOption.bind(this),
      'addToTray': this._onAddToTray.bind(this),
      'randomize': this._onRandomize.bind(this)
    };
    
    // Required data for class step
    this.requiredData = ['classes'];
  }

  /**
   * Step name identifier
   */
  get stepName() {
    return 'class';
  }

  /**
   * Get state paths managed by this step
   * @protected
   */
  _getStatePaths() {
    return ['selectedClass', 'skills', 'skillSelections', 'classPerks', 'lastClassForPerks', 'previewUuid'];
  }

  /**
   * Prepare class-specific context data
   * @protected
   */
  async _prepareStepSpecificContext(state) {
    // Auto-populate perks from class features when entering perks step later
    await this._updateClassPerksIfNeeded(state);

    const availableClasses = await this._loadClassOptions();
    const selectedClass = state.selectedClass;
    const previewUuid = state.previewUuid;

    // Mark items as selected/previewing for template
    const markedClasses = availableClasses.map(classItem => ({
      ...classItem,
      selected: classItem.uuid === selectedClass,
      previewing: classItem.uuid === previewUuid
    }));

    // Get selected item details if available
    let selectedItem = null;
    let classPreviewData = null;
    
    if (selectedClass) {
      try {
        const item = await fromUuid(selectedClass);
        if (item) {
          // Enrich the description for display
          const enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(item.system.description || '', {
            async: true,
            secrets: false,
            relativeTo: item
          });

          selectedItem = {
            ...item.toObject(),
            isSpellcaster: item.system.isSpellcaster || false,
            skillGrant: item.system.skillGrant || { guaranteed: [], choices: [] },
            enrichedDescription: enrichedDescription
          };
          classPreviewData = await this._prepareClassPreviewData(item, state);
        }
      } catch (error) {
        console.warn('Failed to load selected class:', error);
      }
    }

    // Get preview item details if different from selected
    let previewItem = null;
    if (previewUuid && previewUuid !== selectedClass) {
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
            isSpellcaster: item.system.isSpellcaster || false,
            skillGrant: item.system.skillGrant || { guaranteed: [], choices: [] },
            enrichedDescription: enrichedDescription
          };
          classPreviewData = await this._prepareClassPreviewData(item, state);
        }
      } catch (error) {
        console.warn('Failed to load preview class:', error);
      }
    }

    return {
      availableOptions: markedClasses,
      selectedItem: selectedItem,
      previewItem: previewItem,
      classPreviewData: classPreviewData,
      hasSelection: !!selectedClass,
      showRandomButton: true,
      useTripleColumn: !!(selectedItem || previewItem || classPreviewData), // Show reference column
      skills: state.skills || [],
      instruction: (!selectedClass && !previewUuid) ?
        game.i18n.localize('VAGABOND.CharBuilder.Instructions.Class') : null
    };
  }

  /**
   * Load available class options
   * @private
   */
  async _loadClassOptions() {
    await this.dataService.ensureDataLoaded(['classes']);
    
    const classes = this.dataService.getFilteredItems('classes', {});
    
    // Sort classes alphabetically
    const sortedClasses = classes.sort((a, b) => a.name.localeCompare(b.name));
    
    return sortedClasses.map(classItem => ({
      ...classItem,
      uuid: classItem.uuid,
      name: classItem.name,
      img: classItem.img,
      type: 'class',
      selected: false // Will be set during context preparation
    }));
  }

  /**
   * Prepare class preview data including skills and features
   * @private
   */
  async _prepareClassPreviewData(classItem, state) {
    // Training is assigned on the Stats step; the class only reports its fixed Training here
    const skillGrant = classItem.system.skillGrant || { guaranteed: [], choices: [] };

    // Group level features by level and enrich descriptions
    const levelFeatures = classItem.system.levelFeatures || [];
    const levelSpells = classItem.system.levelSpells || [];
    const levelGroups = [];

    const maxLevel = levelTableCap();
    for (let level = 1; level <= maxLevel; level++) {
      const featuresAtLevel = levelFeatures.filter(f => f.level === level);

      if (featuresAtLevel.length > 0) {
        // Enrich feature descriptions
        const enrichedFeatures = await Promise.all(
          featuresAtLevel.map(async (feature) => {
            const enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(feature.description || '', {
              async: true,
              secrets: false,
              relativeTo: classItem
            });

            return {
              name: feature.name,
              description: feature.description,
              enrichedDescription: enrichedDescription
            };
          })
        );

        // Get spell count for this level
        const spellData = levelSpells.find(ls => ls.level === level);
        const spellCount = spellData?.spells || null;

        levelGroups.push({
          level: level,
          features: enrichedFeatures,
          isOpen: level === 1, // Open first level by default
          maxMana: classItem.system.manaMultiplier ? level * classItem.system.manaMultiplier : null,
          spells: spellCount
        });
      }
    }

    // Get manaSkill label
    const manaSkill = classItem.system.manaSkill || 'None';
    let manaSkillLabel = game.i18n.localize('VAGABOND.Terms.None');
    if (manaSkill && manaSkill !== 'None') {
      // Check if it's a regular skill
      if (CONFIG.VAGABOND.skills?.[manaSkill]) {
        manaSkillLabel = game.i18n.localize(CONFIG.VAGABOND.skills[manaSkill]);
      } else {
        manaSkillLabel = manaSkill;
      }
    }

    return {
      skillGrant: {
        guaranteed: skillGrant.guaranteed
      },
      isSpellcaster: classItem.system.isSpellcaster ? 'Yes' : 'No',
      manaSkill: manaSkill,
      manaSkillLabel: manaSkillLabel,
      levelGroups: levelGroups,
      levelFeatures: levelFeatures // Keep for backward compatibility
    };
  }

  /**
   * Update class perks if class has changed
   * @private
   */
  async _updateClassPerksIfNeeded(state) {
    if (state.selectedClass !== state.lastClassForPerks) {
      if (state.selectedClass) {
        const classPerks = await this._extractPerksFromClass(state.selectedClass);
        this.updateState('classPerks', classPerks, { skipValidation: true });
      } else {
        this.updateState('classPerks', [], { skipValidation: true });
      }
      this.updateState('lastClassForPerks', state.selectedClass, { skipValidation: true });
    }
  }

  /**
   * Extract perks from class features
   * @private
   */
  async _extractPerksFromClass(classUuid) {
    if (!classUuid) return [];

    try {
      const classItem = await fromUuid(classUuid);
      if (!classItem) return [];

      const features = classItem.system.levelFeatures || [];
      const perkUuids = [];

      // Regex to match @UUID[...] links in perk compendium
      const uuidRegex = /@UUID\[Compendium\.vagabond\.perks\.Item\.([^\]]+)\]/g;

      for (const feature of features) {
        const description = feature.description || '';
        let match;
        while ((match = uuidRegex.exec(description)) !== null) {
          const fullUuid = `Compendium.vagabond.perks.Item.${match[1]}`;
          if (!perkUuids.includes(fullUuid)) {
            perkUuids.push(fullUuid);
          }
        }
      }

      return perkUuids;
    } catch (error) {
      console.error('Failed to extract perks from class:', error);
      return [];
    }
  }

  /**
   * Handle class selection (direct selection, no tray)
   * @private
   */
  async _onSelectOption(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    try {
      // Validate the class exists
      const item = await fromUuid(uuid);
      if (!item || item.type !== 'class') {
        ui.notifications.error('Invalid class selection');
        return;
      }


      // For class, directly select (no preview/tray system)
      this.updateState('selectedClass', uuid);
      this.updateState('previewUuid', uuid);

      // RESET skills when changing class - only keep guaranteed skills from new class
      const skillGrant = item.system.skillGrant || { guaranteed: [], choices: [] };
      // Start fresh with only the new class's guaranteed skills
      const newSkills = [...skillGrant.guaranteed];

      this.updateState('skills', newSkills);
      this.updateState('skillSelections', {}); // Reset per-group selections

      // RESET user-selected perks (class perks will be set below)
      // User must re-select perks since old ones might not meet new prerequisites
      this.updateState('perks', []);

      // RESET spells since different class might have different spell list
      this.updateState('spells', []);

      // Store the skill grant structure for validation
      this.updateState('skillGrant', skillGrant);

      // Calculate spell limit for level 1 character
      let spellLimit = 0;
      if (item.system.isSpellcaster) {
        // Get spell count for level 1
        const levelSpells = item.system.levelSpells || [];
        const level1Spells = levelSpells.find(ls => ls.level === 1);
        spellLimit = level1Spells?.spells || 0;
      }
      this.updateState('spellLimit', spellLimit);
      this._setFormulaLimit(item);

      // Extract and add class perks (replaces old class perks)
      const classPerkUuids = await this._extractPerksFromClass(uuid);
      this.updateState('classPerks', classPerkUuids);
      this.updateState('lastClassForPerks', uuid);

      this.render();
    } catch (error) {
      console.error('Failed to select class:', error);
      ui.notifications.error('Failed to select class');
    }
  }

  /**
   * Handle adding class to tray (confirming selection)
   * @private
   */
  async _onAddToTray(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    try {
      // Validate the class exists
      const item = await fromUuid(uuid);
      if (!item || item.type !== 'class') {
        ui.notifications.error('Invalid class selection');
        return;
      }

      // Update state with selected class
      this.updateState('selectedClass', uuid);
      this.updateState('previewUuid', uuid);
      
      // Auto-select guaranteed skills
      const skillGrant = item.system.skillGrant || { guaranteed: [], choices: [] };
      const currentSkills = this.getCurrentState().skills || [];
      const newSkills = [...new Set([...currentSkills, ...skillGrant.guaranteed])];
      
      this.updateState('skills', newSkills);
      
      
    } catch (error) {
      console.error('Failed to select class:', error);
      ui.notifications.error('Failed to select class');
    }
  }

  /**
   * Handle class randomization
   * @private
   */
  async _onRandomize(event, target) {
    await this.randomize();
  }

  /**
   * Randomize class selection
   */
  async randomize() {
    const options = await this._loadClassOptions();
    if (options.length === 0) {
      ui.notifications.warn('No classes available for randomization');
      return;
    }

    const randomConfig = this.configSystem.getRandomizationConfig('class');
    let selectedClass;

    if (randomConfig && randomConfig.method === 'weighted_random') {
      selectedClass = this._selectWeightedRandom(options, randomConfig);
    } else {
      // Fallback to equal distribution
      const randomIndex = Math.floor(Math.random() * options.length);
      selectedClass = options[randomIndex];
    }

    if (selectedClass) {
      // Load the class item to get its data
      const classItem = await fromUuid(selectedClass.uuid);
      if (!classItem) return;

      this.updateState('selectedClass', selectedClass.uuid);
      this.updateState('previewUuid', selectedClass.uuid);

      // RESET user-selected perks and spells
      this.updateState('perks', []);
      this.updateState('spells', []);

      // Class Training only; every other Training is picked on the Stats step
      const skillGrant = classItem.system.skillGrant || { guaranteed: [], choices: [] };
      this.updateState('skills', [...skillGrant.guaranteed]);
      this.updateState('skillSelections', {});

      // Store the skill grant structure for validation
      this.updateState('skillGrant', skillGrant);

      // Calculate spell limit for level 1 character
      let spellLimit = 0;
      if (classItem.system.isSpellcaster) {
        const levelSpells = classItem.system.levelSpells || [];
        const level1Spells = levelSpells.find(ls => ls.level === 1);
        spellLimit = level1Spells?.spells || 0;
      }
      this.updateState('spellLimit', spellLimit);
      this._setFormulaLimit(classItem);

      // Extract and set class perks
      const classPerkUuids = await this._extractPerksFromClass(selectedClass.uuid);
      this.updateState('classPerks', classPerkUuids);
      this.updateState('lastClassForPerks', selectedClass.uuid);

    }
  }

  /**
   * Alchemy step: formula picks the Class grants at Level 1 (0 removes the step). Picks reset with the Class,
   * like Spells; a build that had reached the Alchemy step and lost it falls back to Spells.
   * @private
   */
  _setFormulaLimit(classItem) {
    const limit = AlchemyHelper.formulaGrantsAtLevel(classItem, 1);
    this.updateState('formulaLimit', limit);
    this.updateState('formulas', []);
    if (!limit && this.getCurrentState().furthestStep === 'alchemy') this.updateState('furthestStep', 'spells');
  }

  /**
   * Select class using weighted randomization
   * @private
   */
  _selectWeightedRandom(options, config) {
    // For now, implement equal weighting as specified in config
    if (config.weights === 'equal') {
      const randomIndex = Math.floor(Math.random() * options.length);
      return options[randomIndex];
    }

    // Future: implement actual weighted selection based on config
    const randomIndex = Math.floor(Math.random() * options.length);
    return options[randomIndex];
  }

  /**
   * Reset class step
   * @protected
   */
  _onReset() {
  }

  /**
   * Step-specific activation logic
   * @protected
   */
  async _onActivate() {
    // Ensure class data is loaded and ready
    await this.dataService.ensureDataLoaded(['classes']);
  }
}