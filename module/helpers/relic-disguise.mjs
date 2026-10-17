import { RelicHelper } from './relic-helper.mjs';
import { VagabondChatCard } from './chat-card.mjs';

/**
 * Disguised curses (book, Armor of Vulnerability: "Any attempts to identify it only reveals it to be a Relic Armor
 * with the opposite 'plus.'"). While `system.relic.disguised`, the item's real name / img / description / lore ARE
 * the disguise — one swap and every UI shows it — and `system.relic.trueIdentity` holds the real ones. Players see
 * no curse UI on it (`hidesCurse`); the curse still works. Only the GM reveals it (`reveal`, chat card).
 *
 * The disguise is generated the first time (`generate`: the opposite plus of the curse's penalties) and kept in
 * `system.relic.disguise` afterwards: the GM edits it by editing the disguised item, and a reveal stores those edits
 * for the next disguise. Cursed Relics attached to it get their own `power.disguise` (slot name / effect names); the
 * item's own curse effects (`curseEffects`) are renamed too, their real name / img / description in `trueIdentity.effects`.
 */
export class RelicDisguise {
  static BONUS_ART = 'icons/magic/control/buff-flight-wings-runes-purple.webp';

  static isDisguised(item) {
    return !!item?.system?.relic?.disguised;
  }

  /** Players see no curse on a disguised item; the GM sees everything. */
  static hidesCurse(item) {
    return this.isDisguised(item) && !game.user.isGM;
  }

  /** Can the GM disguise `item`? Equipment with a curse (its own or an attached Cursed Relic). */
  static canDisguise(item) {
    if (item?.type !== 'equipment' || this.isDisguised(item)) return false;
    const relic = item.system.relic ?? {};
    return !!relic.cursed || (relic.powers ?? []).some(p => p.cursed);
  }

  /** The slot / effect view of an attached Relic: its disguise while the host is disguised. */
  static powerView(host, power) {
    return this.isDisguised(host) && power?.cursed && power.disguise ? { ...power, ...power.disguise } : power;
  }

  /* -------------------------------------------- */
  /*  Generated disguise                          */
  /* -------------------------------------------- */

