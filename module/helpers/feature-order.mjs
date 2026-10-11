import { setupDragReorder } from './drag-reorder.mjs';

/**
 * Player-chosen order of the Ancestry Traits / Class Features / Perks lists, shared by the
 * character sheet (Features tab) and the character HUD (Traits panel).
 *
 * Stored per actor in `flags.vagabond.featureOrder = { traits: [rowId], features: [rowId], perks: [rowId] }`.
 * Row ids are the ones both views already build: `${itemId}-trait-${index}`, `${itemId}-feature-${firstIndex}`
 * (stable across level-ups) and the perk item id. Rows missing from the stored order (a new Perk, a feature
 * gained on level-up) keep their natural order after the sorted ones.
 *
 * Markup contract for `wire()`: a list element `[data-sort-list="<kind>"]` whose direct children
 * `[data-sort-id]` are the rows.
 */
const FLAG = 'featureOrder';

export class FeatureOrder {
  /**
   * @param {Actor} actor
   * @param {'traits'|'features'|'perks'} kind
   * @param {Array<Object>} rows
   * @returns {Array<Object>} rows in the player's order (new array; input untouched)
   */
  static sort(actor, kind, rows) {
    const order = actor?.getFlag?.('vagabond', FLAG)?.[kind];
    if (!Array.isArray(order) || !order.length || !rows?.length) return rows ?? [];
    const pos = new Map(order.map((id, i) => [id, i]));
    return rows
      .map((row, i) => ({ row, key: pos.get(row._id ?? row.id) ?? order.length + i }))
      .sort((a, b) => a.key - b.key)
      .map(e => e.row);
  }

  /**
   * Drag-to-reorder on every `[data-sort-list]` inside `root` (owners only). Rows reflow live while
   * dragging; the new order is saved on drop.
   * @param {HTMLElement} root
   * @param {Actor} actor
   * @param {AbortSignal} signal
   */
  static wire(root, actor, signal) {
    if (!root || !actor?.isOwner) return;
    for (const list of root.querySelectorAll('[data-sort-list]')) {
      const kind = list.dataset.sortList;
      const rows = list.querySelectorAll(':scope > [data-sort-id]');
      if (rows.length < 2) continue;
      const rendered = [...rows].map(el => el.dataset.sortId).join('|');
      const reorder = setupDragReorder({
        container: list,
        itemSelector: ':scope > [data-sort-id]',
        idAttr: 'sortId',
        signal,
        onDrop: async (ids) => {
          if (ids.join('|') === rendered) return;
          await actor.update({ [`flags.vagabond.${FLAG}.${kind}`]: ids });
        },
      });
      rows.forEach(el => reorder.bindItem(el));
    }
  }
}
