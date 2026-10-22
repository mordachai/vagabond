/**
 * Unified grants system handlers for item sheets (ancestry traits and class features).
 * All handlers use data-array-path and data-item-index to work generically for both types.
 * Click handlers are AppV2 actions of VagabondItemSheet (`this` = the sheet).
 */
import { GrantedItems } from '../helpers/granted-items.mjs';

export class GrantsHandlers {
  /**
   * Add a spell to a trait or feature.
   */
  static async addGrantSpell(event, target) {
    const sheet = this;
    const { arrayPath, itemIndex } = GrantsHandlers.#attrs(target, ['arrayPath', 'itemIndex']);
    if (!arrayPath || itemIndex === null) return;

    const select = sheet.element.querySelector(
      `select[data-array-path="${arrayPath}"][data-item-index="${itemIndex}"][data-grant-type="spell"]`
    );
    const uuid = select?.value;
    if (!uuid) { ui.notifications.warn('Please select a spell first'); return; }

    const prop = arrayPath.replace(/^system\./, '');
    // Use DOM state as base so unsaved text values survive the re-render
    const items = sheet._collectArrayFromDOM(arrayPath, prop);
    const current = items[itemIndex]?.requiredSpells || [];
    if (current.includes(uuid)) { ui.notifications.warn('Spell already added'); return; }

    items[itemIndex].requiredSpells = [...current, uuid];
    await sheet.item.update({ [arrayPath]: items });
  }

  /**
   * Remove a spell from a trait or feature by index.
   */
  static async removeGrantSpell(event, target) {
    const sheet = this;
    const { arrayPath, itemIndex, spellIndex } = GrantsHandlers.#attrs(target, ['arrayPath', 'itemIndex', 'spellIndex']);
    if (!arrayPath || itemIndex === null || spellIndex === null) return;

    const prop = arrayPath.replace(/^system\./, '');
    const items = sheet._collectArrayFromDOM(arrayPath, prop);
    const spells = items[itemIndex]?.requiredSpells || [];
    spells.splice(spellIndex, 1);
    items[itemIndex].requiredSpells = spells;
    await sheet.item.update({ [arrayPath]: items });
  }

  /**
   * Add a perk to a trait or feature.
   */
  static async addGrantPerk(event, target) {
    const sheet = this;
    const { arrayPath, itemIndex } = GrantsHandlers.#attrs(target, ['arrayPath', 'itemIndex']);
    if (!arrayPath || itemIndex === null) return;

    const select = sheet.element.querySelector(
      `select[data-array-path="${arrayPath}"][data-item-index="${itemIndex}"][data-grant-type="perk"]`
    );
    const uuid = select?.value;
    if (!uuid) { ui.notifications.warn('Please select a perk first'); return; }

    const prop = arrayPath.replace(/^system\./, '');
    const items = sheet._collectArrayFromDOM(arrayPath, prop);
    const current = items[itemIndex]?.allowedPerks || [];
    if (current.includes(uuid)) { ui.notifications.warn('Perk already added'); return; }

    items[itemIndex].allowedPerks = [...current, uuid];
    await sheet.item.update({ [arrayPath]: items });
  }

  /**
   * Remove a perk from a trait or feature by index.
   */
  static async removeGrantPerk(event, target) {
    const sheet = this;
    const { arrayPath, itemIndex, perkIndex } = GrantsHandlers.#attrs(target, ['arrayPath', 'itemIndex', 'perkIndex']);
    if (!arrayPath || itemIndex === null || perkIndex === null) return;

    const prop = arrayPath.replace(/^system\./, '');
    const items = sheet._collectArrayFromDOM(arrayPath, prop);
    const perks = items[itemIndex]?.allowedPerks || [];
    perks.splice(perkIndex, 1);
    items[itemIndex].allowedPerks = perks;
    await sheet.item.update({ [arrayPath]: items });
  }

