import { RelicHelper } from './relic-helper.mjs';
import { VagabondChatCard } from './chat-card.mjs';

/**
 * Disguised items (GM): any equipment or container can pass for something else until the GM reveals it — an
 * unlabelled scroll, a plain-looking book, a cursed Relic (book, Armor of Vulnerability: "Any attempts to identify
 * it only reveals it to be a Relic Armor with the opposite 'plus.'").
 *
 * While `system.disguise.active`, the item's real name / img / description / lore and its own effects' name / img /
 * description ARE the disguise — one swap and every UI (sheet, inventory, HUD, chat cards, actor effects list) shows
 * it — and `system.disguise.truth` holds the real ones. Players get a locked sheet and no curse UI; effects read as
 * their disguise (`hidesFromUser`, `showEffect`); everything still works. Only the GM reveals it (`reveal`, chat card optional).
 *
 * The disguise is authored in `ItemDisguiseApp` (applications/item-disguise-app.mjs, also the GM eye `toggle`). A cursed item starts from a
 * generated one (`generate`: the opposite plus of the curse's penalties); any other item from its own name / art.
 * `system.disguise.shown` keeps the last disguise (GM edits included) for the next time. Cursed Relics attached to
 * the item get their own `power.disguise` (slot name / effect names).
 *
 * Not hidden: an effect's change values (effect config sheet), the item's real stats (damage, Armor…) — those roll.
 */
export class ItemDisguise {
  static TYPES = new Set(['equipment', 'container']);
  static BONUS_ART = 'icons/magic/control/buff-flight-wings-runes-purple.webp';
  static UNKNOWN_ART = 'icons/magic/symbols/question-stone-yellow.webp';

  static canDisguise(item) {
    return this.TYPES.has(item?.type);
  }

  static isDisguised(item) {
    return !!item?.system?.disguise?.active;
  }

  /**
   * Players see the disguise only: no curse UI, locked sheet, effects shown by their disguise (renamed; the edit
   * button shows `showEffect` instead of the config sheet). The GM sees everything.
   */
  static hidesFromUser(item) {
    return this.isDisguised(item) && !game.user.isGM;
  }

