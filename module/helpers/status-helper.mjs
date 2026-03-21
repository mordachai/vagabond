/**
 * StatusHelper — central logic for on-hit status effect application.
 *
 * Handles immunity/resistance checks, save rolls (with Favor when resisted),
 * countdown die creation with actor linking, and ongoing tick damage.
 */
export class StatusHelper {

  // ---------------------------------------------------------------------------
  // Immunity & resistance checks
  // ---------------------------------------------------------------------------

  /**
   * Returns true if the actor is fully immune to the given status.
   * Sources: actor.system.statusImmunities (NPC checkboxes or character AE-driven)
   *          + equipped armor's blockedStatuses (characters only).
   * @param {VagabondActor} actor
   * @param {string} statusId
   * @returns {boolean}
   */
  static isStatusImmune(actor, statusId) {
    if (actor.system.statusImmunities?.includes(statusId)) return true;
    if (actor.type === 'character') {
      const armor = this._getEquippedArmor(actor);
      if (armor?.system.blockedStatuses?.includes(statusId)) return true;
    }
    return false;
  }

  /**
   * Returns true if the actor has resistance to the given status.
   * Resistance means the save to resist is rolled with Favor.
   * Sources: actor.system.statusResistances (character AE-driven)
   *          + equipped armor's resistedStatuses (characters only).
   * @param {VagabondActor} actor
   * @param {string} statusId
   * @returns {boolean}
   */
  static isStatusResisted(actor, statusId) {
    if (actor.system.statusResistances?.includes(statusId)) return true;
    if (actor.type === 'character') {
      const armor = this._getEquippedArmor(actor);
      if (armor?.system.resistedStatuses?.includes(statusId)) return true;
    }
    return false;
  }

  /**
   * Returns true if the actor already has this status active.
   * @param {VagabondActor} actor
   * @param {string} statusId
   * @returns {boolean}
   */
  static actorHasStatus(actor, statusId) {
    return actor.effects.some(e => !e.disabled && e.statuses?.has(statusId));
  }

  // ---------------------------------------------------------------------------
  // Main entry point
  // ---------------------------------------------------------------------------

  /**
   * Process all causedStatuses entries from one or more sources.
   * Called after damage has been applied so damageWasBlocked is known.
   *
   * @param {VagabondActor} targetActor
   * @param {Array} causedStatuses  - Array of status entry objects from item/action/coating
   * @param {boolean} damageWasBlocked - true when calculateFinalDamage returned 0
   * @param {string} sourceName     - Display name of the source item/action (for countdown label)
   * @returns {Promise<Array>} Array of result objects { statusId, outcome, saveResult? }
   */
  static async processCausedStatuses(targetActor, causedStatuses, damageWasBlocked, sourceName = '', options = {}) {
    if (!causedStatuses?.length) return [];
    const results = [];
    for (const entry of causedStatuses) {
      if (!entry.statusId) continue;
      const result = await this.applyStatus(targetActor, entry, damageWasBlocked, sourceName, options);
      results.push({ statusId: entry.statusId, ...result });
    }
    return results;
  }

