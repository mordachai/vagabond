import { isCopyOf } from './source-id.mjs';
import { classFeatureText } from './feature-text.mjs';

const DANCER_CLASS_ID = '8LqHA6iqYBgFmVfJ';

/**
 * Dancer — Step Up (feature action button), plus the one-time class migration.
 *
 * Footloose (Reflex Saves roll two d20s, keep the higher) and Don't Stop Me Now (resistance to
 * Paralyzed / Restrained) are plain Active Effects on the class item — `system.saveRollsTwice`
 * (`VagabondRollBuilder.saveBaseDie`) and `system.statusResistances`. Evasive, Captivator and the
 * Ally's extra Action are text only: they are reactions / choices the table resolves.
 */
export class DancerHelper {

  /**
   * Step Up (run from the feature's action button / HUD Belt): the Dancer makes the Finesse Check;
   * on a pass the card carries the book text (Step Up, plus Double Time from Level 10) so the
   * table can hand the extra Action to the Being. No dialogs — the outcome is a chat card.
   * @param {{actor: Actor, item: Item}} scope - macro scope (item = the Dancer class)
   */
  static async stepUp({ actor, item }) {
    const L = (k, d = {}) => game.i18n.format(`VAGABOND.StepUp.${k}`, d);
    if (!actor?.isOwner) {
      ui.notifications.warn(L('NotYours'));
      return;
    }

    // The Finesse Check goes through the normal skill roll (favor/hinder, hooks, chat card)
    const { RollHandler } = await import('../sheets/handlers/roll-handler.mjs');
    const el = document.createElement('div');
    Object.assign(el.dataset, { roll: 'd20', key: 'finesse', type: 'skill', label: game.i18n.localize('VAGABOND.Skills.Finesse') });
    const roll = await new RollHandler({ actor }, {}).roll({ preventDefault() {}, shiftKey: false, ctrlKey: false }, el);
    if (!roll) return;

    const { VagabondChatCard } = await import('./chat-card.mjs');
    const title = game.i18n.localize('VAGABOND.StepUp.Title');
    const difficulty = actor.system.skills?.finesse?.difficulty ?? 10;
    if (roll.total < difficulty) {
      await VagabondChatCard.featureCard(actor, { title, description: `<p>${L('Failed', { name: actor.name })}</p>` });
      return;
    }

    const level = actor.system.attributes?.level?.value ?? 1;
    const text = (key) => classFeatureText(actor, key);
    await VagabondChatCard.featureCard(actor, {
      title,
      description: text({ command: 'dancer.stepUp', name: 'Step Up' }) + (level >= 10 ? text({ name: 'Double Time', lastAtLevel: 10 }) : ''),
    });
  }

  /* -------------------------------------------- */
  /*  Migration                                   */
  /* -------------------------------------------- */

  /**
   * One-time migration: Dancer class items created before the book revision carry the old
   * features (Fleet of Foot, Choreographer, Flash of Beauty), the old Step Up text and no
   * effects. Replaces description / levelFeatures / skillGrant / effects with the compendium's
   * current set. Items without the old "Fleet of Foot" feature (homebrew edits, already
   * migrated) are left alone. Active GM only; guarded by `dancerClassMigrated`. If the
   * compendium hasn't been rebuilt yet (no "Footloose" effect) it aborts WITHOUT setting the
   * guard, so it retries next load.
   */
  static async migrateDancerClass() {
    if (game.user !== game.users.activeGM) return;
    if (game.settings.get('vagabond', 'dancerClassMigrated')) return;

    const source = await game.packs.get('vagabond.classes')?.getDocument(DANCER_CLASS_ID);
    if (!source?.effects.some(e => e.name === 'Footloose')) return;

    const safeItems = (doc) => { try { return Array.from(doc?.items ?? []); } catch { return []; } };
    const candidates = [
      ...game.items,
      ...game.actors.contents.flatMap(safeItems),
      ...game.scenes.contents.flatMap((s) => s.tokens.contents.filter((t) => !t.actorLink && t.actor)
        .flatMap((t) => safeItems(t.actor))),
    ];

    for (const item of candidates) {
      try {
        if (item.type !== 'class' || !isCopyOf(item, DANCER_CLASS_ID, 'Dancer')) continue;
        if (!item.system.levelFeatures?.some(lf => lf.name === 'Fleet of Foot')) continue;

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
        console.warn(`vagabond | migrateDancerClass: skipped ${item?.uuid ?? '(unknown)'}`, err);
      }
    }

    await game.settings.set('vagabond', 'dancerClassMigrated', true);
  }
}
