import { macroDescriptorFromButton, runMacroFromButton } from './item-macro.mjs';

/**
 * MacroAutoRun — a successful Cast's hit macro button "presses itself" when the Spell lands.
 *
 * World setting `spellHitMacroAutoRun` (on by default) + per-Spell switch `system.hitMacro.autoRun`
 * (default on). Spells only: weapon / NPC / plain `macro` slots are never auto-run.
 *
 * Timing: whoever plays the Spell's FX schedules the run at {@link VagabondSpellSequencer.play}'s
 * `landsAt` (target animation ~90% done); no FX → right after the card renders. The card's
 * creator (or the GM) runs it, once: `flags.vagabond.macroAutoRun = 'done'` is claimed before
 * running, a hand click marks it too, and a Luck reroll / Force Crit card inherits it from the
 * card it replays (a hit macro never runs twice for one Cast).
 */

const FLAG = 'macroAutoRun';
// No FX: give the card a moment to render before its macro fires
const NO_FX_DELAY_MS = 300;

export class MacroAutoRun {
  /** messageId → timeout id */
  static #timers = new Map();

  /**
   * The card's auto-runnable hit macro button (a Spell's, switch on), read from the stored
   * card HTML so a closed / popped-out chat log doesn't matter. null when there is none.
   * @param {ChatMessage} message
   * @returns {HTMLElement|null}
   */
  static #hitButton(message) {
    if (!message?.content?.includes('data-macro-slot="hitMacro"')) return null;
    const div = document.createElement('div');
    div.innerHTML = message.content;
    const button = div.querySelector('.vagabond-macro-button[data-macro-slot="hitMacro"][data-item-uuid]');
    if (!button) return null;
    const item = fromUuidSync(button.dataset.itemUuid);
    if (item?.type !== 'spell' || item.system.hitMacro?.autoRun === false) return null;
    return button;
  }

  /**
   * Run the card's hit macro after `delayMs` (fire-and-forget). No-op when the setting is off,
   * the card has no auto-runnable hit macro, it already ran, or this user can't own the card.
   * @param {ChatMessage|null} message
   * @param {number} [delayMs]
   */
  static schedule(message, delayMs = NO_FX_DELAY_MS) {
    if (!message?.isOwner) return;
    if (!game.settings.get('vagabond', 'spellHitMacroAutoRun')) return;
    if (message.getFlag('vagabond', FLAG)) return;
    if (!this.#hitButton(message)) return;
    clearTimeout(this.#timers.get(message.id));
    this.#timers.set(message.id, setTimeout(() => this.#run(message.id), Math.max(0, delayMs ?? NO_FX_DELAY_MS)));
  }

  /**
   * Schedule from a {@link VagabondSpellSequencer.play} result (null = nothing played).
   * @param {ChatMessage|null} message
   * @param {Promise<{landsAt: number}|null>|{landsAt: number}|null} fx
   */
  static async afterFx(message, fx) {
    const played = await fx;
    this.schedule(message, played ? played.landsAt - performance.now() : NO_FX_DELAY_MS);
  }

  static async #run(messageId) {
    this.#timers.delete(messageId);
    const message = game.messages.get(messageId);
    if (!message || message.getFlag('vagabond', FLAG)) return;
    const button = this.#hitButton(message);
    if (!button) return;
    await message.setFlag('vagabond', FLAG, 'done');
    try {
      await runMacroFromButton(macroDescriptorFromButton(button, message));
    } catch (err) {
      console.error('VAGABOND | Auto-run hit macro failed:', err);
      ui.notifications.error('Macro execution failed — see console (F12).');
    }
  }

  /**
   * A hit macro clicked by hand: drop the pending auto-run and never run it later.
   * @param {ChatMessage|null} message
   */
  static markRan(message) {
    if (!message) return;
    clearTimeout(this.#timers.get(message.id));
    this.#timers.delete(message.id);
    if (message.isOwner && !message.getFlag('vagabond', FLAG)) {
      message.setFlag('vagabond', FLAG, 'done').catch(err => console.warn('VAGABOND | macroAutoRun flag:', err));
    }
  }

  /**
   * A replayed card (Luck reroll, Force Crit) inherits "already ran" from the card it replays.
   * Call before scheduling the new card.
   * @param {ChatMessage|null} from
   * @param {ChatMessage|null} to
   */
  static async inherit(from, to) {
    if (from?.getFlag('vagabond', FLAG) && to?.isOwner) await to.setFlag('vagabond', FLAG, 'done');
  }
}
