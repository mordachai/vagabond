import { SPELL_FX, getJB2ADefaults, loadJB2ADefaults } from '../helpers/sequencer-config.mjs';
import { VagabondSpellSequencer } from '../helpers/spell-sequencer.mjs';
import { VideoPreviewDialog } from './video-preview-dialog.mjs';
import { SpellFxPresets } from '../helpers/spell-fx-presets.mjs';

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
      toggleRow:     SequencerFxConfig.#onToggleRow,
      browseVideo:   SequencerFxConfig.#onBrowseVideo,
      browseAudio:   SequencerFxConfig.#onBrowseAudio,
      previewRow:    SequencerFxConfig.#onPreviewRow,
      exportConfig:    SequencerFxConfig.#onExportConfig,
      importConfig:    SequencerFxConfig.#onImportConfig,
      activatePreset:  SequencerFxConfig.#onActivatePreset,
      togglePresetPart: SequencerFxConfig.#onTogglePresetPart,
      removePreset:    SequencerFxConfig.#onRemovePreset,
      savePreset:      SequencerFxConfig.#onSavePreset,
      refreshPresets:  SequencerFxConfig.#onRefreshPresets,
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

  /** Rows whose extra options line is open (by field prefix), kept across renders. */
  #openRows = new Set();

  /** Unsaved school edits, kept across renders (Presets tab, import…) until saved or the window closes. */
  #draft = null;

  /** Set by actions that replace the whole config (preset, reset, JB2A, save): the next render drops the draft. */
  #dropDraft = false;

  /** School fields as rendered from the stored config: what the form is compared to before closing. */
  #baseline = null;

  /** True while the form holds edits that are not saved. */
  #isDirty() {
    const current = SequencerFxConfig.#formAnims(this.element);
    if (!current || !this.#baseline) return false;
    return !foundry.utils.isEmpty(foundry.utils.diffObject(this.#baseline, current));
  }

  /** Red preset chip = unsaved edits in the form. */
  #markUnsaved() {
    this.element?.querySelector('.sfx-loaded-chip')?.classList.toggle('is-unsaved', this.#isDirty());
  }

  /** Closing with unsaved edits asks first: Save / Discard / Keep editing. `force` skips the question. */
  async close(options = {}) {
    if (options.force || !this.rendered || !this.#isDirty()) return super.close(options);
    const L = k => game.i18n.localize(`VAGABOND.SequencerFX.Unsaved.${k}`);
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: L('Title') },
      content: `<p>${L('Content')}</p>`,
      buttons: [
        { action: 'save', label: L('Save'), icon: 'fas fa-floppy-disk', default: true },
        { action: 'discard', label: L('Discard'), icon: 'fas fa-trash' },
        { action: 'keep', label: L('Keep'), icon: 'fas fa-pen' },
      ],
      rejectClose: false,
    });
    if (choice === 'save') await SequencerFxConfig.#performSave.call(this);
    else if (choice !== 'discard') return this;
    return super.close(options);
  }

  /** The school fields of the open form ({castAnims, areaAnims}), or null. */
  static #formAnims(form) {
    if (!form) return null;
    const data = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(form).object);
    if (!data.castAnims && !data.areaAnims) return null;
    return { castAnims: data.castAnims ?? {}, areaAnims: data.areaAnims ?? {} };
  }

  /** Deliveries that leave an area on the map (Spell Surfaces): only these use a loop video / held frame. */
  static SURFACE_DELIVERIES = ['aura', 'cone', 'sphere', 'cube'];

  /** What a file field shows: the file name (no folder, no extension); DB / PSFX keys as they are. */
  static shortName(spec) {
    const s = String(Array.isArray(spec) ? spec[0] : spec ?? '').trim();
    if (!s.includes('/')) return s;
    let last = s.split('/').pop();
    try { last = decodeURIComponent(last); } catch { /* keep as is */ }
    return last.replace(/\.(webm|mp4|m4v|ogg|oga|mp3|wav|flac|m4a|webp)$/i, '');
  }

  async _prepareContext(options) {
    // Merge stored config over SPELL_FX defaults
    const raw = game.settings.get('vagabond', 'sequencerFxConfig') ?? {};
    const stored = foundry.utils.expandObject(raw);
    // Unsaved edits survive the re-render: read the open form before it is replaced
    if (this.#dropDraft) { this.#draft = null; this.#dropDraft = false; }
    else if (this.rendered) this.#draft = SequencerFxConfig.#formAnims(this.element) ?? this.#draft;
    const merged = foundry.utils.mergeObject(
      foundry.utils.mergeObject(foundry.utils.deepClone(SPELL_FX), stored, { inplace: false }),
      this.#draft ?? {}, { inplace: false }
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

    // Build per-school data (skip the '' auto key): one line per animation, file fields show the file name
    const name = SequencerFxConfig.shortName;
    const schools = Object.entries(CONFIG.VAGABOND.fxSchools)
      .filter(([k]) => k !== '')
      .map(([key, labelKey]) => {
        const cast = merged.castAnims?.[key] ?? { file: '', scale: 1.5, sound: '', volume: 0.45 };
        const castPrefix = `castAnims.${key}`;
        return {
          key,
          label: game.i18n.localize(labelKey),
          active: key === this.#activeSchool,
          cast: {
            prefix: castPrefix, ...cast, volume: cast.volume ?? 0.45,
            fileLabel: name(cast.file), soundLabel: name(cast.sound),
            fileField: `${castPrefix}.file`, soundField: `${castPrefix}.sound`,
          },
          areaAnims: deliveryKeys.map(dk => {
            const dtLabel  = CONFIG.VAGABOND.deliveryTypes?.[dk] ?? dk;
            const animCfg  = merged.areaAnims?.[key]?.[dk] ?? { file: '', scaleMode: 'fixed', sound: '', volume: 0.6 };
            const prefix = `areaAnims.${key}.${dk}`;
            return {
              deliveryKey: dk,
              deliveryLabel: typeof dtLabel === 'string' && dtLabel.startsWith('VAGABOND.')
                ? game.i18n.localize(dtLabel)
                : dtLabel,
              ...animCfg,
              prefix,
              fileField: `${prefix}.file`, soundField: `${prefix}.sound`, loopField: `${prefix}.loop`,
              fileLabel: name(animCfg.file), soundLabel: name(animCfg.sound),
              volume: animCfg.volume ?? 0.6,
              // Spell areas left on the map: loop version of the clip, else the clip stays on its frame
              surface: SequencerFxConfig.SURFACE_DELIVERIES.includes(dk),
              loop: animCfg.loop ?? '',
              loopLabel: name(animCfg.loop ?? ''),
              // Frame a Spell area left on the map stays on (%); empty shows the built-in one
              hold: animCfg.hold ?? VagabondSpellSequencer.defaultHoldFor(animCfg.file) ?? '',
              scaleOptions: scaleModes.map(m => ({ ...m, selected: m.value === animCfg.scaleMode })),
              open: this.#openRows.has(prefix),
            };
          }),
        };
      });

    const sequencerAvailable = VagabondSpellSequencer.isAvailable();
    const jb2aAvailable      = VagabondSpellSequencer.isJB2AAvailable();
    const animationsEnabled  = !!game.settings.get('vagabond', 'useAnimations');
    const presetsActive      = this.#activeSchool === 'presets';

    return {
      schools,
      scaleModes,
      presetsActive,
      sequencerAvailable,
      jb2aAvailable,
      psfxAvailable: !!game.modules.get('psfx')?.active,
      animationsEnabled,
      jb2aDefaultsLoaded: !!getJB2ADefaults(),
      loaded: SequencerFxConfig.#loadedView(),
      presets: presetsActive ? await SequencerFxConfig.#presetsView() : null,
    };
  }

  _onClose(options) {
    super._onClose(options);
    this.#draft = null;
    this.#baseline = null;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    // Rendered from the stored config alone (no draft): that is what "unsaved" is measured against
    if (!this.#draft) this.#baseline = SequencerFxConfig.#formAnims(this.element);
    // Preset chip turns red while there are unsaved edits
    this.#markUnsaved();
    // File fields show the file name; clicking it edits the full path
    const root = this.element.querySelector('.sfx-wrapper');
    if (!root) return;
    root.addEventListener('input', () => this.#markUnsaved());
    root.addEventListener('change', () => this.#markUnsaved());
    root.addEventListener('click', (event) => {
      const label = event.target.closest('.sfx-chip-name');
      if (!label) return;
      const chip = label.closest('.sfx-chip');
      chip.classList.add('is-editing');
      chip.querySelector('input')?.focus();
    });
    root.addEventListener('focusout', (event) => {
      if (!event.target.matches('.sfx-chip input')) return;
      event.target.closest('.sfx-chip').classList.remove('is-editing');
      SequencerFxConfig.#syncChip(event.target);
    });
    root.addEventListener('change', (event) => {
      if (event.target.matches('.sfx-chip input')) SequencerFxConfig.#syncChip(event.target);
    });
  }

  /** Refresh a file field's label after its path changed. */
  static #syncChip(input) {
    const chip = input.closest('.sfx-chip');
    const label = chip?.querySelector('.sfx-chip-name');
    if (!label) return;
    const value = input.value.trim();
    chip.classList.toggle('is-empty', !value);
    label.textContent = value ? SequencerFxConfig.shortName(value) : input.placeholder;
    if (value) label.dataset.tooltip = value;
    else delete label.dataset.tooltip;
  }

  /** Status bar chip: the active file (+ which part is off), or null. */
  static #loadedView() {
    const m = SpellFxPresets.loadedMeta();
    if (!m) return null;
    const L = k => game.i18n.localize(`VAGABOND.SequencerFX.Presets.${k}`);
    const name = m.name || SpellFxPresets.fileName(m.source).replace(/\.json$/i, '');
    const parts = m.video && m.sound ? '' : m.video ? L('VideoOnly') : m.sound ? L('SoundOnly') : L('NothingOn');
    return { name: parts ? `${name} · ${parts}` : name, tooltip: `Data/${m.source}`, modified: !!m.modified };
  }

  /** Every listed file, External first; one is active, only its Video / Sound switches are live. */
  static async #presetsView() {
    const m = SpellFxPresets.loadedMeta();
    const { system, user } = await SpellFxPresets.list();
    return [...user, ...system].map(p => {
      const active = !p.invalid && p.path === m?.source;
      return {
        path: p.path, kind: p.kind, label: p.label, description: p.meta.description,
        external: p.kind === 'user', active,
        videoOn: active && m.video, soundOn: active && m.sound,
        invalid: p.invalid ? game.i18n.localize(`VAGABOND.SequencerFX.Presets.Invalid.${p.invalid}`) : null,
      };
    });
  }

  /** What the Spell FX actually play now (stored config, else the JB2A defaults, else empty), without `_meta`. */
  static #effectiveConfig() {
    const config = foundry.utils.deepClone(VagabondSpellSequencer._getConfig());
    delete config._meta;
    return config;
  }

  // ── Private actions ────────────────────────────────────────────────────────

  static #onSwitchSchool(event, target) {
    const school = target.dataset.school;
    // Between schools: just show the other panel (unsaved edits stay); the Presets tab is built on render
    if (school !== 'presets' && this.#activeSchool !== 'presets') {
      this.#activeSchool = school;
      this.element.querySelectorAll('.sfx-school-btn').forEach(b => b.classList.toggle('active', b.dataset.school === school));
      this.element.querySelectorAll('.sfx-panel[data-school]').forEach(p => p.classList.toggle('active', p.dataset.school === school));
      return;
    }
    this.#activeSchool = school;
    this.render();
  }

  /** The "…" of a row: show / hide its extra options (scale mode). */
  static #onToggleRow(event, target) {
    const row = target.closest('.sfx-anim-row');
    if (!row) return;
    if (row.classList.toggle('is-open')) this.#openRows.add(row.dataset.prefix);
    else this.#openRows.delete(row.dataset.prefix);
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
        input.dispatchEvent(new Event('change', { bubbles: true }));
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
      callback: path => {
        if (!input) return;
        input.value = path;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      },
    }).browse();
  }

  /**
   * One preview window per school: every row with a video or a sound is a tab (unsaved values), opened on the row
   * clicked. Area rows left on the map get the frame picker and the loop video (found in the clip's folder → one
   * click puts it in the row).
   */
  static #onPreviewRow(event, target) {
    const panel = target.closest('.sfx-panel');
    if (!panel) return;
    const input = (name) => this.element.querySelector(`[name="${name}"]`);
    const value = (name) => input(name)?.value?.trim() ?? '';
    const write = (name, v) => {
      const el = input(name);
      if (!el) return;
      el.value = v;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const clicked = target.closest('.sfx-anim-row[data-prefix]');
    const groups = [];
    let start = 0;
    for (const row of panel.querySelectorAll('.sfx-anim-row[data-prefix]')) {
      const prefix = row.dataset.prefix;
      const file = value(`${prefix}.file`), sound = value(`${prefix}.sound`);
      if (!file && !sound) continue;
      if (row === clicked) start = groups.length;
      const volume = parseFloat(value(`${prefix}.volume`));
      const group = {
        label: row.querySelector('.sfx-anim-name')?.textContent.trim() ?? '',
        spec: file, sound, volume: Number.isFinite(volume) ? volume : 0.6,
      };
      if (row.hasAttribute('data-surface')) {
        const held = value(`${prefix}.hold`);
        group.frame = { value: held === '' ? null : Number(held), onPick: (pct) => write(`${prefix}.hold`, String(pct)) };
        group.loop = { file: value(`${prefix}.loop`), onPick: (f) => write(`${prefix}.loop`, f) };
      }
      groups.push(group);
    }
    if (!groups.length) { ui.notifications.warn(game.i18n.localize('VAGABOND.SequencerFX.NoFile')); return; }
    const school = panel.dataset.school;
    VideoPreviewDialog.open(groups, {
      title: game.i18n.localize(CONFIG.VAGABOND.fxSchools?.[school] ?? school), start,
    });
  }

  static #onExportConfig() {
    const merged = foundry.utils.mergeObject(
      foundry.utils.deepClone(SPELL_FX), SequencerFxConfig.#effectiveConfig(), { inplace: false }
    );
    const loaded = SpellFxPresets.loadedMeta();
    const meta = loaded?.name ? { name: loaded.name, description: '' } : null;
    const json = JSON.stringify(meta ? { _meta: meta, ...merged } : merged, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = meta?.name ? SpellFxPresets.slug(meta.name) : 'vagabond-spell-fx-config.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Import = Foundry's file picker: browse or upload where you like, pick the JSON; it joins the External list. */
  static #onImportConfig() {
    const FP = foundry.applications.apps.FilePicker.implementation ?? foundry.applications.apps.FilePicker;
    const fp = new FP({
      type: 'text',
      current: SpellFxPresets.userDir(),
      callback: async (path) => {
        const preset = await SpellFxPresets.read(path, 'user');
        if (preset.invalid) {
          ui.notifications.error(game.i18n.localize('VAGABOND.SequencerFX.ImportInvalid'));
          return;
        }
        await SpellFxPresets.addUserFile(path);
        ui.notifications.info(game.i18n.format('VAGABOND.SequencerFX.Presets.ImportedTo', { file: preset.file }));
        this.#activeSchool = 'presets';
        this.render();
      },
    });
    fp.extensions = ['.json'];
    fp.render({ force: true });
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
    merged._meta = {
      name: SpellFxPresets.metaOf(defaults).name,
      source: `${SpellFxPresets.SYSTEM_DIR}/vagabond-default-spell-fx-config.json`,
      video: true, sound: true, modified: false,
    };
    await game.settings.set('vagabond', 'sequencerFxConfig', merged);
    this.#dropDraft = true;
    ui.notifications.info(game.i18n.localize('VAGABOND.SequencerFX.JB2ALoaded'));
    this.render();
  }

  static async #onResetDefaults() {
    await game.settings.set('vagabond', 'sequencerFxConfig', {});
    this.#dropDraft = true;
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

  static async #performSave(formData, { quiet = false } = {}) {
    // If formData not passed (from saveAndClose), read the live form
    const raw = formData
      ? formData.object
      : new foundry.applications.ux.FormDataExtended(this.element).object;
    const data = foundry.utils.expandObject(raw);
    // The Presets tab has no school fields: nothing to save from it
    if (!data.castAnims && !data.areaAnims) return;
    // Merge over what is stored (every school's fields are in the form, unsaved draft included)
    const stored = foundry.utils.expandObject(game.settings.get('vagabond', 'sequencerFxConfig') ?? {});
    const next = foundry.utils.mergeObject(stored, data, { inplace: false });
    // Still "based on" the loaded preset, now changed by hand
    if (stored._meta && !foundry.utils.isEmpty(foundry.utils.diffObject(stored, next))) next._meta = { ...stored._meta, modified: true };

    await game.settings.set('vagabond', 'sequencerFxConfig', next);
    // Saved: the next render starts from the stored config (new baseline)
    this.#dropDraft = true;
    this.#baseline = SequencerFxConfig.#formAnims(this.element);
    this.#markUnsaved();
    if (!quiet) ui.notifications.info(game.i18n.localize('VAGABOND.SequencerFX.Saved'));
  }

  /** Make a file the active one (Video and Sound on). */
  static async #onActivatePreset(event, target) {
    if (target.classList.contains('is-on')) return;
    const preset = await SpellFxPresets.read(target.dataset.path, target.dataset.kind);
    if (!preset || preset.invalid) { ui.notifications.error(game.i18n.localize('VAGABOND.SequencerFX.ImportInvalid')); return; }
    await SpellFxPresets.apply(preset);
    this.#dropDraft = true;
    this.render();
  }

  /** Video / Sound switch of the active file. */
  static async #onTogglePresetPart(event, target) {
    await SpellFxPresets.setPart(target.dataset.part, !target.classList.contains('is-on'));
    this.render();
  }

  /** Trash of an External row: off the list (Foundry can't delete files from the browser; the file stays). */
  static async #onRemovePreset(event, target) {
    await SpellFxPresets.removeUserFile(target.dataset.path);
    this.render();
  }

  static async #onSavePreset() {
    const loaded = SpellFxPresets.loadedMeta();
    // Re-saving a preset of your own updates it; anything else starts a new file
    const src = loaded?.source ? loaded : null;
    const own = !!src && SpellFxPresets.userFiles().includes(src.source);
    const esc = foundry.utils.escapeHTML;
    const L = k => game.i18n.localize(`VAGABOND.SequencerFX.Presets.${k}`);
    const data = await foundry.applications.api.DialogV2.prompt({
      window: { title: L('SaveTitle') },
      position: { width: 520 },
      content: `
        <div class="form-group"><label>${L('Name')}</label>
          <input type="text" name="name" value="${esc(own ? (src.name ?? '') : '')}" required autofocus></div>
        <div class="form-group stacked"><label>${L('Description')}</label>
          <textarea name="description" rows="3" placeholder="${esc(L('DescriptionHint'))}">${esc(own ? (await SpellFxPresets.read(src.source)).meta.description : '')}</textarea></div>
        <div class="form-group"><label>${L('Folder')}</label>
          <file-picker name="dir" type="folder" value="${esc(own ? src.source.split('/').slice(0, -1).join('/') : SpellFxPresets.userDir())}"></file-picker></div>`,
      ok: {
        label: L('Save'), icon: 'fas fa-floppy-disk',
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object,
      },
      rejectClose: false,
    });
    if (!data?.name?.trim()) return;
    const fileName = SpellFxPresets.slug(data.name);
    const dir = String(data.dir ?? '').trim() || SpellFxPresets.userDir();
    const sameFile = own && src.source === `${dir.replace(/^\/+|\/+$/g, '')}/${fileName}`;
    if (!sameFile && await SpellFxPresets.fileExists(dir, fileName) && !await SequencerFxConfig.#confirmOverwrite(fileName)) return;
    try {
      // Unsaved edits in the open form count: save them first
      await SequencerFxConfig.#performSave.call(this, null, { quiet: true });
      await SpellFxPresets.saveCurrent(SequencerFxConfig.#effectiveConfig(), {
        name: data.name.trim(),
        description: String(data.description ?? '').trim(),
      }, dir, fileName);
      ui.notifications.info(game.i18n.format('VAGABOND.SequencerFX.Presets.SavedTo', { file: fileName, dir }));
    } catch (err) {
      console.error('Vagabond | Spell FX preset save failed', err);
      ui.notifications.error(`${L('SaveFailed')}: ${err.message}`);
    }
    this.render();
  }

  static async #onRefreshPresets() {
    await SpellFxPresets.list({ fresh: true });
    this.render();
  }

  static async #confirmOverwrite(fileName) {
    return !!await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('VAGABOND.SequencerFX.Presets.OverwriteTitle') },
      content: `<p>${game.i18n.format('VAGABOND.SequencerFX.Presets.OverwriteConfirm', { file: foundry.utils.escapeHTML(fileName) })}</p>`,
      rejectClose: false,
    });
  }

}
