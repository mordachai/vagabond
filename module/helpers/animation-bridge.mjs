import { TargetHelper } from './target-helper.mjs';

/**
 * AnimationBridge — Automated Animations (AA) for weapon attacks, thrown alchemicals and NPC
 * actions, timed by the system instead of AA's own chat-card detection (user ruling 2026-10-17):
 *
 * - Hit: the animation plays with the DAMAGE roll — with the card when damage is auto-rolled,
 *   else when its Roll Damage button is clicked. Nothing to roll (no damage) → with the card.
 * - Miss: AA's miss variant (melee / ranged animations fly past) when the world setting
 *   `fxOnMiss` is `miss`; any other animation type (on-token, template, aura…) plays nothing.
 *
 * Cards the system animates carry `flags.vagabond.aaManaged`: the `AutomatedAnimations-WorkflowStart`
 * hook stops AA's chat detection on them, and {@link play} calls AA directly (marked
 * `vagabondManaged`). AA builds a Sequencer sequence, which reaches every client.
 * Spells keep their own FX (VagabondSpellSequencer) — this bridge never touches Spell cards.
 */

// AA animation menus that have a miss variant
const MISS_MENUS = new Set(['melee', 'range']);

export class AnimationBridge {
  /** createActionCard `extraFlags` for a card whose AA animation the system plays itself. */
  static FLAGS = Object.freeze({ aaManaged: true });

  /** @returns {boolean} */
  static get available() {
    return !!game.modules.get('autoanimations')?.active
      && typeof globalThis.AutomatedAnimations?.playAnimation === 'function';
  }

  /** Called once from init. */
  static registerHooks() {
    Hooks.on('AutomatedAnimations-WorkflowStart', (data, animationData) => {
      if (data?.vagabondManaged) {
        if (data.vagabondMiss && !MISS_MENUS.has(animationData?.menu)) data.stopWorkflow = true;
        return;
      }
      // AA's own detection of a card the system animates (attack check, damage card)
      if (data?.workflow?.flags?.vagabond?.aaManaged) data.stopWorkflow = true;
    });
  }

  /**
   * Play the AA animation of an attack / action. Fire-and-forget; no-op without AA.
   * @param {object} opts
   * @param {Actor} opts.actor          the attacker
   * @param {Item|object|null} opts.item  the weapon / item (or {@link npcActionItem})
   * @param {Array} [opts.targets]      targetsAtRollTime snapshot
   * @param {boolean} [opts.hit=true]
   */
  static play({ actor, item, targets = [], hit = true }) {
    if (!this.available || !actor || !item) return;
    if (!hit && game.settings.get('vagabond', 'fxOnMiss') === 'none') return;
    const token = actor.token?.object ?? actor.getActiveTokens(true)[0];
    if (!token) return;
    const tokens = TargetHelper.resolveTargets(targets);
    if (!hit && !tokens.length) return;
    try {
      Promise.resolve(globalThis.AutomatedAnimations.playAnimation(token, item, {
        targets: tokens,
        hitTargets: hit ? tokens : [],
        playOnMiss: !hit,
        forceMiss: !hit,
        vagabondManaged: true,
        vagabondMiss: !hit,
      })).catch(err => console.warn('Vagabond | Automated Animations error (non-fatal):', err));
    } catch (err) {
      console.warn('Vagabond | Automated Animations error (non-fatal):', err);
    }
  }

  /**
   * What AA matches an NPC action by: its linked weapon item, else a stand-in named after
   * the action (AA's Automatic Recognition matches by name).
   * @param {Actor} actor
   * @param {object} action  actor.system.actions[n]
   * @returns {Item|object|null}
   */
  static npcActionItem(actor, action) {
    if (!action) return null;
    const weapon = action.weaponId ? fromUuidSync(action.weaponId) : null;
    if (weapon) return weapon;
    if (!action.name) return null;
    return { name: action.name, id: null, uuid: null, flags: {}, type: 'npcAction', actor };
  }
}
