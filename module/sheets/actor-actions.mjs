import { CountdownDice } from '../documents/countdown-dice.mjs';
import { VagabondChatCard } from '../helpers/chat-card.mjs';
import { ItemChatCards } from '../helpers/item-chat-cards.mjs';
import { NoticeChatCards } from '../helpers/notice-chat-cards.mjs';
import { VagabondDiceAppearance } from '../helpers/dice-appearance.mjs';
import { VagabondChatHelper } from '../helpers/chat-helper.mjs';
import { CurrencyHelper } from '../helpers/currency-helper.mjs';
import { FeatureAction } from '../helpers/feature-action.mjs';
import { ContextMenuHelper } from '../helpers/context-menu-helper.mjs';
import { AlchemyLab } from '../helpers/alchemy-lab.mjs';
import { GMRelay } from '../helpers/gm-relay.mjs';

/**
 * Actor actions shared by the actor sheets and the compact views (Character / NPC HUD):
 * status icons, Favor / Hinder, Luck, Studied dice, Mana, check bonus, class feature buttons,
 * wealth, NPC action / ability clicks, Morale, Appearing, recharge countdowns.
 * Action handlers run with `this` = the sheet or HUD; helpers take it as first argument.
 */
export class ActorActions {
  /**
   * Prepare items for rendering
   * @param {Object} context - Render context
   * @private
   */
  /**
   * Prepare status effects for display
   * Only includes status conditions from CONFIG.statusEffects (not item effects)
   * @returns {Array} Array of status effect data
   * @private
   */
  static _prepareStatusEffects(sheet) {
    const effects = [];

    // Get valid status IDs from CONFIG.statusEffects
    const validStatusIds = new Set(
      CONFIG.statusEffects?.map(s => s.id) || []
    );

    // Get all active effects
    for (const effect of sheet.actor.effects) {
      if (effect.disabled) continue; // Skip disabled effects

      // Only include effects that have a status matching our defined status conditions
      const hasValidStatus = Array.from(effect.statuses || []).some(statusId =>
        validStatusIds.has(statusId)
      );

      if (!hasValidStatus) continue; // Skip non-status effects (item effects, etc.)

      effects.push({
        id: effect.id,
        uuid: effect.uuid,
        name: effect.name || effect.label || 'Unknown',
        icon: effect.img || 'icons/svg/aura.svg',
        description: effect.description || '',
        statuses: Array.from(effect.statuses || [])
      });
    }

    return effects;
  }

  static async _onRollMorale(event, target) {
    return this.rollHandler?.rollMorale(event, target);
  }

  static async _onRollAppearing(event, target) {
    return this.rollHandler?.rollAppearing(event);
  }

  static async _onCreateCountdownFromRecharge(event, target) {
    return this.actionHandler?.createCountdownFromRecharge(event, target);
  }

  static async _onRollRechargeCountdown(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const countdownId = target.dataset.countdownId;
    if (!countdownId) return;
    const journal = game.journal.get(countdownId);
    if (!journal) return;
    const diceOverlay = globalThis.vagabond?.ui?.countdownDiceOverlay;
    if (diceOverlay) {
      await diceOverlay._onRollDice(journal);
    }
  }

