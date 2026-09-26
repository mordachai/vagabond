import { CurrencyHelper } from './currency-helper.mjs';
import { ShopPricing } from './shop-pricing.mjs';
import { EquipmentHelper } from './equipment-helper.mjs';
import { ShopChat } from './shop-chat.mjs';

/**
 * Shop transactions — every money/stock write runs on the active GM.
 *
 * Clients call the public statics (`buy`, `buyCart`, `sell`, `partyTransfer`); those route to the
 * active GM through `CONFIG.queries` (`User#query`) and resolve to `{ ok, reason?, ... }`.
 * The GM runs the handler locally. Handlers re-validate everything against live data
 * (the sender is verified from the query context, never trusted from the payload) and
 * run one at a time, so two players buying the last item can't both get it.
 *
 * Buy stacking (slot rules): 0-Slot equipment merges into an existing unequipped stack
 * from the same source; anything with Slots ≥ 1 (and every container) is created as
 * separate quantity-1 items so each occupies its own grid space.
 *
 * Post-hook (GM client): `vagabond.shopTransaction({ type, shop, actor, party?, item, qty, copper, lines? })`
 * (`item`/`qty` are null on a multi-line cart — read `lines`),
 * then a chat receipt (ShopChat, `shopChatMode` setting).
 */
export class ShopTransactions {
  static QUERIES = Object.freeze({
    buy: 'vagabond.shop.buy',
    buyCart: 'vagabond.shop.buyCart',
    sell: 'vagabond.shop.sell',
    partyTransfer: 'vagabond.shop.partyTransfer',
  });

  /** Item types a shop can trade. */
  static TRADE_TYPES = Object.freeze(['equipment', 'container']);

  /** Upper bound on one purchase — guards against runaway document creation. */
  static MAX_QTY = 100;

  /** Upper bound on distinct lines in one cart. */
  static MAX_LINES = 50;

  /** Register query handlers. Call once in `init` (all clients). */
  static registerQueries() {
    CONFIG.queries[this.QUERIES.buy] = (data, { user }) => this.#serialize(() => this._handleBuy(data, user));
    CONFIG.queries[this.QUERIES.buyCart] = (data, { user }) => this.#serialize(() => this._handleBuyCart(data, user));
    CONFIG.queries[this.QUERIES.sell] = (data, { user }) => this.#serialize(() => this._handleSell(data, user));
    CONFIG.queries[this.QUERIES.partyTransfer] = (data, { user }) =>
      this.#serialize(() => this._handlePartyTransfer(data, user));
  }

  /* -------------------------------------------- */
  /*  Public API (any client)                     */
  /* -------------------------------------------- */

