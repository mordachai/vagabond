/**
 * Validation Engine for Character Builder
 * 
 * Centralizes all validation logic for character builder state and selections.
 * Provides rule-based validation with caching for performance.
 */

export class ValidationEngine {
  constructor(configSystem = null) {
    this.configSystem = configSystem;
    this.validators = new Map();
    this.validationCache = new Map();
    this.cacheTimeout = 5000; // 5 seconds
    
    this._initializeValidators();
  }

  /**
   * Initialize built-in validators
   * @private
   */
  _initializeValidators() {
    // Core validators
    this.validators.set('required', this._validateRequired.bind(this));
    this.validators.set('valid_uuid', this._validateUuid.bind(this));
    this.validators.set('all_assigned', this._validateAllAssigned.bind(this));
    this.validators.set('valid_values', this._validateValidValues.bind(this));
    this.validators.set('within_limit', this._validateWithinLimit.bind(this));
    this.validators.set('within_budget', this._validateWithinBudget.bind(this));
    this.validators.set('prerequisites_met', this._validatePrerequisitesMet.bind(this));
    this.validators.set('step_complete', this._validateStepComplete.bind(this));
    this.validators.set('has_selection', this._validateHasSelection.bind(this));
    this.validators.set('no_duplicates', this._validateNoDuplicates.bind(this));

    // Additional validators for specific steps
    this.validators.set('all_stats_assigned', this._validateAllAssigned.bind(this)); // Alias
    this.validators.set('within_spell_limit', this._validateWithinLimit.bind(this)); // Alias
    this.validators.set('optional', this._validateOptional.bind(this));
    this.validators.set('valid_spells', this._validateValidSpells.bind(this));
    this.validators.set('spellcaster_only', this._validateSpellcasterOnly.bind(this));
    this.validators.set('valid_perks', this._validateValidPerks.bind(this));
    this.validators.set('valid_pack', this._validateValidPack.bind(this));
    this.validators.set('single_selection', this._validateSingleSelection.bind(this));
    this.validators.set('valid_equipment', this._validateValidEquipment.bind(this));
    this.validators.set('no_duplicates_unless_allowed', this._validateNoDuplicatesUnlessAllowed.bind(this));
    this.validators.set('skills_assigned', this._validateSkillsAssigned.bind(this));
    this.validators.set('perks_selected', this._validatePerksSelected.bind(this));
  }

  /**
   * Validate complete character state
   * @param {Object} state - Character builder state
   * @returns {Object} Validation result
   */
  validateState(state) {
    const cacheKey = this._generateCacheKey('state', state);
    const cached = this._getCachedResult(cacheKey);
    if (cached) return cached;

    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      details: {}
    };

    // Get validation rules from configuration
    const validationRules = this._getValidationRules();

    // Validate each rule category
    for (const [category, rules] of Object.entries(validationRules)) {
      const categoryResult = this._validateCategory(category, rules, state);
      
      result.details[category] = categoryResult;
      
      if (!categoryResult.isValid) {
        result.isValid = false;
        result.errors.push(...categoryResult.errors);
      }
      
      result.warnings.push(...categoryResult.warnings);
    }

