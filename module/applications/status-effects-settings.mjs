const { api } = foundry.applications;

/**
 * Status Effects Settings (ApplicationV2) — GM-only world settings that govern
 * how status conditions behave and display. Groups three settings that were
 * previously loose in the main settings list:
 *   - `statusEffectsMode`   — which condition set the system exposes (reload)
 *   - `statusRingEffects`   — animated token-ring effects per status (reload)
 *   - `tokenStatusDisplay`  — where active conditions render (live)
 *
 * Two of the three require a world reload; on save we prompt for it only when a
 * reload-bound value actually changed. `tokenStatusDisplay` applies live.
 */
export class StatusEffectsSettings extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'vbd-status-effects-settings',
    tag: 'form',
    classes: ['vbd-status-effects-settings'],
    window: {
      title: 'VAGABOND.StatusSettings.Title',
      icon: 'fas fa-bolt',
      resizable: true,
    },
    position: { width: 520, height: 'auto' },
    form: {
      handler: StatusEffectsSettings.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true,
    },
  };

  static PARTS = {
    form: {
      template: 'systems/vagabond/templates/apps/status-effects-settings.hbs',
      scrollable: ['.scrollable'],
    },
  };

  /** Settings that, when changed, require a world reload to take effect. */
  static RELOAD_KEYS = ['statusEffectsMode', 'statusRingEffects'];

  /** @override */
  async _prepareContext(_options) {
    const g = (k) => game.settings.get('vagabond', k);
    const L = (k) => game.i18n.localize(k);

    const mode = g('statusEffectsMode');
    const display = g('tokenStatusDisplay');

    return {
      statusEffectsModes: [
        { value: 'vagabond', label: L('VAGABOND.Settings.statusEffectsMode.vagabond'), selected: mode === 'vagabond' },
        { value: 'foundry', label: L('VAGABOND.Settings.statusEffectsMode.foundry'), selected: mode === 'foundry' },
      ],
      statusRingEffects: g('statusRingEffects'),
      tokenStatusDisplays: [
        { value: 'none', label: L('VAGABOND.Settings.tokenStatusDisplay.none'), selected: display === 'none' },
        { value: 'tokens', label: L('VAGABOND.Settings.tokenStatusDisplay.tokens'), selected: display === 'tokens' },
        { value: 'left', label: L('VAGABOND.Settings.tokenStatusDisplay.left'), selected: display === 'left' },
        { value: 'right', label: L('VAGABOND.Settings.tokenStatusDisplay.right'), selected: display === 'right' },
      ],
    };
  }

  /** Persist all three world settings; prompt for reload only if a reload-bound value changed. */
  static async #onSubmit(event, form, formData) {
    event.preventDefault();
    const raw = formData.object;
    const before = Object.fromEntries(
      StatusEffectsSettings.RELOAD_KEYS.map(k => [k, game.settings.get('vagabond', k)])
    );

    await game.settings.set('vagabond', 'statusEffectsMode', raw.statusEffectsMode || 'vagabond');
    await game.settings.set('vagabond', 'statusRingEffects', !!raw.statusRingEffects);
    await game.settings.set('vagabond', 'tokenStatusDisplay', raw.tokenStatusDisplay || 'tokens');

    const needsReload = StatusEffectsSettings.RELOAD_KEYS.some(
      k => before[k] !== game.settings.get('vagabond', k)
    );
    if (needsReload) {
      const SC = foundry.applications?.settings?.SettingsConfig ?? globalThis.SettingsConfig;
      await SC?.reloadConfirm?.({ world: true });
    }
  }
}
