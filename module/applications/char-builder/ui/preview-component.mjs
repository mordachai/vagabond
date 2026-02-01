/**
 * Preview Component
 * 
 * Handles character preview generation and updates.
 * Optimizes preview rendering through change detection and caching.
 */

export class PreviewComponent {
  constructor(configSystem, dataService) {
    this.configSystem = configSystem;
    this.dataService = dataService;
    
    // Preview caching
    this.previewCache = new Map();
    this.lastPreviewHash = null;
    
    // Change detection for selective updates
    this.previewTrackedPaths = [
      'selectedAncestry',
      'selectedClass',
      'assignedStats',
      'skills',
      'perks',
      'classPerks',
      'spells',
      'selectedStartingPack',
      'gear'
    ];
  }

  /**
   * Prepare character preview (full generation)
   * @param {object} state - Current builder state
   * @returns {Promise<object>} Preview context
   */
  async preparePreview(state) {
    try {
      const preview = await this._generatePreview(state);

      // Cache the preview
      const previewHash = this._calculatePreviewHash(state);
      this.previewCache.set(previewHash, preview);
      this.lastPreviewHash = previewHash;

      return preview;
    } catch (error) {
      console.error('Failed to prepare preview:', error);
      return this._getFallbackPreview();
    }
  }

  /**
   * Prepare character preview with incremental updates
   * @param {object} state - Current builder state
   * @param {object} previousState - Previous builder state for comparison
   * @returns {Promise<object>} Preview context
   */
  async preparePreviewIncremental(state, previousState = null) {
    try {
      // If no previous state, generate full preview
      if (!previousState) {
        return await this.preparePreview(state);
      }

      // Check which sections need updates
      const sectionsToUpdate = this._detectPreviewChanges(state, previousState);
      
      if (sectionsToUpdate.length === 0) {
        // No changes, return cached preview
        const previewHash = this._calculatePreviewHash(state);
        if (this.previewCache.has(previewHash)) {
          return this.previewCache.get(previewHash);
        }
      }

      // Get cached preview or create new one
      const previewHash = this._calculatePreviewHash(previousState);
      let preview = this.previewCache.get(previewHash) || await this._generatePreview(previousState);

      // Update only changed sections
      for (const section of sectionsToUpdate) {
        switch (section) {
          case 'basic':
            preview.basic = await this._generateBasicInfo(state);
            break;
          case 'stats':
            preview.stats = await this._generateStatsPreview(state);
            break;
          case 'features':
            preview.features = await this._generateFeaturesPreview(state);
            break;
          case 'equipment':
            preview.equipment = await this._generateEquipmentPreview(state);
            break;
          case 'spells':
            preview.spells = await this._generateSpellsPreview(state);
            break;
          case 'summary':
            preview.summary = await this._generateSummaryPreview(state);
            break;
        }
      }

      // Cache the updated preview
      const newPreviewHash = this._calculatePreviewHash(state);
      this.previewCache.set(newPreviewHash, preview);
      this.lastPreviewHash = newPreviewHash;

      return preview;
      
    } catch (error) {
      console.error('Failed to prepare incremental preview:', error);
      return this._getFallbackPreview();
    }
  }

  /**
   * Detect which preview sections need updates
   * @param {object} state - Current state
   * @param {object} previousState - Previous state
   * @returns {array} Array of section names that need updates
   */
  _detectPreviewChanges(state, previousState) {
    const sectionsToUpdate = [];

    // Check basic info changes
    if (state.selectedAncestry !== previousState.selectedAncestry ||
        state.selectedClass !== previousState.selectedClass) {
      sectionsToUpdate.push('basic', 'features', 'summary');
    }

    // Check stats changes
    if (JSON.stringify(state.assignedStats) !== JSON.stringify(previousState.assignedStats)) {
      sectionsToUpdate.push('stats', 'summary');
    }

    // Check features changes (perks)
    if (JSON.stringify(state.perks) !== JSON.stringify(previousState.perks) ||
        JSON.stringify(state.classPerks) !== JSON.stringify(previousState.classPerks)) {
      sectionsToUpdate.push('features', 'summary');
    }

    // Check equipment changes
    if (state.selectedStartingPack !== previousState.selectedStartingPack ||
        JSON.stringify(state.gear) !== JSON.stringify(previousState.gear)) {
      sectionsToUpdate.push('equipment', 'summary');
    }

    // Check spells changes
    if (JSON.stringify(state.spells) !== JSON.stringify(previousState.spells)) {
      sectionsToUpdate.push('spells', 'summary');
    }

    return [...new Set(sectionsToUpdate)]; // Remove duplicates
  }

