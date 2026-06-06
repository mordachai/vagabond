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
      alwaysOn: game.settings.get('vagabond', 'hudAlwaysOnForMainChar'),
      hasMainChar: !!game.user.character,
      mainCharName: game.user.character?.name ?? '',
      idleFade: game.settings.get('vagabond', 'hudIdleFadePrefs'),
      idleOpacityPct: `${Math.round((Number(game.settings.get('vagabond', 'hudIdleFadePrefs')?.opacity) || 0.2) * 100)}%`,
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

    // Idle-fade slider readouts.
    const delay = this.element.querySelector('input[name="idleDelay"]');
    const delayOut = this.element.querySelector('.vbd-hdc-idle-delay-val');
    if (delay && delayOut) {
      delay.addEventListener('input', () => { delayOut.textContent = `${delay.value}s`; });
    }
    const op = this.element.querySelector('input[name="idleOpacity"]');
    const opOut = this.element.querySelector('.vbd-hdc-idle-opacity-val');
    if (op && opOut) {
      op.addEventListener('input', () => {
        opOut.textContent = `${Math.round((Number(op.value) || 0.2) * 100)}%`;
      });
    }

    // Enable/disable the idle sliders with the master checkbox.
    const idleEnabled = this.element.querySelector('input[name="idleEnabled"]');
    const idleControls = this.element.querySelectorAll('input[name="idleDelay"], input[name="idleOpacity"]');
    const syncIdle = () => idleControls.forEach(c => { c.disabled = !idleEnabled?.checked; });
    if (idleEnabled) {
      idleEnabled.addEventListener('change', syncIdle);
      syncIdle();
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
    await game.settings.set('vagabond', 'hudAlwaysOnForMainChar', !!raw.alwaysOn);
    await game.settings.set('vagabond', 'hudIdleFadePrefs', {
      enabled: !!raw.idleEnabled,
      delay: Math.round(Number(raw.idleDelay) || 10),
      opacity: Number(raw.idleOpacity) || 0.2,
    });
    HudDisplayConfig.#refreshOpenHuds();
    VagabondCharacterHud.syncAlwaysOn();
    VagabondCharacterHud.refreshIdleFade();
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