  /**
   * Add a dropped item (weapon, natural attack…) to a trait/feature's `grantedItems`.
   * @param {HTMLElement} zone  `.item-grant-drop-zone` carrying data-array-path / data-item-index
   */
  static async dropGrantItem(sheet, zone, data) {
    const { arrayPath, itemIndex, choiceIndex } = GrantsHandlers.#attrs(zone, ['arrayPath', 'itemIndex', 'choiceIndex']);
    if (!arrayPath || itemIndex === null) return false;

    const dropped = await Item.implementation.fromDropData(data);
    if (!dropped) return false;
    if (!GrantedItems.TYPES.includes(dropped.type)) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.UI.Hints.GrantItemWrongType'));
      return false;
    }
    if (dropped.parent) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.UI.Hints.GrantItemOwned'));
      return false;
    }

    const prop = arrayPath.replace(/^system\./, '');
    const items = sheet._collectArrayFromDOM(arrayPath, prop);
    if (!items[itemIndex]) return false;
    // A choice group's drop zone (data-choice-index) fills that group's pool
    const choice = choiceIndex !== null ? items[itemIndex].itemChoices?.[choiceIndex] : null;
    if (choiceIndex !== null && !choice) return false;
    const current = (choice ? choice.pool : items[itemIndex].grantedItems) || [];
    if (current.includes(dropped.uuid)) return false;

    if (choice) choice.pool = [...current, dropped.uuid];
    else items[itemIndex].grantedItems = [...current, dropped.uuid];
    await sheet.item.update({ [arrayPath]: items });
    return true;
  }

  /**
   * Remove a granted item (or, with data-choice-index, a choice group pool item) from a trait or feature by index.
   */
  static async removeGrantItem(event, target) {
    const sheet = this;
    const { arrayPath, itemIndex, grantIndex, choiceIndex } = GrantsHandlers.#attrs(target, ['arrayPath', 'itemIndex', 'grantIndex', 'choiceIndex']);
    if (!arrayPath || itemIndex === null || grantIndex === null) return;

    const prop = arrayPath.replace(/^system\./, '');
    const items = sheet._collectArrayFromDOM(arrayPath, prop);
    if (choiceIndex !== null) {
      const choice = items[itemIndex]?.itemChoices?.[choiceIndex];
      if (!choice) return;
      choice.pool = (choice.pool || []).filter((_, i) => i !== grantIndex);
    } else {
      const granted = [...(items[itemIndex]?.grantedItems || [])];
      granted.splice(grantIndex, 1);
      items[itemIndex].grantedItems = granted;
    }
    await sheet.item.update({ [arrayPath]: items });
  }

  /** Add an empty item choice group to a trait or feature. */
  static async addGrantItemChoiceGroup(event, target) {
    const sheet = this;
    const { arrayPath, itemIndex } = GrantsHandlers.#attrs(target, ['arrayPath', 'itemIndex']);
    if (!arrayPath || itemIndex === null) return;
    const prop = arrayPath.replace(/^system\./, '');
    const items = sheet._collectArrayFromDOM(arrayPath, prop);
    if (!items[itemIndex]) return;
    items[itemIndex].itemChoices = [...(items[itemIndex].itemChoices || []), { count: 1, pool: [], label: '' }];
    await sheet.item.update({ [arrayPath]: items });
  }

  /** Remove an item choice group from a trait or feature. */
  static async removeGrantItemChoiceGroup(event, target) {
    const sheet = this;
    const { arrayPath, itemIndex, choiceIndex } = GrantsHandlers.#attrs(target, ['arrayPath', 'itemIndex', 'choiceIndex']);
    if (!arrayPath || itemIndex === null || choiceIndex === null) return;
    const prop = arrayPath.replace(/^system\./, '');
    const items = sheet._collectArrayFromDOM(arrayPath, prop);
    if (!items[itemIndex]?.itemChoices) return;
    items[itemIndex].itemChoices = items[itemIndex].itemChoices.filter((_, i) => i !== choiceIndex);
    await sheet.item.update({ [arrayPath]: items });
  }

  /** `itemChoices` → `[{count, label, items: [{uuid, name, img}]}]` for the grants editor. */
  static async enrichItemChoices(choices) {
    const out = [];
    for (const c of choices || []) {
      out.push({ count: c.count, label: c.label, items: await GrantsHandlers.enrichGrantedItems(c.pool) });
    }
    return out;
  }

  /** `grantedItems` uuids → `[{uuid, name, img}]` for the grants editor list. */
  static async enrichGrantedItems(uuids) {
    const out = [];
    for (const uuid of uuids || []) {
      if (!uuid) continue;
      const doc = await fromUuid(uuid).catch(() => null);
      out.push({ uuid, name: doc?.name || uuid, img: doc?.img || 'icons/svg/item-bag.svg' });
    }
    return out;
  }

  /**
   * Populate spell and perk dropdowns from compendiums.
   */
  static async populateGrantsDropdowns(sheet) {
    const html = sheet.element;

    const spellPacks = game.packs.filter(p => p.documentName === 'Item' && p.index.some(i => i.type === 'spell'));
    const spells = [];
    for (const pack of spellPacks) {
      const content = await pack.getDocuments();
      spells.push(...content.filter(i => i.type === 'spell'));
    }
    spells.sort((a, b) => a.name.localeCompare(b.name));

    const perkPacks = game.packs.filter(p => p.documentName === 'Item' && p.index.some(i => i.type === 'perk'));
    const perks = [];
    for (const pack of perkPacks) {
      const content = await pack.getDocuments();
      perks.push(...content.filter(i => i.type === 'perk'));
    }
    perks.sort((a, b) => a.name.localeCompare(b.name));

    html.querySelectorAll('select[data-grant-type="spell"]').forEach(select => {
      while (select.options.length > 1) select.remove(1);
      spells.forEach(spell => {
        const opt = document.createElement('option');
        opt.value = spell.uuid;
        opt.textContent = spell.name;
        select.appendChild(opt);
      });
    });

    html.querySelectorAll('select[data-grant-type="perk"]').forEach(select => {
      while (select.options.length > 1) select.remove(1);
      perks.forEach(perk => {
        const opt = document.createElement('option');
        opt.value = perk.uuid;
        opt.textContent = perk.name;
        select.appendChild(opt);
      });
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Extract and parse named dataset attributes from a target element.
   * Returns each as a number if it looks like an integer, otherwise as a string or null.
   */
  static #attrs(target, keys) {
    const result = {};
    for (const key of keys) {
      const raw = target.dataset[key];
      if (raw === undefined || raw === null || raw === '') {
        result[key] = null;
      } else if (/^\d+$/.test(raw)) {
        result[key] = parseInt(raw, 10);
      } else {
        result[key] = raw;
      }
    }
    return result;
  }
}
