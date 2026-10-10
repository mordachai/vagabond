import { VagabondChatCard } from './chat-card.mjs';
import { VagabondRollBuilder } from './roll-builder.mjs';
import { MaterialsHelper } from './materials-helper.mjs';
import { CurrencyHelper } from './currency-helper.mjs';

/** Gear-pack Ration (Alpha 3) — created when an actor gains Rations and holds none. */
const RATION_ID = 'BhUNyj2nflyVUPIo';

/** Max Shifts one downtime can be planned for (a week of Days, 4 Shifts each). */
const MAX_SHIFTS = 28;

/** Shifts in one Day — one 4-segment clock per Day in the panel. */
export const SHIFTS_PER_DAY = 4;

/**
 * Downtime state and rules (book "Downtime", Alpha 3).
 *
 * State lives on the actor flag `flags.vagabond.downtime`:
 *   { shifts: number planned, log: [{ key }] one entry per Shift spent, breatherAt: log length when the last Breather was taken }
 * The panel (DowntimeApp) is only a view over it; the Workbench spends a Shift through
 * {@link DowntimeHelper.spendShift} too. Nothing is forced: the planned Shift count is the
 * table's call (a whole Day = 4 Shifts, or more if the GM allows).
 */
export class DowntimeHelper {
  static MAX_SHIFTS = MAX_SHIFTS;

  /** @returns {{shifts: number, log: Array<{key: string}>, breatherAt: number}} */
  static state(actor) {
    const raw = actor?.getFlag('vagabond', 'downtime') ?? {};
    return {
      shifts: Math.clamp(Number(raw.shifts) || 1, 1, MAX_SHIFTS),
      log: Array.isArray(raw.log) ? raw.log : [],
      breatherAt: Number.isInteger(raw.breatherAt) ? raw.breatherAt : -1,
    };
  }

  /** Shifts still unspent in the planned downtime. */
  static shiftsLeft(actor) {
    const s = this.state(actor);
    return Math.max(0, s.shifts - s.log.length);
  }

  /** Plan `n` Shifts (never below the Shifts already spent). */
  static async setShifts(actor, n) {
    const s = this.state(actor);
    const shifts = Math.clamp(Math.round(n), Math.max(1, s.log.length), MAX_SHIFTS);
    await actor.setFlag('vagabond', 'downtime', { ...s, shifts });
  }

  /** Log one spent Shift. No-op (returns false) when the planned Shifts are all spent. */
  static async spendShift(actor, key) {
    const s = this.state(actor);
    if (s.log.length >= s.shifts) return false;
    await actor.setFlag('vagabond', 'downtime', { ...s, log: [...s.log, { key }] });
    return true;
  }

  /** Start a new downtime: back to 1 Shift, nothing spent. */
  static async reset(actor) {
    await actor.setFlag('vagabond', 'downtime', { shifts: 1, log: [], breatherAt: -1 });
  }

  /** Breather: "Once per Shift". */
  static breatherUsed(actor) {
    const s = this.state(actor);
    return s.breatherAt === s.log.length;
  }

  static async markBreather(actor) {
    const s = this.state(actor);
    await actor.setFlag('vagabond', 'downtime', { ...s, breatherAt: s.log.length });
  }

  /* -------------------------------------------- */
  /* Skill Check                                  */
  /* -------------------------------------------- */

