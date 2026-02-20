import { VagabondTextParser } from './text-parser.mjs';

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
  setActor(a) { this.data.actor = a; this.data.alias = a?.name; if(!this.data.icon) this.data.icon = a?.img; return this; }
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
  
  addDamage(damageRoll, damageType = 'Physical', isCritical = false, damageTypeKey = null) {
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

    this.data.damage = {
      total: typeof damageRoll === 'number' ? damageRoll : damageRoll.total,
      formula: typeof damageRoll === 'number' ? null : damageRoll.formula,
      type: damageType, // Keep the readable label (e.g. "Piercing")
      typeKey: key,     // Keep the normalized key (e.g. "piercing")
      iconClass: damageIconClass,
      isCritical: isCritical,
      roll: typeof damageRoll === 'number' ? null : damageRoll
    };
    return this;
  }
  
  addFooterAction(html) { this.data.footerActions.push(html); return this; }

  /* -------------------------------------------- */
  /* Static Helpers                              */
  /* -------------------------------------------- */

  static isRollCritical(roll, critNumber = 20) {
    const d20Term = roll.terms.find(term => term.constructor.name === 'Die' && term.faces === 20);
    const d20Result = d20Term?.results?.[0]?.result || 0;
    return d20Result >= critNumber;
  } 


  static formatRollWithDice(roll, isDamage = false) {
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
          
          parts.push(`
            <div class="vb-die-wrapper ${sizeClass}" data-faces="${dieType}">
              <div class="vb-die-bg dmg-pool" style="background-image: url('${dieIcon}')"></div>
              <span class="vb-die-val">${result.result}</span>
              ${isExploded ? '<i class="fas fa-burst vb-die-explode" title="Exploded!"></i>' : ''}
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
          parts.push(`<span class="roll-modifier">${displayOp}${Math.abs(value)}</span>`);
        }
        previousOperator = '';
      }
    }
    return parts.join(' ');
  }

  /* -------------------------------------------- */
  /* Render & Send                               */
  /* -------------------------------------------- */
  
  async render() {
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
           this.data.damage.diceDisplay = this.constructor.formatRollWithDice(this.data.damage.roll, true);
      }

      this.data.config = CONFIG.VAGABOND;
      const template = 'systems/vagabond/templates/chat/chat-card.hbs';
      return await foundry.applications.handlebars.renderTemplate(template, this.data);
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

      if (this.data.actor) {
        msgData.flags = {
            vagabond: {
                actorId: this.data.actor.id,
                itemId: this.data.item?.id || null,
                targetsAtRollTime: this.data.targetsAtRollTime || [],
                ...(this.data.rerollData ? { rerollData: this.data.rerollData } : {})
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
    rerollData = null
  }) {
      const card = new VagabondChatCard();
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

      // 3. Handle Damage & Buttons
      if (damageRoll) {
          const { VagabondDamageHelper } = await import('./damage-helper.mjs');
          
          // Fix: Normalize key for icon lookup
          const rawKey = damageType || 'physical';
          const key = rawKey.toLowerCase();
          const dLabel = game.i18n.localize(CONFIG.VAGABOND.damageTypes[key]) || damageType;
          const isCrit = rollData?.isCritical || false;
          
          card.addDamage(damageRoll, dLabel, isCrit, key);

          const isHealing = damageType.toLowerCase() === 'healing';

          let btns = isHealing
            ? VagabondDamageHelper.createApplyDamageButton(damageRoll.total, dLabel, actor.id, item?.id, targetsAtRollTime)
            : VagabondDamageHelper.createSaveButtons(damageRoll.total, damageType, damageRoll, actor.id, item?.id, attackType, targetsAtRollTime);

          card.addFooterAction(btns);

      } else if (rollData?.isHit && item && !damageRoll) {
           const { VagabondDamageHelper } = await import('./damage-helper.mjs');

           // Use provided damageFormula, or fall back to item's current damage
           // For spells, damageFormula should be passed explicitly with increased dice
           // For weapons, item.system.currentDamage accounts for grip state
           const formula = damageFormula || item.system.currentDamage || '1d6';

           // Determine statKey for crit damage bonus
           // For weapons: get from weaponSkill.stat
           // For spells: get from manaSkill.stat (if available in rollData)
           let statKey = null;
           if (rollData.weaponSkill?.stat) {
               statKey = rollData.weaponSkill.stat;
           } else if (rollData.manaSkill?.stat) {
               statKey = rollData.manaSkill.stat;
           }

           const btn = VagabondDamageHelper.createDamageButton(actor.id, item.id, formula, {
               type: item.type,
               isCritical: rollData.isCritical,
               damageType,
               attackType,
               statKey  // ✅ FIX: Pass statKey for critical damage bonus
           }, targetsAtRollTime);
           card.addFooterAction(btn);
      }

      if (footerActions.length) footerActions.forEach(a => card.addFooterAction(a));

      // Add defend options if requested (independent of damage)
      if (hasDefenses) {
        const { VagabondDamageHelper } = await import('./damage-helper.mjs');
        const isHealing = damageType?.toLowerCase() === 'healing';
        if (!isHealing) {
          card.addFooterAction(VagabondDamageHelper.createDefendOptions());
        }
      }

      // Store reroll data in flags for Luck Reroll (Fluke)
      if (rerollData) {
        card.data.rerollData = rerollData;
      }

      return await card.send();
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
  static async _checkRoll(actor, type, key, roll, difficulty, isSuccess) {
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

      case 'skill':
        entity = actor.system.skills?.[key] || actor.system.weaponSkills?.[key];
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
        title = `${entityLabel} Save`;
        tags = [
          { label: entityLabel, cssClass: 'tag-skill' }
        ];
        break;

      default:
        throw new Error(`Invalid check roll type: ${type}`);
    }

    // Check if critical
    // For skills, check if it's a weapon skill key to apply type-specific crit bonus
    const critType = type === 'skill' && ['melee', 'ranged', 'brawl', 'finesse'].includes(key) ? key : null;
    const { VagabondRollBuilder } = await import('./roll-builder.mjs');
    const critNumber = VagabondRollBuilder.calculateCritThreshold(actor.getRollData(), critType);
    const isCritical = VagabondChatCard.isRollCritical(roll, critNumber);

    // Build roll data
    const rollData = {
      roll: roll,
      difficulty: difficulty,
      isSuccess: isSuccess,
      isCritical: isCritical
    };

    // Create and send card
    return VagabondChatCard.createActionCard({
      actor: actor,
      title: title,
      rollData: rollData,
      tags: tags,
      rerollData: {
        type: type,
        key: key,
        formula: roll.formula,
        difficulty: difficulty
      }
    });
  }

  static async skillRoll(actor, skillKey, roll, difficulty, isSuccess) {
    return this._checkRoll(actor, 'skill', skillKey, roll, difficulty, isSuccess);
  }

  //@deprecated
  //static async statRoll(actor, statKey, roll, difficulty, isSuccess) {
  //  return this._checkRoll(actor, 'stat', statKey, roll, difficulty, isSuccess);
  //}
  //

  static async saveRoll(actor, saveKey, roll, difficulty, isSuccess) {
    return this._checkRoll(actor, 'save', saveKey, roll, difficulty, isSuccess);
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
        const entity = actor.system.skills?.[keyOrLabel] || actor.system.weaponSkills?.[keyOrLabel];
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
        title = `${saveLabel} Save`;
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
      rollMode: game.settings.get('core', 'rollMode'),
    });
  }

  static async weaponAttack(actor, weapon, attackResult, damageRoll, targetsAtRollTime = []) {
      const { weaponSkill, weaponSkillKey, isHit, isCritical } = attackResult;
      
      // FIX: Auto-roll damage if settings allow or if it's a critical hit
      // This ensures the orange damage section and save buttons appear immediately
      const { VagabondDamageHelper } = await import('./damage-helper.mjs');
      if (!damageRoll && VagabondDamageHelper.shouldRollDamage(isHit)) {
          damageRoll = await weapon.rollDamage(actor, { isCritical });
      }

      const tags = [];
      tags.push({ label: weaponSkill?.label || weaponSkillKey, cssClass: 'tag-skill' });
      
      if (weapon.system.currentDamage) {
          const dType = weapon.system.currentDamageType || 'physical';
          if (dType && dType !== '-') {
              const icon = CONFIG.VAGABOND?.damageTypeIcons?.[dType.toLowerCase()] || 'fas fa-burst';
              tags.push({ label: weapon.system.currentDamage, icon: icon, cssClass: 'tag-damage' });
          } else {
              tags.push({ label: weapon.system.currentDamage, cssClass: 'tag-damage' });
          }
      }

      if (weapon.system.grip) {
          const gripMap = { '1H': 'fas fa-hand-fist', '2H': 'fas fa-hands', 'V': 'fas fa-hand-peace' };
          tags.push({ icon: gripMap[weapon.system.grip], cssClass: 'tag-grip' });
      }

      if (weapon.system.rangeDisplay) {
          tags.push({ label: weapon.system.rangeDisplay, cssClass: 'tag-range' });
      }

      // PROPERTIES LOGIC
      let propertyDetails = null;
      if (weapon.system.properties?.length > 0) {
          const propList = [];
          weapon.system.properties.forEach(prop => {
              const configKeys = Object.keys(CONFIG.VAGABOND.weaponProperties);
              const realKey = configKeys.find(k => k.toLowerCase() === prop.toLowerCase()) || prop;
              const label = game.i18n.localize(CONFIG.VAGABOND.weaponProperties[realKey] || `VAGABOND.Weapon.Property.${realKey}`);
              const hintKey = `VAGABOND.Weapon.PropertyHints.${realKey}`; 
              const hint = game.i18n.localize(hintKey);

              tags.push({ label: label, cssClass: 'tag-property' });
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

      // Determine attack type from weapon skill (ranged vs melee)
      const attackType = weaponSkillKey === 'ranged' ? 'ranged' : 'melee';

      return this.createActionCard({
          actor,
          item: weapon,
          title: `${weapon.name} Attack`,
          rollData: attackResult,
          tags,
          propertyDetails,
          damageRoll, // Now correctly populated for hits/crits
          damageType: weapon.system.currentDamageType || 'physical',
          description,
          hasDefenses: true,
          attackType,  // ✅ FIX: Pass attackType for save hinder logic
          targetsAtRollTime,
          rerollData: {
            type: 'attack',
            itemId: weapon.id,
            weaponSkillKey: weaponSkillKey,
            formula: attackResult.roll.formula,
            difficulty: attackResult.difficulty
          }
      });
  }

  static async spellCast(actor, spell, spellCastResult, damageRoll = null, targetsAtRollTime = []) {
      const { roll, difficulty, isSuccess, isCritical, manaSkill, manaSkillKey, costs, deliveryText, spellState } = spellCastResult;
      
      const tags = [];
      
      // 1. Skill Tag
      tags.push({ label: manaSkill?.label || 'Magic', cssClass: 'tag-skill' });
      
      // 2. Damage Tag
      if (spellState.damageDice && spellState.damageDice > 0) {
          const dType = spell.system.damageType;
          // Determine die size: spell override > actor default (6)
          const dieSize = spell.system.damageDieSize || actor.system.spellDamageDieSize || 6;

          // Show damage dice with icon if type exists, without icon if typeless ("-")
          if (dType && dType !== '-') {
              const icon = CONFIG.VAGABOND?.damageTypeIcons?.[dType] || 'fas fa-burst';
              tags.push({ label: `${spellState.damageDice}d${dieSize}`, icon, cssClass: 'tag-damage' });
          } else {
              // Typeless damage - show dice amount without damage type icon
              tags.push({ label: `${spellState.damageDice}d${dieSize}`, cssClass: 'tag-damage' });
          }
      }

      // 3. Delivery Tag (THE FIX)
      // We manually build the data string here to ensure it works reliably in the template
      if (spellState.deliveryType) {
          tags.push({ 
              label: deliveryText, 
              cssClass: 'tag-delivery template-trigger', // Adds class for listener
              // Pre-format the attributes as a safe string
              extraAttributes: `data-delivery-type="${spellState.deliveryType}" data-delivery-text="${deliveryText}"`
          });
      } else {
          tags.push({ label: deliveryText, cssClass: 'tag-delivery' });
      }

      // 4. Mana Cost Tag
      tags.push({
          label: `${costs.totalCost}`,
          icon: 'fas fa-star-christmas',
          cssClass: 'tag-mana'
      });

      // Calculate spell damage formula for manual damage button
      // This must include the increased damage dice from mana expenditure
      let spellDamageFormula = null;
      if (spellState.damageDice && spellState.damageDice > 0) {
          const dieSize = spell.system.damageDieSize || actor.system.spellDamageDieSize || 6;
          spellDamageFormula = `${spellState.damageDice}d${dieSize}`;
      }

      // Format crit text if critical and crit text exists
      let critText = null;
      if (isCritical && spell.system.crit) {
          critText = spell.system.formatDescription(spell.system.crit);  // Format for countdown dice triggers
      }

      return this.createActionCard({
          actor, item: spell, title: spell.name,
          rollData: { roll, difficulty, isSuccess, isCritical, isHit: isSuccess, manaSkill },  // ✅ FIX: Include manaSkill for statKey lookup
          tags,
          damageRoll,
          damageType: spell.system.damageType,
          description: spell.system.formatDescription(spell.system.description),  // Format for countdown dice triggers
          crit: critText,  // Include crit text if critical
          hasDefenses: true,
          attackType: 'cast',  // ✅ FIX: Spell attacks are 'cast' type
          damageFormula: spellDamageFormula,  // ✅ FIX: Pass actual spell damage formula with increased dice
          targetsAtRollTime,
          rerollData: {
            type: 'cast',
            itemId: spell.id,
            manaSkillKey: manaSkillKey || null,
            formula: roll?.formula || null,
            difficulty: difficulty
          }
      });
  }
  
  static async npcAction(actor, action, actionIndex, targetsAtRollTime = []) {
    const tags = [];
    
    // 1. NPC Subtitle (The Actor Name)
    const subtitle = actor.name;

    // 2. Parse Traits (Tags)
    // Checks if traits exist as a String ("Undead, Flying") or Array
    // NOTE: Tags are plain text, not enriched HTML, so don't parse countdown dice here
    if (action.traits) {
        const traitList = Array.isArray(action.traits)
            ? action.traits
            : action.traits.split(',').map(t => t.trim());

        traitList.forEach(t => {
            if (t) tags.push({ label: t, cssClass: 'tag-property' });
        });
    }

    // 3. Parse Range (if it exists on NPC actions)
    // NOTE: Tags are plain text, not enriched HTML
    if (action.range) {
         tags.push({ label: action.range, cssClass: 'tag-range' });
    }

    // 4. Parse Note (display before Recharge)
    // NOTE: Tags are plain text, not enriched HTML
    if (action.note) {
        tags.push({ label: action.note, cssClass: 'tag-standard' });
    }

    // 5. Recharge Mechanic (display after Note)
    // NOTE: Tags are plain text, not enriched HTML
    if (action.recharge) {
        tags.push({ label: `Recharge ${action.recharge}`, icon: 'fas fa-rotate', cssClass: 'tag-standard' });
    }

    // 6. Description Enrichment with countdown dice parsing
    let description = '';
    if (action.description) {
      // Parse countdown dice and regular dice rolls first
      const parsedDescription = VagabondTextParser.parseAll(action.description);
      description = await foundry.applications.ux.TextEditor.enrichHTML(parsedDescription, {
        async: true, secrets: actor.isOwner, relativeTo: actor
      });
    }

    // 7. Extra Info (common in 5e-style NPC blocks) with countdown dice parsing
    if (action.extraInfo) {
      const parsedExtraInfo = VagabondTextParser.parseAll(action.extraInfo);
      const extra = await foundry.applications.ux.TextEditor.enrichHTML(parsedExtraInfo, { async: true });
      description += `<hr class="action-divider"><div class="action-extra-info">${extra}</div>`;
    }

    // 8. Damage Buttons & Save Buttons
    const footerActions = [];
    const { VagabondDamageHelper } = await import('./damage-helper.mjs');

    // Normalize attack type for the helpers
    let attackType = action.attackType || 'melee';
    if (attackType === 'castClose') attackType = 'melee';
    else if (attackType === 'castRanged') attackType = 'ranged';

    // Show damage buttons even for "-" (typeless damage)
    if (action.flatDamage || action.rollDamage) {
        const rawType = action.damageType || 'physical';
        // For "-" damage type, use empty string as label (will be handled as typeless)
        const dTypeLabel = rawType === '-' ? '' : (game.i18n.localize(CONFIG.VAGABOND.damageTypes[rawType]) || rawType);

        if (action.flatDamage) {
            footerActions.push(VagabondDamageHelper.createNPCDamageButton(
                actor.id, actionIndex, action.flatDamage, 'flat', rawType, dTypeLabel, attackType, targetsAtRollTime
            ));
        }
        if (action.rollDamage) {
            footerActions.push(VagabondDamageHelper.createNPCDamageButton(
                actor.id, actionIndex, action.rollDamage, 'roll', rawType, dTypeLabel, attackType, targetsAtRollTime
            ));
        }
    } else {
        // No damage: Add save reminder buttons for effects that require saves
        footerActions.push(VagabondDamageHelper.createSaveReminderButtons(attackType, targetsAtRollTime));
    }

    // 9. Create the Card (always include defend options)
    return this.createActionCard({
        actor,
        title: action.name || 'NPC Action',
        subtitle,    // <--- Now correctly passes the Actor Name
        tags,        // <--- Now includes Traits, Range, Note, and Recharge
        description,
        footerActions,
        hasDefenses: true,  // Always show defend options for NPC actions
        targetsAtRollTime
        // If you want the ability image to be the icon, pass 'item' if available,
        // otherwise it defaults to actor image in createActionCard logic.
    });
  }

  static async _onClickAbilityName(event, target) {
      event.preventDefault();
      const index = parseInt(target.dataset.index);
      const ability = this.actor.system.abilities[index];

      if (!ability || !ability.name) return;

      // Use npcAction instead of npcAbility
      const { VagabondChatCard } = await import('../helpers/chat-card.mjs');
      await VagabondChatCard.npcAction(this.actor, ability, index);
  }

  // 7. FEATURE USE ADAPTER (Handles both full Items and plain Data Objects)
  /**
   * Generic item use adapter for gear, features, and other items
   * @param {VagabondActor} actor - Actor using the item
   * @param {Item|Object} item - Item document or data object
   * @returns {Promise<ChatMessage>}
   */
  static async itemUse(actor, item, targetsAtRollTime = []) {
    let description = '';

    // ROBUST CHECK:
    // If it's a full Item, description is in item.system.description.
    // If it's a plain Data Object (from Class/Ancestry), it's likely just item.description.
    let rawDescription = item.system?.description || item.description || '';

    // Format description for countdown dice if the item has a formatDescription method
    if (rawDescription && item.system?.formatDescription) {
      rawDescription = item.system.formatDescription(rawDescription);
    }

    if (rawDescription) {
      description = await foundry.applications.ux.TextEditor.enrichHTML(rawDescription, {
        async: true, secrets: actor.isOwner, relativeTo: item
      });
    }

    // Build tags and critical text for spells
    const tags = [];
    let critText = null;

    if (item.type === 'spell' && item.system) {
      // Build spell tags
      tags.push(...this._buildSpellTags(item));

      // Format crit text if it exists
      if (item.system.crit) {
        critText = item.system.formatDescription ? item.system.formatDescription(item.system.crit) : item.system.crit;
      }
    }

    // Build metadata for equipment items (including relic lore)
    const metadata = [];
    if (item.type === 'equipment' && item.system) {
      // Add relic lore to metadata if present
      if (item.system.equipmentType === 'relic' && item.system.lore) {
        const loreLabel = game.i18n.localize('VAGABOND.Relic.Lore');
        metadata.push({
          label: loreLabel !== 'VAGABOND.Relic.Lore' ? loreLabel : 'Lore',
          value: await foundry.applications.ux.TextEditor.enrichHTML(item.system.lore, {
            async: true,
            relativeTo: item
          }),
          type: 'text',
          enriched: true
        });
      }

      // Add relic-specific properties to metadata
      if (item.system.equipmentType === 'relic' && item.system.properties && item.system.properties.length > 0) {
        const propsLabel = game.i18n.localize('VAGABOND.Relic.Properties');
        metadata.push({
          label: propsLabel !== 'VAGABOND.Relic.Properties' ? propsLabel : 'Properties',
          value: item.system.properties.join(', '),
          type: 'tags'
        });
      }

      // Add detailed stats to description for non-relic equipment items
      // For relics, we put lore in metadata instead of description
      if (item.system.equipmentType !== 'relic') {
        description += this._buildItemStatsHTML(item);
      }
    }

    // Determine if this is a real item or just data
    // Real items have a UUID or id. Data objects might not.
    const isRealItem = !!item.id || !!item.uuid;

    // Check if item has damage/healing effects that need buttons
    const footerActions = [];
    if (item.type === 'equipment' && item.system?.damageAmount && item.system?.damageType && item.system.damageType !== '-') {
      const { VagabondDamageHelper } = await import('./damage-helper.mjs');
      const damageType = item.system.damageType;
      const damageAmount = item.system.damageAmount;
      const damageTypeLabel = this._getDamageTypeLabel(damageType);

      // Determine if it's restorative (healing/recover/recharge) or harmful
      const isRestorative = ['healing', 'recover', 'recharge'].includes(damageType);
      const attackType = isRestorative ? 'none' : 'melee'; // Default attack type for non-restorative items

      footerActions.push(
        VagabondDamageHelper.createItemDamageButton(
          actor.id,
          item.id,
          damageAmount,
          damageType,
          damageTypeLabel,
          attackType,
          targetsAtRollTime
        )
      );
    }

    // Build title and subtitle with enhanced metadata
    let title = item.name || "Feature";
    let subtitle = actor.name;

    // For perks, add prerequisite information as a tag
    if (item.type === 'perk' && item.system?.getPrerequisiteString) {
      const prereqString = item.system.getPrerequisiteString();
      if (prereqString) {
        tags.push({ label: `Prereq: ${prereqString}`, cssClass: 'tag-prerequisite' });
      }
    }

    return this.createActionCard({
        actor,
        // Only pass 'item' if it's a real document, otherwise null prevents linking errors
        item: isRealItem ? item : null,
        title,
        subtitle,
        cardType: 'item-use',
        tags,
        description,
        crit: critText,
        targetsAtRollTime,
        footerActions,
        metadata // Pass metadata for relic lore
    });
  }

  /**
   * Build detailed stats HTML for equipment items (similar to mini-sheet)
   * @param {VagabondItem} item - The equipment item
   * @returns {string} HTML stats
   * @private
   */
  static _buildItemStatsHTML(item) {
    const sys = item.system;
    const equipType = sys.equipmentType;
    let html = '<div class="item-stats-grid">';

    // Universal stats
    const stats = [];

    // Type-specific stats
    if (equipType === 'weapon') {
      if (sys.currentDamage) stats.push({ label: 'Damage', value: `${sys.currentDamage} ${this._getDamageTypeLabel(sys.currentDamageType)}` });
      if (sys.rangeDisplay) stats.push({ label: 'Range', value: sys.rangeDisplay });
      if (sys.gripDisplay) stats.push({ label: 'Grip', value: sys.gripDisplay });
      if (sys.weaponSkill) stats.push({ label: 'Weapon Skill', value: sys.weaponSkill });
    } else if (equipType === 'armor') {
      if (sys.armorTypeDisplay) stats.push({ label: 'Type', value: sys.armorTypeDisplay });
      if (sys.finalRating) stats.push({ label: 'Rating', value: sys.finalRating });
      if (sys.might) stats.push({ label: 'Might Req', value: sys.might });
      if (sys.immunities && sys.immunities.length > 0) {
        stats.push({ label: 'Immunities', value: sys.immunities.join(', ') });
      }
    } else if (equipType === 'alchemical') {
      if (sys.alchemicalType) {
        const type = sys.alchemicalType.charAt(0).toUpperCase() + sys.alchemicalType.slice(1);
        stats.push({ label: 'Type', value: type });
      }
      if (sys.damageAmount && sys.damageType !== '-') {
        stats.push({ label: 'Damage', value: `${sys.damageAmount} ${this._getDamageTypeLabel(sys.damageType)}` });
      }
    } else if (equipType === 'gear') {
      if (sys.gearCategory) stats.push({ label: 'Category', value: sys.gearCategory });
      if (sys.damageAmount && sys.damageType !== '-') {
        stats.push({ label: 'Effect', value: `${sys.damageAmount} ${this._getDamageTypeLabel(sys.damageType)}` });
      }
    } else if (equipType === 'relic') {
      // Relic lore is now handled in metadata, not stats
    }

    // Universal equipment stats
    if (sys.metalDisplay && sys.metal !== 'none' && sys.metal !== 'common') {
      stats.push({ label: 'Metal', value: sys.metalDisplay });
    }
    if (sys.costDisplay) stats.push({ label: 'Cost', value: sys.costDisplay });
    if (sys.slots) stats.push({ label: 'Slots', value: sys.slots });
    if (sys.quantity && sys.quantity > 1) stats.push({ label: 'Quantity', value: sys.quantity });

    // Build HTML
    stats.forEach(stat => {
      html += `<div class="stat-row"><span class="stat-label">${stat.label}:</span> <span class="stat-value">${stat.value}</span></div>`;
    });

    html += '</div>';

    // Add properties for weapons
    if (equipType === 'weapon' && sys.properties && sys.properties.length > 0) {
      html += '<div class="item-properties">';
      html += '<strong>Properties:</strong> ';
      html += sys.properties.map(prop => `<span class="property-tag">${prop}</span>`).join(', ');
      html += '</div>';
    }

    return html;
  }

  /**
   * Build metadata tags for spell items (similar to spellCast method)
   * @param {VagabondItem} item - The spell item
   * @returns {Array} Array of tag objects
   * @private
   */
  static _buildSpellTags(item) {
    const sys = item.system;
    const tags = [];

    // Damage Type Tag (icon and name only, no dice - damage is always 1d6 unless mana spent)
    const dType = sys.damageType;

    // Show damage type with icon if type exists
    if (dType && dType !== '-') {
      const icon = CONFIG.VAGABOND?.damageTypeIcons?.[dType] || 'fas fa-burst';
      const damageTypeLabel = game.i18n.localize(CONFIG.VAGABOND.damageTypes[dType]) || dType;
      tags.push({ label: damageTypeLabel, icon, cssClass: 'tag-damage' });
    }

    // Delivery Tag
    if (sys.deliveryType && sys.deliveryType !== '-') {
      const deliveryLabel = game.i18n.localize(CONFIG.VAGABOND.deliveryTypes[sys.deliveryType]) || sys.deliveryType;
      tags.push({ label: deliveryLabel, cssClass: 'tag-delivery' });
    }

    // Mana Cost Tag
    if (sys.manaCost) {
      tags.push({
        label: `${sys.manaCost}`,
        icon: 'fas fa-star-christmas',
        cssClass: 'tag-mana'
      });
    }

    return tags;
  }

  /**
   * Get damage type label
   * @param {string} damageType - The damage type key
   * @returns {string} Localized damage type label
   * @private
   */
  static _getDamageTypeLabel(damageType) {
    if (!damageType || damageType === '-') return '';
    return game.i18n.localize(CONFIG.VAGABOND.damageTypes[damageType]) || damageType;
  }

  /**
   * @deprecated Use itemUse() instead
   */
  static async featureUse(actor, item) {
    return this.itemUse(actor, item);
  }

  // 8. COUNTDOWN DICE ROLL ADAPTER
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
  static async countdownDiceRoll(dice, roll, rollResult, status, currentDiceType, newDiceType = null) {
    const flags = dice.flags.vagabond.countdownDice;

    // Determine status message and state
    let statusMessage;
    let statusClass;
    let stateMessage;

    if (status === 'continues') {
      statusMessage = game.i18n.localize('VAGABOND.CountdownDice.Chat.Continues');
      statusClass = 'continues';
      stateMessage = `${currentDiceType} remains`;
    } else if (status === 'reduced') {
      statusMessage = game.i18n.localize('VAGABOND.CountdownDice.Chat.Reduced');
      statusClass = 'reduced';
      stateMessage = `${currentDiceType} → ${newDiceType}`;
    } else if (status === 'ended') {
      statusMessage = game.i18n.localize('VAGABOND.CountdownDice.Chat.Ended');
      statusClass = 'ended';
      stateMessage = `${currentDiceType} countdown complete`;
    }

    // Build description with state and status
    const description = `
      <p><strong>${game.i18n.localize('VAGABOND.CountdownDice.Chat.CurrentState')}:</strong> ${stateMessage}</p>
      <p class="status-message ${statusClass}">${statusMessage}</p>
    `;

    // Get dice image path for icon
    const CountdownDiceClass = (await import('../documents/countdown-dice.mjs')).CountdownDice;
    const diceImagePath = CountdownDiceClass.getDiceImagePath(currentDiceType);

    // Build tags for dice type and result
    const tags = [
      { label: currentDiceType, cssClass: 'tag-dice-type' },
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

    // Add custom alias for speaker
    card.data.alias = game.user.name;

    return await card.send();
  }

  // 9. GEAR USE ADAPTER
  static async gearUse(actor, item, targetsAtRollTime = []) {
    return this.itemUse(actor, item, targetsAtRollTime);
  }

  // 10. FEATURE DATA USE ADAPTER
  static async featureDataUse(actor, featureData, sourceItem, type) {
    let description = '';

    // Get the description from featureData
    let rawDescription = featureData.description || featureData.enrichedDescription || '';

    if (rawDescription) {
      description = await foundry.applications.ux.TextEditor.enrichHTML(rawDescription, {
        async: true, secrets: actor.isOwner, relativeTo: sourceItem
      });
    }

    // Build metadata tags based on type
    const tags = [];
    
    if (type === 'feature') {
      // Features: Add level and class info as tags
      const level = featureData.level || 1;
      const className = sourceItem?.name || "Class";
      tags.push({ label: `${className} - Level ${level}`, cssClass: 'tag-feature-info' });
    } else if (type === 'trait') {
      // Traits: Add ancestry info as tag
      const ancestryName = sourceItem?.name || "Ancestry";
      tags.push({ label: `${ancestryName} Trait`, cssClass: 'tag-trait-info' });
    }

    // Create the chat card directly to have full control over the image
    const card = new VagabondChatCard()
      .setType('item-use')
      .setActor(actor)
      .setTitle(featureData.name || "Feature")
      .setSubtitle(actor.name);

    // Override the icon with the source item's image (class for features, ancestry for traits)
    if (sourceItem?.img) {
      card.data.icon = sourceItem.img;
    }

    // Set the description
    if (description) {
      card.setDescription(description);
    }

    // Add the metadata tags
    card.data.standardTags = tags;

    return card.send();
  }

  // 11. LUCK SPEND ADAPTER
  /**
   * Create a chat card for spending luck
   * @param {VagabondActor} actor - The actor spending luck
   * @param {number} newLuck - New luck value after spending
   * @param {number} maxLuck - Maximum luck value
   * @returns {Promise<ChatMessage>}
   */
  static async luckSpend(actor, newLuck, maxLuck) {
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle('Luck Spent')
      .setSubtitle(actor.name)
      .setDescription(`
        <p><i class="fas fa-clover"></i> <strong>${actor.name}</strong> spends a Luck point.</p>
        <p><strong>Advantage:</strong> Grant Favor on a d20 roll.</p>
        <p><strong>Fluke:</strong> Reroll an unresolved die you rolled.</p>
      `);

    card.data.metadata = [{
      label: 'Remaining Luck',
      value: `${newLuck} / ${maxLuck}`
    }];

    card.addFooterAction(`
      <div class="defend-info-box variant-rule-box">
        <div class="defend-header">
          <i class="fas fa-dice-d6"></i>
          <span>Plot Armor (Variant Rule)</span>
          <i class="fas fa-chevron-down expand-icon"></i>
        </div>
        <div class="defend-content">
          <p>Once per Round, if you are reduced to <strong>0 HP</strong>, you can spend <strong>1 Luck</strong> to regain <strong>d6 HP</strong>.</p>
        </div>
      </div>
    `);

    return await card.send();
  }

  /**
   * Create a chat card for recharging luck
   * @param {VagabondActor} actor - The actor recharging luck
   * @param {number} maxLuck - Maximum luck value
   * @returns {Promise<ChatMessage>}
   */
  static async luckRecharge(actor, maxLuck) {
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle('Luck Recharged')
      .setSubtitle(actor.name)
      .setDescription(`
        <p><i class="fas fa-clover"></i> <strong>${actor.name}</strong> recharges their Luck.</p>
        <p><strong>Luck Pool:</strong> ${maxLuck} / ${maxLuck}</p>
      `);

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
    const statusIcon = effect.img || 'icons/svg/aura.svg';

    // Try to get description from the effect or from CONFIG
    let fullDescription = '';

    // Get the status ID from the effect
    const statusId = effect.statuses?.first() || effect.flags?.core?.statusId;

    // First check if effect has a description field
    if (effect.description) {
      fullDescription = effect.description;
    } else if (statusId) {
      // Try to find description in CONFIG.statusEffects (Foundry's format)
      const statusDef = CONFIG.statusEffects?.find(s => s.id === statusId);
      if (statusDef?.description) {
        fullDescription = statusDef.description;
      }
    }

    // Extract automation status from description (text in square brackets)
    let automationStatus = '';
    let cleanDescription = fullDescription;

    const bracketMatch = fullDescription.match(/\[(.*?)\]$/);
    if (bracketMatch) {
      automationStatus = bracketMatch[1]; // Text inside brackets
      cleanDescription = fullDescription.replace(/\s*\[.*?\]$/, '').trim(); // Remove brackets from description
    }

    // Build description HTML (without brackets)
    let descriptionHTML = `<div class="status-effect-info">`;

    if (cleanDescription) {
      descriptionHTML += `<p>${cleanDescription}</p>`;
    } else {
      descriptionHTML += `<p><em>No description available.</em></p>`;
    }

    descriptionHTML += `</div>`;

    // Prepare metadata array
    const metadata = [];
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