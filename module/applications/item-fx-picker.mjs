import { VagabondFXDb } from '../helpers/item-fx-db.mjs';

const { api } = foundry.applications;

/**
 * Floating window for choosing an item's Hit / Miss animation from the Sequencer
 * database (JB2A free / Patreon). Walk the tree one level at a time — weapon → type →
 * variant → color — and either use everything under the current level (Sequencer then
 * picks randomly, so "any variant" is just a shorter path) or pin one specific clip.
 *
 * Writes `system.itemFx.<field>` and switches the item's animation on.
 */
export class ItemFxPicker extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  static #instance = null;

  static DEFAULT_OPTIONS = {
    id: 'vagabond-item-fx-picker',
    classes: ['vagabond-item-fx-picker'],
    window: { title: 'VAGABOND.ItemFx.Picker.Title', resizable: true },
    position: { width: 560, height: 620 },
    actions: {
      goTo: ItemFxPicker.#onGoTo,
      enter: ItemFxPicker.#onEnter,
      useLevel: ItemFxPicker.#onUseLevel,
      useFile: ItemFxPicker.#onUseFile,
    },
  };

  static PARTS = {
    picker: { template: 'systems/vagabond/templates/apps/item-fx-picker.hbs' },
  };

  /** @type {Item} */
  #item;
  /** @type {'hitFile'|'missFile'|'throwFile'} */
  #field = 'hitFile';
  /** @type {string[]} */
  #segs = [];
  /** Selected tile preview, kept across re-renders of the same level. */
  #previewFile = '';

  /**
   * Open (or retarget) the singleton picker.
   * @param {Item} item
   * @param {'hitFile'|'missFile'|'throwFile'} field
   */
  static open(item, field = 'hitFile') {
    if (!VagabondFXDb.available()) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.ItemFx.Picker.NoDatabase'));
      return;
    }
    const inst = ItemFxPicker.#instance?.rendered
      ? ItemFxPicker.#instance
      : (ItemFxPicker.#instance = new ItemFxPicker());
    inst.#item = item;
    inst.#field = field;
    inst.#segs = inst.#startPath();
    inst.#previewFile = '';
    inst.render({ force: true });
    inst.bringToTop?.();
  }

  /** Start where the slot already points; else at the item's auto pick; else the library root. */
  #startPath() {
    const current = this.#item.system.itemFx?.[this.#field]?.trim() ?? '';
    const auto = this.#field === 'throwFile'
      ? VagabondFXDb.autoThrownSpec(this.#item)
      : VagabondFXDb.autoSpec(this.#item);
    const candidates = [current, auto?.path ?? '', 'jb2a'];
    for (const c of candidates) {
      const path = c.replace(/(\.?\*)+$/, '');
      if (path && VagabondFXDb.isDbPath(path) && !path.includes('|') && VagabondFXDb.exists(path)) {
        return path.split('.');
      }
    }
    return [];
  }

  get title() {
    const slot = game.i18n.localize({
      missFile: 'VAGABOND.ItemFx.Miss',
      throwFile: 'VAGABOND.ItemFx.Throw',
    }[this.#field] ?? 'VAGABOND.ItemFx.Hit');
    return `${this.#item?.name ?? ''} — ${slot}`;
  }

  async _prepareContext(options) {
    const path = this.#segs.join('.');
    const choices = VagabondFXDb.children(path).map(name => ({
      name,
      branch: VagabondFXDb.children(path ? `${path}.${name}` : name).length > 0,
    }));
    const all = path ? VagabondFXDb.files(path, 400) : [];
    const tiles = all.slice(0, 12).map(file => ({
      file,
      src: `${file}#t=0.6`,
      name: decodeURIComponent(file.split('/').pop() ?? file),
    }));
    const preview = this.#previewFile && all.includes(this.#previewFile) ? this.#previewFile : (all[0] ?? '');
    return {
      path,
      crumbs: [
        { label: game.i18n.localize('VAGABOND.ItemFx.Picker.Library'), index: 0 },
        ...this.#segs.map((label, i) => ({ label, index: i + 1 })),
      ],
      choices,
      showFilter: choices.length > 12,
      atLeaf: !!path && !choices.length,
      tiles,
      total: all.length,
      more: Math.max(0, all.length - tiles.length),
      preview,
      previewName: preview ? decodeURIComponent(preview.split('/').pop() ?? '') : '',
      canUse: !!path && all.length > 0,
      useLabel: game.i18n.format('VAGABOND.ItemFx.Picker.UseLevel', { count: all.length }),
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    if (this.window?.title) this.window.title.textContent = this.title;

    const main = this.element.querySelector('.ifp-main-video');
    const play = (src) => {
      if (!main || !src) return;
      if (!main.src.endsWith(src)) main.src = src;
      main.currentTime = 0;
      main.play().catch(() => {});
    };
    play(context.preview);

    // Tiles: hover = preview in the big player (and play the tile itself)
    this.element.querySelectorAll('.ifp-tile').forEach(tile => {
      const vid = tile.querySelector('video');
      tile.addEventListener('mouseenter', () => {
        this.#previewFile = tile.dataset.file;
        play(tile.dataset.file);
        vid?.play().catch(() => {});
      });
      tile.addEventListener('mouseleave', () => { vid?.pause(); if (vid) vid.currentTime = 0.6; });
    });

    // Filter box: hide non-matching choices without re-rendering (keeps focus)
    const filter = this.element.querySelector('.ifp-filter');
    filter?.addEventListener('input', () => {
      const q = filter.value.trim().toLowerCase();
      this.element.querySelectorAll('.ifp-choice').forEach(btn => {
        btn.hidden = !!q && !btn.dataset.name.toLowerCase().includes(q);
      });
    });
  }

  async #commit(value) {
    const update = { [`system.itemFx.${this.#field}`]: value, 'system.itemFx.enabled': true };
    await this.#item.update(update);
    this.close();
  }

  static #onGoTo(event, target) {
    const index = Number(target.dataset.index);
    if (!Number.isInteger(index)) return;
    this.#segs = this.#segs.slice(0, index);
    this.#previewFile = '';
    this.render();
  }

  static #onEnter(event, target) {
    const name = target.dataset.name;
    if (!name) return;
    this.#segs = [...this.#segs, name];
    this.#previewFile = '';
    this.render();
  }

  static #onUseLevel() {
    const path = this.#segs.join('.');
    if (path) this.#commit(path);
  }

  static #onUseFile(event, target) {
    const file = target.dataset.file;
    // A ranged clip is pinned by its database path so Sequencer still picks the
    // range file that matches the distance to the target.
    if (file) this.#commit(VagabondFXDb.rangedPathOf(file) ?? file);
  }

  async close(options) {
    ItemFxPicker.#instance = null;
    return super.close(options);
  }
}