  /**
   * Roll a Skill Check exactly like the sheet does (auto-fail, favor/hinder, pre/post hooks,
   * skill card with Luck on Crit) and report the outcome to the caller.
   * @param {Actor} actor
   * @param {string} skillKey
   * @param {{bonus?: number, event?: Event}} [opts] - flat bonus added to the d20 (Other Activities: +1 / 10g);
   *   `event` Shift/Ctrl = Favor/Hinder like the sheet; `tags` = extra card tags
   * @returns {Promise<{roll: Roll|null, isSuccess: boolean, isCritical: boolean}|null>} null = cancelled by a hook;
   *   an auto-fail (Dead, failed Stat) is a failed Check with `roll: null`
   */
  static async rollSkillCheck(actor, skillKey, { bonus = 0, event = null, tags = [] } = {}) {
    if (VagabondRollBuilder.autoFails(actor, skillKey)) {
      await VagabondChatCard.autoFailRoll(actor, 'skill', skillKey);
      return { roll: null, isSuccess: false, isCritical: false };
    }

    const favorHinder = VagabondRollBuilder.calculateEffectiveFavorHinder(
      actor.system.favorHinder || 'none', !!event?.shiftKey, !!event?.ctrlKey,
    );
    const ctx = {
      actor, item: null, rollKey: skillKey, rollType: 'skill',
      difficulty: actor.system.skills?.[skillKey]?.difficulty ?? 10,
      favorHinder, rollData: actor.getRollData(),
    };
    if (Hooks.call('vagabond.preD20Roll', ctx) === false) return null;

    const base = CONFIG.VAGABOND?.homebrew?.dice?.baseCheck ?? '1d20';
    const roll = await VagabondRollBuilder.buildAndEvaluateD20(
      actor, ctx.favorHinder ?? favorHinder, bonus ? `${base} + ${bonus}` : undefined,
    );

    const critType = VagabondRollBuilder.isWeaponSkillKey(skillKey) ? skillKey : null;
    const isCritical = VagabondChatCard.isRollCritical(roll, VagabondRollBuilder.calculateCritThreshold(actor.getRollData(), critType));
    const isSuccess = roll.total >= ctx.difficulty;

    const post = { actor, item: null, rollKey: skillKey, rollType: 'skill', roll, difficulty: ctx.difficulty, isSuccess, isCritical, extraMetadata: [], extraTags: [...tags] };
    Hooks.callAll('vagabond.postD20Roll', post);
    await VagabondChatCard.skillRoll(actor, skillKey, roll, ctx.difficulty, isSuccess, post.extraMetadata, post.extraTags);

    if (actor.system.manualCheckBonus !== 0 || actor.system.manualDifficultyBonus !== 0) {
      await actor.update({ 'system.manualCheckBonus': 0, 'system.manualDifficultyBonus': 0 });
    }
    return { roll, isSuccess, isCritical };
  }

  /* -------------------------------------------- */
  /* Supplies                                     */
  /* -------------------------------------------- */

  /** The actor's Ration stack (supply item), if any. */
  static rationItem(actor) {
    return actor?.items.find(i => i.type === 'equipment' && i.system.isSupply) ?? null;
  }

  /** Total Rations carried. */
  static rationCount(actor) {
    return (actor?.items ?? [])
      .filter(i => i.type === 'equipment' && i.system.isSupply)
      .reduce((sum, i) => sum + (i.system.quantity ?? 0), 0);
  }

  /** Add `n` Rations: top up the existing stack, else copy the gear-pack Ration. */
  static async grantRations(actor, n) {
    if (n <= 0) return;
    const stack = this.rationItem(actor);
    if (stack) {
      await stack.update({ 'system.quantity': (stack.system.quantity ?? 0) + n });
      return;
    }
    const source = await game.packs.get('vagabond.gear')?.getDocument(RATION_ID);
    if (!source) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Downtime.NoRationSource'));
      return;
    }
    const data = source.toObject();
    data.system.quantity = n;
    data._stats = { ...(data._stats ?? {}), compendiumSource: source.uuid };
    await actor.createEmbeddedDocuments('Item', [data]);
  }

  /** Add Materials worth `silver` (generic pool). */
  static async grantMaterials(actor, silver) {
    if (silver > 0) await MaterialsHelper.grant(actor, silver * CurrencyHelper.RATES.silver);
  }

  /* -------------------------------------------- */
  /* Hunting                                      */
  /* -------------------------------------------- */

  /** Harvest yield of ONE beast: Rations = HP (×3 Prey), Materials = HP × 5s. */
  static harvestYield(beast) {
    return { rations: beast.hp * (beast.prey ? 3 : 1), materialsSilver: beast.hp * 5 };
  }
}
