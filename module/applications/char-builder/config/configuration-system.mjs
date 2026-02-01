/**
 * Configuration System for Character Builder
 * 
 * Centralizes all hardcoded values and rules in external configuration files,
 * allowing behavior modification without code changes.
 */

export class ConfigurationSystem {
  constructor() {
    this.configs = new Map();
    this.schemas = new Map();
    this.loaded = false;
    
    // Initialize schemas for validation
    this._initializeSchemas();
  }

  /**
   * Load all configuration files
   * @returns {Promise<void>}
   */
  async loadConfigurations() {
    if (this.loaded) return;

    try {
      // Load all configuration files
      await Promise.all([
        this._loadStepConfig(),
        this._loadStatsConfig(),
        this._loadValidationConfig(),
        this._loadRandomizationConfig(),
        this._loadUIConfig()
      ]);

      this.loaded = true;
    } catch (error) {
      console.error('Failed to load character builder configurations:', error);
      throw new Error(`Configuration loading failed: ${error.message}`);
    }
  }

  /**
   * Get step configuration
   * @param {string} stepName - Name of the step
   * @returns {Object} Step configuration
   */
  getStepConfig(stepName) {
    this._ensureLoaded();
    const stepsConfig = this.configs.get('steps');
    return stepsConfig?.steps?.[stepName] || null;
  }

  /**
   * Get all step configurations
   * @returns {Object} All step configurations
   */
  getAllStepConfigs() {
    this._ensureLoaded();
    return this.configs.get('steps')?.steps || {};
  }

  /**
   * Get step order
   * @returns {Array<string>} Ordered array of step names
   */
  getStepOrder() {
    this._ensureLoaded();
    return this.configs.get('steps')?.order || [];
  }

  /**
   * Get stat arrays configuration
   * @returns {Object} Stat arrays indexed by roll result
   */
  getStatArrays() {
    this._ensureLoaded();
    return this.configs.get('stats')?.arrays || {};
  }

  /**
   * Get stat configuration
   * @returns {Object} Complete stats configuration
   */
  getStatsConfig() {
    this._ensureLoaded();
    return this.configs.get('stats') || {};
  }

  /**
   * Get validation rules for a specific type
   * @param {string} type - Type of validation rules
   * @returns {Array} Validation rules
   */
  getValidationRules(type) {
    this._ensureLoaded();
    const validationConfig = this.configs.get('validation');
    return validationConfig?.rules?.[type] || [];
  }

  /**
   * Get step prerequisites
   * @param {string} stepName - Name of the step
   * @returns {Array} Prerequisites for the step
   */
  getStepPrerequisites(stepName) {
    this._ensureLoaded();
    const validationConfig = this.configs.get('validation');
    return validationConfig?.prerequisites?.[stepName] || [];
  }

  /**
   * Get randomization weights for a step
   * @param {string} stepName - Name of the step
   * @returns {Object} Randomization configuration
   */
  getRandomizationConfig(stepName) {
    this._ensureLoaded();
    const randomConfig = this.configs.get('randomization');
    return randomConfig?.steps?.[stepName] || {};
  }

  /**
   * Get UI configuration
   * @param {string} section - UI section name
   * @returns {Object} UI configuration
   */
  getUIConfig(section) {
    this._ensureLoaded();
    const uiConfig = this.configs.get('ui');
    return section ? uiConfig?.[section] : uiConfig;
  }

  /**
   * Validate configuration against schema
   * @param {string} configType - Type of configuration
   * @param {Object} config - Configuration to validate
   * @returns {boolean} True if valid
   */
  validateConfig(configType, config) {
    const schema = this.schemas.get(configType);
    if (!schema) {
      console.warn(`No schema found for config type: ${configType}`);
      return true; // Allow if no schema
    }

    return this._validateAgainstSchema(config, schema);
  }

  /**
   * Reload configurations (for hot-reloading)
   * @returns {Promise<void>}
   */
  async reloadConfigurations() {
    this.configs.clear();
    this.loaded = false;
    await this.loadConfigurations();
  }

