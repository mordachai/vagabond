/**
 * Focus link — book: "Focusing lets an effect stay active until you drop it". Every effect a Focus-held Spell
 * Cast puts on the table is stamped `flags.vagabond.spellTracker = { casterUuid, casterName, spellId, spellName,
 * held }`; when the caster stops Focusing on that Spell, the active GM removes every stamped effect with
 * `held !== false` (SpellTrackerHelper `#onFocusDropped`).
 *
 * held = the Cast Focused (Focus switch on, Cast succeeded) and was not a Crit of a "Crit: No Focus" Spell —
 * that Crit makes the Spell continual / 1 Minute, so its effects stay (`held: false`, stamp kept as metadata).
 *
 * The Cast's `held` rides the Cast card: `spellCast.held` (card flag / Save-card data attrs) for the status
 * path (StatusHelper.applyStatus stamps the status effect of entries carrying `focusLink`) and the macro scope
 * key `focusHeld` for hit macros (`capture` stamps every effect the macro creates; built-in handlers stamp
 * their own with `held`). Dependency-free: item-macro, status-helper and damage-helper import it.
 */
export class FocusLink {

  /**
   * Whether a resolved Cast is held by the Focus.
   * @param {Item} spell
   * @param {{focusOn: boolean|null, isSuccess: boolean, isCritical: boolean}} cast
   */
  static held(spell, { focusOn, isSuccess, isCritical }) {
    return focusOn === true && !!isSuccess && !(isCritical && spell?.system?.critNoFocus);
  }

  /**
   * The stamp of one Cast.
   * @param {Actor|null} caster
   * @param {Item|{name: string}|null} spell
   * @param {boolean} held
   */
  static stamp(caster, spell, held) {
    return {
      casterUuid: caster?.uuid ?? null,
      casterName: caster?.name ?? '',
      spellId: spell?.id ?? null,
      spellName: spell?.name ?? '',
      held: !!held,
    };
  }

  /**
   * Stamp effects created by a held Cast. Skips the Focusing status, a Spell Surface's while-inside statuses (they
   * end with the area, which ends with the Focus), effects another Cast already stamped and effects this user
   * can't update. An effect stamped by the same Cast's handler keeps its fields.
   * @param {ActiveEffect[]} effects
   * @param {object} stamp
   */
  static async stampEffects(effects, stamp) {
    for (const effect of effects) {
      try {
        if (!effect?.id || !effect.parent?.effects?.has(effect.id) || !effect.isOwner) continue;
        if (effect.statuses?.has('focusing')) continue;
        if (effect.flags?.vagabond?.surfaceRegion) continue;
        const prev = effect.flags?.vagabond?.spellTracker;
        if (prev && (prev.casterUuid !== stamp.casterUuid || prev.spellId !== stamp.spellId)) continue;
        if (prev?.held === stamp.held) continue;
        await effect.update({ 'flags.vagabond.spellTracker': { ...stamp, ...(prev ?? {}), held: stamp.held } });
      } catch (err) {
        console.warn(`vagabond | Focus link: could not stamp ${effect?.uuid ?? '(unknown)'}`, err);
      }
    }
  }

  /**
   * Run `fn` (a held Cast's hit macro) and stamp every ActiveEffect this client creates meanwhile.
   * @param {object} stamp
   * @param {() => Promise<*>} fn
   */
  static async capture(stamp, fn) {
    const created = [];
    const hookId = Hooks.on('createActiveEffect', (effect, _options, userId) => {
      if (userId === game.user.id) created.push(effect);
    });
    try {
      return await fn();
    } finally {
      Hooks.off('createActiveEffect', hookId);
      if (created.length) await this.stampEffects(created, stamp);
    }
  }

  /**
   * Stamp the status effect `statusId` an entry just put on `actor` (status path).
   * @param {Actor} actor
   * @param {string} statusId
   * @param {object} stamp
   */
  static async stampStatus(actor, statusId, stamp) {
    const effect = actor?.effects?.find(e => e.statuses?.has(statusId));
    if (effect) await this.stampEffects([effect], stamp);
  }
}
