import { VagabondCharacterHud } from '../applications/character-hud.mjs';
import { CountdownDiceConfig } from '../applications/countdown-dice-config.mjs';
import { VagabondNPCHud } from '../applications/npc-hud.mjs';
import { ProgressClockConfig } from '../applications/progress-clock-config.mjs';
import { ShopApp } from '../applications/shop-app.mjs';
import { isItemPile } from '../helpers/hud-display.mjs';
import { RaiseHelper } from '../helpers/raise-helper.mjs';

/**
 * Vagabond Tools scene control buttons (onChange handlers).
 * Moved out of vagabond.mjs; called once at module load, in the original order.
 */
export function registerSceneControls() {
  /**
   * Add scene controls for Vagabond tools
   */
  Hooks.on('getSceneControlButtons', (controls) => {
    // Add Vagabond control group (v13 uses object structure)
    controls.vagabond = {
      name: 'vagabond',
      title: 'Vagabond Tools',
      icon: 'fas fa-circle-v',
      layer: 'tokens',
      activeTool: 'select',
      tools: {
        select: {
          name: 'select',
          title: 'Select/Interact',
          icon: 'fas fa-expand',
          onChange: () => {} // Empty handler for default tool
        },
        createClock: {
          name: 'createClock',
          title: game.i18n.localize('VAGABOND.ProgressClock.SceneControls.Create'),
          icon: 'fas fa-chart-pie',
          button: true,
          onChange: async () => {
            try {
              const { ProgressClockConfig } = globalThis.vagabond.applications;
              const dialog = new ProgressClockConfig(null);
              await dialog.render(true);
            } catch (error) {
              ui.notifications.error("Failed to open clock config: " + error.message);
            }
          }
        },
        createCountdownDice: {
          name: 'createCountdownDice',
          title: game.i18n.localize('VAGABOND.CountdownDice.SceneControls.Create'),
          icon: 'fas fa-dice-six',
          button: true,
          onChange: async () => {
            try {
              const { CountdownDiceConfig } = globalThis.vagabond.applications;
              const dialog = new CountdownDiceConfig(null);
              await dialog.render(true);
            } catch (error) {
              ui.notifications.error("Failed to open countdown dice config: " + error.message);
            }
          }
        },
        ongoingPanel: {
          name:    'ongoingPanel',
          title:   game.i18n.localize('VAGABOND.OngoingPanel.SceneControl'),
          icon:    'fas fa-list-ul',
          button:  true,
          onChange: () => Hooks.callAll('vagabond.toggleOngoingPanel'),
        },
        shops: {
          name:    'shops',
          title:   game.i18n.localize('VAGABOND.Shop.App.SceneControl'),
          icon:    'fas fa-store',
          button:  true,
          visible: game.user.isGM && game.settings.get('vagabond', 'shopsEnabled'),
          onChange: () => ShopApp.pickAndToggle(),
        },
        // Raise: put spent Undead corpses back on their original actors, delete the Undead Army copies
        raiseCleanup: {
          name:    'raiseCleanup',
          title:   game.i18n.localize('VAGABOND.Raise.CleanupTool'),
          icon:    'fas fa-skull',
          button:  true,
          visible: game.user.isGM,
          onChange: () => RaiseHelper.cleanup(),
        },
        combatCarousel: {
          name:    'combatCarousel',
          title:   game.i18n.localize('VAGABOND.Combat.Carousel.SceneControl'),
          icon:    'fas fa-film',
          button:  true,
          onChange: () => Hooks.callAll('vagabond.toggleCombatCarousel'),
        },
        // Stateful toggle (default ON): when active, selecting a token auto-opens
        // its Character HUD and deselecting/switching closes it (follow-selection).
        hudAutoOpen: {
          name:    'hudAutoOpen',
          title:   game.i18n.localize('VAGABOND.Hud.AutoOpenToggle'),
          icon:    game.settings.get('vagabond', 'hudAutoOpenOnSelect')
            ? 'fa-solid fa-square-user'
            : 'fa-regular fa-square-user',
          toggle:  true,
          active:  game.settings.get('vagabond', 'hudAutoOpenOnSelect'),
          // The setting's onChange syncs the HUD and swaps the solid/regular icon.
          onChange: (event, active) => {
            game.settings.set('vagabond', 'hudAutoOpenOnSelect', active);
          },
        },
      }
    };

    // Momentary "open the selected token's HUD" button. Lives in the native
    // Token Controls group (not the Vagabond group) so players reach it alongside
    // the other token tools. Independent of the auto-open toggle above.
    if (controls.tokens?.tools) {
      controls.tokens.tools.characterHudOpen = {
        name:    'characterHudOpen',
        title:   game.i18n.localize('VAGABOND.Hud.OpenSceneControl'),
        icon:    'fa-solid fa-circle-user',
        button:  true,
        onChange: () => {
          // Nothing selected → close every open PC HUD instead of opening one.
          const controlled = canvas.tokens?.controlled ?? [];
          if (!controlled.length) { VagabondCharacterHud.closeAll(); return; }
          // Open one HUD per selected PC token (control() already restricts
          // selection to owned tokens, so no separate ownership check needed).
          // Dedup by HUD instance key, not actor.id — unlinked duplicate actors
          // (e.g. several summons off one base actor) share actor.id but are
          // distinct tokens and must each get their own HUD.
          const actors = [...new Map(
            controlled.map(t => t.actor).filter(a => a?.type === 'character' && !isItemPile(a))
              .map(a => [VagabondCharacterHud._keyFor(a), a])
          ).values()];
          if (!actors.length) actors.push(VagabondCharacterHud.resolveActor());
          for (const actor of actors) Hooks.callAll('vagabond.openCharacterHud', actor);
        },
      };

      // Momentary "open the selected NPC's HUD" button (sibling of the PC one).
      controls.tokens.tools.npcHudOpen = {
        name:    'npcHudOpen',
        title:   game.i18n.localize('VAGABOND.Hud.OpenNPCSceneControl'),
        icon:    'fa-solid fa-dragon',
        button:  true,
        visible: game.user.isGM,
        onChange: () => {
          // Nothing selected → close every open NPC HUD instead of opening one.
          const controlled = canvas.tokens?.controlled ?? [];
          if (!controlled.length) { VagabondNPCHud.closeAll(); return; }
          // Open one HUD per selected NPC token (GM only, since this tool is hidden from players).
          // Dedup by HUD instance key, not actor.id — unlinked duplicate monsters
          // (e.g. 3 goblins off one base actor) share actor.id but are distinct
          // tokens and must each get their own HUD.
          const actors = [...new Map(
            controlled.map(t => t.actor).filter(a => a?.type === 'npc' && !isItemPile(a))
              .map(a => [VagabondNPCHud._keyFor(a), a])
          ).values()];
          if (!actors.length) actors.push(VagabondNPCHud.resolveActor());
          for (const actor of actors) Hooks.callAll('vagabond.openNPCHud', actor);
        },
      };
    }
  });
}
