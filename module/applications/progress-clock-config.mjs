import { ProgressClock } from '../documents/progress-clock.mjs';

const { api } = foundry.applications;

/**
 * Configuration dialog for Progress Clocks
 * Uses ApplicationV2 with HandlebarsApplicationMixin (V13 pattern)
 */
export class ProgressClockConfig extends api.HandlebarsApplicationMixin(
  api.ApplicationV2
) {
  constructor(clockJournal, options = {}) {
    super(options);
    this.#clockJournal = clockJournal;
  }

  #clockJournal;

  static DEFAULT_OPTIONS = {
    id: "progress-clock-config-{id}",
    classes: ["vagabond", "progress-clock-config"],
    window: {
      title: "VAGABOND.ProgressClock.ConfigDialog.Title",
      icon: "fas fa-cog",
      resizable: false
    },
    position: {
      width: 500,
      height: "auto"
    },
    form: {
      submitOnChange: false,
      closeOnSubmit: true
    }
  };

  static PARTS = {
    form: {
      template: "systems/vagabond/templates/clocks/config.hbs"
    }
  };

  get title() {
    if (!this.#clockJournal) {
      return game.i18n.localize('VAGABOND.ProgressClock.Create');
    }
    return `Configure: ${this.#clockJournal.name}`;
  }

  /**
   * Attach event listeners after rendering
   * @override
   */
  _onRender(context, options) {
    super._onRender(context, options);

    // Attach form submit handler
    const form = this.element.querySelector('form');
    if (form) {
      form.addEventListener('submit', this._onFormSubmit.bind(this));
    }

    // Auto-fill the handle from the name until the GM manually edits the handle
    const nameInput = this.element.querySelector('input[name="name"]');
    const handleInput = this.element.querySelector('input[name="handle"]');
    if (nameInput && handleInput) {
      let handleTouched = !!handleInput.value;
      handleInput.addEventListener('input', () => { handleTouched = true; });
      nameInput.addEventListener('input', () => {
        if (!handleTouched) handleInput.value = ProgressClock.slugify(nameInput.value);
      });
    }

    // Tab switching (General / Permissions)
    const tabBtns = this.element.querySelectorAll('.pc-tab-btn');
    const tabSections = this.element.querySelectorAll('.pc-tab');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        tabSections.forEach(s => s.classList.toggle('active', s.dataset.tab === tab));
        // Re-fit the window to the now-visible tab's content
        this.setPosition({ height: 'auto' });
      });
    });

    // Type + Segments card row: clicking a card sets the hidden kind/segments inputs.
    const kindInput = this.element.querySelector('input[name="kind"]');
    const segmentsInput = this.element.querySelector('input[name="segments"]');
    const typeCards = this.element.querySelectorAll('.pc-type-row .pc-card');
    typeCards.forEach(card => {
      card.addEventListener('click', () => {
        typeCards.forEach(c => c.classList.remove('is-selected'));
        card.classList.add('is-selected');
        if (kindInput) kindInput.value = card.dataset.kind;
        if (segmentsInput && card.dataset.kind === 'clock') segmentsInput.value = card.dataset.segments;
      });
    });

    // Size card row: clicking a card sets the hidden size input.
    const sizeInput = this.element.querySelector('input[name="size"]');
    const sizeCards = this.element.querySelectorAll('.pc-size-row .pc-size-btn');
    sizeCards.forEach(card => {
      card.addEventListener('click', () => {
        sizeCards.forEach(c => c.classList.remove('is-selected'));
        card.classList.add('is-selected');
        if (sizeInput) sizeInput.value = card.dataset.size;
      });
    });

    // Permission matrix: changing a Default radio sets every player row to match
    this._wirePermissionMatrix();

    // Linked Value: show/hide mode-specific fields without a re-render
    const sourceMode = this.element.querySelector('select[name="source.mode"]');
    if (sourceMode) {
      const pathBox = this.element.querySelector('.pc-source-path');
      const exprBox = this.element.querySelector('.pc-source-expr');
      const syncSrc = () => {
        if (pathBox) pathBox.style.display = sourceMode.value === 'path' ? '' : 'none';
        if (exprBox) exprBox.style.display = sourceMode.value === 'expr' ? '' : 'none';
      };
      sourceMode.addEventListener('change', syncSrc);
      syncSrc();
    }

    // Linked Value: drop target sets the bound document ref (token / actor / item)
    const dropZone = this.element.querySelector('.pc-source-drop');
    if (dropZone) {
      const refInput = dropZone.querySelector('input[name="source.ref"]');
      const refLabel = dropZone.querySelector('.pc-source-refname');
      const placeholder = 'Drag a token / actor / item here…';
      dropZone.addEventListener('dragover', (ev) => { ev.preventDefault(); dropZone.classList.add('drop-hover'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drop-hover'));
      dropZone.addEventListener('drop', (ev) => {
        ev.preventDefault();
        dropZone.classList.remove('drop-hover');
        let data;
        try {
          const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
          data = TE?.getDragEventData ? TE.getDragEventData(ev) : JSON.parse(ev.dataTransfer.getData('text/plain'));
        } catch { return; }
        if (!data?.uuid) { ui.notifications.warn('Drop a Token, Actor or Item.'); return; }
        const doc = fromUuidSync(data.uuid);
        refInput.value = data.uuid;
        if (refLabel) refLabel.textContent = doc?.name || data.uuid;
      });
      const clearBtn = dropZone.querySelector('.pc-source-clear');
      if (clearBtn) clearBtn.addEventListener('click', () => {
        refInput.value = '';
        if (refLabel) refLabel.textContent = placeholder;
      });
    }
  }

  /**
   * Wire the player-permission matrix: a Default-row radio change cascades its
   * level to every per-player row. Shared markup is templates/shared/permission-matrix.hbs.
   */
  _wirePermissionMatrix() {
    const defaultRadios = this.element.querySelectorAll('input[name="ownership.default"]');
    defaultRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        const level = radio.value;
        this.element
          .querySelectorAll(`input[name^="ownership.users."][value="${level}"]`)
          .forEach(input => { input.checked = true; });
      });
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Handle creating new clock
    if (!this.#clockJournal) {
      const defaultPosition = game.settings.get('vagabond', 'defaultClockPosition') || 'top-right';
      context.clock = {
        id: null,
        name: 'New Clock',
        handle: '',
        kind: 'clock',
        segments: 4,
        size: 'M',
        customSize: '',
        filled: 0,
        defaultPosition: defaultPosition,
        sceneId: ''
      };
      context.isNew = true;
    } else {
      const data = this.#clockJournal.flags.vagabond.progressClock;

      context.clock = {
        id: this.#clockJournal.id,
        name: this.#clockJournal.name,
        handle: data.handle ?? ProgressClock.slugify(this.#clockJournal.name),
        kind: data.kind || 'clock',
        segments: data.segments,
        size: data.size,
        customSize: typeof data.size === 'number' ? data.size : '',
        filled: data.filled ?? 0,
        defaultPosition: data.defaultPosition,
        sceneId: data.sceneId ?? ''
      };
      context.isNew = false;
    }

    context.isTracker = context.clock.kind === 'tracker';

    // Generic data binding (source → clock)
    const src = this.#clockJournal
      ? (this.#clockJournal.flags.vagabond.progressClock.source ?? {})
      : {};
    context.clock.source = {
      mode: src.mode || 'manual',
      ref: src.ref || '',
      valuePath: src.valuePath || '',
      maxPath: src.maxPath || '',
      expr: src.expr || '',
      syncMax: src.syncMax !== false
    };
    const refDoc = context.clock.source.ref ? fromUuidSync(context.clock.source.ref) : null;
    context.clock.source.refName = refDoc?.name || '';
    context.sourceIsPath = context.clock.source.mode === 'path';
    context.sourceIsExpr = context.clock.source.mode === 'expr';

    context.segmentOptions = [4, 6, 8, 10, 12];
    context.sizeOptions = CONFIG.VAGABOND.clockSizes;
    context.sceneOptions = game.scenes.map(s => ({ id: s.id, name: s.name }));

    // Clock cards: real (empty) clock art per segment count, number overlaid in
    // the centre. Merges the old Type + Segments pickers.
    context.clockCards = context.segmentOptions.map(n => ({
      segments: n,
      img: ProgressClock.getSVGPath(n, n),
      selected: !context.isTracker && context.clock.segments === n
    }));
    // Config card uses the decorated tracker art (overlay keeps the plain one).
    context.trackerImg = 'systems/vagabond/assets/ui/clocks/tracker-ui.svg';

    // Size cards (S / M / L) — icon dot scales with the rendered pixel size.
    const sizes = CONFIG.VAGABOND.clockSizes;
    const sizeMeta = [
      { key: 'S', label: game.i18n.localize('VAGABOND.ProgressClock.SizeSmall'), dot: '0.9rem' },
      { key: 'M', label: game.i18n.localize('VAGABOND.ProgressClock.SizeMedium'), dot: '1.4rem' },
      { key: 'L', label: game.i18n.localize('VAGABOND.ProgressClock.SizeLarge'), dot: '2rem' }
    ];
    context.sizeCards = sizeMeta.map(s => ({
      ...s,
      px: sizes[s.key],
      selected: context.clock.size === s.key
    }));

    // Ownership configuration
    if (!this.#clockJournal) {
      // Default ownership for new clocks
      const defaultLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
      context.ownership = {
        users: game.users.map(user => ({
          user: user,
          level: defaultLevel, // Initialize to match default
          name: user.name,
          isGM: user.isGM
        })),
        defaultLevel: defaultLevel
      };
    } else {
      // Existing clock - get saved default level
      const defaultLevel = this.#clockJournal.ownership.default ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
      context.ownership = {
        users: game.users.map(user => ({
          user: user,
          // Use individual override if exists, otherwise use default
          level: this.#clockJournal.ownership[user.id] ?? defaultLevel,
          name: user.name,
          isGM: user.isGM
        })),
        defaultLevel: defaultLevel
      };
    }

    return context;
  }

  /**
   * Handle form submission
   */
  async _onFormSubmit(event) {
    try {
      // Prevent default form submission
      event.preventDefault();
      event.stopPropagation();

      // Use native FormData and expand it manually
      const formData = new FormData(event.target);
      const formObject = {};

      for (const [key, value] of formData.entries()) {
        formObject[key] = value;
      }

      const expandedData = foundry.utils.expandObject(formObject);

      // Size is one of S / M / L (card picker). Default Position is no longer in
      // this dialog — it comes from the world setting.
      const finalSize = expandedData.size || 'M';
      const defaultPosition = this.#clockJournal?.flags?.vagabond?.progressClock?.defaultPosition
        ?? game.settings.get('vagabond', 'defaultClockPosition')
        ?? 'top-right';

      // Build ownership object
      const defaultLevel = parseInt(expandedData.ownership.default);
      const ownership = { default: defaultLevel };

      // Get all non-GM users
      const players = game.users.filter(u => !u.isGM);

      // Set all players to the default level first
      for (const player of players) {
        ownership[player.id] = defaultLevel;
      }

      // Then apply individual overrides from the details section
      if (expandedData.ownership?.users) {
        for (const [userId, level] of Object.entries(expandedData.ownership.users)) {
          ownership[userId] = parseInt(level);
        }
      }

      // Ensure creator is always OWNER (only for new clocks)
      if (!this.#clockJournal) {
        ownership[game.user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
      }

      const kind = expandedData.kind === 'tracker' ? 'tracker' : 'clock';

      // Tracker start value comes from the in-card number input (negatives allowed).
      // For clocks, leave filled undefined so create() defaults to "full".
      const parsedFilled = parseInt(expandedData.filled);
      const trackerFilled = kind === 'tracker' && Number.isFinite(parsedFilled) ? parsedFilled : 0;

      // Generic data binding (source → clock). Build a complete source object.
      const rawSource = expandedData.source || {};
      const source = {
        mode: ['manual', 'path', 'expr'].includes(rawSource.mode) ? rawSource.mode : 'manual',
        ref: (rawSource.ref || '').trim(),
        valuePath: (rawSource.valuePath || '').trim(),
        maxPath: (rawSource.maxPath || '').trim(),
        expr: (rawSource.expr || '').trim(),
        // Native FormData omits unchecked checkboxes; checked yields 'on'
        syncMax: rawSource.syncMax === 'on' || rawSource.syncMax === true
      };

      // Check if creating new clock or updating existing
      if (!this.#clockJournal) {
        // Create new clock/tracker
        await ProgressClock.create({
          name: expandedData.name,
          // Falsy handle → create() auto-derives a slug from the name
          handle: (expandedData.handle || '').trim() || undefined,
          kind: kind,
          segments: parseInt(expandedData.segments),
          filled: kind === 'tracker' ? trackerFilled : undefined,
          size: finalSize,
          defaultPosition: defaultPosition,
          sceneId: expandedData.sceneId || null,
          ownership: ownership,
          source: source
        });
      } else {
        // Update the journal
        const newSegments = parseInt(expandedData.segments);
        const currentFilled = this.#clockJournal.flags.vagabond.progressClock.filled ?? 0;
        // Trackers are unbounded (negatives allowed) and take the value typed in
        // the card; clocks clamp the current fill to [0, segments].
        const newFilled = kind === 'tracker'
          ? (Number.isFinite(parsedFilled) ? parsedFilled : currentFilled)
          : Math.clamp(currentFilled, 0, newSegments);
        await this.#clockJournal.update({
          name: expandedData.name,
          ownership: ownership,
          "flags.vagabond.progressClock.handle": (expandedData.handle || '').trim() || ProgressClock.slugify(expandedData.name),
          "flags.vagabond.progressClock.kind": kind,
          "flags.vagabond.progressClock.segments": newSegments,
          "flags.vagabond.progressClock.filled": newFilled,
          "flags.vagabond.progressClock.size": finalSize,
          "flags.vagabond.progressClock.defaultPosition": defaultPosition,
          "flags.vagabond.progressClock.sceneId": expandedData.sceneId || null,
          "flags.vagabond.progressClock.source": source
        });
      }

      // Push an initial value immediately when bound (no waiting for a hook tick).
      if (source.mode !== 'manual') ProgressClock.syncBound();

      // Close the dialog
      await this.close();
    } catch (error) {
      console.error('Error in _onSubmitForm:', error);
    }
  }
}
