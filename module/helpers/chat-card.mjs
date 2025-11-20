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
      description: null,
      footerTags: [],
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
   * Build the card data
   * @returns {Object} Card data object
   */
  build() {
    return this.data;
  }

  /**
   * Render the card to HTML
   * @returns {Promise<string>} Rendered HTML
   */
  async render() {
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
   * Static helper: Create a stat roll card
   * @param {VagabondActor} actor - The actor
   * @param {string} statKey - The stat key (might, dexterity, etc.)
   * @param {Roll} roll - The roll result
   * @param {number} difficulty - The difficulty
   * @param {boolean} isSuccess - Whether the roll succeeded
   * @returns {VagabondChatCard}
   */
  static statRoll(actor, statKey, roll, difficulty, isSuccess) {
    const statLabel = game.i18n.localize(CONFIG.VAGABOND.stats[statKey]) || statKey;
    const card = new VagabondChatCard()
      .setType('stat-roll')
      .setActor(actor)
      .setTitle(`${statLabel} Check`)
      .setSubtitle(actor.name)
      .addRoll(roll, difficulty)
      .setOutcome(isSuccess ? 'SUCCESS' : 'FAIL', roll.total >= 20);

    // Add stat value metadata
    const statValue = actor.system.stats[statKey]?.value || 0;
    card.addMetadata('Stat Value', statValue.toString());

    return card;
  }

  /**
   * Static helper: Create a save roll card
   * @param {VagabondActor} actor - The actor
   * @param {string} saveKey - The save key (reflex, endure, will)
   * @param {Roll} roll - The roll result
   * @param {number} difficulty - The difficulty
   * @param {boolean} isSuccess - Whether the roll succeeded
   * @returns {VagabondChatCard}
   */
  static saveRoll(actor, saveKey, roll, difficulty, isSuccess) {
    const saveLabels = {
      reflex: 'Reflex',
      endure: 'Endure',
      will: 'Will'
    };
    const saveLabel = saveLabels[saveKey] || saveKey;

    const card = new VagabondChatCard()
      .setType('save-roll')
      .setActor(actor)
      .setTitle(`${saveLabel} Save`)
      .setSubtitle(actor.name)
      .addRoll(roll, difficulty)
      .setOutcome(isSuccess ? 'SUCCESS' : 'FAIL', roll.total >= 20);

    return card;
  }

  /**
   * Static helper: Create a skill roll card
   * @param {VagabondActor} actor - The actor
   * @param {string} skillKey - The skill key
   * @param {Roll} roll - The roll result
   * @param {number} difficulty - The difficulty
   * @param {boolean} isSuccess - Whether the roll succeeded
   * @returns {VagabondChatCard}
   */
  static skillRoll(actor, skillKey, roll, difficulty, isSuccess) {
    const skill = actor.system.skills?.[skillKey];
    const skillLabel = game.i18n.localize(`VAGABOND.Skills.${skillKey}`) || skillKey;

    const card = new VagabondChatCard()
      .setType('skill-roll')
      .setActor(actor)
      .setTitle(`${skillLabel} Check`)
      .setSubtitle(actor.name)
      .addRoll(roll, difficulty)
      .setOutcome(isSuccess ? 'SUCCESS' : 'FAIL', roll.total >= 20);

    if (skill) {
      const statLabel = game.i18n.localize(CONFIG.VAGABOND.stats[skill.stat]) || skill.stat;
      card.addMetadata('Skill', `${skillLabel} (${statLabel})`);
      card.addMetadata('Trained', skill.trained ? 'Yes' : 'No');
    }

    return card;
  }
}