  /**
   * Initialize validation schemas
   * @private
   */
  _initializeSchemas() {
    // Step configuration schema
    this.schemas.set('steps', {
      type: 'object',
      required: ['order', 'steps'],
      properties: {
        order: { type: 'array', items: { type: 'string' } },
        steps: {
          type: 'object',
          patternProperties: {
            '^[a-z-]+$': {
              type: 'object',
              required: ['displayName', 'order'],
              properties: {
                displayName: { type: 'string' },
                order: { type: 'number' },
                requiredData: { type: 'array', items: { type: 'string' } },
                actions: { type: 'array', items: { type: 'string' } },
                completionCriteria: { type: 'array' }
              }
            }
          }
        }
      }
    });

    // Stats configuration schema
    this.schemas.set('stats', {
      type: 'object',
      required: ['arrays'],
      properties: {
        arrays: {
          type: 'object',
          patternProperties: {
            '^[0-9]+$': {
              type: 'array',
              items: { type: 'number', minimum: 1, maximum: 8 },
              minItems: 6,
              maxItems: 6
            }
          }
        },
        statNames: { type: 'array', items: { type: 'string' } },
        defaultBudget: { type: 'number', minimum: 0 }
      }
    });

    // Validation configuration schema
    this.schemas.set('validation', {
      type: 'object',
      properties: {
        rules: { type: 'object' },
        prerequisites: { type: 'object' }
      }
    });

    // Randomization configuration schema
    this.schemas.set('randomization', {
      type: 'object',
      properties: {
        steps: { type: 'object' },
        weights: { type: 'object' }
      }
    });

    // UI configuration schema
    this.schemas.set('ui', {
      type: 'object',
      properties: {
        layout: { type: 'object' },
        styling: { type: 'object' },
        behavior: { type: 'object' }
      }
    });
  }

  /**
   * Load step configuration
   * @private
   */
  async _loadStepConfig() {
    try {
      const response = await fetch('systems/vagabond/module/applications/char-builder/config/steps.json');
      if (!response.ok) {
        throw new Error(`Failed to load steps.json: ${response.status}`);
      }
      const config = await response.json();

      if (this.validateConfig('steps', config)) {
        this.configs.set('steps', config);
      } else {
        throw new Error('Invalid step configuration');
      }
    } catch (error) {
      console.error('Failed to load step configuration:', error);
      // Fallback to hardcoded config
      this._loadStepConfigFallback();
    }
  }

  /**
   * Fallback step configuration (hardcoded)
   * @private
   */
  _loadStepConfigFallback() {
    const config = {
      order: ['ancestry', 'class', 'stats', 'spells', 'perks', 'starting-packs', 'gear'],
      steps: {
        ancestry: {
          displayName: 'Choose Ancestry',
          order: 1,
          requiredData: ['ancestries', 'ancestryFeatures'],
          actions: ['select-ancestry', 'randomize-ancestry', 'view-details'],
          completionCriteria: [
            { type: 'has_selection', path: 'selectedAncestry' }
          ]
        },
        class: {
          displayName: 'Choose Class',
          order: 2,
          requiredData: ['classes', 'classFeatures'],
          actions: ['select-class', 'randomize-class', 'view-details', 'toggle-skill'],
          completionCriteria: [
            { type: 'has_selection', path: 'selectedClass' }
          ]
        },
        stats: {
          displayName: 'Assign Stats',
          order: 3,
          requiredData: [],
          actions: ['pick-array', 'assign-stat', 'reset-stats', 'randomize-stats'],
          completionCriteria: [
            { type: 'has_selection', path: 'selectedArrayId' },
            { type: 'all_stats_assigned' }
          ]
        },
        spells: {
          displayName: 'Choose Spells',
          order: 4,
          requiredData: ['spells'],
          actions: ['add-to-tray', 'remove-from-tray', 'clear-tray', 'randomize-spells'],
          completionCriteria: [
            { type: 'within_spell_limit' }
          ]
        },
        perks: {
          displayName: 'Choose Perks',
          order: 5,
          requiredData: ['perks'],
          actions: ['add-to-tray', 'remove-from-tray', 'clear-tray', 'toggle-show-all'],
          completionCriteria: [
            { type: 'optional' }
          ]
        },
        'starting-packs': {
          displayName: 'Choose Starting Pack',
          order: 6,
          requiredData: ['startingPacks'],
          actions: ['select-starting-pack', 'remove-starting-pack', 'randomize-starting-pack'],
          completionCriteria: [
            { type: 'optional' }
          ]
        },
        gear: {
          displayName: 'Choose Gear',
          order: 7,
          requiredData: ['equipment'],
          actions: ['add-to-tray', 'remove-from-tray', 'clear-tray'],
          completionCriteria: [
            { type: 'within_budget' }
          ]
        }
      }
    };

    this.configs.set('steps', config);
  }

