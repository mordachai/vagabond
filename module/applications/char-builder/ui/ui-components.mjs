/**
 * Character Builder UI Components
 * 
 * Orchestrates all UI-related functionality for the character builder.
 * Handles rendering, context preparation, and user interaction concerns.
 */

import { PreviewComponent } from './preview-component.mjs';
import { ContextComponent } from './context-component.mjs';

export class CharacterBuilderUIComponents {
  constructor(configSystem, dataService) {
    this.configSystem = configSystem;
    this.dataService = dataService;
    
    // Initialize component instances
    this.previewComponent = new PreviewComponent(configSystem, dataService);
    this.contextComponent = new ContextComponent(configSystem, dataService);
    
    // UI state tracking
    this.lastContextHash = null;
    this.contextCache = new Map();
    this.renderCache = new Map();
    
    // Change detection for selective updates
    this.changeDetection = {
      enabled: true,
      trackedPaths: [
        'selectedAncestry',
        'selectedClass',
        'assignedStats',
        'appliedBonuses',  // CRITICAL: Track bonus applications for stat updates
        'bonusStatsCount',  // CRITICAL: Track required bonus stat applications
        'skills',
        'skillSelections',  // CRITICAL: Track per-group skill selections for validation
        'skillGrant',  // CRITICAL: Track skill grant structure changes
        'extraTrainingCount',  // CRITICAL: Track extra training from ancestry/class grants
        'perks',
        'classPerks',
        'perkGrants',  // CRITICAL: Track grant fulfillment for perks step
        'spells',
        'selectedStartingPack',
        'gear',
        'currentStep',
        'previewUuid',  // CRITICAL: Track preview changes for UI updates
        'selectedArrayId',
        'unassignedValues',
        'showAllPerks'
      ]
    };
  }

