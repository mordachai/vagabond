import { TargetHelper } from './target-helper.mjs';
import { GMRelay } from './gm-relay.mjs';

/**
 * Ward upcast (`system.wardUpcast`) — Ward: "When the Target takes damage from an attack or Cast, you can upcast
 * this Spell to make a Cast Check to reduce the damage taken by 1d6 per Mana spent on the upcast if you pass."
 *
 * Flow (chat only, no dialogs): Damage card → Ward card → Ward roll → the Target's result card with everything.
 * 1. Damage card: one Ward button per warding caster of each Target (`createRow`; a Target carries an effect
 *    stamped `flags.vagabond.spellTracker = {casterUuid, spellId}` of a Ward-upcast Spell).
 * 2. Click (caster's owner / GM) → Ward card (`openPrompt`): row of Mana stars (1 … min(Mana, casting max)),
 *    click a star to pick, then Ward Off!.
 * 3. Ward Off! (`wardOff`) → Mana spent → caster's Cast Check → pass = (Mana)d6. The Ward card is replaced by the
 *    roll card, flagged `flags.vagabond.ward = {state: 'resolved', damageMessageId, defenderUuid, amount, …}`.
 * 4. The Target's Save / Defense / Apply Direct reads `reductionFor(damageMessageId, defenderUuid)` and takes the
 *    Ward off the incoming damage BEFORE Armor (user ruling: Armor is spared) — one card shows it all.
 * Late Ward (the Target resolved first): result cards carry `flags.vagabond.damageResult`; Ward Off recomputes
 * from it, restores the HP difference (or carries a new Apply button) and shows the full calculation.
 *
 * Dependency rule: damage-helper imports this file statically, so everything heavy here is a dynamic import.
 */
export class WardHelper {

  static #esc(s) { return foundry.utils.escapeHTML(String(s ?? '')); }
  static #L(key, data) { return data ? game.i18n.format(`VAGABOND.Ward.${key}`, data) : game.i18n.localize(`VAGABOND.Ward.${key}`); }

