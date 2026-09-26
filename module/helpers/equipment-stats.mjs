/**
 * Combat numbers for an equipment item: weapon damage (per grip) with its damage-type
 * icon, armor rating, or the damage of anything else that deals it (alchemicals,
 * relics). Shared by the Store (shop-app) and the Workbench Craft catalog so both
 * show the same thing. Reads derived fields (`finalDamage*`, `finalRating`), so pass
 * a fully prepared Item (a temporary one is fine — see `CraftCatalog`).
 * @param {Item} item
 * @returns {Array<{icon: string, value: string, tooltip: string}>}
 */
export function equipmentStats(item) {
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
    return [{ icon: icon(type), value: dice.join('/'), tooltip: `${damageLabel}${typed(type)}` }];
  }
  if (sys.equipmentType === 'armor') {
    return [{ icon: 'fas fa-shield-halved', value: String(sys.finalRating ?? 0), tooltip: game.i18n.localize('VAGABOND.Shop.App.ArmorRating') }];
  }
  if (sys.damageAmount && sys.damageType && sys.damageType !== '-') {
    return [{ icon: icon(sys.damageType), value: sys.damageAmount, tooltip: `${damageLabel}${typed(sys.damageType)}` }];
  }
  return [];
}
