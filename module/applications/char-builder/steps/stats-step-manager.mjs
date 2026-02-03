/**
 * Stats Step Manager - Handles stat assignment and array selection logic
 */
import { BaseStepManager } from './base-step-manager.mjs';

export class StatsStepManager extends BaseStepManager {
  constructor(stateManager, dataService, configSystem) {
    super(stateManager, dataService, configSystem);
    
    // Define action handlers for stats step
    this.actionHandlers = {
      'selectOption': this._onSelectOption.bind(this),
      'pickValue': this._onPickValue.bind(this),
      'assignStat': this._onAssignStat.bind(this),
      'unassignStat': this._onUnassignStat.bind(this), // Remove single stat value
      'resetStats': this._onResetStats.bind(this),
      'randomize': this._onRandomize.bind(this),
      'applyBonus': this._onApplyBonus.bind(this),
      'removeBonus': this._onRemoveBonus.bind(this),
      'applyStatBonus': this._onApplyStatBonus.bind(this), // Apply bonus via + button
      'removeStatBonus': this._onRemoveStatBonus.bind(this) // Remove bonus via tag click
    };
    
    // No external data required for stats step
    this.requiredData = [];
  }

  /**
   * Step name identifier
   */
  get stepName() {
    return 'stats';
  }

  /**
   * Get state paths managed by this step
   * @protected
   */
  _getStatePaths() {
    return ['selectedArrayId', 'assignedStats', 'unassignedValues', 'selectedValue'];
  }

