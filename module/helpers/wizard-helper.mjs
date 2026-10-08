import { classFeatureText } from './feature-text.mjs';
import { buildMacroButtonHTML } from './item-macro.mjs';

/**
 * Wizard — Extracurricular (feature button).
 *
 * "When you successfully Cast a Spell, you can spend a Studied die to add the effect of another Spell you know to
 * that Casting." The button posts a card with one button per Spell the Wizard knows; picking one spends a Studied
 * die (`system.studiedDice`) and posts that Spell's text as the extra effect. Resolving the effect (Targets, Mana,
 * Saves) stays at the table — the Cast itself is not changed. No dialog, no Combat needed.
 *
 * The extra Spell's card carries its effect macro buttons (`macro` and `hitMacro` - the Cast succeeded) so the effect
 * can be invoked from the card.
 *
 * Archwizard ("Cast Spells you do not know, but you cannot spend Mana to upcast them"): a feature button opens a
 * selector of every Spell in the Spells compendium you do not know (4 columns, 32px image + name). The pick is put on
 * the actor as a temporary copy (`flags.vagabond.archwizardTemp`) and its normal Cast dialog opens. The Archwizard
 * button glows while the copy exists (right-click ends it = deletes the copy). The copy removes itself once the Cast is
 * resolved: a successful Cast records what is still to resolve (`flags.vagabond.archwizardPending` = damage applied,
 * the Spell's macro buttons used) and each of those clears its part; when nothing is left the copy is deleted. A Cast
 * with no damage and no macro is deleted a moment after it succeeds. A failed or cancelled Cast keeps the copy (Luck
 * rerolls need it) until the next pick or the right-click. "No upcasting" is text: leave the Delivery and Mana alone.
 *
 * Page Master (learn a Spell for the Shift) is text only.
 *
 * Imported by vagabond.mjs only (button handlers).
 */
export class WizardHelper {

