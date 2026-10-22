import { CurrencyHelper } from './currency-helper.mjs';

/**
 * Crafting Materials as an ingredient pool. An actor holds ONE `craftMaterial`
 * equipment item (bundle) per material key (see `module/data/base-equipment.mjs`);
 * this is the single choke point for spending from and adding to it. See
 * docs/crafting-plan.md §4.4.
 *
 * A bundle holds any amount. Generic Materials (`key === ''`) weigh 1 Slot per 1g
 * held (price list "Materials 1g / 1 Slot", derived in `VagabondEquipment`; the
 * inventory card stops widening at 2). A specific Material (`key !== ''`, e.g.
 * "dragon scale") weighs its own Slots.
 */
export class MaterialsHelper {
  /** Copper worth of generic Materials per Slot (1g). */
  static SLOT_VALUE = CurrencyHelper.RATES.gold;

  /** Per-actor debounced {@link consolidate}, keyed by actor uuid. */
  static #pending = new Map();

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
    return this.itemsOf(actor, key).reduce((sum, i) => sum + this.#worth(i), 0);
  }

  /** "need 5s, have 3s" text for a failed Materials check. */
  static shortfallDetail(actor, needed) {
    return game.i18n.format('VAGABOND.Craft.Errors.needHave', {
      need: CurrencyHelper.format(needed),
      have: CurrencyHelper.format(this.totalValue(actor)),
    });
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
    await this.consolidate(actor, key);
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
   * Add `copper` worth of Materials to `actor`'s pool: everything lands on the one
   * bundle of that key (created if missing). Leftover extra bundles are merged first.
   * @returns {Promise<void>}
   */
  static async grant(actor, copper, { key = '' } = {}) {
    const amount = Math.max(0, Math.floor(Number(copper) || 0));
    if (amount <= 0) return;
    await this.consolidate(actor, key);
    const bundle = this.itemsOf(actor, key)[0];
    if (bundle) {
      await this.#setValue(actor, bundle, bundle.system.craftMaterial.value + amount);
    } else {
      await actor.createEmbeddedDocuments('Item', [this.#buildItemData(amount, key)]);
    }
  }

  /** Worth of one bundle: its value per unit × quantity (a bought stack of 3 bundles = 3×). */
  static #worth(item) {
    return (item.system.craftMaterial.value ?? 0) * Math.max(1, item.system.quantity ?? 1);
  }

  static #setValue(actor, item, value) {
    return actor.updateEmbeddedDocuments('Item', [{
      _id: item.id, 'system.quantity': 1,
      'system.craftMaterial.value': value, 'system.baseCost': CurrencyHelper.fromCopper(value),
    }]);
  }

  /**
   * Merge every Materials bundle of `key` on `actor` into one (the oldest-sorted
   * first one keeps its id and grid spot). Stacks (quantity > 1) fold into the value.
   * Keys `null` = every key present. No-op when already one bundle of quantity 1.
   * @returns {Promise<void>}
   */
  static async consolidate(actor, key = null) {
    if (!actor?.isOwner) return;
    const keys = key === null
      ? [...new Set(actor.items.filter(i => i.type === 'equipment' && i.system.craftMaterial?.enabled)
        .map(i => i.system.craftMaterial.key ?? ''))]
      : [key];
    for (const k of keys) {
      const items = this.itemsOf(actor, k);
      if (!items.length) continue;
      const [keep, ...rest] = [...items].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
      if (!rest.length && Math.max(1, keep.system.quantity ?? 1) === 1) continue;
      const total = items.reduce((sum, i) => sum + this.#worth(i), 0);
      await this.#setValue(actor, keep, total);
      if (rest.length) await actor.deleteEmbeddedDocuments('Item', rest.map(i => i.id));
    }
  }

  /**
   * Debounced {@link consolidate} for a bundle that just arrived any other way
   * (bought, traded, dropped from a compendium) — runs once the current batch settles.
   */
  static queueConsolidate(actor) {
    if (!actor?.uuid) return;
    clearTimeout(this.#pending.get(actor.uuid));
    this.#pending.set(actor.uuid, setTimeout(() => {
      this.#pending.delete(actor.uuid);
      this.consolidate(actor).catch(err => console.error('Vagabond | Materials merge failed', err));
    }, 250));
  }

  /**
   * Slots one generic Materials bundle weighs (1 per 1g, min 1), or null when its
   * own `baseSlots` apply (a specific Material).
   * @param {object} system  the bundle's equipment system data
   * @returns {number|null}
   */
  static bundleSlots(system) {
    const cm = system?.craftMaterial;
    if (!cm?.enabled || (cm.key ?? '') !== '') return null;
    return Math.max(1, Math.ceil((cm.value ?? 0) / this.SLOT_VALUE));
  }

  static #buildItemData(value, key) {
    return {
      name: key ? `Materials (${key})` : game.i18n.localize('VAGABOND.Craft.Workbench.Materials'),
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
