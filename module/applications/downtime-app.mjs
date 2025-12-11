import { VagabondChatCard } from '../helpers/chat-card.mjs';

const { api } = foundry.applications;

/**
 * Downtime Activities Manager Application
 * Allows players to perform downtime activities like crafting, foraging, hunting, and studying
 */
export class DowntimeApp extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  constructor(actor, options = {}) {
    super(options);
    this.#actor = actor;
  }

  #actor;

  static DEFAULT_OPTIONS = {
    id: "downtime-manager-{id}",
    classes: ["vagabond", "downtime-manager"],
    tag: "form",
    window: {
      title: "VAGABOND.Downtime.Title",
      icon: "fas fa-hourglass-half",
      resizable: false
    },
    position: {
      width: 700,
      height: "auto"
    },
    actions: {
      processRest: DowntimeApp.prototype._onProcessRest,
      processBreather: DowntimeApp.prototype._onProcessBreather,
      processCraft: DowntimeApp.prototype._onProcessCraft,
      processForage: DowntimeApp.prototype._onProcessForage,
      processHunt: DowntimeApp.prototype._onProcessHunt,
      processStudy: DowntimeApp.prototype._onProcessStudy,
      doneDowntime: DowntimeApp.prototype._onDone,
      cancelDowntime: DowntimeApp.prototype._onCancel
    }
  };

  static PARTS = {
    form: {
      template: "systems/vagabond/templates/actor/downtime-activities.hbs"
    }
  };

  get title() {
    return `${game.i18n.localize('VAGABOND.Downtime.Title')} - ${this.#actor.name}`;
  }

  /**
   * Prepare context data for rendering
   * @override
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Add actor data
    context.actor = this.#actor;
    context.studiedDice = this.#actor.system.studiedDice || 0;
    context.config = CONFIG.VAGABOND;

    return context;
  }

  /* -------------------------------------------- */
  /* Action Handlers                              */
  /* -------------------------------------------- */

  /**
   * Handle rest activity
   */
  async _onProcessRest(event, target) {
    const form = this.element;
    const lodgingTypeSelect = form.querySelector("select[name='lodgingType']");
    const lodgingType = lodgingTypeSelect.value;
    const lodging = CONFIG.VAGABOND.lodgingExpenses[lodgingType];

    // Check if player has enough money
    const totalSilver = this.#actor.system.currency.gold * 100 +
                        this.#actor.system.currency.silver +
                        this.#actor.system.currency.copper / 100;

    if (totalSilver < lodging.cost) {
      ui.notifications.warn(`Not enough money! You need ${lodging.cost}s but only have ${Math.floor(totalSilver)}s.`);
      return;
    }

    // Calculate new currency after deducting cost
    let remainingSilver = totalSilver - lodging.cost;
    const newGold = Math.floor(remainingSilver / 100);
    remainingSilver -= newGold * 100;
    const newSilver = Math.floor(remainingSilver);
    const newCopper = Math.round((remainingSilver - newSilver) * 100);

    // Determine what gets recovered
    const currentHP = this.#actor.system.health.value;
    const maxHP = this.#actor.system.health.max;
    const currentMana = this.#actor.system.mana.current;
    const maxMana = this.#actor.system.mana.max;
    const currentLuck = this.#actor.system.currentLuck;
    const maxLuck = this.#actor.system.maxLuck || 8;
    const currentFatigue = this.#actor.system.fatigue || 0;

    const updates = {
      'system.health.value': maxHP,
      'system.mana.current': maxMana,
      'system.currentLuck': maxLuck,
      'system.currency.gold': newGold,
      'system.currency.silver': newSilver,
      'system.currency.copper': newCopper
    };

    let recoveryText = '<ul>';
    recoveryText += `<li>HP: ${currentHP} → ${maxHP}</li>`;
    if (maxMana > 0) recoveryText += `<li>Mana: ${currentMana} → ${maxMana}</li>`;
    recoveryText += `<li>Luck: ${currentLuck} → ${maxLuck}</li>`;

    // If HP was already at max, recover 1 fatigue
    if (currentHP >= maxHP && currentFatigue > 0) {
      updates['system.fatigue'] = Math.max(0, currentFatigue - 1);
      recoveryText += `<li>Fatigue: ${currentFatigue} → ${currentFatigue - 1}</li>`;
    }
    recoveryText += '</ul>';

    // Update actor
    await this.#actor.update(updates);

    // Create chat card
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(this.#actor)
      .setTitle('Rest')
      .setSubtitle(this.#actor.name)
      .setDescription(`
        <p><i class="fas fa-bed"></i> <strong>${this.#actor.name}</strong> takes a rest.</p>
        <p><strong>Lodging:</strong> ${lodging.label} (${lodging.cost > 0 ? (lodging.cost >= 100 ? `${lodging.cost/100}g` : `${lodging.cost}s`) : 'Free'})</p>
        <hr>
        <p><strong>Recovery:</strong></p>
        ${recoveryText}
      `);

    await card.send();
  }

  /**
   * Handle breather activity
   */
  async _onProcessBreather(event, target) {
    const mightValue = this.#actor.system.stats.might.value;
    const currentHP = this.#actor.system.health.value;
    const maxHP = this.#actor.system.health.max;
    const newHP = Math.min(maxHP, currentHP + mightValue);
    const actualRecovery = newHP - currentHP;

    // Update HP
    await this.#actor.update({ 'system.health.value': newHP });

    // Create chat card
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(this.#actor)
      .setTitle('Breather')
      .setSubtitle(this.#actor.name)
      .setDescription(`
        <p><i class="fas fa-heart"></i> <strong>${this.#actor.name}</strong> takes a breather.</p>
        <p><strong>HP Recovery:</strong> ${actualRecovery} (${currentHP} → ${newHP})</p>
        <p><em>Recovered HP equal to Might (${mightValue}).</em></p>
      `);

    await card.send();
  }

  /**
   * Handle crafting activity
   */
  async _onProcessCraft(event, target) {
    const form = this.element;
    const craftDiffSelect = form.querySelector("select[name='craftDiff']");
    const val = parseInt(craftDiffSelect.value);

    // Format display value
    let displayValue = "";
    if (val >= 100) {
      displayValue = `${val / 100}g`;
    } else {
      displayValue = `${val}s`;
    }

    // Create chat card
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(this.#actor)
      .setTitle('Crafting')
      .setSubtitle(this.#actor.name)
      .setDescription(`
        <p><i class="fas fa-hammer"></i> <strong>${this.#actor.name}</strong> spends a shift crafting.</p>
        <p>Based on difficulty, they complete <strong>${displayValue}</strong> worth of work.</p>
        <hr>
        <p><em>Ensure you have materials worth half the item value deducted!</em></p>
      `);

    await card.send();
  }

  /**
   * Handle foraging activity
   */
  async _onProcessForage(event, target) {
    const form = this.element;
    const forageTypeSelect = form.querySelector("select[name='forageType']");
    const type = forageTypeSelect.value;

    // Roll the loot
    const lootRoll = await new Roll("1d6").evaluate();

    let resultText = "";
    if (type === "food") {
      resultText = `They find <strong>${lootRoll.total}</strong> Rations.`;
    } else {
      const matValue = lootRoll.total * 5;
      resultText = `They find Materials worth <strong>${matValue}s</strong>.`;
    }

    // Create and render chat card
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(this.#actor)
      .setTitle('Foraging')
      .setSubtitle(this.#actor.name)
      .setDescription(`
        <p><i class="fas fa-leaf"></i> <strong>${this.#actor.name}</strong> searches the wilderness...</p>
        <div style="font-size: 1.1em; margin: 10px 0;">${resultText}</div>
      `);

    const content = await card.render();

    // Create chat message with the loot roll
    await ChatMessage.create({
      content: content,
      speaker: ChatMessage.getSpeaker({ actor: this.#actor }),
      rolls: [lootRoll],
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      rollMode: game.settings.get('core', 'rollMode')
    });
  }

  /**
   * Handle hunting activity
   */
  async _onProcessHunt(event, target) {
    // Roll on beast table
    const tableRoll = await new Roll("1d6").evaluate();

    const beasts = {
      1: { name: "Wolf", qty: "2d6", hp: 9 },
      2: { name: "Fowl (Hawk)", qty: "1d6", hp: 1 },
      3: { name: "Vermin (Rabbit)", qty: "2d6", hp: 1 },
      4: { name: "Deer", qty: "1d6", hp: 4 },
      5: { name: "Boar", qty: "1d6", hp: 13 },
      6: { name: "Cattle", qty: "1d4", hp: 18 }
    };

    const beast = beasts[tableRoll.total];
    const qtyRoll = await new Roll(beast.qty).evaluate();

    const totalRations = qtyRoll.total * beast.hp;
    const materialValue = totalRations * 5;

    // Create and render chat card
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(this.#actor)
      .setTitle('Hunting')
      .setSubtitle(this.#actor.name)
      .setDescription(`
        <p><i class="fas fa-paw"></i> <strong>${this.#actor.name}</strong> stalks for game.</p>
        <p><strong>Found:</strong> ${qtyRoll.total}x ${beast.name}</p>
        <hr>
        <ul>
          <li><strong>Meat Yield:</strong> ${totalRations} Rations</li>
          <li><strong>Material Yield:</strong> ${materialValue}s value</li>
        </ul>
      `);

    const content = await card.render();

    // Create chat message with rolls
    await ChatMessage.create({
      content: content,
      speaker: ChatMessage.getSpeaker({ actor: this.#actor }),
      rolls: [tableRoll, qtyRoll],
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      rollMode: game.settings.get('core', 'rollMode')
    });
  }

  /**
   * Handle studying activity
   */
  async _onProcessStudy(event, target) {
    // Get current value
    const current = this.#actor.system.studiedDice || 0;

    // Update Actor
    await this.#actor.update({ "system.studiedDice": current + 1 });

    // Create chat card
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(this.#actor)
      .setTitle('Studying')
      .setSubtitle(this.#actor.name)
      .setDescription(`
        <p><i class="fas fa-book-open"></i> <strong>${this.#actor.name}</strong> spends a shift studying.</p>
        <p>They gain a <strong>Studied Die</strong>.</p>
        <p><em>(Current Pool: ${current + 1})</em></p>
        <p style="font-size: 0.8em; color: #666;">Can be spent to gain Favor on a d20 roll tomorrow.</p>
      `);

    await card.send();
  }

  /**
   * Handle Done button - close the dialog
   */
  async _onDone(event, target) {
    this.close();
  }

  /**
   * Handle Cancel button - close the dialog without any action
   */
  async _onCancel(event, target) {
    this.close();
  }
}
