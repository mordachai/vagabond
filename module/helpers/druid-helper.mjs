/**
 * Druid — Polymorph, Savagery, Beast Mode, Force of Nature, on top of the Metamorph module
 * (https://github.com/mordachai/metamorph). Metamorph is a SOFT dependency: nothing here runs
 * unless it is active, and every Druid feature still works as plain text without it.
 *
 * How a Polymorph looks to the system: Metamorph swaps the token to a private NPC copy of the
 * Beast (flag `flags.metamorph.temp.mainActorId` → the character it belongs to). So "attacks the
 * Druid makes as a Beast" = attacks rolled by an actor that is such a copy, and the Druid's own
 * numbers are read from that main actor:
 *   - `system.beastDamageBonus`   (Savagery)  flat damage added to those attacks
 *   - `system.beastIgnoreImmune`  (Beast Mode) those attacks ignore non-Relic Immune
 *   - `system.polymorphLevelBonus` (Savagery) added to Level for the Polymorph Spell's HD limit
 *   - `system.polymorphContinual` (Beast Mode) self-cast Polymorph needs no Focus
 * All four are set by Active Effects on the class item.
 */
export class DruidHelper {

  /* -------------------------------------------- */
  /*  Metamorph link                              */
  /* -------------------------------------------- */

  /** The Metamorph API, or null when the module is missing / inactive. */
  static metamorph() {
    const mod = game.modules.get('metamorph');
    return mod?.active ? (mod.api ?? globalThis.Metamorph ?? null) : null;
  }

  /**
   * The character a Metamorph form belongs to (null for anything that is not a morph copy).
   * @param {Actor|null} actor
   * @returns {Actor|null}
   */
  static mainActorOf(actor) {
    const id = actor?.flags?.metamorph?.temp?.mainActorId;
    return id ? (game.actors.get(id) ?? null) : null;
  }

  /** Flat damage a Beast form adds to its attacks (Savagery). 0 for non-forms. */
  static beastDamageBonus(actor) {
    return Number(this.mainActorOf(actor)?.system?.beastDamageBonus) || 0;
  }

  /**
   * Does this attacker ignore the target's Immune to damage of `damageType`? (Beast Mode: the
   * Beast's attacks ignore Immune to non-Relic damage — i.e. the physical types.)
   * @param {Actor|null} attacker
   * @param {string} damageType
   */
  static ignoresNonRelicImmune(attacker, damageType) {
    if (!CONFIG.VAGABOND.nonRelicImmuneTypes?.includes(damageType)) return false;
    return this.mainActorOf(attacker)?.system?.beastIgnoreImmune === true;
  }

  /** The actor's token on the current scene — its own, or the one a Metamorph form took over. */
  static tokenOf(actor) {
    const own = actor.getActiveTokens?.()?.[0];
    if (own) return own;
    return canvas.tokens?.placeables.find(t => t.document.flags?.metamorph?.mainActorId === actor.id) ?? null;
  }

  /** Level for the Polymorph Spell: Level + Savagery. */
  static effectiveLevel(actor) {
    const level = actor.system.attributes?.level?.value ?? 1;
    return level + (Number(actor.system.polymorphLevelBonus) || 0);
  }

  /** Metamorph filter: Beasts with HD no higher than `level`, from the world and every Actor pack. */
  static beastFilter(level) {
    const sources = ['world', ...game.packs.filter(p => p.metadata.type === 'Actor').map(p => p.collection)];
    return {
      sources,
      criteria: { rules: [
        { path: 'system.beingType', value: 'Beasts' },
        { path: 'system.hd', value: `<=${level}` },
      ] },
    };
  }

  /** Name of a picker result ({actorId, packId}) for chat. */
  static formName(choice) {
    if (!choice) return '';
    if (choice.packId) return game.packs.get(choice.packId)?.index.get(choice.actorId)?.name ?? choice.actorId;
    return game.actors.get(choice.actorId)?.name ?? choice.actorId;
  }

