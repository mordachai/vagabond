import { VagabondChatCard } from './chat-card.mjs';
import { CountdownDice } from '../documents/countdown-dice.mjs';
import { StatusHelper } from './status-helper.mjs';
import { effectDisplayImg, resolveEffectDescription } from './effects.mjs';

/**
 * Small notice cards: Luck spent, Studied dice, class feature notices, countdown dice rolls,
 * status results and status effect cards. Built on the VagabondChatCard builder.
 */
export class NoticeChatCards {
  /**
   * Create a chat card for countdown dice rolls
   * @param {JournalEntry} dice - The countdown dice journal entry
   * @param {Roll} roll - The dice roll
   * @param {number} rollResult - The roll result
   * @param {string} status - Status: 'continues', 'reduced', or 'ended'
   * @param {string} currentDiceType - Current dice type (e.g., 'd20')
   * @param {string} newDiceType - New dice type (for 'reduced' status)
   * @returns {Promise<ChatMessage>}
   */
  static async countdownDiceRoll(dice, roll, rollResult, status, currentDiceType, newDiceType = null, tickData = null) {
    const flags = dice.flags.vagabond.countdownDice;

    // Determine status message and state
    let statusMessage;
    let statusClass;
    let stateMessage;
    const bang = flags.exploding ? '!' : ''; // "Cd4!" Exploding die

    if (status === 'continues') {
      statusMessage = game.i18n.localize('VAGABOND.CountdownDice.Chat.Continues');
      statusClass = 'continues';
      stateMessage = `${currentDiceType}${bang} remains`;
    } else if (status === 'reduced') {
      statusMessage = game.i18n.localize('VAGABOND.CountdownDice.Chat.Reduced');
      statusClass = 'reduced';
      stateMessage = `${currentDiceType}${bang} → ${newDiceType}${bang}`;
    } else if (status === 'ended') {
      statusMessage = game.i18n.localize('VAGABOND.CountdownDice.Chat.Ended');
      statusClass = 'ended';
      stateMessage = `${currentDiceType}${bang} countdown complete`;
    }

    // Build description: countdown state + status + optional tick target note
    let description = `
      <p><strong>${game.i18n.localize('VAGABOND.CountdownDice.Chat.CurrentState')}:</strong> ${stateMessage}</p>
      <p class="status-message ${statusClass}">${statusMessage}</p>
    `;

    if (tickData) {
      description += `<p class="tick-target-note"><i class="fas fa-circle-dot"></i> ${tickData.statusLabel} — ${tickData.actorName}</p>`;
    }

    // If this countdown ending recharges an NPC action, append the recharge note inline
    if (status === 'ended' && flags.linkedRechargeActorUuid) {
      try {
        const actor = await fromUuid(flags.linkedRechargeActorUuid);
        const action = actor?.system?.actions?.[flags.linkedRechargeActionIndex];
        if (action?.name) {
          description += `<p><i class="fas fa-sync-alt"></i> <strong>${action.name}</strong> has recharged!</p>`;
        }
      } catch(e) { /* actor may be unavailable */ }
    }

    // Get dice image path for icon
    const diceImagePath = CountdownDice.getDiceImagePath(currentDiceType);

    // Build tags for dice type and result
    const tags = [
      { label: `${currentDiceType}${bang}`, cssClass: 'tag-dice-type' },
      { label: `Result: ${rollResult}`, cssClass: 'tag-result' }
    ];

    // Create chat card using unified system
    const card = new VagabondChatCard();
    card.data.icon = diceImagePath;
    card.data.title = flags.name;
    card.data.subtitle = 'Countdown Dice';
    card.data.standardTags = tags;
    card.data.description = description;
    card.data.roll = roll;
    card.data.hasRoll = false; // Don't show roll header section
    card.data.type = 'countdown-dice';
    card.data.alias = game.user.name;

    // Recharge dice: whisper to GM and suppress the roll display (clean notification style)
    if (flags.linkedRechargeActorUuid) {
      card.data.roll = null;
      card.data.hasRoll = false;
      const revealRecharge = game.settings.get('vagabond', 'revealNpcRecharge');
      if (!revealRecharge) card.data.whisper = game.users.filter(u => u.isGM).map(u => u.id);
    }

    // Use the standard damage section for tick damage
    if (tickData) {
      card.addDamage(tickData.roll, tickData.damageTypeLabel, false, tickData.damageTypeKey);
      // Override total with post-resistance finalDamage (may differ from roll.total)
      card.data.damage.total = tickData.finalDamage;

      // If auto-apply is off, show an apply button so the GM can manually apply
      if (!tickData.autoApplied && tickData.finalDamage > 0) {
        card.addFooterAction(`
          <button class="vagabond-tick-damage-button"
            data-actor-uuid="${tickData.actorUuid}"
            data-damage-amount="${tickData.finalDamage}">
            <i class="fas fa-heart-crack"></i>
            ${game.i18n.format('VAGABOND.Status.ApplyTickDamage', { amount: tickData.finalDamage, actor: tickData.actorName })}
          </button>`);
      }
    }

    return await card.send();
  }

