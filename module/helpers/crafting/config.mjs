/**
 * Factory defaults for the `craftingConfig` hidden world setting, and the merge
 * helper that reads it. Split out of `crafting-helper.mjs` so mode files under
 * `module/helpers/crafting/` can read config (tools requirement, etc.) without
 * importing `CraftingHelper` itself and creating an import cycle (`crafting-helper.mjs`
 * imports every mode file to populate `CONFIG.VAGABOND.craftModes`). One object, one
 * settings menu (`CraftingSettingsApp`) — see docs/crafting-plan.md §2 D15.
 * `valuePerShift` keys are `"<max>-<min>"` (or a bare difficulty for a single-value
 * band) matching the RAW table in docs/crafting-plan.md §1; values are copper.
 */
export const CRAFTING_DEFAULTS = Object.freeze({
  general: {
    enabled: true,
    approval: 'off', // 'off' | 'chat'
    materialsFromCoin: false,
    toolsRequirement: 'block', // 'off' | 'warn' | 'block'
    valuePerShift: {
      '18-17': 10,
      '16-15': 200,
      '14-13': 500,
      '12-11': 2500,
      '10-9': 5000,
      '8-7': 7500,
      '6': 10000,
    },
  },
  alchemy: {
    mixInertBehavior: 'delete', // 'delete' | 'keep'
    mixExpiryOutOfCombat: 'never', // 'never' | 'nextAction'
  },
  relics: {
    bondSuppression: true,
    combineEnabled: false,
  },
  variant: {
    manaCrystals: false,
    crystalSlotTable: {
      armor: { 0: 2, 1: 4, 2: 6, 3: 8 },
      weapon1H: { 0: 1, 1: 2, 2: 3, 3: 4 },
      weapon2H: { 0: 2, 1: 4, 2: 6, 3: 8 },
    },
  },
});

/** Merged `craftingConfig` world setting over {@link CRAFTING_DEFAULTS}. */
export function craftingConfig() {
  let stored = {};
  try { stored = game.settings.get('vagabond', 'craftingConfig') ?? {}; } catch { stored = {}; }
  return foundry.utils.mergeObject(foundry.utils.deepClone(CRAFTING_DEFAULTS), stored, { inplace: false });
}
