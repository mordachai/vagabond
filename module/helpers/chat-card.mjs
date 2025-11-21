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
      metadata: [],
      propertyDetails: null, // For expandable property hints
      description: null,
      footerTags: [],
      footerActions: [], // For buttons like "Roll Damage"
      actor: null,
      item: null
    };
  }

  /**
   * Set the card type
   * @param {string} type - Card type (stat-roll, save-roll, skill-roll, weapon-attack, spell-cast, npc-action, npc-ability, item-use)
   * @returns {VagabondChatCard}
   */
  setType(type) {
    this.data.type = type;
    return this;
  }

  /**
   * Set the actor for this card
   * @param {VagabondActor} actor - The actor
   * @returns {VagabondChatCard}
   */
  setActor(actor) {
    this.data.actor = actor;
    // Default icon to actor's image if not set
    if (!this.data.icon) {
      this.data.icon = actor?.img;
    }
    return this;
  }

  /**
   * Set the item for this card (weapon, spell, etc.)
   * @param {VagabondItem} item - The item
   * @returns {VagabondChatCard}
   */
  setItem(item) {
    this.data.item = item;
    // Default icon to item's image if not set
    if (!this.data.icon) {
      this.data.icon = item?.img;
    }
    return this;
  }

  /**
   * Set the card title
   * @param {string} title - The title text
   * @returns {VagabondChatCard}
   */
  setTitle(title) {
    this.data.title = title;
    return this;
  }

  /**
   * Set the card subtitle
   * @param {string} subtitle - The subtitle text
   * @returns {VagabondChatCard}
   */
  setSubtitle(subtitle) {
    this.data.subtitle = subtitle;
    return this;
  }

  /**
   * Set the card icon
   * @param {string} icon - Path to icon image
   * @returns {VagabondChatCard}
   */
  setIcon(icon) {
    this.data.icon = icon;
    return this;
  }

  /**
   * Add a roll result
   * @param {Roll} roll - The Roll object
   * @param {number} difficulty - The difficulty number (optional)
   * @returns {VagabondChatCard}
   */
  addRoll(roll, difficulty = null) {
    this.data.hasRoll = true;
    this.data.rollTotal = roll.total;
    this.data.rollFormula = roll.formula;
    this.data.difficulty = difficulty;
    this.data.roll = roll; // Store the roll object for later use
    return this;
  }

  /**
   * Set the outcome of a roll
   * @param {string} outcome - Outcome text (SUCCESS, FAIL, HIT, MISS, CRITICAL, etc.)
   * @param {boolean} isCritical - Whether this is a critical result
   * @returns {VagabondChatCard}
   */
  setOutcome(outcome, isCritical = false) {
    this.data.outcome = outcome;

    // Set outcome class for styling
    if (isCritical) {
      this.data.outcomeClass = 'critical';
    } else if (outcome === 'SUCCESS' || outcome === 'HIT') {
      this.data.outcomeClass = 'success';
    } else if (outcome === 'FAIL' || outcome === 'MISS') {
      this.data.outcomeClass = 'failure';
    } else {
      this.data.outcomeClass = 'neutral';
    }

    return this;
  }

  /**
   * Add damage information
   * @param {Roll|number} damageRoll - The damage Roll object or number
   * @param {string} damageType - Type of damage (Physical, Fire, etc.)
   * @param {boolean} isCritical - Whether this is critical damage
   * @returns {VagabondChatCard}
   */
  addDamage(damageRoll, damageType = 'Physical', isCritical = false) {
    this.data.damage = {
      total: typeof damageRoll === 'number' ? damageRoll : damageRoll.total,
      formula: typeof damageRoll === 'number' ? null : damageRoll.formula,
      type: damageType,
      isCritical: isCritical,
      roll: typeof damageRoll === 'number' ? null : damageRoll
    };
    return this;
  }

  /**
   * Add a metadata item
   * @param {string} label - The label
   * @param {string} value - The value
   * @returns {VagabondChatCard}
   */
  addMetadata(label, value) {
    this.data.metadata.push({ label, value });
    return this;
  }

  /**
   * Set the description (enriched HTML)
   * @param {string} description - Enriched HTML description
   * @returns {VagabondChatCard}
   */
  setDescription(description) {
    this.data.description = description;
    return this;
  }

  /**
   * Add footer tags
   * @param {string[]} tags - Array of tag strings
   * @returns {VagabondChatCard}
   */
  addTags(tags) {
    this.data.footerTags = this.data.footerTags.concat(tags);
    return this;
  }

  /**
   * Add a single footer tag
   * @param {string} tag - Tag string
   * @returns {VagabondChatCard}
   */
  addTag(tag) {
    this.data.footerTags.push(tag);
    return this;
  }

  /**
   * Set property details for expandable accordion (weapon properties with hints)
   * @param {Array<Object>} properties - Array of {name, hint} objects
   * @returns {VagabondChatCard}
   */
  setPropertyDetails(properties) {
    this.data.propertyDetails = properties;
    return this;
  }

  /**
   * Add a footer action (button HTML)
   * @param {string} actionHtml - HTML string for the action button
   * @returns {VagabondChatCard}
   */
  addFooterAction(actionHtml) {
    this.data.footerActions.push(actionHtml);
    return this;
  }

  /**
   * Build the card data
   * @returns {Object} Card data object
   */
  build() {
    return this.data;
  }

  /**
   * Extract the d20 result from a roll (for critical checking)
   * @param {Roll} roll - The Roll object
   * @param {Actor} actor - The actor (for critNumber)
   * @returns {boolean} Whether the d20 result is a critical
   */
  static isRollCritical(roll, actor) {
    const critNumber = actor?.system?.critNumber || 20;
    const d20Term = roll.terms.find(term => term.constructor.name === 'Die' && term.faces === 20);
    const d20Result = d20Term?.results?.[0]?.result || 0;
    return d20Result >= critNumber;
  }

  /**
   * Format a roll result with die images
   * @param {Roll} roll - The Roll object
   * @returns {string} HTML string with die results
   */
  static formatRollWithDice(roll) {
    if (!roll) return '';

    const parts = [];
    let previousOperator = '';

    for (const term of roll.terms) {
      // Handle operators
      if (typeof term === 'string') {
        previousOperator = term;
        continue;
      }

      // Handle dice terms
      if (term.constructor.name === 'Die') {
        const dieType = term.faces;
        const dieIcon = `icons/svg/d${dieType}-grey.svg`;

        for (const result of term.results) {
          if (previousOperator && previousOperator !== '+') {
            parts.push(`<span class="roll-operator">${previousOperator}</span>`);
          }
          parts.push(`
            <span class="roll-die" data-die="d${dieType}" style="background-image: url('${dieIcon}')">
              ${result.result}
            </span>
          `);
          previousOperator = '+';
        }
      }
      // Handle numeric terms (modifiers)
      else if (term.constructor.name === 'NumericTerm') {
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

  /**
   * Render the card to HTML
   * @returns {Promise<string>} Rendered HTML
   */
  async render() {
    // Format roll results with die images before rendering
    if (this.data.roll) {
      this.data.rollDiceDisplay = VagabondChatCard.formatRollWithDice(this.data.roll);
    }
    if (this.data.damage?.roll) {
      this.data.damage.diceDisplay = VagabondChatCard.formatRollWithDice(this.data.damage.roll);
    }

    const templatePath = 'systems/vagabond/templates/chat/chat-card.hbs';
    return await renderTemplate(templatePath, this.data);
  }

  /**
   * Send the card to chat
   * @returns {Promise<ChatMessage>}
   */
  async send() {
    const content = await this.render();

    const messageData = {
      content: content,
      speaker: ChatMessage.getSpeaker({ actor: this.data.actor }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      rollMode: game.settings.get('core', 'rollMode'),
    };

    // If there's a roll, include it in the message
    if (this.data.roll) {
      messageData.rolls = [this.data.roll];
    }

    // If there's damage roll, include it too
    if (this.data.damage?.roll) {
      if (!messageData.rolls) messageData.rolls = [];
      messageData.rolls.push(this.data.damage.roll);
    }

    return await ChatMessage.create(messageData);
  }

  /**
   * Static helper: Create and send a stat roll card
   * @param {VagabondActor} actor - The actor
   * @param {string} statKey - The stat key (might, dexterity, etc.)
   * @param {Roll} roll - The roll result
   * @param {number} difficulty - The difficulty
   * @param {boolean} isSuccess - Whether the roll succeeded
   * @returns {Promise<ChatMessage>}
   */
  static async statRoll(actor, statKey, roll, difficulty, isSuccess) {
    const statLabel = game.i18n.localize(CONFIG.VAGABOND.stats[statKey]) || statKey;
    const isCritical = VagabondChatCard.isRollCritical(roll, actor);
    const card = new VagabondChatCard()
      .setType('stat-roll')
      .setActor(actor)
      .setTitle(`${statLabel} Check`)
      .setSubtitle(actor.name)
      .addRoll(roll, difficulty)
      .setOutcome(isSuccess ? 'SUCCESS' : 'FAIL', isCritical);

    // Add stat value metadata
    const statValue = actor.system.stats[statKey]?.value || 0;
    card.addMetadata('Stat Value', statValue.toString());

    return await card.send();
  }

  /**
   * Static helper: Create and send a save roll card
   * @param {VagabondActor} actor - The actor
   * @param {string} saveKey - The save key (reflex, endure, will)
   * @param {Roll} roll - The roll result
   * @param {number} difficulty - The difficulty
   * @param {boolean} isSuccess - Whether the roll succeeded
   * @returns {Promise<ChatMessage>}
   */
  static async saveRoll(actor, saveKey, roll, difficulty, isSuccess) {
    const save = actor.system.saves?.[saveKey];
    const saveLabel = save?.label || saveKey;
    const isCritical = VagabondChatCard.isRollCritical(roll, actor);

    const card = new VagabondChatCard()
      .setType('save-roll')
      .setActor(actor)
      .setTitle(`${saveLabel} Save`)
      .setSubtitle(actor.name)
      .addRoll(roll, difficulty)
      .setOutcome(isSuccess ? 'SUCCESS' : 'FAIL', isCritical);

    return await card.send();
  }

  /**
   * Static helper: Create and send a skill roll card
   * @param {VagabondActor} actor - The actor
   * @param {string} skillKey - The skill key
   * @param {Roll} roll - The roll result
   * @param {number} difficulty - The difficulty
   * @param {boolean} isSuccess - Whether the roll succeeded
   * @returns {Promise<ChatMessage>}
   */
  static async skillRoll(actor, skillKey, roll, difficulty, isSuccess) {
    // Check if it's a regular skill or weapon skill
    const skill = actor.system.skills?.[skillKey] || actor.system.weaponSkills?.[skillKey];
    const skillLabel = skill?.label || skillKey;
    const isCritical = VagabondChatCard.isRollCritical(roll, actor);

    const card = new VagabondChatCard()
      .setType('skill-roll')
      .setActor(actor)
      .setTitle(`${skillLabel} Check`)
      .setSubtitle(actor.name)
      .addRoll(roll, difficulty)
      .setOutcome(isSuccess ? 'SUCCESS' : 'FAIL', isCritical);

    if (skill) {
      if (skill.stat) {
        const statLabel = game.i18n.localize(CONFIG.VAGABOND.stats[skill.stat]) || skill.stat;
        card.addMetadata('Skill', `${skillLabel} (${statLabel})`);
      }
      card.addMetadata('Trained', skill.trained ? 'Yes' : 'No');
    }

    return await card.send();
  }

  /**
   * Static helper: Create and send a weapon attack card
   * @param {VagabondActor} actor - The actor
   * @param {VagabondItem} weapon - The weapon item
   * @param {Object} attackResult - The attack result from weapon.rollAttack()
   * @param {Roll} damageRoll - Optional damage roll if attack hit
   * @returns {Promise<ChatMessage>}
   */
  static async weaponAttack(actor, weapon, attackResult, damageRoll = null) {
    const { roll, difficulty, isHit, isCritical, weaponSkill, weaponSkillKey } = attackResult;

    const card = new VagabondChatCard()
      .setType('weapon-attack')
      .setActor(actor)
      .setItem(weapon)
      .setTitle(`${weapon.name} Attack`)
      .setSubtitle(actor.name)
      .addRoll(roll, difficulty)
      .setOutcome(isHit ? 'HIT' : 'MISS', isCritical);

    // Add weapon skill metadata
    const skillLabel = weaponSkill?.label || weaponSkillKey;
    card.addMetadata('Weapon Skill', `${skillLabel} (Difficulty ${difficulty})`);

    // Add weapon properties
    if (weapon.system.rangeDisplay) {
      card.addMetadata('Range', weapon.system.rangeDisplay);
    }
    if (weapon.system.gripDisplay) {
      card.addMetadata('Grip', weapon.system.gripDisplay);
    }

    // Add properties with expandable hints
    if (weapon.system.properties && weapon.system.properties.length > 0) {
      const propertyDetails = weapon.system.properties.map(prop => ({
        name: prop,
        hint: game.i18n.localize(`VAGABOND.Weapon.PropertyHints.${prop}`) || ''
      }));
      card.setPropertyDetails(propertyDetails);
      // Also add the simple display as metadata for the label
      card.addMetadata('Properties', weapon.system.propertiesDisplay);
    }

    // Add damage if provided
    if (damageRoll) {
      card.addDamage(damageRoll, 'Physical', isCritical);
    } else if (isHit) {
      // If hit but no damage roll (auto-roll disabled), add damage button
      const { VagabondDamageHelper } = await import('./damage-helper.mjs');
      const damageFormula = weapon.system.currentDamage;
      const statKey = weaponSkill?.stat || null;
      const damageButton = VagabondDamageHelper.createDamageButton(
        actor.id,
        weapon.id,
        damageFormula,
        {
          type: 'weapon',
          isCritical: isCritical,
          statKey: statKey
        }
      );
      card.addFooterAction(damageButton);
    }

    return await card.send();
  }

  /**
   * Static helper: Create and send a spell cast card
   * @param {VagabondActor} actor - The actor
   * @param {VagabondItem} spell - The spell item
   * @param {Object} spellCastResult - The spell cast result
   * @param {Roll} damageRoll - Optional damage roll if spell succeeded
   * @returns {Promise<ChatMessage>}
   */
  static async spellCast(actor, spell, spellCastResult, damageRoll = null) {
    const {
      roll,
      difficulty,
      isSuccess,
      isCritical,
      manaSkill,
      manaSkillKey,
      spellState,
      costs,
      deliveryText
    } = spellCastResult;

    const card = new VagabondChatCard()
      .setType('spell-cast')
      .setActor(actor)
      .setItem(spell)
      .setTitle(`${spell.name}`)
      .setSubtitle(actor.name)
      .addRoll(roll, difficulty)
      .setOutcome(isSuccess ? 'SUCCESS' : 'FAIL', isCritical);

    // Add mana skill metadata
    const skillLabel = manaSkill?.label || manaSkillKey;
    card.addMetadata('Mana Skill', `${skillLabel} (Difficulty ${difficulty})`);

    // Add mana cost
    card.addMetadata('Mana Cost', costs.totalCost.toString());

    // Add delivery type
    card.addMetadata('Delivery', deliveryText);

    // Add damage dice and type if spell has damage
    if (spell.system.damageType !== '-') {
      const damageTypeName = game.i18n.localize(CONFIG.VAGABOND.damageTypes[spell.system.damageType]);
      card.addMetadata('Damage', `${spellState.damageDice}d6 ${damageTypeName}`);
    }

    // Add duration if present
    if (spell.system.duration) {
      card.addMetadata('Duration', spell.system.duration);
    }

    // Add enriched description
    if (spell.system.description) {
      const enriched = await TextEditor.enrichHTML(spell.system.description, {
        async: true,
        secrets: actor.isOwner,
        relativeTo: spell
      });
      card.setDescription(enriched);
    }

    // Add critical effect if critical and spell has crit text
    if (isCritical && spell.system.crit && spell.system.crit.trim() !== '') {
      const critEnriched = await TextEditor.enrichHTML(spell.system.crit, {
        async: true,
        secrets: actor.isOwner,
        relativeTo: spell
      });
      card.setDescription(
        (card.data.description || '') +
        `<div class="spell-crit-effect"><strong>Critical Effect:</strong> ${critEnriched}</div>`
      );
    }

    // Add damage if provided
    if (damageRoll && spell.system.damageType !== '-') {
      const damageTypeName = game.i18n.localize(CONFIG.VAGABOND.damageTypes[spell.system.damageType]);
      card.addDamage(damageRoll, damageTypeName, isCritical);
    } else if (isSuccess && spell.system.damageType !== '-') {
      // If succeeded but no damage roll (auto-roll disabled), add damage button
      const { VagabondDamageHelper } = await import('./damage-helper.mjs');
      const damageFormula = `${spellState.damageDice}d6`;
      const statKey = manaSkill?.stat || null;
      const damageButton = VagabondDamageHelper.createDamageButton(
        actor.id,
        spell.id,
        damageFormula,
        {
          type: 'spell',
          damageType: spell.system.damageType,
          isCritical: isCritical,
          statKey: statKey
        }
      );
      card.addFooterAction(damageButton);
    }

    return await card.send();
  }

  /**
   * Static helper: Create and send an NPC action card
   * @param {VagabondActor} actor - The NPC actor
   * @param {Object} action - The action object
   * @param {number} actionIndex - Index of the action in the actions array
   * @returns {Promise<ChatMessage>}
   */
  static async npcAction(actor, action, actionIndex) {
    const card = new VagabondChatCard()
      .setType('npc-action')
      .setActor(actor)
      .setTitle(action.name || 'Unnamed Action')
      .setSubtitle(actor.name);

    // Add action metadata
    if (action.type || action.range) {
      let actionInfo = [];
      if (action.type) actionInfo.push(action.type);
      if (action.range) actionInfo.push(action.range);
      card.addMetadata('Type', actionInfo.join(' • '));
    }

    if (action.note) {
      card.addMetadata('Note', action.note);
    }

    if (action.recharge) {
      card.addMetadata('Recharge', action.recharge);
    }

    // Add description if present
    if (action.description) {
      const enriched = await TextEditor.enrichHTML(action.description, {
        async: true,
        secrets: actor.isOwner,
        relativeTo: actor
      });
      card.setDescription(enriched);
    }

    // Add extra info if present
    if (action.extraInfo) {
      const enrichedExtra = await TextEditor.enrichHTML(action.extraInfo, {
        async: true,
        secrets: actor.isOwner,
        relativeTo: actor
      });
      const currentDesc = card.data.description || '';
      card.setDescription(
        currentDesc +
        (currentDesc ? '<hr class="action-divider">' : '') +
        `<div class="action-extra-info">${enrichedExtra}</div>`
      );
    }

    // Add damage buttons (GM-only) if action has damage
    if (action.flatDamage || action.rollDamage) {
      const { VagabondDamageHelper } = await import('./damage-helper.mjs');

      // Get damage type label if set
      let damageTypeLabel = '';
      if (action.damageType && action.damageType !== '-') {
        damageTypeLabel = game.i18n.localize(CONFIG.VAGABOND.damageTypes[action.damageType]) || action.damageType;
      }

      // Create GM-only damage buttons
      if (action.flatDamage) {
        const flatButton = VagabondDamageHelper.createNPCDamageButton(
          actor.id,
          actionIndex,
          action.flatDamage,
          'flat',
          action.damageType || 'physical',
          damageTypeLabel
        );
        card.addFooterAction(flatButton);
      }

      if (action.rollDamage) {
        const rollButton = VagabondDamageHelper.createNPCDamageButton(
          actor.id,
          actionIndex,
          action.rollDamage,
          'roll',
          action.damageType || 'physical',
          damageTypeLabel
        );
        card.addFooterAction(rollButton);
      }
    }

    return await card.send();
  }

  /**
   * Static helper: Create and send an NPC ability card
   * @param {VagabondActor} actor - The NPC actor
   * @param {Object} ability - The ability object
   * @returns {Promise<ChatMessage>}
   */
  static async npcAbility(actor, ability) {
    const card = new VagabondChatCard()
      .setType('npc-ability')
      .setActor(actor)
      .setTitle(ability.name || 'Unnamed Ability')
      .setSubtitle(actor.name);

    // Add description if present
    if (ability.description) {
      // Use formatted version if available (with dice rolls converted to roll links)
      const descToEnrich = ability.descriptionFormatted || ability.description;
      const enriched = await TextEditor.enrichHTML(descToEnrich, {
        async: true,
        secrets: actor.isOwner,
        relativeTo: actor
      });
      card.setDescription(enriched);
    }

    return await card.send();
  }
}
