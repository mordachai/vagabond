import { EquipmentHelper } from './equipment-helper.mjs';

/**
 * Automation for the "Imbue" spell delivery: a spell is attached to a willing
 * being's equipped weapon at cast time, then delivered as if by Touch when
 * that weapon's next attack hits (1 Mana paid by the source caster).
 */
export class VagabondImbueHelper {
  static _emptyPayload() {
    return {
      active: false,
      sourceActorUuid: '',
      sourceActorName: '',
      spellUuid: '',
      spellName: '',
      spellImg: '',
      damageDice: 0,
      deferredMana: 0,
      deferredPayment: false,
      manaSkillKey: '',
      castCombatId: '',
      castCombatRound: null,
      castCombatTurn: null,
      casterCombatantId: '',
      focusSpellId: '',
    };
  }

  /**
   * Resolve which weapon to imbue for each targeted token, up to `count` targets.
   * Warns and skips targets with no equipped weapons. Auto-resolves without a
   * dialog when there's exactly one target with exactly one weapon; otherwise
   * shows the card-picker dialog with one column per target.
   * @param {Token[]} targets
   * @param {number} count
   * @returns {Promise<Array<{targetActor: Actor, weapon: Item}>>}
   */
  static async resolveTargetWeapons(targets, count) {
    const entries = [];
    for (const token of targets.slice(0, count)) {
      const targetActor = token.actor;
      if (!targetActor) continue;
      const weapons = targetActor.items.filter(
        (i) => EquipmentHelper.isWeapon(i) && EquipmentHelper.isEquipped(i)
      );
      if (!weapons.length) {
        ui.notifications.warn(
          game.i18n.format('VAGABOND.Status.Imbue.NoWeapons', { actor: targetActor.name })
        );
        continue;
      }
      entries.push({ targetActor, weapons });
    }

    if (!entries.length) return [];
    if (entries.length === 1 && entries[0].weapons.length === 1) {
      return [{ targetActor: entries[0].targetActor, weapon: entries[0].weapons[0] }];
    }

    const { ImbueWeaponSelectDialog } = await import('../applications/imbue-weapon-select-dialog.mjs');
    return ImbueWeaponSelectDialog.prompt(entries);
  }

  /**
   * Write the imbue payload onto `weapon`.
   * @param {Item} weapon
   * @param {{sourceActor: Actor, spell: Item, damageDice: number, deferredMana: number, deferredPayment: boolean, manaSkillKey: string}} opts
   */
  static async imbueWeapon(weapon, { sourceActor, spell, damageDice, deferredMana, deferredPayment, manaSkillKey }) {
    const combatFields = game.combat
      ? {
          castCombatId: game.combat.id,
          castCombatRound: game.combat.round,
          castCombatTurn: game.combat.turn,
          casterCombatantId:
            game.combat.combatants.find((c) => c.actor?.uuid === sourceActor.uuid)?.id ?? '',
        }
      : {};

    await weapon.update({
      'system.imbuedSpell': {
        ...this._emptyPayload(),
        active: true,
        sourceActorUuid: sourceActor.uuid,
        sourceActorName: sourceActor.name,
        spellUuid: spell.uuid,
        spellName: spell.name,
        spellImg: spell.img,
        damageDice: damageDice || 0,
        deferredMana: deferredMana || 0,
        deferredPayment: !!deferredPayment,
        manaSkillKey: manaSkillKey || '',
        focusSpellId: spell.id,
        ...combatFields,
      },
    });
  }

  /**
   * Reset a weapon's imbue payload back to defaults.
   * @param {Item} weapon
   */
  static async clearImbue(weapon) {
    await weapon.update({ 'system.imbuedSpell': this._emptyPayload() });
  }

  /**
   * Delivery-time cost for deferred-payment Imbues: flat trigger fee + per-die
   * cost (first die free) + a flat surcharge for including the Effect, only
   * if at least one Damage die is spent. Mirrors SpellCastDialog.calculateCosts().
   * @param {number} dice
   * @param {boolean} effectChecked
   * @returns {number}
   */
  static _computeDeliveryCost(dice, effectChecked) {
    const IMBUE_TRIGGER_FEE = 1;
    const diceCost = dice >= 1 ? Math.max(0, dice - 1) : 0;
    const fxCost = dice >= 1 && effectChecked ? 1 : 0;
    return IMBUE_TRIGGER_FEE + diceCost + fxCost;
  }

