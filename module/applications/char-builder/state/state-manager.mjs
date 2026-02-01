/**
 * Character Builder State Manager
 * 
 * Centralizes all state management and validation logic for the character builder.
 * Provides controlled access to builder state and ensures data consistency.
 */

export class CharacterBuilderStateManager {
  constructor(configSystem = null) {
    this.configSystem = configSystem;
    this.builderData = this._initializeBuilderData();
    this.stateHistory = [];
    this.maxHistorySize = 50;
    this.changeListeners = new Map();
    
    // Budget tracking
    this.budgets = this._initializeBudgets();
  }

  /**
   * Initialize builder data with default values
   * @returns {Object} Initial builder data
   * @private
   */
  _initializeBuilderData() {
    return {
      // Core selections
      selectedAncestry: null,
      selectedClass: null,
      selectedStartingPack: null,
      
      // Stats
      selectedArrayId: null,
      assignedStats: {
        might: null,
        dexterity: null,
        awareness: null,
        reason: null,
        presence: null,
        luck: null
      },
      unassignedValues: [],
      selectedValue: null,
      
      // Skills
      skills: [],
      
      // Collections
      spells: [],
      perks: [],
      classPerks: [], // Auto-populated from class features
      gear: [],
      gearCostSpent: 0, // Total cost of selected gear in silver

      // UI state
      currentStep: 'ancestry',
      completedSteps: [],
      previewUuid: null,
      
      // Metadata
      lastClassForPerks: null,
      timestamp: Date.now()
    };
  }

  /**
   * Initialize budget tracking
   * @returns {Object} Initial budgets
   * @private
   */
  _initializeBudgets() {
    const defaultBudgets = {
      stats: { total: 27, spent: 0, remaining: 27 },
      spells: { total: 0, spent: 0, remaining: 0 },
      perks: { total: 0, spent: 0, remaining: 0 },
      gear: { total: 300, spent: 0, remaining: 300 } // Default 300 silver
    };

    // Override with configuration if available
    if (this.configSystem) {
      try {
        const validationConfig = this.configSystem.getValidationRules('budgets');
        if (validationConfig && validationConfig.default) {
          Object.assign(defaultBudgets, validationConfig.default);
        }
      } catch (error) {
        // Config not loaded yet, using defaults - this is expected during initialization
        console.debug('Configuration not yet loaded for budgets, using defaults');
      }
    }

    return defaultBudgets;
  }

  /**
   * Get current complete state
   * @returns {Object} Current builder state
   */
  getCurrentState() {
    return foundry.utils.deepClone(this.builderData);
  }

  /**
   * Update state at specified path with validation
   * @param {string} path - Dot-notation path to update
   * @param {*} value - New value
   * @param {Object} options - Update options
   * @returns {boolean} True if update was successful
   */
  updateState(path, value, options = {}) {
    const { skipValidation = false, skipHistory = false } = options;
    
    // Store current state for rollback
    const previousState = foundry.utils.deepClone(this.builderData);
    
    try {
      // Apply the change
      foundry.utils.setProperty(this.builderData, path, value);
      
      // Validate the new state unless skipped
      if (!skipValidation && !this._validateStateChange(path, value, previousState)) {
        // Rollback on validation failure
        this.builderData = previousState;
        throw new Error(`State validation failed for path: ${path}`);
      }
      
      // Update timestamp
      this.builderData.timestamp = Date.now();
      
      // Add to history unless skipped
      if (!skipHistory) {
        this._addToHistory(previousState, path, value);
      }
      
      // Notify listeners
      this._notifyStateChange(path, value, previousState);
      
      // Update derived state
      this._updateDerivedState(path, value);
      
      return true;
      
    } catch (error) {
      console.error('State update failed:', error);
      this.builderData = previousState; // Ensure rollback
      return false;
    }
  }