  /** `[{caster, spell}]` warding `defender` (one per caster + Spell). */
  static wardsOn(defender) {
    const out = [];
    const seen = new Set();
    for (const effect of defender?.effects ?? []) {
      const src = effect.flags?.vagabond?.spellTracker;
      if (!src?.casterUuid || !src.spellId || effect.disabled) continue;
      const key = `${src.casterUuid}|${src.spellId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const caster = TargetHelper.resolveActorRef(src.casterUuid);
      const spell = caster?.items?.get(src.spellId);
      if (spell?.system?.wardUpcast) out.push({ caster, spell });
    }
    return out;
  }

  /** The chat message id a button sits in. */
  static messageIdOf(button) {
    return button?.closest?.('[data-message-id]')?.dataset.messageId ?? null;
  }

  /** Resolved Ward messages for a damage message + Target. */
  static #resolved(damageMessageId, defenderUuid) {
    if (!damageMessageId) return [];
    return game.messages.contents.filter(m => {
      const w = m.flags?.vagabond?.ward;
      return w?.state === 'resolved' && w.damageMessageId === damageMessageId && w.defenderUuid === defenderUuid;
    });
  }

  /**
   * Ward rolled against a damage message for one Target: `{amount, title}` (amount 0 = none).
   * @param {string|null} damageMessageId
   * @param {string} defenderUuid
   */
  static reductionFor(damageMessageId, defenderUuid) {
    const wards = this.#resolved(damageMessageId, defenderUuid).map(m => m.flags.vagabond.ward).filter(w => w.amount > 0);
    const amount = wards.reduce((n, w) => n + w.amount, 0);
    const title = wards.map(w => `${w.spellName} (${w.casterName}): ${w.formula} = ${w.amount}`).join(' + ');
    return { amount, title };
  }

  /**
   * Ward buttons for a damage card: one per warding caster of each Target ('' when none).
   * @param {Array<Object>} targetsAtRollTime
   * @param {number} damageAmount
   * @param {string} damageType
   */
  static createRow(targetsAtRollTime, damageAmount, damageType) {
    if (!targetsAtRollTime?.length || !(damageAmount > 0)) return '';
    const buttons = [];
    for (const target of TargetHelper.resolveTargets(targetsAtRollTime)) {
      const defender = target?.actor;
      if (!defender) continue;
      for (const { caster, spell } of this.wardsOn(defender)) {
        buttons.push(`
          <button type="button" class="vagabond-ward-button"
            title="${this.#esc(this.#L('Hint', { name: caster.name, spell: spell.name, target: defender.name }))}"
            data-caster-uuid="${caster.uuid}" data-spell-id="${spell.id}" data-defender-uuid="${defender.uuid}"
            data-damage-amount="${damageAmount}" data-damage-type="${damageType}">
            <i class="fa-solid fa-shield-halved"></i> ${this.#esc(this.#L('Button', { target: defender.name }))}
          </button>`);
      }
    }
    return buttons.length ? `<div class="protect-buttons-row ward-buttons-row">${buttons.join('')}</div>` : '';
  }

  /** Caster, Spell and Target of a Ward button / card. */
  static #parties(data) {
    const caster = TargetHelper.resolveActorRef(data.casterUuid);
    const defender = TargetHelper.resolveActorRef(data.defenderUuid);
    const spell = caster?.items?.get(data.spellId);
    return { caster, defender, spell };
  }

  /** Most Mana the caster can upcast with right now. */
  static #maxMana(caster) {
    const now = caster.system.mana?.current ?? 0;
    return Math.max(0, Math.min(now, caster.system.mana?.castingMax ?? now));
  }

  /** Damage card Ward button → post the Ward card (Mana stars + Ward Off!). */
  static async openPrompt(button) {
    const { caster, defender, spell } = this.#parties(button.dataset);
    if (!caster || !defender || !spell) return;
    if (!caster.isOwner && !game.user.isGM) {
      ui.notifications.warn(game.i18n.format('VAGABOND.Defense.NotYours', { name: caster.name }));
      return;
    }
    const max = this.#maxMana(caster);
    if (max < 1 || !caster.system.classData?.manaSkill) {
      ui.notifications.warn(this.#L('NoMana', { name: caster.name }));
      return;
    }
    const damageMessageId = this.messageIdOf(button);
    const already = game.messages.contents.find(m => {
      const w = m.flags?.vagabond?.ward;
      return w && w.damageMessageId === damageMessageId && w.defenderUuid === defender.uuid && w.casterUuid === caster.uuid;
    });
    if (already) {
      ui.notifications.info(this.#L(already.flags.vagabond.ward.state === 'resolved' ? 'AlreadyRolled' : 'AlreadyOpen', { target: defender.name }));
      return;
    }

    const amount = parseInt(button.dataset.damageAmount) || 0;
    const damageType = button.dataset.damageType;
    const typeLabel = damageType && damageType !== '-'
      ? game.i18n.localize(CONFIG.VAGABOND.damageTypes?.[damageType] ?? damageType) : '';
    const pips = Array.from({ length: max }, (_, i) => `
        <button type="button" class="ward-mana-pip${i === 0 ? ' is-on' : ''}" data-value="${i + 1}" title="${i + 1} Mana">
          <i class="fas fa-star-christmas"></i>
        </button>`).join('');
    const description = `
      <div class="ward-prompt" data-selected="1">
        <p class="ward-incoming">${this.#esc(this.#L('Incoming', { target: defender.name, amount, type: typeLabel }))}</p>
        <div class="ward-mana-pips">${pips}</div>
        <div class="ward-dice"><span class="ward-dice-count">1</span>d6</div>
        <div class="protect-buttons-row">
          <button type="button" class="vagabond-ward-off-button"><i class="fa-solid fa-shield-halved"></i> ${this.#esc(this.#L('WardOff'))}</button>
        </div>
      </div>`;

    const { VagabondChatCard } = await import('./chat-card.mjs');
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(caster)
      .setTitle(this.#L('Title', { target: defender.name }))
      .setSubtitle(`${spell.name} · ${caster.name}`)
      .setDescription(description);
    card.data.icon = spell.img;
    await ChatMessage.create({
      content: await card.render(),
      speaker: ChatMessage.getSpeaker({ actor: caster }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      flags: { vagabond: { ward: {
        state: 'pending', damageMessageId, casterUuid: caster.uuid, spellId: spell.id, defenderUuid: defender.uuid,
        damageAmount: amount, damageType,
      } } },
    });
  }

  /** A Mana star on a Ward card: light the stars up to it. */
  static pickPip(pip) {
    const root = pip.closest('.ward-prompt');
    if (!root) return;
    const value = parseInt(pip.dataset.value) || 1;
    root.dataset.selected = String(value);
    root.querySelectorAll('.ward-mana-pip').forEach(p => p.classList.toggle('is-on', (parseInt(p.dataset.value) || 0) <= value));
    const count = root.querySelector('.ward-dice-count');
    if (count) count.textContent = String(value);
  }

  /** The caster's Cast Check for the upcast. null = no Cast Skill. */
  static async #castCheck(caster, spell, event) {
    const skillKey = caster.system.classData?.manaSkill;
    const skill = skillKey ? caster.system.skills?.[skillKey] : null;
    if (!skill) return null;
    const { VagabondRollBuilder } = await import('./roll-builder.mjs');
    const rollData = caster.getRollDataWithItemEffects(spell);
    const favorHinder = VagabondRollBuilder.mergeFavorHinder(
      VagabondRollBuilder.calculateEffectiveFavorHinder(caster.system.favorHinder || 'none', !!event?.shiftKey, !!event?.ctrlKey),
      VagabondRollBuilder.checkFavorVote(caster, 'cast'),
    );
    const roll = await VagabondRollBuilder.buildAndEvaluateD20WithRollData(rollData, favorHinder);
    const d20 = roll.terms.find(t => t.faces === 20)?.results?.[0]?.result ?? 0;
    const autoFail = VagabondRollBuilder.autoFails(caster, skillKey);
    return {
      roll,
      difficulty: skill.difficulty,
      isSuccess: !autoFail && roll.total >= skill.difficulty,
      isCritical: !autoFail && d20 >= VagabondRollBuilder.calculateCritThreshold(rollData, 'spell'),
    };
  }

  /** The Target's result card for that damage message, if it resolved before the Ward. */
  static #lateResult(damageMessageId, defenderUuid) {
    return game.messages.contents.findLast(m => {
      const r = m.flags?.vagabond?.damageResult;
      return r && r.damageMessageId === damageMessageId && r.defenderUuid === defenderUuid;
    }) ?? null;
  }

  /** Ward Off! on a Ward card: Mana → Cast Check → (Mana)d6, then the roll card replaces the Ward card. */
  static async wardOff(button, event = null) {
    const message = game.messages.get(this.messageIdOf(button));
    const flag = message?.flags?.vagabond?.ward;
    if (!flag || flag.state !== 'pending') return;
    const { caster, defender, spell } = this.#parties(flag);
    if (!caster || !defender || !spell) return;
    if (this.#resolved(flag.damageMessageId, defender.uuid).some(m => m.flags.vagabond.ward.casterUuid === caster.uuid)) {
      ui.notifications.info(this.#L('AlreadyRolled', { target: defender.name }));
      return;
    }
    if (!caster.isOwner && !game.user.isGM) {
      ui.notifications.warn(game.i18n.format('VAGABOND.Defense.NotYours', { name: caster.name }));
      return;
    }
    const picked = parseInt(button.closest('.ward-prompt')?.dataset.selected) || 1;
    const mana = Math.min(picked, this.#maxMana(caster));
    if (mana < 1) {
      ui.notifications.warn(this.#L('NoMana', { name: caster.name }));
      return;
    }
    button.disabled = true;

    // The upcast's Mana is spent whatever the Check
    await caster.update({ 'system.mana.current': Math.max(0, (caster.system.mana?.current ?? 0) - mana) });
    const check = await this.#castCheck(caster, spell, event);
    if (!check) return;
    let wardRoll = null;
    if (check.isSuccess) {
      wardRoll = new Roll(`${mana}d6`);
      await wardRoll.evaluate();
    }
    const amount = wardRoll?.total ?? 0;
    const formula = `${mana}d6`;

    const { VagabondDamageHelper } = await import('./damage-helper.mjs');
    const lines = [];
    let calcHtml = '';
    let applyButton = '';
    const late = check.isSuccess ? this.#lateResult(flag.damageMessageId, defender.uuid) : null;

    if (late) {
      // The Target already resolved this damage: recompute with the Ward before Armor
      const r = late.flags.vagabond.damageResult;
      const wardTotal = (r.wardAmount || 0) + amount;
      const sourceActor = TargetHelper.resolveActorRef(r.sourceActorId);
      const sourceItem = VagabondDamageHelper._resolveSourceItem(sourceActor, r.sourceItemId);
      const breakdown = VagabondDamageHelper.calculateFinalDamageDetailed(
        defender, Math.max(0, r.incoming - wardTotal), r.damageType, sourceItem,
        { attackerActor: sourceActor, isCrit: !!r.attackWasCrit }
      );
      const finalDamage = breakdown.final + (r.weakExtra || 0);
      const saved = Math.max(0, r.priorFinal - finalDamage);
      if (r.autoApplied && saved > 0) {
        const hp = defender.system.health?.value || 0;
        const newHp = Math.min(defender.system.health?.max ?? hp + saved, hp + saved);
        if (defender.isOwner || game.user.isGM) {
          await defender.update({ 'system.health.value': newHp });
        } else {
          GMRelay.send('vagabond.applyDamage', { actorUuid: defender.uuid, newHp });
        }
      }
      calcHtml = VagabondDamageHelper._buildDamageCalculation(
        r.incoming, 0, breakdown.armorReduction, finalDamage, r.damageType, 'reflex', defender,
        false, false, breakdown.path, 0,
        { title: this.#L('Label'), wardReduction: Math.min(wardTotal, r.incoming), wardTitle: `${spell.name}: ${formula} = ${amount}` }
      );
      if (r.autoApplied) lines.push(this.#L('Restored', { target: defender.name, amount: saved }));
      else {
        lines.push(this.#L('ReplacesApply'));
        if (finalDamage > 0) applyButton = VagabondDamageHelper.createApplySaveDamageButton(defender.uuid, defender.name, finalDamage, r.damageType, null);
      }
    } else if (check.isSuccess) {
      lines.push(this.#L('Pending', { target: defender.name }));
    } else {
      lines.push(this.#L('Failed'));
    }

    const wardLine = check.isSuccess ? `
      <div class="ward-result">
        <span class="ward-result-mana"><i class="fas fa-star-christmas"></i> ${mana}</span>
        <span class="ward-result-formula">${formula}</span>
        <span class="ward-result-total"><i class="fa-solid fa-shield-halved"></i> -${amount}</span>
      </div>` : '';

    const { VagabondChatCard } = await import('./chat-card.mjs');
    const card = new VagabondChatCard()
      .setType('save-roll')
      .setActor(caster)
      .setTitle(this.#L('Title', { target: defender.name }))
      .setSubtitle(`${spell.name} · ${caster.name}`)
      .addRoll(check.roll, check.difficulty)
      .setOutcome(check.isSuccess ? 'PASS' : 'FAIL', check.isCritical);
    card.setDescription((card.data.description || '') + wardLine + calcHtml + applyButton
      + lines.map(l => `<p class="defense-note">${this.#esc(l)}</p>`).join(''));
    const result = await ChatMessage.create({
      content: await card.render(),
      speaker: ChatMessage.getSpeaker({ actor: caster }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      rolls: wardRoll ? [check.roll, wardRoll] : [check.roll],
      flags: { vagabond: { ward: {
        ...flag, state: 'resolved', mana, formula, amount, passed: check.isSuccess, late: !!late,
        casterName: caster.name, spellName: spell.name,
      } } },
    });
    if (message.isOwner) await message.delete();
    if (check.isCritical) await VagabondChatCard._grantLuckOnCrit(caster, result, 'Critical');
  }
}
