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
 * their own with `held`). Also the Focus writer (`setFocus` / `clearFocus` / `commitCastFocus`).
 * Dependency-free: item-macro, status-helper, damage-helper, spell-handler and the Focus features import it.
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

  /**
   * Start or stop Focusing on a Spell — the ONE writer of `system.focus.spellIds` (sheet star, spell context
   * menu on sheet + HUD, Cast dialog, Focus Mana card, Polymorph). Keeps the `focusing` status in step.
   * Dropping a Spell clears what its Casts applied (SpellTrackerHelper hook → `vagabond.focusDropped`: Trackers, Polymorph forms…).
   * Book: "Focusing lets an effect stay active until you drop it … or Focus on another effect": with every
   * Focus taken (`focus.max`, 1 + Manifold Mind etc.), starting a new one drops the oldest.
   * @param {Actor} actor
   * @param {string} spellId
   * @param {boolean} on
   * @param {{restart?: boolean}} [options]  restart: already Focused on it → end that Focus first (a new Cast)
   * @returns {Promise<boolean>}
   */
  static async setFocus(actor, spellId, on, { restart = false } = {}) {
    const current = actor.system.focus?.spellIds || [];
    const was = current.includes(spellId);
    if (on === was && !(on && restart)) return true;
    let next = current.filter(id => id !== spellId);
    if (on) {
      const focusMax = Math.max(1, actor.system.focus?.max ?? 1);
      if (next.length >= focusMax) next = next.slice(next.length - focusMax + 1);
      // Ends the earlier Cast (and any dropped Focus) before the new one starts
      if (next.length !== current.length) await actor.update({ 'system.focus.spellIds': next });
      next = [...next, spellId];
    }
    await actor.update({ 'system.focus.spellIds': next });

    // Sync the "focusing" status effect with focus state
    const isFocusing = next.length > 0;
    if (isFocusing !== actor.statuses.has('focusing')) {
      await actor.toggleStatusEffect('focusing', { active: isFocusing });
    }
    ui.combat?.render(false);
    return true;
  }

  /**
   * Stop every Focus (the Focusing status was removed by hand: token HUD, effects list).
   * @param {Actor} actor
   */
  static async clearFocus(actor) {
    if (actor.system.focus?.spellIds?.length) await actor.update({ 'system.focus.spellIds': [] });
    if (actor.statuses.has('focusing')) await actor.toggleStatusEffect('focusing', { active: false });
    ui.combat?.render(false);
  }

  /**
   * The Cast dialog's Focus switch, applied when the Cast resolves (`_executeCast`). Off → the Focus on it ends.
   * On → only a successful Cast Focuses; Focusing on it again ends the earlier Cast first (another Polymorph
   * reverts the last one); a Crit of a "Crit: No Focus" Spell (`critNoFocus`) needs no Focus and ends none.
   * @param {Actor} actor
   * @param {Item} spell
   * @param {{focusOn: boolean, isSuccess: boolean, isCritical: boolean}} cast
   */
  static async commitCastFocus(actor, spell, { focusOn, isSuccess, isCritical }) {
    if (!focusOn) return this.setFocus(actor, spell.id, false);
    if (!isSuccess || (isCritical && spell.system.critNoFocus)) return;
    return this.setFocus(actor, spell.id, true, { restart: true });
  }
}