  static #L(key, data = {}) {
    return game.i18n.format(`VAGABOND.Extracurricular.${key}`, data);
  }

  /** Book text of the Extracurricular feature, for the cards. */
  static #featureText(actor) {
    return classFeatureText(actor, { command: 'wizard.extracurricular', name: 'Extracurricular' });
  }

  /**
   * Extracurricular button (`system:wizard.extracurricular`): a card with one button per known Spell.
   * @param {{actor: Actor}} scope
   */
  static async extracurricular({ actor }) {
    if (actor?.type !== 'character' || !actor.isOwner) {
      ui.notifications.warn(this.#L('NotYours'));
      return;
    }
    if ((actor.system.studiedDice ?? 0) < 1) {
      ui.notifications.warn(this.#L('NoStudied', { name: actor.name }));
      return;
    }
    const spells = actor.items.filter(i => i.type === 'spell' && !i.flags?.vagabond?.archwizardTemp).sort((a, b) => a.name.localeCompare(b.name));
    if (!spells.length) {
      ui.notifications.warn(this.#L('NoSpells', { name: actor.name }));
      return;
    }

    const { VagabondChatCard } = await import('./chat-card.mjs');
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle(this.#L('Title'))
      .setSubtitle(actor.name)
      .setDescription(`<p>${this.#L('Pick')}</p>${this.#featureText(actor)}`);
    for (const spell of spells) {
      card.addFooterAction(buildMacroButtonHTML({
        cfg: { enabled: true, label: spell.name, icon: 'book-open', command: 'system:wizard.extracurricularSpell' },
        slot: 'macro',
        actorUuid: actor.uuid,
        itemName: 'Extracurricular',
        extraScope: { spellId: spell.id },
      }));
    }
    await card.send();
  }

  /**
   * A Spell button on the card was clicked: spend a Studied die and post the Spell's text.
   * @param {{actor: Actor, spellId: string}} scope
   */
  static async extracurricularSpell({ actor, spellId }) {
    if (actor?.type !== 'character' || !actor.isOwner) {
      ui.notifications.warn(this.#L('NotYours'));
      return;
    }
    const spell = actor.items.get(spellId);
    if (!spell || spell.type !== 'spell') {
      ui.notifications.warn(this.#L('NoSpells', { name: actor.name }));
      return;
    }
    const dice = actor.system.studiedDice ?? 0;
    if (dice < 1) {
      ui.notifications.warn(this.#L('NoStudied', { name: actor.name }));
      return;
    }
    await actor.update({ 'system.studiedDice': dice - 1 });

    const { VagabondChatCard } = await import('./chat-card.mjs');
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle(this.#L('SpellTitle', { spell: spell.name }))
      .setSubtitle(actor.name)
      .setDescription(`<p>${this.#L('Added', { name: actor.name, spell: foundry.utils.escapeHTML(spell.name), left: dice - 1 })}</p>${spell.system.description ?? ''}`);
    // The Cast succeeded, so both the simple and the on-success macro of the Spell can be invoked from here
    VagabondChatCard._buildMacroButtons(spell, actor, true).forEach(b => card.addFooterAction(b));
    await card.send();
  }

  /* -------------------------------------------- */
  /*  Archwizard                                  */
  /* -------------------------------------------- */

  /** Temporary Archwizard copies on the actor. */
  static #archwizardCopies(actor) {
    return actor.items.filter(i => i.type === 'spell' && i.flags?.vagabond?.archwizardTemp);
  }

  /** Markup of the Spell selector: search box + a 4-column grid of 32px image + name options. */
  static #selectorHTML(entries) {
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));
    const opt = (e) => `<button type="button" class="archwizard-option" data-uuid="${esc(e.uuid)}" data-name="${esc(e.name.toLowerCase())}"
        style="display:flex;align-items:center;gap:6px;height:auto;line-height:normal;padding:3px 5px;text-align:left;min-width:0;">
        <img src="${esc(e.img)}" width="32" height="32" loading="lazy" style="width:32px;height:32px;flex:none;border:0;object-fit:cover;">
        <span style="overflow:hidden;text-overflow:ellipsis;">${esc(e.name)}</span>
      </button>`;
    return `<div class="archwizard-selector" style="display:flex;flex-direction:column;gap:6px;">
      <input type="search" class="archwizard-search" placeholder="${esc(game.i18n.localize('VAGABOND.Archwizard.Search'))}" autocomplete="off">
      <input type="hidden" name="spellUuid" value="">
      <div class="archwizard-grid" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;max-height:380px;overflow-y:auto;">
        ${entries.map(opt).join('')}
      </div>
    </div>`;
  }

  /**
   * Archwizard button (`system:wizard.archwizard`): pick any Spell from the compendium and Cast it.
   * @param {{actor: Actor}} scope
   */
  static async archwizard({ actor }) {
    if (actor?.type !== 'character' || !actor.isOwner) {
      ui.notifications.warn(this.#L('NotYours'));
      return;
    }
    const pack = game.packs.get('vagabond.spells');
    if (!pack) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Archwizard.NoPack'));
      return;
    }
    const known = new Set(actor.items.filter(i => i.type === 'spell' && !i.flags?.vagabond?.archwizardTemp).map(i => i.name));
    const index = await pack.getIndex();
    const entries = index.filter(e => (!e.type || e.type === 'spell') && !known.has(e.name))
      .map(e => ({ uuid: e.uuid ?? `${pack.collection}.Item.${e._id}`, name: e.name, img: e.img }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const uuid = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize('VAGABOND.Archwizard.Title'), icon: 'fa-solid fa-hat-wizard' },
      position: { width: 640 },
      content: this.#selectorHTML(entries),
      ok: {
        label: game.i18n.localize('VAGABOND.Archwizard.Cast'),
        icon: 'fa-solid fa-wand-sparkles',
        callback: (event, button) => button.form.elements.spellUuid.value,
      },
      render: (event, dialog) => {
        const root = dialog.element;
        const hidden = root.querySelector('input[name="spellUuid"]');
        const options = Array.from(root.querySelectorAll('.archwizard-option'));
        for (const o of options) {
          o.addEventListener('click', () => {
            hidden.value = o.dataset.uuid;
            for (const x of options) x.style.outline = x === o ? '2px solid var(--color-warm-2, #c9a227)' : '';
          });
          o.addEventListener('dblclick', () => root.querySelector('button[data-action="ok"]')?.click());
        }
        root.querySelector('.archwizard-search')?.addEventListener('input', (ev) => {
          const q = ev.currentTarget.value.trim().toLowerCase();
          for (const o of options) o.style.display = (!q || o.dataset.name.includes(q)) ? 'flex' : 'none';
        });
      },
      rejectClose: false,
    });
    if (!uuid) return;
    await this.#cast(actor, uuid);
  }

  /** Put the picked Spell on the actor as a temporary copy, announce it and open its Cast dialog. */
  static async #cast(actor, uuid) {
    const source = await fromUuid(uuid);
    if (!source || source.type !== 'spell') return;

    const old = this.#archwizardCopies(actor).map(i => i.id);
    if (old.length) await actor.deleteEmbeddedDocuments('Item', old);
    const data = source.toObject();
    delete data._id;
    foundry.utils.setProperty(data, 'flags.core.sourceId', uuid);
    foundry.utils.setProperty(data, 'flags.vagabond.archwizardTemp', true);
    const [copy] = await actor.createEmbeddedDocuments('Item', [data]);
    if (!copy) return;

    const { VagabondChatCard } = await import('./chat-card.mjs');
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle(this.#L('ArchwizardTitle', { spell: copy.name }))
      .setSubtitle(actor.name)
      .setDescription(`<p>${game.i18n.format('VAGABOND.Archwizard.Casts', { name: actor.name, spell: foundry.utils.escapeHTML(copy.name) })}</p>${copy.system.description ?? ''}`);
    await card.send();

    // Open the normal Cast dialog for the temporary copy (needs the character sheet's spell handler)
    const handler = actor.sheet?.spellHandler;
    if (handler) await handler.castSpell(new MouseEvent('click'), { dataset: { spellId: copy.id } });
    else ui.notifications.info(game.i18n.format('VAGABOND.Archwizard.CastFromSheet', { spell: copy.name }));
  }

  /** Is an Archwizard copy on the actor (the glowing state of the button)? */
  static hasArchwizardCopy(actor) {
    return actor?.type === 'character' && this.#archwizardCopies(actor).length > 0;
  }

  /** End the Archwizard Cast (right-click on the glowing button): delete the temporary copy. */
  static async endArchwizard(actor) {
    if (actor?.type !== 'character' || !actor.isOwner) return;
    const ids = this.#archwizardCopies(actor).map(i => i.id);
    if (ids.length) await actor.deleteEmbeddedDocuments('Item', ids);
  }

  /** The temporary copy a hook payload refers to, or null (owner's client only). */
  static #tempCopy(actor, itemId) {
    const item = itemId ? actor?.items?.get(itemId) : null;
    return (item?.type === 'spell' && item.flags?.vagabond?.archwizardTemp && actor.isOwner) ? item : null;
  }

  /** Delete the copy a moment later (the Cast / apply flow that triggered this is still finishing). */
  static #deleteSoon(actor, copy, ms = 2500) {
    setTimeout(() => {
      if (actor.items.get(copy.id)?.flags?.vagabond?.archwizardTemp) {
        actor.deleteEmbeddedDocuments('Item', [copy.id]).catch(err => console.warn('vagabond | Archwizard: could not remove the Spell', err));
      }
    }, ms);
  }

  /** The Cast succeeded: record what is left to resolve, or schedule the removal when nothing is. */
  static #onCast(actor, itemId) {
    const copy = this.#tempCopy(actor, itemId);
    if (!copy) return;
    const state = actor.sheet?.spellHandler?._getSpellState?.(copy.id);
    const delivery = String(state?.deliveryType ?? '').toUpperCase();
    const damage = copy.system.damageType !== '-' && (state?.damageDice ?? 1) >= 1 && delivery !== 'GLYPH' && delivery !== 'IMBUE';
    const macros = ['macro', 'hitMacro'].filter(slot => copy.system[slot]?.enabled && (copy.system[slot].uuid || copy.system[slot].command));
    if (!damage && !macros.length) return this.#deleteSoon(actor, copy, 4000);
    copy.setFlag('vagabond', 'archwizardPending', { damage, macros })
      .catch(err => console.warn('vagabond | Archwizard: could not record the Cast', err));
  }

  /** One part of the Cast was resolved (`damage` applied, or a `macro` slot used): delete the copy when all are. */
  static #resolve(actor, copy, part) {
    const pending = copy.getFlag('vagabond', 'archwizardPending');
    if (!pending) return;
    const next = {
      damage: part === 'damage' ? false : !!pending.damage,
      macros: (pending.macros ?? []).filter(slot => slot !== part),
    };
    if (!next.damage && !next.macros.length) return this.#deleteSoon(actor, copy);
    copy.setFlag('vagabond', 'archwizardPending', next)
      .catch(err => console.warn('vagabond | Archwizard: could not record the Cast', err));
  }

  /** Register the hooks. Synchronous, called once at module load. */
  static registerHooks() {
    Hooks.on('vagabond.actorActed', (actor, { source, itemId } = {}) => {
      if (source === 'cast') this.#onCast(actor, itemId);
    });
    // Damage of the Cast landed (Apply Direct / auto-apply on a Save)
    Hooks.on('vagabond.postDamageApply', (ctx) => {
      const actor = ctx?.attackerActor;
      const copy = this.#tempCopy(actor, ctx?.sourceItem?.id);
      if (copy) this.#resolve(actor, copy, 'damage');
    });
    // One of the Spell's macro buttons was used
    Hooks.on('vagabond.itemMacroExecuted', ({ itemUuid, slot } = {}) => {
      const item = itemUuid ? fromUuidSync(itemUuid) : null;
      const actor = item?.actor;
      const copy = this.#tempCopy(actor, item?.id);
      if (copy && slot) this.#resolve(actor, copy, slot);
    });
  }
}