  /**
   * Update multiple state paths atomically
   * @param {Object} updates - Object with path-value pairs
   * @param {Object} options - Update options
   * @returns {boolean} True if all updates were successful
   */
  updateMultiple(updates, options = {}) {
    const previousState = foundry.utils.deepClone(this.builderData);
    
    try {
      // Apply all changes
      for (const [path, value] of Object.entries(updates)) {
        foundry.utils.setProperty(this.builderData, path, value);
      }
      
      // Validate the complete new state
      if (!options.skipValidation && !this._validateCompleteState()) {
        this.builderData = previousState;
        throw new Error('Batch state validation failed');
      }
      
      // Update timestamp
      this.builderData.timestamp = Date.now();
      
      // Add to history
      if (!options.skipHistory) {
        this._addToHistory(previousState, 'batch', updates);
      }
      
      // Notify listeners for each change
      for (const [path, value] of Object.entries(updates)) {
        this._notifyStateChange(path, value, previousState);
      }
      
      // Update derived state
      this._updateAllDerivedState();
      
      return true;
      
    } catch (error) {
      console.error('Batch state update failed:', error);
      this.builderData = previousState;
      return false;
    }
  }

  /**
   * Reset specific step data
   * @param {string} stepName - Name of step to reset
   * @returns {boolean} True if reset was successful
   */
  resetStep(stepName) {
    const resetMap = {
      ancestry: () => {
        this.updateState('selectedAncestry', null);
      },
      class: () => {
        this.updateMultiple({
          'selectedClass': null,
          'skills': [],
          'classPerks': [],
          'lastClassForPerks': null
        });
      },
      stats: () => {
        this.updateMultiple({
          'selectedArrayId': null,
          'assignedStats': {
            might: null, dexterity: null, awareness: null,
            reason: null, presence: null, luck: null
          },
          'unassignedValues': [],
          'selectedValue': null
        });
      },
      spells: () => {
        this.updateState('spells', []);
      },
      perks: () => {
        this.updateState('perks', []);
      },
      'starting-packs': () => {
        this.updateState('selectedStartingPack', null);
      },
      gear: () => {
        this.updateState('gear', []);
      }
    };

    const resetFunction = resetMap[stepName];
    if (resetFunction) {
      try {
        resetFunction();
        this._removeFromCompletedSteps(stepName);
        return true;
      } catch (error) {
        console.error(`Failed to reset step ${stepName}:`, error);
        return false;
      }
    }
    
    console.warn(`Unknown step name for reset: ${stepName}`);
    return false;
  }

  /**
   * Calculate current budgets based on state
   * @returns {Object} Current budget status
   */
  calculateBudgets() {
    const budgets = foundry.utils.deepClone(this.budgets);
    
    // Calculate stats budget (if using point buy)
    budgets.stats.spent = this._calculateStatsBudgetSpent();
    budgets.stats.remaining = budgets.stats.total - budgets.stats.spent;
    
    // Calculate spells budget (based on class level and features)
    budgets.spells.total = this._calculateSpellsTotal();
    budgets.spells.spent = this.builderData.spells.length;
    budgets.spells.remaining = budgets.spells.total - budgets.spells.spent;
    
    // Calculate gear budget (based on starting pack or default)
    budgets.gear.total = this._calculateGearTotal();
    budgets.gear.spent = this._calculateGearSpent();
    budgets.gear.remaining = budgets.gear.total - budgets.gear.spent;
    
    return budgets;
  }

  /**
   * Check if step is complete
   * @param {string} stepName - Name of step to check
   * @returns {boolean} True if step is complete
   */
  isStepComplete(stepName) {
    const completionMap = {
      ancestry: () => !!this.builderData.selectedAncestry,
      class: () => !!this.builderData.selectedClass,
      stats: () => {
        return !!this.builderData.selectedArrayId && 
               Object.values(this.builderData.assignedStats).every(v => v !== null);
      },
      spells: () => {
        // Optional step, always complete unless over limit
        const budgets = this.calculateBudgets();
        return budgets.spells.remaining >= 0;
      },
      perks: () => true, // Optional step
      'starting-packs': () => true, // Optional step
      gear: () => {
        // Optional step, but check budget if items selected
        if (this.builderData.gear.length === 0) return true;
        const budgets = this.calculateBudgets();
        return budgets.gear.remaining >= 0;
      }
    };

    const checkFunction = completionMap[stepName];
    return checkFunction ? checkFunction() : false;
  }

