import { classFeatureText } from './feature-text.mjs';
import { StatusHelper } from './status-helper.mjs';
import { RollExpiry } from './roll-expiry.mjs';

/**
 * Gunslinger — Deadeye, Grit, High Noon (optional automation + feature buttons).
 *
 * Deadeye is an actor-owned effect (`flags.vagabond.deadeye = { stacks, grace }`) whose single
 * change lowers the Crit threshold of Ranged attacks (`system.rangedCritBonus` −stacks, read by
 * `VagabondRollBuilder.calculateCritThreshold`). Stacks go 1–3 (Crit on 19 / 18 / 17); no effect
 * means no Deadeye. Everything is manual-first:
 *   - the Deadeye / High Noon / Grit feature buttons always work, no combat needed;
 *   - the automatic parts (a stack per Ranged HIT, reset by a miss / any other roll — see
 *     roll-expiry.mjs — or by ending a Turn in a Combat without a Ranged hit, High Noon on a kill) only run while the actor has `system.deadeyeTrigger` / `system.highNoonTrigger` —
 *     set by the class's "Deadeye: Auto" / "High Noon: Auto" effects. Switch those off and
 *     nothing here ever fires.
 *
 * Bad Medicine and Devastator need no code of their own: they are Active Effects feeding
 * `system.critExtraDiceBySkill` / `system.critExplodeSkills` (read by the damage pipeline).
 */

const RANGED = 'ranged';
const MAX_STACKS = 3;
/**
 * Own Turn-ends a Ranged hit keeps Deadeye alive for. 1 = the Turn-end of the Turn you hit in:
 * "at the end of your Turn, reset if you didn’t hit a Ranged attack since the start of your last
 * Turn" read as "since this Turn started". A Turn with no Ranged hit ends Deadeye.
 */
const GRACE_TURNS = 1;
/** Statuses Grit can remove. */
const GRIT_STATUSES = ['blinded', 'burning', 'confused', 'dazed', 'frightened'];

export class GunslingerHelper {