  /**
   * Handle clicking NPC action name (posts to chat)
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onClickActionName(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.index);
    const action = this.actor.system.actions[index];

    if (!action || !action.name) return;

    // If recharge is a standalone Cdx countdown dice and not yet on cooldown, auto-create one
    const cdRechargePattern = /^Cd\d+$/i;
    if (cdRechargePattern.test(action.recharge?.trim() ?? '') && !action.rechargeCountdownId) {
      const diceType = action.recharge.trim().replace(/^C/i, '').toLowerCase(); // "Cd6" → "d6"
      const journal = await CountdownDice.create({
        name: `${this.actor.name}: ${action.name}`,
        diceType,
        linkedRechargeActorUuid: this.actor.uuid,
        linkedRechargeActionIndex: index,
      });
      const actions = foundry.utils.deepClone(this.actor.system.actions || []);
      actions[index].rechargeCountdownId = journal.id;
      await this.actor.update({ 'system.actions': actions });
    }

    // Capture targeted tokens for NPC action
    const targetsAtRollTime = Array.from(game.user.targets).map(token => ({
      tokenId: token.id,
      sceneId: token.scene.id,
      actorId: token.actor?.id,
      actorName: token.name,
      actorImg: token.document.texture.src
    }));

    // Use the unified chat card system
    await ItemChatCards.npcAction(this.actor, action, index, targetsAtRollTime);
  }

  /**
   * Handle clicking NPC action damage roll (rolls damage dice)
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onClickActionDamageRoll(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.index);
    const action = this.actor.system.actions[index];

    if (!action || !action.rollDamage) return;

    // Roll the damage dice
    const roll = new Roll(action.rollDamage, this.actor.getRollData());
    VagabondDiceAppearance.applyDamageColorset(roll, action.damageType);
    await roll.evaluate();
    await VagabondChatHelper.postRoll(
      this.actor,
      roll,
      `<strong>${action.name}</strong> Damage`
    );
  }

  /**
   * Handle clicking NPC ability name (posts to chat)
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onClickAbilityName(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.index);
    const ability = this.actor.system.abilities[index];

    if (!ability || !ability.name) return;

    // Use the unified chat card system (handles text-only abilities)
    await ItemChatCards.npcAction(this.actor, ability, index);
  }

  /**
   * Handle leveling up the character
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  /** Wealth trade icon: exchange copper→silver→gold into the largest coins. Shared with the HUD. */
  static async _onConsolidateWealth() {
    const current = CurrencyHelper.normalize(this.actor.system.currency);
    const traded = CurrencyHelper.consolidate(current);
    if (['gold', 'silver', 'copper'].every((d) => traded[d] === current[d])) {
      ui.notifications.info(game.i18n.localize('VAGABOND.Hud.WealthAlreadyTrimmed'));
      return;
    }
    await this.actor.update({ 'system.currency': traded });
  }

