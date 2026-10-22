import { EquipmentHelper } from '../helpers/equipment-helper.mjs';
import { TradeHelper } from '../helpers/trade-helper.mjs';

/**
 * Drops onto an actor, shared by the actor sheets and the Character HUD so both create items the
 * same way (Ancestry / Class replacement, grid position, free trade from other inventories).
 * `app` is the sheet or HUD (reads `app.actor`).
 */
export class ActorDrop {
  /**
   * An Item: re-sorted when it is already this actor's, moved through free trade from another
   * inventory, else created here.
   * @param {object} app
   * @param {DragEvent} event
   * @param {object} data  drop data
   */
  static async item(app, event, data) {
    if (!app.actor.isOwner) return false;

    const item = await Item.implementation.fromDropData(data);
    if (!item) return false;
    const itemData = item.toObject();

    // Handle item from same actor (sorting)
    if (app.actor.uuid === item.parent?.uuid) {
      return ActorDrop.sortItem(app, event, itemData);
    }

    // Inventory items from another actor change hands through free trade: moved (never copied),
    // only out of inventories the user may take from (TradeHelper guard rails, GM relay).
    if (item.parent?.documentName === 'Actor' && TradeHelper.TRADE_TYPES.includes(item.type)) {
      const qty = await TradeHelper.pickQuantity(item, event);
      if (!qty) return false;
      return TradeHelper.moveItem({ source: { itemUuid: item.uuid }, dest: { actorUuid: app.actor.uuid }, qty });
    }

    return ActorDrop.createItem(app, itemData, event);
  }

  /**
   * A ContainerItem (dragged from a container sheet or a party Hold): moved out of the container
   * into the inventory through free trade.
   * @param {object} app
   * @param {DragEvent} event
   * @param {object} data  { type, containerUuid, itemIndex, entryId?, itemData }
   */
  static async containerItem(app, event, data) {
    if (!app.actor.isOwner) return false;
    const { containerUuid, itemIndex, itemData } = data;
    if (!containerUuid) return false;
    const qty = await TradeHelper.pickQuantity(itemData, event);
    if (!qty) return false;
    return TradeHelper.moveItem({
      source: { containerUuid, entryId: data.entryId ?? itemData?._id ?? null, index: itemIndex },
      dest: { actorUuid: app.actor.uuid },
      qty,
    });
  }

  /** A Folder of Items: every Item in it is created here. */
  static async folder(app, event, data) {
    if (!app.actor.isOwner) return false;
    const folder = await Folder.implementation.fromDropData(data);
    if (!folder) return false;
    return app.actor.createEmbeddedDocuments('Item', folder.contents.map((item) => item.toObject()));
  }

  /** Re-sort an item among this actor's items of its type. */
  static async sortItem(app, event, itemData) {
    const items = app.actor.items.filter((i) => i.type === itemData.type);
    const sortUpdates = foundry.utils.performIntegerSort(itemData, {
      target: event.target,
      siblings: items,
    });
    const updateData = sortUpdates.map((u) => {
      const update = u.update;
      update._id = u.target._id;
      return update;
    });
    return app.actor.updateEmbeddedDocuments('Item', updateData);
  }

  /**
   * Create a dropped item: a new Ancestry / Class replaces the old one; equipment gets the next
   * free inventory grid position.
   */
  static async createItem(app, itemData, event) {
    for (const type of ['ancestry', 'class']) {
      if (itemData.type !== type) continue;
      const existing = app.actor.items.find((i) => i.type === type);
      if (existing) await existing.delete();
    }
    if (itemData.type === 'equipment' && itemData.system && !itemData.system.gridPosition) {
      itemData.system.gridPosition = EquipmentHelper.nextGridPosition(app.actor);
    }
    return app.actor.createEmbeddedDocuments('Item', [itemData]);
  }
}
