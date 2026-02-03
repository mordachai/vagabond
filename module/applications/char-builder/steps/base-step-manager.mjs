/**
 * Base Step Manager - Foundation for all character creation step managers
 * Provides common functionality and interface for step-specific implementations
 */
export class BaseStepManager {
  constructor(stateManager, dataService, configSystem) {
    this.stateManager = stateManager;
    this.dataService = dataService;
    this.configSystem = configSystem;

    // Step-specific configuration (will be null if config not loaded yet)
    try {
      this.config = this.configSystem.getStepConfig(this.stepName);
    } catch (error) {
      console.warn(`Configuration not yet loaded for step ${this.stepName}, using defaults`);
      this.config = null;
    }

    // Action handlers map - to be defined by subclasses
    // Removed this.actionHandlers = {}; initialization from parent constructor
    
    // Required data types - to be defined by subclasses
    this.requiredData = [];
  }

  /**
   * Step name - must be overridden by subclasses
   * @returns {string} The step name
   */
  get stepName() {
    throw new Error('stepName must be implemented by subclass');
  }

  /**
   * Activate the step - prepare data and validate prerequisites
   * @returns {Promise<boolean>} True if step can be activated
   */
  async activate() {
    try {
      // Ensure required data is loaded
      await this.dataService.ensureDataLoaded(this.requiredData);
      
      // Validate prerequisites
      const prerequisiteResult = this.validatePrerequisites();
      if (!prerequisiteResult.isValid) {
        console.warn(`Step ${this.stepName} prerequisites not met:`, prerequisiteResult.errors);
        return false;
      }
      
      // Perform step-specific activation
      await this._onActivate();
      
      return true;
    } catch (error) {
      console.error(`Failed to activate step ${this.stepName}:`, error);
      return false;
    }
  }

  /**
   * Handle user actions for this step
   * @param {string} action - The action name
   * @param {Event} event - The DOM event
   * @param {HTMLElement} target - The target element
   * @returns {Promise<any>} Action result
   */
  async handleAction(action, event, target) {
    
    const handler = this.actionHandlers[action];
    if (!handler) {
      throw new Error(`Unknown action '${action}' for step '${this.stepName}'`);
    }
    
    try {
      return await handler.call(this, event, target);
    } catch (error) {
      console.error(`Error handling action '${action}' in step '${this.stepName}':`, error);
      throw error;
    }
  }

  /**
   * Validate step prerequisites
   * @returns {Object} Validation result with isValid and errors
   */
  validatePrerequisites() {
    const state = this.stateManager.getCurrentState();
    return this.stateManager.validationEngine.validatePrerequisites(this.stepName, state);
  }

  /**
   * Check if step is complete
   * @returns {boolean} True if step is complete
   */
  isComplete() {
    const state = this.stateManager.getCurrentState();
    const validationResult = this.stateManager.validationEngine.validateStepCompletion(this.stepName, state);
    return validationResult.isValid;
  }

  /**
   * Get step-specific data for rendering
   * @returns {Promise<Object>} Step data for context preparation
   */
  async getStepData() {
    const state = this.stateManager.getCurrentState();
    return {
      stepName: this.stepName,
      isComplete: this.isComplete(),
      state: state,
      config: this.config
    };
  }

  /**
   * Reset step to initial state
   */
  reset() {
    // Get step-specific state paths to reset
    const pathsToReset = this._getStatePaths();
    
    for (const path of pathsToReset) {
      this.stateManager.updateState(path, null, { skipValidation: true });
    }
    
    // Perform step-specific reset
    this._onReset();
  }

  /**
   * Prepare context for step rendering
   * @param {Object} state - Current builder state
   * @param {Object} options - Additional options (e.g., openCategories)
   * @returns {Promise<Object>} Context data for rendering
   */
  async prepareStepContext(state, options = {}) {
    const specificContext = await this._prepareStepSpecificContext(state, options.openCategories);

    return {
      stepName: this.stepName,
      isComplete: this.isComplete(),
      config: this.config,
      ...specificContext
    };
  }

