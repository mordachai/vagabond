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
