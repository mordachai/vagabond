import { relicWeaponBonus } from './weapon-rules.mjs';

/**
 * Statblock rules the book prints as ability text, automated from NPC fields (`actor-npc.mjs`):
 *
 * - `relicImmunityMin`   — "Physical from non-Relics [and Relic Weapons weaker than (+2)]": a Relic weapon
 *                          with a big enough (+N) ignores the physical Immunity. (`relicBypassesImmunity`)
 * - `hpFloor`            — Zombie / Grace: can't be reduced below 1 HP. (`applyHpFloor`, `vagabond.calculateFinalDamage` hook)
 * - `sunlightHarm`       — Nightwalker / Sunlight Hypersensitivity: Burning (d8) at the start of its Turn and
 *                          Incapacitated while it has the Sunlight status. (`NpcTurnRules`)
 * - `regenPerTurn`       — Vampiric / Regenerate: HP regained at the start of its Turn, optionally not in Sunlight.
 *
 * Sunlight is the manual `sunlit` status (token HUD): nothing here guesses lighting. Pure lookups, imported by
 * damage-helper and status-helper: the effects that post cards / apply statuses live in `npc-turn-rules.mjs`.
 */
export class NpcRules {
  /** One-line localized summaries of the active rules (locked sheet view). */
  static describe(actor) {
    const sy = actor?.system ?? {};
    const L = (k, d) => game.i18n.format(`VAGABOND.Actor.NPC.Rules.${k}`, d);
    const out = [];
    // relicImmunityMin is shown as an inline badge in the Immunities row (`relicBadge`), not a text line
    if (sy.hpFloor && sy.hpFloor !== 'none') out.push(`${L('HpFloor')}: ${L(sy.hpFloor === 'zombie' ? 'HpFloorZombie' : 'HpFloorAlways')}`);
    if (sy.sunlightHarm && sy.sunlightHarm !== 'none') {
      out.push(`${L('SunlightHarm')}: ${L(sy.sunlightHarm === 'burn' ? 'SunlightHarmBurn' : 'SunlightHarmBurnIncapacitated')}`);
    }
    if (sy.regenPerTurn) out.push(`${L('RegenPerTurn')}: ${sy.regenPerTurn}${sy.regenStopsInSunlight ? ` (${L('RegenStopsInSunlight')})` : ''}`);
    return out;
  }

  /**
   * Inline Immunities-row badge for `relicImmunityMin`: short label + full rule as tooltip. Null when unset.
   * @returns {{label: string, tooltip: string, icon: string}|null}
   */
  static relicBadge(actor) {
    const min = actor?.system?.relicImmunityMin;
    if (min === null || min === undefined) return null;
    const L = (k, d) => game.i18n.format(`VAGABOND.Actor.NPC.Rules.${k}`, d);
    const name = (k) => game.i18n.localize(CONFIG.VAGABOND.damageTypes?.[k] ?? k);
    const keys = this.relicTypes(actor);
    // Physical is the umbrella: spell out its three forms in the tooltip
    const tipTypes = keys.map((k) => (k === 'physical'
      ? `${name(k)} (${CONFIG.VAGABOND.nonRelicImmuneTypes.filter((t) => t !== 'physical').map(name).join(', ')})`
      : name(k))).join(', ');
    const types = keys.map(name).join(', ');
    return {
      label: min > 0 ? L('RelicBadgeMin', { types, n: min }) : L('RelicBadgeAny', { types }),
      tooltip: min > 0 ? L('RelicTipMin', { types: tipTypes, n: min }) : L('RelicTipAny', { types: tipTypes }),
      iconClass: 'fa-solid fa-khanda' // Font Awesome, like the other damage-type immunities (sheet + HUD)
    };
  }

  /**
   * The actor's damage Immunities with the one `relicImmunityMin` implies: a Relic-exception NPC is Immune to
   * Physical (from non-Relics) without listing it — the badge IS that Immunity. An explicit physical-family
   * entry (Giant Slug: Blunt) is kept as written and nothing is added.
   * @returns {string[]}
   */
  static immunitiesOf(actor) {
    const list = actor?.system?.immunities ?? [];
    const min = actor?.system?.relicImmunityMin;
    if (min === null || min === undefined) return list;
    const family = CONFIG.VAGABOND.nonRelicImmuneTypes ?? [];
    return list.some((t) => family.includes(t)) ? list : [...list, 'physical'];
  }

  /**
   * Damage types the Relic exception covers: the physical-family Immunities listed on the actor (Giant Slug:
   * Blunt), else the Physical umbrella. Empty when the actor has no Relic exception.
   * @returns {string[]}
   */
  static relicTypes(actor) {
    const min = actor?.system?.relicImmunityMin;
    if (min === null || min === undefined) return [];
    const family = CONFIG.VAGABOND.nonRelicImmuneTypes ?? [];
    const listed = (actor.system.immunities ?? []).filter((t) => family.includes(t));
    return listed.length ? listed : ['physical'];
  }

  /** Immunities for the locked sheet / HUD: the badge already names the physical-family ones it covers. */
  static shownImmunities(actor) {
    const list = actor?.system?.immunities ?? [];
    const covered = this.relicTypes(actor);
    return covered.length ? list.filter((t) => !covered.includes(t)) : list;
  }

  /** Is the actor standing in Sunlight (the `sunlit` status)? */
  static isSunlit(actor) {
    return !!actor?.statuses?.has('sunlit');
  }

  /**
   * Does `weapon` ignore this actor's physical Immunity because it is a strong enough Relic?
   * @param {Actor} actor - the defender
   * @param {string} damageType - normalized (lowercase) incoming type
   * @param {Item|null} weapon
   */
  static relicBypassesImmunity(actor, damageType, weapon) {
    const min = actor?.system?.relicImmunityMin;
    if (min === null || min === undefined) return false;
    if (!CONFIG.VAGABOND.nonRelicImmuneTypes?.includes(damageType)) return false;
    const bonus = relicWeaponBonus(weapon);
    return bonus !== null && bonus >= min;
  }

  /**
   * `vagabond.calculateFinalDamage` listener: cap the damage so the defender stays at 1 HP.
   * 'zombie' lets a Crit, damage it is Weak to, or Sunlight through; 'always' never does.
   */
  static applyHpFloor({ actor, result, isCrit }) {
    const floor = actor?.system?.hpFloor;
    if (actor?.type !== 'npc' || !floor || floor === 'none' || !(result?.final > 0)) return;
    if (floor === 'zombie' && (isCrit || result.path === 'weak' || result.path === 'material' || this.isSunlit(actor))) return;
    const allowed = Math.max(0, (actor.system.health?.value ?? 0) - 1);
    if (result.final > allowed) {
      result.floorReduction = result.final - allowed;
      result.final = allowed;
    }
  }
}
