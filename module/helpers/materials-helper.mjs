import { CurrencyHelper } from './currency-helper.mjs';

/**
 * Crafting Materials as an ingredient pool. An actor can hold several `craftMaterial`
 * equipment items (see `module/data/base-equipment.mjs`); this is the single choke
 * point for spending from and adding to that pool. See docs/crafting-plan.md §4.4.
 *
 * Generic Materials (`key === ''`) are capped at {@link MaterialsHelper.CAP} copper
 * (1g) per item — 1 Slot = 1g worth, matching the price list row ("Materials 1g / 1
 * Slot"). A specific Material (`key !== ''`, e.g. "dragon scale") is uncapped: one
 * item can hold any amount.
 */
export class MaterialsHelper {
  /** Copper cap for one generic Materials item (1g). Specific materials are uncapped. */
  static CAP = 1000;

  /**
   * Matching `craftMaterial`-enabled equipment items on `actor`, cheapest first.
   * @param {Actor} actor
   * @param {string} [key]  '' = generic Materials
   */
  static itemsOf(actor, key = '') {
    return (actor?.items ?? [])
      .filter(i => i.type === 'equipment' && i.system.craftMaterial?.enabled && (i.system.craftMaterial.key ?? '') === key)
      .sort((a, b) => a.system.craftMaterial.value - b.system.craftMaterial.value);
  }

  /** Total copper held across all of an actor's matching Materials items. */
  static totalValue(actor, key = '') {
    return this.itemsOf(actor, key).reduce((sum, i) => sum + i.system.craftMaterial.value, 0);
  }

  /**
   * Pure planner: spend `copper` from a cheapest-first list of `{id, value}`.
   * @returns {{ok: boolean, updates: Array<{id: string, value: number}>, deletes: string[]}}
   */
  static planSpend(items, copper) {
    let remaining = Math.max(0, Math.floor(Number(copper) || 0));
    const total = items.reduce((sum, i) => sum + i.value, 0);
    if (remaining > total) return { ok: false, updates: [], deletes: [] };

    const updates = [];
    const deletes = [];
    for (const item of items) {
      if (remaining <= 0) break;
      const draw = Math.min(item.value, remaining);
      remaining -= draw;
      const newValue = item.value - draw;
      if (newValue <= 0) deletes.push(item.id);
      else updates.push({ id: item.id, value: newValue });
    }
    return { ok: true, updates, deletes };
  }

  /**
   * Spend `copper` of Materials from `actor`'s pool (cheapest bundle first), batched
   * into one update + one delete call. Never touches items below `copper` short.
   * @returns {Promise<{ok: boolean, reason?: string}>}
   */
  static async spend(actor, copper, { key = '' } = {}) {
    const items = this.itemsOf(actor, key).map(i => ({ id: i.id, value: i.system.craftMaterial.value }));
    const plan = this.planSpend(items, copper);
    if (!plan.ok) return { ok: false, reason: 'materials' };

    if (plan.updates.length) {
      await actor.updateEmbeddedDocuments('Item', plan.updates.map(u => ({
        _id: u.id, 'system.craftMaterial.value': u.value, 'system.baseCost': CurrencyHelper.fromCopper(u.value),
      })));
    }
    if (plan.deletes.length) await actor.deleteEmbeddedDocuments('Item', plan.deletes);
    return { ok: true };
  }

  /**
   * Pure planner: distribute `copper` onto a cheapest-first list of existing partial
   * items (topped up to `cap`) plus however many new items are needed — full `cap`
   * chunks, then one remainder item. `cap = null` (specific materials) never splits:
   * everything lands on the first existing item, or one new item.
   * @returns {{updates: Array<{id: string, value: number}>, creates: number[]}} `creates` = new item values
   */
  static planGrant(items, copper, cap) {
    let remaining = Math.max(0, Math.floor(Number(copper) || 0));
    const updates = [];
    const creates = [];
    if (remaining <= 0) return { updates, creates };

    if (cap === null) {
      if (items.length) {
        updates.push({ id: items[0].id, value: items[0].value + remaining });
      } else {
        creates.push(remaining);
      }
      return { updates, creates };
    }

    for (const item of items) {
      if (remaining <= 0) break;
      const room = cap - item.value;
      if (room <= 0) continue;
      const add = Math.min(room, remaining);
      remaining -= add;
      updates.push({ id: item.id, value: item.value + add });
    }
    while (remaining > 0) {
      const chunk = Math.min(cap, remaining);
      creates.push(chunk);
      remaining -= chunk;
    }
    return { updates, creates };
  }

  /**
   * Add `copper` worth of Materials to `actor`'s pool: tops up existing partial
   * items first, then creates new items — capped at 1g/item for generic Materials,
   * a single uncapped item for a specific Material.
   * @returns {Promise<void>}
   */
  static async grant(actor, copper, { key = '' } = {}) {
    const existing = this.itemsOf(actor, key).map(i => ({ id: i.id, value: i.system.craftMaterial.value }));
    const cap = key === '' ? this.CAP : null;
    const plan = this.planGrant(existing, copper, cap);

    if (plan.updates.length) {
      await actor.updateEmbeddedDocuments('Item', plan.updates.map(u => ({
        _id: u.id, 'system.craftMaterial.value': u.value, 'system.baseCost': CurrencyHelper.fromCopper(u.value),
      })));
    }
    if (plan.creates.length) {
      await actor.createEmbeddedDocuments('Item', plan.creates.map(value => this.#buildItemData(value, key)));
    }
  }

  static #buildItemData(value, key) {
    return {
      name: key ? `Materials (${key})` : 'Materials',
      type: 'equipment',
      img: 'icons/commodities/materials/powder-red-green-yellow.webp',
      system: {
        equipmentType: 'gear',
        quantity: 1,
        baseCost: CurrencyHelper.fromCopper(value),
        baseSlots: 1,
        gearCategory: key ? '' : 'Alchemy & Medicine',
        craftMaterial: { enabled: true, key, value },
      },
    };
  }
}