  /**
   * Prepare stats-specific context data
   * @protected
   */
  async _prepareStepSpecificContext(state) {
    const statArrays = this._getStatArrays();
    const selectedArrayId = state.selectedArrayId;
    const assignedStats = state.assignedStats || {};
    const unassignedValues = state.unassignedValues || [];
    const selectedValue = state.selectedValue;

    // Collect available bonuses from ancestry, class, and perks
    const availableBonuses = await this._collectAvailableBonuses(state);
    const appliedBonuses = state.appliedBonuses || {};
    
    // Prepare stat arrays for display
    const statArrayOptions = Object.entries(statArrays).map(([id, values]) => ({
      id: id,
      values: values,
      selected: selectedArrayId === id,
      total: values.reduce((sum, val) => sum + val, 0)
    }));

    // Prepare individual stats for display with localized labels
    const statOrder = ['might', 'dexterity', 'awareness', 'reason', 'presence', 'luck'];

    // Stat hints mapping (describing what each stat does)
    const statHints = {
      might: 'Physical strength and power. Affects HP, inventory slots, melee attacks, and physical feats.',
      dexterity: 'Agility, reflexes, and coordination. Affects speed, finesse attacks, dodging, and sneaking.',
      awareness: 'Perception and alertness. Affects detection, reflexes, tracking, and environmental awareness.',
      reason: 'Logic, knowledge, and intelligence. Affects arcana, crafting, medicine, and spellcasting.',
      presence: 'Charisma and force of personality. Affects influence, leadership, performance, and commanding.',
      luck: 'Fortune and fate. Your Luck Pool for rerolls and avoiding disaster.'
    };

    const statsDisplay = statOrder.map(stat => {
      const baseValue = assignedStats[stat] || null;

      // Calculate bonuses applied to this stat
      const bonusesForThisStat = Object.entries(appliedBonuses)
        .filter(([bonusId, application]) => application.target === stat)
        .reduce((sum, [bonusId, application]) => sum + application.amount, 0);

      const finalValue = baseValue !== null ? baseValue + bonusesForThisStat : null;

      // Calculate if this stat can accept bonuses based on conditions
      const canApplyBonuses = availableBonuses
        .filter(b => !appliedBonuses[b.bonusId]) // Not already applied
        .reduce((canApply, bonus) => {
          if (baseValue === null) return false;
          return canApply || this._checkBonusCondition(bonus.condition, baseValue);
        }, false);

      const statData = {
        key: stat,
        label: game.i18n.localize(CONFIG.VAGABOND.stats[stat]) || stat,
        name: game.i18n.localize(CONFIG.VAGABOND.stats[stat]) || stat,
        abbreviation: game.i18n.localize(CONFIG.VAGABOND.statAbbreviations[stat]) || stat.substring(0, 3).toUpperCase(),
        value: baseValue,
        finalValue: finalValue,
        bonusAmount: bonusesForThisStat,
        hasBonus: bonusesForThisStat > 0,
        hasValue: baseValue !== null && baseValue !== undefined,
        hint: statHints[stat] || '',
        canApplyBonus: canApplyBonuses
      };

      console.log(`[StatsStep] Stat ${stat}:`, statData);
      return statData;
    });

    // Check if step is complete
    const isComplete = !!selectedArrayId &&
                      Object.values(assignedStats).every(v => v !== null && v !== undefined) &&
                      unassignedValues.length === 0;

    // Prepare unassigned values for display (decision zone)
    const unassignedDisplay = unassignedValues.map((value, index) => ({
      value: value,
      index: index,
      active: selectedValue === index
    }));

    // Prepare derived stats for preview (if all stats are assigned)
    const derivedStats = await this._prepareDerivedStats(assignedStats, state);

    // Prepare bonuses for display (old system - kept for compatibility)
    const bonusesDisplay = availableBonuses.map(bonus => {
      const application = appliedBonuses[bonus.bonusId];
      const isApplied = !!application;

      return {
        ...bonus,
        applied: isApplied,
        appliedTarget: isApplied ? application.target : null,
        conditionText: this._getConditionText(bonus.condition)
      };
    });

    // Prepare simplified bonusStats for new dropdown UI
    const allStatsAssigned = Object.values(assignedStats).every(v => v !== null && v !== undefined);
    const totalBonuses = availableBonuses.length;
    const appliedCount = Object.keys(appliedBonuses).length;
    const remainingBonuses = totalBonuses - appliedCount;

    let bonusStats = null;
    if (totalBonuses > 0) {
      // Calculate final stat values (base + applied bonuses)
      const finalStats = { ...assignedStats };
      for (const [bonusId, application] of Object.entries(appliedBonuses)) {
        if (finalStats[application.target] !== null && finalStats[application.target] !== undefined) {
          finalStats[application.target] += application.amount;
        }
      }

      // Find the next unapplied bonus for source display
      const nextBonus = availableBonuses.find(b => !appliedBonuses[b.bonusId]);

      // Prepare available stats for dropdown
      const availableStats = statOrder.map(stat => {
        const currentValue = finalStats[stat];
        return {
          key: stat,
          label: game.i18n.localize(CONFIG.VAGABOND.stats[stat]) || stat,
          value: currentValue,
          disabled: currentValue === null || currentValue >= 7 // Disable if not assigned or at max
        };
      });

      bonusStats = {
        remaining: remainingBonuses,
        isActive: allStatsAssigned && remainingBonuses > 0,
        availableStats: availableStats,
        sourceLabel: nextBonus ? nextBonus.sourceLabel : null
      };

      console.log('[StatsStep] bonusStats prepared:', bonusStats);
    }

    console.log('[StatsStep] Returning context with bonusStats:', bonusStats ? 'YES' : 'NO');
    console.log('[StatsStep] bonusStats details:', {
      exists: !!bonusStats,
      remaining: bonusStats?.remaining,
      isActive: bonusStats?.isActive,
      availableStatsCount: bonusStats?.availableStats?.length,
      sourceLabel: bonusStats?.sourceLabel
    });

    return {
      statArrays: statArrayOptions,
      statData: {  // For template compatibility
        arrays: statArrayOptions,
        unassigned: unassignedDisplay,
        slots: statsDisplay,
        derived: derivedStats
      },
      selectedArrayId: selectedArrayId,
      stats: statsDisplay,
      unassignedValues: unassignedValues,
      selectedValue: selectedValue,
      hasSelection: !!selectedArrayId,
      isComplete: isComplete,
      showRandomButton: true,
      instruction: (!selectedArrayId) ?
        game.i18n.localize('VAGABOND.CharBuilder.Instructions.Stats') : null,
      availableBonuses: bonusesDisplay,
      bonusStats: bonusStats // New simplified bonus stats data
    };
  }

