import { CurrencyHelper } from '../helpers/currency-helper.mjs';
import { ShopPricing } from '../helpers/shop-pricing.mjs';
import { ShopTransactions } from '../helpers/shop-transactions.mjs';
import { EquipmentHelper } from '../helpers/equipment-helper.mjs';
import { buildItemDetailSections } from '../helpers/item-sections.mjs';
import { emitSocket } from '../helpers/socket-helper.mjs';
import { ShopTabs } from '../helpers/shop-tabs.mjs';
import { ShopStock } from '../helpers/shop-stock.mjs';
import { equipmentStats } from '../helpers/equipment-stats.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Cart tabs: the character's own wallet vs. the party treasury. */
const CART_TABS = Object.freeze(['personal', 'group']);

/** Drag type of a stock card dragged to the cart (checked in dragover, where data is unreadable). */
const STOCK_MIME = 'application/x-vagabond-shop-stock';

/** Whether a drag carries a stock card. */
const isStockDrag = (ev) => !!ev.dataTransfer?.types?.includes(STOCK_MIME);

/** Toolbar sort orders. `shop` = featured first, then name (ShopTabs order). */
const SORTS = Object.freeze({
  shop: null,
  name: (a, b) => a.name.localeCompare(b.name),
  priceAsc: (a, b) => a.unitCopper - b.unitCopper || a.name.localeCompare(b.name),
  priceDesc: (a, b) => b.unitCopper - a.unitCopper || a.name.localeCompare(b.name),
  slots: (a, b) => a.slots - b.slots || a.name.localeCompare(b.name),
});

/**
 * The store window — what players (and the GM) shop in. One instance per shop.
 *
 * Layout: banner header (shop art + name, GM buttons, merchant), category sidebar,
 * item card grid, and a cart column with two tabs — Personal (character's wallet,
 * items to the character) and Group (party treasury, items to the party) — over a
 * sell drop zone (money goes to whoever owned the dropped item: character or party).
 *
 * Carts are client-side (per window, emptied on close). Purchase sends the whole cart
 * as one GM-authoritative transaction (ShopTransactions.buyCart). See docs/shop-plan.md.
 *
 * Reactive: hooks registered in `_onRender`, cleared in `_onClose`, renders debounced.
 */