  /**
   * Buy `qty` of a shop's stock item for a character.
   * @param {object} args
   * @param {Actor|string} args.shop
   * @param {Actor|string} args.buyer
   * @param {string} args.itemId       embedded item id on the shop
   * @param {number} [args.qty]
   * @param {string|null} [args.material]  Smithy material swap (must be offered by the item)
   * @param {boolean} [args.notify]    warn on failure
   */
  static buy({ shop, buyer, itemId, qty = 1, material = null, notify = true }) {
    return this.#request(this.QUERIES.buy,
      { shopUuid: uuidOf(shop), buyerUuid: uuidOf(buyer), itemId, qty, material }, notify);
  }

  /**
   * Buy a whole cart in one all-or-nothing transaction: every line is validated, the
   * total is paid once, items are created in one batch, one receipt is posted.
   * With `party`, the party treasury pays and the items go into the party's inventory;
   * `buyer` is the member shopping (prices use their Presence).
   * @param {object} args
   * @param {Actor|string} args.shop
   * @param {Actor|string} args.buyer
   * @param {Actor|string|null} [args.party]
   * @param {Array<{itemId: string, qty: number, material?: string|null}>} args.lines
   * @param {boolean} [args.notify]
   * @returns {Promise<{ok: boolean, reason?: string, copper?: number, lines?: object[]}>}
   */
  static buyCart({ shop, buyer, party = null, lines, notify = true }) {
    return this.#request(this.QUERIES.buyCart, {
      shopUuid: uuidOf(shop), buyerUuid: uuidOf(buyer), partyUuid: party ? uuidOf(party) : null,
      lines: (lines ?? []).map(l => ({ itemId: l.itemId, qty: l.qty, material: l.material ?? null })),
    }, notify);
  }

  /**
   * Sell `qty` of an actor's item to a shop.
   * @param {object} args
   * @param {Actor|string} args.shop
   * @param {Actor|string} args.seller  character or party
   * @param {string} args.itemId        embedded item id on the seller
   * @param {number} [args.qty]
   * @param {boolean} [args.notify]
   */
  static sell({ shop, seller, itemId, qty = 1, notify = true }) {
    return this.#request(this.QUERIES.sell,
      { shopUuid: uuidOf(shop), sellerUuid: uuidOf(seller), itemId, qty }, notify);
  }

  /**
   * Move money between a character and a party treasury.
   * Positive `copper` = character → party (deposit); negative = party → character (withdraw).
   * @param {object} args
   * @param {Actor|string} args.party
   * @param {Actor|string} args.actor
   * @param {number} args.copper
   * @param {boolean} [args.notify]
   */
  static partyTransfer({ party, actor, copper, notify = true }) {
    return this.#request(this.QUERIES.partyTransfer,
      { partyUuid: uuidOf(party), actorUuid: uuidOf(actor), copper }, notify);
  }

  /** Localized text for a failure reason. */
  static reasonLabel(reason) {
    return game.i18n.localize(`VAGABOND.Shop.Errors.${reason ?? 'error'}`);
  }

  /* -------------------------------------------- */
  /*  Shared helpers                              */
  /* -------------------------------------------- */

  /**
   * Whether a user may spend from / sell out of a party: GM, a party owner, or the
   * owner of any member character.
   */
  static canUseParty(party, user) {
    if (party?.type !== 'party') return false;
    if (user.isGM || party.testUserPermission(user, 'OWNER')) return true;
    return (party.system.members ?? []).some(uuid => fromUuidSync(uuid)?.testUserPermission(user, 'OWNER'));
  }

  /** Whether a stock item never runs out (own flag wins over the shop default). */
  static isUnlimited(item, shop) {
    return ShopPricing.itemFlags(item).unlimited ?? shop?.system?.stock?.unlimitedByDefault ?? false;
  }

  /** Units held by an item (containers have no quantity — always 1). */
  static quantityOf(item) {
    return item?.type === 'container' ? 1 : Math.max(0, item?.system?.quantity ?? 1);
  }

  /**
   * Whether two items (documents or data) are the same thing for stacking/restocking.
   * Compendium source + name when both have a source; name + equipment type is the
   * fallback. Material must match. The name check keeps renamed copies of one compendium
   * entry apart (duplicates keep the source — e.g. two "Scroll, Spell" for different spells).
   */
  static sameSource(a, b) {
    if (a?.type !== b?.type) return false;
    if ((a.system?.metal ?? 'none') !== (b.system?.metal ?? 'none')) return false;
    const sameName = a.name?.trim().toLowerCase() === b.name?.trim().toLowerCase();
    const srcA = a._stats?.compendiumSource;
    const srcB = b._stats?.compendiumSource;
    if (srcA && srcB) return srcA === srcB && sameName;
    return sameName && a.system?.equipmentType === b.system?.equipmentType;
  }

  /** The shop stock item matching `item`, if any. */
  static findStockMatch(shop, item) {
    return shop?.items.find(i => this.sameSource(i, item)) ?? null;
  }

  /**
   * Clean creation data for a copy of a traded item: shop flags and equip/container
   * state stripped, optional material applied. `preferredSkill` is dropped so
   * `VagabondItem._preCreate` re-seeds it for the new owner.
   * @param {Item} item
   * @param {{material?: string|null}} [opts]
   */
  static buildItemData(item, { material = null } = {}) {
    const data = item.toObject();
    delete data._id;
    delete data.folder;
    delete data.sort;
    delete data.ownership;
    data._stats = { compendiumSource: item._stats?.compendiumSource ?? null };
    if (data.flags?.vagabond) {
      delete data.flags.vagabond.shop;
      delete data.flags.vagabond.equippedAt;
      delete data.flags.vagabond.preferredSkill;
    }
    if (data.type === 'equipment') {
      data.system.equipmentState = 'unequipped';
      data.system.equipped = false;
      data.system.containerId = null;
      if (material) data.system.metal = material;
    }
    return data;
  }

  /* -------------------------------------------- */
  /*  Query handlers (active GM)                  */
  /* -------------------------------------------- */

  static _handleBuy({ shopUuid, buyerUuid, itemId, qty, material = null }, user) {
    return this._handleBuyCart({ shopUuid, buyerUuid, partyUuid: null, lines: [{ itemId, qty, material }] }, user);
  }

  static async _handleBuyCart({ shopUuid, buyerUuid, partyUuid = null, lines }, user) {
    if (!game.settings.get('vagabond', 'shopsEnabled')) return fail('disabled');
    const shop = await fromUuid(shopUuid);
    if (shop?.type !== 'shop') return fail('noShop');
    const buyer = await fromUuid(buyerUuid);
    if (buyer?.type !== 'character') return fail('noActor');
    if (!buyer.testUserPermission(user, 'OWNER') || !shop.testUserPermission(user, 'LIMITED')) return fail('permission');

    // Group purchase: the party pays and receives; the buyer must be a member (GM exempt)
    let party = null;
    if (partyUuid) {
      party = await fromUuid(partyUuid);
      if (party?.type !== 'party') return fail('noActor');
      if (!user.isGM && !(party.system.members ?? []).includes(buyer.uuid)) return fail('permission');
    }
    const payer = party ?? buyer;

    if (!Array.isArray(lines) || !lines.length) return fail('emptyCart');
    if (lines.length > this.MAX_LINES) return fail('badQty');

    // Merge duplicate lines (same item + material)
    const merged = new Map();
    for (const line of lines) {
      const qty = Math.floor(Number(line?.qty));
      if (!(qty >= 1 && qty <= this.MAX_QTY)) return fail('badQty');
      const key = `${line.itemId}|${line.material ?? ''}`;
      const prev = merged.get(key);
      merged.set(key, { itemId: line.itemId, material: line.material ?? null, qty: (prev?.qty ?? 0) + qty });
    }

    const planned = [];
    const perItem = new Map(); // itemId → qty across materials (stock check)
    let total = 0;
    for (const { itemId, material, qty } of merged.values()) {
      if (qty > this.MAX_QTY) return fail('badQty');
      const item = shop.items.get(itemId);
      const flags = ShopPricing.itemFlags(item);
      if (!item || !this.TRADE_TYPES.includes(item.type) || (flags.hidden && !user.isGM)) return fail('noItem');
      if (flags.blockBuy) return fail('blocked');
      if (material && (!(flags.materials ?? []).includes(material) || !(material in CONFIG.VAGABOND.metalData))) {
        return fail('badMaterial');
      }
      perItem.set(itemId, (perItem.get(itemId) ?? 0) + qty);
      const { copper } = ShopPricing.price(item, { shop, buyer, mode: 'buy', material, qty });
      total += copper;
      planned.push({ item, qty, material, copper });
    }
    for (const [itemId, qty] of perItem) {
      const item = shop.items.get(itemId);
      if (!this.isUnlimited(item, shop) && this.quantityOf(item) < qty) return fail('outOfStock');
    }

    const wallet = CurrencyHelper.walletOf(payer);
    const newWallet = wallet ? CurrencyHelper.pay(wallet, total) : null;
    if (!newWallet) return fail('funds');

    // What lands in the recipient's inventory: 0-Slot equipment merges into an existing
    // unequipped stack (or one new stack); everything else = separate quantity-1 items.
    const stackUpdates = new Map(); // stack id → new quantity
    const creates = [];
    let gridPos = EquipmentHelper.nextGridPosition(payer);
    for (const { item, qty, material } of planned) {
      const data = this.buildItemData(item, { material });
      const stackable = data.type === 'equipment' && EquipmentHelper.itemSlotCost(new Item.implementation(data)) === 0;
      const stack = stackable
        ? payer.items.find(i => i.type === 'equipment' && !i.system.equipped && !i.system.containerId
          && EquipmentHelper.itemSlotCost(i) === 0 && this.sameSource(i, data))
        : null;
      if (stack) {
        stackUpdates.set(stack.id, (stackUpdates.get(stack.id) ?? stack.system.quantity) + qty);
        continue;
      }
      const count = stackable ? 1 : qty;
      for (let i = 0; i < count; i++) {
        const d = foundry.utils.deepClone(data);
        if (d.type === 'equipment') d.system.quantity = stackable ? qty : 1;
        d.system.gridPosition = gridPos++;
        creates.push(d);
      }
    }

    await payer.update({ 'system.currency': newWallet });
    try {
      if (stackUpdates.size) {
        await payer.updateEmbeddedDocuments('Item',
          [...stackUpdates].map(([_id, quantity]) => ({ _id, 'system.quantity': quantity })));
      }
      if (creates.length) await payer.createEmbeddedDocuments('Item', creates);
    } catch (err) {
      await payer.update({ 'system.currency': wallet }); // refund
      throw err;
    }

    // Stock: one batch of updates, one batch of deletes
    const stockUpdates = [];
    const stockDeletes = [];
    for (const [itemId, qty] of perItem) {
      const item = shop.items.get(itemId);
      if (this.isUnlimited(item, shop)) continue;
      const left = this.quantityOf(item) - qty;
      if (left <= 0) stockDeletes.push(itemId);
      else stockUpdates.push({ _id: itemId, 'system.quantity': left });
    }
    if (stockUpdates.length) await shop.updateEmbeddedDocuments('Item', stockUpdates);
    if (stockDeletes.length) await shop.deleteEmbeddedDocuments('Item', stockDeletes);
    if (shop.system.usePurse) {
      await shop.update({ 'system.currency': CurrencyHelper.add(shop.system.currency, total) });
    }

    const single = planned.length === 1 ? planned[0] : null;
    postReceipt({
      type: 'buy', shop, actor: buyer, party, copper: total,
      item: single?.item ?? null, qty: single?.qty ?? null, material: single?.material ?? null,
      lines: planned.map(({ item, qty, copper }) => ({ item, qty, copper })),
    });
    return {
      ok: true,
      copper: total,
      qty: planned.reduce((n, l) => n + l.qty, 0),
      lines: planned.map(({ item, qty, copper }) => ({ name: item.name, img: item.img, qty, copper })),
    };
  }

  static async _handleSell({ shopUuid, sellerUuid, itemId, qty }, user) {
    if (!game.settings.get('vagabond', 'shopsEnabled')) return fail('disabled');
    const shop = await fromUuid(shopUuid);
    if (shop?.type !== 'shop') return fail('noShop');
    const seller = await fromUuid(sellerUuid);
    if (!['character', 'party'].includes(seller?.type)) return fail('noActor');
    const mayUse = seller.type === 'party' ? this.canUseParty(seller, user) : seller.testUserPermission(user, 'OWNER');
    if (!mayUse || !shop.testUserPermission(user, 'LIMITED')) return fail('permission');

    const item = seller.items.get(itemId);
    if (!item || !this.TRADE_TYPES.includes(item.type)) return fail('noItem');
    if (item.system.equipped) return fail('equipped');
    if (item.type === 'container' && item.system.items?.length) return fail('containerNotEmpty');

    qty = Math.floor(Number(qty));
    if (!(qty >= 1 && qty <= this.quantityOf(item))) return fail('badQty');

    const categories = shop.system.buysCategories ?? [];
    const category = item.type === 'container' ? 'container' : item.system.equipmentType;
    if (categories.length && !categories.includes(category)) return fail('notBought');

    const stockMatch = this.findStockMatch(shop, item);
    if (ShopPricing.itemFlags(stockMatch).blockSell) return fail('blocked');

    const { copper } = ShopPricing.price(item, { shop, buyer: seller, mode: 'sell', qty });
    let newPurse = null;
    if (shop.system.usePurse) {
      newPurse = CurrencyHelper.pay(shop.system.currency, copper);
      if (!newPurse) return fail('shopFunds');
    }

    // Capture the copy BEFORE the seller's item is reduced/deleted
    const data = shop.system.resell ? this.buildItemData(item) : null;

    await seller.update({ 'system.currency': CurrencyHelper.add(seller.system.currency, copper) });
    if (newPurse) await shop.update({ 'system.currency': newPurse });
    if (qty >= this.quantityOf(item)) await item.delete();
    else await item.update({ 'system.quantity': this.quantityOf(item) - qty });

    if (data) {
      if (stockMatch && stockMatch.type === 'equipment') {
        if (!this.isUnlimited(stockMatch, shop)) {
          await stockMatch.update({ 'system.quantity': stockMatch.system.quantity + qty });
        }
      } else {
        if (data.type === 'equipment') data.system.quantity = qty;
        await shop.createEmbeddedDocuments('Item', [data]);
      }
    }

    postReceipt({ type: 'sell', shop, actor: seller, item, qty, copper });
    return { ok: true, copper, qty, lines: [{ name: item.name, img: item.img, qty, copper }] };
  }

  static async _handlePartyTransfer({ partyUuid, actorUuid, copper }, user) {
    const party = await fromUuid(partyUuid);
    if (party?.type !== 'party') return fail('noActor');
    const actor = await fromUuid(actorUuid);
    if (actor?.type !== 'character') return fail('noActor');
    if (!actor.testUserPermission(user, 'OWNER')) return fail('permission');
    const isMember = (party.system.members ?? []).includes(actor.uuid);
    if (!isMember && !party.testUserPermission(user, 'OWNER')) return fail('permission');

    const amount = Math.trunc(Number(copper));
    if (!amount) return fail('badAmount');

    const [from, to] = amount > 0 ? [actor, party] : [party, actor];
    const paid = CurrencyHelper.pay(from.system.currency, Math.abs(amount));
    if (!paid) return fail('funds');

    await from.update({ 'system.currency': paid });
    await to.update({ 'system.currency': CurrencyHelper.add(to.system.currency, Math.abs(amount)) });

    postReceipt({ type: 'partyTransfer', shop: null, actor, party, copper: amount });
    return { ok: true, copper: amount };
  }

  /* -------------------------------------------- */
  /*  Internals                                   */
  /* -------------------------------------------- */

  static #queue = Promise.resolve();

  /** Run GM handlers one at a time (live-data checks stay valid until the writes land). */
  static #serialize(fn) {
    const run = this.#queue.then(() => fn());
    this.#queue = run.catch(() => {});
    return run;
  }

  static async #request(name, data, notify) {
    const gm = game.users.activeGM;
    let result;
    if (!gm) {
      result = fail('noGM');
    } else {
      try {
        result = gm.isSelf
          ? await CONFIG.queries[name](data, { user: game.user })
          : await gm.query(name, data, { timeout: 30 * 1000 });
      } catch (err) {
        console.error(`Vagabond | Shop query "${name}" failed`, err);
        result = fail('error');
      }
    }
    if (!result?.ok && notify) ui.notifications.warn(this.reasonLabel(result?.reason));
    return result;
  }
}

/** Post-transaction: module hook + chat receipt. A receipt failure never fails the trade. */
function postReceipt(tx) {
  Hooks.callAll('vagabond.shopTransaction', tx);
  ShopChat.post(tx).catch(err => console.error('Vagabond | Shop receipt failed', err));
}

function fail(reason) {
  return { ok: false, reason };
}

function uuidOf(doc) {
  return typeof doc === 'string' ? doc : doc?.uuid;
}
