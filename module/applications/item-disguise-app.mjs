import { ItemDisguise } from '../helpers/item-disguise.mjs';

const { api } = foundry.applications;

/** Effect descriptions: plain text in the editor, `<p>` paragraphs on the effect. */
const htmlToText = (html) => {
  const div = document.createElement('div');
  div.innerHTML = String(html ?? '').replace(/<\/p>\s*<p>/g, '\n').replace(/<br\s*\/?>/g, '\n');
  return div.textContent.trim();
};
const textToHtml = (text) => String(text ?? '').trim().split(/\n+/).filter(Boolean)
  .map(line => `<p>${foundry.utils.escapeHTML(line)}</p>`).join('');

/**
 * GM disguise editor (`ItemDisguise`): "Players see" (art, name, lore, description, each effect's shown name) next to
 * the read-only "True identity". Disguise / Save applies it to the item; Reveal brings the truth back (chat card
 * optional). One window per item. Edits live in `#draft` until applied — a re-render (Generate, art pick) captures
 * the form first.
 */
export class ItemDisguiseApp extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  static #open = new Map();

  #item;
  #draft;

  constructor(item) {
    super({ id: `vagabond-disguise-${item.uuid.replaceAll('.', '-')}` });
    this.#item = item;
    this.#draft = ItemDisguise.draft(item);
  }

  static open(item) {
    if (!game.user.isGM || !ItemDisguise.canDisguise(item)) return null;
    let app = this.#open.get(item.uuid);
    if (!app) {
      app = new this(item);
      this.#open.set(item.uuid, app);
    }
    app.render({ force: true });
    app.bringToFront?.();
    return app;
  }

  static DEFAULT_OPTIONS = {
    tag: 'form',
    classes: ['vagabond', 'item-disguise-app'],
    window: { icon: 'fa-solid fa-mask', resizable: true },
    position: { width: 760, height: 'auto' },
    form: { submitOnChange: false, closeOnSubmit: false },
    actions: {
      pickImage: ItemDisguiseApp.#onPickImage,
      useTrueImage: ItemDisguiseApp.#onUseTrueImage,
      generate: ItemDisguiseApp.#onGenerate,
      apply: ItemDisguiseApp.#onApply,
      reveal: ItemDisguiseApp.#onReveal,
    },
  };

  static PARTS = {
    form: { template: 'systems/vagabond/templates/apps/item-disguise.hbs' },
  };

  get title() {
    return game.i18n.format('VAGABOND.Item.Disguise.WindowTitle', { name: ItemDisguise.truthOf(this.#item).name });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.#item;
    const truth = ItemDisguise.truthOf(item);
    const draft = this.#draft;
    const enrich = (html) => foundry.applications.ux.TextEditor.implementation.enrichHTML(html ?? '', { relativeTo: item, secrets: true });
    const effects = ItemDisguise.ownEffects(item).map(e => ({
      id: e.id,
      trueName: truth.effects?.[e.id]?.name ?? e.name,
      trueImg: truth.effects?.[e.id]?.img ?? e.img,
      shownName: draft.effects?.[e.id]?.name ?? draft.name,
      shownImg: draft.effects?.[e.id]?.img || draft.img,
      // Plain text in the editor; stored as HTML
      shownDescription: htmlToText(draft.effects?.[e.id]?.description ?? ''),
    }));
    return {
      ...context,
      disguised: ItemDisguise.isDisguised(item),
      cursed: ItemDisguise.isCursed(item),
      hasLore: item.type === 'equipment',
      owner: item.actor?.name ?? '',
      shown: draft,
      truth: { ...truth, enriched: await enrich(truth.description) },
      effects,
      announce: this._announce ?? true,
    };
  }

  /** Form → `#draft` (keeps edits across re-renders). */
  #capture() {
    if (!this.element) return;
    const data = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(this.element).object);
    const effects = { ...(this.#draft.effects ?? {}) };
    for (const [id, f] of Object.entries(data.effects ?? {})) {
      effects[id] = {
        ...(effects[id] ?? {}),
        name: f.name ?? '',
        ...(f.description !== undefined ? { description: textToHtml(f.description) } : {}),
      };
    }
    this.#draft = {
      ...this.#draft,
      name: data.name ?? this.#draft.name,
      img: data.img ?? this.#draft.img,
      lore: data.lore ?? this.#draft.lore,
      description: data.description ?? this.#draft.description,
      effects,
    };
    this._announce = data.announce ?? this._announce;
  }

  /** The look to apply: effect rows left blank show the disguise name / art. */
  #look() {
    this.#capture();
    const d = this.#draft;
    const effects = {};
    for (const e of ItemDisguise.ownEffects(this.#item)) {
      const f = d.effects?.[e.id] ?? {};
      effects[e.id] = { name: f.name || d.name, img: f.img || d.img, description: f.description ?? '' };
    }
    return { name: d.name, img: d.img, description: d.description ?? '', lore: d.lore ?? '', effects };
  }

  static async #onPickImage() {
    this.#capture();
    const FP = foundry.applications.apps.FilePicker.implementation ?? foundry.applications.apps.FilePicker;
    new FP({
      type: 'image',
      current: this.#draft.img,
      callback: (path) => {
        this.#draft.img = path;
        this.render();
      },
    }).render(true);
  }

  static #onUseTrueImage() {
    this.#capture();
    this.#draft.img = ItemDisguise.truthOf(this.#item).img;
    this.render();
  }

  static #onGenerate() {
    this.#capture();
    this.#draft = ItemDisguise.generate(this.#item);
    this.render();
  }

  static async #onApply() {
    const look = this.#look();
    if (!look.name?.trim()) return ui.notifications.warn(game.i18n.localize('VAGABOND.Item.Disguise.NeedName'));
    await ItemDisguise.disguise(this.#item, look);
    this.#draft = ItemDisguise.draft(this.#item);
    this.close();
  }

  static async #onReveal() {
    this.#capture();
    await ItemDisguise.reveal(this.#item, { announce: this._announce !== false });
    this.close();
  }

  _onClose(options) {
    ItemDisguiseApp.#open.delete(this.#item.uuid);
    super._onClose(options);
  }
}
