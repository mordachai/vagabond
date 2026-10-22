import { VagabondTextParser } from './text-parser.mjs';
import { VagabondDamagePipeline } from './damage-pipeline.mjs';
import { VagabondChatHelper } from './chat-helper.mjs';
import { buildMacroButtonHTML } from './item-macro.mjs';
import { AnimationBridge } from './animation-bridge.mjs';
import { FeatureRules } from './feature-rules.mjs';
import { SpellPlacement } from './spell-placement.mjs';
import { TargetHelper } from './target-helper.mjs';
import { VagabondRollBuilder } from './roll-builder.mjs';
import { MacroAutoRun } from './macro-autorun.mjs';
import { EquipmentHelper } from './equipment-helper.mjs';
import { VagabondDamageHelper } from './damage-helper.mjs';

/**
 * Universal chat card builder for Vagabond system
 * Provides a fluent API for creating rich, consistent chat cards
 */
export class VagabondChatCard {
  constructor() {
    this.data = {
      type: 'generic',
      icon: null,
      iconBackground: null,  // Optional background color/class for icon
      title: '',
      subtitle: '',
      hasRoll: false,
      rollTotal: null,
      rollFormula: null,
      difficulty: null,
      outcome: null,
      outcomeClass: null,
      damage: null,
      metadataTags: [],
      propertyDetails: null,
      metadata: [],  // Metadata items (for relic lore, etc.)
      description: null,
      crit: null,  // Critical hit/success effect text
      footerTags: [],
      footerActions: [],
      actor: null,
      item: null,
      showDefendOptions: false,
      targetsAtRollTime: []  // Targets captured at roll time
    };
  }

  /* -------------------------------------------- */
  /* Fluent API Methods                          */
  /* -------------------------------------------- */
  setType(t) { this.data.type = t; return this; }
  setActor(a) { this.data.actor = a; this.data.alias = a?.name; this.data.actorUuid = a?.uuid ?? null; this.data.actorId = a?.id ?? null; if(!this.data.icon) this.data.icon = a?.img; return this; }
  setItem(i) { this.data.item = i; if(!this.data.icon) this.data.icon = i?.img; return this; }
  setTitle(t) { this.data.title = t; return this; }
  setSubtitle(s) { this.data.subtitle = s; return this; }
  setDescription(d) { this.data.description = d; return this; }
  setCrit(c) { this.data.crit = c; return this; }
  
  setMetadataTags(tags) { this.data.metadataTags = tags; return this; }
  setPropertyDetails(props) { this.data.propertyDetails = props; return this; }

  /**
   * Set icon background color or CSS class
   * @param {string} background - CSS color (e.g., "black", "#000000") or CSS class name
   * @returns {VagabondChatCard}
   */
  setIconBackground(background) {
    this.data.iconBackground = background;
    return this;
  }

  /**
   * Set targets captured at roll time
   * @param {Array} targets - Array of target objects
   * @returns {VagabondChatCard}
   */
  setTargets(targets) {
    this.data.targetsAtRollTime = targets || [];
    return this;
  }

  addRoll(roll, difficulty) {
      this.data.hasRoll = true;
      this.data.rollTotal = roll.total;
      this.data.difficulty = difficulty;
      this.data.roll = roll;
      return this;
  }
  
  setOutcome(outcome, isCritical) {
      this.data.outcome = outcome;
      this.data.isCritical = isCritical;
      return this;
  }
  
  addDamage(damageRoll, damageType = 'Physical', isCritical = false, damageTypeKey = null, critStatBonus = 0) {
    let damageIconClass = null;

    // FIX: Normalize the key to lowercase to match CONFIG.VAGABOND.damageTypeIcons keys
    // If damageTypeKey is null, fallback to using the damageType label (lowercased)
    const rawKey = damageTypeKey || damageType || 'physical';
    const key = rawKey.toLowerCase();

    // Lookup the icon
    if (CONFIG.VAGABOND?.damageTypeIcons?.[key]) {
      damageIconClass = CONFIG.VAGABOND.damageTypeIcons[key];
    } else {
      // Fallback defaults
      damageIconClass = CONFIG.VAGABOND?.damageTypeIcons?.['physical'] || 'fas fa-burst';
    }

    const total = typeof damageRoll === 'number' ? damageRoll : damageRoll.total;
    this.data.damage = {
      total,
      formula: typeof damageRoll === 'number' ? null : damageRoll.formula,
      type: damageType, // Keep the readable label (e.g. "Piercing")
      typeKey: key,     // Keep the normalized key (e.g. "piercing")
      iconClass: damageIconClass,
      isCritical: isCritical,
      roll: typeof damageRoll === 'number' ? null : damageRoll,
      // Crit stat bonus toggle: when > 0, enables the two-state toggle in damage-display.hbs
      critStatBonus: (isCritical && critStatBonus !== 0) ? critStatBonus : 0,
      baseTotal: (isCritical && critStatBonus !== 0) ? total - critStatBonus : total,
      // Two-state toggle shown on this card (off when the attack card already owns it)
      critToggle: isCritical && critStatBonus !== 0,
    };
    return this;
  }
  
  addFooterAction(html) { this.data.footerActions.push(html); return this; }

  /* -------------------------------------------- */
  /* Static Helpers                              */
  /* -------------------------------------------- */

  static isRollCritical(roll, critNumber = 20) {
    const d20Term = roll.terms.find(term => term.constructor.name === 'Die' && term.faces === 20);
    // Highest ACTIVE d20 (a kept-higher 2d20 save keeps one of two results)
    const kept = (d20Term?.results ?? []).filter(r => r.active !== false).map(r => r.result);
    const d20Result = kept.length ? Math.max(...kept) : 0;
    return d20Result >= critNumber;
  } 


