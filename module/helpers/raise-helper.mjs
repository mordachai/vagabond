import { VagabondRollBuilder } from './roll-builder.mjs';
import { NpcSenses } from './npc-senses.mjs';
import { macroNotify } from './item-macro.mjs';
import { SystemFolders } from './system-folders.mjs';
import { isActiveGM } from './gm-relay.mjs';

/**
 * Raise Spell — "Corpses in the area of non-Artificial or Undead Beings with cumulative HD no higher than your
 * Level rise as an Undead under your control for the duration. Afterward, any Undead you raised this way die and
 * can't be raised by this Spell again. You can command your raised Undead when you Focus on this Cast, using your
 * Cast Skill for Checks they make." Changes: it is an Undead; Darksight, Immune to Poison, Weak to Silvered
 * Weapons, can't be Sickened.
 *
 * Cast gate (`registerCastGate('spell.raise')`, before any roll or Mana): Living Targets and corpses that can't
 * rise (Artificial / Undead, already raised once, a player's Character) are ignored; the Cast is blocked only
 * when no corpse can rise, or none fits within the caster's Level.
 *
 * Hit macro `system:spell.raise` (runAsGM): corpses rise in Target order while the cumulative HD (NPCs) / Level
 * (Characters) stays within the caster's Level; the rest are listed "too strong". Each raised corpse becomes a
 * world copy of its actor in the "Undead Army / <caster>" folder (flagged `undeadArmy`, never matched by name),
 * owned by the caster's players, full HP, statuses cleared, plus one "Raise: Undead" effect carrying the book
 * changes (stamped `spellTracker`, so it ends with the Focus like the Trackers). The token is relinked to the
 * copy; `flags.vagabond.raised` keeps what is needed to put the corpse back.
 *
 * Afterward (`release`, active GM): when the "Raise: Undead" effect goes (Focus dropped or removed by hand) or
 * the Undead is Dead again, it stays Dead, flagged `raiseSpent` (black skull on the token). `cleanup()` (GM, Vagabond
 * Tools scene button / API) later puts its tokens back on the original actor and deletes the copy.
 *
 * Command: an action of a commanded Being (`flags.vagabond.commandedBy`) is a Check with the caster's Cast Skill
 * while the caster Focuses on the Cast (`rollCommandCheck`, used by VagabondChatCard.npcAction).
 */
export class RaiseHelper {

  static COMMAND = 'system:spell.raise';
  /** Being types whose corpses never rise ("non-Artificial or Undead"). */
  static BLOCKED_TYPES = ['Artificials', 'Undead'];

  static #releasing = new Set();

  /** Register the hit macro + cast gate. Synchronous, called from init. */
  static registerMacroHandlers(registerMacroHandler, registerCastGate) {
    registerMacroHandler('spell.raise', (scope) => this.raise(scope));
    registerCastGate('spell.raise', (ctx) => this.castGate(ctx));
  }

  /* -------------------------------------------- */
  /*  Rules                                       */
  /* -------------------------------------------- */

  /** Being type of an actor (NPC field, or a Character's ancestry / override). */
  static beingTypeOf(actor) {
    if (actor.type === 'npc') return actor.system.beingType;
    return actor.system.ancestryData?.beingType ?? actor.system.attributes?.beingType ?? 'Humanlike';
  }

  /** HD of an NPC, Level of anyone else. */
  static rankOf(actor) {
    if (actor.type === 'npc') return Number(actor.system.hd) || 0;
    return Number(actor.system.attributes?.level?.value) || 0;
  }

  /** This corpse already rose once (token or, for a linked actor, the actor). */
  static isSpent(tokenDoc) {
    return !!(tokenDoc.getFlag('vagabond', 'raiseSpent') || tokenDoc.actor?.getFlag('vagabond', 'raiseSpent'));
  }

