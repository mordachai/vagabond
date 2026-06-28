/**
 * Extend the base Actor document by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class VagabondActor extends Actor {

  /** @override */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    // Set default prototype token for characters
    if (data.type === 'character') {
      this.updateSource({
        'prototypeToken.disposition': CONST.TOKEN_DISPOSITIONS.FRIENDLY, // 1
        'prototypeToken.actorLink': true
      });
    }
  }

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
    // Get all effects from the actor itself
    const actorEffects = Array.from(this.effects);

    // Get all effects from owned items (including class items)
    const itemEffects = [];
    for (const item of this.items) {
      // Include effects from all item types, especially class items
      for (const effect of item.effects) {
        itemEffects.push(effect);
      }
    }

    // Combine all effects
    const allEffects = [...actorEffects, ...itemEffects];

    // Filter based on application mode
    const filteredEffects = allEffects.filter(effect => {
      const applicationMode = effect.flags.vagabond?.applicationMode || 'permanent';

      // Skip "on-use" effects - they're applied manually during rolls
      if (applicationMode === 'on-use') {
        return false;
      }

      // For "when-equipped" effects, check if the parent item is equipped
      if (applicationMode === 'when-equipped') {
        const parentItem = effect.parent;
        if (!parentItem) return false; // No parent, can't check equipped state

        // Use system.equipped (boolean) — reliable for ALL equipment types:
        //   Weapons:      computed in _prepareWeaponData() from equipmentState
        //   Armor/gear/relics: a direct BooleanField toggled by the user
        // Do NOT use equipmentState directly — it stays 'unequipped' for armor/gear
        // even when the item is equipped, which would incorrectly block the effect.
        const equipped = parentItem.system?.equipped;
        if (equipped === undefined || equipped === null) return true; // No equipped field → assume applies
        return equipped === true;
      }

      // "permanent" effects always apply (including class effects)
      return true;
    });

    return filteredEffects;
  }

  /** @override */
  prepareBaseData() {
    super.prepareBaseData(); // resets _completedActiveEffectPhases via Actor._clearData()
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

        // Apply the change based on mode.
        // v14: change.mode is a string (CONST.ACTIVE_EFFECT_CHANGE_TYPES);
        // v13 fallback: CONST.ACTIVE_EFFECT_MODES (numeric). Accessing the v14
        // constant first avoids the deprecation warning on v14.
        const MODES = CONST.ACTIVE_EFFECT_CHANGE_TYPES ?? CONST.ACTIVE_EFFECT_MODES;
        switch (mode) {
          case MODES.ADD:
            target[finalKey] = currentValue + Number(value);
            break;
          case MODES.MULTIPLY:
            target[finalKey] = currentValue * Number(value);
            break;
          case MODES.OVERRIDE:
            target[finalKey] = Number(value);
            break;
          case MODES.DOWNGRADE:
            target[finalKey] = Math.min(currentValue, Number(value));
            break;
          case MODES.UPGRADE:
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
    // super.getRollData() returns the LIVE this.system reference. Spread + deepClone it
    // so formulas, Rolls, and external modules cannot mutate actor data through the
    // returned object. This also makes every derived value (speed, health.max, armor,
    // mana, focus, …) available as `@<field>` — they ride along on the system spread.
    const data = foundry.utils.deepClone({ ...super.getRollData() });
    Object.assign(data, this.system.getRollData?.() ?? null);

    // Expose active status conditions to formulas on EVERY actor type: @statuses.<id>
    // (e.g. `(@statuses.berserk) ? 2 : 0`). Centralized here so NPCs get it too.
    data.statuses ??= {};
    if (this.statuses) for (const id of this.statuses) data.statuses[id] = 1;

    // Expose progress clocks for formulas/AE: @clocks.<handle>.value, .pct, .max, etc.
    const PC = globalThis.vagabond?.documents?.ProgressClock;
    if (PC) data.clocks = PC.rollDataMap();
    return data;
  }

  /**
   * Stable, read-only snapshot of an actor's commonly-needed derived values, intended
   * for external modules and macros. Decouples callers from the internal `system.*`
   * layout (which can change between versions) and normalizes per-type differences
   * (e.g. character speed is an object, NPC speed is a plain number). Returns freshly
   * built objects — safe to mutate without touching actor data.
   *
   * @param {Actor|TokenDocument|Token|string} ref  Actor, Token(Document), uuid, or actor id.
   * @returns {object|null}  Snapshot, or null if the actor cannot be resolved.
   */
  static read(ref) {
    let actor = null;
    if (ref instanceof Actor) actor = ref;
    else if (ref?.actor instanceof Actor) actor = ref.actor;          // Token / TokenDocument
    else if (typeof ref === 'string') {
      actor = game.actors?.get(ref) ?? null;
      if (!actor) { const d = fromUuidSync(ref); actor = (d?.actor ?? (d instanceof Actor ? d : null)); }
    }
    if (!actor) return null;

    const s = actor.system ?? {};
    const snap = {
      id: actor.id,
      uuid: actor.uuid,
      name: actor.name,
      type: actor.type,
      level: s.attributes?.level?.value ?? null,
      health: { value: s.health?.value ?? null, max: s.health?.max ?? null },
      fatigue: { value: s.fatigue ?? null, max: s.fatigueMax ?? null },
      armor: typeof s.armor === 'number' ? s.armor : null,
      // Character speed is { base, raw, bonus, crawl, travel }; NPC speed is a number.
      speed: typeof s.speed === 'number' ? { base: s.speed } : (s.speed ? { ...s.speed } : null),
      statuses: Array.from(actor.statuses ?? []),
    };
    if (s.mana)  snap.mana  = { current: s.mana.current ?? null, max: s.mana.max ?? null, castingMax: s.mana.castingMax ?? null };
    if (s.focus) snap.focus = { current: s.focus.current ?? null, max: s.focus.max ?? null };
    if (s.maxLuck != null || s.currentLuck != null) snap.luck = { current: s.currentLuck ?? null, max: s.maxLuck ?? null };
    if (s.stats)  snap.stats  = Object.fromEntries(Object.entries(s.stats).map(([k, v]) => [k, v?.total ?? null]));
    if (s.saves)  snap.saves  = Object.fromEntries(Object.entries(s.saves).map(([k, v]) => [k, v?.difficulty ?? null]));
    if (s.skills) snap.skills = Object.fromEntries(Object.entries(s.skills).map(([k, v]) => [k, v?.difficulty ?? null]));
    return snap;
  }
}