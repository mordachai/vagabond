import { CurrencyHelper } from './currency-helper.mjs';
import { MaterialsHelper } from './materials-helper.mjs';
import { CraftingHelper } from './crafting-helper.mjs';
import { AlchemyLab } from './alchemy-lab.mjs';
import { MixHelper } from './crafting/mix-helper.mjs';

/**
 * Alchemist — Catalyze (feature button).
 *
 * "You can Craft Alchemical Items with the Use Action." The button opens a picker of the Alchemical Items
 * the Alchemist already knows (`system.craft.formulas`, learned in the Workbench Alchemy tab) and crafts the
 * pick through `AlchemyMode` (Alchemy Tools check + 5s of Materials, adds the item or +1 quantity, posts the
 * card). Use is the Action: ONE item per button press, the dialog closes after the pick. Calls
 * `CraftingHelper.execute` directly, so the Workbench GM-approval gate is not involved — the 5s of Materials
 * is the cost. Not tied to a Combat or an action counter (manual-first).
 *
 * Alchemist — Mix (feature button, Level 6). "Combine two Alchemical Items with the Use Action by spending a
 * Studied die." The panel: two drop slots, the combined effect preview, the Mix button, then a carousel of the
 * Alchemical Items on hand (click = details below, drag or double-click = into a slot). Two charges of one
 * stack can be mixed. Runs `MixMode` through `CraftingHelper.execute`.
 *
 * Catalyze and Mix share the in-Combat soft guard on Use Actions per Turn (flag `catalyzeUses`): 1, or 2 with
 * Deft Hands.
 *
 * Imported by vagabond.mjs only (button handler).
 */
export class AlchemistHelper {

