/**
 * Zero-Slot stacking for freshly built item data (Starting Packs, Character Builder
 * gear, Build Guides generator). RAW: 10 zero-Slot items = 1 Slot, so instead of
 * one inventory card per copy we merge copies into stacks of `stackSize` via
 * `system.quantity`. Items costing 1+ Slots are left as separate copies (each
 * occupies its own Slot).
 *
 * Pure data in / data out: no Foundry globals, so scripts/build-guides/generate.mjs
 * can import it under plain Node.
 */

/**
 * Whether item data is a plain zero-Slot item that can share a stack.
 * Weapons, armor, containers, equipped items and multi-use consumables never stack.
 * @param {Object} data - item source data (`toObject()` shape)
 * @returns {boolean}
 */
export function isStackableZeroSlot(data) {
  if (data?.type !== 'equipment') return false;
  const sys = data.system ?? {};
  if (['weapon', 'armor'].includes(sys.equipmentType)) return false;
  if ((sys.baseSlots ?? 1) > 0) return false;
  if (sys.metal && sys.metal !== 'none') return false;
  if ((sys.uses?.max ?? 0) > 0) return false;
  if (sys.containerId) return false;
  const state = sys.equipmentState ?? 'unequipped';
  return state === 'unequipped';
}

/**
 * Put on (equipmentState 'worn') the first Backpack-style item in a new-item list:
 * equipment that takes no Slot while worn (`system.noSlotsWhenWorn`). Only one is
 * ever worn (RAW: one Backpack benefit at a time); an already-worn one wins.
 * @param {Object[]} items - item source data list (mutated)
 * @returns {boolean} true if the list now contains a worn backpack
 */
export function wearFirstBackpack(items) {
  const packs = items.filter((d) => d?.type === 'equipment' && d.system?.noSlotsWhenWorn);
  if (packs.some((d) => d.system.equipmentState === 'worn')) return true;
  const first = packs.find((d) => (d.system.equipmentState ?? 'unequipped') === 'unequipped');
  if (!first) return false;
  first.system.equipmentState = 'worn';
  first.system.equipped = true;
  return true;
}

/**
 * Merge copies of the same zero-Slot item into stacks of at most `stackSize`.
 * Order is preserved (a stack sits where its first copy was); existing
 * `system.quantity` values are summed, so already-stacked input is re-chunked.
 * @param {Object[]} items - item source data list
 * @param {number} [stackSize=10]
 * @returns {Object[]} new list; merged entries are the first copy's data with `system.quantity` set
 */
export function stackZeroSlotItems(items, stackSize = 10) {
  const out = [];
  const open = new Map(); // key -> stack still below stackSize
  for (const data of items) {
    if (!isStackableZeroSlot(data)) { out.push(data); continue; }
    let remaining = Math.max(1, data.system.quantity ?? 1);
    const key = `${data.type}|${data.name}|${data.img}`;
    while (remaining > 0) {
      let stack = open.get(key);
      if (!stack) {
        // First copy of this item (or previous stack full): this entry becomes the stack.
        stack = out.includes(data) ? { ...data, system: { ...data.system } } : data;
        stack.system.quantity = 0;
        open.set(key, stack);
        out.push(stack);
      }
      const add = Math.min(remaining, stackSize - stack.system.quantity);
      stack.system.quantity += add;
      remaining -= add;
      if (stack.system.quantity >= stackSize) open.delete(key);
    }
  }
  return out;
}
