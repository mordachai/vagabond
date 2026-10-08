import { classFeatureText } from './feature-text.mjs';
import { combatRollData } from './rule-rolldata.mjs';

/**
 * Witch — Hex target tracking, Soul Link, Misery Business (optional automation + feature button).
 *
 * The Hex is an actor-owned effect (`flags.vagabond.hex = { key, name }`; `key` is the target's
 * {@link WitchHelper.hexKey}), the same shape as the Hunter's Mark. Delete the effect to drop the Hex. What the
 * Hex DOES is driven by Active Effects on the class item, so each rule can be switched off on its own:
 *   - `system.hexRules`  'soulLink' · 'weak'
 * The Hex button on the feature always works, no combat needed.
 *
 * Soul Link ("Once per Action when you deal damage to an Enemy within Far of your hexed Target, the hexed Target
 * also takes the damage"): after damage lands (`vagabond.postDamageApply`) the hexed Target takes the same damage, re-run through its own Armor / Immune / Weak.
 * "Within Far" is anything in the Scene (Far = beyond 30', visible within the Scene), so both tokens only need to
 * share a Scene. Once per Turn inside a started Combat (there is no Action counter); outside a Combat every hit counts.
 *
 * Widdershins: `system.hexDamageBonus` adds flat damage to the witch's Spell damage against the hexed Target
 * (`widdershinsBonus`, applied in `_computeFinalDamage` before Armor). Its "effective Level" half is text.
 *
 * Misery Business: the hexed Target is Weak to your damage (`isHexWeak`, read by the damage math like Apex Predator).
 *
 * Hexed status: while a Being is the witch's Hex it carries the Hexed status (token HUD condition, also toggleable by
 * hand for any Being). The status description names the hexer. It is applied when the Hex is set and removed by the
 * active GM when the Hex effect is deleted (drop, replace, or deleting the effect by hand), unless another witch still
 * hexes that Being.
 *
 * Hex's "continual (p. 91)" Spell layer, Widdershins and Grudge Bearer are text only (no continual-Spell layer exists).
 *
 * Imported by damage-pipeline / damage-helper: it must not import those statically (no cycles).
 */
export class WitchHelper {

