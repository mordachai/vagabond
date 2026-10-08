import { classFeatureText } from './feature-text.mjs';

/**
 * Hunter — Hunter’s Mark, Lethal Precision, Apex Predator (optional automation + feature button).
 *
 * The Mark is an actor-owned effect (`flags.vagabond.huntersMark = { key, name }`; `key` is the
 * target's {@link HunterHelper.markKey}). Delete the effect to drop the Mark. What the Mark DOES
 * is driven by Active Effects on the class item, so each rule can be switched off on its own:
 *   - `system.markRules`        'keenVicious' · 'critByBonus' · 'weak'
 *   - `system.markDamageBonus`  extra damage the Mark takes (Lethal Precision)
 *   - `system.huntersMarkTrigger`  attacking with no Mark makes the Target your Mark (optional)
 * The Mark button on the feature always works, no combat needed.
 *
 * Marked status: while a Being is a Hunter's Mark it carries the Marked status (token HUD condition, also
 * toggleable by hand). Applied when the Mark is set, removed by the active GM when the Mark effect is deleted
 * (drop, move, or by hand), unless another hunter still marks that Being. Same pattern as the Witch's Hexed.
 *
 * Tracking / navigation / Forage / sensing (Survivalist, Killer Instinct) and Climb / Swim
 * (Rover) are text only.
 *
 * Imported by damage-pipeline / damage-helper / actor: it must not import those (no cycles).
 */
export class HunterHelper {

