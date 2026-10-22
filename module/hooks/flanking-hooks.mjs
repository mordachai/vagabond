import { isActiveGM } from '../helpers/gm-relay.mjs';
import { FlankingHelper } from '../helpers/flanking-helper.mjs';


/**
 * Flanking detection: debounced sweep on token refresh, cleanup on combat end.
 * Moved out of vagabond.mjs; called once at module load, in the original order.
 */
export function registerFlankingHooks() {

  // Live Flanking/Flanked tracking: re-sweep the scene when a token moves so
  // 'flanked' clears the moment a contributor walks off adjacent, not just the
  // next time someone attacks. GM-gated to avoid every connected client sweeping.
  // Also sweeps on token create/delete — a freshly-dropped token (drag from the
  // actor directory) or a removed one changes adjacency without ever firing
  // updateToken, so relying on updateToken alone left the scene stale until the
  // next unrelated move.
  const _flankingSweep = foundry.utils.debounce(() => {
    FlankingHelper.evaluateScene()
      .catch(err => console.error('Vagabond | Flanking sweep failed', err));
  }, 200);

  for (const hookName of ['updateToken', 'createToken', 'deleteToken']) {
    Hooks.on(hookName, () => {
      // Only ONE client may sweep — with multiple GMs connected, every GM running
      // evaluateScene() races toggleStatusEffect (duplicate creates, "ActiveEffect
      // does not exist" on clears), and the caught error aborts the rest of that
      // client's scene loop, leaving statuses stale until tokens move again.
      if (!isActiveGM()) return;
      _flankingSweep();
    });
  }

  // A dragged token settles through the v13/v14 movement animation; the final
  // rest position sometimes only lands via refreshToken, not a clean updateToken.
  // Cheap position-delta guard keeps this off the per-frame animation spam — the
  // 200ms debounce collapses whatever survives into a single sweep.
  Hooks.on('refreshToken', (token) => {
    if (!isActiveGM()) return;
    const p = token.document;
    if (!p) return;
    const key = `${p.x},${p.y},${p.width},${p.height}`;
    if (token._vagabondFlankPos === key) return;
    token._vagabondFlankPos = key;
    _flankingSweep();
  });

  // Dead status added/removed (HUD condition toggle, HP-zero auto-toggle, or a
  // direct macro) changes flanking eligibility without moving any token, so
  // updateToken/refreshToken never fire for it. Re-sweep on the AE itself.
  for (const hookName of ['createActiveEffect', 'deleteActiveEffect']) {
    Hooks.on(hookName, (effect) => {
      if (!effect.statuses?.has('dead')) return;
      if (!isActiveGM()) return;
      _flankingSweep();
    });
  }

  // Re-eval on combat flow too: a token moved on another actor's turn, a flanker
  // going defeated, or the initiative roster changing all alter adjacency without
  // necessarily moving a token on THIS client.
  for (const h of ['combatStart', 'updateCombat', 'createCombatant', 'deleteCombatant', 'updateCombatant']) {
    Hooks.on(h, () => {
      if (!isActiveGM()) return;
      _flankingSweep();
    });
  }

  // Combat over — sweep orphans first (presence-based, catches origin-migrated
  // strays actor.statuses can't see), THEN re-run the geometry sweep so any
  // genuinely-still-adjacent tokens keep the correct positional state. Order
  // matters: cleanup before sweep, or the sweep's fresh 'flanked' gets wiped.
  Hooks.on('deleteCombat', () => {
    if (!isActiveGM()) return;
    (async () => {
      await FlankingHelper.cleanupOrphans();
      await FlankingHelper.evaluateScene();
    })()
      .catch(err => console.error('Vagabond | Flanking combat-end sweep failed', err));
  });
}
