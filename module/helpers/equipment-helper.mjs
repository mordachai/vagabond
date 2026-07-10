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
    // equipmentState is the single stored equip truth for ALL equipment
    // ('worn' = equipped without occupying hands). Containers have no
    // equipmentState and remain unequippable.
    if (item?.type !== 'equipment') return false;
    return item.system.equipmentState !== 'unequipped';
  }

  /**
   * Hands occupied by an item's CURRENT equipmentState (worn/unequipped = 0).
   * @param {Object} item
   * @returns {number} 0, 1 or 2
   */
  static handsFor(item) {
    return { oneHand: 1, twoHands: 2 }[item?.system?.equipmentState] ?? 0;
  }

  /**
   * The state an item should enter when equipped. Weapons derive it from
   * `grip`; non-weapons from `handsRequired` (0 = 'worn').
   * @param {Object} item
   * @returns {'oneHand'|'twoHands'|'worn'}
   */
  static defaultEquipState(item) {
    if (this.isWeapon(item)) return item.system.grip === '2H' ? 'twoHands' : 'oneHand';
    const hr = item?.system?.handsRequired ?? 0;
    return hr === 2 ? 'twoHands' : hr === 1 ? 'oneHand' : 'worn';
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
   * Equip ANY equipment item to a state, enforcing the shared 2-hand pool
   * across weapons and hand-occupying non-weapons (handsRequired > 0).
   * 'worn' occupies no hands and never conflicts. When the pool overflows,
   * other holders are bumped oldest-first (per-item
   * `flags.vagabond.equippedAt` timestamp, no category priority) until the
   * new item fits. Reproduces the old weapon-only semantics exactly (a 2H
   * bumps everything held; a 3rd 1H bumps the oldest 1H).
   * @param {Actor} actor
   * @param {string} itemId
   * @param {'unequipped'|'oneHand'|'twoHands'|'worn'} newState
   */
  static async equipWithHandLimit(actor, itemId, newState) {
    const item = actor.items.get(itemId);
    if (!item || item.type !== 'equipment') return;

    const HANDS = { oneHand: 1, twoHands: 2 };
    const need = HANDS[newState] ?? 0;
    const updates = [];

    if (need > 0) {
      const holders = actor.items.filter(
        (i) => i.type === 'equipment' && i.id !== itemId && (HANDS[i.system.equipmentState] ?? 0) > 0
      );
      let over = holders.reduce((n, i) => n + HANDS[i.system.equipmentState], 0) + need - 2;

      if (over > 0) {
        const oldestFirst = [...holders].sort(
          (a, b) => (a.getFlag('vagabond', 'equippedAt') || 0) - (b.getFlag('vagabond', 'equippedAt') || 0)
        );
        const conflicts = [];
        for (const h of oldestFirst) {
          if (over <= 0) break;
          conflicts.push(h);
          over -= HANDS[h.system.equipmentState];
        }
        for (const c of conflicts) {
          updates.push({ _id: c.id, 'system.equipmentState': 'unequipped' });
        }
        if (conflicts.length) {
          const names = conflicts.map((c) => c.name).join(', ');
          ui.notifications.info(`Unequipped ${names} to make room (hand limit).`);
        }
      }
    }

    updates.push({
      _id: itemId,
      'system.equipmentState': newState,
      ...(need > 0 ? { 'flags.vagabond.equippedAt': Date.now() } : {}),
    });

    await actor.updateEmbeddedDocuments('Item', updates);
  }

  /**
   * @deprecated Thin alias kept for legacy call sites — use equipWithHandLimit.
   * @param {Actor} actor
   * @param {string} weaponId
   * @param {'unequipped'|'oneHand'|'twoHands'} newState
   */
  static async equipWeaponWithHandLimit(actor, weaponId, newState) {
    return this.equipWithHandLimit(actor, weaponId, newState);
  }

  /**
   * Self-healing pass: correct an actor's equipment back into a legal
   * hand-limit state (max 2 hands total across ALL hand-occupying items) if
   * it somehow ended up violating it — legacy data, compendium import, a
   * macro writing `system.equipmentState` directly, etc. First normalizes
   * each equipped item's state to what its config demands (weapon grip /
   * non-weapon handsRequired), then bumps hand-holders oldest-first until
   * the pool fits ('worn' items never bump or get bumped). Keeps the newest
   * holders that fit — a newer 1H item may displace an older 2H one, per the
   * unified no-category-priority rule. No-op (no writes) when already
   * compliant, so it's safe to call on every sheet/HUD render.
   * @param {Actor} actor
   */
  static async sanitizeHandLimit(actor) {
    if (!actor?.isOwner) return;

    const HANDS = { oneHand: 1, twoHands: 2 };
    const equipped = actor.items.filter(
      (i) => i.type === 'equipment' && i.system.equipmentState !== 'unequipped'
    );

    // 1) Normalize state to what the item's config demands (e.g. a strict-2H
    // weapon stuck at 'oneHand' from before equip actions became grip-aware,
    // or a handsRequired item stuck at 'worn') — evaluate hand conflicts
    // against the CORRECTED state, not the possibly-stale one.
    const fixUpdates = [];
    const effectiveState = new Map();
    for (const it of equipped) {
      let state = it.system.equipmentState;
      if (this.isWeapon(it)) {
        const grip = it.system.grip;
        if (grip === '2H' && state !== 'twoHands') state = 'twoHands';
        else if ((grip === '1H' || grip === 'F') && state !== 'oneHand') state = 'oneHand';
        else if (grip === 'V' && state === 'worn') state = 'oneHand'; // 'worn' illegal for weapons
      } else {
        const hr = it.system.handsRequired ?? 0;
        state = hr === 2 ? 'twoHands' : hr === 1 ? 'oneHand' : 'worn';
      }
      if (state !== it.system.equipmentState) {
        fixUpdates.push({ _id: it.id, 'system.equipmentState': state });
      }
      effectiveState.set(it.id, state);
    }

    // 2) Bump hand-holders oldest-first until total ≤ 2 (keep newest that fit)
    const newestFirst = (a, b) =>
      (b.getFlag('vagabond', 'equippedAt') || 0) - (a.getFlag('vagabond', 'equippedAt') || 0);
    const holders = equipped
      .filter((i) => (HANDS[effectiveState.get(i.id)] ?? 0) > 0)
      .sort(newestFirst);

    let total = 0;
    const bump = [];
    for (const it of holders) {
      const h = HANDS[effectiveState.get(it.id)];
      if (total + h > 2) bump.push(it);
      else total += h;
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
    if (item?.type !== 'equipment') return 'N/A';
    const state = item.system.equipmentState;
    if (state === 'unequipped') return 'Unequipped';
    if (state === 'oneHand') return 'One Hand';
    if (state === 'twoHands') return 'Two Hands';
    if (state === 'worn') return this.isArmor(item) ? 'Equipped' : 'Worn';
    return 'Unknown';
  }
}
