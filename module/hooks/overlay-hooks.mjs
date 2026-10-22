import { VagabondChatCard } from '../helpers/chat-card.mjs';
import { LightSource } from '../helpers/light-source.mjs';
import { StatusHelper } from '../helpers/status-helper.mjs';
import { CountdownDiceOverlay } from '../ui/countdown-dice-overlay.mjs';
import { GlyphOverlay } from '../ui/glyph-overlay.mjs';
import { ProgressClockOverlay } from '../ui/progress-clock-overlay.mjs';
import { RegionTextureOverlay } from '../ui/region-texture-overlay.mjs';
import { TokenStatusPanel } from '../ui/token-status-panel.mjs';
import { isActiveGM } from '../helpers/gm-relay.mjs';

/**
 * Progress clock + countdown dice HTML overlays: create on ready/canvasReady, redraw on journal create/update, die expiry -> status removal, clock restore by canvas drop.
 * Moved out of vagabond.mjs; called once at module load, in the original order.
 */
export function registerOverlayHooks() {

  // Global overlay instance
  let clockOverlay = null;

  /**
   * Initialize the progress clocks HTML overlay when ready
   */
  Hooks.once('ready', () => {
    clockOverlay = new ProgressClockOverlay();
    clockOverlay.initialize();

    // Store in global for easy access
    globalThis.vagabond.ui.clockOverlay = clockOverlay;

    // Register spell-area region texture overlay (paints damage-type art on regions)
    RegionTextureOverlay.register();

    // Register placed-glyph overlay (emblem render + click-to-trigger; Glyph delivery)
    GlyphOverlay.register();
  });

  /**
   * Sweep stale spell template regions left over from prior sessions.
   * Runs on every scene load — tracking maps in the manager are empty
   * at this point, so any vagabond-tagged region is by definition an orphan.
   */
  Hooks.on('canvasReady', async () => {
    if (!game.user?.isGM) return; // Only GM can delete scene Region documents
    try {
      await globalThis.vagabond?.managers?.templates?.cleanupAllSpellRegions();
    } catch (e) {
      console.warn('VagabondSystem | Failed to clean stale spell regions', e);
    }
  });

  /**
   * Draw progress clocks when canvas is ready
   */
  Hooks.on('canvasReady', async () => {
    // Ensure overlay is initialized
    if (!clockOverlay) {
      clockOverlay = new ProgressClockOverlay();
      clockOverlay.initialize();
      globalThis.vagabond.ui.clockOverlay = clockOverlay;
    }

    if (clockOverlay) {
      await clockOverlay.draw();
    }
  });

  /* -------------------------------------------- */
  /*  UI Hooks - Countdown Dice Overlay           */
  /* -------------------------------------------- */

  // Global overlay instance
  let diceOverlay = null;

  /**
   * Initialize the countdown dice HTML overlay when ready
   */
  Hooks.once('ready', () => {
    diceOverlay = new CountdownDiceOverlay();
    diceOverlay.initialize();

    // Store in global for easy access
    globalThis.vagabond.ui.countdownDiceOverlay = diceOverlay;

    // Token status display panel (alt to native PIXI token icons)
    TokenStatusPanel.instance ??= new TokenStatusPanel();
    TokenStatusPanel.instance.initialize();
    globalThis.vagabond.ui.tokenStatusPanel = TokenStatusPanel.instance;

    // Verify Combat system registration — warn only if something failed
    const hasCustomActions = 'activate' in foundry.applications.sidebar.tabs.CombatTracker.DEFAULT_OPTIONS.actions;
    if (CONFIG.Combat.documentClass?.name !== "VagabondCombat" ||
        CONFIG.Combatant.documentClass?.name !== "VagabondCombatant" ||
        !hasCustomActions) {
      console.warn("Vagabond | WARNING: Combat system not fully registered!");
    }
  });

  /**
   * Draw countdown dice when canvas is ready
   */
  Hooks.on('canvasReady', async () => {
    // Ensure dice overlay is initialized
    if (!diceOverlay) {
      diceOverlay = new CountdownDiceOverlay();
      diceOverlay.initialize();
      globalThis.vagabond.ui.countdownDiceOverlay = diceOverlay;
    }

    if (diceOverlay) {
      await diceOverlay.draw();
    }
  });

  /**
   * Refresh clock when journals are updated
   */
  Hooks.on('updateJournalEntry', async (journal, changes, options, userId) => {
    // Handle progress clocks
    if (journal.flags?.vagabond?.progressClock?.type === 'progressClock') {
      if (clockOverlay) {
        const clockChanges = changes.flags?.vagabond?.progressClock;

        // If only positions changed (dragging), don't do anything - element already moved in DOM
        if (clockChanges?.positions !== undefined && Object.keys(clockChanges).length === 1 && !clockChanges.size && !clockChanges.segments && !clockChanges.defaultPosition && !clockChanges.faded) {
          // Position was already updated by drag handler, no need to redraw
          return;
        }
        // For any other changes (filled, name, size, segments, ownership, fade, etc.), redraw the clock
        else if (clockChanges || changes.name || changes.ownership) {
          await clockOverlay.draw();
        }
      }
    }

    // Light source: a manual burn-down clock that reaches 0 has burned out — delete
    // it (the deleteJournalEntry hook then restores the token's previous light and,
    // because this is a true burn-out, consumes the item).
    const ls = journal.flags?.vagabond?.lightSource;
    if (ls?.mode === 'clock' && isActiveGM()) {
      const filled = foundry.utils.getProperty(changes, 'flags.vagabond.progressClock.filled');
      if (filled === 0) { await journal.delete({ vagabondLightExpired: true }); return; }
    }

    // Handle countdown dice
    if (journal.flags?.vagabond?.countdownDice?.type === 'countdownDice') {
      if (diceOverlay) {
        const diceChanges = changes.flags?.vagabond?.countdownDice;

        // If only positions changed (dragging), don't do anything - element already moved in DOM
        if (diceChanges?.positions !== undefined && Object.keys(diceChanges).length === 1 && !diceChanges.diceType && !diceChanges.name && !diceChanges.size && !diceChanges.faded) {
          // Position was already updated by drag handler, no need to redraw
          return;
        }
        // For other changes (name, diceType, size, ownership, fade, etc.), refresh only this dice
        else if (diceChanges || changes.name || changes.ownership) {
          await diceOverlay.refreshDice(journal.id, journal);
        }
      }
    }
  });

  /**
   * Remove clock/dice when journal is deleted
   * Always attempt cleanup regardless of flags — after F5 refresh or in some
   * Foundry V13 scenarios, journal.flags may be stripped before the hook fires.
   * Both removeClock() and removeDice() are no-ops if no element exists.
   */
  Hooks.on('deleteJournalEntry', async (journal, options, userId) => {
    if (clockOverlay) {
      clockOverlay.removeClock(journal.id);
    }
    if (diceOverlay) {
      diceOverlay.removeDice(journal.id);
    }

    // Light source: a deleted burn-down clock douses its token (restore prevLight)
    // and, when hand coupling is on, unequips the lit item.
    if (isActiveGM()) {
      const lsFlags = journal.flags?.vagabond?.lightSource;
      if (lsFlags?.tokenUuid) {
        try {
          const tdoc = await fromUuid(lsFlags.tokenUuid);
          if (tdoc && tdoc.getFlag('vagabond', 'prevLight') !== undefined) {
            await tdoc.update({ light: tdoc.getFlag('vagabond', 'prevLight') });
            await tdoc.unsetFlag('vagabond', 'prevLight');
          }
          if (lsFlags.itemUuid) {
            await LightSource._unequipLitItem(lsFlags.itemUuid);
            // Prune the token's litItems bookkeeping
            if (tdoc) {
              const lit = (tdoc.getFlag('vagabond', 'litItems') ?? []).filter((u) => u !== lsFlags.itemUuid);
              if (lit.length) await tdoc.setFlag('vagabond', 'litItems', lit);
              else if (tdoc.getFlag('vagabond', 'litItems') !== undefined) await tdoc.unsetFlag('vagabond', 'litItems');
            }
            // True burn-out (clock expired — NOT a douse): consume the item.
            // Light items are never consumed on Use/Ignite anymore.
            if (options?.vagabondLightExpired) {
              await LightSource._consumeLitItem(lsFlags.itemUuid);
            }
          }
        } catch (err) {
          console.warn('Vagabond | Could not douse token light on clock delete:', err);
        }
      }
    }

    // Auto-remove linked status when its countdown die expires (GM only)
    if (!game.user.isGM) return;
    const cdFlags = journal.flags?.vagabond?.countdownDice;
    if (!cdFlags) return;

    // Status cleanup
    if (cdFlags.linkedActorUuid && cdFlags.linkedStatusId) {
      try {
        const actor = await fromUuid(cdFlags.linkedActorUuid);
        // A stacking status (Burning) from several sources has one die per source: the
        // status stays while another source's die is still running.
        const otherSourceDie = actor && StatusHelper.isStackingStatus(cdFlags.linkedStatusId)
          && StatusHelper.linkedStatusDice(actor, cdFlags.linkedStatusId).some(j => j.id !== journal.id);
        // Only toggle off if the status is still present — guards against a double-delete
        // race when the status was already removed manually or by another cleanup path.
        if (actor && !otherSourceDie && actor.statuses?.has(cdFlags.linkedStatusId)) {
          await actor.toggleStatusEffect(cdFlags.linkedStatusId, { active: false });

          const statusLabel = game.i18n.localize(
            CONFIG.VAGABOND?.statusConditions?.[cdFlags.linkedStatusId] ?? cdFlags.linkedStatusId
          );
          const card = new VagabondChatCard();
          card.data.title = journal.name;
          card.data.subtitle = statusLabel;
          card.data.description = `<p><i class="fas fa-hourglass-end"></i> ${game.i18n.format('VAGABOND.Status.CountdownExpired', {
          actor: actor.name,
          status: statusLabel,
        })}</p>`;
          card.data.type = 'countdown-dice';
          card.data.alias = actor.name;
          const statusIcon = CONFIG.VAGABOND?.statusConditionIcons?.[cdFlags.linkedStatusId];
          if (statusIcon) {
            card.data.icon = statusIcon;
            if (statusIcon.endsWith('.svg')) card.data.iconBackground = '#000000';
          }
          await card.send();
        }
      } catch(err) {
        console.warn('Vagabond | Could not remove linked status on countdown expiry:', err);
      }
    }

    // NPC recharge action unlock
    if (cdFlags.linkedRechargeActorUuid && cdFlags.linkedRechargeActionIndex !== null && cdFlags.linkedRechargeActionIndex !== undefined) {
      try {
        const actor = await fromUuid(cdFlags.linkedRechargeActorUuid);
        if (actor) {
          const actionIndex = cdFlags.linkedRechargeActionIndex;
          const action = actor.system.actions?.[actionIndex];
          if (action) {
            const actions = foundry.utils.deepClone(actor.system.actions || []);
            actions[actionIndex].rechargeCountdownId = null;
            await actor.update({ 'system.actions': actions });
          }
        }
      } catch(err) {
        console.warn('Vagabond | Could not unlock recharge action on countdown expiry:', err);
      }
    }
  });

  /**
   * Bidirectional grapple cleanup:
   * - Removing Grappling from the source → removes the linked Restrained from all targets
   * - Removing Restrained (from-grapple) from a target → removes Grappling from the source
   */
  Hooks.on('deleteActiveEffect', async (effect, options, userId) => {
    if (game.userId !== userId) return;

    // Grappling removed from source → clean up linked Restrained on targets
    if (effect.statuses?.has('grappling')) {
      const targetUuids = effect.flags?.vagabond?.grappling?.targetUuids ?? [];
      for (const uuid of targetUuids) {
        try {
          const target = await fromUuid(uuid);
          if (!target) continue;
          const linkedAE = target.effects?.find(e =>
            e.statuses?.has('restrained') &&
            e.flags?.vagabond?.fromGrapple &&
            e.flags.vagabond.grappleSourceUuid === effect.parent?.uuid
          );
          if (linkedAE && target.effects?.get(linkedAE.id)) await linkedAE.delete();
        } catch(err) {
          console.warn('Vagabond | Could not remove Restrained on grapple end:', err);
        }
      }
    }

    // Restrained (from grapple) removed from target → remove Grappling from source
    if (effect.statuses?.has('restrained') && effect.flags?.vagabond?.fromGrapple) {
      const sourceUuid = effect.flags.vagabond.grappleSourceUuid;
      if (!sourceUuid) return;
      try {
        const source = await fromUuid(sourceUuid);
        if (!source) return;
        const grapplingAE = source.effects?.find(e =>
          e.statuses?.has('grappling') &&
          e.flags?.vagabond?.grappling?.targetUuids?.includes(effect.parent?.uuid)
        );
        if (grapplingAE && source.effects?.get(grapplingAE.id)) await grapplingAE.delete();
      } catch(err) {
        console.warn('Vagabond | Could not remove Grappling on restrained end:', err);
      }
    }
  });

  /**
   * Redraw clocks when a journal is created
   */
  Hooks.on('createJournalEntry', async (journal, options, userId) => {
    // Handle progress clocks
    if (journal.flags?.vagabond?.progressClock?.type === 'progressClock') {
      if (clockOverlay) {
        await clockOverlay.draw();
      }
    }

    // Handle countdown dice
    if (journal.flags?.vagabond?.countdownDice?.type === 'countdownDice') {
      if (diceOverlay) {
        await diceOverlay.draw();
      }
    }
  });

  /**
   * Restore a hidden progress clock by dragging its journal entry from the
   * sidebar onto the canvas. The clock reappears at the drop point.
   * Must stay synchronous — Foundry does not await hook callbacks.
   */
  Hooks.on('dropCanvasData', (canvas, data) => {
    if (data.type !== 'JournalEntry') return true;

    const journal = data.uuid ? fromUuidSync(data.uuid) : game.journal.get(data.id);
    if (journal?.flags?.vagabond?.progressClock?.type !== 'progressClock') return true; // not a clock — let default run

    if (!journal.testUserPermission(game.user, 'OWNER')) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.ProgressClock.NoPermission'));
      return false;
    }

    const pcData = journal.flags.vagabond.progressClock;
    const sceneId = canvas.scene?.id;
    const update = { 'flags.vagabond.progressClock.hidden': false };

    if (sceneId) {
      // Convert world coords → screen px (overlay is position:fixed full-window)
      const p = canvas.stage.worldTransform.apply({ x: data.x, y: data.y });
      const order = pcData.positions?.[sceneId]?.order ?? 0;
      update[`flags.vagabond.progressClock.positions.${sceneId}`] = {
        x: Math.round(p.x),
        y: Math.round(p.y),
        order
      };
      // If bound to a different scene, follow the drop; global clocks stay global
      if (pcData.sceneId && pcData.sceneId !== sceneId) {
        update['flags.vagabond.progressClock.sceneId'] = sceneId;
      }
    }

    journal.update(update); // fire-and-forget; updateJournalEntry hook redraws
    return false; // block default map-Note creation
  });
}