  /**
   * Prepare complete render context for the character builder with optimization
   * @param {object} state - Current builder state
   * @param {object} currentStep - Current step manager
   * @param {object} options - Render options
   * @returns {Promise<object>} Complete render context
   */
  async prepareContext(state, currentStep, options = {}) {
    const startTime = performance.now();
    
    try {
      // Check if we can use cached context
      if (this.changeDetection.enabled && !options.forceRefresh) {
        const contextHash = this._calculateContextHash(state);
        if (contextHash === this.lastContextHash && this.contextCache.has(contextHash)) {
          const cachedContext = this.contextCache.get(contextHash);
          this._recordPerformance('prepareContext', performance.now() - startTime, true);
          return cachedContext;
        }
        this.lastContextHash = contextHash;
      }

      // Use incremental updates if previous state is available
      const useIncremental = options.previousState && this.changeDetection.enabled;
      
      // Prepare base context
      const baseContext = useIncremental
        ? await this.contextComponent.prepareBaseContextIncremental(state, options.previousState, options)
        : await this.contextComponent.prepareBaseContext(state, options);

      // Prepare step-specific context
      // Pass openCategories for gear step accordion functionality
      const stepContext = currentStep ? await currentStep.prepareStepContext(state, {
        openCategories: options.openCategories || new Set()
      }) : {};

      // Prepare character preview (temporarily disabled - use old method)
      // const previewContext = useIncremental
      //   ? await this.previewComponent.preparePreviewIncremental(state, options.previousState)
      //   : await this.previewComponent.preparePreview(state);

      // Prepare navigation context
      const navigationContext = this._prepareNavigation(state);
      
      // Prepare sidebar context
      const sidebarContext = this._prepareSidebar(state, currentStep);

      // Map availableOptions to options for template compatibility
      const mappedStepContext = { ...stepContext };
      if (mappedStepContext.availableOptions) {
        mappedStepContext.options = mappedStepContext.availableOptions;
        delete mappedStepContext.availableOptions;
      }

      // Prepare steps array for navigation template
      const stepsArray = this._prepareStepsArray(state, navigationContext);

      // Generate preview actor using old builder method
      const actor = await this._generatePreviewActor(state, currentStep);

      // Get preview item if one is selected (only if step context didn't provide it)
      let selectedItem = mappedStepContext.selectedItem || null;
      let previewItem = mappedStepContext.previewItem || null;

      // If there's a previewItem but no selectedItem, use previewItem as selectedItem for the template
      // The template only checks for selectedItem, so we need to provide it
      if (!selectedItem && previewItem) {
        selectedItem = previewItem;
      }

      // If step context didn't provide selectedItem/previewItem, load them here (legacy support)
      if (!selectedItem && !previewItem) {
        const previewUuid = state.previewUuid ||
          (state.currentStep === 'ancestry' ? state.selectedAncestry :
           state.currentStep === 'class' ? state.selectedClass :
           state.currentStep === 'starting-packs' ? state.selectedStartingPack : null);

        if (previewUuid) {
          try {
            const item = await fromUuid(previewUuid);
            if (item) {
              selectedItem = item.toObject();
            }
          } catch (error) {
            console.warn('Failed to load preview item:', error);
          }
        }
      }

      // Helper flags for template
      const isGearStep = state.currentStep === 'gear';
      const hasChoices = (state.currentStep === 'class' && state.selectedClass) ||
                         (state.currentStep === 'stats');

      // Prepare classChoices for decision zone if on class step
      // classPreviewData already contains properly formatted skill data with disabled/checked states
      let classChoices = null;
      if (state.currentStep === 'class' && mappedStepContext.classPreviewData) {
        classChoices = mappedStepContext.classPreviewData.skillGrant || {};
      }

      // Combine all contexts
      const completeContext = {
        ...baseContext,
        ...mappedStepContext,
        step: state.currentStep, // Template expects 'step' not 'currentStep'
        steps: stepsArray, // Template expects top-level 'steps' array
        actor, // Preview actor for templates
        selectedItem, // Currently selected/previewing item
        previewItem, // Preview item (if different from selected)
        isGearStep, // Helper for gear step template
        hasChoices, // Helper for decision zone visibility
        classChoices, // Skill choices for class step
        showAllPerks: state.showAllPerks || false,
        navigation: navigationContext,
        sidebar: sidebarContext,
        // Navigation button states (for footer template)
        isLastStep: state.currentStep === 'gear', // Hide Next button on last step
        canAdvance: this._canProceedToNext(state), // Can click Next button
        canFinish: this._isCharacterComplete(state), // Can click Finish button
        ui: {
          currentStep: state.currentStep,
          isValid: this._validateCurrentState(state),
          canProceed: this._canProceedToNext(state),
          showPreview: this._shouldShowPreview(state),
          theme: options.theme || 'default'
        },
        performance: {
          contextGenerationTime: performance.now() - startTime,
          cacheHit: false,
          optimizationsUsed: useIncremental ? ['incremental'] : []
        }
      };

      // Cache the context if change detection is enabled
      if (this.changeDetection.enabled && this.lastContextHash) {
        this.contextCache.set(this.lastContextHash, completeContext);
        
        // Limit cache size
        if (this.contextCache.size > 10) {
          const firstKey = this.contextCache.keys().next().value;
          this.contextCache.delete(firstKey);
        }
      }

      this._recordPerformance('prepareContext', performance.now() - startTime, false);

      // Log button states for debugging

      return completeContext;
      
    } catch (error) {
      console.error('Failed to prepare UI context:', error);
      this._recordPerformance('prepareContext', performance.now() - startTime, false, error);
      return this._getFallbackContext(state);
    }
  }