  /**
   * Post a chat card showing on-hit status effect outcomes.
   * @param {Array}  results     - Array from StatusHelper.processCausedStatuses
   * @param {Actor}  targetActor - The actor the statuses were applied to
   * @param {string} sourceName  - Name of the source item/action
   * @returns {Promise<ChatMessage|null>}
   */
  static async statusResults(results, targetActor, sourceName = '', sourceIcon = null) {
    const statusHtml = StatusHelper.buildStatusResultsHtml(results, targetActor.name);
    if (!statusHtml) return null;

    const card = new VagabondChatCard();
    card.data.title = sourceName || game.i18n.localize('VAGABOND.Status.OnHitEffects');
    card.data.subtitle = targetActor.name;
    card.data.description = statusHtml;
    card.data.type = 'status-results';
    card.data.alias = targetActor.name;
    const firstStatusId = results.find(r => r.statusId)?.statusId;
    const statusIcon = firstStatusId ? CONFIG.VAGABOND?.statusConditionIcons?.[firstStatusId] : null;
    card.data.icon = sourceIcon || statusIcon || targetActor.img;
    if (card.data.icon?.endsWith('.svg')) card.data.iconBackground = '#000000';
    return await card.send();
  }

  /**
   * Create a chat card for spending luck
   * @param {VagabondActor} actor - The actor spending luck
   * @param {number} newLuck - New luck value after spending
   * @returns {Promise<ChatMessage>}
   */
  static async luckSpend(actor, newLuck) {
    const luckTerm = CONFIG.VAGABOND.homebrew?.terms?.luckTerm || 'Luck';
    const poolTerm = CONFIG.VAGABOND.homebrew?.terms?.poolTerm || 'Pool';
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle(`${luckTerm} Spent`)
      .setSubtitle(actor.name)
      .setDescription(`
        <p><i class="fas fa-clover"></i> <strong>${actor.name}</strong> spends a ${luckTerm} point.</p>
        <p><strong>Advantage:</strong> Grant Favor on a d20 roll.</p>
        <p><strong>Fluke:</strong> Reroll an unresolved die you rolled.</p>
      `);

    card.data.metadata = [{
      label: `Remaining ${luckTerm}`,
      value: `${newLuck}`
    }];

    card.addFooterAction(`
      <div class="defend-info-box variant-rule-box">
        <div class="defend-header">
          <i class="fas fa-dice-d6"></i>
          <span>Plot Armor (Variant Rule)</span>
          <i class="fas fa-chevron-down expand-icon"></i>
        </div>
        <div class="defend-content">
          <p>Once per Round, if you are reduced to <strong>0 HP</strong>, you can spend <strong>1 ${luckTerm}</strong> to regain <strong>d6 HP</strong>.</p>
        </div>
      </div>
    `);

    return await card.send();
  }