  /**
   * Apply a single status entry to an actor, running the full decision flow:
   *   requiresDamage → alreadyActive → immune → save → apply → countdown
   *
   * @param {VagabondActor} actor
   * @param {Object} entry        - causedStatuses entry
   * @param {boolean} damageWasBlocked
   * @param {string} sourceName
   * @returns {Promise<Object>} { outcome, saveResult? }
   *   outcome values: 'skipped_nodamage' | 'already_active' | 'immune' | 'resisted' | 'applied'
   */
  static async applyStatus(actor, entry, damageWasBlocked, sourceName = '', options = {}) {
    const { preRolledSave = null, skipSaveRoll = false, sourceActorName = '' } = options;

    // 1. Skip if status requires damage and damage was fully blocked
    if (entry.requiresDamage && damageWasBlocked) {
      return { outcome: 'skipped_nodamage' };
    }

    // 2. Skip if target already has this status (no re-application)
    if (this.actorHasStatus(actor, entry.statusId)) {
      return { outcome: 'already_active' };
    }

    // 3. Full immunity — status cannot be applied
    if (this.isStatusImmune(actor, entry.statusId)) {
      return { outcome: 'immune' };
    }

    // 4. Save to resist (characters only — NPCs don't roll saves)
    //    skipSaveRoll=true means Apply Direct was used — bypass all status saves.
    //    preRolledSave reuses the save roll already made by the player from the chat card button.
    //    saveType 'any' means any save the player rolls counts — preRolledSave of any type is accepted.
    if (!skipSaveRoll && actor.type === 'character' && entry.saveType && entry.saveType !== 'none') {
      const isAnySave = entry.saveType === 'any';
      const favored = this.isStatusResisted(actor, entry.statusId);
      let saveResult;
      if (preRolledSave && (preRolledSave.saveType === entry.saveType || isAnySave)) {
        // Reuse the roll the player already clicked — no extra die roll
        saveResult = {
          success: preRolledSave.success,
          roll:     preRolledSave.roll,
          total:    preRolledSave.total,
          difficulty: preRolledSave.difficulty,
          saveType: preRolledSave.saveType,
          favored,
        };
      } else {
        // For 'any', fall back to the first available save in CONFIG
        const rollEntry = isAnySave
          ? { ...entry, saveType: CONFIG.VAGABOND.homebrew?.saves?.[0]?.key ?? 'reflex' }
          : entry;
        saveResult = await this._rollStatusSave(actor, rollEntry, favored);
      }
      if (saveResult.success) {
        return { outcome: 'resisted', saveResult };
      }
    }

    // 5. Apply the status to the token
    await actor.toggleStatusEffect(entry.statusId, { active: true });

    // 6. Create a linked countdown die if a duration is set
    if (entry.duration) {
      await this._createStatusCountdown(actor, entry, sourceName, sourceActorName);
    }

    return { outcome: 'applied' };
  }

  // ---------------------------------------------------------------------------
  // Save roll
  // ---------------------------------------------------------------------------

  /**
   * Roll a save to resist a status effect.
   * Uses the actor's own derived save difficulty for the saveType.
   * If favored, roll uses Favor (d20 + 1d6[favored] per homebrew config).
   *
   * @param {VagabondActor} actor
   * @param {Object} entry  - causedStatuses entry
   * @param {boolean} favored
   * @returns {Promise<{success: boolean, roll: Roll, total: number, difficulty: number}>}
   */
  static async _rollStatusSave(actor, entry, favored) {
    const { VagabondRollBuilder } = await import('./roll-builder.mjs');

    // Determine favor/hinder: start from actor's system state, apply resistance on top
    const systemState = actor.system.favorHinder || 'none';
    let effectiveFavorHinder = VagabondRollBuilder.calculateEffectiveFavorHinder(systemState, false, false);
    if (favored) {
      // Resistance pushes toward favor (same cancellation rules as the rest of the system)
      if (effectiveFavorHinder === 'hinder') {
        effectiveFavorHinder = 'none';
      } else if (effectiveFavorHinder === 'none') {
        effectiveFavorHinder = 'favor';
      }
      // Already favored → stays favored
    }

    const formula = VagabondRollBuilder.buildD20Formula(actor, effectiveFavorHinder);
    const roll = await VagabondRollBuilder.evaluateRoll(formula, actor, effectiveFavorHinder);

    const difficulty = actor.system.saves?.[entry.saveType]?.difficulty ?? 10;

    return {
      success: roll.total >= difficulty,
      roll,
      total: roll.total,
      difficulty,
      saveType: entry.saveType,
      favored,
    };
  }

  // ---------------------------------------------------------------------------
  // Countdown die creation
  // ---------------------------------------------------------------------------

