import { VagabondItem } from '../../documents/item.mjs';
import { VagabondChatCard } from '../chat-card.mjs';
import { MixHelper } from './mix-helper.mjs';

/** An owned item usable as a Mix ingredient (see MixHelper.isMixableItem), or null. */
function mixable(actor, itemId) {
  const item = actor?.items?.get(itemId);
  return MixHelper.isMixableItem(item) ? item : null;
}

/**
 * Mix (Alchemist L6, RAW §1): combine two Alchemical Items with the Use Action by
 * spending a Studied die (docs/crafting-plan.md §4.3/§4.10). Ingredient charges are
 * consumed immediately; the resulting Mix item carries both payloads merged
 * (MixHelper.combinePayloads), a second damage type resolving as a companion card.
 */
export const MixMode = {
  key: 'mix',
  label: 'VAGABOND.Craft.Modes.Mix.Label',
  icon: 'fa-solid fa-flask-vial',
  time: 'useAction',
  skipApproval: true,

  available(actor) {
    return actor?.type === 'character' && !!actor.system.craft?.mix;
  },

  evaluate(actor, recipe) {
    const checks = [];
    checks.push({ ok: !!actor.system.craft?.mix, key: 'mix', label: 'VAGABOND.Craft.Checks.Mix' });
    checks.push({ ok: (actor.system.studiedDice ?? 0) > 0, key: 'studiedDice', label: 'VAGABOND.Craft.Checks.StudiedDice' });

    const itemA = recipe?.itemIdA ? mixable(actor, recipe.itemIdA) : null;
    const itemB = recipe?.itemIdB && recipe.itemIdB !== recipe.itemIdA ? mixable(actor, recipe.itemIdB) : null;
    checks.push({ ok: !!itemA && !!itemB, key: 'ingredients', label: 'VAGABOND.Craft.Checks.MixIngredients' });

    return { ok: checks.every(c => c.ok), checks, cost: { copper: 0, materials: 0, studiedDice: 1, action: 'use' } };
  },

  async execute(actor, recipe) {
    const evaluation = MixMode.evaluate(actor, recipe);
    if (!evaluation.ok) return { ok: false, reason: 'checksFailed', checks: evaluation.checks };

    const itemA = actor.items.get(recipe.itemIdA);
    const itemB = actor.items.get(recipe.itemIdB);
    // Snapshot BEFORE consuming — a last charge deletes the item.
    const dataA = itemA.toObject();
    const dataB = itemB.toObject();

    await VagabondItem._consumeCharge(itemA);
    await VagabondItem._consumeCharge(itemB);
    await actor.update({ 'system.studiedDice': actor.system.studiedDice - 1 });

    const created = await MixHelper.create(actor, dataA, dataB);

    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle(game.i18n.localize('VAGABOND.Craft.Modes.Mix.Label'))
      .setSubtitle(actor.name)
      .setDescription(`<p>${game.i18n.format('VAGABOND.Craft.Mix.Result', {
        actor: `<strong>${foundry.utils.escapeHTML(actor.name)}</strong>`,
        a: foundry.utils.escapeHTML(dataA.name),
        b: foundry.utils.escapeHTML(dataB.name),
      })}</p>`);
    await card.send();

    // Mixing is itself a Use Action — older out-of-combat Mixes watching for
    // "your next action" go inert now (the new one is excluded).
    Hooks.callAll('vagabond.actorActed', actor, { source: 'itemUse', itemId: created.id });
    return { ok: true, createdItem: created };
  },
};