  /**
   * Load stats configuration
   * @private
   */
  async _loadStatsConfig() {
    try {
      const response = await fetch('systems/vagabond/module/applications/char-builder/config/stats.json');
      if (!response.ok) {
        throw new Error(`Failed to load stats.json: ${response.status}`);
      }
      const config = await response.json();

      if (this.validateConfig('stats', config)) {
        this.configs.set('stats', config);
      } else {
        throw new Error('Invalid stats configuration');
      }
    } catch (error) {
      console.error('Failed to load stats configuration:', error);
      // Fallback to hardcoded config
      this._loadStatsConfigFallback();
    }
  }

  /**
   * Fallback stats configuration (hardcoded)
   * @private
   */
  _loadStatsConfigFallback() {
    const config = {
      arrays: {
        1: [5, 5, 5, 4, 4, 3],
        2: [5, 5, 5, 5, 3, 2],
        3: [6, 5, 4, 4, 4, 3],
        4: [6, 5, 5, 4, 3, 2],
        5: [6, 6, 4, 3, 3, 3],
        6: [6, 6, 4, 4, 3, 2],
        7: [6, 6, 5, 3, 2, 2],
        8: [7, 4, 4, 4, 4, 2],
        9: [7, 4, 4, 4, 3, 3],
        10: [7, 5, 4, 3, 3, 2],
        11: [7, 5, 5, 2, 2, 2],
        12: [7, 6, 4, 2, 2, 2]
      },
      statNames: ['might', 'dexterity', 'awareness', 'reason', 'presence', 'luck'],
      defaultBudget: 27,
      calculations: {
        pointBuy: {
          enabled: false,
          costs: {
            3: -1, 4: 0, 5: 1, 6: 2, 7: 4, 8: 7
          }
        }
      }
    };

    this.configs.set('stats', config);
  }

  /**
   * Load validation configuration
   * @private
   */
  async _loadValidationConfig() {
    try {
      const response = await fetch('systems/vagabond/module/applications/char-builder/config/validation.json');
      if (!response.ok) {
        throw new Error(`Failed to load validation.json: ${response.status}`);
      }
      const config = await response.json();

      if (this.validateConfig('validation', config)) {
        this.configs.set('validation', config);
      } else {
        throw new Error('Invalid validation configuration');
      }
    } catch (error) {
      console.error('Failed to load validation configuration:', error);
      // Fallback to hardcoded config
      this._loadValidationConfigFallback();
    }
  }

  /**
   * Fallback validation configuration (hardcoded)
   * @private
   */
  _loadValidationConfigFallback() {
    const config = {
      rules: {
        ancestry_selection: [
          { type: 'required', message: 'Ancestry selection is required' }
        ],
        class_selection: [
          { type: 'required', message: 'Class selection is required' }
        ],
        stat_assignment: [
          { type: 'all_assigned', message: 'All stats must be assigned' },
          { type: 'valid_values', message: 'Stat values must be from selected array' }
        ],
        spell_selection: [
          { type: 'within_limit', message: 'Cannot exceed spell limit for class level' },
          { type: 'valid_spells', message: 'Selected spells must be valid' }
        ],
        perk_selection: [
          { type: 'prerequisites_met', message: 'Perk prerequisites must be met' }
        ],
        gear_selection: [
          { type: 'within_budget', message: 'Gear selection must be within budget' }
        ]
      },
      prerequisites: {
        ancestry: [],
        class: [
          { type: 'step_complete', step: 'ancestry' }
        ],
        stats: [
          { type: 'step_complete', step: 'ancestry' },
          { type: 'step_complete', step: 'class' }
        ],
        spells: [
          { type: 'step_complete', step: 'stats' }
        ],
        perks: [
          { type: 'step_complete', step: 'stats' }
        ],
        'starting-packs': [
          { type: 'step_complete', step: 'stats' }
        ],
        gear: [
          { type: 'step_complete', step: 'stats' }
        ]
      }
    };

    this.configs.set('validation', config);
  }

  /**
   * Load randomization configuration
   * @private
   */
  async _loadRandomizationConfig() {
    try {
      const response = await fetch('systems/vagabond/module/applications/char-builder/config/randomization.json');
      if (!response.ok) {
        throw new Error(`Failed to load randomization.json: ${response.status}`);
      }
      const config = await response.json();

      if (this.validateConfig('randomization', config)) {
        this.configs.set('randomization', config);
      } else {
        throw new Error('Invalid randomization configuration');
      }
    } catch (error) {
      console.error('Failed to load randomization configuration:', error);
      // Fallback to hardcoded config
      this._loadRandomizationConfigFallback();
    }
  }

