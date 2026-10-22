import { TradeHelper } from '../helpers/trade-helper.mjs';
import { CoinTransferDialog } from '../applications/coin-transfer-dialog.mjs';
import { CurrencyHelper } from '../helpers/currency-helper.mjs';
import { EquipmentHelper } from '../helpers/equipment-helper.mjs';
import { VagabondDamagePipeline } from '../helpers/damage-pipeline.mjs';
import * as ItemSections from '../helpers/item-sections.mjs';
import { ContextMenuHelper } from '../helpers/context-menu-helper.mjs';
import { ItemChatCards } from '../helpers/item-chat-cards.mjs';

/**
 * Container item sheet: the contents list (type sections, open item details, row menu), take / delete
 * of entries and the coin purse. Actions run with `this` = the sheet; helpers take the sheet first.
 */
export class ItemSheetContainer {
  /**
   * A live, unsaved Item built from one stored container entry, so derived data
   * (material damage, Slots, Value) reads exactly like an owned item.
   * @param {number} index
   * @returns {Item|null}
   */
  static _containerEntryDoc(sheet, index) {
    const data = sheet.item.system.items?.[index];
    if (!data) return null;
    try {
      return new Item.implementation(foundry.utils.deepClone(data), { parent: sheet.item.actor ?? null });
    } catch (error) {
      console.warn(`Vagabond | Container entry ${index} could not be read:`, error);
      return null;
    }
  }

  /**
   * Whether the treasure bar offers the coin split button: the user may take from the container
   * (the dialog finds its party — the transport's / owner's, else the user's own).
   */
  static _containerCanShare(sheet) {
    return sheet.item.type === 'container' && !sheet.item.pack && TradeHelper.canTake(game.user, sheet.item);
  }

  /** Treasure bar button: give / split the stored coins between party members. */
  static _onShareContainerCoins() {
    CoinTransferDialog.open(this.item);
  }

  /** Coins stored in the container, one entry per denomination (treasure bar). */
  static _containerCoins(sheet) {
    return CurrencyHelper.DENOMINATIONS.map((key) => {
      const name = key.charAt(0).toUpperCase() + key.slice(1);
      return {
        key,
        value: sheet.item.system.currency?.[key] ?? 0,
        label: game.i18n.localize(`VAGABOND.Wealth.${name}`),
        abbr: game.i18n.localize(`VAGABOND.Currency.${name}.abbr`),
      };
    });
  }

