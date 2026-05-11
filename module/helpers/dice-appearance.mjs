/**
 * Helper class for customizing dice appearance with Dice So Nice
 * Applies colorset tags to favor/hinder dice that players can configure in their Dice So Nice settings
 */
export class VagabondDiceAppearance {
  /**
   * Evaluate and roll with favor/hinder dice customization
   * @param {Roll} roll - The unevaluated roll
   * @param {string} favorHinder - 'favor', 'hinder', or 'none'
   * @param {object} messageOptions - Options for ChatMessage.create()
   * @returns {Promise<Roll>} The evaluated roll
   */
  static async evaluateWithCustomColors(roll, favorHinder, messageOptions = {}) {
    // If Dice So Nice is active and we have favor/hinder, customize the dice appearance BEFORE evaluating
    if (game.dice3d && favorHinder !== 'none') {
      // Tag the favor/hinder d6 dice with custom colorset
      let foundD6 = false;

      for (const term of roll.terms) {
        if (term instanceof foundry.dice.terms.DiceTerm && term.faces === 6 && !foundD6) {
          // This is the favor/hinder die - set the colorset directly
          term.options.colorset = favorHinder === 'favor' ? 'vagabond_favor' : 'vagabond_hinder';
          foundD6 = true;
        }
      }
    }

    // Evaluate the roll (Dice So Nice will be shown manually in damage-helper.mjs)
    await roll.evaluate();
    return roll;
  }

  /**
   * Merge live world-setting overrides over the code-level defaults.
   * Returns the effective entry for a single damage type, or null if not configured.
   */
  static _effectiveDamageEntry(damageTypeKey) {
    const def = CONFIG.VAGABOND?.damageTypeDsnAppearance?.[damageTypeKey];
    let override;
    try {
      const raw = game.settings.get('vagabond', 'dsnDamageAppearance') ?? {};
      override = foundry.utils.expandObject(raw)?.[damageTypeKey];
    } catch { /* setting may not be registered yet */ }
    if (!def && !override) return null;
    return foundry.utils.mergeObject(
      foundry.utils.deepClone(def ?? {}),
      override ?? {},
      { inplace: false }
    );
  }

  /**
   * Apply per-damage-type DSN appearance to every DiceTerm in a damage roll.
   * Reads CONFIG.VAGABOND.damageTypeDsnAppearance (merged with world setting
   * `dsnDamageAppearance`) and sets colorset / texture / material on each
   * die term. Must be called BEFORE roll.evaluate().
   * @param {Roll} roll - The unevaluated damage roll
   * @param {string} damageTypeKey - The damage type key (e.g. 'fire', 'slashing')
   */
  static applyDamageColorset(roll, damageTypeKey) {
    if (!game.dice3d || !roll || !damageTypeKey || damageTypeKey === '-') return;
    const cfg = VagabondDiceAppearance._effectiveDamageEntry(damageTypeKey);
    if (!cfg) return;
    // Non-elemental types use a pre-registered bundled colorset
    // (vagabond_dmg_<key>) containing texture+material baked in.
    // Elemental types use the built-in DSN colorset name in cfg.colorset.
    const colorsetName = cfg.custom ? `vagabond_dmg_${damageTypeKey}` : cfg.colorset;
    if (!colorsetName) return;
    for (const term of roll.terms) {
      if (!(term instanceof foundry.dice.terms.DiceTerm)) continue;
      term.options.colorset = colorsetName;
    }
  }

  /**
   * Register bundled colorsets for non-elemental damage types with DSN.
   * Each non-elemental entry in CONFIG.VAGABOND.damageTypeDsnAppearance
   * with `custom: true` becomes a colorset `vagabond_dmg_<key>` carrying its
   * color palette, texture, and material together so per-die assignment via
   * `term.options.colorset` produces all three effects at render time.
   * Must run after diceSoNiceReady hook.
   */
  static registerDamageColorsets() {
    if (!game.dice3d) return;
    const defaults = CONFIG.VAGABOND?.damageTypeDsnAppearance ?? {};
    let overrides = {};
    try {
      overrides = foundry.utils.expandObject(game.settings.get('vagabond', 'dsnDamageAppearance') ?? {});
    } catch { /* setting may not exist yet */ }
    const keys = new Set([...Object.keys(defaults), ...Object.keys(overrides)]);
    for (const key of keys) {
      const cfg = foundry.utils.mergeObject(
        foundry.utils.deepClone(defaults[key] ?? {}),
        overrides[key] ?? {},
        { inplace: false }
      );
      if (!cfg?.custom) continue;
      try {
        game.dice3d.addColorset({
          name: `vagabond_dmg_${key}`,
          description: `Vagabond — ${key}`,
          category: 'VAGABOND.DiceSoNice.DamageCategory',
          foreground: cfg.foreground ?? '#ffffff',
          background: cfg.background ?? '#000000',
          outline:    cfg.outline    ?? cfg.background ?? '#000000',
          edge:       cfg.edge       ?? cfg.outline    ?? '#000000',
          texture:    cfg.texture    ?? 'none',
          material:   cfg.material   ?? 'auto'
        }, 'default');
      } catch (err) {
        console.error(`Vagabond | Failed to register damage colorset for ${key}:`, err);
      }
    }
  }

  /**
   * Register custom colorsets with Dice So Nice
   * Called during system initialization (ready hook)
   */
  static registerColorsets() {
    if (!game.dice3d) {
      return;
    }

    try {
      // Register favor colorset (green)
      game.dice3d.addColorset({
        name: 'vagabond_favor',
        description: 'VAGABOND.DiceSoNice.Favor',
        category: 'VAGABOND.DiceSoNice.Category',
        foreground: '#ffffff',
        background: '#22c55e',
        outline: '#16a34a',
        texture: 'none',
        edge: '#16a34a'
      }, 'default');

      // Register hinder colorset (red)
      game.dice3d.addColorset({
        name: 'vagabond_hinder',
        description: 'VAGABOND.DiceSoNice.Hinder',
        category: 'VAGABOND.DiceSoNice.Category',
        foreground: '#ffffff',
        background: '#ef4444',
        outline: '#dc2626',
        texture: 'none',
        edge: '#dc2626'
      }, 'default');

    } catch (error) {
      console.error('Vagabond | Failed to register Dice So Nice colorsets:', error);
    }
  }
}
