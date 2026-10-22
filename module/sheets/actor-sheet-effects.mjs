import { toggleActorEffect, isStatusEffect, toggleBlockerOf } from '../helpers/effects.mjs';
import { StatusHelper } from '../helpers/status-helper.mjs';
import { NoticeChatCards } from '../helpers/notice-chat-cards.mjs';
import { ContextMenuHelper } from '../helpers/context-menu-helper.mjs';

/**
 * Effects list of the actor sheets (shared partial templates/actor/parts/effects-list.hbs):
 * switch, details accordion, create / edit / delete, to chat, kebab / right-click menu.
 * Action handlers run with `this` = the sheet; helpers take it as first argument.
 */
export class ActorSheetEffects {
  static async _onToggleEffect(event, target) {
    if (!this.isEditable) return;
    const effect = this._getEmbeddedDocument(target, this.actor);
    if (!effect) return;

    await toggleActorEffect(this.actor, effect);
  }

  /**
   * Effect name = accordion trigger: expand/collapse the description below the row.
   * Own lightweight accordion (not AccordionHelper): that one closes on any outside click and its
   * global .accordion-item styles fight the row layout. Open ids live on the sheet so they survive
   * re-renders (switching an effect on/off re-renders the part).
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   * @protected
   */
  static _onToggleEffectDetails(event, target) {
    const row = target.closest('.fx-row');
    if (!row) return;
    this._fxOpen ??= new Set();
    const open = row.classList.toggle('is-open');
    target.setAttribute('aria-expanded', String(open));
    if (open) this._fxOpen.add(row.dataset.effectId);
    else this._fxOpen.delete(row.dataset.effectId);
  }

  /**
   * Create a new effect on this actor and open its config sheet.
   * `data-section="inactive"` creates it disabled.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   * @protected
   */
  static async _onCreateEffect(event, target) {
    if (!this.isEditable) return;
    const aeCls = getDocumentClass('ActiveEffect');
    const [effect] = await this.actor.createEmbeddedDocuments('ActiveEffect', [{
      name: aeCls.defaultName({ parent: this.actor }),
      img: 'icons/svg/aura.svg',
      origin: this.actor.uuid,
      disabled: target.dataset.section === 'inactive',
    }]);
    effect?.sheet.render(true);
  }

  /**
   * Open the effect's config sheet.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   * @protected
   */
  static _onEditEffect(event, target) {
    const effect = this._getEmbeddedDocument(target, this.actor);
    effect?.sheet.render(true);
  }

  /**
   * Delete an effect. Statuses go through the status removal path (countdown-die cleanup);
   * item-owned effects can't be deleted from the sheet (they belong to the item) — the user is told.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   * @protected
   */
  static async _onDeleteEffect(event, target) {
    if (!this.isEditable) return;
    const effect = this._getEmbeddedDocument(target, this.actor);
    if (!effect) return;

    if (isStatusEffect(effect)) {
      await StatusHelper.removeStatus(this.actor, effect.statuses.first());
      return;
    }

    // Item-owned effects are part of the item: they can be disabled here but not deleted
    if (effect.parent?.documentName === 'Item') {
      ui.notifications.info(game.i18n.format('VAGABOND.Effect.DeleteLocked', { item: effect.parent.name }));
      return;
    }

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.format('VAGABOND.ContextMenu.DeleteItemTitle', { name: effect.name }) },
      content: game.i18n.format('VAGABOND.ContextMenu.DeleteItemContent', { name: foundry.utils.escapeHTML(effect.name) }),
    });
    if (confirmed) await effect.delete();
  }

  /**
   * Post the effect (name, icon, description) to chat.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   * @protected
   */
  static async _onEffectToChat(event, target) {
    const effect = this._getEmbeddedDocument(target, this.actor);
    if (effect) await NoticeChatCards.statusEffect(this.actor, effect);
  }

  /**
   * Kebab button → open the effect context menu below the button.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   * @protected
   */
  static _onEffectMenu(event, target) {
    const rect = target.getBoundingClientRect();
    ActorSheetEffects._openEffectMenu(this, target, { x: rect.left, y: rect.bottom + 2 });
  }

  /**
   * Build and show the effect context menu (Enable/Disable, Edit, Send to Chat, Delete).
   * @param {HTMLElement} element  Any element inside the effect row
   * @param {{x: number, y: number}} position  Screen coordinates
   * @protected
   */
  static _openEffectMenu(sheet, element, position) {
    const effect = sheet.constructor._getEmbeddedDocument(element, sheet.actor);
    if (!effect) return;

    const editable = sheet.isEditable;
    const status = isStatusEffect(effect);
    // Locked effects (unequipped item / expired) can't be flipped from here; on-use effects can
    const suppressed = !!toggleBlockerOf(effect);
    const enabled = !effect.disabled;

    const items = [];
    items.push({
      label: status && enabled
        ? game.i18n.localize('VAGABOND.ContextMenu.RemoveStatus')
        : game.i18n.localize(enabled ? 'VAGABOND.Effect.Disable' : 'VAGABOND.Effect.Enable'),
      icon: status && enabled ? 'fas fa-times' : `fas fa-toggle-${enabled ? 'off' : 'on'}`,
      enabled: editable && !suppressed,
      action: () => sheet.constructor._onToggleEffect.call(sheet, null, element),
    });
    items.push({
      label: game.i18n.localize('VAGABOND.ContextMenu.Edit'),
      icon: 'fas fa-pen-to-square',
      action: () => effect.sheet.render(true),
    });
    items.push({
      label: game.i18n.localize('VAGABOND.ContextMenu.SendToChat'),
      icon: 'fas fa-comment',
      action: () => NoticeChatCards.statusEffect(sheet.actor, effect),
    });
    items.push({ divider: true });
    // Item-owned effects: Delete is greyed out and names the owner (disable still works)
    const owner = effect.parent?.documentName === 'Item' ? effect.parent : null;
    items.push({
      label: owner
        ? game.i18n.format('VAGABOND.Effect.DeleteLockedMenu', { item: owner.name })
        : game.i18n.localize('VAGABOND.ContextMenu.Delete'),
      icon: 'fas fa-trash',
      enabled: editable && !owner,
      dim: !!owner,
      action: () => sheet.constructor._onDeleteEffect.call(sheet, null, element),
    });

    ContextMenuHelper.closeAll();
    // `inventory-context-menu` carries the menu chrome (background, border, z-index)
    ContextMenuHelper.create({ position, items, className: 'inventory-context-menu' });
  }
}
