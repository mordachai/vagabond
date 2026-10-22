/**
 * Effect choices — an Ancestry trait lets the player pick `count` of the Ancestry's OWN Active Effects
 * (`system.traits[].effectChoices = [{count, label, pool: [effectId]}]`), e.g. Draken Draconic Resilience:
 * one of Acid / Cold / Fire / Shock Resistance.
 *
 * The pool effects ship `disabled` on the Ancestry, so nothing applies before a pick. On the character's copy
 * the picked effects are switched on and the unpicked ones are DELETED (user ruling: re-add the Ancestry to
 * pick again). A pool no larger than `count` is no choice: all its effects are switched on.
 *
 * Groups share the item-choice group shape (`GrantedItems.choiceGroupsFor`) with `kind: 'effect'` and a pool of
 * effect uuids, so the Character Builder picker (`steps/item-choice-manager.mjs`) shows them beside item choices
 * and keeps the picks in the same `itemChoicePicks` state. Callers: Character Builder finish (`pruneData` on the
 * Ancestry data before it is created) and `VagabondItem._onCreate` (`onAdd`: an Ancestry added any other way asks).
 */
export class EffectChoices {
  /**
   * Effect choice groups of an Ancestry (document or plain data with `uuid`).
   * Keys `ancestry-<row>-fx<group>` stay dot-free and apart from item choice keys.
   * @returns {Array<{key, source, index, group, label, ownLabel, count, pool: string[], kind: 'effect'}>}
   */
  static groupsFor(owner) {
    if (owner?.type !== 'ancestry') return [];
    const ids = new Set(EffectChoices.#effects(owner).map(e => e._id ?? e.id));
    const out = [];
    (owner.system?.traits ?? []).forEach((row, index) => {
      (row.effectChoices ?? []).forEach((choice, group) => {
        const pool = (choice.pool ?? []).filter(id => ids.has(id)).map(id => `${owner.uuid}.ActiveEffect.${id}`);
        if (!pool.length) return;
        out.push({
          key: `ancestry-${index}-fx${group}`, source: 'ancestry', index, group, kind: 'effect',
          label: choice.label || row.name || '',
          ownLabel: choice.label || '',
          count: Math.max(1, Math.min(choice.count || 1, pool.length)),
          pool,
        });
      });
    });
    return out;
  }

  /** Effect uuid → id. */
  static idOf(uuid) {
    return uuid.split('.').pop();
  }

  /**
   * Pool uuids → picker options `[{uuid, name, img, damageType}]`. `damageType` = a change value naming a damage
   * type (Resistance / Immune effects), for the card icon.
   */
  static choiceOptions(owner, group) {
    const byId = new Map(EffectChoices.#effects(owner).map(e => [e._id ?? e.id, e]));
    return group.pool.map(uuid => {
      const effect = byId.get(EffectChoices.idOf(uuid));
      if (!effect) return null;
      const changes = effect.system?.changes ?? effect.changes ?? [];
      const damageType = changes.map(c => String(c.value ?? '')).find(v => CONFIG.VAGABOND.damageTypes?.[v]) ?? null;
      return { uuid, name: effect.name, img: effect.img, damageType };
    }).filter(Boolean);
  }

  /**
   * Picked / dropped effect ids for the picks (`{ [group.key]: uuid[] }`); a group without its full picks is
   * left alone (nothing dropped), a no-choice group keeps all.
   * @returns {{keep: Set<string>, drop: Set<string>}}
   */
  static resolve(groups, picks = {}) {
    const keep = new Set();
    const drop = new Set();
    for (const g of groups) {
      const ids = g.pool.map(EffectChoices.idOf);
      if (ids.length <= g.count) { ids.forEach(id => keep.add(id)); continue; }
      const chosen = (picks[g.key] ?? []).filter(u => g.pool.includes(u)).slice(0, g.count).map(EffectChoices.idOf);
      if (chosen.length < g.count) continue;
      ids.forEach(id => (chosen.includes(id) ? keep : drop).add(id));
    }
    for (const id of keep) drop.delete(id);
    return { keep, drop };
  }

  /** Builder finish: apply the picks to Ancestry item data before it is created. */
  static pruneData(itemData, groups, picks) {
    const { keep, drop } = EffectChoices.resolve(groups, picks);
    if (!keep.size && !drop.size) return;
    itemData.effects = (itemData.effects ?? [])
      .filter(e => !drop.has(e._id))
      .map(e => (keep.has(e._id) ? { ...e, disabled: false } : e));
  }

  /** Apply the picks to an owned Ancestry: picked on, unpicked deleted. */
  static async apply(item, groups, picks) {
    const { keep, drop } = EffectChoices.resolve(groups, picks);
    const toDelete = [...drop].filter(id => item.effects.has(id));
    const toEnable = [...keep].filter(id => item.effects.get(id)?.disabled).map(_id => ({ _id, disabled: false }));
    if (toDelete.length) await item.deleteEmbeddedDocuments('ActiveEffect', toDelete);
    if (toEnable.length) await item.updateEmbeddedDocuments('ActiveEffect', toEnable);
  }

  /**
   * Groups an owned Ancestry still has to choose: more pool effects left than `count` (a made pick deleted the rest).
   */
  static openGroups(item) {
    return EffectChoices.groupsFor(item).filter(g => g.pool.length > g.count);
  }

  /**
   * An Ancestry joined a character (not through the builder, which prunes the data first): switch on the no-choice
   * groups and ask for the others.
   */
  static async onAdd(item) {
    if (item.parent?.type !== 'character') return;
    const groups = EffectChoices.groupsFor(item);
    if (!groups.length) return;
    const open = groups.filter(g => g.pool.length > g.count);
    const picks = open.length ? await EffectChoices.prompt(item, open) : {};
    await EffectChoices.apply(item, groups, picks ?? {});
  }

  /**
   * Ask for the picks of open groups (also the locked Ancestry sheet's Choose button).
   * @returns {Promise<object|null>} `{ [group.key]: uuid[] }`, null if cancelled
   */
  static async prompt(item, open = EffectChoices.openGroups(item)) {
    if (!open.length) return {};
    const esc = foundry.utils.escapeHTML;
    let html = '<div class="vbd-choice">';
    for (const g of open) {
      const type = g.count === 1 ? 'radio' : 'checkbox';
      html += `<div class="vbd-choice-prompt">${esc(g.label)} (${game.i18n.format('VAGABOND.ItemChoice.ChooseN', { n: g.count })})</div>`
        + '<div class="vbd-item-choice-list">';
      for (const opt of EffectChoices.choiceOptions(item, g)) {
        html += `<label class="vbd-item-choice-row"><input type="${type}" name="${g.key}" value="${opt.uuid}">`
          + `<img src="${opt.img}" alt=""><span>${esc(opt.name)}</span></label>`;
      }
      html += '</div>';
    }
    html += '</div>';

    return foundry.applications.api.DialogV2.prompt({
      classes: ['vbd-choice-dialog'],
      window: { title: `${item.name}: ${game.i18n.localize('VAGABOND.ItemChoice.Title')}` },
      content: html,
      ok: {
        label: game.i18n.localize('VAGABOND.ItemChoice.Confirm'),
        callback: (event, button) => Object.fromEntries(open.map(g => [
          g.key, [...button.form.querySelectorAll(`input[name="${g.key}"]:checked`)].map(i => i.value),
        ])),
      },
      rejectClose: false,
    }).catch(() => null);
  }

  /** Embedded effects of a document or plain data. */
  static #effects(owner) {
    return owner.effects?.contents ?? owner.effects ?? [];
  }
}
