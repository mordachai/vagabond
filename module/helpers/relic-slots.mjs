import { RelicHelper } from './relic-helper.mjs';
import { CurrencyHelper } from './currency-helper.mjs';
import { RelicDisguise } from './relic-disguise.mjs';

/**
 * Relic slots: an equipment item with `system.relic.slots > 0` takes Relics (any `equipmentType: 'relic'`
 * item — relics pack or inventory) dropped on its slots. An attached Relic is a `system.relic.powers[]`
 * snapshot (`RelicHelper.snapshotPower`); its effects reach the item through `RelicHelper.syncHostEffects`.
 * A Relic dropped from an inventory is consumed and comes back to its owner's inventory when removed.
 *
 * UI: item sheet locked view (`templates/item/parts/relic-slots.hbs`) and the HUD inventory row counter;
 * both open the same popup (`openPopup`, raw DOM like the inventory mini-sheet).
 */
export class RelicSlots {
  static EMPTY_ART = 'icons/magic/symbols/runes-star-magenta.webp';

  /** Slots shown for `item`: its Relic Slots, or more when it already holds more Relics (Relic Forge). */
  static count(item) {
    if (item?.type !== 'equipment') return 0;
    const relic = item.system.relic ?? {};
    return Math.max(Number(relic.slots) || 0, relic.powers?.length ?? 0);
  }

  /** Can `item` be attached to a slot? Any Relic item. */
  static isAttachable(item) {
    return item?.type === 'equipment' && item.system.equipmentType === 'relic';
  }

  /** Template model, or null when the item has no slot. */
  static view(item) {
    const count = this.count(item);
    if (!count) return null;
    const powers = item.system.relic.powers ?? [];
    const hide = RelicDisguise.hidesCurse(item);
    const slots = Array.from({ length: count }, (_, index) => {
      const power = hide ? RelicDisguise.powerView(item, powers[index]) : powers[index];
      return { index, filled: !!power, img: power?.img ?? '', name: power?.name ?? '', cursed: !!power?.cursed && !hide };
    });
    return { count, used: powers.length, slots, emptyArt: this.EMPTY_ART };
  }

  /* -------------------------------------------- */
  /*  Attach / remove                             */
  /* -------------------------------------------- */

  /**
   * Attach the dropped Relic to `host`. Same-family Relics (Bonus - Weapon +1 → +2) replace each other;
   * otherwise the Relic goes into slot `index` (replacing what is there) or the first empty slot.
   * @param {Item} host
   * @param {object} data - Item drop data
   * @param {number|null} [index]
   * @returns {Promise<boolean>}
   */
  static async drop(host, data, index = null) {
    if (!host?.isOwner || data?.type !== 'Item') return false;
    const src = await Item.implementation.fromDropData(data);
    if (!src || src.uuid === host.uuid) return false;
    const warn = (key, d = {}) => { ui.notifications.warn(game.i18n.format(`VAGABOND.Item.Relic.Slots.${key}`, d)); return false; };

    if (!this.isAttachable(src)) return warn('NotRelic');
    if (host.system.relic?.fabled) return warn('Fabled');
    if (src.system.relicPower?.enabled && !RelicHelper.canAttach(host, src)) {
      return warn('Mismatch', { name: src.name, targets: (src.system.relicPower.targets ?? []).join(', ') });
    }
    const fromInventory = !!src.actor && !src.inCompendium;
    if (fromInventory && !src.isOwner) return warn('NotOwner', { name: src.name });
    const count = this.count(host);
    if (!count) return false;

    const powers = foundry.utils.deepClone(host.system.relic.powers ?? []);
    const snapshot = RelicHelper.snapshotPower(src);
    snapshot.slots = Number(src.system.slots ?? src.system.baseSlots) || 0; // shown in the popup
    snapshot.cursed = !!src.system.relic?.cursed;
    snapshot.requiresBond = !!src.system.relic?.requiresBond;
    snapshot.consumable = !!(src.system.isConsumable || src.system.relic?.consumable);
    if (fromInventory) {
      const itemData = src.toObject();
      delete itemData._id;
      itemData.system.quantity = 1;
      snapshot.itemData = itemData;
    }

    // Onto a filled slot = replace it, whatever it holds. A same-family Relic in ANOTHER slot = the book's
    // "not cumulative" rule: the higher Bonus stays, in its own slot.
    const familyAt = snapshot.family ? powers.findIndex(p => p.family === snapshot.family) : -1;
    const ontoFilled = Number.isInteger(index) && index < powers.length;
    let at = -1;
    if (ontoFilled && (familyAt < 0 || familyAt === index)) at = index;
    else if (familyAt >= 0) {
      if ((Number(snapshot.rank) || 0) <= (Number(powers[familyAt].rank) || 0)) {
        return warn('NotCumulative', { name: snapshot.name, kept: powers[familyAt].name });
      }
      at = familyAt;
    }
    if (at >= 0 && powers[at].cursed && !game.user.isGM) return warn('CursedLocked', { name: RelicDisguise.powerView(host, powers[at]).name });
    const displaced = at >= 0 ? powers[at] : null;
    if (at >= 0) powers[at] = snapshot;
    else if (powers.length < count) powers.push(snapshot);
    else return warn('Full', { name: host.name });

    // Attaching makes the item a Relic ("Is Relic" on); the switch stays the GM's to turn off afterwards.
    // A Relic that needs a Bond (or is Cursed) passes that on, and removing it never clears it.
    const update = { 'system.relic.powers': powers };
    if (host.system.equipmentType !== 'relic') update['system.relic.isRelic'] = true;
    if (snapshot.requiresBond || snapshot.cursed) update['system.relic.requiresBond'] = true;
    await host.update(update);
    await RelicHelper.syncHostEffects(host);
    if (fromInventory) {
      const qty = Number(src.system.quantity) || 1;
      if (qty > 1) await src.update({ 'system.quantity': qty - 1 });
      else await src.delete();
    }
    await this._returnToInventory(host, displaced);
    return true;
  }

