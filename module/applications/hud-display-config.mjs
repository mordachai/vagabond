import { getHudDisplayPrefs, HUD_DISPLAY_DEFAULTS } from '../helpers/hud-display.mjs';
import { VagabondCharacterHud } from './character-hud.mjs';
import { VagabondNPCHud } from './npc-hud.mjs';

const { api } = foundry.applications;

/**
 * Player-facing dialog to set per-user HUD display preferences:
 * dark background, background blur, and font scaling. Stored client-side in the
 * `hudDisplayPrefs` setting; applied live to any open HUD on save/reset.
 *
 * Opened from the player-accessible settings menu (`hudDisplayConfigMenu`,
 * `restricted: false`).
 */
export class HudDisplayConfig extends api.HandlebarsApplicationMixin(api.ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: 'vbd-hud-display-config',
    tag: 'form',
    classes: ['vbd-hud-display-config'],
    window: {
      title: 'VAGABOND.Settings.hudDisplayConfig.title',
      icon: 'fas fa-universal-access',
      resizable: true,
    },
    position: { width: 480, height: 'auto' },
    actions: {
      reset: HudDisplayConfig.#onReset,
    },
    form: {
      handler: HudDisplayConfig.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true,
    },
  };

  static PARTS = {
    form: {
      template: 'systems/vagabond/templates/apps/hud-display-config.hbs',
      scrollable: ['.scrollable'],
    },
  };

  async _prepareContext() {
    const prefs = getHudDisplayPrefs();
    return {
      prefs,
      fontScalePct: `${Math.round((Number(prefs.fontScale) || 1) * 100)}%`,
    };
  }

  /** Live-update the font % readout as the slider moves. */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const range = this.element.querySelector('input[name="fontScale"]');
    const out = this.element.querySelector('.vbd-hdc-scale-val');
    if (range && out) {
      range.addEventListener('input', () => {
        out.textContent = `${Math.round((Number(range.value) || 1) * 100)}%`;
      });
    }
  }

  static async #onSubmit(event, form, formData) {
    const raw = formData.object;
    const prefs = {
      darkBg: !!raw.darkBg,
      blur: !!raw.blur,
      fontScale: Number(raw.fontScale) || 1,
    };
    await game.settings.set('vagabond', 'hudDisplayPrefs', prefs);
    HudDisplayConfig.#refreshOpenHuds();
  }

  static async #onReset() {
    await game.settings.set('vagabond', 'hudDisplayPrefs', { ...HUD_DISPLAY_DEFAULTS });
    HudDisplayConfig.#refreshOpenHuds();
    this.render();
  }

  /** Re-apply prefs to any currently open HUD without reopening it. */
  static #refreshOpenHuds() {
    VagabondCharacterHud.refreshDisplayPrefs?.();
    VagabondNPCHud.refreshDisplayPrefs?.();
  }
}
