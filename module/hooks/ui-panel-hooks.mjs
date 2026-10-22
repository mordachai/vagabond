import { VagabondCharacterHud } from '../applications/character-hud.mjs';
import { CombatCarousel } from '../applications/combat-carousel.mjs';
import { VagabondNPCHud } from '../applications/npc-hud.mjs';
import { OngoingPanel } from '../applications/ongoing-panel.mjs';

/**
 * Panel / HUD toggles (Ongoing, Combat Carousel, Character + NPC HUD) and HUD selection / pinned sync.
 * Moved out of vagabond.mjs; called once at module load, in the original order.
 */
export function registerUiPanelHooks() {
  Hooks.on('vagabond.toggleOngoingPanel', () => {
    OngoingPanel.toggle();
  });

  Hooks.on('vagabond.toggleCombatCarousel', () => {
    CombatCarousel.toggle();
  });

  // Auto show/hide: carousel appears the moment the viewed combat gets its
  // first combatant, disappears the moment it's emptied out — not manual-only.
  Hooks.on('createCombatant', (combatant) => CombatCarousel.syncAutoVisibility(combatant.parent ?? game.combat));
  Hooks.on('deleteCombatant', (combatant) => CombatCarousel.syncAutoVisibility(combatant.parent ?? game.combat));
  Hooks.on('deleteCombat', () => CombatCarousel.close());

  // Restore whatever open/closed state this client last left the carousel in —
  // otherwise every refresh/restart silently drops back to closed until the
  // next create/deleteCombatant event happens to fire.
  Hooks.once('ready', () => {
    if (game.settings.get('vagabond', 'combatCarouselEnabled') && game.settings.get('vagabond', 'combatCarouselUserOpen')) CombatCarousel.open();
  });

  Hooks.on('vagabond.toggleCharacterHud', (actor = null) => {
    VagabondCharacterHud.toggle(actor);
  });

  Hooks.on('vagabond.openCharacterHud', (actor = null) => {
    VagabondCharacterHud.open(actor);
  });

  Hooks.on('vagabond.toggleNPCHud', (actor = null) => {
    VagabondNPCHud.toggle(actor);
  });

  Hooks.on('vagabond.openNPCHud', (actor = null) => {
    VagabondNPCHud.open(actor);
  });

  // Follow-selection: open/close the auto HUD as token selection changes.
  // Debounced — multi-select fires `controlToken` once per token. Both HUD types
  // sync from the same event; each filters by actor type (character vs npc) so
  // only one ever matches the single controlled token.
  const _hudSyncSelection = foundry.utils.debounce(
    () => {
      VagabondCharacterHud.syncToSelection();
      VagabondNPCHud.syncToSelection();
    },
    50,
  );
  Hooks.on('controlToken', () => _hudSyncSelection());

  // Pinned HUD: keep the main character's HUD on screen for the whole session
  // when the per-user "always on" setting is enabled.
  Hooks.once('ready', () => VagabondCharacterHud.syncAlwaysOn());
  // Re-evaluate if the user's assigned character changes mid-session.
  Hooks.on('updateUser', (user) => {
    if (user.id === game.user.id) VagabondCharacterHud.syncAlwaysOn();
  });
}
