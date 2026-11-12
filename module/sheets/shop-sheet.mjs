import { CurrencyHelper } from '../helpers/currency-helper.mjs';
import { ShopPricing } from '../helpers/shop-pricing.mjs';
import { ShopTransactions } from '../helpers/shop-transactions.mjs';
import { ShopApp } from '../applications/shop-app.mjs';
import { ShopTabs } from '../helpers/shop-tabs.mjs';
import { ShopStock } from '../helpers/shop-stock.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Shop actor sheet (GM configuration). Phase 0 foundation: shopkeeper identity,
 * pricing, purse and a plain stock list (drag items in). The player-facing store
 * is a separate app (ShopApp, phase 1). See docs/shop-plan.md.
 */
export class VagabondShopSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ['vagabond', 'actor', 'shop-sheet'],
    position: { width: 640, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      openStockItem: VagabondShopSheet.#onOpenStockItem,
      deleteStockItem: VagabondShopSheet.#onDeleteStockItem,
      removeDuplicates: VagabondShopSheet.#onRemoveDuplicates,
      openStore: VagabondShopSheet.#onOpenStore,
      toggleShopOpen: VagabondShopSheet.#onToggleOpen,
      createOpenMacro: VagabondShopSheet.#onCreateOpenMacro,
      selectTab: VagabondShopSheet.#onSelectTab,
      selectSubTab: VagabondShopSheet.#onSelectSubTab,
      addBuyEntry: VagabondShopSheet.#onAddBuyEntry,
      removeBuyEntry: VagabondShopSheet.#onRemoveBuyEntry,
    },
  };

  /** Key of the leading icon tab (shopkeeper + settings). */
  static SHOP_TAB = 'shop';

  /** Active tab / gear sub-tab (kept across re-renders). */
  _tab = VagabondShopSheet.SHOP_TAB;
  _sub = null;

  /** Type picked in the "Buys from Players" add row (kept across re-renders). */
  _buyType = 'gear';

  static PARTS = {
    form: {
      template: 'systems/vagabond/templates/shop/shop-sheet.hbs',
      scrollable: ['.shop-sheet-body'],
    },
  };

  /**
   * Non-owners (players with Limited/Observer) never see the config sheet — opening the
   * shop (token double-click, sidebar) shows the store window instead.
   * @override
   */
  _canRender(options) {
    if (!this.actor.isOwner) {
      ShopApp.open(this.actor);
      return false;
    }
    return super._canRender(options);
  }

  /** @override */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    controls.unshift({ icon: 'fas fa-store', label: 'VAGABOND.Shop.Sheet.OpenStore', action: 'openStore' });
    if (game.user.isGM) {
      controls.push({ icon: 'fas fa-bolt', label: 'VAGABOND.Shop.Sheet.CreateOpenMacro', action: 'createOpenMacro' });
    }
    return controls;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const system = actor.system;

    const stock = actor.items
      .filter(i => ShopTransactions.TRADE_TYPES.includes(i.type))
      .map(item => ({
        item,
        featured: ShopPricing.itemFlags(item).featured ? 1 : 0,
        id: item.id,
        name: item.name,
        img: item.img,
        quantity: ShopTransactions.quantityOf(item),
        unlimited: ShopTransactions.isUnlimited(item, actor),
        // Containers have no quantity (always 1)
        qtyEditable: this.isEditable && item.type !== 'container',
        category: ShopPricing.itemFlags(item).category ?? '',
        base: CurrencyHelper.format(ShopPricing.baseCopper(item)),
        price: CurrencyHelper.format(ShopPricing.price(item, { shop: actor, mode: 'buy' }).copper),
      }));

    return Object.assign(context, {
      actor,
      system,
      systemFields: system.schema.fields,
      editable: this.isEditable,
      isGM: game.user.isGM,
      // Leading icon tab = settings; type tabs always shown (empty ones too, so the GM sees them)
      ...(() => {
        const SHOP = VagabondShopSheet.SHOP_TAB;
        const view = ShopTabs.build(stock, { tab: this._tab, sub: this._sub, fallback: SHOP });
        const onShopTab = view.tab === SHOP;
        return {
          iconTab: { key: SHOP, icon: 'fas fa-store', label: game.i18n.localize('VAGABOND.Shop.Sheet.ShopTab'), active: onShopTab },
          tabs: view.tabs,
          subtabs: onShopTab ? null : view.subtabs,
          rows: view.rows,
          onShopTab,
          hasCategory: ShopTabs.CATEGORY_TABS.includes(view.tab),
        };
      })(),
      shopkeeperImg: system.shopkeeper.img || 'icons/svg/mystery-man.svg',
      enrichedShopkeeperDescription: await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        system.shopkeeper.description ?? '', { relativeTo: actor, secrets: actor.isOwner }
      ),
      purseTotal: CurrencyHelper.format(system.currency),
      sliders: VagabondShopSheet.#pricingSliders(system.pricing),
      buys: this._tab === VagabondShopSheet.SHOP_TAB ? await this.#buysContext() : null,
    });
  }

  /**
   * "Buys from Players" section: the listed entries + the add row (type select, then the
   * subtype — a select for config-keyed subtypes, free text with suggestions for gear).
   */
  async #buysContext() {
    const Shop = this.actor.system.constructor;
    const entries = (this.actor.system.buysCategories ?? [])
      .map(key => ({ key, label: Shop.buyEntryLabel(key) }));
    const type = this._buyType;
    const types = Object.entries(CONFIG.VAGABOND.equipmentTypes ?? {})
      .map(([key, label]) => ({ key, label: game.i18n.localize(label), selected: key === type }));

    let subOptions = null;
    let subSuggestions = null;
    const configMap = { weapon: CONFIG.VAGABOND.weaponSkills, alchemical: CONFIG.VAGABOND.alchemicalTypes }[type];
    if (configMap) {
      subOptions = Object.keys(configMap).map(key => ({ value: key, label: Shop.buySubtypeLabel(type, key) }));
    } else if (type === 'gear') {
      subSuggestions = await VagabondShopSheet.#gearCategories(this.actor);
    }
    return { entries, types, subOptions, subFree: !!subSuggestions, subSuggestions, listId: `${this.id}-buy-sub` };
  }

  /** Gear categories in use: world items, this shop's stock and every Item compendium. */
  static async #gearCategories(shop) {
    const found = new Set();
    const add = (item) => {
      const cat = String(item?.system?.gearCategory ?? '').trim();
      if (cat && (item.system.equipmentType ?? 'gear') === 'gear') found.add(cat);
    };
    game.items.forEach(add);
    shop.items.forEach(add);
    for (const pack of game.packs.filter(p => p.documentName === 'Item')) {
      const index = await pack.getIndex({ fields: ['system.gearCategory', 'system.equipmentType'] });
      index.forEach(add);
    }
    return [...found].sort((a, b) => a.localeCompare(b));
  }

  /** Slider readouts: markup is signed, buyRatio (a fraction) reads as a percentage. */
  static SLIDER_FORMATS = {
    signedPct: (v) => `${v > 0 ? '+' : ''}${Math.round(v)}%`,
    ratioPct: (v) => `${Math.round(v * 100)}%`,
    pct: (v) => `${Math.round(v)}%`,
  };

  /**
   * Pricing sliders. Steps are fine enough that any stored value sits on the grid
   * (a range input snaps its value to `step`, and the form would save the snapped
   * value), and each max stretches to cover a larger stored value.
   */
  static #pricingSliders(pricing) {
    const make = (value, min, max, step, format) => ({
      value, min, max: Math.max(max, value), step, format,
      display: VagabondShopSheet.SLIDER_FORMATS[format](value),
    });
    return {
      markup: make(pricing.markup, -100, 300, 1, 'signedPct'),
      buyRatio: make(pricing.buyRatio, 0, 2, 0.01, 'ratioPct'),
      saleDiscount: make(pricing.saleDiscount, 0, 100, 1, 'pct'),
      presencePctPerPoint: make(pricing.presencePctPerPoint, 0, 20, 1, 'pct'),
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    // Category inputs write the item flag directly (no `name` — not part of the actor form)
    for (const input of this.element.querySelectorAll('input[data-category-for]')) {
      input.addEventListener('change', (ev) => {
        const item = this.actor.items.get(ev.currentTarget.dataset.categoryFor);
        const value = ev.currentTarget.value.trim();
        item?.update({ 'flags.vagabond.shop.category': value || null });
      });
    }
    // Stock quantity inputs (limited stock only) write the item directly, same as category
    for (const input of this.element.querySelectorAll('input[data-qty-for]')) {
      input.addEventListener('change', (ev) => {
        const item = this.actor.items.get(ev.currentTarget.dataset.qtyFor);
        const qty = Math.max(0, Math.floor(Number(ev.currentTarget.value) || 0));
        item?.update({ 'system.quantity': qty });
      });
    }
    // "Buys from Players" type select: swaps the subtype field (no `name` — not saved)
    this.element.querySelector('select.shop-buy-type')?.addEventListener('change', (ev) => {
      this._buyType = ev.currentTarget.value;
      this.render();
    });
    // Pricing sliders: live readout while dragging (the form saves on release)
    for (const range of this.element.querySelectorAll('input[type="range"][data-format]')) {
      const out = range.parentElement.querySelector('.shop-slider-value');
      const fmt = VagabondShopSheet.SLIDER_FORMATS[range.dataset.format];
      range.addEventListener('input', () => { if (out && fmt) out.value = fmt(Number(range.value)); });
    }
  }

  /**
   * Stocking drops (GM): an Item, an Item folder, a whole Item compendium or a folder of
   * compendiums — see ShopStock. Items dragged within this shop fall through to sorting.
   * @override
   */
  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (!this.actor.isOwner) return null;
    if (data?.type === 'Item') {
      const item = await fromUuid(data.uuid);
      if (item?.parent?.uuid === this.actor.uuid) return super._onDrop(event);
    }
    if (['Item', 'Folder', 'Compendium'].includes(data?.type)) return ShopStock.handleDrop(this.actor, data);
    return super._onDrop(event);
  }

  static async #onRemoveDuplicates() {
    if (!this.actor.isOwner) return;
    await ShopStock.removeDuplicates(this.actor);
  }

  static #onOpenStockItem(event, target) {
    const item = this.actor.items.get(target.closest('[data-item-id]')?.dataset.itemId);
    item?.sheet.render(true);
  }

  static #onSelectTab(event, target) {
    const key = target.dataset.tab;
    if (!key || key === this._tab) return;
    this._tab = key;
    this.render();
  }

  static #onSelectSubTab(event, target) {
    const key = target.dataset.sub;
    if (!key || key === this._sub) return;
    this._sub = key;
    this.render();
  }

  /** Add the picked type (blank subtype = the whole type, which replaces its subtype entries). */
  static async #onAddBuyEntry(event, target) {
    const row = target.closest('.shop-buys-add');
    const type = row?.querySelector('.shop-buy-type')?.value;
    if (!type) return;
    const sub = String(row.querySelector('.shop-buy-sub')?.value ?? '').trim();
    let entries = [...(this.actor.system.buysCategories ?? [])];
    if (entries.includes(type)) return;
    const Shop = this.actor.system.constructor;
    if (sub) entries.push(`${type}:${sub}`);
    else entries = [...entries.filter(e => Shop.parseBuyEntry(e).type !== type), type];
    await this.actor.update({ 'system.buysCategories': [...new Set(entries)] });
  }

  static async #onRemoveBuyEntry(event, target) {
    const entry = target.dataset.entry;
    const entries = (this.actor.system.buysCategories ?? []).filter(e => e !== entry);
    await this.actor.update({ 'system.buysCategories': entries });
  }

  static #onToggleOpen() {
    return ShopApp.toggleOpen(this.actor);
  }

  /** GM: make (or reuse) a world macro that toggles this shop open/closed and put it on the hotbar. */
  static async #onCreateOpenMacro() {
    const actor = this.actor;
    const command = `game.vagabond.shop.toggleOpen("${actor.uuid}");`;
    const name = game.i18n.format('VAGABOND.Shop.Sheet.OpenMacroName', { shop: actor.name });
    let macro = game.macros.find(m => m.command === command);
    macro ??= await Macro.create({ name, type: 'script', img: actor.img, command });
    const taken = new Set(Object.keys(game.user.hotbar ?? {}).map(Number));
    let slot = 1;
    while (taken.has(slot) && slot <= 50) slot++;
    if (slot <= 50) await game.user.assignHotbarMacro(macro, slot);
  }

  static #onOpenStore() {
    ShopApp.open(this.actor);
  }

  static async #onDeleteStockItem(event, target) {
    const item = this.actor.items.get(target.closest('[data-item-id]')?.dataset.itemId);
    await item?.delete();
  }
}