  /**
   * Generate character preview
   * @param {object} state - Current builder state
   * @returns {Promise<object>} Generated preview
   */
  async _generatePreview(state) {
    const preview = {
      basic: await this._generateBasicInfo(state),
      stats: await this._generateStatsPreview(state),
      features: await this._generateFeaturesPreview(state),
      equipment: await this._generateEquipmentPreview(state),
      spells: await this._generateSpellsPreview(state),
      summary: await this._generateSummaryPreview(state)
    };

    return preview;
  }

  /**
   * Generate basic character information
   * @param {object} state - Current builder state
   * @returns {Promise<object>} Basic info preview
   */
  async _generateBasicInfo(state) {
    const basic = {
      name: 'New Character',
      level: 1,
      ancestry: null,
      class: null,
      background: null
    };

    // Get ancestry information
    if (state.selectedAncestry) {
      try {
        await this.dataService.ensureDataLoaded(['ancestries']);
        const ancestry = this.dataService.getAncestry(state.selectedAncestry);
        if (ancestry) {
          basic.ancestry = {
            name: ancestry.name,
            size: ancestry.size || 'Medium',
            speed: ancestry.speed || 30,
            languages: ancestry.languages || [],
            traits: ancestry.traits || []
          };
        }
      } catch (error) {
        console.warn('Failed to load ancestry for preview:', error);
      }
    }

    // Get class information
    if (state.selectedClass) {
      try {
        await this.dataService.ensureDataLoaded(['classes']);
        const characterClass = this.dataService.getClass(state.selectedClass);
        if (characterClass) {
          basic.class = {
            name: characterClass.name,
            hitDie: characterClass.hitDie || 'd8',
            primaryStats: characterClass.primaryStats || [],
            savingThrows: characterClass.savingThrows || [],
            skillProficiencies: characterClass.skillProficiencies || [],
            spellcasting: characterClass.spellcasting || null
          };
        }
      } catch (error) {
        console.warn('Failed to load class for preview:', error);
      }
    }

    return basic;
  }

  /**
   * Generate stats preview
   * @param {object} state - Current builder state
   * @returns {Promise<object>} Stats preview
   */
  async _generateStatsPreview(state) {
    const stats = {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
      modifiers: {},
      total: 0
    };

    // Apply assigned stats
    if (state.assignedStats) {
      Object.assign(stats, state.assignedStats);
    }

    // Calculate modifiers
    for (const [stat, value] of Object.entries(stats)) {
      if (typeof value === 'number') {
        stats.modifiers[stat] = Math.floor((value - 10) / 2);
        if (stat !== 'modifiers' && stat !== 'total') {
          stats.total += value;
        }
      }
    }

    // Apply ancestry modifiers
    if (state.selectedAncestry) {
      try {
        await this.dataService.ensureDataLoaded(['ancestries']);
        const ancestry = this.dataService.getAncestry(state.selectedAncestry);
        if (ancestry && ancestry.statModifiers) {
          for (const [stat, modifier] of Object.entries(ancestry.statModifiers)) {
            if (stats.hasOwnProperty(stat)) {
              stats[stat] += modifier;
              stats.modifiers[stat] = Math.floor((stats[stat] - 10) / 2);
            }
          }
        }
      } catch (error) {
        console.warn('Failed to apply ancestry stat modifiers:', error);
      }
    }

    return stats;
  }