  /**
   * Standard card for the outcome of a class feature / trait / perk action (Virtuoso, …).
   * Same generic layout as every other system card: actor portrait, title, subtitle, and a
   * description — put the BOOK text of what was gained in `description` so the table sees it.
   * @param {VagabondActor} actor - The actor using the feature
   * @param {Object} opts
   * @param {string} opts.title - Card title (e.g. "Virtuoso: Valor")
   * @param {string} [opts.subtitle] - Defaults to the actor's name
   * @param {string} opts.description - HTML body
   * @param {string} [opts.icon] - Icon override (defaults to the actor portrait)
   * @returns {Promise<ChatMessage>}
   */
  static async featureCard(actor, { title, subtitle, description, icon = null }) {
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle(title)
      .setSubtitle(subtitle ?? actor.name)
      .setDescription(description);
    if (icon) card.data.icon = icon;
    return await card.send();
  }

  /**
   * Create a chat card for spending a studied die
   * @param {VagabondActor} actor - The actor spending the die
   * @param {Roll} roll - The d6 roll
   * @param {number} remainingDice - Remaining studied dice
   * @returns {Promise<ChatMessage>}
   */
  static async studiedDieSpend(actor, roll, remainingDice) {
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle('Studied Die Used')
      .setSubtitle(actor.name)
      .addRoll(roll)
      .setDescription(`
        <p><i class="fas fa-dice-d6"></i> <strong>${actor.name}</strong> uses a Studied Die and rolls <strong>${roll.total}</strong>.</p>
        <p><strong>Remaining Studied Dice:</strong> ${remainingDice}</p>
      `);

    return await card.send();
  }

  /**
   * Create a chat card for adding a studied die
   * @param {VagabondActor} actor - The actor gaining the die
   * @param {number} newCount - New studied dice count
   * @returns {Promise<ChatMessage>}
   */
  static async studiedDieGain(actor, newCount) {
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle('Studied Die Gained')
      .setSubtitle(actor.name)
      .setDescription(`
        <p><i class="fas fa-dice-d6"></i> <strong>${actor.name}</strong> gains a Studied Die.</p>
        <p><strong>Total Studied Dice:</strong> ${newCount}</p>
      `);

    return await card.send();
  }

  /**
   * Post status effect information to chat
   * @param {VagabondActor} actor - The actor with the status effect
   * @param {ActiveEffect} effect - The status effect
   * @returns {Promise<ChatMessage>}
   */
  static async statusEffect(actor, effect) {
    // Get status name and description
    const statusName = effect.name || effect.label || 'Unknown Status';
    const statusIcon = effectDisplayImg(effect) || 'icons/svg/aura.svg';

    // Description resolution (flank text > localized StatusConditionDescriptions > effect > CONFIG)
    // is shared with the actor-sheet effects list; a trailing "[automation]" note is split out.
    const { description: cleanDescription, automation: automationStatus } = resolveEffectDescription(effect);

    // Build description HTML (without brackets)
    let descriptionHTML = `<div class="status-effect-info">`;

    if (cleanDescription) {
      // Item descriptions are already HTML blocks — don't nest them in another <p>
      descriptionHTML += /^\s*</.test(cleanDescription) ? cleanDescription : `<p>${cleanDescription}</p>`;
    } else {
      descriptionHTML += `<p><em>No description available.</em></p>`;
    }

    descriptionHTML += `</div>`;

    // Prepare metadata array
    const metadata = [];
    // Spell Tracker / Cure-Hymn immunity: who cast which Spell (kept out of the rule text)
    const tracker = effect.flags?.vagabond?.spellTracker;
    if (tracker?.casterName || tracker?.spellName) {
      metadata.push({
        value: game.i18n.format('VAGABOND.SpellTracker.By', { name: tracker.casterName ?? '', spell: tracker.spellName ?? '' })
      });
    }
    if (automationStatus) {
      metadata.push({
        value: automationStatus
        // No label - just show the automation status text
      });
    }

    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle(statusName)
      .setSubtitle(actor.name)
      .setDescription(descriptionHTML)
      .setIconBackground('black'); // Add black background for status icons

    // Add metadata
    card.data.metadata = metadata;

    // Override icon with status icon
    card.data.icon = statusIcon;

    return await card.send();
  }
}
