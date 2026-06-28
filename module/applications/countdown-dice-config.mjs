import { CountdownDice } from '../documents/countdown-dice.mjs';

const { api } = foundry.applications;

/**
 * Configuration dialog for creating and editing countdown dice
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export class CountdownDiceConfig extends api.HandlebarsApplicationMixin(
  api.ApplicationV2
) {
  constructor(diceJournal = null, options = {}) {
    super(options);
    this.#diceJournal = diceJournal;
  }

  #diceJournal;

  static DEFAULT_OPTIONS = {
    id: 'countdown-dice-config-{id}',
    classes: ['vagabond', 'countdown-dice-config'],
    window: {
      title: 'VAGABOND.CountdownDice.Create',
      icon: 'fas fa-dice-d20',
      resizable: false,
    },
    form: {
      submitOnChange: false,
      closeOnSubmit: true,
    },
    position: {
      width: 400,
      height: 'auto',
    },
    actions: {
      cancel: this._onCancel,
    },
  };

  static PARTS = {
    form: {
      template: 'systems/vagabond/templates/countdown-dice/config.hbs',
    },
  };

  get title() {
    if (!this.#diceJournal) {
      return game.i18n.localize('VAGABOND.CountdownDice.Create');
    }
    return `Configure: ${this.#diceJournal.name}`;
  }

  /**
   * Attach event listeners after rendering
   * @override
   */
  _onRender(context, options) {
    super._onRender(context, options);

    // Attach form submit handler
    const form = this.element.querySelector('form');
    if (form) {
      form.addEventListener('submit', this._onFormSubmit.bind(this));
    }

    // Dice-type image buttons → hidden diceType input
    const diceInput = this.element.querySelector('input[name="diceType"]');
    const diceCards = this.element.querySelectorAll('.cd-card');
    diceCards.forEach(card => {
      card.addEventListener('click', () => {
        diceCards.forEach(c => c.classList.remove('is-selected'));
        card.classList.add('is-selected');
        if (diceInput) diceInput.value = card.dataset.dice;
      });
    });

    // Size letter buttons → hidden size input
    const sizeInput = this.element.querySelector('input[name="size"]');
    const sizeBtns = this.element.querySelectorAll('.cd-size-btn');
    sizeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        sizeBtns.forEach(b => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        if (sizeInput) sizeInput.value = btn.dataset.size;
      });
    });
  }

  /**
   * Prepare context data for rendering
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Get dice types from config
    const diceTypes = CONFIG.VAGABOND.countdownDiceTypes || [
      'd4',
      'd6',
      'd8',
      'd10',
      'd12',
      'd20',
    ];

    context.diceTypes = diceTypes;

    // Set defaults
    if (this.#diceJournal) {
      const flags = this.#diceJournal.flags.vagabond.countdownDice;
      context.name = flags.name;
      context.diceType = flags.diceType;
      context.size = flags.size;
      context.isEdit = true;
    } else {
      context.name = 'Countdown';
      context.diceType = 'd4';
      context.size = 'M';
      context.isEdit = false;
    }

    // Dice-type image buttons (no labels) + S/M/L letter buttons
    context.diceCards = diceTypes.map(type => ({
      type,
      img: CountdownDice.getDiceImagePath(type),
      selected: type === context.diceType
    }));
    context.sizeCards = [
      { key: 'S', label: game.i18n.localize('VAGABOND.UI.Labels.SmallSize') },
      { key: 'M', label: game.i18n.localize('VAGABOND.UI.Labels.MediumSize') },
      { key: 'L', label: game.i18n.localize('VAGABOND.UI.Labels.LargeSize') }
    ].map(s => ({ ...s, selected: context.size === s.key }));

    return context;
  }

  /**
   * Handle form submission
   */
  async _onFormSubmit(event) {
    try {
      // Prevent default form submission
      event.preventDefault();
      event.stopPropagation();

      // Get form data
      const formData = new foundry.applications.ux.FormDataExtended(event.target);
      const data = formData.object;

      if (this.#diceJournal) {
        // Edit existing dice
        await this.#diceJournal.update({
          name: data.name,
          'flags.vagabond.countdownDice.name': data.name,
          'flags.vagabond.countdownDice.diceType': data.diceType,
          'flags.vagabond.countdownDice.size': data.size,
        });
      } else {
        // Create new dice
        const ownership = {
          default: 0, // NONE for everyone
          [game.user.id]: 3, // OWNER for creator
        };

        await CountdownDice.create({
          name: data.name,
          diceType: data.diceType,
          size: data.size,
          ownership: ownership,
        });
      }

      // Close dialog
      this.close();
    } catch (error) {
      console.error('Error submitting countdown dice config:', error);
    }
  }

  /**
   * Handle cancel button click
   */
  static _onCancel(event, target) {
    this.close();
  }
}
