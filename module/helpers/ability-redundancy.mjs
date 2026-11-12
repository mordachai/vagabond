import { sourceDocId } from './source-id.mjs';

/**
 * Ability Redundancy (Alpha 4 rulebook p.31): if a Trait, Feature or Perk grants a Perk or Spell the hero
 * already has, they choose a different one of the same type they qualify for.
 *
 * `resolve` takes the uuids about to be granted and returns the list to actually grant: duplicates (already
 * owned by the actor, or repeated inside the batch, compared by compendium source id, never name) are swapped
 * for a replacement picked in a small DialogV2. Cancelling drops the duplicate (the old silent skip) with an
 * info notice. Manual-first: nothing happens when there is no duplicate.
 *
 * Callers: Character Builder finish (Ancestry / Class granted Perks and Spells), Level Up apply (chosen Spells).
 */
export class AbilityRedundancy {
  /** Compendium index entries of one Item type (`'spell'` | `'perk'`). */
  static async #candidates(type) {
    const out = [];
    for (const pack of game.packs) {
      if (pack.documentName !== 'Item') continue;
      const index = await pack.getIndex({ fields: ['type'] });
      for (const e of index) if (e.type === type) out.push({ uuid: e.uuid, name: e.name, img: e.img });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * @param {Actor|null} actor              hero the abilities go to (null = none owned yet)
   * @param {string[]} uuids                abilities about to be granted
   * @param {'spell'|'perk'} type
   * @param {object} [opts]
   * @param {(doc: Item) => Promise<boolean>|boolean} [opts.qualifies]  extra filter for replacements (e.g. Perk prerequisites)
   * @returns {Promise<string[]>} uuids to grant (duplicates replaced, or dropped if the pick was cancelled)
   */
  static async resolve(actor, uuids, type, { qualifies } = {}) {
    const taken = new Set((actor?.items ?? []).filter(i => i.type === type).map(i => sourceDocId(i)).filter(Boolean));
    const result = [];
    const pending = [...uuids];
    // Ids reserved by the final list, so a replacement never collides with a later grant
    const reserved = new Set(uuids.map(u => u.split('.').pop()));
    let candidates = null;

    for (const uuid of pending) {
      const id = uuid.split('.').pop();
      if (!taken.has(id)) { taken.add(id); result.push(uuid); continue; }

      candidates ??= await AbilityRedundancy.#candidates(type);
      const options = [];
      for (const c of candidates) {
        const cid = c.uuid.split('.').pop();
        if (taken.has(cid) || reserved.has(cid)) continue;
        if (qualifies) {
          const doc = await fromUuid(c.uuid).catch(() => null);
          if (!doc || !(await qualifies(doc))) continue;
        }
        options.push(c);
      }
      const dupDoc = await fromUuid(uuid).catch(() => null);
      const picked = options.length ? await AbilityRedundancy.#prompt(dupDoc?.name ?? '', type, options) : null;
      if (picked) {
        const pid = picked.split('.').pop();
        taken.add(pid);
        reserved.add(pid);
        result.push(picked);
      } else {
        ui.notifications.info(game.i18n.format('VAGABOND.AbilityRedundancy.Skipped', { name: dupDoc?.name ?? '' }));
      }
    }
    return result;
  }

  /** One radio list; resolves to the chosen uuid, or null when cancelled / nothing picked. */
  static async #prompt(name, type, options) {
    const esc = foundry.utils.escapeHTML;
    const intro = game.i18n.format('VAGABOND.AbilityRedundancy.Prompt', {
      name: esc(name),
      type: game.i18n.localize(`VAGABOND.AbilityRedundancy.Type.${type}`),
    });
    let html = `<div class="vbd-choice"><div class="vbd-choice-prompt">${intro}</div><div class="vbd-item-choice-list">`;
    options.forEach((o, i) => {
      html += `<label class="vbd-item-choice-row"><input type="radio" name="replacement" value="${o.uuid}"${i === 0 ? ' checked' : ''}>`
        + `<img src="${o.img ?? ''}" alt=""><span>${esc(o.name)}</span></label>`;
    });
    html += '</div></div>';
    const picked = await foundry.applications.api.DialogV2.prompt({
      classes: ['vbd-choice-dialog'],
      window: { title: game.i18n.localize('VAGABOND.AbilityRedundancy.Title') },
      content: html,
      ok: {
        label: game.i18n.localize('VAGABOND.ItemChoice.Confirm'),
        callback: (event, button) => button.form.querySelector('input[name="replacement"]:checked')?.value ?? null,
      },
      rejectClose: false,
    }).catch(() => null);
    return picked || null;
  }
}
