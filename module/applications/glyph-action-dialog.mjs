const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Glyph action dialog — opened by clicking a placed glyph on the canvas.
 * Card-picker visual language (see CLAUDE.md "Card-Picker Config Dialogs"):
 * spell portrait on top, three 50px icon buttons (Trigger / Reposition /
 * Dismiss) with their name below, theme-aware via the --vagabond-* palette.
 *
 * Use the static `prompt(region)` — resolves with the chosen action key
 * ('trigger' | 'reposition' | 'dismiss') or null when closed without choice.
 */
export class GlyphActionDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {(value: string|null) => void} */
  #resolve;

  /** @type {object} Glyph payload (flags.vagabond.glyph). */
  #payload;

  constructor({ payload, resolve, ...options } = {}) {
    super(options);
    this.#payload = payload;
    this.#resolve = resolve;
  }

  static DEFAULT_OPTIONS = {
    id: 'glyph-action-dialog-{id}',
    classes: ['vagabond', 'glyph-action-dialog'],
    tag: 'div',
    window: {
      title: 'VAGABOND.Glyph.DialogTitle',
      icon: 'fa-solid fa-draw-polygon',
      resizable: false,
    },
    position: {
      width: 260,
      height: 'auto',
    },
    actions: {
      glyphTrigger: GlyphActionDialog.#onPick,
      glyphReposition: GlyphActionDialog.#onPick,
      glyphDismiss: GlyphActionDialog.#onPick,
    },
  };

  static PARTS = {
    form: {
      template: 'systems/vagabond/templates/apps/glyph-action-dialog.hbs',
    },
  };

  get title() {
    return game.i18n.format('VAGABOND.Glyph.CardTitle', { spell: this.#payload?.spellName ?? '' });
  }

  /**
   * Open the dialog for a placed glyph region.
   * @param {RegionDocument} region
   * @returns {Promise<'trigger'|'reposition'|'dismiss'|null>}
   */
  static prompt(region) {
    const payload = region.flags?.vagabond?.glyph;
    return new Promise((resolve) => {
      new GlyphActionDialog({ payload, resolve }).render({ force: true });
    });
  }

  /** @this {GlyphActionDialog} */
  static #onPick(event, target) {
    const map = { glyphTrigger: 'trigger', glyphReposition: 'reposition', glyphDismiss: 'dismiss' };
    const action = map[target.dataset.action] ?? null;
    const resolve = this.#resolve;
    this.#resolve = null;
    this.close();
    resolve?.(action);
  }

  /** Closing without a pick resolves null so callers never hang. */
  async _onClose(options) {
    super._onClose(options);
    this.#resolve?.(null);
    this.#resolve = null;
  }

  async _prepareContext(_options) {
    const p = this.#payload ?? {};
    return {
      spellImg: p.spellImg || 'icons/svg/rune.svg',
      spellName: p.spellName ?? '',
      casterLine: game.i18n.format('VAGABOND.Glyph.PlacedBy', { caster: p.casterName ?? '' }),
      rule: game.i18n.localize('VAGABOND.DeliveryTypes.Glyph.description'),
      buttons: [
        { action: 'glyphTrigger', icon: 'fa-solid fa-wand-magic-sparkles', cls: 'is-trigger', label: game.i18n.localize('VAGABOND.Glyph.TriggerButton') },
        { action: 'glyphReposition', icon: 'fa-solid fa-arrows-up-down-left-right', cls: 'is-reposition', label: game.i18n.localize('VAGABOND.Glyph.RepositionButton') },
        { action: 'glyphDismiss', icon: 'fa-solid fa-xmark', cls: 'is-dismiss', label: game.i18n.localize('VAGABOND.Glyph.DismissButton') },
      ],
    };
  }
}