  /**
   * Generate features preview
   * @param {object} state - Current builder state
   * @returns {Promise<object>} Features preview
   */
  async _generateFeaturesPreview(state) {
    const features = {
      ancestry: [],
      class: [],
      perks: [],
      total: 0
    };

    // Get ancestry features
    if (state.selectedAncestry) {
      try {
        await this.dataService.ensureDataLoaded(['ancestries']);
        const ancestry = this.dataService.getAncestry(state.selectedAncestry);
        if (ancestry && ancestry.features) {
          features.ancestry = ancestry.features.map(feature => ({
            name: feature.name || feature,
            description: feature.description || '',
            source: 'Ancestry'
          }));
        }
      } catch (error) {
        console.warn('Failed to load ancestry features:', error);
      }
    }

    // Get class features
    if (state.selectedClass) {
      try {
        await this.dataService.ensureDataLoaded(['classes']);
        const characterClass = this.dataService.getClass(state.selectedClass);
        if (characterClass && characterClass.features) {
          features.class = characterClass.features
            .filter(feature => feature.level === 1)
            .map(feature => ({
              name: feature.name || feature,
              description: feature.description || '',
              source: 'Class'
            }));
        }
      } catch (error) {
        console.warn('Failed to load class features:', error);
      }
    }

    // Get selected perks
    const allPerks = [...(state.perks || []), ...(state.classPerks || [])];
    if (allPerks.length > 0) {
      try {
        await this.dataService.ensureDataLoaded(['perks']);
        for (const perkId of allPerks) {
          const perk = this.dataService.getPerk(perkId);
          if (perk) {
            features.perks.push({
              name: perk.name,
              description: perk.description || '',
              source: state.classPerks?.includes(perkId) ? 'Class' : 'Selected',
              cost: perk.cost || 1
            });
          }
        }
      } catch (error) {
        console.warn('Failed to load perks for preview:', error);
      }
    }

    features.total = features.ancestry.length + features.class.length + features.perks.length;
    return features;
  }

  /**
   * Generate equipment preview
   * @param {object} state - Current builder state
   * @returns {Promise<object>} Equipment preview
   */
  async _generateEquipmentPreview(state) {
    const equipment = {
      startingPack: null,
      gear: [],
      weapons: [],
      armor: [],
      total: 0,
      totalValue: 0
    };

    // Get starting pack
    if (state.selectedStartingPack) {
      try {
        await this.dataService.ensureDataLoaded(['startingPacks']);
        const startingPack = this.dataService.getAllItems('startingPacks')
          .find(pack => pack.id === state.selectedStartingPack);
        
        if (startingPack) {
          equipment.startingPack = {
            name: startingPack.name,
            items: startingPack.items || [],
            gold: startingPack.gold || 0
          };
        }
      } catch (error) {
        console.warn('Failed to load starting pack for preview:', error);
      }
    }

    // Get selected gear
    if (state.gear && state.gear.length > 0) {
      try {
        await this.dataService.ensureDataLoaded(['gear']);
        for (const gearId of state.gear) {
          const item = this.dataService.getGear(gearId);
          if (item) {
            const gearItem = {
              name: item.name,
              category: item.category || 'Equipment',
              cost: item.cost || 0,
              weight: item.weight || 0,
              properties: item.properties || []
            };

            equipment.gear.push(gearItem);
            equipment.totalValue += gearItem.cost;

            // Categorize items
            if (item.category === 'Weapon') {
              equipment.weapons.push(gearItem);
            } else if (item.category === 'Armor') {
              equipment.armor.push(gearItem);
            }
          }
        }
      } catch (error) {
        console.warn('Failed to load gear for preview:', error);
      }
    }

    equipment.total = equipment.gear.length;
    return equipment;
  }

  /**
   * Generate spells preview
   * @param {object} state - Current builder state
   * @returns {Promise<object>} Spells preview
   */
  async _generateSpellsPreview(state) {
    const spells = {
      cantrips: [],
      level1: [],
      level2: [],
      level3: [],
      total: 0,
      canCast: false
    };

    // Check if character can cast spells
    if (state.selectedClass) {
      try {
        await this.dataService.ensureDataLoaded(['classes']);
        const characterClass = this.dataService.getClass(state.selectedClass);
        spells.canCast = !!(characterClass && characterClass.spellcasting);
      } catch (error) {
        console.warn('Failed to check spellcasting ability:', error);
      }
    }

    // Get selected spells
    if (spells.canCast && state.spells && state.spells.length > 0) {
      try {
        await this.dataService.ensureDataLoaded(['spells']);
        for (const spellId of state.spells) {
          const spell = this.dataService.getSpell(spellId);
          if (spell) {
            const spellData = {
              name: spell.name,
              level: spell.level || 0,
              school: spell.school || 'Evocation',
              castingTime: spell.castingTime || '1 action',
              range: spell.range || 'Touch',
              duration: spell.duration || 'Instantaneous'
            };

            if (spell.level === 0) {
              spells.cantrips.push(spellData);
            } else if (spell.level === 1) {
              spells.level1.push(spellData);
            } else if (spell.level === 2) {
              spells.level2.push(spellData);
            } else if (spell.level === 3) {
              spells.level3.push(spellData);
            }
          }
        }
      } catch (error) {
        console.warn('Failed to load spells for preview:', error);
      }
    }

    spells.total = spells.cantrips.length + spells.level1.length + spells.level2.length + spells.level3.length;
    return spells;
  }

