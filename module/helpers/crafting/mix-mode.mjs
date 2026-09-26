import { VagabondItem } from '../../documents/item.mjs';
import { MixHelper } from './mix-helper.mjs';

/** An owned equipment item usable as a Mix ingredient: an Alchemical Item with a charge left. */
function isMixable(actor, itemId) {
  const item = actor?.items?.get(itemId);
  if (!item || item.type !== 'equipment' || item.system.equipmentType !== 'alchemical') return null;
  return VagabondItem._chargesRemaining(item) > 0 ? item : null;
}

/**
 * Mix (Alchemist L6, RAW §1): combine two Alchemical Items with the Use Action by
 * spending a Studied die (docs/crafting-plan.md §4.3/§4.10). Ingredient charges are
 * consumed immediately; the resulting Mix item's Use-time dual-payload resolution
 * is not wired yet (see MixHelper's doc comment) — this mode only covers creation.
 */
export const MixMode = {
  key: 'mix',
  label: 'VAGABOND.Craft.Modes.Mix.Label',
  icon: 'fa-solid fa-flask-vial',
  time: 'useAction',

  available(actor) {
    return actor?.type === 'character' && !!actor.system.craft?.mix;
  },

  evaluate(actor, recipe) {
    const checks = [];
    checks.push({ ok: !!actor.system.craft?.mix, key: 'mix', label: 'VAGABOND.Craft.Checks.Mix' });
    checks.push({ ok: (actor.system.studiedDice ?? 0) > 0, key: 'studiedDice', label: 'VAGABOND.Craft.Checks.StudiedDice' });

    const itemA = recipe?.itemIdA ? isMixable(actor, recipe.itemIdA) : null;
    const itemB = recipe?.itemIdB && recipe.itemIdB !== recipe.itemIdA ? isMixable(actor, recipe.itemIdB) : null;
    checks.push({ ok: !!itemA && !!itemB, key: 'ingredients', label: 'VAGABOND.Craft.Checks.MixIngredients' });

    return { ok: checks.every(c => c.ok), checks, cost: { copper: 0, materials: 0, studiedDice: 1, action: 'use' } };
  },

  async execute(actor, recipe) {
    const evaluation = MixMode.evaluate(actor, recipe);
    if (!evaluation.ok) return { ok: false, reason: 'checksFailed', checks: evaluation.checks };

    const itemA = actor.items.get(recipe.itemIdA);
    const itemB = actor.items.get(recipe.itemIdB);
    const dataA = itemA.toObject();
    const dataB = itemB.toObject();

    await VagabondItem._consumeCharge(itemA);
    await VagabondItem._consumeCharge(itemB);
    await actor.update({ 'system.studiedDice': actor.system.studiedDice - 1 });

    const created = await MixHelper.create(actor, dataA, dataB);
    return { ok: true, createdItem: created };
  },
};