  static #L(key, data = {}) {
    return game.i18n.format(`VAGABOND.HuntersMark.${key}`, data);
  }

  /* -------------------------------------------- */
  /*  The Mark                                    */
  /* -------------------------------------------- */

  /** Stable identity of a marked actor: its token (unlinked) or the actor itself. */
  static markKey(actor) {
    return actor?.token?.uuid ?? actor?.uuid ?? null;
  }

  /** The Mark effect currently on the hunter, if any. */
  static markEffect(hunter) {
    return hunter?.effects?.find(e => e.flags?.vagabond?.huntersMark) ?? null;
  }

  /** Is `target` this hunter's current Mark? */
  static isMarkTarget(hunter, target) {
    const mark = this.markEffect(hunter)?.flags?.vagabond?.huntersMark;
    return !!mark && !!target && mark.key === this.markKey(target);
  }

  /** Does this hunter carry a Mark rule (`system.markRules`)? */
  static hasRule(hunter, rule) {
    return hunter?.type === 'character' && Array.isArray(hunter.system?.markRules) && hunter.system.markRules.includes(rule);
  }

  /** Apex Predator: is `target` Weak to `attacker`'s attacks? */
  static isMarkWeak(attacker, target) {
    return this.hasRule(attacker, 'weak') && this.isMarkTarget(attacker, target);
  }

  /** Mark: may a Bonus push the Check result into the Crit range against `target`? */
  static critsByBonus(attacker, target) {
    return this.hasRule(attacker, 'critByBonus') && this.isMarkTarget(attacker, target);
  }

  /**
   * Mark: weapons gain the Keen / Vicious they lack, against the Mark. Mutates and returns the
   * item-effects roll data (a fresh object per call — safe to change).
   * @param {Actor} hunter
   * @param {Item|null} item - The weapon
   * @param {object} rollData
   * @param {Actor[]} [targetActors] - the attack's Targets (the first one counts, as for attack rolls)
   * @returns {object}
   */
  static applyToRollData(hunter, item, rollData, targetActors = []) {
    if (!this.hasRule(hunter, 'keenVicious') || !this.isMarkTarget(hunter, targetActors?.[0])) return rollData;
    const props = item?.system?.properties ?? [];
    const keen = props.includes('Keen');
    const vicious = props.includes('Vicious');
    if (keen === vicious) return rollData; // neither, or already both

    if (keen) {
      const prev = rollData.critBonusDice;
      const list = Array.isArray(prev) ? [...prev] : String(prev ?? '').split('+');
      rollData.critBonusDice = [...list.map(s => String(s).trim()), 'matchDie'].filter(s => s && s !== '0').join(' + ');
    } else {
      rollData.attackCritBonus = (Number(rollData.attackCritBonus) || 0) - 1;
    }
    return rollData;
  }

  /**
   * Set (or move) the hunter's Mark to `token`'s actor. Replaces any previous Mark.
   * @param {Actor} hunter
   * @param {Token|TokenDocument} token
   * @param {{manual?: boolean}} [opts] - manual = from the button (warns when blocked)
   * @returns {Promise<boolean>}
   */
  static async setMark(hunter, token, { manual = false } = {}) {
    const target = token?.actor;
    if (!hunter || !target) return false;
    if (!hunter.isOwner && !game.user.isGM) {
      if (manual) ui.notifications.warn(this.#L('NotYours'));
      return false;
    }
    const key = this.markKey(target);
    if (this.isMarkTarget(hunter, target)) return false;

    const title = this.#L('Title');
    const name = (token.document ?? token).name ?? target.name;
    const old = hunter.effects.filter(e => e.flags?.vagabond?.huntersMark).map(e => e.id);
    try {
      if (old.length) await hunter.deleteEmbeddedDocuments('ActiveEffect', old);
      await hunter.createEmbeddedDocuments('ActiveEffect', [{
        name: `${title}: ${name}`,
        img: 'icons/svg/target.svg',
        description: `<p>${this.#L('EffectText', { target: foundry.utils.escapeHTML(name) })}</p>`,
        origin: hunter.uuid,
        system: { changes: [] },
        // v14 tokens only draw non-temporary effects set to ALWAYS (a manual create must set it)
        showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
        flags: { vagabond: { huntersMark: { key, name } } },
      }]);
    } catch (err) {
      console.error(`vagabond | Hunter’s Mark: could not mark ${name}`, err);
      ui.notifications.error(this.#L('Failed', { name }));
      return false;
    }

    await this.#setMarkedStatus(target, true, this.#L('MarkedBy', { name: hunter.name }));

    const { VagabondChatCard } = await import('./chat-card.mjs');
    const text = classFeatureText(hunter, { command: 'hunter.mark', name: title });
    await VagabondChatCard.featureCard(hunter, {
      title,
      description: `<p>${this.#L('Marked', { name: hunter.name, target: foundry.utils.escapeHTML(name) })}</p>${text}`,
    });
    return true;
  }

  /** Drop the current Mark (glowing button right-click). Works in any mode, no Combat needed. @param {Actor} hunter */
  static async dropMark(hunter) {
    const eff = this.markEffect(hunter);
    if (!eff) return;
    if (!hunter.isOwner && !game.user.isGM) {
      ui.notifications.warn(this.#L('NotYours'));
      return;
    }
    const name = eff.flags?.vagabond?.huntersMark?.name ?? '';
    if (hunter.effects.get(eff.id)) await eff.delete();
    const { VagabondChatCard } = await import('./chat-card.mjs');
    await VagabondChatCard.featureCard(hunter, {
      title: this.#L('Title'),
      description: `<p>${this.#L('Dropped', { name: hunter.name, target: foundry.utils.escapeHTML(name) })}</p>`,
    });
  }

  /** Feature button (`system:hunter.mark`): mark the first Target. @param {{actor: Actor, targets: Token[]}} scope */
  static async mark({ actor, targets }) {
    const token = (targets?.length ? targets : Array.from(game.user.targets))[0];
    if (!token?.actor) {
      ui.notifications.warn(this.#L('NoTarget'));
      return;
    }
    return this.setMark(actor, token, { manual: true });
  }

  /* -------------------------------------------- */
  /*  Marked status                               */
  /* -------------------------------------------- */

  /** Is the Marked status available (it is not in Foundry's default status list)? */
  static #markedAvailable() {
    return !!CONFIG.statusEffects?.some(s => s.id === 'marked');
  }

  /**
   * Put the Marked status on / take it off `actor`. Owner and GM write directly; anyone else routes through the
   * 'applyStatus' socket action (which also stamps the per-application description).
   */
  static async #setMarkedStatus(actor, active, description = '') {
    if (!actor || !this.#markedAvailable()) return;
    if (actor.isOwner || game.user.isGM) {
      if (active) {
        if (!actor.statuses?.has('marked')) await actor.toggleStatusEffect('marked', { active: true });
        const eff = actor.effects.find(e => e.statuses?.has('marked'));
        if (eff && description && eff.description !== description) {
          await eff.update({ description, 'flags.vagabond.flankInfo': true });
        }
      } else {
        const ids = actor.effects.filter(e => e.statuses?.has('marked')).map(e => e.id);
        if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
      }
    } else {
      const { emitSocket } = await import('./socket-helper.mjs');
      emitSocket('applyStatus', { actorUuid: actor.uuid, statusId: 'marked', active, description });
    }
  }

  /** A Mark effect was deleted from a hunter: clear Marked from its Target unless another hunter still marks it. */
  static async #onMarkEffectDeleted(effect) {
    const key = effect?.flags?.vagabond?.huntersMark?.key;
    const hunter = effect?.parent;
    if (!key || hunter?.documentName !== 'Actor') return;
    const doc = fromUuidSync(key);
    const target = doc?.actor ?? doc ?? null;
    if (!target) return;
    const stillMarked = game.actors.some(a => a.id !== hunter.id && this.isMarkTarget(a, target));
    if (!stillMarked) await this.#setMarkedStatus(target, false);
  }

  /* -------------------------------------------- */
  /*  Automatic parts                             */
  /* -------------------------------------------- */

  /**
   * A weapon attack is about to be rolled (called from the roll handler, before the roll so the
   * Mark's rules apply to this very attack): with auto-Mark on and no Mark, the Target becomes it.
   * @param {Actor} actor
   */
  static async onAttack(actor) {
    if (actor?.type !== 'character' || actor.system?.huntersMarkTrigger !== true) return;
    if (this.markEffect(actor) || (!actor.isOwner && !game.user.isGM)) return;
    const token = Array.from(game.user.targets)[0];
    if (token?.actor && token.actor !== actor) await this.setMark(actor, token);
  }

  /**
   * Lethal Precision (`vagabond.calculateFinalDamage`): damage that lands on a Mark, dealt by its
   * Hunter or an Ally of theirs on the Hunter's Turn, makes it take extra damage. Inside a started
   * Combat that the Hunter is in, only the Hunter's own Turn counts; with no Combat to tell
   * Turns apart it always applies.
   */
  static #onFinalDamage(ctx) {
    const target = ctx?.actor;
    const result = ctx?.result;
    if (!target || !result || !(result.final > 0)) return;
    const attacker = ctx.attackerActor ?? ctx.attackingWeapon?.actor ?? null;
    if (!attacker) return;

    for (const hunter of game.actors) {
      if (hunter.type !== 'character' || !(hunter.system.markDamageBonus > 0)) continue;
      if (!this.isMarkTarget(hunter, target)) continue;
      if (attacker !== hunter && !this.#allied(hunter, attacker)) continue;

      const combat = game.combats?.active;
      if (combat?.started && combat.combatants.some(c => c.actor === hunter) && combat.combatant?.actor !== hunter) continue;

      result.markBonus = (result.markBonus ?? 0) + hunter.system.markDamageBonus;
      result.final += hunter.system.markDamageBonus;
    }
  }

  /** Two actors on the same side (equal token disposition). */
  static #allied(a, b) {
    const da = a.getActiveTokens?.()?.[0]?.document?.disposition;
    const db = b.getActiveTokens?.()?.[0]?.document?.disposition;
    return da !== undefined && da === db;
  }

  /** Register the hooks. Synchronous, called once at module load. */
  static registerHooks() {
    Hooks.on('vagabond.calculateFinalDamage', (ctx) => this.#onFinalDamage(ctx));
    // Mark effect gone (drop / move / deleted by hand) → the Target is no longer Marked. Active GM only.
    Hooks.on('deleteActiveEffect', (effect) => {
      if (!effect?.flags?.vagabond?.huntersMark || game.users.activeGM !== game.user) return;
      this.#onMarkEffectDeleted(effect).catch(err => console.error('vagabond | Hunter’s Mark: could not clear Marked', err));
    });
  }
}
