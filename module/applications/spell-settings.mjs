const { api } = foundry.applications;

/**
 * Spell Settings Dialog (ApplicationV2) — GM-only world settings for spell areas.
 * Sets the table-wide defaults (shapes, artwork, default outline + opacity).
 * Players override outline/opacity for themselves in the main settings list;
 * the "Apply to all players" button resets those overrides so everyone adopts
 * the GM defaults.
 */
export class SpellSettings extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'spell-settings',
    tag: 'form',
    classes: ['spell-settings-form'],
    window: {
      title: 'VAGABOND.SpellSettings.Title',
      icon: 'fas fa-wand-magic-sparkles',
      resizable: true
    },
    position: { width: 540, height: 720 },
    actions: {
      forceOnPlayers: SpellSettings.#onForce,
      close: function() { this.close(); }
    },
    form: {
      handler: SpellSettings.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    }
  };

  static PARTS = {
    form: {
      template: 'systems/vagabond/templates/apps/spell-settings.hbs',
      scrollable: ['.scrollable']
    }
  };

  /** Curated PIXI blend modes exposed in the UI. */
  static BLEND_MODES = ['NORMAL', 'ADD', 'SCREEN', 'MULTIPLY', 'OVERLAY'];

  /** @override */
  async _prepareContext(_options) {
    const g = (k) => game.settings.get('vagabond', k);
    const L = (k) => game.i18n.localize(k);
    // const blendMode = g('regionTextureBlendMode'); // blend mode UI hidden for now
    const highlightMode = g('regionHighlightMode');
    const borderMode = g('regionBorderMode');
    const borderModeUser = g('regionBorderModeUser');

    return {
      isGM: game.user.isGM,

      // ── Per-player: Spell Cast Dialog ──────────────────────────────────────
      useSpellCastDialog: g('useSpellCastDialog'),
      spellCastDialogDarkness: g('spellCastDialogDarkness'),
      spellCastDialogBlur: g('spellCastDialogBlur'),
      hideCastRings: g('hideCastRings'),

      // ── Per-player: Your Area Display ──────────────────────────────────────
      borderModesUser: [
        { value: 'inherit', label: L('VAGABOND.SpellSettings.BorderMode.inherit'), selected: borderModeUser === 'inherit' },
        { value: 'player', label: L('VAGABOND.SpellSettings.BorderMode.player'), selected: borderModeUser === 'player' },
        { value: 'hide', label: L('VAGABOND.SpellSettings.BorderMode.hide'), selected: borderModeUser === 'hide' },
        { value: 'default', label: L('VAGABOND.SpellSettings.BorderMode.default'), selected: borderModeUser === 'default' }
      ],
      regionTextureAlphaUseGM: g('regionTextureAlphaUseGM'),
      regionTextureAlphaUser: g('regionTextureAlphaUser'),

      // ── World (GM only): Spell area shapes ─────────────────────────────────
      highlightModes: [
        { value: 'shapes', label: L('VAGABOND.Settings.regionHighlightMode.shapes'), selected: highlightMode === 'shapes' },
        { value: 'coverage', label: L('VAGABOND.Settings.regionHighlightMode.coverage'), selected: highlightMode === 'coverage' }
      ],
      regionUseTextures: g('regionUseTextures'),
      // World (GM only): Player defaults (table-wide)
      borderModes: [
        { value: 'player', label: L('VAGABOND.SpellSettings.BorderMode.player'), selected: borderMode === 'player' },
        { value: 'hide', label: L('VAGABOND.SpellSettings.BorderMode.hide'), selected: borderMode === 'hide' },
        { value: 'default', label: L('VAGABOND.SpellSettings.BorderMode.default'), selected: borderMode === 'default' }
      ],
      regionTextureAlpha: g('regionTextureAlpha'),
      // World (GM only): Area artwork
      regionTextureHideFill: g('regionTextureHideFill'),
      // blendModes: SpellSettings.BLEND_MODES.map(m => ({ value: m, label: m, selected: blendMode === m })), // blend mode UI hidden for now
      regionTextureAnimate: g('regionTextureAnimate'),
      regionTextureSpinSpeed: g('regionTextureSpinSpeed'),
      regionTextureScrollSpeed: g('regionTextureScrollSpeed')
    };
  }

  /** Registered default for a setting key — single source of truth, no hardcoded copies. */
  static #def(key) {
    return game.settings.settings.get(`vagabond.${key}`)?.default;
  }

  /** Parse a numeric form value, falling back to the registered default. */
  static #num(value, key) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : SpellSettings.#def(key);
  }

  /** Clamp a numeric form value into [min, max], falling back to the registered default. */
  static #clampNum(value, key, min, max) {
    return Math.clamp(SpellSettings.#num(value, key), min, max);
  }

  /** Persist the per-player (client) settings from a parsed form-data object. Runs for everyone. */
  static async #applyClient(data) {
    const set = (k, v) => game.settings.set('vagabond', k, v);
    // Spell Cast Dialog
    await set('useSpellCastDialog', !!data.useSpellCastDialog);
    await set('spellCastDialogDarkness', SpellSettings.#clampNum(data.spellCastDialogDarkness, 'spellCastDialogDarkness', 0, 100));
    await set('spellCastDialogBlur', SpellSettings.#clampNum(data.spellCastDialogBlur, 'spellCastDialogBlur', 0, 5));
    await set('hideCastRings', !!data.hideCastRings);
    // Your Area Display
    await set('regionBorderModeUser', data.regionBorderModeUser || SpellSettings.#def('regionBorderModeUser'));
    await set('regionTextureAlphaUseGM', !!data.regionTextureAlphaUseGM);
    await set('regionTextureAlphaUser', SpellSettings.#clampNum(data.regionTextureAlphaUser, 'regionTextureAlphaUser', 0, 1));
  }

  /** Persist the world (GM) settings from a parsed form-data object. */
  static async #applyWorld(data) {
    const set = (k, v) => game.settings.set('vagabond', k, v);
    const def = SpellSettings.#def;
    await set('regionHighlightMode', data.regionHighlightMode || def('regionHighlightMode'));
    await set('regionUseTextures', !!data.regionUseTextures);
    await set('regionBorderMode', data.regionBorderMode || def('regionBorderMode'));
    await set('regionTextureAlpha', Math.clamp(SpellSettings.#num(data.regionTextureAlpha, 'regionTextureAlpha'), 0, 1));
    await set('regionTextureHideFill', !!data.regionTextureHideFill);
    // await set('regionTextureBlendMode', data.regionTextureBlendMode || def('regionTextureBlendMode')); // blend mode UI hidden for now
    await set('regionTextureAnimate', !!data.regionTextureAnimate);
    await set('regionTextureSpinSpeed', SpellSettings.#num(data.regionTextureSpinSpeed, 'regionTextureSpinSpeed'));
    await set('regionTextureScrollSpeed', SpellSettings.#num(data.regionTextureScrollSpeed, 'regionTextureScrollSpeed'));
  }

  /** Handle form submission. Everyone saves their client prefs; GMs also save world settings. */
  static async #onSubmit(event, form, formData) {
    event.preventDefault();
    await SpellSettings.#applyClient(formData.object);
    if (game.user.isGM) await SpellSettings.#applyWorld(formData.object);
    ui.notifications.info(game.i18n.localize('VAGABOND.SpellSettings.SaveSuccess'));
  }

  /**
   * Save current settings, then bump the force counter so every connected client
   * drops their personal outline/opacity overrides and adopts these GM defaults.
   */
  static async #onForce(event) {
    event.preventDefault();
    const ok = await api.DialogV2.confirm({
      window: { title: game.i18n.localize('VAGABOND.SpellSettings.ForceTitle') },
      content: `<p>${game.i18n.localize('VAGABOND.SpellSettings.ForceConfirm')}</p>`
    });
    if (!ok) return;
    const data = new foundry.applications.ux.FormDataExtended(this.element).object;
    await SpellSettings.#applyClient(data);
    await SpellSettings.#applyWorld(data);
    await game.settings.set('vagabond', 'regionForcePush', (game.settings.get('vagabond', 'regionForcePush') || 0) + 1);
    this.close();
  }
}
