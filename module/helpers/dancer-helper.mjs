import { classFeatureText } from './feature-text.mjs';

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

}
