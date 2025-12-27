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
}
