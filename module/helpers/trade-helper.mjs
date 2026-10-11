import { CurrencyHelper } from './currency-helper.mjs';
import { EquipmentHelper } from './equipment-helper.mjs';
import { ShopTransactions } from './shop-transactions.mjs';

/**
 * Free trade — moving items and coins between inventories (Characters, transport Holds,
 * any Container item; coins also to / from the party Chest). The party actor holds no items.
 *
 * Guard rails (checked by the executing client against the requesting user):
 * - GM: anything.
 * - Take (the source): what the user owns, or what the party shares — the party Chest and its
 *   transports (their Holds) — for anyone who may use that party
 *   (`ShopTransactions.canUseParty`). Another player's inventory is never a source.
 * - Give (the destination): what the user owns, the party, its transports and its members.
 * - Copies from the sidebar / a compendium (no source actor) only land where the user owns.
 *
 * Moves never lose an item: the destination is written first, the source is reduced after;
 * if that fails the destination write is rolled back.
 *
 * Refs (JSON-safe, sent through the query):
 * - item source: `{ itemUuid }` (embedded or world/compendium item) or
 *   `{ containerUuid, entryId, index }` (an entry of a container's `system.items`)
 * - item / coin holder: `{ actorUuid }` or `{ containerUuid }`
 *
 * Writes the user can't make run on the active GM (`CONFIG.queries`, serialized); a user who
 * owns every document involved runs them locally (no GM needed).
 * Post-hook (executing client): `vagabond.trade({ type: 'item'|'coins', user, ... })`.
 */
export class TradeHelper {
  static QUERIES = Object.freeze({
    moveItem: 'vagabond.trade.moveItem',
    moveCoins: 'vagabond.trade.moveCoins',
  });

  /** Item types that live in inventories and can change hands. */
  static TRADE_TYPES = Object.freeze(['equipment', 'container']);

  /** Register the query handlers. Call once in `init` (all clients). */
  static registerQueries() {
    CONFIG.queries[this.QUERIES.moveItem] = (data, { user }) => this.#serialize(() => this._handleMoveItem(data, user));
    CONFIG.queries[this.QUERIES.moveCoins] = (data, { user }) => this.#serialize(() => this._handleMoveCoins(data, user));
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Move `qty` units of an item (whole stack when omitted) to an actor or a container.
   * @param {object} args
   * @param {{itemUuid?: string, containerUuid?: string, entryId?: string, index?: number}} args.source
   * @param {{actorUuid?: string, containerUuid?: string}} args.dest
   * @param {number|null} [args.qty]
   * @param {boolean} [args.notify]  toast the outcome
   * @returns {Promise<{ok: boolean, reason?: string, name?: string, qty?: number}>}
   */
  static async moveItem({ source, dest, qty = null, notify = true }) {
    const data = { source, dest, qty };
    // A dragged Item document is only read when it has no actor (sidebar / compendium copy)
    const local = await this.#ownsAll([source.containerUuid ?? source.itemUuid, dest.actorUuid ?? dest.containerUuid],
      { freeSource: !source.containerUuid });
    const result = await this.#request(this.QUERIES.moveItem, data, local);
    if (notify) {
      if (result?.ok) ui.notifications.info(game.i18n.format('VAGABOND.Trade.Moved', { qty: result.qty, name: result.name, dest: result.destName }));
      else this.warn(result?.reason);
    }
    return result;
  }

  /**
   * Split `copper` from one wallet evenly between recipients. Each gets floor(copper / n),
   * as the largest coins; the remainder stays with the giver.
   * @param {object} args
   * @param {{actorUuid?: string, containerUuid?: string}} args.from
   * @param {Array<{actorUuid?: string, containerUuid?: string}>} args.to
   * @param {number} args.copper
   * @param {boolean} [args.notify]
   * @returns {Promise<{ok: boolean, reason?: string, share?: number, count?: number}>}
   */
  static async moveCoins({ from, to, copper, notify = true }) {
    const data = { from, to, copper };
    const uuids = [from, ...to].map((ref) => ref.actorUuid ?? ref.containerUuid);
    const local = await this.#ownsAll(uuids);
    const result = await this.#request(this.QUERIES.moveCoins, data, local);
    if (notify) {
      if (result?.ok) {
        ui.notifications.info(game.i18n.format('VAGABOND.Trade.CoinsMoved', {
          share: CurrencyHelper.format(result.share), count: result.count,
        }));
      } else this.warn(result?.reason);
    }
    return result;
  }