  /** Detach the Relic in slot `index`; one taken from an inventory goes back to the host's owner. */
  static async remove(host, index) {
    if (!host?.isOwner) return;
    const powers = foundry.utils.deepClone(host.system.relic.powers ?? []);
    if (powers[index]?.cursed && !game.user.isGM) {
      ui.notifications.warn(game.i18n.format('VAGABOND.Item.Relic.Slots.CursedLocked', { name: RelicDisguise.powerView(host, powers[index]).name }));
      return;
    }
    const [removed] = powers.splice(index, 1);
    if (!removed) return;
    await host.update({ 'system.relic.powers': powers });
    await RelicHelper.syncHostEffects(host);
    await this._returnToInventory(host, removed);
  }

  /**
   * Consumable Relics are used up by their use (book): spend every Consumable Relic attached to `item`
   * after it was used (weapon: after the attack, hit or miss). Called from `VagabondItem#handleConsumption`.
   */
  static async spendConsumables(item) {
    const powers = item?.system?.relic?.powers ?? [];
    const spent = powers.filter(p => p.consumable);
    if (!spent.length || !item.isOwner) return;
    if (item.parent && !item.parent.items.has(item.id)) return; // the use deleted the item (last of a stack)
    await item.update({ 'system.relic.powers': powers.filter(p => !p.consumable) });
    await RelicHelper.syncHostEffects(item);
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: item.actor }),
      content: `<p><i class="fa-solid fa-khanda"></i> ${spent.map(p => game.i18n.format('VAGABOND.Item.Relic.Slots.UsedUp',
        { name: `<strong>${esc(p.name)}</strong>`, item: esc(item.name) })).join('<br>')}</p>`,
    });
  }

  /* -------------------------------------------- */
  /*  Curse                                       */
  /* -------------------------------------------- */

  /** The curses on `item`: its own (`relic.cursed`) and every Cursed Relic attached to it. None shown to players while disguised. */
  static curseSources(item) {
    const relic = item?.system?.relic;
    if (!relic || RelicDisguise.hidesCurse(item)) return [];
    return [
      ...(relic.cursed ? [{ name: item.name, attached: false }] : []),
      ...(relic.powers ?? []).filter(p => p.cursed).map(p => ({ name: p.name, attached: true })),
    ];
  }

  /** Bound-diamond view: `{tooltip}` when cursed (red diamond), else null. */
  static curseInfo(item) {
    const sources = this.curseSources(item);
    if (!sources.length) return null;
    const tooltip = sources.map(s => game.i18n.format(`VAGABOND.Item.Relic.Slots.${s.attached ? 'CurseIn' : 'CurseSelf'}`,
      { name: s.name, item: item.name })).join('<br>');
    return { tooltip };
  }

  static async _returnToInventory(host, power) {
    if (!power?.itemData || !host.actor) return;
    await host.actor.createEmbeddedDocuments('Item', [power.itemData]);
  }

  /* -------------------------------------------- */
  /*  Popup                                       */
  /* -------------------------------------------- */

  static #popup = null;
  static #abort = null;

  /** Slot buttons, same markup as the item sheet partial. */
  static slotsHtml(item, selected = null) {
    const view = this.view(item);
    if (!view) return '';
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));
    const empty = game.i18n.localize('VAGABOND.Item.Relic.Slots.Empty');
    return `<div class="relic-slot-row" style="--relic-slots: ${view.count}; --relic-empty-art: url('${view.emptyArt}')">${view.slots.map(s => `
      <button type="button" class="relic-slot${s.filled ? ' is-filled' : ''}${s.cursed ? ' is-cursed' : ''}${s.index === selected ? ' is-selected' : ''}"
        data-relic-slot="${s.index}" data-tooltip="${s.filled ? esc(s.name) : empty}">
        ${s.filled ? `<img src="${esc(s.img)}" alt="">` : '<i class="fa-solid fa-khanda"></i>'}
      </button>`).join('')}</div>`;
  }

  /** Popup body: the selected slot's Relic (name, Remove, description), under the slot row when `withSlots`. */
  static async _popupHtml(item, selected, withSlots) {
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));
    const L = (k) => game.i18n.localize(`VAGABOND.Item.Relic.Slots.${k}`);
    const real = item.system.relic.powers?.[selected];
    const hide = RelicDisguise.hidesCurse(item);
    const power = hide ? RelicDisguise.powerView(item, real) : real;
    let detail;
    if (power) {
      const description = power.description
        ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(power.description, { relativeTo: item })
        : '';
      const slots = power.slots ?? power.itemData?.system?.baseSlots ?? 0;
      const facts = [
        power.value > 0 ? `<span>${game.i18n.localize('VAGABOND.UI.Labels.Cost')}: <b>${CurrencyHelper.format(power.value)}</b></span>` : '',
        slots > 0 ? `<span>${game.i18n.localize('VAGABOND.UI.Labels.Slots')}: <b>${slots}</b></span>` : '',
      ].filter(Boolean).join('');
      detail = `
        <div class="relic-slot-detail-head">
          <img src="${esc(power.img)}" alt="">
          <div class="relic-slot-detail-title">
            <strong>${esc(power.name)}</strong>
            ${facts ? `<div class="relic-slot-facts">${facts}</div>` : ''}
          </div>
          ${power.cursed && !hide ? `<i class="fa-solid fa-diamond relic-slot-cursed" data-tooltip="${esc(game.i18n.format('VAGABOND.Item.Relic.Slots.CurseIn', { name: power.name, item: item.name }))}"></i>` : ''}
          ${item.isOwner && (!power.cursed || game.user.isGM || hide) ? `<button type="button" class="relic-slot-remove" data-relic-remove="${selected}" data-tooltip="${L('Remove')}"><i class="fas fa-link-slash"></i></button>` : ''}
        </div>
        ${description ? `<div class="relic-slot-description">${description}</div>` : ''}`;
    } else {
      detail = `<p class="relic-slot-hint">${L(item.isOwner ? 'EmptyHint' : 'Empty')}</p>`;
    }
    return `${withSlots ? this.slotsHtml(item, selected) : ''}<div class="relic-slot-detail">${detail}</div>`;
  }

  /**
   * Open the popup for `item` near the click. With a slot `index` (item sheet: the slot row is already on
   * screen) it shows that slot alone; without one (HUD) the slot row comes first, slot 0 selected.
   * Slots in it take drops too.
   */
  static async openPopup(event, item, index = null) {
    const withSlots = !Number.isInteger(index);
    if (!this.count(item)) return;
    event?.stopPropagation?.();
    this.closePopup();
    let selected = Number.isInteger(index) ? index : 0;

    const popup = document.createElement('div');
    popup.className = 'inventory-mini-sheet relic-slots-popup';
    Object.assign(popup.style, {
      position: 'fixed', zIndex: '10000',
      left: `${Math.min((event?.clientX ?? 200) + 10, window.innerWidth - 380)}px`,
      top: `${Math.min((event?.clientY ?? 200) + 10, window.innerHeight - 420)}px`,
    });
    document.body.appendChild(popup);
    this.#popup = popup;
    const abort = new AbortController();
    this.#abort = abort;
    const { signal } = abort;

    const render = async () => { if (this.#popup === popup) popup.innerHTML = await this._popupHtml(item, selected, withSlots); };
    await render();

    popup.addEventListener('click', async (e) => {
      const remove = e.target.closest('[data-relic-remove]');
      if (remove) {
        await this.remove(item, Number(remove.dataset.relicRemove));
        selected = Math.max(0, Math.min(selected, this.count(item) - 1));
        if (!withSlots || !this.count(item)) return this.closePopup();
        return render();
      }
      const slot = e.target.closest('[data-relic-slot]');
      if (slot) { selected = Number(slot.dataset.relicSlot); render(); }
    }, { signal });
    popup.addEventListener('dragover', (e) => e.preventDefault(), { signal });
    popup.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(e);
      const slot = e.target.closest('[data-relic-slot]');
      const at = slot ? Number(slot.dataset.relicSlot) : null;
      if (await this.drop(item, data, at)) {
        selected = at ?? Math.max(0, (item.system.relic.powers?.length ?? 1) - 1);
        render();
      }
    }, { signal });
    // Close on a click outside — a click, not a press, so dragging a Relic in from a compendium keeps it
    // open (deferred so the opening click doesn't close it)
    // composedPath, not contains(): a slot click re-renders the popup (microtask) before this runs, so the
    // clicked node is already detached and contains() would read it as outside
    setTimeout(() => document.addEventListener('click', (e) => {
      if (!e.composedPath().includes(popup)) this.closePopup();
    }, { signal }), 10);
  }

  static closePopup() {
    this.#abort?.abort();
    this.#abort = null;
    this.#popup?.remove();
    this.#popup = null;
  }
}
