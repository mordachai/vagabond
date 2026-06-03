import { SPELL_FX, getJB2ADefaults, loadJB2ADefaults } from '../helpers/sequencer-config.mjs';
import { VagabondSpellSequencer } from '../helpers/spell-sequencer.mjs';
import { VideoPreviewDialog } from './video-preview-dialog.mjs';

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
      exportConfig:    SequencerFxConfig.#onExportConfig,
      importConfig:    SequencerFxConfig.#onImportConfig,
      resetDefaults:   SequencerFxConfig.#onResetDefaults,
      loadJB2ADefaults: SequencerFxConfig.#onLoadJB2ADefaults,
      saveAndClose:    SequencerFxConfig.#onSaveAndClose,
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
      { value: 'chain',    label: 'Chain (A→B→C)' },
      { value: 'multiray', label: 'Multi-ray (A→B, A→C)' },
    ];

    // Build per-school data (skip the '' auto key)
    const schools = Object.entries(CONFIG.VAGABOND.fxSchools)
      .filter(([k]) => k !== '')
      .map(([key, labelKey]) => ({
        key,
        label: game.i18n.localize(labelKey),
        active: key === this.#activeSchool,
        castAnim: merged.castAnims?.[key] ?? { file: '', scale: 1.5, sound: '', volume: 0.6 },
        areaAnims: deliveryKeys.map(dk => {
          const dtLabel  = CONFIG.VAGABOND.deliveryTypes?.[dk] ?? dk;
          const animCfg  = merged.areaAnims?.[key]?.[dk] ?? { file: '', scaleMode: 'fixed', sound: '' };
          return {
            deliveryKey: dk,
            deliveryLabel: typeof dtLabel === 'string' && dtLabel.startsWith('VAGABOND.')
              ? game.i18n.localize(dtLabel)
              : dtLabel,
            ...animCfg,
          };
        }),
      }));

    const sequencerAvailable = VagabondSpellSequencer.isAvailable();
    const jb2aAvailable      = VagabondSpellSequencer.isJB2AAvailable();
    const animationsEnabled  = !!game.settings.get('vagabond', 'useAnimations');

    return {
      schools,
      scaleModes,
      exportImportActive: this.#activeSchool === 'exportImport',
      sequencerAvailable,
      jb2aAvailable,
      animationsEnabled,
      jb2aDefaultsLoaded: !!getJB2ADefaults(),
    };
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
      callback: path => {
        if (!input) return;
        input.value = path;
      },
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
    const file   = this.element.querySelector(`input[name="castAnims.${school}.file"]`)?.value;
    if (!file) { ui.notifications.warn(game.i18n.localize('VAGABOND.SequencerFX.NoFile')); return; }
    VideoPreviewDialog.open(file);
  }

  static #onPreviewArea(event, target) {
    const school   = target.dataset.school;
    const delivery = target.dataset.delivery;
    const file     = this.element.querySelector(`input[name="areaAnims.${school}.${delivery}.file"]`)?.value;
    if (!file) { ui.notifications.warn(game.i18n.localize('VAGABOND.SequencerFX.NoFile')); return; }
    VideoPreviewDialog.open(file);
  }

  static #onPreviewSound(event, target) {
    const fieldName = target.dataset.field;
    const file      = this.element.querySelector(`input[name="${fieldName}"]`)?.value;
    if (!file) { ui.notifications.warn(game.i18n.localize('VAGABOND.SequencerFX.NoFile')); return; }
    const school = fieldName.split('.')[1];
    const volume = parseFloat(this.element.querySelector(`input[name="castAnims.${school}.volume"]`)?.value) || 0.6;
    foundry.audio.AudioHelper.play({ src: file, volume, loop: false });
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

  static async #onLoadJB2ADefaults() {
    if (!VagabondSpellSequencer.isJB2AAvailable()) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.SequencerFX.JB2AUnavailable'));
      return;
    }
    // Ensure defaults are fetched (in case ready hook hasn't fired yet)
    await loadJB2ADefaults();
    const defaults = getJB2ADefaults();
    if (!defaults) {
      ui.notifications.error(game.i18n.localize('VAGABOND.SequencerFX.JB2ALoadFailed'));
      return;
    }
    // Only overwrite animation paths, not sounds (preserve any existing sound config)
    const raw     = game.settings.get('vagabond', 'sequencerFxConfig') ?? {};
    const current = foundry.utils.expandObject(raw);
    const merged  = foundry.utils.mergeObject(
      foundry.utils.deepClone(defaults),
      { sounds: current.sounds ?? defaults.sounds },
      { inplace: false }
    );
    await game.settings.set('vagabond', 'sequencerFxConfig', merged);
    ui.notifications.info(game.i18n.localize('VAGABOND.SequencerFX.JB2ALoaded'));
    this.render();
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