  /**
   * Generate summary preview
   * @param {object} state - Current builder state
   * @returns {Promise<object>} Summary preview
   */
  async _generateSummaryPreview(state) {
    const summary = {
      completionPercentage: 0,
      completedSteps: [],
      missingSteps: [],
      warnings: [],
      readyToCreate: false
    };

    // Check step completion
    const steps = ['ancestry', 'class', 'stats', 'starting-packs'];
    const optionalSteps = ['perks', 'spells', 'gear'];

    for (const step of steps) {
      if (this._isStepCompleted(step, state)) {
        summary.completedSteps.push(step);
      } else {
        summary.missingSteps.push(step);
      }
    }

    // Calculate completion percentage
    summary.completionPercentage = Math.round((summary.completedSteps.length / steps.length) * 100);
    summary.readyToCreate = summary.missingSteps.length === 0;

    // Add warnings
    if (!state.selectedAncestry) {
      summary.warnings.push('No ancestry selected');
    }
    if (!state.selectedClass) {
      summary.warnings.push('No class selected');
    }
    if (!state.assignedStats || Object.keys(state.assignedStats).length < 6) {
      summary.warnings.push('Stats not fully assigned');
    }
    if (!state.selectedStartingPack) {
      summary.warnings.push('No starting pack selected');
    }

    return summary;
  }

  /**
   * Calculate preview hash for change detection
   * @param {object} state - Current builder state
   * @returns {string} Preview hash
   */
  _calculatePreviewHash(state) {
    const relevantData = {};
    
    for (const path of this.previewTrackedPaths) {
      const value = this._getNestedValue(state, path);
      if (value !== undefined) {
        relevantData[path] = value;
      }
    }
    
    return JSON.stringify(relevantData);
  }

  /**
   * Get nested value from object using dot notation
   * @param {object} obj - Object to search
   * @param {string} path - Dot notation path
   * @returns {any} Value at path
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Check if step is completed
   * @param {string} stepName - Step name
   * @param {object} state - Current builder state
   * @returns {boolean} True if step is completed
   */
  _isStepCompleted(stepName, state) {
    switch (stepName) {
      case 'ancestry':
        return !!state.selectedAncestry;
      case 'class':
        return !!state.selectedClass;
      case 'stats':
        return Object.keys(state.assignedStats || {}).length === 6;
      case 'starting-packs':
        return !!state.selectedStartingPack;
      default:
        return false;
    }
  }

  /**
   * Get fallback preview in case of errors
   * @returns {object} Fallback preview
   */
  _getFallbackPreview() {
    return {
      error: true,
      basic: { name: 'New Character', level: 1, ancestry: null, class: null },
      stats: { total: 60, modifiers: {} },
      features: { total: 0, ancestry: [], class: [], perks: [] },
      equipment: { total: 0, gear: [], totalValue: 0 },
      spells: { total: 0, canCast: false },
      summary: { 
        completionPercentage: 0, 
        readyToCreate: false, 
        warnings: ['Preview generation failed'] 
      }
    };
  }

  /**
   * Clear preview cache
   */
  clearCache() {
    this.previewCache.clear();
    this.lastPreviewHash = null;
  }

  /**
   * Get preview component statistics
   * @returns {object} Component statistics
   */
  getStats() {
    return {
      cacheSize: this.previewCache.size,
      lastPreviewHash: this.lastPreviewHash,
      trackedPaths: this.previewTrackedPaths.length
    };
  }
}