  /**
   * Fallback randomization configuration (hardcoded)
   * @private
   */
  _loadRandomizationConfigFallback() {
    const config = {
      steps: {
        ancestry: {
          enabled: true,
          weights: 'equal', // or specific weight object
          excludeRare: false
        },
        class: {
          enabled: true,
          weights: 'equal',
          excludeRare: false
        },
        stats: {
          enabled: true,
          arrayWeights: 'equal',
          autoAssign: false
        },
        spells: {
          enabled: true,
          fillToLimit: true,
          preferDamage: false
        },
        'starting-packs': {
          enabled: true,
          weights: 'equal'
        }
      },
      fullCharacter: {
        enabled: true,
        steps: ['ancestry', 'class', 'stats', 'spells', 'starting-packs'],
        autoAssignStats: true
      }
    };

    this.configs.set('randomization', config);
  }

  /**
   * Load UI configuration
   * @private
   */
  async _loadUIConfig() {
    try {
      const response = await fetch('systems/vagabond/module/applications/char-builder/config/ui.json');
      if (!response.ok) {
        throw new Error(`Failed to load ui.json: ${response.status}`);
      }
      const config = await response.json();

      if (this.validateConfig('ui', config)) {
        this.configs.set('ui', config);
      } else {
        throw new Error('Invalid UI configuration');
      }
    } catch (error) {
      console.error('Failed to load UI configuration:', error);
      // Fallback to hardcoded config
      this._loadUIConfigFallback();
    }
  }

  /**
   * Fallback UI configuration (hardcoded)
   * @private
   */
  _loadUIConfigFallback() {
    const config = {
      layout: {
        windowSize: { width: 1100, height: 850 },
        columns: {
          single: ['ancestry', 'stats', 'starting-packs', 'gear'],
          triple: ['class', 'perks', 'spells']
        },
        traySteps: ['perks', 'spells', 'gear'],
        maxTrayItems: 8
      },
      styling: {
        dragDropHighlight: '#4a90e2',
        errorColor: '#e74c3c',
        successColor: '#27ae60',
        warningColor: '#f39c12'
      },
      behavior: {
        autoPreview: true,
        confirmClearTray: true,
        showPrerequisiteWarnings: true,
        allowOverBudget: true,
        searchEnabled: true
      },
      performance: {
        debounceSearch: 300,
        maxConcurrentLoads: 5,
        cacheTimeout: 300000 // 5 minutes
      }
    };

    this.configs.set('ui', config);
  }

  /**
   * Ensure configurations are loaded
   * @private
   */
  _ensureLoaded() {
    if (!this.loaded) {
      throw new Error('Configurations not loaded. Call loadConfigurations() first.');
    }
  }

  /**
   * Simple schema validation
   * @param {Object} data - Data to validate
   * @param {Object} schema - Schema to validate against
   * @returns {boolean} True if valid
   * @private
   */
  _validateAgainstSchema(data, schema) {
    // Basic validation - in a real implementation, use a proper JSON schema validator
    if (schema.type === 'object') {
      if (typeof data !== 'object' || data === null) return false;
      
      // Check required properties
      if (schema.required) {
        for (const prop of schema.required) {
          if (!(prop in data)) return false;
        }
      }
      
      // Validate properties
      if (schema.properties) {
        for (const [prop, propSchema] of Object.entries(schema.properties)) {
          if (prop in data) {
            if (!this._validateAgainstSchema(data[prop], propSchema)) return false;
          }
        }
      }
    } else if (schema.type === 'array') {
      if (!Array.isArray(data)) return false;
      
      if (schema.minItems && data.length < schema.minItems) return false;
      if (schema.maxItems && data.length > schema.maxItems) return false;
      
      if (schema.items) {
        for (const item of data) {
          if (!this._validateAgainstSchema(item, schema.items)) return false;
        }
      }
    } else if (schema.type === 'string') {
      if (typeof data !== 'string') return false;
    } else if (schema.type === 'number') {
      if (typeof data !== 'number') return false;
      if (schema.minimum !== undefined && data < schema.minimum) return false;
      if (schema.maximum !== undefined && data > schema.maximum) return false;
    }
    
    return true;
  }
}