  static formatRollWithDice(roll, isDamage = false, weaknessDamageTypeKey = null) {
    if (!roll) return '';

    const parts = [];
    let previousOperator = '';

    // 1. Analyze Formula Context
    // We remove spaces to make matching easier (e.g. "1d20 + 1d6" becomes "1d20+1d6")
    const formula = (roll.formula || '').replace(/\s/g, ''); 
    
    // Check if the global formula suggests a favored/hindered roll
    // This helps us guess intent even if flavor text is missing
    const isFavoredContext = !isDamage && (formula.includes('+1d6') || formula.includes('+1d6[favored]'));
    const isHinderedContext = !isDamage && (formula.includes('-1d6') || formula.includes('-1d6[hindered]'));

    for (const term of roll.terms) {
      
      // 2. Handle Operators (THE V13 FIX)
      // We check for 'OperatorTerm' class name OR if it is a string
      if (typeof term === 'string' || term.constructor.name === 'OperatorTerm') {
        const op = typeof term === 'string' ? term : term.operator;
        previousOperator = op.trim();
        continue; 
      }

      // 3. Handle Dice
      if (term.constructor.name === 'Die') {
        const dieType = term.faces;
        
        // Default Icon
        let dieIcon = `systems/vagabond/assets/ui/dice/d${dieType}-bg.webp`;

        // FAVORED / HINDERED LOGIC
        // Only applies to d6s in a non-damage context (Attack/Skill rolls)
        if (dieType === 6 && !isDamage) {
          const flavor = (term.options?.flavor || '').toLowerCase();
          
          // A. Explicit Flavor Check (Best reliability)
          if (flavor.includes('fav')) {
              dieIcon = `systems/vagabond/assets/ui/dice/d6-fav-bg.webp`;
          } else if (flavor.includes('hind')) {
              dieIcon = `systems/vagabond/assets/ui/dice/d6-hind-bg.webp`;
          }
          
          // B. Contextual Operator Check (Fallback)
          // If it looks like a Favor/Hinder formula and the operator matches
          else if (isFavoredContext && previousOperator === '+') {
              dieIcon = `systems/vagabond/assets/ui/dice/d6-fav-bg.webp`;
          }
          else if (isHinderedContext && previousOperator === '-') {
              dieIcon = `systems/vagabond/assets/ui/dice/d6-hind-bg.webp`;
          }
        }

        // Apply Size Class based on context (Damage vs Check)
        const sizeClass = isDamage ? 'die-type-damage' : 'die-type-check';

        for (const result of term.results) {
        
          // Show '+' if Favored, Show '-' if Hindered
          const shouldShowPlus = previousOperator === '+' && isFavoredContext;
          const shouldShowMinus = previousOperator === '-';

          if (shouldShowMinus) {
            parts.push(`<span class="roll-operator" style="font-weight:bold; font-size: 20px;">-</span>`);
          } 
          else if (shouldShowPlus) {
            parts.push(`<span class="roll-operator" style="font-weight:bold; font-size: 20px;">+</span>`);
          }
          else if (previousOperator && previousOperator !== '+') {
            // Fallback for other weird operators like * or /
            parts.push(`<span class="roll-operator">${previousOperator}</span>`);
          }

          const isExploded = result.exploded;
          const isWeakness = result.weakness;
          const weaknessIconClass = isWeakness && weaknessDamageTypeKey
            ? (CONFIG.VAGABOND?.damageTypeIcons?.[weaknessDamageTypeKey] || 'fa-solid fa-burst')
            : null;

          parts.push(`
            <div class="vb-die-wrapper ${sizeClass}${result.discarded ? ' is-discarded' : ''}" data-faces="${dieType}">
              <div class="vb-die-bg dmg-pool" style="background-image: url('${dieIcon}')"></div>
              <span class="vb-die-val">${result.result}</span>
              ${isExploded ? '<i class="fas fa-burst vb-die-explode" title="Exploded!"></i>' : ''}
              ${weaknessIconClass ? `<i class="${weaknessIconClass} vb-die-weakness" title="Weakness bonus die"></i>` : ''}
            </div>
          `);
          
          // Reset operator
          previousOperator = ''; // Standard logic assumes addition between multiple dice of same term
        }
      } 
      
      // 4. Handle Static Numbers (modifiers)
      else if (term.constructor.name === 'NumericTerm') {
        const value = term.number;
        if (value !== 0) {
          // If we have a stored operator (like "-"), use it. Otherwise assume "+" for positive numbers.
          const displayOp = previousOperator || (value >= 0 ? '+' : '');
          const flavor = term.options?.flavor;
          const titleAttr = flavor ? ` title="${flavor}"` : '';
          parts.push(`<span class="roll-modifier"${titleAttr}>${displayOp}${Math.abs(value)}</span>`);
        }
        previousOperator = '';
      }
    }

    // Per-die bonus badge (flat total applied after rolling, including explosions)
    if (isDamage && roll._perDieBonusTotal) {
      const total = roll._perDieBonusTotal;
      const perDie = roll._perDieBonusPerDie;
      const count = roll._perDieBonusDiceCount;
      const sign = total >= 0 ? '+' : '';
      const perDieSign = perDie >= 0 ? '+' : '';
      const dieWord = count === 1 ? 'die' : 'dice';
      parts.push(`<span class="roll-modifier per-die-bonus" title="${perDieSign}${perDie} per ${dieWord} × ${count} ${dieWord}"><i class="fas fa-dice-d6"></i>${sign}${total}</span>`);
    }

    // Per-die penalty badge (Frightened: -N per damage die, each die floored at 0)
    if (isDamage && roll._perDiePenaltyTotal) {
      const title = game.i18n.format('VAGABOND.Chat.DiePenaltyTitle', {
        status: game.i18n.localize('VAGABOND.StatusConditions.Frightened'),
        penalty: roll._perDiePenaltyPerDie, dice: (roll._perDiePenaltyDice ?? []).join(', '), total: roll._perDiePenaltyTotal,
      });
      parts.push(`<span class="roll-modifier per-die-bonus per-die-penalty" title="${title}"><i class="fas fa-dice-d6"></i>-${roll._perDiePenaltyTotal}</span>`);
    }

    return parts.join(' ');
  }

  /* -------------------------------------------- */
  /* Render & Send                               */
  /* -------------------------------------------- */
  
  /** Derive the render-only fields (dice markup, favor/hinder flags, config) onto `this.data`. */
  _prepareData() {
      // 1. Attack/Skill Rolls (isDamage = false)
      if (this.data.roll) {
          const f = this.data.roll.formula || '';
          this.data.isFavored = f.includes('+1d6') || f.includes('+ 1d6');
          this.data.isHindered = f.includes('-1d6') || f.includes('- 1d6');

          // Pass FALSE so it uses Fav/Hind images
          this.data.rollDiceDisplay = this.constructor.formatRollWithDice(this.data.roll, false);
      }

      // 2. Damage Rolls (isDamage = true)
      if (this.data.damage?.roll) {
           // Pass TRUE so it ignores Fav/Hind images and adds 'die-type-damage' class
           // Pass the damage type key so weakness dice show the type icon overlay
           this.data.damage.diceDisplay = this.constructor.formatRollWithDice(this.data.damage.roll, true, this.data.damage.typeKey || null);

           // Flanked preview badge — informational only (not added to damage.total):
           // the actual +2 is applied per-target at apply time (see damage-helper.mjs
           // _computeFinalDamage), since a multi-target/Cleave roll can hit both a
           // flanked and a non-flanked target off the same rolled total.
           if (this.data.damage.flankedBonus > 0) {
             const flankedLabel = game.i18n.localize('VAGABOND.StatusConditions.Flanked');
             this.data.damage.diceDisplay += ` <span class="roll-modifier flanked-bonus-preview" title="${flankedLabel}"><i class="fas fa-people-arrows"></i>+${this.data.damage.flankedBonus}</span>`;
           }
      }

      this.data.config = CONFIG.VAGABOND;
  }

  async render() {
      this._prepareData();
      const template = 'systems/vagabond/templates/chat/chat-card.hbs';
      return await foundry.applications.handlebars.renderTemplate(template, this.data);
  }