  /**
   * Create a countdown die linked to an actor's status.
   * The die is visible to GM (default ownership 0) and owned by the current user.
   * The die stores linkedActorUuid + linkedStatusId so vagabond.mjs hooks can:
   *   - Deal tick damage on every roll (vagabond.countdownDiceTick hook)
   *   - Remove the status when the die expires (deleteJournalEntry hook)
   *
   * @param {VagabondActor} actor
   * @param {Object} entry  - causedStatuses entry (duration, damageOnTick, damageType, statusId)
   * @param {string} sourceName
   */
  static async _createStatusCountdown(actor, entry, sourceName = '', sourceActorName = '') {
    // 'focusing' duration means the status lasts while the caster is focusing — no countdown die
    if (entry.duration === 'focusing') return;

    const { CountdownDice } = await import('../documents/countdown-dice.mjs');

    // 'cd4' → 'd4', 'cd20' → 'd20'
    const diceType = entry.duration.replace(/^c/i, '');

    // Build a readable name: "Sickened (Breath Attack - Granamyr)" or just the status label
    const statusLabel = game.i18n.localize(
      CONFIG.VAGABOND?.statusConditions?.[entry.statusId] ?? entry.statusId
    );
    let name;
    if (sourceName && sourceActorName) {
      name = `${statusLabel} (${sourceName} - ${sourceActorName})`;
    } else if (sourceName) {
      name = `${statusLabel} (${sourceName})`;
    } else if (sourceActorName) {
      name = `${statusLabel} (${sourceActorName})`;
    } else {
      name = statusLabel;
    }

    await CountdownDice.create({
      name,
      diceType,
      size: 'M',
      linkedActorUuid:    actor.uuid,
      linkedStatusId:     entry.statusId,
      tickDamageEnabled:  entry.tickDamageEnabled ?? false,
      tickDamageFormula:  entry.damageOnTick  ?? '',
      tickDamageType:     entry.damageType    ?? '-',
      // TODO: fatigueOnTick: entry.fatigueOnTick ?? 0, — restore when re-enabling the fatigueOnTick feature
    });
  }

  // ---------------------------------------------------------------------------
  // Tick damage (called from vagabond.mjs countdownDiceTick hook)
  // ---------------------------------------------------------------------------

