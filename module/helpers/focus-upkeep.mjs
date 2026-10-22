import { SpellTargetPicker } from './spell-target-picker.mjs';
import { isActiveGM } from './gm-relay.mjs';
import { FocusLink } from './focus-link.mjs';
import { VagabondChatCard } from './chat-card.mjs';

/**
 * Focus Mana — Spells whose Focus costs Mana (`system.focusUpkeep`, book wording):
 * - Ward: "You must spend 1 Mana per Target to Focus on this Spell, even for willing Targets." (per Target, on Cast)
 * - Polymorph: "You must spend 1 Mana on your Turns to Focus on this Spell, even for willing Targets." (on Cast)
 * - Beast: "You must spend 1 Mana each Turn you Focus on this Spell after the Casting." (not on Cast)
 *
 * On Cast (`onCast`): a Cast with the Focus switch on adds the Focus Mana to the Cast cost (Cast dialog line
 * "Focus"), counted on the Cast's Targets; charged only when the Cast actually Focuses (`_executeCast`).
 * Each Round: at the start of the caster's Turn in a started Combat the active GM posts one card per such Focus —
 * Pay (spend the Mana) / Drop Focus. Nothing is forced (manual-first): an ignored card changes nothing.
 * Per-Target Rounds count the Beings still carrying an effect of that Cast (FocusLink stamps), else the count
 * stored at the Cast (`flags.vagabond.focusTargets.<spellId>`).
 */
export class FocusUpkeep {

  /** The Spell's Focus Mana rule, or null. */
  static rule(spell) {
    const r = spell?.system?.focusUpkeep;
    const mana = Number(r?.mana) || 0;
    return mana > 0 ? { mana, perTarget: !!r.perTarget, onCast: !!r.onCast } : null;
  }

  /**
   * Targets a Cast state will have, for the dialog's cost line (the Cast itself counts its resolved Targets):
   * Target picker count, else a counted delivery's size (Remote 1 + Increase, Touch 1), else the user's targets.
   */
  static estimateTargets(actor, spell, state) {
    const t = String(state?.deliveryType ?? '').toLowerCase();
    if (!t) return 1;
    if (SpellTargetPicker.modes(spell, t)) {
      const n = SpellTargetPicker.targetCount(actor, spell, state);
      if (n > 0) return n;
    }
    const base = CONFIG.VAGABOND.deliveryBaseRanges?.[t];
    if (base?.type === 'count') return (base.value ?? 1) + (CONFIG.VAGABOND.deliveryIncrement?.[t] ?? 0) * (state.deliveryIncrease ?? 0);
    if (t === 'touch') return 1;
    return Math.max(1, game.user.targets.size);
  }

  /**
   * Focus Mana a Cast pays (0 when the Spell has none on Cast or the Focus switch is off).
   * @param {Item} spell
   * @param {{focusOn?: boolean}} state
   * @param {number} targets
   */
  static castCost(spell, state, targets) {
    const r = this.rule(spell);
    if (!r?.onCast || state?.focusOn !== true) return 0;
    return r.mana * (r.perTarget ? Math.max(1, targets || 0) : 1);
  }