  /**
   * Get stat arrays from configuration
   * @private
   */
  _getStatArrays() {
    const statsConfig = this.configSystem.getStatsConfig();
    if (statsConfig && statsConfig.arrays) {
      return statsConfig.arrays;
    }

    // Fallback to hardcoded arrays
    return {
      1: [5, 5, 5, 4, 4, 3], 2: [5, 5, 5, 5, 3, 2], 3: [6, 5, 4, 4, 4, 3],
      4: [6, 5, 5, 4, 3, 2], 5: [6, 6, 4, 3, 3, 3], 6: [6, 6, 4, 4, 3, 2],
      7: [6, 6, 5, 3, 2, 2], 8: [7, 4, 4, 4, 4, 2], 9: [7, 4, 4, 4, 3, 3],
      10: [7, 5, 4, 3, 3, 2], 11: [7, 5, 5, 2, 2, 2], 12: [7, 6, 4, 2, 2, 2]
    };
  }

  /**
   * Prepare derived stats for preview display
   * @private
   */
  async _prepareDerivedStats(assignedStats, state) {
    const allAssigned = Object.values(assignedStats).every(v => v !== null && v !== undefined);

    if (!allAssigned) {
      return null; // Don't show preview until all stats are assigned
    }

    // Create a preview actor with the assigned stats to get calculated values
    const previewActor = await this._createPreviewActor(assignedStats, state);
    if (!previewActor) {
      return null;
    }

    // Check if character is a spellcaster by looking at the actor's data
    const isSpellcaster = previewActor.system.attributes.isSpellcaster || false;

    // Get casting stat abbreviation for tooltip
    let castingStatKey = 'reason';
    if (state.selectedClass) {
      try {
        const classItem = await fromUuid(state.selectedClass);
        if (classItem) {
          castingStatKey = classItem.system.castingStat || 'reason';
        }
      } catch (error) {
        console.warn('Failed to load class for casting stat:', error);
      }
    }

    // Get saves from the preview actor
    const saves = Object.entries(previewActor.system.saves).map(([key, save]) => {
      return {
        label: save.label,
        statAbbr: '', // Let the template decide or don't show
        value: save.difficulty,
        tooltip: save.description
      };
    });

    // Get skills from the preview actor
    const skills = Object.entries(previewActor.system.skills).map(([key, skill]) => {
      return {
        key: key,
        label: skill.label,
        statAbbr: game.i18n.localize(CONFIG.VAGABOND.statAbbreviations[skill.stat]) || '',
        value: skill.difficulty,
        trained: skill.trained,
        tooltip: game.i18n.localize(`VAGABOND.SkillsHints.${key.charAt(0).toUpperCase() + key.slice(1)}`) || skill.label
      };
    });

    // Get weapon skills from the preview actor
    const weaponSkills = Object.entries(previewActor.system.weaponSkills).map(([key, skill]) => {
      return {
        key: key,
        label: skill.label,
        statAbbr: game.i18n.localize(CONFIG.VAGABOND.statAbbreviations[skill.stat]) || '',
        value: skill.difficulty,
        trained: skill.trained,
        tooltip: game.i18n.localize(`VAGABOND.WeaponSkillsHints.${key.charAt(0).toUpperCase() + key.slice(1)}`) || skill.label
      };
    });

    return {
      hp: {
        label: 'HP',
        value: previewActor.system.health.max,
        tooltip: game.i18n.localize('VAGABOND.Hints.HP')
      },
      isSpellcaster: isSpellcaster,
      manaMax: {
        label: 'Mana Max',
        value: previewActor.system.mana.max,
        tooltip: game.i18n.localize('VAGABOND.Hints.MaxMana')
      },
      manaCast: {
        label: 'Mana/Cast',
        value: previewActor.system.mana.castingMax,
        tooltip: game.i18n.localize('VAGABOND.Hints.ManaPerCast')
      },
      luck: {
        label: 'Luck Pool',
        value: previewActor.system.stats.luck.total,
        tooltip: game.i18n.localize('VAGABOND.Hints.LuckPool')
      },
      inventory: {
        label: 'Inventory',
        value: previewActor.system.inventory.maxSlots,
        tooltip: game.i18n.localize('VAGABOND.Hints.Inventory')
      },
      speed: {
        label: 'Speed',
        value: previewActor.system.speed.base,
        tooltip: game.i18n.localize('VAGABOND.Hints.Speed')
      },
      saves: saves,
      skills: skills,
      weaponSkills: weaponSkills
    };
  }

