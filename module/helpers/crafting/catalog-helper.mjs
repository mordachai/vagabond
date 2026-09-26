import { CurrencyHelper } from '../currency-helper.mjs';
import { ShopTabs } from '../shop-tabs.mjs';
import { equipmentStats } from '../equipment-stats.mjs';

/**
 * The Workbench Craft tab's item catalog — picking an item IS picking the recipe.
 * Sources: every craftable equipment item in the compendiums the GM enabled for
 * player content (same `characterBuilderCompendiums` gate as
 * `AlchemyHelper.availableAlchemicals`), plus world items the GM registered as
 * custom recipes by dropping them on the Workbench (`flags.vagabond.craftRecipe`).
 * A flag rather than a uuid list in a setting: deleting the world item removes the
 * recipe with it, nothing can dangle.
 */
export class CraftCatalog {
  static FLAG = 'craftRecipe';

  /**
   * Catalog filter chips, in display order — same categories, order and icons as
   * the Store tabs (`ShopTabs`), so both screens read alike. Containers fall under Gear.
   */
  static CATEGORIES = Object.freeze([ShopTabs.ALL, ...ShopTabs.TABS].map(key => ({
    key,
    icon: ShopTabs.ICONS[key],
    label: key === ShopTabs.ALL ? 'VAGABOND.Craft.Workbench.CategoryAll' : `VAGABOND.EquipmentTypes.${key}`,
  })));

  static INDEX_FIELDS = Object.freeze([
    'type', 'system.equipmentType', 'system.baseCost', 'system.baseSlots',
    'system.craftMaterial.enabled', 'system.relicPower.enabled',
    // Everything `equipmentStats` needs, derived through a temporary Item (material
    // die shift, Adamant armor bonus) — see #statsFromIndex.
    'system.metal', 'system.grip', 'system.damageOneHand', 'system.damageTypeOneHand',
    'system.damageTwoHands', 'system.damageTypeTwoHands', 'system.damageAmount', 'system.damageType',
    'system.armorRating', 'system.armorDamage', 'system.dieDamage',
  ]);

  static categoryOf(equipmentType) {
    return ShopTabs.TABS.includes(equipmentType) ? equipmentType : 'gear';
  }

  /** Whether `item` (world Item document) is a GM-registered custom recipe. */
  static isRecipe(item) {
    return !!item?.flags?.vagabond?.[this.FLAG];
  }

  /**
   * Whether an item with this source data can be Crafted from the catalog: real
   * equipment with a value, and not Materials, a relic Power (those attach to a
   * host via the Relic Forge) or an in-progress Project.
   */
  static isCraftable(type, system, flags) {
    if (type !== 'equipment') return false;
    if (system?.craftMaterial?.enabled || system?.relicPower?.enabled) return false;
    if (flags?.vagabond?.craftProject) return false;
    return CurrencyHelper.toCopper(system?.baseCost) > 0;
  }

  /**
   * Every catalog entry, sorted by name. Compendium entries read the index only
   * (`baseCost`, since the derived `cost` isn't indexed — the detail panel resolves
   * the full document for the exact value).
   * @returns {Promise<Array<{uuid, name, img, cost, category, equipmentType, slots, custom}>>}
   */
  static async entries() {
    let settings;
    try { settings = game.settings.get('vagabond', 'characterBuilderCompendiums'); } catch { settings = { useAll: true, enabled: [] }; }
    const packs = game.packs.filter(p => p.documentName === 'Item'
      && (settings.useAll || settings.enabled.includes(p.collection)));

    const results = [];
    for (const pack of packs) {
      let index;
      try { index = await pack.getIndex({ fields: this.INDEX_FIELDS }); } catch { continue; }
      for (const entry of index) {
        if (!this.isCraftable(entry.type, entry.system, null)) continue;
        results.push(this.#entry(entry.uuid, entry.name, entry.img, entry.system,
          CurrencyHelper.toCopper(entry.system.baseCost), entry.system.baseSlots, false, this.#statsFromIndex(entry)));
      }
    }

    for (const item of game.items ?? []) {
      if (!this.isRecipe(item) || !this.isCraftable(item.type, item.system, null)) continue;
      results.push(this.#entry(item.uuid, item.name, item.img, item.system,
        CurrencyHelper.toCopper(item.system.cost), item.system.slots ?? item.system.baseSlots, true, equipmentStats(item)));
    }

    results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
  }

  /**
   * `equipmentStats` for a compendium index entry. Only weapons, armor and items
   * with damage get a temporary (never saved) Item so the derived `finalDamage*` /
   * `finalRating` are computed exactly as on a real item.
   */
  static #statsFromIndex(entry) {
    const sys = entry.system ?? {};
    const hasDamage = sys.damageAmount && sys.damageType && sys.damageType !== '-';
    if (!['weapon', 'armor'].includes(sys.equipmentType) && !hasDamage) return [];
    try {
      const temp = new Item.implementation({ name: entry.name, type: 'equipment', system: foundry.utils.deepClone(sys) });
      return equipmentStats(temp);
    } catch {
      return [];
    }
  }

  static #entry(uuid, name, img, system, cost, slots, custom, stats = []) {
    const equipmentType = system?.equipmentType ?? 'gear';
    return {
      uuid, name, img, cost, custom, equipmentType, stats,
      category: this.categoryOf(equipmentType),
      slots: Number(slots ?? 1) || 0,
    };
  }

  /**
   * Register a world item as a custom recipe (GM only). Compendium and
   * actor-owned items are refused — compendium items already appear when their
   * pack is enabled, and an owned item is someone's inventory, not a recipe.
   * @returns {Promise<{ok: boolean, reason?: string}>}
   */
  static async register(item) {
    if (!game.user.isGM) return { ok: false, reason: 'permission' };
    if (!item || item.pack || item.parent) return { ok: false, reason: 'recipeWorldOnly' };
    if (!this.isCraftable(item.type, item.system, item.flags)) return { ok: false, reason: 'recipeNotCraftable' };
    if (this.isRecipe(item)) return { ok: true };
    await item.setFlag('vagabond', this.FLAG, true);
    return { ok: true };
  }

  /** Remove a world item from the custom recipes (GM only). */
  static async unregister(item) {
    if (!game.user.isGM || !this.isRecipe(item)) return { ok: false, reason: 'permission' };
    await item.unsetFlag('vagabond', this.FLAG);
    return { ok: true };
  }
}