  // Protected methods to be overridden by subclasses

  /**
   * Step-specific activation logic
   * @protected
   */
  async _onActivate() {
    // Override in subclasses
  }

  /**
   * Step-specific reset logic
   * @protected
   */
  _onReset() {
    // Override in subclasses
  }

  /**
   * Get state paths managed by this step
   * @protected
   * @returns {Array<string>} Array of state paths
   */
  _getStatePaths() {
    // Override in subclasses to specify which state paths this step manages
    return [];
  }

  /**
   * Prepare step-specific context data
   * @protected
   * @param {Object} state - Current builder state
   * @param {Set} openCategories - Set of open category IDs (optional)
   * @returns {Promise<Object>} Step-specific context
   */
  async _prepareStepSpecificContext(state, openCategories) {
    // Override in subclasses
    return {};
  }

  // Utility methods

  /**
   * Update state through state manager
   * @param {string} path - State path to update
   * @param {any} value - New value
   * @param {Object} options - Update options
   * @returns {boolean} True if update was successful
   */
  updateState(path, value, options = {}) {
    const result = this.stateManager.updateState(path, value, options);
    if (!result) {
      console.error(`Failed to update state path '${path}' in step ${this.stepName}`);
    }
    return result;
  }

  /**
   * Get current state
   * @returns {Object} Current builder state
   */
  getCurrentState() {
    return this.stateManager.getCurrentState();
  }

  /**
   * Get data from data service
   * @param {string} type - Data type
   * @param {string} id - Item ID
   * @returns {Object|null} Data item
   */
  getData(type, id) {
    const methodName = `get${type.charAt(0).toUpperCase() + type.slice(1)}`;
    if (typeof this.dataService[methodName] === 'function') {
      return this.dataService[methodName](id);
    }
    return null;
  }

  /**
   * Get filtered data from data service
   * @param {string} type - Data type
   * @param {Object} filters - Filter criteria
   * @returns {Array} Filtered data items
   */
  getFilteredData(type, filters = {}) {
    return this.dataService.getFilteredItems(type, filters);
  }

    /**

     * Randomize selection for this step

     * @returns {Promise<void>}

     */

    async randomize() {

      // Default implementation - override in subclasses

      console.warn(`Randomization not implemented for step ${this.stepName}`);

    }

  

    /**

     * Collect required spells from ancestry traits, class level 1 features, and perks

     * @protected

     */

    async _collectRequiredSpells(state) {

      const requiredSpells = new Set();

  

      // From ancestry traits

      if (state.selectedAncestry) {

        try {

          const ancestry = await fromUuid(state.selectedAncestry);

          const traits = ancestry.system.traits || [];

          for (const trait of traits) {

            (trait.requiredSpells || []).forEach(uuid => {

              if (uuid) requiredSpells.add(uuid);

            });

          }

        } catch (error) {

          console.warn('Failed to load ancestry for required spells:', error);

        }

      }

  

      // From class level 1 features

      if (state.selectedClass) {

        try {

          const classItem = await fromUuid(state.selectedClass);

          const levelFeatures = classItem.system.levelFeatures || [];

          const level1Features = levelFeatures.filter(f => f.level === 1);

          for (const feature of level1Features) {

            (feature.requiredSpells || []).forEach(uuid => {

              if (uuid) requiredSpells.add(uuid);

            });

          }

        } catch (error) {

          console.warn('Failed to load class for required spells:', error);

        }

      }

  

      // From perks (perks have requiredSpells at item level)

      for (const perkUuid of [...(state.perks || []), ...(state.classPerks || [])]) {

        try {

          const perk = await fromUuid(perkUuid);

          if (perk) {

            (perk.system.requiredSpells || []).forEach(uuid => {

              if (uuid) requiredSpells.add(uuid);

            });

          }

        } catch (error) {

          console.warn('Failed to load perk for required spells:', error);

        }

      }

  

      return Array.from(requiredSpells);

    }

  }

  