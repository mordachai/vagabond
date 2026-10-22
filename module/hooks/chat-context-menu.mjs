import { VagabondChatCard } from '../helpers/chat-card.mjs';
import { VagabondDamageHelper } from '../helpers/damage-helper.mjs';
import { HunterHelper } from '../helpers/hunter-helper.mjs';
import { MacroAutoRun } from '../helpers/macro-autorun.mjs';
import { VagabondRollBuilder } from '../helpers/roll-builder.mjs';
import { TargetHelper } from '../helpers/target-helper.mjs';

/**
 * Chat message context menu: Luck reroll (Fluke) and Force Critical.
 * Moved out of vagabond.mjs; called once at module load, in the original order.
 */
export function registerChatContextMenu() {
  /* -------------------------------------------- */
  /*  Chat Message Context Menu - Luck Reroll     */
  /* -------------------------------------------- */

  /**
   * Luck Reroll (Fluke) context menu entry definition.
   * Shared between hook and prototype override approaches.
   */
  const FLUKE_REROLL_ENTRY = {
    label: 'Luck Reroll (Fluke)',
    icon: '<i class="fas fa-clover"></i>',
    classes: '',
    visible: function (li) {
      const messageId = li.dataset.messageId;
      const message = game.messages.get(messageId);
      if (!message?.flags?.vagabond?.rerollData) return false;
      const actor = TargetHelper.resolveActorRef(message.flags.vagabond.actorId);
      if (!actor || !actor.isOwner) return false;
      // Dynamically update label and classes based on current luck
      const currentLuck = actor.system.currentLuck || 0;
      const flukeLabel = game.i18n.localize('VAGABOND.UI.Chat.FlukeReroll');
      const lt = CONFIG.VAGABOND.homebrew?.terms?.luckTerm || 'Luck';
      const pt = CONFIG.VAGABOND.homebrew?.terms?.poolTerm || 'Pool';
      const luckLabel = `${lt} ${pt}`;
      if (currentLuck > 0) {
        FLUKE_REROLL_ENTRY.label = `${flukeLabel} (${luckLabel}: ${currentLuck})`;
        FLUKE_REROLL_ENTRY.classes = '';
      } else {
        FLUKE_REROLL_ENTRY.label = `${flukeLabel} (${luckLabel}: 0)`;
        FLUKE_REROLL_ENTRY.classes = 'vagabond-disabled';
      }
      return true;
    },
    onClick: async (event, li) => {
      const messageId = li.dataset.messageId;
      const message = game.messages.get(messageId);
      const flags = message.flags.vagabond;
      const actor = TargetHelper.resolveActorRef(flags.actorId);
      const rerollData = flags.rerollData;

      if (!actor || !rerollData) return;

      // Deduct luck
      const currentLuck = actor.system.currentLuck || 0;
      if (currentLuck <= 0) {
        const luckTermWarn = CONFIG.VAGABOND.homebrew?.terms?.luckTerm || 'Luck';
        ui.notifications.warn(`${actor.name} has no ${luckTermWarn} points remaining.`);
        return;
      }
      const luckTerm = CONFIG.VAGABOND.homebrew?.terms?.luckTerm || 'Luck';
      const newLuck = currentLuck - 1;
      await actor.update({ 'system.currentLuck': newLuck });

      // Post fluke notification
      const notifCard = new VagabondChatCard()
        .setType('generic')
        .setActor(actor)
        .setTitle('Fluke!')
        .setSubtitle(actor.name)
        .setDescription(`<p><i class="fas fa-clover"></i> <strong>${actor.name}</strong> spends a ${luckTerm} point to reroll.</p>`);
      notifCard.data.metadata = [{ label: `Remaining ${luckTerm}`, value: `${newLuck}` }];
      await notifCard.send();

      // Detect favor/hinder from the stored formula
      const favorHinder = rerollData.formula.includes('[favored]') ? 'favor'
        : rerollData.formula.includes('[hindered]') ? 'hinder' : 'none';

      // Import helpers
      const { VagabondRollBuilder } = await import('../helpers/roll-builder.mjs');

      // Re-evaluate the roll with the same formula
      const roll = await VagabondRollBuilder.evaluateRoll(rerollData.formula, actor, favorHinder);

      // Determine success
      const isSuccess = roll.total >= rerollData.difficulty;

      // Route based on reroll type
      if (rerollData.type === 'attack') {
        // Weapon attack reroll - reconstruct full attack card
        // Consumed items (thrown alchemical, last dagger) fall back to the card's snapshot
        const weapon = VagabondDamageHelper._resolveSourceItem(actor, rerollData.itemId);
        if (!weapon) {
          ui.notifications.error('Weapon not found.');
          return;
        }
        const weaponSkillKey = rerollData.weaponSkillKey;
        const weaponSkill = actor.system.skills?.[weaponSkillKey];
        const critType = VagabondRollBuilder.isWeaponSkillKey(weaponSkillKey) ? weaponSkillKey : null;
        const rerollTarget = TargetHelper.resolveTargets(flags.targetsAtRollTime || [])[0]?.actor ?? null;
        const critNumber = VagabondRollBuilder.calculateCritThreshold(
          actor.getRollDataWithItemEffects(weapon, { targets: rerollTarget ? [rerollTarget] : [] }), critType);
        const isCritical = VagabondChatCard.isRollCritical(roll, critNumber)
          || (!!rerollTarget && HunterHelper.critsByBonus(actor, rerollTarget) && roll.total >= critNumber);

        const attackResult = {
          roll,
          difficulty: rerollData.difficulty,
          weaponSkill,
          weaponSkillKey,
          thrown: !!rerollData.thrown,
          isHit: isSuccess,
          isCritical
        };

        // Roll damage if hit
        const { VagabondDamageHelper } = await import('../helpers/damage-helper.mjs');
        const targetsAtRollTime = flags.targetsAtRollTime || [];
        let damageRoll = null;
        if (VagabondDamageHelper.shouldRollDamage(isSuccess)) {
          const statKey = weaponSkill?.stat || null;
          const cleaveDie = globalThis.vagabond.utils.EquipmentHelper.cleaveDieFor(weapon, targetsAtRollTime.length);
          damageRoll = await weapon.rollDamage(actor, isCritical, statKey, targetsAtRollTime, cleaveDie, weaponSkillKey);
        }
        await VagabondChatCard.weaponAttack(actor, weapon, attackResult, damageRoll, targetsAtRollTime);

      } else if (rerollData.type === 'cast') {
        // Spell cast reroll — rebuild the whole Cast card (damage, Effect buttons, FX, Mana
        // difference) via VagabondChatCard.rerollSpellCast. Imbue / Glyph and cards from before
        // the Cast state was stored fall back to a bare check card (see rerollSpellCast docs).
        const spell = actor.items.get(rerollData.itemId);
        const delivery = String(rerollData.deliveryType ?? '').toUpperCase();
        if (spell && rerollData.damageDice !== undefined && delivery !== 'IMBUE' && delivery !== 'GLYPH') {
          await VagabondChatCard.rerollSpellCast(actor, spell, rerollData, roll, flags.targetsAtRollTime || [], message);
        } else {
          const key = rerollData.manaSkillKey || 'magic';
          await VagabondChatCard._checkRoll(actor, 'cast', key, roll, rerollData.difficulty, isSuccess);
        }

      } else {
        // Skill or save reroll
        await VagabondChatCard._checkRoll(actor, rerollData.type, rerollData.key, roll, rerollData.difficulty, isSuccess);
      }
    }
  };

  /* -------------------------------------------- */
  /*  Chat Message Context Menu - Force Critical  */
  /* -------------------------------------------- */

  /**
   * Force Critical context menu entry. GM-only.
   * Replays the existing roll as a guaranteed critical hit, re-rolling damage with the crit bonus.
   */
  const FORCE_CRIT_ENTRY = {
    label: 'Force Critical',
    icon: '<i class="fas fa-star"></i>',
    visible: (li) => {
      if (!game.user.isGM) return false;
      const message = game.messages.get(li.dataset.messageId);
      return !!message?.flags?.vagabond?.rerollData;
    },
    onClick: async (event, li) => {
      const message = game.messages.get(li.dataset.messageId);
      const flags = message.flags.vagabond;
      const actor = TargetHelper.resolveActorRef(flags.actorId);
      const rerollData = flags.rerollData;
      if (!actor || !rerollData) return;

      // Reuse the original rolls exactly — no dice are re-rolled.
      // rolls[0] = d20, rolls[1] = damage (if it was auto-rolled on the original card).
      // Convert to Array first — in Foundry V13, message.rolls may be a Collection/iterable
      // where numeric index access ([0]) returns undefined instead of the first element.
      const rolls = Array.from(message.rolls ?? []);
      const roll = rolls[0] ?? null;
      if (!roll) { ui.notifications.error('No roll found on this card.'); return; }
      const existingDamageRoll = rolls[1] ?? null;

      const targetsAtRollTime = flags.targetsAtRollTime || [];

      if (rerollData.type === 'attack') {
        const weapon = VagabondDamageHelper._resolveSourceItem(actor, rerollData.itemId);
        if (!weapon) { ui.notifications.error('Weapon not found.'); return; }

        const weaponSkillKey = rerollData.weaponSkillKey;
        const weaponSkill = actor.system.skills?.[weaponSkillKey];
        const statKey = weaponSkill?.stat || null;

        const attackResult = {
          roll,
          difficulty: rerollData.difficulty,
          weaponSkill,
          weaponSkillKey,
          thrown: !!rerollData.thrown,
          isHit: true,
          isCritical: true
        };

        // Build the crit damage roll:
        // - If damage was already rolled on the original card, carry those exact dice results
        //   over and append the crit stat bonus (Might, Dex, etc.) as a numeric term.
        //   This preserves the original rolled value (e.g. 2 on 1d4) and adds the stat on top.
        // - If there was no prior damage roll, pass null so weaponAttack handles it normally.
        let critDamageRoll = existingDamageRoll;
        if (existingDamageRoll && statKey) {
          const statValue = actor.system.stats[statKey]?.value || 0;
          if (statValue !== 0) {
            const rollJSON = existingDamageRoll.toJSON();
            const operator = statValue > 0 ? '+' : '-';
            const absValue = Math.abs(statValue);
            rollJSON.terms.push({ class: 'OperatorTerm', options: {}, evaluated: true, operator });
            rollJSON.terms.push({ class: 'NumericTerm', options: {}, evaluated: true, number: absValue });
            rollJSON.formula = `${rollJSON.formula} ${operator} ${absValue}`;
            rollJSON.total = (rollJSON.total ?? 0) + statValue;
            critDamageRoll = Roll.fromData(rollJSON);
          }
        }
        await VagabondChatCard.weaponAttack(actor, weapon, attackResult, critDamageRoll, targetsAtRollTime);

      } else if (rerollData.type === 'cast') {
        const spell = actor.items.get(rerollData.itemId);
        const manaSkillKey = rerollData.manaSkillKey || 'magic';
        const manaSkill = actor.system.skills?.[manaSkillKey] || null;

        const entityLabel = manaSkill?.label || manaSkillKey;
        const tags = [{ label: entityLabel, cssClass: 'tag-skill' }];
        if (manaSkill?.stat) {
          const statLabel = game.i18n.localize(CONFIG.VAGABOND.stats[manaSkill.stat]?.abbr) || manaSkill.stat;
          tags.push({ label: statLabel, cssClass: 'tag-stat' });
        }

        // Include crit effect text from the spell if it has one
        let critText = null;
        if (spell?.system?.crit) {
          critText = spell.system.formatDescription
            ? spell.system.formatDescription(spell.system.crit)
            : spell.system.crit;
        }

        // Carry over the existing damage roll and append the crit stat bonus as a numeric term —
        // same approach as weapons: no dice re-rolled, just the stat value appended on top.
        let critSpellDamageRoll = existingDamageRoll;
        if (existingDamageRoll && manaSkill?.stat) {
          const statValue = actor.system.stats[manaSkill.stat]?.value || 0;
          if (statValue !== 0) {
            const rollJSON = existingDamageRoll.toJSON();
            const operator = statValue > 0 ? '+' : '-';
            const absValue = Math.abs(statValue);
            rollJSON.terms.push({ class: 'OperatorTerm', options: {}, evaluated: true, operator });
            rollJSON.terms.push({ class: 'NumericTerm', options: {}, evaluated: true, number: absValue });
            rollJSON.formula = `${rollJSON.formula} ${operator} ${absValue}`;
            rollJSON.total = (rollJSON.total ?? 0) + statValue;
            critSpellDamageRoll = Roll.fromData(rollJSON);
          }
        }

        // Spell Damage / Effect split: the original Cast state (when stored) gates the statuses,
        // and an effect-only Cast gets its Apply Effect buttons here too
        const { VagabondDamageHelper: VDHCrit } = await import('../helpers/damage-helper.mjs');
        const critSpellCast = (spell && rerollData.damageDice !== undefined)
          ? VDHCrit.spellCastContext(spell, { damageDice: rerollData.damageDice, useFx: rerollData.useFx,
              // Forced Crit: held while still Focused, unless the Spell's Crit needs no Focus
              focusHeld: (actor.system.focus?.spellIds ?? []).includes(spell.id) && !spell.system.critNoFocus })
          : null;
        const critEffectButtons = spell
          ? VDHCrit.createSpellEffectButtons(actor, spell, critSpellCast, { isCritical: true, targetsAtRollTime, attackType: 'cast' })
          : '';
        const critCastMessage = await VagabondChatCard.createActionCard({
          actor,
          item: spell || null,
          title: spell?.name || `${entityLabel} Check`,
          // isHit: true — always HIT for a forced crit, even if original roll missed
          rollData: { roll, difficulty: rerollData.difficulty, isSuccess: true, isCritical: true, isHit: true, manaSkill },
          tags,
          damageRoll: critSpellDamageRoll,
          damageType: spell?.system?.damageType,
          crit: critText,
          hasDefenses: true,
          attackType: 'cast',
          targetsAtRollTime,
          footerActions: critEffectButtons ? [critEffectButtons] : [],
          spellCast: critSpellCast,
        });
        await MacroAutoRun.inherit(message, critCastMessage);
        if (spell && rerollData.deliveryType) {
          const { VagabondDamageHelper } = await import('../helpers/damage-helper.mjs');
          await VagabondDamageHelper.playFxOrDefer(
            critCastMessage,
            { kind: 'spell', deliveryType: rerollData.deliveryType, deliveryIncrease: rerollData.deliveryIncrease ?? 0,
              spaces: rerollData.targetSpaces ?? [], castArea: rerollData.castArea ?? null },
            actor, spell, targetsAtRollTime, true
          );
        }

      } else {
        // Skill or save — carry roll over, force crit marker only (no damage involved)
        const type = rerollData.type;
        const key = rerollData.key;
        const isSuccess = roll.total >= rerollData.difficulty;

        let entity, entityLabel, title, tags;
        switch (type) {
          case 'skill':
            entity = actor.system.skills?.[key];
            entityLabel = entity?.label || key;
            title = `${entityLabel} Check`;
            tags = [{ label: entityLabel, cssClass: 'tag-skill' }];
            if (entity?.stat) {
              const statLabel = game.i18n.localize(CONFIG.VAGABOND.stats[entity.stat]?.abbr) || entity.stat;
              tags.push({ label: statLabel, cssClass: 'tag-stat' });
            }
            if (entity) tags.push({ label: entity.trained ? 'Trained' : 'Untrained', cssClass: 'tag-info' });
            break;
          case 'save':
            entity = actor.system.saves?.[key];
            entityLabel = entity?.label || key;
            title = `${entityLabel} ${game.i18n.localize('VAGABOND.Roll.SaveRoll')}`;
            tags = [{ label: entityLabel, cssClass: 'tag-skill' }];
            break;
          default:
            entity = actor.system.stats[key];
            entityLabel = game.i18n.localize(CONFIG.VAGABOND.stats[key]?.long) || key;
            title = `${entityLabel} Check`;
            tags = [
              { label: entityLabel, cssClass: 'tag-skill' },
              { label: `${entity?.value || 0}`, icon: 'fas fa-hashtag' }
            ];
        }

        await VagabondChatCard.createActionCard({
          actor,
          title,
          rollData: { roll, difficulty: rerollData.difficulty, isSuccess, isCritical: true },
          tags
        });
      }
    }
  };


  // Hook: fires when ChatLog._createContextMenu dispatches "getChatMessageContextOptions" during _onFirstRender.
  // Registered at module top level to guarantee it exists before ChatLog renders.
  Hooks.on('getChatMessageContextOptions', (app, options) => {
    options.push(FLUKE_REROLL_ENTRY);
    options.push(FORCE_CRIT_ENTRY);
  });
}
