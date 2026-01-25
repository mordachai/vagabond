/**
 * Handler for equipment state management.
 * Manages equipment/unequipment and grip toggles for weapons and armor.
 */
export class EquipmentHandler {
  /**
   * @param {VagabondActorSheet} sheet - The parent actor sheet
   */
  constructor(sheet) {
    this.sheet = sheet;
    this.actor = sheet.actor;
  }

  /**
   * Toggle weapon equipment state
   * Cycles through: unequipped -> oneHand -> twoHands -> unequipped (based on grip type)
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async toggleWeaponEquipment(event, target) {
    event.preventDefault();

    // Submit pending form changes before toggling weapon equipment
    if (this.sheet.hasFrame) {
      try {
        await this.sheet.submit();
      } catch (err) {
        console.error('Vagabond | Error submitting form before weapon equipment toggle:', err);
      }
    }

    const itemId = target.dataset.itemId;
    const weapon = this.actor.items.get(itemId);

    // Import equipment helper
    const { EquipmentHelper } = globalThis.vagabond.utils;

    // Check if this is a weapon
    if (!EquipmentHelper.isWeapon(weapon)) {
      ui.notifications.error('Weapon not found!');
      return;
    }

    // Get the weapon's grip type
    const grip = weapon.system.grip;
    const currentState = weapon.system.equipmentState || 'unequipped';
    let nextState;

    // Cycle through equipment states based on grip type
    if (grip === '2H') {
      // Two-handed only weapons: unequipped <-> twoHands
      nextState = currentState === 'unequipped' ? 'twoHands' : 'unequipped';
    } else if (grip === '1H' || grip === 'F') {
      // One-handed only or fist weapons: unequipped <-> oneHand
      nextState = currentState === 'unequipped' ? 'oneHand' : 'unequipped';
    } else if (grip === 'V') {
      // Versatile weapons: full cycle unequipped -> oneHand -> twoHands -> unequipped
      switch (currentState) {
        case 'unequipped':
          nextState = 'oneHand';
          break;
        case 'oneHand':
          nextState = 'twoHands';
          break;
        case 'twoHands':
          nextState = 'unequipped';
          break;
        default:
          nextState = 'unequipped';
      }
    } else {
      // Unknown grip type - default to one-handed behavior
      nextState = currentState === 'unequipped' ? 'oneHand' : 'unequipped';
    }

    // Update the weapon's equipment state
    await weapon.update({ 'system.equipmentState': nextState });
  }

  /**
   * Toggle weapon grip (for versatile weapons in favorites panel)
   * Toggles between: oneHand <-> twoHands
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async toggleWeaponGrip(event, target) {
    event.preventDefault();

    // Submit pending form changes before toggling grip
    if (this.sheet.hasFrame) {
      try {
        await this.sheet.submit();
      } catch (err) {
        console.error('Vagabond | Error submitting form before grip toggle:', err);
      }
    }

    const itemId = target.dataset.itemId;
    const weapon = this.actor.items.get(itemId);

    // Import equipment helper
    const { EquipmentHelper } = globalThis.vagabond.utils;

    // Check if this is a versatile weapon
    if (!EquipmentHelper.isVersatileWeapon(weapon)) {
      ui.notifications.warn('This weapon is not versatile!');
      return;
    }

    const currentState = weapon.system.equipmentState;

    // Toggle between oneHand and twoHands
    let newState;
    if (currentState === 'oneHand') {
      newState = 'twoHands';
    } else if (currentState === 'twoHands') {
      newState = 'oneHand';
    } else {
      // If somehow unequipped, default to oneHand
      newState = 'oneHand';
    }

    await weapon.update({ 'system.equipmentState': newState });
  }

  /**
   * Toggle armor equipment state
   * Toggles between: unequipped <-> equipped
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async toggleArmorEquipment(event, target) {
    event.preventDefault();

    // Submit pending form changes before toggling armor equipment
    if (this.sheet.hasFrame) {
      try {
        await this.sheet.submit();
      } catch (err) {
        console.error('Vagabond | Error submitting form before armor equipment toggle:', err);
      }
    }

    const itemId = target.dataset.itemId;
    const armor = this.actor.items.get(itemId);

    // Import equipment helper
    const { EquipmentHelper } = globalThis.vagabond.utils;

    // Check if this is armor
    if (!EquipmentHelper.isArmor(armor)) {
      ui.notifications.error('Armor not found!');
      return;
    }

    const currentState = armor.system.equipped || false;
    const newState = !currentState;

    await armor.update({ 'system.equipped': newState });
  }

  /**
   * Equip an item (from context menu)
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async equipItem(event, target) {
    event.preventDefault();

    const itemId = target.dataset.itemId;
    const item = this.actor.items.get(itemId);

    if (!item) {
      ui.notifications.error('Item not found!');
      return;
    }

    // Import equipment helper
    const { EquipmentHelper } = globalThis.vagabond.utils;

    const isEquipped = EquipmentHelper.isEquipped(item);

    if (EquipmentHelper.isWeapon(item) && item.system.equipmentState !== undefined) {
      const newState = isEquipped ? 'unequipped' : 'oneHand';
      await item.update({ 'system.equipmentState': newState });
    }
    // For armor, update worn state
    else if (item.type === 'armor') {
      await item.update({ 'system.worn': !isEquipped });
    }
    // For other items (gear, etc), update equipped
    else if (item.system.equipped !== undefined) {
      await item.update({ 'system.equipped': !isEquipped });
    }
  }
}