  /**
   * Container list rows grouped by type (Weapon, Armor, Alchemical, Relic, Gear), each sorted by
   * name. Slots and Value are for the whole stack; a zero-Slot stack shows its share of a Slot
   * (RAW: every 10 zero-Slot items take 1 Slot).
   * @returns {Object[]}
   */
  static _containerGroups(sheet) {
    const keys = ['weapon', 'armor', 'alchemical', 'relic', 'gear'];
    const buckets = Object.fromEntries(keys.map((key) => [key, []]));
    const stack = CONFIG.VAGABOND?.zeroSlotStackSize || 10;

    (sheet.item.system.items ?? []).forEach((data, index) => {
      const doc = ItemSheetContainer._containerEntryDoc(sheet, index);
      if (!doc) return;
      const quantity = Math.max(0, Number(doc.system.quantity ?? 1));
      const unitSlots = EquipmentHelper.itemSlotCost(doc);
      const unitCost = doc.type === 'container' ? doc.system.baseCost : doc.system.cost;
      const copper = CurrencyHelper.toCopper(unitCost ?? {}) * quantity;
      const entryKey = data._id ?? `entry-${index}`;
      const type = doc.system.equipmentType;

      buckets[keys.includes(type) ? type : 'gear'].push({
        index,
        key: entryKey,
        name: doc.name,
        img: doc.img,
        quantity,
        damage: ItemSheetContainer._containerEntryDamage(sheet, doc),
        slots: unitSlots > 0 ? unitSlots * quantity : Number((quantity / stack).toFixed(1)),
        slotsHint: unitSlots > 0 ? '' : game.i18n.localize('VAGABOND.UI.Labels.ContainerList.ZeroSlotHint'),
        value: copper > 0 ? CurrencyHelper.format(copper) : '—',
        open: sheet._containerOpenItems.has(entryKey),
      });
    });

    return keys
      .filter((key) => buckets[key].length)
      .map((key) => ({
        key,
        label: game.i18n.localize(`VAGABOND.Actor.Party.Inventory.Groups.${key}`),
        closed: sheet._containerClosedGroups.has(key),
        items: buckets[key].sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }

  /** Damage shown in the container list: weapon (material-adjusted) or alchemical damage. */
  static _containerEntryDamage(sheet, doc) {
    const sys = doc.system;
    if (EquipmentHelper.isWeapon(doc)) {
      if (sys.grip === 'V') return `${sys.finalDamageOneHand || '—'} / ${sys.finalDamageTwoHands || '—'}`;
      return sys.currentDamage && sys.currentDamage !== '-' ? sys.currentDamage : '—';
    }
    if (EquipmentHelper.isAlchemical(doc) && sys.damageAmount) {
      return VagabondDamagePipeline.markExplode(sys.damageAmount, doc) || '—';
    }
    return '—';
  }

  /** Fill an open container row with the shared item detail body (description, stats, properties). */
  static async _fillContainerDetail(sheet, row) {
    const host = row?.querySelector('.ci-detail-inner');
    if (!host || host.dataset.loaded) return;
    const doc = ItemSheetContainer._containerEntryDoc(sheet, Number(row.dataset.itemIndex));
    if (!doc) return;
    host.dataset.loaded = '1';

    const TE = foundry.applications.ux.TextEditor.implementation;
    const description = doc.system.description
      ? await TE.enrichHTML(doc.system.description, { relativeTo: doc })
      : '';
    let html = description ? `<div class="mini-sheet-description">${description}</div>` : '';
    html += doc.type === 'container'
      ? `<div class="mini-sheet-stats">${ItemSections.buildSlotsRow(doc)}</div>`
      : ItemSections.buildStatsSection(doc, { compact: true });
    if (EquipmentHelper.isWeapon(doc) && doc.system.properties?.length) {
      html += ItemSections.buildWeaponProperties(doc, { tooltips: true });
    }
    host.innerHTML = html;
  }

  /** Type section header: open / close the section (no re-render). */
  static _onToggleContainerGroup(event, target) {
    const group = target.closest('.ci-group');
    const key = group?.dataset.groupKey;
    if (!key) return;
    if (group.classList.toggle('closed')) this._containerClosedGroups.add(key);
    else this._containerClosedGroups.delete(key);
  }

  /** Item name: open / close its details (no re-render). */
  static _onToggleContainerItem(event, target) {
    const row = target.closest('.ci-item');
    const key = row?.dataset.entryKey;
    if (!key) return;
    if (row.classList.toggle('open')) {
      this._containerOpenItems.add(key);
      ItemSheetContainer._fillContainerDetail(this, row);
    } else {
      this._containerOpenItems.delete(key);
    }
  }

  /** Item image: open the stored item's sheet (an unsaved snapshot). */
  static _onOpenContainerItem(event, target) {
    const index = Number(target.closest('.ci-item')?.dataset.itemIndex);
    ItemSheetContainer._containerEntryDoc(this, index)?.sheet.render(true);
  }

  /** Kebab (or right-click on a row): Open, Send to Chat, Take to Inventory, Delete. */
  static _onContainerItemMenu(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const index = Number(target.closest('.ci-item')?.dataset.itemIndex);
    // One menu at a time (the click is stopped, so the menu's click-outside close never sees it);
    // clicking the same row's kebab again just closes it.
    const reopen = document.querySelector('.vagabond-context-menu')?.dataset.containerEntry !== String(index);
    ContextMenuHelper.closeAll();
    if (!reopen && event.type === 'click') return;
    const doc = ItemSheetContainer._containerEntryDoc(this, index);
    if (!doc) return;
    const actor = this.item.actor;
    const L = (key) => game.i18n.localize(`VAGABOND.UI.Labels.ContainerList.${key}`);
    const menu = ContextMenuHelper.create({
      position: { x: event.clientX, y: event.clientY },
      className: 'inventory-context-menu',
      items: [
        { label: L('Open'), icon: 'fas fa-up-right-from-square', action: () => doc.sheet.render(true) },
        {
          label: game.i18n.localize('VAGABOND.ContextMenu.SendToChat'),
          icon: 'fas fa-comment',
          enabled: !!actor,
          action: async () => {
            await ItemChatCards.gearUse(actor, doc);
          },
        },
        {
          label: L('Take'),
          icon: 'fas fa-hand-paper',
          enabled: !this.item.pack && TradeHelper.canTake(game.user, this.item),
          action: () => ItemSheetContainer._takeFromContainer(this, index),
        },
        { divider: true },
        {
          label: L('Delete'),
          icon: 'fas fa-trash',
          enabled: this.isEditable,
          action: () => ItemSheetContainer._deleteFromContainer(this, index),
        },
      ],
    });
    if (menu) menu.dataset.containerEntry = String(index);
  }

  /**
   * Handle equipping an item from container to character inventory
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onEquipFromContainer(event, target) {
    return ItemSheetContainer._takeFromContainer(this, parseInt(target.dataset.itemIndex));
  }

  /**
   * Take a stored item out (whole stack), through TradeHelper:
   * - to the selected token's Character / NPC, else to the Character that carries the container
   *   (from its own container, Weapons and Armor get equipped through the hand limit, as before);
   * - nobody to give it to: with Canvas Loot, onto the ground next to the container's token;
   * - else nothing moves and the user is told to select a token.
   * @param {number} index
   */
  static async _takeFromContainer(sheet, index) {
    const container = sheet.item;
    if (container.type !== 'container' || isNaN(index)) return;
    const entry = container.system.items?.[index];
    if (!entry) return;
    const source = { containerUuid: container.uuid, entryId: entry._id ?? null, index };
    const owner = container.actor;

    const selected = (canvas?.tokens?.controlled ?? []).map((t) => t.actor)
      .find((a) => a && ['character', 'npc'].includes(a.type));
    const dest = selected ?? (owner?.type === 'character' ? owner : null);
    if (dest) {
      const result = await TradeHelper.moveItem({ source, dest: { actorUuid: dest.uuid } });
      const taken = result?.ok && dest === owner ? owner.items.get(result.itemId) : null;
      if (taken && (EquipmentHelper.isWeapon(taken) || EquipmentHelper.isArmor(taken))) {
        await EquipmentHelper.equipWithHandLimit(owner, taken.id, EquipmentHelper.defaultEquipState(taken));
      }
      return;
    }

    const loot = TradeHelper.canvasLoot();
    const tokens = owner?.getActiveTokens(false, true) ?? [];
    const token = tokens.find((t) => t.parent === canvas?.scene) ?? tokens[0];
    if (loot && token) {
      await TradeHelper.dropToCanvas({ source, tokenUuid: token.uuid });
      return;
    }
    ui.notifications.warn(game.i18n.format(loot ? 'VAGABOND.Trade.TakeSelect' : 'VAGABOND.Trade.TakeSelectNoLoot', { name: entry.name }));
  }

  /**
   * Handle deleting an item from container
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onDeleteFromContainer(event, target) {
    return ItemSheetContainer._deleteFromContainer(this, parseInt(target.dataset.itemIndex));
  }

  /**
   * Delete a stored item (after confirmation).
   * @param {number} index
   */
  static async _deleteFromContainer(sheet, index) {
    if (sheet.item.type !== 'container' || isNaN(index)) return;
    const itemData = sheet.item.system.items[index];
    if (!itemData) return;

    try {
      const itemName = itemData.name || 'Unknown Item';

      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: 'Delete Item' },
        content: `<p>Are you sure you want to delete <strong>${itemName}</strong> from this container?</p><p>This action cannot be undone.</p>`,
        rejectClose: false,
        modal: true
      });

      if (!confirmed) return;

      // Remove from container
      const newItems = sheet.item.system.items.filter((_, i) => i !== index);
      await sheet.item.update({ 'system.items': newItems });

      ui.notifications.info(`${itemName} deleted from container.`);

      // Force re-render to show updated items list
      sheet.render();
    } catch (error) {
      console.error('Error deleting item from container:', error);
      ui.notifications.error('Failed to delete item.');
    }
  }
}