  /** Largest penalty of `changes` (add, numeric, below 0) as `{plus, kind}`; kind = 'armor' | 'weapon' | null. */
  static #penalty(changes, fallbackKind) {
    let plus = 0, kind = null;
    for (const c of changes ?? []) {
      const value = Number(c.value);
      if (c.type !== 'add' || !Number.isFinite(value) || value >= 0 || -value <= plus) continue;
      plus = -value;
      kind = c.key === 'system.armorBonus' ? 'armor' : /^system\.universalWeapon/.test(c.key ?? '') ? 'weapon' : fallbackKind;
    }
    return { plus, kind };
  }

  static #hostKind(item) {
    const type = item.system.equipmentType;
    return type === 'armor' || type === 'weapon' ? type : null;
  }

  /**
   * The item's own effects that carry its curse: flagged `flags.vagabond.curse` (named Relics), else any with a numeric
   * penalty. Relic slot effects (`relicSource`) are named through `power.disguise` instead.
   */
  static curseEffects(item) {
    if (!item?.system?.relic?.cursed) return [];
    return item.effects.filter(e => !e.flags?.vagabond?.relicSource
      && (e.flags?.vagabond?.curse || this.#penalty(e.system?.changes, null).plus > 0));
  }

  /** "(+1) Armor" power: `{name, img, description}`, or a plain "Relic power" without a numeric penalty. */
  static #powerDisguise(plus, kind) {
    const L = (k, d) => game.i18n.format(`VAGABOND.Item.Relic.Disguise.${k}`, d);
    if (!plus || !kind) return { name: L('PowerPlain'), img: this.BONUS_ART, description: `<p>${L('PowerPlainHint')}</p>` };
    const key = kind === 'armor' ? 'Armor' : 'Weapon';
    return { name: L(`Power${key}`, { plus }), img: this.BONUS_ART, description: `<p>${L(`Hint${key}`, { plus })}</p>` };
  }

  /**
   * Generated disguise of `item`: `{item: {name, img, description, lore}, powers: {[powerId]: {...}}, effect: {...}}`
   * (`effect` = what its own curse effects show).
   */
  static generate(item) {
    const L = (k, d) => game.i18n.format(`VAGABOND.Item.Relic.Disguise.${k}`, d);
    const hostKind = this.#hostKind(item);
    const relic = item.system.relic ?? {};
    const powers = {};
    let best = { plus: 0, kind: null };
    const consider = (p) => { if (p.plus > best.plus) best = p; };
    for (const power of relic.powers ?? []) {
      if (!power.cursed) continue;
      const pen = this.#penalty((power.changes ?? []).flatMap(c => c.changes ?? []), hostKind);
      powers[power.id] = this.#powerDisguise(pen.plus, pen.kind);
      consider(pen);
    }
    let own = { plus: 0, kind: null };
    if (relic.cursed) {
      own = this.#penalty(item.effects.filter(e => !e.flags?.vagabond?.relicSource).flatMap(e => e.system?.changes ?? []), hostKind);
      consider(own);
    }

    // Armor tier from its own (source) Rating — a curse may override the prepared one
    const rating = Number(item._source?.system?.armorRating) || 0;
    const base = hostKind === 'armor'
      ? L(['ArmorLight', 'ArmorMedium', 'ArmorHeavy'][rating - 1] ?? 'Armor')
      : L(hostKind === 'weapon' ? 'Weapon' : 'Item');
    const lore = L('Lore', { base });
    let name = base, description = `<p>${L('Plain', { base })}</p>`;
    if (best.plus && best.kind) {
      const power = this.#powerDisguise(best.plus, best.kind);
      name = L('NamePlus', { base, plus: best.plus });
      description = `<p>${L('Intro', { base })}</p><ul><li><strong>${power.name}:</strong> ${L(`Hint${best.kind === 'armor' ? 'Armor' : 'Weapon'}`, { plus: best.plus })}</li></ul>`;
    }
    return { item: { name, img: item.img, description, lore }, powers, effect: this.#powerDisguise(own.plus, own.kind) };
  }

  /* -------------------------------------------- */
  /*  Disguise / Reveal (GM)                      */
  /* -------------------------------------------- */

  /** Disguise `item`: its last disguise (GM edits kept), else a generated one. */
  static async disguise(item) {
    if (!game.user.isGM || !this.canDisguise(item)) return false;
    const relic = item.system.relic;
    const generated = this.generate(item);
    const disguise = relic.disguise?.name ? relic.disguise : generated.item;
    const powers = (relic.powers ?? []).map(p => (p.cursed && !p.disguise && generated.powers[p.id]
      ? { ...p, disguise: generated.powers[p.id] } : p));
    const curseFx = this.curseEffects(item);
    await item.update({
      name: disguise.name,
      img: disguise.img || item.img,
      'system.description': disguise.description ?? '',
      'system.lore': disguise.lore ?? '',
      'system.relic.disguised': true,
      'system.relic.trueIdentity': {
        name: item.name, img: item.img, description: item.system.description ?? '', lore: item.system.lore ?? '',
        effects: Object.fromEntries(curseFx.map(e => [e.id, { name: e.name, img: e.img, description: e.description ?? '' }])),
      },
      'system.relic.powers': powers,
    });
    if (curseFx.length) {
      await item.updateEmbeddedDocuments('ActiveEffect', curseFx.map(e => ({ _id: e.id, ...(disguise.effects?.[e.id] ?? generated.effect) })));
    }
    await RelicHelper.syncHostEffects(item);
    return true;
  }

  /** Reveal `item` (GM): the true identity comes back, the disguise (with edits) is kept, chat card. */
  static async reveal(item) {
    if (!game.user.isGM || !this.isDisguised(item)) return false;
    const truth = item.system.relic.trueIdentity ?? {};
    const trueFx = truth.effects ?? {};
    const curseFx = item.effects.filter(e => trueFx[e.id]);
    const shown = {
      name: item.name, img: item.img, description: item.system.description ?? '', lore: item.system.lore ?? '',
      effects: Object.fromEntries(curseFx.map(e => [e.id, { name: e.name, img: e.img, description: e.description ?? '' }])),
    };
    await item.update({
      name: truth.name || item.name,
      img: truth.img || item.img,
      'system.description': truth.description ?? '',
      'system.lore': truth.lore ?? '',
      'system.relic.disguised': false,
      'system.relic.disguise': shown,
    });
    if (curseFx.length) await item.updateEmbeddedDocuments('ActiveEffect', curseFx.map(e => ({ _id: e.id, ...trueFx[e.id] })));
    await RelicHelper.syncHostEffects(item);

    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));
    const card = new VagabondChatCard()
      .setType('generic')
      .setTitle(game.i18n.localize('VAGABOND.Item.Relic.Disguise.RevealTitle'))
      .setDescription(`<p>${game.i18n.format('VAGABOND.Item.Relic.Disguise.RevealResult', {
        disguise: `<strong>${esc(shown.name)}</strong>`, name: `<strong>${esc(item.name)}</strong>`,
      })}</p>${item.system.description ?? ''}`);
    if (item.actor) card.setActor(item.actor).setSubtitle(item.actor.name);
    await card.send();
    return true;
  }

  /** GM-only item sheet banner model, or null. */
  static view(item) {
    if (!game.user.isGM || item?.type !== 'equipment') return null;
    if (this.isDisguised(item)) return { disguised: true, trueName: item.system.relic.trueIdentity?.name ?? '' };
    return this.canDisguise(item) ? { disguised: false } : null;
  }
}