  static #L(key, data = {}) {
    return game.i18n.format(`VAGABOND.Catalyze.${key}`, data);
  }

  /** Quantity of `uuid` the actor already carries (crafted copies carry the compendium uuid as sourceId). */
  static #owned(actor, uuid) {
    return actor.items.find(i => i.flags?.core?.sourceId === uuid && i.type === 'equipment')?.system?.quantity ?? 0;
  }

  /** Markup of the picker: a card grid of known formulas (big art, owned-count badge, name below), one selectable. */
  static #pickerHTML(entries, evaluation, actor) {
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));
    const missing = evaluation.checks.filter(c => !c.ok).map(c => {
      const label = game.i18n.localize(c.label);
      return c.detail ? `${label} (${c.detail})` : label;
    });
    const opt = (e) => `<button type="button" class="catalyze-option" data-uuid="${esc(e.uuid)}">
        <span class="catalyze-owned${e.owned ? '' : ' is-zero'}">×${e.owned}</span>
        <img class="catalyze-art" src="${esc(e.img)}" alt="">
        <span class="catalyze-name">${esc(e.name)}</span>
      </button>`;
    return `<div class="catalyze-picker">
      <p class="catalyze-hint">${esc(this.#L('Hint', { cost: CurrencyHelper.format(evaluation.cost.copper), have: CurrencyHelper.format(MaterialsHelper.totalValue(actor)) }))}</p>
      ${missing.length ? `<p class="catalyze-missing">${esc(this.#L('Missing', { list: missing.join(', ') }))}</p>` : ''}
      <input type="hidden" name="formulaUuid" value="">
      <div class="catalyze-grid">
        ${entries.map(opt).join('')}
      </div>
    </div>`;
  }

  /** Hover card of a formula: name + alchemical type, damage with its type, then the enriched description. */
  static async #detailHTML(doc) {
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));
    const sys = doc.system ?? {};
    const typeKey = sys.alchemicalType;
    const typeLabel = typeKey ? game.i18n.localize(CONFIG.VAGABOND.alchemicalTypes?.[typeKey] ?? typeKey) : '';
    const dmgType = sys.damageType && sys.damageType !== '-' ? sys.damageType : '';
    const dmgTypeLabel = dmgType ? game.i18n.localize(CONFIG.VAGABOND.damageTypes?.[dmgType] ?? dmgType) : '';
    const dmgIcon = dmgType ? CONFIG.VAGABOND.damageTypeIcons?.[dmgType] : '';
    const damage = sys.damageAmount
      ? `<div class="cz-tip-damage">
          <span class="cz-tip-dice">${esc(sys.damageAmount)}</span>
          ${dmgTypeLabel ? `<span class="cz-tip-dtype">${dmgIcon ? `<i class="${esc(dmgIcon)}"></i>` : ''}${esc(dmgTypeLabel)}</span>` : ''}
        </div>`
      : '';
    const description = sys.description
      ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(sys.description, { relativeTo: doc })
      : '';
    return `<div class="cz-tip">
      <header class="cz-tip-head">
        <strong>${esc(doc.name)}</strong>
        ${typeLabel ? `<span>${esc(typeLabel)}</span>` : ''}
      </header>
      ${damage}
      ${description ? `<div class="cz-tip-desc">${description}</div>` : ''}
    </div>`;
  }

  /**
   * Catalyze button (`system:alchemist.catalyze`): pick a known formula and Craft it with the Use Action.
   * @param {{actor: Actor}} scope
   */
  static async catalyze({ actor }) {
    if (actor?.type !== 'character' || !actor.isOwner) {
      ui.notifications.warn(this.#L('NotYours'));
      return;
    }
    if (!actor.system.craft?.catalyze) {
      ui.notifications.warn(this.#L('NoCatalyze', { name: actor.name }));
      return;
    }
    const uuids = actor.system.craft.formulas ?? [];
    const sources = (await Promise.all(uuids.map(async (uuid) => ({ uuid, doc: await fromUuid(uuid) })))).filter(s => s.doc);
    if (!sources.length) {
      ui.notifications.warn(this.#L('NoFormulas', { name: actor.name }));
      return;
    }
    const entries = (await Promise.all(sources.map(async ({ uuid, doc }) => ({
      uuid, name: doc.name, img: doc.img, owned: this.#owned(actor, uuid), detail: await this.#detailHTML(doc),
    })))).sort((a, b) => a.name.localeCompare(b.name));
    const detailByUuid = new Map(entries.map(e => [e.uuid, e.detail]));

    // Same for every formula the actor knows: Catalyze, Alchemy Tools, 5s of Materials.
    const evaluation = CraftingHelper.evaluate(actor, 'alchemy', { formulaUuid: entries[0].uuid });

    const uuid = await foundry.applications.api.DialogV2.prompt({
      window: { title: this.#L('Title'), icon: 'fa-solid fa-flask' },
      classes: ['catalyze-dialog'],
      position: { width: 340 },
      content: this.#pickerHTML(entries, evaluation, actor),
      ok: {
        label: this.#L('Craft'),
        icon: 'fa-solid fa-flask',
        callback: (event, button) => button.form.elements.formulaUuid.value,
      },
      render: (event, dialog) => {
        const root = dialog.element;
        const hidden = root.querySelector('input[name="formulaUuid"]');
        const okButton = root.querySelector('button[data-action="ok"]');
        if (okButton && !evaluation.ok) okButton.disabled = true;
        const options = Array.from(root.querySelectorAll('.catalyze-option'));
        // Hover card after 1s (own delay — core data-tooltip shows after 500ms); gone on leave / click.
        let hoverTimer = null;
        const hideTip = () => {
          window.clearTimeout(hoverTimer);
          if (game.tooltip.tooltip?.classList.contains('catalyze-tip')) game.tooltip.deactivate();
        };
        for (const o of options) {
          o.addEventListener('pointerenter', () => {
            window.clearTimeout(hoverTimer);
            hoverTimer = window.setTimeout(() => game.tooltip.activate(o, {
              html: detailByUuid.get(o.dataset.uuid), cssClass: 'catalyze-tip', direction: 'RIGHT',
            }), 1000);
          });
          o.addEventListener('pointerleave', hideTip);
          o.addEventListener('click', () => {
            hideTip();
            hidden.value = o.dataset.uuid;
            for (const x of options) x.classList.toggle('is-selected', x === o);
          });
          o.addEventListener('dblclick', () => okButton?.click());
        }
      },
      rejectClose: false,
    });
    if (game.tooltip.tooltip?.classList.contains('catalyze-tip')) game.tooltip.deactivate();
    if (!uuid) return;

    const turn = await this.#useActionGuard(actor, 'Catalyze');
    if (!turn) return;

    const result = await CraftingHelper.execute(actor, 'alchemy', { formulaUuid: uuid });
    if (!result.ok) {
      ui.notifications.warn(CraftingHelper.failureMessage(result));
      return;
    }
    await this.#recordUseAction(actor, turn);
  }

  /**
   * Soft guard (in Combat only), shared by Catalyze and Mix: 1 Use Action per Turn, 2 with Deft Hands (the 2nd
   * needs no Move). Over the limit asks to go on anyway.
   * @param {Actor} actor
   * @param {'Catalyze'|'MixPanel'} prefix  i18n section holding LimitTitle / LimitCatalyze / LimitDeft
   * @returns {Promise<{key: string|null, used: number}|null>}  null = the player backed out
   */
  static async #useActionGuard(actor, prefix) {
    const key = AlchemyLab.turnKey(actor);
    const used = AlchemyLab.usesThisTurn(actor, key);
    const allowed = AlchemyLab.usesPerTurn(actor);
    if (key && used >= allowed) {
      const L = (k, data = {}) => game.i18n.format(`VAGABOND.${prefix}.${k}`, data);
      const proceed = await foundry.applications.api.DialogV2.confirm({
        window: { title: L('LimitTitle') },
        content: `<p>${L(allowed > 1 ? 'LimitDeft' : 'LimitCatalyze', { name: foundry.utils.escapeHTML(actor.name), used, allowed })}</p>`,
        rejectClose: false,
      });
      if (!proceed) return null;
    }
    return { key, used };
  }

  /** Count a Use Action spent this Turn (no-op outside Combat). */
  static async #recordUseAction(actor, turn) {
    await AlchemyLab.recordUseAction(actor, turn);
  }

  /* -------------------------------------------- */
  /*  Mix                                         */
  /* -------------------------------------------- */

  static #M(key, data = {}) {
    return game.i18n.format(`VAGABOND.MixPanel.${key}`, data);
  }

  /** Damage chip markup (`{amount, typeLabel, icon}` from MixHelper.damageView), or ''. */
  static #damageChip(view, { cls = '', tip = '' } = {}) {
    if (!view) return '';
    const esc = foundry.utils.escapeHTML;
    const tooltip = tip ? `${view.typeLabel} — ${tip}` : view.typeLabel;
    return `<span class="mix-dmg ${cls}" data-tooltip="${esc(tooltip)}">${esc(view.amount)}${view.icon ? ` <i class="${esc(view.icon)}"></i>` : ''}</span>`;
  }

  /** One Alchemical Item on hand: everything the carousel tile, the slots and the detail box show. */
  static async #mixEntry(actor, item) {
    const sys = item.system;
    const typeKey = sys.alchemicalType;
    return {
      id: item.id,
      name: item.name,
      img: item.img,
      charges: MixHelper.charges(item),
      typeLabel: typeKey ? game.i18n.localize(CONFIG.VAGABOND.alchemicalTypes?.[typeKey] ?? typeKey) : '',
      damage: MixHelper.damageView(actor, MixHelper.damageOf(item), sys),
      description: sys.description
        ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(sys.description, { relativeTo: item })
        : '',
    };
  }

  static #mixPanelHTML(entries, studiedDice) {
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));
    const tile = (e) => `<button type="button" class="mix-tile" data-item-id="${esc(e.id)}" data-tooltip="${esc(e.name)}">
        <span class="mix-art"><img src="${esc(e.img)}" alt=""><span class="mix-badge">×${e.charges}</span></span>
        <span class="mix-tile-name">${esc(e.name)}</span>
      </button>`;
    const slot = (i) => `<div class="mix-slot" data-slot="${i}"></div>`;
    return `<div class="mix-panel">
      <input type="hidden" name="itemIdA" value="">
      <input type="hidden" name="itemIdB" value="">
      <div class="mix-slots">${slot(0)}<i class="fa-solid fa-plus mix-plus"></i>${slot(1)}</div>
      <div class="mix-effect"></div>
      <div class="mix-action">
        <span class="mix-studied${studiedDice ? '' : ' is-zero'}" data-tooltip="${esc(this.#M('StudiedDice'))}"><i class="fa-solid fa-dice-d20"></i> ${studiedDice}</span>
      </div>
      <div class="mix-items-head"><span>${esc(this.#M('Items'))}</span></div>
      <div class="mix-carousel">
        <button type="button" class="mix-arrow" data-dir="-1"><i class="fa-solid fa-chevron-left"></i></button>
        <div class="mix-strip">${entries.map(tile).join('')}</div>
        <button type="button" class="mix-arrow" data-dir="1"><i class="fa-solid fa-chevron-right"></i></button>
      </div>
      <div class="mix-detail"></div>
    </div>`;
  }

  static #slotHTML(entry, index) {
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));
    if (!entry) return `<i class="fa-solid fa-flask"></i><span>${esc(this.#M('Drop'))}</span>`;
    return `<span class="mix-art"><img src="${esc(entry.img)}" alt=""><span class="mix-badge">×${entry.charges}</span></span>
      <span class="mix-slot-name">${esc(entry.name)}</span>
      <button type="button" class="mix-slot-clear" data-slot="${index}" data-tooltip="${esc(this.#M('Clear'))}"><i class="fa-solid fa-xmark"></i></button>`;
  }

  static #effectHTML(actor, a, b) {
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));
    if (!a || !b) return `<p class="mix-hint">${esc(this.#M('DropHint'))}</p>`;
    const p = MixHelper.previewView(actor, a, b);
    const companion = p.companion
      ? `<span class="mix-plus-sm">+</span>${this.#damageChip(p.companion, { cls: 'is-companion', tip: this.#M('CompanionHint') })}`
      : '';
    const damage = p.damage || p.companion ? `<div class="mix-line">${this.#damageChip(p.damage)}${companion}</div>` : '';
    const tags = [
      ...p.statuses.map(s => `<span class="mix-tag">${esc(s)}</span>`),
      `<span class="mix-tag is-use">${esc(this.#M(p.thrown ? 'Thrown' : 'Used'))}</span>`,
    ].join('');
    return `${damage}<div class="mix-line mix-tags">${tags}</div>
      <div class="mix-expiry"><i class="fa-solid fa-hourglass-half"></i> ${esc(p.expiryLabel)}</div>`;
  }

  static #mixDetailHTML(entry) {
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));
    if (!entry) return '';
    return `<div class="mix-detail-head">
        <span class="mix-art"><img src="${esc(entry.img)}" alt=""><span class="mix-badge">×${entry.charges}</span></span>
        <div class="mix-detail-title">
          <strong>${esc(entry.name)}</strong>
          <span>${esc(entry.typeLabel)}${entry.damage ? ' · ' : ''}${this.#damageChip(entry.damage)}</span>
        </div>
      </div>
      ${entry.description ? `<div class="mix-detail-desc">${entry.description}</div>` : ''}`;
  }

  /**
   * Mix button (`system:alchemist.mix`): combine two Alchemical Items on hand into one Mix item.
   * @param {{actor: Actor}} scope
   */
  static async mix({ actor }) {
    if (actor?.type !== 'character' || !actor.isOwner) {
      ui.notifications.warn(this.#L('NotYours'));
      return;
    }
    if (!actor.system.craft?.mix) {
      ui.notifications.warn(this.#M('NoMix', { name: actor.name }));
      return;
    }
    const items = actor.items.filter(i => MixHelper.isMixableItem(i)).sort((a, b) => a.name.localeCompare(b.name));
    if (!items.length) {
      ui.notifications.warn(this.#M('NoItems', { name: actor.name }));
      return;
    }
    const entries = await Promise.all(items.map(i => this.#mixEntry(actor, i)));
    const byId = new Map(entries.map(e => [e.id, e]));
    const studiedDice = actor.system.studiedDice ?? 0;

    const picked = await foundry.applications.api.DialogV2.prompt({
      window: { title: this.#M('Title'), icon: 'fa-solid fa-flask-vial' },
      classes: ['mix-dialog'],
      position: { width: 510 },
      content: this.#mixPanelHTML(entries, studiedDice),
      ok: {
        label: this.#M('Mix'),
        icon: 'fa-solid fa-flask-vial',
        callback: (event, button) => ({ itemIdA: button.form.elements.itemIdA.value, itemIdB: button.form.elements.itemIdB.value }),
      },
      render: (event, dialog) => this.#wireMixPanel(dialog.element, actor, byId, studiedDice),
      rejectClose: false,
    });
    if (!picked?.itemIdA || !picked?.itemIdB) return;

    const turn = await this.#useActionGuard(actor, 'MixPanel');
    if (!turn) return;

    const result = await CraftingHelper.execute(actor, 'mix', picked);
    if (!result.ok) {
      ui.notifications.warn(CraftingHelper.failureMessage(result));
      return;
    }
    await this.#recordUseAction(actor, turn);
  }

  /** Panel behavior: slots (drop / clear), live preview, carousel (scroll, select, drag, double-click). */
  static #wireMixPanel(root, actor, byId, studiedDice) {
    const panel = root.querySelector('.mix-panel');
    const inputs = [root.querySelector('input[name="itemIdA"]'), root.querySelector('input[name="itemIdB"]')];
    const slotEls = Array.from(root.querySelectorAll('.mix-slot'));
    const tiles = Array.from(root.querySelectorAll('.mix-tile'));
    const strip = root.querySelector('.mix-strip');
    const effect = root.querySelector('.mix-effect');
    const detail = root.querySelector('.mix-detail');
    const okButton = root.querySelector('button[data-action="ok"]');
    // The Mix button sits under the preview, above the item list (DialogV2 puts it in a bottom footer).
    const footer = root.querySelector('.form-footer');
    if (footer) root.querySelector('.mix-action')?.prepend(footer);

    const slots = [null, null];
    const uses = (id) => slots.filter(s => s === id).length;

    const refresh = () => {
      slots.forEach((id, i) => {
        inputs[i].value = id ?? '';
        slotEls[i].classList.toggle('filled', !!id);
        slotEls[i].innerHTML = this.#slotHTML(id ? byId.get(id) : null, i);
      });
      effect.innerHTML = this.#effectHTML(actor, actor.items.get(slots[0] ?? ''), actor.items.get(slots[1] ?? ''));
      for (const t of tiles) t.classList.toggle('is-used', uses(t.dataset.itemId) >= byId.get(t.dataset.itemId).charges);
      if (okButton) okButton.disabled = !(slots[0] && slots[1] && studiedDice > 0);
    };

    const select = (id) => {
      for (const t of tiles) t.classList.toggle('is-selected', t.dataset.itemId === id);
      detail.innerHTML = this.#mixDetailHTML(byId.get(id));
    };

    /** Put `id` in slot `index`; refused when that stack has no charge left for it. */
    const place = (index, id) => {
      const entry = byId.get(id);
      if (!entry) return;
      const others = slots.filter((s, i) => i !== index && s === id).length;
      if (others + 1 > entry.charges) {
        ui.notifications.warn(this.#M('OneCharge', { name: entry.name }));
        return;
      }
      slots[index] = id;
      refresh();
    };

    for (const t of tiles) {
      const id = t.dataset.itemId;
      t.setAttribute('draggable', 'true');
      t.addEventListener('click', () => select(id));
      t.addEventListener('dblclick', () => {
        const empty = slots.indexOf(null);
        place(empty >= 0 ? empty : 1, id);
      });
      t.addEventListener('dragstart', (ev) => {
        const item = actor.items.get(id);
        if (!item) return;
        ev.dataTransfer.setData('text/plain', JSON.stringify(item.toDragData()));
        ev.dataTransfer.effectAllowed = 'copy';
        panel.classList.add('is-dragging');
      });
      t.addEventListener('dragend', () => panel.classList.remove('is-dragging'));
    }

    slotEls.forEach((slot, index) => {
      const accept = (ev) => { ev.preventDefault(); slot.classList.add('drag-over'); };
      slot.addEventListener('dragenter', accept);
      slot.addEventListener('dragover', accept);
      slot.addEventListener('dragleave', (ev) => { if (!slot.contains(ev.relatedTarget)) slot.classList.remove('drag-over'); });
      slot.addEventListener('drop', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        slot.classList.remove('drag-over');
        panel.classList.remove('is-dragging');
        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev);
        if (data?.type !== 'Item' || !data.uuid) return;
        const source = await fromUuid(data.uuid);
        if (source?.parent?.uuid !== actor.uuid || !byId.has(source.id)) {
          ui.notifications.warn(this.#M('OwnedOnly'));
          return;
        }
        place(index, source.id);
      });
      slot.addEventListener('click', (ev) => {
        if (ev.target.closest('.mix-slot-clear')) {
          slots[index] = null;
          refresh();
        } else if (slots[index]) select(slots[index]);
      });
    });

    // Carousel arrows: scroll by roughly the visible width; dimmed at either end.
    const arrows = Array.from(root.querySelectorAll('.mix-arrow'));
    const syncArrows = () => {
      const max = strip.scrollWidth - strip.clientWidth;
      arrows[0].disabled = strip.scrollLeft <= 1;
      arrows[1].disabled = strip.scrollLeft >= max - 1;
    };
    for (const a of arrows) {
      a.addEventListener('click', () => strip.scrollBy({ left: Number(a.dataset.dir) * strip.clientWidth * 0.8, behavior: 'smooth' }));
    }
    strip.addEventListener('scroll', syncArrows);
    strip.addEventListener('wheel', (ev) => {
      if (!ev.deltaY || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
      ev.preventDefault();
      strip.scrollBy({ left: ev.deltaY });
    }, { passive: false });

    refresh();
    select(tiles[0]?.dataset.itemId);
    requestAnimationFrame(syncArrows);
  }
}
