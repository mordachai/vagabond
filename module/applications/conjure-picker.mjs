const { api } = foundry.applications;

/**
 * Conjure picker (ConjureHelper): a tile grid of what a Spell may call forth — Beings (Beast, HD budget) or Items
 * (Forge, one per Target / 5' cube). Click a tile = one more, right-click = one less; the meter shows what is
 * spent of the budget and tiles that no longer fit dim. Search filters in place (no re-render).
 * `prompt()` resolves `{picks: [{entry, count}], equip}` or null (cancelled / closed).
 * `single: true` (Polymorph, Force of Nature): no budget, a click picks that one tile and closes → `{picks: [{entry, count: 1}]}`.
 */
export class ConjurePicker extends api.HandlebarsApplicationMixin(api.ApplicationV2) {

  #opts;
  #resolve;
  #resolved = false;
  /** index → count */
  #counts = new Map();

  constructor(opts, resolve) {
    super({ window: { title: opts.title ?? '' } });
    this.#opts = opts;
    this.#resolve = resolve;
  }

  static DEFAULT_OPTIONS = {
    id: 'conjure-picker-{id}',
    classes: ['vagabond', 'conjure-picker'],
    window: { icon: 'fa-solid fa-paw', resizable: true },
    position: { width: 640, height: 'auto' },
  };

  static PARTS = {
    form: { template: 'systems/vagabond/templates/apps/conjure-picker.hbs' },
  };

  /**
   * @param {object} opts
   * @param {string} opts.title
   * @param {string} opts.hint
   * @param {number} opts.budget
   * @param {string} opts.budgetLabel
   * @param {Array<{uuid, name, img, cost, badge}>} opts.candidates
   * @param {string|null} [opts.equipToggle]  label of the "Equip" switch (Forge on yourself), or null
   * @param {boolean} [opts.single]  pick exactly one tile (no budget meter, no Confirm)
   * @returns {Promise<{picks: Array<{entry: object, count: number}>, equip: boolean}|null>}
   */
  static prompt(opts) {
    return new Promise((resolve) => {
      new ConjurePicker(opts, resolve).render({ force: true });
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const o = this.#opts;
    return {
      ...context,
      hint: o.hint,
      budget: o.budget,
      budgetLabel: o.budgetLabel,
      equipToggle: o.equipToggle ?? null,
      single: !!o.single,
      candidates: o.candidates.map((c, index) => ({ ...c, index, search: c.name.toLowerCase() })),
    };
  }

  #spent() {
    let total = 0;
    for (const [i, n] of this.#counts) total += this.#opts.candidates[i].cost * n;
    return total;
  }

  #refresh() {
    if (this.#opts.single) return;
    const root = this.element;
    const spent = this.#spent();
    const left = this.#opts.budget - spent;
    root.querySelector('.cjp-spent').textContent = String(spent);
    for (const tile of root.querySelectorAll('.cjp-tile')) {
      const i = Number(tile.dataset.index);
      const n = this.#counts.get(i) ?? 0;
      const badge = tile.querySelector('.cjp-count');
      badge.textContent = String(n);
      badge.hidden = n === 0;
      tile.classList.toggle('is-picked', n > 0);
      tile.classList.toggle('is-over', this.#opts.candidates[i].cost > left);
    }
    const confirm = root.querySelector('.cjp-confirm');
    confirm.disabled = spent === 0;
    confirm.classList.toggle('is-ready', spent > 0);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    const grid = root.querySelector('.cjp-grid');
    grid.addEventListener('click', (ev) => {
      const tile = ev.target.closest('.cjp-tile');
      if (!tile) return;
      const i = Number(tile.dataset.index);
      if (this.#opts.single) {
        this.#counts = new Map([[i, 1]]);
        this.#confirm();
        return;
      }
      if (this.#opts.candidates[i].cost > this.#opts.budget - this.#spent()) return;
      this.#counts.set(i, (this.#counts.get(i) ?? 0) + 1);
      this.#refresh();
    });
    grid.addEventListener('contextmenu', (ev) => {
      const tile = ev.target.closest('.cjp-tile');
      if (!tile || this.#opts.single) return;
      ev.preventDefault();
      const i = Number(tile.dataset.index);
      const n = (this.#counts.get(i) ?? 0) - 1;
      if (n > 0) this.#counts.set(i, n);
      else this.#counts.delete(i);
      this.#refresh();
    });
    root.querySelector('.cjp-search')?.addEventListener('input', (ev) => {
      const q = ev.target.value.trim().toLowerCase();
      for (const tile of root.querySelectorAll('.cjp-tile')) tile.hidden = !!q && !tile.dataset.search.includes(q);
    });
    root.querySelector('.cjp-confirm')?.addEventListener('click', () => this.#confirm());
    root.querySelector('.cjp-cancel')?.addEventListener('click', () => this.close());
    this.#refresh();
    root.querySelector('.cjp-search')?.focus();
  }

  /** Resized by hand → the grid fills the window instead of keeping its natural cap (`.is-sized`). */
  _onPosition(position) {
    super._onPosition(position);
    this.element?.classList.toggle('is-sized', position.height !== 'auto');
  }

  #confirm() {
    const picks = [...this.#counts].map(([i, count]) => ({ entry: this.#opts.candidates[i], count }));
    const equip = !!this.element.querySelector('.cjp-equip-input')?.checked;
    this.#resolved = true;
    this.#resolve({ picks, equip });
    this.close();
  }

  async close(options) {
    if (!this.#resolved) {
      this.#resolved = true;
      this.#resolve(null);
    }
    return super.close(options);
  }
}
