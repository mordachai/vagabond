import { ShopTransactions } from './shop-transactions.mjs';

/**
 * Bulk stocking for shops (GM): drop an Item, an Item folder (world or compendium,
 * subfolders included), a whole Item compendium, or a folder of compendiums.
 *
 * Every tradeable item is copied into the shop; items already in stock (same source)
 * are skipped. Each copy's shop category (`flags.vagabond.shop.category`, the Gear
 * sub-tab) is the name of the folder it came from, so a compendium's folder layout
 * becomes the shop's layout. Used by the shop sheet and the store window.
 */
export class ShopStock {
  /**
   * Handle drag data dropped on a shop.
   * @param {Actor} shop
   * @param {object} data  parsed drag data
   * @returns {Promise<Item[]|null>} created stock, or null when the drop isn't ours
   */
  static async handleDrop(shop, data) {
    if (!shop?.isOwner || !data?.type) return null;
    switch (data.type) {
      case 'Compendium': {
        const pack = game.packs.get(data.collection ?? data.id);
        return pack ? this.stockFromPack(shop, pack) : null;
      }
      case 'Folder': {
        const folder = await fromUuid(data.uuid);
        if (folder?.type === 'Item') return this.stockFromFolder(shop, folder);
        if (folder?.type === 'Compendium') return this.stockFromPackFolder(shop, folder);
        return null;
      }
      case 'Item': {
        const item = await fromUuid(data.uuid);
        if (!item || item.parent?.uuid === shop.uuid) return null;
        return this.stock(shop, [item], item.name);
      }
      default:
        return null;
    }
  }

  /** Stock every item of an Item folder (and its subfolders). */
  static async stockFromFolder(shop, folder) {
    return this.stock(shop, await this.folderItems(folder), folder.name);
  }

  /** Stock every item of an Item compendium. */
  static async stockFromPack(shop, pack) {
    if (pack.documentName !== 'Item') {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Shop.Sheet.OnlyItemPacks'));
      return [];
    }
    return this.stock(shop, await pack.getDocuments(), pack.title);
  }

  /** Stock every Item compendium inside a compendium-sidebar folder (and its subfolders). */
  static async stockFromPackFolder(shop, folder) {
    const ids = this.#subtree(game.folders.filter(f => f.type === 'Compendium'), folder.id, 'Compendium');
    const packs = game.packs.filter(p => p.documentName === 'Item' && ids.has(p.folder?.id));
    const docs = (await Promise.all(packs.map(p => p.getDocuments()))).flat();
    return this.stock(shop, docs, folder.name);
  }

  /**
   * Copy tradeable items into the shop, skipping what's already stocked.
   * @param {Actor} shop
   * @param {Item[]} docs
   * @param {string} label  source name for the notification
   * @returns {Promise<Item[]>}
   */
  static async stock(shop, docs, label) {
    const tradeable = docs.filter(d => ShopTransactions.TRADE_TYPES.includes(d.type));
    if (!tradeable.length) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Shop.Sheet.OnlyEquipment'));
      return [];
    }
    // Skip items already in stock, and duplicates within this drop
    const fresh = [];
    for (const d of tradeable) {
      if (ShopTransactions.findStockMatch(shop, d)) continue;
      if (fresh.some(f => ShopTransactions.sameSource(f, d))) continue;
      fresh.push(d);
    }
    const skipped = tradeable.length - fresh.length;
    if (!fresh.length) {
      ui.notifications.info(game.i18n.format('VAGABOND.Shop.Sheet.FolderNothing', { folder: label, skipped }));
      return [];
    }
    const created = await shop.createEmbeddedDocuments('Item', fresh.map(d => this.stockData(d)));
    if (docs.length > 1) {
      ui.notifications.info(game.i18n.format('VAGABOND.Shop.Sheet.FolderAdded', {
        count: created.length, folder: label, skipped,
      }));
    }
    return created;
  }

  /** Creation data for a stock copy of `item`, tagged with its folder as shop category. */
  static stockData(item) {
    const data = item.inCompendium
      ? game.items.fromCompendium(item, { clearFolder: true, keepId: false })
      : item.toObject();
    delete data._id;
    data.folder = null;
    if (!data._stats?.compendiumSource && item.inCompendium) {
      foundry.utils.setProperty(data, '_stats.compendiumSource', item.uuid);
    }
    const category = this.folderOf(item)?.name;
    if (category) foundry.utils.setProperty(data, 'flags.vagabond.shop.category', category);
    return data;
  }

  /**
   * Every Item document inside a folder and all its subfolders.
   * @param {Folder} folder
   * @returns {Promise<Item[]>}
   */
  static async folderItems(folder) {
    const pack = folder.pack ? game.packs.get(folder.pack) : null;
    const ids = this.#subtree(pack ? pack.folders : game.folders, folder.id, 'Item');
    if (pack) {
      const docs = await pack.getDocuments();
      return docs.filter(d => ids.has(this.folderOf(d)?.id));
    }
    return game.items.filter(i => ids.has(i.folder?.id));
  }

  /** An item's folder, resolved from the raw id for compendium documents if needed. */
  static folderOf(item) {
    if (item.folder) return item.folder;
    const id = item._source?.folder;
    if (!id) return null;
    return (item.pack ? game.packs.get(item.pack)?.folders.get(id) : game.folders.get(id)) ?? null;
  }

  /** Ids of a folder and all its descendants (walked by parent id — pack folder trees may be unbuilt). */
  static #subtree(folders, rootId, type) {
    const ids = new Set([rootId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of folders) {
        if (f.type === type && !ids.has(f.id) && ids.has(f.folder?.id)) { ids.add(f.id); grew = true; }
      }
    }
    return ids;
  }
}