    this._setCachedResult(cacheKey, result);
    return result;
  }

  /**
   * Validate specific step completion
   * @param {string} stepName - Name of the step
   * @param {Object} state - Character builder state
   * @returns {Object} Validation result
   */
  validateStepCompletion(stepName, state) {
    // Temporarily disable caching for class step to debug
    const useCache = stepName !== 'class';

    const cacheKey = this._generateCacheKey('step', stepName, state);
    const cached = useCache ? this._getCachedResult(cacheKey) : null;
    if (cached) {
      console.log(`[ValidationEngine] ${stepName}: Using cached result: ${cached.isValid ? '✓ VALID' : '✗ INVALID'}`);
      return cached;
    }

    const result = {
      isValid: false,
      errors: [],
      warnings: [],
      canProceed: false
    };

    // Get step configuration
    let stepConfig;
    try {
      stepConfig = this.configSystem?.getStepConfig(stepName);
    } catch (error) {
      // Configuration not loaded yet, use fallback validation
      console.log(`[ValidationEngine] ${stepName}: Configuration not loaded, using fallback`);
      const fallbackResult = this._validateStepCompleteFallback(stepName, state);
      result.isValid = fallbackResult.isValid;
      result.canProceed = fallbackResult.isValid;
      if (!fallbackResult.isValid) {
        result.errors.push(`Step ${stepName} not complete`);
      }
      this._setCachedResult(cacheKey, result);
      return result;
    }

    if (!stepConfig) {
      // Unknown step, use fallback validation
      console.log(`[ValidationEngine] ${stepName}: Unknown step config, using fallback`);
      const fallbackResult = this._validateStepCompleteFallback(stepName, state);
      result.isValid = fallbackResult.isValid;
      result.canProceed = fallbackResult.isValid;
      if (!fallbackResult.isValid) {
        result.errors.push(`Step ${stepName} not complete`);
      }
      this._setCachedResult(cacheKey, result);
      return result;
    }

    // Check completion criteria
    const completionCriteria = stepConfig.completionCriteria || [];

    // If no criteria defined, use fallback validation
    if (completionCriteria.length === 0) {
      console.log(`[ValidationEngine] ${stepName}: No completion criteria, using fallback`);
      const fallbackResult = this._validateStepCompleteFallback(stepName, state);
      result.isValid = fallbackResult.isValid;
      result.canProceed = fallbackResult.isValid;
      if (!fallbackResult.isValid) {
        result.errors.push(`Step ${stepName} not complete`);
      }
      this._setCachedResult(cacheKey, result);
      return result;
    }

    // Validate using configuration criteria
    console.log(`[ValidationEngine] ${stepName}: Using config criteria (${completionCriteria.length} criteria)`);
    result.isValid = true; // Start as valid, criteria will invalidate if needed
    for (const criterion of completionCriteria) {
      const criterionResult = this._validateCriterion(criterion, state);

      if (!criterionResult.isValid) {
        result.isValid = false;
        result.errors.push(...criterionResult.errors);
      }

      result.warnings.push(...criterionResult.warnings);
    }
    console.log(`[ValidationEngine] ${stepName}: Config validation result: ${result.isValid ? '✓ VALID' : '✗ INVALID'}`);


    result.canProceed = result.isValid;
    this._setCachedResult(cacheKey, result);
    return result;
  }

  /**
   * Validate step prerequisites
   * @param {string} stepName - Name of the step
   * @param {Object} state - Character builder state
   * @returns {Object} Validation result
   */
  validateStepPrerequisites(stepName, state) {
    const cacheKey = this._generateCacheKey('prereq', stepName, state);
    const cached = this._getCachedResult(cacheKey);
    if (cached) return cached;

    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      canAccess: true
    };

    // Get prerequisites from configuration
    let prerequisites = [];
    try {
      prerequisites = this.configSystem?.getStepPrerequisites(stepName) || [];
    } catch (error) {
      // Configuration not loaded yet, assume no prerequisites
      console.debug(`Configuration not loaded for step ${stepName}, allowing access`);
      result.canAccess = true;
      this._setCachedResult(cacheKey, result);
      return result;
    }

    for (const prerequisite of prerequisites) {
      const prereqResult = this._validatePrerequisite(prerequisite, state);

      if (!prereqResult.isValid) {
        result.isValid = false;
        result.errors.push(...prereqResult.errors);
      }

      result.warnings.push(...prereqResult.warnings);
    }

    result.canAccess = result.isValid;
    this._setCachedResult(cacheKey, result);
    return result;
  }

  /**
   * Alias for validateStepPrerequisites (used by step managers)
   * @param {string} stepName - Name of the step
   * @param {Object} state - Character builder state
   * @returns {Object} Validation result
   */
  validatePrerequisites(stepName, state) {
    return this.validateStepPrerequisites(stepName, state);
  }

  /**
   * Validate specific selection (perk, spell, etc.)
   * @param {string} type - Type of selection
   * @param {string} selectionId - ID/UUID of selection
   * @param {Object} state - Character builder state
   * @param {Object} context - Additional context (actor, etc.)
   * @returns {Object} Validation result
   */
  async validateSelection(type, selectionId, state, context = {}) {
    const cacheKey = this._generateCacheKey('selection', type, selectionId, state);
    const cached = this._getCachedResult(cacheKey);
    if (cached) return cached;

    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      canSelect: false
    };

    try {
      // Type-specific validation
      switch (type) {
        case 'perk':
          const perkResult = await this._validatePerkSelection(selectionId, state, context);
          Object.assign(result, perkResult);
          break;
          
        case 'spell':
          const spellResult = await this._validateSpellSelection(selectionId, state, context);
          Object.assign(result, spellResult);
          break;
          
        case 'gear':
          const gearResult = await this._validateGearSelection(selectionId, state, context);
          Object.assign(result, gearResult);
          break;
          
        default:
          result.warnings.push(`Unknown selection type: ${type}`);
      }

      result.canSelect = result.isValid;
      this._setCachedResult(cacheKey, result);
      
    } catch (error) {
      result.isValid = false;
      result.errors.push(`Validation error: ${error.message}`);
    }

    return result;
  }

  /**
   * Get budget status for a specific budget type
   * @param {string} budgetType - Type of budget (stats, spells, gear, etc.)
   * @param {Object} state - Character builder state
   * @returns {Object} Budget status
   */
  getBudgetStatus(budgetType, state) {
    const cacheKey = this._generateCacheKey('budget', budgetType, state);
    const cached = this._getCachedResult(cacheKey);
    if (cached) return cached;

    const result = {
      total: 0,
      spent: 0,
      remaining: 0,
      isValid: true,
      isOver: false
    };

    try {
      switch (budgetType) {
        case 'stats':
          result.total = 27; // Default stat budget
          result.spent = this._calculateStatsBudgetSpent(state);
          break;
          
        case 'spells':
          result.total = this._calculateSpellsTotal(state);
          result.spent = state.spells?.length || 0;
          break;
          
        case 'gear':
          result.total = this._calculateGearTotal(state);
          result.spent = this._calculateGearSpent(state);
          break;
          
        default:
          result.isValid = false;
      }

      result.remaining = result.total - result.spent;
      result.isOver = result.remaining < 0;
      result.isValid = result.isValid && !result.isOver;

      this._setCachedResult(cacheKey, result);
      
    } catch (error) {
      result.isValid = false;
      console.error(`Budget calculation error for ${budgetType}:`, error);
    }

    return result;
  }

  /**
   * Clear validation cache
   * @param {string} pattern - Optional pattern to match cache keys
   */
  clearCache(pattern = null) {
    if (pattern) {
      for (const key of this.validationCache.keys()) {
        if (key.includes(pattern)) {
          this.validationCache.delete(key);
        }
      }
    } else {
      this.validationCache.clear();
    }
  }

  /**
   * Get validation rules from configuration
   * @returns {Object} Validation rules
   * @private
   */
  _getValidationRules() {
    if (this.configSystem) {
      try {
        const validationConfig = this.configSystem.configs.get('validation');
        return validationConfig?.rules || {};
      } catch (error) {
        console.warn('Failed to load validation rules from configuration:', error);
      }
    }

    // Fallback rules
    return {
      ancestry_selection: [
        { type: 'required', message: 'Ancestry selection is required' }
      ],
      class_selection: [
        { type: 'required', message: 'Class selection is required' }
      ],
      stat_assignment: [
        { type: 'all_assigned', message: 'All stats must be assigned' }
      ]
    };
  }

  /**
   * Validate a rule category
   * @param {string} category - Rule category
   * @param {Array} rules - Rules to validate
   * @param {Object} state - Character builder state
   * @returns {Object} Validation result
   * @private
   */
  _validateCategory(category, rules, state) {
    const result = {
      isValid: true,
      errors: [],
      warnings: []
    };

    for (const rule of rules) {
      const validator = this.validators.get(rule.type);
      if (!validator) {
        result.warnings.push(`Unknown validation rule: ${rule.type}`);
        continue;
      }

      try {
        const ruleResult = validator(rule, state, category);
        
        if (!ruleResult.isValid) {
          result.isValid = false;
          const message = rule.message || `Validation failed for ${rule.type}`;
          
          if (rule.severity === 'warning') {
            result.warnings.push(message);
          } else {
            result.errors.push(message);
          }
        }
        
      } catch (error) {
        result.isValid = false;
        result.errors.push(`Validation error in ${rule.type}: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Validate a completion criterion
   * @param {Object} criterion - Completion criterion
   * @param {Object} state - Character builder state
   * @returns {Object} Validation result
   * @private
   */
  _validateCriterion(criterion, state) {
    const validator = this.validators.get(criterion.type);
    if (!validator) {
      return {
        isValid: false,
        errors: [`Unknown criterion type: ${criterion.type}`],
        warnings: []
      };
    }

    try {
      const result = validator(criterion, state);
      return {
        isValid: result.isValid,
        errors: result.isValid ? [] : [criterion.message || `Criterion ${criterion.type} not met`],
        warnings: []
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Criterion validation error: ${error.message}`],
        warnings: []
      };
    }
  }

  /**
   * Validate a prerequisite
   * @param {Object} prerequisite - Prerequisite to check
   * @param {Object} state - Character builder state
   * @returns {Object} Validation result
   * @private
   */
  _validatePrerequisite(prerequisite, state) {
    const validator = this.validators.get(prerequisite.type);
    if (!validator) {
      return {
        isValid: false,
        errors: [`Unknown prerequisite type: ${prerequisite.type}`],
        warnings: []
      };
    }

    try {
      const result = validator(prerequisite, state);
      return {
        isValid: result.isValid,
        errors: result.isValid ? [] : [prerequisite.message || `Prerequisite ${prerequisite.type} not met`],
        warnings: []
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Prerequisite validation error: ${error.message}`],
        warnings: []
      };
    }
  }

  /**
   * Validate perk selection
   * @param {string} perkId - Perk UUID
   * @param {Object} state - Character builder state
   * @param {Object} context - Additional context
   * @returns {Object} Validation result
   * @private
   */
  async _validatePerkSelection(perkId, state, context) {
    const result = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Check if already selected
    if (state.perks?.includes(perkId) || state.classPerks?.includes(perkId)) {
      result.isValid = false;
      result.errors.push('Perk is already selected');
      return result;
    }

    // Check prerequisites if actor context is provided
    if (context.actor && context.checkPerkPrerequisites) {
      try {
        const prereqResult = await context.checkPerkPrerequisites(perkId, context.actor, state.spells || []);
        if (!prereqResult.met) {
          result.warnings.push(`Prerequisites not met: ${prereqResult.missing.join(', ')}`);
        }
      } catch (error) {
        result.warnings.push('Could not check perk prerequisites');
      }
    }

    return result;
  }

  /**
   * Validate spell selection
   * @param {string} spellId - Spell UUID
   * @param {Object} state - Character builder state
   * @param {Object} context - Additional context
   * @returns {Object} Validation result
   * @private
   */
  async _validateSpellSelection(spellId, state, context) {
    const result = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Check if already selected
    if (state.spells?.includes(spellId)) {
      result.isValid = false;
      result.errors.push('Spell is already selected');
      return result;
    }

    // Check spell limit
    const spellBudget = this.getBudgetStatus('spells', state);
    if (spellBudget.remaining <= 0) {
      result.isValid = false;
      result.errors.push('Spell limit reached');
    }

    return result;
  }

  /**
   * Validate gear selection
   * @param {string} gearId - Gear UUID
   * @param {Object} state - Character builder state
   * @param {Object} context - Additional context
   * @returns {Object} Validation result
   * @private
   */
  async _validateGearSelection(gearId, state, context) {
    const result = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Check budget
    const gearBudget = this.getBudgetStatus('gear', state);
    if (context.itemCost && gearBudget.remaining < context.itemCost) {
      result.warnings.push('Adding this item would exceed budget');
    }

    return result;
  }

  // Built-in validator implementations

  _validateRequired(rule, state, category) {
    const pathMap = {
      ancestry_selection: 'selectedAncestry',
      class_selection: 'selectedClass'
    };
    
    const path = pathMap[category];
    const value = path ? foundry.utils.getProperty(state, path) : null;
    
    return { isValid: value !== null && value !== undefined && value !== '' };
  }

  _validateUuid(rule, state, category) {
    const pathMap = {
      ancestry_selection: 'selectedAncestry',
      class_selection: 'selectedClass'
    };
    
    const path = pathMap[category];
    const value = path ? foundry.utils.getProperty(state, path) : null;
    
    if (!value) return { isValid: true }; // Let required validator handle null values
    
    return { isValid: typeof value === 'string' && value.length > 0 };
  }

  _validateAllAssigned(rule, state) {
    const stats = state.assignedStats || {};
    const requiredStats = ['might', 'dexterity', 'awareness', 'reason', 'presence', 'luck'];
    
    return { 
      isValid: requiredStats.every(stat => stats[stat] !== null && stats[stat] !== undefined) 
    };
  }

  _validateValidValues(rule, state) {
    // Validate that assigned stat values come from the selected array
    const selectedArrayId = state.selectedArrayId;
    const assignedStats = state.assignedStats || {};

    if (!selectedArrayId) {
      return { isValid: true }; // No array selected yet
    }

    // Get the selected array from configuration
    let selectedArray;
    try {
      const statsConfig = this.configSystem?.getStatsConfig();
      selectedArray = statsConfig?.arrays?.[selectedArrayId];
    } catch (error) {
      // Config not loaded, skip validation
      return { isValid: true };
    }

    if (!selectedArray) {
      return { isValid: true }; // Array not found in config
    }

    // Check that all assigned values exist in the selected array
    const statValues = Object.values(assignedStats).filter(v => v !== null && v !== undefined);
    const validValues = statValues.every(value => selectedArray.includes(value));

    return { isValid: validValues };
  }

  _validateWithinLimit(rule, state) {
    const spellLimit = this._calculateSpellsTotal(state);
    const currentSpells = state.spells?.length || 0;
    
    return { isValid: currentSpells <= spellLimit };
  }

  _validateWithinBudget(rule, state) {
    const gearBudget = this.getBudgetStatus('gear', state);
    return { isValid: !gearBudget.isOver };
  }

  _validatePrerequisitesMet(rule, state) {
    // Check perk prerequisites
    // This is a complex validation that requires checking perk data
    // For now, we'll do basic validation and log warnings

    const perks = state.perks || [];
    const classPerks = state.classPerks || [];
    const allPerks = [...perks, ...classPerks];

    if (allPerks.length === 0) {
      return { isValid: true }; // No perks to validate
    }

    // Basic prerequisite checking
    // More complex logic would need to:
    // 1. Load each perk document
    // 2. Check prerequisite.stats, prerequisite.trainedSkills, etc.
    // 3. Validate against current character state

    // For now, return valid with a warning that prerequisites should be manually verified
    return {
      isValid: true,
      warnings: allPerks.length > 0 ? ['Ensure all perk prerequisites are met'] : []
    };
  }

  _validateStepComplete(rule, state) {
    const stepName = rule.step;

    if (!stepName) {
      return { isValid: false };
    }

    // Check if step is in completed steps array
    const completedSteps = state.completedSteps || [];
    const isComplete = completedSteps.includes(stepName);

    // Also check specific completion criteria for each step
    if (!isComplete) {
      return this._validateStepCompleteFallback(stepName, state);
    }

    return { isValid: true };
  }

  /**
   * Fallback validation when config isn't available
   * @param {string} stepName - Step name
   * @param {Object} state - Character builder state
   * @returns {Object} Validation result
   * @private
   */
  _validateStepCompleteFallback(stepName, state) {
    switch (stepName) {
      case 'ancestry':
        // Just need to select an ancestry
        return { isValid: !!state.selectedAncestry };

      case 'class':
        // Need to have a class selected AND all required skills assigned
        if (!state.selectedClass) {
          console.log('[ValidationEngine Fallback] class: no class selected');
          return { isValid: false };
        }

        // Check if all skill choice pools are satisfied
        // The state should have skillGrant structure from the class
        const skillGrant = state.skillGrant;
        if (!skillGrant || !skillGrant.choices) {
          console.log('[ValidationEngine Fallback] class: no skillGrant data, using simple count');
          // If no skill grant data, fall back to simple count check
          const skillsNeeded = state.skillChoicesNeeded || 0;
          const skillsSelected = (state.skills || []).length;
          const result = skillsSelected >= skillsNeeded;
          console.log('[ValidationEngine Fallback] class:', {
            skillsNeeded,
            skillsSelected,
            isValid: result ? '✓' : '✗'
          });
          return { isValid: result };
        }

        // Check each choice pool individually
        const currentSkills = state.skills || [];
        const guaranteed = skillGrant.guaranteed || [];

        console.log('[ValidationEngine Fallback] class validation:', {
          totalSkills: currentSkills.length,
          currentSkills,
          guaranteed,
          numberOfGroups: skillGrant.choices.length
        });

        for (let i = 0; i < skillGrant.choices.length; i++) {
          const choice = skillGrant.choices[i];
          const pool = choice.pool.length ? choice.pool : Object.keys(CONFIG.VAGABOND?.skills || {});
          // Count how many skills from this pool have been selected (excluding guaranteed)
          const selectedFromPool = currentSkills.filter(skill =>
            pool.includes(skill) && !guaranteed.includes(skill)
          ).length;

          console.log(`[ValidationEngine Fallback] class - Group ${i + 1}:`, {
            required: choice.count,
            selected: selectedFromPool,
            poolSize: pool.length,
            valid: selectedFromPool >= choice.count ? '✓' : '✗'
          });

          if (selectedFromPool < choice.count) {
            // Not enough skills selected from this pool
            console.log('[ValidationEngine Fallback] class: ✗ INVALID (insufficient skills from pool)');
            return { isValid: false };
          }
        }

        console.log('[ValidationEngine Fallback] class: ✓ VALID');
        return { isValid: true };

      case 'stats':
        // Need all 6 stats assigned AND an array selected
        const stats = state.assignedStats || {};
        const requiredStats = ['might', 'dexterity', 'awareness', 'reason', 'presence', 'luck'];
        const allStatsAssigned = requiredStats.every(stat =>
          stats[stat] !== null && stats[stat] !== undefined
        );
        const arraySelected = !!state.selectedArrayId;

        return { isValid: allStatsAssigned && arraySelected };

      case 'spells':
        // Need to select required number of spells based on class spell limit
        // If not a spellcaster (spellLimit = 0), step is auto-complete
        const spellLimit = state.spellLimit || 0;
        const spellsSelected = (state.spells || []).length;

        // If no spell limit, step is complete (not a spellcaster)
        // If has spell limit, must select EXACTLY that many spells
        return { isValid: spellLimit === 0 || spellsSelected === spellLimit };

      case 'perks':
      case 'starting-packs':
      case 'gear':
        // Optional steps are always considered complete
        return { isValid: true };

      default:
        return { isValid: false };
    }
  }

  _validateHasSelection(rule, state) {
    const path = rule.path;
    const value = foundry.utils.getProperty(state, path);
    
    return { isValid: value !== null && value !== undefined };
  }

  _validateNoDuplicates(rule, state) {
    // Check for duplicate selections in perks, spells, gear arrays
    const perks = state.perks || [];
    const spells = state.spells || [];
    const gear = state.gear || [];

    // Check each array for duplicates
    const hasDuplicatePerks = perks.length !== new Set(perks).size;
    const hasDuplicateSpells = spells.length !== new Set(spells).size;
    const hasDuplicateGear = gear.length !== new Set(gear).size;

    const hasDuplicates = hasDuplicatePerks || hasDuplicateSpells || hasDuplicateGear;

    return {
      isValid: !hasDuplicates,
      errors: hasDuplicates ? ['Duplicate selections detected'] : []
    };
  }

  _validateOptional(rule, state) {
    // Optional steps are always valid
    return { isValid: true };
  }

  _validateSkillsAssigned(rule, state) {
    // Validate that all required skills from choice pools have been assigned
    if (!state.selectedClass) {
      return { isValid: false, errors: ['No class selected'] };
    }

    const skillGrant = state.skillGrant;
    if (!skillGrant || !skillGrant.choices) {
      // If no skill grant data, fall back to simple count check
      const skillsNeeded = state.skillChoicesNeeded || 0;
      const skillsSelected = (state.skills || []).length;
      const isValid = skillsSelected >= skillsNeeded;
      console.log('[Validator skills_assigned] Simple count:', {
        skillsNeeded,
        skillsSelected,
        isValid: isValid ? '✓' : '✗'
      });
      return { isValid, errors: isValid ? [] : ['Not enough skills selected'] };
    }

    // Check each choice pool individually
    const currentSkills = state.skills || [];
    const guaranteed = skillGrant.guaranteed || [];

    console.log('[Validator skills_assigned] Validating pools:', {
      totalSkills: currentSkills.length,
      currentSkills,
      guaranteed,
      numberOfGroups: skillGrant.choices.length
    });

    for (let i = 0; i < skillGrant.choices.length; i++) {
      const choice = skillGrant.choices[i];
      const pool = choice.pool.length ? choice.pool : Object.keys(CONFIG.VAGABOND?.skills || {});
      const selectedFromPool = currentSkills.filter(skill =>
        pool.includes(skill) && !guaranteed.includes(skill)
      ).length;

      console.log(`[Validator skills_assigned] Pool ${i + 1}:`, {
        required: choice.count,
        selected: selectedFromPool,
        poolSize: pool.length,
        valid: selectedFromPool >= choice.count ? '✓' : '✗'
      });

      if (selectedFromPool < choice.count) {
        return {
          isValid: false,
          errors: [`Need ${choice.count} skills from pool ${i + 1}, only have ${selectedFromPool}`]
        };
      }
    }

    console.log('[Validator skills_assigned] ✓ All pools satisfied');
    return { isValid: true, errors: [] };
  }

  _validatePerksSelected(rule, state) {
    // Perks step requires at least the starting perk slots to be filled
    // At level 1, characters get perk slots based on class
    const perks = state.perks || [];
    const perkLimit = state.perkLimit || 1; // Default to at least 1 perk required

    console.log('[Validator perks_selected]:', {
      perksSelected: perks.length,
      perkLimit,
      isValid: perks.length >= perkLimit ? '✓' : '✗'
    });

    const isValid = perks.length >= perkLimit;
    return {
      isValid,
      errors: isValid ? [] : [`Need at least ${perkLimit} perk(s), only have ${perks.length}`]
    };
  }

  _validateValidSpells(rule, state) {
    // Validate that selected spells are valid UUIDs
    const spells = state.spells || [];

    if (spells.length === 0) {
      return { isValid: true }; // No spells selected is valid
    }

    // Check that all spell UUIDs are strings
    const allValid = spells.every(spellId => typeof spellId === 'string' && spellId.length > 0);

    return { isValid: allValid };
  }

  _validateSpellcasterOnly(rule, state) {
    // Check if the selected class can cast spells
    // NOTE: This validator cannot be async because it's called from synchronous validation pipeline.
    // TODO: Consider making validation pipeline async to support async validators,
    // or pre-load class data and store isSpellcaster flag in state.
    const selectedClass = state.selectedClass;
    const spells = state.spells || [];

    if (!selectedClass || spells.length === 0) {
      return { isValid: true }; // No class selected or no spells chosen
    }

    // For now, return a warning if spells are selected
    // The actual isSpellcaster check should happen when the class is selected
    // and the result stored in state for synchronous access
    return {
      isValid: true,
      warnings: spells.length > 0 ? ['Verify your class can cast spells'] : []
    };
  }

  _validateValidPerks(rule, state) {
    // Validate that selected perks are valid UUIDs
    const perks = state.perks || [];
    const classPerks = state.classPerks || [];
    const allPerks = [...perks, ...classPerks];

    if (allPerks.length === 0) {
      return { isValid: true }; // No perks selected is valid
    }

    // Check that all perk UUIDs are strings
    const allValid = allPerks.every(perkId => typeof perkId === 'string' && perkId.length > 0);

    return { isValid: allValid };
  }

  _validateValidPack(rule, state) {
    // Validate that selected starting pack is a valid UUID
    const pack = state.selectedStartingPack;

    if (!pack) {
      return { isValid: true }; // No pack selected is valid (optional)
    }

    // Check that pack UUID is a string
    return { isValid: typeof pack === 'string' && pack.length > 0 };
  }

  _validateSingleSelection(rule, state) {
    // Validate that only one starting pack is selected
    const pack = state.selectedStartingPack;

    // Check if it's null/undefined or a single string
    const isValid = !pack || typeof pack === 'string';

    return { isValid };
  }

  _validateValidEquipment(rule, state) {
    // Validate that selected gear items are valid
    const gear = state.gear || [];

    if (gear.length === 0) {
      return { isValid: true }; // No gear selected is valid
    }

    // Check that all gear items have valid UUIDs
    const allValid = gear.every(item => {
      return item && typeof item.uuid === 'string' && item.uuid.length > 0;
    });

    return { isValid: allValid };
  }

  _validateNoDuplicatesUnlessAllowed(rule, state) {
    // Validate no duplicate stat assignments unless the selected array allows it
    const stats = state.assignedStats || {};
    const values = Object.values(stats).filter(v => v !== null && v !== undefined);

    // Check for duplicates
    const uniqueValues = new Set(values);
    const hasDuplicates = uniqueValues.size !== values.length;

    if (!hasDuplicates) {
      return { isValid: true };
    }

    // If there are duplicates, check if the selected array allows them
    // For most standard arrays, duplicates are not allowed
    // This is a warning, not an error
    return {
      isValid: true,
      warnings: ['Duplicate stat values assigned - ensure this is allowed by your selected array']
    };
  }

  // Budget calculation helpers

  _calculateStatsBudgetSpent(state) {
    // For array-based system, no budget is spent
    return 0;
  }

  _calculateSpellsTotal(state) {
    // Calculate spell limit based on class and level
    const selectedClass = state.selectedClass;

    if (!selectedClass) {
      return 0; // No class selected
    }

    // Default spell limit for level 1 characters
    // Most spellcasting classes start with 2-3 spells at level 1
    // This should be expanded to load actual class data and check:
    // - If the class is a spellcaster
    // - The class's spell progression
    // - Current level (defaults to 1 for new characters)

    // For now, return a reasonable default for level 1 characters
    // This can be refined when class data loading is implemented
    return 3; // Default 3 spells for level 1 spellcasters
  }

  _calculateGearTotal(state) {
    // Default or starting pack budget
    return 300;
  }

  _calculateGearSpent(state) {
    // Return the tracked cost from state (updated by GearStepManager)
    return state.gearCostSpent || 0;
  }

  // Cache management

  _generateCacheKey(...parts) {
    return parts.map(p => typeof p === 'object' ? JSON.stringify(p) : String(p)).join('|');
  }

  _getCachedResult(key) {
    const cached = this.validationCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.result;
    }
    return null;
  }

  _setCachedResult(key, result) {
    this.validationCache.set(key, {
      result: foundry.utils.deepClone(result),
      timestamp: Date.now()
    });
  }
}