  /**
   * Build the "Deliver Imbued Spell" chat-card control for a hit that just landed
   * with an imbued weapon. Upfront-mode payloads (deferredPayment=false) render a
   * simple one-click button; deferred-mode payloads render an inline stepper so
   * the caster picks Damage dice + Effect live, bounded by their Mana.
   * @param {Item} weapon
   * @param {Object} attackResult
   * @param {Array} targetsAtRollTime
   * @returns {string}
   */
  static createDeliveryButton(weapon, attackResult, targetsAtRollTime = []) {
    const payload = weapon.system.imbuedSpell;
    const targetsJson = JSON.stringify(targetsAtRollTime).replace(/"/g, '&quot;');

    if (payload.deferredPayment) {
      return `<div class="vagabond-imbue-delivery-controls"
          data-actor-id="${weapon.parent?.id ?? ''}"
          data-item-id="${weapon.id}"
          data-attack-critical="${!!attackResult.isCritical}"
          data-targets="${targetsJson}"
          data-source-actor-uuid="${payload.sourceActorUuid}"
          data-dice="0"
          data-effect="false">
          <div class="vagabond-imbue-controls-label"><i class="fa-solid fa-wand-sparkles"></i> ${game.i18n.format('VAGABOND.Status.Imbue.DeliverButton', { spellName: payload.spellName })}</div>
          <div class="vagabond-imbue-stepper">
            <button type="button" class="vagabond-imbue-dice-minus">&minus;</button>
            <span class="vagabond-imbue-dice-count">0</span>
            <button type="button" class="vagabond-imbue-dice-plus">+</button>
            <label class="vagabond-imbue-effect-toggle">
              <input type="checkbox" class="vagabond-imbue-effect-checkbox" />
              ${game.i18n.localize('VAGABOND.Status.Imbue.IncludeEffect')}
            </label>
          </div>
          <div class="vagabond-imbue-total">${game.i18n.localize('VAGABOND.Status.Imbue.TotalMana')}: <span class="vagabond-imbue-total-value">1</span></div>
          <button type="button" class="vagabond-imbue-confirm-button"><i class="fa-solid fa-wand-sparkles"></i> ${game.i18n.localize('VAGABOND.Status.Imbue.ConfirmDeliver')}</button>
        </div>`;
    }

    return `<button class="vagabond-imbue-deliver-button"
        data-actor-id="${weapon.parent?.id ?? ''}"
        data-item-id="${weapon.id}"
        data-attack-critical="${!!attackResult.isCritical}"
        data-targets="${targetsJson}">
        <i class="fa-solid fa-wand-sparkles"></i> ${game.i18n.format('VAGABOND.Status.Imbue.DeliverButton', { spellName: payload.spellName })} (${payload.deferredMana || 1})
      </button>`;
  }

  /**
   * Marks the delivery control as resolved, matching either shape (plain
   * button for upfront mode, container for deferred-payment mode).
   * @param {HTMLElement} el
   * @param {boolean} isControls
   */
  static _markDelivered(el, isControls) {
    if (isControls) {
      el.innerHTML = `<i class="fa-solid fa-check"></i> ${game.i18n.localize('VAGABOND.Status.Imbue.Delivered')}`;
    } else {
      el.textContent = game.i18n.localize('VAGABOND.Status.Imbue.Delivered');
      el.disabled = true;
    }
  }

  /**
   * Re-enables the delivery control after a failed attempt (bad permission,
   * insufficient mana) so the payload stays available for another try.
   * @param {HTMLElement} el
   * @param {boolean} isControls
   */
  static _reenable(el, isControls) {
    if (isControls) {
      const confirmBtn = el.querySelector('.vagabond-imbue-confirm-button');
      if (confirmBtn) confirmBtn.disabled = false;
    } else {
      el.disabled = false;
    }
  }

  /**
   * Click handler for the chat-card Imbue delivery control. `el` is either the
   * simple button (upfront mode) or the `.vagabond-imbue-delivery-controls`
   * container (deferred mode, `chosenState` = {damageDice, useFx} from the
   * inline stepper/checkbox at confirm time).
   * @param {HTMLElement} el
   * @param {{damageDice: number, useFx: boolean}|null} chosenState
   */
  static async deliverImbue(el, chosenState = null) {
    const isControls = el.classList.contains('vagabond-imbue-delivery-controls');
    const wielder = game.actors.get(el.dataset.actorId);
    const weapon = wielder?.items.get(el.dataset.itemId);
    const payload = weapon?.system?.imbuedSpell;

    if (!payload?.active) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Status.Imbue.AlreadyResolved'));
      el.remove();
      return;
    }

    const sourceActor = await fromUuid(payload.sourceActorUuid);
    if (!(game.user.isGM || sourceActor?.isOwner)) {
      ui.notifications.warn(
        game.i18n.format('VAGABOND.Status.Imbue.OnlyCasterOrGM', { caster: payload.sourceActorName })
      );
      this._reenable(el, isControls);
      return;
    }

    let cost, damageDice;
    if (payload.deferredPayment) {
      damageDice = chosenState?.damageDice ?? 0;
      const useFx = !!chosenState?.useFx;
      cost = this._computeDeliveryCost(damageDice, useFx);
      if (!sourceActor || sourceActor.system.mana.current < cost) {
        ui.notifications.warn(
          game.i18n.format('VAGABOND.Status.Imbue.NoMana', { caster: payload.sourceActorName })
        );
        this._reenable(el, isControls);
        return;
      }
      if (cost > sourceActor.system.mana.castingMax) {
        ui.notifications.warn(
          game.i18n.format('VAGABOND.Status.Imbue.ExceedsCastingMax', { max: sourceActor.system.mana.castingMax })
        );
        this._reenable(el, isControls);
        return;
      }
    } else {
      damageDice = payload.damageDice;
      cost = payload.deferredMana || 1;
      if (!sourceActor || sourceActor.system.mana.current < cost) {
        ui.notifications.warn(
          game.i18n.format('VAGABOND.Status.Imbue.NoMana', { caster: payload.sourceActorName })
        );
        this._reenable(el, isControls);
        return;
      }
    }

    const spell = await fromUuid(payload.spellUuid);
    if (!spell) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Status.Imbue.SpellGone'));
      await this.clearImbue(weapon);
      this._markDelivered(el, isControls);
      return;
    }

