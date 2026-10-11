import { CurrencyHelper } from '../helpers/currency-helper.mjs';
import { TradeHelper } from '../helpers/trade-helper.mjs';
import { ShopTransactions } from '../helpers/shop-transactions.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Coin transfer dialog, split in two columns:
 * - **From** — the purses the user may take from in the party: their own Characters (every
 *   member for the GM), the party Chest and the transport Holds. One is the giver.
 * - **To** — the recipients: members (all selected by default), the Chest, the Holds.
 *   The giver can't receive its own coins.
 * The footer holds the amount and the Split button: an even share for each recipient, the
 * remainder of an uneven split stays with the giver. Player → player = pick your Character on
 * the left and only the other player on the right. Writes go through `TradeHelper.moveCoins`
 * (guard rails + GM relay).
 *
 * Open with `CoinTransferDialog.open(holder, { party })` — holder = the preselected giver
 * (Actor or Container item). One dialog per party.
 */
export class CoinTransferDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** One dialog per party. */
  static #open = new Map();

  constructor({ holder, party, ...options } = {}) {
    super(options);
    this.party = party;
    /** Uuid of the purse coins come from. */
    this.giverUuid = holder.uuid;
    /** Amount to give, per denomination. */
    this.amount = { gold: 0, silver: 0, copper: 0 };
    /** Selected recipient uuids (null = defaults not applied yet). */
    this.selected = null;
    this._hookIds = null;
  }

  static DEFAULT_OPTIONS = {
    id: 'vagabond-coin-transfer-{id}',
    classes: ['vagabond', 'coin-transfer-dialog'],
    tag: 'div',
    window: {
      title: 'VAGABOND.Trade.Coins.WindowTitle',
      icon: 'fa-solid fa-coins',
      resizable: false,
    },
    position: { width: 600, height: 'auto' },
    actions: {
      pickGiver: CoinTransferDialog.#onPickGiver,
      coinAll: CoinTransferDialog.#onAll,
      coinClear: CoinTransferDialog.#onClear,
      toggleRecipient: CoinTransferDialog.#onToggleRecipient,
      selectAllRecipients: CoinTransferDialog.#onSelectAll,
      splitCoins: CoinTransferDialog.#onSplit,
    },
  };

  static PARTS = {
    form: { template: 'systems/vagabond/templates/apps/coin-transfer.hbs' },
  };

  /**
   * Open (or focus) the dialog with `holder` as the giver.
   * @param {Actor|Item} holder
   * @param {{party?: Actor}} [opts]  the party whose purses are listed
   */
  static open(holder, { party = null } = {}) {
    if (!holder) return null;
    if (!TradeHelper.canTake(game.user, holder)) {
      TradeHelper.warn('notYours');
      return null;
    }
    // The holder's own party; else (a sidebar chest, a container on an actor outside any party)
    // the first party the user may use
    party ??= TradeHelper.partiesOf(TradeHelper.actorOf(holder), { members: true })[0]
      ?? game.actors.find((a) => a.type === 'party' && ShopTransactions.canUseParty(a, game.user))
      ?? null;
    if (!party) {
      TradeHelper.warn('noParty');
      return null;
    }
    const existing = this.#open.get(party.uuid);
    if (existing?.rendered) {
      existing._setGiver(holder);
      existing.bringToFront();
      return existing;
    }
    const app = new this({ holder, party });
    this.#open.set(party.uuid, app);
    app.render({ force: true });
    return app;
  }

  /**
   * Every purse of the party: members (Characters), the Chest, the transport Holds — plus an
   * outside giver (a sidebar chest) when the dialog was opened on one.
   * @returns {{doc: Actor|Item, uuid: string, name: string, img: string, group: string}[]}
   */
  _purses() {
    const party = this.party;
    const list = [];
    const seen = new Set();
    const add = (doc, group, name = doc?.name, img = doc?.img) => {
      if (!doc || seen.has(doc.uuid) || !CurrencyHelper.walletOf(doc)) return;
      seen.add(doc.uuid);
      list.push({ doc, uuid: doc.uuid, name, img, group });
    };
    const sync = (uuid) => { try { return fromUuidSync(uuid); } catch { return null; } };
    for (const uuid of party.system.members ?? []) {
      const actor = sync(uuid);
      if (actor?.type === 'character') add(actor, 'member');
    }
    add(party, 'shared', game.i18n.localize('VAGABOND.Actor.Party.Card.ChestLabel'), party.img);
    for (const entry of party.system.transports ?? []) {
      const transport = sync(entry.uuid);
      for (const hold of transport?.items?.filter((i) => i.type === 'container') ?? []) {
        add(hold, 'shared', `${transport.name} · ${hold.name}`, hold.img);
      }
    }
    const giver = sync(this.giverUuid);
    if (giver && !seen.has(giver.uuid)) add(giver, 'shared');
    return list;
  }

  /** The giving purse (falls back to the first one the user may take from). */
  _giver(purses = this._purses()) {
    return purses.find((p) => p.uuid === this.giverUuid && TradeHelper.canTake(game.user, p.doc))
      ?? purses.find((p) => TradeHelper.canTake(game.user, p.doc))
      ?? null;
  }

  /** Recipients = every purse the user may give to, except the giver. */
  _recipients(purses = this._purses(), giver = this._giver(purses)) {
    return purses.filter((p) => p.uuid !== giver?.uuid && TradeHelper.canGive(game.user, p.doc));
  }

  /** Switch the giver (dialog re-opened from another purse, or picked on the left). */
  _setGiver(doc) {
    if (!doc || doc.uuid === this.giverUuid) return;
    this.giverUuid = doc.uuid;
    this.amount = { gold: 0, silver: 0, copper: 0 };
    this.render();
  }

  /** @override */
  async _prepareContext() {
    const purses = this._purses();
    const giver = this._giver(purses);
    const recipients = this._recipients(purses, giver);
    // Default: every party member
    if (!this.selected) this.selected = new Set(purses.filter((p) => p.group === 'member').map((p) => p.uuid));

    const abbr = (key) => game.i18n.localize(`VAGABOND.Currency.${key.capitalize()}.abbr`);
    const purseOf = (doc) => {
      const wallet = CurrencyHelper.walletOf(doc) ?? { gold: 0, silver: 0, copper: 0 };
      return CurrencyHelper.DENOMINATIONS.map((key) => ({ key, value: wallet[key], abbr: abbr(key) }));
    };
    const fromRow = (p) => ({ uuid: p.uuid, name: p.name, img: p.img, purse: purseOf(p.doc), active: p.uuid === giver?.uuid });
    const toRow = (p) => ({ uuid: p.uuid, name: p.name, img: p.img, selected: this.selected.has(p.uuid) });
    const givers = purses.filter((p) => TradeHelper.canTake(game.user, p.doc));

    return {
      from: {
        members: givers.filter((p) => p.group === 'member').map(fromRow),
        shared: givers.filter((p) => p.group === 'shared').map(fromRow),
      },
      to: {
        members: recipients.filter((p) => p.group === 'member').map(toRow),
        shared: recipients.filter((p) => p.group === 'shared').map(toRow),
      },
      giverName: giver?.name ?? '',
      coins: CurrencyHelper.DENOMINATIONS.map((key) => ({
        key,
        label: game.i18n.localize(`VAGABOND.Currency.${key.capitalize()}.long`),
        abbr: abbr(key),
        value: this.amount[key],
      })),
      ...this._preview(purses),
    };
  }

  /** Split preview: per-recipient share, leftover, and whether Split can run. */
  _preview(purses = this._purses()) {
    const giver = this._giver(purses);
    const count = this._recipients(purses, giver).filter((r) => this.selected?.has(r.uuid)).length;
    const total = CurrencyHelper.toCopper(this.amount);
    const have = giver ? CurrencyHelper.toCopper(CurrencyHelper.walletOf(giver.doc)) : 0;
    const share = count ? Math.floor(total / count) : 0;
    const left = total - share * count;
    let hint;
    if (!giver) hint = game.i18n.localize('VAGABOND.Trade.Errors.notYours');
    else if (!total) hint = game.i18n.localize('VAGABOND.Trade.Coins.EnterAmount');
    else if (total > have) hint = game.i18n.localize('VAGABOND.Trade.Errors.funds');
    else if (!count) hint = game.i18n.localize('VAGABOND.Trade.Errors.noRecipients');
    else if (!share) hint = game.i18n.localize('VAGABOND.Trade.Errors.badAmount');
    else {
      hint = game.i18n.format(count === 1 ? 'VAGABOND.Trade.Coins.PreviewOne' : 'VAGABOND.Trade.Coins.Preview', {
        count, share: CurrencyHelper.format(share),
      });
      if (left) hint += ` ${game.i18n.format('VAGABOND.Trade.Coins.Leftover', { left: CurrencyHelper.format(left) })}`;
    }
    return {
      count,
      canSplit: !!giver && !!share && total <= have,
      hint,
      splitLabel: game.i18n.format(count === 1 ? 'VAGABOND.Trade.Coins.Give' : 'VAGABOND.Trade.Coins.Split', { count }),
    };
  }

  /** Refresh the preview line + button without a re-render (keeps input focus). */
  _refreshPreview() {
    const root = this.element;
    if (!root) return;
    const { canSplit, hint, splitLabel } = this._preview();
    const hintEl = root.querySelector('.ct-preview');
    if (hintEl) hintEl.textContent = hint;
    const button = root.querySelector('[data-action="splitCoins"]');
    if (button) {
      button.disabled = !canSplit;
      button.classList.toggle('is-ready', canSplit);
      const label = button.querySelector('.ct-split-label');
      if (label) label.textContent = splitLabel;
    }
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const input of this.element.querySelectorAll('.ct-coin-input')) {
      input.addEventListener('input', () => {
        const key = input.dataset.coin;
        if (!CurrencyHelper.DENOMINATIONS.includes(key)) return;
        this.amount[key] = Math.max(0, Math.floor(Number(input.value) || 0));
        this._refreshPreview();
      });
      input.addEventListener('focus', () => input.select());
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        CoinTransferDialog.#onSplit.call(this);
      });
    }

    // Coin letters: left-click +1, right-click −1 (Shift: ±10), never below 0
    for (const step of this.element.querySelectorAll('.ct-step')) {
      const bump = (event, sign) => {
        event.preventDefault();
        const key = step.dataset.coin;
        if (!CurrencyHelper.DENOMINATIONS.includes(key)) return;
        this.amount[key] = Math.max(0, this.amount[key] + sign * (event.shiftKey ? 10 : 1));
        const input = this.element.querySelector(`.ct-coin-input[data-coin="${key}"]`);
        if (input) input.value = this.amount[key];
        this._refreshPreview();
      };
      step.addEventListener('click', (event) => bump(event, 1));
      step.addEventListener('contextmenu', (event) => bump(event, -1));
    }

    // Purses shown here change elsewhere (another trade, a sheet edit): keep them live
    if (!this._hookIds) {
      const rerender = foundry.utils.debounce(() => { if (this.rendered && !this._busy) this.render(); }, 100);
      const shown = (doc) => this._purses().some((p) => p.uuid === doc.uuid);
      this._hookIds = {
        actor: Hooks.on('updateActor', (doc, change) => { if (change.system?.currency && shown(doc)) rerender(); }),
        item: Hooks.on('updateItem', (doc, change) => { if (change.system?.currency && shown(doc)) rerender(); }),
      };
    }
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    if (this._hookIds) {
      Hooks.off('updateActor', this._hookIds.actor);
      Hooks.off('updateItem', this._hookIds.item);
      this._hookIds = null;
    }
    if (CoinTransferDialog.#open.get(this.party?.uuid) === this) CoinTransferDialog.#open.delete(this.party.uuid);
  }

  static #onPickGiver(event, target) {
    const purse = this._purses().find((p) => p.uuid === target.dataset.uuid);
    if (purse) this._setGiver(purse.doc);
  }

  /** Fill the amount with the giver's whole purse. */
  static #onAll() {
    const giver = this._giver();
    if (!giver) return;
    this.amount = { ...CurrencyHelper.walletOf(giver.doc) };
    this.render();
  }

  static #onClear() {
    this.amount = { gold: 0, silver: 0, copper: 0 };
    this.render();
  }

  static #onToggleRecipient(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    if (this.selected.has(uuid)) this.selected.delete(uuid);
    else this.selected.add(uuid);
    target.classList.toggle('is-selected', this.selected.has(uuid));
    target.setAttribute('aria-pressed', String(this.selected.has(uuid)));
    this._refreshPreview();
  }

  /** Group heading on the right: select all of it, or clear it when all are already selected. */
  static #onSelectAll(event, target) {
    const group = target.dataset.group;
    const uuids = this._recipients().filter((r) => r.group === group).map((r) => r.uuid);
    const all = uuids.every((uuid) => this.selected.has(uuid));
    for (const uuid of uuids) {
      if (all) this.selected.delete(uuid);
      else this.selected.add(uuid);
    }
    this.render();
  }

  static async #onSplit() {
    if (this._busy || !this._preview().canSplit) return;
    const purses = this._purses();
    const giver = this._giver(purses);
    const recipients = this._recipients(purses, giver).filter((r) => this.selected.has(r.uuid));
    this._busy = true;
    const button = this.element?.querySelector('[data-action="splitCoins"]');
    if (button) button.disabled = true;
    const ref = (doc) => (doc.documentName === 'Actor' ? { actorUuid: doc.uuid } : { containerUuid: doc.uuid });
    const result = await TradeHelper.moveCoins({
      from: ref(giver.doc), to: recipients.map((r) => ref(r.doc)), copper: CurrencyHelper.toCopper(this.amount),
    });
    this._busy = false;
    if (result?.ok) this.close();
    else this._refreshPreview();
  }
}
