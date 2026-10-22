import { CountdownDice } from '../documents/countdown-dice.mjs';
import { VagabondChatCard } from '../helpers/chat-card.mjs';
import { ConjureHelper } from '../helpers/conjure-helper.mjs';
import { CraftingHelper } from '../helpers/crafting-helper.mjs';
import { VagabondDamageHelper } from '../helpers/damage-helper.mjs';
import { FocusUpkeep } from '../helpers/focus-upkeep.mjs';
import { runMacroFromButton, macroDescriptorFromButton } from '../helpers/item-macro.mjs';
import { MacroAutoRun } from '../helpers/macro-autorun.mjs';
import { SpellSurface } from '../helpers/spell-surface.mjs';
import { TargetHelper } from '../helpers/target-helper.mjs';
import { GMRelay } from '../helpers/gm-relay.mjs';
import { WardHelper } from '../helpers/ward-helper.mjs';
import { VagabondGlyphHelper } from '../helpers/glyph-helper.mjs';
import { VagabondImbueHelper } from '../helpers/imbue-helper.mjs';

/**
 * Chat card button wiring: the renderChatMessageHTML hook.
 * Moved out of vagabond.mjs; called once at module load, in the original order.
 */
export function registerChatMessageHooks() {
  /**
   * V13 Standard: 'renderChatMessageHTML' hook.
   * The 'html' argument is a standard HTMLElement.
   */
  Hooks.on('renderChatMessageHTML', (message, html) => {
    // Safety check: ensure html is a valid element
    if (!html || typeof html.querySelectorAll !== 'function') {
      return;
    }

    // Hide resource value notes (e.g. "HP: 18 → 16") from non-GM players
    if (!game.user.isGM) {
      html.querySelectorAll('.gm-only').forEach(el => el.remove());
      // Owner-gated controls (NPC damage button): kept for players who own that actor,
      // e.g. an Undead raised by the Raise Spell and handed to its caster's player.
      html.querySelectorAll('.owner-only[data-actor-id]').forEach(el => {
        if (!TargetHelper.resolveActorRef(el.dataset.actorId)?.isOwner) el.remove();
      });
    }

    // ---------------------------------------------------------
    // 0. Actor portrait drag-to-canvas
    // Portrait images inside .header-icon[data-actor-uuid] carry draggable="true".
    // Wire the dragstart so dropping onto the canvas places a token for that actor.
    // ---------------------------------------------------------
    html.querySelectorAll('.header-icon[data-actor-uuid] img.vbd-actor-portrait-drag').forEach(img => {
      img.addEventListener('dragstart', (ev) => {
        const icon = img.closest('.header-icon');
        const uuid = icon?.dataset.actorUuid;
        if (!uuid) return;
        ev.dataTransfer.setData('text/plain', JSON.stringify({ type: 'Actor', uuid }));
      });
    });

    // ---------------------------------------------------------
    // 1. Accordion Toggle Handler (Properties)
    // ---------------------------------------------------------
    // 1. Accordion Toggle Handler (Properties)
    // Handles triggers whether they are inside or outside the container
    const propertyToggles = html.querySelectorAll('[data-action="toggleProperties"]');

    propertyToggles.forEach(toggle => {
      toggle.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const trigger = ev.currentTarget;
        let container = null;

        // Strategy A: Is the trigger directly inside the box? (Old style)
        if (trigger.closest('.metadata-item-expandable')) {
            container = trigger.closest('.metadata-item-expandable');
        } 
        // Strategy B: Trigger is in Header -> Find the box inside the main card
        else {
            const card = trigger.closest('.vagabond-chat-card-v2');
            if (card) {
                container = card.querySelector('.metadata-item-expandable');
            }
        }

        if (container) {
          container.classList.toggle('expanded');
        }
      });
    });

    // ---------------------------------------------------------
    // 2. Accordion Toggle Handler (Defend Info) - FIXED
    // Replaced jQuery .find() with native .querySelectorAll()
    // ---------------------------------------------------------
    const defendToggles = html.querySelectorAll('.defend-header');

    defendToggles.forEach(toggle => {
      toggle.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const header = ev.currentTarget;
        const box = header.closest('.defend-info-box');

        if (box) {
          box.classList.toggle('expanded');
        }
      });
    });

    // Damage dice + modifiers fold away under the total; click (or Enter/Space) the total to open
    html.querySelectorAll('[data-dice-toggle]').forEach(toggle => {
      const flip = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const block = toggle.closest('.damage-block');
        if (!block) return;
        const open = block.classList.toggle('dice-open');
        toggle.setAttribute('aria-expanded', String(open));
      };
      toggle.addEventListener('click', flip);
      toggle.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') flip(ev);
      });
    });

    // ---------------------------------------------------------
    // 3. Damage Roll Button Handler
    // ---------------------------------------------------------
    const damageButtons = html.querySelectorAll('.vagabond-damage-button');

    damageButtons.forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        // Disable immediately to prevent double-clicks
        button.disabled = true;

        VagabondDamageHelper.rollDamageFromButton(button, message.id);
      });
    });

    // ---------------------------------------------------------
    // 4. Save Button Handler (Roll to Save)
    // ---------------------------------------------------------
    const saveButtons = html.querySelectorAll('.vagabond-save-button');

    saveButtons.forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        VagabondDamageHelper.handleSaveRoll(button, ev);
      });
    });

    // ---------------------------------------------------------
    // 4b. Save Reminder Button Handler (Roll Save Without Damage)
    // ---------------------------------------------------------
    const saveReminderButtons = html.querySelectorAll('.vagabond-save-reminder-button');

    saveReminderButtons.forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        VagabondDamageHelper.handleSaveReminderRoll(button, ev);
      });
    });

    // ---------------------------------------------------------
    // 5. Apply Direct Damage Button Handler
    // ---------------------------------------------------------
    const applyDirectButtons = html.querySelectorAll('.vagabond-apply-direct-button');

    applyDirectButtons.forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        VagabondDamageHelper.handleApplyDirect(button);
      });
    });

    // 5a. Apply Effect (effect-only Spell Cast: the Spell's statuses, no damage card)
    html.querySelectorAll('.vagabond-apply-spell-effect-button').forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        VagabondDamageHelper.handleApplySpellEffect(button);
      });
    });

    // ---------------------------------------------------------
    // 5b. Defense Button Handler (Defense weapon property)
    // ---------------------------------------------------------
    const defenseButtons = html.querySelectorAll('.vagabond-defense-button');

    defenseButtons.forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        VagabondDamageHelper.handleDefenseWeapons(button, ev);
      });
    });

    // Protector perk: use your Defense property for a Close ally who failed a Reflex Save
    html.querySelectorAll('.vagabond-protect-button').forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        VagabondDamageHelper.handleProtect(button, ev);
      });
    });

    // Ward upcast: damage card Ward button → Ward card (Mana stars + Ward Off!) → roll card
    html.querySelectorAll('.vagabond-ward-button').forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        WardHelper.openPrompt(button);
      });
    });
    html.querySelectorAll('.ward-mana-pip').forEach(pip => {
      pip.addEventListener('click', (ev) => {
        ev.preventDefault();
        WardHelper.pickPip(pip);
      });
    });
    html.querySelectorAll('.vagabond-ward-off-button').forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        WardHelper.wardOff(button, ev);
      });
    });

    // Spell Surface result card: Dismiss the area
    html.querySelectorAll('.vagabond-surface-dismiss').forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        SpellSurface.handleDismissButton(button);
      });
    });

    // Conjure result card: Dismiss what the Cast called forth
    html.querySelectorAll('.vagabond-conjure-dismiss').forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        ConjureHelper.handleDismissButton(button);
      });
    });

    // Focus Mana (Ward / Polymorph / Beast): Pay or Drop Focus at the start of the caster's Turn
    html.querySelectorAll('.vagabond-focus-upkeep-button').forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        FocusUpkeep.handleButton(button);
      });
    });

    // ---------------------------------------------------------
    // 6. Apply Restorative Effects Button Handlers
    // ---------------------------------------------------------
    const restorativeButtons = html.querySelectorAll(
      '.vagabond-apply-healing-button, .vagabond-apply-recover-button, .vagabond-apply-recharge-button'
    );
    restorativeButtons.forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        VagabondDamageHelper.handleApplyRestorative(button);
      });
    });

    // ---------------------------------------------------------
    // 7. Countdown Dice Trigger Handler (Chat Card Descriptions)
    // ---------------------------------------------------------
    const countdownTriggers = html.querySelectorAll('.countdown-dice-trigger');

    countdownTriggers.forEach(trigger => {
      trigger.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        // Extract dice type from data attribute
        let diceType = trigger.dataset.diceType || trigger.dataset.diceSize;

        // If we got just a number (from data-dice-size), add the "d" prefix
        if (diceType && !diceType.startsWith('d')) {
          diceType = 'd' + diceType;
        }

        if (!diceType) return;

        // Validate dice type
        const validDiceTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
        if (!validDiceTypes.includes(diceType)) {
          console.warn(`Invalid dice type for countdown: ${diceType}`);
          return;
        }

        // Get spell/item name from message flags or use a default
        const itemId = message.flags?.vagabond?.itemId;
        let name = 'Countdown';

        if (itemId) {
          const actorId = message.flags?.vagabond?.actorId;
          const actor = TargetHelper.resolveActorRef(actorId);
          if (actor) {
            const item = actor.items.get(itemId);
            if (item) {
              name = item.name;
            }
          }
        }

        // Create countdown dice
        await CountdownDice.create({
          name: name,
          diceType: diceType,
          size: 'S', // Small size
          exploding: trigger.dataset.exploding === 'true', // "Cd4!" notation
        });
      });
    });

    // ---------------------------------------------------------
    // 8. Tick Damage Apply Button (Countdown Dice, manual-apply mode)
    // ---------------------------------------------------------
    const tickDamageButtons = html.querySelectorAll('.vagabond-tick-damage-button');

    tickDamageButtons.forEach(button => {
      button.addEventListener('click', async (ev) => {
        ev.preventDefault();
        button.disabled = true;
        try {
          const actorUuid = button.dataset.actorUuid;
          const amount = parseInt(button.dataset.damageAmount);
          if (!actorUuid || isNaN(amount) || amount <= 0) return;
          const actor = await fromUuid(actorUuid);
          if (!actor) { ui.notifications.warn('Target actor not found.'); return; }
          const currentHP = actor.system.health?.value ?? 0;
          const newHP = Math.max(0, currentHP - amount);
          if (actor.isOwner || game.user.isGM) {
            await actor.update({ 'system.health.value': newHP });
          } else {
            GMRelay.send('vagabond.updateActorField', { actorUuid: actor.uuid, field: 'system.health.value', value: newHP });
          }
          await VagabondChatCard.applyResult(actor, {
            type: 'damage',
            rawAmount: amount,
            finalAmount: amount,
            previousValue: currentHP,
            newValue: newHP,
          });
        } catch (err) {
          console.error('Vagabond | Tick damage apply failed:', err);
          button.disabled = false;
        }
      });
    });

    // ---------------------------------------------------------
    // 8. [REMOVED] Favor/Hinder Dice Styling
    // This logic is now handled server-side in chat-card.mjs
    // (formatRollWithDice) and styled via CSS classes.
    // ---------------------------------------------------------

    // ---------------------------------------------------------
    // 9. NPC Damage Button Handler (GM + owners of the NPC — `.owner-only`)
    // ---------------------------------------------------------
    const npcButtons = html.querySelectorAll('.vagabond-npc-damage-button');

    npcButtons.forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        VagabondDamageHelper.handleNPCDamageButton(button, message.id);
      });
    });

    // ---------------------------------------------------------
    // 9.5 Item Damage Button Handler (for healing potions, bombs, etc)
    // ---------------------------------------------------------
    const itemButtons = html.querySelectorAll('.vagabond-item-damage-button');

    itemButtons.forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        VagabondDamageHelper.handleItemDamageButton(button, message.id);
      });
    });

    // ---------------------------------------------------------
    // 10. Apply Save Damage Button Handler
    // ---------------------------------------------------------
    const applySaveButtons = html.querySelectorAll('.vagabond-apply-save-damage-button');

    applySaveButtons.forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        VagabondDamageHelper.handleApplySaveDamage(button);
      });
    });

    // ---------------------------------------------------------
    // 10b. Crit Benefit Toggle Handler (Save Cards)
    // Toggles between claiming crit benefit (0 damage) and keeping Luck (save-reduced damage)
    // ---------------------------------------------------------
    const critToggles = html.querySelectorAll('[data-action="toggleCritBenefit"]');
    critToggles.forEach(toggle => {
      toggle.addEventListener('click', (ev) => {
        ev.preventDefault();
        const container = toggle.closest('.save-crit-toggle');
        if (!container) return;
        const wasActive = container.dataset.critActive === 'true';
        container.dataset.critActive = wasActive ? 'false' : 'true';
        const isNowActive = container.dataset.critActive === 'true';

        // Sync the Apply button's damage amount
        const applyBtn = container.querySelector('.vagabond-apply-save-damage-button[data-damage-crit]');
        if (applyBtn) {
          const newAmount = isNowActive
            ? parseInt(applyBtn.dataset.damageCrit ?? 0)
            : parseInt(applyBtn.dataset.damageNormal ?? 0);
          applyBtn.dataset.damageAmount = newAmount;
          applyBtn.innerHTML = `<i class="fas fa-burst"></i> Apply ${newAmount} to ${applyBtn.dataset.actorName}`;
        }

        // Manage luck: benefit claimed (active) → remove luck + delete luck card; luck kept → grant luck
        const actorId = container.dataset.actorId;
        const actor = TargetHelper.resolveActorRef(actorId);
        if (actor) {
          (async () => {
            if (isNowActive) {
              // Delete the luck gain card that was posted when toggling to luck-kept
              const luckMsgId = container.dataset.luckMessageId;
              if (luckMsgId) {
                const luckMsg = game.messages.get(luckMsgId);
                if (luckMsg) await luckMsg.delete();
                delete container.dataset.luckMessageId;
              }
              VagabondChatCard._removeLuckForCritBenefit(actor);
            } else {
              const luckMsg = await VagabondChatCard._grantLuckOnCrit(actor, null, 'Critical Save');
              if (luckMsg?.id) container.dataset.luckMessageId = luckMsg.id;
            }
          })();
        }
      });
    });

    // ---------------------------------------------------------
    // 10c. Attack Crit Benefit Toggle Handler (Attack/Cast Cards)
    // Toggles between claiming crit benefit (stat bonus damage) and keeping Luck (base damage)
    // ---------------------------------------------------------
    const attackCritToggles = html.querySelectorAll('[data-action="toggleAttackCritBenefit"]');
    attackCritToggles.forEach(toggle => {
      toggle.addEventListener('click', (ev) => {
        ev.preventDefault();
        const container = toggle.closest('.attack-crit-toggle');
        if (!container) return;
        // Attack-card toggle locks once Roll Damage has been clicked (damage already rolled)
        if (container.dataset.critLocked === 'true') return;
        const wasActive = container.dataset.critActive === 'true';
        container.dataset.critActive = wasActive ? 'false' : 'true';
        const isNowActive = container.dataset.critActive === 'true';

        // Update data-damage-amount on all save/apply buttons that carry the crit attrs
        const contentBody = container.closest('.content-body');
        if (contentBody) {
          const buttons = contentBody.querySelectorAll('[data-damage-crit][data-damage-normal]');
          buttons.forEach(btn => {
            btn.dataset.damageAmount = isNowActive
              ? parseInt(btn.dataset.damageCrit ?? 0)
              : parseInt(btn.dataset.damageNormal ?? 0);
          });
        }

        // Manage luck: benefit claimed (active) → remove luck + delete luck card; luck kept → grant luck
        const actorId = container.dataset.actorId;
        const actor = TargetHelper.resolveActorRef(actorId);
        if (actor) {
          (async () => {
            if (isNowActive) {
              const luckMsgId = container.dataset.luckMessageId;
              if (luckMsgId) {
                const luckMsg = game.messages.get(luckMsgId);
                if (luckMsg) await luckMsg.delete();
                delete container.dataset.luckMessageId;
              }
              VagabondChatCard._removeLuckForCritBenefit(actor);
            } else {
              const luckMsg = await VagabondChatCard._grantLuckOnCrit(actor, null, 'Critical Hit');
              if (luckMsg?.id) container.dataset.luckMessageId = luckMsg.id;
            }
          })();
        }
      });
    });

    // ---------------------------------------------------------
    // 10. Template Trigger Handler
    // ---------------------------------------------------------
    const templateTriggers = html.querySelectorAll('.template-trigger');

    templateTriggers.forEach(trigger => {
      trigger.addEventListener('click', async (ev) => {
        ev.preventDefault();

        const deliveryType = trigger.dataset.deliveryType;
        const deliveryText = trigger.dataset.deliveryText;
        const damageType = trigger.dataset.damageType ?? null;
        const fxSchool = trigger.dataset.fxSchool || null;

        if (!deliveryType) return;

        if (globalThis.vagabond?.managers?.templates) {
          const created = await globalThis.vagabond.managers.templates.fromChat(deliveryType, deliveryText, message, damageType, fxSchool);
          trigger.classList.toggle('active', created);
        } else {
          console.warn("VagabondSystem | Template manager not found.");
        }
      });
    });

    // ---------------------------------------------------------
    // 11. Grapple Button Handler
    // ---------------------------------------------------------
    const grappleButtons = html.querySelectorAll('.vagabond-grapple-button');
    grappleButtons.forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        button.disabled = true;
        VagabondDamageHelper.handleGrapple(button);
      });
    });

    // ---------------------------------------------------------
    // 10d. Glyph chat-card buttons — Trigger fires the placed glyph's spell in
    // its 5' cube; Dismiss removes it. Both resolve the Region by uuid and warn
    // if the glyph is already gone (permission is checked inside the helper).
    // ---------------------------------------------------------
    html.querySelectorAll('.vagabond-glyph-trigger-button, .vagabond-glyph-dismiss-button').forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        const action = button.classList.contains('vagabond-glyph-trigger-button') ? 'trigger' : 'dismiss';
        VagabondGlyphHelper.fromChatButton(button.dataset.regionUuid, action);
      });
    });

    // ---------------------------------------------------------
    // 10e. Crafting Approval Buttons (GM Only) — see CraftingHelper.request/resolveApproval.
    // ---------------------------------------------------------
    html.querySelectorAll('.vagabond-craft-approve-button, .vagabond-craft-deny-button').forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        if (!game.user.isGM) return;
        const approve = button.classList.contains('vagabond-craft-approve-button');
        button.closest('.vagabond-craft-approval-buttons')?.querySelectorAll('button')
          .forEach(b => { b.disabled = true; });
        CraftingHelper.resolveApproval(message.id, approve);
      });
    });

    // ---------------------------------------------------------
    // 11a. Imbue Delivery Button Handler (upfront-mode: single click, amount locked at cast)
    // ---------------------------------------------------------
    const imbueDeliverButtons = html.querySelectorAll('.vagabond-imbue-deliver-button');
    imbueDeliverButtons.forEach(button => {
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        button.disabled = true;
        VagabondImbueHelper.deliverImbue(button);
      });
    });

    // ---------------------------------------------------------
    // 11a2. Imbue Delivery Controls (deferred-payment mode) — click the Damage
    // node (left-click +1 die, right-click -1 die) + Effect checkbox + live
    // Mana total, bounded by the caster's current Mana/casting max. Pure
    // client-side DOM math until Confirm & Deliver.
    // ---------------------------------------------------------
    const imbueControls = html.querySelectorAll('.vagabond-imbue-delivery-controls');
    imbueControls.forEach(container => {
      const countEl = container.querySelector('.vagabond-imbue-dice-count');
      const totalEl = container.querySelector('.vagabond-imbue-total-value');
      const effectCheckbox = container.querySelector('.vagabond-imbue-effect-checkbox');
      const diceControl = container.querySelector('.vagabond-imbue-dice-control');
      const confirmBtn = container.querySelector('.vagabond-imbue-confirm-button');

      const computeCost = (dice, effect) => {
        const diceCost = dice >= 1 ? Math.max(0, dice - 1) : 0;
        const fxCost = dice >= 1 && effect ? 1 : 0;
        return 1 + diceCost + fxCost;
      };
      const render = () => {
        const dice = parseInt(container.dataset.dice || '0');
        const effect = container.dataset.effect === 'true';
        if (countEl) countEl.textContent = dice;
        if (totalEl) totalEl.textContent = computeCost(dice, effect);
      };
      const getAvailableMana = async () => {
        const sourceActor = await fromUuid(container.dataset.sourceActorUuid);
        if (!sourceActor) return 0;
        return Math.min(sourceActor.system.mana.current, sourceActor.system.mana.castingMax);
      };

      diceControl?.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const dice = parseInt(container.dataset.dice || '0') + 1;
        const effect = container.dataset.effect === 'true';
        const cost = computeCost(dice, effect);
        const available = await getAvailableMana();
        if (cost > available) {
          ui.notifications.warn(game.i18n.localize('VAGABOND.Status.Imbue.NotEnoughMana'));
          return;
        }
        container.dataset.dice = dice;
        render();
      });

      diceControl?.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const dice = Math.max(0, parseInt(container.dataset.dice || '0') - 1);
        container.dataset.dice = dice;
        render();
      });

      effectCheckbox?.addEventListener('change', async () => {
        const dice = parseInt(container.dataset.dice || '0');
        const wantEffect = effectCheckbox.checked;
        const cost = computeCost(dice, wantEffect);
        const available = await getAvailableMana();
        if (wantEffect && cost > available) {
          effectCheckbox.checked = false;
          ui.notifications.warn(game.i18n.localize('VAGABOND.Status.Imbue.NotEnoughMana'));
          return;
        }
        container.dataset.effect = wantEffect;
        render();
      });

      confirmBtn?.addEventListener('click', (ev) => {
        ev.preventDefault();
        confirmBtn.disabled = true;
        const damageDice = parseInt(container.dataset.dice || '0');
        const useFx = container.dataset.effect === 'true';
        VagabondImbueHelper.deliverImbue(container, { damageDice, useFx });
      });
    });

    // ---------------------------------------------------------
    // 11b. Item/Spell Macro Button Handler
    // Runs a macro linked on the source item/spell. The macro receives
    // { actor, item, token, targets, speaker, isCritical } as scope variables.
    // ---------------------------------------------------------
    const macroButtons = html.querySelectorAll('.vagabond-macro-button');
    macroButtons.forEach(button => {
      button.addEventListener('click', async (ev) => {
        ev.preventDefault();
        try {
          // A hand-clicked hit macro is never auto-run afterwards (MacroAutoRun)
          if (button.dataset.macroSlot === 'hitMacro') MacroAutoRun.markRan(message);
          await runMacroFromButton(macroDescriptorFromButton(button, message));
        } catch (err) {
          console.error('VAGABOND | Item macro execution failed:', err);
          ui.notifications.error('Macro execution failed — see console (F12).');
        }
      });
    });

    // ---------------------------------------------------------
    // 12. Target Token Click Handler (Ping & Pan)
    // ---------------------------------------------------------
    const targetTokens = html.querySelectorAll('.target-token');

    targetTokens.forEach(targetElement => {
      targetElement.addEventListener('click', async (ev) => {
        ev.preventDefault();

        const tokenId = targetElement.dataset.tokenId;
        const sceneId = targetElement.dataset.sceneId;

        if (!tokenId || !sceneId) return;

        // Check if target is on a different scene
        if (sceneId !== canvas.scene?.id) {
          ui.notifications.warn('Target is on a different scene. Switching scenes...');
          const scene = game.scenes.get(sceneId);
          if (scene) {
            await scene.view();
            // Wait a moment for scene to load
            await new Promise(resolve => setTimeout(resolve, 100));
          } else {
            ui.notifications.error('Target scene not found.');
            return;
          }
        }

        // Get the token on the current scene
        const token = canvas.tokens.get(tokenId);
        if (!token) {
          ui.notifications.warn('Target token not found on scene.');
          return;
        }

        // Pan to token
        await canvas.animatePan({
          x: token.center.x,
          y: token.center.y,
          duration: 250
        });

        // Ping the token location
        canvas.ping(token.center, {
          style: canvas.grid.type === 0 ? 'pulse' : 'alert',
          color: game.user.color
        });
      });
    });
  });


}