  /**
   * Get step completion status for all steps
   * @returns {Object} Completion status for each step
   */
  getStepProgress() {
    const stepOrder = this.configSystem?.getStepOrder() || 
                     ['ancestry', 'class', 'stats', 'spells', 'perks', 'starting-packs', 'gear'];
    
    const progress = {};
    for (const stepName of stepOrder) {
      progress[stepName] = {
        complete: this.isStepComplete(stepName),
        required: this._isStepRequired(stepName)
      };
    }
    
    return progress;
  }

  /**
   * Add state change listener
   * @param {string} path - Path to listen for changes (supports wildcards)
   * @param {Function} callback - Callback function
   * @returns {string} Listener ID for removal
   */
  addChangeListener(path, callback) {
    const listenerId = `${path}_${Date.now()}_${Math.random()}`;
    
    if (!this.changeListeners.has(path)) {
      this.changeListeners.set(path, new Map());
    }
    
    this.changeListeners.get(path).set(listenerId, callback);
    return listenerId;
  }

  /**
   * Remove state change listener
   * @param {string} listenerId - Listener ID returned by addChangeListener
   */
  removeChangeListener(listenerId) {
    for (const [path, listeners] of this.changeListeners) {
      if (listeners.has(listenerId)) {
        listeners.delete(listenerId);
        if (listeners.size === 0) {
          this.changeListeners.delete(path);
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Undo last state change
   * @returns {boolean} True if undo was successful
   */
  undo() {
    if (this.stateHistory.length === 0) return false;
    
    const lastState = this.stateHistory.pop();
    this.builderData = foundry.utils.deepClone(lastState.state);
    this.builderData.timestamp = Date.now();
    
    // Notify listeners of undo
    this._notifyStateChange('*', null, null, { isUndo: true });
    
    return true;
  }

  /**
   * Clear all state and reset to initial values
   */
  reset() {
    const previousState = foundry.utils.deepClone(this.builderData);
    this.builderData = this._initializeBuilderData();
    this.budgets = this._initializeBudgets();
    this.stateHistory = [];
    
    this._notifyStateChange('*', null, previousState, { isReset: true });
  }

  /**
   * Validate state change
   * @param {string} path - Path that changed
   * @param {*} value - New value
   * @param {Object} previousState - Previous state
   * @returns {boolean} True if valid
   * @private
   */
  _validateStateChange(path, value, previousState) {
    // Basic validation rules
    if (path === 'selectedAncestry' || path === 'selectedClass' || path === 'selectedStartingPack') {
      return value === null || (typeof value === 'string' && value.length > 0);
    }
    
    if (path === 'selectedArrayId') {
      return value === null || (typeof value === 'string' && /^[1-9]|1[0-2]$/.test(value));
    }
    
    if (path.startsWith('assignedStats.')) {
      return value === null || (typeof value === 'number' && value >= 2 && value <= 8);
    }
    
    if (path === 'spells' || path === 'perks' || path === 'gear' || path === 'skills') {
      return Array.isArray(value);
    }
    
    if (path === 'currentStep') {
      const validSteps = this.configSystem?.getStepOrder() || 
                        ['ancestry', 'class', 'stats', 'spells', 'perks', 'starting-packs', 'gear'];
      return validSteps.includes(value);
    }
    
    return true; // Allow other changes
  }

  /**
   * Validate complete state
   * @returns {boolean} True if state is valid
   * @private
   */
  _validateCompleteState() {
    // Check required fields
    if (this.builderData.selectedAncestry && typeof this.builderData.selectedAncestry !== 'string') {
      return false;
    }
    
    if (this.builderData.selectedClass && typeof this.builderData.selectedClass !== 'string') {
      return false;
    }
    
    // Check arrays
    if (!Array.isArray(this.builderData.spells) || 
        !Array.isArray(this.builderData.perks) || 
        !Array.isArray(this.builderData.gear) || 
        !Array.isArray(this.builderData.skills)) {
      return false;
    }
    
    // Check stats object structure
    const requiredStats = ['might', 'dexterity', 'awareness', 'reason', 'presence', 'luck'];
    for (const stat of requiredStats) {
      if (!(stat in this.builderData.assignedStats)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Update derived state based on changes
   * @param {string} path - Path that changed
   * @param {*} value - New value
   * @private
   */
  _updateDerivedState(path, value) {
    // Update completed steps
    if (path.startsWith('selected') || path.startsWith('assignedStats')) {
      this._updateCompletedSteps();
    }
    
    // Update budgets when relevant changes occur
    if (path === 'selectedClass' || path === 'selectedStartingPack' || 
        path === 'spells' || path === 'gear') {
      this.budgets = this.calculateBudgets();
    }
  }

  /**
   * Update all derived state
   * @private
   */
  _updateAllDerivedState() {
    this._updateCompletedSteps();
    this.budgets = this.calculateBudgets();
  }

  /**
   * Update completed steps based on current state
   * @private
   */
  _updateCompletedSteps() {
    const stepOrder = this.configSystem?.getStepOrder() || 
                     ['ancestry', 'class', 'stats', 'spells', 'perks', 'starting-packs', 'gear'];
    
    this.builderData.completedSteps = stepOrder.filter(step => this.isStepComplete(step));
  }

  /**
   * Remove step from completed steps
   * @param {string} stepName - Step to remove
   * @private
   */
  _removeFromCompletedSteps(stepName) {
    const index = this.builderData.completedSteps.indexOf(stepName);
    if (index > -1) {
      this.builderData.completedSteps.splice(index, 1);
    }
  }

  /**
   * Check if step is required
   * @param {string} stepName - Step name
   * @returns {boolean} True if required
   * @private
   */
  _isStepRequired(stepName) {
    const requiredSteps = ['ancestry', 'class', 'stats'];
    return requiredSteps.includes(stepName);
  }

  /**
   * Add state to history
   * @param {Object} state - Previous state
   * @param {string} path - Changed path
   * @param {*} value - New value
   * @private
   */
  _addToHistory(state, path, value) {
    this.stateHistory.push({
      state: foundry.utils.deepClone(state),
      path,
      value,
      timestamp: Date.now()
    });
    
    // Limit history size
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }
  }

  /**
   * Notify state change listeners
   * @param {string} path - Changed path
   * @param {*} value - New value
   * @param {Object} previousState - Previous state
   * @param {Object} metadata - Additional metadata
   * @private
   */
  _notifyStateChange(path, value, previousState, metadata = {}) {
    // Notify exact path listeners
    if (this.changeListeners.has(path)) {
      for (const callback of this.changeListeners.get(path).values()) {
        try {
          callback(path, value, previousState, metadata);
        } catch (error) {
          console.error('State change listener error:', error);
        }
      }
    }
    
    // Notify wildcard listeners
    if (this.changeListeners.has('*')) {
      for (const callback of this.changeListeners.get('*').values()) {
        try {
          callback(path, value, previousState, metadata);
        } catch (error) {
          console.error('Wildcard state change listener error:', error);
        }
      }
    }
  }

  /**
   * Calculate stats budget spent (for point buy systems)
   * @returns {number} Points spent
   * @private
   */
  _calculateStatsBudgetSpent() {
    // For array-based system, no budget is spent
    // This would be used for point-buy systems
    return 0;
  }

  /**
   * Calculate total spells available
   * @returns {number} Total spells available
   * @private
   */
  _calculateSpellsTotal() {
    // This would be calculated based on class and level
    // For now, return 0 for non-spellcasters
    return 0;
  }

  /**
   * Calculate total gear budget
   * @returns {number} Total gear budget in silver
   * @private
   */
  _calculateGearTotal() {
    // Default budget or starting pack budget
    return this.budgets.gear.total;
  }

  /**
   * Calculate gear budget spent
   * @returns {number} Gear budget spent in silver
   * @private
   */
  _calculateGearSpent() {
    // Return the tracked cost from state
    return this.builderData.gearCostSpent || 0;
  }
}