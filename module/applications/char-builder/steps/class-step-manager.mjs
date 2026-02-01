/**
 * Class Step Manager - Handles class selection logic
 */
import { BaseStepManager } from './base-step-manager.mjs';

export class ClassStepManager extends BaseStepManager {
  constructor(stateManager, dataService, configSystem) {
    super(stateManager, dataService, configSystem);
    
    // Define action handlers for class step
    this.actionHandlers = {
      'selectOption': this._onSelectOption.bind(this),
      'addToTray': this._onAddToTray.bind(this),
      'randomize': this._onRandomize.bind(this),
      'toggleSkill': this._onToggleSkill.bind(this)
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
    return ['selectedClass', 'skills', 'classPerks', 'lastClassForPerks', 'previewUuid'];
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
      availableOptions: availableClasses,
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
    const skillGrant = classItem.system.skillGrant || { guaranteed: [], choices: [] };
    const currentSkills = state.skills || [];

    // Prepare skill choices data
    const skillChoices = skillGrant.choices.map(choice => {
      const pool = choice.pool.length ? choice.pool : Object.keys(CONFIG.VAGABOND.skills);
      const availableSkills = pool.filter(skill => !currentSkills.includes(skill));

      return {
        count: choice.count,
        pool: pool,
        available: availableSkills,
        selected: currentSkills.filter(skill => pool.includes(skill)).length
      };
    });

    // Group level features by level and enrich descriptions
    const levelFeatures = classItem.system.levelFeatures || [];
    const levelSpells = classItem.system.levelSpells || [];
    const levelGroups = [];

    for (let level = 1; level <= 10; level++) {
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
        guaranteed: skillGrant.guaranteed,
        choices: skillChoices
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

      // Extract and add class perks
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
   * Handle skill toggle
   * @private
   */
  async _onToggleSkill(event, target) {
    const skill = target.value;
    const state = this.getCurrentState();
    
    if (!state.selectedClass) {
      ui.notifications.warn('Please select a class first');
      return;
    }

    try {
      const classItem = await fromUuid(state.selectedClass);
      if (!classItem) return;

      const skillGrant = classItem.system.skillGrant || { guaranteed: [], choices: [] };
      const currentSkills = state.skills || [];

      // Check if this is a guaranteed skill (can't be toggled)
      if (skillGrant.guaranteed.includes(skill)) {
        ui.notifications.warn('This skill is guaranteed by your class and cannot be removed');
        return;
      }

      // Toggle the skill
      let newSkills;
      if (currentSkills.includes(skill)) {
        newSkills = currentSkills.filter(s => s !== skill);
      } else {
        // Check if we can add more skills from this choice pool
        const relevantChoice = skillGrant.choices.find(choice => 
          choice.pool.includes(skill) || choice.pool.length === 0
        );
        
        if (relevantChoice) {
          const pool = relevantChoice.pool.length ? relevantChoice.pool : Object.keys(CONFIG.VAGABOND.skills);
          const currentFromPool = currentSkills.filter(s => pool.includes(s) && !skillGrant.guaranteed.includes(s));
          
          if (currentFromPool.length >= relevantChoice.count) {
            ui.notifications.warn(`You can only select ${relevantChoice.count} skills from this pool`);
            return;
          }
        }
        
        newSkills = [...currentSkills, skill];
      }

      this.updateState('skills', newSkills);
      
    } catch (error) {
      console.error('Failed to toggle skill:', error);
      ui.notifications.error('Failed to toggle skill');
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
      this.updateState('selectedClass', selectedClass.uuid);
      this.updateState('previewUuid', selectedClass.uuid);
      
      // Auto-select skills
      await this._autoSelectSkills(selectedClass.uuid);
      
    }
  }

  /**
   * Auto-select skills for a class
   * @private
   */
  async _autoSelectSkills(classUuid) {
    try {
      const classItem = await fromUuid(classUuid);
      if (!classItem) return;

      const skillGrant = classItem.system.skillGrant || { guaranteed: [], choices: [] };
      const skills = [...skillGrant.guaranteed];

      // Auto-select random skills from choices
      for (const choice of skillGrant.choices) {
        const pool = choice.pool.length ? choice.pool : Object.keys(CONFIG.VAGABOND.skills);
        const available = pool.filter(s => !skills.includes(s));
        const shuffled = available.sort(() => Math.random() - 0.5);
        skills.push(...shuffled.slice(0, choice.count));
      }

      this.updateState('skills', skills);
    } catch (error) {
      console.error('Failed to auto-select skills:', error);
    }
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
    console.log('Class step reset');
  }

  /**
   * Step-specific activation logic
   * @protected
   */
  async _onActivate() {
    // Ensure class data is loaded and ready
    await this.dataService.ensureDataLoaded(['classes']);
    console.log('Class step activated');
  }
}