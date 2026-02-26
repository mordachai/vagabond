import { SPELL_FX } from '../helpers/sequencer-config.mjs';
import { VagabondSpellSequencer } from '../helpers/spell-sequencer.mjs';

const { api } = foundry.applications;

/**
 * SequencerFxConfig — ApplicationV2 dialog for GM configuration of Sequencer animation paths.
 * All settings are stored as a single JSON object in the 'sequencerFxConfig' world setting.
 * GM-only.
 */
export class SequencerFxConfig extends api.HandlebarsApplicationMixin(api.ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: 'sequencer-fx-config',
    tag: 'form',
    classes: ['sequencer-fx-config-form'],
    window: {
      title: 'VAGABOND.SequencerFX.Title',
      icon: 'fas fa-wand-magic-sparkles',
      resizable: true,
    },
    position: { width: 960, height: 700 },
    actions: {
      switchSchool:  SequencerFxConfig.#onSwitchSchool,
      browseVideo:   SequencerFxConfig.#onBrowseVideo,
      browseAudio:   SequencerFxConfig.#onBrowseAudio,
      previewCast:   SequencerFxConfig.#onPreviewCast,
      previewArea:   SequencerFxConfig.#onPreviewArea,
      previewSound:  SequencerFxConfig.#onPreviewSound,
      exportConfig:  SequencerFxConfig.#onExportConfig,
      importConfig:  SequencerFxConfig.#onImportConfig,
      resetDefaults: SequencerFxConfig.#onResetDefaults,
      saveAndClose:  SequencerFxConfig.#onSaveAndClose,
      close: function() { this.close(); },
    },
    form: {
      handler: SequencerFxConfig.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false,
    },
  };

  static PARTS = {
    form: {
      template: 'systems/vagabond/templates/apps/sequencer-fx-config.hbs',
      scrollable: ['.sfx-panel-scroll'],
    },
  };

  /** Currently active school tab key. */
  #activeSchool = 'fire';

  async _prepareContext(options) {
    // Merge stored config over SPELL_FX defaults
    const raw = game.settings.get('vagabond', 'sequencerFxConfig') ?? {};
    const stored = foundry.utils.expandObject(raw);
    const merged = foundry.utils.mergeObject(
      foundry.utils.deepClone(SPELL_FX), stored, { inplace: false }
    );

    const deliveryKeys = Object.keys(SPELL_FX.areaAnims.fire);
    const scaleModes = [
      { value: 'radius',   label: 'Radius (sphere, aura)' },
      { value: 'length',   label: 'Length (cone, line)' },
      { value: 'diameter', label: 'Diameter (cube)' },
      { value: 'fixed',    label: 'Fixed size' },
    ];

    // Build per-school data (skip the '' auto key)
    const schools = Object.entries(CONFIG.VAGABOND.fxSchools)
      .filter(([k]) => k !== '')
      .map(([key, labelKey]) => ({
        key,
        label: game.i18n.localize(labelKey),
        active: key === this.#activeSchool,
        castAnim: merged.castAnims?.[key] ?? { file: '', scale: 1.5, duration: 600 },
        sound: merged.sounds?.[key] ?? { cast: '', impact: '', volume: 0.6 },
        areaAnims: deliveryKeys.map(dk => {
          const dtLabel = CONFIG.VAGABOND.deliveryTypes?.[dk] ?? dk;
          return {
            deliveryKey: dk,
            deliveryLabel: typeof dtLabel === 'string' && dtLabel.startsWith('VAGABOND.')
              ? game.i18n.localize(dtLabel)
              : dtLabel,
            ...(merged.areaAnims?.[key]?.[dk] ?? { file: '', nativePx: 200, scaleMode: 'fixed', duration: 800 }),
          };
        }),
      }));

    return { schools, scaleModes, exportImportActive: this.#activeSchool === 'exportImport' };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector('#sfx-import-file')
      ?.addEventListener('change', e => SequencerFxConfig.#onImportFileSelected.call(this, e));
  }

  // ── Private actions ────────────────────────────────────────────────────────

  static #onSwitchSchool(event, target) {
    this.#activeSchool = target.dataset.school;
    this.render();
  }

  static #onBrowseVideo(event, target) {
    const fieldName = target.dataset.field;
    const input = this.element.querySelector(`input[name="${fieldName}"]`);
    const FP = foundry.applications.apps.FilePicker.implementation
             ?? foundry.applications.apps.FilePicker;
    new FP({
      type: 'video',
      current: input?.value || '',
      callback: path => { if (input) input.value = path; },
    }).browse();
  }

  static #onBrowseAudio(event, target) {
    const fieldName = target.dataset.field;
    const input = this.element.querySelector(`input[name="${fieldName}"]`);
    const FP = foundry.applications.apps.FilePicker.implementation
             ?? foundry.applications.apps.FilePicker;
    new FP({
      type: 'audio',
      current: input?.value || '',
      callback: path => { if (input) input.value = path; },
    }).browse();
  }

  static #onPreviewCast(event, target) {
    const school = target.dataset.school;
    const file     = this.element.querySelector(`input[name="castAnims.${school}.file"]`)?.value;
    const scale    = parseFloat(this.element.querySelector(`input[name="castAnims.${school}.scale"]`)?.value) || 1.0;
    const duration = parseInt(this.element.querySelector(`input[name="castAnims.${school}.duration"]`)?.value) || 600;
    if (!SequencerFxConfig.#previewGuard(file)) return;
    try {
      new Sequence().effect().file(file).atLocation(SequencerFxConfig.#previewToken()).scale(scale).duration(duration).play();
    } catch(err) { ui.notifications.error(err.message); }
  }

  static #onPreviewArea(event, target) {
    const school    = target.dataset.school;
    const delivery  = target.dataset.delivery;
    const prefix    = `areaAnims.${school}.${delivery}`;
    const file      = this.element.querySelector(`input[name="${prefix}.file"]`)?.value;
    const nativePx  = parseFloat(this.element.querySelector(`input[name="${prefix}.nativePx"]`)?.value) || 200;
    const scaleMode = this.element.querySelector(`select[name="${prefix}.scaleMode"]`)?.value || 'fixed';
    const duration  = parseInt(this.element.querySelector(`input[name="${prefix}.duration"]`)?.value) || 800;
    if (!SequencerFxConfig.#previewGuard(file)) return;

    // For directional deliveries, use two controlled tokens (caster → direction target).
    // Fall back to placeables if fewer than two are controlled.
    const pool     = canvas.tokens.controlled.length >= 2
      ? canvas.tokens.controlled
      : canvas.tokens.placeables;
    const caster   = pool[0];
    const dirToken = pool[1] ?? caster;
    const scale    = VagabondSpellSequencer._calcScale(20, nativePx, scaleMode);

    try {
      const seq = new Sequence();
      if (delivery === 'line') {
        // Preview uses 20ft; direction toward dirToken (or east if same token).
        const cCx = caster.x + (caster.w ?? 0) / 2;
        const cCy = caster.y + (caster.h ?? 0) / 2;
        const tCx = dirToken.x + (dirToken.w ?? 0) / 2;
        const tCy = dirToken.y + (dirToken.h ?? 0) / 2;
        const angle = (dirToken !== caster) ? Math.atan2(tCy - cCy, tCx - cCx) : 0;
        const pxPerFt = canvas.grid.size / (canvas.grid.distance || 5);
        const endpoint = { x: cCx + Math.cos(angle) * 20 * pxPerFt, y: cCy + Math.sin(angle) * 20 * pxPerFt };
        seq.effect().file(file).atLocation(caster).stretchTo(endpoint).duration(duration);
      } else if (delivery === 'cone') {
        seq.effect().file(file).atLocation(caster)
          .rotate(-VagabondSpellSequencer._getConeDirection(caster, [dirToken]))
          .scale(scale).anchor({ x: 0, y: 0.5 }).duration(duration);
      } else {
        seq.effect().file(file).atLocation(caster).scale(scale).duration(duration);
      }
      seq.play();
    } catch(err) { ui.notifications.error(err.message); }
  }

  static #onPreviewSound(event, target) {
    const fieldName = target.dataset.field;
    const school    = fieldName.split('.')[1];
    const file      = this.element.querySelector(`input[name="${fieldName}"]`)?.value;
    const volume    = parseFloat(this.element.querySelector(`input[name="sounds.${school}.volume"]`)?.value) || 0.6;
    if (!file) { ui.notifications.warn(game.i18n.localize('VAGABOND.SequencerFX.NoFile')); return; }
    foundry.audio.AudioHelper.play({ src: file, volume, autoplay: true, loop: false });
  }

  /** Returns the token to use for previews, or null with a warning. */
  static #previewToken() {
    return canvas.tokens.controlled[0] ?? canvas.tokens.placeables[0] ?? null;
  }

  /** Guards preview actions: checks file, Sequencer, and token. Returns true if OK. */
  static #previewGuard(file) {
    if (!file) { ui.notifications.warn(game.i18n.localize('VAGABOND.SequencerFX.NoFile')); return false; }
    if (!VagabondSpellSequencer.isAvailable()) { ui.notifications.warn(game.i18n.localize('VAGABOND.SequencerFX.Unavailable')); return false; }
    if (!SequencerFxConfig.#previewToken()) { ui.notifications.warn(game.i18n.localize('VAGABOND.SequencerFX.NoToken')); return false; }
    return true;
  }

  static #onExportConfig() {
    const raw    = game.settings.get('vagabond', 'sequencerFxConfig') ?? {};
    const stored = foundry.utils.expandObject(raw);
    const merged = foundry.utils.mergeObject(
      foundry.utils.deepClone(SPELL_FX), stored, { inplace: false }
    );
    const json = JSON.stringify(merged, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'vagabond-spell-fx-config.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  static #onImportConfig() {
    this.element.querySelector('#sfx-import-file')?.click();
  }

  static async #onImportFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (typeof data !== 'object' || !data.castAnims || !data.areaAnims) {
        ui.notifications.error(game.i18n.localize('VAGABOND.SequencerFX.ImportInvalid'));
        return;
      }
      await game.settings.set('vagabond', 'sequencerFxConfig', data);
      ui.notifications.info(game.i18n.localize('VAGABOND.SequencerFX.Imported'));
      event.target.value = '';
      this.render();
    } catch(e) {
      ui.notifications.error(`${game.i18n.localize('VAGABOND.SequencerFX.ImportFailed')}: ${e.message}`);
    }
  }

  static async #onResetDefaults() {
    await game.settings.set('vagabond', 'sequencerFxConfig', {});
    ui.notifications.info(game.i18n.localize('VAGABOND.SequencerFX.Reset'));
    this.render();
  }

  static async #onSaveAndClose() {
    await SequencerFxConfig.#performSave.call(this);
    this.close({ force: true });
  }

  static async #onSubmit(event, form, formData) {
    await SequencerFxConfig.#performSave.call(this, formData);
    this.render();
  }

  static async #performSave(formData) {
    // If formData not passed (from saveAndClose), read the live form
    const raw = formData
      ? formData.object
      : new foundry.applications.ux.FormDataExtended(this.element).object;
    const data = foundry.utils.expandObject(raw);

    await game.settings.set('vagabond', 'sequencerFxConfig', data);
    ui.notifications.info(game.i18n.localize('VAGABOND.SequencerFX.Saved'));
  }
}