  /**
   * Record performance metrics
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in milliseconds
   * @param {boolean} cacheHit - Whether this was a cache hit
   * @param {Error} error - Error if operation failed
   */
  _recordPerformance(operation, duration, cacheHit, error = null) {
    if (!this.performanceMetrics) {
      this.performanceMetrics = {
        operations: new Map(),
        totalOperations: 0,
        cacheHits: 0,
        errors: 0
      };
    }

    const metrics = this.performanceMetrics;
    
    if (!metrics.operations.has(operation)) {
      metrics.operations.set(operation, {
        count: 0,
        totalTime: 0,
        averageTime: 0,
        minTime: Infinity,
        maxTime: 0,
        cacheHits: 0,
        errors: 0
      });
    }

    const opMetrics = metrics.operations.get(operation);
    opMetrics.count++;
    opMetrics.totalTime += duration;
    opMetrics.averageTime = opMetrics.totalTime / opMetrics.count;
    opMetrics.minTime = Math.min(opMetrics.minTime, duration);
    opMetrics.maxTime = Math.max(opMetrics.maxTime, duration);

    if (cacheHit) {
      opMetrics.cacheHits++;
      metrics.cacheHits++;
    }

    if (error) {
      opMetrics.errors++;
      metrics.errors++;
    }

    metrics.totalOperations++;

    // Log slow operations
    if (duration > 100) { // More than 100ms
      console.warn(`Slow UI operation: ${operation} took ${duration.toFixed(2)}ms`);
    }
  }

  /**
   * Update character preview
   * @param {object} state - Current builder state
   * @returns {Promise<object>} Updated preview context
   */
  async updatePreview(state) {
    try {
      return await this.previewComponent.preparePreview(state);
    } catch (error) {
      console.error('Failed to update preview:', error);
      return { error: 'Preview update failed' };
    }
  }

  /**
   * Render step-specific content
   * @param {string} stepName - Name of the step
   * @param {object} context - Render context
   * @returns {Promise<string>} Rendered HTML content
   */
  async renderStepContent(stepName, context) {
    const cacheKey = `${stepName}-${this._calculateContextHash(context)}`;
    
    if (this.renderCache.has(cacheKey)) {
      return this.renderCache.get(cacheKey);
    }

    try {
      // This would typically render a Handlebars template
      // For now, return a placeholder that indicates the step
      const renderedContent = await this._renderStepTemplate(stepName, context);
      
      // Cache the rendered content
      this.renderCache.set(cacheKey, renderedContent);
      
      // Limit cache size
      if (this.renderCache.size > 20) {
        const firstKey = this.renderCache.keys().next().value;
        this.renderCache.delete(firstKey);
      }
      
      return renderedContent;
      
    } catch (error) {
      console.error(`Failed to render step content for ${stepName}:`, error);
      return `<div class="error">Failed to render ${stepName} content</div>`;
    }
  }

  /**
   * Prepare navigation context
   * @param {object} state - Current builder state
   * @returns {object} Navigation context
   */
  _prepareNavigation(state) {
    // Get step order and configurations
    let stepOrder = [];
    let allStepConfigs = {};

    try {
      stepOrder = this.configSystem.getStepOrder();
      allStepConfigs = this.configSystem.getAllStepConfigs();
    } catch (error) {
      // Configuration not loaded yet, use defaults
      console.debug('Configuration not loaded for navigation, using defaults');
      stepOrder = ['ancestry', 'class', 'stats', 'perks', 'spells', 'starting-packs', 'gear'];
      allStepConfigs = {};
    }

    // Build step list with metadata
    const steps = stepOrder.map(stepName => {
      const config = allStepConfigs[stepName] || { name: stepName, displayName: stepName };
      return {
        name: stepName,
        displayName: config.displayName || stepName,
        ...config
      };
    });

    const currentStepIndex = stepOrder.indexOf(state.currentStep);

    return {
      steps: steps.map((step, index) => ({
        ...step,
        isCurrent: step.name === state.currentStep,
        isCompleted: this._isStepCompleted(step.name, state),
        isAccessible: this._isStepAccessible(step.name, state),
        isPrevious: index < currentStepIndex,
        isNext: index > currentStepIndex
      })),
      currentStep: state.currentStep,
      currentStepIndex,
      canProceed: this._canProceedToNext(state),
      canGoBack: currentStepIndex > 0,
      totalSteps: steps.length
    };
  }

