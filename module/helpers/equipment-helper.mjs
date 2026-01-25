/**
 * Helper utilities for equipment type checking, state management, and visual enrichment.
 * Eliminates 15+ duplicate equipment type checks across the codebase.
 */
export class EquipmentHelper {
  // ===========================
  // Type Checking Methods
  // ===========================

  /**
   * Check if an item is a weapon
   * @param {Object} item - The item to check
   * @returns {boolean} True if the item is a weapon
   */
  static isWeapon(item) {
    return item?.type === 'equipment' && item?.system?.equipmentType === 'weapon';
  }

  /**
   * Check if an item is armor
   * @param {Object} item - The item to check
   * @returns {boolean} True if the item is armor
   */
  static isArmor(item) {
    return item?.type === 'equipment' && item?.system?.equipmentType === 'armor';
  }

  /**
   * Check if an item is gear
   * @param {Object} item - The item to check
   * @returns {boolean} True if the item is gear
   */
  static isGear(item) {
    return item?.type === 'equipment' && item?.system?.equipmentType === 'gear';
  }

  /**
   * Check if an item is an alchemical item
   * @param {Object} item - The item to check
   * @returns {boolean} True if the item is alchemical
   */
  static isAlchemical(item) {
    return item?.type === 'equipment' && item?.system?.equipmentType === 'alchemical';
  }

  /**
   * Check if an item is a relic
   * @param {Object} item - The item to check
   * @returns {boolean} True if the item is a relic
   */
  static isRelic(item) {
    return item?.type === 'equipment' && item?.system?.equipmentType === 'relic';
  }

  // ===========================
  // Equipment State Methods
  // ===========================

  /**
   * Check if an item is currently equipped
   * @param {Object} item - The item to check
   * @returns {boolean} True if the item is equipped
   */
  static isEquipped(item) {
    if (this.isWeapon(item)) {
      return item.system.equipmentState !== 'unequipped';
    }
    if (this.isArmor(item)) {
      return item.system.equipped === true;
    }
    if (this.isGear(item) || this.isAlchemical(item) || this.isRelic(item)) {
      return item.system.worn === true;
    }
    return false;
  }

  /**
   * Check if a weapon is versatile (can be used one-handed or two-handed)
   * @param {Object} item - The weapon to check
   * @returns {boolean} True if the weapon is versatile
   */
  static isVersatileWeapon(item) {
    // Handle null/undefined items
    if (!item || !item.system) {
      return false;
    }
    
    // Handle missing or invalid grip property
    const grip = item.system.grip;
    if (typeof grip !== 'string') {
      return false;
    }
    
    // Check for versatile grip value
    return this.isWeapon(item) && grip === 'V';
  }

  /**
   * Check if a weapon is currently equipped in one hand
   * @param {Object} item - The weapon to check
   * @returns {boolean} True if equipped in one hand
   */
  static isEquippedOneHand(item) {
    return this.isWeapon(item) && item.system.equipmentState === 'oneHand';
  }

  /**
   * Check if a weapon is currently equipped in two hands
   * @param {Object} item - The weapon to check
   * @returns {boolean} True if equipped in two hands
   */
  static isEquippedTwoHands(item) {
    return this.isWeapon(item) && item.system.equipmentState === 'twoHands';
  }

  // ===========================
  // Visual Enrichment Methods
  // ===========================

  /**
   * Get the metal color for a weapon based on its metal type
   * @param {Object} item - The weapon item
   * @returns {string|null} Hex color code or null if not a weapon
   */
  static getMetalColor(item) {
    if (!this.isWeapon(item)) return null;
    const metalType = item.system.metal || 'iron';
    return CONFIG.VAGABOND.metalColors[metalType] || '#808080';
  }

  /**
   * Get the weapon skill icon class
   * @param {Object} item - The weapon item
   * @returns {string|null} Icon class or null if not a weapon
   */
  static getWeaponSkillIcon(item) {
    if (!this.isWeapon(item)) return null;
    const skill = item.system.weaponSkill || 'melee';
    return CONFIG.VAGABOND.weaponSkillIcons?.[skill] || null;
  }

  /**
   * Get the damage type icon class
   * @param {Object} item - The item with damage type
   * @returns {string|null} Icon class or null if no damage type
   */
  static getDamageTypeIcon(item) {
    const damageType = item.system?.damageType;
    if (!damageType || damageType === '-') return null;
    return CONFIG.VAGABOND.damageTypeIcons?.[damageType] || null;
  }

  /**
   * Get the range abbreviation for a weapon
   * @param {Object} item - The weapon item
   * @returns {string|null} Range abbreviation or null
   */
  static getRangeAbbreviation(item) {
    if (!this.isWeapon(item)) return null;
    const range = item.system.range;
    return CONFIG.VAGABOND.rangeAbbreviations[range] || range;
  }

  /**
   * Get equipment state display text
   * @param {Object} item - The equipment item
   * @returns {string} Display text for equipment state
   */
  static getEquipmentStateText(item) {
    if (this.isWeapon(item)) {
      const state = item.system.equipmentState;
      if (state === 'unequipped') return 'Unequipped';
      if (state === 'oneHand') return 'One Hand';
      if (state === 'twoHands') return 'Two Hands';
      return 'Unknown';
    }
    if (this.isArmor(item)) {
      return item.system.equipped ? 'Equipped' : 'Unequipped';
    }
    if (this.isGear(item) || this.isAlchemical(item) || this.isRelic(item)) {
      return item.system.worn ? 'Worn' : 'Not Worn';
    }
    return 'N/A';
  }
}
