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

  /**
   * Check if an item is a container
   * @param {Object} item - The item to check
   * @returns {boolean} True if the item is a container
   */
  static isContainer(item) {
    return item?.type === 'container';
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
    if (this.isContainer(item)) {
      return false; // Containers are not "equipped" in the traditional sense
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

  /**
   * Equip a weapon to a hand-occupying state (oneHand/twoHands), enforcing the
   * hand limit: max 2x one-handed OR 1x two-handed weapon equipped at once.
   * Auto-unequips whatever conflicts to make room (2H bumps all 1H; a 3rd 1H
   * bumps the oldest of the two already equipped, tracked via a per-item
   * `flags.vagabond.equippedAt` timestamp). No-op checks when unequipping.
   * @param {Actor} actor
   * @param {string} weaponId
   * @param {'unequipped'|'oneHand'|'twoHands'} newState
   */
  static async equipWeaponWithHandLimit(actor, weaponId, newState) {
    const weapon = actor.items.get(weaponId);
    if (!weapon) return;

    const updates = [];

    if (newState === 'oneHand' || newState === 'twoHands') {
      const others = actor.items.filter(
        (i) => this.isWeapon(i) && i.id !== weaponId && i.system.equipmentState !== 'unequipped'
      );

      let conflicts;
      if (newState === 'twoHands') {
        conflicts = others;
      } else {
        const twoHanders = others.filter((i) => i.system.equipmentState === 'twoHands');
        const oneHanders = others.filter((i) => i.system.equipmentState === 'oneHand');
        conflicts = [...twoHanders];
        if (oneHanders.length >= 2) {
          const oldest = oneHanders.sort(
            (a, b) => (a.getFlag('vagabond', 'equippedAt') || 0) - (b.getFlag('vagabond', 'equippedAt') || 0)
          )[0];
          conflicts.push(oldest);
        }
      }

      for (const c of conflicts) {
        updates.push({ _id: c.id, 'system.equipmentState': 'unequipped' });
      }

      if (conflicts.length) {
        const names = conflicts.map((c) => c.name).join(', ');
        ui.notifications.info(`Unequipped ${names} to make room (hand limit).`);
      }
    }

    updates.push({
      _id: weaponId,
      'system.equipmentState': newState,
      ...(newState !== 'unequipped' ? { 'flags.vagabond.equippedAt': Date.now() } : {}),
    });

    await actor.updateEmbeddedDocuments('Item', updates);
  }

  /**
   * Self-healing pass: correct an actor's weapons back into a legal hand-limit
   * state (max 2x oneHand OR 1x twoHands) if they somehow ended up violating
   * it — legacy data from before this rule existed, compendium import, a
   * macro writing `system.equipmentState` directly, etc. No-op (no writes)
   * when already compliant, so it's safe to call on every sheet/HUD render.
   * @param {Actor} actor
   */
  static async sanitizeHandLimit(actor) {
    if (!actor?.isOwner) return;

    const weapons = actor.items.filter(
      (i) => this.isWeapon(i) && i.system.equipmentState !== 'unequipped'
    );

    // Normalize grip/state mismatches first (e.g. a strict-2H weapon stuck at
    // 'oneHand' from before equip actions became grip-aware) — evaluate hand
    // conflicts against the CORRECTED state, not the possibly-stale one.
    const fixUpdates = [];
    const effectiveState = new Map();
    for (const w of weapons) {
      const grip = w.system.grip;
      let state = w.system.equipmentState;
      if (grip === '2H' && state !== 'twoHands') state = 'twoHands';
      else if ((grip === '1H' || grip === 'F') && state !== 'oneHand') state = 'oneHand';
      if (state !== w.system.equipmentState) {
        fixUpdates.push({ _id: w.id, 'system.equipmentState': state });
      }
      effectiveState.set(w.id, state);
    }

    const twoHanders = weapons.filter((i) => effectiveState.get(i.id) === 'twoHands');
    const oneHanders = weapons.filter((i) => effectiveState.get(i.id) === 'oneHand');

    const newestFirst = (a, b) =>
      (b.getFlag('vagabond', 'equippedAt') || 0) - (a.getFlag('vagabond', 'equippedAt') || 0);

    let bump = [];
    if (twoHanders.length && (twoHanders.length > 1 || oneHanders.length)) {
      const keep = [...twoHanders].sort(newestFirst)[0];
      bump = weapons.filter((w) => w.id !== keep.id);
    } else if (oneHanders.length > 2) {
      bump = [...oneHanders].sort(newestFirst).slice(2);
    }

    const bumpIds = new Set(bump.map((w) => w.id));
    const updates = [
      ...fixUpdates.filter((u) => !bumpIds.has(u._id)),
      ...bump.map((w) => ({ _id: w.id, 'system.equipmentState': 'unequipped' })),
    ];

    if (!updates.length) return;

    await actor.updateEmbeddedDocuments('Item', updates);
    if (bump.length) {
      ui.notifications.info(`Hand-limit cleanup: unequipped ${bump.map((w) => w.name).join(', ')}.`);
    }
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