  /**
   * Deal ongoing tick damage to a linked actor.
   * Respects immunities and weaknesses via calculateFinalDamage.
   * Posts result to chat.
   *
   * @param {VagabondActor} actor
   * @param {string} formula      - Damage formula (e.g. '1d4')
   * @param {string} damageType   - Damage type key (e.g. 'poison')
   * @param {string} statusId     - Status that is causing the tick (for chat label)
   * @returns {Promise<{roll: Roll, rawDamage: number, finalDamage: number}>}
   */
  /**
   * @param {number|null} dieRollResult - The countdown die roll result. Used as damage when formula is blank.
   */
  static async dealTickDamage(actor, formula, damageType, statusId = '', dieRollResult = null) {
    const hasFormula = formula && formula.trim() !== '';
    const hasDieResult = dieRollResult !== null;
    if (!hasFormula && !hasDieResult) return null;

    let roll, rawDamage;
    if (hasFormula) {
      roll = new Roll(formula);
      await roll.evaluate();
      rawDamage = roll.total;
    } else {
      // Use the countdown die roll result directly as damage
      roll = new Roll(String(dieRollResult));
      await roll.evaluate();
      rawDamage = dieRollResult;
    }

    // Tick damage bypasses armor — it's ongoing condition damage, not an attack.
    // Only check immunity (typed damage only; typeless '-' always applies).
    const normalizedType = damageType?.toLowerCase() ?? '-';
    const isImmune = normalizedType !== '-' && (
      actor.system.immunities?.includes(normalizedType) ||
      (actor.type === 'character' && (() => {
        const armor = actor.items.find(i =>
          i.type === 'equipment' && i.system.equipmentType === 'armor' && i.system.equipped
        );
        return armor?.system.immunities?.includes(normalizedType);
      })())
    );
    const finalDamage = isImmune ? 0 : rawDamage;

    const statusLabel = statusId
      ? game.i18n.localize(CONFIG.VAGABOND?.statusConditions?.[statusId] ?? statusId)
      : game.i18n.localize('VAGABOND.Status.OngoingDamage');

    const damageTypeLabel = game.i18n.localize(
      CONFIG.VAGABOND?.damageTypes?.[damageType] ?? damageType
    );

    return {
      roll, rawDamage, finalDamage,
      actorUuid: actor.uuid,
      actorName: actor.name,
      statusLabel,
      damageTypeKey: damageType,
      damageTypeLabel,
    };
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Get the actor's currently equipped armor item (characters only).
   * @param {VagabondActor} actor
   * @returns {VagabondItem|null}
   */
  static _getEquippedArmor(actor) {
    return actor.items.find(item => {
      const isArmor = item.type === 'equipment' && item.system.equipmentType === 'armor';
      return isArmor && item.system.equipped;
    }) ?? null;
  }

  // ---------------------------------------------------------------------------
  // Chat result rendering
  // ---------------------------------------------------------------------------

  /**
   * Build an HTML snippet of status result lines to append to an attack/damage chat card.
   * Localized and icon-annotated.
   *
   * @param {Array} results  - Array of { statusId, outcome, saveResult? } from processCausedStatuses
   * @param {string} targetName
   * @returns {string} HTML string (may be empty string if no results)
   */
  static buildStatusResultsHtml(results, targetName) {
    if (!results?.length) return '';

    const lines = results.map(r => {
      const statusLabel = game.i18n.localize(
        CONFIG.VAGABOND?.statusConditions?.[r.statusId] ?? r.statusId
      );

      switch (r.outcome) {
        case 'applied': {
          return `<p class="status-result status-applied">
            <i class="fas fa-circle-dot"></i>
            ${game.i18n.format('VAGABOND.Status.Applied', { actor: targetName, status: statusLabel })}
          </p>`;
        }
        case 'immune': {
          return `<p class="status-result status-immune">
            <i class="fas fa-shield-halved"></i>
            ${game.i18n.format('VAGABOND.Status.Immune', { actor: targetName, status: statusLabel })}
          </p>`;
        }
        case 'resisted': {
          const sr = r.saveResult;
          const saveLabel = sr.saveType === 'any'
            ? game.i18n.localize('VAGABOND.Status.Save.Any')
            : game.i18n.localize(`VAGABOND.Saves.${sr.saveType.charAt(0).toUpperCase()}${sr.saveType.slice(1)}.name`) || sr.saveType;
          const favorNote = sr.favored ? ` (${game.i18n.localize('VAGABOND.Favor')})` : '';
          return `<p class="status-result status-resisted">
            <i class="fas fa-dice-d20"></i>
            ${game.i18n.format('VAGABOND.Status.Resisted', {
              actor:      targetName,
              status:     statusLabel,
              saveType:   saveLabel + favorNote,
              total:      sr.total,
              difficulty: sr.difficulty,
            })}
          </p>`;
        }
        case 'already_active': {
          return `<p class="status-result status-already-active">
            <i class="fas fa-rotate"></i>
            ${game.i18n.format('VAGABOND.Status.AlreadyActive', { actor: targetName, status: statusLabel })}
          </p>`;
        }
        case 'skipped_nodamage': {
          return `<p class="status-result status-skipped">
            <i class="fas fa-ban"></i>
            ${game.i18n.format('VAGABOND.Status.RequiresDamage', { actor: targetName, status: statusLabel })}
          </p>`;
        }
        default:
          return '';
      }
    });

    return `<div class="status-results">${lines.join('')}</div>`;
  }
}