  static #L(key, data = {}) {
    return game.i18n.format(`VAGABOND.Deadeye.${key}`, data);
  }

  /** Does this actor have the auto-Deadeye automation on? */
  static isAuto(actor) {
    return actor?.type === 'character' && actor.system?.deadeyeTrigger === true;
  }

  /** The Deadeye effect currently on the actor, if any. */
  static effect(actor) {
    return actor?.effects?.find(e => e.flags?.vagabond?.deadeye) ?? null;
  }

  /** Current Deadeye stacks (0 = none). A switched-off Deadeye effect counts as none. */
  static stacks(actor) {
    const eff = this.effect(actor);
    return eff && !eff.disabled ? (eff.flags?.vagabond?.deadeye?.stacks ?? 0) : 0;
  }

  /**
   * End Deadeye (feature button right-click / glowing button). Works in any mode, no Combat needed.
   * @param {Actor} actor
   */
  static async end(actor, reason) {
    if (!this.#canWrite(actor)) {
      ui.notifications.warn(this.#L('NotYours'));
      return;
    }
    const eff = this.effect(actor);
    if (!eff) return;
    if (actor.effects.get(eff.id)) await eff.delete();
    const { VagabondChatCard } = await import('./chat-card.mjs');
    await VagabondChatCard.featureCard(actor, {
      title: this.#L('Title'),
      description: `<p>${this.#L('Ended', { name: actor.name })}${reason ? ` ${RollExpiry.reasonText(reason)}` : ''}</p>`,
    });
  }

  /** Stacks after one more Ranged hit — for the card tag shown before the update lands. */
  static nextStacks(actor) {
    return Math.min(MAX_STACKS, this.stacks(actor) + 1);
  }

  /** Can the current user write to this actor's effects? */
  static #canWrite(actor) {
    return !!actor && (actor.isOwner || game.user.isGM);
  }

  /** Book text of a class feature by (prefix of its) name, for chat cards. */
  static #featureText(actor, name) {
    const command = { Deadeye: 'gunslinger.deadeye', 'High Noon': 'gunslinger.highNoon', Grit: 'gunslinger.grit' }[name];
    return classFeatureText(actor, { command, name });
  }

  /** Effect data for `stacks` Deadeye. */
  static #data(actor, deadeye) {
    return {
      name: `${this.#L('Title')} (${deadeye.stacks})`,
      img: 'icons/svg/target.svg',
      description: `<p>${this.#L('EffectText', { n: deadeye.stacks, crit: 20 - deadeye.stacks })}</p>`,
      origin: actor.uuid,
      system: { changes: [{ key: `system.${RANGED}CritBonus`, type: 'add', value: `-${deadeye.stacks}` }] },
      // v14 tokens only draw non-temporary effects set to ALWAYS (a manual create must set it)
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
      flags: { vagabond: { deadeye } },
    };
  }

  /**
   * Set Deadeye to `stacks` (clamped 0–3; 0 removes it). Creates / updates the actor effect.
   * @param {Actor} actor
   * @param {number} stacks
   * @param {{grace?: number}} [opts] - Turns of survival without a Ranged hit (auto mode)
   * @returns {Promise<number>} the stacks now in place
   */
  static async setStacks(actor, stacks, { grace } = {}) {
    const n = Math.clamp(Math.trunc(Number(stacks)) || 0, 0, MAX_STACKS);
    let existing = this.effect(actor);
    // A switched-off effect is stale state: drop it and start fresh
    if (existing?.disabled) {
      if (actor.effects.get(existing.id)) await existing.delete();
      existing = null;
    }
    if (n === 0) {
      if (existing && actor.effects.get(existing.id)) await existing.delete();
      return 0;
    }
    const deadeye = { stacks: n, grace: grace ?? existing?.flags?.vagabond?.deadeye?.grace ?? 0 };
    const data = this.#data(actor, deadeye);
    if (existing) {
      await existing.update({
        name: data.name,
        description: data.description,
        'system.changes': data.system.changes,
        'flags.vagabond.deadeye': deadeye,
      });
    } else {
      await actor.createEmbeddedDocuments('ActiveEffect', [data]);
    }
    return n;
  }

  /* -------------------------------------------- */
  /*  Automatic parts                             */
  /* -------------------------------------------- */

  /**
   * A weapon check was rolled (`vagabond.postD20Roll`). A Ranged HIT builds Deadeye. Anything else
   * the actor rolls (a miss, another attack, a skill / cast check) ends it — see the RollExpiry
   * rule registered in registerHooks().
   */
  static #onRoll(ctx) {
    const actor = ctx?.actor;
    if (ctx?.rollType !== 'weapon' || ctx.rollKey !== RANGED || !ctx.isSuccess) return;
    if (!this.isAuto(actor) || !this.#canWrite(actor)) return;

    ctx.extraTags?.push({ label: this.#L('Tag', { n: this.nextStacks(actor) }), cssClass: 'tag-range' });

    this.setStacks(actor, this.stacks(actor) + 1, { grace: GRACE_TURNS })
      .catch(err => console.error('vagabond | Deadeye: could not update stacks', err));
  }

  /**
   * End of a combatant's Turn (core `combatTurnChange`, active GM only): Deadeye resets unless
   * the Gunslinger hit a Ranged attack since the start of their last Turn.
   * @param {Combat} combat
   * @param {{combatantId: string}} previous
   */
  static async onTurnEnd(combat, previous) {
    if (!game.user.isActiveGM) return;
    const actor = combat.combatants.get(previous?.combatantId)?.actor;
    if (!this.isAuto(actor)) return;
    const eff = this.effect(actor);
    if (!eff) return;

    const grace = eff.flags?.vagabond?.deadeye?.grace ?? 0;
    if (grace > 0) {
      await eff.update({ 'flags.vagabond.deadeye.grace': grace - 1 });
      return;
    }
    await eff.delete();
    const { VagabondChatCard } = await import('./chat-card.mjs');
    await VagabondChatCard.featureCard(actor, {
      title: this.#L('Title'),
      description: `<p>${this.#L('Reset', { name: actor.name })}</p>`,
    });
  }

  /**
   * Damage was applied (`vagabond.postDamageApply`): an attacker with High Noon automation who
   * just dropped a non-allied target to 0 HP sets Deadeye to the maximum (17).
   */
  static #onDamageApplied(ctx) {
    const attacker = ctx?.attackerActor ?? ctx?.sourceItem?.actor;
    if (!attacker || attacker === ctx.actor) return;
    if (attacker.type !== 'character' || attacker.system?.highNoonTrigger !== true || !this.#canWrite(attacker)) return;
    if (!((ctx.oldHp ?? 0) > 0 && (ctx.newHp ?? 1) <= 0)) return;
    if (this.#sameSide(attacker, ctx.actor)) return;
    this.highNoon({ actor: attacker, auto: true })
      .catch(err => console.error('vagabond | High Noon: could not set Deadeye', err));
  }

  /** Both actors' tokens on the same side (equal disposition) — a kill of an Ally is not an Enemy kill. */
  static #sameSide(a, b) {
    const da = a.getActiveTokens?.()?.[0]?.document?.disposition;
    const db = b.getActiveTokens?.()?.[0]?.document?.disposition;
    return da !== undefined && da === db;
  }

  /* -------------------------------------------- */
  /*  Feature buttons                             */
  /* -------------------------------------------- */

  /** Deadeye feature button (`system:gunslinger.deadeye`): add one stack by hand. */
  static async deadeye({ actor }) {
    if (!actor?.isOwner) {
      ui.notifications.warn(this.#L('NotYours'));
      return;
    }
    // Auto-Deadeye already adds a stack per Ranged attack — a manual +1 would count it twice
    if (this.isAuto(actor)) {
      ui.notifications.warn(this.#L('AutoOn', { name: actor.name }));
      return;
    }
    if (this.stacks(actor) >= MAX_STACKS) {
      ui.notifications.warn(this.#L('Max', { name: actor.name }));
      return;
    }
    const n = await this.setStacks(actor, this.stacks(actor) + 1);
    const { VagabondChatCard } = await import('./chat-card.mjs');
    await VagabondChatCard.featureCard(actor, {
      title: this.#L('Title'),
      description: `<p>${this.#L('Raised', { name: actor.name, n })}</p>${this.#featureText(actor, 'Deadeye')}`,
    });
  }

  /** High Noon feature button (`system:gunslinger.highNoon`) / auto kill trigger: Deadeye → 17. */
  static async highNoon({ actor, auto = false }) {
    if (!this.#canWrite(actor)) {
      ui.notifications.warn(this.#L('NotYours'));
      return;
    }
    await this.setStacks(actor, MAX_STACKS);
    const { VagabondChatCard } = await import('./chat-card.mjs');
    await VagabondChatCard.featureCard(actor, {
      title: this.#L('HighNoonTitle'),
      description: `<p>${this.#L('HighNoonDone', { name: actor.name })}</p>${auto ? '' : this.#featureText(actor, 'High Noon')}`,
    });
  }

  /**
   * Grit feature button (`system:gunslinger.grit`): a card with one button per Status Grit can
   * remove that the Gunslinger currently has. No dialog.
   */
  static async grit({ actor }) {
    if (!actor?.isOwner) {
      ui.notifications.warn(this.#L('NotYours'));
      return;
    }
    const present = GRIT_STATUSES.filter(id => actor.statuses?.has(id));
    if (!present.length) {
      ui.notifications.warn(this.#L('NoStatus', { name: actor.name }));
      return;
    }
    // Grit (Alpha 3): the Status is paid for with Deadeye stacks
    const cost = Math.max(0, Number(actor.system.deadeyeGrit) || 0);
    if (this.stacks(actor) < cost) {
      ui.notifications.warn(this.#L('GritNoStacks', { name: actor.name, n: cost, have: this.stacks(actor) }));
      return;
    }

    const { VagabondChatCard } = await import('./chat-card.mjs');
    const { buildMacroButtonHTML } = await import('./item-macro.mjs');
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle(this.#L('GritTitle'))
      .setSubtitle(actor.name)
      .setDescription(`<p>${this.#L('GritPick', { n: cost })}</p>`);
    // Mosaic: 3 tiles per row, 50px Status image with its name below
    const tiles = present.map((id) => {
      const def = CONFIG.statusEffects.find(e => e.id === id);
      return buildMacroButtonHTML({
        cfg: {
          enabled: true,
          label: game.i18n.localize(def?.name ?? id),
          icon: 'heart-pulse',
          img: def?.img ?? def?.icon,
          command: 'system:gunslinger.gritRemove',
        },
        slot: 'macro',
        actorUuid: actor.uuid,
        itemName: 'Grit',
        extraScope: { statusId: id },
      });
    });
    card.addFooterAction(`<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;width:100%;">${tiles.join('')}</div>`);
    await card.send();
  }

  /** A Grit status button was clicked: remove the Status and spend the Deadeye stacks. */
  static async gritRemove({ actor, statusId }) {
    if (!actor?.isOwner) {
      ui.notifications.warn(this.#L('NotYours'));
      return;
    }
    if (!GRIT_STATUSES.includes(statusId) || !actor.statuses?.has(statusId)) {
      ui.notifications.warn(this.#L('NoStatus', { name: actor.name }));
      return;
    }
    const cost = Math.max(0, Number(actor.system.deadeyeGrit) || 0);
    if (this.stacks(actor) < cost) {
      ui.notifications.warn(this.#L('GritNoStacks', { name: actor.name, n: cost, have: this.stacks(actor) }));
      return;
    }
    await StatusHelper.removeStatus(actor, statusId);
    const n = cost > 0 ? await this.setStacks(actor, this.stacks(actor) - cost) : this.stacks(actor);

    const def = CONFIG.statusEffects.find(e => e.id === statusId);
    const { VagabondChatCard } = await import('./chat-card.mjs');
    await VagabondChatCard.featureCard(actor, {
      title: this.#L('GritTitle'),
      description: `<p>${this.#L('GritDone', { name: actor.name, status: game.i18n.localize(def?.name ?? statusId), spent: cost, n })}</p>`
        + this.#featureText(actor, 'Grit'),
    });
  }

  /** Register the hooks. Synchronous, called once at module load. */
  static registerHooks() {
    Hooks.on('vagabond.postD20Roll', (ctx) => this.#onRoll(ctx));
    // Roll rule: a Ranged hit keeps Deadeye; any other roll but a Save ends it (after that roll used it)
    RollExpiry.register('deadeye', {
      applies: (actor) => this.isAuto(actor) && this.stacks(actor) > 0,
      decide: (ctx, kind) => {
        if (kind === 'save') return undefined;
        return (kind === 'attack' && ctx.rollKey === RANGED && ctx.isSuccess) ? 'keep' : 'end';
      },
      end: (actor, reason) => this.end(actor, reason),
    });
    Hooks.on('vagabond.postDamageApply', (ctx) => this.#onDamageApplied(ctx));
    Hooks.on('combatTurnChange', (combat, previous) => this.onTurnEnd(combat, previous));
  }
}
