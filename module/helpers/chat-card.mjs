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
 
  static formatRollWithDice(roll) {
    if (!roll) return '';

    const parts = [];
    let previousOperator = '';

    const cleanFormula = (roll.formula || '').replace(/\s/g, '');
    const isFavoredRoll = cleanFormula.includes('+1d6') || cleanFormula.includes('+1d6[favored]');
    const isHinderedRoll = cleanFormula.includes('-1d6') || cleanFormula.includes('-1d6[hindered]');

    for (const term of roll.terms) {
      if (typeof term === 'string') {
        previousOperator = term;
        continue;
      }

      if (term.constructor.name === 'Die') {
        const dieType = term.faces;
        
        // FIX: Use full system path
        let dieIcon = `systems/vagabond/assets/ui/dice/d${dieType}-bg.webp`;

        if (dieType === 6) {
          const flavor = term.options?.flavor?.toLowerCase() || '';
          if (flavor.includes('fav') || (isFavoredRoll && previousOperator === '+')) {
            dieIcon = `systems/vagabond/assets/ui/dice/d6-fav-bg.webp`;
          } else if (flavor.includes('hind') || (isHinderedRoll && previousOperator === '-')) {
            dieIcon = `systems/vagabond/assets/ui/dice/d6-hind-bg.webp`;
          }
        }

        for (const result of term.results) {
          if (previousOperator && previousOperator !== '+') {
            parts.push(`<span class="roll-operator">${previousOperator}</span>`);
          }
          const isExploded = result.exploded;
          
          // FIX: Changed fa-certificate to fa-burst
          parts.push(`
            <div class="vb-die-wrapper" data-faces="${dieType}">
               <div class="vb-die-bg dmg-pool" style="background-image: url('${dieIcon}')"></div>
               <span class="vb-die-val">${result.result}</span>
               ${isExploded ? '<i class="fas fa-burst vb-die-explode" title="Exploded!"></i>' : ''}
            </div>
          `);
          previousOperator = '+';
        }
      } else if (term.constructor.name === 'NumericTerm') {
        const value = term.number;
        if (value !== 0) {
          const operator = value > 0 ? '+' : '';
          parts.push(`<span class="roll-modifier">${operator}${value}</span>`);
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
      if (this.data.roll) {
          const f = this.data.roll.formula || '';
          this.data.isFavored = f.includes('+1d6') || f.includes('+ 1d6');
          this.data.isHindered = f.includes('-1d6') || f.includes('- 1d6');
          this.data.rollDiceDisplay = this.constructor.formatRollWithDice(this.data.roll);
      }
      if (this.data.damage?.roll) {
           this.data.damage.diceDisplay = this.constructor.formatRollWithDice(this.data.damage.roll);
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
          
          if (!isHealing && hasDefenses) card.data.showDefendOptions = true;

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

  static async skillRoll(actor, skillKey, roll, difficulty, isSuccess) {
    const skill = actor.system.skills?.[skillKey] || actor.system.weaponSkills?.[skillKey];
    const skillLabel = skill?.label || skillKey;
    const isCritical = this.isRollCritical(roll, actor);
    
    const tags = [];
    tags.push({ label: skillLabel, cssClass: 'tag-skill' });
    if (skill?.stat) {
        const statLabel = game.i18n.localize(CONFIG.VAGABOND.stats[skill.stat]?.abbr) || skill.stat;
        tags.push({ label: statLabel, cssClass: 'tag-stat' });
    }
    if (skill) {
        tags.push({ label: skill.trained ? 'Trained' : 'Untrained', cssClass: 'tag-info' });
    }

    return this.createActionCard({
        actor,
        title: `${skillLabel} Check`,
        rollData: { roll, difficulty, isSuccess, isCritical },
        tags
    });
  }

  static async statRoll(actor, statKey, roll, difficulty, isSuccess) {
    const statLabel = game.i18n.localize(CONFIG.VAGABOND.stats[statKey]?.long) || statKey;
    const isCritical = this.isRollCritical(roll, actor);
    
    const tags = [];
    tags.push({ label: statLabel, cssClass: 'tag-skill' });
    tags.push({ label: `${actor.system.stats[statKey]?.value || 0}`, icon: 'fas fa-hashtag' });

    return this.createActionCard({
        actor,
        title: `${statLabel} Check`,
        rollData: { roll, difficulty, isSuccess, isCritical },
        tags
    });
  }

  static async saveRoll(actor, saveKey, roll, difficulty, isSuccess) {
    const saveLabel = actor.system.saves?.[saveKey]?.label || saveKey;
    const isCritical = this.isRollCritical(roll, actor);

    const tags = [];
    tags.push({ label: saveLabel, cssClass: 'tag-skill' });

    return this.createActionCard({
        actor,
        title: `${saveLabel} Save`,
        rollData: { roll, difficulty, isSuccess, isCritical },
        tags
    });
  }

  static async weaponAttack(actor, weapon, attackResult, damageRoll) {
      const { weaponSkill, weaponSkillKey } = attackResult;
      
      const tags = [];
      tags.push({ label: weaponSkill?.label || weaponSkillKey, cssClass: 'tag-skill' });
      
      if (weapon.system.currentDamage) {
          const dType = weapon.system.damageType || 'physical';
          const icon = CONFIG.VAGABOND?.damageTypeIcons?.[dType.toLowerCase()] || 'fas fa-burst';
          tags.push({ label: weapon.system.currentDamage, icon: icon, cssClass: 'tag-damage' });
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
      tags.push({ label: manaSkill?.label || 'Magic', cssClass: 'tag-skill' });
      if (spell.system.damageType !== '-') {
          const dType = spell.system.damageType;
          const icon = CONFIG.VAGABOND?.damageTypeIcons?.[dType] || 'fas fa-burst';
          tags.push({ label: `${spellState.damageDice}d6`, icon, cssClass: 'tag-damage' });
      }
      tags.push({ label: deliveryText, cssClass: 'tag-delivery' });
      tags.push({ label: `${costs.totalCost} Mana`, cssClass: 'tag-mana' });

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
    // Only verify damage if it's not "-"
    if ((action.flatDamage || action.rollDamage) && action.damageType !== '-') {
        const { VagabondDamageHelper } = await import('./damage-helper.mjs');
        
        const rawType = action.damageType || 'physical';
        const dTypeLabel = game.i18n.localize(CONFIG.VAGABOND.damageTypes[rawType]) || rawType;
        
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
  static async featureUse(actor, item) {
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

  // 8. GEAR USE ADAPTER
  static async gearUse(actor, item) {
    return this.featureUse(actor, item);
  }

  // 9. FEATURE DATA USE ADAPTER
  static async featureDataUse(actor, item) {
    // This receives the plain data object {name, description} from the sheet
    return this.featureUse(actor, item);
  }
}