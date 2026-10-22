import { ContextMenuHelper } from '../helpers/context-menu-helper.mjs';
import { buildSpellMenuItems } from '../helpers/item-menu.mjs';
import { setupDragReorder } from '../helpers/drag-reorder.mjs';
import { EquipmentHelper } from '../helpers/equipment-helper.mjs';
import { AccordionHelper } from '../helpers/accordion-helper.mjs';

/**
 * DOM listeners the actor sheets wire on every render (called from VagabondActorSheet#_onRender):
 * HP / Fatigue inputs, Ancestry / Class links, Mana, feature and panel context menus, belt
 * reorder, equip drops, accordion click-outside. Each takes the sheet first.
 */
export class ActorSheetListeners {
  /**
   * Setup HP and Fatigue click handlers
   * @private
   */
  static _setupHealthFatigueListeners(sheet) {
    // Add fatigue skull click handlers
    const fatigueSkulls = sheet.element.querySelectorAll('.fatigue-skull');
    fatigueSkulls.forEach((skull, index) => {
      skull.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentFatigue = sheet.actor.system.fatigue || 0;
        const fatigueMax = sheet.actor.system.fatigueMax || 5;

        // If clicking on an active skull, reduce fatigue to that index
        // If clicking on an inactive skull, increase fatigue to index + 1
        const newFatigue = Math.min((index + 1 === currentFatigue) ? index : index + 1, fatigueMax);

        // Fatigued status auto-toggle handled centrally by the updateActor hook in vagabond.mjs
        await sheet.actor.update({ 'system.fatigue': newFatigue });
      });
    });

    // Add HP heart icon click handlers for PC and NPC
    const hpIcons = sheet.element.querySelectorAll('.hp-icon, .npc-hp-heart-icon');
    hpIcons.forEach(hpIcon => {
      // Left-click: decrement HP
      hpIcon.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentHP = sheet.actor.system.health.value || 0;
        const newHP = Math.max(currentHP - 1, 0);

        // Trigger heartbeat animation
        hpIcon.classList.add('heartbeat');
        setTimeout(() => hpIcon.classList.remove('heartbeat'), 300);

        await sheet.actor.update({ 'system.health.value': newHP });
      });

      // Right-click: increment HP
      hpIcon.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentHP = sheet.actor.system.health.value || 0;
        const maxHP = sheet.actor.system.health.max || 10;
        const newHP = Math.min(currentHP + 1, maxHP);

        // Trigger heartbeat animation
        hpIcon.classList.add('heartbeat');
        setTimeout(() => hpIcon.classList.remove('heartbeat'), 300);

        await sheet.actor.update({ 'system.health.value': newHP });
      });
    });
  }

  /**
   * Setup ancestry and class right-click delete handlers
   * @private
   */
  static _setupAncestryClassHandlers(sheet) {
    // Ancestry right-click to delete
    const ancestryElement = sheet.element.querySelector('.ancestry-name');
    if (ancestryElement) {
      ancestryElement.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const itemId = ancestryElement.dataset.itemId;
        if (!itemId) return;

        const item = sheet.actor.items.get(itemId);
        if (!item) return;

        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: game.i18n.localize('VAGABOND.Dialog.DeleteItem') },
          content: `<p>Are you sure you want to remove ${item.name}?</p>`,
        });

        if (confirmed) {
          await item.delete();
          ui.notifications.info(`Removed ${item.name}`);
        }
      });
    }

    // Class right-click to delete
    const classElement = sheet.element.querySelector('.class-name');
    if (classElement) {
      classElement.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const itemId = classElement.dataset.itemId;
        if (!itemId) return;

        const item = sheet.actor.items.get(itemId);
        if (!item) return;

        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: game.i18n.localize('VAGABOND.Dialog.DeleteItem') },
          content: `<p>Are you sure you want to remove ${item.name}?</p>`,
        });

        if (confirmed) {
          await item.delete();
          ui.notifications.info(`Removed ${item.name}`);
        }
      });
    }
  }

  /**
   * Setup right-click handlers for mana
   * @private
   */
  static _setupManaHandlers(sheet) {
    const manaElement = sheet.element.querySelector('[data-action="modifyMana"]');
    if (manaElement) {
      manaElement.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        // Call the static _onModifyMana method with the contextmenu event
        await sheet.constructor._onModifyMana.call(sheet, event, manaElement);
      });
    }
  }

  /**
   * Setup context menu listeners for features, traits, and perks
   * @private
   */
  static _setupFeatureContextMenuListeners(sheet) {
    // Feature headers (from class)
    const featureHeaders = sheet.element.querySelectorAll('.feature-header');
    featureHeaders.forEach(header => {
      header.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const featureItem = header.closest('[data-feature-index]');
        if (!featureItem) return;

        const featureIndex = parseInt(featureItem.dataset.featureIndex);
        if (isNaN(featureIndex)) return;

        await sheet.inventoryHandler.showFeatureContextMenu(event, {
          type: 'feature',
          index: featureIndex
        });
      });
    });

    // Trait headers (from ancestry)
    const traitHeaders = sheet.element.querySelectorAll('.trait-header');
    traitHeaders.forEach(header => {
      header.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const traitItem = header.closest('[data-trait-index]');
        if (!traitItem) return;

        const traitIndex = parseInt(traitItem.dataset.traitIndex);
        if (isNaN(traitIndex)) return;

        await sheet.inventoryHandler.showFeatureContextMenu(event, {
          type: 'trait',
          index: traitIndex
        });
      });
    });

    // Perk headers (real items)
    const perkHeaders = sheet.element.querySelectorAll('.perk-header');
    perkHeaders.forEach(header => {
      header.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const perkItem = header.closest('[data-item-id]');
        if (!perkItem) return;

        const itemId = perkItem.dataset.itemId;
        if (!itemId) return;

        await sheet.inventoryHandler.showFeatureContextMenu(event, itemId, 'perk');
      });
    });
  }

  /**
   * Setup context menu listeners for equipped items and favorited spells in the sliding panel.
   * Equipped rows use the same full item menu as the inventory grid and HUD slots.
   * @private
   */
  static _setupPanelContextMenuListeners(sheet) {
    // Equipped items (weapons, relics, alchemicals, gear) — whole row
    const equippedItems = sheet.element.querySelectorAll('.equipped-item[data-item-id]');
    equippedItems.forEach(row => {
      row.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        // Inline controls (uses pips, grip badge, throw) handle their own right-clicks
        if (event.target.closest('.uses-pip, [data-action="toggleWeaponGrip"], [data-action="throwWeapon"]')) return;
        sheet.inventoryHandler?.showInventoryContextMenu(event, row.dataset.itemId);
      });
    });

    // Favorited spells — right-click the row header (list) or the card (grid);
    // the expanded accordion body has real inputs, so it keeps the native menu.
    const spellRows = sheet.element.querySelectorAll('.favorited-spell .spell-trigger, .favorited-spell.spell-grid-card');
    spellRows.forEach(row => {
      row.addEventListener('contextmenu', (event) => {
        const spell = sheet.actor.items.get(row.closest('[data-spell-id]')?.dataset.spellId);
        if (!spell) return;
        event.preventDefault();
        event.stopPropagation();

        ContextMenuHelper.create({
          position: { x: event.clientX, y: event.clientY },
          items: buildSpellMenuItems({ actor: sheet.actor, spell, event, spellHandler: sheet.spellHandler }),
          className: 'inventory-context-menu',
        });
      });
    });
  }

  /**
   * Drag-to-reorder within the sliding panel's Equipped > Belt list. Persists
   * `flags.vagabond.beltOrder` — the same flag the Character HUD's Belt row
   * reads/writes, so reordering in either place updates both.
   * @private
   */
  static _setupBeltReorderListeners(sheet) {
    const zone = sheet.element.querySelector('.equipped-belt-zone');
    if (!zone) return;

    const reorder = setupDragReorder({
      container: zone,
      itemSelector: '.equipped-item',
      onDrop: (orderedIds) => EquipmentHelper.saveBeltOrder(sheet.actor, orderedIds),
    });
    for (const el of zone.querySelectorAll('.equipped-item')) reorder.bindItem(el);
  }

  /**
   * Drag an own inventory item or spell onto the sliding panel's Equipped section: equipment is
   * equipped to its default state (hand limit enforced by `equipWithHandLimit`), a spell is
   * favorited. Anything else (external drops, containers, already-equipped items) keeps bubbling
   * to the sheet's normal `_onDrop`.
   * @private
   */
  static _setupEquipDrop(sheet) {
    const root = sheet.element;
    const zone = root.querySelector('.right-column-scrollable');
    if (!zone || !sheet.actor.isOwner) return;

    // Which own item is being dragged (the payload is unreadable during dragover)
    if (!root.dataset.equipDragTrack) {
      root.dataset.equipDragTrack = '1';
      root.addEventListener('dragstart', (e) => {
        sheet._dragEquipId = e.target?.closest?.('[data-item-id]')?.dataset.itemId ?? null;
      }, true);
    }

    if (zone.dataset.equipDrop) return;
    zone.dataset.equipDrop = '1';
    const HL = 'fx-drop-target';

    /**
     * What dropping `item` anywhere on the panel would do, or null when it is not ours to handle.
     * Drops auto-sort: spells → Spells (favorite), hand-occupying equipment → Hands, worn → Belt.
     */
    const planFor = (item) => {
      if (!item || item.parent?.uuid !== sheet.actor.uuid) return null;
      if (item.type === 'spell') return item.system.favorite ? null : { kind: 'favorite', zone: '.equipped-spells-zone' };
      if (item.type === 'equipment' && !EquipmentHelper.isEquipped(item)) {
        const worn = EquipmentHelper.defaultEquipState(item) === 'worn';
        return { kind: 'equip', zone: worn ? '.equipped-zone-belt' : '.equipped-zone-hands' };
      }
      return null;
    };

    const clearHighlight = () => {
      zone.classList.remove(HL);
      for (const el of zone.querySelectorAll(`.${HL}`)) el.classList.remove(HL);
    };

    zone.addEventListener('dragover', (e) => {
      const plan = planFor(sheet.actor.items.get(sheet._dragEquipId));
      if (!plan) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      // Light up the section the item will land in; the whole panel when that section isn't drawn yet
      const target = zone.querySelector(plan.zone);
      clearHighlight();
      (target ?? zone).classList.add(HL);
    });
    zone.addEventListener('dragleave', (e) => {
      if (!zone.contains(e.relatedTarget)) clearHighlight();
    });
    zone.addEventListener('drop', (e) => {
      clearHighlight();
      const data = foundry.applications.ux.TextEditor.getDragEventData(e);
      if (data?.type !== 'Item' || !data.uuid) return;
      const item = fromUuidSync(data.uuid);
      const plan = planFor(item);
      if (!plan) return;
      e.preventDefault();
      e.stopPropagation();
      const op = plan.kind === 'favorite'
        ? item.update({ 'system.favorite': true })
        : EquipmentHelper.equipWithHandLimit(sheet.actor, item.id, EquipmentHelper.defaultEquipState(item));
      Promise.resolve(op).catch((err) => console.error('Vagabond | Equipped drop failed:', err));
    });
  }

  /**
   * Setup click outside handler for accordions
   * @private
   */
  static _setupAccordionClickOutside(sheet) {
    if (sheet._accordionClickOutsideHandler) {
      document.removeEventListener('click', sheet._accordionClickOutsideHandler);
    }

    const handler = sheet._accordionClickOutsideHandler = async (event) => {
      // A sheet closed without its close() cleanup (no element any more): stop listening
      if (!sheet.element) {
        document.removeEventListener('click', handler);
        return;
      }
      // Handle clicks outside accordions
      const accordions = sheet.element.querySelectorAll('.accordion-item.expanded');

      for (const accordion of accordions) {
        if (!accordion.contains(event.target)) {
          AccordionHelper.close(accordion);
        }
      }
    };

    document.addEventListener('click', sheet._accordionClickOutsideHandler);
  }
}
