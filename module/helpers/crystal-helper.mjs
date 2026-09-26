import { craftingConfig } from './crafting/config.mjs';
import { RelicHelper } from './relic-helper.mjs';

/**
 * Mana Crystal sockets — the "From the Archive" variant, adapted (not copied) per
 * docs/crafting-plan.md §4.12, D10: infrastructure built now, gameplay-per-type
 * adaptations deferred (see this file's own doc comment on `socket`). Off by
 * default (`craftingConfig().variant.manaCrystals`).
 *
 * Only the socket MECHANICS are built this pass: slot counting, socket/unsocket
 * (a crystal is consumed into the host's `relic.sockets[]` as item-data, exactly
 * like a relic power snapshot, and re-created as a standalone item on unsocket),
 * and End Quest growth rolls. The six crystal TYPES' actual gameplay hookups
 * (Perk grants a perk, Spell casts via Remote delivery, Elemental reduces damage /
 * imbues, Delivery extends a linked Spell crystal, Summon) each need integration
 * into a different existing subsystem (perks, spellcasting, imbue-helper) and are
 * explicitly deferred — `system.crystal.type`/`payloadUuid` are stored but nothing
 * reads them yet outside this file. Summon is deferred in the plan itself too.
 */
export class CrystalHelper {
  /** Slot-table bucket for `hostItem` ('armor' | 'weapon1H' | 'weapon2H'), or null if it can't take sockets. */
  static hostKind(hostItem) {
    if (hostItem.system.equipmentType === 'armor') return 'armor';
    if (hostItem.system.equipmentType === 'weapon') return hostItem.system.grip === '2H' ? 'weapon2H' : 'weapon1H';
    return null;
  }

  /**
   * Highest `bonus*` family rank among the host's relic powers (RAW: "doesn't
   * raise the equipment's Bonus for slot purposes" refers to crystal-GRANTED
   * powers specifically — none exist yet since the Power crystal type isn't
   * wired, so every power counted here is Forge-crafted).
   */
  static bonusRank(hostItem) {
    return (hostItem.system.relic.powers ?? [])
      .filter(p => p.family?.startsWith('bonus'))
      .reduce((max, p) => Math.max(max, p.rank || 0), 0);
  }

  /** Total crystal slots `hostItem` has, from the configured slot table. */
  static slotCount(hostItem) {
    const kind = this.hostKind(hostItem);
    if (!kind) return 0;
    const table = craftingConfig().variant.crystalSlotTable;
    return table?.[kind]?.[this.bonusRank(hostItem)] ?? 0;
  }

  /** `relic.sockets[]` padded/trimmed to the current `slotCount` (never persisted here — read-only view). */
  static socketsView(hostItem) {
    const count = this.slotCount(hostItem);
    const existing = hostItem.system.relic.sockets ?? [];
    return Array.from({ length: count }, (_, index) => existing.find(s => s.index === index) ?? { index, crystal: null });
  }

  /**
   * Socket `crystalItem` into `hostItem` at `slotIndex` — consumes the crystal
   * item (deleted from the actor, stored as data in the socket) and re-syncs.
   * @returns {Promise<{ok: boolean, reason?: string}>}
   */
  static async socket(hostItem, crystalItem, slotIndex) {
    if (!craftingConfig().variant.manaCrystals) return { ok: false, reason: 'manaCrystalsDisabled' };
    const slots = this.socketsView(hostItem);
    const slot = slots[slotIndex];
    if (!slot) return { ok: false, reason: 'noSocketSlot' };
    if (slot.crystal) return { ok: false, reason: 'socketOccupied' };
    if (!crystalItem?.system?.crystal?.type) return { ok: false, reason: 'notACrystal' };

    const data = crystalItem.toObject();
    delete data._id;
    slots[slotIndex] = { index: slotIndex, crystal: data };
    await hostItem.update({ 'system.relic.sockets': slots });
    if (crystalItem.parent === hostItem.parent) await crystalItem.delete();
    await RelicHelper.syncHostEffects(hostItem);
    return { ok: true };
  }

  /**
   * Unsocket the crystal in `slotIndex` — re-creates it as a standalone item on
   * `hostItem`'s actor (carrying its current, possibly-grown `bonus`) and clears
   * the slot.
   * @returns {Promise<{ok: boolean, reason?: string, created?: Item}>}
   */
  static async unsocket(hostItem, slotIndex) {
    const slots = this.socketsView(hostItem);
    const slot = slots[slotIndex];
    if (!slot?.crystal) return { ok: false, reason: 'socketEmpty' };
    const actor = hostItem.actor;
    if (!actor) return { ok: false, reason: 'noActor' };

    const data = foundry.utils.deepClone(slot.crystal);
    delete data._id;
    const [created] = await actor.createEmbeddedDocuments('Item', [data]);

    slots[slotIndex] = { index: slotIndex, crystal: null };
    await hostItem.update({ 'system.relic.sockets': slots });
    await RelicHelper.syncHostEffects(hostItem);
    return { ok: true, created };
  }

  /**
   * End Quest growth (GM action): d4 per socketed crystal flagged
   * `usedThisQuest`; ≤ its `bonus` grows it by 1; at +3, a new +0 copy of the
   * same crystal is created standalone on the host's actor. Resets every
   * `usedThisQuest` flag on `actor`'s equipment afterward.
   * @param {Actor} actor
   * @returns {Promise<Array<{hostName: string, crystalName: string, roll: number, grew: boolean, spawned: boolean}>>}
   */
  static async endQuest(actor) {
    const results = [];
    for (const hostItem of actor.items.filter(i => i.type === 'equipment')) {
      const slots = hostItem.system.relic?.sockets ?? [];
      let changed = false;
      const newSlots = foundry.utils.deepClone(slots);
      for (const slot of newSlots) {
        const crystal = slot.crystal;
        if (!crystal?.flags?.vagabond) continue;
        if (!foundry.utils.getProperty(crystal, 'system.crystal.usedThisQuest')) continue;

        const roll = await (new Roll('1d4')).evaluate();
        const bonus = crystal.system.crystal.bonus ?? 0;
        const grew = roll.total <= bonus;
        let spawned = false;
        if (grew) {
          const newBonus = bonus + 1;
          foundry.utils.setProperty(crystal, 'system.crystal.bonus', newBonus);
          if (newBonus > 3) {
            foundry.utils.setProperty(crystal, 'system.crystal.bonus', 3);
            const spawn = foundry.utils.deepClone(crystal);
            delete spawn._id;
            foundry.utils.setProperty(spawn, 'system.crystal.bonus', 0);
            foundry.utils.setProperty(spawn, 'system.crystal.usedThisQuest', false);
            await actor.createEmbeddedDocuments('Item', [spawn]);
            spawned = true;
          }
        }
        foundry.utils.setProperty(crystal, 'system.crystal.usedThisQuest', false);
        changed = true;
        results.push({ hostName: hostItem.name, crystalName: crystal.name, roll: roll.total, grew, spawned });
      }
      if (changed) {
        await hostItem.update({ 'system.relic.sockets': newSlots });
        await RelicHelper.syncHostEffects(hostItem);
      }
    }
    return results;
  }
}