  /**
   * Why a Target can't rise, or null when it can. 'alive' / 'notBeing' are not corpses (ignored);
   * the other reasons block the Cast.
   * @returns {null|'notBeing'|'alive'|'spent'|'player'|'beingType'}
   */
  static #reason(tokenDoc) {
    const actor = tokenDoc?.actor;
    if (!actor || !['npc', 'character'].includes(actor.type)) return 'notBeing';
    if (!actor.statuses?.has('dead')) return 'alive';
    if (this.isSpent(tokenDoc) || actor.getFlag('vagabond', 'raised')) return 'spent';
    if (actor.type === 'character' && actor.hasPlayerOwner) return 'player';
    if (this.BLOCKED_TYPES.includes(this.beingTypeOf(actor))) return 'beingType';
    return null;
  }

  /**
   * Sort the Targets: corpses that rise (in Target order, cumulative HD within `level`), corpses too strong for
   * what is left, and corpses that can't rise.
   * @param {TokenDocument[]} docs
   * @param {number} level
   */
  static plan(docs, level) {
    const rise = [], tooStrong = [], blocked = [];
    let total = 0;
    for (const doc of docs) {
      const reason = this.#reason(doc);
      if (reason === 'alive' || reason === 'notBeing') continue;
      if (reason) { blocked.push({ doc, reason }); continue; }
      const hd = this.rankOf(doc.actor);
      if (total + hd > level) { tooStrong.push({ doc, hd }); continue; }
      total += hd;
      rise.push({ doc, hd });
    }
    return { rise, tooStrong, blocked, total };
  }

  static #docs(tokens) {
    return (tokens ?? []).map(t => t?.document ?? t).filter(d => d?.documentName === 'Token');
  }

  static #esc(s) { return foundry.utils.escapeHTML(String(s ?? '')); }


  /** Cast gate: block the Cast (before any roll or Mana) only when no Target corpse can rise. */
  static castGate({ actor, tokens }) {
    // Corpses that can't rise (Artificial / Undead, already raised, a player's Character) are ignored like
    // the living, so an area full of them needs no deselecting
    const { rise, tooStrong } = this.plan(this.#docs(tokens), this.rankOf(actor));
    if (!rise.length && !tooStrong.length) return game.i18n.localize('VAGABOND.Raise.NoCorpse');
    if (!rise.length) return game.i18n.format('VAGABOND.Raise.NoneFit', { level: this.rankOf(actor) });
    return null;
  }

  /* -------------------------------------------- */
  /*  Raise (GM)                                  */
  /* -------------------------------------------- */

  /** Hit macro: raise the Target corpses. Runs on the GM (runAsGM). */
  static async raise(scope) {
    if (!game.user.isGM) return macroNotify('warn', game.i18n.localize('VAGABOND.Raise.NeedGM'));
    const caster = scope?.actor;
    if (!caster) return;
    const spell = scope?.item?.id ? scope.item : null;
    const level = this.rankOf(caster);
    const { rise, tooStrong } = this.plan(this.#docs(scope?.targets), level);
    if (!rise.length && !tooStrong.length) {
      return macroNotify('warn', game.i18n.localize('VAGABOND.Raise.NoCorpse'));
    }

    const lines = [];
    const risen = [];
    for (const { doc, hd } of rise) {
      try {
        await this.#raiseOne(doc, caster, spell);
        risen.push(doc);
        lines.push(game.i18n.format('VAGABOND.Raise.Rose', { target: this.#esc(doc.name), hd }));
      } catch (err) {
        console.error(`vagabond | Raise: could not raise ${doc.uuid}`, err);
        lines.push(game.i18n.format('VAGABOND.Raise.Failed', { target: this.#esc(doc.name) }));
      }
    }
    for (const { doc, hd } of tooStrong) {
      lines.push(game.i18n.format('VAGABOND.Raise.TooStrong', { target: this.#esc(doc.name), hd, level }));
    }

    // Standard action card: the Raised Undead are its Targets, the outcome lines its description
    const { VagabondChatCard } = await import('./chat-card.mjs');
    await VagabondChatCard.createActionCard({
      actor: caster,
      item: spell,
      title: spell?.name ?? scope?.itemName ?? '',
      subtitle: caster.name,
      description: `<ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>`,
      targetsAtRollTime: risen.map(doc => ({
        tokenId: doc.id, sceneId: doc.parent?.id, actorId: doc.actorId, actorName: doc.name, actorImg: doc.texture.src,
      })),
    });
  }

  /** One corpse rises: world copy in the caster's Undead Army folder, token relinked to it. */
  static async #raiseOne(doc, caster, spell) {
    const source = doc.actor;
    const owners = game.users.filter(u => !u.isGM && caster.testUserPermission(u, 'OWNER'));
    const casterToken = caster.getActiveTokens(false, true)[0];
    const disposition = casterToken?.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY;
    const stamp = { casterUuid: caster.uuid, casterName: caster.name, spellId: spell?.id ?? null, spellName: spell?.name ?? '' };

    const data = source.toObject();
    delete data._id;
    data.name = doc.name;
    data.folder = (await this.#armyFolder(caster)).id;
    data.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
    for (const u of owners) data.ownership[u.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    // The corpse's statuses (Dead, …) end; the book changes ride one effect, created below once the token is
    // linked (an effect embedded in Actor.create fires no createActiveEffect, so Automated Animations missed it)
    data.effects = (data.effects ?? []).filter(e => !e.statuses?.length);
    foundry.utils.setProperty(data, 'system.health.value', source.system.health?.max ?? data.system?.health?.max ?? 1);
    data.prototypeToken = foundry.utils.mergeObject(data.prototypeToken ?? {}, {
      name: doc.name, actorLink: true, disposition, texture: { src: doc.texture.src },
    }, { inplace: false });
    data.flags ??= {};
    data.flags.vagabond = {
      ...(data.flags.vagabond ?? {}),
      raised: {
        casterUuid: caster.uuid,
        spellId: stamp.spellId,
        sourceActorId: doc.actorId,
        wasLinked: !!doc.actorLink,
        disposition: doc.disposition,
      },
      commandedBy: { casterUuid: caster.uuid, spellId: stamp.spellId },
    };

    const undead = await Actor.implementation.create(data);
    // The token keeps its way back too, so Clean Up still finds the corpse if the copy is deleted by hand
    const raisedFrom = { sourceActorId: doc.actorId, wasLinked: !!doc.actorLink, disposition: doc.disposition };
    await doc.update({ actorId: undead.id, actorLink: true, disposition, 'flags.vagabond.raisedFrom': raisedFrom });
    await this.#setDefeated(doc, false);
    await undead.createEmbeddedDocuments('ActiveEffect', [this.#undeadEffect(source.type, spell, stamp)]);

    if (undead.type === 'npc') await NpcSenses.syncActorTokens(undead);
    else NpcSenses.queueCharacterSync(undead);
  }

  /** The "Raised" Tracker (`CONFIG.VAGABOND.statusEffectDefinitions` id `raised`), ending with the Focus. */
  static #undeadEffect(actorType, spell, stamp) {
    const def = CONFIG.VAGABOND.statusEffectDefinitions.find(s => s.id === 'raised');
    // Only this actor type's Being type key (the definition carries both for a by-hand toggle)
    const otherTypeKey = actorType === 'npc' ? 'system.attributes.beingType' : 'system.beingType';
    return {
      name: game.i18n.localize(def.name),
      img: def.img,
      statuses: ['raised'],
      description: '',
      flags: { vagabond: { spellTracker: stamp, raiseUndead: true } },
      system: {
        changes: def.changes
          .filter(c => c.key !== otherTypeKey)
          .map(c => ({ ...c, phase: 'initial', priority: null })),
      },
    };
  }

  /** "Undead Army" root folder + the caster's sub-folder (found by flag, created when missing). */
  static async #armyFolder(caster) {
    const actorFolders = game.folders.filter(f => f.type === 'Actor');
    let root = actorFolders.find(f => f.getFlag('vagabond', 'undeadArmy') && !f.getFlag('vagabond', 'undeadArmyCaster'));
    root ??= await Folder.implementation.create({
      name: game.i18n.localize('VAGABOND.Raise.FolderName'), type: 'Actor', color: '#2b2233',
      folder: await SystemFolders.rootId('Actor'),
      flags: { vagabond: { undeadArmy: true } },
    });
    let sub = actorFolders.find(f => f.getFlag('vagabond', 'undeadArmyCaster') === caster.uuid);
    sub ??= await Folder.implementation.create({
      name: caster.name, type: 'Actor', folder: root.id,
      flags: { vagabond: { undeadArmy: true, undeadArmyCaster: caster.uuid } },
    });
    return sub;
  }

  /** Mark the token's combatants (un)defeated. */
  static async #setDefeated(doc, defeated) {
    for (const combat of game.combats) {
      for (const c of combat.combatants) {
        if (c.tokenId === doc.id && c.sceneId === doc.parent?.id && c.defeated !== defeated) await c.update({ defeated });
      }
    }
  }

  /* -------------------------------------------- */
  /*  Afterward (active GM)                       */
  /* -------------------------------------------- */

  /**
   * The raised Undead dies and can't be raised again: Dead, `raiseSpent` (black skull), no longer commanded.
   * Nothing is swapped or deleted here — mid-combat token / actor swaps break open sheets, the tracker and
   * pending updates. The GM puts the corpses back with `cleanup()` (Vagabond Tools button, or
   * `game.vagabond.raise.cleanup()`).
   * @param {Actor} undead
   */
  static async release(undead) {
    if (!isActiveGM()) return;
    if (!undead?.getFlag('vagabond', 'raised') || undead.getFlag('vagabond', 'raiseSpent')) return;
    if (this.#releasing.has(undead.id)) return;
    this.#releasing.add(undead.id);
    try {
      // Flag first: the Dead toggle below fires createActiveEffect → release again (stops on raiseSpent)
      await undead.update({ 'flags.vagabond.raiseSpent': true, 'flags.vagabond.-=commandedBy': null });
      if (!undead.statuses.has('dead')) await undead.toggleStatusEffect('dead', { active: true });
      for (const t of this.#tokensOf(undead.id)) {
        await t.update({ 'flags.vagabond.raiseSpent': true });
        await this.#setDefeated(t, true);
      }
    } catch (err) {
      console.error(`vagabond | Raise: could not end ${undead.uuid}`, err);
    } finally {
      this.#releasing.delete(undead.id);
    }
  }

  static #tokensOf(actorId) {
    return game.scenes.contents.flatMap(s => s.tokens.contents.filter(t => t.actorId === actorId));
  }

  /** Undead Army copies whose Undead died. */
  static #spentCopies() {
    return game.actors.filter(a => a.getFlag('vagabond', 'raised') && a.getFlag('vagabond', 'raiseSpent'));
  }

  /**
   * GM (Vagabond Tools "Clean Up Undead Army" button, or `game.vagabond.raise.cleanup()`): put every spent Undead's corpse back — its tokens return to the original actor (Dead, black skull),
   * the Undead Army copy is deleted, empty caster folders go. Without the original actor the copy stays as
   * the corpse. Tokens whose copy was deleted by hand are fixed from their own `raisedFrom` flag.
   */
  static async cleanup() {
    if (!game.user.isGM) return macroNotify('warn', game.i18n.localize('VAGABOND.Raise.NeedGM'));
    const spent = this.#spentCopies();
    const spentIds = new Set(spent.map(a => a.id));
    let restored = 0;
    for (const t of game.scenes.contents.flatMap(s => s.tokens.contents)) {
      const current = game.actors.get(t.actorId);
      if (current && !spentIds.has(current.id)) continue;
      const from = t.getFlag('vagabond', 'raisedFrom') ?? current?.getFlag('vagabond', 'raised');
      const source = from ? game.actors.get(from.sourceActorId) : null;
      if (!source || source.id === t.actorId) continue;
      try {
        await this.#restoreToken(t, source, from);
        restored++;
      } catch (err) {
        console.error(`vagabond | Raise: could not put back ${t.uuid}`, err);
      }
    }
    let removed = 0;
    for (const copy of spent) {
      const source = game.actors.get(copy.getFlag('vagabond', 'raised').sourceActorId);
      if (!source || this.#tokensOf(copy.id).length) continue;
      await copy.delete();
      removed++;
    }
    for (const f of game.folders.filter(f => f.type === 'Actor' && f.getFlag('vagabond', 'undeadArmyCaster'))) {
      if (!f.contents.length && !f.children.length) await f.delete();
    }
    ui.notifications.info(game.i18n.format('VAGABOND.Raise.CleanedUp', { restored, removed }));
  }

  /** One token back to its original actor, as a corpse that can't rise again. */
  static async #restoreToken(t, source, from) {
    // actorId + link only: writing `delta` in the same update fails in core (EmbeddedCollectionDeltaField)
    await t.update({
      actorId: source.id, actorLink: !!from.wasLinked, disposition: from.disposition ?? t.disposition,
      'flags.vagabond.raiseSpent': true, 'flags.vagabond.-=raisedFrom': null,
    });
    if (from.wasLinked) await source.setFlag('vagabond', 'raiseSpent', true);
    const actor = t.actor;
    if (!actor) return;
    if (!from.wasLinked) await actor.update({ 'system.health.value': 0 });
    if (!actor.statuses.has('dead')) await actor.toggleStatusEffect('dead', { active: true });
    await this.#setDefeated(t, true);
  }

  /** Register the hooks. Synchronous, called once at module load. */
  static registerHooks() {
    // "Raise: Undead" removed (Focus dropped → SpellTrackerHelper clears it, or by hand)
    Hooks.on('deleteActiveEffect', (effect) => {
      if (!effect.flags?.vagabond?.raiseUndead) return;
      const actor = effect.parent;
      if (actor?.documentName === 'Actor' && actor.getFlag('vagabond', 'raised')) this.release(actor);
    });
    // Dead again
    Hooks.on('createActiveEffect', (effect) => {
      if (!effect.statuses?.has('dead')) return;
      const actor = effect.parent;
      if (actor?.documentName === 'Actor' && actor.getFlag('vagabond', 'raised')) this.release(actor);
    });
  }

  /* -------------------------------------------- */
  /*  Command (Checks with the caster's Cast Skill) */
  /* -------------------------------------------- */

  /**
   * Who commands this Being. `focusing` = the caster Focuses on the Cast (required to command).
   * @returns {{caster: Actor, skillKey: string|null, focusing: boolean}|null}
   */
  static commander(actor) {
    const cmd = actor?.getFlag?.('vagabond', 'commandedBy');
    if (!cmd?.casterUuid) return null;
    const caster = fromUuidSync(cmd.casterUuid);
    if (!caster) return null;
    const focusing = !cmd.spellId || (caster.system.focus?.spellIds ?? []).includes(cmd.spellId);
    return { caster, skillKey: caster.system.classData?.manaSkill ?? null, focusing };
  }

  /**
   * The Check a commanded Being makes for an action: the caster's Cast Skill (Difficulty, roll bonuses, crit
   * range); Favor / Hinder from the Being's own statuses and the target votes.
   * @param {Actor} actor - the commanded Being
   * @param {{caster: Actor, skillKey: string}} cmd
   * @param {Actor|null} target - first Target
   * @param {string} attackType
   * @returns {Promise<{roll: Roll, difficulty: number, isHit: boolean, isCritical: boolean, label: string}|null>}
   */
  static async rollCommandCheck(actor, cmd, target, attackType) {
    const skill = cmd.skillKey ? cmd.caster.system.skills?.[cmd.skillKey] : null;
    if (!skill) return null;
    const rollData = cmd.caster.getRollData();
    const favorHinder = VagabondRollBuilder.mergeFavorHinder(
      actor.system.favorHinder || 'none',
      ...VagabondRollBuilder.targetingVotes(actor, target, { melee: attackType === 'melee' }),
    );
    const roll = await VagabondRollBuilder.buildAndEvaluateD20WithRollData(rollData, favorHinder);
    const d20 = roll.terms.find(t => t.faces === 20)?.results?.[0]?.result ?? 0;
    return {
      roll,
      difficulty: skill.difficulty,
      isHit: roll.total >= skill.difficulty,
      isCritical: d20 >= VagabondRollBuilder.calculateCritThreshold(rollData, cmd.skillKey),
      label: game.i18n.format('VAGABOND.Raise.CheckLabel', { skill: skill.label, caster: cmd.caster.name }),
    };
  }

  /* -------------------------------------------- */
  /*  Migration                                   */
  /* -------------------------------------------- */

}
