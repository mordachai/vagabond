import { VagabondDamagePipeline } from './damage-pipeline.mjs';

/**
 * Combat numbers for an equipment item: weapon damage (per grip) with its damage-type
 * icon, armor rating, or the damage of anything else that deals it (alchemicals,
 * relics). Shared by the Store (shop-app) and the Workbench Craft catalog so both
 * show the same thing. Reads derived fields (`finalDamage*`, `finalRating`), so pass
 * a fully prepared Item (a temporary one is fine — see `CraftCatalog`).
 *
 * Damage values get the explode notation ("2d6!") when the dice can explode for
 * `actor` (item authoring, global effects, Potency). Entries also carry the raw
 * `formulas` + `src` so a cached list can be re-marked for another actor with
 * `markStatsForActor`.
 * @param {Item} item
 * @param {Actor|null} [actor] - Whose dice; defaults to the item's owner
 * @returns {Array<{icon: string, value: string, tooltip: string}>}
 */
/** Minimal item-shaped source for the explode check (works for indexed/temporary items). */
function explodeSource(item) {
  const sys = item.system;
  return {
    type: 'equipment',
    system: { equipmentType: sys.equipmentType, canExplode: sys.canExplode, explodeValues: sys.explodeValues },
  };
}

function damageStat(item, actor, icon, formulas, tooltip) {
  const src = explodeSource(item);
  const mark = (f) => VagabondDamagePipeline.markExplode(f, src, actor);
  return { icon, tooltip, formulas, src, value: formulas.map(mark).join('/') };
}

/**
 * Re-mark cached stat entries for a specific actor (catalog rows are built once
 * without an owner). Entries without damage formulas pass through.
 * @param {Array} stats - Result of `equipmentStats`
 * @param {Actor|null} actor
 */
export function markStatsForActor(stats, actor) {
  return (stats ?? []).map(s => (s.formulas
    ? { ...s, value: s.formulas.map(f => VagabondDamagePipeline.markExplode(f, s.src, actor)).join('/') }
    : s));
}

export function equipmentStats(item, actor = item?.actor ?? null) {
  const sys = item?.system;
  if (item?.type !== 'equipment' || !sys) return [];
  const damageLabel = game.i18n.localize('VAGABOND.Shop.App.Damage');
  const typed = (type) => {
    const key = CONFIG.VAGABOND.damageTypes?.[type];
    return type && type !== '-' && key ? ` (${game.i18n.localize(key)})` : '';
  };
  const icon = (type) => (type && type !== '-' && CONFIG.VAGABOND.damageTypeIcons?.[type]) || 'fas fa-burst';

  if (sys.equipmentType === 'weapon') {
    const one = sys.grip !== '2H' ? sys.finalDamageOneHand : null;
    const two = ['2H', 'V'].includes(sys.grip) ? sys.finalDamageTwoHands : null;
    const dice = [...new Set([one, two].filter(Boolean))];
    if (!dice.length) return [];
    const type = one ? sys.damageTypeOneHand : sys.damageTypeTwoHands;
    return [damageStat(item, actor, icon(type), dice, `${damageLabel}${typed(type)}`)];
  }
  if (sys.equipmentType === 'armor') {
    return [{ icon: 'fas fa-shield-halved', value: String(sys.finalRating ?? 0), tooltip: game.i18n.localize('VAGABOND.Shop.App.ArmorRating') }];
  }
  if (sys.damageAmount && sys.damageType && sys.damageType !== '-') {
    return [damageStat(item, actor, icon(sys.damageType), [sys.damageAmount], `${damageLabel}${typed(sys.damageType)}`)];
  }
  return [];
}