  static #L(key, data = {}) {
    return game.i18n.format(`VAGABOND.Hex.${key}`, data);
  }

  /** A stable id for "this Turn" of the started Combat the actor is in; null with no Combat. */
  static #turnKey(actor) {
    const combat = game.combats?.active;
    if (!combat?.started || combatRollData(actor).active !== 1) return null;
    return `${combat.id}:${combat.round}:${combat.turn}`;
  }

  /* -------------------------------------------- */
  /*  The Hex                                     */
  /* -------------------------------------------- */

  /** Stable identity of a hexed actor: its token (unlinked) or the actor itself. */
  static hexKey(actor) {
    return actor?.token?.uuid ?? actor?.uuid ?? null;
  }

  /** The Hex effect currently on the witch, if any. */
  static hexEffect(witch) {
    return witch?.effects?.find(e => e.flags?.vagabond?.hex) ?? null;
  }

  /** Is `target` this witch's current Hex? */
  static isHexTarget(witch, target) {
    const hex = this.hexEffect(witch)?.flags?.vagabond?.hex;
    return !!hex && !!target && hex.key === this.hexKey(target);
  }

  /** Does this witch carry a Hex rule (`system.hexRules`)? */
  static hasRule(witch, rule) {
    return witch?.type === 'character' && Array.isArray(witch.system?.hexRules) && witch.system.hexRules.includes(rule);
  }

  /** Misery Business: is `target` Weak to `attacker`'s damage? */
  static isHexWeak(attacker, target) {
    return this.hasRule(attacker, 'weak') && this.isHexTarget(attacker, target);
  }

  /* -------------------------------------------- */
  /*  Hexed status                                */
  /* -------------------------------------------- */

  /** Is the Hexed status available (it is not in Foundry's default status list)? */
  static #hexedAvailable() {
    return !!CONFIG.statusEffects?.some(s => s.id === 'hexed');
  }

  /**
   * Put the Hexed status on / take it off `actor`. Owner and GM write directly; anyone else routes through the
   * 'applyStatus' socket action (which also stamps the per-application description).
   */
  static async #setHexedStatus(actor, active, description = '') {
    if (!actor || !this.#hexedAvailable()) return;
    if (actor.isOwner || game.user.isGM) {
      if (active) {
        if (!actor.statuses?.has('hexed')) await actor.toggleStatusEffect('hexed', { active: true });
        const eff = actor.effects.find(e => e.statuses?.has('hexed'));
        if (eff && description && eff.description !== description) {
          await eff.update({ description, 'flags.vagabond.flankInfo': true });
        }
      } else {
        const ids = actor.effects.filter(e => e.statuses?.has('hexed')).map(e => e.id);
        if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
      }
    } else {
      const { emitSocket } = await import('./socket-helper.mjs');
      emitSocket('applyStatus', { actorUuid: actor.uuid, statusId: 'hexed', active, description });
    }
  }

  /** Resolve a stored Hex key (token or actor uuid) to the hexed actor. */
  static #actorFromKey(key) {
    const doc = key ? fromUuidSync(key) : null;
    return doc?.actor ?? doc ?? null;
  }

  /** A Hex effect was deleted from a witch: clear Hexed from its Target unless another witch still hexes it. */
  static async #onHexEffectDeleted(effect) {
    const key = effect?.flags?.vagabond?.hex?.key;
    const witch = effect?.parent;
    if (!key || witch?.documentName !== 'Actor') return;
    const target = this.#actorFromKey(key);
    if (!target) return;
    const stillHexed = game.actors.some(a => a.id !== witch.id && this.isHexTarget(a, target));
    if (!stillHexed) await this.#setHexedStatus(target, false);
  }

  /**
   * Widdershins: "Your damage from Spell effects … increased by 1 against your hexed Target (+1 more every 4 Levels)."
   * Flat damage added before Armor (like Flanked), only for damage dealt by the witch's own Spell to the hexed Target.
   * @param {Actor|null} attacker
   * @param {Actor} target
   * @param {Item|null} source - the damage source item
   * @returns {number}
   */
  static widdershinsBonus(attacker, target, source) {
    if (source?.type !== 'spell' || attacker?.type !== 'character') return 0;
    const bonus = Number(attacker.system?.hexDamageBonus) || 0;
    return bonus > 0 && this.isHexTarget(attacker, target) ? bonus : 0;
  }

  /** The hexed Target's actor (resolved from the stored token / actor uuid), or null. */
  static #hexActor(witch) {
    const key = this.hexEffect(witch)?.flags?.vagabond?.hex?.key;
    const doc = key ? fromUuidSync(key) : null;
    return doc?.actor ?? doc ?? null;
  }

  /** The hexed Target's token on the canvas, or null. */
  static #hexToken(witch) {
    const key = this.hexEffect(witch)?.flags?.vagabond?.hex?.key;
    const doc = key ? fromUuidSync(key) : null;
    if (doc?.documentName === 'Token') return doc.object ?? null;
    return doc?.getActiveTokens?.(true)?.[0] ?? null;
  }

  /**
   * Hex `token`'s actor. Replaces any previous Hex.
   * @param {Actor} witch
   * @param {Token|TokenDocument} token
   * @param {{manual?: boolean}} [opts] - manual = from the button (warns when blocked)
   * @returns {Promise<boolean>}
   */
  static async setHex(witch, token, { manual = false } = {}) {
    const target = token?.actor;
    if (!witch || !target) return false;
    if (!witch.isOwner && !game.user.isGM) {
      if (manual) ui.notifications.warn(this.#L('NotYours'));
      return false;
    }
    const key = this.hexKey(target);
    if (this.isHexTarget(witch, target)) return false;

    const title = this.#L('Title');
    const name = (token.document ?? token).name ?? target.name;
    const old = witch.effects.filter(e => e.flags?.vagabond?.hex).map(e => e.id);
    try {
      if (old.length) await witch.deleteEmbeddedDocuments('ActiveEffect', old);
      await witch.createEmbeddedDocuments('ActiveEffect', [{
        name: `${title}: ${name}`,
        img: 'icons/svg/eye.svg',
        description: `<p>${this.#L('EffectText', { target: foundry.utils.escapeHTML(name) })}</p>`,
        origin: witch.uuid,
        system: { changes: [] },
        // v14 tokens only draw non-temporary effects set to ALWAYS (a manual create must set it)
        showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
        flags: { vagabond: { hex: { key, name } } },
      }]);
    } catch (err) {
      console.error(`vagabond | Hex: could not hex ${name}`, err);
      ui.notifications.error(this.#L('Failed', { name }));
      return false;
    }

    await this.#setHexedStatus(target, true, this.#L('HexedBy', { name: witch.name }));

    const { VagabondChatCard } = await import('./chat-card.mjs');
    const text = classFeatureText(witch, { command: 'witch.hex', name: title });
    await VagabondChatCard.featureCard(witch, {
      title,
      description: `<p>${this.#L('Hexed', { name: witch.name, target: foundry.utils.escapeHTML(name) })}</p>${text}`,
    });
    return true;
  }

  /** Drop the current Hex (glowing button right-click). Works in any mode, no Combat needed. @param {Actor} witch */
  static async dropHex(witch) {
    const eff = this.hexEffect(witch);
    if (!eff) return;
    if (!witch.isOwner && !game.user.isGM) {
      ui.notifications.warn(this.#L('NotYours'));
      return;
    }
    const name = eff.flags?.vagabond?.hex?.name ?? '';
    if (witch.effects.get(eff.id)) await eff.delete();
    const { VagabondChatCard } = await import('./chat-card.mjs');
    await VagabondChatCard.featureCard(witch, {
      title: this.#L('Title'),
      description: `<p>${this.#L('Dropped', { name: witch.name, target: foundry.utils.escapeHTML(name) })}</p>`,
    });
  }

  /** Feature button (`system:witch.hex`): hex the first Target. @param {{actor: Actor, targets: Token[]}} scope */
  static async hex({ actor, targets }) {
    const token = (targets?.length ? targets : Array.from(game.user.targets))[0];
    if (!token?.actor) {
      ui.notifications.warn(this.#L('NoTarget'));
      return;
    }
    return this.setHex(actor, token, { manual: true });
  }

  /* -------------------------------------------- */
  /*  Soul Link                                   */
  /* -------------------------------------------- */

  /** Both actors' tokens on the same side (equal disposition) — an Ally is not an Enemy. */
  static #sameSide(a, b) {
    const da = a.getActiveTokens?.()?.[0]?.document?.disposition;
    const db = b.getActiveTokens?.()?.[0]?.document?.disposition;
    return da !== undefined && da === db;
  }

  /**
   * Damage was applied (`vagabond.postDamageApply`): a witch with Soul Link who just hurt an Enemy passes the
   * same damage to her hexed Target.
   */
  static async #onDamageApplied(ctx) {
    const target = ctx?.actor;
    const witch = ctx?.attackerActor;
    if (!target || !witch || witch === target || !(ctx.amount > 0)) return;
    if (witch.type !== 'character' || !this.hasRule(witch, 'soulLink')) return;
    if (!witch.isOwner && !game.user.isGM) return;

    const hexActor = this.#hexActor(witch);
    if (!hexActor || hexActor === target || this.isHexTarget(witch, target)) return;
    if (this.#sameSide(witch, target)) return;

    // Both must stand in the Scene (Far = visible within the Scene)
    const hexToken = this.#hexToken(witch);
    const targetToken = target.getActiveTokens?.(true)?.[0];
    if (!hexToken || !targetToken || hexToken.scene !== targetToken.scene) return;

    // Once per Action: approximated as once per Turn inside a started Combat
    const turn = this.#turnKey(witch);
    if (turn && witch.getFlag('vagabond', 'soulLinkTurn') === turn) return;
    if (turn) await witch.setFlag('vagabond', 'soulLinkTurn', turn);

    // "Also takes the damage": the same incoming damage (before the Enemy's Armor / Immune / Weak) runs through the
    // hexed Target's OWN Armor, Immune and Weak. The Misery Business extra die is not rolled again (no new attack).
    const { VagabondDamageHelper } = await import('./damage-helper.mjs');
    const incoming = ctx.incoming ?? ctx.amount;
    const { final } = VagabondDamageHelper.calculateFinalDamageDetailed(
      hexActor, incoming, ctx.damageType ?? '-', ctx.sourceItem, { attackerActor: witch, rolledDiceCount: ctx.rolledDiceCount ?? null, skipHexBonus: true }
    );
    const dealt = await VagabondDamageHelper._applyDamageToActor(hexActor, final, ctx.damageType, ctx.sourceItem, witch);
    if (!(dealt > 0)) return;

    const { VagabondChatCard } = await import('./chat-card.mjs');
    await VagabondChatCard.featureCard(witch, {
      title: game.i18n.localize('VAGABOND.Hex.SoulLinkTitle'),
      description: `<p>${this.#L('SoulLinked', {
        name: witch.name,
        hexed: foundry.utils.escapeHTML(hexToken.name ?? hexActor.name),
        damage: dealt,
        enemy: foundry.utils.escapeHTML(targetToken.name ?? target.name),
      })}</p>`,
    });
  }

  /** Register the hooks. Synchronous, called once at module load. */
  static registerHooks() {
    // Hex effect gone (drop / replace / deleted by hand) → the Target is no longer Hexed. Active GM only.
    Hooks.on('deleteActiveEffect', (effect) => {
      if (!effect?.flags?.vagabond?.hex || game.users.activeGM !== game.user) return;
      this.#onHexEffectDeleted(effect).catch(err => console.error('vagabond | Hex: could not clear Hexed', err));
    });
    Hooks.on('vagabond.postDamageApply', (ctx) => {
      this.#onDamageApplied(ctx).catch(err => console.error('vagabond | Soul Link: could not pass the damage on', err));
    });
  }
}
