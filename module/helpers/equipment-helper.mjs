import { VagabondDamageHelper } from './damage-helper.mjs';

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
   * The one set of worn Armor that counts (RAW: "You can only benefit from one
   * set of worn Armor"). equipWithHandLimit keeps at most one equipped; if data
   * still holds several, the highest final Rating wins.
   * @param {Actor} actor
   * @returns {Item|null}
   */
  static getWornArmor(actor) {
    let best = null;
    for (const i of actor?.items ?? []) {
      if (!this.isArmor(i) || !i.system.equipped) continue;
      if (!best || (i.system.finalRating ?? 0) > (best.system.finalRating ?? 0)) best = i;
    }
    return best;
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
   * Weapon with the Thrown property — can be thrown straight from the belt or
   * inventory without being equipped (see activateHandItem mode 'throw').
   * @param {Object} item
   * @returns {boolean}
   */
  static isThrowable(item) {
    return this.isWeapon(item) && (item.system.properties ?? []).includes('Thrown');
  }

  /**
   * Alchemical Item that attacks when thrown (RAW: "If used for an attack, they
   * do so ... with the Thrown Property"): has damage, and its damage type isn't
   * restorative (potions are drunk, not thrown). Unlike a Thrown weapon, a throw
   * spends a charge via `_consumeCharge` — the container breaks.
   * @param {Object} item
   * @returns {boolean}
   */
  static isThrownAlchemical(item) {
    if (!this.isAlchemical(item)) return false;
    const { damageType, damageAmount } = item.system;
    if (!damageType || damageType === '-' || !damageAmount) return false;
    return !VagabondDamageHelper.isRestorativeDamageType(damageType);
  }

  /** Skills a thrown Alchemical Item can attack with (Ranged, or Craft). */
  static THROWN_ALCHEMICAL_SKILLS = ['ranged', 'craft'];

  /**
   * Skills a weapon can attack with: its default `weaponSkill` plus any
   * `altSkills` (e.g. a Dagger: Melee, also Finesse). Deduped, default first.
   * @param {Object} item
   * @returns {string[]}
   */
  static attackSkillOptions(item) {
    if (this.isThrownAlchemical(item)) return [...this.THROWN_ALCHEMICAL_SKILLS];
    const keys = [item?.system?.weaponSkill || 'melee', ...(item?.system?.altSkills ?? [])];
    return keys.filter((k, i) => k && keys.indexOf(k) === i);
  }

  /**
   * Skill key an attack rolls with. A throw always rolls Ranged (RAW Thrown).
   * Otherwise an explicit `skillKey`, then the owner's preferred skill
   * (`flags.vagabond.preferredSkill`), then the weapon's default — each only
   * if the weapon allows it.
   * @param {Object} item
   * @param {{mode?: 'use'|'throw', skillKey?: string|null}} [options]
   * @returns {string}
   */
  /**
   * The allowed attack skill with the LOWEST difficulty for `actor` (lower =
   * better in Vagabond: difficulty is the d20 target). Ties keep the weapon's
   * option order (default first). Used once, when a weapon enters a
   * character's inventory, to seed `flags.vagabond.preferredSkill`.
   * @param {Object} item
   * @param {Actor} actor
   * @returns {string}
   */
  static bestAttackSkill(item, actor) {
    const options = this.attackSkillOptions(item);
    const diff = (k) => actor?.system?.skills?.[k]?.difficulty ?? actor?.system?.saves?.[k]?.difficulty ?? Infinity;
    return options.reduce((best, k) => (diff(k) < diff(best) ? k : best), options[0]);
  }

  static attackSkillFor(item, { mode = 'use', skillKey = null } = {}) {
    // Thrown Alchemical Item: explicit pick, else whichever of Ranged/Craft is
    // better for the owner right now (never persisted — no preferredSkill seed).
    if (this.isThrownAlchemical(item)) {
      const options = this.THROWN_ALCHEMICAL_SKILLS;
      return options.includes(skillKey) ? skillKey : this.bestAttackSkill(item, item.actor);
    }
    if (mode === 'throw') return 'ranged';
    const options = this.attackSkillOptions(item);
    const preferred = item?.getFlag?.('vagabond', 'preferredSkill');
    return [skillKey, preferred].find((k) => k && options.includes(k)) ?? options[0];
  }

  /**
   * Context-menu entries for attacking with a weapon: "Attack (Preferred)"
   * first, then one "Attack with X" per other allowed skill. Plain "Attack"
   * when the weapon has a single skill. A thrown Alchemical Item gets the same
   * shape as "Throw (Best)" + "Throw with X" (Ranged / Craft).
   * @param {Object} item
   * @param {(skillKey: string) => any} attack
   * @returns {{label: string, icon: string, action: Function}[]}
   */
  static weaponAttackMenuItems(item, attack) {
    const options = this.attackSkillOptions(item);
    const preferred = this.attackSkillFor(item);
    const skillLabel = (k) => game.i18n.localize(CONFIG.VAGABOND.weaponSkills?.[k] ?? k);
    const isThrow = this.isThrownAlchemical(item);
    const verb = isThrow ? 'Throw' : 'Attack';
    const icon = isThrow ? 'fas fa-share' : 'fas fa-swords';
    if (options.length < 2) {
      return [{ label: game.i18n.localize(`VAGABOND.ContextMenu.${verb}`), icon, action: () => attack(preferred) }];
    }
    return [
      {
        label: game.i18n.format(`VAGABOND.ContextMenu.${verb}Skill`, { skill: skillLabel(preferred) }),
        icon,
        action: () => attack(preferred),
      },
      ...options.filter((k) => k !== preferred).map((k) => ({
        label: game.i18n.format(`VAGABOND.ContextMenu.${verb}With`, { skill: skillLabel(k) }),
        icon: CONFIG.VAGABOND.weaponSkillIcons?.[k] ?? icon,
        action: () => attack(k),
      })),
    ];
  }

  /**
   * Max Slots of Equipped Weapons for an actor: RAW base plus
   * `system.inventory.weaponSlotsBonus` (Active Effects — e.g. giants).
   * @param {Actor} actor
   * @returns {number}
   */
  static weaponSlotCap(actor) {
    return actor?.system?.inventory?.maxEquippedWeaponSlots
      ?? (CONFIG.VAGABOND?.maxEquippedWeaponSlots || 3);
  }

  /**
   * Add `delta` to an item's quantity, floored at 0. Thrown weapons stop at 0
   * instead of being deleted, so raising it again "retrieves" them.
   * @param {Item} item
   * @param {number} delta
   */
  static async adjustQuantity(item, delta) {
    if (item?.type !== 'equipment') return;
    await item.update({ 'system.quantity': Math.max(0, (item.system.quantity ?? 0) + delta) });
  }

  /**
   * The state an item should enter when equipped. Weapons derive it from
   * `grip` (Zero Grip '0' = 'worn'); non-weapons from `handsRequired` (0 = 'worn').
   * @param {Object} item
   * @returns {'oneHand'|'twoHands'|'worn'}
   */
  static defaultEquipState(item) {
    if (this.isWeapon(item)) return { '2H': 'twoHands', '0': 'worn' }[item.system.grip] ?? 'oneHand';
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

    // RAW: total Slots of Equipped Weapons ≤ maxEquippedWeaponSlots. Only fires
    // when equipping a weapon into a held state. Bump OTHER equipped weapons
    // oldest-first (same `equippedAt` ordering as the hand pool) until the
    // newcomer fits. A weapon whose own cost already exceeds the cap is still
    // allowed (nothing left to bump) with a warning.
    if (need > 0 && this.isWeapon(item)) {
      const cap = this.weaponSlotCap(actor);
      const bumped = new Set(
        updates.filter((u) => u['system.equipmentState'] === 'unequipped').map((u) => u._id)
      );
      // Only weapons held in hands count; zero-Slot weapons cost nothing
      // (and so never bump anything).
      const targetCost = this.itemSlotCost(item);
      const otherWeapons = actor.items.filter(
        (i) =>
          this.isWeapon(i) &&
          i.id !== itemId &&
          this.handsFor(i) > 0 &&
          !bumped.has(i.id)
      );
      let wOver = targetCost > 0
        ? otherWeapons.reduce((n, w) => n + this.itemSlotCost(w), 0) + targetCost - cap
        : 0;

      if (wOver > 0) {
        const oldestFirst = [...otherWeapons].sort(
          (a, b) => (a.getFlag('vagabond', 'equippedAt') || 0) - (b.getFlag('vagabond', 'equippedAt') || 0)
        );
        const wConflicts = [];
        for (const w of oldestFirst) {
          if (wOver <= 0) break;
          wConflicts.push(w);
          wOver -= this.itemSlotCost(w);
        }
        for (const c of wConflicts) {
          updates.push({ _id: c.id, 'system.equipmentState': 'unequipped' });
        }
        if (wConflicts.length) {
          ui.notifications.info(
            `Unequipped ${wConflicts.map((c) => c.name).join(', ')} to make room (weapon Slot limit).`
          );
        }
        if (wOver > 0) {
          ui.notifications.warn(
            `${item.name} occupies ${targetCost} weapon Slots — exceeds the ${cap}-Slot limit.`
          );
        }
      }
    }

    // RAW: only one set of worn Armor — putting one on takes the other off.
    if (newState !== 'unequipped' && this.isArmor(item)) {
      const worn = actor.items.filter((i) => this.isArmor(i) && i.id !== itemId && i.system.equipped);
      for (const a of worn) updates.push({ _id: a.id, 'system.equipmentState': 'unequipped' });
      if (worn.length) {
        ui.notifications.info(`Unequipped ${worn.map((a) => a.name).join(', ')} (only one set of Armor).`);
      }
    }

    updates.push({
      _id: itemId,
      'system.equipmentState': newState,
      // Stamped on every real equip (hands AND 'worn'/Belt) — the hand pool
      // only reads this for hand-occupying holders, but the HUD Belt row
      // also needs it to know which worn item is oldest for its display cap.
      ...(newState !== 'unequipped' ? { 'flags.vagabond.equippedAt': Date.now() } : {}),
      // HUD "lone item in the second hand circle" pick — reset on each fresh equip.
      ...(newState !== 'unequipped' ? { 'flags.vagabond.handPref': 0 } : {}),
    });

    await actor.updateEmbeddedDocuments('Item', updates);
  }

  /**
   * Degrading materials (Gold/Wood): "Armor decreases by 1 after taking damage,
   * breaking at 0." Not wired into the damage flow yet — no-op while
   * CONFIG.VAGABOND.materialDegradation is off.
   * @param {Item} item - armor made of a `degrades` material
   * @param {number} [amount=1]
   */
  static async damageArmor(item, amount = 1) {
    if (!CONFIG.VAGABOND.materialDegradation || !this.isArmor(item) || !item.system.degrades) return;
    if (item.system.finalRating <= 0) return;
    await item.update({ 'system.armorDamage': (item.system.armorDamage ?? 0) + amount });
  }

  /**
   * Restore an item to full condition (clears Rating lost to damage). Entry point
   * for the item-sheet Repair button; downtime/context-menu hooks can reuse it.
   * @param {Item} item
   */
  static async repairItem(item) {
    if (!item || ((item.system.armorDamage ?? 0) === 0 && (item.system.dieDamage ?? 0) === 0)) return;
    await item.update({ 'system.armorDamage': 0, 'system.dieDamage': 0 });
  }

  /**
   * Degrading materials (Gold/Wood): "Damage die is a countdown die" — steps the
   * weapon's damage die down one size (broken once past d4). Not wired into the
   * damage roll yet — no-op while CONFIG.VAGABOND.materialDegradation is off.
   * @param {Item} item - weapon made of a `degrades` material
   */
  static async damageWeaponDie(item) {
    if (!CONFIG.VAGABOND.materialDegradation || !this.isWeapon(item) || !item.system.degrades) return;
    if (item.system.broken) return;
    await item.update({ 'system.dieDamage': (item.system.dieDamage ?? 0) + 1 });
  }

  static #armorSyncTimers = new Map();

  /**
   * Debounced, active-GM-only entry point for syncArmorRestrained. Safe to call
   * from any hook on every client — only the active GM acts.
   * @param {Actor} actor
   */
  static queueArmorRestrainedSync(actor) {
    if (actor?.type !== 'character' || !game.users.activeGM?.isSelf) return;
    const key = actor.uuid;
    clearTimeout(this.#armorSyncTimers.get(key));
    this.#armorSyncTimers.set(key, setTimeout(() => {
      this.#armorSyncTimers.delete(key);
      this.syncArmorRestrained(actor).catch((err) =>
        console.warn('Vagabond | Armor Restrained sync failed:', err));
    }, 150));
  }

  /**
   * RAW: "If your Might is not at least equal to the score shown, you are
   * Restrained by wearing it." Keeps exactly one Restrained effect flagged
   * `flags.vagabond.fromArmor = <armor item id>` while the worn Armor's
   * mightRequirement exceeds Might total (`system.armorMightDeficit`), and
   * removes it otherwise. Only ever touches its own flagged effect, so a
   * grapple or manually-applied Restrained is never affected.
   * @param {Actor} actor
   */
  static async syncArmorRestrained(actor) {
    if (actor?.type !== 'character') return;
    const armor = (actor.system.armorMightDeficit ?? 0) > 0 ? this.getWornArmor(actor) : null;

    const own = actor.effects.filter((e) => e.getFlag('vagabond', 'fromArmor'));
    const keep = armor ? own.find((e) => e.getFlag('vagabond', 'fromArmor') === armor.id) : null;
    const stale = own.filter((e) => e !== keep && actor.effects.get(e.id)).map((e) => e.id);
    if (stale.length) await actor.deleteEmbeddedDocuments('ActiveEffect', stale);
    if (!armor || keep) return;

    const def = CONFIG.statusEffects.find((e) => e.id === 'restrained');
    const label = game.i18n.localize(def?.name ?? 'VAGABOND.StatusConditions.Restrained');
    await actor.createEmbeddedDocuments('ActiveEffect', [{
      name: `${label} (${armor.name})`,
      img: def?.img ?? 'icons/magic/control/debuff-chains-shackles-movement-blue.webp',
      statuses: ['restrained'],
      // v14 tokens only draw non-temporary effects set to ALWAYS
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
      system: { changes: def?.changes ?? [] },
      flags: { vagabond: { fromArmor: armor.id } },
    }]);
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
        // 'worn' (Belt: equipped, not in hands) is legal for any weapon —
        // only held states are corrected to match the grip.
        const grip = it.system.grip;
        if (state !== 'worn') {
          if (grip === '2H') state = 'twoHands';
          else if (grip === '1H') state = 'oneHand';
          else if (grip === '0') state = 'worn'; // Zero Grip: no hands
        }
      } else {
        // Non-weapons follow handsRequired: occupying hands means in hands.
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

    // 3) RAW weapon-Slot cap: Σ Slots of equipped weapons ≤ cap. Independent of
    // the hand pass — bump oldest equipped weapons first until it fits (keeps
    // the newest that fit, matching the hand-pool philosophy).
    const wCap = this.weaponSlotCap(actor);
    const wCost = (it) => this.itemSlotCost(it); // zero-Slot weapons don't count
    const equippedWeapons = equipped.filter(
      (i) =>
        this.isWeapon(i) &&
        (HANDS[effectiveState.get(i.id)] ?? 0) > 0 &&
        !bumpIds.has(i.id)
    );
    let wTotal = equippedWeapons.reduce((n, w) => n + wCost(w), 0);
    const wBump = [];
    if (wTotal > wCap) {
      const oldestFirst = [...equippedWeapons].sort(
        (a, b) => (a.getFlag('vagabond', 'equippedAt') || 0) - (b.getFlag('vagabond', 'equippedAt') || 0)
      );
      for (const w of oldestFirst) {
        if (wTotal <= wCap) break;
        wBump.push(w);
        wTotal -= wCost(w);
      }
    }
    for (const w of wBump) bumpIds.add(w.id);

    const allBumped = [...bump, ...wBump];
    const updates = [
      ...fixUpdates.filter((u) => !bumpIds.has(u._id)),
      ...allBumped.map((w) => ({ _id: w.id, 'system.equipmentState': 'unequipped' })),
    ];

    if (!updates.length) return;

    await actor.updateEmbeddedDocuments('Item', updates);
    if (allBumped.length) {
      ui.notifications.info(
        `Equipment cleanup: unequipped ${allBumped.map((w) => w.name).join(', ')}.`
      );
    }
  }

  // ===========================
  // Inventory Slot Methods
  // ===========================

  /**
   * Non-zero Slot cost of a single item. Zero-Slot items return 0 — they pool
   * separately via {@link pooledZeroSlotCost}.
   * @param {Object} item
   * @returns {number}
   */
  static itemSlotCost(item) {
    return Math.max(0, item?.system?.slots ?? item?.system?.baseSlots ?? 0);
  }

  /**
   * Inventory Slots a whole stack occupies: per-unit cost × quantity (a 2-Slot
   * item ×4 = 8). Zero-Slot items return 0 — see {@link pooledZeroSlotCost}.
   * @param {Object} item
   * @returns {number}
   */
  static itemStackCost(item) {
    return this.itemSlotCost(item) * Math.max(0, item?.system?.quantity ?? 1);
  }

  /**
   * Pooled Slot cost of every zero-Slot item in a list. RAW: each complete group
   * of `zeroSlotStackSize` (10) zero-Slot items occupies 1 Slot — any remainder
   * under 10 is free. floor(Σ quantity / stack) across ALL zero-Slot items
   * combined (0-9 → 0, 10-19 → 1, 20-29 → 2, …).
   * @param {Iterable<Object>} items
   * @returns {number}
   */
  static pooledZeroSlotCost(items) {
    const stack = CONFIG.VAGABOND?.zeroSlotStackSize || 10;
    let qty = 0;
    for (const it of items) {
      if (this.itemSlotCost(it) > 0) continue;
      qty += Math.max(0, it?.system?.quantity ?? 1);
    }
    return Math.floor(qty / stack);
  }

  /**
   * Total occupied inventory Slots for a collection of items: sum of non-zero
   * stack costs (cost × quantity) + the pooled zero-Slot cost. Items nested in a container
   * (`system.containerId` set) are excluded — they count against the container.
   * @param {Iterable<Object>} items
   * @returns {number}
   */
  static occupiedSlotsFor(items) {
    const top = [...items].filter((i) => !i?.system?.containerId);
    let total = 0;
    for (const it of top) total += this.itemStackCost(it);
    return total + this.pooledZeroSlotCost(top);
  }

  /** Item types that live on the inventory grid (`system.gridPosition`). */
  static GRID_ITEM_TYPES = Object.freeze(['equipment', 'container']);

  /**
   * Next free inventory grid position on an actor (one past the highest used).
   * For a batch create, assign `start + i` to each item up front — preCreateItem
   * never sees its siblings in the same batch, so it can't space them out.
   * @param {Actor} actor
   * @returns {number}
   */
  static nextGridPosition(actor) {
    const max = (actor?.items ?? [])
      .filter((i) => this.GRID_ITEM_TYPES.includes(i.type))
      .reduce((m, i) => Math.max(m, i.system.gridPosition ?? 0), -1);
    return max + 1;
  }

  /**
   * Slots consumed by weapons held in hands (oneHand/twoHands). Weapons in
   * Belt ('worn') don't count, and zero-Slot weapons add nothing.
   * Drives the RAW 3-Slot equipped-weapon cap.
   * @param {Actor} actor
   * @returns {number}
   */
  static equippedWeaponSlots(actor) {
    return actor.items
      .filter((i) => this.isWeapon(i) && this.handsFor(i) > 0)
      .reduce((n, w) => n + this.itemSlotCost(w), 0);
  }

  // ===========================
  // Belt Ordering (HUD Belt slots + the sheet's Equipped Belt list share
  // this: reordering in either place writes the same flag, so they always
  // agree — same principle as `equipmentState` driving both displays.)
  // ===========================

  /**
   * Stable-sort items by their manual `flags.vagabond.beltOrder` (ascending).
   * Items without an explicit order keep their relative input order and sort
   * AFTER every item that has one — so a freshly favorited spell or newly
   * worn item just appends to the end until the user drags it into place.
   * @param {Item[]} items
   * @returns {Item[]}
   */
  static sortByBeltOrder(items) {
    return items
      .map((item, i) => ({ item, order: item.getFlag('vagabond', 'beltOrder'), i }))
      .sort((a, b) => {
        if (a.order == null && b.order == null) return a.i - b.i;
        if (a.order == null) return 1;
        if (b.order == null) return -1;
        return a.order - b.order;
      })
      .map((x) => x.item);
  }

  /**
   * Persist a manual Belt order: stamps sequential `flags.vagabond.beltOrder`
   * on every item currently shown, in the given order. Called after a drag
   * reorder in either the HUD Belt row or the sheet's Equipped Belt list.
   * @param {Actor} actor
   * @param {string[]} orderedIds
   */
  static async saveBeltOrder(actor, orderedIds) {
    const updates = orderedIds
      .filter((id) => actor.items.get(id))
      .map((id, i) => ({ _id: id, 'flags.vagabond.beltOrder': i }));
    if (updates.length) await actor.updateEmbeddedDocuments('Item', updates);
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
    const skill = this.attackSkillFor(item);
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