  static #L(key, data = {}) {
    return game.i18n.format(`VAGABOND.Druid.${key}`, data);
  }

  /* -------------------------------------------- */
  /*  Polymorph (spell button)                    */
  /* -------------------------------------------- */

  /**
   * Polymorph spell button (`system:druid.polymorph`): for each Target (or the caster when none)
   * pick a Beast with HD ≤ Level (+ Savagery) through Metamorph and swap the token.
   * @param {{actor: Actor, token: Token|null, targets: Token[]}} scope - item-macro scope
   */
  static async polymorph({ actor, token, targets }) {
    const MM = this.metamorph();
    if (!MM) {
      ui.notifications.warn(this.#L('NoMetamorph'));
      return;
    }
    if (!actor) return;
    const tokens = (targets?.length ? targets : [token ?? this.tokenOf(actor)]).filter(Boolean);
    if (!tokens.length) {
      ui.notifications.warn(this.#L('NoToken'));
      return;
    }

    const level = this.effectiveLevel(actor);
    const { VagabondChatCard } = await import('./chat-card.mjs');
    for (const t of tokens) {
      const doc = t.document ?? t;
      const choice = await MM.polymorph(t, {
        title: this.#L('PickerTitle', { level }),
        filter: this.beastFilter(level),
        hpMode: 'keep-original',
      });
      if (!choice) continue;

      const targetName = doc.name;
      let description;
      if (choice.revert) {
        description = this.#L('Reverted', { name: targetName });
      } else {
        description = this.#L('Polymorphed', { caster: actor.name, name: targetName, form: this.formName(choice) });
        // Beast Mode: sole Target of your own Polymorph → continual, no Focus
        if (tokens.length === 1 && actor.system.polymorphContinual === true
          && (doc.actor?.id === actor.id || this.mainActorOf(doc.actor)?.id === actor.id)) {
          description += ` ${this.#L('Continual')}`;
        }
      }
      await VagabondChatCard.featureCard(actor, { title: this.#L('PolymorphTitle'), description: `<p>${description}</p>` });
    }
  }

  /* -------------------------------------------- */
  /*  Force of Nature (feature button)            */
  /* -------------------------------------------- */

  /**
   * Force of Nature (`system:druid.forceOfNature`): once per Shift, at 0 HP, polymorph into a Beast
   * and regain HP equal to its Statblock. The once-per-Shift flag clears when the character Rests.
   * @param {{actor: Actor}} scope
   */
  static async forceOfNature({ actor }) {
    const MM = this.metamorph();
    if (!MM) {
      ui.notifications.warn(this.#L('NoMetamorph'));
      return;
    }
    if (!actor?.isOwner) {
      ui.notifications.warn(this.#L('NotYours'));
      return;
    }
    if (actor.getFlag('vagabond', 'forceOfNatureUsed') === true) {
      ui.notifications.warn(this.#L('ForceUsed', { name: actor.name }));
      return;
    }
    if ((actor.system.health?.value ?? 0) > 0) {
      ui.notifications.warn(this.#L('ForceNotZero', { name: actor.name }));
      return;
    }
    const token = this.tokenOf(actor);
    if (!token) {
      ui.notifications.warn(this.#L('NoToken'));
      return;
    }

    const level = this.effectiveLevel(actor);
    const choice = await MM.promptForm(token, {
      title: this.#L('ForcePicker', { level }),
      filter: this.beastFilter(level),
      revert: false,
    });
    if (!choice || choice.revert) return;

    const beast = choice.packId
      ? await game.packs.get(choice.packId)?.getDocument(choice.actorId)
      : game.actors.get(choice.actorId);
    const beastHp = Number(beast?.system?.health?.max) || 0;
    const max = actor.system.health?.max ?? beastHp;
    const regained = Math.min(beastHp, max);

    // HP first so a Metamorph HP-transfer mode carries the regained value into the form
    await actor.update({ 'system.health.value': regained });
    const res = await MM.morph(token, choice, { hpMode: 'keep-original' });
    if (!res?.ok) {
      await actor.update({ 'system.health.value': 0 });
      return;
    }
    await actor.setFlag('vagabond', 'forceOfNatureUsed', true);

    const { VagabondChatCard } = await import('./chat-card.mjs');
    await VagabondChatCard.featureCard(actor, {
      title: game.i18n.localize('VAGABOND.Druid.ForceTitle'),
      description: `<p>${this.#L('ForceDone', { name: actor.name, form: this.formName(choice), hp: regained })}</p>`,
    });
  }
}
