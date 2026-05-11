import { VagabondDiceAppearance } from '../helpers/dice-appearance.mjs';

const { api } = foundry.applications;

const DSN_TEXTURES = [
  'none', 'cloudy', 'cloudy_2', 'fire', 'marble', 'water', 'water_2',
  'ice', 'ice_2', 'paper', 'speckles', 'glitter', 'glitter_2', 'stars',
  'stainedglass', 'skulls', 'leopard', 'tiger', 'cheetah', 'dragon',
  'lizard', 'bird', 'astral', 'wood', 'metal', 'stone', 'radial',
  'bronze01', 'bronze02', 'bronze03', 'bronze04', 'brick', 'fiber',
  'fuel', 'watercolor', 'alienrock', 'hell', 'lava', 'portal', 'tile'
];

const DSN_MATERIALS = [
  'auto', 'chrome', 'glass', 'iridescent', 'metal', 'plastic',
  'pristine', 'stone', 'wood'
];

const DSN_STOCK_COLORSETS = [
  'acid', 'fire', 'lightning', 'cold', 'poison', 'necrotic', 'psychic',
  'force', 'radiant', 'thunder',
  'black', 'blue', 'cyan', 'green', 'grey', 'pink', 'rainbow', 'random',
  'red', 'white', 'yellow'
];

const COLOR_FIELDS = ['foreground', 'background', 'outline', 'edge'];

// <input type="color"> only accepts #rrggbb. Coerce any other value to a fallback
// so the picker doesn't warn and doesn't fall back to black silently.
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
function _safeHex(value, fallback) {
  return (typeof value === 'string' && HEX_RE.test(value)) ? value : fallback;
}

const DEFAULT_ENTRY = {
  custom: true,
  foreground: '#ffffff',
  background: '#888888',
  outline: '#000000',
  edge: '#000000',
  texture: 'none',
  material: 'auto',
  colorset: ''
};

