/**
 * Universal chat card builder for Vagabond system
 * Provides a fluent API for creating rich, consistent chat cards
 */
export class VagabondChatCard {
  constructor() {
    this.data = {
      type: 'generic',
      icon: null,
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
      description: null,
      footerTags: [],
      footerActions: [], 
      actor: null,
      item: null,
      showDefendOptions: false
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
  
  setMetadataTags(tags) { this.data.metadataTags = tags; return this; }
  setPropertyDetails(props) { this.data.propertyDetails = props; return this; }
  
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

  static isRollCritical(roll, actor) {
    const critNumber = actor?.system?.critNumber || 20;
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

      if (this.data.item && this.data.actor) {
        msgData.flags = {
            vagabond: {
                actorId: this.data.actor.id,
                itemId: this.data.item.id
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
    hasDefenses = false, attackType = 'melee', footerActions = [],
    propertyDetails = null
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

      // 1. Handle Main Roll
      if (rollData) {
          const { roll, difficulty, isHit, isCritical } = rollData;
          let label = 'NEUTRAL';
          if (typeof isHit !== 'undefined') label = isHit ? 'HIT' : 'MISS';
          else if (typeof rollData.isSuccess !== 'undefined') label = rollData.isSuccess ? 'PASS' : 'FAIL';
          
          card.addRoll(roll, difficulty).setOutcome(label, isCritical);
          
          // Extract Skill Label (moves to roll strip)
          const skillIndex = tags.findIndex(t => t.cssClass === 'tag-skill');
          if (skillIndex > -1) {
              card.data.rollSkillLabel = tags[skillIndex].label;
              tags.splice(skillIndex, 1);
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
            ? VagabondDamageHelper.createApplyDamageButton(damageRoll.total, dLabel, actor.id, item?.id)
            : VagabondDamageHelper.createSaveButtons(damageRoll.total, damageType, damageRoll, actor.id, item?.id, attackType);

          card.addFooterAction(btns);

          if (!isHealing && hasDefenses) {
            card.addFooterAction(VagabondDamageHelper.createDefendOptions());
          }

      } else if (rollData?.isHit && item && !damageRoll) {
           const { VagabondDamageHelper } = await import('./damage-helper.mjs');
           const formula = item.system.currentDamage || '1d6';
           const btn = VagabondDamageHelper.createDamageButton(actor.id, item.id, formula, {
               type: item.type, isCritical: rollData.isCritical, damageType, attackType
           });
           card.addFooterAction(btn);
      }
      
      if (footerActions.length) footerActions.forEach(a => card.addFooterAction(a));

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
    const isCritical = VagabondChatCard.isRollCritical(roll, actor);

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
      tags: tags
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

  static async weaponAttack(actor, weapon, attackResult, damageRoll) {
      const { weaponSkill, weaponSkillKey } = attackResult;
      
      const tags = [];
      tags.push({ label: weaponSkill?.label || weaponSkillKey, cssClass: 'tag-skill' });
      
      if (weapon.system.currentDamage) {
          const dType = weapon.system.damageType || 'physical';
          // Show damage with icon if type exists, without icon if typeless ("-")
          if (dType && dType !== '-') {
              const icon = CONFIG.VAGABOND?.damageTypeIcons?.[dType.toLowerCase()] || 'fas fa-burst';
              tags.push({ label: weapon.system.currentDamage, icon: icon, cssClass: 'tag-damage' });
          } else {
              // Typeless damage - show damage amount without damage type icon
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
      if (weapon.system.properties && weapon.system.properties.length > 0) {
          const propList = [];
          
          weapon.system.properties.forEach(prop => {
              // 1. Find correct key in Config (handle case sensitivity)
              // This ensures 'finesse' finds 'Finesse'
              const configKeys = Object.keys(CONFIG.VAGABOND.weaponProperties);
              const realKey = configKeys.find(k => k.toLowerCase() === prop.toLowerCase()) || prop;
              
              // 2. Get Label
              const labelKey = CONFIG.VAGABOND.weaponProperties[realKey] || `VAGABOND.Weapon.Property.${realKey}`;
              const label = game.i18n.localize(labelKey);

              // 3. Get Hint (Assuming .Hints convention based on key)
              // If you have a different structure for descriptions, update the key string below
              const hintKey = `VAGABOND.Weapon.PropertyHints.${realKey}`; 
              const hint = game.i18n.localize(hintKey);

              // Add to Tags (Header)
              tags.push({ label: label, cssClass: 'tag-property' });

              // Add to Details (Accordion)
              propList.push({ name: label, hint: (hint !== hintKey) ? hint : '' });
          });
          
          propertyDetails = propList;
      }

      return this.createActionCard({
          actor, item: weapon, title: `${weapon.name} Attack`,
          rollData: attackResult,
          tags,
          propertyDetails,
          damageRoll,
          damageType: weapon.system.damageType || 'physical',
          hasDefenses: true
      });
  }  

  static async spellCast(actor, spell, spellCastResult, damageRoll = null) {
      const { roll, difficulty, isSuccess, isCritical, manaSkill, costs, deliveryText, spellState } = spellCastResult;
      
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

      return this.createActionCard({
          actor, item: spell, title: spell.name,
          rollData: { roll, difficulty, isSuccess, isCritical, isHit: isSuccess },
          tags,
          damageRoll,
          damageType: spell.system.damageType,
          description: spell.system.description,
          hasDefenses: true
      });
  }
  
  static async npcAction(actor, action, actionIndex) {
    const tags = [];
    
    // 1. NPC Subtitle (The Actor Name)
    const subtitle = actor.name;

    // 2. Parse Traits (Tags)
    // Checks if traits exist as a String ("Undead, Flying") or Array
    if (action.traits) {
        const traitList = Array.isArray(action.traits) 
            ? action.traits 
            : action.traits.split(',').map(t => t.trim());
            
        traitList.forEach(t => {
            if (t) tags.push({ label: t, cssClass: 'tag-property' }); // Adds standard styling
        });
    }

    // 3. Parse Range (if it exists on NPC actions)
    if (action.range) {
         tags.push({ label: action.range, cssClass: 'tag-range' });
    }

    // 4. Recharge Mechanic
    if (action.recharge) {
        tags.push({ label: `Recharge ${action.recharge}`, icon: 'fas fa-rotate', cssClass: 'tag-standard' });
    }

    // 5. Description Enrichment
    let description = '';
    if (action.description) {
      description = await foundry.applications.ux.TextEditor.enrichHTML(action.description, {
        async: true, secrets: actor.isOwner, relativeTo: actor
      });
    }
    
    // 6. Extra Info (common in 5e-style NPC blocks)
    if (action.extraInfo) {
      const extra = await foundry.applications.ux.TextEditor.enrichHTML(action.extraInfo, { async: true });
      description += `<hr class="action-divider"><div class="action-extra-info">${extra}</div>`;
    }

    // 7. Damage Buttons
    const footerActions = [];
    // Show damage buttons even for "-" (typeless damage)
    if (action.flatDamage || action.rollDamage) {
        const { VagabondDamageHelper } = await import('./damage-helper.mjs');

        const rawType = action.damageType || 'physical';
        // For "-" damage type, use empty string as label (will be handled as typeless)
        const dTypeLabel = rawType === '-' ? '' : (game.i18n.localize(CONFIG.VAGABOND.damageTypes[rawType]) || rawType);

        // Normalize attack type for the helper
        let attackType = action.attackType || 'melee';
        if (attackType === 'castClose') attackType = 'melee';
        else if (attackType === 'castRanged') attackType = 'ranged';

        if (action.flatDamage) {
            footerActions.push(VagabondDamageHelper.createNPCDamageButton(
                actor.id, actionIndex, action.flatDamage, 'flat', rawType, dTypeLabel, attackType
            ));
        }
        if (action.rollDamage) {
            footerActions.push(VagabondDamageHelper.createNPCDamageButton(
                actor.id, actionIndex, action.rollDamage, 'roll', rawType, dTypeLabel, attackType
            ));
        }
    }

    // 8. Create the Card
    return this.createActionCard({
        actor,
        title: action.name || 'NPC Action',
        subtitle,    // <--- Now correctly passes the Actor Name
        tags,        // <--- Now includes Traits and Range
        description,
        footerActions,
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
  static async itemUse(actor, item) {
    let description = '';

    // ROBUST CHECK:
    // If it's a full Item, description is in item.system.description.
    // If it's a plain Data Object (from Class/Ancestry), it's likely just item.description.
    const rawDescription = item.system?.description || item.description || '';

    if (rawDescription) {
      description = await foundry.applications.ux.TextEditor.enrichHTML(rawDescription, {
        async: true, secrets: actor.isOwner, relativeTo: item
      });
    }

    // Determine if this is a real item or just data
    // Real items have a UUID or id. Data objects might not.
    const isRealItem = !!item.id || !!item.uuid;

    return this.createActionCard({
        actor,
        // Only pass 'item' if it's a real document, otherwise null prevents linking errors
        item: isRealItem ? item : null,
        title: item.name || "Feature",
        cardType: 'item-use',
        description
    });
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
  static async gearUse(actor, item) {
    return this.itemUse(actor, item);
  }

  // 10. FEATURE DATA USE ADAPTER
  static async featureDataUse(actor, item) {
    // This receives the plain data object {name, description} from the sheet
    return this.itemUse(actor, item);
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
        <p><strong>Remaining Luck:</strong> ${newLuck} / ${maxLuck}</p>
      `);

    return await card.send();
  }
}