  /**
   * How many units a drop moves: the whole stack, or (Shift held, stack > 1) the amount picked
   * in a small prompt. Null when the prompt is cancelled.
   * @param {Item|object} item  document or source data
   * @param {DragEvent} [event]
   * @returns {Promise<number|null>}
   */
  static async pickQuantity(item, event) {
    const total = this.quantityOf(item);
    if (total <= 1 || !event?.shiftKey) return total;
    const name = Handlebars.escapeExpression(item?.name ?? '');
    const value = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize('VAGABOND.Trade.HowMany'), icon: 'fa-solid fa-arrows-left-right' },
      classes: ['vagabond', 'trade-qty-dialog'],
      content: `<div class="trade-qty">
          <p class="trade-qty-name">${name}</p>
          <div class="trade-qty-row">
            <input type="range" name="qtyRange" min="1" max="${total}" value="${total}" step="1">
            <input type="number" name="qty" min="1" max="${total}" value="${total}" step="1" autofocus>
            <span class="trade-qty-of">/ ${total}</span>
          </div>
        </div>`,
      ok: {
        label: game.i18n.localize('VAGABOND.Trade.Move'),
        icon: 'fa-solid fa-check',
        callback: (ev, button) => Number(button.form.elements.qty.value),
      },
      render: (ev, dialog) => {
        const form = dialog.element.querySelector('form') ?? dialog.element;
        const range = form.querySelector('[name="qtyRange"]');
        const number = form.querySelector('[name="qty"]');
        range?.addEventListener('input', () => { number.value = range.value; });
        number?.addEventListener('input', () => { range.value = number.value; });
        number?.select();
      },
      rejectClose: false,
    });
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n >= 1 ? Math.min(n, total) : null;
  }

  /**
   * One-time purge (active GM, guard `partyStashPurged`): party actors no longer hold items
   * (leftovers of the old party containers / group buys); embedded items left on them are deleted.
   */
  static async purgePartyItems() {
    if (game.user !== game.users.activeGM || game.settings.get('vagabond', 'partyStashPurged')) return;
    for (const party of game.actors.filter((a) => a.type === 'party' && a.items.size)) {
      console.log(`Vagabond | Purging ${party.items.size} leftover item(s) from party "${party.name}":`,
        party.items.map((i) => i.name).join(', '));
      await party.deleteEmbeddedDocuments('Item', party.items.map((i) => i.id));
    }
    await game.settings.set('vagabond', 'partyStashPurged', true);
  }

  /** Toast a failure reason. */
  static warn(reason) {
    ui.notifications.warn(this.reasonLabel(reason));
  }

  /** Localized text for a failure reason. */
  static reasonLabel(reason) {
    return game.i18n.localize(`VAGABOND.Trade.Errors.${reason ?? 'error'}`);
  }

  /* -------------------------------------------- */
  /*  Guard rails                                 */
  /* -------------------------------------------- */

  /**
   * The actor whose inventory a holder belongs to: the actor itself, a container's owning
   * actor, or null for a world container item.
   */
  static actorOf(holder) {
    if (!holder) return null;
    return holder.documentName === 'Actor' ? holder : (holder.parent?.documentName === 'Actor' ? holder.parent : null);
  }

  /**
   * Parties an actor belongs to.
   * @param {Actor} actor
   * @param {{members?: boolean}} [opts]  also count party membership (not just party / transport)
   */
  static partiesOf(actor, { members = false } = {}) {
    if (!actor) return [];
    return game.actors.filter((party) => party.type === 'party' && (
      party === actor
      || (party.system.transports ?? []).some((t) => t.uuid === actor.uuid)
      || (members && (party.system.members ?? []).includes(actor.uuid))));
  }

  /** Whether an actor is shared party property (the party itself or one of its transports). */
  static isShared(actor) {
    return this.partiesOf(actor).length > 0;
  }

  /**
   * Whether `user` may take items / coins out of a holder (actor or container item).
   * Their own documents, or the party's Stash / Chest and transport Holds.
   */
  static canTake(user, holder) {
    if (!holder) return false;
    if (user.isGM || holder.testUserPermission(user, 'OWNER')) return true;
    return this.partiesOf(this.actorOf(holder)).some((party) => ShopTransactions.canUseParty(party, user));
  }

  /** Whether `user` may put items / coins into a holder: theirs, or anything of their party. */
  static canGive(user, holder) {
    if (!holder) return false;
    if (user.isGM || holder.testUserPermission(user, 'OWNER')) return true;
    return this.partiesOf(this.actorOf(holder), { members: true }).some((party) => ShopTransactions.canUseParty(party, user));
  }

  /** Units held by an item or entry (containers always 1). */
  static quantityOf(data) {
    return data?.type === 'container' ? 1 : Math.max(0, Math.floor(Number(data?.system?.quantity ?? 1)));
  }

  /* -------------------------------------------- */
  /*  Query handlers (executing client)           */
  /* -------------------------------------------- */

  static async _handleMoveItem({ source, dest, qty }, user) {
    // --- Source ---
    let sourceItem = null;     // an Item document (embedded or world / compendium)
    let sourceContainer = null; // or an entry of this container
    let entryIndex = -1;
    let sourceData;
    if (source?.containerUuid) {
      sourceContainer = await fromUuid(source.containerUuid);
      if (sourceContainer?.type !== 'container') return fail('noSource');
      entryIndex = findEntryIndex(sourceContainer.system.items, source);
      if (entryIndex < 0) return fail('noSource');
      sourceData = foundry.utils.deepClone(sourceContainer.system.items[entryIndex]);
      if (!this.canTake(user, sourceContainer)) return fail('notYours');
    } else {
      sourceItem = source?.itemUuid ? await fromUuid(source.itemUuid) : null;
      if (!sourceItem) return fail('noSource');
      sourceData = sourceItem.toObject();
    }
    if (!this.TRADE_TYPES.includes(sourceData?.type)) return fail('notTradable');
    const parentActor = sourceItem?.parent?.documentName === 'Actor' ? sourceItem.parent : null;
    // A free-standing item (sidebar / compendium, or on a compendium actor) is copied, never moved
    const fromActor = parentActor && !parentActor.pack ? parentActor : null;
    const copyOnly = !!sourceItem && !fromActor;
    if (fromActor && !this.canTake(user, fromActor)) return fail('notYours');

    // --- Destination ---
    const target = await fromUuid(dest?.actorUuid ?? dest?.containerUuid ?? '');
    if (!target) return fail('noDest');
    const toContainer = dest.containerUuid ? target : null;
    if (toContainer && toContainer.type !== 'container') return fail('noDest');
    if (!toContainer && target.documentName !== 'Actor') return fail('noDest');
    // The party actor holds no items (its cargo lives in the transports' Holds)
    if (!toContainer && target.type === 'party') return fail('noDest');
    if (copyOnly ? !(user.isGM || target.testUserPermission(user, 'OWNER')) : !this.canGive(user, target)) {
      return fail('cantGive');
    }
    // Dropped back where it already is
    if (toContainer && sourceContainer?.uuid === toContainer.uuid) return fail('same');
    if (!toContainer && fromActor?.uuid === target.uuid) return fail('same');
    if (toContainer && sourceItem?.uuid === toContainer.uuid) return fail('same');
    if (toContainer && sourceData.type === 'container') return fail('nested');

    const total = this.quantityOf(sourceData);
    const n = Math.min(total, Math.max(1, Math.floor(Number(qty) || total)));
    if (n < 1) return fail('noSource');

    // --- What lands at the destination ---
    const data = cleanData(sourceData, toContainer);
    if (data.type === 'equipment') data.system.quantity = n;

    let undo;
    if (toContainer) {
      const items = foundry.utils.deepClone(toContainer.system.items ?? []);
      const added = [...items, data];
      const used = added.reduce((sum, it) => sum + EquipmentHelper.itemStackCost(it), 0) + EquipmentHelper.pooledZeroSlotCost(added);
      const capacity = toContainer.system.capacity ?? 0;
      if (EquipmentHelper.itemStackCost(data) > 0 && used > capacity) return fail('full');
      const stack = stackable(data) ? items.find((it) => stackable(it) && ShopTransactions.sameSource(it, data)) : null;
      if (stack) stack.system.quantity = this.quantityOf(stack) + n;
      else items.push(data);
      const before = toContainer.system.items;
      await toContainer.update({ 'system.items': items });
      undo = () => toContainer.update({ 'system.items': before });
    } else {
      const stack = stackable(data)
        ? target.items.find((i) => stackable(i) && !i.system.containerId && ShopTransactions.sameSource(i, data))
        : null;
      if (stack) {
        const was = stack.system.quantity;
        await stack.update({ 'system.quantity': was + n });
        undo = () => stack.update({ 'system.quantity': was });
      } else {
        if (EquipmentHelper.GRID_ITEM_TYPES.includes(data.type)) data.system.gridPosition = EquipmentHelper.nextGridPosition(target);
        const [created] = await target.createEmbeddedDocuments('Item', [data]);
        if (!created) return fail('error');
        undo = () => created.delete();
      }
    }

    // --- Take it out of the source (after the destination holds it) ---
    if (!copyOnly) {
      try {
        if (sourceContainer) {
          const items = foundry.utils.deepClone(sourceContainer.system.items ?? []);
          const at = findEntryIndex(items, source);
          if (at < 0) throw new Error('source entry vanished');
          if (n >= this.quantityOf(items[at])) items.splice(at, 1);
          else items[at].system.quantity = this.quantityOf(items[at]) - n;
          await sourceContainer.update({ 'system.items': items });
        } else if (n >= total) {
          await sourceItem.delete();
        } else {
          await sourceItem.update({ 'system.quantity': total - n });
        }
      } catch (err) {
        console.error('Vagabond | Trade: source update failed, rolling back', err);
        try { await undo?.(); } catch (rollbackErr) { console.error('Vagabond | Trade rollback failed', rollbackErr); }
        return fail('error');
      }
    }

    const destName = toContainer?.parent ? `${toContainer.parent.name} · ${toContainer.name}` : target.name;
    Hooks.callAll('vagabond.trade', {
      type: 'item', user, name: sourceData.name, qty: n, copy: copyOnly,
      from: fromActor ?? sourceContainer, to: target,
    });
    return { ok: true, name: sourceData.name, qty: n, destName };
  }

  static async _handleMoveCoins({ from, to, copper }, user) {
    const giver = await fromUuid(from?.actorUuid ?? from?.containerUuid ?? '');
    if (!walletHolder(giver)) return fail('noSource');
    if (!this.canTake(user, giver)) return fail('notYours');

    const seen = new Set([giver.uuid]);
    const recipients = [];
    for (const ref of to ?? []) {
      const doc = await fromUuid(ref?.actorUuid ?? ref?.containerUuid ?? '');
      if (!walletHolder(doc) || seen.has(doc.uuid)) continue;
      if (!this.canGive(user, doc)) return fail('cantGive');
      seen.add(doc.uuid);
      recipients.push(doc);
    }
    if (!recipients.length) return fail('noRecipients');

    const amount = Math.max(0, Math.floor(Number(copper) || 0));
    const share = Math.floor(amount / recipients.length);
    if (share < 1) return fail('badAmount');
    const wallet = CurrencyHelper.walletOf(giver);
    const paid = CurrencyHelper.pay(wallet, share * recipients.length);
    if (!paid) return fail('funds');

    await giver.update({ 'system.currency': paid });
    let given = 0;
    try {
      for (const doc of recipients) {
        await doc.update({ 'system.currency': CurrencyHelper.add(CurrencyHelper.walletOf(doc), share) });
        given++;
      }
    } catch (err) {
      console.error('Vagabond | Coin trade failed, refunding the rest', err);
      const left = share * (recipients.length - given);
      await giver.update({ 'system.currency': CurrencyHelper.add(CurrencyHelper.walletOf(giver), left) });
      return fail('error');
    }

    Hooks.callAll('vagabond.trade', { type: 'coins', user, from: giver, to: recipients, share });
    return { ok: true, share, count: recipients.length };
  }

  /* -------------------------------------------- */
  /*  Internals                                   */
  /* -------------------------------------------- */

  static #queue = Promise.resolve();

  /** Run handlers one at a time (live-data checks stay valid until the writes land). */
  static #serialize(fn) {
    const run = this.#queue.then(() => fn());
    this.#queue = run.catch(() => {});
    return run;
  }

  /** Whether the current user owns every document involved (then no GM round trip is needed). */
  static async #ownsAll(uuids, { freeSource = false } = {}) {
    for (const [i, uuid] of uuids.entries()) {
      if (!uuid) return false;
      const doc = await fromUuid(uuid);
      if (!doc) return false;
      if (i === 0 && freeSource && doc.documentName === 'Item' && !doc.parent) continue;
      if (!doc.isOwner) return false;
    }
    return true;
  }

  static async #request(name, data, local) {
    if (local || game.user.isGM) {
      const handler = name === this.QUERIES.moveItem ? this._handleMoveItem : this._handleMoveCoins;
      try {
        return await this.#serialize(() => handler.call(this, data, game.user));
      } catch (err) {
        console.error(`Vagabond | Trade "${name}" failed`, err);
        return fail('error');
      }
    }
    const gm = game.users.activeGM;
    if (!gm) return fail('noGM');
    try {
      return await gm.query(name, data, { timeout: 30 * 1000 });
    } catch (err) {
      console.error(`Vagabond | Trade query "${name}" failed`, err);
      return fail('error');
    }
  }
}

