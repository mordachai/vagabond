import { EquipmentHelper } from './equipment-helper.mjs';
import { sourceDocId } from './source-id.mjs';

/**
 * Granted items — Items a character RECEIVES from an Ancestry trait or a Class level feature
 * (`grantedItems`: UUID list on `system.traits[]` / `system.levelFeatures[]`), e.g. natural claws,
 * tentacles. `itemChoices` groups let the player pick `count` of a `pool` instead (Draken Breath Attack
 * element): Character Builder picker (`steps/item-choice-manager.mjs`), else `promptChoices`.
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
   * Item choice groups (`itemChoices`: pick `count` of the `pool` uuids, e.g. Draken's Breath Attack element)
   * of one grant owner, filtered like `entriesFor`.
   * `key` is dot-free (`ancestry-0-0` = source-row-group) so it can be a builder state key.
   * @returns {Array<{key, source, index, group, label, ownLabel, count, pool: string[]}>}
   */
  static choiceGroupsFor(owner, { levels, maxLevel } = {}) {
    if (!owner) return [];
    const isClass = owner.type === 'class';
    const source = isClass ? 'class' : 'ancestry';
    const rows = isClass ? owner.system?.levelFeatures : owner.system?.traits;
    const out = [];
    (rows ?? []).forEach((row, index) => {
      if (isClass && levels && !levels.includes(row.level)) return;
      if (isClass && maxLevel !== undefined && row.level > maxLevel) return;
      (row.itemChoices ?? []).forEach((choice, group) => {
        const pool = (choice.pool ?? []).filter(Boolean);
        if (!pool.length) return;
        out.push({
          key: `${source}-${index}-${group}`, source, index, group,
          label: choice.label || row.name || '',
          ownLabel: choice.label || '',
          count: Math.max(1, Math.min(choice.count || 1, pool.length)),
          pool,
        });
      });
    });
    return out;
  }

  /**
   * Grant entries for the picks of choice groups (`picks`: `{ [group.key]: uuid[] }`); picks outside a pool are
   * ignored, each group is capped at its `count`.
   */
  static entriesFromPicks(groups, picks = {}) {
    const out = [];
    for (const g of groups) {
      const chosen = (picks[g.key] ?? []).filter(u => g.pool.includes(u)).slice(0, g.count);
      for (const uuid of chosen) out.push({ uuid, source: g.source, index: g.index });
    }
    return out;
  }

  /** Pool uuids → `[{uuid, name, img, damageType}]` (unresolvable uuids dropped). */
  static async choiceOptions(group) {
    const out = [];
    for (const uuid of group.pool) {
      const doc = await fromUuid(uuid).catch(() => null);
      if (!doc) continue;
      const damageType = doc.system?.currentDamageType ?? doc.system?.damageTypeOneHand ?? doc.system?.damageType;
      out.push({ uuid, name: doc.name, img: doc.img, damageType: damageType && damageType !== '-' ? damageType : null });
    }
    return out;
  }

  /**
   * Ask the player for the picks of choice groups an actor still needs (a group is satisfied when the actor already
   * owns `count` items from its pool, by compendium source). Used where no builder UI exists: an Ancestry / Class
   * added by drag, the Level Up dialog.
   * @returns {Promise<Array<{uuid, source, index}>>} grant entries (empty if cancelled)
   */
  static async promptChoices(actor, groups) {
    const owned = new Set(actor.items.map(i => sourceDocId(i)).filter(Boolean));
    const open = groups.filter(g => g.pool.filter(u => owned.has(u.split('.').pop())).length < g.count);
    if (!open.length) return [];

    const esc = foundry.utils.escapeHTML;
    let html = '<div class="vbd-choice">';
    for (const g of open) {
      const type = g.count === 1 ? 'radio' : 'checkbox';
      html += `<div class="vbd-choice-prompt">${esc(g.label)} (${game.i18n.format('VAGABOND.ItemChoice.ChooseN', { n: g.count })})</div>`
        + '<div class="vbd-item-choice-list">';
      for (const opt of await GrantedItems.choiceOptions(g)) {
        html += `<label class="vbd-item-choice-row"><input type="${type}" name="${g.key}" value="${opt.uuid}">`
          + `<img src="${opt.img}" alt=""><span>${esc(opt.name)}</span></label>`;
      }
      html += '</div>';
    }
    html += '</div>';

    const picks = await foundry.applications.api.DialogV2.prompt({
      classes: ['vbd-choice-dialog'],
      window: { title: game.i18n.localize('VAGABOND.ItemChoice.Title') },
      content: html,
      ok: {
        label: game.i18n.localize('VAGABOND.ItemChoice.Confirm'),
        callback: (event, button) => {
          const out = {};
          for (const g of open) {
            out[g.key] = [...button.form.querySelectorAll(`input[name="${g.key}"]:checked`)].map(i => i.value);
          }
          return out;
        },
      },
      rejectClose: false,
    }).catch(() => null);
    return picks ? GrantedItems.entriesFromPicks(open, picks) : [];
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
    const opts = owner.type === 'class' ? { maxLevel: actor.system.attributes?.level?.value ?? 1 } : {};
    const entries = [
      ...GrantedItems.entriesFor(owner, opts),
      // Picks the builder already made are owned, so only an Ancestry / Class added by hand asks
      ...await GrantedItems.promptChoices(actor, GrantedItems.choiceGroupsFor(owner, opts)),
    ];
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
