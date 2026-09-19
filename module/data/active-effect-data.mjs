/**
 * TypeDataModel for the `base` ActiveEffect type.
 *
 * Extends Foundry's ActiveEffectTypeDataModel (which owns `system.changes`) and supplies
 * `isSuppressed`, the v14 hook Foundry consults (`ActiveEffect#isSuppressed` →
 * `system.isSuppressed ?? duration.expired`) to decide whether an effect applies.
 *
 * Vagabond's `flags.vagabond.applicationMode`:
 *  - `permanent`     always applies
 *  - `when-equipped` applies only while the parent item is equipped (any hand state or 'worn')
 *  - `on-use`        never applies passively — applied manually per roll (Actor#getRollDataWithItemEffects)
 *
 * Returning `undefined` (not `false`) when nothing suppresses lets Foundry fall back to its
 * own expiry check, so expired temporary effects are still suppressed.
 */
export default class VagabondActiveEffectData extends foundry.data.ActiveEffectTypeDataModel {

  /**
   * Why this effect is suppressed by Vagabond logic, or null when it is not.
   * Used by the sheet to render a badge; `isSuppressed` derives from it.
   * @returns {'onUse'|'unequipped'|null}
   */
  get suppressionReason() {
    const effect = this.parent;
    const mode = effect?.flags?.vagabond?.applicationMode ?? 'permanent';

    if (mode === 'on-use') return 'onUse';

    if (mode === 'when-equipped') {
      const item = effect.parent;
      // Effects directly on an Actor have no equip state to check
      if (item?.documentName !== 'Item') return null;
      // system.equipped is a derived mirror of equipmentState (equipment only).
      // Items without the field (perks, classes…) are treated as always-on.
      const equipped = item.system?.equipped;
      if (equipped === undefined || equipped === null) return null;
      return equipped === true ? null : 'unequipped';
    }

    return null;
  }

  /** @override */
  get isSuppressed() {
    return this.suppressionReason ? true : undefined;
  }
}