export class ShopApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {Map<string, ShopApp>} shop uuid → open app */
  static #instances = new Map();

  static DEFAULT_OPTIONS = {
    classes: ['vagabond', 'shop-app'],
    tag: 'div',
    window: {
      icon: 'fas fa-store',
      resizable: true,
    },
    position: { width: 1065, height: 800 },
    actions: {
      selectTab: ShopApp.#onSelectTab,
      toggleSidebar: ShopApp.#onToggleSidebar,
      cartTab: ShopApp.#onCartTab,
      addToCart: ShopApp.#onAddToCart,
      cartStep: ShopApp.#onCartStep,
      cartRemove: ShopApp.#onCartRemove,
      purchase: ShopApp.#onPurchase,
      setView: ShopApp.#onSetView,
      clearSearch: ShopApp.#onClearSearch,
      showToPlayers: ShopApp.#onShowToPlayers,
      openShopSheet: ShopApp.#onOpenShopSheet,
    },
  };

  static PARTS = {
    main: {
      template: 'systems/vagabond/templates/shop/shop-app.hbs',
      scrollable: ['.shop-app-list', '.shop-cart-lines', '.shop-app-sidebar-list'],
    },
  };

  /**
   * @param {Actor} shop
   * @param {object} [options]
   */
  constructor(shop, options = {}) {
    super({ ...options, id: `vagabond-shop-${shop.uuid.replaceAll('.', '-')}` });
    this.shop = shop;
    /** @type {string|null} chosen buyer actor id (null = auto) */
    this._buyerId = options.buyerId ?? null;
    /** @type {string|null} chosen party actor id (null = first) */
    this._partyId = null;
    /** @type {string} active category tab / gear category */
    this._tab = ShopTabs.ALL;
    this._sub = null;
    this._sidebarCollapsed = false;
    /** Toolbar: search text (searches every category) and sort order */
    this._search = '';
    this._sort = 'shop';
    /** @type {number|null} search caret to restore after a render (null = not focused) */
    this._searchCaret = null;
    /** @type {'personal'|'group'} */
    this._cartTab = 'personal';
    /** @type {Record<string, Map<string, number>>} cart tab → (stock item id → qty) */
    this._carts = { personal: new Map(), group: new Map() };
    /** @type {Record<string, object|null>} cart tab → last receipt */
    this._receipts = { personal: null, group: null };
    this._busy = false;
    this._hookIds = null;
    this._abort = null;
  }

  /* -------------------------------------------- */
  /*  Opening                                     */
  /* -------------------------------------------- */

  /**
   * Resolve a shop reference: Actor, uuid, id or name.
   * @param {Actor|string} ref
   * @returns {Actor|null}
   */
  static resolveShop(ref) {
    if (!ref) return null;
    let actor = ref instanceof Actor ? ref : null;
    if (!actor && typeof ref === 'string') {
      actor = (ref.includes('.') ? fromUuidSync(ref) : null) ?? game.actors.get(ref) ?? game.actors.getName(ref);
    }
    return actor?.type === 'shop' ? actor : null;
  }

  /**
   * Open (or focus) the store window for a shop.
   * @param {Actor|string} ref
   * @param {{buyerId?: string}} [options]
   * @returns {ShopApp|null}
   */
  static open(ref, options = {}) {
    if (!game.settings.get('vagabond', 'shopsEnabled')) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Shop.Errors.disabled'));
      return null;
    }
    const shop = this.resolveShop(ref);
    if (!shop) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Shop.Errors.noShop'));
      return null;
    }
    if (!game.user.isGM && !shop.testUserPermission(game.user, 'LIMITED')) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Shop.Errors.permission'));
      return null;
    }
    let app = this.#instances.get(shop.uuid);
    if (!app) {
      app = new ShopApp(shop, options);
      this.#instances.set(shop.uuid, app);
    } else if (options.buyerId) {
      app._buyerId = options.buyerId;
    }
    app.render({ force: true }).then(() => app.bringToFront());
    return app;
  }

  /**
   * GM: open a shop on players' screens. Grants Observer ownership to those users when
   * they have less, so they can trade and open stock items' (read-only) sheets.
   * @param {Actor|string} ref
   * @param {{userIds?: string[]}} [options]  omitted = every active player
   */
  static async show(ref, { userIds } = {}) {
    if (!game.user.isGM) return;
    const shop = this.resolveShop(ref);
    if (!shop) return ui.notifications.warn(game.i18n.localize('VAGABOND.Shop.Errors.noShop'));
    const targets = (userIds ?? game.users.filter(u => u.active && !u.isGM).map(u => u.id))
      .map(id => game.users.get(id)).filter(u => u && !u.isGM);
    if (!targets.length) return ui.notifications.warn(game.i18n.localize('VAGABOND.Shop.App.NoPlayers'));

    const OBSERVER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    const ownership = {};
    for (const u of targets) {
      if (!shop.testUserPermission(u, 'OBSERVER')) ownership[u.id] = OBSERVER;
    }
    if (Object.keys(ownership).length) await shop.update({ ownership });

    emitSocket('shopShow', { shopUuid: shop.uuid, userIds: targets.map(u => u.id) });
    ui.notifications.info(game.i18n.format('VAGABOND.Shop.App.Shown', {
      shop: shop.name, users: targets.map(u => u.name).join(', '),
    }));
  }

  /**
   * GM: pick which online players see the shop (all ticked by default), then show it.
   * Used by the store's and the shop sheet's "Show to Players" buttons.
   * @param {Actor|string} ref
   */
  static async promptShow(ref) {
    if (!game.user.isGM) return;
    const players = game.users.filter(u => u.active && !u.isGM);
    if (!players.length) return ui.notifications.warn(game.i18n.localize('VAGABOND.Shop.App.NoPlayers'));
    const boxes = players.map(u => `<label class="checkbox"><input type="checkbox" name="${u.id}" checked> ${foundry.utils.escapeHTML(u.name)}</label>`).join('');
    const userIds = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize('VAGABOND.Shop.App.ShowToPlayers'), icon: 'fas fa-bullhorn' },
      content: `<div class="shop-show-users">${boxes}</div>`,
      ok: {
        label: game.i18n.localize('VAGABOND.Shop.App.Show'),
        callback: (event, button) => players.filter(u => button.form.elements[u.id]?.checked).map(u => u.id),
      },
      rejectClose: false,
    });
    if (userIds?.length) await this.show(ref, { userIds });
  }

  /** Socket handler (every client): open the shop if this user is targeted. */
  static onShowSocket({ shopUuid, userIds }) {
    if (!userIds?.includes(game.user.id)) return;
    this.open(shopUuid);
  }

  /** GM scene-control entry: open the only shop, or pick one. */
  static async pickAndOpen() {
    const shops = game.actors.filter(a => a.type === 'shop');
    if (!shops.length) return ui.notifications.warn(game.i18n.localize('VAGABOND.Shop.App.NoShops'));
    if (shops.length === 1) return this.open(shops[0]);
    const options = shops.map(s => `<option value="${s.id}">${foundry.utils.escapeHTML(s.name)}</option>`).join('');
    const id = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize('VAGABOND.Shop.App.PickShop'), icon: 'fas fa-store' },
      content: `<div class="form-group"><select name="shopId" autofocus>${options}</select></div>`,
      ok: {
        label: game.i18n.localize('VAGABOND.Shop.App.Open'),
        callback: (event, button) => button.form.elements.shopId.value,
      },
      rejectClose: false,
    });
    if (id) this.open(id);
  }

  /* -------------------------------------------- */
  /*  Buyer / party                               */
  /* -------------------------------------------- */

  /** Characters this user may buy for. GM: every character with a player owner. */
  static buyerCandidates() {
    return game.actors
      .filter(a => a.type === 'character' && (game.user.isGM ? a.hasPlayerOwner : a.isOwner))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Parties a buyer may spend from: those listing them as a member (GM: every party). */
  static partiesFor(buyer) {
    return game.actors
      .filter(a => a.type === 'party' && (game.user.isGM || (buyer && (a.system.members ?? []).includes(buyer.uuid))))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** @returns {Actor|null} */
  get buyer() {
    const candidates = ShopApp.buyerCandidates();
    const chosen = this._buyerId ? candidates.find(a => a.id === this._buyerId) : null;
    if (chosen) return chosen;
    const own = game.user.character;
    if (own?.type === 'character' && own.isOwner) return own;
    if (game.user.isGM) {
      const controlled = canvas.tokens?.controlled?.map(t => t.actor).find(a => a?.type === 'character');
      if (controlled) return controlled;
    }
    return candidates[0] ?? null;
  }

  /** @returns {Actor|null} party for the party cart */
  get party() {
    const parties = ShopApp.partiesFor(this.buyer);
    return parties.find(p => p.id === this._partyId) ?? parties[0] ?? null;
  }

  /** Who pays for (and receives) the active cart. */
  get payer() {
    return this._cartTab === 'group' ? this.party : this.buyer;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  get title() {
    return this.shop.name;
  }

  /** @override */
  async _prepareContext(options) {
    const shop = this.shop;
    const buyer = this.buyer;
    const isGM = game.user.isGM;
    const payer = this.payer;
    const funds = payer ? CurrencyHelper.toCopper(CurrencyHelper.walletOf(payer) ?? {}) : 0;
    const cart = this.#prepareCart({ shop, buyer, payer, funds });

    const rows = [];
    for (const item of shop.items) {
      if (!ShopTransactions.TRADE_TYPES.includes(item.type)) continue;
      const flags = ShopPricing.itemFlags(item);
      if (flags.hidden && !isGM) continue;
      rows.push(this.#prepareRow(item, { shop, buyer, payer, funds, flags }));
    }

    // Category sidebar: All Wares + type tabs (empty ones hidden), gear categories nested
    const view = ShopTabs.build(rows, { tab: this._tab, sub: this._sub, hideEmpty: true, includeAll: true });

    // Search spans every category; sort applies to whatever is listed
    const query = this._search.trim().toLowerCase();
    let shown = query
      ? ShopTabs.build(rows.filter(r => r.searchText.includes(query)), { tab: ShopTabs.ALL, includeAll: true }).rows
      : view.rows;
    if (SORTS[this._sort]) shown = [...shown].sort(SORTS[this._sort]);

    const sk = shop.system.shopkeeper;
    const candidates = ShopApp.buyerCandidates();
    const parties = ShopApp.partiesFor(buyer);
    const party = this.party;
    return {
      isGM,
      shop,
      subtitle: shop.system.subtitle,
      shopkeeper: {
        name: sk.name || shop.name,
        title: sk.title,
        img: sk.img || shop.img,
        description: await foundry.applications.ux.TextEditor.implementation.enrichHTML(sk.description ?? '', {
          relativeTo: shop, secrets: shop.isOwner,
        }),
      },
      attitude: isGM && buyer ? this.#attitudeOptions(buyer) : null,
      sidebarCollapsed: this._sidebarCollapsed,
      tabs: view.tabs,
      rows: shown,
      empty: !rows.length,
      search: this._search,
      searchCount: query ? shown.length : null,
      sortOptions: Object.keys(SORTS).map(key => ({
        key, selected: key === this._sort, label: game.i18n.localize(`VAGABOND.Shop.App.Sort.${key}`),
      })),
      listView: game.settings.get('vagabond', 'shopView') === 'list',
      buyer,
      buyerOptions: candidates.length > 1
        ? candidates.map(a => ({ id: a.id, name: a.name, selected: a.id === buyer?.id }))
        : null,
      cartTabs: CART_TABS.map(key => ({
        key,
        active: key === this._cartTab,
        label: game.i18n.localize(`VAGABOND.Shop.App.Cart.${key}`),
        icon: key === 'group' ? 'fas fa-users' : 'fas fa-user',
      })),
      isGroup: this._cartTab === 'group',
      party,
      partyOptions: parties.length > 1
        ? parties.map(p => ({ id: p.id, name: p.name, selected: p.id === party?.id }))
        : null,
      cart,
      receipt: this._receipts[this._cartTab],
      sell: {
        pct: Math.round((shop.system.pricing?.buyRatio ?? 0.5) * 100),
      },
    };
  }

  /**
   * Cart model for the active tab. Drops lines whose item vanished, became hidden or
   * blocked, or ran out; clamps quantities to stock.
   */
  #prepareCart({ shop, buyer, payer, funds }) {
    const map = this._carts[this._cartTab];
    const lines = [];
    let total = 0;
    for (const [itemId, want] of [...map]) {
      const item = shop.items.get(itemId);
      const flags = ShopPricing.itemFlags(item);
      if (!item || flags.blockBuy || (flags.hidden && !game.user.isGM)) { map.delete(itemId); continue; }
      const max = this.#maxQty(item);
      if (max <= 0) { map.delete(itemId); continue; }
      const qty = Math.min(want, max);
      map.set(itemId, qty);
      const { copper } = ShopPricing.price(item, { shop, buyer, mode: 'buy', qty });
      total += copper;
      lines.push({ id: itemId, item, name: item.name, img: item.img, qty, max, price: CurrencyHelper.format(copper) });
    }

    // Inventory Slots after checkout (payer with an inventory grid only)
    let slots = null;
    const inv = payer?.system?.inventory;
    if (inv?.maxSlots) {
      const after = this.#slotsAfter(payer, lines);
      slots = { before: inv.occupiedSlots, after, max: inv.maxSlots, over: after > inv.maxSlots };
    }

    const after = funds - total;
    return {
      lines,
      empty: !lines.length,
      payer,
      available: payer ? CurrencyHelper.format(funds) : null,
      after: CurrencyHelper.format(Math.max(0, after)),
      short: after < 0,
      total: CurrencyHelper.format(total),
      slots,
      canPurchase: !!payer && !!buyer && lines.length > 0 && after >= 0 && !this._busy,
    };
  }

  /** Units of a stock item one cart line may hold. */
  #maxQty(item) {
    return ShopTransactions.isUnlimited(item, this.shop)
      ? ShopTransactions.MAX_QTY
      : Math.min(ShopTransactions.MAX_QTY, ShopTransactions.quantityOf(item));
  }

  /** Slots the payer would occupy after buying `lines` (same stacking rules as the GM handler). */
  #slotsAfter(payer, lines) {
    const incoming = lines.flatMap(({ item, qty }) => {
      const cost = EquipmentHelper.itemSlotCost(item);
      return cost === 0 && item.type === 'equipment'
        ? [{ system: { slots: 0, quantity: qty } }]
        : Array.from({ length: qty }, () => ({ system: { slots: cost, quantity: 1 } }));
    });
    const held = payer.items.filter(i => ShopTransactions.TRADE_TYPES.includes(i.type));
    return EquipmentHelper.occupiedSlotsFor([...held, ...incoming]);
  }

  #prepareRow(item, { shop, buyer, payer, funds, flags }) {
    const unlimited = ShopTransactions.isUnlimited(item, shop);
    const stock = ShopTransactions.quantityOf(item);
    const unit = ShopPricing.price(item, { shop, buyer, mode: 'buy', qty: 1 });
    const inCart = this._carts[this._cartTab].get(item.id) ?? 0;
    const outOfStock = !unlimited && stock <= 0;
    const excerpt = plainText(item.system.description);

    return {
      item,
      id: item.id,
      name: item.name,
      img: item.img,
      featured: !!flags.featured,
      onSale: !!flags.onSale,
      hidden: !!flags.hidden,
      blockBuy: !!flags.blockBuy,
      slots: EquipmentHelper.itemSlotCost(item),
      stock: unlimited ? null : stock,
      outOfStock,
      stats: equipmentStats(item),
      excerpt,
      searchText: `${item.name} ${excerpt}`.toLowerCase(),
      unitCopper: unit.unit,
      unitPrice: CurrencyHelper.format(unit.unit),
      priceTooltip: this.#breakdownHtml(unit.breakdown),
      inCart,
      canAfford: !!payer && funds >= unit.unit,
      canAdd: !!payer && !flags.blockBuy && !outOfStock && inCart < this.#maxQty(item),
      detailHtml: this.#detailHtml(item),
    };
  }

  /** GM-only attitude picker: the buyer's relationship with this shop (-2..2, drives price %). */
  #attitudeOptions(buyer) {
    const sys = this.shop.system;
    const level = sys.relationshipOf(buyer);
    return sys.constructor.RELATION_KEYS.map((key, i) => {
      const pct = sys.relationPct(i - 2);
      return {
        level: i - 2,
        selected: i - 2 === level,
        label: `${game.i18n.localize(`VAGABOND.Shop.Relation.${key}`)}${pct ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''}`,
      };
    });
  }

  /** Name + description + stat grid (inventory mini-sheet markup). */
  #detailHtml(item) {
    return `<div class="shop-item-tooltip"><div class="shop-item-tooltip-name">${foundry.utils.escapeHTML(item.name)}</div>`
      + `${buildItemDetailSections(item)}`
      + `<div class="shop-item-tooltip-hint"><i class="fas fa-computer-mouse"></i> ${game.i18n.localize('VAGABOND.Shop.App.OpenHint')}</div></div>`;
  }

  #breakdownHtml(breakdown) {
    const esc = foundry.utils.escapeHTML;
    const lines = breakdown.map(b => {
      const pct = b.pct ? ` (${b.pct > 0 ? '+' : ''}${b.pct}%)` : '';
      return `<div class="shop-price-line"><span>${esc(game.i18n.localize(b.label))}${pct}</span>`
        + `<span>${CurrencyHelper.format(Math.round(b.copper))}</span></div>`;
    });
    return `<div class="shop-price-breakdown">${lines.join('')}</div>`;
  }

  /** @override — remember the search caret so typing survives re-renders. */
  async _preRender(context, options) {
    await super._preRender(context, options);
    const input = this.element?.querySelector('input[name="shopSearch"]');
    this._searchCaret = input && document.activeElement === input ? input.selectionStart : null;
  }

  #searchDebounce = foundry.utils.debounce(() => { if (this.rendered) this.render(); }, 250);

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    this._abort?.abort();
    this._abort = new AbortController();
    const { signal } = this._abort;
    const el = this.element;

    // Toolbar: search (debounced, keeps focus), sort
    const search = el.querySelector('input[name="shopSearch"]');
    if (search) {
      if (this._searchCaret !== null) {
        search.focus();
        search.setSelectionRange(this._searchCaret, this._searchCaret);
      }
      search.addEventListener('input', (ev) => {
        this._search = ev.currentTarget.value;
        this.#searchDebounce();
      }, { signal });
    }
    el.querySelector('select[name="shopSort"]')?.addEventListener('change', (ev) => {
      this._sort = ev.currentTarget.value in SORTS ? ev.currentTarget.value : 'shop';
      this.render();
    }, { signal });

    // GM: buyer's attitude toward the shop
    el.querySelector('select[name="attitude"]')?.addEventListener('change', (ev) => {
      const buyer = this.buyer;
      if (!game.user.isGM || !buyer) return;
      this.shop.update({ [`system.relationships.${buyer.id}`]: Number(ev.currentTarget.value) });
    }, { signal });

    el.querySelector('select[name="buyer"]')?.addEventListener('change', (ev) => {
      this._buyerId = ev.currentTarget.value || null;
      this.render();
    }, { signal });

    el.querySelector('select[name="party"]')?.addEventListener('change', (ev) => {
      this._partyId = ev.currentTarget.value || null;
      this.render();
    }, { signal });

    for (const input of el.querySelectorAll('input[data-cart-qty]')) {
      input.addEventListener('change', (ev) => {
        const target = ev.currentTarget;
        const qty = Math.floor(Number(target.value) || 0);
        const map = this._carts[this._cartTab];
        if (qty <= 0) map.delete(target.dataset.cartQty);
        else map.set(target.dataset.cartQty, Math.min(Number(target.max) || ShopTransactions.MAX_QTY, qty));
        this.render();
      }, { signal });
    }

    // GM: drop items / folders / compendiums on the wares to stock them
    const wares = el.querySelector('.shop-app-list');
    if (wares && this.shop.isOwner) {
      wares.addEventListener('dragover', (ev) => {
        if (isStockDrag(ev)) return;
        ev.preventDefault();
        wares.classList.add('drag-over');
      }, { signal });
      wares.addEventListener('dragleave', (ev) => {
        if (!wares.contains(ev.relatedTarget)) wares.classList.remove('drag-over');
      }, { signal });
      wares.addEventListener('drop', (ev) => {
        if (isStockDrag(ev)) return;
        ev.preventDefault();
        wares.classList.remove('drag-over');
        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev);
        ShopStock.handleDrop(this.shop, data);
      }, { signal });
    }

    // Double-click a card / list row → open the item (buttons and inputs excluded)
    el.querySelector('.shop-app-list')?.addEventListener('dblclick', (ev) => {
      if (ev.target.closest('button, input, select, a')) return;
      const itemId = ev.target.closest('.shop-card, .shop-row')?.dataset.itemId;
      if (itemId) this.#openItem(itemId);
    }, { signal });

    // Sell drop zone
    const zone = el.querySelector('.shop-sell-zone');
    if (zone) {
      zone.addEventListener('dragover', (ev) => {
        if (isStockDrag(ev)) return;
        ev.preventDefault();
        zone.classList.add('drag-over');
      }, { signal });
      zone.addEventListener('dragenter', (ev) => { if (!isStockDrag(ev)) ev.preventDefault(); }, { signal });
      zone.addEventListener('dragleave', (ev) => {
        if (!zone.contains(ev.relatedTarget)) zone.classList.remove('drag-over');
      }, { signal });
      zone.addEventListener('drop', (ev) => {
        ev.preventDefault();
        zone.classList.remove('drag-over');
        this.#onSellDrop(ev);
      }, { signal });
    }

    // Drag a card / list row from the wares onto the cart column → add 1
    el.querySelector('.shop-app-list')?.addEventListener('dragstart', (ev) => {
      const card = ev.target.closest?.('.shop-card[draggable="true"], .shop-row[draggable="true"]');
      if (!card) return;
      const payload = JSON.stringify({ type: 'VagabondShopStock', shopUuid: this.shop.uuid, itemId: card.dataset.itemId });
      ev.dataTransfer.setData(STOCK_MIME, payload);
      ev.dataTransfer.setData('text/plain', payload);
      ev.dataTransfer.effectAllowed = 'copy';
      card.classList.add('dragging');
      card.addEventListener('dragend', () => card.classList.remove('dragging'), { once: true, signal });
    }, { signal });

    const cartCol = el.querySelector('.shop-app-cart');
    if (cartCol) {
      const inSellZone = (ev) => !!ev.target.closest?.('.shop-sell-zone');
      cartCol.addEventListener('dragenter', (ev) => { if (isStockDrag(ev)) ev.preventDefault(); }, { signal });
      cartCol.addEventListener('dragover', (ev) => {
        if (!isStockDrag(ev) || inSellZone(ev)) {
          cartCol.classList.remove('stock-drag-over');
          return;
        }
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'copy';
        cartCol.classList.add('stock-drag-over');
      }, { signal });
      cartCol.addEventListener('dragleave', (ev) => {
        if (!cartCol.contains(ev.relatedTarget)) cartCol.classList.remove('stock-drag-over');
      }, { signal });
      cartCol.addEventListener('drop', (ev) => {
        cartCol.classList.remove('stock-drag-over');
        if (!isStockDrag(ev) || inSellZone(ev)) return;
        ev.preventDefault();
        let data = null;
        try { data = JSON.parse(ev.dataTransfer.getData(STOCK_MIME)); } catch { return; }
        if (data?.shopUuid !== this.shop.uuid) return;
        // Dropped on a cart tab → that cart
        const tab = ev.target.closest?.('.shop-cart-tab')?.dataset.cart;
        if (CART_TABS.includes(tab)) this._cartTab = tab;
        this.#addToCart(data.itemId);
      }, { signal });
    }

    if (!this._hookIds) this.#registerHooks();
  }

  #renderDebounce = foundry.utils.debounce(() => { if (this.rendered) this.render(); }, 100);

  #registerHooks() {
    const relevant = (actor) => {
      if (!actor) return false;
      const watched = [this.shop.uuid, this.buyer?.uuid, this.party?.uuid];
      return watched.includes(actor.uuid);
    };
    const onItem = (item) => { if (relevant(item.parent)) this.#renderDebounce(); };
    const onActor = (actor) => {
      if (actor.uuid === this.shop.uuid && !this.shop.testUserPermission(game.user, 'LIMITED') && !game.user.isGM) {
        this.close();
        return;
      }
      if (relevant(actor) || actor.type === 'party') this.#renderDebounce();
    };
    this._hookIds = {
      updateActor: Hooks.on('updateActor', onActor),
      createItem: Hooks.on('createItem', onItem),
      updateItem: Hooks.on('updateItem', onItem),
      deleteItem: Hooks.on('deleteItem', onItem),
      deleteActor: Hooks.on('deleteActor', (actor) => {
        if (actor.uuid === this.shop.uuid) this.close();
        else if (actor.type === 'party' || actor.type === 'character') this.#renderDebounce();
      }),
    };
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    for (const [hook, id] of Object.entries(this._hookIds ?? {})) Hooks.off(hook, id);
    this._hookIds = null;
    this._abort?.abort();
    this._abort = null;
    ShopApp.#instances.delete(this.shop.uuid);
  }

  /* -------------------------------------------- */
  /*  Selling                                     */
  /* -------------------------------------------- */

  /** Drop on the sell zone: an item from the user's character or party → confirm → sell. */
  async #onSellDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.type !== 'Item' || !data.uuid) return;
    const item = await fromUuid(data.uuid);
    const seller = item?.parent;
    const mayUse = seller?.type === 'party'
      ? ShopTransactions.canUseParty(seller, game.user)
      : seller?.type === 'character' && seller.isOwner;
    if (!mayUse) return ui.notifications.warn(game.i18n.localize('VAGABOND.Shop.App.SellNotYours'));
    if (!ShopTransactions.TRADE_TYPES.includes(item.type)) {
      return ui.notifications.warn(ShopTransactions.reasonLabel('noItem'));
    }
    if (item.system.equipped) return ui.notifications.warn(ShopTransactions.reasonLabel('equipped'));

    const have = ShopTransactions.quantityOf(item);
    const unit = ShopPricing.price(item, { shop: this.shop, buyer: seller, mode: 'sell', qty: 1 });
    const esc = foundry.utils.escapeHTML;
    const qtyField = have > 1
      ? `<div class="form-group"><label>${game.i18n.localize('VAGABOND.Shop.App.Quantity')}</label>`
        + `<input type="number" name="qty" value="${have}" min="1" max="${have}" step="1" autofocus></div>`
      : '';
    const qty = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize('VAGABOND.Shop.App.SellTitle'), icon: 'fas fa-hand-holding-dollar' },
      content: `<div class="shop-sell-confirm"><img src="${esc(item.img)}" alt="">`
        + `<div><p>${game.i18n.format('VAGABOND.Shop.App.SellConfirm', { item: `<strong>${esc(item.name)}</strong>`, shop: esc(this.shop.name) })}</p>`
        + `<p>${game.i18n.format('VAGABOND.Shop.App.SellOffer', { price: `<strong>${CurrencyHelper.format(unit.copper)}</strong>` })}</p></div></div>`
        + qtyField,
      ok: {
        label: game.i18n.localize('VAGABOND.Shop.App.Sell'),
        callback: (ev, button) => Math.floor(Number(button.form.elements.qty?.value ?? 1)),
      },
      rejectClose: false,
    });
    if (!(qty >= 1)) return;

    const result = await ShopTransactions.sell({ shop: this.shop, seller, itemId: item.id, qty });
    if (result?.ok) {
      this._receipts[seller.type === 'party' ? 'group' : 'personal'] = receiptOf('received', result);
      if (this.rendered) this.render();
    }
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onSelectTab(event, target) {
    const { tab, sub } = target.dataset;
    if (!tab) return;
    this._tab = tab;
    this._sub = sub ?? null;
    this.render();
  }

  static #onToggleSidebar() {
    this._sidebarCollapsed = !this._sidebarCollapsed;
    this.render();
  }

  static #onCartTab(event, target) {
    const key = target.dataset.cart;
    if (!CART_TABS.includes(key) || key === this._cartTab) return;
    this._cartTab = key;
    this.render();
  }

  static #onAddToCart(event, target) {
    this.#addToCart(target.closest('[data-item-id]')?.dataset.itemId);
  }

  /** Add one of a stock item to the active cart (button or drag-and-drop). */
  #addToCart(itemId) {
    const item = this.shop.items.get(itemId);
    const flags = ShopPricing.itemFlags(item);
    if (!item || flags.blockBuy || (flags.hidden && !game.user.isGM) || this.#maxQty(item) <= 0) return;
    if (!this.payer) {
      const key = this._cartTab === 'group' ? 'NoParty' : 'NoCharacter';
      return ui.notifications.warn(game.i18n.localize(`VAGABOND.Shop.App.${key}`));
    }
    const map = this._carts[this._cartTab];
    map.set(itemId, Math.min(this.#maxQty(item), (map.get(itemId) ?? 0) + 1));
    this.render();
  }

  static #onCartStep(event, target) {
    const itemId = target.closest('[data-item-id]')?.dataset.itemId;
    const item = this.shop.items.get(itemId);
    const map = this._carts[this._cartTab];
    if (!item || !map.has(itemId)) return;
    const next = Math.min(this.#maxQty(item), map.get(itemId) + Number(target.dataset.step || 0));
    if (next <= 0) map.delete(itemId);
    else map.set(itemId, next);
    this.render();
  }

  static #onCartRemove(event, target) {
    const itemId = target.closest('[data-item-id]')?.dataset.itemId;
    this._carts[this._cartTab].delete(itemId);
    this.render();
  }

  static async #onPurchase() {
    const buyer = this.buyer;
    const payer = this.payer;
    const group = this._cartTab === 'group';
    const map = this._carts[this._cartTab];
    if (!buyer) return ui.notifications.warn(game.i18n.localize('VAGABOND.Shop.App.NoCharacter'));
    if (!payer) return ui.notifications.warn(game.i18n.localize('VAGABOND.Shop.App.NoParty'));
    if (!map.size || this._busy) return;

    // Warn (don't block) when the cart would overflow the recipient's inventory Slots
    const inv = payer.system.inventory;
    if (inv?.maxSlots) {
      const lines = [...map].map(([itemId, qty]) => ({ item: this.shop.items.get(itemId), qty })).filter(l => l.item);
      const after = this.#slotsAfter(payer, lines);
      if (after > inv.maxSlots) {
        const proceed = await foundry.applications.api.DialogV2.confirm({
          window: { title: game.i18n.localize('VAGABOND.Shop.App.SlotWarningTitle'), icon: 'fas fa-box-open' },
          content: `<p>${game.i18n.format('VAGABOND.Shop.App.SlotWarning', { name: payer.name, after, max: inv.maxSlots })}</p>`,
          rejectClose: false,
        });
        if (!proceed) return;
      }
    }

    this._busy = true;
    this.render();
    try {
      const result = await ShopTransactions.buyCart({
        shop: this.shop, buyer, party: group ? payer : null,
        lines: [...map].map(([itemId, qty]) => ({ itemId, qty })),
      });
      if (result?.ok) {
        map.clear();
        this._receipts[this._cartTab] = receiptOf('paid', result);
      }
    } finally {
      this._busy = false;
      if (this.rendered) this.render();
    }
  }

  /** Open a stock item (double-click on a card / list row). */
  #openItem(itemId) {
    const item = this.shop.items.get(itemId);
    if (!item) return;
    // Players (Limited or better) get the locked, read-only sheet — see VagabondItemSheet#limitedView
    item.sheet.render(true);
  }

  static async #onSetView(event, target) {
    const view = target.dataset.view;
    if (!['grid', 'list'].includes(view)) return;
    await game.settings.set('vagabond', 'shopView', view);
    this.render();
  }

  static #onClearSearch() {
    this._search = '';
    this.render();
  }

  static #onShowToPlayers() {
    return ShopApp.promptShow(this.shop);
  }

  static #onOpenShopSheet() {
    this.shop.sheet.render(true);
  }
}

/** Receipt model shown above the cart total. */
function receiptOf(kind, result) {
  return {
    kind,
    paid: kind === 'paid',
    price: CurrencyHelper.format(result.copper ?? 0),
    lines: (result.lines ?? []).map(l => ({ name: l.name, qty: l.qty })),
  };
}

/** Plain-text excerpt of an item's HTML description (parsed inert, enricher links → labels). */
function plainText(html) {
  if (!html) return '';
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
  return text.replace(/@\w+\[[^\]]*\](?:\{([^}]*)\})?/g, '$1').replace(/\s+/g, ' ').trim();
}
