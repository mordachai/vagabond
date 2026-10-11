import { EquipmentHelper } from './equipment-helper.mjs';
import { sourceDocId } from './source-id.mjs';

/**
 * Granted items — Items a character RECEIVES from an Ancestry trait or a Class level feature
 * (`grantedItems`: UUID list on `system.traits[]` / `system.levelFeatures[]`), e.g. Draken's
 * Breath Attack weapon, natural claws, tentacles.
 *
 * The copies arrive equipped (`EquipmentHelper.defaultEquipState`: a Zero-Grip weapon is 'worn',
 * a 2H weapon twoHands…) and flagged `flags.vagabond.grantedBy = { source, index }`
 * ('ancestry' trait index / 'class' levelFeatures index). Hand overflow is healed by
 * `EquipmentHelper.sanitizeHandLimit` on the next sheet render, like any other equip.
 *
 * Callers: Character Builder finish (Ancestry traits + Level-1 class features), the
 * Level Up dialog (class features of the Level gained) and `VagabondItem._onCreate` /
 * `_onDelete` (an Ancestry / Class added any other way grants its items; removing it
 * deletes the items it granted).
 */
export class GrantedItems {
  /** Item types a grant may hand out (the other types have their own grant flows). */
  static TYPES = ['equipment', 'container'];

  /**
   * `[{uuid, source, index}]` for one grant owner.
   * @param {Item|object} owner   Ancestry or Class item (document or plain data)
   * @param {{levels?: number[], maxLevel?: number}} [opts]  class only: keep features of these
   *   Levels / of Levels up to maxLevel
   */
  static entriesFor(owner, { levels, maxLevel } = {}) {
    if (!owner) return [];
    const isClass = owner.type === 'class';
    const rows = isClass ? owner.system?.levelFeatures : owner.system?.traits;
    const out = [];
    (rows ?? []).forEach((row, index) => {
      if (isClass && levels && !levels.includes(row.level)) return;
      if (isClass && maxLevel !== undefined && row.level > maxLevel) return;
      for (const uuid of row.grantedItems ?? []) {
        if (uuid) out.push({ uuid, source: isClass ? 'class' : 'ancestry', index });
      }
    });
    return out;
  }

  /**
   * Build ready-to-create item data (fresh `_id`) for grant entries. Skips unresolvable / disallowed uuids and
   * anything whose compendium source is already in `existing` (item data or documents).
   * @param {Array<{uuid, source, index}>} entries
   * @param {{existing?: Array<object>}} [opts]
   * @returns {Promise<object[]>}
   */
  static async buildItemData(entries, { existing = [] } = {}) {
    const have = new Set(existing.map(i => sourceDocId(i)).filter(Boolean));
    const out = [];
    for (const { uuid, source, index } of entries) {
      let doc;
      try { doc = await fromUuid(uuid); } catch (err) { doc = null; }
      if (!doc || !GrantedItems.TYPES.includes(doc.type)) {
        console.warn(`Vagabond | Granted item not found or not grantable: ${uuid}`);
        continue;
      }
      const data = doc.pack ? game.items.fromCompendium(doc) : doc.toObject();
      // Fresh id: the builder pushes this into an `actor.update({items})` array, which needs one
      data._id = foundry.utils.randomID();
      if (doc.pack) foundry.utils.setProperty(data, '_stats.compendiumSource', doc.uuid);
      const srcId = sourceDocId(data);
      if (srcId && have.has(srcId)) continue;
      if (srcId) have.add(srcId);

      if (data.type === 'equipment') {
        const state = EquipmentHelper.defaultEquipState(data);
        data.system.equipmentState = state;
        data.system.equipped = true;
        if (state === 'oneHand' || state === 'twoHands') {
          foundry.utils.setProperty(data, 'flags.vagabond.equippedAt', Date.now());
        }
      }
      foundry.utils.setProperty(data, 'flags.vagabond.grantedBy', { source, index });
      out.push(data);
    }
    return out;
  }

  /**
   * An Ancestry / Class item was added to a character: create what it grants (class: features up
   * to the character's Level). Already-owned copies (same compendium source) are skipped, so the
   * Character Builder / Level Up paths that grant themselves never double up.
   * @param {Item} owner  the embedded Ancestry / Class item
   */
  static async grantOnAdd(owner) {
    const actor = owner?.parent;
    if (actor?.type !== 'character' || !['ancestry', 'class'].includes(owner.type)) return;
    const entries = owner.type === 'class'
      ? GrantedItems.entriesFor(owner, { maxLevel: actor.system.attributes?.level?.value ?? 1 })
      : GrantedItems.entriesFor(owner);
    if (!entries.length) return;
    const data = await GrantedItems.buildItemData(entries, { existing: actor.items.contents });
    if (data.length) await actor.createEmbeddedDocuments('Item', data);
  }

  /**
   * An Ancestry / Class item left a character: delete the items it granted (flag `grantedBy.source`).
   * @param {Item} owner  the deleted embedded Ancestry / Class item
   */
  static async revokeOnRemove(owner) {
    const actor = owner?.parent;
    if (actor?.documentName !== 'Actor' || !['ancestry', 'class'].includes(owner.type)) return;
    const ids = actor.items
      .filter(i => i.getFlag('vagabond', 'grantedBy')?.source === owner.type)
      .map(i => i.id);
    if (!ids.length) return;
    try {
      await actor.deleteEmbeddedDocuments('Item', ids);
    } catch (err) {
      // Already gone (deleted in the same batch, e.g. Level Up undo)
      console.warn('Vagabond | Granted item cleanup skipped:', err);
    }
  }
}
