import { sourceDocId } from './source-id.mjs';

/**
 * Weapon facts the statblock rules need ("Relic weapons weaker than (+2)", "damage from axes").
 * Dependency-free on purpose: the damage pipeline imports it and must not pull in damage-helper / chat-card.
 */

/** Compendium ids of the axes (weapons pack): Battleaxe, Greataxe, Handaxe. */
const AXE_SOURCE_IDS = new Set(['76co3Mfck1ARSH5Z', '7kJxTiu6idu4vrAL', 'cBUd8HGKrJNmXviU']);

/**
 * Bonus of a Relic weapon, or `null` when the item is not a Relic weapon (spells, mundane weapons,
 * alchemical items). A Relic weapon is a full Relic (`equipmentType: 'relic'`) or a weapon with at least
 * one crafted Relic Power; its `(+N)` is the `bonusWeapon` power's rank (full Relics: the numeric
 * `universalWeaponDamageBonus` of their own effects).
 * @param {Item|null} item
 * @returns {number|null}
 */
export function relicWeaponBonus(item) {
  if (item?.type !== 'equipment') return null;
  const sys = item.system ?? {};
  const powers = sys.relic?.powers ?? [];
  if (sys.equipmentType !== 'relic' && !powers.length) return null;
  let bonus = 0;
  for (const p of powers) if (p.family === 'bonusWeapon') bonus = Math.max(bonus, Number(p.rank) || 0);
  if (!bonus) {
    for (const e of item.effects ?? []) {
      for (const c of e.system?.changes ?? []) {
        if (c.key === 'system.universalWeaponDamageBonus' && c.type === 'add') bonus = Math.max(bonus, Number(c.value) || 0);
      }
    }
  }
  return bonus;
}

/**
 * Is this weapon an axe? Matched by compendium source id; only a copy without a source (hand-made)
 * falls back to its name.
 * @param {Item|null} item
 */
export function isAxe(item) {
  if (item?.type !== 'equipment' || item.system?.equipmentType !== 'weapon') return false;
  const source = sourceDocId(item);
  return source ? AXE_SOURCE_IDS.has(source) : /axe$/i.test(item.name ?? '');
}
