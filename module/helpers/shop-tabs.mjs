import { ShopPricing } from './shop-pricing.mjs';

/**
 * Shop tab model shared by the shop sheet (GM) and the store window (ShopApp).
 *
 * Top-level tabs = equipment types (Armor, Weapons, Gear, Alchemical, Relics), plus an
 * optional leading "All Wares" tab (store sidebar). Two tabs split into sub-tabs:
 * - Gear by the item's shop category — the folder it was stocked from
 *   (`flags.vagabond.shop.category`, GM-editable). Containers live in Gear.
 * - Alchemical by `system.alchemicalType` (Acid, Oil, Potion…).
 */
export class ShopTabs {
  /** Top-level tab keys, in display order. */
  static TABS = Object.freeze(['armor', 'weapon', 'gear', 'alchemical', 'relic']);

  /** Key of the "every item" tab. */
  static ALL = 'all';

  /** Sub-tab key for gear without a category. */
  static GENERAL = '__general';

  /** Sidebar icon per tab. */
  static ICONS = Object.freeze({
    all: 'fas fa-store',
    armor: 'fas fa-shield-halved',
    weapon: 'fas fa-sword',
    gear: 'fas fa-toolbox',
    alchemical: 'fas fa-flask',
    relic: 'fas fa-gem',
  });

  /** Top-level tab of a stock item. */
  static tabOf(item) {
    const type = item?.system?.equipmentType;
    return this.TABS.includes(type) ? type : 'gear';
  }

  /** Tabs that split into sub-tabs. */
  static SUB_TABS = Object.freeze(['gear', 'alchemical']);

  /** Sub-tab key of a stock item within its tab (GENERAL when it has none). */
  static subOf(item, tab = this.tabOf(item)) {
    if (tab === 'alchemical') return item?.system?.alchemicalType || this.GENERAL;
    return ShopPricing.itemFlags(item).category || this.GENERAL;
  }

  /** Display label of a sub-tab key. */
  static subLabel(tab, key) {
    if (key === this.GENERAL) return game.i18n.localize('VAGABOND.Shop.Tabs.general');
    if (tab === 'alchemical') {
      const label = CONFIG.VAGABOND.alchemicalTypes?.[key];
      return label ? game.i18n.localize(label) : key;
    }
    return key;
  }

  /**
   * Build the tab bar + the rows of the active tab.
   * @param {Array<{item: Item}>} rows    row models carrying their Item as `item`
   * @param {object} state
   * @param {string|null} [state.tab]     remembered top-level tab
   * @param {string|null} [state.sub]     remembered gear sub-tab
   * @param {boolean} [state.hideEmpty]   drop tabs with no rows (store); the sheet keeps them
   * @param {string|null} [state.fallback] tab used when the remembered one is gone
   * @param {boolean} [state.includeAll]  lead with an "All Wares" tab
   * @returns {{tabs: object[], tab: string|null, subtabs: object[]|null, sub: string|null, rows: object[]}}
   *   Tabs with sub-tabs carry them as `children` (sidebar nesting).
   */
  static build(rows, { tab = null, sub = null, hideEmpty = false, fallback = null, includeAll = false } = {}) {
    const byTab = new Map(this.TABS.map(k => [k, []]));
    for (const row of rows) byTab.get(this.tabOf(row.item)).push(row);

    const keys = this.TABS.filter(k => !hideEmpty || byTab.get(k).length);
    if (includeAll) keys.unshift(this.ALL);
    const active = keys.includes(tab) ? tab : (fallback ?? keys[0] ?? null);

    // Sub-tabs (gear categories, alchemical types): appear as soon as any item has one
    const groups = new Map(this.SUB_TABS.map(k => [k, this.#subGroups(k, byTab.get(k))]));
    const activeGroup = groups.get(active) ?? null;
    const activeSub = activeGroup ? (activeGroup.keys.includes(sub) ? sub : activeGroup.keys[0]) : null;
    const subtabsOf = (k) => {
      const g = groups.get(k);
      return g ? g.keys.map(key => ({
        key,
        label: this.subLabel(k, key),
        count: g.rows.get(key).length,
        active: k === active && key === activeSub,
      })) : null;
    };

    const tabs = keys.map(k => ({
      key: k,
      label: game.i18n.localize(`VAGABOND.Shop.Tabs.${k}`),
      icon: this.ICONS[k],
      count: k === this.ALL ? rows.length : byTab.get(k).length,
      active: k === active,
      children: subtabsOf(k),
    }));

    let activeRows;
    if (active === this.ALL) activeRows = rows;
    else if (activeSub) activeRows = activeGroup.rows.get(activeSub);
    else activeRows = byTab.get(active) ?? [];

    activeRows = [...activeRows].sort((a, b) => ((b.featured ?? 0) - (a.featured ?? 0)) || a.name.localeCompare(b.name));
    return { tabs, tab: active, subtabs: activeGroup ? subtabsOf(active) : null, sub: activeSub, rows: activeRows };
  }

  /**
   * Group a tab's rows by sub-tab key. Null when no row has a key (no sub-tab row);
   * keys sorted by label, GENERAL last.
   */
  static #subGroups(tab, rows) {
    const byKey = new Map();
    for (const row of rows) {
      const key = this.subOf(row.item, tab);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(row);
    }
    if (![...byKey.keys()].some(k => k !== this.GENERAL)) return null;
    const keys = [...byKey.keys()].sort((a, b) =>
      (a === this.GENERAL) - (b === this.GENERAL) || this.subLabel(tab, a).localeCompare(this.subLabel(tab, b)));
    return { keys, rows: byKey };
  }
}
