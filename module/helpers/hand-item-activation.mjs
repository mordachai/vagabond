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
 * @param {'use'|'throw'} [o.mode] 'throw' (Thrown weapons only): attack
 *   WITHOUT equipping, then spend one from the stack. Stops at 0 (item kept)
 *   so raising the quantity "retrieves" thrown weapons.
 * @param {string|null} [o.skillKey] 'use' weapons: which allowed skill to attack
 *   with (default: the weapon's preferred skill).
 */
export async function activateHandItem({ actor, item, event, rollHandler, mode = 'use', skillKey = null }) {
  const { EquipmentHelper } = globalThis.vagabond.utils;

  if (mode === 'throw' && EquipmentHelper.isThrowable(item)) {
    const qty = item.system.quantity ?? 0;
    if (qty <= 0) {
      return ui.notifications.warn(game.i18n.format('VAGABOND.ContextMenu.ThrowNoneLeft', { name: item.name }));
    }
    const roll = await rollHandler.rollWeapon(event, { dataset: { itemId: item.id } }, { thrown: true });
    if (!roll) return; // aborted (hook, auto-fail, error) — nothing left the hand
    const update = { 'system.quantity': qty - 1 };
    // Threw the last one out of your hand → the hand is free again
    if (qty === 1 && EquipmentHelper.handsFor(item) > 0) update['system.equipmentState'] = 'unequipped';
    await item.update(update);
    return roll;
  }

  const occupiesHands = EquipmentHelper.isWeapon(item)
    || (item.type === 'equipment' && (item.system.handsRequired ?? 0) > 0);

  // Unequipped, or sitting in Belt ('worn') while it normally needs hands
  // → draw it into hands first.
  const heldState = EquipmentHelper.defaultEquipState(item);
  const needsDraw = !EquipmentHelper.isEquipped(item)
    || (EquipmentHelper.handsFor(item) === 0 && heldState !== 'worn');
  if (occupiesHands && needsDraw) {
    await EquipmentHelper.equipWithHandLimit(actor, item.id, heldState);
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
    return rollHandler.rollWeapon(event, target, { skillKey });
  }
  return rollHandler.useItem(event, target);
}