  /**
   * Feature / trait / perk action button (see helpers/feature-action.mjs).
   * Left-click runs it; right-click opens Run / Add to Belt.
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onFeatureAction(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const key = target.dataset.actionKey;
    if (!key) return;
    if (event.type === 'contextmenu' || event.button === 2) {
      // A glowing (active) action: right-click ENDS it. Otherwise the run / pin menu.
      if (await FeatureAction.end(this.actor, key)) return;
      ContextMenuHelper.closeAll();
      return ContextMenuHelper.create({
        position: { x: event.clientX, y: event.clientY },
        items: FeatureAction.menuItems(this.actor, key),
        className: 'inventory-context-menu',
      });
    }
    // Catalyze / Mix: open the Alchemy lab at that station instead of running anything
    const station = AlchemyLab.stationForAction(this.actor, key);
    if (station) return AlchemyLab.openInSheet(this, station);
    return FeatureAction.run(this.actor, key);
  }

  /**
   * Handle status icon click - send to chat
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onStatusClick(event, target) {
    const effectId = target.dataset.effectId;
    if (!effectId) return;

    const effect = this.actor.effects.get(effectId);
    if (!effect) return;

    await NoticeChatCards.statusEffect(this.actor, effect);
  }

  /**
   * Toggle favor/hinder state
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onToggleFavorHinder(event, target) {
    const currentState = this.actor.system.favorHinder || 'none';
    const states = Object.keys(CONFIG.VAGABOND.favorHinderStates);
    const currentIndex = states.indexOf(currentState);
    const nextIndex = (currentIndex + 1) % states.length;
    const newState = states[nextIndex];

    await this.actor.update({ 'system.favorHinder': newState });
  }

  /**
   * Spend or recharge luck
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onSpendLuck(event, target) {
    event.preventDefault();
    const currentLuck = this.actor.system.currentLuck || 0;

    if (event.shiftKey) {
      // Shift+Click: Add +1 luck (no cap — the Luck Stat is only the Rest reset value)
      const newLuck = currentLuck + 1;
      await this.actor.update({ 'system.currentLuck': newLuck });
      await VagabondChatCard.luckGain(this.actor, newLuck);
    } else {
      // Regular Click: Spend (decrement)
      if (currentLuck > 0) {
        const newLuck = currentLuck - 1;
        await this.actor.update({ 'system.currentLuck': newLuck });
        await NoticeChatCards.luckSpend(this.actor, newLuck);
      }
    }
  }

  /**
   * Spend or add studied die
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onSpendStudiedDie(event, target) {
    event.preventDefault();
    const currentDice = this.actor.system.studiedDice || 0;

    if (event.shiftKey) {
      // Shift+Click: Add a studied die
      const newCount = currentDice + 1;
      await this.actor.update({ 'system.studiedDice': newCount });
      await NoticeChatCards.studiedDieGain(this.actor, newCount);
    } else {
      // Regular Click: Spend (roll d6 and decrement)
      if (currentDice > 0) {
        // Roll the d6
        const roll = new Roll('1d6');
        await roll.evaluate();

        const remainingDice = currentDice - 1;
        await this.actor.update({ 'system.studiedDice': remainingDice });
        await NoticeChatCards.studiedDieSpend(this.actor, roll, remainingDice);
      }
    }
  }

  /**
   * Modify universal check bonus
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onModifyCheckBonus(event, target) {
    event.preventDefault();
    const currentBonus = this.actor.system.manualCheckBonus || 0;

    // Left click: +1, Right click: -1
    if (event.button === 2 || event.type === 'contextmenu') {
      // Right click: decrement
      const newBonus = currentBonus - 1;
      await this.actor.update({ 'system.manualCheckBonus': newBonus });
    } else {
      // Left click: increment
      const newBonus = currentBonus + 1;
      await this.actor.update({ 'system.manualCheckBonus': newBonus });
    }
  }

  /**
   * Modify mana (spend or restore)
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The capturing HTML element
   * @protected
   */
  static async _onModifyMana(event, target) {
    event.preventDefault();
    const currentMana = this.actor.system.mana.current || 0;
    const maxMana = this.actor.system.mana.max || 0;

    // Left click: spend mana (decrement), Right click: restore mana (increment)
    if (event.button === 2 || event.type === 'contextmenu') {
      // Right click: restore (increment)
      const newMana = Math.min(currentMana + 1, maxMana);
      await this.actor.update({ 'system.mana.current': newMana });
    } else {
      // Left click: spend (decrement)
      const newMana = Math.max(currentMana - 1, 0);
      await this.actor.update({ 'system.mana.current': newMana });
    }
  }

  /**
   * Setup status icon context menu listeners
   * @private
   */
  static _setupStatusIconListeners(sheet) {
    const statusIcons = sheet.element.querySelectorAll('.status-icon');

    statusIcons.forEach(icon => {
      // Right-click: Show context menu
      icon.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const effectId = icon.dataset.effectId;
        if (!effectId) return;

        const effect = sheet.actor.effects.get(effectId);
        if (!effect) return;

        const menuItems = [
          {
            label: game.i18n.localize('VAGABOND.ContextMenu.SendToChat'),
            icon: 'fas fa-comment',
            enabled: true,
            action: async () => {
              await NoticeChatCards.statusEffect(sheet.actor, effect);
            }
          },
          {
            label: game.i18n.localize('VAGABOND.ContextMenu.RemoveStatus'),
            icon: 'fas fa-times',
            enabled: true,
            action: async () => {
              if (sheet.actor.isOwner || game.user.isGM) {
                await effect.delete();
              } else {
                const statusId = effect.statuses?.first() || effect.flags?.core?.statusId;
                GMRelay.send('vagabond.applyStatus', { actorUuid: sheet.actor.uuid, statusId, active: false });
              }
            }
          }
        ];

        ContextMenuHelper.create({
          position: { x: event.clientX, y: event.clientY },
          items: menuItems,
          onClose: () => {},
          className: 'status-context-menu'
        });
      });
    });
  }
}