  /**
   * Prepare sidebar context
   * @param {object} state - Current builder state
   * @param {object} currentStep - Current step manager
   * @returns {object} Sidebar context
   */
  _prepareSidebar(state, currentStep) {
    return {
      characterSummary: this._prepareCharacterSummary(state),
      stepProgress: this._prepareStepProgress(state),
      budgetInfo: this._prepareBudgetInfo(state),
      quickActions: this._prepareQuickActions(state, currentStep),
      helpInfo: this._prepareHelpInfo(state.currentStep)
    };
  }

  /**
   * Prepare character summary for sidebar
   * @param {object} state - Current builder state
   * @returns {object} Character summary
   */
  _prepareCharacterSummary(state) {
    return {
      ancestry: state.selectedAncestry?.name || 'Not selected',
      class: state.selectedClass?.name || 'Not selected',
      level: 1, // Character builder is always level 1
      statsAssigned: Object.keys(state.assignedStats || {}).length,
      totalStats: 6,
      skillsSelected: (state.skills || []).length,
      perksSelected: (state.perks || []).length + (state.classPerks || []).length,
      spellsSelected: (state.spells || []).length,
      gearSelected: (state.gear || []).length
    };
  }

  /**
   * Prepare step progress information
   * @param {object} state - Current builder state
   * @returns {object} Step progress
   */
  _prepareStepProgress(state) {
    // Get step order and configurations
    let stepOrder = [];
    let allStepConfigs = {};

    try {
      stepOrder = this.configSystem.getStepOrder();
      allStepConfigs = this.configSystem.getAllStepConfigs();
    } catch (error) {
      // Configuration not loaded yet, use defaults
      console.debug('Configuration not loaded for step progress, using defaults');
      stepOrder = ['ancestry', 'class', 'stats', 'perks', 'spells', 'starting-packs', 'gear'];
      allStepConfigs = {};
    }

    // Build step list with metadata
    const steps = stepOrder.map(stepName => ({
      name: stepName,
      ...(allStepConfigs[stepName] || {})
    }));

    const completedSteps = steps.filter(step => this._isStepCompleted(step.name, state));

    return {
      completed: completedSteps.length,
      total: steps.length,
      percentage: steps.length > 0 ? Math.round((completedSteps.length / steps.length) * 100) : 0,
      currentStepName: state.currentStep,
      nextStepName: this._getNextStepName(state.currentStep)
    };
  }

  /**
   * Prepare budget information
   * @param {object} state - Current builder state
   * @returns {object} Budget information
   */
  _prepareBudgetInfo(state) {
    const budgets = state.budgets || {};
    
    return {
      stats: {
        total: budgets.stats?.total || 27,
        spent: budgets.stats?.spent || 0,
        remaining: budgets.stats?.remaining || 27
      },
      spells: {
        total: budgets.spells?.total || 0,
        spent: budgets.spells?.spent || 0,
        remaining: budgets.spells?.remaining || 0
      },
      perks: {
        total: budgets.perks?.total || 0,
        spent: budgets.perks?.spent || 0,
        remaining: budgets.perks?.remaining || 0
      },
      gear: {
        total: budgets.gear?.total || 300, // Default gold budget
        spent: budgets.gear?.spent || 0,
        remaining: budgets.gear?.remaining || 300
      }
    };
  }

  /**
   * Prepare quick actions for current step
   * @param {object} state - Current builder state
   * @param {object} currentStep - Current step manager
   * @returns {array} Quick actions
   */
  _prepareQuickActions(state, currentStep) {
    const actions = [];
    
    // Add step-specific quick actions
    if (currentStep && currentStep.getQuickActions) {
      actions.push(...currentStep.getQuickActions(state));
    }
    
    // Add common quick actions
    actions.push(
      {
        id: 'randomize-all',
        label: 'Randomize All',
        icon: 'fas fa-dice',
        enabled: true,
        action: 'randomize-all'
      },
      {
        id: 'reset-step',
        label: 'Reset Step',
        icon: 'fas fa-undo',
        enabled: true,
        action: 'reset-step'
      },
      {
        id: 'export-character',
        label: 'Export Character',
        icon: 'fas fa-download',
        enabled: this._isCharacterComplete(state),
        action: 'export-character'
      }
    );
    
    return actions;
  }

