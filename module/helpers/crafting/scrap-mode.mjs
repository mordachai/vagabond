import { CurrencyHelper } from '../currency-helper.mjs';
import { MaterialsHelper } from '../materials-helper.mjs';
import { VagabondChatCard } from '../chat-card.mjs';

/**
 * Scrap: break an item down for Materials worth half its value (RAW §1). Doesn't
 * touch the Shift budget — it happens "during a Shift spent Crafting or by spending
 * an Hour", both honor-system timekeeping (docs/crafting-plan.md §4.7). Posts its
 * own chat card since, unlike `craft`, it's never batched into a Shift summary.
 */
export const ScrapMode = {
  key: 'scrap',
  label: 'VAGABOND.Craft.Modes.Scrap.Label',
  icon: 'fa-solid fa-recycle',
  time: 'hour',

  available(actor) {
    return actor?.type === 'character';
  },

  evaluate(actor, recipe) {
    const item = actor?.items?.get(recipe?.itemId);
    const checks = [];
    const scrappable = !!item && item.type === 'equipment'
      && !item.flags?.vagabond?.craftProject
      && !item.system?.craftMaterial?.enabled;
    checks.push({ ok: scrappable, key: 'item', label: 'VAGABOND.Craft.Checks.Target' });
    const value = item ? CurrencyHelper.toCopper(item.system.cost) : 0;
    const yieldCopper = Math.floor(value / 2);
    return { ok: checks.every(c => c.ok), checks, cost: { copper: 0, materials: 0, studiedDice: 0, action: null }, yieldCopper };
  },

  async execute(actor, recipe) {
    const evaluation = ScrapMode.evaluate(actor, recipe);
    if (!evaluation.ok) return { ok: false, reason: 'checksFailed', checks: evaluation.checks };

    const item = actor.items.get(recipe.itemId);
    const itemName = item.name;
    const quantity = item.system.quantity ?? 1;
    if (quantity > 1) await item.update({ 'system.quantity': quantity - 1 });
    else await item.delete();

    await MaterialsHelper.grant(actor, evaluation.yieldCopper);

    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle(game.i18n.localize('VAGABOND.Craft.Modes.Scrap.Label'))
      .setSubtitle(actor.name)
      .setDescription(`<p>${game.i18n.format('VAGABOND.Craft.Scrap.Result', {
        actor: `<strong>${foundry.utils.escapeHTML(actor.name)}</strong>`,
        item: `<strong>${foundry.utils.escapeHTML(itemName)}</strong>`,
        value: `<strong>${CurrencyHelper.format(evaluation.yieldCopper)}</strong>`,
      })}</p>`);
    await card.send();

    return { ok: true, yieldCopper: evaluation.yieldCopper };
  },
};