    await sourceActor.update({ 'system.mana.current': sourceActor.system.mana.current - cost });

    const isCritical = el.dataset.attackCritical === 'true';
    let hitTargets = [];
    try {
      hitTargets = JSON.parse(el.dataset.targets || '[]');
    } catch {
      hitTargets = [];
    }

    const { VagabondDamageHelper } = await import('./damage-helper.mjs');
    const { VagabondChatCard } = await import('./chat-card.mjs');

    const manaSkill = payload.manaSkillKey ? sourceActor.system.skills[payload.manaSkillKey] : null;
    const manaSkillStat = manaSkill?.stat || 'reason';

    const damageRoll =
      spell.system.damageType !== '-' && damageDice > 0
        ? await VagabondDamageHelper.rollSpellDamage(
            sourceActor,
            spell,
            { damageDice },
            isCritical,
            manaSkillStat,
            hitTargets
          )
        : null;

    const critStatBonus = isCritical && manaSkill?.stat
      ? sourceActor.getRollData().stats?.[manaSkill.stat]?.value || 0
      : 0;

    const critText = isCritical && spell.system.crit ? spell.system.formatDescription(spell.system.crit) : null;

    const result = await VagabondChatCard.createActionCard({
      actor: sourceActor,
      item: spell,
      title: `${spell.name} (Imbue Delivery)`,
      subtitle: sourceActor.name,
      rollData: { isCritical, isHit: true, manaSkill, critStatBonus },
      damageRoll,
      damageType: spell.system.damageType,
      description: spell.system.formatDescription(spell.system.description),
      crit: critText,
      hasDefenses: true,
      attackType: CONFIG.VAGABOND.spellDeliveryAttackTypes.imbue,
      targetsAtRollTime: hitTargets,
    });

    if (isCritical && !critStatBonus) {
      await VagabondChatCard._grantLuckOnCrit(sourceActor, result, 'Critical Cast (Imbue)');
    }

    await this.clearImbue(weapon);
    this._markDelivered(el, isControls);
  }

  /**
   * `updateCombat` hook body: clears non-focused imbue payloads once turn order
   * cycles back to the caster's next turn.
   * @param {Combat} combat
   */
  static async checkTurnExpiry(combat) {
    const active = combat.combatant;
    if (!active) return;

    const actorSet = new Map();
    for (const a of game.actors.contents) actorSet.set(a.uuid, a);
    for (const c of combat.combatants) {
      if (c.actor) actorSet.set(c.actor.uuid, c.actor);
    }

    for (const actor of actorSet.values()) {
      const weapons = actor.items.filter(
        (i) => EquipmentHelper.isWeapon(i) && i.system.imbuedSpell?.active
      );
      for (const weapon of weapons) {
        const payload = weapon.system.imbuedSpell;
        if (payload.castCombatId !== combat.id) continue;
        if (payload.casterCombatantId !== active.id) continue;

        const sourceActor = await fromUuid(payload.sourceActorUuid);
        const isFocusing = sourceActor?.system?.focus?.spellIds?.includes(payload.focusSpellId);
        if (isFocusing) continue;

        await this.clearImbue(weapon);
      }
    }
  }
}
