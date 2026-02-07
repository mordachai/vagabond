/**
 * Custom Active Effect Configuration Sheet for Vagabond
 * Adds application mode selection for controlling when effects apply
 */
export default class VagabondActiveEffectConfig extends foundry.applications.sheets.ActiveEffectConfig {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["vagabond", "active-effect-config"],
    position: { width: 560 }
  };

  /** @override */
  static PARTS = {
    ...super.PARTS,
    vagabondFields: {
      template: "systems/vagabond/templates/effects/active-effect-config-fields.hbs"
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Get current application mode (default to 'permanent')
    const currentMode = this.document.flags.vagabond?.applicationMode || 'permanent';

    // Get smart default based on parent item type
    const parentItem = this.document.parent;
    const smartDefaultKey = parentItem?.type ?
      CONFIG.VAGABOND.defaultApplicationModes[parentItem.type] || 'permanent' :
      'permanent';

    // Add Vagabond-specific context
    context.vagabond = {
      applicationMode: currentMode,
      applicationModes: CONFIG.VAGABOND.effectApplicationModes,
      smartDefaultKey: smartDefaultKey,
      smartDefaultMode: CONFIG.VAGABOND.effectApplicationModes[smartDefaultKey],
      parentItemType: parentItem?.type || null,
      parentItemName: parentItem?.name || null
    };

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);

    // For the vagabondFields part, we don't need additional prep
    // The context is already prepared in _prepareContext

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Add change listener for application mode to show/hide hints
    const modeSelect = this.element.querySelector('[name="flags.vagabond.applicationMode"]');
    if (modeSelect) {
      modeSelect.addEventListener('change', (event) => {
        this._updateApplicationModeHint(event.target.value);
      });

      // Initialize hint on render
      this._updateApplicationModeHint(modeSelect.value);
    }

    // Add formula autocomplete to effect value fields
    this._addFormulaAutocomplete();
  }

  /**
   * Update the hint text when application mode changes
   * @param {string} mode - The selected application mode
   * @private
   */
  _updateApplicationModeHint(mode) {
    const hintElement = this.element.querySelector('.application-mode-hint');
    if (!hintElement) return;

    const modeConfig = CONFIG.VAGABOND.effectApplicationModes[mode];
    if (modeConfig) {
      hintElement.textContent = game.i18n.localize(modeConfig.hint);
    }
  }

  /**
   * Add formula autocomplete to effect value fields
   * @private
   */
  _addFormulaAutocomplete() {
    const valueInputs = this.element.querySelectorAll('input[name^="changes"][name$=".value"]');

    valueInputs.forEach(input => {
      // Create datalist for this input
      const datalistId = `formula-suggestions-${foundry.utils.randomID()}`;
      const datalist = document.createElement('datalist');
      datalist.id = datalistId;

      // Add all formula variables to datalist
      const suggestions = this._getFormulaSuggestions();
      suggestions.forEach(suggestion => {
        const option = document.createElement('option');
        option.value = suggestion.value;
        option.textContent = suggestion.label;
        datalist.appendChild(option);
      });

      // Append datalist and link to input
      input.setAttribute('list', datalistId);
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('placeholder', 'Number or formula (e.g., @attributes.level.value)');
      input.parentElement.appendChild(datalist);

      // Add custom autocomplete behavior for @ symbol
      input.addEventListener('input', (event) => this._handleFormulaInput(event, datalist));
    });
  }

  /**
   * Get all available formula variables for autocomplete
   * @returns {Array<{value: string, label: string}>}
   * @private
   */
  _getFormulaSuggestions() {
    const suggestions = [
      // Attributes (Character Progression)
      { value: '@attributes.level.value', label: 'Character Level' },
      { value: '@attributes.xp', label: 'Experience Points' },
      { value: '@attributes.isSpellcaster', label: 'Is Spellcaster' },
      { value: '@attributes.manaMultiplier', label: 'Mana Multiplier' },
      { value: '@attributes.castingStat', label: 'Casting Stat' },
      { value: '@attributes.manaSkill', label: 'Mana Skill' },
      { value: '@attributes.size', label: 'Size Category' },
      { value: '@attributes.beingType', label: 'Being Type' },

      // Bonuses
      { value: '@bonuses.spellManaCostReduction', label: 'Spell Mana Cost Reduction' },
      { value: '@bonuses.deliveryManaCostReduction', label: 'Delivery Mana Cost Reduction' },
      
      { value: '@meleeDamageDieSizeBonus', label: 'Melee Die Size Bonus' },
      { value: '@rangedDamageDieSizeBonus', label: 'Ranged Die Size Bonus' },
      { value: '@brawlDamageDieSizeBonus', label: 'Brawl Die Size Bonus' },
      { value: '@finesseDamageDieSizeBonus', label: 'Finesse Die Size Bonus' },
      { value: '@spellDamageDieSizeBonus', label: 'Spell Die Size Bonus' },

      { value: '@meleeCritBonus', label: 'Melee Crit Bonus' },
      { value: '@rangedCritBonus', label: 'Ranged Crit Bonus' },
      { value: '@brawlCritBonus', label: 'Brawl Crit Bonus' },
      { value: '@finesseCritBonus', label: 'Finesse Crit Bonus' },
      { value: '@spellCritBonus', label: 'Spell Crit Bonus' },

      { value: '@spellDamageDieSize', label: 'Final Spell Damage Die Size' },

      // Stats (6 Core Stats) - Base Values
      { value: '@might.value', label: 'Might (Base Value)' },
      { value: '@might.total', label: 'Might (Total with Bonuses)' },
      { value: '@dexterity.value', label: 'Dexterity (Base Value)' },
      { value: '@dexterity.total', label: 'Dexterity (Total with Bonuses)' },
      { value: '@awareness.value', label: 'Awareness (Base Value)' },
      { value: '@awareness.total', label: 'Awareness (Total with Bonuses)' },
      { value: '@reason.value', label: 'Reason (Base Value)' },
      { value: '@reason.total', label: 'Reason (Total with Bonuses)' },
      { value: '@presence.value', label: 'Presence (Base Value)' },
      { value: '@presence.total', label: 'Presence (Total with Bonuses)' },
      { value: '@luck.value', label: 'Luck (Base Value)' },
      { value: '@luck.total', label: 'Luck (Total with Bonuses)' },

      // Stats - Alternative Paths
      { value: '@stats.might.value', label: 'Might (Alt Path)' },
      { value: '@stats.might.total', label: 'Might Total (Alt Path)' },
      { value: '@stats.dexterity.value', label: 'Dexterity (Alt Path)' },
      { value: '@stats.dexterity.total', label: 'Dexterity Total (Alt Path)' },
      { value: '@stats.awareness.value', label: 'Awareness (Alt Path)' },
      { value: '@stats.awareness.total', label: 'Awareness Total (Alt Path)' },
      { value: '@stats.reason.value', label: 'Reason (Alt Path)' },
      { value: '@stats.reason.total', label: 'Reason Total (Alt Path)' },
      { value: '@stats.presence.value', label: 'Presence (Alt Path)' },
      { value: '@stats.presence.total', label: 'Presence Total (Alt Path)' },
      { value: '@stats.luck.value', label: 'Luck (Alt Path)' },
      { value: '@stats.luck.total', label: 'Luck Total (Alt Path)' },

      // Skills
      { value: '@skills.arcana.trained', label: 'Arcana Trained' },
      { value: '@skills.arcana.difficulty', label: 'Arcana Difficulty' },
      { value: '@skills.craft.trained', label: 'Craft Trained' },
      { value: '@skills.medicine.trained', label: 'Medicine Trained' },
      { value: '@skills.brawl.trained', label: 'Brawl Trained' },
      { value: '@skills.finesse.trained', label: 'Finesse Trained' },
      { value: '@skills.sneak.trained', label: 'Sneak Trained' },
      { value: '@skills.detect.trained', label: 'Detect Trained' },
      { value: '@skills.mysticism.trained', label: 'Mysticism Trained' },
      { value: '@skills.survival.trained', label: 'Survival Trained' },
      { value: '@skills.influence.trained', label: 'Influence Trained' },
      { value: '@skills.leadership.trained', label: 'Leadership Trained' },
      { value: '@skills.performance.trained', label: 'Performance Trained' },

      // Weapon Skills
      { value: '@weaponSkills.melee.trained', label: 'Melee Trained' },
      { value: '@weaponSkills.brawl.trained', label: 'Brawl Trained' },
      { value: '@weaponSkills.finesse.trained', label: 'Finesse Trained' },
      { value: '@weaponSkills.ranged.trained', label: 'Ranged Trained' },

      // Saves
      { value: '@saves.reflex.difficulty', label: 'Reflex Save Difficulty' },
      { value: '@saves.endure.difficulty', label: 'Endure Save Difficulty' },
      { value: '@saves.will.difficulty', label: 'Will Save Difficulty' },

      // Shorthand
      { value: '@lvl', label: 'Level (Shorthand)' },

      // NPC Only
      { value: '@cr', label: 'Challenge Rating (NPC)' },
      { value: '@hd', label: 'Hit Dice (NPC)' },
      { value: '@threatLevel', label: 'Threat Level (NPC)' },

      // Common Math Functions
      { value: 'floor()', label: 'floor() - Round Down' },
      { value: 'ceil()', label: 'ceil() - Round Up' },
      { value: 'round()', label: 'round() - Round Nearest' },
      { value: 'abs()', label: 'abs() - Absolute Value' },
      { value: 'min(,)', label: 'min(a,b) - Minimum' },
      { value: 'max(,)', label: 'max(a,b) - Maximum' },
    ];

    return suggestions;
  }

  /**
   * Handle input in formula field to show contextual suggestions
   * @param {Event} event - The input event
   * @param {HTMLDataListElement} datalist - The datalist element
   * @private
   */
  _handleFormulaInput(event, datalist) {
    const input = event.target;
    const value = input.value;
    const cursorPos = input.selectionStart;

    // Check if user just typed @ symbol
    if (value[cursorPos - 1] === '@') {
      // Show a hint about autocomplete
      const hint = input.parentElement.querySelector('.formula-hint');
      if (!hint) {
        const hintElement = document.createElement('p');
        hintElement.className = 'hint formula-hint';
        hintElement.textContent = 'Type to see available formula variables...';
        hintElement.style.fontSize = '0.85em';
        hintElement.style.fontStyle = 'italic';
        hintElement.style.marginTop = '4px';
        input.parentElement.appendChild(hintElement);

        // Remove hint after 3 seconds
        setTimeout(() => hintElement.remove(), 3000);
      }
    }
  }
}
