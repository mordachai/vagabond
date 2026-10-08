import { CurrencyHelper } from './currency-helper.mjs';
import { MaterialsHelper } from './materials-helper.mjs';
import { CraftingHelper } from './crafting-helper.mjs';
import { isCopyOf } from './source-id.mjs';

/** Compendium doc id of the Deft Hands perk (`packs/_source/perks/Deft_Hands_*.json`). */
const DEFT_HANDS_ID = 'vtNfeEdWNUWvaeRM';

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

  /**
   * Crafts allowed per Turn: Catalyze gives the Use Action (1); the Deft Hands Perk ("skip your Move to take the
   * Use Action") adds a second one.
   */
  static #usesPerTurn(actor) {
    return actor.items.some(i => i.type === 'perk' && this.#isDeftHands(i)) ? 2 : 1;
  }

  /**
   * Deft Hands perk by its compendium doc id, so translated (Babele) copies still match; the English name is
   * only the fallback for hand-made copies with no source.
   */
  static #isDeftHands(item) {
    return isCopyOf(item, DEFT_HANDS_ID, 'Deft Hands');
  }

  /** Flag key of the actor's current Turn (this Round of the started Combat it fights in), or null outside Combat. */
  static #turnKey(actor) {
    const combat = game.combat;
    if (!combat?.started || !combat.combatants.some(c => c.actor === actor)) return null;
    return `${combat.id}:${combat.round}`;
  }

  /** Crafts already made this Turn (0 outside Combat or on a new Round). */
  static #usesThisTurn(actor, key) {
    const used = actor.getFlag('vagabond', 'catalyzeUses');
    return key && used?.key === key ? (used.count ?? 0) : 0;
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

    // Soft guard (in Combat only): Catalyze = 1 craft per Turn, Deft Hands = 2 (the 2nd needs no Move).
    const key = this.#turnKey(actor);
    const used = this.#usesThisTurn(actor, key);
    const allowed = this.#usesPerTurn(actor);
    if (key && used >= allowed) {
      const proceed = await foundry.applications.api.DialogV2.confirm({
        window: { title: this.#L('LimitTitle') },
        content: `<p>${this.#L(allowed > 1 ? 'LimitDeft' : 'LimitCatalyze', { name: foundry.utils.escapeHTML(actor.name), used, allowed })}</p>`,
        rejectClose: false,
      });
      if (!proceed) return;
    }

    const result = await CraftingHelper.execute(actor, 'alchemy', { formulaUuid: uuid });
    if (!result.ok) {
      ui.notifications.warn(CraftingHelper.failureMessage(result));
      return;
    }
    if (key) await actor.setFlag('vagabond', 'catalyzeUses', { key, count: used + 1 });
  }
}
