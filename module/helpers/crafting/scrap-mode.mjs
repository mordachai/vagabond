import { CurrencyHelper } from '../currency-helper.mjs';
import { MaterialsHelper } from '../materials-helper.mjs';
import { EquipmentHelper } from '../equipment-helper.mjs';
import { VagabondChatCard } from '../chat-card.mjs';

/**
 * Scrap: break items down for Materials worth half their value (RAW §1). Doesn't
 * touch the Shift budget — it happens "during a Shift spent Crafting or by spending
 * an Hour", both honor-system timekeeping (docs/crafting-plan.md §4.7). Posts its
 * own chat card since, unlike `craft`, it's never batched into a Shift summary.
 *
 * Recipe: `{entries: [{itemId, quantity}]}` (one batch, one card, one Materials grant);
 * the legacy `{itemId}` shape scraps one unit of that item.
 */
export const ScrapMode = {
  key: 'scrap',
  label: 'VAGABOND.Craft.Modes.Scrap.Label',
  icon: 'fa-solid fa-recycle',
  time: 'hour',

  available(actor) {
    return actor?.type === 'character';
  },

  /** Can `item` be scrapped at all (by the current user)? */
  scrappable(item) {
    return !!item && item.type === 'equipment'
      && !item.flags?.vagabond?.craftProject
      && !item.system?.craftMaterial?.enabled
      && !EquipmentHelper.isCurseLocked(item);
  },

  /** Materials (copper) one batch line yields: half the value of `quantity` units. */
  yieldFor(item, quantity) {
    return Math.floor((CurrencyHelper.toCopper(item.system.cost) * quantity) / 2);
  },

  /** Normalized `[{item, quantity}]`; quantity clamped to the stack. Missing items keep `item: null`. */
  resolve(actor, recipe) {
    const raw = Array.isArray(recipe?.entries) ? recipe.entries : (recipe?.itemId ? [{ itemId: recipe.itemId, quantity: 1 }] : []);
    return raw.map(({ itemId, quantity }) => {
      const item = actor?.items?.get(itemId) ?? null;
      const stack = Math.max(1, item?.system?.quantity ?? 1);
      return { item, quantity: Math.min(stack, Math.max(1, Math.floor(Number(quantity) || 1))) };
    });
  },

  evaluate(actor, recipe) {
    const entries = ScrapMode.resolve(actor, recipe);
    const ok = entries.length > 0 && entries.every(e => ScrapMode.scrappable(e.item));
    const checks = [{ ok, key: 'item', label: 'VAGABOND.Craft.Checks.Target' }];
    const yieldCopper = ok ? entries.reduce((sum, e) => sum + ScrapMode.yieldFor(e.item, e.quantity), 0) : 0;
    return { ok, checks, cost: { copper: 0, materials: 0, studiedDice: 0, action: null }, yieldCopper };
  },

  async execute(actor, recipe) {
    const evaluation = ScrapMode.evaluate(actor, recipe);
    if (!evaluation.ok) return { ok: false, reason: 'checksFailed', checks: evaluation.checks };

    const entries = ScrapMode.resolve(actor, recipe);
    const names = entries.map(({ item, quantity }) => quantity > 1 ? `${item.name} ×${quantity}` : item.name);
    const updates = [];
    const deletes = [];
    for (const { item, quantity } of entries) {
      const stack = Math.max(1, item.system.quantity ?? 1);
      if (quantity >= stack) deletes.push(item.id);
      else updates.push({ _id: item.id, 'system.quantity': stack - quantity });
    }
    if (updates.length) await actor.updateEmbeddedDocuments('Item', updates);
    if (deletes.length) await actor.deleteEmbeddedDocuments('Item', deletes);

    await MaterialsHelper.grant(actor, evaluation.yieldCopper);

    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle(game.i18n.localize('VAGABOND.Craft.Modes.Scrap.Label'))
      .setSubtitle(actor.name)
      .setDescription(`<p>${game.i18n.format('VAGABOND.Craft.Scrap.Result', {
        actor: `<strong>${foundry.utils.escapeHTML(actor.name)}</strong>`,
        item: names.map(n => `<strong>${foundry.utils.escapeHTML(n)}</strong>`).join(', '),
        value: `<strong>${CurrencyHelper.format(evaluation.yieldCopper)}</strong>`,
      })}</p>`);
    await card.send();

    return { ok: true, yieldCopper: evaluation.yieldCopper };
  },
};