export class DsnDamageAppearanceConfig extends api.HandlebarsApplicationMixin(api.ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: 'dsn-damage-appearance-config',
    tag: 'form',
    classes: ['dsn-damage-appearance-form'],
    window: {
      title: 'VAGABOND.DsnDamage.Title',
      icon: 'fas fa-dice-d20',
      resizable: true,
    },
    position: { width: 820, height: 700 },
    actions: {
      previewType:   DsnDamageAppearanceConfig.#onPreview,
      resetType:     DsnDamageAppearanceConfig.#onResetType,
      resetAll:      DsnDamageAppearanceConfig.#onResetAll,
      saveAndClose:  DsnDamageAppearanceConfig.#onSaveAndClose,
      close:         function () { this.close(); },
    },
    form: {
      handler: DsnDamageAppearanceConfig.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false,
    },
  };

  static PARTS = {
    form: {
      template: 'systems/vagabond/templates/apps/dsn-damage-appearance-config.hbs',
      scrollable: ['.dsn-dmg-scroll'],
    },
  };

  async _prepareContext(options) {
    const defaults = CONFIG.VAGABOND?.damageTypeDsnAppearance ?? {};
    const raw      = game.settings.get('vagabond', 'dsnDamageAppearance') ?? {};
    const stored   = foundry.utils.expandObject(raw);

    const types = Object.entries(CONFIG.VAGABOND?.damageTypes ?? {})
      .filter(([k]) => k !== '-')
      .map(([key, labelKey]) => {
        const def    = defaults[key] ?? {};
        const live   = stored[key] ?? {};
        const merged = foundry.utils.mergeObject(
          foundry.utils.deepClone(DEFAULT_ENTRY),
          foundry.utils.mergeObject(def, live, { inplace: false }),
          { inplace: false }
        );
        return {
          key,
          label: typeof labelKey === 'string' && labelKey.startsWith('VAGABOND.')
            ? game.i18n.localize(labelKey)
            : labelKey,
          custom:     merged.custom !== false,
          colorset:   merged.colorset ?? '',
          foreground: _safeHex(merged.foreground, '#ffffff'),
          background: _safeHex(merged.background, '#888888'),
          outline:    _safeHex(merged.outline,    '#000000'),
          edge:       _safeHex(merged.edge,       '#000000'),
          texture:    merged.texture,
          material:   merged.material,
        };
      });

    return {
      types,
      textures:  DSN_TEXTURES,
      materials: DSN_MATERIALS,
      stockColorsets: DSN_STOCK_COLORSETS,
      dsnAvailable: !!game.dice3d,
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    // Live-toggle: when "Custom" checkbox flips, enable/disable the stock-colorset select on that row.
    for (const row of this.element.querySelectorAll('.dsn-dmg-row')) {
      const customCb = row.querySelector('input[type="checkbox"][name$=".custom"]');
      const colorSel = row.querySelector('select.dsn-dmg-colorset');
      if (!customCb || !colorSel) continue;
      customCb.addEventListener('change', () => {
        colorSel.disabled = customCb.checked;
        row.classList.toggle('mode-stock', !customCb.checked);
      });
      row.classList.toggle('mode-stock', !customCb.checked);
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  static async #onPreview(event, target) {
    const key = target.dataset.key;
    if (!game.dice3d) {
      ui.notifications.warn('Dice So Nice is not active.');
      return;
    }
    await DsnDamageAppearanceConfig.#applyLiveFormToConfig.call(this);
    VagabondDiceAppearance.registerDamageColorsets();

    const roll = new Roll('2d6');
    VagabondDiceAppearance.applyDamageColorset(roll, key);
    await roll.evaluate();
    game.dice3d.showForRoll(roll, game.user, true);
  }

  static async #onResetType(event, target) {
    const key = target.dataset.key;
    const raw = game.settings.get('vagabond', 'dsnDamageAppearance') ?? {};
    const data = foundry.utils.expandObject(raw);
    delete data[key];
    await game.settings.set('vagabond', 'dsnDamageAppearance', data);
    VagabondDiceAppearance.registerDamageColorsets();
    ui.notifications.info(`Reset "${key}" to defaults.`);
    this.render();
  }

  static async #onResetAll() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'VAGABOND.DsnDamage.ResetAllTitle' },
      content: `<p>${game.i18n.localize('VAGABOND.DsnDamage.ResetAllConfirm')}</p>`,
    });
    if (!confirmed) return;
    await game.settings.set('vagabond', 'dsnDamageAppearance', {});
    VagabondDiceAppearance.registerDamageColorsets();
    ui.notifications.info(game.i18n.localize('VAGABOND.DsnDamage.ResetDone'));
    this.render();
  }

  static async #onSaveAndClose() {
    await DsnDamageAppearanceConfig.#performSave.call(this);
    this.close({ force: true });
  }

  static async #onSubmit(event, form, formData) {
    await DsnDamageAppearanceConfig.#performSave.call(this, formData);
    this.render();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * Read live form values without persisting — used by preview so user sees
   * unsaved edits in the 3D roll.
   */
  static async #applyLiveFormToConfig() {
    const raw  = new foundry.applications.ux.FormDataExtended(this.element).object;
    const data = foundry.utils.expandObject(raw);
    const cleaned = DsnDamageAppearanceConfig.#normalize(data);
    // Overlay live form onto runtime CONFIG so registerDamageColorsets picks up edits
    const merged = foundry.utils.mergeObject(
      foundry.utils.deepClone(CONFIG.VAGABOND.damageTypeDsnAppearance ?? {}),
      cleaned,
      { inplace: false }
    );
    CONFIG.VAGABOND.damageTypeDsnAppearance = merged;
  }

  static async #performSave(formData) {
    const raw = formData
      ? formData.object
      : new foundry.applications.ux.FormDataExtended(this.element).object;
    const data    = foundry.utils.expandObject(raw);
    const cleaned = DsnDamageAppearanceConfig.#normalize(data);
    await game.settings.set('vagabond', 'dsnDamageAppearance', cleaned);
    // Rebuild runtime CONFIG so applyDamageColorset/registerDamageColorsets pick up changes
    const defaults = CONFIG.VAGABOND.damageTypeDsnAppearance ?? {};
    CONFIG.VAGABOND.damageTypeDsnAppearance = foundry.utils.mergeObject(
      foundry.utils.deepClone(defaults),
      cleaned,
      { inplace: false }
    );
    VagabondDiceAppearance.registerDamageColorsets();
    ui.notifications.info(game.i18n.localize('VAGABOND.DsnDamage.Saved'));
  }

  /**
   * Strip empty/invalid entries. Coerce custom flag to boolean.
   * Drops entries with no meaningful difference from defaults to keep storage tidy.
   */
  static #normalize(data) {
    const out = {};
    for (const [key, entry] of Object.entries(data ?? {})) {
      if (!entry || typeof entry !== 'object') continue;
      const custom = !!entry.custom;
      const cleaned = { custom };
      if (custom) {
        for (const f of COLOR_FIELDS) if (entry[f]) cleaned[f] = entry[f];
        if (entry.texture)  cleaned.texture  = entry.texture;
        if (entry.material) cleaned.material = entry.material;
      } else if (entry.colorset) {
        cleaned.colorset = entry.colorset;
      }
      out[key] = cleaned;
    }
    return out;
  }
}