  /**
   * Prepare help information for current step
   * @param {string} stepName - Current step name
   * @returns {object} Help information
   */
  _prepareHelpInfo(stepName) {
    const helpContent = {
      ancestry: {
        title: 'Choose Your Ancestry',
        description: 'Select your character\'s ancestry, which determines base traits and abilities.',
        tips: ['Consider how ancestry traits complement your intended class', 'Some ancestries have unique features']
      },
      class: {
        title: 'Choose Your Class',
        description: 'Select your character\'s class, which determines their role and abilities.',
        tips: ['Classes determine hit points, skills, and special abilities', 'Consider your preferred playstyle']
      },
      stats: {
        title: 'Assign Ability Scores',
        description: 'Distribute ability scores using the point-buy system.',
        tips: ['Focus on your class\'s primary abilities', 'Don\'t neglect Constitution for survivability']
      },
      perks: {
        title: 'Select Perks',
        description: 'Choose perks that enhance your character\'s abilities.',
        tips: ['Check prerequisites carefully', 'Some perks synergize well together']
      },
      spells: {
        title: 'Choose Spells',
        description: 'Select spells if your class can cast them.',
        tips: ['Balance offensive and utility spells', 'Consider spell components and casting time']
      },
      'starting-packs': {
        title: 'Choose Starting Equipment',
        description: 'Select a starting equipment package.',
        tips: ['Starting packs provide essential gear', 'Consider your class and intended role']
      },
      gear: {
        title: 'Additional Equipment',
        description: 'Purchase additional equipment with your starting gold.',
        tips: ['Don\'t forget basic adventuring gear', 'Stay within your budget']
      }
    };
    
    return helpContent[stepName] || {
      title: 'Character Builder',
      description: 'Build your character step by step.',
      tips: ['Take your time with each decision', 'You can always go back and change things']
    };
  }