  /** Read-only view of an effect as players know it (name, art, description) — never its changes. */
  static showEffect(effect) {
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));
    return foundry.applications.api.DialogV2.prompt({
      window: { title: effect.name, icon: 'fa-solid fa-bolt' },
      content: `<div class="flexrow" style="gap:10px;align-items:flex-start">`
        + `<img src="${esc(effect.img)}" width="48" height="48" style="flex:0 0 48px;border:none">`
        + `<div style="flex:1">${effect.description || `<p><em>${esc(effect.name)}</em></p>`}</div></div>`,
      ok: { label: game.i18n.localize('Close') },
      rejectClose: false,
    });
  }

  /**
   * GM eye on the actor sheet inventory / HUD / context menu: items that are disguised or can be put back in one
   * click (a saved disguise, or a cursed item's generated one). Others only through the item sheet.
   */
  static hasEyeToggle(item) {
    return game.user.isGM && this.canDisguise(item)
      && (this.isDisguised(item) || !!item.system.disguise?.shown?.name || this.isCursed(item));
  }

  static isCursed(item) {
    const relic = item?.system?.relic;
    return !!relic && (!!relic.cursed || (relic.powers ?? []).some(p => p.cursed));
  }

  /** The slot / effect view of an attached Relic: its disguise while the host is disguised. */
  static powerView(host, power) {
    return this.isDisguised(host) && power?.disguise ? { ...power, ...power.disguise } : power;
  }

  /** The item's own effects (Relic slot effects are named through `power.disguise` instead). */
  static ownEffects(item) {
    return item.effects.filter(e => !e.flags?.vagabond?.relicSource);
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

  /** Effects that carry the item's curse: flagged `flags.vagabond.curse` (named Relics), else any with a numeric penalty. */
  static #isCurseEffect(item, effect) {
    return !!item.system.relic?.cursed
      && (!!effect.flags?.vagabond?.curse || this.#penalty(effect.system?.changes, null).plus > 0);
  }

  /** "(+1) Armor" power: `{name, img, description}`, or a plain "Relic power" without a numeric penalty. */
  static #powerDisguise(plus, kind) {
    const L = (k, d) => game.i18n.format(`VAGABOND.Item.Disguise.${k}`, d);
    if (!plus || !kind) return { name: L('PowerPlain'), img: this.BONUS_ART, description: `<p>${L('PowerPlainHint')}</p>` };
    const key = kind === 'armor' ? 'Armor' : 'Weapon';
    return { name: L(`Power${key}`, { plus }), img: this.BONUS_ART, description: `<p>${L(`Hint${key}`, { plus })}</p>` };
  }

  /** The item as it really is (its truth while disguised, else its current data). */
  static truthOf(item) {
    const real = {
      name: item._source?.name ?? item.name, img: item.img, description: item.system.description ?? '', lore: item.system.lore ?? '',
      effects: Object.fromEntries(this.ownEffects(item).map(e => [e.id, { name: e.name, img: e.img, description: e.description ?? '' }])),
    };
    if (!this.isDisguised(item)) return real;
    const truth = item.system.disguise.truth ?? {};
    // Effects created while disguised were never renamed: their current data is the real one
    return { ...real, ...truth, effects: { ...real.effects, ...(truth.effects ?? {}) } };
  }

  /**
   * Generated disguise: `{name, img, description, lore, effects: {[id]: {...}}, powers: {[powerId]: {...}}}`.
   * Cursed → a Relic with the opposite plus (book); else the item's own name / art and no text.
   */
  static generate(item) {
    const L = (k, d) => game.i18n.format(`VAGABOND.Item.Disguise.${k}`, d);
    const truth = this.truthOf(item);
    const hostKind = this.#hostKind(item);
    const relic = item.system.relic ?? {};
    const effectFor = (shown) => (e) => [e.id, this.#isCurseEffect(item, e) && shown.curseFx
      ? shown.curseFx : { name: shown.name, img: shown.img, description: '' }];

    if (!this.isCursed(item)) {
      const shown = { name: truth.name, img: truth.img, description: '', lore: '' };
      return { ...shown, effects: Object.fromEntries(this.ownEffects(item).map(effectFor(shown))), powers: {} };
    }

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
      own = this.#penalty(this.ownEffects(item).flatMap(e => e.system?.changes ?? []), hostKind);
      consider(own);
    }

    // Armor tier from its own (source) Rating — a curse may override the prepared one
    const rating = Number(item._source?.system?.armorRating) || 0;
    const base = hostKind === 'armor'
      ? L(['ArmorLight', 'ArmorMedium', 'ArmorHeavy'][rating - 1] ?? 'Armor')
      : L(hostKind === 'weapon' ? 'Weapon' : 'Item');
    let name = base, description = `<p>${L('Plain', { base })}</p>`;
    if (best.plus && best.kind) {
      const power = this.#powerDisguise(best.plus, best.kind);
      name = L('NamePlus', { base, plus: best.plus });
      description = `<p>${L('Intro', { base })}</p><ul><li><strong>${power.name}:</strong> ${L(`Hint${best.kind === 'armor' ? 'Armor' : 'Weapon'}`, { plus: best.plus })}</li></ul>`;
    }
    const shown = { name, img: truth.img, description, lore: L('LoreRelic', { base }), curseFx: this.#powerDisguise(own.plus, own.kind) };
    const effects = Object.fromEntries(this.ownEffects(item).map(effectFor(shown)));
    delete shown.curseFx;
    return { ...shown, effects, powers };
  }

  /**
   * Unidentified item: "Unknown <type>" (Weapon / Armor / Gear / Alchemical / Relic / Container), a mystery text, the
   * real art; every own effect and attached Relic reads as an unknown one until the GM reveals it.
   */
  static unknown(item) {
    const L = (k) => game.i18n.localize(`VAGABOND.Item.Disguise.Unknown.${k}`);
    const truth = this.truthOf(item);
    const type = item.type === 'container' ? 'container' : item.system.equipmentType;
    const key = { weapon: 'Weapon', armor: 'Armor', gear: 'Gear', alchemical: 'Alchemical', relic: 'Relic', container: 'Container' }[type] ?? 'Item';
    const effect = { name: L('Effect'), img: this.UNKNOWN_ART, description: `<p>${L('EffectHint')}</p>` };
    const power = { name: L('Power'), img: this.UNKNOWN_ART, description: `<p>${L('EffectHint')}</p>` };
    return {
      name: L(key), img: truth.img, description: `<p>${L('Description')}</p>`, lore: '',
      effects: Object.fromEntries(this.ownEffects(item).map(e => [e.id, { ...effect }])),
      powers: Object.fromEntries((item.system.relic?.powers ?? []).map(p => [p.id, { ...power }])),
    };
  }

  /** What the disguise editor starts with: the live disguise, else the last one (GM edits), else a generated one. */
  static draft(item) {
    const generated = this.generate(item);
    const last = this.isDisguised(item)
      ? {
        name: item._source?.name ?? item.name, img: item.img, description: item.system.description ?? '', lore: item.system.lore ?? '',
        // Only effects renamed by the disguise — ones created since still carry their real name
        effects: Object.fromEntries(this.ownEffects(item).filter(e => item.system.disguise.truth?.effects?.[e.id])
          .map(e => [e.id, { name: e.name, img: e.img, description: e.description ?? '' }])),
        powers: Object.fromEntries((item.system.relic?.powers ?? []).filter(p => p.disguise).map(p => [p.id, p.disguise])),
      }
      : item.system.disguise?.shown;
    if (!last?.name) return generated;
    // Effects / Relics added since the last disguise get a generated entry
    return {
      ...last,
      effects: { ...generated.effects, ...(last.effects ?? {}) },
      powers: { ...generated.powers, ...(last.powers ?? {}) },
    };
  }

  /* -------------------------------------------- */
  /*  Disguise / Reveal (GM)                      */
  /* -------------------------------------------- */

  /**
   * Disguise `item` as `shown` (`{name, img, description, lore, effects, powers}`), or update a live disguise.
   * Missing fields fall back to `draft(item)`. Attached Relics in `powers` get that disguise; others none.
   */
  static async disguise(item, shown = {}) {
    if (!game.user.isGM || !this.canDisguise(item)) return false;
    const draft = this.draft(item);
    const look = {
      ...draft, ...shown,
      effects: { ...draft.effects, ...(shown.effects ?? {}) },
      powers: { ...draft.powers, ...(shown.powers ?? {}) },
    };
    const truth = this.truthOf(item);
    const fx = this.ownEffects(item);
    const update = {
      name: look.name || truth.name,
      img: look.img || truth.img,
      'system.description': look.description ?? '',
      'system.disguise.active': true,
      'system.disguise.truth': truth,
      ...(shown.lockUse !== undefined ? { 'system.disguise.lockUse': !!shown.lockUse } : {}),
      'system.disguise.shown': {
        name: look.name, img: look.img, description: look.description ?? '', lore: look.lore ?? '', effects: look.effects, powers: look.powers,
      },
    };
    if (item.type === 'equipment') {
      update['system.lore'] = look.lore ?? '';
      update['system.relic.powers'] = (item.system.relic.powers ?? []).map(p => {
        if (look.powers[p.id]) return { ...p, disguise: look.powers[p.id] };
        const { disguise, ...rest } = p;
        return rest;
      });
    }
    await item.update(update);
    if (fx.length) {
      await item.updateEmbeddedDocuments('ActiveEffect', fx.map(e => {
        const f = look.effects?.[e.id] ?? {};
        return { _id: e.id, name: f.name || look.name || e.name, img: f.img || look.img || e.img, description: f.description ?? '' };
      }));
    }
    if (item.type === 'equipment') await RelicHelper.syncHostEffects(item);
    return true;
  }

  /** Reveal `item` (GM): the true identity comes back, the disguise (with edits) is kept, chat card unless `announce: false`. */
  static async reveal(item, { announce = true } = {}) {
    if (!game.user.isGM || !this.isDisguised(item)) return false;
    const truth = this.truthOf(item);
    const fx = this.ownEffects(item);
    const shown = {
      name: item.name, img: item.img, description: item.system.description ?? '', lore: item.system.lore ?? '',
      effects: Object.fromEntries(fx.map(e => [e.id, { name: e.name, img: e.img, description: e.description ?? '' }])),
    };
    const update = {
      name: truth.name || item.name,
      img: truth.img || item.img,
      'system.description': truth.description ?? '',
      'system.disguise.active': false,
      'system.disguise.truth': {},
      'system.disguise.shown': shown,
    };
    if (item.type === 'equipment') update['system.lore'] = truth.lore ?? '';
    await item.update(update);
    const trueFx = fx.filter(e => truth.effects?.[e.id]);
    if (trueFx.length) await item.updateEmbeddedDocuments('ActiveEffect', trueFx.map(e => ({ _id: e.id, ...truth.effects[e.id] })));
    if (item.type === 'equipment') await RelicHelper.syncHostEffects(item);
    if (!announce) return true;

    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));
    const card = new VagabondChatCard()
      .setType('generic')
      .setTitle(game.i18n.localize('VAGABOND.Item.Disguise.RevealTitle'))
      .setDescription(`<p>${game.i18n.format('VAGABOND.Item.Disguise.RevealResult', {
        disguise: `<strong>${esc(shown.name)}</strong>`, name: `<strong>${esc(item.name)}</strong>`,
      })}</p>${item.system.description ?? ''}`);
    if (item.actor) card.setActor(item.actor).setSubtitle(item.actor.name);
    await card.send();
    return true;
  }

  /** GM-only item sheet header model (mask button + banner), or null. */
  static view(item) {
    if (!game.user.isGM || !this.canDisguise(item)) return null;
    return { disguised: this.isDisguised(item), trueName: this.isDisguised(item) ? this.truthOf(item).name : '' };
  }
}
