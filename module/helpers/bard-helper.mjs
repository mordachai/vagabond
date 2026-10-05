import { combatRollData } from './rule-rolldata.mjs';
import { emitSocket } from './socket-helper.mjs';

const BARD_CLASS_ID = '3BTEyMIzoyGVTuxz';

/** d20 check categories each Virtuoso benefit's Favor die applies to (Overtuned reads these). */
const BOON_CHECKS = { inspiration: [], resolve: ['save'], valor: ['attack', 'cast'] };

/**
 * Bard — Virtuoso, Overtuned, Climax.
 *
 * Virtuoso (a feature action button → chat card with one button per benefit): the Bard performs
 * (Performance Check); on a pass the Group gains ONE benefit for that Round. The three benefits are plain Active Effects stored (untransferred) on the Bard class
 * item, flagged `flags.vagabond.virtuosoBoon = inspiration | resolve | valor`; they are copied
 * onto each Group member:
 *   - Inspiration → `system.healingBonusDice` + 1d6 (pipeline adds it to HP-restoring rolls)
 *   - Resolve     → `system.favorChecks` + save   (one Favor vote on Saves)
 *   - Valor       → `system.favorChecks` + attack, cast
 *
 * Each copy is spent by use (`flags.vagabond.consumeOn`, see use-effects.mjs). Manual-first: nothing
 * needs a Combat. The copies are ordinary effects with a switch, so at a table without the tracker
 * the player turns them off by hand. Inside a combat the copy gets
 * `duration.expiry = 'roundEnd'` so core expires it at the end of that Round.
 *
 * Climax (Lv 10): the copies also set `system.bonusDiceExplode` so the recipient's Favor die and
 * healing bonus dice explode. Overtuned (Lv 2/6/10): when the recipient's Favor die pushes a d20
 * from below the threshold (21 / 20 / 19) to at-or-above it, the Bard gains 1 Luck.
 */
export class BardHelper {

  /* -------------------------------------------- */
  /*  Class data                                  */
  /* -------------------------------------------- */

  /** The Bard class item on an actor (carries the benefit templates), if any. */
  static bardClass(actor) {
    return actor?.items?.find(i => i.type === 'class' && i.effects.some(e => e.flags?.vagabond?.virtuosoBoon)) ?? null;
  }

  /** Overtuned threshold for a Bard level: 21+ at 2, 20+ at 6, 19+ at 10 (0 before Level 2). */
  static overtunedThreshold(level) {
    return level >= 2 ? 21 - Math.floor((level - 2) / 4) : 0;
  }

  /**
   * The Bard's Group: the Party sheet(s) listing the Bard; else the Bard plus the user's Targets;
   * else every player-owned character. The Bard is always included. Characters only (the
   * benefit effects use character fields).
   */
  static group(bard) {
    const parties = game.actors.filter(a => a.type === 'party' && a.system.members?.includes(bard.uuid));
    let actors;
    if (parties.length) {
      actors = parties.flatMap(p => (p.system.members ?? []).map(u => fromUuidSync(u)));
    } else {
      const targets = Array.from(game.user.targets).map(t => t.actor).filter(Boolean);
      actors = targets.length ? targets : game.actors.filter(a => a.type === 'character' && a.hasPlayerOwner);
    }
    actors = [bard, ...actors];
    const seen = new Set();
    return actors.filter(a => a?.type === 'character' && !seen.has(a.uuid) && seen.add(a.uuid));
  }

  /* -------------------------------------------- */
  /*  Virtuoso                                    */
  /* -------------------------------------------- */