  /**
   * Create a preview actor with assigned stats
   * @private
   */
  async _createPreviewActor(assignedStats, state) {
    try {
      // Apply bonuses to stats
      const finalStats = { ...assignedStats };
      const appliedBonuses = state.appliedBonuses || {};

      for (const [bonusId, application] of Object.entries(appliedBonuses)) {
        if (finalStats[application.target] !== null && finalStats[application.target] !== undefined) {
          finalStats[application.target] += application.amount;
        }
      }

      // Get trained skills from builder state
      const trainedSkills = state.skills || [];

      // Build skills object with trained status matching schema
      // Each skill needs: trained (bool), stat (string), bonus (number)
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

      // Build weapon skills object with trained status matching schema
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

      // Build actor data with final stats (including bonuses)
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

      // Apply builder selections (ancestry, class, perks, etc.)
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
   * Handle selecting a stat array
   * @private
   */
  _onSelectOption(event, target) {
    const arrayId = target.dataset.id;
    if (!arrayId) return;

    const statArrays = this._getStatArrays();
    const selectedArray = statArrays[arrayId];
    
    if (!selectedArray) {
      ui.notifications.error('Invalid stat array selection');
      return;
    }

    // Update state with selected array
    const updates = {
      'selectedArrayId': arrayId,
      'unassignedValues': [...selectedArray],
      'assignedStats': {
        might: null,
        dexterity: null,
        awareness: null,
        reason: null,
        presence: null,
        luck: null
      },
      'selectedValue': null
    };

    this.stateManager.updateMultiple(updates);
  }

  /**
   * Handle picking a value from the unassigned pool
   * @private
   */
  _onPickValue(event, target) {
    const index = parseInt(target.dataset.index);
    const state = this.getCurrentState();
    
    if (isNaN(index) || !state.unassignedValues || index >= state.unassignedValues.length) {
      console.error('Invalid value index for picking');
      return;
    }

    const value = state.unassignedValues[index];
    this.updateState('selectedValue', { value: value, index: index });
  }

  /**
   * Handle assigning a stat value
   * @private
   */
  _onAssignStat(event, target) {
    const statKey = target.dataset.stat;
    const state = this.getCurrentState();
    
    if (!state.selectedValue) {
      ui.notifications.warn('Please select a value first');
      return;
    }

    if (!statKey) {
      console.error('No stat key provided for assignment');
      return;
    }

    this._assignStatValue(statKey, state.selectedValue.value, state.selectedValue.index);
  }

  /**
   * Assign a stat value
   * @private
   */
  _assignStatValue(statKey, value, poolIndex) {
    // Validation
    if (isNaN(value) || isNaN(poolIndex)) {
      console.error('Validation Failed: Value or PoolIndex is NaN');
      return;
    }

    const state = this.getCurrentState();
    const assignedStats = state.assignedStats || {};
    const unassignedValues = [...(state.unassignedValues || [])];

    // Handle reassignment: if the slot already has a value, return it to the pool
    const previousValue = assignedStats[statKey];
    if (previousValue !== null && previousValue !== undefined) {
      unassignedValues.push(previousValue);
    }

    // Remove the specific value from the unassigned list
    if (poolIndex >= 0 && poolIndex < unassignedValues.length) {
      unassignedValues.splice(poolIndex, 1);
    } else {
      // Fallback: find the first matching value
      const fallbackIndex = unassignedValues.indexOf(value);
      if (fallbackIndex > -1) {
        unassignedValues.splice(fallbackIndex, 1);
      }
    }

    // Update state
    const updates = {
      [`assignedStats.${statKey}`]: value,
      'unassignedValues': unassignedValues,
      'selectedValue': null
    };

    this.stateManager.updateMultiple(updates);
  }

  /**
   * Handle unassigning a single stat value (return to pool)
   * @private
   */
  _onUnassignStat(event, target) {
    const statKey = target.dataset.stat;

    if (!statKey) {
      console.error('No stat key provided for unassignment');
      return;
    }

    const state = this.getCurrentState();
    const assignedStats = { ...(state.assignedStats || {}) };
    const unassignedValues = [...(state.unassignedValues || [])];
    const appliedBonuses = { ...(state.appliedBonuses || {}) };

    // Get the current value
    const valueToReturn = assignedStats[statKey];

    if (valueToReturn === null || valueToReturn === undefined) {
      console.warn('Stat has no value to remove');
      return;
    }

    console.log(`[StatsStep] Unassigning ${statKey}: returning value ${valueToReturn} to pool`);

    // Remove the stat assignment
    assignedStats[statKey] = null;

    // Return value to pool
    unassignedValues.push(valueToReturn);

    // Remove any bonus applied to this stat
    const bonusToRemove = Object.entries(appliedBonuses).find(
      ([bonusId, application]) => application.target === statKey
    );

    if (bonusToRemove) {
      const [bonusIdToRemove] = bonusToRemove;
      delete appliedBonuses[bonusIdToRemove];
      console.log(`[StatsStep] Also removed bonus from ${statKey}`);
    }

    // Update state
    const updates = {
      'assignedStats': assignedStats,
      'unassignedValues': unassignedValues,
      'appliedBonuses': appliedBonuses,
      'selectedValue': null
    };

    this.stateManager.updateMultiple(updates);
  }

  /**
   * Handle resetting stats
   * @private
   */
  _onResetStats(event, target) {
    const state = this.getCurrentState();
    
    if (!state.selectedArrayId) {
      ui.notifications.warn('Please select a stat array first');
      return;
    }

    const statArrays = this._getStatArrays();
    const originalValues = statArrays[state.selectedArrayId];
    
    if (!originalValues) {
      console.error('Invalid stat array ID');
      return;
    }

    // Reset to original unassigned values
    const updates = {
      'unassignedValues': [...originalValues],
      'assignedStats': {
        might: null,
        dexterity: null,
        awareness: null,
        reason: null,
        presence: null,
        luck: null
      },
      'selectedValue': null
    };

    this.stateManager.updateMultiple(updates);
  }

  /**
   * Handle stats randomization
   * @private
   */
  async _onRandomize(event, target) {
    await this.randomize();
  }

  /**
   * Randomize stats selection and optionally auto-assign
   */
  async randomize(autoAssign = false) {
    const statArrays = this._getStatArrays();
    const arrayIds = Object.keys(statArrays);
    
    if (arrayIds.length === 0) {
      ui.notifications.warn('No stat arrays available');
      return;
    }

    // Roll 1d12 to select stat array (or random if not 12 arrays)
    let selectedId;
    if (arrayIds.length === 12) {
      const roll = await new Roll("1d12").evaluate();
      selectedId = String(roll.total);
    } else {
      const randomIndex = Math.floor(Math.random() * arrayIds.length);
      selectedId = arrayIds[randomIndex];
    }

    const selectedArray = statArrays[selectedId];
    if (!selectedArray) {
      console.error('Failed to select stat array');
      return;
    }

    if (autoAssign) {
      // Auto-assign in order: Might, Dexterity, Awareness, Reason, Presence, Luck
      const statOrder = ['might', 'dexterity', 'awareness', 'reason', 'presence', 'luck'];
      const values = [...selectedArray];

      const assignedStats = {};
      statOrder.forEach((stat, index) => {
        assignedStats[stat] = values[index];
      });

      const updates = {
        'selectedArrayId': selectedId,
        'assignedStats': assignedStats,
        'unassignedValues': [],
        'selectedValue': null
      };

      this.stateManager.updateMultiple(updates);
    } else {
      // Just select array, player will assign manually
      const updates = {
        'selectedArrayId': selectedId,
        'unassignedValues': [...selectedArray],
        'assignedStats': {
          might: null,
          dexterity: null,
          awareness: null,
          reason: null,
          presence: null,
          luck: null
        },
        'selectedValue': null
      };

      this.stateManager.updateMultiple(updates);
    }
  }

  /**
   * Check if step is complete
   */
  isComplete() {
    const state = this.getCurrentState();
    const assignedStats = state.assignedStats || {};
    
    return !!state.selectedArrayId && 
           Object.values(assignedStats).every(v => v !== null && v !== undefined) &&
           (state.unassignedValues || []).length === 0;
  }

  /**
   * Reset stats step
   * @protected
   */
  _onReset() {
    const updates = {
      'selectedArrayId': null,
      'assignedStats': {
        might: null,
        dexterity: null,
        awareness: null,
        reason: null,
        presence: null,
        luck: null
      },
      'unassignedValues': [],
      'selectedValue': null
    };

    this.stateManager.updateMultiple(updates, { skipValidation: true });
  }

  /**
   * Step-specific activation logic
   * @protected
   */
  async _onActivate() {
    // Initialize stats if not already done
    const state = this.getCurrentState();
    if (!state.assignedStats) {
      this.updateState('assignedStats', {
        might: null,
        dexterity: null,
        awareness: null,
        reason: null,
        presence: null,
        luck: null
      }, { skipValidation: true });
    }

    // Collect available bonuses and update state
    const availableBonuses = await this._collectAvailableBonuses(state);
    this.updateState('availableBonuses', availableBonuses, { skipValidation: true });
  }

  /**
   * Collect available bonuses from ancestry traits and class level 1 features
   * @private
   */
  async _collectAvailableBonuses(state) {
    const bonuses = [];

    // Collect from ancestry traits
    if (state.selectedAncestry) {
      try {
        const ancestry = await fromUuid(state.selectedAncestry);
        const traits = ancestry.system.traits || [];

        for (const trait of traits) {
          const statBonusPoints = trait.statBonusPoints || 0;
          // Each stat bonus point creates individual +1 bonuses
          for (let i = 0; i < statBonusPoints; i++) {
            bonuses.push({
              bonusId: `${ancestry.uuid}-${trait.name}-${i}`,
              sourceUuid: state.selectedAncestry,
              sourceName: `${ancestry.name} - ${trait.name}`,
              sourceType: 'ancestry',
              ancestryName: ancestry.name,
              traitName: trait.name,
              sourceLabel: `${trait.name} - ${ancestry.name} Trait`,
              type: 'stat',
              amount: 1,
              condition: 'value <= 6', // Can only apply to stats 6 or less
              maxValue: 7,
              reason: `${trait.name}`
            });
          }
        }
      } catch (error) {
        console.warn('Failed to load ancestry for bonuses:', error);
      }
    }

    // Collect from class level 1 features (character creation is level 1)
    if (state.selectedClass) {
      try {
        const classItem = await fromUuid(state.selectedClass);
        const levelFeatures = classItem.system.levelFeatures || [];
        const level1Features = levelFeatures.filter(f => f.level === 1);

        for (const feature of level1Features) {
          const statBonusPoints = feature.statBonusPoints || 0;
          // Each stat bonus point creates individual +1 bonuses
          for (let i = 0; i < statBonusPoints; i++) {
            bonuses.push({
              bonusId: `${classItem.uuid}-${feature.name}-${i}`,
              sourceUuid: state.selectedClass,
              sourceName: `${classItem.name} - ${feature.name}`,
              sourceType: 'class',
              className: classItem.name,
              featureName: feature.name,
              featureLevel: feature.level,
              sourceLabel: `${classItem.name} ${feature.name} Feature (Lvl ${feature.level})`,
              type: 'stat',
              amount: 1,
              condition: 'value <= 6', // Can only apply to stats 6 or less
              maxValue: 7,
              reason: `${feature.name}`
            });
          }
        }
      } catch (error) {
        console.warn('Failed to load class for bonuses:', error);
      }
    }

    // Collect from perks (perks have bonuses at item level)
    for (const perkUuid of [...(state.perks || []), ...(state.classPerks || [])]) {
      try {
        const perk = await fromUuid(perkUuid);
        const perkBonuses = perk.system.grantedBonuses || [];

        for (const bonus of perkBonuses) {
          if (bonus.type === 'stat') {
            bonuses.push({
              bonusId: bonus.id,
              sourceUuid: perkUuid,
              sourceName: perk.name,
              type: bonus.type,
              amount: bonus.amount,
              condition: bonus.condition,
              maxValue: bonus.maxValue,
              reason: bonus.reason || perk.name,
              targetType: bonus.targetType,
              target: bonus.target
            });
          }
        }
      } catch (error) {
        console.warn('Failed to load perk for bonuses:', error);
      }
    }

    return bonuses;
  }

  /**
   * Check if a bonus condition is met for a given stat value
   * @private
   */
  _checkBonusCondition(condition, value) {
    switch (condition) {
      case 'always': return true;
      case 'value <= 6': return value <= 6;
      case 'value < 7': return value < 7;
      case 'value >= 5': return value >= 5;
      default: return false;
    }
  }

  /**
   * Get human-readable condition text
   * @private
   */
  _getConditionText(condition) {
    switch (condition) {
      case 'always': return 'No restrictions';
      case 'value <= 6': return 'Can only apply to stats ≤6';
      case 'value < 7': return 'Can only apply to stats <7';
      case 'value >= 5': return 'Can only apply to stats ≥5';
      default: return '';
    }
  }

  /**
   * Handle applying a bonus to a stat
   * @private
   */
  async _onApplyBonus(event, target) {
    const bonusId = target.dataset.bonusId;
    const stat = target.dataset.stat;
    const state = this.getCurrentState();

    // Find the bonus
    const bonus = state.availableBonuses.find(b => b.bonusId === bonusId);
    if (!bonus) {
      console.warn('Bonus not found:', bonusId);
      return;
    }

    // Validate condition
    const currentStatValue = state.assignedStats?.[stat] || 0;
    const canApply = this._checkBonusCondition(bonus.condition, currentStatValue);

    if (!canApply) {
      ui.notifications.warn(`Cannot apply ${bonus.reason} to ${stat.toUpperCase()}: condition not met`);
      return;
    }

    // Validate max value
    if (currentStatValue + bonus.amount > bonus.maxValue) {
      ui.notifications.warn(`Cannot apply ${bonus.reason}: would exceed maximum of ${bonus.maxValue}`);
      return;
    }

    // Apply bonus
    const appliedBonuses = { ...(state.appliedBonuses || {}) };
    appliedBonuses[bonusId] = { target: stat, amount: bonus.amount };

    this.updateState('appliedBonuses', appliedBonuses);
  }

  /**
   * Handle removing a bonus
   * @private
   */
  async _onRemoveBonus(event, target) {
    const bonusId = target.dataset.bonusId;
    const state = this.getCurrentState();
    const appliedBonuses = { ...state.appliedBonuses };

    delete appliedBonuses[bonusId];

    this.updateState('appliedBonuses', appliedBonuses);
  }

  /**
   * Handle applying a stat bonus via clickable button on stat slot
   * Allows reassigning the last applied bonus if no unapplied bonuses remain
   * @private
   */
  async _onApplyStatBonus(event, target) {
    console.log('[StatsStep] === applyStatBonus CALLED ===');
    console.log('[StatsStep] Event:', event);
    console.log('[StatsStep] Target:', target);
    console.log('[StatsStep] Target.dataset:', target.dataset);
    console.log('[StatsStep] Target.dataset.stat:', target.dataset.stat);
    console.log('[StatsStep] Target.value:', target.value);

    // Get stat from data attribute (button) or value (select fallback)
    const selectedStat = target.dataset.stat || target.value;

    console.log('[StatsStep] === Resolved selectedStat:', selectedStat, '===');

    if (!selectedStat) {
      console.error('[StatsStep] No stat selected! Returning early.');
      ui.notifications.warn('No stat selected for bonus application');
      return; // No stat selected
    }

    const state = this.getCurrentState();
    const availableBonuses = await this._collectAvailableBonuses(state);
    const appliedBonuses = { ...(state.appliedBonuses || {}) };
    const assignedStats = state.assignedStats || {};

    console.log('[StatsStep] Current state:', {
      availableBonuses,
      appliedBonuses,
      assignedStats,
      appliedBonusesDetails: Object.entries(appliedBonuses).map(([id, app]) => `${id} -> ${app.target}`)
    });

    // Check if bonus is already applied to the selected stat
    const alreadyAppliedToStat = Object.values(appliedBonuses).some(app => app.target === selectedStat);

    if (alreadyAppliedToStat) {
      console.log('[StatsStep] Bonus already applied to', selectedStat, '- ignoring duplicate selection');
      return;
    }

    // Find the first unapplied bonus
    let unappliedBonus = availableBonuses.find(b => !appliedBonuses[b.bonusId]);

    // If no unapplied bonuses, allow reassigning the last applied one
    let isReassignment = false;
    let lastBonusId = null;

    if (!unappliedBonus && Object.keys(appliedBonuses).length > 0) {
      // Get the last applied bonus by finding the last one in the availableBonuses order
      // This ensures deterministic behavior based on the source order (ancestry → class → perks)
      const appliedBonusIds = Object.keys(appliedBonuses);
      const sortedAppliedBonuses = availableBonuses
        .filter(b => appliedBonusIds.includes(b.bonusId))
        .sort((a, b) => {
          // Sort by the order they appear in availableBonuses array
          return availableBonuses.indexOf(b) - availableBonuses.indexOf(a);
        });

      if (sortedAppliedBonuses.length > 0) {
        lastBonusId = sortedAppliedBonuses[0].bonusId;
        unappliedBonus = availableBonuses.find(b => b.bonusId === lastBonusId);
        isReassignment = true;

        console.log('[StatsStep] Reassigning last bonus from', appliedBonuses[lastBonusId].target, 'to', selectedStat);
      }
    }

    if (!unappliedBonus) {
      ui.notifications.warn('No bonus points available');
      return;
    }

    // Validate the stat can receive the bonus
    const currentStatValue = assignedStats[selectedStat];

    if (currentStatValue === null || currentStatValue === undefined) {
      ui.notifications.warn('Please assign a value to this stat first');
      return;
    }

    // Calculate final value including already applied bonuses (excluding the one being reassigned)
    let finalValue = currentStatValue;
    for (const [bonusId, application] of Object.entries(appliedBonuses)) {
      if (application.target === selectedStat && (!isReassignment || bonusId !== lastBonusId)) {
        finalValue += application.amount;
      }
    }

    // Add the new bonus
    finalValue += unappliedBonus.amount;

    // Check if this would exceed maximum
    if (finalValue > 7) {
      ui.notifications.warn(`Cannot apply bonus: ${selectedStat.toUpperCase()} would exceed maximum (7)`);
      return;
    }

    // Check bonus condition (use base stat value)
    if (!this._checkBonusCondition(unappliedBonus.condition, currentStatValue)) {
      ui.notifications.warn(`Cannot apply bonus: ${selectedStat.toUpperCase()} does not meet the condition`);
      return;
    }

    // Apply or reassign the bonus
    appliedBonuses[unappliedBonus.bonusId] = {
      target: selectedStat,
      amount: unappliedBonus.amount
    };

    console.log('[StatsStep] Updating appliedBonuses:', appliedBonuses);
    console.log('[StatsStep] Calling updateState with appliedBonuses');

    const updateResult = this.updateState('appliedBonuses', appliedBonuses);
    console.log('[StatsStep] updateState result:', updateResult);

    // The render will be triggered by the change event handler in character-builder.mjs
  }

  /**
   * Handle removing a stat bonus via clicking the applied bonus tag
   * @private
   */
  async _onRemoveStatBonus(event, target) {
    const statToRemoveFrom = target.dataset.stat;

    console.log('[StatsStep] removeStatBonus called for stat:', statToRemoveFrom);

    if (!statToRemoveFrom) {
      console.error('[StatsStep] No stat specified for bonus removal');
      return;
    }

    const state = this.getCurrentState();
    const appliedBonuses = { ...(state.appliedBonuses || {}) };

    // Find and remove the bonus applied to this stat
    const bonusToRemove = Object.entries(appliedBonuses).find(
      ([bonusId, application]) => application.target === statToRemoveFrom
    );

    if (!bonusToRemove) {
      console.warn('[StatsStep] No bonus found applied to', statToRemoveFrom);
      return;
    }

    const [bonusIdToRemove] = bonusToRemove;
    delete appliedBonuses[bonusIdToRemove];

    console.log('[StatsStep] Removed bonus from', statToRemoveFrom);
    console.log('[StatsStep] Updated appliedBonuses:', appliedBonuses);

    this.updateState('appliedBonuses', appliedBonuses);
  }
}