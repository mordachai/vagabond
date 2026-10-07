import { EquipmentHelper } from './equipment-helper.mjs';

/**
 * Roll-data slices that let Active Effect formulas express rule conditions
 * (armor weight, combat state) without per-feature code branches.
 * Injected by both `VagabondCharacterData#getRollData` (prepareDerivedData path)
 * and `VagabondActor#getRollData` (everything else).
 */

/**
 * `@armorWorn.slots|rating|might` — values of the worn Armor (see
 * `EquipmentHelper.getWornArmor`); all 0 when no armor is worn, so
 * `@armorWorn.slots <= 1` reads as "Light or no Armor".
 * `slots` = occupied Slots (base + material), `rating` = base armorRating,
 * `might` = mightRequirement.
 * @param {Actor|null} actor
 * @returns {{slots: number, rating: number, might: number}}
 */
export function armorWornRollData(actor) {
  const worn = actor ? EquipmentHelper.getWornArmor(actor) : null;
  return {
    slots: worn?.system?.slots ?? 0,
    rating: worn?.system?.armorRating ?? 0,
    might: worn?.system?.mightRequirement ?? 0
  };
}

/**
 * `@combat.active|round` — never required: with no combat (or a combat that
 * hasn't started, or one the actor isn't part of) `round` is 0, so formulas
 * written as `(@combat.round == 1) ? … : 0` simply give no bonus and the game
 * stays playable by hand.
 * @param {Actor|null} actor
 * `active` is numeric (1/0) so it is safe inside formulas.
 * @returns {{active: number, round: number}}
 */
export function combatRollData(actor) {
  const none = { active: 0, round: 0 };
  if (!actor) return none;
  const combat = game.combats?.active;
  if (!combat?.started) return none;
  // Compare ids, never `c.actor`: for an unlinked token that getter builds a synthetic actor,
  // whose data prep calls this function again → infinite recursion (stack overflow).
  const inCombat = actor.isToken
    ? combat.combatants.some(c => c.tokenId === actor.token?.id)
    : combat.combatants.some(c => c.actorId === actor.id);
  return inCombat ? { active: 1, round: combat.round ?? 0 } : none;
}
