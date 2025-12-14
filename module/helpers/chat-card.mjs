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
  
  addDamage(damageRoll, damageType, isCritical, damageTypeKey) {
      this.data.damage = {
          total: damageRoll.total,
          formula: damageRoll.formula,
          type: damageType,
          typeKey: damageTypeKey,
          isCritical: isCritical,
          roll: damageRoll
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
          parts.push(`
            <div class="vb-die-wrapper" data-faces="${dieType}">
               <div class="vb-die-bg" style="background-image: url('${dieIcon}')"></div>
               <span class="vb-die-val">${result.result}</span>
               ${isExploded ? '<i class="fas fa-certificate vb-die-explode" title="Exploded!"></i>' : ''}
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
      const card = new VagabondChatCard()
        .setActor(actor).setItem(item).setTitle(title).setSubtitle(subtitle);

      if (rollData) {
          const { roll, difficulty, isHit, isCritical } = rollData;
          let label = 'NEUTRAL';
          if (typeof isHit !== 'undefined') label = isHit ? 'HIT' : 'MISS';
          else if (typeof rollData.isSuccess !== 'undefined') label = rollData.isSuccess ? 'SUCCESS' : 'FAIL';
          
          card.addRoll(roll, difficulty).setOutcome(label, isCritical);
          
          const skillIndex = tags.findIndex(t => t.cssClass === 'tag-skill');
          if (skillIndex > -1) {
              card.data.rollSkillLabel = tags[skillIndex].label;
              tags.splice(skillIndex, 1);
          }
      }
      
      card.setMetadataTags(tags);
      if (propertyDetails) card.setPropertyDetails(propertyDetails);
      if (description) card.setDescription(description);

      if (damageRoll) {
          const { VagabondDamageHelper } = await import('./damage-helper.mjs');
          const dLabel = game.i18n.localize(CONFIG.VAGABOND.damageTypes[damageType]) || damageType;
          const isCrit = rollData?.isCritical || false;
          
          card.addDamage(damageRoll, dLabel, isCrit, damageType);
          
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
          const icon = CONFIG.VAGABOND?.damageTypeIcons?.[dType] || 'fas fa-burst';
          tags.push({ label: weapon.system.currentDamage, icon: icon, cssClass: 'tag-damage' });
      }
      if (weapon.system.grip) {
          const gripMap = { '1H': 'fas fa-hand-fist', '2H': 'fas fa-hands', 'V': 'fas fa-hand-peace' };
          tags.push({ icon: gripMap[weapon.system.grip], cssClass: 'tag-grip' });
      }
      if (weapon.system.rangeDisplay) {
          tags.push({ label: weapon.system.rangeDisplay, cssClass: 'tag-range' });
      }

      let propertyDetails = null;
      if (weapon.system.properties && weapon.system.properties.length > 0) {
          weapon.system.properties.forEach(prop => {
              const label = game.i18n.localize(`VAGABOND.Weapon.Property.${prop}`) || prop;
              tags.push({ label: label, cssClass: 'tag-property' });
          });
          propertyDetails = weapon.system.properties.map(prop => ({
              name: game.i18n.localize(`VAGABOND.Weapon.Property.${prop}`) || prop,
              hint: game.i18n.localize(`VAGABOND.Weapon.PropertyHints.${prop}`) || ''
          }));
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
    if (action.recharge) tags.push({ label: `Recharge ${action.recharge}`, icon: 'fas fa-rotate' });

    let description = '';
    if (action.description) {
      description = await foundry.applications.ux.TextEditor.enrichHTML(action.description, {
        async: true, secrets: actor.isOwner, relativeTo: actor
      });
    }
    if (action.extraInfo) {
      const extra = await foundry.applications.ux.TextEditor.enrichHTML(action.extraInfo, { async: true });
      description += `<hr class="action-divider"><div class="action-extra-info">${extra}</div>`;
    }

    const footerActions = [];
    if (action.flatDamage || action.rollDamage) {
        const { VagabondDamageHelper } = await import('./damage-helper.mjs');
        let dTypeLabel = '';
        if (action.damageType && action.damageType !== '-') {
            dTypeLabel = game.i18n.localize(CONFIG.VAGABOND.damageTypes[action.damageType]) || action.damageType;
        }
        let attackType = action.attackType || 'melee';
        if (attackType === 'castClose') attackType = 'melee';
        else if (attackType === 'castRanged') attackType = 'ranged';

        if (action.flatDamage) {
            footerActions.push(VagabondDamageHelper.createNPCDamageButton(actor.id, actionIndex, action.flatDamage, 'flat', action.damageType || 'physical', dTypeLabel, attackType));
        }
        if (action.rollDamage) {
            footerActions.push(VagabondDamageHelper.createNPCDamageButton(actor.id, actionIndex, action.rollDamage, 'roll', action.damageType || 'physical', dTypeLabel, attackType));
        }
    }

    return this.createActionCard({
        actor,
        title: action.name || 'NPC Action',
        tags,
        description,
        footerActions
    });
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