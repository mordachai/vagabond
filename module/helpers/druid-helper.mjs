import { isActiveGM } from './gm-relay.mjs';
import { FeatureRules } from './feature-rules.mjs';
import { FocusLink } from './focus-link.mjs';
import { ConjurePicker } from '../applications/conjure-picker.mjs';
import { NoticeChatCards } from './notice-chat-cards.mjs';

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
 *
 * A Focused Polymorph lasts while the caster Focuses: the morphed tokens are kept on the caster
 * (`flags.vagabond.polymorphFocus.<spellId>` = token uuids) and revert when that Focus ends.
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

  /**
   * Pick one Beast with HD ≤ `level` in the system's picker (Metamorph's filter query, not its dialog).
   * `revertDoc` = token offered its own form as a first tile while it wears a form (null = never).
   * @returns {Promise<{actorId, packId}|{revert: true}|null>}
   */
  static async #pickBeast(MM, level, { title, hint, revertDoc = null }) {
    const getProperty = foundry.utils.getProperty;
    const hdOf = a => getProperty(a.packId
      ? game.packs.get(a.packId)?.index.get(a.actorId)
      : game.actors.get(a.actorId), 'system.hd');
    const found = (await MM.queryFilter(this.beastFilter(level))) ?? [];
    const candidates = found
      .map(a => {
        const hd = hdOf(a);
        return {
          actorId: a.actorId,
          packId: a.packId ?? null,
          name: a.name,
          img: a.img || 'icons/svg/mystery-man.svg',
          cost: 1,
          hd: Number(hd) || 0,
          badge: hd != null ? game.i18n.format('VAGABOND.Conjure.HD', { hd }) : '',
        };
      })
      .sort((x, y) => x.hd - y.hd || x.name.localeCompare(y.name));
    const main = revertDoc ? this.mainActorOf(revertDoc.actor) : null;
    if (main) candidates.unshift({ revert: true, name: main.name, img: main.img || 'icons/svg/mystery-man.svg', cost: 0 });
    if (!candidates.length) {
      ui.notifications.warn(this.#L('NoBeasts', { level }));
      return null;
    }
    const entry = (await ConjurePicker.prompt({ title, hint, budget: 1, candidates, single: true }))?.picks?.[0]?.entry;
    if (!entry) return null;
    return entry.revert ? { revert: true } : { actorId: entry.actorId, packId: entry.packId };
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
   * Polymorph spell button (`system:druid.polymorph`): pick one Beast with HD ≤ Level (+ Savagery) in the
   * system's picker and swap every Target's token to it through Metamorph (the caster's when there are none).
   * @param {{actor: Actor, token: Token|null, targets: Token[]}} scope - item-macro scope
   */
  static async polymorph({ actor, item, token, targets }) {
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
    const kept = [];   // tokens this Focused Cast keeps morphed (revert when the Focus ends)
    const lines = [];  // one chat card for the whole Cast: a line per Target
    // "The Target becomes a Beast of your choice": one pick for the whole Cast, every Target takes that form
    const docs = tokens.map(t => t.document ?? t);
    const choice = await this.#pickBeast(MM, level, {
      title: this.#L('PickerTitle', { level }),
      hint: this.#L('PickerHint', { level }),
      revertDoc: docs[0],
    });
    if (!choice) return;
    // The Target keeps its HP (book); the form remembers it, so its revert carries the HP back. A Spell: the
    // caster's player may Polymorph a Target they don't own (the GM performs the swap).
    const swapOpts = { hpMode: 'keep-original', ignoreOwnership: true };
    for (const doc of docs) {
      let description;
      if (choice.revert) {
        // The picker's "own form" cell: every morphed Target returns, the others are already themselves
        if (!this.mainActorOf(doc.actor)) continue;
        if (!(await MM.revert(doc, swapOpts))?.ok) continue;
        description = this.#L('Reverted', { name: doc.name });
      } else {
        if (!(await MM.morph(doc, choice, swapOpts))?.ok) continue;
        description = this.#L('Polymorphed', { caster: actor.name, name: doc.name, form: this.formName(choice) });
        // Beast Mode: sole Target of your own Polymorph → continual, no Focus
        if (docs.length === 1 && actor.system.polymorphContinual === true
          && (doc.actor?.id === actor.id || this.mainActorOf(doc.actor)?.id === actor.id)) {
          description += ` ${this.#L('Continual')}`;
          // Polymorph opens Focused (focusOnCast); a continual self-Polymorph needs no Focus
          if (item?.id && (actor.system.focus?.spellIds ?? []).includes(item.id)) {
            await FocusLink.setFocus(actor, item.id, false);
          }
        } else {
          kept.push(doc.uuid);
        }
      }
      lines.push(description);
    }
    if (lines.length) {
      await NoticeChatCards.featureCard(actor, { title: this.#L('PolymorphTitle'), description: this.#lines(lines) });
    }
    // Book: the Spell lasts while you Focus on it. Remember the forms of a Focused Cast on the caster, so
    // ending the Focus (drop, Focusing removed, another Cast taking it) reverts them (#onFocusDropped).
    if (kept.length && item?.id && (actor.system.focus?.spellIds ?? []).includes(item.id)) {
      const path = `flags.vagabond.polymorphFocus.${item.id}`;
      const list = foundry.utils.getProperty(actor, path) ?? [];
      await actor.update({ [path]: [...new Set([...list, ...kept])] });
    }
  }

  /** Register the hooks. Synchronous, called once at module load. */
  static registerHooks() {
    // Beast form: the Druid's Savagery bonus on NPC action damage; Beast Mode ignores non-Relic Immune
    FeatureRules.on('npcDamageBonus', (actor) => this.beastDamageBonus(actor));
    FeatureRules.on('ignoresImmune', (attacker, damageType) => this.ignoresNonRelicImmune(attacker, damageType));
    // Active GM (SpellTrackerHelper fires it): the caster stopped Focusing on these Spells
    Hooks.on('vagabond.focusDropped', (caster, spellIds) => {
      this.#onFocusDropped(caster, spellIds).catch(err => console.error('vagabond | Polymorph: could not revert', err));
    });
  }

  /**
   * The Focus on a Polymorph ended: every token that Cast morphed goes back to its original (HP per the form's
   * mode). Tokens already back (picker, sheet menu) or deleted are skipped. Active GM.
   * @param {Actor} caster
   * @param {string[]} spellIds
   */
  static async #onFocusDropped(caster, spellIds) {
    const kept = caster.flags?.vagabond?.polymorphFocus ?? {};
    const ids = spellIds.filter(id => kept[id]?.length);
    if (!ids.length) return;
    await caster.update(Object.fromEntries(ids.map(id => [`flags.vagabond.polymorphFocus.${id}`, []])));
    const MM = this.metamorph();
    if (!MM) return;
    const lines = [];
    for (const uuid of ids.flatMap(id => kept[id])) {
      const doc = await fromUuid(uuid);
      if (!doc || !this.mainActorOf(doc.actor)) continue;
      const res = await MM.revert(doc, { ignoreOwnership: true });
      if (res?.ok) lines.push(this.#L('Reverted', { name: doc.name }));
    }
    if (!lines.length) return;
    await NoticeChatCards.featureCard(caster, {
      title: this.#L('PolymorphTitle'),
      description: `<p>${this.#L('FocusEnded')}</p>${this.#lines(lines)}`,
    });
  }

  /** Chat card body: the sentences in one paragraph, joined by commas. */
  static #lines(lines) {
    return `<p>${lines.map(l => l.trim().replace(/\.$/, '')).join(', ')}.</p>`;
  }

  /* -------------------------------------------- */
  /*  Back to the original form                   */
  /* -------------------------------------------- */

  /**
   * A form's token opens the Beast's sheet, so the original's sheet (and its Polymorph button) is out of
   * reach: the form's sheet header offers these two (`VagabondNPCSheet._getHeaderControls`).
   * Revert the form's token to the original actor (HP follows the mode the form was made with).
   * @param {Actor} form  a Metamorph form copy
   */
  static async revertForm(form) {
    const MM = this.metamorph();
    if (!MM) {
      ui.notifications.warn(this.#L('NoMetamorph'));
      return;
    }
    const main = this.mainActorOf(form);
    const token = form?.getActiveTokens?.()?.[0];
    if (!main || !token) {
      ui.notifications.warn(this.#L('NoToken'));
      return;
    }
    const res = await MM.revert(token, { ignoreOwnership: true });
    if (!res?.ok) return;
    await NoticeChatCards.featureCard(main, {
      title: this.#L('PolymorphTitle'),
      description: `<p>${this.#L('Reverted', { name: token.document?.name ?? main.name })}</p>`,
    });
  }

  /** Open the original actor's sheet from its form. */
  static openOriginalSheet(form) {
    const main = this.mainActorOf(form);
    if (!main?.testUserPermission(game.user, 'OBSERVER')) {
      ui.notifications.warn(this.#L('NotYours'));
      return;
    }
    main.sheet.render({ force: true });
  }

  /**
   * The Focusing status (ring animation) lives on the original actor, but a morphed token shows its form's
   * statuses: mirror it onto the original's forms. Active GM only (called from create/deleteActiveEffect and
   * the `metamorph.morph` hook in vagabond.mjs).
   * @param {Actor} main  the original actor
   */
  static async syncFormFocus(main) {
    if (!main || !isActiveGM()) return;
    const on = main.statuses.has('focusing');
    for (const form of game.actors.filter(a => a.flags?.metamorph?.temp?.mainActorId === main.id)) {
      if (form.statuses.has('focusing') !== on) await form.toggleStatusEffect('focusing', { active: on });
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
    const choice = await this.#pickBeast(MM, level, {
      title: this.#L('ForcePicker', { level }),
      hint: this.#L('ForceHint', { level }),
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

    await NoticeChatCards.featureCard(actor, {
      title: game.i18n.localize('VAGABOND.Druid.ForceTitle'),
      description: `<p>${this.#L('ForceDone', { name: actor.name, form: this.formName(choice), hp: regained })}</p>`,
    });
  }
}
