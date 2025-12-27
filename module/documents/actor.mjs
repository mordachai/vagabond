/**
 * Extend the base Actor document by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class VagabondActor extends Actor {

  /** @override */
  static getDefaultArtwork(actorData) {
    // 1. Check if the actor being created is an NPC
    if (actorData.type === "npc") {
      // 2. HARDCODE the path here to ensure no config errors
      const img = "systems/vagabond/assets/ui/default-npc.svg";
      
      return {
        img: img,
        texture: { src: img }
      };
    }

    // 3. Fallback for characters or other types
    return super.getDefaultArtwork(actorData);
  }

  /** @override */
  prepareData() {
    // Prepare data for the actor. Calling the super version of this executes
    // the following, in order: data reset (to clear active effects),
    // prepareBaseData(), prepareEmbeddedDocuments() (including active effects),
    // prepareDerivedData().
    super.prepareData();
  }

  /** @override */
  allApplicableEffects() {
    // Get all effects from parent implementation
    const allEffects = super.allApplicableEffects();

    // Filter based on application mode
    return allEffects.filter(effect => {
      const applicationMode = effect.flags.vagabond?.applicationMode || 'permanent';

      // Skip "on-use" effects - they're applied manually during rolls
      if (applicationMode === 'on-use') {
        return false;
      }

      // For "when-equipped" effects, check if the parent item is equipped
      if (applicationMode === 'when-equipped') {
        const parentItem = effect.parent;
        if (!parentItem) return false; // No parent, can't check equipped state

        // Check if item is equipped
        const equipmentState = parentItem.system?.equipmentState;
        if (!equipmentState) return true; // No equipment state, assume equipped

        // Item must be in an equipped state (not 'unequipped')
        return equipmentState !== 'unequipped';
      }

      // "permanent" effects always apply
      return true;
    });
  }

  /** @override */
  prepareBaseData() {
    // Data modifications in this step occur before processing embedded
    // documents or derived data.
  }

  /**
   * @override
   * Augment the actor source data with additional dynamic data that isn't
   * handled by the actor's DataModel. Data calculated in this step should be
   * available both inside and outside of character sheets.
   */
  prepareDerivedData() {
    // ---------------------------------------------------------------
    // TRIGGER DATA MODEL CALCULATIONS
    // This calls this.system.prepareDerivedData() automatically.
    // Class data is already loaded in the DataModel's prepareBaseData(),
    // and Active Effects have been applied between prepareBaseData and here.
    // ---------------------------------------------------------------
    super.prepareDerivedData();

    // ---------------------------------------------------------------
    // Flags and other post-calculation logic
    // ---------------------------------------------------------------
    const actorData = this;
    const flags = actorData.flags.vagabond || {};
  }

  /**
   * Get "on-use" active effects from a specific item
   * These are effects that only apply when making rolls with that item
   * @param {Item} item - The item being used
   * @returns {Array<ActiveEffect>} Array of applicable on-use effects
   */
  getItemEffects(item) {
    if (!item) return [];

    // Get all effects from this item that have "on-use" application mode
    const itemEffects = item.effects.filter(effect => {
      const applicationMode = effect.flags.vagabond?.applicationMode || 'permanent';
      return applicationMode === 'on-use';
    });

    return Array.from(itemEffects);
  }

  /**
   * Apply temporary effect changes to roll data
   * This creates a temporary modified copy of actor data with item effects applied
   * @param {Item} item - The item whose effects should be applied
   * @returns {Object} Modified roll data with item effects
   */
  getRollDataWithItemEffects(item) {
    const baseRollData = this.getRollData();
    const itemEffects = this.getItemEffects(item);

    if (itemEffects.length === 0) {
      return baseRollData;
    }

    // Create a shallow copy of the roll data to modify
    const modifiedData = foundry.utils.deepClone(baseRollData);

    // Apply each effect's changes
    for (const effect of itemEffects) {
      for (const change of effect.changes) {
        let { key, mode, value } = change;

        // IMPORTANT: Active Effect keys are document paths (e.g., "system.critNumber")
        // But rollData is flattened (e.g., "critNumber" at top level)
        // Strip "system." prefix if present
        if (key.startsWith('system.')) {
          key = key.substring(7); // Remove "system." prefix
        }

        // Parse the key to navigate the data structure
        const parts = key.split('.');
        let target = modifiedData;

        // Navigate to the parent object
        for (let i = 0; i < parts.length - 1; i++) {
          if (!(parts[i] in target)) {
            target[parts[i]] = {};
          }
          target = target[parts[i]];
        }

        const finalKey = parts[parts.length - 1];
        const currentValue = target[finalKey] ?? 0;

        // Apply the change based on mode
        switch (mode) {
          case CONST.ACTIVE_EFFECT_MODES.ADD:
            target[finalKey] = currentValue + Number(value);
            break;
          case CONST.ACTIVE_EFFECT_MODES.MULTIPLY:
            target[finalKey] = currentValue * Number(value);
            break;
          case CONST.ACTIVE_EFFECT_MODES.OVERRIDE:
            target[finalKey] = Number(value);
            break;
          case CONST.ACTIVE_EFFECT_MODES.DOWNGRADE:
            target[finalKey] = Math.min(currentValue, Number(value));
            break;
          case CONST.ACTIVE_EFFECT_MODES.UPGRADE:
            target[finalKey] = Math.max(currentValue, Number(value));
            break;
        }
      }
    }

    return modifiedData;
  }

  /**
   * @override
   * Augment the actor's default getRollData() method by appending the data object
   * generated by the its DataModel's getRollData(), or null. This polymorphic
   * approach is useful when you have actors & items that share a parent Document,
   * but have slightly different data preparation needs.
   */
  getRollData() {
    return { ...super.getRollData(), ...(this.system.getRollData?.() ?? null) };
  }
}