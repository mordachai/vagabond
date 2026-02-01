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
      'resetStats': this._onResetStats.bind(this),
      'randomize': this._onRandomize.bind(this)
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

    const statsDisplay = statOrder.map(stat => ({
      key: stat,
      label: game.i18n.localize(CONFIG.VAGABOND.stats[stat]) || stat,
      name: game.i18n.localize(CONFIG.VAGABOND.stats[stat]) || stat,
      abbreviation: game.i18n.localize(CONFIG.VAGABOND.statAbbreviations[stat]) || stat.substring(0, 3).toUpperCase(),
      value: assignedStats[stat] || null,
      hasValue: assignedStats[stat] !== null && assignedStats[stat] !== undefined,
      hint: statHints[stat] || ''
    }));

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
        game.i18n.localize('VAGABOND.CharBuilder.Instructions.Stats') : null
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

      // Build actor data with assigned stats
      const actorData = {
        name: "Preview Character",
        type: "character",
        system: {
          stats: {
            might: { value: assignedStats.might || 0 },
            dexterity: { value: assignedStats.dexterity || 0 },
            awareness: { value: assignedStats.awareness || 0 },
            reason: { value: assignedStats.reason || 0 },
            presence: { value: assignedStats.presence || 0 },
            luck: { value: assignedStats.luck || 0 }
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
    
  }
}