  /**
   * Virtuoso (run from the feature's action button / HUD Belt): post a chat card with one
   * button per benefit. Picking one runs {@link BardHelper.perform}.
   * @param {{actor: Actor}} scope - macro scope
   */
  static async virtuoso({ actor }) {
    const bardClass = this.bardClass(actor);
    if (!bardClass) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Virtuoso.NoBoons'));
      return;
    }
    const { VagabondChatCard } = await import('./chat-card.mjs');
    const { buildMacroButtonHTML } = await import('./item-macro.mjs');

    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle(game.i18n.localize('VAGABOND.Virtuoso.Title'))
      .setSubtitle(actor.name)
      .setDescription(`<p>${game.i18n.localize('VAGABOND.Virtuoso.Pick')}</p>`);
    for (const e of bardClass.effects.filter(e => e.flags?.vagabond?.virtuosoBoon)) {
      const boon = e.flags.vagabond.virtuosoBoon;
      card.addFooterAction(buildMacroButtonHTML({
        cfg: {
          enabled: true,
          label: e.name.replace(/^Virtuoso:\s*/, ''),
          icon: e.flags.vagabond.virtuosoIcon || 'music',
          command: 'system:bard.perform',
        },
        slot: 'macro',
        actorUuid: actor.uuid,
        itemName: 'Virtuoso',
        extraScope: { boon },
      }));
    }
    await card.send();
  }

  /**
   * A benefit button was clicked: roll Performance for the Bard and, on a pass, give the
   * benefit to the Group.
   * @param {{actor: Actor, boon: string}} scope - macro scope (+ extraScope from the button)
   */
  static async perform({ actor: bard, boon }) {
    const L = (k, d = {}) => game.i18n.format(`VAGABOND.Virtuoso.${k}`, d);
    if (!bard?.isOwner) {
      ui.notifications.warn(L('NotYours'));
      return;
    }
    const template = this.bardClass(bard)?.effects.find(e => e.flags?.vagabond?.virtuosoBoon === boon);
    if (!template) return;

    // The Performance Check goes through the normal skill roll (favor/hinder, hooks, chat card)
    const { RollHandler } = await import('../sheets/handlers/roll-handler.mjs');
    const el = document.createElement('div');
    Object.assign(el.dataset, { roll: 'd20', key: 'performance', type: 'skill', label: game.i18n.localize('VAGABOND.Skills.Performance') });
    const roll = await new RollHandler({ actor: bard }, {}).roll({ preventDefault() {}, shiftKey: false, ctrlKey: false }, el);
    if (!roll) return;

    const difficulty = bard.system.skills?.performance?.difficulty ?? 10;
    const { VagabondChatCard } = await import('./chat-card.mjs');
    const boonName = template.name.replace(/^Virtuoso:\s*/, '');
    const title = `${game.i18n.localize('VAGABOND.Virtuoso.Title')}: ${boonName}`;
    if (roll.total < difficulty) {
      await VagabondChatCard.featureCard(bard, { title, description: `<p>${L('Failed', { name: bard.name })}</p>` });
      return;
    }
    const group = this.group(bard);
    await this.#relay(bard.uuid, boon, group.map(a => a.uuid));
    // The benefit's book text (Inspiration / Resolve / Valor) is the effect's description
    await VagabondChatCard.featureCard(bard, {
      title,
      description: `<p>${L('Passed', { name: bard.name, boon: boonName })}</p>${template.description ?? ''}`
        + `<p><strong>${L('Recipients')}:</strong> ${group.map(a => foundry.utils.escapeHTML(a.name)).join(', ')}</p>`,
    });
  }

  /** Apply as the GM, or ask the GM client to (players can't write other actors' effects). */
  static async #relay(bardUuid, boon, recipientUuids) {
    if (game.user.isGM) return this.apply({ bardUuid, boon, recipientUuids });
    if (!game.users.activeGM) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Virtuoso.NoGM'));
      return;
    }
    emitSocket('virtuosoApply', { bardUuid, boon, recipientUuids });
  }

  /**
   * GM side: replace this Bard's previous benefit everywhere, then copy the chosen one onto
   * each recipient. Registered as socket action `virtuosoApply`.
   */
  static async apply({ bardUuid, boon, recipientUuids }) {
    const bard = await fromUuid(bardUuid);
    const template = this.bardClass(bard)?.effects.find(e => e.flags?.vagabond?.virtuosoBoon === boon);
    if (!template) return;
    const level = bard.system.attributes?.level?.value ?? 1;

    // One benefit per Round: drop this Bard's earlier copies (incl. expired ones)
    const everyone = [...game.actors.contents, ...game.scenes.contents.flatMap(s =>
      s.tokens.contents.filter(t => !t.actorLink && t.actor).map(t => t.actor))];
    for (const actor of everyone) {
      const old = actor.effects.filter(e => e.flags?.vagabond?.virtuoso?.source === bardUuid).map(e => e.id);
      if (old.length) await actor.deleteEmbeddedDocuments('ActiveEffect', old);
    }

    for (const uuid of recipientUuids) {
      const actor = await fromUuid(uuid);
      if (!actor) continue;
      const data = template.toObject();
      delete data._id;
      delete data._stats;
      data.transfer = false;
      data.disabled = false;
      data.origin = bardUuid;
      // v14 tokens only draw non-temporary effects set to ALWAYS; a copy is created by hand
      data.showIcon = CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS;
      // In a tracked combat the benefit lasts that Round; otherwise it stays until switched off
      data.duration = combatRollData(actor).active ? { expiry: 'roundEnd' } : {};
      // Climax: the recipient's bonus dice explode
      if (level >= 10) {
        data.system.changes = [...(data.system.changes ?? []), { key: 'system.bonusDiceExplode', type: 'add', value: '1' }];
      }
      foundry.utils.setProperty(data, 'flags.vagabond.virtuoso', {
        source: bardUuid, boon, overtuned: this.overtunedThreshold(level),
      });
      try {
        await actor.createEmbeddedDocuments('ActiveEffect', [data]);
      } catch (err) {
        console.error(`vagabond | Virtuoso: could not give ${data.name} to ${actor.name}`, err);
        ui.notifications.error(game.i18n.format('VAGABOND.Virtuoso.ApplyFailed', { name: actor.name }));
      }
    }
  }

  /* -------------------------------------------- */
  /*  Overtuned                                   */
  /* -------------------------------------------- */

  /**
   * Called on the roller's client after a d20 check. If a Virtuoso benefit's Favor die lifted
   * the d20 from below the Bard's Overtuned threshold to at-or-above it, the Bard gains 1 Luck.
   * @param {Actor} actor - the roller
   * @param {Roll} roll
   * @param {'attack'|'cast'|'save'} kind
   */
  static async onCheckRolled(actor, roll, kind) {
    const eff = actor?.effects?.find(e => e.active && BOON_CHECKS[e.flags?.vagabond?.virtuoso?.boon]?.includes(kind));
    const threshold = eff?.flags?.vagabond?.virtuoso?.overtuned ?? 0;
    if (!threshold || !roll?.terms) return;

    const dice = roll.terms.filter(t => t instanceof foundry.dice.terms.Die);
    const d20 = dice.find(t => t.faces === 20)?.total ?? 0;
    const favor = dice.filter(t => t.faces !== 20 && t.options?.flavor === 'favored').reduce((s, t) => s + t.total, 0);
    if (!favor || d20 >= threshold || d20 + favor < threshold) return;

    const bard = await fromUuid(eff.flags.vagabond.virtuoso.source);
    if (!bard) return;
    const current = bard.system.currentLuck ?? 0;
    const max = bard.system.maxLuck ?? 0;
    if (current >= max) return;
    const next = current + 1;
    if (bard.isOwner) await bard.update({ 'system.currentLuck': next });
    else emitSocket('grantLuck', { actorUuid: bard.uuid, amount: 1 });
    const { VagabondChatCard } = await import('./chat-card.mjs');
    await VagabondChatCard.luckGain(bard, next, max, game.i18n.localize('VAGABOND.Virtuoso.Overtuned'));
  }

  /* -------------------------------------------- */
  /*  Migration                                   */
  /* -------------------------------------------- */

  /**
   * One-time migration: Bard class items created before the book revision carry the old
   * features (Song of Rest, Starstruck, Bravado, Climax, Starstruck Enhancement), the old
   * Perk text and no effects. Replaces description / levelFeatures / skillGrant / effects with
   * the compendium's current set (Overtuned, Audacity, Enjoy the Silence, the Virtuoso
   * benefits…). Items without the old "Song of Rest" feature (homebrew edits, already migrated)
   * are left alone. Active GM only; guarded by `bardClassMigrated`. If the compendium hasn't
   * been rebuilt yet (no "Enjoy the Silence" effect) it aborts WITHOUT setting the guard, so it
   * retries next load.
   */
  static async migrateBardClass() {
    if (game.user !== game.users.activeGM) return;
    if (game.settings.get('vagabond', 'bardClassMigrated')) return;

    const source = await game.packs.get('vagabond.classes')?.getDocument(BARD_CLASS_ID);
    if (!source?.effects.some(e => e.flags?.vagabond?.virtuosoBoon)) return;

    const safeItems = (doc) => { try { return Array.from(doc?.items ?? []); } catch { return []; } };
    const candidates = [
      ...game.items,
      ...game.actors.contents.flatMap(safeItems),
      ...game.scenes.contents.flatMap((s) => s.tokens.contents.filter((t) => !t.actorLink && t.actor)
        .flatMap((t) => safeItems(t.actor))),
    ];

    for (const item of candidates) {
      try {
        if (item.type !== 'class' || item.name !== 'Bard') continue;
        if (!item.system.levelFeatures?.some(lf => lf.name === 'Song of Rest')) continue;

        const effects = source.effects.map(e => {
          const data = e.toObject();
          delete data._id;
          delete data._stats;
          return data;
        });
        const s = source.system.toObject();
        await item.update({
          'system.description': s.description,
          'system.levelFeatures': s.levelFeatures,
          'system.skillGrant': s.skillGrant,
        });
        await item.deleteEmbeddedDocuments('ActiveEffect', item.effects.map(e => e.id));
        await item.createEmbeddedDocuments('ActiveEffect', effects);
      } catch (err) {
        console.warn(`vagabond | migrateBardClass: skipped ${item?.uuid ?? '(unknown)'}`, err);
      }
    }

    await game.settings.set('vagabond', 'bardClassMigrated', true);
  }
}