/** A document whose `system.currency` is a wallet (Character, party, Container item). */
function walletHolder(doc) {
  return !!doc && !!CurrencyHelper.walletOf(doc) && (doc.documentName === 'Actor' || doc.type === 'container');
}

/**
 * Index of a container entry: `index` when that slot still holds the entry, else found by `_id`
 * (entries are `toObject()` snapshots and keep their id).
 */
function findEntryIndex(items, { entryId = null, index = -1 } = {}) {
  const list = items ?? [];
  const at = Number(index);
  if (Number.isInteger(at) && at >= 0 && at < list.length && (!entryId || list[at]?._id === entryId)) return at;
  return entryId ? list.findIndex((it) => it?._id === entryId) : -1;
}

/** 0-Slot, unequipped plain equipment merges into a matching stack (same rule as shop purchases). */
function stackable(data) {
  if (data?.type !== 'equipment') return false;
  const sys = data.system ?? {};
  if (['weapon', 'armor'].includes(sys.equipmentType)) return false;
  if ((sys.uses?.max ?? 0) > 0) return false;
  if ((sys.equipmentState ?? 'unequipped') !== 'unequipped') return false;
  return EquipmentHelper.itemSlotCost(data) === 0;
}

/**
 * Creation data for the moved copy: unequipped, out of any container (or into `toContainer`
 * with a fresh entry id), owner-specific flags dropped so the new owner re-seeds them.
 */
function cleanData(source, toContainer) {
  const data = foundry.utils.deepClone(source);
  delete data.folder;
  delete data.sort;
  delete data.ownership;
  if (data.flags?.vagabond) {
    delete data.flags.vagabond.equippedAt;
    delete data.flags.vagabond.preferredSkill;
    delete data.flags.vagabond.throwSkill;
    delete data.flags.vagabond.patience;
  }
  if (toContainer) data._id = foundry.utils.randomID();
  else delete data._id;
  if (data.type === 'equipment') {
    data.system.equipmentState = 'unequipped';
    data.system.equipped = false;
    data.system.containerId = toContainer ? toContainer.id : null;
  }
  return data;
}

function fail(reason) {
  return { ok: false, reason };
}
