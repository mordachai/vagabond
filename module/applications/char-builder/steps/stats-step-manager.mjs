/**
 * Stats Step Manager - Handles stat assignment and array selection logic
 */
import { BaseStepManager } from './base-step-manager.mjs';
import { TrainingManager, isTrainingComplete } from './training-manager.mjs';

export class StatsStepManager extends BaseStepManager {
  constructor(stateManager, dataService, configSystem) {
    super(stateManager, dataService, configSystem);

    // Training is assigned on this step too (TrainingManager owns the pools and picks)
    this.training = new TrainingManager(stateManager, dataService, configSystem);
    const trainingAction = name => (event, target) => this.training.actionHandlers[name](event, target);

    // Define action handlers for stats step
    this.actionHandlers = {
      'selectOption': this._onSelectOption.bind(this),
      'pickValue': this._onPickValue.bind(this),
      'assignStat': this._onAssignStat.bind(this),
      'unassignStat': this._onUnassignStat.bind(this), // Remove single stat value
      'resetStats': this._onResetStats.bind(this),
      'randomize': this._onRandomize.bind(this),
      'rollStatArray': this._onRollStatArray.bind(this), // Roll only the array (no assignment)
      'expandStatArrays': this._onExpandStatArrays.bind(this), // Reopen the collapsed array list
      'applyBonus': this._onApplyBonus.bind(this),
      'removeBonus': this._onRemoveBonus.bind(this),
      'applyStatBonus': this._onApplyStatBonus.bind(this), // Apply bonus via + button
      'removeStatBonus': this._onRemoveStatBonus.bind(this), // Remove bonus via tag click
      'toggleTraining': trainingAction('toggleTraining'),
      'focusSkillStat': trainingAction('focusSkillStat') // Stat label click: dim what it doesn't affect
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

  /** Returns the ordered list of stat keys from the active homebrew config. */
  _getStatKeys() {
    return (CONFIG.VAGABOND.homebrew?.stats ?? []).map(s => s.key);
  }

  /** Returns a fresh assignedStats object (all keys null) for the current stat set. */
  _makeEmptyAssignedStats() {
    return Object.fromEntries(this._getStatKeys().map(k => [k, null]));
  }

  /**
   * Get state paths managed by this step
   * @protected
   */
  _getStatePaths() {
    return ['selectedArrayId', 'assignedStats', 'unassignedValues', 'selectedValue', 'statArraysOpen'];
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
    const focus = state.skillFocusStat ?? null;

    // Collect available bonuses from ancestry, class, and perks
    const availableBonuses = await this._collectAvailableBonuses(state);
    const appliedBonuses = state.appliedBonuses || {};

    // Store bonus count in state for validation (if not already stored)
    const bonusStatsCount = availableBonuses.length;
    if (state.bonusStatsCount !== bonusStatsCount) {
      this.updateState('bonusStatsCount', bonusStatsCount);
    }

    // Get key stats from selected class
    let keyStats = [];
    if (state.selectedClass) {
      try {
        const classItem = await fromUuid(state.selectedClass);
        if (classItem && classItem.system.keyStats) {
          keyStats = classItem.system.keyStats || [];
        }
      } catch (error) {
        console.warn('Failed to load class for key stats:', error);
      }
    }

    // Prepare stat arrays for display
    const statArrayOptions = Object.entries(statArrays).map(([id, values]) => ({
      id: id,
      values: values,
      selected: String(selectedArrayId) === id,
      total: values.reduce((sum, val) => sum + val, 0)
    }));
    // Once an array is picked the list rolls up to that one row (click it to reopen)
    const selectedArray = statArrayOptions.find(a => a.selected) ?? null;
    const arraysCollapsed = !!selectedArray && !state.statArraysOpen;

    // Prepare individual stats for display with localized labels
    const statOrder = this._getStatKeys();

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

      // Calculate bonuses applied to this stat (from ancestry/class)
      const bonusesForThisStat = Object.entries(appliedBonuses)
        .filter(([bonusId, application]) => application.target === stat)
        .reduce((sum, [bonusId, application]) => sum + application.amount, 0);

      // Calculate perk bonuses for this stat
      const perkStatBonuses = state.perkStatBonuses || {};
      const perkBonus = perkStatBonuses[stat] || 0;

      const finalValue = baseValue !== null ? baseValue + bonusesForThisStat + perkBonus : null;

      // Calculate if this stat can accept bonuses based on conditions
      const canApplyBonuses = availableBonuses
        .filter(b => !appliedBonuses[b.bonusId]) // Not already applied
        .reduce((canApply, bonus) => {
          if (baseValue === null) return false;
          return canApply || this._checkBonusCondition(bonus.condition, baseValue);
        }, false);

      // Check if this is a key stat for the selected class
      const isKeyStat = keyStats.includes(stat);

      // Build hint with key stat prefix if applicable
      let hint = statHints[stat] || '';
      if (isKeyStat) {
        const keyStatLabel = game.i18n.localize('VAGABOND.Terms.KeyStat');
        hint = `${keyStatLabel}: ${hint}`;
      }

      const statData = {
        key: stat,
        label: game.i18n.localize(CONFIG.VAGABOND.stats[stat]) || stat,
        name: game.i18n.localize(CONFIG.VAGABOND.stats[stat]) || stat,
        abbreviation: game.i18n.localize(CONFIG.VAGABOND.statAbbreviations[stat]) || stat.substring(0, 3).toUpperCase(),
        value: baseValue,
        finalValue: finalValue,
        bonusAmount: bonusesForThisStat,
        perkBonus: perkBonus,
        hasPerkBonus: perkBonus > 0,
        hasBonus: bonusesForThisStat > 0,
        hasValue: baseValue !== null && baseValue !== undefined,
        hint: hint,
        canApplyBonus: canApplyBonuses,
        isKeyStat: isKeyStat,
        focused: focus === stat
      };

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
    if (derivedStats && focus) {
      const dim = entry => { if (entry?.affectedBy) entry.unfocused = !entry.affectedBy.includes(focus); };
      ['hp', 'manaMax', 'manaCast', 'luck', 'inventory', 'speed'].forEach(k => dim(derivedStats[k]));
      derivedStats.saves.forEach(dim);
    }

    // Training panel + Skill grid (TrainingManager; it reads the stats just assigned)
    const skillTraining = selectedArrayId
      ? (await this.training._prepareStepSpecificContext(this.getCurrentState()))?.skillTraining ?? null
      : null;

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
    }

    return {
      statArrays: statArrayOptions,
      statData: {  // For template compatibility
        arrays: statArrayOptions,
        selectedArray,
        arraysCollapsed,
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
      bonusStats: bonusStats, // New simplified bonus stats data
      skillTraining
    };
  }

  /**
   * Get stat arrays from configuration
   * @private
   */
  _getStatArrays() {
    // Homebrew config takes priority
    const homebrewArrays = CONFIG.VAGABOND.homebrew?.statArrays;
    if (homebrewArrays?.length) {
      return Object.fromEntries(homebrewArrays.map((arr, i) => [i + 1, arr]));
    }

    // Fall back to the char-builder config JSON
    const statsConfig = this.configSystem.getStatsConfig();
    if (statsConfig?.arrays) {
      return statsConfig.arrays;
    }

    // Last resort hardcoded fallback
    return {
      1: [5, 5, 5, 5, 3, 3], 2: [6, 5, 5, 4, 3, 3], 3: [6, 6, 4, 4, 3, 3],
      4: [6, 6, 5, 3, 3, 2], 5: [7, 5, 4, 4, 3, 3], 6: [7, 5, 5, 3, 3, 2],
      7: [7, 6, 4, 3, 3, 2], 8: [7, 7, 3, 3, 2, 2]
    };
  }

  /**
   * Prepare derived stats for preview display
   * @private
   */
  async _prepareDerivedStats(assignedStats, state) {
    // Create a preview actor with the assigned stats to get calculated values
    // Unassigned stats will default to 0 in the preview actor
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

    // Get saves from the preview actor (read from homebrew config)
    const savesAffectedBy = Object.fromEntries(
      (CONFIG.VAGABOND.homebrew?.saves ?? []).map(s => [s.key, [s.stat1, s.stat2].filter(Boolean)])
    );

    const saves = Object.entries(previewActor.system.saves).map(([key, save]) => {
      return {
        key: key,
        label: save.label,
        statAbbr: save.statAbbr || '',
        value: save.difficulty,
        tooltip: save.description,
        affectedBy: savesAffectedBy[key] || []
      };
    });

    // Get perk skills for visual indication
    const perkSkills = state.perkSkills || {};

    // Split skills into regular and weapon-attack groups for the preview panel
    const allSkillEntries = Object.entries(previewActor.system.skills);
    const skills = allSkillEntries
      .filter(([, s]) => !s.isWeaponSkill)
      .map(([key, skill]) => ({
        key: key,
        label: skill.label,
        statAbbr: game.i18n.localize(CONFIG.VAGABOND.statAbbreviations[skill.stat]) || '',
        value: skill.difficulty,
        trained: skill.trained,
        fromPerk: perkSkills[key] !== undefined,
        tooltip: game.i18n.localize(`VAGABOND.SkillsHints.${key.charAt(0).toUpperCase() + key.slice(1)}`) || skill.label,
        affectedBy: [skill.stat]
      }));
    const weaponSkills = allSkillEntries
      .filter(([, s]) => s.isWeaponSkill)
      .map(([key, skill]) => ({
        key: key,
        label: skill.label,
        statAbbr: game.i18n.localize(CONFIG.VAGABOND.statAbbreviations[skill.stat]) || '',
        value: skill.difficulty,
        trained: skill.trained,
        fromPerk: perkSkills[key] !== undefined,
        tooltip: game.i18n.localize(`VAGABOND.SkillsHints.${key.charAt(0).toUpperCase() + key.slice(1)}`) || skill.label,
        affectedBy: [skill.stat]
      }));

    return {
      hp: {
        label: 'HP',
        value: previewActor.system.health.max,
        tooltip: game.i18n.localize('VAGABOND.Hints.HP'),
        affectedBy: ['might']
      },
      isSpellcaster: isSpellcaster,
      manaMax: {
        label: 'Mana Max',
        value: previewActor.system.mana.max,
        tooltip: game.i18n.localize('VAGABOND.Hints.MaxMana'),
        affectedBy: [castingStatKey]
      },
      manaCast: {
        label: 'Mana/Cast',
        value: previewActor.system.mana.castingMax,
        tooltip: game.i18n.localize('VAGABOND.Hints.ManaPerCast'),
        affectedBy: [castingStatKey]
      },
      luck: {
        label: 'Luck Pool',
        value: previewActor.system.stats.luck.total,
        tooltip: game.i18n.localize('VAGABOND.Hints.LuckPool'),
        affectedBy: ['luck']
      },
      inventory: {
        label: 'Inventory',
        value: previewActor.system.inventory.maxSlots,
        tooltip: game.i18n.localize('VAGABOND.Hints.Inventory'),
        affectedBy: ['might']
      },
      speed: {
        label: 'Speed',
        value: previewActor.system.speed.base,
        tooltip: game.i18n.localize('VAGABOND.Hints.Speed'),
        affectedBy: ['dexterity']
      },
      saves: saves,
      skills: skills,
      weaponSkills: weaponSkills,
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

      // Apply ancestry/class bonuses
      const appliedBonuses = state.appliedBonuses || {};
      for (const [bonusId, application] of Object.entries(appliedBonuses)) {
        if (finalStats[application.target] !== null && finalStats[application.target] !== undefined) {
          finalStats[application.target] += application.amount;
        }
      }

      // Apply perk bonuses
      const perkStatBonuses = state.perkStatBonuses || {};
      for (const [stat, bonus] of Object.entries(perkStatBonuses)) {
        if (finalStats[stat] !== null && finalStats[stat] !== undefined) {
          finalStats[stat] += bonus;
        }
      }

      // Get trained skills from builder state
      const trainedSkills = state.skills || [];

      const skillsDefinition = Object.fromEntries(
        (CONFIG.VAGABOND.homebrew?.skills ?? []).map(s => [s.key, { stat: s.stat }])
      );

      const skills = {};
      for (const [key, def] of Object.entries(skillsDefinition)) {
        skills[key] = {
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
  async _onSelectOption(event, target) {
    const arrayId = target.dataset.id;
    // Same array again: just roll the list back up, keep what is placed
    if (String(this.getCurrentState().selectedArrayId) === String(arrayId)) {
      this.updateState('statArraysOpen', false, { skipValidation: true });
      return;
    }
    if (!(await this._confirmArrayChange())) return;
    this._selectArray(arrayId);
  }

  _onExpandStatArrays() {
    this.updateState('statArraysOpen', true, { skipValidation: true });
  }

  /** Changing the array wipes placed Stats: ask first when any are placed. */
  async _confirmArrayChange() {
    const placed = Object.values(this.getCurrentState().assignedStats || {}).some(v => v !== null && v !== undefined);
    if (!placed) return true;
    return !!(await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('VAGABOND.CharBuilder.Stats.ChangeArrayTitle') },
      content: `<p>${game.i18n.localize('VAGABOND.CharBuilder.Stats.ChangeArrayConfirm')}</p>`,
      rejectClose: false
    }));
  }

  /**
   * Roll 1dN (N = array count) to pick a stat array; leaves assignment to the player
   * @private
   */
  async _onRollStatArray(event, target) {
    const arrayIds = Object.keys(this._getStatArrays());
    if (!arrayIds.length) return;
    if (!(await this._confirmArrayChange())) return;
    const roll = await new Roll(`1d${arrayIds.length}`).evaluate();
    this._selectArray(arrayIds[roll.total - 1]);
  }

  /**
   * Select a stat array: its values go to the unassigned pool, assignments are cleared
   * @private
   */
  _selectArray(arrayId) {
    if (!arrayId) return;

    const statArrays = this._getStatArrays();
    const selectedArray = statArrays[arrayId];
    
    if (!selectedArray) {
      ui.notifications.error('Invalid stat array selection');
      return;
    }

    // Update state with selected array (trim to current stat count)
    const statCount = this._getStatKeys().length;
    const updates = {
      'selectedArrayId': arrayId,
      'unassignedValues': [...selectedArray].slice(0, statCount),
      'assignedStats': this._makeEmptyAssignedStats(),
      'selectedValue': null,
      'statArraysOpen': false
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

    // Reset to original unassigned values (trim to current stat count)
    const statCount = this._getStatKeys().length;
    const updates = {
      'unassignedValues': [...originalValues].slice(0, statCount),
      'assignedStats': this._makeEmptyAssignedStats(),
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
   * Randomize stats selection and auto-assign with key stat priority
   *
   * Logic:
   * - Roll 1dN (N = array count, 1d8 by default) to select stat array
   * - Sort values descending (highest first)
   * - Assign highest value to the class's key stat
   * - Assign remaining values in order: might, dex, awr, rsn, pre, luck (skipping key stat)
   */
  async randomize() {
    const statArrays = this._getStatArrays();
    const arrayIds = Object.keys(statArrays);

    if (arrayIds.length === 0) {
      ui.notifications.warn('No stat arrays available');
      return;
    }

    // Roll 1dN (N = number of arrays; 8 by default) to select the stat array
    const roll = await new Roll(`1d${arrayIds.length}`).evaluate();
    const selectedId = arrayIds[roll.total - 1];

    const selectedArray = statArrays[selectedId];
    if (!selectedArray) {
      console.error('Failed to select stat array');
      return;
    }

    // Get key stat from selected class
    const state = this.getCurrentState();
    let keyStat = null;
    if (state.selectedClass) {
      try {
        const classItem = await fromUuid(state.selectedClass);
        if (classItem && classItem.system.keyStats && classItem.system.keyStats.length > 0) {
          keyStat = classItem.system.keyStats[0]; // Use first key stat
        }
      } catch (error) {
        console.warn('Failed to load class for key stats:', error);
      }
    }

    // Sort values descending (highest first)
    const values = [...selectedArray].sort((a, b) => b - a);

    const statOrder = this._getStatKeys();
    const assignedStats = {};

    if (keyStat && statOrder.includes(keyStat)) {
      // Assign highest value to key stat
      assignedStats[keyStat] = values[0];

      // Assign remaining values to other stats in order
      let valueIndex = 1;
      for (const stat of statOrder) {
        if (stat !== keyStat) {
          assignedStats[stat] = values[valueIndex];
          valueIndex++;
        }
      }
    } else {
      // No key stat or invalid key stat - assign in order
      statOrder.forEach((stat, index) => {
        assignedStats[stat] = values[index];
      });
    }

    const updates = {
      'selectedArrayId': selectedId,
      'assignedStats': assignedStats,
      'unassignedValues': [],
      'selectedValue': null,
      'statArraysOpen': false
    };

    this.stateManager.updateMultiple(updates);

    // Auto-apply required stat bonuses (from ancestry/class)
    await this._autoApplyBonuses();

    // Training owed now that Reason is known
    await this.training.randomize();
  }

  /**
   * Auto-apply required stat bonuses during randomization
   * @private
   */
  async _autoApplyBonuses() {
    const state = this.getCurrentState();
    const availableBonuses = await this._collectAvailableBonuses(state);
    const assignedStats = state.assignedStats || {};
    const appliedBonuses = {};

    // Filter to required bonuses (targetType === 'choice')
    const requiredBonuses = availableBonuses.filter(b => b.targetType === 'choice');

    for (const bonus of requiredBonuses) {
      // Get valid targets for this bonus
      const validTargets = Object.keys(assignedStats).filter(stat => {
        const baseValue = assignedStats[stat];
        if (baseValue === null || baseValue === undefined) return false;

        // Check min/max constraints
        if (bonus.minValue !== undefined && baseValue < bonus.minValue) return false;
        if (bonus.maxValue !== undefined && (baseValue + bonus.amount) > bonus.maxValue) return false;

        return true;
      });

      if (validTargets.length > 0) {
        // Randomly select a valid target
        const randomTarget = validTargets[Math.floor(Math.random() * validTargets.length)];

        // Apply the bonus
        appliedBonuses[bonus.bonusId] = {
          target: randomTarget,
          amount: bonus.amount
        };
      }
    }

    // Update state with applied bonuses
    if (Object.keys(appliedBonuses).length > 0) {
      this.updateState('appliedBonuses', appliedBonuses);
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
           (state.unassignedValues || []).length === 0 &&
           isTrainingComplete(state);
  }

  /**
   * Reset stats step
   * @protected
   */
  _onReset() {
    const updates = {
      'selectedArrayId': null,
      'assignedStats': this._makeEmptyAssignedStats(),
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
      this.updateState('assignedStats', this._makeEmptyAssignedStats(), { skipValidation: true });
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
    // Get stat from data attribute (button) or value (select fallback)
    const selectedStat = target.dataset.stat || target.value;

    if (!selectedStat) {
      ui.notifications.warn('No stat selected for bonus application');
      return; // No stat selected
    }

    const state = this.getCurrentState();
    const availableBonuses = await this._collectAvailableBonuses(state);
    const appliedBonuses = { ...(state.appliedBonuses || {}) };
    const assignedStats = state.assignedStats || {};

    // Check if bonus is already applied to the selected stat
    const alreadyAppliedToStat = Object.values(appliedBonuses).some(app => app.target === selectedStat);

    if (alreadyAppliedToStat) {
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
    if (finalValue > (CONFIG.VAGABOND.homebrew?.statCap ?? 7)) {
      ui.notifications.warn(`Cannot apply bonus: ${selectedStat.toUpperCase()} would exceed maximum (${CONFIG.VAGABOND.homebrew?.statCap ?? 7})`);
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

    this.updateState('appliedBonuses', appliedBonuses);

    // The render will be triggered by the change event handler in character-builder.mjs
  }

  /**
   * Handle removing a stat bonus via clicking the applied bonus tag
   * @private
   */
  async _onRemoveStatBonus(event, target) {
    const statToRemoveFrom = target.dataset.stat;

    if (!statToRemoveFrom) {
      return;
    }

    const state = this.getCurrentState();
    const appliedBonuses = { ...(state.appliedBonuses || {}) };

    // Find and remove the bonus applied to this stat
    const bonusToRemove = Object.entries(appliedBonuses).find(
      ([bonusId, application]) => application.target === statToRemoveFrom
    );

    if (!bonusToRemove) {
      return;
    }

    const [bonusIdToRemove] = bonusToRemove;
    delete appliedBonuses[bonusIdToRemove];

    this.updateState('appliedBonuses', appliedBonuses);
  }
}