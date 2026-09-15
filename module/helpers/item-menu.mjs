import { activateHandItem } from './hand-item-activation.mjs';

/**
 * Whether an item has a meaningful "Use" action. Weapons always do (Use
 * auto-equips); armor never does; gear only when consumable or hand-occupying
 * (e.g. a torch — Use auto-equips it); alchemicals, relics, etc. always do.
 * @param {Item} item
 * @returns {boolean}
 */
export function itemHasUse(item) {
  const { EquipmentHelper } = globalThis.vagabond.utils;
  if (EquipmentHelper.isWeapon(item)) return true;
  if (EquipmentHelper.isArmor(item)) return false;
  if (EquipmentHelper.isGear(item)) {
    return item.system.isConsumable === true || (item.system.handsRequired ?? 0) > 0;
  }
  return true;
}

/**
 * Shared item context-menu entries used by the HUD belt slots / hand circles,
 * the inventory grid (sheet + HUD inventory tab) and the sheet's Equipped panel:
 * Attack / Use, Throw + Quantity, 1H ⇄ 2H grip, Open, Send to Chat,
 * Equip / Unequip, Bind / Unbind. Callers append context-specific entries
 * (Remove from HUD, Delete).
 *
 * @param {object} o
 * @param {Actor} o.actor
 * @param {Item} o.item
 * @param {Event} o.event
 * @param {{rollWeapon: Function, useItem: Function}} o.rollHandler
 * @param {EquipmentHandler} [o.equipmentHandler] enables the versatile grip toggle
 * @param {boolean} [o.forceUse] show "Use" even for items itemHasUse() rejects
 * @param {Function} [o.onChange] called after equip-state changes (e.g. re-render)
 * @returns {object[]} ContextMenuHelper item configs
 */
export function buildItemMenuItems({ actor, item, event, rollHandler, equipmentHandler, forceUse = false, onChange }) {
  const { EquipmentHelper, VagabondChatCard } = globalThis.vagabond.utils;
  const L = (k) => game.i18n.localize(k);
  const activate = (opts = {}) => activateHandItem({ actor, item, event, rollHandler, ...opts });
  const items = [];

  // Attack options: "Attack (Preferred)" + one "Attack with X" per other allowed skill
  if (EquipmentHelper.isWeapon(item)) {
    items.push(...EquipmentHelper.weaponAttackMenuItems(item, (skillKey) => activate({ skillKey })));
  } else if (forceUse || itemHasUse(item)) {
    items.push({
      label: L('VAGABOND.ContextMenu.Use'),
      icon: 'fas fa-hand-sparkles',
      action: () => activate(),
    });
  }

  // Throw (Thrown weapons): attack without equipping, spends one from the stack
  if (EquipmentHelper.isThrowable(item)) {
    items.push({
      label: L('VAGABOND.ContextMenu.Throw'),
      icon: 'fas fa-share',
      action: () => activate({ mode: 'throw' }),
    });
    items.push({
      label: L('VAGABOND.UI.Labels.Quantity'),
      icon: 'fas fa-layer-group',
      stepper: {
        value: item.system.quantity ?? 0,
        onChange: async (delta) => {
          await EquipmentHelper.adjustQuantity(item, delta);
          return item.system.quantity ?? 0;
        },
      },
    });
  }

  // Versatile grip toggle (only meaningful while held)
  const state = item.system.equipmentState;
  if (equipmentHandler && EquipmentHelper.isVersatileWeapon(item) && (state === 'oneHand' || state === 'twoHands')) {
    const twoH = state === 'twoHands';
    items.push({
      label: L(twoH ? 'VAGABOND.Hud.Menu.UseOneHand' : 'VAGABOND.Hud.Menu.UseTwoHands'),
      icon: twoH ? 'fas fa-hand-fist' : 'fas fa-hands',
      action: async () => {
        await equipmentHandler.toggleWeaponGrip(event, { dataset: { itemId: item.id } });
        onChange?.();
      },
    });
  }

  items.push({
    label: L('VAGABOND.Hud.Menu.Open'),
    icon: 'fas fa-up-right-from-square',
    action: () => item.sheet.render(true),
  });

  items.push({
    label: L('VAGABOND.ContextMenu.SendToChat'),
    icon: 'fas fa-comment',
    action: () => VagabondChatCard.gearUse(actor, item),
  });

  const isEquipped = EquipmentHelper.isEquipped(item);
  const equipTo = (newState) => async () => {
    await EquipmentHelper.equipWithHandLimit(actor, item.id, newState);
    onChange?.();
  };

  // Held weapons can be equipped in Hands or on the Belt ('worn': equipped
  // without occupying hands, e.g. a sheathed dagger). Offer whichever zone the
  // weapon isn't already in. Non-weapons follow `handsRequired`: if they
  // occupy hands, Equip always puts them in hands.
  const heldState = EquipmentHelper.defaultEquipState(item);
  if (EquipmentHelper.isWeapon(item) && heldState !== 'worn') {
    if (EquipmentHelper.handsFor(item) === 0) {
      items.push({ label: L('VAGABOND.ContextMenu.EquipInHands'), icon: 'fas fa-hand', action: equipTo(heldState) });
    }
    if (state !== 'worn') {
      items.push({ label: L('VAGABOND.ContextMenu.EquipInBelt'), icon: 'fas fa-bolt', action: equipTo('worn') });
    }
    if (isEquipped) {
      items.push({ label: L('VAGABOND.ContextMenu.Unequip'), icon: 'fas fa-times', action: equipTo('unequipped') });
    }
  } else {
    items.push({
      label: L(isEquipped ? 'VAGABOND.ContextMenu.Unequip' : 'VAGABOND.ContextMenu.Equip'),
      icon: `fas fa-${isEquipped ? 'times' : 'check'}`,
      action: equipTo(isEquipped ? 'unequipped' : heldState),
    });
  }

  if (item.system.requiresBound) {
    const isBound = item.system.bound === true;
    items.push({
      label: L(isBound ? 'VAGABOND.ContextMenu.Unbind' : 'VAGABOND.ContextMenu.Bind'),
      icon: 'fa-solid fa-diamond',
      action: async () => {
        // Binding respects the actor's bounds limit
        if (!isBound) {
          const current = actor.system.inventory?.currentBounds ?? 0;
          const max = actor.system.inventory?.maxBounds ?? 3;
          if (current >= max) {
            return ui.notifications.warn(game.i18n.format('VAGABOND.UI.Labels.BoundsLimitReached', {
              name: item.name, current, max,
            }));
          }
        }
        await item.update({ 'system.bound': !isBound });
      },
    });
  }

  return items;
}
