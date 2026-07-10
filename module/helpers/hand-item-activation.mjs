import { runMacroFromButton } from './item-macro.mjs';

/**
 * Unified "Use" behavior for hand-occupying equipment: weapons, and any
 * non-weapon with `handsRequired > 0` (torches, wands, etc.). Equips the item
 * first if it isn't already — so "Use" never needs a separate "Equip" step
 * first — then performs its action:
 *  - light-source items (macro calls `lightSource.use`) toggle ignite/douse
 *  - weapons and damaging alchemicals roll an attack
 *  - everything else posts via `item.roll()` (useItem)
 *
 * Non-hand-occupying items (worn equipment, spells, etc.) skip the equip step
 * entirely and just perform their action.
 *
 * @param {object} o
 * @param {Actor} o.actor
 * @param {Item} o.item
 * @param {Event} o.event
 * @param {{rollWeapon: Function, useItem: Function}} o.rollHandler
 */
export async function activateHandItem({ actor, item, event, rollHandler }) {
  const { EquipmentHelper } = globalThis.vagabond.utils;

  const occupiesHands = EquipmentHelper.isWeapon(item)
    || (item.type === 'equipment' && (item.system.handsRequired ?? 0) > 0);

  if (occupiesHands && !EquipmentHelper.isEquipped(item)) {
    await EquipmentHelper.equipWithHandLimit(actor, item.id, EquipmentHelper.defaultEquipState(item));
  }

  const LS = game.vagabond?.lightSource;
  const cfg = item.system?.macro;
  if (cfg?.enabled && LS?.isLightItem?.(item)) {
    if (LS.isItemLit(item)) return LS.douse(actor);
    return runMacroFromButton({
      itemUuid: item.uuid,
      actorUuid: actor.uuid,
      itemName: item.name,
      slot: 'macro',
      runAsGM: !!cfg.runAsGM,
      command: cfg.command ?? null,
    });
  }

  const hasAlchemicalDamage = EquipmentHelper.isAlchemical(item)
    && item.system.damageType && item.system.damageType !== '-';
  const target = { dataset: { itemId: item.id } };

  if (EquipmentHelper.isWeapon(item) || hasAlchemicalDamage) {
    return rollHandler.rollWeapon(event, target);
  }
  return rollHandler.useItem(event, target);
}