  /** Every actor: sidebar + unlinked token actors. */
  static #actors() {
    return [
      ...game.actors.contents,
      ...game.scenes.contents.flatMap(s => s.tokens.contents.filter(t => !t.actorLink && t.actor).map(t => t.actor)),
    ];
  }

  /** Beings still carrying an effect of the caster's Focused Cast of `spellId`. */
  static liveTargets(caster, spellId) {
    const fromCast = (src) => src && src.held !== false && src.casterUuid === caster.uuid && src.spellId === spellId;
    const seen = new Set();
    for (const actor of this.#actors()) {
      if (actor.effects.some(e => fromCast(e.flags?.vagabond?.spellTracker))) seen.add(actor.uuid);
    }
    return seen.size;
  }

  /** `{mana, targets}` to keep Focusing on `spell` this Round, or null. */
  static roundCost(caster, spell) {
    const r = this.rule(spell);
    if (!r) return null;
    if (!r.perTarget) return { mana: r.mana, targets: null };
    const targets = this.liveTargets(caster, spell.id)
      || Number(caster.getFlag('vagabond', `focusTargets.${spell.id}`)) || 1;
    return { mana: r.mana * targets, targets };
  }

  /** Start of `actor`'s Turn (active GM): one Pay / Drop card per Focus that costs Mana. */
  static async onTurnStart(actor) {
    for (const spellId of actor.system.focus?.spellIds ?? []) {
      const spell = actor.items.get(spellId);
      const cost = spell ? this.roundCost(actor, spell) : null;
      if (cost) await this.#postCard(actor, spell, cost);
    }
  }

  static async #postCard(actor, spell, { mana, targets }) {
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));
    const L = (k, d) => game.i18n.format(`VAGABOND.FocusUpkeep.${k}`, d);
    const data = `data-actor-uuid="${actor.uuid}" data-spell-id="${spell.id}" data-mana="${mana}"`;
    const text = targets ? L('CostTargets', { mana, targets, spell: esc(spell.name) }) : L('Cost', { mana, spell: esc(spell.name) });
    await new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle(L('Title', { spell: spell.name }))
      .setSubtitle(actor.name)
      .setDescription(`<p>${text}</p>
        <div class="protect-buttons-row focus-upkeep-buttons">
          <button type="button" class="vagabond-focus-upkeep-button" data-upkeep="pay" ${data}><i class="fa-solid fa-droplet"></i> ${L('Pay', { mana })}</button>
          <button type="button" class="vagabond-focus-upkeep-button" data-upkeep="drop" ${data}><i class="fa-solid fa-ban"></i> ${L('Drop', {})}</button>
        </div>`)
      .send();
  }

  /** A Pay / Drop Focus button (caster's owner or GM). */
  static async handleButton(button) {
    const actor = await fromUuid(button.dataset.actorUuid);
    const spell = actor?.items.get(button.dataset.spellId);
    if (!actor || !spell) return;
    if (!actor.isOwner && !game.user.isGM) {
      ui.notifications.warn(game.i18n.format('VAGABOND.Defense.NotYours', { name: actor.name }));
      return;
    }
    const L = (k, d) => game.i18n.format(`VAGABOND.FocusUpkeep.${k}`, d);
    const names = { name: actor.name, spell: spell.name };
    if (!(actor.system.focus?.spellIds ?? []).includes(spell.id)) {
      ui.notifications.info(L('NotFocused', names));
      button.closest('.focus-upkeep-buttons')?.querySelectorAll('button').forEach(b => { b.disabled = true; });
      return;
    }
    let line;
    if (button.dataset.upkeep === 'pay') {
      const mana = Number(button.dataset.mana) || 0;
      const have = actor.system.mana?.current ?? 0;
      if (have < mana) {
        ui.notifications.warn(L('NoMana', { name: actor.name, have, mana }));
        return;
      }
      await actor.update({ 'system.mana.current': have - mana });
      line = L('Paid', { ...names, mana });
    } else {
      await FocusLink.setFocus(actor, spell.id, false);
      line = L('Dropped', names);
    }
    button.closest('.focus-upkeep-buttons')?.querySelectorAll('button').forEach(b => { b.disabled = true; });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="vagabond-spell-status-result"><p>${foundry.utils.escapeHTML(line)}</p></div>`,
    });
  }

  /** Register the hooks. Synchronous, called once at module load. */
  static registerHooks() {
    Hooks.on('updateCombat', (combat, changed) => {
      if (!isActiveGM()) return;
      if (changed.turn === undefined && changed.round === undefined) return;
      if (!combat.started) return;
      const actor = combat.combatant?.actor;
      if (actor?.system?.focus?.spellIds?.length) {
        this.onTurnStart(actor).catch(err => console.warn('vagabond | Focus Mana card failed:', err));
      }
    });
  }
}