  /**
   * Calculate hash for context change detection
   * @param {object} context - Context to hash
   * @returns {string} Context hash
   */
  _calculateContextHash(context) {
    const relevantData = {};
    
    for (const path of this.changeDetection.trackedPaths) {
      const value = this._getNestedValue(context, path);
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
   * Validate current state
   * @param {object} state - Current builder state
   * @returns {boolean} True if state is valid
   */
  _validateCurrentState(state) {
    // Basic validation - can be enhanced
    return state && state.currentStep;
  }

  /**
   * Check if can proceed to next step
   * @param {object} state - Current builder state
   * @returns {boolean} True if can proceed
   */
  _canProceedToNext(state) {
    return this._isStepCompleted(state.currentStep, state);
  }

  /**
   * Check if should show preview
   * @param {object} state - Current builder state
   * @returns {boolean} True if should show preview
   */
  _shouldShowPreview(state) {
    return state.selectedAncestry || state.selectedClass;
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
        // Need class selected AND all skill choices satisfied
        if (!state.selectedClass) {
          return false;
        }

        // Check each skill choice pool
        const skillGrant = state.skillGrant;
        if (!skillGrant || !skillGrant.choices) {
          // No skill grant data - just check if class is selected
          return true;
        }

        const currentSkills = state.skills || [];
        const guaranteed = skillGrant.guaranteed || [];

        // Get all skills including weapon skills (melee, ranged)
        const allSkillsWithWeaponSkills = [
          ...Object.keys(CONFIG.VAGABOND?.skills || {}),
          'melee',
          'ranged'
        ];

        // Validate each choice pool
        let totalNeeded = 0;
        let totalSelected = 0;
        let isValid = true;

        for (let i = 0; i < skillGrant.choices.length; i++) {
          const choice = skillGrant.choices[i];
          const pool = (choice.pool && choice.pool.length > 0) ? choice.pool : allSkillsWithWeaponSkills;
          const selectedFromPool = currentSkills.filter(skill =>
            pool.includes(skill) && !guaranteed.includes(skill)
          ).length;

          totalNeeded += choice.count;
          totalSelected += selectedFromPool;

          const poolValid = selectedFromPool >= choice.count;

          if (!poolValid) {
            isValid = false;
          }
        }

        // Also validate extra training skills if any
        const extraTrainingCount = state.extraTrainingCount || 0;
        if (extraTrainingCount > 0) {
          const skillSelections = state.skillSelections || {};
          const extraTrainingGroupIndex = skillGrant.choices.length;
          const extraTrainingSelections = skillSelections[extraTrainingGroupIndex] || [];

          if (extraTrainingSelections.length < extraTrainingCount) {
            isValid = false;
          }
        }

        return isValid;

      case 'stats':
        // Need all 6 stats assigned (with actual values, not null)
        const stats = state.assignedStats || {};
        const requiredStats = ['might', 'dexterity', 'awareness', 'reason', 'presence', 'luck'];
        const allStatsAssigned = requiredStats.every(stat =>
          stats[stat] !== null && stats[stat] !== undefined
        );
        if (!allStatsAssigned) return false;

        // Also need all bonus stats applied (if any)
        const bonusStatsCount = state.bonusStatsCount || 0;
        const appliedBonusesCount = Object.keys(state.appliedBonuses || {}).length;

        return appliedBonusesCount >= bonusStatsCount;

      case 'perks':
        // Perks step is always complete - user can choose to take no perks
        // (class perks are granted automatically)
        return true;

      case 'spells':
        // Need exact spell count for spellcasters
        const spellLimit = state.spellLimit || 0;
        const spellsSelected = (state.spells || []).length;
        return spellLimit === 0 || spellsSelected === spellLimit;

      case 'starting-packs':
        return !!state.selectedStartingPack;

      case 'gear':
        return true; // Additional gear is optional

      default:
        return false;
    }
  }

  /**
   * Check if step is accessible
   * @param {string} stepName - Step name
   * @param {object} state - Current builder state
   * @returns {boolean} True if step is accessible
   */
  _isStepAccessible(stepName, state) {
    // Basic prerequisite checking
    switch (stepName) {
      case 'ancestry':
        return true;
      case 'class':
        return !!state.selectedAncestry;
      case 'stats':
        return !!state.selectedClass;
      case 'perks':
        return !!state.selectedClass;
      case 'spells':
        return !!state.selectedClass;
      case 'starting-packs':
        return !!state.selectedClass;
      case 'gear':
        // Gear is independent - only requires stats to be complete
        return Object.keys(state.assignedStats || {}).length === 6;
      default:
        return false;
    }
  }

  /**
   * Check if character is complete
   * @param {object} state - Current builder state
   * @returns {boolean} True if character is complete
   */
  _isCharacterComplete(state) {
    // Mandatory steps: ancestry, class, stats, perks, spells (if spellcaster)
    // Optional steps: starting-packs, gear
    const mandatoryComplete = this._isStepCompleted('ancestry', state) &&
                               this._isStepCompleted('class', state) &&
                               this._isStepCompleted('stats', state);

    if (!mandatoryComplete) return false;

    // Check if current step index is at least at perks step
    // This ensures user has gone through perks step (even if they didn't select any)
    const stepOrder = ['ancestry', 'class', 'stats', 'perks', 'spells', 'starting-packs', 'gear'];
    const currentStepIndex = stepOrder.indexOf(state.currentStep);
    const perksStepIndex = stepOrder.indexOf('perks');
    const spellsStepIndex = stepOrder.indexOf('spells');

    // Must have at least reached the perks step
    if (currentStepIndex < perksStepIndex) return false;

    // For spellcasters, must have at least reached the spells step
    // Note: We can't easily check if class is spellcaster here without loading the class item
    // So we require reaching the spells step for all characters
    if (currentStepIndex < spellsStepIndex) return false;

    return true;
  }

  /**
   * Generate preview actor from current state
   * @param {object} state - Current builder state
   * @param {object} currentStep - Current step manager
   * @returns {Promise<Actor>} Preview actor
   */
  async _generatePreviewActor(state, currentStep) {
    // Get the base actor (should be passed from parent, but we'll create a temp one)
    // In a real implementation, this would come from the builder's actor property
    const actorData = {
      name: "Preview Character",
      type: "character",
      system: {
        stats: {
          might: { value: state.assignedStats?.might || 0 },
          dexterity: { value: state.assignedStats?.dexterity || 0 },
          awareness: { value: state.assignedStats?.awareness || 0 },
          reason: { value: state.assignedStats?.reason || 0 },
          presence: { value: state.assignedStats?.presence || 0 },
          luck: { value: state.assignedStats?.luck || 0 }
        },
        skills: {},
        weaponSkills: {}
      },
      items: []
    };

    // Apply builder selections
    const itemUuids = [
      state.selectedAncestry,
      state.selectedClass,
      state.selectedStartingPack,
      ...(state.perks || []),
      ...(state.classPerks || []),
      ...(state.gear || [])
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
  }

  /**
   * Prepare steps array for navigation template
   * @param {object} state - Current builder state
   * @param {object} navigationContext - Navigation context
   * @returns {array} Steps array formatted for template
   */
  _prepareStepsArray(state, navigationContext) {
    const stepOrder = navigationContext.steps || [];

    return stepOrder.map((step, index) => {
      // Special handling for starting-packs step - use Item.starterPack translation
      let label;
      if (step.name === 'starting-packs') {
        label = 'TYPES.Item.starterPack';
      } else {
        // Format step ID for localization (e.g., "class" -> "Class")
        const formattedId = step.name.split('-').map(s =>
          s.charAt(0).toUpperCase() + s.slice(1)
        ).join('');
        label = `VAGABOND.CharBuilder.Steps.${formattedId}`;
      }

      return {
        id: step.name,
        number: index + 1,
        label: label,
        active: step.name === state.currentStep,
        disabled: !step.isAccessible
      };
    });
  }

  /**
   * Get next step name
   * @param {string} currentStep - Current step name
   * @returns {string|null} Next step name or null if last step
   */
  _getNextStepName(currentStep) {
    let stepOrder = [];

    try {
      stepOrder = this.configSystem.getStepOrder();
    } catch (error) {
      // Configuration not loaded yet, use defaults
      stepOrder = ['ancestry', 'class', 'stats', 'perks', 'spells', 'starting-packs', 'gear'];
    }

    const currentIndex = stepOrder.indexOf(currentStep);

    if (currentIndex >= 0 && currentIndex < stepOrder.length - 1) {
      return stepOrder[currentIndex + 1];
    }

    return null;
  }

  /**
   * Render step template (placeholder implementation)
   * @param {string} stepName - Step name
   * @param {object} context - Render context
   * @returns {Promise<string>} Rendered HTML
   */
  async _renderStepTemplate(stepName, context) {
    // This would typically use Handlebars or another template engine
    // For now, return a simple placeholder
    return `<div class="step-content step-${stepName}">
      <h2>${stepName.charAt(0).toUpperCase() + stepName.slice(1)} Step</h2>
      <p>Step content would be rendered here with context.</p>
    </div>`;
  }

  /**
   * Get fallback context in case of errors
   * @param {object} state - Current builder state
   * @returns {object} Fallback context
   */
  _getFallbackContext(state) {
    return {
      error: true,
      currentStep: state?.currentStep || 'ancestry',
      preview: { error: 'Preview unavailable' },
      navigation: { steps: [], canProceed: false },
      sidebar: { error: 'Sidebar unavailable' },
      ui: { 
        currentStep: state?.currentStep || 'ancestry',
        isValid: false,
        canProceed: false,
        showPreview: false,
        theme: 'default'
      }
    };
  }

  /**
   * Clear all caches
   */
  clearCaches() {
    this.contextCache.clear();
    this.renderCache.clear();
    this.lastContextHash = null;
    
    if (this.previewComponent.clearCache) {
      this.previewComponent.clearCache();
    }
    
    if (this.contextComponent.clearCache) {
      this.contextComponent.clearCache();
    }
  }

  /**
   * Enable or disable change detection
   * @param {boolean} enabled - Whether to enable change detection
   */
  setChangeDetection(enabled) {
    this.changeDetection.enabled = enabled;
    
    if (!enabled) {
      this.clearCaches();
    }
  }

  /**
   * Get UI component statistics
   * @returns {object} Component statistics
   */
  getStats() {
    return {
      contextCacheSize: this.contextCache.size,
      renderCacheSize: this.renderCache.size,
      changeDetectionEnabled: this.changeDetection.enabled,
      lastContextHash: this.lastContextHash,
      previewStats: this.previewComponent.getStats ? this.previewComponent.getStats() : null,
      contextStats: this.contextComponent.getStats ? this.contextComponent.getStats() : null,
      performance: this.performanceMetrics || null
    };
  }

  /**
   * Get performance report
   * @returns {object} Performance report
   */
  getPerformanceReport() {
    if (!this.performanceMetrics) {
      return { message: 'No performance data available' };
    }

    const metrics = this.performanceMetrics;
    const report = {
      summary: {
        totalOperations: metrics.totalOperations,
        cacheHitRate: metrics.totalOperations > 0 ? (metrics.cacheHits / metrics.totalOperations * 100).toFixed(1) + '%' : '0%',
        errorRate: metrics.totalOperations > 0 ? (metrics.errors / metrics.totalOperations * 100).toFixed(1) + '%' : '0%'
      },
      operations: {}
    };

    for (const [operation, opMetrics] of metrics.operations.entries()) {
      report.operations[operation] = {
        count: opMetrics.count,
        averageTime: opMetrics.averageTime.toFixed(2) + 'ms',
        minTime: opMetrics.minTime.toFixed(2) + 'ms',
        maxTime: opMetrics.maxTime.toFixed(2) + 'ms',
        cacheHitRate: opMetrics.count > 0 ? (opMetrics.cacheHits / opMetrics.count * 100).toFixed(1) + '%' : '0%',
        errorRate: opMetrics.count > 0 ? (opMetrics.errors / opMetrics.count * 100).toFixed(1) + '%' : '0%'
      };
    }

    return report;
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceMetrics() {
    this.performanceMetrics = {
      operations: new Map(),
      totalOperations: 0,
      cacheHits: 0,
      errors: 0
    };
  }

  /**
   * Optimize caches by removing least recently used entries
   */
  optimizeCaches() {
    const maxCacheSize = 5;
    
    // Optimize context cache
    if (this.contextCache.size > maxCacheSize) {
      const entries = Array.from(this.contextCache.entries());
      const toKeep = entries.slice(-maxCacheSize);
      this.contextCache.clear();
      toKeep.forEach(([key, value]) => this.contextCache.set(key, value));
    }

    // Optimize render cache
    if (this.renderCache.size > maxCacheSize * 2) {
      const entries = Array.from(this.renderCache.entries());
      const toKeep = entries.slice(-maxCacheSize * 2);
      this.renderCache.clear();
      toKeep.forEach(([key, value]) => this.renderCache.set(key, value));
    }

    // Optimize component caches
    if (this.previewComponent.optimizeCache) {
      this.previewComponent.optimizeCache();
    }
    
    if (this.contextComponent.optimizeCache) {
      this.contextComponent.optimizeCache();
    }
  }
}