  /**
   * Synchronous render for callers that cannot await (non-awaited hooks). The caller supplies the
   * compiled template, e.g. from `foundry.applications.handlebars.getTemplate()` done ahead of time.
   * @param {Function} compiled - Compiled `chat-card.hbs`
   * @returns {string}
   */
  renderSync(compiled) {
      this._prepareData();
      return compiled(this.data, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true });
  }
  
  async send() {
      const content = await this.render();
      const msgData = {
          content: content,
          speaker: ChatMessage.getSpeaker({ actor: this.data.actor }),
          style: CONST.CHAT_MESSAGE_STYLES.OTHER,
          rolls: this.data.roll ? [this.data.roll] : []
      };
      if (this.data.damage?.roll) msgData.rolls.push(this.data.damage.roll);

      if (this.data.whisper) {
        msgData.whisper = this.data.whisper;
      }

      if (this.data.actor) {
        // Consumables (and Mixes) are usually deleted right after their card posts —
        // snapshot them so save/apply buttons can still resolve their statuses
        // (VagabondDamageHelper._resolveSourceItem).
        const item = this.data.item;
        const snapshot = (item?.type === 'equipment' && item.actor
          && (item.system?.isConsumable || item.flags?.vagabond?.mix)) ? item.toObject() : null;
        msgData.flags = {
            vagabond: {
                actorId: this.data.actor.uuid,
                itemId: item?.id || null,
                targetsAtRollTime: this.data.targetsAtRollTime || [],
                ...(snapshot ? { itemSnapshot: snapshot } : {}),
                ...(this.data.rerollData ? { rerollData: this.data.rerollData } : {}),
                // Read back by VagabondDamageHelper.spellCastFromButton (Spell Damage / Effect split)
                ...(this.data.spellCast ? { spellCast: this.data.spellCast } : {}),
                // Caller-specific flags (e.g. damageResult, read by WardHelper for a late Ward)
                ...(this.data.extraFlags ?? {})
            }
        };
      }

      return await ChatMessage.create(msgData);
  }

  /* -------------------------------------------- */
  /* MASTER METHOD                               */
  /* -------------------------------------------- */
  
  static async createActionCard({
    actor, item, title, subtitle, rollData, tags = [],
    damageRoll, damageType = 'physical', description = '',
    crit = null,
    hasDefenses = false, attackType = 'melee', footerActions = [],
    propertyDetails = null, damageFormula = null,
    targetsAtRollTime = [], metadata = [],
    rerollData = null,
    actionIndex = null,
    weaknessPreRolled = false,
    macroExtraScope = null,
    imbueSection = null,
    // Spell Damage / Effect split: { effect, damage } of the Cast behind this card
    // (VagabondDamageHelper.spellCastContext). Stored as flags.vagabond.spellCast.
    spellCast = null,
    // Extra flags.vagabond entries (e.g. AnimationBridge.FLAGS)
    extraFlags = null,
  }) {
      const card = new VagabondChatCard();
      if (spellCast) card.data.spellCast = spellCast;
      if (extraFlags) card.data.extraFlags = { ...(card.data.extraFlags ?? {}), ...extraFlags };
      const iconStyle = game.settings.get('vagabond', 'chatCardIconStyle');

      // LOGIC: The "First Set Wins" Rule
      // Whichever method (setItem or setActor) runs first establishes the icon.
      
      let prioritizeActor = false;

      if (iconStyle === 'smart' && item) {
          // Smart Mode: Prioritize Actor Face for "Active" things (Weapons, Spells)
          // But keep Item Icon for "Passive/Consumable" things (Gear, Potions)
          const isWeapon = item.type === 'weapon' || (item.type === 'equipment' && item.system.equipmentType === 'weapon');
          const isSpell = item.type === 'spell';
          
          if (isWeapon || isSpell) {
              prioritizeActor = true;
          }
      }

      // EXECUTE PRIORITY
      if (prioritizeActor) {
          // 1. Face First (Attacks/Spells in Smart Mode)
          card.setActor(actor).setItem(item);
      } else {
          // 2. Item First (Default Mode OR Gear/Potions)
          card.setItem(item).setActor(actor);
      }

      // Continue setup...
      card.setTitle(title).setSubtitle(subtitle);

      // Set targets captured at roll time
      if (targetsAtRollTime && targetsAtRollTime.length > 0) {
        card.setTargets(targetsAtRollTime);
      }

      // 1. Handle Main Roll
      if (rollData) {
          const { roll, difficulty, isHit, isCritical } = rollData;

          // Only process roll if it exists (damage cards may only pass isCritical)
          if (roll) {
              let label = 'NEUTRAL';
              if (typeof isHit !== 'undefined') label = isHit ? 'HIT' : 'MISS';
              else if (typeof rollData.isSuccess !== 'undefined') label = rollData.isSuccess ? 'PASS' : 'FAIL';

              card.addRoll(roll, difficulty).setOutcome(label, isCritical);

              // Extract Skill Label (moves to roll strip)
              const skillIndex = tags.findIndex(t => t.cssClass === 'tag-skill');
              if (skillIndex > -1) {
                  const baseLabel = tags[skillIndex].label;
                  card.data.rollSkillLabel = isCritical ? `${baseLabel} (Crit)` : baseLabel;
                  tags.splice(skillIndex, 1);
              }
          } else if (typeof isCritical !== 'undefined') {
              // No roll, but track isCritical for damage display — no outcome banner
              card.data.isCritical = isCritical;
          }
      }

      // 2. SPLIT TAGS: Standard vs Properties
      const standardTags = [];
      const propertyTags = [];

      tags.forEach(tag => {
          // Check if it's a property tag
          if (tag.cssClass && tag.cssClass.includes('tag-property')) {
              propertyTags.push(tag);
          } else {
              standardTags.push(tag);
          }
      });

      // Assign to card data
      card.data.standardTags = standardTags;
      card.data.propertyTags = propertyTags;
      
      // Also set the full list just in case, though we primarily use the split ones now
      card.setMetadataTags(tags); 

      if (propertyDetails) card.setPropertyDetails(propertyDetails);
      if (description) card.setDescription(description);
      if (crit) card.setCrit(crit);

      // Add custom metadata (for relic lore, etc.)
      if (metadata && metadata.length > 0) {
        card.data.metadata = metadata;
      }

      // Collect on-hit status entries early — needed for save button tinting
      const previewEntries = item?.system?.causedStatuses?.length
        ? item.system.causedStatuses
        : (actionIndex !== null && actor?.system?.actions?.[actionIndex]?.causedStatuses?.length)
          ? actor.system.actions[actionIndex].causedStatuses
          : null;
      const critPreviewEntries = item?.system?.critCausedStatuses?.length
        ? item.system.critCausedStatuses
        : (actionIndex !== null && actor?.system?.actions?.[actionIndex]?.critCausedStatuses?.length)
          ? actor.system.actions[actionIndex].critCausedStatuses
          : null;
      // Set of save types required to resist on-hit statuses (both normal and crit).
      // A Spell's statuses are its Effect: gated by what the Cast included (damage-only → no tint).
      let allPreviewEntries = [...(previewEntries ?? []), ...(critPreviewEntries ?? [])];
      if (item?.type === 'spell' && spellCast) {
        allPreviewEntries = VagabondDamageHelper.gateSpellEffectEntries(allPreviewEntries, spellCast);
      }
      const statusSaveTypes = new Set(
        allPreviewEntries.filter(e => e.saveType && e.saveType !== 'none').map(e => e.saveType)
      );
      // 'any' save means the player can use any save — tint every configured save button
      if (statusSaveTypes.has('any')) {
        for (const save of VagabondDamageHelper.getConfiguredSaves()) statusSaveTypes.add(save.key);
      }

      // 3. Leading footer actions (e.g. Grapple button — appears above damage buttons)
      if (footerActions.length) footerActions.forEach(a => card.addFooterAction(a));

      // Imbue delivery control — its own section, rendered above the damage section
      if (imbueSection) card.data.imbueSection = imbueSection;

      // 4. Handle Damage & Buttons
      if (damageRoll) {

          // Fix: Normalize key for icon lookup
          const rawKey = damageType || 'physical';
          const key = rawKey.toLowerCase();
          const dLabel = game.i18n.localize(CONFIG.VAGABOND.damageTypes[key]) || damageType;
          const isCrit = rollData?.isCritical || false;
          const critStatBonus = rollData?.critStatBonus || 0;

          card.addDamage(damageRoll, dLabel, isCrit, key, critStatBonus);
          // Manual flow: the attack card's (Crit) toggle already decided Luck vs benefit
          // and is locked once damage is rolled — no second toggle here.
          if (rollData?.critLocked) card.data.damage.critToggle = false;
          // Luck kept instead of the benefit: no "Crit!" badge on the damage
          if (rollData?.critBenefitOff) card.data.damage.isCritical = false;

          // Restorative types (healing/recover/recharge) get an Apply button, never save buttons
          const isRestorativeCard = VagabondDamagePipeline.isRestorativeDamageType(damageType);

          // Flanked bonus — only the first target is consulted (same convention as
          // item.mjs rollAttack's incomingAttacksModifier peek). Folded into the
          // displayed total (targets are already known at roll time, so there's no
          // need to wait for Apply) — but NOT into damageRoll.total itself, so the
          // save/apply buttons below still carry the raw roll and the real per-target
          // addition in _computeFinalDamage (damage-helper.mjs) stays the single
          // source of truth for the actual HP math.
          if (!isRestorativeCard && targetsAtRollTime?.length) {
            const firstTarget = TargetHelper.resolveTargets(targetsAtRollTime)[0];
            if (firstTarget?.actor?.statuses?.has('flanked')) {
              const bonus = CONFIG.VAGABOND?.homebrew?.derivations?.flankedDamageBonus ?? 2;
              card.data.damage.flankedBonus = bonus;
              card.data.damage.total += bonus;
              card.data.damage.baseTotal += bonus;
            }
          }

          const effectiveWeaknessPreRolled = weaknessPreRolled || (damageRoll?._weaknessPreRolled ?? false);
          let btns = isRestorativeCard
            ? VagabondDamageHelper.createApplyDamageButton(damageRoll.total, key, actor.uuid, item?.id, targetsAtRollTime, actionIndex, VagabondDamagePipeline.rolledDieValues(damageRoll))
            : VagabondDamageHelper.createSaveButtons(damageRoll.total, damageType, damageRoll, actor.uuid, item?.id, attackType, targetsAtRollTime, actionIndex, rollData?.isCritical ?? false, statusSaveTypes, critStatBonus, effectiveWeaknessPreRolled);

          card.addFooterAction(btns);

          // Defense shields render inside the damage section, beside the number;
          // Ward upcast buttons (warded Targets) right below them, before anyone resolves the damage
          if (!isRestorativeCard) {
            card.data.damage.defenseHtml = VagabondDamageHelper.createDefenseShields(
              damageRoll.total, damageType, actor.uuid, item?.id, targetsAtRollTime, actionIndex,
              rollData?.isCritical ?? false, critStatBonus, effectiveWeaknessPreRolled, attackType
            ) + VagabondDamageHelper.createFeatureRows(targetsAtRollTime, damageRoll.total, damageType);
          }

      } else if (rollData?.isHit && item && !damageRoll) {

           // Use provided damageFormula, or fall back to item's current damage
           // For spells, damageFormula should be passed explicitly with increased dice
           // For weapons, item.system.currentDamage accounts for grip state
           const rawFormula = damageFormula || item.system.currentDamage;
           // Weapons with no damage ("-" or empty, e.g. Net, Garotte wire) get no
           // Roll Damage button — "-" is not a valid Roll formula.
           const isWeaponItem = item.type === 'equipment' && item.system.equipmentType === 'weapon';
           const noDamage = !rawFormula?.trim() || rawFormula.trim() === '-';
           // Spells with no damage dice (utility spells, dice-scaling) pass no formula —
           // never fall back to a made-up 1d6 for them.
           const isSpellWithoutDamage = item.type === 'spell' && !damageFormula;
           if (!(isWeaponItem && noDamage) && !isSpellWithoutDamage) {
           const formula = (rawFormula?.trim() && rawFormula.trim() !== '-') ? rawFormula : '1d6';

           // Determine statKey for crit damage bonus
           // For weapons: get from weaponSkill.stat
           // For spells: get from manaSkill.stat (if available in rollData)
           let statKey = null;
           if (rollData.weaponSkill?.stat) {
               statKey = rollData.weaponSkill.stat;
           } else if (rollData.manaSkill?.stat) {
               statKey = rollData.manaSkill.stat;
           }

           const btn = VagabondDamageHelper.createDamageButton(actor.uuid, item.id, formula, {
               type: item.type,
               isCritical: rollData.isCritical,
               damageType,
               attackType,
               statKey,
               critStatBonus: rollData?.critStatBonus || 0
           }, targetsAtRollTime);
           card.addFooterAction(btn);

           // Crit with a stat-bonus benefit: the "(Crit)" tag after the skill becomes the
           // Luck/benefit toggle (same behavior as the damage card's crit badge). Roll
           // Damage reads its state when clicked.
           if (rollData.isCritical && rollData.critStatBonus > 0 && card.data.rollSkillLabel) {
               card.data.rollCritToggle = true;
               card.data.rollSkillLabel = card.data.rollSkillLabel.replace(/\s*\(Crit\)$/, '');
           }
           }
      }

      // Executable macro buttons (simple always; hit macro only on a hit/success)
      // `macroHit` overrides it where the card delivers the Spell without a hit of its own (Glyph trigger)
      const isHitForMacro = rollData?.macroHit ?? rollData?.isHit ?? rollData?.isSuccess ?? false;
      VagabondChatCard._buildMacroButtons(item, actor, isHitForMacro, rollData?.isCritical ?? false, macroExtraScope).forEach(b => card.addFooterAction(b));

      // Add defend options if requested (independent of damage; never for restoratives)
      if (hasDefenses) {
        if (!VagabondDamagePipeline.isRestorativeDamageType(damageType) && !VagabondDamageHelper.targetsAreAllNpc(targetsAtRollTime)) {
          card.addFooterAction(VagabondDamageHelper.createDefendOptions());
        }
      }

      // Store reroll data in flags for Luck Reroll (Fluke)
      if (rerollData) {
        card.data.rerollData = rerollData;
      }

      return await card.send();
  }

  /**
   * Build chat-card buttons for an item's executable macros.
   * `macro` (simple) always renders when enabled; `hitMacro` only when the
   * action hit/succeeded. Each button carries the data the click handler
   * (in vagabond.mjs) needs to resolve and execute the macro.
   * @param {Item|null} item     The source item/spell (must be a real document)
   * @param {Actor} actor        The acting actor
   * @param {boolean} isHit      Whether the action hit/succeeded
   * @param {boolean} isCrit     Whether the action was a critical (threaded into macro scope as `isCritical`)
   * @returns {string[]}         Array of button HTML strings
   * @private
   */
  static _buildMacroButtons(item, actor, isHit, isCrit = false, extraScope = null) {
    if (!item?.uuid) return [];
    const fb = game.i18n.localize('VAGABOND.Item.Macro.RunDefault');
    const buttons = [];
    buttons.push(buildMacroButtonHTML({ cfg: item.system?.macro, slot: 'macro', actorUuid: actor?.uuid, itemUuid: item.uuid, itemName: item.name, fallbackLabel: fb, isCritical: isCrit, extraScope }));
    if (isHit) buttons.push(buildMacroButtonHTML({ cfg: item.system?.hitMacro, slot: 'hitMacro', actorUuid: actor?.uuid, itemUuid: item.uuid, itemName: item.name, fallbackLabel: fb, isCritical: isCrit, extraScope }));
    return buttons.filter(Boolean);
  }

  /* -------------------------------------------- */
  /* ADAPTER METHODS                             */
  /* -------------------------------------------- */

  /**
   * Internal unified check roll handler
   * @param {VagabondActor} actor - Actor performing check
   * @param {string} type - 'stat', 'skill', or 'save'
   * @param {string} key - Entity key (statKey, skillKey, or saveKey)
   * @param {Roll} roll - Evaluated roll
   * @param {number} difficulty - Target difficulty
   * @param {boolean} isSuccess - Whether roll succeeded
   * @returns {Promise<ChatMessage>}
   * @private
   */
  static async _checkRoll(actor, type, key, roll, difficulty, isSuccess, extraMetadata = [], extraTags = []) {
    // Get entity data based on type
    let entity, entityLabel, title, tags;

    switch (type) {
      case 'stat':
        entity = actor.system.stats[key];
        entityLabel = game.i18n.localize(CONFIG.VAGABOND.stats[key]?.long) || key;
        title = `${entityLabel} Check`;
        tags = [
          { label: entityLabel, cssClass: 'tag-skill' },
          { label: `${entity?.value || 0}`, icon: 'fas fa-hashtag' }
        ];
        break;

      case 'cast':
      case 'skill':
        entity = actor.system.skills?.[key];
        entityLabel = entity?.label || key;
        title = `${entityLabel} Check`;
        tags = [
          { label: entityLabel, cssClass: 'tag-skill' }
        ];
        if (entity?.stat) {
          const statLabel = game.i18n.localize(CONFIG.VAGABOND.stats[entity.stat]?.abbr) || entity.stat;
          tags.push({ label: statLabel, cssClass: 'tag-stat' });
        }
        if (entity) {
          tags.push({ label: entity.trained ? 'Trained' : 'Untrained', cssClass: 'tag-info' });
        }
        break;

      case 'save':
        entity = actor.system.saves?.[key];
        entityLabel = entity?.label || key;
        title = `${entityLabel} ${game.i18n.localize('VAGABOND.Roll.SaveRoll')}`;
        tags = [
          { label: entityLabel, cssClass: 'tag-skill' }
        ];
        break;

      default:
        throw new Error(`Invalid check roll type: ${type}`);
    }

    // Check if critical
    // For weapon skills, pass the key for per-weapon crit bonuses
    // For saves, pass the save key ('reflex', 'endure', 'will') so save crit bonuses apply
    // For spell cast rerolls, pass 'spell' so castCritBonus applies
    const critType = (type === 'cast') ? 'spell'
      : (type === 'skill' && VagabondRollBuilder.isWeaponSkillKey(key)) ? key
      : (type === 'save') ? key
      : null;
    const critNumber = VagabondRollBuilder.calculateCritThreshold(actor.getRollData(), critType);
    const isCritical = VagabondChatCard.isRollCritical(roll, critNumber);

    // Build roll data
    const rollData = {
      roll: roll,
      difficulty: difficulty,
      isSuccess: isSuccess,
      isCritical: isCritical
    };

    // Create and send card first, then reveal luck gain
    const result = await VagabondChatCard.createActionCard({
      actor: actor,
      title: title,
      rollData: rollData,
      tags: [...tags, ...extraTags],
      metadata: extraMetadata,
      rerollData: {
        type: type,
        key: key,
        formula: roll.formula,
        difficulty: difficulty
      }
    });
    if (isCritical) await VagabondChatCard._grantLuckOnCrit(actor, result, 'Critical');
    return result;
  }

  static async skillRoll(actor, skillKey, roll, difficulty, isSuccess, extraMetadata = [], extraTags = []) {
    return this._checkRoll(actor, 'skill', skillKey, roll, difficulty, isSuccess, extraMetadata, extraTags);
  }

  static async saveRoll(actor, saveKey, roll, difficulty, isSuccess, extraMetadata = [], extraTags = []) {
    return this._checkRoll(actor, 'save', saveKey, roll, difficulty, isSuccess, extraMetadata, extraTags);
  }

  /**
   * Create an auto-fail chat card (for Dead status and similar effects)
   * @param {Actor} actor - The actor
   * @param {string} type - The roll type: 'skill', 'save', 'stat', 'weapon', 'spell'
   * @param {string} keyOrLabel - The skill/save/stat key, or item name for weapons/spells
   * @returns {Promise<ChatMessage>}
   */
  static async autoFailRoll(actor, type, keyOrLabel) {
    let title, tags = [];

    switch (type) {
      case 'stat':
        const statLabel = game.i18n.localize(CONFIG.VAGABOND.stats[keyOrLabel]) || keyOrLabel;
        title = `${statLabel} Check`;
        tags = [{ label: statLabel, cssClass: 'tag-skill' }];
        break;

      case 'skill':
        const entity = actor.system.skills?.[keyOrLabel];
        const entityLabel = entity?.label || keyOrLabel;
        title = `${entityLabel} Check`;
        tags = [{ label: entityLabel, cssClass: 'tag-skill' }];
        if (entity?.stat) {
          const statAbbr = game.i18n.localize(CONFIG.VAGABOND.stats[entity.stat]?.abbr) || entity.stat;
          tags.push({ label: statAbbr, cssClass: 'tag-stat' });
        }
        break;

      case 'save':
        const save = actor.system.saves?.[keyOrLabel];
        const saveLabel = save?.label || keyOrLabel;
        title = `${saveLabel} ${game.i18n.localize('VAGABOND.Roll.SaveRoll')}`;
        tags = [{ label: saveLabel, cssClass: 'tag-skill' }];
        break;

      case 'weapon':
        title = `${keyOrLabel} Attack`;
        tags = [{ label: 'Attack', cssClass: 'tag-action' }];
        break;

      case 'spell':
        title = `${keyOrLabel} Cast`;
        tags = [{ label: 'Spell', cssClass: 'tag-magic' }];
        break;

      default:
        title = `${keyOrLabel}`;
        break;
    }

    // Create card with auto-fail styling
    const card = new VagabondChatCard();
    card.setActor(actor);
    card.setTitle(title);
    card.setMetadataTags(tags);

    // Set outcome to failure with special auto-fail class
    card.data.outcome = 'AUTOMATIC FAILURE';
    card.data.outcomeClass = 'outcome-auto-fail';
    card.data.description = `${actor.name} automatically fails due to status conditions.`;

    // Render and post to chat
    const html = await card.render();
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: actor }),
      content: html,
      rollMode: VagabondChatHelper.getRollMode(),
    });
  }

  /**
   * Normalize an authored attack type to the runtime vocabulary
   * ('melee' | 'ranged' | 'cast' | 'none'). NPC actions author
   * 'castClose'/'castRanged', which map to melee/ranged.
   * @param {string|null|undefined} raw
   * @returns {string}
   */
  static normalizeAttackType(raw) {
    if (raw === 'castClose') return 'melee';
    if (raw === 'castRanged') return 'ranged';
    return raw || 'melee';
  }

  /**
   * Attack type for an attack made with a weapon skill, from the homebrew skill's
   * `attackType` field ('ranged' hinders Block; anything else is melee).
   * @param {string} weaponSkillKey
   * @returns {'melee'|'ranged'}
   */
  static attackTypeForWeaponSkill(weaponSkillKey) {
    const skill = CONFIG.VAGABOND?.homebrew?.skills?.find(s => s.key === weaponSkillKey);
    if (skill) return skill.attackType === 'ranged' ? 'ranged' : 'melee';
    // Pre-init / unknown-key fallback: the classic literal
    return weaponSkillKey === 'ranged' ? 'ranged' : 'melee';
  }

  /**
   * Attack type for a spell cast, by delivery (touch/glyph → melee, others → cast).
   * @param {string|null|undefined} deliveryType
   * @returns {'melee'|'cast'}
   */
  static attackTypeForSpellDelivery(deliveryType) {
    return CONFIG.VAGABOND.spellDeliveryAttackTypes?.[deliveryType?.toLowerCase?.()] ?? 'cast';
  }

  static async weaponAttack(actor, weapon, attackResult, damageRoll, targetsAtRollTime = [], extraMetadata = [], extraTags = []) {
      const { weaponSkill, weaponSkillKey, isHit, isCritical } = attackResult;

      // Auto-roll damage if settings allow — the orange damage section and save
      // buttons then appear immediately. isCritical is a boolean and statKey the
      // weapon skill's stat (crit stat bonus only applies on real crits).
      const cleaveDie = EquipmentHelper.cleaveDieFor(weapon, targetsAtRollTime.length);
      if (!damageRoll && VagabondDamageHelper.shouldRollDamage(isHit)) {
          damageRoll = await weapon.rollDamage(actor, isCritical, weaponSkill?.stat || null, targetsAtRollTime, cleaveDie, weaponSkillKey);
      }

      // Thrown Alchemical Item: no grip/range/weapon damage fields — its own
      // damageAmount/damageType. Any throw gets a "Thrown" range tag.
      const isAlchemicalThrow = EquipmentHelper.isThrownAlchemical(weapon);
      const isThrow = !!attackResult.thrown || isAlchemicalThrow;
      const baseDamage = isAlchemicalThrow ? weapon.system.damageAmount : weapon.system.currentDamage;
      const baseDamageType = isAlchemicalThrow ? weapon.system.damageType : weapon.system.currentDamageType;

      const tags = [];
      tags.push({ label: weaponSkill?.label || weaponSkillKey, cssClass: 'tag-skill' });
      
      if (baseDamage) {
          const dType = baseDamageType || 'physical';
          if (dType && dType !== '-') {
              const icon = CONFIG.VAGABOND?.damageTypeIcons?.[dType.toLowerCase()] || 'fas fa-burst';
              tags.push({ label: baseDamage, icon: icon, cssClass: 'tag-damage' });
          } else {
              tags.push({ label: baseDamage, cssClass: 'tag-damage' });
          }
      }

      if (weapon.system.grip && !isAlchemicalThrow) {
          const gripMap = { '1H': 'fas fa-hand-fist', '2H': 'fas fa-hands', 'V': 'fas fa-hand-peace', '0': 'fas fa-wind' };
          tags.push({ icon: gripMap[weapon.system.grip], cssClass: 'tag-grip' });
      }

      if (isThrow) {
          tags.push({ label: game.i18n.localize('VAGABOND.Weapon.Property.Thrown'), cssClass: 'tag-range' });
      } else if (weapon.system.rangeDisplay) {
          tags.push({ label: weapon.system.rangeDisplay, cssClass: 'tag-range' });
      }

      // PROPERTIES LOGIC
      let propertyDetails = null;
      if (weapon.system.properties?.length > 0) {
          const propList = [];
          // Cleave is "active" (highlighted) whenever it actually reached 2+ Targets —
          // the die itself was already stepped down at roll time (see roll-handler.mjs).
          const isCleaveActive = weapon.system.properties.includes('Cleave') && targetsAtRollTime.length >= 2;
          weapon.system.properties.forEach(prop => {
              const configKeys = Object.keys(CONFIG.VAGABOND.weaponProperties);
              const realKey = configKeys.find(k => k.toLowerCase() === prop.toLowerCase()) || prop;
              const label = game.i18n.localize(CONFIG.VAGABOND.weaponProperties[realKey] || `VAGABOND.Weapon.Property.${realKey}`);
              const hintKey = `VAGABOND.Weapon.PropertyHints.${realKey}`;
              const hint = game.i18n.localize(hintKey);

              const isActive = isCleaveActive && realKey === 'Cleave';
              tags.push({ label: label, cssClass: 'tag-property', active: isActive });
              propList.push({ name: label, hint: (hint !== hintKey) ? hint : '' });
          });
          propertyDetails = propList;
      }

      // Enrich description with countdown dice parsing
      let description = '';
      if (weapon.system.description) {
          const parsedDescription = VagabondTextParser.parseCountdownDice(weapon.system.description);
          description = await foundry.applications.ux.TextEditor.enrichHTML(parsedDescription, { async: true });
      }

      // Determine attack type from the homebrew weapon skill's attackType field.
      // A throw is ranged whatever skill it was rolled with.
      const attackType = isThrow ? 'ranged' : VagabondChatCard.attackTypeForWeaponSkill(weaponSkillKey);

      // Compute die-size-adjusted formula for the manual "Roll Damage" button.
      // item.rollDamage() applies this when damage is auto-rolled, but when the
      // "Roll damage with check" setting is OFF the button stores the raw formula
      // from item.system.currentDamage — bypassing the bonus entirely.
      const dieSizeBonus = isAlchemicalThrow ? 0 : (actor.system[`${weaponSkillKey}DamageDieSizeBonus`] || 0);
      let adjustedDamageFormula = baseDamage;
      // Cleave step-down first (mirrors item.rollDamage), then the die-size bonus
      if (cleaveDie && adjustedDamageFormula?.includes('d')) {
          adjustedDamageFormula = adjustedDamageFormula.replace(/d\d+/i, `d${cleaveDie}`);
      }
      if (dieSizeBonus !== 0 && adjustedDamageFormula?.includes('d')) {
          adjustedDamageFormula = adjustedDamageFormula.replace(/(\d*)d(\d+)/, (match, count, size) => {
              return `${count}d${parseInt(size) + dieSizeBonus}`;
          });
      }

      // Grapple property: show Grapple button on hit
      const footerActions = [];
      const hasGrapple = weapon.system.properties?.some(p => p.toLowerCase() === 'grapple');
      if (attackResult.isHit && hasGrapple) {
          const targetsJson = JSON.stringify(targetsAtRollTime).replace(/"/g, '&quot;');
          footerActions.push(
              `<button class="vagabond-grapple-button"
                  data-actor-id="${actor.uuid}"
                  data-item-id="${weapon.id}"
                  data-targets="${targetsJson}">
                  <i class="fa-solid fa-hand-holding-hand"></i> ${game.i18n.localize('VAGABOND.Grapple.Button')}
              </button>`
          );
      }

      // Feature section after the attack (FeatureRules `weaponHitSection`: Imbue — the weapon's pending
      // Spell, delivered on a hit, fizzled by a miss). Rendered as its own section above the damage
      // section (not a footer action) so it visually pairs with the roll while the weapon's own
      // damage + Apply button stay grouped together below it.
      const imbueSection = await FeatureRules.first('weaponHitSection', weapon, attackResult, targetsAtRollTime);

      const result = await this.createActionCard({
          actor,
          item: weapon,
          title: `${weapon.name} Attack`,
          rollData: attackResult,
          tags: [...tags, ...extraTags],
          metadata: extraMetadata,
          propertyDetails,
          damageRoll, // Now correctly populated for hits/crits
          damageFormula: adjustedDamageFormula, // Die-size-adjusted formula for manual roll button
          damageType: baseDamageType || 'physical',
          description,
          hasDefenses: true,
          attackType,  // ✅ FIX: Pass attackType for save hinder logic
          targetsAtRollTime,
          footerActions,
          imbueSection,
          rerollData: {
            type: 'attack',
            itemId: weapon.id,
            weaponSkillKey: weaponSkillKey,
            thrown: isThrow,
            formula: attackResult.roll.formula,
            difficulty: attackResult.difficulty
          },
          extraFlags: AnimationBridge.FLAGS,
      });
      // Automated Animations: a hit animates with its damage (now if rolled or nothing to roll,
      // else on the Roll Damage button); a miss plays the miss variant (or nothing)
      const awaitsDamageButton = attackResult.isHit && !damageRoll
        && !!result?.content?.includes('vagabond-damage-button');
      if (!awaitsDamageButton) {
        AnimationBridge.play({ actor, item: weapon, targets: targetsAtRollTime, hit: !!attackResult.isHit });
      }
      // Only auto-grant luck when there's no crit toggle (toggle manages luck itself)
      if (isCritical && !attackResult.critStatBonus) await VagabondChatCard._grantLuckOnCrit(actor, result, 'Critical Hit');
      return result;
  }

  static async spellCast(actor, spell, spellCastResult, damageRoll = null, targetsAtRollTime = [], extraMetadata = [], extraTags = [], footerActions = []) {
      const { roll, difficulty, isSuccess, isCritical, manaSkill, manaSkillKey, costs, deliveryText, spellState, manaOverrideDelta = 0 } = spellCastResult;

      const tags = [];

      // 1. Skill Tag
      tags.push({ label: manaSkill?.label || 'Magic', cssClass: 'tag-skill' });
      
      // 2. Damage Tag — only when the Cast deals damage (not dice-scaling dice, not a typeless Spell's default die)
      if (VagabondDamageHelper.spellCastContext(spell, spellState)?.damage) {
          const dType = spell.system.damageType;
          const dieSize = VagabondDamageHelper.spellDieSize(actor, spell);

          // Show damage dice with icon if type exists, without icon if typeless ("-")
          if (dType && dType !== '-') {
              const icon = CONFIG.VAGABOND?.damageTypeIcons?.[dType] || 'fas fa-burst';
              tags.push({ label: VagabondDamagePipeline.markExplode(`${spellState.damageDice}d${dieSize}`, spell, actor), icon, cssClass: 'tag-damage' });
          } else {
              // Typeless damage - show dice amount without damage type icon
              tags.push({ label: VagabondDamagePipeline.markExplode(`${spellState.damageDice}d${dieSize}`, spell, actor), cssClass: 'tag-damage' });
          }
      }

      // 3. Delivery Tag (THE FIX)
      // We manually build the data string here to ensure it works reliably in the template
      if (spellState.deliveryType) {
          tags.push({ 
              label: deliveryText, 
              cssClass: 'tag-delivery template-trigger', // Adds class for listener
              // Pre-format the attributes as a safe string. data-fx-school (when set) wins over
              // data-damage-type for picking the region art texture.
              extraAttributes: `data-delivery-type="${spellState.deliveryType}" data-delivery-text="${deliveryText}" data-damage-type="${spell.system.damageType ?? '-'}" data-fx-school="${spell.system.fxSchool ?? ''}"`
          });
      } else {
          tags.push({ label: deliveryText, cssClass: 'tag-delivery' });
      }

      // 4. Mana Cost Tag — actual amount charged (may be less than the spell's
      // built cost on a partial-fail spend under spellManaOnCastFail)
      tags.push({
          label: `${costs.manaSpent ?? costs.totalCost}`,
          icon: 'fas fa-star-christmas',
          cssClass: 'tag-mana'
      });

      // Calculate spell damage formula for manual damage button
      // This must include the increased damage dice from mana expenditure
      // Only a Cast that deals damage gets one (spellCastContext.damage): a typeless Spell (Raise, Bless…)
      // would otherwise show a Roll Damage button from its default die, and its FX would wait on that button.
      let spellDamageFormula = null;
      if (VagabondDamageHelper.spellCastContext(spell, spellState)?.damage) {
          const dieSize = VagabondDamageHelper.spellDieSize(actor, spell);
          spellDamageFormula = `${spellState.damageDice}d${dieSize}`;
      }

      // Format crit text if critical and crit text exists
      let critText = null;
      if (isCritical && spell.system.crit) {
          critText = spell.system.formatDescription(spell.system.crit);  // Format for countdown dice triggers
      }

      // Crit stat bonus for spells: mana skill's governing stat value
      const spellCritStatBonus = (isCritical && manaSkill?.stat)
        ? actor.getRollData().stats?.[manaSkill.stat]?.value || 0
        : 0;

      // Imbue defers all damage/effect resolution to delivery-on-hit (a separate
      // roll posted later by VagabondImbueHelper.deliverImbue) — the cast card
      // itself has no target to damage or defend against yet.
      const isImbue = spellState.deliveryType?.toUpperCase() === 'IMBUE';
      // Glyph defers resolution to the Trigger button (VagabondGlyphHelper.trigger) —
      // the cast card just confirms placement, so no damage/defend/roll-damage
      // button here; footerActions carries the Trigger/Dismiss row instead.
      const isGlyph = spellState.deliveryType?.toUpperCase() === 'GLYPH';

      // Spell Damage / Effect split (see VagabondDamageHelper): what this Cast included.
      // An effect-only Cast has no damage card, so its statuses get buttons right here.
      const spellCast = VagabondDamageHelper.spellCastContext(spell, spellState);
      const attackType = VagabondChatCard.attackTypeForSpellDelivery(spellState.deliveryType);
      const effectButtons = (isSuccess && !isImbue && !isGlyph)
        ? VagabondDamageHelper.createSpellEffectButtons(actor, spell, spellCast, { isCritical, targetsAtRollTime, attackType })
        : '';

      const result = await this.createActionCard({
          actor, item: spell, title: spell.name,
          rollData: { roll, difficulty, isSuccess, isCritical, isHit: (isImbue || isGlyph) ? false : isSuccess, manaSkill, critStatBonus: spellCritStatBonus },  // ✅ FIX: Include manaSkill for statKey lookup
          tags: [...tags, ...extraTags],
          metadata: extraMetadata,
          damageRoll,
          damageType: spell.system.damageType,
          description: spell.system.formatDescription(spell.system.description),  // Format for countdown dice triggers
          crit: critText,  // Include crit text if critical
          hasDefenses: !isImbue && !isGlyph,
          attackType,  // touch → melee, others → cast
          damageFormula: (isImbue || isGlyph) ? null : spellDamageFormula,  // ✅ FIX: Pass actual spell damage formula with increased dice
          targetsAtRollTime,
          footerActions: effectButtons ? [...footerActions, effectButtons] : footerActions,
          spellCast,
          rerollData: {
            type: 'cast',
            itemId: spell.id,
            manaSkillKey: manaSkillKey || null,
            deliveryType: spellState.deliveryType || null,
            deliveryIncrease: spellState.deliveryIncrease ?? 0,
            formula: roll?.formula || null,
            difficulty: difficulty,
            // A Luck reroll / Force Crit rebuilds the whole Cast card from these (no Mana re-spent)
            damageDice: spellState.damageDice ?? 0,
            useFx: !!spellState.useFx,
            manaSpent: costs?.manaSpent ?? costs?.totalCost ?? 0,
            totalCost: costs?.totalCost ?? 0,
            deliveryText: deliveryText || null,
            targetObjects: spellState.targetObjects ?? [],
            targetsPicked: !!spellState.targetsPicked,
            castArea: spellState.castArea ?? null,
            targetSpaces: spellState.targetSpaces ?? [],
          },
          // Expose this cast's chosen dice + total mana to spell macros (scope.spellDamageDice / scope.manaSpent),
          // plus the Target picker's choices (scope.targetObjects as Items, scope.targetsPicked = Targets are final)
          macroExtraScope: {
            spellDamageDice: spellState.damageDice ?? 0,
            manaSpent: costs?.manaSpent ?? costs?.totalCost ?? 0,
            manaOverrideDelta: manaOverrideDelta ?? 0,
            // Focus-held Cast: what the hit macro applies ends with the Focus (FocusLink)
            focusHeld: !!spellState.focusHeld,
            // The Cast includes the Spell's Effect (Damage / Effect split): Surface Spells leave their area only then
            spellEffect: !!spellState.useFx,
            ...(spellState.targetObjects?.length ? { targetObjects: spellState.targetObjects } : {}),
            ...(spellState.targetsPicked ? { targetsPicked: true } : {}),
            // Delivery + area of the Cast (scope.deliveryType / scope.castArea = {sceneId, shape}): Conjure placement
            deliveryType: spellState.deliveryType ?? null,
            ...(spellState.castArea ? { castArea: spellState.castArea } : {}),
            // Remote Targets that are spaces on the map ([{x, y, sceneId}], SpellPlacement): Erupt, a drawn cart
            ...(spellState.targetSpaces?.length ? { targetSpaces: spellState.targetSpaces } : {}),
          }
      });
      // Only auto-grant luck when there's no crit toggle (toggle manages luck itself)
      if (isCritical && !spellCritStatBonus) await VagabondChatCard._grantLuckOnCrit(actor, result, 'Critical Cast');
      return result;
  }
  
  /**
   * Luck reroll (Fluke) of a Spell Cast: rebuild the WHOLE Cast card from the Cast state stored in
   * `rerollData` (damage dice, delivery, Effect toggle) instead of a bare check — so a failed Cast
   * rerolled into a success still gets its damage roll / Roll Damage button, its Effect buttons,
   * its macros and its FX (user request 2026-10-11).
   *
   * Mana: the Cast is billed again for what the NEW outcome costs (spellManaOnCastFail rules) and
   * only the difference to what the original card charged is taken or refunded — never paid twice.
   * Not handled here (caller keeps the plain check card): Imbue / Glyph (weapon pick / glyph
   * placement happen before the card and are skipped on a failed Cast) and cards posted before
   * `rerollData.damageDice` existed. Focus, Twinned Spell and post-roll hooks are not re-run.
   *
   * @param {Actor} actor
   * @param {Item} spell
   * @param {Object} rerollData - flags.vagabond.rerollData of the original Cast card
   * @param {Roll} roll - the new casting Check
   * @param {Array} targetsAtRollTime
   * @param {ChatMessage|null} [originMessage]  the card being rerolled (its hit macro never auto-runs twice)
   * @returns {Promise<ChatMessage>}
   */
  static async rerollSpellCast(actor, spell, rerollData, roll, targetsAtRollTime = [], originMessage = null) {

    const difficulty = rerollData.difficulty;
    const isSuccess = roll.total >= difficulty;
    // Same crit test as SpellHandler._executeCast (natural d20 vs the spell crit threshold)
    const critNumber = VagabondRollBuilder.calculateCritThreshold(actor.getRollDataWithItemEffects(spell), 'spell');
    const d20 = roll.terms.find(t => t.constructor.name === 'Die' && t.faces === 20)?.results?.[0]?.result || 0;
    const isCritical = d20 >= critNumber;

    // Re-bill the Cast for the new outcome; charge / refund only the difference
    const totalCost = rerollData.totalCost ?? rerollData.manaSpent ?? 0;
    const failMode = game.settings.get('vagabond', 'spellManaOnCastFail');
    const owed = isSuccess || failMode === 'fullOnFail' ? totalCost
      : failMode === 'halfOnFail' ? Math.ceil(totalCost / 2) : 0;
    const delta = owed - (rerollData.manaSpent ?? 0);
    if (delta !== 0) {
      const current = actor.system.mana?.current ?? 0;
      if (delta > current) ui.notifications.warn(game.i18n.format('VAGABOND.Status.RerollManaShort', { name: actor.name, cost: delta, mana: current }));
      await actor.update({ 'system.mana.current': Math.max(0, current - delta) });
    }
    if (isSuccess) Hooks.callAll('vagabond.actorActed', actor, { source: 'cast', itemId: spell.id });

    const spellState = {
      damageDice: rerollData.damageDice ?? 0,
      deliveryType: rerollData.deliveryType,
      deliveryIncrease: rerollData.deliveryIncrease ?? 0,
      useFx: !!rerollData.useFx,
      targetObjects: rerollData.targetObjects ?? [],
      targetsPicked: !!rerollData.targetsPicked,
      castArea: rerollData.castArea ?? null,
      targetSpaces: rerollData.targetSpaces ?? [],
      // Focus is not re-run: the reroll is held while the caster still Focuses on it (no "Crit: No Focus" Crit)
      focusHeld: isSuccess && (actor.system.focus?.spellIds ?? []).includes(spell.id)
        && !(isCritical && spell.system.critNoFocus),
    };
    const manaSkillKey = rerollData.manaSkillKey || null;
    const manaSkill = manaSkillKey ? actor.system.skills?.[manaSkillKey] ?? null : null;

    // Same auto-roll rule as SpellHandler._createSpellChatCard
    let damageRoll = null;
    if (spell.system.damageType !== '-' && spellState.damageDice > 0 && VagabondDamageHelper.shouldRollDamage(isSuccess)) {
      damageRoll = await VagabondDamageHelper.rollSpellDamage(actor, spell, spellState, isCritical, manaSkill?.stat || 'reason', targetsAtRollTime);
    }

    const deliveryText = rerollData.deliveryText
      || game.i18n.localize(CONFIG.VAGABOND.deliveryTypes?.[spellState.deliveryType] ?? spellState.deliveryType ?? '');
    const message = await this.spellCast(actor, spell, {
      roll, difficulty, isSuccess, isCritical, manaSkill, manaSkillKey,
      spellState, costs: { totalCost, manaSpent: owed }, deliveryText, manaOverrideDelta: 0,
    }, damageRoll, targetsAtRollTime);

    await MacroAutoRun.inherit(originMessage, message);
    if (spellState.deliveryType) {
      await VagabondDamageHelper.playFxOrDefer(
        message,
        { kind: 'spell', deliveryType: spellState.deliveryType, deliveryIncrease: spellState.deliveryIncrease,
          spaces: spellState.targetSpaces,
          areaCenter: spellState.castArea?.anchor ? SpellPlacement.shapeCenter(spellState.castArea.shape) : null,
          castArea: spellState.castArea ?? null },
        actor, spell, targetsAtRollTime, isSuccess
      );
    }
    return message;
  }

  /**
   * Create a chat card for gaining luck
   * @param {VagabondActor} actor - The actor gaining luck
   * @param {number} newLuck - New luck value after gain
   * @param {string} [reason] - Optional reason (e.g. 'Critical Hit')
   * @returns {Promise<ChatMessage>}
   */
  static async luckGain(actor, newLuck, reason = '') {
    const luckTerm = CONFIG.VAGABOND.homebrew?.terms?.luckTerm || 'Luck';
    const poolTerm = CONFIG.VAGABOND.homebrew?.terms?.poolTerm || 'Pool';
    const reasonText = reason ? ` from <strong>${reason}</strong>` : '';
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle(`${luckTerm} Gained`)
      .setSubtitle(actor.name)
      .setDescription(`
        <p><i class="fas fa-clover"></i> <strong>${actor.name}</strong> gains 1 ${luckTerm}${reasonText}.</p>
        <p><strong>${luckTerm} ${poolTerm}:</strong> ${newLuck}</p>
      `);

    return await card.send();
  }

  /**
   * Grant +1 luck to a character actor on a critical hit/success (no cap).
   * No-ops for non-character actors (e.g. NPCs).
   * @param {VagabondActor} actor - The actor that rolled the crit
   * @param {string} [reason] - Label to show in chat (e.g. 'Critical Hit')
   * @returns {Promise<void>}
   */
  /**
   * Wait for Dice So Nice 3D animation to finish for a given message.
   * No-ops if DSN is not active or no message is provided.
   * @param {ChatMessage|null} message
   * @returns {Promise<void>}
   */
  static async _waitForDiceAnimation(message) {
    if (!message?.id) return;
    if (!game.modules.get('dice-so-nice')?.active) return;
    await new Promise(resolve => {
      const hookId = Hooks.on('diceSoNiceRollComplete', (id) => {
        if (id === message.id) {
          Hooks.off('diceSoNiceRollComplete', hookId);
          resolve();
        }
      });
      // Fallback: resolve after 10 s in case the hook never fires
      setTimeout(() => { Hooks.off('diceSoNiceRollComplete', hookId); resolve(); }, 10000);
    });
  }

  static async _removeLuckForCritBenefit(actor) {
    if (actor?.system?.currentLuck === undefined) return;
    const currentLuck = actor.system.currentLuck ?? 0;
    if (currentLuck <= 0) return;
    await actor.update({ 'system.currentLuck': currentLuck - 1 });
  }

  static async _grantLuckOnCrit(actor, rollMessage = null, reason = 'Critical') {
    if (actor.system.currentLuck === undefined) return null;
    await VagabondChatCard._waitForDiceAnimation(rollMessage);
    const currentLuck = actor.system.currentLuck ?? 0;
    const newLuck = currentLuck + 1;
    await actor.update({ 'system.currentLuck': newLuck });
    return await VagabondChatCard.luckGain(actor, newLuck, reason);
  }

  /**
   * Create a chat card showing a direct damage/healing application result.
   * Used by Apply Direct, Apply Save Damage, Apply Restorative, and tick damage.
   * @param {VagabondActor} actor
   * @param {Object} opts
   * @param {'damage'|'heal'|'recover'|'recharge'} [opts.type='damage']
   * @param {number} [opts.rawAmount]        Raw amount before armor reduction (damage only)
   * @param {number} [opts.armorReduction=0] Amount blocked by armor (damage only)
   * @param {number} [opts.overhealExcess=0] Healing beyond Max HP (Luminary Overheal), shown as a note (heal only)
   * @param {number}  opts.finalAmount       Final effective amount applied
   * @param {string}  [opts.damageType]      Damage type key e.g. 'fire', 'physical'
   * @param {number}  opts.previousValue     Resource value before application
   * @param {number}  opts.newValue          Resource value after application
   * @param {string}  [opts.sourceIcon]      Icon URL override for the card
   * @param {string}  [opts.sourceName]      Source name shown as subtitle (item/action/status)
   * @returns {Promise<ChatMessage>}
   */
  static async applyResult(actor, {
    type = 'damage',
    rawAmount,
    armorReduction = 0,
    shieldReduction = 0,
    shieldRoll = null,
    flankedBonus = 0,
    healPenalty = null,
    overhealExcess = 0,
    finalAmount = 0,
    damageType = null,
    previousValue = 0,
    newValue = 0,
    sourceIcon = null,
    sourceName = '',
    extraHtml = '',
    wardReduction = 0,
    wardTitle = '',
    resistReduction = 0,
    extraFlags = null,
  } = {}) {
    const effective = finalAmount;
    const raw = rawAmount ?? effective;

    let title, descriptionHTML;

    if (type === 'damage') {
      // Resolve damage type display
      let damageTypeLabel = '';
      let damageTypeIconHTML = '';
      if (damageType && damageType !== '-') {
        damageTypeLabel = game.i18n.localize(CONFIG.VAGABOND?.damageTypes?.[damageType] ?? damageType);
        const iconClass = CONFIG.VAGABOND?.damageTypeIcons?.[damageType.toLowerCase()] || 'fa-solid fa-burst';
        damageTypeIconHTML = `<i class="${iconClass} damage-type-icon-large"></i>`;
      }

      title = `${effective} ${damageTypeLabel || 'Damage'}`;

      let calcHTML = `<div class="save-damage-calculation">
        <div class="damage-formula-line">
          <span class="damage-component" title="Damage"><i class="fa-solid fa-dice"></i> ${raw}</span>`;

      if (flankedBonus > 0) {
        calcHTML += `
          <span class="damage-operator">+</span>
          <span class="damage-component" title="${game.i18n.localize('VAGABOND.StatusConditions.Flanked')}"><i class="fas fa-people-arrows"></i> ${flankedBonus}</span>`;
      }

      if (shieldReduction > 0) {
        calcHTML += `
          <span class="damage-operator">-</span>
          <span class="damage-component" title="${game.i18n.localize('VAGABOND.Chat.Defense')} (${shieldRoll?.formula ?? shieldReduction})"><i class="fas fa-shield-halved"></i> ${shieldReduction}</span>`;
      }

      if (wardReduction > 0) {
        calcHTML += `
          <span class="damage-operator">-</span>
          <span class="damage-component ward-component" title="${foundry.utils.escapeHTML(wardTitle || '')}"><i class="fas fa-star-christmas"></i> ${wardReduction}</span>`;
      }

      if (resistReduction > 0) {
        calcHTML += `
          <span class="damage-operator">-</span>
          <span class="damage-component" title="${game.i18n.localize('VAGABOND.Damage.Resisted')}"><i class="fa-solid fa-circle-half-stroke"></i> ${resistReduction}</span>`;
      }

      if (armorReduction > 0) {
        calcHTML += `
          <span class="damage-operator">-</span>
          <span class="damage-component" title="Armor"><i class="fa-sharp fa-regular fa-shield"></i> ${armorReduction}</span>`;
      }

      calcHTML += `
          <span class="damage-operator">=</span>
          <span class="damage-final">${effective} ${damageTypeIconHTML}</span>
        </div>`;

      if (effective > 0) {
        calcHTML += `<div class="damage-application-note gm-only">damage applied — HP: <strong>${previousValue}</strong> → <strong>${newValue}</strong></div>`;
      } else {
        calcHTML += `<div class="damage-application-note gm-only">no damage applied (immune or blocked)</div>`;
      }

      calcHTML += `</div>`;
      descriptionHTML = calcHTML;

    } else if (type === 'heal') {
      title = `${effective} Healed`;
      // Sickened: show what the penalty took off the rolled amount (rolled - penalty = healed)
      let healBreakdown = '';
      if (healPenalty?.total > 0) {
        const tip = game.i18n.format('VAGABOND.Chat.HealPenaltyTitle', {
          status: game.i18n.localize('VAGABOND.StatusConditions.Sickened'),
          penalty: healPenalty.perDie, dice: healPenalty.dice.join(', '), total: healPenalty.total,
        });
        healBreakdown = `
          <span class="damage-component" title="Healing"><i class="fa-solid fa-dice"></i> ${raw}</span>
          <span class="damage-operator">-</span>
          <span class="damage-component" title="${tip}"><i class="fas fa-dice-d6"></i> ${healPenalty.total}</span>
          <span class="damage-operator">=</span>`;
      }
      descriptionHTML = `<div class="save-damage-calculation">
        <div class="damage-formula-line">${healBreakdown}
          <span class="damage-final"><i class="fa-solid fa-heart"></i> +${effective}</span>
        </div>
        <div class="damage-application-note">HP restored —<strong> ${previousValue}</strong> →<strong> ${newValue}</strong></div>
        ${overhealExcess > 0 ? `<div class="damage-application-note overheal-excess"><strong>${game.i18n.localize('VAGABOND.Chat.OverhealTitle')}:</strong> ${game.i18n.format('VAGABOND.Chat.OverhealExcess', { excess: overhealExcess })}</div>` : ''}
      </div>`;

    } else if (type === 'recover') {
      const fatigueTerm = CONFIG.VAGABOND.homebrew?.terms?.fatigueTerm || 'Fatigue';
      title = `${effective} ${fatigueTerm} Recovered`;
      descriptionHTML = `<div class="save-damage-calculation">
        <div class="damage-formula-line">
          <span class="damage-final"><i class="fa-solid fa-person-running"></i> -${effective}</span>
        </div>
        <div class="damage-application-note"><strong>${fatigueTerm}</strong>: <strong>${previousValue} → ${newValue}</strong></div>
      </div>`;

    } else if (type === 'recharge') {
      const manaTerm = CONFIG.VAGABOND.homebrew?.terms?.manaTerm || 'Mana';
      title = `${effective} ${manaTerm} Recharged`;
      descriptionHTML = `<div class="save-damage-calculation">
        <div class="damage-formula-line">
          <span class="damage-final"><i class="fa-solid fa-sparkles"></i> +${effective}</span>
        </div>
        <div class="damage-application-note">${manaTerm}: <strong>${previousValue} → ${newValue}</strong></div>
      </div>`;
    }

    const card = new VagabondChatCard()
      .setType('apply-result')
      .setActor(actor)
      .setTitle(title)
      .setDescription(descriptionHTML + (extraHtml || ''));
    if (extraFlags) card.data.extraFlags = extraFlags;

    if (sourceIcon) card.data.icon = sourceIcon;
    if (sourceName) card.data.standardTags = [{ label: sourceName, cssClass: 'tag-source' }];
    // Attach the shield's own Roll (not just its total) so it rides in the
    // ChatMessage's `rolls` array — gives it a Dice So Nice animation and the
    // native hover-to-see-the-die tooltip, same as any other roll in chat.
    if (shieldRoll) card.data.roll = shieldRoll;

    return card.send();
  }

}